// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import SettingsApp from '../apps/settings/main.js';
import { AppFeatureRegistry } from '../core/apps/index.js';

function createRegistry() {
    return new AppFeatureRegistry({ isCapabilityAvailable: capability => capability !== 'ai' }).register(
        { id: 'terminal', path: '/apps/terminal/', optionalRequires: ['ai'], metadata: { name: 'Terminal' } },
        { id: 'settings', path: '/apps/settings/', locked: true, metadata: { name: 'Configurações' } }
    );
}

describe('Settings app feature panel', () => {
    let root;
    let registry;

    beforeEach(() => {
        document.body.innerHTML = '';
        registry = createRegistry();
        root = document.createElement('div');
        root.innerHTML = '<div id="appFeatureList"></div><p id="appFeatureStatus"></p>';
        document.body.appendChild(root);
    });

    function createApp() {
        const app = new SettingsApp(
            { instanceId: 'settings-inst', app_name: 'Settings', mode: 'system_window' },
            {
                setTimeout,
                clearTimeout,
                appFeatureRegistry: registry,
                auth: { getCurrentUser: () => null }
            },
            root,
            document.body
        );
        app.bindAppFeatureSettings();
        return app;
    }

    it('renders the registry with locked and optional states', () => {
        createApp();

        const rows = root.querySelectorAll('[data-app-feature]');
        expect(rows).toHaveLength(2);
        const terminal = root.querySelector('[data-app-feature="terminal"]');
        const settings = root.querySelector('[data-app-feature="settings"]');
        expect(terminal.checked).toBe(true);
        expect(settings.disabled).toBe(true);
        expect(root.querySelector('#appFeatureStatus').textContent).toContain('2 de 2');
        expect(terminal.closest('.widget-setting-row').querySelector('small').textContent).toContain('Opcional: ai');
    });

    it('toggles an app through the registry and re-renders', () => {
        createApp();

        const terminal = root.querySelector('[data-app-feature="terminal"]');
        terminal.checked = false;
        terminal.dispatchEvent(new Event('change', { bubbles: true }));

        expect(registry.isEnabled('terminal')).toBe(false);
        expect(root.querySelector('#appFeatureStatus').textContent).toContain('Desabilitado');
        const terminalRow = root.querySelector('[data-app-feature="terminal"]').closest('.widget-setting-row');
        expect(terminalRow.textContent).toContain('Oculto');
    });

    it('restores the checkbox when the registry rejects a change', () => {
        createApp();

        const settings = root.querySelector('[data-app-feature="settings"]');
        settings.disabled = false;
        settings.checked = false;
        settings.dispatchEvent(new Event('change', { bubbles: true }));

        expect(settings.checked).toBe(true);
        expect(root.querySelector('#appFeatureStatus').textContent).toContain('locked');
    });
});
