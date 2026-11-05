// core/host/profiles/standalone.js
// Clean profile: no SSO, no marketplace, no RDA gateway calls.
// The local desktop, apps, VFS and settings keep working offline.

import { createUnkaySDK } from '../../sdk/unkay.js';
import { createGuestAuthSystem } from '../guestAuth.js';
import { createStorageScopeFeature } from '../storageScope.js';
import {
    RDA_ONLY_APP_OVERRIDES,
    createAppCatalogFeature,
    createAppFeaturesFeature,
    createAppManagerFeature,
    createAuthFeature,
    createBaseFeatures,
    createHostProfileFeature,
    createShellFeature
} from '../sharedFeatures.js';

export const id = 'standalone';

/**
 * @param {{ getDesktop: () => HTMLElement | null, systemManager: object, deployment?: any }} options
 */
export function createProfile({ getDesktop, systemManager, deployment }) {
    const sdk = createUnkaySDK(null, /** @type {any} */ (systemManager));

    return [
        ...createBaseFeatures({ sdk }),
        createHostProfileFeature(id, { sso: false, marketplace: false, ai: !!deployment?.bindings.ai, compute: false, rdaServices: false }),
        createAuthFeature({
            description: 'Local identity (SSO disabled).',
            create: () => createGuestAuthSystem()
        }),
        createStorageScopeFeature({ deployment }),
        createAppCatalogFeature(),
        createAppFeaturesFeature({ systemManager: /** @type {any} */ (systemManager), overrides: deployment?.bindings.ai ? { store: RDA_ONLY_APP_OVERRIDES.store } : RDA_ONLY_APP_OVERRIDES }),
        createAppManagerFeature({ getDesktop }),
        createShellFeature({ getDesktop })
    ];
}
