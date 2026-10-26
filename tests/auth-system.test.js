// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthSystem } from '../core/AuthSystem.js';

describe('OIDC callback and session integration', () => {
  let auth;
  beforeEach(async () => {
    localStorage.clear();
    auth = new AuthSystem();
    await auth.ready;
  });
  afterEach(() => {
    window.removeEventListener('message', auth.messageHandler);
    window.removeEventListener('storage', auth.storageHandler);
    vi.restoreAllMocks();
  });

  it('does not authenticate a cached profile without a validated token', () => {
    localStorage.setItem('unkayos_user_data', '{"roles":["sysadmin"]}');
    auth.loadStoredTokens();
    expect(auth.getCurrentUser()).toBeNull();
    expect(auth.getAuthToken()).toBeNull();
  });

  it('rejects a missing, mismatched or replayed OAuth state before token exchange', async () => {
    const exchange = vi.spyOn(auth, 'exchangeCodeForTokens').mockResolvedValue({ access_token: 'token' });
    vi.spyOn(auth, 'getUserInfo').mockResolvedValue({ name: 'SSO User' });
    localStorage.setItem('unkayos_oauth_state', 'expected');
    expect(await auth.handleAuthCallback('code', 'wrong')).toBe(false);
    expect(exchange).not.toHaveBeenCalled();
    expect(await auth.handleAuthCallback('code', 'expected')).toBe(true);
    expect(auth.getCurrentUser()).toEqual({ name: 'SSO User' });
    expect(await auth.handleAuthCallback('code', 'expected')).toBe(false);
    expect(exchange).toHaveBeenCalledOnce();
  });

  it('receives the callback over storage when COOP removes the popup opener', async () => {
    const exchange = vi.spyOn(auth, 'exchangeCodeForTokens').mockResolvedValue({ access_token: 'token' });
    vi.spyOn(auth, 'getUserInfo').mockResolvedValue({ name: 'Isolated popup user' });
    localStorage.setItem('unkayos_oauth_state', 'isolated-state');
    window.dispatchEvent(new StorageEvent('storage', { key: 'unkayos_oauth_callback', newValue: JSON.stringify({ type: 'AUTH_CALLBACK', state: 'isolated-state', code: 'code' }) }));
    await vi.waitFor(() => expect(auth.getCurrentUser()?.name).toBe('Isolated popup user'));
    expect(exchange).toHaveBeenCalledWith('code');
  });

  it('reports a blocked SSO popup instead of creating a fake login', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    await expect(auth.login()).rejects.toThrow('janela de autenticação');
    expect(auth.isAuthenticated).toBe(false);
  });
});
