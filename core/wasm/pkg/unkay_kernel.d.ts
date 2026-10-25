/* tslint:disable */
/* eslint-disable */

export class UnkayKernel {
    free(): void;
    [Symbol.dispose](): void;
    exists(path: string): boolean;
    export_tree_json(): string;
    import_legacy_tree_json(json_str: string): number;
    mkdir(path: string, recursive: boolean): void;
    constructor();
    read_file(path: string): Uint8Array;
    read_text(path: string): string;
    readdir(path: string): any;
    remove(path: string, recursive: boolean): void;
    stat(path: string): any;
    version(): string;
    write_file(path: string, data: Uint8Array): void;
    write_text(path: string, text: string): void;
}

export function init_panic_hook(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_unkaykernel_free: (a: number, b: number) => void;
    readonly init_panic_hook: () => void;
    readonly unkaykernel_exists: (a: number, b: number, c: number) => number;
    readonly unkaykernel_export_tree_json: (a: number) => [number, number, number, number];
    readonly unkaykernel_import_legacy_tree_json: (a: number, b: number, c: number) => [number, number, number];
    readonly unkaykernel_mkdir: (a: number, b: number, c: number, d: number) => [number, number];
    readonly unkaykernel_new: () => number;
    readonly unkaykernel_read_file: (a: number, b: number, c: number) => [number, number, number, number];
    readonly unkaykernel_read_text: (a: number, b: number, c: number) => [number, number, number, number];
    readonly unkaykernel_readdir: (a: number, b: number, c: number) => [number, number, number];
    readonly unkaykernel_remove: (a: number, b: number, c: number, d: number) => [number, number];
    readonly unkaykernel_stat: (a: number, b: number, c: number) => [number, number, number];
    readonly unkaykernel_version: (a: number) => [number, number];
    readonly unkaykernel_write_file: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly unkaykernel_write_text: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
