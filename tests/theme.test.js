import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

function openPage({ systemDark = false, saved = null, storageBlocked = false } = {}) {
  const scriptPath = fileURLToPath(new URL('../public/theme.js', import.meta.url));
  assert.ok(existsSync(scriptPath), 'The whole-page theme controller is missing.');
  const root = { dataset: {}, style: {} };
  const handlers = {};
  let systemChange;
  let stored = saved;
  const media = { matches: systemDark, addEventListener: (type, listener) => { if (type === 'change') systemChange = listener; } };
  runInNewContext(readFileSync(scriptPath, 'utf8'), {
    document: { documentElement: root, querySelector: () => null, addEventListener: (type, listener) => { handlers[type] = listener; } },
    window: { matchMedia: () => media },
    localStorage: {
      getItem: () => { if (storageBlocked) throw new Error('Storage disabled'); return stored; },
      setItem: (_key, value) => { if (storageBlocked) throw new Error('Storage disabled'); stored = value; },
    },
  });
  return {
    root,
    stored: () => stored,
    systemChange: dark => systemChange({ matches: dark }),
    toggle: () => handlers.click({ target: { closest: selector => selector === '[data-theme-toggle]' ? {} : null } }),
  };
}

test('the first visit follows the system theme, including changes while the page is open', () => {
  const page = openPage({ systemDark: true });
  assert.equal(page.root.dataset.theme, 'dark');
  assert.equal(page.root.style.colorScheme, 'dark');
  page.systemChange(false);
  assert.equal(page.root.dataset.theme, 'light');
});

test('a saved choice takes precedence over the system theme', () => {
  const page = openPage({ saved: 'light', systemDark: true });
  assert.equal(page.root.dataset.theme, 'light');
  page.systemChange(true);
  assert.equal(page.root.dataset.theme, 'light');
});

test('switching the theme updates the entire page and remembers the choice', () => {
  const page = openPage();
  page.toggle();
  assert.equal(page.root.dataset.theme, 'dark');
  assert.equal(page.stored(), 'dark');
  page.systemChange(false);
  assert.equal(page.root.dataset.theme, 'dark');
  assert.equal(openPage({ saved: page.stored() }).root.dataset.theme, 'dark');
  page.toggle();
  assert.equal(page.root.dataset.theme, 'light');
  assert.equal(page.stored(), 'light');
});

test('invalid stored values fall back to the system theme', () => {
  const page = openPage({ saved: 'invalid', systemDark: true });
  assert.equal(page.root.dataset.theme, 'dark');
  page.systemChange(false);
  assert.equal(page.root.dataset.theme, 'light');
});

test('the theme remains usable when browser storage is blocked', () => {
  const page = openPage({ storageBlocked: true });
  page.toggle();
  assert.equal(page.root.dataset.theme, 'dark');
});
