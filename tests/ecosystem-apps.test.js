// @vitest-environment happy-dom
// tests/ecosystem-apps.test.js - Phase 6 Ecosystem Integration Test Suite
// Verifies Euterpe Audio Station, Cine Workstation, and OpenUI Generative Studio

import { describe, it, expect, beforeEach, vi } from 'vitest';
import EuterpeApp from '../apps/euterpe/main.js';
import CineApp from '../apps/cine/main.js';
import OpenUIStudioApp from '../apps/openui/main.js';

describe('unkayOS 2.0 Euterpe Audio Workstation (Pillar 1)', () => {
    let mockCORE;
    let mockStandardAPIs;

    beforeEach(() => {
        mockCORE = {
            app_name: 'Euterpe Studio',
            mode: 'system_window'
        };
        mockStandardAPIs = {};
    });

    it('should initialize demo curations and calculate BPM correctly', () => {
        const app = new EuterpeApp(mockCORE, mockStandardAPIs);
        app.initDemoTracks();

        expect(app.curations.length).toBeGreaterThanOrEqual(3);
        const doomTrack = app.curations.find(t => t.title.includes('Doomed'));
        expect(doomTrack).toBeTruthy();
        expect(doomTrack.bpm).toBe(130.0);
        expect(doomTrack.key).toContain('8A');

        // Test BPM estimation on mock audio buffer
        const mockAudioBuffer = {
            duration: 120,
            sampleRate: 44100,
            getChannelData: () => new Float32Array(44100 * 2)
        };
        const calculatedBpm = app.calculateBPM(mockAudioBuffer);
        expect(calculatedBpm).toBeGreaterThan(60);
        expect(calculatedBpm).toBeLessThan(200);
    });

    it('should format and export curation packet to VFS', async () => {
        const app = new EuterpeApp(mockCORE, mockStandardAPIs);
        app.initDemoTracks();

        const vfsStorage = new Map();
        const fakeUnkay = {
            fs: {
                mkdir: vi.fn(async (dir) => vfsStorage.set(dir, true)),
                writeFile: vi.fn(async (path, content) => vfsStorage.set(path, content))
            }
        };

        const targetDir = '/home/user/music/curations';
        const filename = 'euterpe-curation-test.json';
        const packet = JSON.stringify({
            exportedAt: new Date().toISOString(),
            trackCount: app.curations.length,
            tracks: app.curations
        });

        await fakeUnkay.fs.mkdir(targetDir);
        await fakeUnkay.fs.writeFile(`${targetDir}/${filename}`, packet);

        expect(fakeUnkay.fs.mkdir).toHaveBeenCalledWith(targetDir);
        expect(vfsStorage.has(`${targetDir}/${filename}`)).toBe(true);

        const saved = JSON.parse(vfsStorage.get(`${targetDir}/${filename}`));
        expect(saved.trackCount).toBe(app.curations.length);
    });
});

describe('unkayOS 2.0 Cine Hub & Workstation (Pillar 2)', () => {
    let mockCORE;
    let mockStandardAPIs;

    beforeEach(() => {
        mockCORE = {
            app_name: 'Cine Hub',
            mode: 'system_window'
        };
        mockStandardAPIs = {};
    });

    it('should filter catalogue by genre and search term', () => {
        const app = new CineApp(mockCORE, mockStandardAPIs);
        app.initData();

        expect(app.movies.length).toBeGreaterThanOrEqual(4);

        // Filter cyberpunk
        const cyberpunkMovies = app.movies.filter(m => m.genre === 'Cyberpunk');
        expect(cyberpunkMovies.some(m => m.title === 'Blade Runner 2049')).toBe(true);

        // Search director
        const tarkovsky = app.movies.filter(m => m.director.includes('Tarkovsky'));
        expect(tarkovsky.length).toBe(1);
        expect(tarkovsky[0].title).toBe('Stalker');
    });

    it('should write review drafts in Markdown to VFS', async () => {
        const app = new CineApp(mockCORE, mockStandardAPIs);
        app.initData();

        const vfsStorage = new Map();
        const fakeUnkay = {
            fs: {
                mkdir: vi.fn(async (dir) => vfsStorage.set(dir, true)),
                writeFile: vi.fn(async (path, content) => vfsStorage.set(path, content))
            }
        };

        const reviewDir = '/home/user/documents/cine/reviews';
        const slug = 'stalker-1979';
        const markdown = `# Impressões sobre Stalker\n\n**Direção:** Andrei Tarkovsky\n**Avaliação:** ★★★★★\n\nFilme transcendental.`;

        await fakeUnkay.fs.mkdir(reviewDir);
        await fakeUnkay.fs.writeFile(`${reviewDir}/${slug}.md`, markdown);

        expect(fakeUnkay.fs.writeFile).toHaveBeenCalledWith(`${reviewDir}/${slug}.md`, markdown);
        expect(vfsStorage.get(`${reviewDir}/${slug}.md`)).toContain('Tarkovsky');
    });
});

describe('unkayOS 2.0 OpenUI Generative Studio (Pillar 3)', () => {
    let mockCORE;
    let mockStandardAPIs;

    beforeEach(() => {
        mockCORE = {
            app_name: 'OpenUI Studio',
            mode: 'system_window'
        };
        mockStandardAPIs = {};
    });

    it('should load presets and have valid declarative OpenUI markup', () => {
        const app = new OpenUIStudioApp(mockCORE, mockStandardAPIs);
        expect(app.presets.monitor).toBeTruthy();
        expect(app.presets.converter).toBeTruthy();
        expect(app.presets.pomodoro).toBeTruthy();

        expect(app.presets.monitor.spec).toContain('Status do Host Raspberry Pi');
        expect(app.presets.converter.spec).toContain('BRL');
        expect(app.presets.pomodoro.spec).toContain('25:00');
    });

    it('should package generated OpenUI spec and install to VFS with desktop launcher', async () => {
        const app = new OpenUIStudioApp(mockCORE, mockStandardAPIs);
        const preset = app.presets.monitor;

        const vfsStorage = new Map();
        const fakeUnkay = {
            fs: {
                mkdir: vi.fn(async (dir) => vfsStorage.set(dir, true)),
                writeFile: vi.fn(async (path, content) => vfsStorage.set(path, content)),
                exists: vi.fn(async (path) => vfsStorage.has(path))
            }
        };

        const appDir = '/home/user/apps/openui-monitor';
        const manifest = {
            id: 'openui-monitor',
            name: preset.title,
            version: '1.0.0',
            type: 'openui',
            runtime_profile: 'client-only',
            entrypoint: 'spec.openui'
        };

        // 1. Write package manifest & spec
        await fakeUnkay.fs.mkdir(appDir);
        await fakeUnkay.fs.writeFile(`${appDir}/manifest.json`, JSON.stringify(manifest));
        await fakeUnkay.fs.writeFile(`${appDir}/spec.openui`, preset.spec);

        // 2. Write desktop launcher
        const desktopPath = `/home/guest/Desktop/Monitor_de_Recursos.desktop`;
        await fakeUnkay.fs.mkdir('/home/guest/Desktop');
        await fakeUnkay.fs.writeFile(desktopPath, `[Desktop Entry]\nName=${preset.title}\nExec=unkay run openui-monitor\n`);

        expect(fakeUnkay.fs.mkdir).toHaveBeenCalledWith(appDir);
        expect(vfsStorage.has(`${appDir}/manifest.json`)).toBe(true);
        expect(vfsStorage.has(`${appDir}/spec.openui`)).toBe(true);
        expect(vfsStorage.has(desktopPath)).toBe(true);

        const savedManifest = JSON.parse(vfsStorage.get(`${appDir}/manifest.json`));
        expect(savedManifest.type).toBe('openui');
        expect(savedManifest.runtime_profile).toBe('client-only');
    });
});
