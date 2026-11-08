// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeAppearance, resolveEffectiveRemapParams, writePreferences } from '../core/utils/appPreferences.js';
import { DEFAULT_IMAGE_WALLPAPER, wallpaperAppearanceSignature } from '../core/ui/wallpaperAppearance.js';
import { buildWallpaperRemapCacheKey, persistDesktopRemappedWallpaper, getCachedRemappedWallpaper } from '../core/ui/wallpaperPaletteRemap.js';
import { primitiveColorScales } from '../design-system/rda/unkayos.palette.js';
import SettingsApp from '../apps/settings/main.js';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); document.body.replaceChildren(); vi.restoreAllMocks(); });
describe('Wallpaper integration regressions', () => {
  it('removes stale boot preferences if a large image exceeds the local cache quota', async () => {
    localStorage.setItem('quota-preferences', '{"old":true}');
    vi.stubGlobal('localStorage', {
      getItem: localStorage.getItem.bind(localStorage),
      removeItem: localStorage.removeItem.bind(localStorage),
      setItem: () => { throw new Error('Quota exceeded'); }
    });
    const writeFile = vi.fn().mockResolvedValue(undefined);
    await writePreferences({ writeFile }, '/etc/settings.json', 'quota-preferences', { wallpaper: 'large image' });
    expect(writeFile).toHaveBeenCalled();
    expect(localStorage.getItem('quota-preferences')).toBeNull();
  });
  it('migrates a removed bundled image and preserves original colors for existing custom images', () => {
    expect(normalizeAppearance({ wallpaper: '/assets/images/wallpaper_01.jpg' }).wallpaper).toBe(DEFAULT_IMAGE_WALLPAPER);
    expect(normalizeAppearance({ wallpaper: 'https://example.org/own.jpg' }).adaptWallpaper).toBe(false);
    expect(normalizeAppearance({ wallpaper: 'https://example.org/own.jpg', adaptWallpaper: true }).adaptWallpaper).toBe(true);
    expect(primitiveColorScales.success[5]).toBe('#22c55e');
  });
  it('distinguishes different image contents with identical long prefixes and lengths', () => {
    const prefix = 'data:image/png;base64,' + 'A'.repeat(220);
    const a = prefix + 'B', b = prefix + 'C';
    expect(buildWallpaperRemapCacheKey(a)).not.toBe(buildWallpaperRemapCacheKey(b));
    persistDesktopRemappedWallpaper(a, {}, 'data:image/jpeg;base64,QQ==');
    expect(getCachedRemappedWallpaper(b)).toBeNull();
  });
  it('restores cached pixels only for the selected appearance parameters before app startup', () => {
    const appearance = normalizeAppearance({ wallpaper: DEFAULT_IMAGE_WALLPAPER, accent: 'violet', wallpaperRemapPresetMode: 'custom', wallpaperRemapIntensity: 0.5 });
    const params = { ...resolveEffectiveRemapParams(appearance), appearanceKey: wallpaperAppearanceSignature(appearance) };
    persistDesktopRemappedWallpaper(appearance.wallpaper, params, 'data:image/jpeg;base64,QQ==');
    localStorage.setItem('unkayos_system_settings', JSON.stringify({ appearance }));
    document.body.innerHTML = '<div id="desktop"></div>';
    const bootstrap = readFileSync('public/appearance-bootstrap.js', 'utf8');
    new Function(bootstrap)();
    expect(document.getElementById('desktop').style.backgroundImage).toContain('data:image/jpeg');
    localStorage.setItem('unkayos_system_settings', JSON.stringify({ appearance: { ...appearance, wallpaperRemapIntensity: 0.8 } }));
    new Function(bootstrap)();
    expect(document.getElementById('desktop').style.backgroundImage).toBe('none');
  });
  it('reads VFS image bytes using the binary API, without a lossy UTF-8 round trip', async () => {
    const bytes = new Uint8Array([255, 216, 0, 128, 255]);
    const reader = vi.fn().mockResolvedValue(bytes);
    const encode = vi.fn().mockResolvedValue('data:image/jpeg;base64,test');
    const target = { fileSystem: { readFile: reader }, readFileAsDataUrl: encode };
    await SettingsApp.prototype.resolveCustomWallpaperSource.call(target, '/home/user/pictures/test.jpg');
    expect(reader).toHaveBeenCalledWith('/home/user/pictures/test.jpg', { encoding: 'binary' });
    const file = encode.mock.calls[0][0]; expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([...bytes]);
  });
});
