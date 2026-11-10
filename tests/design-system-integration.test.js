// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { normalizeAppearance, applyAppearance } from '../core/utils/appPreferences.js';
import { accentPresets } from '../design-system/rda/accents.js';

const root = process.cwd();
const catalog = JSON.parse(readFileSync('design-system/rda/icons/manifest.json', 'utf8'));

function relativeLuminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(a, b) {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('Official DS integration and app authoring', () => {
  it('updates only the product preset, normalizes legacy accents, and rejects arbitrary colors as presets', () => {
    const desktop = document.createElement('div');
    applyAppearance({ theme: 'light', accent: 'nebula' }, desktop);
    expect(desktop.dataset.unkayAccent).toBe('nebula');
    expect(document.documentElement.style.getPropertyValue('--rda-color-primary-400')).toBe('');
    expect(normalizeAppearance({ accent: '#a855f7' }).accent).toBe('primary');
    expect(normalizeAppearance({ accent: 'toString' }).accent).toBe('primary');
    expect(normalizeAppearance({ accent: 'violet' }).accent).toBe('nebula');
    expect(normalizeAppearance({ accent: 'cyan' }).accent).toBe('primary');
    expect(normalizeAppearance({ accent: 'blue' }).accent).toBe('cobalt');
    expect(normalizeAppearance({ accent: 'rose' }).accent).toBe('magma');
    expect(normalizeAppearance({ accent: 'fuchsia' }).accent).toBe('lotus');
    expect(normalizeAppearance({ accent: 'teal' }).accent).toBe('aurora');
    expect(normalizeAppearance({ accent: 'indigo' }).accent).toBe('cobalt');
  });

  it('ships DS 3.10.0 accents with distinct WCAG AA light/dark tokens and preserves dark-mode cascade in preferences.css', () => {
    const dist = JSON.parse(readFileSync('design-system/rda/distribution.json', 'utf8'));
    expect(dist.version).toBe('3.10.0');
    expect(Object.keys(accentPresets)).toEqual(['primary', 'nebula', 'magma', 'lotus', 'aurora', 'cobalt']);

    const prefsCss = readFileSync('design-system/styles/preferences.css', 'utf8');
    const mainCss = readFileSync('design-system/styles/main.css', 'utf8');
    expect(mainCss.indexOf('/design-system/rda/unkayos.css')).toBeLessThan(mainCss.indexOf('/design-system/styles/preferences.css'));
    expect(prefsCss).toContain('@layer rda.overrides');

    for (const [id, preset] of Object.entries(accentPresets)) {
      expect(contrastRatio(preset.dark.solid, preset.dark.onSolid), `${id}.dark`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(preset.light.solid, preset.light.onSolid), `${id}.light`).toBeGreaterThanOrEqual(4.5);
      expect(preset.dark.solid).not.toBe(preset.light.solid);
      expect(prefsCss).toContain(preset.dark.solid);
      expect(prefsCss).toContain(preset.light.solid);
    }
    for (const alias of ['cyan', 'violet', 'blue', 'rose', 'fuchsia', 'teal', 'indigo']) {
      expect(prefsCss).toContain(`[data-unkay-accent="${alias}"]`);
    }
    const overrideLayer = prefsCss.slice(prefsCss.indexOf('@layer rda.overrides'));
    const rules = [...overrideLayer.matchAll(/:where\(([^)]+)\)\s*\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThanOrEqual(18);
    const lightSolids = new Set(Object.values(accentPresets).map(preset => preset.light.solid));
    const darkSolids = new Set(Object.values(accentPresets).map(preset => preset.dark.solid));
    let lastLightIndex = -1;
    let firstNestedDarkIndex = Number.POSITIVE_INFINITY;
    rules.forEach(([, selectorList, body], idx) => {
      const solid = body.match(/--unkay-accent-solid:\s*(#[0-9a-f]{6})/i)?.[1];
      if (lightSolids.has(solid)) {
        lastLightIndex = Math.max(lastLightIndex, idx);
        for (const selector of selectorList.split(',').map(part => part.trim())) {
          expect(selector, `Unqualified light selector: ${selector}`).toContain('[data-theme="light"]');
        }
      } else if (darkSolids.has(solid) && selectorList.includes('[data-theme="light"]')) {
        firstNestedDarkIndex = Math.min(firstNestedDarkIndex, idx);
      }
    });
    expect(lastLightIndex).toBeGreaterThan(-1);
    expect(firstNestedDarkIndex).toBeLessThan(Number.POSITIVE_INFINITY);
    expect(firstNestedDarkIndex).toBeGreaterThan(lastLightIndex);
  });

  it('uses official DS font tokens and avoids remote Google Fonts links', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).toContain('data-unkay-accent="primary"');
    const typography = readFileSync('design-system/styles/typography.css', 'utf8');
    expect(typography).toContain('--rda-font-family-body');
    expect(typography).toContain('--rda-font-family-mono');
    for (const file of ['apps/clock/style.css', 'apps/system-info/style.css', 'apps/text-editor/style.css', 'apps/terminal/style.css', 'core/sdk/AppSandbox.js']) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toContain('Roboto');
      expect(src, file).not.toContain('Courier New');
    }
    expect(readFileSync('core/sdk/AppSandbox.js', 'utf8')).toContain('--rda-font-family-body');
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
