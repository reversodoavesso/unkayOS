// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
vi.mock('../core/LazyResourceLoader.js', () => ({ lazyResourceLoader: {
  loadHTMLProgressively: vi.fn(), loadCSSProgressively: vi.fn(),
  setupLazyImages: vi.fn(), setupLazyIcons: vi.fn()
} }));
import { lazyResourceLoader } from '../core/LazyResourceLoader.js';
import { AppWindowSystem } from '../core/AppWindowSystem.js';

describe('Styled window content', () => {
  it('fetches markup and CSS concurrently and never exposes markup before its stylesheet', async () => {
    let finishStyles;
    const stylesheet = new Promise(resolve => { finishStyles = resolve; });
    lazyResourceLoader.loadHTMLProgressively.mockResolvedValue('<button class="probe-control">Pronto</button>');
    lazyResourceLoader.loadCSSProgressively.mockReturnValue(stylesheet);
    const content = document.createElement('main');
    const target = { core: { dirApp: '/probe.html', styleFile: '/probe.css' }, instanceId: 'resource-probe', namespace: 'resource-probe', appContentRoot: content, namespaceCSS: source => source };
    const pending = AppWindowSystem.prototype.loadAppContent.call(target);
    await Promise.resolve();
    expect(lazyResourceLoader.loadCSSProgressively).toHaveBeenCalledWith('/probe.css', 'resource-probe');
    expect(content.children.length).toBe(0);
    finishStyles('.probe-control { border: 0; }');
    await pending;
    const style = document.getElementById('style-resource-probe');
    expect(style.textContent).toContain('border: 0');
    expect(content.querySelector('button').textContent).toBe('Pronto');
    style.remove();
  });
});
