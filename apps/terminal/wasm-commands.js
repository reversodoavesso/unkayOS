// apps/terminal/wasm-commands.js - unkayOS 2.0 WASI & System Commands
// Wasm runner, grep, jq, cloud, compute, and unkay diagnostics CLI

import { WasiRunner } from '../../core/wasi/WasiRunner.js';
import { unkay } from '../../core/sdk/unkay.js';
import { wasmFileSystem } from '../../core/WasmFileSystem.js';
import { escapeHtml } from '../../core/workspace/preferences.js';

const getVfs = () => (typeof window !== 'undefined' && window.wasmFileSystem) || wasmFileSystem;

export const wasmTerminalCommands = {
    unkay: {
        description: "CLI do unkayOS (info, tier, run, packages, ai, cloud, compute, vfs).",
        action: async (args, appendToTerminal) => {
            const sub = args[0] || 'info';
            switch (sub) {
                case 'run': {
                    if (!args[1]) return 'Uso: unkay run &lt;app-id&gt;';
                    try { await unkay.packages.open(args[1]); return `Aplicativo aberto: ${escapeHtml(args[1])}`; }
                    catch (error) { return `<span class="red">${escapeHtml(error.message)}</span>`; }
                }
                case 'packages': {
                    const action = args[1] || 'list', id = args[2];
                    try {
                        if (action === 'refresh') await unkay.packages.refresh();
                        if (action === 'list' || action === 'refresh') {
                            return unkay.packages.list().map(app => `${escapeHtml(app.id)} — ${escapeHtml(app.name)} — ${escapeHtml(app.state)}${app.installedVersion ? ` (${escapeHtml(app.installedVersion)})` : ''}`).join('<br>');
                        }
                        if (!id) return 'Uso: unkay packages list|refresh|status &lt;id&gt;|install &lt;id&gt;|remove &lt;id&gt;|import &lt;arquivo.unkayapp&gt;';
                        if (action === 'status') return escapeHtml(JSON.stringify(unkay.packages.status(id), null, 2));
                        if (action === 'install') { await unkay.packages.refresh(); await unkay.packages.install(id); }
                        else if (action === 'remove') await unkay.packages.uninstall(id);
                        else if (action === 'import') await unkay.packages.installLocal(await unkay.fs.readText(id));
                        else return 'Operação de pacotes desconhecida.';
                        return 'Operação concluída.';
                    } catch (error) { return `<span class="red">${escapeHtml(error.message)}</span>`; }
                }
                case 'info': {
                    const tier = unkay.auth.getTier();
                    const user = unkay.auth.getUser();
                    const vfs = getVfs();
                    const vfsReady = vfs.isReady;
                    return `
<span class="cyan">unkayOS 2.0 (Núcleo Wasm & Computação Híbrida)</span><br>
  Kernel: <span class="green">2.0.0-wasm</span> (WebAssembly Web Worker)<br>
  Storage: <span class="yellow">${vfsReady ? 'OPFS / In-Memory VFS' : 'Initializing'}</span><br>
  User: <span class="white">${user?.username || 'guest'}</span><br>
  Tier: <span class="magenta">${tier.toUpperCase()}</span><br>
  Comandos Wasm: <span class="green">unkay, wasi, grep, jq</span>
`;
                }
                case 'tier': {
                    const tier = unkay.auth.getTier();
                    return `<span class="yellow">Tier atual de computação:</span> <span class="cyan">${tier}</span>`;
                }
                case 'ai': {
                    const promptText = args.slice(1).join(' ');
                    if (!promptText) {
                        return '<span class="yellow">Uso: unkay ai &lt;sua pergunta ou instrução&gt;</span>';
                    }
                    if (appendToTerminal) appendToTerminal('<span class="gray">Consultando RDA AI Gateway...</span>');
                    try {
                        const reply = await unkay.ai.prompt([{ role: 'user', content: promptText }]);
                        return `<span class="green">[RDA AI]</span> ${reply}`;
                    } catch (e) {
                        return `<span class="red">Erro ao consultar IA: ${e.message}</span>`;
                    }
                }
                case 'cloud': {
                    const action = args[1] || 'sync';
                    if (action === 'sync') {
                        if (appendToTerminal) appendToTerminal('<span class="gray">Iniciando sincronização com MinIO Cloud Storage...</span>');
                        const res = await unkay.fs.syncCloud();
                        if (res.success) {
                            return `<span class="green">Nuvem sincronizada com sucesso: ${res.uploaded} enviados, ${res.downloaded} baixados.</span>`;
                        } else {
                            return `<span class="yellow">Cloud sync: ${res.reason || res.error}</span>`;
                        }
                    }
                    return '<span class="yellow">Uso: unkay cloud sync</span>';
                }
                case 'compute': {
                    const action = args[1] || 'status';
                    if (action === 'status') {
                        const { computeBridge } = await import('./compute-bridge.js');
                        return `<span class="cyan">[Compute] Status da conexão:</span> <span class="${computeBridge.isConnected ? 'green' : 'gray'}">${computeBridge.isConnected ? 'Conectado (Container Pi)' : 'Desconectado (WASI Local)'}</span>`;
                    }
                    if (action === 'connect') {
                        const { computeBridge } = await import('./compute-bridge.js');
                        computeBridge.connect({ writeLine: (txt) => appendToTerminal(txt) }, args[2] || null);
                        return '';
                    }
                    if (action === 'disconnect') {
                        const { computeBridge } = await import('./compute-bridge.js');
                        computeBridge.disconnect();
                        return '<span class="yellow">[Compute] Desconectado.</span>';
                    }
                    return '<span class="yellow">Uso: unkay compute [status|connect|disconnect]</span>';
                }
                case 'vfs': {
                    const action = args[1] || 'stats';
                    if (action === 'export') {
                        const json = await getVfs().exportTree();
                        return `<span class="green">Snapshot VFS (${json.length} bytes):</span><br><pre>${json.substring(0, 300)}...</pre>`;
                    }
                    return '<span class="yellow">Uso: unkay vfs export</span>';
                }
                default:
                    return '<span class="yellow">Subcomandos válidos: info, tier, ai, cloud, compute, vfs</span>';
            }
        }
    },

    wasi: {
        description: "Executa um módulo WebAssembly (.wasm) via runtime WASI nativo no navegador.",
        action: async (args, appendToTerminal) => {
            if (args.length === 0) {
                return '<span class="yellow">Uso: wasi &lt;caminho.wasm&gt; [args...]</span>';
            }
            const wasmPath = args[0];
            const wasmArgs = args.slice(1);
            try {
                if (appendToTerminal) appendToTerminal(`<span class="gray">Carregando ${wasmPath} no WASI Runner...</span>`);
                const bytes = await getVfs().readFile(wasmPath, { encoding: 'binary' });
                const runner = new WasiRunner({
                    args: [wasmPath, ...wasmArgs],
                    stdout: (txt) => appendToTerminal && appendToTerminal(`<span class="white">${txt}</span>`),
                    stderr: (txt) => appendToTerminal && appendToTerminal(`<span class="red">${txt}</span>`)
                });
                const res = await runner.run(bytes);
                return `<span class="green">Processo finalizado com exit code ${res.exitCode}.</span>`;
            } catch (err) {
                return `<span class="red">Erro ao executar WASI: ${err.message}</span>`;
            }
        }
    },

    grep: {
        description: "Procura padrões de texto dentro de arquivos.",
        action: async (args) => {
            if (args.length < 2) {
                return '<span class="yellow">Uso: grep &lt;padrão&gt; &lt;arquivo&gt;</span>';
            }
            const pattern = args[0];
            const filePath = args[1];
            try {
                const text = await getVfs().readFile(filePath, { encoding: 'utf8' });
                const lines = text.split('\n');
                const regex = new RegExp(pattern, 'i');
                const matches = lines.filter(line => regex.test(line));
                if (matches.length === 0) {
                    return '<span class="gray">Nenhuma correspondência encontrada.</span>';
                }
                return matches.map(m => m.replace(regex, (match) => `<span class="red">${match}</span>`)).join('<br>');
            } catch (e) {
                return `<span class="red">grep: ${e.message}</span>`;
            }
        }
    },

    jq: {
        description: "Filtra e processa arquivos JSON.",
        action: async (args) => {
            if (args.length < 2) {
                return '<span class="yellow">Uso: jq &lt;.campo&gt; &lt;arquivo.json&gt;</span>';
            }
            const filter = args[0];
            const filePath = args[1];
            try {
                const text = await getVfs().readFile(filePath, { encoding: 'utf8' });
                const parsed = JSON.parse(text);
                if (filter === '.' || filter === '') {
                    return `<pre>${JSON.stringify(parsed, null, 2)}</pre>`;
                }
                const key = filter.replace(/^\./, '');
                const result = key ? parsed[key] : parsed;
                return `<pre>${JSON.stringify(result, null, 2)}</pre>`;
            } catch (e) {
                return `<span class="red">jq: ${e.message}</span>`;
            }
        }
    }
};
