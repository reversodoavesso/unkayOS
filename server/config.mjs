// server/config.mjs
// Private BFF configuration: strict JSON, local schemas, named secret references.
// Nothing in this module is ever served to the browser.

import { readFile as readFileDefault } from 'node:fs/promises';
import { dirname, resolve as resolvePath } from 'node:path';
import {
    accessPolicy as validateAccessPolicy,
    server as validateServer
} from '../core/host/config/validators.generated.js';

export class ServerConfigError extends Error {
    /** @param {string} code @param {string} message */
    constructor(code, message) {
        super(message);
        this.name = 'ServerConfigError';
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

/** @param {any} validator @param {any} document @param {string} label */
function assertValid(validator, document, label, code) {
    if (validator(document)) return;
    const paths = (validator.errors || [])
        .map(/** @param {any} error */ error => `${error.instancePath || '/'} (${error.keyword})`)
        .join(', ');
    throw new ServerConfigError(code, `${label} inválida: ${paths || 'documento rejeitado'}`);
}

/** @param {any} input */
export function parseServerConfig(input) {
    assertValid(validateServer, input, 'Configuração do servidor', 'SERVER_CONFIG_INVALID');
    return deepFreeze(JSON.parse(JSON.stringify(input)));
}

/** @param {any} input */
export function parseAccessPolicy(input) {
    assertValid(validateAccessPolicy, input, 'Política de acesso', 'POLICY_INVALID');
    return deepFreeze(JSON.parse(JSON.stringify(input)));
}

/** @param {string | undefined} value */
function requireSecret(env, ref) {
    const value = env[ref];
    if (typeof value !== 'string' || value.length === 0) {
        // The reference name is public configuration; the value never reaches logs.
        throw new ServerConfigError('SECRET_MISSING', `Variável de ambiente ausente para ${ref}.`);
    }
    return value;
}

/**
 * Resolve named environment references. Secrets stay out of the returned document.
 *
 * @param {any} config
 * @param {Record<string, string | undefined>} [env]
 */
export function resolveSecrets(config, env = process.env) {
    /** @type {{ oidcClientSecret?: string, upstreamKeys: Record<string, string> }} */
    const secrets = { upstreamKeys: {} };
    if (config.identity.mode === 'oidc') {
        secrets.oidcClientSecret = requireSecret(env, config.identity.clientSecretRef);
    }
    for (const [name, upstream] of Object.entries(config.ai?.upstreams || {})) {
        secrets.upstreamKeys[name] = requireSecret(env, upstream.apiKeyRef);
    }
    return Object.freeze({
        get oidcClientSecret() { return secrets.oidcClientSecret; },
        get upstreamKeys() { return Object.freeze({ ...secrets.upstreamKeys }); }
    });
}

/**
 * Read and validate both private documents. A missing or malformed policy is a
 * deployment error, never an implicit allow.
 *
 * @param {object} options
 * @param {string} options.configPath
 * @param {Record<string, string | undefined>} [options.env]
 * @param {(path: string) => Promise<string>} [options.readFile]
 */
export async function loadServerConfig(options) {
    const { configPath, env = process.env, readFile = path => readFileDefault(path, 'utf8') } = options;
    let raw;
    try {
        raw = await readFile(configPath);
    } catch {
        throw new ServerConfigError('SERVER_CONFIG_MISSING', 'Arquivo de configuração do servidor ausente.');
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new ServerConfigError('SERVER_CONFIG_JSON_INVALID', 'JSON de configuração do servidor malformado.');
    }
    const config = parseServerConfig(parsed);
    const policyPath = resolvePath(dirname(configPath), config.accessPolicy.file);
    let rawPolicy;
    try {
        rawPolicy = await readFile(policyPath);
    } catch {
        throw new ServerConfigError('POLICY_MISSING', 'Arquivo de política de acesso ausente.');
    }
    let parsedPolicy;
    try {
        parsedPolicy = JSON.parse(rawPolicy);
    } catch {
        throw new ServerConfigError('POLICY_JSON_INVALID', 'JSON de política de acesso malformado.');
    }
    const policy = parseAccessPolicy(parsedPolicy);
    const secrets = resolveSecrets(config, env);
    return { config, policy, secrets, directory: dirname(configPath) };
}

/** Values the browser may know. Metadata never includes upstream URLs or credentials. */
export function toPublicMetadata(config, policy) {
    return Object.freeze({
        installationId: config.installationId,
        revision: config.revision,
        identity: Object.freeze({
            mode: config.identity.mode,
            requiresLogin: config.identity.mode !== 'local'
        }),
        ai: config.ai ? Object.freeze({ models: Object.freeze(Object.keys(config.ai.models)), streaming: true }) : null,
        access: Object.freeze({ policyVersion: policy.policyVersion })
    });
}
