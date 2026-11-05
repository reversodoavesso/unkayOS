import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { basePolicy, baseServerConfig, startGateway } from './helpers.mjs';

/** Minimal OIDC provider used to prove the code flow contract. */
async function startIdentityProvider(options = {}) {
    const state = { tokenRequests: [], userinfoRequests: [], issuerOverride: options.issuer || null };
    const server = createServer(async (request, response) => {
        const url = new URL(request.url || '/', 'http://idp.local');
        const address = /** @type {import('node:net').AddressInfo} */ (server.address());
        const issuer = state.issuerOverride || `http://127.0.0.1:${address.port}`;
        if (url.pathname === '/.well-known/openid-configuration') {
            response.writeHead(200, { 'Content-Type': 'application/json' });
            return response.end(JSON.stringify({
                issuer,
                authorization_endpoint: `${issuer}/authorize`,
                token_endpoint: `${issuer}/token`,
                userinfo_endpoint: `${issuer}/userinfo`
            }));
        }
        if (url.pathname === '/token') {
            const chunks = [];
            for await (const chunk of request) chunks.push(chunk);
            state.tokenRequests.push(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
            response.writeHead(200, { 'Content-Type': 'application/json' });
            return response.end(JSON.stringify({ access_token: 'provider-access-token', token_type: 'Bearer' }));
        }
        if (url.pathname === '/userinfo') {
            state.userinfoRequests.push(request.headers.authorization);
            if (options.userinfoStatus) {
                response.writeHead(options.userinfoStatus, { 'Content-Type': 'application/json' });
                return response.end(JSON.stringify({ error: 'denied' }));
            }
            response.writeHead(200, { 'Content-Type': 'application/json' });
            return response.end(JSON.stringify({
                sub: 'third-party-user-7',
                name: 'Ada Exemplo',
                groups: ['members'],
                roles: ['admin'],
                amr: ['pwd', 'mfa'],
                ...(options.claims || {})
            }));
        }
        response.writeHead(404);
        response.end();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
    return {
        url: `http://127.0.0.1:${port}`,
        state,
        async close() {
            server.closeAllConnections?.();
            await new Promise(resolve => server.close(resolve));
        }
    };
}

function oidcConfig(issuer, overrides = {}) {
    return baseServerConfig({
        identity: {
            mode: 'oidc',
            issuer,
            clientId: 'unkayos-client',
            clientSecretRef: 'OIDC_SECRET',
            redirectUri: 'http://127.0.0.1:8080/session/login/callback',
            scopes: ['openid', 'profile', 'email'],
            groupClaim: 'groups',
            roleClaim: 'roles',
            postLoginPath: '/home',
            ...overrides
        }
    });
}

test('code flow OIDC cria sessão sem expor tokens ao browser', async t => {
    const idp = await startIdentityProvider();
    const gateway = await startGateway({
        config: oidcConfig(idp.url),
        policy: basePolicy({ rules: [{ id: 'ai', effect: 'allow', actions: ['ai.chat'], groups: ['members'] }] }),
        secrets: { oidcClientSecret: 'provider-secret', upstreamKeys: {} }
    });
    t.after(async () => { await gateway.close(); await idp.close(); });

    await gateway.request('/session');
    const login = await gateway.request('/session/login');
    assert.equal(login.status, 302);
    const authorize = new URL(login.headers.get('location'));
    assert.equal(authorize.pathname, '/authorize');
    assert.equal(authorize.searchParams.get('response_type'), 'code');
    assert.equal(authorize.searchParams.get('client_id'), 'unkayos-client');
    assert.equal(authorize.searchParams.get('redirect_uri'), 'http://127.0.0.1:8080/session/login/callback');
    assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(authorize.searchParams.get('code_challenge').length >= 43);
    assert.equal(authorize.searchParams.get('scope'), 'openid profile email');
    const state = authorize.searchParams.get('state');
    assert.ok(state);
    assert.ok(gateway.jar.get('unkay_session_txn'));

    const callback = await gateway.request(`/session/login/callback?code=code-123&state=${state}`);
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get('location'), '/home');
    assert.equal(idp.state.tokenRequests.length, 1);
    const tokenRequest = idp.state.tokenRequests[0];
    assert.equal(tokenRequest.get('client_secret'), 'provider-secret');
    assert.equal(tokenRequest.get('code'), 'code-123');
    assert.ok(tokenRequest.get('code_verifier').length >= 43);

    const session = await gateway.request('/session');
    assert.equal(session.json.authenticated, true);
    assert.equal(session.json.principal.name, 'Ada Exemplo');
    assert.deepEqual(session.json.principal.groups, ['members', 'admin']);
    assert.equal(session.json.principal.mfa, true);
    assert.equal(session.json.principal.issuer, idp.url);
    assert.equal(session.text.includes('provider-access-token'), false);
    assert.equal(session.text.includes('third-party-user-7'), false);

    // The session authorizes by policy on the server, not by provider claims.
    const decision = await gateway.request('/access/evaluate', {
        method: 'POST',
        body: { action: 'ai.chat', resource: { kind: 'ai', model: 'assistant' } },
        headers: { 'x-unkay-csrf': session.json.csrfToken }
    });
    assert.equal(decision.json.allowed, true);
});

test('lê papéis RDA/Zitadel em mapa de objeto sem depender do formato do IdP', async t => {
    const idp = await startIdentityProvider({
        claims: {
            groups: [],
            roles: undefined,
            'urn:zitadel:iam:org:project:roles': { sysadmin: 'org-1', operator: 'org-2' }
        }
    });
    const gateway = await startGateway({
        config: oidcConfig(idp.url, { roleClaim: 'urn:zitadel:iam:org:project:roles' }),
        policy: basePolicy({ rules: [{ id: 'sysadmin-ai', effect: 'allow', actions: ['ai.chat'], groups: ['sysadmin'] }] }),
        secrets: { oidcClientSecret: 'provider-secret', upstreamKeys: {} }
    });
    t.after(async () => { await gateway.close(); await idp.close(); });

    const login = await gateway.request('/session/login');
    const state = new URL(login.headers.get('location')).searchParams.get('state');
    await gateway.request(`/session/login/callback?code=code-123&state=${state}`);
    const session = await gateway.request('/session');
    assert.deepEqual(session.json.principal.groups, ['sysadmin', 'operator']);
    const decision = await gateway.request('/access/evaluate', {
        method: 'POST',
        body: { action: 'ai.chat', resource: { kind: 'ai', model: 'assistant' } },
        headers: { 'x-unkay-csrf': session.json.csrfToken }
    });
    assert.equal(decision.json.allowed, true);
});

test('callback exige state vinculado ao navegador', async t => {
    const idp = await startIdentityProvider();
    const gateway = await startGateway({ config: oidcConfig(idp.url), secrets: { oidcClientSecret: 'provider-secret', upstreamKeys: {} } });
    t.after(async () => { await gateway.close(); await idp.close(); });

    const login = await gateway.request('/session/login');
    const state = new URL(login.headers.get('location')).searchParams.get('state');
    const forged = await gateway.request(`/session/login/callback?code=code-123&state=forged`);
    assert.equal(forged.status, 400);
    assert.equal(forged.json.error.code, 'OIDC_STATE_INVALID');

    const reused = await gateway.request(`/session/login/callback?code=code-123&state=${state}`);
    assert.equal(reused.status, 302);
    const replay = await gateway.request(`/session/login/callback?code=code-123&state=${state}`);
    assert.equal(replay.status, 400);
    assert.equal(replay.json.error.code, 'OIDC_STATE_INVALID');
});

test('falha do provedor não autentica e mantém o erro estável', async t => {
    const idp = await startIdentityProvider({ userinfoStatus: 401 });
    const gateway = await startGateway({ config: oidcConfig(idp.url), secrets: { oidcClientSecret: 'provider-secret', upstreamKeys: {} } });
    t.after(async () => { await gateway.close(); await idp.close(); });

    const login = await gateway.request('/session/login');
    const state = new URL(login.headers.get('location')).searchParams.get('state');
    const callback = await gateway.request(`/session/login/callback?code=code-123&state=${state}`);
    assert.equal(callback.status, 401);
    assert.equal(callback.json.error.code, 'OIDC_REJECTED');
    const session = await gateway.request('/session');
    assert.equal(session.json.authenticated, false);
});

test('issuer divergente e endpoints inseguros falham fechado', async t => {
    const idp = await startIdentityProvider({ issuer: 'http://127.0.0.1:1' });
    const gateway = await startGateway({ config: oidcConfig(idp.url), secrets: { oidcClientSecret: 'provider-secret', upstreamKeys: {} } });
    t.after(async () => { await gateway.close(); await idp.close(); });
    const mismatch = await gateway.request('/session/login');
    assert.equal(mismatch.status, 502);
    assert.equal(mismatch.json.error.code, 'OIDC_ISSUER_MISMATCH');

    const insecureFetch = async url => {
        assert.match(String(url), /^http:\/\/example\.com\/\.well-known/);
        return new Response(JSON.stringify({
            issuer: 'http://example.com',
            authorization_endpoint: 'http://example.com/authorize',
            token_endpoint: 'http://example.com/token',
            userinfo_endpoint: 'http://example.com/userinfo'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const insecure = await startGateway({
        config: oidcConfig('http://example.com'),
        secrets: { oidcClientSecret: 'provider-secret', upstreamKeys: {} },
        fetchImpl: insecureFetch
    });
    t.after(() => insecure.close());
    const rejected = await insecure.request('/session/login');
    assert.equal(rejected.status, 502);
    assert.equal(rejected.json.error.code, 'OIDC_INVALID');
});
