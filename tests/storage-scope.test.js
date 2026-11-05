import { describe, expect, it, vi } from 'vitest';
import { Kernel, defineFeature } from '../core/kernel/index.js';
import { createStorageScope, createStorageScopeFeature, STORAGE_SCOPE_KEY } from '../core/host/storageScope.js';
import { deriveStorageNamespace, normalizeStorageNamespace } from '../core/utils/storageNamespace.js';
import { createKv } from '../core/features/kv/index.js';
import { WasmFileSystem } from '../core/WasmFileSystem.js';

const principal = (overrides = {}) => ({
    id: 'principal-1',
    issuer: 'https://id.example.com',
    subject: 'user-1',
    ...overrides
});

function memoryStorage() {
    const values = new Map();
    return {
        values,
        getItem: key => (values.has(key) ? values.get(key) : null),
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
}

function vfsStub() {
    const calls = [];
    let id = null;
    return {
        calls,
        async flush() { calls.push(['flush']); },
        async switchNamespace(namespace) {
            calls.push(['switch', namespace]);
            id = namespace;
            return { namespace: id, changed: true };
        },
        async claimLegacy() { calls.push(['claimLegacy']); return { imported: false }; },
        get id() { return id; }
    };
}

function authStub(user, { providerInfo } = {}) {
    const listeners = new Map();
    return {
        getCurrentUser: () => user.value,
        getProviderInfo: () => providerInfo || { id: 'test', supportsLogin: true },
        refresh: vi.fn(async () => undefined),
        on(event, callback) {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event).add(callback);
            return () => listeners.get(event)?.delete(callback);
        },
        emit(event, payload) {
            for (const listener of [...(listeners.get(event) || [])]) listener(payload);
        }
    };
}

describe('storage namespace derivation', () => {
    it('is deterministic, opaque and differs by installation, issuer and subject', async () => {
        const first = await deriveStorageNamespace({ installationId: 'desk-1', principal: principal() });
        const again = await deriveStorageNamespace({ installationId: 'desk-1', principal: principal() });
        expect(first.id).toBe(again.id);
        expect(first.id).toMatch(/^unkayos\/v1\/[a-f0-9]{16}\/[a-f0-9]{16}\/principal$/);
        expect(first.id).not.toContain('user-1');
        expect(first.id).not.toContain('id.example.com');

        const otherSubject = await deriveStorageNamespace({ installationId: 'desk-1', principal: principal({ subject: 'user-2' }) });
        const otherIssuer = await deriveStorageNamespace({ installationId: 'desk-1', principal: principal({ issuer: 'https://other.example.com' }) });
        const otherInstall = await deriveStorageNamespace({ installationId: 'desk-2', principal: principal() });
        expect(new Set([first.id, otherSubject.id, otherIssuer.id, otherInstall.id]).size).toBe(4);
    });

    it('keeps anonymous storage stable and validates worker namespaces', async () => {
        const anonymous = await deriveStorageNamespace({ installationId: 'desk-1' });
        const again = await deriveStorageNamespace({ installationId: 'desk-1', principal: null });
        expect(anonymous.id).toBe(again.id);
        expect(anonymous.id).toContain('/anonymous/');
        expect(normalizeStorageNamespace(anonymous.id)).toEqual([...anonymous.segments]);
        expect(normalizeStorageNamespace('unkayos/v1/../x')).toBe(null);
        expect(normalizeStorageNamespace('UnkayOS')).toBe(null);
        expect(normalizeStorageNamespace('')).toBe(null);
        expect(normalizeStorageNamespace(['unkayos', 'v1', 'abc'])).toEqual(['unkayos', 'v1', 'abc']);
    });
});

describe('private storage scope', () => {
    it('switches the VFS to the principal namespace and announces it', async () => {
        const vfs = vfsStub();
        const user = { value: principal() };
        const auth = authStub(user);
        const storage = memoryStorage();
        const posted = [];
        const scope = createStorageScope({
            wasmFileSystem: vfs,
            authSystem: auth,
            deployment: { installationId: 'desk-1' },
            storage,
            channel: { postMessage: value => posted.push(value), close: () => {} },
            window: null
        });

        await scope.start();
        const expected = (await deriveStorageNamespace({ installationId: 'desk-1', principal: principal() })).id;
        expect(scope.id).toBe(expected);
        expect(vfs.calls.map(call => call[0])).toEqual(['flush', 'switch', 'claimLegacy']);
        expect(storage.getItem(STORAGE_SCOPE_KEY)).toBe(expected);
        expect(posted).toEqual([{ scope: expected }]);
        scope.destroy();
    });

    it('does not reimport legacy data or announce twice when the identity is unchanged', async () => {
        const vfs = vfsStub();
        const auth = authStub({ value: principal() });
        const storage = memoryStorage();
        const scope = createStorageScope({
            wasmFileSystem: vfs, authSystem: auth, deployment: { installationId: 'desk-1' },
            storage, channel: null, window: null
        });
        await scope.start();
        await scope.refresh('same');
        expect(vfs.calls.filter(call => call[0] === 'switch')).toHaveLength(1);
        expect(vfs.calls.filter(call => call[0] === 'claimLegacy')).toHaveLength(1);
        scope.destroy();
    });

    it('reacts to an identity change and switches to the new namespace', async () => {
        const vfs = vfsStub();
        const user = { value: principal() };
        const auth = authStub(user);
        const scope = createStorageScope({
            wasmFileSystem: vfs, authSystem: auth, deployment: { installationId: 'desk-1' },
            storage: memoryStorage(), channel: null, window: null
        });
        await scope.start();
        const first = scope.id;

        user.value = principal({ subject: 'user-2' });
        auth.emit('change', user.value);
        await scope.refresh('test');
        expect(scope.id).not.toBe(first);
        expect(vfs.calls.filter(call => call[0] === 'switch')).toHaveLength(2);
        scope.destroy();
    });

    it('does not adopt another identity namespace on a remote hint without a local session', async () => {
        const vfs = vfsStub();
        const principalValue = principal();
        const auth = {
            getCurrentUser: () => principalValue,
            refresh: vi.fn(async () => undefined),
            on: () => () => {}
        };
        const channel = { handlers: [], postMessage() {}, close() {}, set onmessage(value) { this.handlers.push(value); } };
        const scope = createStorageScope({
            wasmFileSystem: vfs, authSystem: auth, deployment: { installationId: 'desk-1' },
            storage: memoryStorage(), channel, window: null
        });
        await scope.start();
        const before = scope.id;
        channel.handlers.at(-1)({ data: { scope: 'unkayos/v1/aaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbb/principal' } });
        await new Promise(resolve => setTimeout(resolve, 20));
        // Same local principal, so re-derivation keeps the local namespace.
        expect(scope.id).toBe(before);
        expect(auth.refresh).toHaveBeenCalled();
        scope.destroy();
    });

    it('keeps the current scope and logs when the VFS refuses the switch', async () => {
        const vfs = vfsStub();
        vfs.switchNamespace = async () => { throw new Error('closed'); };
        const scope = createStorageScope({
            wasmFileSystem: vfs,
            authSystem: authStub({ value: principal() }),
            deployment: { installationId: 'desk-1' },
            storage: memoryStorage(),
            channel: null,
            window: null,
            logger: { warn: () => {}, error: () => {}, info: () => {} }
        });
        await scope.start();
        expect(scope.id).toBe(null);
        scope.destroy();
    });

    it('defers the legacy migration until a real principal exists', async () => {
        const vfs = vfsStub();
        const user = { value: null };
        const auth = authStub(user, { providerInfo: { id: 'gateway', supportsLogin: true } });
        const scope = createStorageScope({
            wasmFileSystem: vfs, authSystem: auth, deployment: { installationId: 'desk-1' },
            storage: memoryStorage(), channel: null, window: null
        });
        await scope.start();
        expect(scope.id).toContain('/anonymous/');
        expect(vfs.calls.filter(call => call[0] === 'claimLegacy')).toHaveLength(0);

        user.value = principal();
        auth.emit('change', user.value);
        await scope.refresh('login');
        expect(scope.id).toContain('/principal');
        expect(vfs.calls.filter(call => call[0] === 'claimLegacy')).toHaveLength(1);
        scope.destroy();
    });

    it('claims legacy data immediately for device-only identities', async () => {
        const vfs = vfsStub();
        const scope = createStorageScope({
            wasmFileSystem: vfs,
            authSystem: authStub({ value: null }, { providerInfo: { id: 'local', supportsLogin: false } }),
            deployment: { installationId: 'desk-1' },
            storage: memoryStorage(), channel: null, window: null
        });
        await scope.start();
        expect(scope.id).toContain('/anonymous/');
        expect(vfs.calls.filter(call => call[0] === 'claimLegacy')).toHaveLength(1);
        scope.destroy();
    });

    it('is composed as a feature after the VFS and identity', async () => {
        const vfs = vfsStub();
        const user = { value: principal() };
        const auth = authStub(user);
        const kernel = new Kernel();
        kernel.register(
            defineFeature({ id: 'wasm-vfs', provides: ['wasmFileSystem'], setup: () => ({ wasmFileSystem: vfs }) }),
            defineFeature({ id: 'auth', provides: ['authSystem'], setup: () => ({ authSystem: auth }) }),
            createStorageScopeFeature({ deployment: { installationId: 'desk-1' } })
        );
        await kernel.start();
        expect(kernel.get('storageScope').id).toContain('/principal');
        await kernel.stop();
    });
});

describe('principal-scoped key-value storage', () => {
    it('migrates legacy unscoped keys into the principal scope once', async () => {
        const storage = memoryStorage();
        const legacy = createKv({ storage, namespace: 'notes' });
        await legacy.set('theme', { mode: 'dark' });

        const scoped = createKv({ storage, namespace: 'principal-1::notes', legacyNamespace: 'notes' });
        expect(await scoped.get('theme')).toEqual({ mode: 'dark' });
        // The legacy key moved, so another principal cannot read it.
        expect(storage.values.has('unkay_kv_notes_theme')).toBe(false);
        const other = createKv({ storage, namespace: 'principal-2::notes', legacyNamespace: 'notes' });
        expect(await other.get('theme')).toBe(null);
    });

    it('writes and removes only inside the scoped namespace', async () => {
        const storage = memoryStorage();
        const first = createKv({ storage, namespace: 'principal-1::notes', legacyNamespace: 'notes' });
        const second = createKv({ storage, namespace: 'principal-2::notes', legacyNamespace: 'notes' });
        await first.set('note', 'privado');
        expect(await second.get('note')).toBe(null);
        await first.remove('note');
        expect(await first.get('note')).toBe(null);
    });
});

describe('VFS mutation ordering', () => {
    it('queues writes before a namespace switch', async () => {
        const vfs = new WasmFileSystem();
        const order = [];
        vfs.readyPromise = Promise.resolve();
        vfs.worker = {
            postMessage(message) {
                order.push(message.op);
                const pending = vfs.pendingRequests.get(message.id);
                setTimeout(() => pending?.resolve(message.op === 'switchNamespace' ? { namespace: message.payload.namespace } : undefined), 0);
            }
        };
        const write = vfs.writeFile('/home/guest/a.txt', 'conteúdo');
        const switched = vfs.switchNamespace('unkayos/v1/aaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbb/principal');
        await Promise.all([write, switched]);
        expect(order).toEqual(['writeFile', 'switchNamespace']);
        expect(vfs.namespace).toBe('unkayos/v1/aaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbb/principal');
        expect(vfs.currentPath).toBe('/home/guest');
    });
});

