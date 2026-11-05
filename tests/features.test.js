import { describe, it, expect, vi } from 'vitest';
import { Kernel } from '../core/kernel/index.js';
import {
    createMemoryStorage,
    createKv,
    createAuth,
    mapUserTier,
    createFs,
    createAi,
    createPackages,
    createWindow,
    createContextMenu,
    createShortcuts,
    registerCoreFeatures,
    coreFeatures
} from '../core/features/index.js';

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

describe('kv feature', () => {
    it('serializes values and isolates namespaces', async () => {
        const storage = createMemoryStorage();
        const notes = createKv({ storage, namespace: 'notes' });
        const chat = createKv({ storage, namespace: 'chat' });

        await notes.set('fontSize', 16);
        await notes.set('theme', { mode: 'dark' });
        await chat.set('fontSize', 'other');

        expect(await notes.get('fontSize')).toBe(16);
        expect(await notes.get('theme')).toEqual({ mode: 'dark' });
        expect(await chat.get('fontSize')).toBe('other');
        expect(await notes.get('missing')).toBeNull();

        await notes.remove('fontSize');
        expect(await notes.get('fontSize')).toBeNull();
    });

    it('falls back to an in-memory backend', async () => {
        const kv = createKv({ namespace: 'isolated' });
        await kv.set('answer', 42);
        expect(await kv.get('answer')).toBe(42);
    });
});

describe('auth feature', () => {
    it('does not interpret provider roles or claims without an explicit policy', () => {
        expect(mapUserTier(null)).toBe('guest');
        expect(mapUserTier({ roles: ['demiurge'] })).toBe('standard');
        expect(mapUserTier({ roles: { sysadmin: {} } })).toBe('standard');
        expect(mapUserTier({ roles: ['weaver'] })).toBe('standard');
        expect(mapUserTier({ roles: ['standard'] })).toBe('standard');
        expect(mapUserTier({})).toBe('standard');
    });

    it('delegates session operations to the provider', async () => {
        const provider = {
            getCurrentUser: vi.fn(() => ({ roles: ['archon'] })),
            getAuthToken: vi.fn(() => 'token'),
            login: vi.fn(async () => 'logged'),
            logout: vi.fn(async () => 'out')
        };
        const auth = createAuth({ provider, mapTier: user => user ? 'custom-tier' : 'guest' });

        expect(auth.getUser()).toEqual({ roles: ['archon'] });
        expect(auth.getToken()).toBe('token');
        expect(auth.getTier()).toBe('custom-tier');
        await expect(auth.login()).resolves.toBe('logged');
        await expect(auth.logout()).resolves.toBe('out');
    });

    it('returns safe defaults without a provider', async () => {
        const auth = createAuth();
        expect(auth.getUser()).toBeNull();
        expect(auth.getToken()).toBeNull();
        expect(auth.getTier()).toBe('guest');
        await expect(auth.login()).resolves.toBeUndefined();
    });
});

describe('fs feature', () => {
    it('normalizes adapter calls', async () => {
        const adapter = {
            flush: vi.fn(),
            readFile: vi.fn(async (path, options) => ({ path, options })),
            writeFile: vi.fn(),
            readdir: vi.fn(async () => ['a']),
            stat: vi.fn(),
            exists: vi.fn(() => true),
            mkdir: vi.fn(),
            remove: vi.fn()
        };
        const fs = createFs({ adapter, syncCloud: async () => 'synced' });

        await fs.flush();
        expect(await fs.readFile('/a')).toEqual({ path: '/a', options: { encoding: 'binary' } });
        expect(await fs.readText('/a')).toEqual({ path: '/a', options: { encoding: 'utf8' } });
        expect(await fs.list('/')).toEqual(['a']);
        expect(fs.exists('/a')).toBe(true);
        await fs.mkdir('/dir');
        expect(adapter.mkdir).toHaveBeenCalledWith('/dir', { recursive: true });
        await fs.remove('/dir', true);
        expect(adapter.remove).toHaveBeenCalledWith('/dir', { recursive: true });
        await expect(fs.syncCloud()).resolves.toBe('synced');
        await expect(fs.mountLocalDirectory()).rejects.toThrow(/not available/);
    });

    it('requires an adapter', () => {
        expect(() => createFs()).toThrow(/adapter/);
    });
});

describe('ai feature', () => {
    it('delegates messages, callbacks and cancellation to an injected adapter', async () => {
        const adapter = { prompt: vi.fn(async () => 'hello'), stream: vi.fn(async () => {}) };
        const ai = createAi({ adapter });
        const messages = [{ role: 'user', content: 'hi' }];
        const options = { signal: new AbortController().signal };
        const onChunk = vi.fn();
        await expect(ai.prompt(messages, options)).resolves.toBe('hello');
        await ai.stream(messages, onChunk, options);
        expect(adapter.prompt).toHaveBeenCalledWith(messages, options);
        expect(adapter.stream).toHaveBeenCalledWith(messages, onChunk, options);
    });

    it('never discovers a transport or service implicitly', async () => {
        const ai = createAi();
        await expect(ai.prompt([])).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' });
    });

    it('preserves errors raised by a provider', async () => {
        const error = Object.assign(new Error('denied'), { code: 'FORBIDDEN' });
        const ai = createAi({ adapter: { prompt: async () => { throw error; } } });
        await expect(ai.prompt([])).rejects.toBe(error);
    });
});

describe('packages feature', () => {
    it('delegates to the injected manager', async () => {
        const manager = {
            list: vi.fn(() => ['pkg']),
            getStatus: vi.fn(() => 'installed'),
            refresh: vi.fn(),
            install: vi.fn(),
            installLocal: vi.fn(),
            uninstall: vi.fn(),
            open: vi.fn(),
            subscribe: vi.fn(),
            catalogError: 'offline'
        };
        const packages = createPackages({ manager });

        expect(packages.list()).toEqual(['pkg']);
        expect(packages.status('pkg')).toBe('installed');
        expect(packages.getCatalogError()).toBe('offline');
        packages.subscribe(() => {});
        expect(manager.subscribe).toHaveBeenCalled();
    });

    it('reports a missing manager with the canonical message', () => {
        const packages = createPackages();
        expect(() => packages.list()).toThrow('Gerenciador de pacotes indisponível.');
    });
});

describe('window feature', () => {
    it('delegates controls and coerces fullscreen to boolean', async () => {
        const controller = {
            setTitle: vi.fn(),
            setSize: vi.fn(),
            minimize: vi.fn(),
            maximize: vi.fn(),
            snap: vi.fn(),
            center: vi.fn(),
            close: vi.fn(),
            toggleFullscreen: vi.fn(async () => true),
            isFullscreen: vi.fn(() => undefined)
        };
        const windowApi = createWindow({ controller });

        windowApi.setTitle('Title');
        windowApi.setSize(10, 20);
        windowApi.minimize();
        windowApi.maximize();
        windowApi.snap('left');
        windowApi.center();
        windowApi.close();
        await expect(windowApi.toggleFullscreen()).resolves.toBe(true);
        expect(windowApi.isFullscreen()).toBe(false);
        expect(controller.setTitle).toHaveBeenCalledWith('Title');
        expect(controller.setSize).toHaveBeenCalledWith(10, 20);
    });

    it('is safe without a controller', () => {
        const windowApi = createWindow();
        expect(() => windowApi.close()).not.toThrow();
        expect(windowApi.isFullscreen()).toBe(false);
    });
});

describe('context menu and shortcuts features', () => {
    it('falls back to a no-op disposer and empty shortcut list', () => {
        const contextMenu = createContextMenu();
        expect(typeof contextMenu.register('selector')).toBe('function');
        const shortcuts = createShortcuts();
        expect(shortcuts.listSystemShortcuts()).toEqual([]);
    });

    it('delegates to providers when present', () => {
        const provider = {
            register: vi.fn(() => 'dispose'),
            open: vi.fn(() => 'opened'),
            close: vi.fn(() => 'closed')
        };
        const contextMenu = createContextMenu({ provider });
        expect(contextMenu.register('target', 'builder')).toBe('dispose');
        expect(contextMenu.open(['item'], { x: 1 })).toBe('opened');
        expect(contextMenu.close()).toBe('closed');

        const shortcuts = createShortcuts({ keyboard: { getSystemShortcuts: () => ['Ctrl+K'] } });
        expect(shortcuts.listSystemShortcuts()).toEqual(['Ctrl+K']);
    });
});

describe('core feature set', () => {
    it('starts every built-in feature through the kernel', async () => {
        const kernel = new Kernel({
            logger: silentLogger,
            config: {
                fs: {
                    adapter: {
                        flush() {},
                        readFile() {},
                        writeFile() {},
                        readdir() {},
                        stat() {},
                        exists() {},
                        mkdir() {},
                        remove() {}
                    }
                }
            }
        });
        registerCoreFeatures(kernel);

        expect(coreFeatures).toHaveLength(kernel.describe().features.length);

        await kernel.start();

        for (const capability of ['kv', 'auth', 'fs', 'ai', 'packages', 'window', 'context-menu', 'shortcuts']) {
            expect(kernel.has(capability)).toBe(true);
        }

        await kernel.stop();
        expect(kernel.state).toBe('idle');
    });
});
