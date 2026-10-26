import { cpSync, copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const arg = process.argv.find(value => value.startsWith('--from='));
const source = resolve(arg ? arg.slice(7) : process.env.RDA_DS_DIR || resolve(root, '../../rda-ds'));
const target = resolve(root, 'design-system/rda');
if (!existsSync(resolve(source, 'cdn/design-system.manifest.json'))) {
  throw new Error('Build the official RDA DS first, then run sync:ds -- --from=<rda-ds directory>.');
}
const manifest = JSON.parse(readFileSync(resolve(source, 'cdn/design-system.manifest.json'), 'utf8'));
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
if (digest(resolve(source, 'cdn/design-system.css')) !== manifest.sha256) throw new Error('DS CSS integrity mismatch');
const accents = JSON.parse(readFileSync(resolve(source, 'cdn/unkayos.presets.json'), 'utf8'));
for (const relative of ['design-system.css', 'unkayos.css', 'design-system.manifest.json', 'web/icons.js', 'web/icons.js.map', 'components/Icon/icons-data.js', 'components/Icon/icons-data.js.map']) {
  const dest = resolve(target, relative);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(resolve(source, 'cdn', relative), dest);
}
cpSync(resolve(source, 'cdn/icons'), resolve(target, 'icons'), { recursive: true });
cpSync(resolve(source, 'cdn/tools'), resolve(target, 'tools'), { recursive: true });
writeFileSync(resolve(target, 'accents.js'), `export const accentPresets = ${JSON.stringify(accents, null, 2)};\n`);
const files = {};
for (const file of ['design-system.css', 'unkayos.css', 'web/icons.js', 'web/icons.js.map', 'components/Icon/icons-data.js', 'components/Icon/icons-data.js.map', 'accents.js', 'icons/sprite.svg', 'icons/manifest.json', 'icons/guidelines.json', 'icons/LICENSE-lucide.txt', 'tools/icon-author.mjs', 'tools/lib/icon-authoring.mjs', 'tools/lib/icon-authoring.d.mts']) files[file] = digest(resolve(target, file));
writeFileSync(resolve(target, 'distribution.json'), JSON.stringify({ package: manifest.package, version: manifest.version, sourceSha256: manifest.sourceSha256, files }, null, 2) + '\n');
console.log(`Official RDA DS ${manifest.version} synchronized (${Object.keys(accents).join(', ')}).`);
