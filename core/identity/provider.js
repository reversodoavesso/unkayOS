// core/identity/provider.js
// Host-agnostic identity metadata used by the UI.
// Any SSO provider can plug in by exposing getProviderInfo() on the auth system.

export const LOCAL_PROVIDER_INFO = Object.freeze({
    id: 'local',
    label: 'Sessão local',
    providerName: 'este dispositivo',
    mode: 'local',
    supportsLogin: false,
    supportsLogout: false,
    loginLabel: null,
    accountLabel: 'dispositivo',
    connectedDescription: 'Sessão local neste dispositivo.',
    loginDescription: 'Este dispositivo funciona sem conta externa. Seus dados ficam no navegador.'
});

/**
 * Normalizes provider metadata. Missing fields fall back to a local session.
 *
 * Contract for custom SSO providers:
 *   auth.getProviderInfo() => {
 *     id, label, providerName, mode: 'sso' | 'local',
 *     supportsLogin, supportsLogout, loginLabel, accountLabel,
 *     connectedDescription, loginDescription
 *   }
 *
 * @param {{ getProviderInfo?(): object } | null | undefined} auth
 */
export function resolveProviderInfo(auth) {
    let raw = {};
    try {
        raw = auth?.getProviderInfo?.() || {};
    } catch {
        raw = {};
    }

    const mode = raw.mode === 'sso' ? 'sso' : 'local';
    const supportsLogin = typeof raw.supportsLogin === 'boolean' ? raw.supportsLogin : mode === 'sso';
    const label = raw.label || (mode === 'sso' ? 'SSO' : LOCAL_PROVIDER_INFO.label);

    return {
        ...LOCAL_PROVIDER_INFO,
        ...raw,
        mode,
        supportsLogin,
        supportsLogout: typeof raw.supportsLogout === 'boolean' ? raw.supportsLogout : mode === 'sso',
        label,
        providerName: raw.providerName || label,
        loginLabel: supportsLogin ? (raw.loginLabel || 'Entrar') : null,
        accountLabel: raw.accountLabel || (mode === 'sso' ? 'conta' : LOCAL_PROVIDER_INFO.accountLabel),
        connectedDescription: raw.connectedDescription || (mode === 'sso' ? 'Sua conta está conectada.' : LOCAL_PROVIDER_INFO.connectedDescription),
        loginDescription: raw.loginDescription || (mode === 'sso' ? 'Use neste dispositivo ou entre com sua conta. Você pode decidir depois.' : LOCAL_PROVIDER_INFO.loginDescription)
    };
}
