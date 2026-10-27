/** Lightweight appearance contract shared by settings and rendering. */
export const DEFAULT_IMAGE_WALLPAPER = '/assets/images/wallpapers/01-horizonte-limpo-v2.jpg';
export const migrateWallpaper = source => source === '/assets/images/wallpaper_01.jpg' ? DEFAULT_IMAGE_WALLPAPER : source;
export const shouldAdaptWallpaper = appearance => appearance.adaptWallpaper === true || (appearance.adaptWallpaper !== false && String(appearance.wallpaper || '').startsWith('/assets/images/wallpapers/'));
export function wallpaperAppearanceSignature(appearance) {
  const custom = appearance.wallpaperRemapPresetMode === 'custom';
  return JSON.stringify(['v2', custom ? 'custom' : 'auto', ...['wallpaperRemapStrategy', 'wallpaperRemapTheme', 'wallpaperChromaBoost', 'wallpaperRemapTemperature', 'wallpaperRemapIntensity'].map(key => custom ? appearance[key] ?? null : null)]);
}
