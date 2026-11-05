import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startGateway } from './helpers.mjs';

async function staticSite() {
    const root = await mkdtemp(join(tmpdir(), 'unkay-static-'));
    await mkdir(join(root, 'assets'), { recursive: true });
    await mkdir(join(root, 'config'), { recursive: true });
    await writeFile(join(root, 'index.html'), '<!doctype html><title>unkayOS</title>');
    await writeFile(join(root, 'assets', 'main-abc123.js'), 'export const x = 1;');
    await writeFile(join(root, 'config', 'deployment.json'), '{"schemaVersion":1}');
    return root;
}

test('servidor estático opcional entrega o artefato com cache e SPA fallback', async t => {
    const root = await staticSite();
    const gateway = await startGateway({ staticRoot: root });
    t.after(async () => { await gateway.close(); await rm(root, { recursive: true, force: true }); });

    const index = await gateway.request('/');
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-type'), /^text\/html/);
    assert.match(index.text, /unkayOS/);
    assert.equal(index.headers.get('cache-control'), 'no-cache');

    const asset = await gateway.request('/assets/main-abc123.js');
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type'), /^text\/javascript/);
    assert.match(asset.headers.get('cache-control'), /immutable/);

    const config = await gateway.request('/config/deployment.json');
    assert.equal(config.status, 200);
    assert.equal(config.headers.get('cache-control'), 'no-store');

    const route = await gateway.request('/apps/openui');
    assert.equal(route.status, 200);
    assert.match(route.text, /unkayOS/);

    const missingAsset = await gateway.request('/assets/missing.js');
    assert.equal(missingAsset.status, 404);

    const head = await gateway.request('/assets/main-abc123.js', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.text, '');
});

test('servidor estático não permite traversal nem apaga as rotas da API', async t => {
    const root = await staticSite();
    const outside = join(root, '..', `outside-${process.pid}.txt`);
    await writeFile(outside, 'must not escape');
    const gateway = await startGateway({ staticRoot: root });
    t.after(async () => { await gateway.close(); await rm(root, { recursive: true, force: true }); await rm(outside, { force: true }); });

    // WHATWG URL normalizes encoded dot segments; the file above the root must
    // never be returned by any form of the request.
    for (const candidate of ['/%2e%2e/outside.txt', '/..%2foutside.txt', `/${encodeURIComponent('../outside.txt')}`]) {
        const traversal = await gateway.request(candidate);
        assert.equal(traversal.text.includes('must not escape'), false, `traversal via ${candidate}`);
        if (traversal.status === 200) {
            assert.match(traversal.text, /unkayOS/, 'apenas o shell da SPA pode ser servido');
        }
    }

    // API routes keep precedence over files even if a file has the same name.
    await writeFile(join(root, 'session'), 'shadow');
    const session = await gateway.request('/session');
    assert.equal(session.status, 200);
    assert.equal(session.json.authenticated, false);
});

test('sem --static o gateway continua respondendo 404 para arquivos', async t => {
    const root = await staticSite();
    const gateway = await startGateway();
    t.after(async () => { await gateway.close(); await rm(root, { recursive: true, force: true }); });
    const response = await gateway.request('/index.html');
    assert.equal(response.status, 404);
    assert.equal(response.json.error.code, 'NOT_FOUND');
});
