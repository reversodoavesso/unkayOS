// core/features/packages/index.js
// Package manager facade. The manager (catalog, install state, launcher) is injected.

import { defineFeature } from '../../kernel/index.js';

/**
 * @param {{ manager?: object | null }} [options]
 */
export function createPackages(options = {}) {
    const { manager = null } = options;

    function requireManager() {
        if (!manager) {
            throw new Error('Gerenciador de pacotes indisponível.');
        }
        return manager;
    }

    return {
        list: () => requireManager().list(),
        /** @param {string} id */
        status: id => requireManager().getStatus(id),
        /** @param {object} [refreshOptions] */
        refresh: refreshOptions => requireManager().refresh(refreshOptions),
        /** @param {string} id */
        install: id => requireManager().install(id),
        /** @param {object} bundle */
        installLocal: bundle => requireManager().installLocal(bundle),
        /** @param {string} id */
        uninstall: id => requireManager().uninstall(id),
        /** @param {string} id */
        open: id => requireManager().open(id),
        /** @param {(state: unknown) => void} listener */
        subscribe: listener => requireManager().subscribe(listener),
        getCatalogError: () => requireManager().catalogError
    };
}

export const packagesFeature = defineFeature({
    id: 'packages',
    version: '1.0.0',
    description: 'Package manager facade over an injected catalog/launcher.',
    provides: ['packages'],
    setup: ({ config }) => ({ packages: createPackages(/** @type {any} */ (config)) })
});
