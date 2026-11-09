import { describe, it, expect, vi } from 'vitest';
import { createDeployment, resolveDeployment, fromLegacyDeployment, loadDeployment } from '../core/host/config/deployment.js';

const copy = () => JSON.parse(JSON.stringify(createDeployment()));
const response = (status, body, type = 'application/json') => ({
    status, ok: status >= 200 && status < 300, headers: new Headers({ 'content-type': type }),
    json: async () => JSON.parse(body)
});

describe('public runtime deployment', () => {
    it('uses deeply frozen portable defaults, independent of hostname/branding', () => {
        const config = createDeployment();
        expect(config.preset).toBe('standalone');
        expect(Object.isFrozen(config.instances.account.config)).toBe(true);
        expect(createDeployment('neutral')).toEqual(config);
        expect(() => createDeployment('typo')).toThrow(/desconhecido/);
        const input = copy();
        const resolved = resolveDeployment(input);
        input.instances.account.plugin = 'other.identity';
        expect(resolved.instances.account.plugin).toBe('unkayos.local-identity');
    });

    it.each([
        config => { config.schemaVersion = 2; },
        config => { config.clientSecret = 'must-not-appear-in-error'; },
        config => { config.product.unknown = true; },
        config => { config.instances.account.enabled = 'false'; },
        config => { config.bindings.identity = 'https://evil.example/plugin.js'; },
        config => { config.bindings.compute = 'unknown.compute'; },
        config => { delete config.bindings.access; }
    ])('rejects invalid config rather than merging defaults', mutate => {
        const input = copy();
        mutate(input);
        expect(() => resolveDeployment(input)).toThrow(/inválida/);
        try { resolveDeployment(input); } catch (error) {
            expect(error.message).not.toContain('must-not-appear-in-error');
        }
    });

    it('only opts into RDA via explicit legacy configuration', () => {
        expect(fromLegacyDeployment(undefined).preset).toBe('standalone');
        expect(fromLegacyDeployment({ branding: 'neutral' }).preset).toBe('standalone');
        expect(fromLegacyDeployment({ branding: 'rda', oidc: { clientId: 'public' } }).preset).toBe('rda');
        expect(() => fromLegacyDeployment({ branding: 'typo' })).toThrow();
    });

    it('loads JSON with no cache, same-origin credentials and redirects rejected', async () => {
        const transport = vi.fn(async () => response(200, JSON.stringify(createDeployment('sso')), 'application/json; charset=utf-8'));
        const config = await loadDeployment({ transport, legacy: { branding: 'rda' } });
        expect(config.preset).toBe('sso');
        expect(transport).toHaveBeenCalledWith('/config/deployment.json', expect.objectContaining({
            cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: expect.any(AbortSignal)
        }));
    });

    it('allows portable fallback only on an actual 404', async () => {
        const transport = vi.fn(async () => response(404, ''));
        expect((await loadDeployment({ transport })).preset).toBe('standalone');
        expect((await loadDeployment({ transport, legacy: { branding: 'rda' } })).preset).toBe('rda');
        await expect(loadDeployment({ transport, required: true })).rejects.toMatchObject({ code: 'CONFIG_HTTP_ERROR' });
        await expect(loadDeployment({ transport: async () => response(503, '') })).rejects.toMatchObject({ code: 'CONFIG_HTTP_ERROR' });
        await expect(loadDeployment({ transport: async () => { throw new Error('network failure'); } })).rejects.toThrow('network failure');
    });

    it('rejects SPA HTML and broken JSON without falling back to legacy RDA', async () => {
        await expect(loadDeployment({ transport: async () => response(200, '<html>', 'text/html'), legacy: { branding: 'rda' } }))
            .rejects.toMatchObject({ code: 'CONFIG_CONTENT_TYPE' });
        await expect(loadDeployment({ transport: async () => response(200, '{') })).rejects.toMatchObject({ code: 'CONFIG_JSON_INVALID' });
    });

    it('qualifies effective identity and gateway backend adapters per preset', () => {
        // Standalone preset: local identity and local access
        const standalone = createDeployment('standalone');
        expect(standalone.preset).toBe('standalone');
        expect(standalone.instances.account.plugin).toBe('unkayos.local-identity');
        expect(standalone.instances.policy.plugin).toBe('unkayos.local-access');
        expect(standalone.bindings.identity).toBe('account.identity');
        expect(standalone.bindings.access).toBe('policy.access');
        expect(standalone.bindings.ai).toBeUndefined();

        // SSO preset: injected identity and local access
        const sso = createDeployment('sso');
        expect(sso.preset).toBe('sso');
        expect(sso.instances.account.plugin).toBe('unkayos.injected-identity');
        expect(sso.instances.policy.plugin).toBe('unkayos.local-access');

        // RDA preset: MUST use gateway backend contract with HttpOnly session
        const rda = createDeployment('rda');
        expect(rda.preset).toBe('rda');
        expect(rda.instances.account.plugin).toBe('unkayos.gateway-identity');
        expect(rda.instances.account.config).toMatchObject({
            loginPath: '/session/login',
            logoutPath: '/session/logout'
        });
        expect(rda.instances.policy.plugin).toBe('rda.access');
        expect(rda.instances.assistant.plugin).toBe('rda.ai');
        expect(rda.instances.cloud.plugin).toBe('rda.sync');
        expect(rda.bindings.identity).toBe('account.identity');
        expect(rda.bindings.access).toBe('policy.access');
        expect(rda.bindings.ai).toBe('assistant.ai');
        expect(rda.bindings.sync).toBe('cloud.sync');

        // All presets must resolve and validate against strict schema
        expect(resolveDeployment(standalone)).toBeDefined();
        expect(resolveDeployment(sso)).toBeDefined();
        expect(resolveDeployment(rda)).toBeDefined();
    });
});
