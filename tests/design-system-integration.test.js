// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { normalizeAppearance, applyAppearance } from '../core/utils/appPreferences.js';

const root = process.cwd();
const catalog = JSON.parse(readFileSync('design-system/rda/icons/manifest.json', 'utf8'));
describe('Official DS integration and app authoring', () => {
  it('updates only the product preset and rejects arbitrary colors as presets', () => {
    const desktop = document.createElement('div');
    applyAppearance({ theme: 'light', accent: 'violet' }, desktop);
    expect(desktop.dataset.unkayAccent).toBe('violet');
    expect(document.documentElement.style.getPropertyValue('--rda-color-primary-400')).toBe('');
    expect(normalizeAppearance({ accent: '#a855f7' }).accent).toBe('cyan');
    expect(normalizeAppearance({ accent: 'toString' }).accent).toBe('cyan');
  });

  it('uses official catalog icons in every bundled app manifest and static interface', () => {
    for (const folder of readdirSync('apps', { withFileTypes: true }).filter(entry => entry.isDirectory())) {
      const config = JSON.parse(readFileSync(resolve('apps', folder.name, 'config.json'), 'utf8'));
      expect(catalog.icons[config.icon_name], folder.name).toBeTruthy();
      expect(readFileSync(resolve('apps', folder.name, 'icon.svg'), 'utf8')).toBe(readFileSync(resolve('design-system/rda/icons', config.icon_name + '.svg'), 'utf8'));
      for (const file of ['index.html', 'main.js']) {
        const source = readFileSync(resolve('apps', folder.name, file), 'utf8');
        expect(source, folder.name + '/' + file).not.toMatch(/\p{Extended_Pictographic}/u);
        expect(source).not.toContain('material-icons');
        for (const match of source.matchAll(/<rda-icon\b[^>]*name="([a-z0-9-]+)"/g)) expect(catalog.icons[match[1]], match[1]).toBeTruthy();
      }
    }
  });

  it('provides one canonical guide to people, the SDK and the local website', () => {
    const source = readFileSync('docs/APP_DEVELOPMENT.md', 'utf8');
    for (const file of ['docs/AI_APP_DEVELOPMENT_GUIDELINES.md', 'core/sdk/AI_APP_DEVELOPMENT_GUIDELINES.md', 'design-system/APP_GUIDE.md']) expect(readFileSync(file, 'utf8')).toBe(source);
  });

  it('scaffolds controls, official icons and async lifecycle from an executable command', () => {
    const output = execFileSync(process.execPath, ['scripts/scaffold-app.mjs', '--id', 'ds-test-example', '--name', 'App de exemplo', '--icon', 'save', '--dry-run'], { cwd: root, encoding: 'utf8' });
    const app = JSON.parse(output);
    expect(JSON.parse(app.files['config.json']).icon_name).toBe('save');
    expect(app.files['index.html']).toContain('data-color="primary"');
    expect(app.files['index.html']).toContain('<rda-icon name="save">');
    expect(app.files['main.js']).toContain('await fs.writeFile');
    expect(app.files['main.js']).toContain('await fs.flush()');
    expect(app.files['main.js']).toContain('onCleanup');
  });
});
