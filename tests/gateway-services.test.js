import { describe, expect, it, vi } from 'vitest';
import { createGatewayIdentity } from '../core/host/services/gatewayIdentity.js';
import { createGatewayAccess } from '../core/host/services/gatewayAccess.js';

const json = (status, body) => ({
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body
});

const sessionBody = (overrides = {}) => ({
    authenticated: true,
    principal: { id: 'principal-1', name: 'Ada', issuer: 'https://id.example.com', groups: ['members'], mfa: true },
    csrfToken: 'csrf-token-123456',
    installation: {
        installationId: 'desk-1',
        revision: 'r1',
        identity: { mode: 'oidc', requiresLogin: true },
        ai: null,
        access: { policyVersion: 'p1' }
    },
    ...overrides
});

describe('gateway identity adapter', () => {
    it('exposes a normalized principal and never a provider token', async () => {
        const transport = vi.fn(async () => json(200, sessionBody()));
        const identity = createGatewayIdentity({ transport });
        await identity.ready;

        expect(identity.isAuthenticated()).toBe(true);
        const user = identity.getCurrentUser();
        expect(user).toMatchObject({ id: 'principal-1', name: 'Ada', roles: ['members'], groups: ['members'], mfa: true });
        expect(identity.getAuthToken()).toBe(null);
        expect(identity.getAPI().getAuthToken()).toBe(null);
        const info = identity.getProviderInfo();
        expect(info).toMatchObject({ id: 'gateway', mode: 'oidc', supportsLogin: true });
        expect(JSON.stringify({ user, info })).not.toContain('access_token');
    });

    it('keeps the session anonymous when the gateway is unavailable', async () => {
        const identity = createGatewayIdentity({ transport: async () => { throw new Error('network'); } });
        await identity.ready;
        expect(identity.isAuthenticated()).toBe(false);
        expect(identity.getCurrentUser()).toBe(null);
        // Legacy permission checks fail closed.
        expect(identity.hasPermission()).toBe(false);
    });

    it('navigates for OIDC and posts a CSRF-protected login in local mode', async () => {
        const navigate = vi.fn();
        const transport = vi.fn(async () => json(200, sessionBody({
            installation: { installationId: 'desk-1', revision: 'r1', identity: { mode: 'oidc', requiresLogin: true } }
        })));
        const identity = createGatewayIdentity({ transport, navigate, basePath: '/app' });
        await identity.ready;
        await identity.login();
        expect(navigate).toHaveBeenCalledWith('/app/session/login');

        const localTransport = vi.fn(async (path, init) => {
            if (path.endsWith('/session') && (!init || init.method === 'GET')) {
                return json(200, sessionBody({
                    authenticated: false,
                    principal: null,
                    installation: { installationId: 'desk-1', revision: 'r1', identity: { mode: 'local', requiresLogin: false } }
                }));
            }
            return json(200, sessionBody({
                principal: { id: 'device', name: 'Sessão local', issuer: 'local', groups: ['local'], mfa: false },
                installation: { installationId: 'desk-1', revision: 'r1', identity: { mode: 'local', requiresLogin: false } }
            }));
        });
        const local = createGatewayIdentity({ transport: localTransport });
        await local.ready;
        const user = await local.login();
        expect(user).toMatchObject({ id: 'device', name: 'Sessão local' });
        const loginCall = localTransport.mock.calls.find(([, init]) => init?.method === 'POST');
        expect(loginCall[1].headers['x-unkay-csrf']).toBe('csrf-token-123456');
        expect(loginCall[1].credentials).toBe('same-origin');
    });

    it('emits change only when the identity actually changes and clears on logout', async () => {
        const body = sessionBody();
        const transport = vi.fn(async path => {
            if (String(path).includes('/logout')) return json(200, { authenticated: false });
            return json(200, body);
        });
        const identity = createGatewayIdentity({ transport });
        const changes = [];
        identity.on('change', user => changes.push(user?.id ?? null));
        await identity.ready;
        await identity.refresh();
        expect(changes).toEqual(['principal-1']);

        await identity.logout();
        expect(changes.at(-1)).toBe(null);
        expect(identity.isAuthenticated()).toBe(false);
    });
});

describe('gateway access adapter', () => {
    const decision = (allowed, reason = 'ALLOW') => json(200, { allowed, reason, policyVersion: 'p1' });

    it('sends the CSRF token and returns the server decision', async () => {
        const calls = [];
        const transport = vi.fn(async (path, init) => {
            calls.push({ path, init });
            return path.endsWith('/session') ? json(200, sessionBody()) : decision(true);
        });
        const access = createGatewayAccess({ transport });
        expect(await access.can('files.local.read')).toBe(true);
        expect(await access.evaluate('compute.session.create')).toMatchObject({ allowed: true, policyVersion: 'p1' });
        const evaluate = calls.find(call => call.path.endsWith('/access/evaluate'));
        expect(evaluate.init.headers['x-unkay-csrf']).toBe('csrf-token-123456');
        expect(evaluate.init.credentials).toBe('same-origin');
        expect(JSON.parse(evaluate.init.body)).toEqual({ action: 'files.local.read', resource: {} });
    });

    it('caches decisions for the TTL and re-evaluates after it', async () => {
        let clock = 0;
        let evaluations = 0;
        const transport = vi.fn(async path => {
            if (path.endsWith('/session')) return json(200, sessionBody());
            evaluations += 1;
            return decision(true);
        });
        const access = createGatewayAccess({ transport, cacheTtlMs: 100, now: () => clock });
        await access.can('ai.chat');
        await access.can('ai.chat');
        expect(evaluations).toBe(1);
        clock = 250;
        await access.can('ai.chat');
        expect(evaluations).toBe(2);
    });

    it('fails closed on transport, protocol and authentication failures', async () => {
        const cases = [
            { transport: async () => { throw new Error('network down'); }, reason: 'SERVICE_UNAVAILABLE' },
            { transport: async path => (path.endsWith('/session') ? json(200, sessionBody()) : json(500, { error: { code: 'INTERNAL_ERROR' } })), reason: 'SERVICE_UNAVAILABLE' },
            { transport: async path => (path.endsWith('/session') ? json(401, { error: { code: 'UNAUTHENTICATED' } }) : decision(true)), reason: 'UNAUTHENTICATED' },
            { transport: async path => (path.endsWith('/session') ? json(200, sessionBody()) : json(200, { allowed: 'yes' })), reason: 'SERVICE_UNAVAILABLE' }
        ];
        for (const item of cases) {
            const access = createGatewayAccess({ transport: item.transport });
            const result = await access.evaluate('ai.chat');
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe(item.reason);
        }
    });

    it('stops using the transport after destroy', async () => {
        const transport = vi.fn(async path => (path.endsWith('/session') ? json(200, sessionBody()) : decision(true)));
        const access = createGatewayAccess({ transport });
        await access.can('ai.chat');
        access.destroy();
        expect(await access.evaluate('ai.chat', {}, { cache: false })).toMatchObject({ allowed: false, reason: 'CANCELLED' });
    });
});

