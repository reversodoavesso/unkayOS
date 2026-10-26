// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { AppCore } from '../core/AppCore.js';

describe('Application timer lifecycle', () => {
  it('returns native handles and removes completed or cancelled timers', async () => {
    vi.useFakeTimers();
    try {
      const core = new AppCore({ id: 'timer-app', app_name: 'Timer App', mode: 'headless' });
      core.appInstance = { onRun: vi.fn() };
      await core.run(document.createElement('div'));
      const callback = vi.fn();
      const timeout = core.standardAPIs.setTimeout(callback, 10);
      expect(core.managedTimeouts.has(timeout)).toBe(true);
      vi.advanceTimersByTime(10);
      expect(callback).toHaveBeenCalledOnce();
      expect(core.managedTimeouts.size).toBe(0);
      const interval = core.standardAPIs.setInterval(callback, 10);
      expect(core.managedIntervals.has(interval)).toBe(true);
      core.standardAPIs.clearInterval(interval);
      expect(core.managedIntervals.size).toBe(0);
      vi.advanceTimersByTime(50);
      expect(callback).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
});
