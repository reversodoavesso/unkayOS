// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Kernel, defineFeature } from '../core/kernel/index.js';
import { createStorageScopeFeature } from '../core/host/storageScope.js';
import { create as createRolePolicy } from '../core/host/plugins/roleAccess.js';
import { createUnkaySDK } from '../core/sdk/unkay.js';
import { createKv } from '../core/features/kv/index.js';
import { WorkspaceSession } from '../core/workspace/WorkspaceSession.js';
import { PackageManager } from '../core/sdk/PackageManager.js';
import { AppSandbox } from '../core/sdk/AppSandbox.js';

function createScopedVfsStub() {
  const namespaces = new Map();
  let current = null;
  const bucket = () => {
    if (!namespaces.has(current)) namespaces.set(current, new Map());
    return namespaces.get(current);
  };
  return {
    namespaces,
    get id() { return current; },
    async flush() {},
    async switchNamespace(namespace) {
      current = namespace;
      if (!namespaces.has(namespace)) namespaces.set(namespace, new Map());
      return { namespace, changed: true };
    },
    async claimLegacy() { return { imported: false }; },
    async mkdir() {},
    async exists(path) { return bucket().has(path); },
    async readFile(path) {
      if (!bucket().has(path)) throw new Error('ENOENT');
      return bucket().get(path);
    },
    async readText(path) { return this.readFile(path); },
    async writeFile(path, data) { bucket().set(path, String(data)); },
    async list(path) {
      return [...bucket().keys()]
        .filter(k => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/'))
        .map(k => ({ name: k.slice(path.length + 1) }));
    },
    async remove(path) {
      for (const k of [...bucket().keys()]) {
        if (k === path || k.startsWith(path + '/')) bucket().delete(k);
      }
    }
  };
}

function createMemoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    clear: () => map.clear()
  };
}

afterEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
  document.documentElement.removeAttribute('data-theme');
  vi.restoreAllMocks();
});

if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal ??= function showModal() { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close ??= function close() { this.removeAttribute('open'); };
}

describe('D5 appearance isolation, account switch, ACL invariants & app trust boundary', () => {
  it('appearance changes and forged storage never elevate ACLs or leak private VFS/KV storage across principals', async () => {
    const vfs = createScopedVfsStub();
    const userState = { value: { id: 'p-alice', issuer: 'https://id.example.com', subject: 'alice', roles: ['viewer'] } };
    const listeners = new Set();
    const auth = {
      getCurrentUser: () => userState.value,
      getAuthToken: () => 'session-cookie-only',
      getProviderInfo: () => ({ id: 'oidc', supportsLogin: true, supportsLogout: true }),
      refresh: async () => undefined,
      on: (_ev, cb) => { listeners.add(cb); return () => listeners.delete(cb); },
      off: (_ev, cb) => listeners.delete(cb)
    };
    const { access } = createRolePolicy({ config: { tierRoles: { sysadmin: ['archon'], adept: ['weaver'] } } });

    const kernel = new Kernel();
    kernel.register(
      defineFeature({ id: 'wasm-vfs', provides: ['wasmFileSystem'], setup: () => ({ wasmFileSystem: vfs }) }),
      defineFeature({ id: 'auth', provides: ['authSystem', 'accessPolicy'], setup: () => ({ authSystem: auth, accessPolicy: access }) }),
      createStorageScopeFeature({ deployment: { installationId: 'desk-d5' } })
    );
    await kernel.start();

    const scope = kernel.get('storageScope');
    const aliceNamespace = scope.id;
    expect(aliceNamespace).toContain('/principal');
    await vfs.writeFile('/home/user/secret.txt', 'alice-private-secret');

    const storage = createMemoryStorage();
    const aliceKv = createKv({ storage, namespace: `${userState.value.id}::notes`, legacyNamespace: 'notes' });
    await aliceKv.set('diary', 'alice-only');

    const desktop = document.createElement('div');
    desktop.id = 'desktop';
    document.body.appendChild(desktop);
    const session = new WorkspaceSession({ desktop, appManager: { runningApps: new Map(), loadedAppDetails: new Map() }, fs: vfs, auth, profile: 'local' });
    await session.initialize();

    const sdkAlice = createUnkaySDK(null, { getSystem: name => kernel.get(name) });
    expect(sdkAlice.auth.getTier()).toBe('standard');
    expect(await sdkAlice.access.can('compute.session.create')).toBe(false);

    // Mutate theme, accent, wallpaper and inject forged privilege hints in device appearance cache
    await session.update({
      appearance: {
        theme: 'light',
        accent: 'magma',
        wallpaper: '#0a0a0a',
        role: 'sysadmin',
        tier: 'demiurge'
      }
    });
    localStorage.setItem('unkayos_tier', 'sysadmin');

    expect(sdkAlice.auth.getTier()).toBe('standard');
    expect(await sdkAlice.access.can('compute.session.create')).toBe(false);
    expect(desktop.dataset.unkayAccent).toBe('magma');
    expect(document.documentElement.dataset.theme).toBe('light');

    // Switch principal from Alice -> Bob
    userState.value = { id: 'p-bob', issuer: 'https://id.example.com', subject: 'bob', roles: ['guest'] };
    for (const listener of [...listeners]) listener(userState.value);
    await scope.refresh('account-switch');

    const bobNamespace = scope.id;
    expect(bobNamespace).not.toBe(aliceNamespace);
    await expect(vfs.readFile('/home/user/secret.txt')).rejects.toThrow('ENOENT');

    const bobKv = createKv({ storage, namespace: `${userState.value.id}::notes`, legacyNamespace: 'notes' });
    expect(await bobKv.get('diary')).toBeNull();
    await bobKv.set('diary', 'bob-only');

    // Changing appearance while Bob is active writes only inside Bob's namespace & keeps ACL locked
    await session.update({ appearance: { theme: 'dark', accent: 'cobalt', wallpaper: 'linear-gradient(145deg, #0a0a0a, #111827)' } });
    expect(sdkAlice.auth.getTier()).toBe('standard');
    expect(await vfs.readFile('/home/user/secret.txt').catch(() => null)).toBeNull();
    expect(vfs.namespaces.get(aliceNamespace).get('/home/user/secret.txt')).toBe('alice-private-secret');
    expect(await aliceKv.get('diary')).toBe('alice-only');

    await session.destroy();
    await kernel.stop();
  });

  it('enforces the OpenUI client-only sandbox boundary and keeps third-party native packages blocked', async () => {
    const vfs = createScopedVfsStub();
    await vfs.switchNamespace('unkayos/v1/test/principal');
    await vfs.writeFile('/etc/unkay-settings.json', JSON.stringify({ appearance: { accent: 'nebula' } }));

    const appManager = { loadedAppDetails: new Map(), runningApps: new Map(), runApp: vi.fn(), stopApp: vi.fn() };
    const auth = { getTier: () => 'standard', getToken: () => null };
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        apps: [{
          id: 'app-third-party-js',
          status: 'approved',
          manifest: {
            id: 'third-party-js',
            name: 'Third Party Native',
            version: '1.0.0',
            type: 'native',
            runtime_profile: 'client-only',
            required_tier: 'guest',
            category: 'utilities',
            entrypoint: 'main.js'
          },
          installation: { available: true }
        }]
      })
    }));

    const pm = new PackageManager({ fs: vfs, appManager, auth, fetcher });
    await pm.refresh();
    expect(pm.getStatus('third-party-js').canInstall).toBe(false);
    expect(pm.getStatus('third-party-js').reasons.join(' ')).toMatch(/runtime isolado/i);
    await expect(pm.install('third-party-js')).rejects.toThrow(/runtime isolado/i);
    await expect(pm.installLocal({
      format: 'unkayapp-v1',
      manifest: { id: 'evil-native', name: 'Evil', version: '1.0.0', type: 'native', runtime_profile: 'client-only', category: 'utilities', entrypoint: 'evil.js' },
      files: { 'evil.js': 'window.pwned = true;' }
    })).rejects.toThrow(/OpenUI locais/i);

    const openuiBundle = {
      format: 'unkayapp-v1',
      manifest: { id: 'safe-openui', name: 'Safe UI', version: '1.0.0', type: 'openui', runtime_profile: 'client-only', required_tier: 'guest', category: 'utilities', permissions: ['storage:local'] },
      files: { 'spec.openui': '<div><h3>Carteira</h3><script>window.pwned=true</script><img src=x onerror="window.pwned=true"></div>' }
    };
    await pm.installLocal(openuiBundle);
    expect(pm.getStatus('safe-openui').canOpen).toBe(true);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const baseSdk = {
      auth: { getTier: () => 'standard', getUser: () => ({ id: 'p-1' }) },
      fs: vfs,
      kv: { get: vi.fn(), set: vi.fn() },
      window: { setTitle: vi.fn(), close: vi.fn() }
    };
    const sandbox = new AppSandbox(host, openuiBundle.manifest, baseSdk);
    await sandbox.run(openuiBundle.files['spec.openui']);
    expect(host.getAttribute('data-rda-product')).toBeNull();
    expect(host.shadowRoot.querySelector('.app-container').getAttribute('data-rda-product')).toBe('base');
    expect(host.shadowRoot.querySelector('script, [onerror]')).toBeNull();
    expect(window.pwned).toBeUndefined();
    await expect(sandbox.scopedSDK.fs.readFile('/etc/unkay-settings.json')).rejects.toThrow('outside application');
    sandbox.unmount();
  });
});
