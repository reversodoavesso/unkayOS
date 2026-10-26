import eventBus from './eventBus.js';

/** Delay only the indicator, never the app. Fast opens produce no loading flash. */
export class LoadingUI {
  constructor() {
    this.activeLoadings = new Map();
    this.stateChanged = ({ instanceId, state }) => {
      if (state && !state.isLoading) this.remove(instanceId);
    };
    this.failed = ({ instanceId }) => this.remove(instanceId);
    eventBus.on('loading:state:changed', this.stateChanged);
    eventBus.on('loading:error', this.failed);
  }
  attach(instanceId, windowElement, content, appName) {
    this.remove(instanceId);
    const indicator = document.createElement('div');
    indicator.className = 'rda-progress rda-progress--sm rda-unkay-window-progress';
    indicator.dataset.type = 'line'; indicator.dataset.color = 'primary';
    indicator.dataset.indeterminate = 'true'; indicator.hidden = true;
    indicator.setAttribute('role', 'progressbar');
    indicator.setAttribute('aria-label', `Abrindo ${appName}`);
    indicator.innerHTML = '<div class="rda-progress__bar"><div class="rda-progress__fill"></div></div>';
    windowElement.insertBefore(indicator, content);
    content.setAttribute('aria-busy', 'true');
    const timer = setTimeout(() => { indicator.hidden = false; }, 150);
    this.activeLoadings.set(instanceId, { indicator, content, timer });
    return indicator;
  }
  remove(instanceId) {
    const record = this.activeLoadings.get(instanceId);
    if (!record) return;
    clearTimeout(record.timer);
    record.indicator.remove(); record.content.setAttribute('aria-busy', 'false');
    this.activeLoadings.delete(instanceId);
  }
  destroy() {
    for (const id of this.activeLoadings.keys()) this.remove(id);
    eventBus.off('loading:state:changed', this.stateChanged);
    eventBus.off('loading:error', this.failed);
  }
}
export const loadingUI = new LoadingUI();
