import assert from 'node:assert/strict';
import test from 'node:test';
import { join, resolve } from 'node:path';
import { loadServerConfig, parseAccessPolicy, parseServerConfig, resolveSecrets, ServerConfigError } from '../config.mjs';
import { basePolicy, baseServerConfig } from './helpers.mjs';

test('configuração do servidor é estrita', () => {
    const valid = parseServerConfig(baseServerConfig());
    assert.equal(valid.installationId, 'test-install');
    assert.ok(Object.isFrozen(valid));

    assert.throws(
        () => parseServerConfig({ ...baseServerConfig(), extra: true }),
        error => error instanceof ServerConfigError && error.code === 'SERVER_CONFIG_INVALID'
    );
    assert.throws(() => parseServerConfig({ ...baseServerConfig(), schemaVersion: 2 }), /Configuração do servidor inválida/);
    assert.throws(() => parseServerConfig(baseServerConfig({ identity: { mode: 'oidc' } })), /Configuração do servidor inválida/);

    // Secrets cannot be inlined in the document.
    assert.throws(() => parseServerConfig(baseServerConfig({
        identity: {
            mode: 'oidc', issuer: 'https://id.example.com', clientId: 'client',
            clientSecretRef: 'OIDC_SECRET', clientSecret: 'inline', redirectUri: 'https://desktop.example.com/cb'
        }
    })), /Configuração do servidor inválida/);
});

test('política aceita apenas campos declarados', () => {
    assert.ok(Object.isFrozen(parseAccessPolicy(basePolicy())));
    assert.throws(() => parseAccessPolicy({ ...basePolicy(), rules: [{ id: 'r', effect: 'allow', actions: ['a'], limits: {} }] }), /Política de acesso inválida/);
    assert.throws(() => parseAccessPolicy({ schemaVersion: 1, rules: [] }), /Política de acesso inválida/);
});

test('referências de segredo resolvem do ambiente e falham fechado', () => {
    const config = parseServerConfig(baseServerConfig({
        identity: {
            mode: 'oidc', issuer: 'https://id.example.com', clientId: 'client',
            clientSecretRef: 'OIDC_SECRET', redirectUri: 'https://desktop.example.com/cb'
        },
        ai: {
            basePath: '/ai',
            models: { assistant: { upstream: 'primary', model: 'm' } },
            upstreams: { primary: { baseUrl: 'https://api.example.com/v1', apiKeyRef: 'AI_KEY', protocol: 'openai-chat' } }
        }
    }));
    assert.throws(() => resolveSecrets(config, {}), /OIDC_SECRET/);
    assert.throws(() => resolveSecrets(config, { OIDC_SECRET: 'x' }), /AI_KEY/);
    const secrets = resolveSecrets(config, { OIDC_SECRET: 'x', AI_KEY: 'y' });
    assert.equal(secrets.oidcClientSecret, 'x');
    assert.equal(secrets.upstreamKeys.primary, 'y');
    // The public document never carries the resolved values.
    assert.equal(JSON.stringify(config).includes('"y"'), false);
});

test('loader lê config e política relativas e rejeita documentos ausentes', async () => {
    const dir = resolve('/etc/unkayos');
    const configPath = join(dir, 'server.json');
    const policyPath = join(dir, 'policy.json');
    const files = {
        [configPath]: JSON.stringify(baseServerConfig()),
        [policyPath]: JSON.stringify(basePolicy())
    };
    const readFile = async path => {
        if (!Object.hasOwn(files, path)) throw new Error('ENOENT');
        return files[path];
    };
    const loaded = await loadServerConfig({ configPath, env: {}, readFile });
    assert.equal(loaded.policy.policyVersion, 'test-1');
    assert.equal(loaded.directory, dir);

    await assert.rejects(
        loadServerConfig({ configPath: join(dir, 'missing.json'), readFile }),
        error => error.code === 'SERVER_CONFIG_MISSING'
    );
    files[configPath] = '{nope';
    await assert.rejects(loadServerConfig({ configPath, readFile }), error => error.code === 'SERVER_CONFIG_JSON_INVALID');
    files[configPath] = JSON.stringify(baseServerConfig({ accessPolicy: { file: 'absent.json' } }));
    await assert.rejects(loadServerConfig({ configPath, readFile }), error => error.code === 'POLICY_MISSING');
    files[configPath] = JSON.stringify(baseServerConfig());
    files[policyPath] = '{"schemaVersion":1}';
    await assert.rejects(loadServerConfig({ configPath, readFile }), error => error.code === 'POLICY_INVALID');
});
