// core/sync/MinioSyncDriver.js - unkayOS 2.0 Cloud Storage Sync (Tier 1 Standard)
// Bi-directional synchronization between local /home/user/cloud/ and MinIO Object Storage

import { wasmFileSystem } from '../WasmFileSystem.js';
import { unkay } from '../sdk/unkay.js';
import eventBus from '../eventBus.js';

const getVfs = () => (typeof window !== 'undefined' && window.wasmFileSystem) || wasmFileSystem;

export class MinioSyncDriver {
    constructor() {
        this.cloudPath = '/home/user/cloud';
        this.syncing = false;
        this.lastSync = null;
    }

    /**
     * Synchronize local cloud directory with MinIO storage
     * @returns {Promise<{success: boolean, uploaded: number, downloaded: number}>}
     */
    async sync() {
        if (this.syncing) {
            console.warn('[MinioSync] Sync already in progress');
            return { success: false, reason: 'Already in progress' };
        }

        const user = unkay.auth.getUser();
        const token = unkay.auth.getToken();

        if (!user || user.id === 'guest') {
            console.warn('[MinioSync] User must be authenticated to sync cloud storage');
            return {
                success: false,
                reason: 'Authentication required. Conecte com seu ID Reverso do Avesso.'
            };
        }

        this.syncing = true;
        eventBus.emit('cloud:sync-start', { timestamp: new Date().toISOString() });
        const vfs = getVfs();

        try {
            // Ensure cloud directory exists in local VFS
            await vfs.mkdir(this.cloudPath, { recursive: true });

            console.log(`[MinioSync] Sincronizando ${this.cloudPath} para usuário ${user.username}...`);

            // Fetch manifest from RDA Storage Gateway (/api/v1/storage/sync)
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            let remoteFiles = [];
            try {
                const res = await fetch('/api/v1/storage/unkayos/list', { headers });
                if (res.ok) {
                    const data = await res.json();
                    remoteFiles = data.files || [];
                }
            } catch (netErr) {
                console.warn('[MinioSync] Failed to fetch remote MinIO index, running offline sync:', netErr);
            }

            let downloaded = 0;
            let uploaded = 0;

            // 1. Download remote files not in local VFS
            for (const remote of remoteFiles) {
                const localFilePath = `${this.cloudPath}/${remote.name}`;
                const exists = await vfs.exists(localFilePath);
                if (!exists) {
                    try {
                        const fileRes = await fetch(`/api/v1/storage/unkayos/file?path=${encodeURIComponent(remote.path)}`, { headers });
                        if (fileRes.ok) {
                            const buffer = await fileRes.arrayBuffer();
                            await vfs.writeFile(localFilePath, new Uint8Array(buffer));
                            downloaded++;
                        }
                    } catch (dlErr) {
                        console.error(`[MinioSync] Failed to download ${remote.name}:`, dlErr);
                    }
                }
            }

            // 2. Upload local files to MinIO
            const localEntries = await vfs.readdir(this.cloudPath);
            for (const entry of localEntries) {
                if (!entry.is_dir) {
                    const existsRemote = remoteFiles.some(r => r.name === entry.name);
                    if (!existsRemote) {
                        try {
                            const data = await vfs.readFile(entry.path, { encoding: 'binary' });
                            const upRes = await fetch(`/api/v1/storage/unkayos/upload`, {
                                method: 'POST',
                                headers: {
                                    ...headers,
                                    'X-File-Name': entry.name,
                                    'Content-Type': 'application/octet-stream'
                                },
                                body: data
                            });
                            if (upRes.ok) {
                                uploaded++;
                            }
                        } catch (upErr) {
                            console.error(`[MinioSync] Failed to upload ${entry.name}:`, upErr);
                        }
                    }
                }
            }

            this.lastSync = new Date().toISOString();
            this.syncing = false;

            const summary = { success: true, uploaded, downloaded, timestamp: this.lastSync };
            eventBus.emit('cloud:sync-complete', summary);
            console.log('[MinioSync] Sincronização concluída:', summary);
            return summary;

        } catch (err) {
            this.syncing = false;
            console.error('[MinioSync] Erro na sincronização:', err);
            eventBus.emit('cloud:sync-error', { error: err.message });
            return { success: false, error: err.message };
        }
    }
}

export const minioSyncDriver = new MinioSyncDriver();
