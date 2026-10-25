import { describe, it, expect, beforeEach, vi } from 'vitest';
import { migrateLegacyStorage } from '../core/utils/storageMigration.js';

describe('unkayOS 2.0 Storage Migration', () => {
    let mockStorage = {};
    let mockVfs;

    beforeEach(() => {
        mockStorage = {};
        globalThis.localStorage = {
            getItem: vi.fn((key) => mockStorage[key] || null),
            setItem: vi.fn((key, val) => { mockStorage[key] = String(val); }),
            removeItem: vi.fn((key) => { delete mockStorage[key]; })
        };

        mockVfs = {
            importLegacyTree: vi.fn(async (tree) => Object.keys(tree).length)
        };
    });

    it('should skip migration if no legacy key exists', async () => {
        const result = await migrateLegacyStorage(mockVfs);
        expect(result.migrated).toBe(false);
        expect(mockVfs.importLegacyTree).not.toHaveBeenCalled();
    });

    it('should migrate legacy filesystem and clear localStorage', async () => {
        const legacyTree = {
            "/home/user/test.txt": {
                type: "file",
                content: "sample text"
            }
        };

        mockStorage['unkayOS_filesystem'] = JSON.stringify(legacyTree);

        const result = await migrateLegacyStorage(mockVfs);
        expect(result.migrated).toBe(true);
        expect(result.count).toBe(1);
        expect(mockVfs.importLegacyTree).toHaveBeenCalledWith(legacyTree);

        // Original key removed to free 5MB limit
        expect(mockStorage['unkayOS_filesystem']).toBeUndefined();
        // Backup saved
        expect(mockStorage['unkayOS_filesystem_v1_backup']).toBeDefined();
        // Migration flag set
        expect(mockStorage['unkayOS_migrated_v2']).toBeDefined();
    });
});
