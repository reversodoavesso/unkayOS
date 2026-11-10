// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeAppearance, resolveEffectiveRemapParams, writePreferences, applyAppearance, applyWallpaperStyle } from '../core/utils/appPreferences.js';
import { DEFAULT_IMAGE_WALLPAPER, wallpaperAppearanceSignature } from '../core/ui/wallpaperAppearance.js';
import { buildWallpaperRemapCacheKey, persistDesktopRemappedWallpaper, getCachedRemappedWallpaper } from '../core/ui/wallpaperPaletteRemap.js';
import { primitiveColorScales } from '../design-system/rda/unkayos.palette.js';
import SettingsApp from '../apps/settings/main.js';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); document.body.replaceChildren(); document.documentElement.removeAttribute('data-theme'); vi.restoreAllMocks(); });
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
  it('restores cached pixels before app startup for canonical and legacy accents, respecting light/dark separation', () => {
    const bootstrap = readFileSync('public/appearance-bootstrap.js', 'utf8');
    const appearance = normalizeAppearance({ theme: 'dark', wallpaper: DEFAULT_IMAGE_WALLPAPER, accent: 'nebula', wallpaperRemapPresetMode: 'custom', wallpaperRemapIntensity: 0.5 });
    const params = { ...resolveEffectiveRemapParams(appearance), appearanceKey: wallpaperAppearanceSignature(appearance) };
    persistDesktopRemappedWallpaper(appearance.wallpaper, params, 'data:image/jpeg;base64,DARKNEBULA==');

    // Legacy alias stored before DS upgrade still normalizes to canonical 'nebula' on boot
    localStorage.setItem('unkayos_system_settings', JSON.stringify({ appearance: { ...appearance, accent: 'violet' } }));
    document.body.innerHTML = '<div id="desktop"></div>';
    new Function(bootstrap)();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.getElementById('desktop').dataset.unkayAccent).toBe('nebula');
    expect(document.getElementById('desktop').style.backgroundImage).toContain('DARKNEBULA');

    // Switching system theme without a matching light cache must never flash dark cached pixels
    localStorage.setItem('unkayos_system_settings', JSON.stringify({ appearance: { ...appearance, theme: 'light' } }));
    new Function(bootstrap)();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.getElementById('desktop').style.backgroundImage).toBe('none');

    // Changing intensity clears mismatched cache
    localStorage.setItem('unkayos_system_settings', JSON.stringify({ appearance: { ...appearance, wallpaperRemapIntensity: 0.8 } }));
    new Function(bootstrap)();
    expect(document.getElementById('desktop').style.backgroundImage).toBe('none');
  });
  it('recovers gracefully at boot when localStorage is corrupted or inaccessible', () => {
    const bootstrap = readFileSync('public/appearance-bootstrap.js', 'utf8');
    localStorage.setItem('unkayos_system_settings', '{invalid-json');
    document.body.innerHTML = '<div id="desktop"></div>';
    new Function(bootstrap)();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.backgroundColor).toBe('#0a0a0a');
    expect(document.getElementById('desktop').dataset.unkayAccent).toBe('primary');

    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('SecurityError'); },
      removeItem: () => {}
    });
    expect(() => new Function(bootstrap)()).not.toThrow();
  });
  it('degrades cleanly without uncaught errors when wallpaper image is missing or offline', async () => {
    const desktop = document.createElement('div');
    desktop.id = 'desktop';
    document.body.appendChild(desktop);
    const originalImage = globalThis.Image;
    class OfflineImage {
      set src(_value) { queueMicrotask(() => this.onerror?.(new Event('error'))); }
    }
    vi.stubGlobal('Image', OfflineImage);
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = () => ({ getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }) });
    try {
      applyAppearance({ theme: 'light', accent: 'aurora', wallpaper: '/assets/images/wallpapers/01-horizonte-limpo-v2.jpg', adaptWallpaper: true }, desktop);
      await new Promise(resolve => setTimeout(resolve, 25));
      expect(document.documentElement.dataset.theme).toBe('light');
      expect(desktop.dataset.unkayAccent).toBe('aurora');
      expect(desktop.style.backgroundImage).toContain('01-horizonte-limpo-v2.jpg');

      // Direct non-adapted missing/offline wallpaper call keeps UI responsive
      applyWallpaperStyle(desktop, 'https://offline.invalid/wallpaper.jpg', { adaptToAccent: false });
      expect(desktop.style.backgroundImage).toContain('https://offline.invalid/wallpaper.jpg');
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext;
      vi.stubGlobal('Image', originalImage);
    }
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
