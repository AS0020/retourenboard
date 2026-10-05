import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const projectDir = fileURLToPath(new URL('../', import.meta.url));

test('the standalone Linux installer carries the application without local accounts or secrets', async () => {
  // A missing application asset or packaging local .env/data would break this contract.
  assert.ok(existsSync(join(projectDir, 'scripts/build-linux-installer.mjs')), 'The single-file installer builder is missing.');
  const { buildLinuxInstaller } = await import('../scripts/build-linux-installer.mjs');
  const fixtureDir = mkdtempSync(join(tmpdir(), 'retourenboard-package-'));
  try {
    const outputPath = join(fixtureDir, 'installer with spaces.sh');
    buildLinuxInstaller({ sourceDir: projectDir, outputPath });
    const installer = readFileSync(outputPath, 'utf8');
    assert.equal(installer.includes('\r'), false, 'The shell script needs Linux line endings.');
    const marker = '\n__RETOURENBOARD_PAYLOAD_BELOW__\n';
    const split = installer.indexOf(marker);
    assert.ok(split > 0, 'Missing embedded archive.');
    const archive = Buffer.from(installer.slice(split + marker.length), 'base64');
    const checksum = installer.slice(0, split).match(/^payload_sha256='([a-f0-9]{64})'$/m)?.[1];
    assert.equal(createHash('sha256').update(archive).digest('hex'), checksum);
    const archivePath = join(fixtureDir, 'payload.tar.gz');
    writeFileSync(archivePath, archive);
    const files = execFileSync('tar', ['-tzf', archivePath], { encoding: 'utf8' }).split(/\r?\n/);
    for (const required of ['package.json', 'README.md', '.env.example', 'server/index.js', 'server/users.js', 'public/accounts.js', 'public/theme.js', 'public/theme.css', 'scripts/install-linux.sh', 'scripts/install-network.sh', 'deploy/retourenverwaltung.service', 'public/vendor/pdfjs/pdf.min.mjs', 'public/vendor/pdfjs/pdf.worker.min.mjs']) {
      assert.ok(files.includes(required), `Required application file missing: ${required}`);
    }
    assert.equal(files.some(file => /(^|\/)(\.env|data|\.qa|node_modules)(\/|$)|\.(sqlite|sqlite-shm|sqlite-wal)$/.test(file)), false, 'Local secrets and accounts must not be shipped.');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});
