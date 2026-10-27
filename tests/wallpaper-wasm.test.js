// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initSync, remap_rgba_oklab_wasm, UnkayKernel } from '../core/wasm/pkg/unkay_kernel.js';
import { ensureWasmOklabReady, remapImageDataOklabManifold } from '../core/ui/wallpaperPaletteRemap.js';

beforeAll(async () => {
  initSync({ module: readFileSync('core/wasm/pkg/unkay_kernel_bg.wasm') });
  expect(await ensureWasmOklabReady()).toBe(true);
});
describe('Distributed wallpaper Wasm kernel', () => {
  it('agrees with the JS fallback across every accent and grading strategy', () => {
    const pixels = new Uint8ClampedArray([0,0,0,255, 255,255,255,200, 82,82,82,255, 6,182,212,255, 139,92,246,128, 244,63,94,255, 180,195,210,255, 10,20,30,0]);
    const input = { width: 8, height: 1, data: pixels };
    for (const accent of ['cyan','violet','blue','rose','fuchsia','teal','indigo']) for (const strategy of ['affinity','relative','split-tone']) for (const theme of ['preserve','light','dark']) {
      const options = { accent, strategy, theme, intensity: 0.8 };
      const wasm = remapImageDataOklabManifold(input, options).data;
      const js = remapImageDataOklabManifold(input, { ...options, forceJs: true }).data;
      const difference = Math.max(...wasm.map((value, i) => Math.abs(value - js[i])));
      expect(difference, JSON.stringify(options)).toBeLessThanOrEqual(3);
      expect([wasm[7], wasm[19], wasm[31]]).toEqual([200,128,0]);
    }
  });
  it('rejects malformed tables without panicking or damaging the filesystem kernel', () => {
    const kernel = new UnkayKernel();
    try {
      kernel.mkdir('/tmp', true); kernel.write_text('/tmp/review.txt', 'preservado');
      expect(() => remap_rgba_oklab_wasm(new Uint8Array(4), new Float32Array(1), new Float32Array(1), 3, 0, 1, 0, 0, 0.025, 1, 1, true)).toThrow();
      expect(kernel.read_text('/tmp/review.txt')).toBe('preservado');
    } finally { kernel.free(); }
  });
});
