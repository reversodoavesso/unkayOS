import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createIconBrief, validateIconSvg } from './lib/icon-authoring.mjs';

const args = process.argv.slice(2);
const command = args[0];
const option = (name, fallback = '') => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const name = option('--name');
const kind = option('--kind', 'ui');
const scope = option('--scope', 'general');
const context = option('--context', '');
const description = option('--description', '');
const output = option('--out');

const emit = text => {
  if (output) {
    if (existsSync(resolve(output))) throw new Error('O arquivo de saída já existe; nada foi sobrescrito.');
    writeFileSync(resolve(output), text);
  } else process.stdout.write(text);
};

try {
  if (command === 'brief') {
    emit(createIconBrief({ name, description, kind, scope, context }));
  } else if (['validate', 'register'].includes(command)) {
    if (!option('--file')) throw new Error('Informe --file com o SVG.');
    const dom = new JSDOM();
    let result;
    try { result = validateIconSvg(readFileSync(resolve(option('--file')), 'utf8'), { kind, parser: new dom.window.DOMParser() }); }
    finally { dom.window.close(); }
    if (!result.valid) throw new Error(result.errors.join('\n'));
    if (command === 'validate') emit(JSON.stringify(result, null, 2) + '\n');
    else {
      if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)) throw new Error('Informe --name em kebab-case.');
      if (!['exclusive', 'general'].includes(scope)) throw new Error('Informe --scope exclusive ou --scope general.');
      const root = resolve(option('--ds', fileURLToPath(new URL('../', import.meta.url))));
      const customRoot = resolve(root, 'src/assets/icons/custom');
      if (!existsSync(customRoot)) throw new Error('Informe --ds com o checkout do RDA DS.');

      const subfolder = scope === 'exclusive' ? 'exclusive' : 'general';
      const folder = resolve(customRoot, subfolder);
      mkdirSync(folder, { recursive: true });

      const target = resolve(folder, name + '.svg');
      if (
        dirname(target) !== folder ||
        existsSync(target) ||
        existsSync(resolve(customRoot, 'exclusive', name + '.svg')) ||
        existsSync(resolve(customRoot, 'general', name + '.svg')) ||
        existsSync(resolve(customRoot, name + '.svg')) ||
        existsSync(resolve(root, 'src/assets/icons/core', name + '.svg'))
      ) {
        throw new Error('Nome já registrado ou inválido; nada foi sobrescrito.');
      }

      writeFileSync(target, result.svg + '\n', 'utf8');

      // Atualiza registry.json se existir
      const registryFile = resolve(customRoot, 'registry.json');
      let registry = {};
      if (existsSync(registryFile)) {
        try { registry = JSON.parse(readFileSync(registryFile, 'utf8')); } catch { registry = {}; }
      }
      registry[name] = {
        scope,
        ...(context ? { context } : {}),
        description: description || (scope === 'exclusive' ? 'Ícone de uso exclusivo / contextual.' : 'Ícone customizado de uso geral no ecossistema.')
      };
      writeFileSync(registryFile, JSON.stringify(registry, null, 2) + '\n', 'utf8');

      process.stdout.write(`Registrado [escopo: ${scope}]: ${target}\nGere o DS e execute sync:ds no Unkayos antes de usar icon_name="${name}".\n`);
    }
  } else {
    throw new Error('Use brief --name app-notas --description "..." [--scope exclusive|general] [--context "contexto"], validate --file icon.svg ou register --name app-notas --file icon.svg [--kind ui|brand] [--scope exclusive|general] [--context "contexto"] [--ds checkout].');
  }
} catch (error) {
  process.stderr.write(error.message + '\n');
  process.exitCode = 1;
}
