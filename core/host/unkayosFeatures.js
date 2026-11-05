// core/host/unkayosFeatures.js
// Host profile selector. The heavy composition lives in ./profiles/* and is
// loaded dynamically so the standalone build never evaluates RDA SSO modules.

import { createDeployment, resolveDeployment } from './config/deployment.js';
import { composePlugins, planPlugins } from './plugins/compose.js';
import { pluginCatalog } from './plugins/catalog.js';

const PROFILE_LOADERS = Object.freeze({
    rda: () => import('./profiles/rda.js'),
    standalone: () => import('./profiles/standalone.js'),
    sso: () => import('./profiles/sso.js')
});

export const HOST_PROFILES = Object.freeze(Object.keys(PROFILE_LOADERS));

/**
 * Resolves the active host profile.
 * Runtime configuration is authoritative even when modules are copied without bundling.
 *
 * @param {string} [explicit]
 * @returns {'rda' | 'standalone' | 'sso'}
 */
export function resolveProfileName(explicit) {
    return createDeployment(explicit).preset;
}

/**
 * Builds the host feature list for the active profile.
 *
 * @param {object} options
 * @param {string} [options.profile]
 * @param {any} [options.deployment]
 * @param {() => any} [options.identityProvider]
 * @param {() => HTMLElement | null} options.getDesktop
 * @param {object} options.systemManager
 * @returns {Promise<object[]>}
 */
export async function createUnkayosFeatures(options) {
    const deployment = options.deployment ? resolveDeployment(options.deployment) : createDeployment(options.profile);
    // Fail before even importing the legacy profile or a plugin module.
    planPlugins(deployment, pluginCatalog);
    const plugins = await composePlugins(deployment, pluginCatalog, { identityProvider: options.identityProvider });
    const module = await PROFILE_LOADERS[deployment.preset]();
    const features = module.createProfile({ ...options, deployment, identityProvider: options.identityProvider || (() => null) });
    return [...features.filter(feature => feature.id !== 'auth'), ...plugins];
}
