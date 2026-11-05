// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createUnkayosFeatures, resolveProfileName } from '../core/host/unkayosFeatures.js';
import { createGuestAuthSystem } from '../core/host/guestAuth.js';
import { createUnkaySDK } from '../core/sdk/unkay.js';
import { resolveProviderInfo } from '../core/identity/provider.js';
import { Kernel } from '../core/kernel/index.js';

async function bootIdentity(features) {
    const kernel = new Kernel().register(features.filter(feature => feature.id.startsWith('plugin-') || ['auth', 'access-policy'].includes(feature.id)));
    await kernel.start();
    return { authSystem: kernel.get('authSystem'), stop: () => kernel.stop() };
}

const fakeSystemManager = hasCapability => ({
    hasCapability,
    systems: {},
    kernel: null
});

describe('host profiles', () => {
    it('uses local defaults and rejects unknown explicit profiles', () => {
        expect(resolveProfileName('standalone')).toBe('standalone');
        expect(resolveProfileName('rda')).toBe('rda');
        expect(() => resolveProfileName('unknown')).toThrow(/desconhecido/);
        expect(resolveProfileName()).toBe('standalone');
    });

    it('builds the standalone profile without SSO, marketplace or AI', async () => {
        const features = await createUnkayosFeatures({
            profile: 'standalone',
            getDesktop: () => document.body,
            systemManager: fakeSystemManager(capability => capability === 'auth')
        });
        const ids = features.map(feature => feature.id);

        expect(ids).toContain('host-profile');
        expect(ids).toContain('auth');
        expect(ids).toContain('app-features');
        expect(ids).toContain('shell');
        expect(ids).not.toContain('packages');

        const profile = features.find(feature => feature.id === 'host-profile');
        expect(profile.setup({})).toEqual({
            hostProfile: expect.objectContaining({
                id: 'standalone',
                capabilities: expect.objectContaining({ sso: false, compute: false, marketplace: false })
            })
        });

        const { authSystem, stop } = await bootIdentity(features);
        expect(authSystem.getCurrentUser()).toBeNull();
        expect(authSystem.getAuthToken()).toBeNull();
        await expect(authSystem.getAPI().authenticatedRequest('/x')).rejects.toThrow(/SSO indisponível/);
        expect(authSystem.getAPI().hasPermission('anything')).toBe(false);
        expect(authSystem.getAPI().hasPermission('files.local.read')).toBe(true);
        await stop();
    });

    it('pins RDA-only apps off in the standalone catalog', async () => {
        const features = await createUnkayosFeatures({
            profile: 'standalone',
            getDesktop: () => document.body,
            systemManager: fakeSystemManager(() => true)
        });
        const appFeatures = features.find(feature => feature.id === 'app-features');
        const configs = [
            { id: 'terminal', path: '/apps/terminal/', requires: ['auth'] },
            { id: 'user-profile', path: '/apps/user-profile/', requires: ['auth'] },
            { id: 'store', path: '/apps/store/', requires: ['packages'] }
        ];
        const context = {
            require: capability => (capability === 'appConfigs' ? configs : null),
            config: {},
            logger: { error() {} }
        };
        const { appFeatureRegistry } = await appFeatures.setup(context);

        expect(appFeatureRegistry.isEnabled('terminal')).toBe(true);
        expect(appFeatureRegistry.isEnabled('user-profile')).toBe(true);
        expect(appFeatureRegistry.isEnabled('store')).toBe(false);
        expect(appFeatureRegistry.get('store').locked).toBe(true);
        expect(() => appFeatureRegistry.setEnabled('store', true)).toThrow(/locked/);
    });

    it('builds the RDA profile with SSO and packages', async () => {
        const features = await createUnkayosFeatures({
            profile: 'rda',
            getDesktop: () => document.body,
            systemManager: fakeSystemManager(() => true)
        });
        const ids = features.map(feature => feature.id);
        expect(ids).toContain('packages');
        expect(ids).toContain('auth');
        const profile = features.find(feature => feature.id === 'host-profile');
        expect(profile.setup({})).toEqual({
            hostProfile: expect.objectContaining({
                id: 'rda',
                capabilities: expect.objectContaining({ sso: true, compute: true, marketplace: true })
            })
        });
    });

    it('exposes a guest auth system with a complete compatible surface', async () => {
        const auth = createGuestAuthSystem();
        await expect(auth.ready).resolves.toBeUndefined();
        expect(auth.getAPI().getUserPrompt()).toBe('guest@local');
        expect(auth.getAPI().isAuthenticated()).toBe(false);
        expect(auth.hasRole('demiurge')).toBe(false);
        await expect(auth.login()).resolves.toBeNull();
    });

    it('disables AI calls in the standalone SDK', async () => {
        const sdk = createUnkaySDK(null, null, { aiEnabled: false });
        await expect(sdk.ai.prompt([{ role: 'user', content: 'oi' }])).rejects.toThrow(/IA não disponível/);
    });

    it('preserves the SDK AI facade without configuring an implicit provider', () => {
        const sdk = createUnkaySDK(null, null);
        expect(typeof sdk.ai.prompt).toBe('function');
    });

    it('builds the bring-your-own-SSO profile from an injected provider', async () => {
        const fakeAuth = {
            ready: Promise.resolve(),
            getCurrentUser: () => null,
            getAuthToken: () => null,
            login: async () => null,
            logout: async () => {},
            on() {}, off() {}, destroy() {},
            getAPI: () => ({ loginLabel: 'Entrar com Acme' }),
            getProviderInfo: () => ({
                id: 'acme',
                label: 'Acme SSO',
                providerName: 'Acme',
                mode: 'sso',
                supportsLogin: true,
                supportsLogout: true,
                loginLabel: 'Entrar com Acme'
            })
        };

        const features = await createUnkayosFeatures({
            profile: 'sso',
            identityProvider: () => fakeAuth,
            getDesktop: () => document.body,
            systemManager: fakeSystemManager(() => true)
        });
        const ids = features.map(feature => feature.id);
        expect(ids).not.toContain('packages');
        expect(ids).toContain('auth');

        const { authSystem, stop } = await bootIdentity(features);
        expect(authSystem.getProviderInfo()).toMatchObject({ id: 'acme', loginLabel: 'Entrar com Acme' });

        const profile = features.find(feature => feature.id === 'host-profile');
        expect(profile.setup({}).hostProfile).toMatchObject({
            id: 'sso',
            capabilities: { sso: true, marketplace: false, compute: false }
        });
        await stop();
    });

    it('rejects the SSO profile without an identity provider', async () => {
        await expect(createUnkayosFeatures({
            profile: 'sso',
            getDesktop: () => document.body,
            systemManager: fakeSystemManager(() => true)
        })).rejects.toThrow(/identityProvider/);
    });

    it('normalizes provider metadata for the UI', () => {
        expect(resolveProviderInfo(null)).toMatchObject({
            mode: 'local',
            supportsLogin: false,
            loginLabel: null
        });
        expect(resolveProviderInfo(createGuestAuthSystem())).toMatchObject({
            id: 'local',
            mode: 'local',
            supportsLogin: false
        });
        expect(resolveProviderInfo({
            getProviderInfo: () => ({ id: 'acme', label: 'Acme', mode: 'sso', supportsLogin: true })
        })).toMatchObject({
            id: 'acme',
            label: 'Acme',
            mode: 'sso',
            supportsLogin: true,
            loginLabel: 'Entrar'
        });
    });
});
