// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeAppFailure, formatAppDiagnostic, renderAppLoadError } from '../core/ui/appLoadError.js';
import { AppCore } from '../core/AppCore.js';

const failure = overrides => describeAppFailure({ appName: 'OpenUI Studio', appId: 'openui', error: new Error('Module failed'), stage: 'module', resource: '/apps/openui/main.js', online: true, ...overrides });
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.useRealTimers(); });
describe('Recoverable application failures', () => {
  it('separates startup and resource failures, with an offline explanation when applicable', () => {
    expect(failure().code).toBe('APP_MODULE_LOAD_FAILED');
    expect(failure({ stage: 'start' }).code).toBe('APP_START_FAILED');
    expect(failure({ stage: 'css' }).stage).toContain('estilos');
    expect(failure({ online: false }).description).toContain('sem conexão');
  });
  it('renders untrusted details as text and removes URL credentials, query strings and fragments from diagnostics', () => {
    const f = failure({ appName: '<img src=x onerror=alert(1)>', resource: 'https://user:pass@example.org/app.js?token=secret#private', error: new Error('Failed https://user:pass@example.org/app.js?token=secret#private <script>bad()</script>') });
    const host = document.createElement('main'); document.body.appendChild(host);
    renderAppLoadError(host, f, { onRetry: vi.fn(), onClose: vi.fn() });
    expect(host.querySelector('img,script')).toBeNull();
    expect(host.querySelector('h2').textContent).toContain('<img');
    expect(formatAppDiagnostic(f)).not.toMatch(/secret|private|user:pass/);
    expect(host.querySelector('details').open).toBe(false);
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });
  it('prevents duplicate retries and supports closing, explicit reload and copying the actual diagnosis', async () => {
    let resolveRetry;
    const onRetry = vi.fn(() => new Promise(resolve => { resolveRetry = resolve; }));
    const onClose = vi.fn(), onReload = vi.fn(), copy = vi.fn().mockResolvedValue(undefined);
    const host = document.createElement('main'); document.body.appendChild(host); const f = failure();
    renderAppLoadError(host, f, { onRetry, onClose, onReload, copy });
    const buttons = [...host.querySelectorAll('button')];
    buttons[0].click(); buttons[0].click(); expect(onRetry).toHaveBeenCalledOnce(); expect(buttons[0].disabled).toBe(true);
    resolveRetry(); await Promise.resolve(); await Promise.resolve(); expect(buttons[0].disabled).toBe(false);
    buttons.find(b => b.textContent === 'Fechar').click(); expect(onClose).toHaveBeenCalledOnce();
    buttons.find(b => b.textContent.includes('Copiar diagnóstico')).click(); await Promise.resolve();
    expect(copy).toHaveBeenCalledWith(formatAppDiagnostic(f)); expect(host.querySelector('[role="status"]').textContent).toContain('copiado');
    buttons.find(b => b.textContent === 'Recarregar sistema').click(); expect(onReload).toHaveBeenCalledOnce();
  });
  it('allows another recovery action after a retry fails', async () => {
    const host = document.createElement('main'); document.body.appendChild(host);
    renderAppLoadError(host, failure(), { onRetry: vi.fn().mockRejectedValue(new Error('failed')), onClose: vi.fn() });
    const retry = host.querySelector('button'); retry.click(); await Promise.resolve(); await Promise.resolve();
    expect(retry.disabled).toBe(false); expect(host.querySelector('[role="status"]').textContent).toContain('Recarregue');
  });
  it('cleans managed work even if a partially initialized app throws during cleanup', async () => {
    vi.useFakeTimers(); vi.spyOn(console, 'warn').mockImplementation(() => {});
    const core = new AppCore({ id: 'broken' }); const cleanup = vi.fn(() => { throw new Error('cleanup failed'); });
    core.appInstance = { onCleanup: cleanup };
    core.managedIntervals.add(setInterval(() => {}, 50)); core.managedTimeouts.add(setTimeout(() => {}, 50));
    await core.cleanup(); await core.stop();
    expect(cleanup).toHaveBeenCalledOnce(); expect(core.managedIntervals.size).toBe(0); expect(core.managedTimeouts.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
