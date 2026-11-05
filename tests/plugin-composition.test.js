// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { Kernel } from '../core/kernel/index.js';
import { createDeployment } from '../core/host/config/deployment.js';
import { planPlugins, composePlugins } from '../core/host/plugins/compose.js';
import { pluginCatalog } from '../core/host/plugins/catalog.js';
import { createGuestAuthSystem } from '../core/host/guestAuth.js';
import { createUnkayosFeatures } from '../core/host/unkayosFeatures.js';
import { createUnkaySDK } from '../core/sdk/unkay.js';

const config = () => JSON.parse(JSON.stringify(createDeployment()));
const logger = { info() {}, warn() {}, error() {}, debug() {} };

describe('plugin composition', () => {
    it('binds local providers, applies deny-by-default and destroys them on stop', async () => {
        const features = await composePlugins(config(), pluginCatalog);
        const kernel = new Kernel({ logger }).register(features);
        await kernel.start();
        expect(kernel.get('authSystem')).toBe(kernel.get('account.identity'));
        const policy = kernel.get('accessPolicy');
        expect(policy.evaluate('files.local.read').allowed).toBe(true);
        expect(policy.evaluate('compute.session.create').allowed).toBe(false);
        expect(policy.evaluate('settings.installation.manage').allowed).toBe(false);
        const auth = kernel.get('authSystem');
        const listener = vi.fn();
        auth.on('change', listener);
        await kernel.stop();
        auth.emit('change');
        expect(listener).not.toHaveBeenCalled();
    });

    it('validates every config before loading even the first plugin', async () => {
        const load = vi.fn(pluginCatalog['unkayos.local-identity'].load);
        const catalog = { ...pluginCatalog, 'unkayos.local-identity': { ...pluginCatalog['unkayos.local-identity'], load } };
        const deployment = config();
        deployment.instances.policy.config = { unexpected: 'secret-value' };
        await expect(composePlugins(deployment, catalog)).rejects.toMatchObject({ code: 'PLUGIN_CONFIG_INVALID' });
        expect(load).not.toHaveBeenCalled();
    });

    it.each(['unknown', 'version', 'binding', 'disabled'])('rejects %s without evaluating modules', async kind => {
        const load = vi.fn();
        const catalog = { ...pluginCatalog, 'unkayos.local-identity': { ...pluginCatalog['unkayos.local-identity'], load } };
        const deployment = config();
        if (kind === 'unknown') deployment.instances.account.plugin = 'unknown.identity';
        if (kind === 'version') catalog['unkayos.local-identity'].manifest = { ...catalog['unkayos.local-identity'].manifest, hostApi: 2 };
        if (kind === 'binding') deployment.bindings.identity = 'policy.access';
        if (kind === 'disabled') deployment.instances.account.enabled = false;
        await expect(composePlugins(deployment, catalog)).rejects.toBeInstanceOf(Error);
        expect(load).not.toHaveBeenCalled();
    });

    it('does not import a disabled unbound plugin', async () => {
        const load = vi.fn();
        const deployment = config();
        deployment.instances.extra = { plugin: 'unkayos.injected-identity', enabled: false, config: {} };
        const catalog = { ...pluginCatalog, 'unkayos.injected-identity': { ...pluginCatalog['unkayos.injected-identity'], load } };
        await composePlugins(deployment, catalog);
        expect(load).not.toHaveBeenCalled();
    });

    it('rejects missing injected identity before importing any plugin', async () => {
        const load = vi.fn();
        const catalog = { ...pluginCatalog, 'unkayos.local-access': { ...pluginCatalog['unkayos.local-access'], load } };
        await expect(composePlugins(createDeployment('sso'), catalog)).rejects.toThrow(/identityProvider/);
        expect(load).not.toHaveBeenCalled();
    });

    it('rejects dependency cycles before imports', () => {
        const catalog = { ...pluginCatalog, 'unkayos.local-identity': {
            ...pluginCatalog['unkayos.local-identity'],
            manifest: { ...pluginCatalog['unkayos.local-identity'].manifest, requires: ['identity'] }
        } };
        expect(() => planPlugins(config(), catalog)).toThrow(/Ciclo/);
    });

    it('supports multiple identity instances with exactly one public binding', async () => {
        const deployment = config();
        deployment.instances.second = { plugin: 'unkayos.local-identity', config: {} };
        deployment.bindings.identity = 'second.identity';
        const kernel = new Kernel({ logger }).register(await composePlugins(deployment, pluginCatalog));
        await kernel.start();
        expect(kernel.get('authSystem')).toBe(kernel.get('second.identity'));
        expect(kernel.get('authSystem')).not.toBe(kernel.get('account.identity'));
        await kernel.stop();
    });

    it('cleans an injected provider when readiness fails and rolls back the kernel', async () => {
        const destroy = vi.fn();
        const provider = { ...createGuestAuthSystem(), destroy, ready: Promise.resolve() };
        // Reject when the kernel actually awaits readiness, without an unhandled rejection.
        Object.defineProperty(provider, 'ready', { get: () => Promise.reject(new Error('session invalid')) });
        const deployment = createDeployment('sso');
        const features = await composePlugins(deployment, pluginCatalog, { identityProvider: () => provider });
        const kernel = new Kernel({ logger }).register(features);
        await expect(kernel.start()).rejects.toThrow('session invalid');
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(kernel.describe().capabilities).toEqual([]);
    });

    it('rejects providers that do not satisfy the identity contract', async () => {
        const destroy = vi.fn();
        const kernel = new Kernel({ logger }).register(await composePlugins(createDeployment('sso'), pluginCatalog, {
            identityProvider: () => ({ destroy })
        }));
        await expect(kernel.start()).rejects.toMatchObject({ code: 'PLUGIN_CONTRACT_INVALID' });
        expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('rejects a provider missing session events before it reaches workspace consumers', async () => {
        const provider = createGuestAuthSystem();
        delete provider.on;
        const kernel = new Kernel({ logger }).register(await composePlugins(createDeployment('sso'), pluginCatalog, {
            identityProvider: () => provider
        }));
        await expect(kernel.start()).rejects.toMatchObject({ code: 'PLUGIN_CONTRACT_INVALID' });
        expect(kernel.describe().capabilities).toEqual([]);
    });

    it('routes the actual host identity through bindings, without a duplicate auth feature', async () => {
        const features = await createUnkayosFeatures({ deployment: createDeployment(), getDesktop: () => document.body, systemManager: { hasCapability: () => true } });
        expect(features.filter(feature => feature.provides.includes('authSystem'))).toHaveLength(1);
        expect(features.some(feature => feature.id === 'plugin-account')).toBe(true);
        expect(() => new Kernel({ logger }).register(features)).not.toThrow();
    });

    it('SDK exposes decisions and blocks disabled sync without emitting network traffic', async () => {
        const transport = vi.fn();
        vi.stubGlobal('fetch', transport);
        try {
            const sdk = createUnkaySDK(null, { getSystem: () => null }, { syncEnabled: false, aiEnabled: false });
            expect(await sdk.access.can('compute.session.create')).toBe(false);
            await expect(sdk.fs.syncCloud()).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' });
            await expect(sdk.ai.prompt([])).rejects.toThrow(/IA não disponível/);
            expect(transport).not.toHaveBeenCalled();
        } finally { vi.unstubAllGlobals(); }
    });
});
