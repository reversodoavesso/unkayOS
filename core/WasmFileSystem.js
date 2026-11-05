// core/WasmFileSystem.js - unkayOS 2.0 Client Bridge
// Provides high-performance async VFS operations via the Wasm Dedicated Web Worker

export class WasmFileSystem {
    constructor() {
        this.worker = null;
        this.isReady = false;
        this.readyPromise = null;
        this.currentPath = '/home/guest';
        this.pendingRequests = new Map();
        this.requestIdCounter = 0;
        this.namespace = null;
        // Mutating operations and namespace switches share one chain: a switch can
        // never run between two writes, and writes never land in another scope.
        this._mutationChain = Promise.resolve();
    }

    /**
     * Initialize worker and wasm runtime.
     * @param {{ namespace?: string | readonly string[] }} [options]
     */
    async initialize(options = {}) {
        if (this.readyPromise) return this.readyPromise;

        if (options.namespace) this.namespace = options.namespace;

        this.readyPromise = new Promise((resolve, reject) => {
            try {
                // Instantiate dedicated worker
                this.worker = new Worker(
                    new URL('./kernel.worker.js', import.meta.url),
                    { type: 'module' }
                );

                this.worker.onmessage = (event) => {
                    const { id, success, result, error } = event.data;
                    const pending = this.pendingRequests.get(id);
                    if (pending) {
                        this.pendingRequests.delete(id);
                        if (success) {
                            pending.resolve(result);
                        } else {
                            pending.reject(new Error(error || 'Worker request failed'));
                        }
                    }
                };

                this.worker.onerror = (err) => {
                    console.error('[WasmFileSystem] Worker error:', err);
                    if (!this.isReady) {
                        reject(err);
                    }
                };

                // Request initialization from worker
                this._sendRequest('init', { namespace: this.namespace })
                    .then((info) => {
                        this.isReady = true;
                        this.namespace = info?.namespace || this.namespace;
                        console.log('[WasmFileSystem] Kernel ready:', info);
                        resolve(info);
                    })
                    .catch(reject);

            } catch (err) {
                console.error('[WasmFileSystem] Failed to launch worker:', err);
                reject(err);
            }
        });

        return this.readyPromise;
    }

    /**
     * @template T
     * @param {() => Promise<T>} task
     * @returns {Promise<T>}
     */
    _enqueueMutation(task) {
        const next = this._mutationChain.then(task, task);
        this._mutationChain = next.then(() => undefined, () => undefined);
        return next;
    }

    /**
     * Flush the current namespace and load another one. Resolves after every
     * queued write from the previous scope has been persisted.
     * @param {string | readonly string[]} namespace
     */
    async switchNamespace(namespace) {
        await this.readyPromise;
        if (!namespace) throw new Error('WasmFileSystem.switchNamespace requires a namespace.');
        return this._enqueueMutation(async () => {
            const info = await this._sendRequest('switchNamespace', { namespace });
            if (info?.namespace) this.namespace = info.namespace;
            this.currentPath = '/home/guest';
            return info;
        });
    }

    _sendRequest(op, payload, transferables = []) {
        return new Promise((resolve, reject) => {
            if (!this.worker) {
                return reject(new Error('WasmFileSystem worker not started'));
            }
            const id = ++this.requestIdCounter;
            this.pendingRequests.set(id, { resolve, reject });
            this.worker.postMessage({ id, op, payload }, transferables);
        });
    }

    async exists(path) {
        await this.readyPromise;
        return this._sendRequest('exists', { path: this.resolvePath(path) });
    }

    async stat(path) {
        await this.readyPromise;
        return this._sendRequest('stat', { path: this.resolvePath(path) });
    }

    async mkdir(path, options = { recursive: true }) {
        await this.readyPromise;
        const resolved = this.resolvePath(path);
        return this._enqueueMutation(() => this._sendRequest('mkdir', {
            path: resolved,
            recursive: options.recursive ?? true
        }));
    }

    async readFile(path, options = { encoding: 'utf8' }) {
        await this.readyPromise;
        const resolved = this.resolvePath(path);
        if (options && options.encoding === 'binary') {
            return this._sendRequest('readFile', { path: resolved });
        }
        return this._sendRequest('readText', { path: resolved });
    }

    async writeFile(path, content) {
        await this.readyPromise;
        const resolved = this.resolvePath(path);
        return this._enqueueMutation(() => {
            if (content instanceof Uint8Array) {
                return this._sendRequest('writeFile', { path: resolved, content }, [content.buffer]);
            }
            return this._sendRequest('writeFile', { path: resolved, content });
        });
    }

    async readdir(path = this.currentPath) {
        await this.readyPromise;
        return this._sendRequest('readdir', { path: this.resolvePath(path) });
    }

    async remove(path, options = { recursive: false }) {
        await this.readyPromise;
        const resolved = this.resolvePath(path);
        return this._enqueueMutation(() => this._sendRequest('remove', {
            path: resolved,
            recursive: options.recursive ?? false
        }));
    }

    async copy(src, dest, options = { recursive: false }) {
        await this.readyPromise;
        const srcStat = await this.stat(src);
        if (srcStat.is_dir) {
            await this.mkdir(dest, { recursive: true });
            const entries = await this.readdir(src);
            for (const entry of entries) {
                const childDest = `${this.resolvePath(dest)}/${entry.name}`;
                await this.copy(entry.path, childDest, options);
            }
        } else {
            const data = await this.readFile(src, { encoding: 'binary' });
            await this.writeFile(dest, data);
        }
    }

    async move(src, dest) {
        await this.copy(src, dest, { recursive: true });
        await this.remove(src, { recursive: true });
    }

    async exportTree() {
        await this.readyPromise;
        return this._sendRequest('exportTree', {});
    }

    async importLegacyTree(treeJsonOrObject) {
        await this.readyPromise;
        const json = typeof treeJsonOrObject === 'string'
            ? treeJsonOrObject
            : JSON.stringify(treeJsonOrObject);
        return this._enqueueMutation(() => this._sendRequest('importLegacyTree', { json }));
    }

    async claimLegacy() {
        await this.readyPromise;
        return this._enqueueMutation(() => this._sendRequest('claimLegacy', {}));
    }

    async flush() {
        await this.readyPromise;
        return this._enqueueMutation(() => this._sendRequest('flush', {}));
    }

    // Path management
    getCurrentDirectory() {
        return this.currentPath;
    }

    changeDirectory(path) {
        const resolved = this.resolvePath(path);
        this.currentPath = resolved;
        return this.currentPath;
    }

    resolvePath(path, basePath = this.currentPath) {
        if (!path || typeof path !== 'string') return basePath;
        const trimmed = path.trim();
        if (trimmed.startsWith('/')) {
            return this.normalizePath(trimmed);
        }
        return this.normalizePath(`${basePath}/${trimmed}`);
    }

    normalizePath(path) {
        if (!path || path === '/') return '/';
        const parts = path.split('/').filter(p => p && p !== '.');
        const stack = [];
        for (const part of parts) {
            if (part === '..') {
                stack.pop();
            } else {
                stack.push(part);
            }
        }
        return '/' + stack.join('/');
    }

    getBaseName(path) {
        const norm = this.normalizePath(path);
        if (norm === '/') return '';
        return norm.split('/').pop() || '';
    }

    getParentPath(path) {
        const norm = this.normalizePath(path);
        if (norm === '/') return '/';
        const idx = norm.lastIndexOf('/');
        if (idx <= 0) return '/';
        return norm.substring(0, idx);
    }

    shutdown() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
            this.isReady = false;
            this.readyPromise = null;
        }
    }
}

export const wasmFileSystem = new WasmFileSystem();

// Convenience async fs API
export const wasmFs = {
    ls: (path) => wasmFileSystem.readdir(path),
    cd: (path) => wasmFileSystem.changeDirectory(path),
    pwd: () => wasmFileSystem.getCurrentDirectory(),
    mkdir: (path, options) => wasmFileSystem.mkdir(path, options),
    rmdir: (path, options) => wasmFileSystem.remove(path, { ...options, recursive: false }),
    cat: (path) => wasmFileSystem.readFile(path),
    touch: (path, content = '') => wasmFileSystem.writeFile(path, content),
    rm: (path, options) => wasmFileSystem.remove(path, options),
    cp: (src, dest, options) => wasmFileSystem.copy(src, dest, options),
    mv: (src, dest) => wasmFileSystem.move(src, dest),
    exists: (path) => wasmFileSystem.exists(path),
    stat: (path) => wasmFileSystem.stat(path),
    normalize: (path) => wasmFileSystem.normalizePath(path),
    resolve: (path, base) => wasmFileSystem.resolvePath(path, base),
    basename: (path) => wasmFileSystem.getBaseName(path),
    dirname: (path) => wasmFileSystem.getParentPath(path)
};
