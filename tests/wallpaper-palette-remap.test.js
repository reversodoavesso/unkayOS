// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  RDA_TOKEN_GROUPS,
  ACCENT_TO_RDA_GROUP,
  getTargetGroupsForAccent,
  srgb01ToOklabPixel,
  oklabToSrgb01Pixel,
  buildOklabGroupLut,
  applyThemeCurveScalar,
  remapImageDataOklabManifold,
  getOptimalWallpaperRemapPreset,
  getCachedRemappedWallpaper,
  persistDesktopRemappedWallpaper
} from '../core/ui/wallpaperPaletteRemap.js';
import { resolveEffectiveRemapParams } from '../core/utils/appPreferences.js';
import { WALLPAPERS } from '../core/workspace/preferences.js';
import SettingsApp from '../apps/settings/main.js';

describe('V2 Wallpapers Catalog & Oklab Manifold Palette Remap', () => {
  it('registers all 7 V2 ("Intervalos") wallpapers and ensures asset files exist on disk', () => {
    const expectedV2 = [
      '/assets/images/wallpapers/01-horizonte-limpo-v2.jpg',
      '/assets/images/wallpapers/02-pavilhao-em-silencio-v2.jpg',
      '/assets/images/wallpapers/03-luz-rasante-v2.jpg',
      '/assets/images/wallpapers/04-jardim-em-pausa-v2.jpg',
      '/assets/images/wallpapers/05-estudo-de-materia-v2.jpg',
      '/assets/images/wallpapers/06-ceu-profundo-noturno.jpg',
      '/assets/images/wallpapers/07-ultima-luz-noturno.jpg'
    ];

    const registeredValues = WALLPAPERS.map(w => w.value);
    for (const wpPath of expectedV2) {
      expect(registeredValues).toContain(wpPath);
      const diskPath = path.resolve(wpPath.slice(1));
      expect(fs.existsSync(diskPath), `Asset ${diskPath} should exist`).toBe(true);
      expect(fs.statSync(diskPath).size).toBeGreaterThan(10000);
    }

    // Legacy Montanhas wallpaper must be removed
    expect(registeredValues).not.toContain('/assets/images/wallpaper_01.jpg');
    expect(WALLPAPERS.some(w => w.name === 'Montanhas')).toBe(false);

    // Nebulosa must use dynamic DS accent and surface CSS variables
    const nebulosa = WALLPAPERS.find(w => w.name === 'Nebulosa');
    expect(nebulosa).toBeTruthy();
    expect(nebulosa.value).toContain('var(--unkay-accent-');
    expect(nebulosa.value).toContain('var(--rda-surface-primary)');
  });

  it('computes optimized Oklab presets per (wallpaper x accent x systemTheme)', () => {
    const darkPreset = getOptimalWallpaperRemapPreset('/assets/images/wallpapers/07-ultima-luz-noturno.jpg', 'indigo', 'dark');
    const lightPreset = getOptimalWallpaperRemapPreset('/assets/images/wallpapers/07-ultima-luz-noturno.jpg', 'indigo', 'light');

    expect(darkPreset.imageLabel).toBe('Última Luz');
    expect(darkPreset.theme).toBe('preserve');
    expect(lightPreset.theme).toBe('light');
    expect(darkPreset.chromaBoost).toBeGreaterThan(lightPreset.chromaBoost);
    expect(darkPreset.temperature).toBeCloseTo(0.018, 3);
  });

  it('round-trips sRGB <-> Oklab accurately and anchors LUTs at L=0 and L=1', () => {
    const samples = [
      [0, 0, 0],
      [1, 1, 1],
      [0.086, 0.714, 0.831], // #06b6d4 (Cyan 500)
      [0.545, 0.361, 0.965]  // #8b5cf6 (Violet/Nebula 500)
    ];

    for (const [r, g, b] of samples) {
      const [L, okA, okB] = srgb01ToOklabPixel(r, g, b);
      const [r2, g2, b2] = oklabToSrgb01Pixel(L, okA, okB);
      expect(r2).toBeCloseTo(r, 2);
      expect(g2).toBeCloseTo(g, 2);
      expect(b2).toBeCloseTo(b, 2);
    }

    for (const groupName of Object.keys(RDA_TOKEN_GROUPS)) {
      const lut = buildOklabGroupLut(groupName, 256);
      expect(lut.aLut[0]).toBeCloseTo(0, 5);
      expect(lut.bLut[0]).toBeCloseTo(0, 5);
      expect(lut.aLut[255]).toBeCloseTo(0, 5);
      expect(lut.bLut[255]).toBeCloseTo(0, 5);
    }
  });

  it('maps each unkayOS accent preset to its canonical RDA token group', () => {
    expect(getTargetGroupsForAccent('cyan')).toEqual(['primary', 'secondary', 'neutral']);
    expect(getTargetGroupsForAccent('violet')).toEqual(['nebula', 'secondary', 'neutral']);
    expect(getTargetGroupsForAccent('rose')).toEqual(['magma', 'secondary', 'neutral']);
    expect(getTargetGroupsForAccent('fuchsia')).toEqual(['lotus', 'secondary', 'neutral']);
    expect(getTargetGroupsForAccent('teal')).toEqual(['aurora', 'secondary', 'neutral']);
    expect(getTargetGroupsForAccent('indigo')).toEqual(['cobalt', 'secondary', 'neutral']);
    expect(getTargetGroupsForAccent('blue')).toEqual(['info', 'secondary', 'neutral']);
    expect(Object.keys(ACCENT_TO_RDA_GROUP)).toHaveLength(7);
  });

  it('adapts selective cyan highlights to the active DS accent while keeping neutral grays neutral in affinity mode', () => {
    // 2 pixels: pixel 0 is neutral architectural gray (#525252), pixel 1 is vivid cyan (#06b6d4)
    const input = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([
        0x52, 0x52, 0x52, 255,
        0x06, 0xb6, 0xd4, 255
      ])
    };

    // Remap to 'rose' (magma)
    const roseOut = remapImageDataOklabManifold(input, {
      accent: 'rose',
      strategy: 'affinity'
    });

    // Pixel 0 (neutral gray) must remain near-neutral (R ~= G ~= B)
    const [gR, gG, gB] = [roseOut.data[0], roseOut.data[1], roseOut.data[2]];
    expect(Math.abs(gR - gG)).toBeLessThanOrEqual(8);
    expect(Math.abs(gG - gB)).toBeLessThanOrEqual(8);

    // Pixel 1 (formerly cyan, where R < B) must now have strong rose/crimson dominance (R > G and R > B)
    const [cR, cG, cB] = [roseOut.data[4], roseOut.data[5], roseOut.data[6]];
    expect(cR).toBeGreaterThan(cG + 35);
    expect(cR).toBeGreaterThan(cB);

    // Remap to 'violet' (nebula)
    const violetOut = remapImageDataOklabManifold(input, {
      accent: 'violet',
      strategy: 'affinity'
    });
    const [vR, vG, vB] = [violetOut.data[4], violetOut.data[5], violetOut.data[6]];
    // Violet has strong blue & red over green (B > G and R > G)
    expect(vB).toBeGreaterThan(vG + 30);
    expect(vR).toBeGreaterThan(vG);
  });

  it('supports relative (PCA) and split-tone strategies and theme curves', () => {
    const input = {
      width: 3,
      height: 1,
      data: new Uint8ClampedArray([
        20, 30, 40, 255,
        120, 80, 180, 255,
        230, 200, 140, 255
      ])
    };

    const relOut = remapImageDataOklabManifold(input, {
      accent: 'teal',
      strategy: 'relative',
      theme: 'dark'
    });
    expect(relOut.data).toHaveLength(12);
    expect(relOut.data[3]).toBe(255);

    const splitOut = remapImageDataOklabManifold(input, {
      accent: 'indigo',
      strategy: 'split-tone',
      theme: 'light'
    });
    expect(splitOut.data).toHaveLength(12);
    expect(applyThemeCurveScalar(0.5, 'dark')).toBeLessThan(0.5);
    expect(applyThemeCurveScalar(0.5, 'light')).toBeGreaterThan(0.5);
  });

  describe('User Custom Image Upload Prompt in SettingsApp', () => {
    let settingsRoot;
    let desktopElement;
    let mockCORE;
    let mockStandardAPIs;

    beforeEach(() => {
      document.body.innerHTML = '';
      localStorage.clear();

      desktopElement = document.createElement('div');
      desktopElement.id = 'desktop';
      document.body.appendChild(desktopElement);

      settingsRoot = document.createElement('div');
      const htmlPath = path.resolve('apps/settings/index.html');
      settingsRoot.innerHTML = fs.readFileSync(htmlPath, 'utf8');
      document.body.appendChild(settingsRoot);

      mockCORE = {
        instanceId: 'settings_test',
        id: 'settings',
        appName: 'Configurações',
        getContentRoot: () => settingsRoot
      };
      mockStandardAPIs = {
        setTimeout: (fn) => setTimeout(fn, 0),
        clearTimeout: () => {},
        fileSystem: {
          readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
          writeFile: vi.fn().mockResolvedValue(true),
          mkdir: vi.fn().mockResolvedValue(true)
        },
        ipc: { sendMessage: vi.fn(), subscribe: vi.fn() }
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    });

    it('prompts the user when a custom wallpaper image is submitted and lets them choose adapted vs original', async () => {
      const app = new SettingsApp(mockCORE, mockStandardAPIs, settingsRoot, desktopElement);
      await app.onRun();

      const promptEl = settingsRoot.querySelector('#wallpaperRemapPrompt');
      const customInput = settingsRoot.querySelector('#customWallpaperUrl');
      const applyBtn = settingsRoot.querySelector('#applyCustomWallpaperBtn');
      const confirmAdaptedBtn = settingsRoot.querySelector('#confirmRemappedWallpaperBtn');
      const confirmOriginalBtn = settingsRoot.querySelector('#confirmOriginalWallpaperBtn');

      expect(promptEl.hidden).toBe(true);

      // User enters a custom image URL and clicks Aplicar
      const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      customInput.value = sampleDataUrl;
      applyBtn.click();
      await Promise.resolve();

      // Prompt should now be visible asking the user if they want to test RDA palette adaptation
      expect(promptEl.hidden).toBe(false);
      expect(app.pendingCustomWallpaper).toBe(sampleDataUrl);

      // User chooses "Testar e aplicar adequação RDA"
      confirmAdaptedBtn.click();
      await new Promise(r => setTimeout(r, 10));

      expect(promptEl.hidden).toBe(true);
      expect(app.systemSettings.appearance.wallpaper).toBe(sampleDataUrl);
      expect(app.systemSettings.appearance.adaptWallpaper).toBe(true);

      // Now test choosing "Usar imagem original"
      app.promptCustomWallpaperRemap(sampleDataUrl);
      expect(promptEl.hidden).toBe(false);
      confirmOriginalBtn.click();
      await new Promise(r => setTimeout(r, 10));

      expect(promptEl.hidden).toBe(true);
      expect(app.systemSettings.appearance.adaptWallpaper).toBe(false);
    });

    it('adjusts Oklab intensity, chroma boost, temperature, and theme parameters and restores defaults', async () => {
      const app = new SettingsApp(mockCORE, mockStandardAPIs, settingsRoot, desktopElement);
      await app.onRun();

      const themeSelect = settingsRoot.querySelector('#selectWallpaperRemapTheme');
      const intensityRange = settingsRoot.querySelector('#rangeWallpaperRemapIntensity');
      const chromaRange = settingsRoot.querySelector('#rangeWallpaperChromaBoost');
      const tempRange = settingsRoot.querySelector('#rangeWallpaperRemapTemperature');
      const resetBtn = settingsRoot.querySelector('#resetWallpaperRemapParamsBtn');

      themeSelect.value = 'dark';
      themeSelect.dispatchEvent(new Event('change'));
      intensityRange.value = '65';
      intensityRange.dispatchEvent(new Event('input'));
      intensityRange.dispatchEvent(new Event('change'));
      chromaRange.value = '1.45';
      chromaRange.dispatchEvent(new Event('input'));
      chromaRange.dispatchEvent(new Event('change'));
      tempRange.value = '0.045';
      tempRange.dispatchEvent(new Event('input'));
      tempRange.dispatchEvent(new Event('change'));

      await new Promise(r => setTimeout(r, 15));

      expect(app.systemSettings.appearance.wallpaperRemapPresetMode).toBe('custom');
      expect(app.systemSettings.appearance.wallpaperRemapTheme).toBe('dark');
      expect(app.systemSettings.appearance.wallpaperRemapIntensity).toBe(0.65);
      expect(app.systemSettings.appearance.wallpaperChromaBoost).toBe(1.45);
      expect(app.systemSettings.appearance.wallpaperRemapTemperature).toBe(0.045);

      // Reset to automatic image x accent x theme preset
      resetBtn.click();
      await new Promise(r => setTimeout(r, 15));

      expect(app.systemSettings.appearance.wallpaperRemapPresetMode).toBe('auto');
      const effective = resolveEffectiveRemapParams(app.systemSettings.appearance);
      expect(effective.presetMode).toBe('auto');
      expect(effective.strategy).toBe('affinity');
      expect(effective.theme).toBe('preserve');
      expect(effective.chromaBoost).toBe(1.12);
      expect(effective.temperature).toBe(0.020);
    });

    it('persists and retrieves remapped wallpaper cache for zero-flash reload and blends intensity', () => {
      const opts = { accent: 'violet', strategy: 'affinity', theme: 'preserve', chromaBoost: 1.2, temperature: 0.025, intensity: 0.8 };
      const wp = '/assets/images/wallpapers/01-horizonte-limpo-v2.jpg';
      const fakeDataUrl = 'data:image/jpeg;base64,remapped_violet_test';

      persistDesktopRemappedWallpaper(wp, opts, fakeDataUrl);
      expect(getCachedRemappedWallpaper(wp, opts)).toBe(fakeDataUrl);

      // Verify intensity=0 preserves original pixel colors
      const srcPixel = { width: 1, height: 1, data: new Uint8ClampedArray([10, 180, 210, 255]) };
      const zeroIntensityOut = remapImageDataOklabManifold(srcPixel, { accent: 'rose', intensity: 0 });
      expect(Math.abs(zeroIntensityOut.data[0] - 10)).toBeLessThanOrEqual(2);
      expect(Math.abs(zeroIntensityOut.data[1] - 180)).toBeLessThanOrEqual(2);
      expect(Math.abs(zeroIntensityOut.data[2] - 210)).toBeLessThanOrEqual(2);
    });
  });
});
