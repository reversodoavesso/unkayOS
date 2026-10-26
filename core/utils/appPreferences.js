import { normalizeAccent } from '../ui/designSystem.js';
// Supports the async OPFS bridge and the legacy synchronous filesystem.
export async function readPreferences(fs, path, key) {
  try {
    const raw = await fs?.readFile(path);
    if (raw) {
      const value = JSON.parse(raw);
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* Cache can be unavailable. */ }
      return value;
    }
  } catch (_) { /* Fall back to the local cache. */ }
  try { return JSON.parse(localStorage.getItem(key) || 'null'); }
  catch (_) { return null; }
}

export async function writePreferences(fs, path, key, value) {
  const json = JSON.stringify(value, null, 2);
  let saved = false;
  try {
    if (fs?.writeFile) {
      await fs.mkdir?.(path.slice(0, path.lastIndexOf('/')), { recursive: true });
      await fs.writeFile(path, json);
      saved = true;
    }
  } catch (error) { console.warn('[Preferences] VFS unavailable:', error); }
  try { localStorage.setItem(key, json); saved = true; } catch (_) {}
  if (!saved) throw new Error('Não foi possível persistir as preferências.');
}

export const DEFAULT_APPEARANCE = Object.freeze({
  theme: 'dark',
  wallpaper: '/assets/images/wallpaper_01.jpg',
  glassmorphism: true,
  fontScale: 'standard',
  accent: 'cyan'
});

/** Preset identifiers are independent from canonical RDA brand primitives. */
export function normalizeAppearance(appearance = {}) {
  appearance = appearance && typeof appearance === 'object' ? appearance : {};
  return {
    theme: appearance.theme === 'light' ? 'light' : 'dark',
    wallpaper: typeof appearance.wallpaper === 'string' && appearance.wallpaper ? appearance.wallpaper : DEFAULT_APPEARANCE.wallpaper,
    glassmorphism: appearance.glassmorphism !== false,
    fontScale: ['compact', 'large'].includes(appearance.fontScale) ? appearance.fontScale : 'standard',
    accent: normalizeAccent(appearance.accent)
  };
}

export function applyAppearance(preferences = {}, desktop = document.getElementById('desktop')) {
  const appearance = normalizeAppearance(preferences);
  const root = document.documentElement;
  root.dataset.theme = appearance.theme === 'light' ? 'light' : 'dark';
  root.style.colorScheme = root.dataset.theme;
  root.style.backgroundColor = 'var(--rda-surface-primary)';
  root.dataset.glass = String(appearance.glassmorphism !== false);
  // Undo overrides written by the former accent picker, including in a live session.
  root.style.removeProperty('--rda-color-primary-400');
  root.style.removeProperty('--color-primary-base');
  if (desktop) {
    desktop.dataset.rdaProduct = 'unkayos';
    desktop.dataset.unkayAccent = appearance.accent;
  }
  root.style.fontSize = { compact: '14px', large: '18px' }[appearance.fontScale] || '16px';
  if (desktop && appearance.wallpaper) applyWallpaperStyle(desktop, appearance.wallpaper);
}

/** Shared by the desktop and settings previews to keep each choice accurate. */
export function applyWallpaperStyle(element, wallpaper) {
  if (element && typeof wallpaper === 'string' && wallpaper) {
    element.style.backgroundImage = 'none';
    element.style.backgroundColor = '';
    if (/^(linear|radial)-gradient\(/.test(wallpaper)) {
      element.style.backgroundImage = wallpaper;
    } else if (/^(https?:\/\/|\/|\.\/)/.test(wallpaper)) {
      element.style.backgroundImage = `url(${JSON.stringify(wallpaper)})`;
    } else {
      element.style.backgroundColor = wallpaper;
    }
  }
}

export function applyWindowing(windowing = {}) {
  const root = document.documentElement;
  root.dataset.aeroSnap = String(windowing.aeroSnap !== false);
  root.dataset.centerWindows = String(windowing.centerWindows !== false);
  root.dataset.taskbarPosition = windowing.taskbarPosition === 'top' ? 'top' : 'bottom';
  root.dataset.taskbarAutohide = String(windowing.autoHideTaskbar === true);
}

export async function clearTemporaryFiles(fs) {
  if (!fs?.readdir || !(fs.remove || fs.unlink)) throw new Error('Sistema de arquivos indisponível.');
  const entries = await fs.readdir('/tmp');
  let removed = 0;
  for (const entry of entries) {
    const name = typeof entry === 'string' ? entry : entry.name;
    if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) continue;
    try {
      await (fs.remove || fs.unlink).call(fs, `/tmp/${name}`);
      removed++;
    } catch (_) { /* Nonempty directories remain intact. */ }
  }
  return removed;
}
