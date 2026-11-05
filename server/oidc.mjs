// server/oidc.mjs
// Minimal OIDC code flow with PKCE for the BFF. Provider tokens stay on the
// server: only a normalized principal is stored. Claims come from the
// userinfo endpoint, never from an unverified token payload.

import { createHash, randomBytes as randomBytesDefault } from 'node:crypto';
import { GatewayError } from './ai.mjs';
import { principalId } from './session.mjs';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** @param {string} value */
function assertSafeEndpoint(value, label) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new GatewayError(502, 'OIDC_INVALID', `Endpoint OIDC inválido (${label}).`);
    }
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK.has(url.hostname))) {
        throw new GatewayError(502, 'OIDC_INVALID', `Endpoint OIDC exige HTTPS (${label}).`);
    }
    return url;
}

/** @param {string} value */
const trimSlash = value => value.replace(/\/+$/, '');

/**
 * @param {object} options
 * @param {any} options.config Parsed server configuration.
 * @param {string} options.clientSecret Resolved from the environment.
 * @param {typeof fetch} [options.fetchImpl]
 * @param {() => number} [options.now]
 */
export function createOidcClient({ config, clientSecret, fetchImpl = globalThis.fetch, now = Date.now }) {
    const identity = config.identity;
    if (identity.mode !== 'oidc') throw new GatewayError(500, 'OIDC_MODE_REQUIRED', 'Cliente OIDC exige identidade OIDC.');
    const issuer = trimSlash(identity.issuer);
    const scopes = identity.scopes || ['openid', 'profile', 'email'];
    const redirectUri = identity.redirectUri;
    /** @type {any} */
    let discovery = null;

    async function discover() {
        if (discovery) return discovery;
        let response;
        try {
            response = await fetchImpl(`${issuer}/.well-known/openid-configuration`, {
                headers: { Accept: 'application/json' }, redirect: 'error'
            });
        } catch {
            throw new GatewayError(502, 'OIDC_UNAVAILABLE', 'Não foi possível consultar o provedor de identidade.');
        }
        if (!response.ok) throw new GatewayError(502, 'OIDC_UNAVAILABLE', 'Provedor de identidade indisponível.');
        let document;
        try {
            document = await response.json();
        } catch {
            throw new GatewayError(502, 'OIDC_INVALID', 'Documento de descoberta OIDC inválido.');
        }
        if (trimSlash(String(document.issuer || '')) !== issuer) {
            throw new GatewayError(502, 'OIDC_ISSUER_MISMATCH', 'Issuer OIDC divergente da configuração.');
        }
        const authorization = assertSafeEndpoint(document.authorization_endpoint, 'authorization');
        const token = assertSafeEndpoint(document.token_endpoint, 'token');
        const userinfo = assertSafeEndpoint(document.userinfo_endpoint, 'userinfo');
        discovery = {
            issuer,
            authorization: authorization.toString(),
            token: token.toString(),
            userinfo: userinfo.toString()
        };
        return discovery;
    }

    /** @param {Buffer} buffer */
    const base64url = buffer => buffer.toString('base64url');

    /** @returns {Promise<{ url: string, transaction: { state: string, verifier: string, createdAt: number } }>} */
    async function begin() {
        const endpoints = await discover();
        const state = base64url(randomBytesDefault(24));
        const verifier = base64url(randomBytesDefault(32));
        const challenge = base64url(createHash('sha256').update(verifier).digest());
        const url = new URL(endpoints.authorization);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('client_id', identity.clientId);
        url.searchParams.set('redirect_uri', redirectUri);
        url.searchParams.set('scope', scopes.join(' '));
        url.searchParams.set('state', state);
        url.searchParams.set('code_challenge', challenge);
        url.searchParams.set('code_challenge_method', 'S256');
        return { url: url.toString(), transaction: { state, verifier, createdAt: now() } };
    }

    /**
     * @param {{ code: string, transaction: { verifier: string } }} input
     */
    async function complete({ code, transaction }) {
        const endpoints = await discover();
        const form = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: identity.clientId,
            client_secret: clientSecret,
            code_verifier: transaction.verifier
        });
        let tokenResponse;
        try {
            tokenResponse = await fetchImpl(endpoints.token, {
                method: 'POST',
                redirect: 'error',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
                body: form.toString()
            });
        } catch {
            throw new GatewayError(502, 'OIDC_UNAVAILABLE', 'Falha ao trocar o código de autorização.');
        }
        if (!tokenResponse.ok) {
            await tokenResponse.body?.cancel?.().catch(() => {});
            throw new GatewayError(401, 'OIDC_REJECTED', 'Código de autorização recusado.');
        }
        let tokens;
        try {
            tokens = await tokenResponse.json();
        } catch {
            throw new GatewayError(502, 'OIDC_INVALID', 'Resposta de token inválida.');
        }
        const accessToken = tokens?.access_token;
        if (typeof accessToken !== 'string' || accessToken.length < 8) {
            throw new GatewayError(502, 'OIDC_INVALID', 'Resposta de token sem access token.');
        }
        let userinfoResponse;
        try {
            userinfoResponse = await fetchImpl(endpoints.userinfo, {
                headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
                redirect: 'error'
            });
        } catch {
            throw new GatewayError(502, 'OIDC_UNAVAILABLE', 'Falha ao consultar dados do principal.');
        }
        if (!userinfoResponse.ok) {
            await userinfoResponse.body?.cancel?.().catch(() => {});
            throw new GatewayError(401, 'OIDC_REJECTED', 'Provedor recusou a consulta de identidade.');
        }
        let claims;
        try {
            claims = await userinfoResponse.json();
        } catch {
            throw new GatewayError(502, 'OIDC_INVALID', 'Resposta de identidade inválida.');
        }
        const subject = claims?.sub;
        if (typeof subject !== 'string' || subject.length === 0 || subject.length > 255) {
            throw new GatewayError(502, 'OIDC_INVALID', 'Identidade sem subject estável.');
        }
        const claimValues = claim => {
            const value = claims?.[claim];
            if (typeof value === 'string') return [value];
            if (Array.isArray(value)) return value.filter(/** @param {any} item */ item => typeof item === 'string');
            // Zitadel and some providers encode roles as an object keyed by role.
            if (value && typeof value === 'object') return Object.keys(value).slice(0, 64);
            return [];
        };
        const groups = [...new Set([
            ...claimValues(identity.groupClaim || 'groups'),
            ...claimValues(identity.roleClaim || 'roles')
        ])].slice(0, 64);
        const amr = claimValues('amr');
        const mfa = amr.some(value => ['mfa', 'webauthn', 'fido2', 'otp', 'hwk'].includes(value)) || claims?.mfa === true;
        const name = typeof claims?.name === 'string' && claims.name.length <= 120
            ? claims.name
            : (typeof claims?.preferred_username === 'string' ? claims.preferred_username.slice(0, 120) : '');
        return Object.freeze({
            issuer,
            subject,
            id: principalId(issuer, subject),
            name,
            groups: Object.freeze(groups),
            mfa
        });
    }

    return { begin, complete, discover };
}

