// @vitest-environment jsdom
// tests/marketplace-sandbox.test.js - unkayOS 2.0 Marketplace & Sandbox Test Suite
// Verifies Phase 5 deliverables: Package Loader, Modern Shadow DOM Sandbox, and Store App

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppPackageLoader } from '../core/sdk/AppPackageLoader.js';
import { AppSandbox } from '../core/sdk/AppSandbox.js';

describe('unkayOS 2.0 AppPackageLoader (.unkayapp Validator)', () => {
    it('should reject manifests missing mandatory fields', () => {
        const invalid1 = {};
        const res1 = AppPackageLoader.validateManifest(invalid1);
        expect(res1.valid).toBe(false);
        expect(res1.errors.length).toBeGreaterThan(0);

        const invalid2 = { id: 'app1', name: 'App 1', version: 'invalid-ver' };
        const res2 = AppPackageLoader.validateManifest(invalid2);
        expect(res2.valid).toBe(false);
        expect(res2.errors.some(e => e.includes('SemVer'))).toBe(true);
    });

    it('should validate all 4 runtime profiles according to architectural specification', () => {
        const profiles = ['client-only', 'client-server', 'containerized', 'external-gateway'];

        for (const profile of profiles) {
            const manifest = {
                id: `test-${profile}`,
                name: `Test ${profile}`,
                version: '1.0.0',
                type: 'native',
                runtime_profile: profile,
                category: 'utilities',
                entrypoint: 'main.js'
            };
            const res = AppPackageLoader.validateManifest(manifest);
            expect(res.valid).toBe(true);

            const pkg = AppPackageLoader.loadPackage(manifest);
            expect(pkg.runtimeProfile).toBe(profile);
            expect(pkg.window.width).toBe(640);
        }
    });

    it('should reject invalid runtime profiles', () => {
        const manifest = {
            id: 'bad-profile',
            name: 'Bad Profile',
            version: '1.0.0',
            runtime_profile: 'untrusted-cloud',
            entrypoint: 'main.js'
        };
        const res = AppPackageLoader.validateManifest(manifest);
        expect(res.valid).toBe(false);
        expect(res.errors.some(e => e.includes('runtime_profile'))).toBe(true);
    });
});

describe('unkayOS 2.0 AppSandbox (Shadow DOM & Scoped SDK)', () => {
    let container;
    let mockBaseSDK;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);

        mockBaseSDK = {
            auth: {
                getTier: () => 'standard',
                getUser: () => ({ username: 'user1' }),
                getToken: () => 'token123'
            },
            fs: {
                readFile: vi.fn().mockResolvedValue('content'),
                readText: vi.fn().mockResolvedValue('content'),
                writeFile: vi.fn().mockResolvedValue(true),
                list: vi.fn().mockResolvedValue([])
            },
            kv: {
                get: vi.fn(),
                set: vi.fn()
            },
            window: {
                setTitle: vi.fn(),
                close: vi.fn()
            }
        };
    });

    it('should create shadow root and inject scoped SDK with permission enforcement', async () => {
        const mockPkg = {
            id: 'sample-tool',
            name: 'Sample Tool',
            version: '1.0.0',
            type: 'native',
            runtimeProfile: 'client-only',
            permissions: ['storage:local', 'network:fetch'] // No 'auth:session'
        };

        const sandbox = new AppSandbox(container, mockPkg, mockBaseSDK);
        sandbox.mount();

        expect(container.shadowRoot).toBeTruthy();
        const sdk = sandbox.scopedSDK;
        expect(sdk).toBeTruthy();

        // 1. Auth is restricted because 'auth:session' was not requested
        expect(sdk.auth.getTier()).toBe('guest');
        expect(sdk.auth.getUser()).toBeNull();

        // 2. Storage is allowed because 'storage:local' was granted
        await expect(sdk.fs.writeFile('settings.json', '{"bpm": 128}')).resolves.not.toThrow();
        expect(mockBaseSDK.fs.writeFile).toHaveBeenCalledWith(
            '/home/user/apps/sample-tool/data/settings.json',
            '{"bpm": 128}'
        );

        sandbox.unmount();
        expect(sandbox.isRunning).toBe(false);
    });

    it('should throw when attempting unpermitted storage access', async () => {
        const unpermittedPkg = {
            id: 'untrusted-widget',
            name: 'Untrusted Widget',
            version: '1.0.0',
            type: 'native',
            runtimeProfile: 'client-only',
            permissions: [] // No permissions granted
        };

        const sandbox = new AppSandbox(container, unpermittedPkg, mockBaseSDK);
        sandbox.mount();

        await expect(sandbox.scopedSDK.fs.writeFile('hack.txt', 'evil')).rejects.toThrow(
            /Permissão 'storage:local' não concedida/
        );

        sandbox.unmount();
    });

    it('should render OpenUI declarative applications cleanly', async () => {
        const openuiPkg = {
            id: 'declarative-dashboard',
            name: 'Dashboard RDA',
            version: '1.0.0',
            type: 'openui',
            runtimeProfile: 'client-only',
            description: 'Painel gerado via modelo de IA'
        };

        const sandbox = new AppSandbox(container, openuiPkg, mockBaseSDK);
        await sandbox.run('<div class="stat">Vendas: 42</div>');

        const body = container.shadowRoot.querySelector('#openui-body');
        expect(body).toBeTruthy();
        expect(body.innerHTML).toContain('Vendas: 42');

        sandbox.unmount();
    });

    it('keeps declared storage access inside the application data directory', async () => {
        const sandbox = new AppSandbox(container, { id: 'scoped-test', name: 'Test', type: 'openui', permissions: ['storage:local'] }, mockBaseSDK);
        sandbox.mount();
        await expect(sandbox.scopedSDK.fs.writeFile('../other/settings.json', 'evil')).rejects.toThrow('outside application');
        await expect(sandbox.scopedSDK.fs.readFile('/etc/unkay-settings.json')).rejects.toThrow('outside application');
        await expect(sandbox.scopedSDK.fs.list('/home/user/apps/scoped-test/data-other')).rejects.toThrow('outside application');
        sandbox.unmount();
    });

    it('sanitizes OpenUI markup including whitespace-prefixed specs and metadata', async () => {
        const sandbox = new AppSandbox(container, { id: 'safe-preview', name: '<img onerror=alert(1)>', description: '<script>evil()</script>', type: 'openui' }, mockBaseSDK);
        await sandbox.run('\n <h3>Generated preview</h3><img src=x onerror="alert(1)"><script>evil()</script><iframe srcdoc="evil"></iframe>');
        const root = container.shadowRoot;
        expect(root.querySelector('#openui-body').textContent).toContain('Generated preview');
        expect(root.querySelector('script, iframe, [onerror]')).toBeNull();
        expect(root.querySelector('h2').textContent).toBe('<img onerror=alert(1)>');
        sandbox.unmount();
    });
});
