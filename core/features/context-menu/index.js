// core/features/context-menu/index.js
// Context-menu facade over a host-supplied provider.

import { defineFeature } from '../../kernel/index.js';

/**
 * @param {object} [options]
 * @param {{ register?(target: unknown, builder?: unknown): () => void, open?(items: unknown, options?: object): unknown, close?(): unknown } | null} [options.provider]
 */
export function createContextMenu(options = {}) {
    const provider = options.provider || {};

    return {
        /** @param {unknown} target @param {unknown} [builder] */
        register(target, builder = null) {
            return provider.register?.(target, builder) || (() => {});
        },
        /** @param {unknown} items @param {object} [menuOptions] */
        open(items, menuOptions = {}) {
            return provider.open?.(items, menuOptions);
        },
        close() {
            return provider.close?.();
        }
    };
}

export const contextMenuFeature = defineFeature({
    id: 'context-menu',
    version: '1.0.0',
    description: 'Context-menu facade over a host-supplied menu provider.',
    provides: ['context-menu'],
    setup: ({ config }) => ({ 'context-menu': createContextMenu(config) })
});
