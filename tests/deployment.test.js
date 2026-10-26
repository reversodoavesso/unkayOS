import { afterEach, describe, expect, it, vi } from 'vitest';
describe('Operator branding flag', () => {
  afterEach(() => { delete globalThis.__UNKAYOS_DEPLOYMENT__; vi.resetModules(); });
  it('is neutral without a deployment configuration', async () => {
    vi.resetModules(); expect((await import('../core/deployment.js')).workspaceIcon).toBe('layout-grid');
  });
  it('opts into RDA branding explicitly', async () => {
    globalThis.__UNKAYOS_DEPLOYMENT__ = { branding: 'rda' }; vi.resetModules();
    expect((await import('../core/deployment.js')).workspaceIcon).toBe('rda-icon');
  });
  it('falls back to neutral for unsupported values', async () => {
    globalThis.__UNKAYOS_DEPLOYMENT__ = { branding: 'other' }; vi.resetModules();
    expect((await import('../core/deployment.js')).deployment.branding).toBe('neutral');
  });
});
