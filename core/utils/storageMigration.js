// core/utils/storageMigration.js - unkayOS 2.0
// Automatic migration of legacy localStorage virtual filesystem into the Wasm OPFS kernel

export async function migrateLegacyStorage(vfs) {
    const LEGACY_KEY = 'unkayOS_filesystem';
    const MIGRATION_FLAG = 'unkayOS_migrated_v2';

    if (typeof localStorage === 'undefined') {
        return { migrated: false, reason: 'localStorage not available' };
    }

    const alreadyMigrated = localStorage.getItem(MIGRATION_FLAG);
    const rawLegacy = localStorage.getItem(LEGACY_KEY);

    if (!rawLegacy) {
        return { migrated: false, reason: 'No legacy filesystem found' };
    }

    try {
        console.log('[Migration] Migrando dados do localStorage para o OPFS Wasm...');
        const legacyTree = JSON.parse(rawLegacy);
        const importedCount = await vfs.importLegacyTree(legacyTree);
        
        // Backup legacy data under migration backup key just in case
        localStorage.setItem('unkayOS_filesystem_v1_backup', rawLegacy);
        localStorage.removeItem(LEGACY_KEY); // Free up localStorage 5MB limit
        localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
        
        console.log(`[Migration] Migração concluída com sucesso (${importedCount} nós transferidos).`);
        return { migrated: true, count: importedCount };
    } catch (err) {
        console.error('[Migration] Falha na migração do storage legado:', err);
        return { migrated: false, error: err.message };
    }
}
