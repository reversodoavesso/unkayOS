import { describe, it, expect, vi } from 'vitest';
import { WasiRunner } from '../core/wasi/WasiRunner.js';
import { wasmTerminalCommands } from '../apps/terminal/wasm-commands.js';

describe('unkayOS 2.0 WASI Runner & Terminal Commands', () => {
    it('should configure WASI environment and arguments correctly', () => {
        const stdoutLines = [];
        const runner = new WasiRunner({
            args: ['my-tool', '--verbose', 'file.txt'],
            env: { CUSTOM_VAR: '42' },
            stdout: (text) => stdoutLines.push(text)
        });

        const imports = runner.getImports();
        expect(imports.wasi_snapshot_preview1).toBeDefined();
        expect(typeof imports.wasi_snapshot_preview1.fd_write).toBe('function');
        expect(typeof imports.wasi_snapshot_preview1.args_get).toBe('function');
        expect(typeof imports.wasi_snapshot_preview1.args_sizes_get).toBe('function');
        expect(typeof imports.wasi_snapshot_preview1.environ_get).toBe('function');
        expect(typeof imports.wasi_snapshot_preview1.environ_sizes_get).toBe('function');
    });

    it('should execute unkay info and tier commands', async () => {
        const appendMock = vi.fn();
        const infoResult = await wasmTerminalCommands.unkay.action(['info'], appendMock);
        expect(infoResult).toContain('unkayOS 2.0');
        expect(infoResult).toContain('2.0.0-wasm');

        const tierResult = await wasmTerminalCommands.unkay.action(['tier'], appendMock);
        expect(tierResult).toContain('Tier atual de computação');
    });

    it('routes package management and launcher commands through the shared SDK', async () => {
        const { unkay } = await import('../core/sdk/unkay.js');
        const list = vi.spyOn(unkay.packages, 'list').mockReturnValue([{ id: 'notes', name: '<img onerror=x>', state: 'installed' }]);
        const open = vi.spyOn(unkay.packages, 'open').mockResolvedValue('instance');
        try {
            const output = await wasmTerminalCommands.unkay.action(['packages', 'list']);
            expect(output).toContain('&lt;img');
            expect(output).not.toContain('<img');
            await wasmTerminalCommands.unkay.action(['run', 'notes']);
            expect(open).toHaveBeenCalledWith('notes');
        } finally { list.mockRestore(); open.mockRestore(); }
    });

    it('should grep matching lines from a file using wasmFileSystem', async () => {
        const mockFileContent = `First line
Error: connection failed
Third line
Error: timeout occurred
Normal line`;

        globalThis.window = {
            wasmFileSystem: {
                readFile: vi.fn(async () => mockFileContent)
            }
        };

        const result = await wasmTerminalCommands.grep.action(['Error:', '/var/log/sys.log']);
        expect(result).toContain('connection failed');
        expect(result).toContain('timeout occurred');
        expect(result).not.toContain('Third line');
    });

    it('should query JSON using jq command', async () => {
        const jsonContent = JSON.stringify({
            name: 'unkayos',
            version: '2.0.0',
            author: 'RDA'
        });

        globalThis.window = {
            wasmFileSystem: {
                readFile: vi.fn(async () => jsonContent)
            }
        };

        const resultVersion = await wasmTerminalCommands.jq.action(['.version', 'package.json']);
        expect(resultVersion).toContain('2.0.0');

        const resultAll = await wasmTerminalCommands.jq.action(['.', 'package.json']);
        expect(resultAll).toContain('unkayos');
    });
});
