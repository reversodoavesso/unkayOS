// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { SystemManager } from '../core/SystemManager.js';
import { createUnkayosFeatures } from '../core/host/unkayosFeatures.js';
import { Kernel, defineFeature } from '../core/kernel/index.js';

describe('SystemManager kernel boot', () => {
    it('declares a consistent host feature catalog', async () => {
        const features = await createUnkayosFeatures({
            profile: 'rda',
            getDesktop: () => document.body,
            systemManager: { systems: {}, kernel: null }
        });

        const kernel = new Kernel();
        kernel.register(features);

        const ids = features.map(feature => feature.id);
        expect(ids).toEqual(expect.arrayContaining([
            'events',
            'wasm-vfs',
            'auth',
            'app-catalog',
            'app-features',
            'app-manager',
            'packages',
            'shell'
        ]));

        const capabilities = features.flatMap(feature => feature.provides);
        expect(capabilities).toEqual(expect.arrayContaining([
            'eventBus',
            'authSystem',
            'appManager',
            'appFeatureRegistry',
            'packageManager',
            'shellRuntime'
        ]));
        expect(new Set(capabilities).size).toBe(capabilities.length);
    });

    it('starts injected features and keeps the getSystem compatibility layer', async () => {
        const bus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
        const featureFactory = vi.fn(() => [
            defineFeature({
                id: 'test-events',
                provides: ['eventBus'],
                setup: () => ({ eventBus: bus })
            }),
            defineFeature({
                id: 'test-custom',
                provides: ['customThing'],
                requires: ['eventBus'],
                setup: () => ({ customThing: { value: 7 } })
            })
        ]);
        const manager = new SystemManager({ featureFactory });

        expect(manager.getSystem('customThing')).toBeNull();

        await manager.initialize(document.body);

        expect(manager.isInitialized).toBe(true);
        expect(manager.getSystem('customThing')).toEqual({ value: 7 });
        expect(manager.getAllSystems().customThing).toEqual({ value: 7 });
        expect(manager.hasCapability('customThing')).toBe(true);
        expect(bus.emit).toHaveBeenCalledWith(
            'system:ready',
            expect.objectContaining({ systems: expect.any(Array) })
        );

        const stats = manager.getSystemStats();
        expect(stats.kernel.state).toBe('running');
        expect(stats.kernel.features.map(feature => feature.id)).toEqual(['test-events', 'test-custom']);

        await manager.shutdown();

        expect(manager.isInitialized).toBe(false);
        expect(manager.kernel.state).toBe('idle');
        expect(manager.getSystem('customThing')).toBeNull();
    });

    it('is idempotent while initializing', async () => {
        const featureFactory = vi.fn(() => [
            defineFeature({ id: 'only', provides: ['only'], setup: () => ({ only: {} }) })
        ]);
        const manager = new SystemManager({ featureFactory });

        await Promise.all([manager.initialize(document.body), manager.initialize(document.body)]);

        expect(featureFactory).toHaveBeenCalledTimes(1);
        expect(manager.isInitialized).toBe(true);
        await manager.shutdown();
    });

    it('resets initialization flags when boot fails', async () => {
        const manager = new SystemManager({
            featureFactory: () => [
                defineFeature({
                    id: 'broken',
                    provides: ['broken'],
                    setup: () => {
                        throw new Error('boot failed');
                    }
                })
            ]
        });

        await expect(manager.initialize(document.body)).rejects.toThrow('boot failed');

        expect(manager.isInitialized).toBe(false);
        expect(manager.isInitializing).toBe(false);
        expect(manager.kernel.state).toBe('idle');
    });
});
