/**
 * core/ui/wallpaperPaletteRemap.js
 *
 * Oklab Manifold Color Grading Engine for unkayOS Wallpapers.
 * Hybrid Rust/WebAssembly (`src-wasm/src/oklab.rs`) + JavaScript fallback port
 * of `remap_rda_palette.py`, mapping arbitrary images and built-in wallpapers
 * onto continuous 1D splines in Oklab space defined by the canonical RDA Design
 * System token groups.
 */

import { normalizeAccent } from './accent.js';
import { primitiveColorScales, accentPrimitiveGroups } from '../../design-system/rda/unkayos.palette.js';
export const RDA_TOKEN_GROUPS = primitiveColorScales;
export const ACCENT_TO_RDA_GROUP = accentPrimitiveGroups;

export const REMAP_STRATEGIES = Object.freeze(['affinity', 'relative', 'split-tone']);
export const REMAP_THEMES = Object.freeze(['preserve', 'dark', 'light']);
export const DESKTOP_WALLPAPER_CACHE_KEY = 'unkayos_remapped_wallpaper_cache';

/**
 * Per-image base Oklab calibration profiles for the V2 ("Intervalos") collection.
 */
export const WALLPAPER_IMAGE_PROFILES = Object.freeze({
  '01-horizonte-limpo-v2.jpg': Object.freeze({
    label: 'Horizonte Limpo',
    strategy: 'affinity',
    baseTemp: 0.020,
    baseChroma: 1.12,
    darkThemeCurve: 'preserve',
    lightThemeCurve: 'light',
    darkIntensity: 1.0,
    lightIntensity: 0.92
  }),
  '02-pavilhao-em-silencio-v2.jpg': Object.freeze({
    label: 'Pavilhão em Silêncio',
    strategy: 'affinity',
    baseTemp: 0.022,
    baseChroma: 1.16,
    darkThemeCurve: 'preserve',
    lightThemeCurve: 'light',
    darkIntensity: 1.0,
    lightIntensity: 0.90
  }),
  '03-luz-rasante-v2.jpg': Object.freeze({
    label: 'Luz Rasante',
    strategy: 'affinity',
    baseTemp: 0.028,
    baseChroma: 1.10,
    darkThemeCurve: 'preserve',
    lightThemeCurve: 'light',
    darkIntensity: 1.0,
    lightIntensity: 0.92
  }),
  '04-jardim-em-pausa-v2.jpg': Object.freeze({
    label: 'Jardim em Pausa',
    strategy: 'affinity',
    baseTemp: 0.018,
    baseChroma: 1.18,
    darkThemeCurve: 'preserve',
    lightThemeCurve: 'light',
    darkIntensity: 1.0,
    lightIntensity: 0.94
  }),
  '05-estudo-de-materia-v2.jpg': Object.freeze({
    label: 'Estudo de Matéria',
    strategy: 'affinity',
    baseTemp: 0.030,
    baseChroma: 1.14,
    darkThemeCurve: 'preserve',
    lightThemeCurve: 'light',
    darkIntensity: 1.0,
    lightIntensity: 0.90
  }),
  '06-ceu-profundo-noturno.jpg': Object.freeze({
    label: 'Céu Profundo',
    strategy: 'affinity',
    baseTemp: 0.032,
    baseChroma: 1.15,
    darkThemeCurve: 'preserve',
    lightThemeCurve: 'light',
    darkIntensity: 1.0,
    lightIntensity: 0.88
  }),
  '07-ultima-luz-noturno.jpg': Object.freeze({
    label: 'Última Luz',
    strategy: 'affinity',
    baseTemp: 0.016,
    baseChroma: 1.28,
    darkThemeCurve: 'preserve',
    lightThemeCurve: 'light',
    darkIntensity: 1.0,
    lightIntensity: 0.92
  })
});

/**
 * Per-accent perceptual Oklab modifiers to balance warm/cool saturation and
 * highlight isolation across all 7 unkayOS accent presets.
 */
export const ACCENT_CALIBRATION = Object.freeze({
  cyan: Object.freeze({ chromaMul: 1.00, tempOffset: 0.000 }),
  violet: Object.freeze({ chromaMul: 1.08, tempOffset: 0.002 }),
  blue: Object.freeze({ chromaMul: 1.10, tempOffset: 0.001 }),
  rose: Object.freeze({ chromaMul: 0.96, tempOffset: -0.002 }),
  fuchsia: Object.freeze({ chromaMul: 0.98, tempOffset: -0.001 }),
  teal: Object.freeze({ chromaMul: 1.06, tempOffset: 0.000 }),
  indigo: Object.freeze({ chromaMul: 1.12, tempOffset: 0.002 })
});

/**
 * Computes the optimal Oklab remap parameters for a given `(wallpaper, accent, systemTheme)`
 * combination.
 *
 * @param {string} wallpaper Wallpaper URL or path
 * @param {string} [accent='cyan'] Active unkayOS accent preset
 * @param {'dark'|'light'} [systemTheme='dark'] Active system theme
 * @returns {{ strategy: 'affinity'|'relative'|'split-tone', theme: 'preserve'|'dark'|'light', chromaBoost: number, temperature: number, intensity: number, imageLabel: string }}
 */
export function getOptimalWallpaperRemapPreset(wallpaper = '', accent = 'cyan', systemTheme = 'dark') {
  const normAccent = normalizeAccent(accent);
  const isLight = systemTheme === 'light';
  const basename = String(wallpaper || '').split('/').pop()?.split('?')[0] || '';
  const profile = WALLPAPER_IMAGE_PROFILES[basename] || {
    label: 'Imagem Personalizada',
    strategy: 'affinity',
    baseTemp: 0.025,
    baseChroma: 1.00,
    darkThemeCurve: 'dark',
    lightThemeCurve: 'light',
    darkIntensity: 0.95,
    lightIntensity: 0.90
  };
  const accentCal = ACCENT_CALIBRATION[normAccent] || ACCENT_CALIBRATION.cyan;
  const themeChromaFactor = isLight ? 0.92 : 1.0;

  const chromaBoost = Number(
    Math.max(0.2, Math.min(2.0, profile.baseChroma * accentCal.chromaMul * themeChromaFactor)).toFixed(2)
  );
  const temperature = Number(
    Math.max(0.005, Math.min(0.100, profile.baseTemp + accentCal.tempOffset)).toFixed(3)
  );
  const theme = isLight ? profile.lightThemeCurve : profile.darkThemeCurve;
  const intensity = Number((isLight ? profile.lightIntensity : profile.darkIntensity).toFixed(2));

  return {
    strategy: profile.strategy,
    theme,
    chromaBoost,
    temperature,
    intensity,
    imageLabel: profile.label
  };
}

const LUT_RESOLUTION = 1024;
const groupLutCache = new Map();
const remappedUrlCache = new Map();
const MAX_URL_CACHE_ENTRIES = 28;

// Optional WebAssembly acceleration state
let wasmRemapFn = null;
let wasmInitPromise = null;

/**
 * Lazily initializes the Rust/WebAssembly Oklab kernel (`core/wasm/pkg/unkay_kernel.js`).
 * Falls back gracefully to the JS engine if WebAssembly cannot be loaded.
 * @returns {Promise<boolean>}
 */
export async function ensureWasmOklabReady() {
  if (wasmRemapFn) return true;
  if (typeof WebAssembly === 'undefined') return false;
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      try {
        const mod = await import('../wasm/pkg/unkay_kernel.js');
        if (typeof mod.default === 'function') {
          await mod.default();
        }
        if (typeof mod.remap_rgba_oklab_wasm === 'function') {
          wasmRemapFn = mod.remap_rgba_oklab_wasm;
          return true;
        }
      } catch (_) {
        // Fallback to pure JS implementation when Wasm binary fetch is unavailable (e.g. unit tests)
      }
      return false;
    })();
  }
  return wasmInitPromise;
}

/**
 * Resolves the ordered list of RDA token groups for a given unkayOS accent preset.
 * @param {string} [accent='cyan']
 * @returns {[string, string, string]}
 */
export function getTargetGroupsForAccent(accent = 'cyan') {
  const normalized = normalizeAccent(accent);
  const primaryGroup = ACCENT_TO_RDA_GROUP[normalized] || 'primary';
  return [primaryGroup, 'secondary', 'neutral'];
}

/**
 * Normalizes numerical Oklab remap parameters with safe bounds.
 * @param {object} [options={}]
 */
export function normalizeRemapParams(options = {}) {
  const accent = normalizeAccent(options.accent);
  const strategy = REMAP_STRATEGIES.includes(options.strategy) ? options.strategy : 'affinity';
  const theme = REMAP_THEMES.includes(options.theme) ? options.theme : 'preserve';
  const rawTemp = Number(options.temperature);
  const temperature = Number.isFinite(rawTemp) ? Math.max(0.005, Math.min(0.15, rawTemp)) : 0.025;
  const rawBoost = Number(options.chromaBoost);
  const chromaBoost = Number.isFinite(rawBoost) ? Math.max(0.0, Math.min(2.5, rawBoost)) : 1.0;
  const rawIntensity = Number(options.intensity);
  const intensity = Number.isFinite(rawIntensity) ? Math.max(0.0, Math.min(1.0, rawIntensity)) : 1.0;
  const maxDimension = Number.isFinite(options.maxDimension) ? Math.round(Math.max(64, Math.min(2560, options.maxDimension))) : 1376;

  return { accent, strategy, theme, temperature, chromaBoost, intensity, maxDimension };
}

/**
 * Builds a deterministic cache key for a wallpaper and its Oklab remap parameters.
 * @param {string} imageSrc
 * @param {object} [options={}]
 * @returns {string}
 */
let lastLargeSource = null, lastLargeFingerprint = null;
function sourceFingerprint(source) {
  if (source.length > 4096 && source === lastLargeSource) return lastLargeFingerprint;
  let left = 2166136261, right = 2246822519;
  for (let index = 0; index < source.length; index++) {
    left = Math.imul(left ^ source.charCodeAt(index), 16777619);
    right = Math.imul(right ^ source.charCodeAt(index), 3266489917);
  }
  const fingerprint = `${source.length}:${(left >>> 0).toString(16)}:${(right >>> 0).toString(16)}`;
  if (source.length > 4096) { lastLargeSource = source; lastLargeFingerprint = fingerprint; }
  return fingerprint;
}
export function buildWallpaperRemapCacheKey(imageSrc, options = {}) {
  const { accent, strategy, theme, temperature, chromaBoost, intensity, maxDimension } = normalizeRemapParams(options);
  return `v2:${sourceFingerprint(String(imageSrc || ''))}|${accent}|${strategy}|${theme}|${temperature.toFixed(3)}|${chromaBoost.toFixed(2)}|${intensity.toFixed(2)}|${maxDimension}`;
}

/**
 * Synchronously retrieves a previously remapped Data URL from memory or `localStorage`
 * so page reloads can restore the selected appearance before initialization.
 * @param {string} imageSrc
 * @param {object} [options={}]
 * @returns {string|null}
 */
export function getCachedRemappedWallpaper(imageSrc, options = {}) {
  const key = buildWallpaperRemapCacheKey(imageSrc, options);
  if (remappedUrlCache.has(key)) {
    return remappedUrlCache.get(key);
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(DESKTOP_WALLPAPER_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.key === key && parsed.wallpaper === imageSrc && typeof parsed.dataUrl === 'string') {
          remappedUrlCache.set(key, parsed.dataUrl);
          return parsed.dataUrl;
        }
      }
    }
  } catch (_) { /* Ignore storage errors */ }
  return null;
}

/**
 * Persists the active desktop's remapped Data URL to `localStorage` so the
 * early boot script (`appearance-bootstrap.js`) can paint it before first frame.
 * @param {string} imageSrc
 * @param {object} options
 * @param {string} dataUrl
 */
export function persistDesktopRemappedWallpaper(imageSrc, options, dataUrl) {
  try {
    if (typeof localStorage === 'undefined' || !dataUrl || dataUrl.length > 2_000_000) return;
    const key = buildWallpaperRemapCacheKey(imageSrc, options);
    localStorage.setItem(DESKTOP_WALLPAPER_CACHE_KEY, JSON.stringify({
      key,
      appearanceKey: options?.appearanceKey,
      wallpaper: imageSrc,
      accent: normalizeAccent(options?.accent),
      systemTheme: options?.systemTheme === 'light' ? 'light' : 'dark',
      dataUrl
    }));
  } catch (_) { /* Storage quota may be full for very large images */ }
}

/**
 * Converts a `#rrggbb` hex string to normalized `[r, g, b]` in `[0, 1]`.
 * @param {string} hex
 * @returns {[number, number, number]}
 */
export function hexToRgb01(hex) {
  const clean = String(hex).trim().replace(/^#/, '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [r, g, b];
}

/**
 * Converts a single sRGB channel `[0, 1]` to linear light.
 * @param {number} c
 * @returns {number}
 */
export function srgbChannelToLinear(c) {
  const clamped = c < 0 ? 0 : c > 1 ? 1 : c;
  return clamped <= 0.04045
    ? clamped / 12.92
    : Math.pow((clamped + 0.055) / 1.055, 2.4);
}

/**
 * Converts a single linear light channel `[0, 1]` to sRGB `[0, 1]`.
 * @param {number} c
 * @returns {number}
 */
export function linearChannelToSrgb(c) {
  const clamped = c < 0 ? 0 : c > 1 ? 1 : c;
  const out = clamped <= 0.0031308
    ? 12.92 * clamped
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return out < 0 ? 0 : out > 1 ? 1 : out;
}

/**
 * Converts normalized sRGB `(r, g, b)` in `[0, 1]` to Oklab `(L, a, b)`.
 * Exact Björn Ottosson forward matrix from `remap_rda_palette.py`.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {[number, number, number]}
 */
export function srgb01ToOklabPixel(r, g, b) {
  const lr = srgbChannelToLinear(r);
  const lg = srgbChannelToLinear(g);
  const lb = srgbChannelToLinear(b);

  const l = Math.cbrt(Math.max(0, 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb));
  const m = Math.cbrt(Math.max(0, 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb));
  const s = Math.cbrt(Math.max(0, 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb));

  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const okA = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;

  return [L, okA, okB];
}

/**
 * Converts Oklab `(L, a, b)` to normalized sRGB `(r, g, b)` in `[0, 1]`.
 * @param {number} L
 * @param {number} okA
 * @param {number} okB
 * @returns {[number, number, number]}
 */
export function oklabToSrgb01Pixel(L, okA, okB) {
  const l_ = L + 0.3963377774 * okA + 0.2158037573 * okB;
  const m_ = L - 0.1055613458 * okA - 0.0638541728 * okB;
  const s_ = L - 0.0894841775 * okA - 1.2914855480 * okB;

  const l = Math.max(0, l_) ** 3;
  const m = Math.max(0, m_) ** 3;
  const s = Math.max(0, s_) ** 3;

  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  return [
    linearChannelToSrgb(lr),
    linearChannelToSrgb(lg),
    linearChannelToSrgb(lb)
  ];
}

/**
 * Builds (and caches) a 1D continuous Oklab Lookup Table parameterized by
 * perceptual lightness `L` in `[0, 1]` for a given RDA token group.
 *
 * @param {string} groupName
 * @param {number} [resolution=1024]
 * @returns {{ groupName: string, resolution: number, aLut: Float32Array, bLut: Float32Array, meanA: number, meanB: number, meanAngle: number }}
 */
export function buildOklabGroupLut(groupName, resolution = LUT_RESOLUTION) {
  const cacheKey = `${groupName}:${resolution}`;
  if (groupLutCache.has(cacheKey)) {
    return groupLutCache.get(cacheKey);
  }

  const hexList = RDA_TOKEN_GROUPS[groupName];
  if (!hexList) {
    throw new Error(`Grupo de tokens RDA desconhecido: "${groupName}"`);
  }

  const stops = hexList.map(hex => {
    const [r, g, b] = hexToRgb01(hex);
    const [L, okA, okB] = srgb01ToOklabPixel(r, g, b);
    return { L, okA, okB };
  });

  stops.sort((x, y) => x.L - y.L);

  let sumA = 0;
  let sumB = 0;
  for (const stop of stops) {
    sumA += stop.okA;
    sumB += stop.okB;
  }
  const meanA = sumA / stops.length;
  const meanB = sumB / stops.length;
  const meanAngle = Math.atan2(meanB, meanA);

  const anchored = [
    { L: 0, okA: 0, okB: 0 },
    ...stops,
    { L: 1, okA: 0, okB: 0 }
  ];

  const aLut = new Float32Array(resolution);
  const bLut = new Float32Array(resolution);

  let segIdx = 0;
  for (let i = 0; i < resolution; i++) {
    const lTarget = resolution === 1 ? 0 : i / (resolution - 1);
    while (segIdx < anchored.length - 2 && anchored[segIdx + 1].L < lTarget) {
      segIdx++;
    }
    const p0 = anchored[segIdx];
    const p1 = anchored[segIdx + 1];
    const span = p1.L - p0.L;
    const t = span > 1e-7 ? Math.max(0, Math.min(1, (lTarget - p0.L) / span)) : 0;
    aLut[i] = p0.okA + t * (p1.okA - p0.okA);
    bLut[i] = p0.okB + t * (p1.okB - p0.okB);
  }

  const result = { groupName, resolution, aLut, bLut, meanA, meanB, meanAngle };
  groupLutCache.set(cacheKey, result);
  return result;
}

/**
 * Smoothly remaps perceptual lightness `L` to fit an RDA theme bias while
 * preserving local contrast (`preserve`, `dark`, `light`).
 *
 * @param {number} L
 * @param {'preserve'|'dark'|'light'} [theme='preserve']
 * @returns {number}
 */
export function applyThemeCurveScalar(L, theme = 'preserve') {
  const clamped = L < 0 ? 0 : L > 1 ? 1 : L;
  if (theme === 'preserve') return clamped;
  if (theme === 'dark') {
    const curved = Math.pow(clamped, 1.35) * 0.88 + 0.04;
    return curved < 0 ? 0 : curved > 1 ? 1 : curved;
  }
  if (theme === 'light') {
    const curved = Math.pow(clamped, 0.72) * 0.88 + 0.08;
    return curved < 0 ? 0 : curved > 1 ? 1 : curved;
  }
  return clamped;
}

/**
 * Applies the Oklab Manifold Color Grading algorithm directly to an RGBA buffer.
 * Automatically delegates to the native Rust/WebAssembly kernel (`remap_rgba_oklab_wasm`)
 * when loaded, or executes the reference algorithm in typed-array JS.
 *
 * @param {{ data: Uint8ClampedArray|Uint8Array, width: number, height: number }} imageData
 * @param {object} [options={}]
 * @param {string} [options.accent='cyan'] Active unkayOS accent preset ID
 * @param {string[]} [options.targetGroups] Explicit RDA token groups (overrides `accent`)
 * @param {'affinity'|'relative'|'split-tone'} [options.strategy='affinity']
 * @param {'preserve'|'dark'|'light'} [options.theme='preserve']
 * @param {number} [options.temperature=0.025] Softmax temperature for `'affinity'`
 * @param {number} [options.chromaBoost=1.0] Multiplier for target palette chroma
 * @param {number} [options.intensity=1.0] Blend factor `[0..1]` between original and remapped
 * @param {boolean} [options.forceJs=false] Use the reference JS implementation for parity checks
 * @param {boolean} [options.alignDominantHue=true] Aligns source chromatic hue with primary group
 * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
 */
export function remapImageDataOklabManifold(imageData, options = {}) {
  if (!imageData || !imageData.data) {
    throw new Error('imageData inválido para remapImageDataOklabManifold.');
  }

  const {
    accent,
    strategy,
    theme,
    temperature,
    chromaBoost,
    intensity
  } = normalizeRemapParams(options);

  const alignDominantHue = options.alignDominantHue !== false;
  const targetGroups = options.targetGroups || getTargetGroupsForAccent(accent);

  const groups = (Array.isArray(targetGroups) && targetGroups.length > 0
    ? targetGroups
    : getTargetGroupsForAccent(accent)
  ).filter(g => Object.hasOwn(RDA_TOKEN_GROUPS, g));

  const groupLuts = (groups.length > 0 ? groups : ['primary', 'secondary', 'neutral']).map(
    name => buildOklabGroupLut(name, LUT_RESOLUTION)
  );
  const K = groupLuts.length;
  const primaryLut = groupLuts[0];
  const primaryChroma = Math.hypot(primaryLut.meanA, primaryLut.meanB);

  const src = imageData.data;

  // Fast Path: Native Rust/WebAssembly execution (`src-wasm/src/oklab.rs`)
  if (wasmRemapFn && options.forceJs !== true) {
    try {
      const aLutsFlat = new Float32Array(K * LUT_RESOLUTION);
      const bLutsFlat = new Float32Array(K * LUT_RESOLUTION);
      for (let k = 0; k < K; k++) {
        aLutsFlat.set(groupLuts[k].aLut, k * LUT_RESOLUTION);
        bLutsFlat.set(groupLuts[k].bLut, k * LUT_RESOLUTION);
      }
      const strategyCode = strategy === 'relative' ? 1 : strategy === 'split-tone' ? 2 : 0;
      const themeCode = theme === 'dark' ? 1 : theme === 'light' ? 2 : 0;
      const rgbaInput = src instanceof Uint8Array
        ? src
        : new Uint8Array(src.buffer, src.byteOffset, src.byteLength);

      const wasmBytes = wasmRemapFn(
        rgbaInput,
        aLutsFlat,
        bLutsFlat,
        K,
        primaryLut.meanAngle,
        primaryChroma,
        strategyCode,
        themeCode,
        temperature,
        chromaBoost,
        intensity,
        alignDominantHue
      );
      return {
        data: new Uint8ClampedArray(wasmBytes.buffer, wasmBytes.byteOffset, wasmBytes.byteLength),
        width: imageData.width,
        height: imageData.height
      };
    } catch (_) {
      // Fall through to pure JS implementation if Wasm call fails
    }
  }

  const pixelCount = (src.length / 4) | 0;
  const out = new Uint8ClampedArray(src.length);
  const maxLutIndex = LUT_RESOLUTION - 1;
  const blend = intensity;

  const L_orig_arr = new Float32Array(pixelCount);
  const L_arr = new Float32Array(pixelCount);
  const a_arr = new Float32Array(pixelCount);
  const b_arr = new Float32Array(pixelCount);
  const lIdx_arr = new Int32Array(pixelCount);

  let domSumA = 0;
  let domSumB = 0;
  let domWeightSum = 0;
  let meanA = 0;
  let meanB = 0;

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    const r = src[offset] / 255;
    const g = src[offset + 1] / 255;
    const b = src[offset + 2] / 255;

    const [L, okA, okB] = srgb01ToOklabPixel(r, g, b);
    const L_out = applyThemeCurveScalar(L, theme);

    L_orig_arr[i] = L;
    L_arr[i] = L_out;
    a_arr[i] = okA;
    b_arr[i] = okB;

    const idx = Math.round(L_out * maxLutIndex);
    lIdx_arr[i] = idx < 0 ? 0 : idx > maxLutIndex ? maxLutIndex : idx;

    meanA += okA;
    meanB += okB;

    const chroma = Math.hypot(okA, okB);
    if (chroma > 0.018) {
      domSumA += okA * chroma;
      domSumB += okB * chroma;
      domWeightSum += chroma;
    }
  }

  if (pixelCount > 0) {
    meanA /= pixelCount;
    meanB /= pixelCount;
  }

  if (strategy === 'affinity') {
    const safeTemp = Math.max(temperature, 1e-4);
    let cosTheta = 1;
    let sinTheta = 0;

    if (alignDominantHue && domWeightSum > 1e-5 && primaryChroma > 0.015) {
      const srcAngle = Math.atan2(domSumB / domWeightSum, domSumA / domWeightSum);
      const deltaAngle = primaryLut.meanAngle - srcAngle;
      cosTheta = Math.cos(deltaAngle);
      sinTheta = Math.sin(deltaAngle);
    }

    const dists = new Float32Array(K);
    const weights = new Float32Array(K);

    for (let i = 0; i < pixelCount; i++) {
      const lIdx = lIdx_arr[i];
      const rawA = a_arr[i];
      const rawB = b_arr[i];
      const rotA = rawA * cosTheta - rawB * sinTheta;
      const rotB = rawA * sinTheta + rawB * cosTheta;

      let minDist = Infinity;
      for (let k = 0; k < K; k++) {
        const ga = groupLuts[k].aLut[lIdx];
        const gb = groupLuts[k].bLut[lIdx];
        const d = Math.hypot(rotA - ga, rotB - gb);
        dists[k] = d;
        if (d < minDist) minDist = d;
      }

      let wSum = 0;
      for (let k = 0; k < K; k++) {
        const w = Math.exp(-(dists[k] - minDist) / safeTemp);
        weights[k] = w;
        wSum += w;
      }

      let aOut = 0;
      let bOut = 0;
      for (let k = 0; k < K; k++) {
        const wNorm = weights[k] / wSum;
        aOut += wNorm * groupLuts[k].aLut[lIdx];
        bOut += wNorm * groupLuts[k].bLut[lIdx];
      }

      const finalL = L_orig_arr[i] + blend * (L_arr[i] - L_orig_arr[i]);
      const finalA = rawA + blend * (aOut * chromaBoost - rawA);
      const finalB = rawB + blend * (bOut * chromaBoost - rawB);

      const [rOut, gOut, bOutRgb] = oklabToSrgb01Pixel(finalL, finalA, finalB);
      const offset = i * 4;
      out[offset] = Math.round(rOut * 255);
      out[offset + 1] = Math.round(gOut * 255);
      out[offset + 2] = Math.round(bOutRgb * 255);
      out[offset + 3] = src[offset + 3];
    }
  } else if (strategy === 'relative') {
    let covAA = 0;
    let covAB = 0;
    let covBB = 0;
    for (let i = 0; i < pixelCount; i++) {
      const da = a_arr[i] - meanA;
      const db = b_arr[i] - meanB;
      covAA += da * da;
      covAB += da * db;
      covBB += db * db;
    }

    const diff = covAA - covBB;
    const angle = 0.5 * Math.atan2(2 * covAB, diff);
    const axisA = Math.cos(angle);
    const axisB = Math.sin(angle);

    const proj = new Float32Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      proj[i] = (a_arr[i] - meanA) * axisA + (b_arr[i] - meanB) * axisB;
    }

    const sampleStep = Math.max(1, Math.floor(pixelCount / 2048));
    const samples = [];
    for (let i = 0; i < pixelCount; i += sampleStep) {
      samples.push(proj[i]);
    }
    samples.sort((x, y) => x - y);
    const pLow = samples.length > 0 ? samples[Math.floor(samples.length * 0.02)] : -1;
    const pHigh = samples.length > 0 ? samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.98))] : 1;
    const pSpan = pHigh - pLow > 1e-6 ? pHigh - pLow : 1;

    for (let i = 0; i < pixelCount; i++) {
      const lIdx = lIdx_arr[i];
      const tNorm = Math.max(-1, Math.min(1, ((proj[i] - pLow) / pSpan) * 2 - 1));
      const pos = ((tNorm + 1) * 0.5) * Math.max(K - 1, 1);

      let aOut = 0;
      let bOut = 0;
      if (K === 1) {
        aOut = groupLuts[0].aLut[lIdx];
        bOut = groupLuts[0].bLut[lIdx];
      } else {
        const idxLow = Math.min(K - 2, Math.max(0, Math.floor(pos)));
        const idxHigh = idxLow + 1;
        const frac = pos - idxLow;
        aOut = (1 - frac) * groupLuts[idxLow].aLut[lIdx] + frac * groupLuts[idxHigh].aLut[lIdx];
        bOut = (1 - frac) * groupLuts[idxLow].bLut[lIdx] + frac * groupLuts[idxHigh].bLut[lIdx];
      }

      const rawA = a_arr[i];
      const rawB = b_arr[i];
      const finalL = L_orig_arr[i] + blend * (L_arr[i] - L_orig_arr[i]);
      const finalA = rawA + blend * (aOut * chromaBoost - rawA);
      const finalB = rawB + blend * (bOut * chromaBoost - rawB);

      const [rOut, gOut, bOutRgb] = oklabToSrgb01Pixel(finalL, finalA, finalB);
      const offset = i * 4;
      out[offset] = Math.round(rOut * 255);
      out[offset + 1] = Math.round(gOut * 255);
      out[offset + 2] = Math.round(bOutRgb * 255);
      out[offset + 3] = src[offset + 3];
    }
  } else if (strategy === 'split-tone') {
    const revLuts = [...groupLuts].reverse();
    for (let i = 0; i < pixelCount; i++) {
      const lIdx = lIdx_arr[i];
      const L_out = L_arr[i];
      let aOut = 0;
      let bOut = 0;

      if (K === 1) {
        aOut = revLuts[0].aLut[lIdx];
        bOut = revLuts[0].bLut[lIdx];
      } else {
        const pos = L_out * (K - 1);
        const idxLow = Math.min(K - 2, Math.max(0, Math.floor(pos)));
        const idxHigh = idxLow + 1;
        const frac = pos - idxLow;
        aOut = (1 - frac) * revLuts[idxLow].aLut[lIdx] + frac * revLuts[idxHigh].aLut[lIdx];
        bOut = (1 - frac) * revLuts[idxLow].bLut[lIdx] + frac * revLuts[idxHigh].bLut[lIdx];
      }

      const rawA = a_arr[i];
      const rawB = b_arr[i];
      const finalL = L_orig_arr[i] + blend * (L_out - L_orig_arr[i]);
      const finalA = rawA + blend * (aOut * chromaBoost - rawA);
      const finalB = rawB + blend * (bOut * chromaBoost - rawB);

      const [rOut, gOut, bOutRgb] = oklabToSrgb01Pixel(finalL, finalA, finalB);
      const offset = i * 4;
      out[offset] = Math.round(rOut * 255);
      out[offset + 1] = Math.round(gOut * 255);
      out[offset + 2] = Math.round(bOutRgb * 255);
      out[offset + 3] = src[offset + 3];
    }
  } else {
    throw new Error(`Estratégia de remapeamento Oklab desconhecida: "${strategy}"`);
  }

  return {
    data: out,
    width: imageData.width,
    height: imageData.height
  };
}

/**
 * Checks whether a wallpaper string represents an image URL or Data URI
 * (as opposed to a CSS gradient or solid hex color).
 * @param {string} wallpaper
 * @returns {boolean}
 */
export function isImageWallpaper(wallpaper) {
  if (typeof wallpaper !== 'string' || !wallpaper) return false;
  return /^(https?:\/\/|\/|\.\/|data:image\/|blob:)/.test(wallpaper);
}

/**
 * Checks if the current runtime supports real `<canvas>` 2D pixel extraction
 * (true in browser, false in happy-dom unit tests).
 * @returns {boolean}
 */
let canvas2DSupported = null;
export function canUseCanvas2D() {
  if (canvas2DSupported !== null) return canvas2DSupported;
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    canvas2DSupported = false;
    return false;
  }
  try {
    const c = document.createElement('canvas');
    const ctx = c.getContext?.('2d');
    canvas2DSupported = Boolean(ctx && typeof ctx.getImageData === 'function');
  } catch (_) {
    canvas2DSupported = false;
  }
  return canvas2DSupported;
}

// Cache of decoded HTMLImageElement instances by src to avoid re-fetching/decoding
// the image when the user adjusts sliders or changes accents!
const decodedImageCache = new Map();

async function loadDecodedImage(imageSrc) {
  if (decodedImageCache.has(imageSrc)) return decodedImageCache.get(imageSrc);
  const pending = new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível carregar a imagem para adaptação.'));
    image.src = imageSrc;
  });
  if (decodedImageCache.size >= 12) decodedImageCache.delete(decodedImageCache.keys().next().value);
  decodedImageCache.set(imageSrc, pending);
  pending.catch(() => { if (decodedImageCache.get(imageSrc) === pending) decodedImageCache.delete(imageSrc); });
  return pending;
}
const pendingRemaps = new Map();

/**
 * Loads an image in the browser, applies `remapImageDataOklabManifold` (using
 * the Rust/WebAssembly kernel when ready) on an offscreen `<canvas>`, and
 * returns a Data URL (with LRU caching).
 *
 * @param {string} imageSrc URL or Data URI of the image
 * @param {object} [options={}]
 * @returns {Promise<string>} Remapped image Data URL
 */
export async function remapWallpaperImage(imageSrc, options = {}) {
  if (!isImageWallpaper(imageSrc)) return imageSrc;
  if (!canUseCanvas2D()) {
    return imageSrc;
  }

  const normalized = normalizeRemapParams(options);
  if (normalized.intensity <= 0.001) {
    return imageSrc;
  }

  const cacheKey = buildWallpaperRemapCacheKey(imageSrc, normalized);
  if (remappedUrlCache.has(cacheKey)) {
    return remappedUrlCache.get(cacheKey);
  }

  if (pendingRemaps.has(cacheKey)) return pendingRemaps.get(cacheKey);
  const pending = (async () => {
    const [, img] = await Promise.all([
      ensureWasmOklabReady(),
      loadDecodedImage(imageSrc)
    ]);

    const naturalWidth = img.naturalWidth || img.width || 1376;
    const naturalHeight = img.naturalHeight || img.height || 768;
    const scale = Math.min(1, normalized.maxDimension / Math.max(naturalWidth, naturalHeight, 1));
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return imageSrc;

    ctx.drawImage(img, 0, 0, width, height);
    const rawImageData = ctx.getImageData(0, 0, width, height);
    const remapped = remapImageDataOklabManifold(rawImageData, normalized);

    rawImageData.data.set(remapped.data);
    ctx.putImageData(rawImageData, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    if (remappedUrlCache.size >= MAX_URL_CACHE_ENTRIES) {
      const oldestKey = remappedUrlCache.keys().next().value;
      remappedUrlCache.delete(oldestKey);
    }
    remappedUrlCache.set(cacheKey, dataUrl);
    return dataUrl;
  })().finally(() => { pendingRemaps.delete(cacheKey); });
  pendingRemaps.set(cacheKey, pending);
  return pending;
}

export function clearRemappedWallpaperCache() {
  remappedUrlCache.clear();
}
