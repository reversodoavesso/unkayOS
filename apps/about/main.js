import { BaseApp } from '../../core/BaseApp.js';
import { currentRelease } from '../../core/release-info.js';
import { renderReleaseNotes } from '../../core/ui/releaseNotes.js';
import { iconMarkup } from '../../core/ui/designSystem.js';
import { workspaceIcon } from '../../core/deployment.js';
export default class AboutApp extends BaseApp {
  onRun() {
    this.$('[data-about-icon]').innerHTML = iconMarkup(workspaceIcon, { size: 36 });
    this.$('[data-version]').textContent = `v${currentRelease.version} · Release ${currentRelease.number}`;
    renderReleaseNotes(this.$('[data-release-notes]'));
  }
}
