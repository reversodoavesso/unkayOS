// core/kernel.worker.js - unkayOS 2.0 Dedicated Web Worker Kernel
// Runs Wasm microkernel and manages OPFS SyncAccessHandle storage.
// The snapshot lives inside a per-installation/per-principal namespace so two
// identities never share the same VFS tree in this browser.

import initWasm, { UnkayKernel } from './wasm/pkg/unkay_kernel.js';
import { normalizeStorageNamespace } from './utils/storageNamespace.js';

let kernel = null;
let opfsRoot = null;
let opfsAvailable = false;
const LEGACY_SNAPSHOT_FILE = 'unkay_vfs_snapshot.json';
const SNAPSHOT_FILE = 'vfs-snapshot.json';
const MIGRATION_MARKER = 'legacy-migrated.json';
// Portable fallback used only until the host resolves installation and principal.
let namespaceSegments = ['unkayos', 'v1', 'default', 'anonymous', 'principal'];
const normalizeNamespace = normalizeStorageNamespace;

/** @returns {Promise<FileSystemDirectoryHandle>} */
async function namespaceDirectory(create = true) {
    let directory = opfsRoot;
    for (const segment of namespaceSegments) {
        directory = await directory.getDirectoryHandle(segment, { create });
    }
    return directory;
}

/** Migration marker shared by every namespace of this installation. */
async function metaDirectory(create = true) {
    let directory = opfsRoot;
    for (const segment of namespaceSegments.slice(0, 2)) {
        directory = await directory.getDirectoryHandle(segment, { create });
    }
    return directory;
}

async function snapshotHandle(create) {
    const directory = await namespaceDirectory(create);
    return directory.getFileHandle(SNAPSHOT_FILE, { create });
}

async function writeTextFile(handle, text) {
    if (handle.createWritable) {
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        return;
    }
    if (handle.createSyncAccessHandle) {
        const accessHandle = await handle.createSyncAccessHandle();
        const bytes = new TextEncoder().encode(text);
        accessHandle.truncate(0);
        accessHandle.write(bytes, { at: 0 });
        accessHandle.flush();
        accessHandle.close();
        return;
    }
    throw new Error('OPFS handle does not support writing.');
}

/**
 * Initialize WebAssembly kernel and OPFS storage
 */
async function initKernel(namespace) {
    try {
        console.log('[KernelWorker] Initializing Wasm module...');
        // In worker context, load wasm relative to pkg
        await initWasm();
        kernel = new UnkayKernel();
        console.log(`[KernelWorker] Kernel ${kernel.version()} initialized successfully`);

        const normalized = normalizeNamespace(namespace);
        if (normalized) namespaceSegments = normalized;

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
            opfs: opfsAvailable,
            namespace: namespaceSegments.join('/')
        };
    } catch (err) {
        console.error('[KernelWorker] Failed to initialize kernel:', err);
        throw err;
    }
}

/**
 * Load the snapshot of the active namespace. Legacy root snapshots from older
 * releases are imported explicitly by the host (`claimLegacy`), after the
 * installation/principal namespace is known.
 */
async function loadSnapshotFromOPFS() {
    if (!opfsAvailable || !opfsRoot) return;
    try {
        const fileHandle = await snapshotHandle(false);
        const file = await fileHandle.getFile();
        const jsonText = await file.text();
        if (jsonText && jsonText.length > 5) {
            const count = kernel.import_legacy_tree_json(jsonText);
            console.log(`[KernelWorker] Restored ${count} inodes from ${namespaceSegments.join('/')}`);
        }
    } catch {
        // Namespace snapshot does not exist yet; the kernel keeps its default tree.
    }
}

/**
 * Import the pre-namespace snapshot exactly once per installation. The legacy
 * file stays untouched as a backup and is never loaded into a second identity.
 */
async function claimLegacySnapshot() {
    if (!opfsAvailable || !opfsRoot) return { imported: false, reason: 'opfs_unavailable' };
    try {
        const meta = await metaDirectory(true);
        try {
            await meta.getFileHandle(MIGRATION_MARKER, { create: false });
            return { imported: false, reason: 'already_migrated' };
        } catch {
            // Marker absent: legacy data was never imported in this installation.
        }
        const legacyHandle = await opfsRoot.getFileHandle(LEGACY_SNAPSHOT_FILE, { create: false });
        const legacyText = await (await legacyHandle.getFile()).text();
        if (!legacyText || legacyText.length <= 5) return { imported: false, reason: 'no_legacy_snapshot' };
        const count = kernel.import_legacy_tree_json(legacyText);
        await persistSnapshotToOPFS();
        await writeTextFile(await meta.getFileHandle(MIGRATION_MARKER, { create: true }), JSON.stringify({
            migratedAt: new Date().toISOString(),
            from: LEGACY_SNAPSHOT_FILE,
            namespace: namespaceSegments.join('/'),
            inodes: count
        }));
        console.log(`[KernelWorker] Migrated ${count} legacy inodes into ${namespaceSegments.join('/')}`);
        return { imported: true, count, namespace: namespaceSegments.join('/') };
    } catch {
        // No legacy snapshot or a read-only filesystem.
        return { imported: false, reason: 'unavailable' };
    }
}

/**
 * Persist kernel tree snapshot to OPFS
 */
async function persistSnapshotToOPFS() {
    if (!opfsAvailable || !opfsRoot || !kernel) return;
    try {
        const treeJson = kernel.export_tree_json();
        await writeTextFile(await snapshotHandle(true), treeJson);
    } catch (err) {
        console.warn('[KernelWorker] Failed to persist snapshot to OPFS:', err);
    }
}

/** Switch identity namespace: flush the old tree and load the new one. */
async function switchNamespace(value) {
    const normalized = normalizeNamespace(value);
    if (!normalized) throw new Error('Invalid storage namespace.');
    if (normalized.join('/') === namespaceSegments.join('/')) {
        return { namespace: namespaceSegments.join('/'), opfs: opfsAvailable, changed: false };
    }
    await persistSnapshotToOPFS();
    kernel = new UnkayKernel();
    namespaceSegments = normalized;
    await loadSnapshotFromOPFS();
    return { namespace: namespaceSegments.join('/'), opfs: opfsAvailable, changed: true };
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
                const res = await initKernel(payload?.namespace);
                self.postMessage({ id, success: true, result: res });
                break;
            }

            case 'switchNamespace': {
                const res = await switchNamespace(payload?.namespace);
                self.postMessage({ id, success: true, result: res });
                break;
            }

            case 'claimLegacy': {
                const res = await claimLegacySnapshot();
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
