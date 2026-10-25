import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MinioSyncDriver } from '../core/sync/MinioSyncDriver.js';

describe('unkayOS 2.0 MinIO Cloud Sync Driver', () => {
    let driver;

    beforeEach(() => {
        driver = new MinioSyncDriver();
    });

    it('should require authentication to sync cloud storage', async () => {
        globalThis.window = {
            authSystem: {
                getCurrentUser: () => null
            }
        };

        const result = await driver.sync();
        expect(result.success).toBe(false);
        expect(result.reason).toContain('Authentication required');
    });

    it('should sync files with remote MinIO manifest when authenticated', async () => {
        const mockUser = { id: 'usr-123', username: 'demiurge_user', roles: ['demiurge'] };
        const localCreatedFiles = [];

        globalThis.window = {
            authSystem: {
                getCurrentUser: () => mockUser,
                getAuthToken: () => 'fake-jwt-token'
            },
            wasmFileSystem: {
                mkdir: vi.fn(async () => {}),
                exists: vi.fn(async (path) => path.includes('already_local.txt')),
                readdir: vi.fn(async () => [
                    { name: 'already_local.txt', is_dir: false, path: '/home/user/cloud/already_local.txt' },
                    { name: 'new_local.txt', is_dir: false, path: '/home/user/cloud/new_local.txt' }
                ]),
                readFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
                writeFile: vi.fn(async (path, data) => {
                    localCreatedFiles.push({ path, length: data.length });
                })
            }
        };

        // Mock fetch for remote manifest and upload
        let uploadedCount = 0;
        globalThis.fetch = vi.fn(async (url) => {
            if (url.includes('/list')) {
                return {
                    ok: true,
                    json: async () => ({
                        files: [
                            { name: 'already_local.txt', path: 'already_local.txt' },
                            { name: 'remote_only.txt', path: 'remote_only.txt' }
                        ]
                    })
                };
            }
            if (url.includes('/file?path=remote_only.txt')) {
                return {
                    ok: true,
                    arrayBuffer: async () => new Uint8Array([9, 8, 7]).buffer
                };
            }
            if (url.includes('/upload')) {
                uploadedCount++;
                return { ok: true, json: async () => ({ status: 'ok' }) };
            }
            return { ok: false, statusText: 'Not Found' };
        });

        const result = await driver.sync();
        expect(result.success).toBe(true);
        expect(result.downloaded).toBe(1); // remote_only.txt was downloaded
        expect(result.uploaded).toBe(1);   // new_local.txt was uploaded
        expect(localCreatedFiles.length).toBe(1);
        expect(localCreatedFiles[0].path).toBe('/home/user/cloud/remote_only.txt');
    });
});
