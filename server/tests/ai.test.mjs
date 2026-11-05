import assert from 'node:assert/strict';
import test from 'node:test';
import { aiConfig, basePolicy, baseServerConfig, holdUntilClosed, loginLocal, startGateway, startUpstream } from './helpers.mjs';

const policyWithAi = overrides => basePolicy({
    rules: [
        { id: 'local-ai', effect: 'allow', actions: ['ai.chat'], groups: ['local'], ...overrides }
    ]
});

function configFor(upstreamUrl, overrides = {}) {
    return baseServerConfig({ ai: aiConfig(upstreamUrl, overrides) });
}

test('proxy de IA mantém credenciais e modelo no servidor', async t => {
    /** @type {any[]} */
    const calls = [];
    const upstream = await startUpstream(async ({ request, body }, response) => {
        calls.push({ body, authorization: request.headers.authorization });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ choices: [{ message: { content: 'olá do upstream' } }] }));
    });
    const gateway = await startGateway({ config: configFor(upstream.url) });
    t.after(async () => { await gateway.close(); await upstream.close(); });
    const { csrf } = await loginLocal(gateway);

    const response = await gateway.request('/ai/chat', {
        method: 'POST',
        body: { messages: [{ role: 'user', content: 'oi' }] },
        headers: { 'x-unkay-csrf': csrf }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.json, { reply: 'olá do upstream' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.model, 'test-model');
    assert.equal(calls[0].body.stream, false);
    assert.equal(calls[0].authorization, 'Bearer test-key');
    // The browser response never echoes the upstream credential or URL.
    assert.equal(response.text.includes('test-key'), false);
    assert.equal(response.text.includes(upstream.url), false);
});

test('IA exige sessão, CSRF e autorização do modelo', async t => {
    let calls = 0;
    const upstream = await startUpstream(async (_request, response) => {
        calls += 1;
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ choices: [{ message: { content: 'x' } }] }));
    });
    const gateway = await startGateway({
        config: configFor(upstream.url, {
            models: {
                assistant: { upstream: 'primary', model: 'test-model' },
                secret: { upstream: 'primary', model: 'secret-model' }
            }
        }),
        policy: policyWithAi({ models: ['assistant'] })
    });
    t.after(async () => { await gateway.close(); await upstream.close(); });

    const anonymous = await gateway.request('/ai/chat', {
        method: 'POST', body: { messages: [{ role: 'user', content: 'oi' }] }
    });
    assert.equal(anonymous.status, 401);

    const { csrf } = await loginLocal(gateway);
    const noCsrf = await gateway.request('/ai/chat', {
        method: 'POST', body: { messages: [{ role: 'user', content: 'oi' }] }
    });
    assert.equal(noCsrf.status, 403);

    const forbidden = await gateway.request('/ai/chat', {
        method: 'POST', body: { messages: [{ role: 'user', content: 'oi' }], model: 'secret' },
        headers: { 'x-unkay-csrf': csrf }
    });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.json.error.code, 'FORBIDDEN');
    assert.equal(calls, 0, 'nenhuma chamada ao upstream quando a política nega');

    const unknown = await gateway.request('/ai/chat', {
        method: 'POST', body: { messages: [{ role: 'user', content: 'oi' }], model: 'missing' },
        headers: { 'x-unkay-csrf': csrf }
    });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.json.error.code, 'MODEL_NOT_FOUND');
});

test('valida mensagens e limita o corpo', async t => {
    const upstream = await startUpstream(async (_request, response) => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ choices: [{ message: { content: 'x' } }] }));
    });
    const gateway = await startGateway({ config: configFor(upstream.url) });
    t.after(async () => { await gateway.close(); await upstream.close(); });
    const { csrf } = await loginLocal(gateway);

    for (const messages of [[], [{ role: 'tool', content: 'x' }], [{ role: 'user', content: '' }]]) {
        const response = await gateway.request('/ai/chat', {
            method: 'POST', body: { messages }, headers: { 'x-unkay-csrf': csrf }
        });
        assert.equal(response.status, 400);
        assert.equal(response.json.error.code, 'INVALID_MESSAGES');
    }
});

test('erro do upstream tem código estável e não faz fallback', async t => {
    let calls = 0;
    const upstream = await startUpstream(async (_request, response) => {
        calls += 1;
        response.writeHead(503, { 'Content-Type': 'text/plain' });
        response.end('unavailable');
    });
    const gateway = await startGateway({ config: configFor(upstream.url) });
    t.after(async () => { await gateway.close(); await upstream.close(); });
    const { csrf } = await loginLocal(gateway);

    const response = await gateway.request('/ai/chat', {
        method: 'POST', body: { messages: [{ role: 'user', content: 'oi' }] }, headers: { 'x-unkay-csrf': csrf }
    });
    assert.equal(response.status, 502);
    assert.equal(response.json.error.code, 'UPSTREAM_ERROR');
    assert.equal(calls, 1, 'um único upstream, sem fallback silencioso');
});

test('stream traduz SSE para texto simples', async t => {
    const upstream = await startUpstream(async ({ body }, response) => {
        assert.equal(body.stream, true);
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.write('data: {"choices":[{"delta":{"content":"Olá"}}]}\n\n');
        response.write('data: {"choices":[{"delta":{"content":" mundo"}}]}\n\n');
        response.end('data: [DONE]\n\n');
    });
    const gateway = await startGateway({ config: configFor(upstream.url) });
    t.after(async () => { await gateway.close(); await upstream.close(); });
    const { csrf } = await loginLocal(gateway);

    const response = await fetch(`${gateway.origin}/ai/chat/stream`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-unkay-csrf': csrf,
            cookie: gateway.jar.header()
        },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'oi' }] })
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/plain/);
    assert.equal(await response.text(), 'Olá mundo');
});

test('cancelamento sem stream também interrompe o upstream', async t => {
    let upstreamClosed = false;
    const upstream = await startUpstream(async (_request, response) => {
        response.on('close', () => { upstreamClosed = true; });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        await holdUntilClosed(response);
        if (!response.writableEnded) response.end('{"choices":[]}');
    });
    const gateway = await startGateway({ config: configFor(upstream.url, { timeoutMs: 10000 }) });
    t.after(async () => { await gateway.close(); await upstream.close(); });
    const { csrf } = await loginLocal(gateway);

    const controller = new AbortController();
    const pending = fetch(`${gateway.origin}/ai/chat`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-unkay-csrf': csrf, cookie: gateway.jar.header() },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'oi' }] })
    }).catch(() => null);
    await new Promise(resolve => setTimeout(resolve, 100));
    controller.abort();
    await pending;
    const deadline = Date.now() + 2000;
    while (!upstreamClosed && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(upstreamClosed, true, 'o upstream deve ser abortado quando o cliente desconecta');
});

test('cancelamento do cliente interrompe o upstream', async t => {
    let upstreamClosed = false;
    const upstream = await startUpstream(async (_request, response) => {
        response.on('close', () => { upstreamClosed = true; });
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.write('data: {"choices":[{"delta":{"content":"primeiro"}}]}\n\n');
        await holdUntilClosed(response);
        if (!response.writableEnded) response.end();
    });
    const gateway = await startGateway({ config: configFor(upstream.url, { timeoutMs: 10000 }) });
    t.after(async () => { await gateway.close(); await upstream.close(); });
    const { csrf } = await loginLocal(gateway);

    const controller = new AbortController();
    const response = await fetch(`${gateway.origin}/ai/chat/stream`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
            'content-type': 'application/json',
            'x-unkay-csrf': csrf,
            cookie: gateway.jar.header()
        },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'oi' }] })
    });
    const reader = response.body.getReader();
    const first = await reader.read();
    assert.equal(new TextDecoder().decode(first.value), 'primeiro');
    controller.abort();
    const deadline = Date.now() + 2000;
    while (!upstreamClosed && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(upstreamClosed, true, 'o upstream deve ser abortado quando o cliente desconecta');
    await reader.cancel().catch(() => {});
});

test('timeout do upstream vira 504 TIMEOUT', async t => {
    const upstream = await startUpstream(async (_request, response) => {
        await holdUntilClosed(response);
        if (!response.writableEnded) response.end();
    });
    const gateway = await startGateway({ config: configFor(upstream.url, { timeoutMs: 150 }) });
    t.after(async () => { await gateway.close(); await upstream.close(); });
    const { csrf } = await loginLocal(gateway);

    const started = Date.now();
    const response = await gateway.request('/ai/chat', {
        method: 'POST', body: { messages: [{ role: 'user', content: 'oi' }] }, headers: { 'x-unkay-csrf': csrf }
    });
    assert.equal(response.status, 504);
    assert.equal(response.json.error.code, 'TIMEOUT');
    assert.ok(Date.now() - started < 3000);
});

test('quota por minuto é aplicada no servidor', async t => {
    const upstream = await startUpstream(async (_request, response) => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    });
    const gateway = await startGateway({
        config: configFor(upstream.url),
        policy: policyWithAi({ requestsPerMinute: 2 })
    });
    t.after(async () => { await gateway.close(); await upstream.close(); });
    const { csrf } = await loginLocal(gateway);
    const send = () => gateway.request('/ai/chat', {
        method: 'POST', body: { messages: [{ role: 'user', content: 'oi' }] }, headers: { 'x-unkay-csrf': csrf }
    });
    assert.equal((await send()).status, 200);
    assert.equal((await send()).status, 200);
    const limited = await send();
    assert.equal(limited.status, 429);
    assert.equal(limited.json.error.code, 'QUOTA_EXCEEDED');
});

