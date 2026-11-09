import assert from 'node:assert/strict';
import test from 'node:test';
import { basePolicy, baseServerConfig, loginLocal, startGateway } from './helpers.mjs';

test('sessão anônima emite CSRF e nega operações sem login', async t => {
    const gateway = await startGateway();
    t.after(() => gateway.close());

    const session = await gateway.request('/session');
    assert.equal(session.status, 200);
    assert.equal(session.json.authenticated, false);
    assert.equal(typeof session.json.csrfToken, 'string');
    assert.ok(session.json.csrfToken.length >= 16);
    assert.equal(session.json.installation.installationId, 'test-install');
    assert.equal(session.json.ai, null);
    // No upstream URL or credential is exposed.
    assert.equal(JSON.stringify(session.json).includes('apiKey'), false);

    const csrfCookie = session.setCookie.find(header => header.startsWith('unkay_session_csrf='));
    assert.ok(csrfCookie);
    assert.match(csrfCookie, /Path=\//);
    assert.match(csrfCookie, /SameSite=Lax/);
    assert.match(csrfCookie, /Secure/);
    assert.doesNotMatch(csrfCookie, /HttpOnly/);

    const evaluate = await gateway.request('/access/evaluate', { method: 'POST', body: { action: 'files.local.read' } });
    assert.equal(evaluate.status, 401);
    assert.equal(evaluate.json.error.code, 'UNAUTHENTICATED');
});

test('login local exige CSRF e cria cookie HttpOnly', async t => {
    const gateway = await startGateway();
    t.after(() => gateway.close());

    const missing = await gateway.request('/session/login', { method: 'POST', body: {} });
    assert.equal(missing.status, 403);
    assert.equal(missing.json.error.code, 'CSRF_INVALID');

    const anonymous = await gateway.request('/session');
    const wrong = await gateway.request('/session/login', {
        method: 'POST', body: {}, headers: { 'x-unkay-csrf': 'not-the-cookie' }
    });
    assert.equal(wrong.status, 403);

    const login = await gateway.request('/session/login', {
        method: 'POST', body: {}, headers: { 'x-unkay-csrf': anonymous.json.csrfToken }
    });
    assert.equal(login.status, 200);
    assert.equal(login.json.authenticated, true);
    assert.equal(login.json.principal.groups[0], 'local');
    assert.equal(JSON.stringify(login.json).includes('access_token'), false);

    const sessionCookie = login.setCookie.find(header => header.startsWith('unkay_session='));
    assert.ok(sessionCookie);
    assert.match(sessionCookie, /HttpOnly/);
    assert.match(sessionCookie, /SameSite=Lax/);
    assert.match(sessionCookie, /Secure/);
    assert.match(sessionCookie, /Path=\//);

    const session = await gateway.request('/session');
    assert.equal(session.json.authenticated, true);
    assert.equal(session.json.principal.name, 'Sessão local');
    assert.equal(session.json.installation.identity.mode, 'local');
});

test('bloqueia Origin cross-origin e Sec-Fetch-Site externo', async t => {
    const gateway = await startGateway();
    t.after(() => gateway.close());
    await loginLocal(gateway);
    const csrf = gateway.jar.get('unkay_session_csrf');

    const crossOrigin = await gateway.request('/session/logout', {
        method: 'POST', body: {}, headers: { 'x-unkay-csrf': csrf, origin: 'https://evil.example' }
    });
    assert.equal(crossOrigin.status, 403);
    assert.equal(crossOrigin.json.error.code, 'CROSS_ORIGIN');

    const crossSite = await gateway.request('/session/logout', {
        method: 'POST', body: {}, headers: { 'x-unkay-csrf': csrf, 'sec-fetch-site': 'cross-site' }
    });
    assert.equal(crossSite.status, 403);
    assert.equal(crossSite.json.error.code, 'CROSS_ORIGIN');

    const same = await gateway.request('/session/logout', {
        method: 'POST', body: {}, headers: { 'x-unkay-csrf': csrf, origin: gateway.origin }
    });
    assert.equal(same.status, 200);
    assert.equal(same.json.authenticated, false);
});

test('logout invalida a sessão e limpa cookies', async t => {
    const gateway = await startGateway();
    t.after(() => gateway.close());
    const { csrf } = await loginLocal(gateway);

    const logout = await gateway.request('/session/logout', { method: 'POST', body: {}, headers: { 'x-unkay-csrf': csrf } });
    assert.equal(logout.status, 200);
    const cleared = logout.setCookie.filter(header => /Max-Age=0/.test(header));
    assert.ok(cleared.length >= 2);

    const session = await gateway.request('/session');
    assert.equal(session.json.authenticated, false);
    const evaluate = await gateway.request('/access/evaluate', { method: 'POST', body: { action: 'files.local.read' } });
    assert.equal(evaluate.status, 401);
});

test('decisões remotas aplicam a política e o escopo do recurso', async t => {
    const gateway = await startGateway();
    t.after(() => gateway.close());
    const { csrf } = await loginLocal(gateway);

    const allowed = await gateway.request('/access/evaluate', {
        method: 'POST', body: { action: 'files.local.write' }, headers: { 'x-unkay-csrf': csrf }
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.json.allowed, true);
    assert.equal(allowed.json.policyVersion, 'test-1');

    const unknown = await gateway.request('/access/evaluate', {
        method: 'POST', body: { action: 'compute.session.create' }, headers: { 'x-unkay-csrf': csrf }
    });
    assert.equal(unknown.json.allowed, false);
    assert.equal(unknown.json.reason, 'DEFAULT_DENY');

    const invalidResource = await gateway.request('/access/evaluate', {
        method: 'POST', body: { action: 'files.local.read', resource: { image: 'x' } }, headers: { 'x-unkay-csrf': csrf }
    });
    assert.equal(invalidResource.status, 400);

    const invalidAction = await gateway.request('/access/evaluate', {
        method: 'POST', body: { action: 'Files.Local.Read' }, headers: { 'x-unkay-csrf': csrf }
    });
    assert.equal(invalidAction.status, 400);
});

test('sessão expira por inatividade', async t => {
    let clock = 1_000_000;
    const gateway = await startGateway({ config: baseServerConfig(), now: () => clock });
    t.after(() => gateway.close());
    await loginLocal(gateway);

    const fresh = await gateway.request('/session');
    assert.equal(fresh.json.authenticated, true);

    clock += 601_000;
    const expired = await gateway.request('/session');
    assert.equal(expired.json.authenticated, false);
    const evaluate = await gateway.request('/access/evaluate', { method: 'POST', body: { action: 'files.local.read' } });
    assert.equal(evaluate.status, 401);
});

test('política própria nega IA para grupo sem regra', async t => {
    const gateway = await startGateway({
        policy: basePolicy({
            rules: [{ id: 'files', effect: 'allow', actions: ['files.local.*'], groups: ['local'] }]
        })
    });
    t.after(() => gateway.close());
    const { csrf } = await loginLocal(gateway);
    const decision = await gateway.request('/access/evaluate', {
        method: 'POST', body: { action: 'ai.chat', resource: { kind: 'ai', model: 'assistant' } }, headers: { 'x-unkay-csrf': csrf }
    });
    assert.equal(decision.json.allowed, false);
    assert.equal(decision.json.reason, 'DEFAULT_DENY');
});

test('troca de conta no gateway invalida sessão anterior', async t => {
    const gateway = await startGateway();
    t.after(() => gateway.close());

    // Primeiro login
    const login1 = await loginLocal(gateway);
    const oldSessionToken = gateway.jar.get('unkay_session');
    assert.ok(oldSessionToken);

    // Segundo login (simulando troca de conta na mesma conexão)
    const login2 = await gateway.request('/session/login', {
        method: 'POST', body: {}, headers: { 'x-unkay-csrf': login1.csrf }
    });
    assert.equal(login2.status, 200);
    const newSessionToken = gateway.jar.get('unkay_session');
    assert.ok(newSessionToken);
    assert.notEqual(oldSessionToken, newSessionToken);

    // A sessão antiga foi destruída e não pode mais avaliar ações
    const oldRequest = await fetch(`${gateway.origin}/access/evaluate`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            cookie: `unkay_session=${oldSessionToken}; unkay_session_csrf=${login1.csrf}`,
            'x-unkay-csrf': login1.csrf
        },
        body: JSON.stringify({ action: 'files.local.read' })
    });
    assert.equal(oldRequest.status, 401);
});

test('revogação de sessões do principal via store', async t => {
    const gateway = await startGateway();
    t.after(() => gateway.close());

    const { csrf } = await loginLocal(gateway);
    const sessionToken = gateway.jar.get('unkay_session');
    const sessionData = gateway.gateway.sessions.get(sessionToken);
    assert.ok(sessionData);

    // Revoga sessões do principal
    const count = gateway.gateway.sessions.destroyPrincipal(sessionData.principal.id);
    assert.ok(count >= 1);

    // Sessão não é mais válida
    const revoked = await gateway.request('/session');
    assert.equal(revoked.json.authenticated, false);
});
