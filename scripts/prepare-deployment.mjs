import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createDeployment, resolveDeployment } from '../core/host/config/deployment.js';
import { planPlugins } from '../core/host/plugins/compose.js';
import { pluginCatalog } from '../core/host/plugins/catalog.js';

const value = key => process.argv.slice(2).find(arg => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
const input = value('input');
const output = value('output');
const preset = value('preset');
if (input && preset) throw new Error('Use --input ou --preset, sem combinar os dois.');
const deployment = input ? resolveDeployment(JSON.parse(readFileSync(resolve(input), 'utf8'))) : createDeployment(preset);
planPlugins(deployment, pluginCatalog);
const json = JSON.stringify(deployment, null, 2) + '\n';
if (output) {
    const path = resolve(output);
    mkdirSync(dirname(path), { recursive: true });
    // Only public configuration accepted by the strict deployment/plugin schemas.
    writeFileSync(path, json, 'utf8');
} else {
    process.stdout.write(json);
}
