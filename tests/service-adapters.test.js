// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { Kernel } from '../core/kernel/index.js';
import { createDeployment } from '../core/host/config/deployment.js';
import { pluginCatalog } from '../core/host/plugins/catalog.js';
import { composePlugins, planPlugins } from '../core/host/plugins/compose.js';
import { createHttpAi } from '../core/host/services/httpAi.js';
import { mapRdaTier } from '../core/host/plugins/rdaTiers.js';
import { create as createRolePolicy } from '../core/host/plugins/roleAccess.js';
import { createUnkaySDK } from '../core/sdk/unkay.js';
import { createGuestAuthSystem } from '../core/host/guestAuth.js';

const logger = { info() {}, warn() {}, debug() {}, error() {} };
const copy = preset => JSON.parse(JSON.stringify(createDeployment(preset)));
const client = transport => createHttpAi({ transport, promptPath: '/api/custom/chat', streamPath: '/api/custom/chat/stream' });

describe('independent access policies', () => {
    it.each([
        [null, 'guest'], [{ role: 'demiurge' }, 'demiurge'],
        [{ 'urn:zitadel:iam:org:project:roles': { archon: {} } }, 'sysadmin'],
        [{ roles: ['weaver'] }, 'adept'], [{ roles: ['adept', 'demiurge'] }, 'demiurge'],
        [{ roles: ['unknown'] }, 'standard']
    ])('preserves RDA legacy tiers in its integration adapter', (user, tier) => {
        expect(mapRdaTier(user)).toBe(tier);
    });

    it('maps third-party roles without vendor claims or granting remote permissions', () => {
        const { access } = createRolePolicy({ config: { tierRoles: { sysadmin: ['company-admin'], adept: ['editor'] } } });
        expect(access.getTier({ roles: ['editor', 'company-admin'] })).toBe('sysadmin');
        expect(access.getTier({ role: 'demiurge' })).toBe('standard');
        expect(access.getTier(null)).toBe('guest');
        expect(access.evaluate('compute.session.create').allowed).toBe(false);
    });

    it('composes an injected identity with a separately configured role policy', async () => {
        const deployment = copy('sso');
        deployment.instances.policy = { plugin: 'unkayos.role-access', config: { tierRoles: { adept: ['writer'] } } };
        const provider = { ...createGuestAuthSystem(), getCurrentUser: () => ({ roles: ['writer'] }) };
        const kernel = new Kernel({ logger }).register(await composePlugins(deployment, pluginCatalog, { identityProvider: () => provider }));
        await kernel.start();
        try {
            const sdk = createUnkaySDK(null, { getSystem: name => kernel.get(name) });
            expect(sdk.auth.getTier()).toBe('adept');
            expect(await sdk.access.can('compute.session.create')).toBe(false);
        } finally { await kernel.stop(); }
    });
});

describe('HTTP AI adapter', () => {
    it('uses only same-origin session credentials and never discovers an IdP token', async () => {
        const transport = vi.fn(async () => new Response(JSON.stringify({ reply: 'hello' })));
        const ai = client(transport);
        await expect(ai.prompt([{ role: 'user', content: 'hi' }])).resolves.toBe('hello');
        const [path, options] = transport.mock.calls[0];
        expect(path).toBe('/api/custom/chat');
        expect(options.credentials).toBe('same-origin');
        expect(options.redirect).toBe('error');
        expect(options.headers.Authorization).toBeUndefined();
        expect(JSON.parse(options.body)).toEqual({ messages: [{ role: 'user', content: 'hi' }] });
    });

    it('decodes text across arbitrary UTF-8 byte boundaries', async () => {
        const bytes = new TextEncoder().encode('Olá, mundo');
        const body = new ReadableStream({ start(controller) {
            for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
            controller.close();
        } });
        const ai = client(async () => new Response(body));
        const chunks = [];
        await ai.stream([], chunk => chunks.push(chunk));
        expect(chunks.join('')).toBe('Olá, mundo');
        expect(body.locked).toBe(false);
    });

    it.each([[401, 'UNAUTHENTICATED'], [403, 'FORBIDDEN'], [429, 'QUOTA_EXCEEDED'], [502, 'UPSTREAM_ERROR']])('normalizes HTTP %s without exposing response data', async (status, code) => {
        const ai = client(async () => new Response('private upstream detail', { status }));
        await expect(ai.prompt([])).rejects.toMatchObject({ code });
        await expect(ai.prompt([])).rejects.not.toThrow(/private upstream detail/);
    });

    it('rejects a malformed reply instead of returning an empty success', async () => {
        const ai = client(async () => new Response(JSON.stringify({ other: 'value' })));
        await expect(ai.prompt([])).rejects.toMatchObject({ code: 'PROTOCOL_ERROR' });
    });

    it('rejects malformed JSON and incompatible streaming protocols', async () => {
        await expect(client(async () => new Response('<html>gateway error</html>')).prompt([])).rejects.toMatchObject({ code: 'PROTOCOL_ERROR' });
        await expect(client(async () => new Response('data: {}\n\n', { headers: { 'content-type': 'text/event-stream' } })).stream([], () => {}))
            .rejects.toMatchObject({ code: 'PROTOCOL_ERROR' });
    });

    it('rejects already cancelled operations before calling transport', async () => {
        const transport = vi.fn();
        const controller = new AbortController();
        controller.abort();
        await expect(client(transport).prompt([], { signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
        expect(transport).not.toHaveBeenCalled();
    });

    it('cancels an active stream, frees its reader and reports cancellation', async () => {
        const cancel = vi.fn();
        const body = new ReadableStream({ cancel });
        const ai = client(async () => new Response(body));
        const controller = new AbortController();
        const result = ai.stream([], () => {}, { signal: controller.signal });
        const assertion = expect(result).rejects.toMatchObject({ code: 'CANCELLED' });
        await vi.waitFor(() => expect(body.locked).toBe(true));
        controller.abort();
        await assertion;
        expect(cancel).toHaveBeenCalled();
        expect(body.locked).toBe(false);
    });

    it('aborts in-flight transport on destroy and prevents new requests', async () => {
        const transport = vi.fn((_path, { signal }) => new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }));
        const ai = client(transport);
        const assertion = expect(ai.prompt([])).rejects.toMatchObject({ code: 'CANCELLED' });
        ai.destroy();
        await assertion;
        await expect(ai.prompt([])).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' });
        expect(transport).toHaveBeenCalledTimes(1);
    });

    it('enforces the configured request timeout', async () => {
        vi.useFakeTimers();
        try {
            const ai = createHttpAi({ promptPath: '/api/chat', streamPath: '/api/stream', timeoutMs: 100,
                transport: (_path, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))) });
            const assertion = expect(ai.prompt([])).rejects.toMatchObject({ code: 'TIMEOUT' });
            await vi.advanceTimersByTimeAsync(100);
            await assertion;
        } finally { vi.useRealTimers(); }
    });
});

describe('bound AI and sync services', () => {
    it('uses configurable AI without SSO and refuses to borrow another host identity', async () => {
        const deployment = copy('standalone');
        deployment.instances.assistant = { plugin: 'unkayos.http-ai', config: { basePath: '/api/custom' } };
        deployment.bindings.ai = 'assistant.ai';
        const kernel = new Kernel({ logger }).register(await composePlugins(deployment, pluginCatalog));
        await kernel.start();
        const transport = vi.fn(async () => new Response(JSON.stringify({ content: 'own gateway' })));
        vi.stubGlobal('fetch', transport);
        try {
            const sdk = createUnkaySDK(null, { getSystem: name => kernel.get(name) });
            await expect(sdk.ai.prompt([])).resolves.toBe('own gateway');
            expect(transport.mock.calls[0][1].headers.Authorization).toBeUndefined();
            expect(sdk.auth.getToken()).toBeNull();
        } finally { vi.unstubAllGlobals(); await kernel.stop(); }
    });

    it.each(['https://outside.example/ai', '//outside.example', '/api/../private', '/api/ai?token=secret'])('rejects unsafe public AI route %s', basePath => {
        const deployment = copy('standalone');
        deployment.instances.assistant = { plugin: 'unkayos.http-ai', config: { basePath } };
        deployment.bindings.ai = 'assistant.ai';
        expect(() => planPlugins(deployment, pluginCatalog)).toThrow(/Configuração inválida/);
    });

    it('keeps token forwarding an explicit RDA-only adapter behavior', async () => {
        const provider = { ...createGuestAuthSystem(), getAuthToken: () => 'rda-session' };
        const kernel = new Kernel({ logger }).register(await composePlugins(createDeployment('rda'), pluginCatalog, { identityProvider: () => provider }));
        await kernel.start();
        const transport = vi.fn(async () => new Response(JSON.stringify({ reply: 'legacy' })));
        vi.stubGlobal('fetch', transport);
        try {
            const sdk = createUnkaySDK(null, { getSystem: name => kernel.get(name) });
            await expect(sdk.ai.prompt([])).resolves.toBe('legacy');
            expect(transport.mock.calls[0][0]).toBe('/api/v1/ai/chat');
            expect(transport.mock.calls[0][1].headers.Authorization).toBe('Bearer rda-session');
            expect(kernel.has('syncService')).toBe(true);
        } finally { vi.unstubAllGlobals(); await kernel.stop(); }
    });

    it('delegates sync only to the selected service', async () => {
        const sync = vi.fn(async () => ({ success: true }));
        const sdk = createUnkaySDK(null, { getSystem: name => name === 'syncService' ? { sync } : null });
        await expect(sdk.fs.syncCloud()).resolves.toEqual({ success: true });
        expect(sync).toHaveBeenCalledOnce();
    });
});
