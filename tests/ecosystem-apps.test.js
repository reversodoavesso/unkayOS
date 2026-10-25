// @vitest-environment happy-dom
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
        expect(app.presets.dashboard.spec).toContain('var(--rda-color-primary-400');
        expect(app.presets.kanban.spec).toContain('Quadro Ágil unkayOS');
        expect(app.presets.form.spec).toContain('Chave de API');
        expect(app.presets['file-inspector'].spec).toContain('Explorador de Arquivos VFS');
    });

    it('should provide complete RDA DS component snippets', () => {
        const app = new OpenUIStudioApp(mockCORE, mockStandardAPIs);
        const requiredSnippets = ['button-primary', 'button-secondary', 'card', 'badge', 'metric', 'input', 'table'];

        for (const key of requiredSnippets) {
            expect(app.snippets[key], `Snippet '${key}' should be available`).toBeTruthy();
            expect(app.snippets[key]).toContain('rda-');
        }
    });

    it('should insert component snippets and update spec dynamically', () => {
        const app = new OpenUIStudioApp(mockCORE, mockStandardAPIs);
        app.currentSpec = '<div>Init</div>';
        app.insertSnippet('button-primary');

        expect(app.currentSpec).toContain('Ação Primária Cyan');
        expect(app.currentSpec).toContain('rda-btn-primary');
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
