import { describe, it, expect, vi } from 'vitest';
import { createUnkaySDK } from '../core/sdk/unkay.js';

describe('unkayOS 2.0 Unified SDK', () => {
    it('uses explicit access and AI adapters instead of interpreting provider claims', async () => {
        const ai = { prompt: vi.fn(async () => 'Response'), stream: vi.fn() };
        const systems = {
            authSystem: { getCurrentUser: () => ({ roles: ['company-admin'] }) },
            accessPolicy: { getTier: () => 'sysadmin' },
            aiService: ai
        };
        const sdk = createUnkaySDK(null, { getSystem: name => systems[name] });
        expect(sdk.auth.getTier()).toBe('sysadmin');
        await expect(sdk.ai.prompt([{ role: 'user', content: 'Generate UI' }])).resolves.toBe('Response');
        expect(ai.prompt).toHaveBeenCalledWith([{ role: 'user', content: 'Generate UI' }], {});
    });
    it('defaults authenticated users to standard without a tier policy', () => {
        const mockAuthSystemGuest = {
            getCurrentUser: () => null
        };
        const sdkGuest = createUnkaySDK(null, {
            getSystem: (name) => (name === 'authSystem' ? mockAuthSystemGuest : null)
        });
        expect(sdkGuest.auth.getTier()).toBe('guest');

        const mockAuthSystemAdmin = {
            getCurrentUser: () => ({ username: 'demiurge_user', roles: ['demiurge'] })
        };
        const sdkAdmin = createUnkaySDK(null, {
            getSystem: (name) => (name === 'authSystem' ? mockAuthSystemAdmin : null)
        });
        expect(sdkAdmin.auth.getTier()).toBe('standard');

        const mockAuthSystemStandard = {
            getCurrentUser: () => ({ username: 'user_1', roles: ['standard'] })
        };
        const sdkStandard = createUnkaySDK(null, {
            getSystem: (name) => (name === 'authSystem' ? mockAuthSystemStandard : null)
        });
        expect(sdkStandard.auth.getTier()).toBe('standard');
    });

    it('should support KV store operations scoped to app', async () => {
        let storage = {};
        globalThis.localStorage = {
            getItem: (k) => storage[k] ?? null,
            setItem: (k, v) => { storage[k] = String(v); },
            removeItem: (k) => { delete storage[k]; }
        };

        const mockCore = { app_name: 'notes_app' };
        const sdk = createUnkaySDK(mockCore);

        await sdk.kv.set('fontSize', 16);
        expect(await sdk.kv.get('fontSize')).toBe(16);

        await sdk.kv.set('theme', { mode: 'dark' });
        expect(await sdk.kv.get('theme')).toEqual({ mode: 'dark' });

        await sdk.kv.remove('fontSize');
        expect(await sdk.kv.get('fontSize')).toBeNull();
    });
});
