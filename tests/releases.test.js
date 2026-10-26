import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { nextRelease, validateReleases, releaseArtifacts } from '../scripts/release.mjs';
import { currentRelease } from '../core/release-info.js';
const nextParts = currentRelease.version.split('-')[0].split('.').map(Number);
nextParts[2] += 1;
const nextVersion = nextParts.join('.');
const manifest = JSON.parse(readFileSync('releases.json', 'utf8'));
describe('System release history', () => {
  it('increments the counter once per release and preserves the previous notes', () => {
    const next = nextRelease(manifest, { version: nextVersion, title: 'Próxima', changes: ['Ajuste'], date: '2026-10-27' });
    expect(next.releases[0].number).toBe(currentRelease.number + 1);
    expect(next.releases.slice(1)).toEqual(manifest.releases);
    expect(() => nextRelease(manifest, { version: currentRelease.version, title: 'Duplicada', changes: ['Ajuste'] })).toThrow();
    expect(() => nextRelease(manifest, { version: '1.0.0', title: 'Antiga', changes: ['Ajuste'] })).toThrow();
  });
  it('rejects gaps in numbering and empty release notes', () => {
    const invalid = structuredClone(manifest); invalid.releases[0].number += 1;
    expect(() => validateReleases(invalid)).toThrow();
    expect(() => nextRelease(manifest, { version: '2.1.0', title: 'Sem notas', changes: [] })).toThrow();
  });
  it('keeps the package, runtime, public metadata and changelog on the same release', () => {
    expect(JSON.parse(readFileSync('package.json', 'utf8')).version).toBe(currentRelease.version);
    for (const [file, source] of Object.entries(releaseArtifacts(manifest))) expect(readFileSync(file, 'utf8').replaceAll('\r\n', '\n')).toBe(source);
  });
});
