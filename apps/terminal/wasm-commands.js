// apps/terminal/wasm-commands.js - unkayOS 2.0 WASI & System Commands
// Wasm runner, grep, jq, and unkay diagnostics CLI

import { WasiRunner } from '../../core/wasi/WasiRunner.js';
import { unkay } from '../../core/sdk/unkay.js';
import { wasmFileSystem } from '../../core/WasmFileSystem.js';

const getVfs = () => (typeof window !== 'undefined' && window.wasmFileSystem) || wasmFileSystem;

export const wasmTerminalCommands = {
    unkay: {
        description: "CLI de gerenciamento e diagnósticos do unkayOS 2.0 (info, tier, ai, cloud, vfs).",
        action: async (args, appendToTerminal) => {
            const sub = args[0] || 'info';
            switch (sub) {
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
                case 'vfs': {
                    const action = args[1] || 'stats';
                    if (action === 'export') {
                        const json = await getVfs().exportTree();
                        return `<span class="green">Snapshot VFS (${json.length} bytes):</span><br><pre>${json.substring(0, 300)}...</pre>`;
                    }
                    return '<span class="yellow">Uso: unkay vfs export</span>';
                }
                default:
                    return '<span class="yellow">Subcomandos válidos: info, tier, ai, cloud, vfs</span>';
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
