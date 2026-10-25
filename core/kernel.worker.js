// core/kernel.worker.js - unkayOS 2.0 Dedicated Web Worker Kernel
// Runs Wasm microkernel and manages OPFS SyncAccessHandle storage

import initWasm, { UnkayKernel } from './wasm/pkg/unkay_kernel.js';

let kernel = null;
let opfsRoot = null;
let opfsAvailable = false;
const OPFS_SNAPSHOT_FILE = 'unkay_vfs_snapshot.json';

/**
 * Initialize WebAssembly kernel and OPFS storage
 */
async function initKernel() {
    try {
        console.log('[KernelWorker] Initializing Wasm module...');
        // In worker context, load wasm relative to pkg
        await initWasm();
        kernel = new UnkayKernel();
        console.log(`[KernelWorker] Kernel ${kernel.version()} initialized successfully`);

        // Check for OPFS availability
        if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory) {
            try {
                opfsRoot = await navigator.storage.getDirectory();
                opfsAvailable = true;
                console.log('[KernelWorker] OPFS storage available');
                await loadSnapshotFromOPFS();
            } catch (storageErr) {
                console.warn('[KernelWorker] OPFS access failed, running memory-only:', storageErr);
            }
        } else {
            console.log('[KernelWorker] Running with in-memory Wasm storage (OPFS not present)');
        }

        return {
            success: true,
            version: kernel.version(),
            opfs: opfsAvailable
        };
    } catch (err) {
        console.error('[KernelWorker] Failed to initialize kernel:', err);
        throw err;
    }
}

/**
 * Load persistent snapshot from OPFS if present
 */
async function loadSnapshotFromOPFS() {
    if (!opfsAvailable || !opfsRoot) return;
    try {
        const fileHandle = await opfsRoot.getFileHandle(OPFS_SNAPSHOT_FILE, { create: false });
        const file = await fileHandle.getFile();
        const jsonText = await file.text();
        if (jsonText && jsonText.length > 5) {
            const count = kernel.import_legacy_tree_json(jsonText);
            console.log(`[KernelWorker] Restored ${count} inodes from OPFS snapshot`);
        }
    } catch (e) {
        // File does not exist yet; normal for first boot
        console.log('[KernelWorker] No existing OPFS snapshot found; starting with default tree');
    }
}

/**
 * Persist kernel tree snapshot to OPFS
 */
async function persistSnapshotToOPFS() {
    if (!opfsAvailable || !opfsRoot || !kernel) return;
    try {
        const treeJson = kernel.export_tree_json();
        const fileHandle = await opfsRoot.getFileHandle(OPFS_SNAPSHOT_FILE, { create: true });
        
        // Use createWritable if available
        if (fileHandle.createWritable) {
            const writable = await fileHandle.createWritable();
            await writable.write(treeJson);
            await writable.close();
        } else if (fileHandle.createSyncAccessHandle) {
            const accessHandle = await fileHandle.createSyncAccessHandle();
            const encoder = new TextEncoder();
            const bytes = encoder.encode(treeJson);
            accessHandle.truncate(0);
            accessHandle.write(bytes, { at: 0 });
            accessHandle.flush();
            accessHandle.close();
        }
    } catch (err) {
        console.warn('[KernelWorker] Failed to persist snapshot to OPFS:', err);
    }
}

// Debounced auto-save
let persistTimer = null;
function schedulePersist() {
    if (!opfsAvailable) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        persistSnapshotToOPFS();
    }, 500);
}

/**
 * Handle incoming message requests from UI thread
 */
self.onmessage = async (event) => {
    const { id, op, payload } = event.data;

    try {
        switch (op) {
            case 'init': {
                const res = await initKernel();
                self.postMessage({ id, success: true, result: res });
                break;
            }

            case 'exists': {
                const exists = kernel.exists(payload.path);
                self.postMessage({ id, success: true, result: exists });
                break;
            }

            case 'stat': {
                const stat = kernel.stat(payload.path);
                self.postMessage({ id, success: true, result: stat });
                break;
            }

            case 'mkdir': {
                kernel.mkdir(payload.path, payload.recursive ?? true);
                schedulePersist();
                self.postMessage({ id, success: true });
                break;
            }

            case 'readFile': {
                const bytes = kernel.read_file(payload.path); // Uint8Array
                // Zero-copy transfer of buffer
                self.postMessage(
                    { id, success: true, result: bytes },
                    [bytes.buffer]
                );
                break;
            }

            case 'readText': {
                const text = kernel.read_text(payload.path);
                self.postMessage({ id, success: true, result: text });
                break;
            }

            case 'writeFile': {
                if (typeof payload.content === 'string') {
                    kernel.write_text(payload.path, payload.content);
                } else if (payload.content instanceof Uint8Array) {
                    kernel.write_file(payload.path, payload.content);
                } else {
                    const bytes = new Uint8Array(payload.content);
                    kernel.write_file(payload.path, bytes);
                }
                schedulePersist();
                self.postMessage({ id, success: true });
                break;
            }

            case 'readdir': {
                const entries = kernel.readdir(payload.path);
                self.postMessage({ id, success: true, result: entries });
                break;
            }

            case 'remove': {
                kernel.remove(payload.path, payload.recursive ?? false);
                schedulePersist();
                self.postMessage({ id, success: true });
                break;
            }

            case 'exportTree': {
                const json = kernel.export_tree_json();
                self.postMessage({ id, success: true, result: json });
                break;
            }

            case 'importLegacyTree': {
                const count = kernel.import_legacy_tree_json(payload.json);
                schedulePersist();
                self.postMessage({ id, success: true, result: count });
                break;
            }

            case 'flush': {
                await persistSnapshotToOPFS();
                self.postMessage({ id, success: true });
                break;
            }

            default:
                throw new Error(`Unknown kernel operation: ${op}`);
        }
    } catch (err) {
        self.postMessage({
            id,
            success: false,
            error: err.message || String(err)
        });
    }
};
