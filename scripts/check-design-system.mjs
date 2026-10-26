import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../design-system/rda/', import.meta.url);
const lock = JSON.parse(readFileSync(new URL('distribution.json', root), 'utf8'));
for (const [file, expected] of Object.entries(lock.files)) {
  const actual = createHash('sha256').update(readFileSync(new URL(file, root))).digest('hex');
  if (actual !== expected) throw new Error(`Official DS asset changed: ${file}. Run sync:ds after building rda-ds.`);
}
const icons = JSON.parse(readFileSync(new URL('icons/manifest.json', root), 'utf8'));
for (const [name, meta] of Object.entries(icons.icons)) {
  const actual = createHash('sha256').update(readFileSync(new URL(`icons/${name}.svg`, root))).digest('hex');
  if (actual !== meta.sha256) throw new Error(`Icon integrity mismatch: ${name}`);
}
console.log(`DS ${lock.version}: CSS, runtime and ${Object.keys(icons.icons).length} official icons verified.`);
