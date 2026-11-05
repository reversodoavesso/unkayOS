// core/features/shortcuts/index.js
// System shortcut facade over an injected keyboard registry.

import { defineFeature } from '../../kernel/index.js';

/**
 * @param {object} [options]
 * @param {{ getSystemShortcuts?(): unknown[] } | null} [options.keyboard]
 */
export function createShortcuts(options = {}) {
    const keyboard = options.keyboard || {};
    return {
        listSystemShortcuts() {
            return keyboard.getSystemShortcuts?.() || [];
        }
    };
}

export const shortcutsFeature = defineFeature({
    id: 'shortcuts',
    version: '1.0.0',
    description: 'System shortcuts facade over an injected keyboard registry.',
    provides: ['shortcuts'],
    setup: ({ config }) => ({ shortcuts: createShortcuts(config) })
});
