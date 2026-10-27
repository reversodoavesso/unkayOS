// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PackageManager } from '../core/sdk/PackageManager.js';
import { AppPackageLoader, compareVersions } from '../core/sdk/AppPackageLoader.js';
import StoreApp from '../apps/store/main.js';

const manifest = (overrides = {}) => ({ id: 'notes-test', name: 'Anotações', version: '1.0.0', type: 'openui',
    runtime_profile: 'client-only', required_tier: 'guest', category: 'productivity', permissions: ['storage:local'], ...overrides });
const bundle = (overrides = {}) => ({ format: 'unkayapp-v1', manifest: manifest(overrides), files: { 'spec.openui': '<h3>Notas pessoais</h3>' } });
const remote = (overrides = {}) => ({ id: 'app-notes-test', status: 'approved', manifest: manifest(), installation: { available: true }, ...overrides });

function memoryFs() {
    const tree = new Map();
    return {
        tree,
        exists: vi.fn(async path => tree.has(path)),
        readText: vi.fn(async path => { if (!tree.has(path)) throw new Error('ENOENT'); return tree.get(path); }),
        writeFile: vi.fn(async (path, data) => tree.set(path, data)),
        mkdir: vi.fn(async path => { let current = ''; for (const part of path.split('/').filter(Boolean)) { current += '/' + part; if (!tree.has(current)) tree.set(current, null); } }),
        list: vi.fn(async path => [...tree.keys()].filter(key => key.startsWith(path + '/') && !key.slice(path.length + 1).includes('/')).map(key => ({ name: key.slice(path.length + 1) }))),
        remove: vi.fn(async path => { for (const key of [...tree.keys()]) if (key === path || key.startsWith(path + '/')) tree.delete(key); }),
        flush: vi.fn(async () => {})
    };
}

describe('Package manager inventory, installation and runtime rules', () => {
    let fs, appManager, auth, fetcher, manager;
    beforeEach(() => {
        fs = memoryFs();
        appManager = { loadedAppDetails: new Map([['openui', { id: 'openui', app_name: 'OpenUI Studio', mode: 'system_window' }]]),
            runningApps: new Map(), runApp: vi.fn(async () => 'instance'), stopApp: vi.fn(async () => {}) };
        auth = { getTier: vi.fn(() => 'guest'), getToken: vi.fn(() => null) };
        fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, apps: [remote()] }) }));
        manager = new PackageManager({ fs, appManager, auth, fetcher });
    });

    it('deduplicates the bundled Studio using the package ID and protects system apps', async () => {
        fetcher.mockResolvedValue({ ok: true, json: async () => ({ success: true, apps: [remote({ id: 'app-openui-studio', builtInAppId: 'openui', manifest: manifest({ id: 'openui-studio' }) })] }) });
        await manager.refresh();
        expect(manager.list()).toHaveLength(1);
        expect(manager.getStatus('openui')).toMatchObject({ state: 'system', installed: true, canOpen: true, canUninstall: false });
        await expect(manager.uninstall('openui')).rejects.toThrow();
        await expect(manager.installLocal(bundle({ id: 'openui' }))).rejects.toThrow('protegidos');
        expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('installs a real package, restores it after reload, and removes code while preserving data', async () => {
        await manager.installLocal(bundle());
        const config = appManager.loadedAppDetails.get('notes-test');
        expect(config).toMatchObject({ packageId: 'notes-test', jsFile: '/core/sdk/InstalledPackageApp.js' });
        await fs.writeFile('/home/user/apps/notes-test/data/notes.txt', 'Minha nota');
        const restored = new PackageManager({ fs, appManager, auth, fetcher });
        await restored.refresh({ catalog: false });
        expect(restored.getStatus('notes-test')).toMatchObject({ installed: true, canOpen: true, installedVersion: '1.0.0' });
        expect((await restored.loadInstalled('notes-test')).source).toContain('Notas pessoais');
        await restored.open('notes-test');
        expect(appManager.runApp).toHaveBeenCalledWith('notes-test');
        appManager.runningApps.set('instance', { CORE: { id: 'notes-test' } });
        await restored.uninstall('notes-test');
        expect(appManager.stopApp).toHaveBeenCalledWith('instance');
        expect(appManager.loadedAppDetails.has('notes-test')).toBe(false);
        expect(await fs.readText('/home/user/apps/notes-test/data/notes.txt')).toBe('Minha nota');
        await restored.refresh({ catalog: false });
        expect(restored.getStatus('notes-test').installed).toBe(false);
    });

    it('detects the old manifest-only installer as incomplete instead of runnable', async () => {
        await fs.mkdir('/home/user/apps/app-notes-test');
        await fs.writeFile('/home/user/apps/app-notes-test/manifest.json', JSON.stringify(remote()));
        await manager.refresh();
        expect(manager.list().filter(app => app.id === 'notes-test')).toHaveLength(1);
        expect(manager.getStatus('notes-test')).toMatchObject({ state: 'incomplete', canOpen: false, canUninstall: true, canUpdate: true });
        expect(appManager.loadedAppDetails.has('notes-test')).toBe(false);
    });

    it('migrates Studio packages saved with package.json and spec.openui', async () => {
        await fs.mkdir('/home/user/apps/notes-test');
        await fs.writeFile('/home/user/apps/notes-test/package.json', JSON.stringify(manifest()));
        await fs.writeFile('/home/user/apps/notes-test/spec.openui', '<p>Legado</p>');
        await manager.refresh({ catalog: false });
        expect(manager.getStatus('notes-test').canOpen).toBe(true);
    });

    it('keeps the inventory usable when a local manifest has corrupt metadata', async () => {
        await fs.mkdir('/home/user/apps/corrupt-test');
        await fs.writeFile('/home/user/apps/corrupt-test/manifest.json', JSON.stringify({ id: 'corrupt-test', name: {} }));
        await manager.refresh({ catalog: false });
        expect(manager.list().find(app => app.id === 'corrupt-test')).toMatchObject({ name: 'corrupt-test', state: 'incomplete', canUninstall: true });
    });

    it.each([
        { required_tier: 'sysadmin' }, { type: 'native', entrypoint: 'main.js' }, { runtime_profile: 'containerized' },
        { permissions: ['compute:websocket'] }, { external_providers: ['spotify'] }
    ])('enforces compatibility in the API itself: %j', async override => {
        fetcher.mockResolvedValue({ ok: true, json: async () => ({ success: true, apps: [remote({ manifest: manifest(override) })] }) });
        await manager.refresh();
        expect(manager.getStatus('notes-test').canInstall).toBe(false);
        await expect(manager.install('notes-test')).rejects.toThrow();
        await expect(manager.installLocal(bundle(override))).rejects.toThrow();
        expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('refuses missing payloads, malformed IDs and directory traversal before writing', async () => {
        await expect(manager.installLocal({ ...bundle(), files: {} })).rejects.toThrow('spec.openui');
        await expect(manager.installLocal(bundle({ id: '../escape' }))).rejects.toThrow('Invalid');
        expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('uses the authenticated install endpoint, verifies identity, then exposes updates', async () => {
        await manager.refresh();
        auth.getToken.mockReturnValue('session-token');
        fetcher.mockResolvedValue({ ok: true, json: async () => ({ success: true, manifest: manifest(), files: bundle().files }) });
        await manager.install('notes-test');
        expect(fetcher).toHaveBeenLastCalledWith('/api/marketplace/install', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer session-token' }), body: JSON.stringify({ appId: 'app-notes-test' }) }));
        fetcher.mockResolvedValue({ ok: true, json: async () => ({ success: true, apps: [remote({ manifest: manifest({ version: '1.10.0' }) })] }) });
        await manager.refresh();
        expect(manager.getStatus('notes-test')).toMatchObject({ updateAvailable: true, canUpdate: true });
        fetcher.mockResolvedValue({ ok: true, json: async () => ({ success: true, manifest: manifest({ id: 'another-app' }), files: bundle().files }) });
        await expect(manager.install('notes-test')).rejects.toThrow('diverge');
        expect(manager.getStatus('notes-test').installedVersion).toBe('1.0.0');
    });

    it('keeps the previous working version when an update write or persistence fails', async () => {
        await manager.installLocal(bundle());
        fs.flush.mockRejectedValueOnce(new Error('Quota exceeded'));
        await expect(manager.installLocal(bundle({ version: '2.0.0' }))).rejects.toThrow('Quota exceeded');
        await manager.refresh({ catalog: false });
        expect(manager.getStatus('notes-test')).toMatchObject({ installedVersion: '1.0.0', canOpen: true });
        await expect(manager.installLocal(bundle({ version: '0.1.0' }))).rejects.toThrow('anterior');
    });

    it('rejects tampered API payloads before committing an installation', async () => {
        const { webcrypto } = await import('node:crypto');
        await manager.refresh();
        fetcher.mockResolvedValue({ ok: true, json: async () => ({ success: true, manifest: manifest(), files: bundle().files, bundleHash: '0'.repeat(64) }) });
        vi.stubGlobal('crypto', webcrypto);
        try {
            await expect(manager.install('notes-test')).rejects.toThrow('integridade');
            expect(fs.writeFile).not.toHaveBeenCalled();
        } finally { vi.unstubAllGlobals(); }
    });

    it('does not allow concurrent writes for the same application', async () => {
        let release;
        fs.flush.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
        const first = manager.installLocal(bundle());
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        await expect(manager.installLocal(bundle())).rejects.toThrow('andamento');
        release(); await first;
    });

    it('shows catalog outages while keeping installed applications usable', async () => {
        await manager.installLocal(bundle());
        fetcher.mockRejectedValue(new Error('Network offline'));
        await manager.refresh();
        expect(manager.catalogError).toContain('indisponível');
        expect(manager.getStatus('notes-test').canOpen).toBe(true);
    });

    it('rechecks access before launching an installed app', async () => {
        auth.getTier.mockReturnValue('sysadmin');
        await manager.installLocal(bundle({ required_tier: 'sysadmin' }));
        auth.getTier.mockReturnValue('guest');
        await expect(manager.open('notes-test')).rejects.toThrow('indisponível');
        await expect(manager.loadInstalled('notes-test')).rejects.toThrow('perfil');
    });
});

describe('Manifest versions and Store UI', () => {
    it('validates default native entrypoints, arrays and SemVer prereleases', () => {
        expect(AppPackageLoader.validateManifest({ ...manifest(), type: undefined }).valid).toBe(false);
        expect(AppPackageLoader.validateManifest(manifest({ permissions: {} })).valid).toBe(false);
        expect(AppPackageLoader.validateManifest(manifest({ version: '1.0.0-01' })).valid).toBe(false);
        expect(AppPackageLoader.validateManifest(manifest({ version: '1.0.0-alpha.1+build.3' })).valid).toBe(true);
        expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
        expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBe(1);
        expect(compareVersions('1.0.0-beta.10', '1.0.0-beta.9')).toBe(1);
    });

    it('renders actual statuses, escapes catalog content, filters categories and manages detail focus', async () => {
        const fs = memoryFs(), appManager = { loadedAppDetails: new Map(), runningApps: new Map(), runApp: vi.fn() };
        const auth = { getTier: () => 'guest', getToken: () => null };
        const manager = new PackageManager({ fs, appManager, auth, fetcher: async () => ({ ok: true, json: async () => ({ success: true, apps: [remote({ manifest: manifest({ name: '<img src=x onerror=alert(1)>', category: 'audio' }), installation: { available: false, reason: 'Conteúdo não publicado' } })] }) }) });
        const sdk = { auth, packages: { list: () => manager.list(), refresh: () => manager.refresh(), subscribe: listener => manager.subscribe(listener), getCatalogError: () => manager.catalogError } };
        const root = document.createElement('div'); document.body.append(root);
        root.innerHTML = readFileSync('apps/store/index.html', 'utf8');
        const app = new StoreApp({ app_name: 'Store' }, { unkaySDK: sdk }); app.appContentRoot = root;
        await app.onRun();
        expect(root.querySelector('img')).toBeNull();
        expect(root.querySelector('[data-action="blocked"]').disabled).toBe(true);
        expect(root.querySelector('.card-reason').textContent).toContain('Conteúdo não publicado');
        root.querySelector('[data-action="details"]').click();
        expect(root.querySelector('[role="dialog"]').hidden).toBe(false);
        expect(document.activeElement.id).toBe('modalCloseBtn');
        root.querySelector('[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(root.querySelector('[role="dialog"]').hidden).toBe(true);
        root.querySelector('#categoryFilter').value = 'media';
        root.querySelector('#categoryFilter').dispatchEvent(new Event('change'));
        expect(root.querySelector('.empty-state').textContent).toContain('Nenhum');
        app.onCleanup(); expect(manager.listeners.size).toBe(0); root.remove();
    });
});
