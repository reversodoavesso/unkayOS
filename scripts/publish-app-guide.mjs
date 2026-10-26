import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const text = readFileSync(new URL('docs/APP_DEVELOPMENT.md', root), 'utf8');
const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
for (const target of ['docs/AI_APP_DEVELOPMENT_GUIDELINES.md', 'core/sdk/AI_APP_DEVELOPMENT_GUIDELINES.md', 'design-system/APP_GUIDE.md']) writeFileSync(new URL(target, root), text);
writeFileSync(new URL('design-system/guide.html', root), `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Guia de apps Unkayos</title><link rel="stylesheet" href="/design-system/rda/design-system.css"><style>body{max-width:64rem;margin:auto;padding:2rem;background:var(--rda-surface-primary);color:var(--rda-content-primary)}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-family:var(--rda-font-family-mono);line-height:1.6}a{color:var(--rda-content-brand)}</style><a href="/">Voltar ao Unkayos</a><pre>${escaped}</pre></html>`);
