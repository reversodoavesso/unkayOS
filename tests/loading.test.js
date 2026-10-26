// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoadingUI } from '../core/LoadingUI.js';
import { loadingManager } from '../core/LoadingManager.js';
import eventBus from '../core/eventBus.js';

describe('Window opening activity', () => {
  let ui, frame, content;
  beforeEach(() => {
    vi.useFakeTimers(); ui = new LoadingUI();
    frame = document.createElement('div'); content = document.createElement('main');
    frame.appendChild(content); document.body.appendChild(frame);
    loadingManager.startLoading('test-opening', 'boot');
  });
  afterEach(() => { ui.destroy(); frame.remove(); loadingManager.clearInstance('test-opening'); vi.useRealTimers(); });
  it('does not show or delay a fast app', () => {
    const line = ui.attach('test-opening', frame, content, 'Notas');
    vi.advanceTimersByTime(20); expect(line.hidden).toBe(true);
    loadingManager.completeLoading('test-opening', 'boot');
    expect(line.isConnected).toBe(false); expect(content.getAttribute('aria-busy')).toBe('false');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('shows a small indeterminate line only while the full initialization is pending', () => {
    const line = ui.attach('test-opening', frame, content, 'Notas');
    loadingManager.startLoading('test-opening', 'html');
    loadingManager.completeLoading('test-opening', 'html');
    vi.advanceTimersByTime(150);
    expect(line.hidden).toBe(false); expect(line.nextElementSibling).toBe(content);
    expect(line.getAttribute('role')).toBe('progressbar'); expect(line.hasAttribute('aria-valuenow')).toBe(false);
    loadingManager.completeLoading('test-opening', 'boot');
    expect(line.isConnected).toBe(false); expect(loadingManager.getLoadingState('test-opening')).toBeNull();
  });
  it('clears the scheduled indicator when the window closes', () => {
    const line = ui.attach('test-opening', frame, content, 'Notas'); ui.remove('test-opening');
    vi.advanceTimersByTime(1000); expect(line.isConnected).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });
  it('removes activity immediately on failure without a success animation', () => {
    const line = ui.attach('test-opening', frame, content, 'Notas');
    vi.advanceTimersByTime(200);
    eventBus.emit('loading:error', { instanceId: 'test-opening', error: new Error('failed') });
    expect(line.isConnected).toBe(false); expect(ui.activeLoadings.size).toBe(0);
  });
});
