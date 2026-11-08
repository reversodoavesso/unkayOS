// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { readPreferences, writePreferences, applyAppearance, clearTemporaryFiles, normalizeAppearance } from '../core/utils/appPreferences.js';

describe('Persistent application preferences', () => {
  it('waits for directory creation before writing async OPFS settings', async () => {
    const calls = [];
    const fs = { mkdir: async () => { await Promise.resolve(); calls.push('mkdir'); }, writeFile: async () => { calls.push('write'); } };
    await writePreferences(fs, '/etc/settings.json', 'test-settings', { theme: 'light' });
    expect(calls).toEqual(['mkdir', 'write']);
    localStorage.setItem('test-settings', '{"theme":"dark"}');
    expect(await readPreferences({ readFile: async () => '{"theme":"light"}' }, '/etc/settings.json', 'test-settings')).toEqual({ theme: 'light' });
    expect(JSON.parse(localStorage.getItem('test-settings'))).toEqual({ theme: 'light' });
  });

  it('falls back to cached preferences when the OPFS file is missing', async () => {
    localStorage.setItem('fallback', '{"theme":"dark"}');
    expect(await readPreferences({ readFile: async () => { throw new Error('ENOENT'); } }, '/missing', 'fallback')).toEqual({ theme: 'dark' });
  });

  it('applies the actual theme, glass and font scale', () => {
    applyAppearance({ theme: 'light', glassmorphism: false, fontScale: 'large' });
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.glass).toBe('false');
    expect(document.documentElement.style.fontSize).toBe('18px');
  });

  it('removes legacy accent overrides without recoloring semantic state tokens', () => {
    const root = document.documentElement;
    root.style.setProperty('--rda-color-primary-400', '#f43f5e');
    root.style.setProperty('--color-primary-base', '#f43f5e');
    root.style.setProperty('--rda-status-error', '#dc2626');
    applyAppearance({ theme: 'light', accentColor: '#f43f5e' });
    expect(root.style.getPropertyValue('--rda-color-primary-400')).toBe('');
    expect(root.style.getPropertyValue('--color-primary-base')).toBe('');
    expect(root.style.getPropertyValue('--rda-status-error')).toBe('#dc2626');
    root.style.removeProperty('--rda-status-error');
  });

  it('drops unsupported accent preferences while retaining the selected appearance', () => {
    expect(normalizeAppearance({ theme: 'light', accentColor: '#a855f7', wallpaper: '#0a0a0a', glassmorphism: false, fontScale: 'large' })).toEqual({
      theme: 'light', wallpaper: '#0a0a0a', glassmorphism: false, fontScale: 'large', accent: 'cyan'
    });
    expect(normalizeAppearance(null)).not.toHaveProperty('accentColor');
  });

  it('awaits async temporary-file deletion and rejects paths outside tmp', async () => {
    const fs = { readdir: async () => ['a.txt', '../outside', '..', { name: 'b.txt' }], remove: vi.fn().mockResolvedValue(undefined) };
    expect(await clearTemporaryFiles(fs)).toBe(2);
    expect(fs.remove.mock.calls).toEqual([['/tmp/a.txt'], ['/tmp/b.txt']]);
  });
});
