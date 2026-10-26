import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const release = JSON.parse(readFileSync(new URL('../releases.json', import.meta.url), 'utf8')).releases[0];
let revision = process.env.UNKAYOS_REVISION || 'unknown';
try { if (revision === 'unknown') revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (_) { /* Source archives may lack Git; CI supplies UNKAYOS_REVISION. */ }
writeFileSync(new URL('../public/build-info.json', import.meta.url), JSON.stringify({ version: release.version, release: release.number, revision, builtAt: new Date().toISOString() }, null, 2) + '\n');
