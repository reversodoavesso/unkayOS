// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AppFeatureRegistry, defineAppFeature } from '../core/apps/index.js';
import { AppManager } from '../core/AppManager.js';
import eventBus from '../core/eventBus.js';

function createStorage() {
    const values = new Map();
    return {
        getItem: key => (values.has(key) ? values.get(key) : null),
        setItem: (key, value) => values.set(key, String(value))
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('app feature registry', () => {
    it('validates definitions', () => {
        expect(() => defineAppFeature({ id: 'Bad Id' })).toThrow(/Invalid app feature id/);
        expect(() => defineAppFeature({ id: 'ok', requires: 'auth' })).toThrow(/array/);
        expect(() => defineAppFeature({ id: 'ok', enabled: 'yes' })).toThrow(/boolean/);
    });

    it('tracks enabled state, requirements and persistence', () => {
        const storage = createStorage();
        const registry = new AppFeatureRegistry({
            storage,
            isCapabilityAvailable: capability => capability === 'auth'
        });
        registry.register(
            { id: 'terminal', path: '/apps/terminal/', requires: ['auth', 'packages'], optionalRequires: ['ai'] },
            { id: 'clock', path: '/apps/clock/' },
            { id: 'legacy', enabled: false }
        );

        expect(registry.isEnabled('terminal')).toBe(true);
        expect(registry.isEnabled('legacy')).toBe(false);
        expect(registry.isEnabled('unknown')).toBe(true); // legacy compatibility
        expect(registry.missingRequirements('terminal')).toEqual(['packages']);
        expect(registry.isAvailable('terminal')).toBe(false);
        expect(registry.isAvailable('clock')).toBe(true);

        registry.setEnabled('terminal', false);
        expect(registry.isEnabled('terminal')).toBe(false);
        expect(JSON.parse(storage.getItem('unkay_app_features'))).toEqual({ terminal: false });

        const restored = new AppFeatureRegistry({ storage });
        restored.register({ id: 'terminal', requires: ['auth'] });
        expect(restored.isEnabled('terminal')).toBe(false);
    });

    it('notifies subscribers and exposes a diagnostic list', () => {
        const registry = new AppFeatureRegistry({ isCapabilityAvailable: () => true });
        registry.register({ id: 'one', requires: ['fs'] }, { id: 'two' });
        const listener = vi.fn();
        const unsubscribe = registry.subscribe(listener);

        registry.setEnabled('one', false);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener.mock.calls[0][0].find(item => item.id === 'one')).toMatchObject({
            enabled: false,
            available: false
        });

        unsubscribe();
        registry.setEnabled('two', false);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('rejects unknown ids and duplicate registration', () => {
        const registry = new AppFeatureRegistry().register({ id: 'one' });
        expect(() => registry.setEnabled('missing', true)).toThrow(/Unknown app feature/);
        expect(() => registry.register({ id: 'one' })).toThrow(/already registered/);
    });

    it('supports locked apps, optional requirements and unregistration', () => {
        const registry = new AppFeatureRegistry({
            isCapabilityAvailable: capability => capability === 'auth'
        }).register(
            { id: 'core', locked: true },
            { id: 'terminal', requires: ['auth'], optionalRequires: ['ai', 'packages'] }
        );

        expect(() => registry.setEnabled('core', false)).toThrow(/locked/);
        expect(registry.setEnabled('core', true)).toBe(true);
        expect(registry.list().find(item => item.id === 'core')).toMatchObject({ locked: true });
        expect(registry.missingOptionalRequirements('terminal')).toEqual(['ai', 'packages']);
        expect(registry.list().find(item => item.id === 'terminal').missingOptionalRequirements)
            .toEqual(['ai', 'packages']);

        expect(registry.unregister('terminal')).toBe(true);
        expect(registry.has('terminal')).toBe(false);
        expect(registry.unregister('terminal')).toBe(false);
    });
});

describe('AppManager integration with app features', () => {
    it('only loads enabled apps', async () => {
        const registry = new AppFeatureRegistry().register(
            { id: 'enabled-app' },
            { id: 'disabled-app', enabled: false }
        );
        const fetchMock = vi.fn(async url => ({
            ok: true,
            json: async () => ({ app_name: String(url), mode: 'system_window' })
        }));
        vi.stubGlobal('fetch', fetchMock);

        const manager = new AppManager(document.body, null, [
            { id: 'enabled-app', path: '/apps/enabled/' },
            { id: 'disabled-app', path: '/apps/disabled/' }
        ], { appFeatureRegistry: registry });

        await manager.loadAppConfigs();

        expect(manager.loadedAppDetails.has('enabled-app')).toBe(true);
        expect(manager.loadedAppDetails.has('disabled-app')).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('blocks disabled apps and reports missing requirements on launch', async () => {
        const registry = new AppFeatureRegistry({
            isCapabilityAvailable: capability => capability === 'auth'
        }).register(
            { id: 'disabled-app', enabled: false },
            { id: 'needs-packages', requires: ['packages'] },
            { id: 'ready-app', requires: ['auth'] }
        );
        const manager = new AppManager(document.body, null, [], { appFeatureRegistry: registry });
        manager.loadedAppDetails.set('disabled-app', { id: 'disabled-app', app_name: 'Disabled', mode: 'system_window' });
        manager.loadedAppDetails.set('needs-packages', { id: 'needs-packages', app_name: 'Needs', mode: 'system_window' });
        manager.loadedAppDetails.set('ready-app', { id: 'ready-app', app_name: 'Ready', mode: 'system_window' });

        const errors = [];
        const listener = payload => errors.push(payload);
        eventBus.on('app:start:error', listener);

        try {
            await expect(manager.runApp('disabled-app')).resolves.toBeNull();
            await expect(manager.runApp('needs-packages')).resolves.toBeNull();

            expect(errors).toEqual([
                { appId: 'disabled-app', reason: 'disabled' },
                { appId: 'needs-packages', reason: 'missing_requirements', missing: ['packages'] }
            ]);
            // The guard is purely declarative: a satisfied app remains available.
            expect(registry.isAvailable('ready-app')).toBe(true);
        } finally {
            eventBus.off('app:start:error', listener);
        }
    });

    it('reports optional capabilities without blocking availability', () => {
        const registry = new AppFeatureRegistry({
            isCapabilityAvailable: capability => capability === 'auth'
        }).register({ id: 'terminal', requires: ['auth'], optionalRequires: ['ai', 'packages'] });
        const manager = new AppManager(document.body, null, [], { appFeatureRegistry: registry });

        expect(manager.checkAppAvailability('terminal')).toEqual({
            ok: true,
            missingOptional: ['ai', 'packages']
        });
    });

    it('syncs enabled and disabled apps without a reload', async () => {
        const registry = new AppFeatureRegistry().register(
            { id: 'enabled-app' },
            { id: 'disabled-app', enabled: false }
        );
        const fetchMock = vi.fn(async url => ({
            ok: true,
            json: async () => ({ app_name: String(url), mode: 'system_window' })
        }));
        vi.stubGlobal('fetch', fetchMock);

        const manager = new AppManager(document.body, null, [
            { id: 'enabled-app', path: '/apps/enabled/' },
            { id: 'disabled-app', path: '/apps/disabled/' }
        ], { appFeatureRegistry: registry });

        await manager.loadAppConfigs();
        expect(manager.loadedAppDetails.has('disabled-app')).toBe(false);

        const events = [];
        const listener = payload => events.push(payload);
        eventBus.on('apps:catalog:changed', listener);
        manager.loadedAppDetails.set('installed-pkg', { id: 'installed-pkg', packageId: 'installed-pkg' });

        try {
            registry.setEnabled('disabled-app', true);
            await expect(manager.syncAppFeatures()).resolves.toEqual({
                added: ['disabled-app'],
                removed: []
            });
            expect(manager.loadedAppDetails.has('disabled-app')).toBe(true);

            registry.setEnabled('enabled-app', false);
            await expect(manager.syncAppFeatures()).resolves.toEqual({
                added: [],
                removed: ['enabled-app']
            });
            expect(manager.loadedAppDetails.has('enabled-app')).toBe(false);
            // Installed packages are not part of apps.json and must survive syncs.
            expect(manager.loadedAppDetails.has('installed-pkg')).toBe(true);

            expect(events).toHaveLength(2);
            expect(events[1]).toMatchObject({ removed: ['enabled-app'] });
        } finally {
            eventBus.off('apps:catalog:changed', listener);
        }
    });

    it('serializes concurrent syncs so the final state wins', async () => {
        const registry = new AppFeatureRegistry().register({ id: 'app', enabled: false });
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({ app_name: 'App', mode: 'system_window' })
        })));
        const manager = new AppManager(document.body, null, [
            { id: 'app', path: '/apps/app/' }
        ], { appFeatureRegistry: registry });
        await manager.loadAppConfigs();

        registry.setEnabled('app', true);
        const first = manager.syncAppFeatures();
        registry.setEnabled('app', false);
        const second = manager.syncAppFeatures();

        await Promise.all([first, second]);
        expect(manager.loadedAppDetails.has('app')).toBe(false);
    });
});
