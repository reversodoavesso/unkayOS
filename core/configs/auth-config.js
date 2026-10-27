// /core/configs/auth-config.js - unkayOS 2.0 Identity & Zitadel OIDC Configuration
// Configuração do provedor de identidade do ecossistema Reverso do Avesso (Zitadel)

export const AUTH_CONFIG = {
    // Provedor central Zitadel do ecossistema RDA
    baseUrl: 'https://id.reversodoavesso.com',

    // ID do cliente OAuth2/OIDC
    clientId: '',

    // URI de redirecionamento (PKCE)
    redirectUri: typeof window !== 'undefined' ? window.location.origin + '/auth/callback.html' : 'https://unkayos.reversodoavesso.com/auth/callback.html',

    // Escopos do RDA: perfil, email e roles da organização Zitadel
    scope: 'openid profile email urn:zitadel:iam:org:project:roles',

    settings: {
        tokenExpiry: 3600,
        refreshTokenExpiry: 86400,
        appName: 'unkayOS',
        appDescription: 'Sistema Operacional Web unkayOS 2.0 (RDA Ecosystem)'
    }
};

/**
 * Endpoints padrão OpenID Connect (OIDC) do Zitadel
 */
export const ZITADEL_ENDPOINTS = {
    authorize: '/oauth/v2/authorize',
    token: '/oauth/v2/token',
    userinfo: '/oidc/v1/userinfo',
    logout: '/oidc/v1/end_session',
    discovery: '/.well-known/openid-configuration'
};

// Alias de retrocompatibilidade
export const AUTHENTIK_ENDPOINTS = ZITADEL_ENDPOINTS;

export const DEV_CONFIG = {
    debug: false,
    devBaseUrl: 'http://localhost:8080',
    devClientId: 'dev-unkayos-client'
};

export function getAuthConfig() {
    const runtime = globalThis.__UNKAYOS_DEPLOYMENT__?.oidc;
    const config = { ...AUTH_CONFIG };
    if (runtime && typeof runtime.clientId === 'string' && /^[a-zA-Z0-9_.@-]+$/.test(runtime.clientId) &&
        typeof runtime.projectId === 'string' && /^[a-zA-Z0-9_-]+$/.test(runtime.projectId)) {
        config.clientId = runtime.clientId;
        config.scope += ` offline_access urn:zitadel:iam:org:project:id:${runtime.projectId}:aud`;
    }
    if (typeof window !== 'undefined') {
        const isLocalDev = window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1';

        if (isLocalDev && DEV_CONFIG.debug) {
            console.log('[AuthConfig] Modo de desenvolvimento local detectado');
            return {
                ...config,
                baseUrl: DEV_CONFIG.devBaseUrl,
                clientId: DEV_CONFIG.devClientId
            };
        }
    }

    return config;
}

export function validateAuthConfig(config) {
    const errors = [];

    if (!config.baseUrl) {
        errors.push('baseUrl não configurada');
    }
    if (!config.clientId) {
        errors.push('clientId não configurado');
    }
    if (!config.redirectUri) {
        errors.push('redirectUri não configurada');
    }

    if (errors.length > 0) {
        console.error('[AuthConfig] Erros de configuração:', errors);
        return false;
    }

    return true;
}
