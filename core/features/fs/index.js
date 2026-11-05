// core/features/fs/index.js
// File-system facade over an injected adapter. The adapter owns storage and host
// integration; this module only normalizes the public contract.

import { defineFeature } from '../../kernel/index.js';

/**
 * @param {{ adapter?: any, syncCloud?: (() => Promise<any>) | null }} [options]
 */
export function createFs(options = {}) {
    const { adapter, syncCloud = null } = options;
    if (!adapter || typeof adapter !== 'object') {
        throw new TypeError('createFs requires a file-system adapter.');
    }

    return {
        flush: () => adapter.flush(),
        /** @param {string} path */
        readFile: path => adapter.readFile(path, { encoding: 'binary' }),
        /** @param {string} path */
        readText: path => adapter.readFile(path, { encoding: 'utf8' }),
        /** @param {string} path @param {unknown} content */
        writeFile: (path, content) => adapter.writeFile(path, content),
        /** @param {string} path */
        list: path => adapter.readdir(path),
        /** @param {string} path */
        stat: path => adapter.stat(path),
        /** @param {string} path */
        exists: path => adapter.exists(path),
        /** @param {string} path @param {boolean} [recursive] */
        mkdir: (path, recursive = true) => adapter.mkdir(path, { recursive }),
        /** @param {string} path @param {boolean} [recursive] */
        remove: (path, recursive = false) => adapter.remove(path, { recursive }),
        async syncCloud() {
            if (!syncCloud) {
                throw new Error('Cloud sync is not available.');
            }
            return syncCloud();
        },
        async mountLocalDirectory() {
            if (typeof adapter.mountLocalDirectory !== 'function') {
                throw new Error('Host directory mounting is not available.');
            }
            return adapter.mountLocalDirectory();
        }
    };
}

export const fsFeature = defineFeature({
    id: 'fs',
    version: '1.0.0',
    description: 'File-system facade over an injectable adapter.',
    provides: ['fs'],
    setup: ({ config }) => ({ fs: createFs(/** @type {any} */ (config)) })
});
