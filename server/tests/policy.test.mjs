import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAccessPolicy } from '../config.mjs';
import { createPolicy } from '../policy.mjs';

const principal = overrides => ({
    issuer: 'https://id.example.com',
    subject: 'user-1',
    id: 'principal-1',
    groups: ['members'],
    mfa: false,
    ...overrides
});

function policy(rules) {
    return createPolicy(parseAccessPolicy({ schemaVersion: 1, policyVersion: 'p1', rules }));
}

test('nega por padrão quando nenhuma regra corresponde', () => {
    const access = policy([{ id: 'known', effect: 'allow', actions: ['files.local.read'], groups: ['members'] }]);
    const decision = access.evaluate({ principal: principal(), action: 'compute.session.create' });
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, 'DEFAULT_DENY');
    assert.equal(decision.policyVersion, 'p1');
});

test('nega ação desconhecida e principal ausente', () => {
    const access = policy([{ id: 'wild', effect: 'allow', actions: ['files.*'], groups: ['members'] }]);
    assert.equal(access.evaluate({ principal: principal(), action: 'files.local.read' }).allowed, true);
    assert.equal(access.evaluate({ principal: principal(), action: 'Files.Local.Read' }).reason, 'ACTION_INVALID');
    assert.equal(access.evaluate({ principal: null, action: 'files.local.read' }).reason, 'UNAUTHENTICATED');
    assert.equal(access.evaluate({ principal: principal({ id: '' }), action: 'files.local.read' }).reason, 'UNAUTHENTICATED');
});

test('deny explícito prevalece sobre allow, inclusive com MFA', () => {
    const access = policy([
        { id: 'allow-ai', effect: 'allow', actions: ['ai.*'], groups: ['members'] },
        { id: 'block-ai', effect: 'deny', actions: ['ai.chat'], groups: ['blocked'] }
    ]);
    assert.equal(access.evaluate({ principal: principal(), action: 'ai.chat' }).allowed, true);
    const blocked = access.evaluate({ principal: principal({ groups: ['members', 'blocked'], mfa: true }), action: 'ai.chat' });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, 'DENY_RULE');
});

test('grupos, issuers e subjects são condições verificadas', () => {
    const access = policy([
        { id: 'issuer-bound', effect: 'allow', actions: ['compute.session.create'], issuers: ['https://rda.example'], groups: ['ops'] },
        { id: 'subject-bound', effect: 'allow', actions: ['settings.server.read'], subjects: ['user-1'] }
    ]);
    assert.equal(access.evaluate({ principal: principal({ issuer: 'https://rda.example', groups: ['ops'] }), action: 'compute.session.create' }).allowed, true);
    assert.equal(access.evaluate({ principal: principal({ groups: ['ops'] }), action: 'compute.session.create' }).reason, 'DEFAULT_DENY');
    assert.equal(access.evaluate({ principal: principal({ subject: 'user-2' }), action: 'settings.server.read' }).reason, 'DEFAULT_DENY');
});

test('ownership é condição da regra de allow', () => {
    const access = policy([
        { id: 'own', effect: 'allow', actions: ['compute.session.attach'], ownership: 'required' },
        { id: 'unscoped', effect: 'allow', actions: ['compute.session.list'] }
    ]);
    assert.equal(access.evaluate({
        principal: principal(), action: 'compute.session.attach', resource: { ownerId: 'principal-1' }
    }).allowed, true);
    const foreign = access.evaluate({
        principal: principal(), action: 'compute.session.attach', resource: { ownerId: 'principal-2' }
    });
    assert.equal(foreign.allowed, false);
    assert.equal(foreign.reason, 'FORBIDDEN_OWNERSHIP');
    // Another satisfied grant still authorizes the operation.
    const access2 = policy([
        { id: 'own', effect: 'allow', actions: ['compute.session.attach'], ownership: 'required' },
        { id: 'admin', effect: 'allow', actions: ['compute.session.attach'], groups: ['admins'] }
    ]);
    assert.equal(access2.evaluate({
        principal: principal({ groups: ['admins'] }), action: 'compute.session.attach', resource: { ownerId: 'other' }
    }).allowed, true);
});

test('MFA e limites compõem restrições', () => {
    const access = policy([
        { id: 'ai-1', effect: 'allow', actions: ['ai.chat'], groups: ['members'], requestsPerMinute: 40 },
        { id: 'ai-2', effect: 'allow', actions: ['ai.chat'], groups: ['members'], requireMfa: true, requestsPerMinute: 10 }
    ]);
    const withoutMfa = access.evaluate({ principal: principal(), action: 'ai.chat' });
    assert.equal(withoutMfa.allowed, true);
    assert.deepEqual(withoutMfa.restrictions, { requestsPerMinute: 40 });

    const withMfa = access.evaluate({ principal: principal({ mfa: true }), action: 'ai.chat' });
    assert.deepEqual(withMfa.restrictions, { requestsPerMinute: 10 });

    const onlyMfa = policy([{ id: 'step-up', effect: 'allow', actions: ['compute.session.create'], requireMfa: true }]);
    const denied = onlyMfa.evaluate({ principal: principal(), action: 'compute.session.create' });
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, 'MFA_REQUIRED');
});

test('recursos restringem modelo e tipo', () => {
    const access = policy([
        { id: 'model', effect: 'allow', actions: ['ai.chat'], models: ['assistant'], resourceKinds: ['ai'] }
    ]);
    assert.equal(access.evaluate({ principal: principal(), action: 'ai.chat', resource: { kind: 'ai', model: 'assistant' } }).allowed, true);
    assert.equal(access.evaluate({ principal: principal(), action: 'ai.chat', resource: { kind: 'ai', model: 'other' } }).reason, 'DEFAULT_DENY');
    assert.equal(access.evaluate({ principal: principal(), action: 'ai.chat', resource: { kind: 'files', model: 'assistant' } }).reason, 'DEFAULT_DENY');
});

test('política inválida falha na validação, não em runtime', () => {
    assert.throws(() => parseAccessPolicy({ schemaVersion: 1, policyVersion: 'p', rules: [{ id: 'x', effect: 'maybe', actions: ['a'] }] }), /Política de acesso inválida/);
    assert.throws(() => parseAccessPolicy({ schemaVersion: 1, policyVersion: 'p', rules: [{ id: 'x', effect: 'allow', actions: ['a'], extra: true }] }), /Política de acesso inválida/);
});
