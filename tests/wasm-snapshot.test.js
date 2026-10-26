// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initSync, UnkayKernel } from '../core/wasm/pkg/unkay_kernel.js';

beforeAll(() => initSync({ module: readFileSync('core/wasm/pkg/unkay_kernel_bg.wasm') }));

describe('Wasm snapshot compatibility', () => {
  it('round trips native directories, UTF-8, binary bytes and inode metadata', () => {
    const source = new UnkayKernel();
    const restored = new UnkayKernel();
    try {
      source.mkdir('/home/user/snapshot/nested', true);
      source.write_text('/home/user/snapshot/note.txt', 'Acentuação e conteúdo persistido.');
      source.write_file('/home/user/snapshot/nested/raw.bin', new Uint8Array([0, 255, 128, 10]));
      const snapshot = source.export_tree_json();
      restored.import_legacy_tree_json(snapshot);
      expect(JSON.parse(restored.export_tree_json())).toEqual(JSON.parse(snapshot));
      expect(restored.read_text('/home/user/snapshot/note.txt')).toBe('Acentuação e conteúdo persistido.');
      expect([...restored.read_file('/home/user/snapshot/nested/raw.bin')]).toEqual([0, 255, 128, 10]);
      restored.write_text('/home/user/snapshot/nested/new.txt', 'Diretório restaurado.');
    } finally { source.free(); restored.free(); }
  });

  it('still accepts the legacy string-content schema', () => {
    const kernel = new UnkayKernel();
    try {
      kernel.import_legacy_tree_json(JSON.stringify({
        '/legacy': { type: 'directory', children: ['note.txt'] },
        '/legacy/note.txt': { type: 'file', content: 'Arquivo antigo.' }
      }));
      expect(kernel.read_text('/legacy/note.txt')).toBe('Arquivo antigo.');
      kernel.write_text('/legacy/another.txt', 'Novo arquivo.');
    } finally { kernel.free(); }
  });
});
