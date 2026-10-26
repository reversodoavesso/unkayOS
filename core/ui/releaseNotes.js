import { currentRelease, releaseHistory } from '../release-info.js';

/** The same release manifest powers Settings, About and the desktop widget. */
export function renderReleaseNotes(host) {
  if (!host) return;
  host.replaceChildren();
  const summary = document.createElement('p'); summary.className = 'release-summary';
  summary.textContent = `v${currentRelease.version} · Release ${currentRelease.number} · ${currentRelease.date}`;
  const build = document.createElement('p'); build.className = 'release-build';
  host.append(summary, build);
  for (const release of releaseHistory) {
    const details = document.createElement('details'); details.open = release === currentRelease;
    const title = document.createElement('summary'); title.textContent = `${release.version} — ${release.title}`;
    const list = document.createElement('ul');
    for (const note of release.changes) { const li = document.createElement('li'); li.textContent = note; list.appendChild(li); }
    details.append(title, list); host.appendChild(details);
  }
  fetch('/build-info.json', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(info => {
    if (info?.version === currentRelease.version && /^[a-f0-9]{40}$/.test(info.revision)) build.textContent = `Revisão ${info.revision.slice(0, 12)} · Build ${new Date(info.builtAt).toLocaleString('pt-BR')}`;
  }).catch(() => { /* Source-only runs still show the release manifest. */ });
}
