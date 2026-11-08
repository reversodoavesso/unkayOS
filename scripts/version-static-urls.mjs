import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const [directory = 'dist', version = 'dev'] = process.argv.slice(2);
const suffix = '?v=' + encodeURIComponent(version);
const modules = [];
const html = [];

const walk = dir => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (['.js', '.mjs'].includes(extname(entry.name))) modules.push(full);
    else if (entry.name.endsWith('.html')) html.push(full);
  }
};
walk(directory);

let rewrites = 0;
for (const file of modules) {
  const source = readFileSync(file, 'utf8');
  const next = source.replace(
    /((?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*))(['"])(\.{1,2}\/[^'"]+?\.(?:m?js))(?:\?[^'"]*)?\2/g,
    (_match, lead, quote, specifier) => {
      rewrites += 1;
      return `${lead}${quote}${specifier}${suffix}${quote}`;
    }
  );
  if (next !== source) writeFileSync(file, next);
}

for (const file of html) {
  const source = readFileSync(file, 'utf8');
  const next = source.replace(
    /(<script\b[^>]*\bsrc=["'])(\/[^"'?]+\.js)(?:\?[^"']*)?(["'])/g,
    (_match, lead, specifier, quote) => {
      rewrites += 1;
      return `${lead}${specifier}${suffix}${quote}`;
    }
  );
  if (next !== source) writeFileSync(file, next);
}

console.log(JSON.stringify({ directory, version, modules: modules.length, html: html.length, rewrites }, null, 2));
