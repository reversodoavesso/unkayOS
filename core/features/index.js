// core/features/index.js
// Barrel for the built-in, host-agnostic features and a registration helper.

import { createKv, createMemoryStorage, kvFeature } from './kv/index.js';
import { createAuth, mapUserTier, authFeature } from './auth/index.js';
import { createFs, fsFeature } from './fs/index.js';
import { createAi, aiFeature } from './ai/index.js';
import { createPackages, packagesFeature } from './packages/index.js';
import { createWindow, windowFeature } from './window/index.js';
import { createContextMenu, contextMenuFeature } from './context-menu/index.js';
import { createShortcuts, shortcutsFeature } from './shortcuts/index.js';

export {
    createKv,
    createMemoryStorage,
    kvFeature,
    createAuth,
    mapUserTier,
    authFeature,
    createFs,
    fsFeature,
    createAi,
    aiFeature,
    createPackages,
    packagesFeature,
    createWindow,
    windowFeature,
    createContextMenu,
    contextMenuFeature,
    createShortcuts,
    shortcutsFeature
};

/** Built-in features in declaration order (the kernel resolves real order). */
export const coreFeatures = Object.freeze([
    kvFeature,
    authFeature,
    fsFeature,
    aiFeature,
    packagesFeature,
    windowFeature,
    contextMenuFeature,
    shortcutsFeature
]);

/**
 * Registers every built-in feature on a kernel.
 *
 * @param {{ register(...features: unknown[]): unknown }} kernel
 * @returns {unknown}
 */
export function registerCoreFeatures(kernel) {
    return kernel.register(coreFeatures);
}
