// core/features/kv/index.js
// Namespaced key-value storage over any Storage-compatible backend.
// No access to `window`, `localStorage` or unkayOS internals.

import { defineFeature } from '../../kernel/index.js';

/**
 * Minimal in-memory Storage implementation used when no backend is provided.
 *
 * @returns {{ getItem(key: string): string | null, setItem(key: string, value: string): void, removeItem(key: string): void }}
 */
export function createMemoryStorage() {
    const values = new Map();
    return {
        getItem: key => (values.has(key) ? values.get(key) : null),
        setItem: (key, value) => {
            values.set(key, String(value));
        },
        removeItem: key => {
            values.delete(key);
        }
    };
}

/**
 * @param {object} [options]
 * @param {{ getItem(key: string): string | null, setItem(key: string, value: string): void, removeItem(key: string): void } | null} [options.storage]
 * @param {string} [options.namespace]
 * @param {string} [options.prefix]
 * @param {string} [options.legacyNamespace] Pre-namespace scope read once for backward compatibility.
 */
export function createKv(options = {}) {
    const { storage = null, namespace = 'global', prefix = 'unkay_kv', legacyNamespace = null } = options;
    const backend = storage || createMemoryStorage();

    /** @param {string} key */
    const keyOf = key => `${prefix}_${namespace}_${key}`;
    const legacyKeyOf = key => `${prefix}_${legacyNamespace}_${key}`;

    /** @param {string} raw */
    const parse = raw => {
        try {
            return JSON.parse(raw);
        } catch {
            return raw;
        }
    };

    return {
        /** @param {string} key */
        async get(key) {
            const raw = backend.getItem(keyOf(key));
            if (raw !== null && raw !== undefined) return parse(raw);
            if (!legacyNamespace || legacyNamespace === namespace) return null;
            const legacy = backend.getItem(legacyKeyOf(key));
            if (legacy === null || legacy === undefined) return null;
            // Complete the migration lazily: the value moves to the private scope.
            const value = parse(legacy);
            backend.setItem(keyOf(key), typeof value === 'string' ? value : JSON.stringify(value));
            backend.removeItem(legacyKeyOf(key));
            return value;
        },
        /** @param {string} key @param {unknown} value */
        async set(key, value) {
            const serialized = typeof value === 'string' ? value : JSON.stringify(value);
            backend.setItem(keyOf(key), serialized);
            if (legacyNamespace && legacyNamespace !== namespace) backend.removeItem(legacyKeyOf(key));
        },
        /** @param {string} key */
        async remove(key) {
            backend.removeItem(keyOf(key));
            if (legacyNamespace && legacyNamespace !== namespace) backend.removeItem(legacyKeyOf(key));
        }
    };
}

export const kvFeature = defineFeature({
    id: 'kv',
    version: '1.0.0',
    description: 'Namespaced key-value storage with an injectable backend.',
    provides: ['kv'],
    setup: ({ config }) => ({ kv: createKv(config) })
});
