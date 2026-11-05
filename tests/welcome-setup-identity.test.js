// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WelcomeSetup } from '../core/workspace/WelcomeSetup.js';

function createSession(getProviderInfo) {
    const desktop = document.createElement('div');
    document.body.appendChild(desktop);
    return {
        desktop,
        settings: { onboarding: { displayName: '' } },
        widgets: { catalog: () => [] },
        apply: vi.fn(),
        update: vi.fn(),
        auth: {
            getCurrentUser: () => null,
            getProviderInfo,
            on: vi.fn(),
            off: vi.fn(),
            login: vi.fn(async () => null)
        }
    };
}

describe('WelcomeSetup identity copy', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('never advertises RDA login in a local profile', () => {
        const setup = new WelcomeSetup(createSession(() => ({
            id: 'local',
            label: 'Sessão local',
            mode: 'local',
            supportsLogin: false,
            loginLabel: null,
            loginDescription: 'Este dispositivo funciona sem conta externa.'
        })));

        setup.show();

        expect(setup.dialog.textContent).toContain('Este dispositivo funciona sem conta externa');
        expect(setup.dialog.textContent).not.toContain('RDA');
        expect(setup.dialog.querySelector('[data-setup="login"]')).toBeNull();
        setup.destroy();
    });

    it('uses the injected provider label instead of a hardcoded SSO', () => {
        const setup = new WelcomeSetup(createSession(() => ({
            id: 'acme',
            label: 'Acme SSO',
            providerName: 'Acme',
            mode: 'sso',
            supportsLogin: true,
            supportsLogout: true,
            loginLabel: 'Entrar com Acme',
            accountLabel: 'conta Acme',
            loginDescription: 'Use o Acme para sincronizar este espaço.'
        })));

        setup.show();

        const button = setup.dialog.querySelector('[data-setup="login"]');
        expect(button).not.toBeNull();
        expect(button.textContent).toBe('Entrar com Acme');
        expect(setup.dialog.textContent).toContain('Use o Acme para sincronizar');
        expect(setup.dialog.textContent).not.toContain('RDA');
        setup.destroy();
    });
});
