import { emptyConfig, gatewayAccess, gatewayIdentity, httpAi, rolePolicy } from '../config/validators.generated.js';

const entry = (id, exports, load, validateHost = () => {}, validateConfig = emptyConfig, requires = []) => Object.freeze({
    manifest: Object.freeze({ schemaVersion: 1, id, version: '1.0.0', target: 'browser', hostApi: 1, exports, requires }),
    validateConfig,
    validateHost,
    load
});

// Factories are pinned here, never imported from URLs supplied by deployment JSON.
export const pluginCatalog = Object.freeze({
    'unkayos.local-identity': entry('unkayos.local-identity', { identity: 'identity@1' }, () => import('./localIdentity.js')),
    'unkayos.local-access': entry('unkayos.local-access', { access: 'access@1' }, () => import('./localAccess.js')),
    'unkayos.injected-identity': entry('unkayos.injected-identity', { identity: 'identity@1' }, () => import('./injectedIdentity.js'), options => {
        if (typeof options.identityProvider !== 'function') throw new Error('O perfil sso exige um identityProvider registrado no host.');
    }),
    'rda.identity': entry('rda.identity', { identity: 'identity@1' }, () => import('./rdaIdentity.js')),
    'rda.access': entry('rda.access', { access: 'access@1' }, () => import('./rdaAccess.js')),
    'unkayos.role-access': entry('unkayos.role-access', { access: 'access@1' }, () => import('./roleAccess.js'), undefined, rolePolicy),
    'unkayos.http-ai': entry('unkayos.http-ai', { ai: 'ai@1' }, () => import('./httpAi.js'), undefined, httpAi),
    'unkayos.gateway-identity': entry('unkayos.gateway-identity', { identity: 'identity@1' }, () => import('./gatewayIdentity.js'), undefined, gatewayIdentity),
    'unkayos.gateway-access': entry('unkayos.gateway-access', { access: 'access@1' }, () => import('./gatewayAccess.js'), undefined, gatewayAccess),
    'rda.ai': entry('rda.ai', { ai: 'ai@1' }, () => import('./rdaAi.js'), undefined, emptyConfig, ['identity']),
    'rda.sync': entry('rda.sync', { sync: 'sync@1' }, () => import('./rdaSync.js'), undefined, emptyConfig, ['identity'])
});
