import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import initWasm, { UnkayKernel } from '../core/wasm/pkg/unkay_kernel.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('unkayOS 2.0 WebAssembly Microkernel', () => {
    let kernel;

    beforeAll(async () => {
        const wasmPath = resolve(__dirname, '../core/wasm/pkg/unkay_kernel_bg.wasm');
        const wasmBuffer = readFileSync(wasmPath);
        await initWasm({ module_or_path: wasmBuffer });
        kernel = new UnkayKernel();
    });

    it('should report kernel version 2.0.0-wasm', () => {
        expect(kernel.version()).toBe('2.0.0-wasm');
    });

    it('should initialize default directory tree', () => {
        expect(kernel.exists('/')).toBe(true);
        expect(kernel.exists('/apps')).toBe(true);
        expect(kernel.exists('/home')).toBe(true);
        expect(kernel.exists('/home/guest')).toBe(true);
        expect(kernel.exists('/home/guest/Desktop')).toBe(true);
        expect(kernel.exists('/tmp')).toBe(true);
    });

    it('should return stat for existing directories', () => {
        const stat = kernel.stat('/home/guest');
        expect(stat.is_dir).toBe(true);
        expect(stat.name).toBe('guest');
        expect(stat.path).toBe('/home/guest');
    });

    it('should create directories recursively with mkdir', () => {
        expect(kernel.exists('/home/guest/Projects/unkay')).toBe(false);
        kernel.mkdir('/home/guest/Projects/unkay', true);
        expect(kernel.exists('/home/guest/Projects/unkay')).toBe(true);
        
        const stat = kernel.stat('/home/guest/Projects/unkay');
        expect(stat.is_dir).toBe(true);
    });

    it('should write and read text files', () => {
        const filePath = '/home/guest/hello.txt';
        const content = 'Hello, unkayOS 2.0 Wasm Kernel!';

        kernel.write_text(filePath, content);
        expect(kernel.exists(filePath)).toBe(true);

        const readBack = kernel.read_text(filePath);
        expect(readBack).toBe(content);

        const stat = kernel.stat(filePath);
        expect(stat.is_dir).toBe(false);
        expect(stat.size).toBe(Buffer.byteLength(content));
    });

    it('should write and read binary files', () => {
        const filePath = '/tmp/binary.dat';
        const bytes = new Uint8Array([0x00, 0xFF, 0x42, 0x13, 0x37]);

        kernel.write_file(filePath, bytes);
        const readBack = kernel.read_file(filePath);
        expect(Array.from(readBack)).toEqual(Array.from(bytes));
    });

    it('should list directory entries with readdir', () => {
        const entries = kernel.readdir('/home/guest');
        expect(Array.isArray(entries)).toBe(true);
        const names = entries.map(e => e.name);
        expect(names).toContain('Desktop');
        expect(names).toContain('hello.txt');
    });

    it('should remove files and directories', () => {
        const filePath = '/tmp/to-delete.txt';
        kernel.write_text(filePath, 'delete me');
        expect(kernel.exists(filePath)).toBe(true);

        kernel.remove(filePath, false);
        expect(kernel.exists(filePath)).toBe(false);
    });

    it('should export tree to JSON and import legacy tree JSON', () => {
        const legacyTree = {
            "/home/guest/legacy_doc.md": {
                type: "file",
                name: "legacy_doc.md",
                created: "2026-01-01T00:00:00.000Z",
                modified: "2026-01-01T00:00:00.000Z",
                permissions: "rw-r--r--",
                owner: "user",
                content: "# Legacy Document from v1"
            }
        };

        const importedCount = kernel.import_legacy_tree_json(JSON.stringify(legacyTree));
        expect(importedCount).toBe(1);
        expect(kernel.exists('/home/guest/legacy_doc.md')).toBe(true);
        expect(kernel.read_text('/home/guest/legacy_doc.md')).toBe('# Legacy Document from v1');

        const exported = kernel.export_tree_json();
        expect(typeof exported).toBe('string');
        expect(exported).toContain('legacy_doc.md');
    });
});
