import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const id = option('--id', '');
const name = option('--name', id);
const icon = option('--icon', 'package');
if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error('Use --id with a lowercase app identifier.');
const catalog = JSON.parse(readFileSync(resolve(root, 'design-system/rda/icons/manifest.json'), 'utf8'));
if (!Object.hasOwn(catalog.icons, icon)) throw new Error('Choose an official DS icon name.');
const registryFile = resolve(root, 'apps/apps.json');
const registry = JSON.parse(readFileSync(registryFile, 'utf8'));
if (args.includes('--register') && registry.app_configs.some(app => app.id === id)) throw new Error('Registry already contains this ID.');
const folder = resolve(root, 'apps', id);
if (existsSync(folder)) throw new Error('Application directory already exists; nothing was overwritten.');
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const files = {
  'config.json': JSON.stringify({ app_name: name, icon_name: icon, icon_url: 'icon.svg', dirApp: 'index.html', jsFile: 'main.js', styleFile: 'style.css', mode: 'system_window', width: '640px', height: '480px', minWidth: 320, minHeight: 240, autorun: false, hidden: false }, null, 2) + '\n',
  'index.html': `<section class="example-app"><h1>${escape(name)}</h1><label class="rda-label" for="message">Mensagem</label><input id="message" class="rda-input rda-input--md" placeholder="Escreva uma mensagem"><button id="save" type="button" class="rda-button rda-button--md" data-color="primary"><rda-icon name="save"></rda-icon><span class="rda-button__content">Salvar</span></button><p id="status" role="status"></p></section>\n`,
  'style.css': '.example-app { display:flex; flex-direction:column; gap:var(--rda-spacing-4); padding:var(--rda-spacing-4); color:var(--rda-content-primary); background:var(--rda-surface-primary); }\n',
  'main.js': `import { BaseApp } from '../../core/BaseApp.js';\nexport default class App extends BaseApp {\n  onRun() {\n    this.controller = new AbortController();\n    this.$('#save').addEventListener('click', async () => {\n      const button = this.$('#save'); button.disabled = true;\n      try {\n        const fs = this.wasmFileSystem || this.fileSystem;\n        await fs.mkdir('/home/user/.config/${id}', { recursive: true });\n        await fs.writeFile('/home/user/.config/${id}/message.txt', this.$('#message').value);\n        if (typeof fs.flush === 'function') await fs.flush();\n        this.$('#status').textContent = 'Mensagem salva.';\n      } catch (error) { this.$('#status').textContent = error.message; }\n      finally { button.disabled = false; }\n    }, { signal: this.controller.signal });\n  }\n  async onCleanup() { this.controller?.abort(); await super.onCleanup(); }\n}\n`,
  'icon.svg': readFileSync(resolve(root, `design-system/rda/icons/${icon}.svg`), 'utf8')
};
if (args.includes('--dry-run')) {
  console.log(JSON.stringify({ id, name, icon, files }, null, 2));
} else {
  mkdirSync(folder);
  for (const [filename, text] of Object.entries(files)) writeFileSync(resolve(folder, filename), text);
  if (args.includes('--register')) {
    registry.app_configs.push({ id, path: `/apps/${id}/` });
    writeFileSync(registryFile, JSON.stringify(registry, null, 2) + '\n');
  }
  console.log(`Created apps/${id}. ${args.includes('--register') ? 'Registered in apps.json.' : 'Add its entry to apps/apps.json to launch it.'}`);
}
