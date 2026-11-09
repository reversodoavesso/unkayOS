import { deployment as validateDeployment } from './validators.generated.js';

export class DeploymentError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'DeploymentError';
        this.code = code;
    }
}

/** @param {any} value */
export function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const child of Object.values(value)) deepFreeze(child);
    }
    return value;
}

/** Complete defaults, not a runtime overlay of one ecosystem on another. */
export function createDeployment(preset = 'standalone') {
    if (preset === 'neutral') preset = 'standalone';
    if (!['standalone', 'sso', 'rda'].includes(preset)) {
        throw new DeploymentError('PROFILE_UNKNOWN', 'Perfil de instalação desconhecido.');
    }
    const config = {
        schemaVersion: 1,
        installationId: 'unkayos',
        revision: 'initial-1',
        preset,
        product: { name: 'unkayOS', orgName: '', guestDomain: 'local' },
        instances: {
            account: {
                plugin: preset === 'rda' ? 'unkayos.gateway-identity' : preset === 'sso' ? 'unkayos.injected-identity' : 'unkayos.local-identity',
                config: preset === 'rda' ? { basePath: '', loginPath: '/session/login', logoutPath: '/session/logout', timeoutMs: 10000, csrfHeader: 'x-unkay-csrf' } : {}
            },
            policy: {
                plugin: preset === 'rda' ? 'rda.access' : 'unkayos.local-access',
                config: {}
            }
        },
        bindings: { identity: 'account.identity', access: 'policy.access' }
    };
    if (preset === 'rda') {
        config.instances['assistant'] = { plugin: 'rda.ai', config: {} };
        config.instances['cloud'] = { plugin: 'rda.sync', config: {} };
        config.bindings['ai'] = 'assistant.ai';
        config.bindings['sync'] = 'cloud.sync';
    }
    return resolveDeployment(config);
}

/** Strict resolved document: never merge invalid input with working defaults. @param {any} input */
export function resolveDeployment(input) {
    if (!validateDeployment(input)) {
        // Only schema paths/keywords are exposed, never configuration values.
        const paths = /** @type {any} */ (validateDeployment).errors?.map(error => `${error.instancePath || '/'} (${error.keyword})`).join(', ');
        throw new DeploymentError('CONFIG_INVALID', `Configuração de instalação inválida: ${paths}`);
    }
    return deepFreeze(JSON.parse(JSON.stringify(input)));
}

/** Only explicit legacy configuration can opt into RDA. @param {any} legacy */
export function fromLegacyDeployment(legacy) {
    if (legacy == null) return createDeployment();
    if (legacy.schemaVersion !== undefined) return resolveDeployment(legacy);
    if (legacy.branding !== 'rda' && legacy.branding !== 'neutral') {
        throw new DeploymentError('LEGACY_CONFIG_INVALID', 'Configuração legada sem branding reconhecido.');
    }
    if (legacy.branding === 'rda') {
        const legacyConfig = {
            schemaVersion: 1,
            installationId: 'unkayos',
            revision: 'legacy-rda-1',
            preset: 'rda',
            product: { name: 'unkayOS', orgName: '', guestDomain: 'local' },
            instances: {
                account: { plugin: 'rda.identity', config: {} },
                policy: { plugin: 'rda.access', config: {} },
                assistant: { plugin: 'rda.ai', config: {} },
                cloud: { plugin: 'rda.sync', config: {} }
            },
            bindings: { identity: 'account.identity', access: 'policy.access', ai: 'assistant.ai', sync: 'cloud.sync' }
        };
        return resolveDeployment(legacyConfig);
    }
    return createDeployment('standalone');
}

/**
 * Read public JSON before boot. Only a real 404 may use portable/legacy defaults.
 * @param {{ transport?: typeof fetch, legacy?: any, required?: boolean, signal?: AbortSignal }} [options]
 */
export async function loadDeployment(options = {}) {
    const { transport = globalThis.fetch, legacy, required = false, signal } = options;
    const response = await transport('/config/deployment.json', {
        cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: signal || AbortSignal.timeout(10000)
    });
    if (response.status === 404 && !required) return fromLegacyDeployment(legacy);
    if (!response.ok) throw new DeploymentError('CONFIG_HTTP_ERROR', 'Não foi possível carregar a configuração da instalação.');
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) {
        throw new DeploymentError('CONFIG_CONTENT_TYPE', 'A configuração da instalação deve ser JSON.');
    }
    let input;
    try { input = await response.json(); } catch {
        throw new DeploymentError('CONFIG_JSON_INVALID', 'JSON de instalação malformado.');
    }
    return resolveDeployment(input);
}
