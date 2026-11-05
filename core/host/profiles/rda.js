// core/host/profiles/rda.js
// Configured profile: RDA SSO, marketplace and the canonical SDK.

import { AuthSystem } from '../../AuthSystem.js';
import { PackageManager } from '../../sdk/PackageManager.js';
import { createUnkaySDK } from '../../sdk/unkay.js';
import { createStorageScopeFeature } from '../storageScope.js';
import {
    createAppCatalogFeature,
    createAppFeaturesFeature,
    createAppManagerFeature,
    createAuthFeature,
    createBaseFeatures,
    createHostProfileFeature,
    createShellFeature
} from '../sharedFeatures.js';

export const id = 'rda';

/**
 * @param {{ getDesktop: () => HTMLElement | null, systemManager: any, deployment?: any, identityProvider?: () => Promise<object> | object }} options
 */
export function createProfile({ getDesktop, systemManager, identityProvider, deployment }) {
    const packages = {
        id: 'packages',
        provides: ['packageManager'],
        requires: ['appManager', 'unkaySDK', 'appFeatureRegistry'],
        setup: async context => {
            const sdk = /** @type {any} */ (context.require('unkaySDK'));
            const packageManager = new PackageManager({
                fs: sdk.fs,
                auth: sdk.auth,
                appManager: context.require('appManager'),
                appFeatureRegistry: context.require('appFeatureRegistry')
            });
            await packageManager.refresh({ catalog: false });
            return { packageManager };
        }
    };

    return [
        ...createBaseFeatures({ sdk: createUnkaySDK(null, systemManager) }),
        createHostProfileFeature(id, { sso: true, marketplace: true, ai: !!deployment?.bindings.ai, compute: true, rdaServices: true }),
        createAuthFeature({
            description: 'RDA SSO session.',
            create: async () => {
                if (typeof identityProvider === 'function') {
                    return identityProvider();
                }
                const authSystem = new AuthSystem();
                await authSystem.ready;
                return authSystem;
            }
        }),
        createStorageScopeFeature({ deployment }),
        createAppCatalogFeature(),
        createAppFeaturesFeature({ systemManager }),
        createAppManagerFeature({ getDesktop }),
        packages,
        createShellFeature({ getDesktop })
    ];
}
