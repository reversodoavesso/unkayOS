import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
mkdirSync(new URL('core/vendor/', root), { recursive: true });
for (const [source, target] of [
  ['dist/purify.es.mjs', 'purify.es.mjs'],
  ['dist/purify.es.d.mts', 'purify.es.d.mts'],
  ['LICENSE', 'DOMPurify-LICENSE.txt']
]) {
  copyFileSync(new URL(`node_modules/dompurify/${source}`, root), new URL(`core/vendor/${target}`, root));
}
// The upstream map references sources outside the distributable package.
const modulePath = new URL('core/vendor/purify.es.mjs', root);
writeFileSync(modulePath, readFileSync(modulePath, 'utf8').replace(/^\/\/# sourceMappingURL=.*$/m, ''));
