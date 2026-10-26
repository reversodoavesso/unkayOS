import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createIconBrief, validateIconSvg } from './lib/icon-authoring.mjs';

const args = process.argv.slice(2);
const command = args[0];
const option = (name, fallback = '') => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const name = option('--name');
const kind = option('--kind', 'ui');
const output = option('--out');
const emit = text => {
  if (output) {
    if (existsSync(resolve(output))) throw new Error('O arquivo de saída já existe; nada foi sobrescrito.');
    writeFileSync(resolve(output), text);
  } else process.stdout.write(text);
};

try {
  if (command === 'brief') {
    emit(createIconBrief({ name, description: option('--description'), kind }));
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
      const root = resolve(option('--ds', fileURLToPath(new URL('../', import.meta.url))));
      const folder = resolve(root, 'src/assets/icons/custom');
      if (!existsSync(folder)) throw new Error('Informe --ds com o checkout do RDA DS.');
      const target = resolve(folder, name + '.svg');
      if (dirname(target) !== folder || existsSync(target) || existsSync(resolve(root, 'src/assets/icons/core', name + '.svg'))) throw new Error('Nome já registrado ou inválido; nada foi sobrescrito.');
      writeFileSync(target, result.svg + '\n');
      process.stdout.write(`Registrado: ${target}\nGere o DS e execute sync:ds no Unkayos antes de usar icon_name="${name}".\n`);
    }
  } else {
    throw new Error('Use brief --name app-notas --description "...", validate --file icon.svg ou register --name app-notas --file icon.svg [--kind ui|brand] [--ds checkout].');
  }
} catch (error) {
  process.stderr.write(error.message + '\n');
  process.exitCode = 1;
}
