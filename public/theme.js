(() => {
  const storageKey = 'retourenboard-theme';
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = null;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch { /* The switch also works when browser storage is disabled. */ }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1c1e1d' : '#f5f7f5');
  }

  // This classic script runs before CSS and the application, preventing a
  // bright first frame when a dark theme was selected previously.
  applyTheme(preference || (system.matches ? 'dark' : 'light'));
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-theme-toggle]')) return;
    preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(preference);
    try { localStorage.setItem(storageKey, preference); } catch { /* Keep the current page usable. */ }
  });
  system.addEventListener('change', event => {
    if (!preference) applyTheme(event.matches ? 'dark' : 'light');
  });
})();
