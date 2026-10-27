import { DEFAULT_IMAGE_WALLPAPER, migrateWallpaper, shouldAdaptWallpaper, wallpaperAppearanceSignature } from '../ui/wallpaperAppearance.js';
import { normalizeAccent } from '../ui/accent.js';
import {
  REMAP_STRATEGIES,
  REMAP_THEMES,
  isImageWallpaper,
  canUseCanvas2D,
  getOptimalWallpaperRemapPreset,
  getCachedRemappedWallpaper,
  persistDesktopRemappedWallpaper,
  remapWallpaperImage
} from '../ui/wallpaperPaletteRemap.js';

// Supports the async OPFS bridge and the legacy synchronous filesystem.
export async function readPreferences(fs, path, key) {
  try {
    const raw = await fs?.readFile(path);
    if (raw) {
      const value = JSON.parse(raw);
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { try { localStorage.removeItem(key); } catch (_) {} }
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
  try { localStorage.setItem(key, json); saved = true; } catch (_) {
    try { localStorage.removeItem(key); } catch (_) { /* Do not boot with a stale cache after a quota failure. */ }
  }
  if (!saved) throw new Error('Não foi possível persistir as preferências.');
}

export const DEFAULT_APPEARANCE = Object.freeze({
  theme: 'dark',
  wallpaper: DEFAULT_IMAGE_WALLPAPER,
  glassmorphism: true,
  fontScale: 'standard',
  accent: 'cyan'
});

/** Preset identifiers are independent from canonical RDA brand primitives. */
export function normalizeAppearance(appearance = {}) {
  appearance = appearance && typeof appearance === 'object' ? appearance : {};
  const normalized = {
    theme: appearance.theme === 'light' ? 'light' : 'dark',
    wallpaper: typeof appearance.wallpaper === 'string' && appearance.wallpaper ? migrateWallpaper(appearance.wallpaper) : DEFAULT_APPEARANCE.wallpaper,
    glassmorphism: appearance.glassmorphism !== false,
    fontScale: ['compact', 'large'].includes(appearance.fontScale) ? appearance.fontScale : 'standard',
    accent: normalizeAccent(appearance.accent)
  };
  if (isImageWallpaper(normalized.wallpaper) && !normalized.wallpaper.startsWith('/assets/images/wallpapers/') && appearance.adaptWallpaper === undefined) normalized.adaptWallpaper = false;
  if (typeof appearance.adaptWallpaper === 'boolean') {
    normalized.adaptWallpaper = appearance.adaptWallpaper;
  }
  if (['auto', 'custom'].includes(appearance.wallpaperRemapPresetMode)) {
    normalized.wallpaperRemapPresetMode = appearance.wallpaperRemapPresetMode;
  }
  if (REMAP_STRATEGIES.includes(appearance.wallpaperRemapStrategy)) {
    normalized.wallpaperRemapStrategy = appearance.wallpaperRemapStrategy;
  }
  if (REMAP_THEMES.includes(appearance.wallpaperRemapTheme)) {
    normalized.wallpaperRemapTheme = appearance.wallpaperRemapTheme;
  }
  if (typeof appearance.wallpaperChromaBoost === 'number' && Number.isFinite(appearance.wallpaperChromaBoost)) {
    normalized.wallpaperChromaBoost = Math.max(0.0, Math.min(2.5, Number(appearance.wallpaperChromaBoost.toFixed(2))));
  }
  if (typeof appearance.wallpaperRemapTemperature === 'number' && Number.isFinite(appearance.wallpaperRemapTemperature)) {
    normalized.wallpaperRemapTemperature = Math.max(0.005, Math.min(0.15, Number(appearance.wallpaperRemapTemperature.toFixed(3))));
  }
  if (typeof appearance.wallpaperRemapIntensity === 'number' && Number.isFinite(appearance.wallpaperRemapIntensity)) {
    normalized.wallpaperRemapIntensity = Math.max(0.0, Math.min(1.0, Number(appearance.wallpaperRemapIntensity.toFixed(2))));
  }
  return normalized;
}

/**
 * Resolves effective Oklab remap parameters for an appearance object, using
 * either the automatic `(wallpaper x accent x theme)` smart preset or custom overrides.
 */
export function resolveEffectiveRemapParams(appearance = {}, wallpaperOverride = null) {
  const wp = wallpaperOverride || appearance.wallpaper || DEFAULT_APPEARANCE.wallpaper;
  const accent = normalizeAccent(appearance.accent);
  const systemTheme = appearance.theme === 'light' ? 'light' : 'dark';
  const preset = getOptimalWallpaperRemapPreset(wp, accent, systemTheme);
  const isCustom = appearance.wallpaperRemapPresetMode === 'custom';

  return {
    accent,
    systemTheme,
    presetMode: isCustom ? 'custom' : 'auto',
    strategy: (isCustom && appearance.wallpaperRemapStrategy) ? appearance.wallpaperRemapStrategy : preset.strategy,
    theme: (isCustom && appearance.wallpaperRemapTheme) ? appearance.wallpaperRemapTheme : preset.theme,
    chromaBoost: (isCustom && typeof appearance.wallpaperChromaBoost === 'number') ? appearance.wallpaperChromaBoost : preset.chromaBoost,
    temperature: (isCustom && typeof appearance.wallpaperRemapTemperature === 'number') ? appearance.wallpaperRemapTemperature : preset.temperature,
    intensity: (isCustom && typeof appearance.wallpaperRemapIntensity === 'number') ? appearance.wallpaperRemapIntensity : preset.intensity,
    imageLabel: preset.imageLabel
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
  if (desktop && appearance.wallpaper) {
    const effective = resolveEffectiveRemapParams(appearance, appearance.wallpaper);
    applyWallpaperStyle(desktop, appearance.wallpaper, {
      accent: effective.accent,
      systemTheme: effective.systemTheme,
      adaptToAccent: shouldAdaptWallpaper(appearance),
      appearanceKey: wallpaperAppearanceSignature(appearance),
      strategy: effective.strategy,
      theme: effective.theme,
      chromaBoost: effective.chromaBoost,
      temperature: effective.temperature,
      intensity: effective.intensity
    });
  }
}

/** Shared by the desktop and settings previews to keep each choice accurate without flashing. */
export function applyWallpaperStyle(element, wallpaper, options = {}) {
  if (element && typeof wallpaper === 'string' && wallpaper) {
    const token = (element.__unkayWpToken || 0) + 1;
    element.__unkayWpToken = token;

    if (/^(linear|radial)-gradient\(/.test(wallpaper)) {
      element.style.backgroundColor = '';
      element.style.backgroundImage = wallpaper;
      return;
    }

    if (isImageWallpaper(wallpaper)) {
      const shouldAdapt = Boolean(options && options.adaptToAccent === true && (options.intensity ?? 1.0) > 0.001);
      if (shouldAdapt && canUseCanvas2D()) {
        const accent = normalizeAccent(options.accent || element.dataset?.unkayAccent || 'cyan');
        const systemTheme = options.systemTheme || (typeof document !== 'undefined' && document.documentElement?.dataset?.theme === 'light' ? 'light' : 'dark');
        const autoPreset = getOptimalWallpaperRemapPreset(wallpaper, accent, systemTheme);
        const remapOpts = {
          accent,
          systemTheme,
          strategy: options.strategy || autoPreset.strategy,
          theme: options.theme || autoPreset.theme,
          chromaBoost: options.chromaBoost ?? autoPreset.chromaBoost,
          temperature: options.temperature ?? autoPreset.temperature,
          intensity: options.intensity ?? autoPreset.intensity,
          maxDimension: options.maxDimension || 1376,
          appearanceKey: options.appearanceKey
        };

        // 1. Synchronous zero-flash check (memory LRU + localStorage boot cache)
        const syncCached = getCachedRemappedWallpaper(wallpaper, remapOpts);
        if (syncCached) {
          element.style.backgroundColor = '';
          element.style.backgroundImage = `url(${JSON.stringify(syncCached)})`;
          if (element.dataset) element.dataset.wallpaperAccent = remapOpts.accent;
          if (element.id === 'desktop') {
            persistDesktopRemappedWallpaper(wallpaper, remapOpts, syncCached);
          }
          return;
        }

        // 2. Async Wasm/Canvas remap: DO NOT overwrite element.style.backgroundImage
        // with the raw un-remapped URL while computing! Keep previous backgroundImage
        // so switching wallpapers/accents or reloading never flashes the raw image.
        remapWallpaperImage(wallpaper, remapOpts)
          .then(remappedUrl => {
            if (element.__unkayWpToken === token && remappedUrl) {
              element.style.backgroundColor = '';
              element.style.backgroundImage = `url(${JSON.stringify(remappedUrl)})`;
              if (element.dataset) element.dataset.wallpaperAccent = remapOpts.accent;
              if (element.id === 'desktop') {
                persistDesktopRemappedWallpaper(wallpaper, remapOpts, remappedUrl);
              }
            }
          })
          .catch(() => {
            if (element.__unkayWpToken === token) {
              element.style.backgroundColor = '';
              element.style.backgroundImage = `url(${JSON.stringify(wallpaper)})`;
            }
          });
        return;
      }

      // Non-adapted image or headless test environment without Canvas 2D
      element.style.backgroundColor = '';
      element.style.backgroundImage = `url(${JSON.stringify(wallpaper)})`;
      return;
    }

    element.style.backgroundImage = 'none';
    element.style.backgroundColor = wallpaper;
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
