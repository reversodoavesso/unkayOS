/* Intentionally synchronous and dependency-free: restore the cached appearance
   before CSS paints the desktop or the asynchronous kernel starts. The VFS
   remains authoritative and refreshes this cache when preferences are read. */
(() => {
  let settings = {};
  try {
    const cached = JSON.parse(localStorage.getItem('unkayos_system_settings') || 'null');
    if (cached && typeof cached === 'object' && !Array.isArray(cached)) settings = cached;
  } catch (_) { /* A missing/unavailable cache starts with a neutral surface. */ }

  const appearance = settings.appearance && typeof settings.appearance === 'object' ? settings.appearance : {};
  const windowing = settings.windowing || {}, shell = settings.shell || {};
  const root = document.documentElement;
  root.dataset.theme = appearance.theme === 'light' ? 'light' : 'dark';
  root.dataset.glass = String(appearance.glassmorphism !== false);
  root.style.colorScheme = root.dataset.theme;
  root.style.backgroundColor = root.dataset.theme === 'light' ? '#fafafa' : '#0a0a0a';
  root.style.fontSize = { compact: '14px', large: '18px' }[appearance.fontScale] || '16px';
  root.dataset.shellBar = shell.bar === 'edge' ? 'edge' : 'floating';
  root.dataset.shellLauncher = shell.launcher === 'compact' ? 'compact' : 'atlas';
  root.dataset.shellLabels = String(shell.showLabels === true);
  root.dataset.taskbarPosition = windowing.taskbarPosition === 'top' ? 'top' : 'bottom';
  root.dataset.taskbarAutohide = String(windowing.autoHideTaskbar === true);

  let restored = false;
  function restoreDesktop() {
    if (restored) return true;
    const desktop = document.getElementById('desktop');
    if (!desktop) return false;
    desktop.dataset.rdaProduct = 'unkayos';
    // The cache contains a validated preset identifier. Unknown identifiers
    // receive the CSS default until the official runtime normalizes them.
    desktop.dataset.unkayAccent = typeof appearance.accent === 'string' && /^[a-z][a-z0-9-]*$/.test(appearance.accent) ? appearance.accent : 'cyan';
    const wallpaper = appearance.wallpaper;
    if (typeof wallpaper === 'string' && wallpaper) {
      desktop.style.backgroundImage = 'none';
      desktop.style.backgroundColor = '';
      if (/^(linear|radial)-gradient\(/.test(wallpaper)) desktop.style.backgroundImage = wallpaper;
      else if (/^(https?:\/\/|\/|\.\/)/.test(wallpaper)) desktop.style.backgroundImage = `url(${JSON.stringify(wallpaper)})`;
      else desktop.style.backgroundColor = wallpaper;
    }
    restored = true;
    return true;
  }

  if (restoreDesktop()) return;
  const observer = new MutationObserver(() => { if (restoreDesktop()) observer.disconnect(); });
  observer.observe(root, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => { restoreDesktop(); observer.disconnect(); }, { once: true });
})();
