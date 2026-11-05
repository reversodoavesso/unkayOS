import assert from 'node:assert/strict';
import test from 'node:test';
import { createGatewayAccess } from '../../core/host/services/gatewayAccess.js';
import { createGatewayIdentity } from '../../core/host/services/gatewayIdentity.js';
import { createHttpAi } from '../../core/host/services/httpAi.js';
import { aiConfig, basePolicy, baseServerConfig, startGateway, startUpstream } from './helpers.mjs';

/**
 * Proves the browser adapters and the gateway speak the same protocol, including
 * cookie session, CSRF rotation, remote authorization and streaming.
 */
test('contrato browser-gateway: sessão, autorização remota e IA', async t => {
    let upstreamAuthorization = null;
    let upstreamCookie = null;
    const upstream = await startUpstream(async ({ request, body }, response) => {
        upstreamAuthorization = request.headers.authorization;
        upstreamCookie = request.headers.cookie || null;
        if (body.stream) {
            response.writeHead(200, { 'Content-Type': 'text/event-stream' });
            response.write('data: {"choices":[{"delta":{"content":"Olá"}}]}\n\n');
            response.end('data: [DONE]\n\n');
            return;
        }
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ choices: [{ message: { content: 'resposta do provedor' } }] }));
    });
    const gateway = await startGateway({
        config: baseServerConfig({ ai: aiConfig(upstream.url) }),
        policy: basePolicy({
            rules: [
                { id: 'local-files', effect: 'allow', actions: ['files.local.*'], groups: ['local'] },
                { id: 'local-ai', effect: 'allow', actions: ['ai.chat'], groups: ['local'], models: ['assistant'] }
            ]
        }),
        secrets: { oidcClientSecret: 'x', upstreamKeys: { primary: 'server-side-key' } }
    });
    t.after(async () => { await gateway.close(); await upstream.close(); });

    /** Browser-like transport: same-origin credentials and a cookie jar. */
    const transport = async (path, init = {}) => {
        const headers = { ...(init.headers || {}), cookie: gateway.jar.header() };
        const response = await fetch(`${gateway.origin}${path}`, { ...init, headers });
        gateway.jar.absorb(response.headers.getSetCookie ? response.headers.getSetCookie() : []);
        return response;
    };

    const identity = createGatewayIdentity({ transport });
    await identity.ready;
    assert.equal(identity.isAuthenticated(), false);

    await identity.login();
    assert.equal(identity.isAuthenticated(), true);
    assert.equal(identity.getCurrentUser().groups[0], 'local');
    assert.equal(identity.getAuthToken(), null);
    assert.ok(gateway.jar.get('unkay_session'));
    assert.ok(gateway.jar.get('unkay_session_csrf'));

    const access = createGatewayAccess({ transport });
    assert.equal(await access.can('files.local.write'), true);
    assert.equal((await access.evaluate('compute.session.create')).allowed, false);
    assert.equal((await access.evaluate('ai.chat', { kind: 'ai', model: 'assistant' })).allowed, true);

    const csrfHeaders = () => ({
        'x-unkay-csrf': gateway.jar.get('unkay_session_csrf') || ''
    });
    const ai = createHttpAi({
        transport,
        promptPath: '/ai/chat',
        streamPath: '/ai/chat/stream',
        timeoutMs: 5000,
        getHeaders: csrfHeaders
    });
    const messages = [{ role: 'user', content: 'oi' }];
    assert.equal(await ai.prompt(messages), 'resposta do provedor');
    const chunks = [];
    await ai.stream(messages, chunk => chunks.push(chunk));
    assert.equal(chunks.join(''), 'Olá');
    assert.equal(upstreamAuthorization, 'Bearer server-side-key');
    assert.equal(upstreamCookie, null, 'cookies do navegador não são encaminhados ao fornecedor');

    // Logout rotates the session; stale CSRF must not resurrect access.
    await identity.logout();
    assert.equal((await access.evaluate('files.local.read', {}, { cache: false })).reason, 'UNAUTHENTICATED');
    const denied = await fetch(`${gateway.origin}/ai/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: gateway.jar.header() },
        body: JSON.stringify({ messages })
    });
    assert.equal(denied.status, 401);
});
