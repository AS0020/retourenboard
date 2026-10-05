import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = fileURLToPath(new URL('../', import.meta.url));
const packageEntries = ['package.json', 'README.md', '.env.example', 'Dockerfile', 'server', 'shared', 'public', 'scripts', 'deploy', 'tests'];

function checkPackageEntry(sourceDir, entry) {
  const info = lstatSync(join(sourceDir, entry));
  if (info.isSymbolicLink()) throw new Error(`Symbolic links cannot be included in an installation package: ${entry}`);
  if (/(^|[\\/])(\.env|data|\.qa|node_modules)([\\/]|$)|\.(sqlite|sqlite-shm|sqlite-wal)$/.test(entry)) {
    throw new Error(`Private runtime data cannot be packaged: ${entry}`);
  }
  if (info.isDirectory()) {
    for (const name of readdirSync(join(sourceDir, entry))) checkPackageEntry(sourceDir, join(entry, name));
  }
}

export function buildLinuxInstaller({ sourceDir = projectDir, outputPath = join(projectDir, 'retourenboard-install.sh') } = {}) {
  sourceDir = resolve(sourceDir); outputPath = resolve(outputPath);
  for (const entry of packageEntries) checkPackageEntry(sourceDir, entry);
  const temporaryDir = mkdtempSync(join(tmpdir(), 'retourenboard-build-'));
  try {
    const archivePath = join(temporaryDir, 'package.tar.gz');
    execFileSync('tar', ['-czf', archivePath, '-C', sourceDir, '--', ...packageEntries], { stdio: 'pipe' });
    const archive = readFileSync(archivePath);
    const checksum = createHash('sha256').update(archive).digest('hex');
    const header = readFileSync(join(sourceDir, 'deploy/installer-header.sh'), 'utf8').replace(/\r\n/g, '\n');
    if (!header.includes('@@PAYLOAD_SHA256@@')) throw new Error('The installer header has no checksum placeholder.');
    const payload = archive.toString('base64').match(/.{1,76}/g).join('\n');
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${header.replace('@@PAYLOAD_SHA256@@', checksum).trimEnd()}\n__RETOURENBOARD_PAYLOAD_BELOW__\n${payload}\n`, { mode: 0o700 });
    return outputPath;
  } finally {
    rmSync(temporaryDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3) throw new Error('Usage: node scripts/build-linux-installer.mjs [output-file]');
  console.log(`Installationsdatei erstellt: ${buildLinuxInstaller({ outputPath: process.argv[2] })}`);
}
