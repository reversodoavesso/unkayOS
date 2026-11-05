// core/host/profiles/sso.js
// Bring-your-own SSO profile. It keeps the local desktop, disables RDA services
// and delegates identity entirely to an injected provider.

import { createUnkaySDK } from '../../sdk/unkay.js';
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

export const id = 'sso';

/**
 * @param {{
 *   getDesktop: () => HTMLElement | null,
 *   systemManager: object,
 *   identityProvider?: () => Promise<object> | object
 *   deployment?: any
 * }} options
 */
export function createProfile({ getDesktop, systemManager, identityProvider, deployment }) {
    if (typeof identityProvider !== 'function') {
        throw new Error('O perfil "sso" exige um identityProvider. Defina window.__UNKAY_IDENTITY_PROVIDER__ antes do boot.');
    }

    const sdk = createUnkaySDK(null, /** @type {any} */ (systemManager));

    return [
        ...createBaseFeatures({ sdk }),
        createHostProfileFeature(id, { sso: true, marketplace: false, ai: !!deployment?.bindings.ai, compute: false, rdaServices: false }),
        createAuthFeature({
            description: 'Injected SSO provider.',
            create: () => identityProvider()
        }),
        createStorageScopeFeature({ deployment }),
        createAppCatalogFeature(),
        createAppFeaturesFeature({ systemManager: /** @type {any} */ (systemManager), overrides: deployment?.bindings.ai ? { store: RDA_ONLY_APP_OVERRIDES.store } : RDA_ONLY_APP_OVERRIDES }),
        createAppManagerFeature({ getDesktop }),
        createShellFeature({ getDesktop })
    ];
}
