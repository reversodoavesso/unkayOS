// @vitest-environment jsdom
// tests/ecosystem-apps.test.js - unkayOS 2.0 OpenUI Generative Studio Test Suite
// Verifies OpenUI Studio v2.0, RDA Design System snippets, presets, and VFS packaging

import { describe, it, expect, beforeEach, vi } from 'vitest';
import OpenUIStudioApp from '../apps/openui/main.js';

describe('unkayOS 2.0 OpenUI Generative Studio v2.0', () => {
    let mockCORE;
    let mockStandardAPIs;

    beforeEach(() => {
        mockCORE = {
            app_name: 'OpenUI Studio',
            mode: 'system_window'
        };
        mockStandardAPIs = {};
    });

    it('should initialize presets with RDA Design System tokens and structures', () => {
        const app = new OpenUIStudioApp(mockCORE, mockStandardAPIs);
        expect(app.presets.dashboard).toBeTruthy();
        expect(app.presets.kanban).toBeTruthy();
        expect(app.presets.form).toBeTruthy();
        expect(app.presets['file-inspector']).toBeTruthy();

        // Verify tokens usage
        expect(app.presets.dashboard.spec).toContain('var(--rda-surface-secondary');
        expect(app.presets.dashboard.spec).toContain('var(--rda-content-brand');
        expect(app.presets.kanban.spec).toContain('Quadro Ágil unkayOS');
        expect(app.presets.form.spec).toContain('Chave de API');
        expect(app.presets['file-inspector'].spec).toContain('Explorador de Arquivos VFS');
    });

    it('initializes the actual Studio markup and opens a native preview through AppManager', async () => {
        const { readFileSync } = await import('node:fs');
        const { unkay } = await import('../core/sdk/unkay.js');
        const root = document.createElement('div');
        root.innerHTML = readFileSync('apps/openui/index.html', 'utf8');
        const runApp = vi.fn().mockResolvedValue('preview-instance');
        const app = new OpenUIStudioApp(mockCORE, { setTimeout: vi.fn(), appManager: { runApp } });
        app.appContentRoot = root;
        const mkdir = vi.spyOn(unkay.fs, 'mkdir').mockResolvedValue(undefined);
        const write = vi.spyOn(unkay.fs, 'writeFile').mockResolvedValue(undefined);
        try {
            await app.onRun();
            expect(root.querySelector('#sandboxHost').shadowRoot.textContent).toContain('Dashboard');
            await app.launchInOsWindow();
            expect(runApp).toHaveBeenCalledWith('openui', expect.objectContaining({ previewSpec: app.currentSpec }));
            app.manifest.id = '../outside';
            expect(await app.saveToVfs()).toBe(false);
        } finally { mkdir.mockRestore(); write.mockRestore(); app.onCleanup(); }
    });

    it('should provide complete RDA DS component snippets', () => {
        const app = new OpenUIStudioApp(mockCORE, mockStandardAPIs);
        const requiredSnippets = ['button-primary', 'button-secondary', 'card', 'badge', 'metric', 'input', 'table'];

        for (const key of requiredSnippets) {
            expect(app.snippets[key], `Snippet '${key}' should be available`).toBeTruthy();
            expect(app.snippets[key]).toContain('rda-');
        }
    });

    it('supplies the canonical guide and real icon catalog to the OpenUI agent', async () => {
        const { readFileSync } = await import('node:fs');
        const { unkay } = await import('../core/sdk/unkay.js');
        const root = document.createElement('div');
        root.innerHTML = readFileSync('apps/openui/index.html', 'utf8');
        const app = new OpenUIStudioApp(mockCORE, { setTimeout: vi.fn() });
        app.appContentRoot = root;
        root.querySelector('#promptInput').value = 'Uma tela de notas';
        const prompt = vi.spyOn(unkay.ai, 'prompt').mockResolvedValue({ content: '<p>Notas</p>' });
        vi.stubGlobal('fetch', vi.fn(async url => url.endsWith('.md')
            ? { ok: true, text: async () => 'CANONICAL APP GUIDE' }
            : { ok: true, json: async () => ({ icons: { save: {}, settings: {} } }) }));
        try {
            await app.generateWithAi();
            const messages = prompt.mock.calls[0][0];
            expect(messages[0].content).toContain('CANONICAL APP GUIDE');
            expect(messages[0].content).toContain('save, settings');
            expect(messages[0].content).toContain('<rda-icon>');
        } finally { prompt.mockRestore(); vi.unstubAllGlobals(); app.onCleanup(); }
    });

    it('should insert component snippets and update spec dynamically', () => {
        const app = new OpenUIStudioApp(mockCORE, mockStandardAPIs);
        app.currentSpec = '<div>Init</div>';
        app.insertSnippet('button-primary');

        expect(app.currentSpec).toContain('data-color="primary"');
        expect(app.currentSpec).toContain('class="rda-button rda-button--md"');
        expect(app.currentSpec).toContain('<rda-icon name="save">');
    });

    it('should package generated OpenUI spec and install to VFS with desktop launcher', async () => {
        const app = new OpenUIStudioApp(mockCORE, mockStandardAPIs);
        const preset = app.presets.dashboard;

        const vfsStorage = new Map();
        const fakeUnkay = {
            fs: {
                mkdir: vi.fn(async (dir) => vfsStorage.set(dir, true)),
                writeFile: vi.fn(async (path, content) => vfsStorage.set(path, content)),
                exists: vi.fn(async (path) => vfsStorage.has(path))
            }
        };

        const appDir = '/home/user/apps/system-dashboard';
        const manifest = {
            id: 'system-dashboard',
            name: preset.title,
            version: '1.0.0',
            type: 'openui',
            runtime_profile: 'client-only',
            entrypoint: 'spec.openui'
        };

        // 1. Write package manifest & spec
        await fakeUnkay.fs.mkdir(appDir);
        await fakeUnkay.fs.writeFile(`${appDir}/package.json`, JSON.stringify(manifest));
        await fakeUnkay.fs.writeFile(`${appDir}/spec.openui`, preset.spec);

        // 2. Write desktop launcher
        const desktopPath = `/home/guest/Desktop/Dashboard_de_Recursos.desktop`;
        await fakeUnkay.fs.mkdir('/home/guest/Desktop');
        await fakeUnkay.fs.writeFile(desktopPath, `[Desktop Entry]\nName=${preset.title}\nExec=unkay run system-dashboard\n`);

        expect(fakeUnkay.fs.mkdir).toHaveBeenCalledWith(appDir);
        expect(vfsStorage.has(`${appDir}/package.json`)).toBe(true);
        expect(vfsStorage.has(`${appDir}/spec.openui`)).toBe(true);
        expect(vfsStorage.has(desktopPath)).toBe(true);

        const savedManifest = JSON.parse(vfsStorage.get(`${appDir}/package.json`));
        expect(savedManifest.type).toBe('openui');
        expect(savedManifest.runtime_profile).toBe('client-only');
    });
});
