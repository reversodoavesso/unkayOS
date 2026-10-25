// core/wasi/WasiRunner.js - unkayOS 2.0 Client-Side WASI Host Environment
// Runs WebAssembly WASI binaries in the browser with virtual stdio and VFS integration

export class WasiRunner {
    constructor(options = {}) {
        this.args = options.args || ['wasm_program'];
        this.env = options.env || {
            PATH: '/bin:/usr/bin',
            USER: 'guest',
            HOME: '/home/guest',
            TERM: 'xterm-256color',
            OS: 'unkayOS 2.0'
        };
        this.stdin = options.stdin || '';
        this.stdout = options.stdout || ((text) => console.log(text));
        this.stderr = options.stderr || ((text) => console.error(text));
        this.vfs = options.vfs || (typeof window !== 'undefined' ? window.wasmFileSystem : null);

        this.exitCode = 0;
        this.stdinCursor = 0;
    }

    /**
     * Build standard WASI import object
     */
    getImports() {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder('utf-8');

        return {
            wasi_snapshot_preview1: {
                args_sizes_get: (argcPtr, argvBufSizePtr) => {
                    const mem = new DataView(this.memory.buffer);
                    mem.setUint32(argcPtr, this.args.length, true);
                    let bufSize = 0;
                    for (const arg of this.args) {
                        bufSize += encoder.encode(arg).length + 1;
                    }
                    mem.setUint32(argvBufSizePtr, bufSize, true);
                    return 0; // Success (ERRNO_SUCCESS)
                },

                args_get: (argvPtr, argvBufPtr) => {
                    const memView = new DataView(this.memory.buffer);
                    const memBytes = new Uint8Array(this.memory.buffer);
                    let currBuf = argvBufPtr;

                    for (let i = 0; i < this.args.length; i++) {
                        memView.setUint32(argvPtr + i * 4, currBuf, true);
                        const encoded = encoder.encode(this.args[i]);
                        memBytes.set(encoded, currBuf);
                        memBytes[currBuf + encoded.length] = 0; // null terminator
                        currBuf += encoded.length + 1;
                    }
                    return 0;
                },

                environ_sizes_get: (envcPtr, envBufSizePtr) => {
                    const mem = new DataView(this.memory.buffer);
                    const envKeys = Object.keys(this.env);
                    mem.setUint32(envcPtr, envKeys.length, true);
                    let bufSize = 0;
                    for (const key of envKeys) {
                        bufSize += encoder.encode(`${key}=${this.env[key]}`).length + 1;
                    }
                    mem.setUint32(envBufSizePtr, bufSize, true);
                    return 0;
                },

                environ_get: (envPtr, envBufPtr) => {
                    const memView = new DataView(this.memory.buffer);
                    const memBytes = new Uint8Array(this.memory.buffer);
                    const envKeys = Object.keys(this.env);
                    let currBuf = envBufPtr;

                    for (let i = 0; i < envKeys.length; i++) {
                        const key = envKeys[i];
                        memView.setUint32(envPtr + i * 4, currBuf, true);
                        const str = `${key}=${this.env[key]}`;
                        const encoded = encoder.encode(str);
                        memBytes.set(encoded, currBuf);
                        memBytes[currBuf + encoded.length] = 0;
                        currBuf += encoded.length + 1;
                    }
                    return 0;
                },

                fd_write: (fd, iovsPtr, iovsLen, nwrittenPtr) => {
                    const memView = new DataView(this.memory.buffer);
                    const memBytes = new Uint8Array(this.memory.buffer);
                    let totalWritten = 0;
                    let outputBuffer = '';

                    for (let i = 0; i < iovsLen; i++) {
                        const bufPtr = memView.getUint32(iovsPtr + i * 8, true);
                        const bufLen = memView.getUint32(iovsPtr + i * 8 + 4, true);
                        const chunk = memBytes.subarray(bufPtr, bufPtr + bufLen);
                        outputBuffer += decoder.decode(chunk, { stream: true });
                        totalWritten += bufLen;
                    }

                    memView.setUint32(nwrittenPtr, totalWritten, true);

                    if (fd === 1) { // stdout
                        this.stdout(outputBuffer);
                    } else if (fd === 2) { // stderr
                        this.stderr(outputBuffer);
                    }
                    return 0;
                },

                fd_read: (fd, iovsPtr, iovsLen, nreadPtr) => {
                    if (fd !== 0) return 28; // ERRNO_NOSYS for non-stdin
                    const memView = new DataView(this.memory.buffer);
                    const memBytes = new Uint8Array(this.memory.buffer);
                    const inputBytes = encoder.encode(this.stdin);
                    let totalRead = 0;

                    for (let i = 0; i < iovsLen; i++) {
                        const bufPtr = memView.getUint32(iovsPtr + i * 8, true);
                        const bufLen = memView.getUint32(iovsPtr + i * 8 + 4, true);
                        const available = inputBytes.length - this.stdinCursor;
                        if (available <= 0) break;

                        const toCopy = Math.min(bufLen, available);
                        memBytes.set(inputBytes.subarray(this.stdinCursor, this.stdinCursor + toCopy), bufPtr);
                        this.stdinCursor += toCopy;
                        totalRead += toCopy;
                    }

                    memView.setUint32(nreadPtr, totalRead, true);
                    return 0;
                },

                fd_seek: () => 0,
                fd_close: () => 0,
                fd_fdstat_get: (fd, statPtr) => {
                    const memView = new DataView(this.memory.buffer);
                    // fs_filetype: 2 (character device)
                    memView.setUint8(statPtr, 2);
                    // fs_flags: 0
                    memView.setUint16(statPtr + 2, 0, true);
                    return 0;
                },

                proc_exit: (exitCode) => {
                    this.exitCode = exitCode;
                    throw new Error(`WASI program exited with code ${exitCode}`);
                },

                clock_time_get: (id, precision, timePtr) => {
                    const memView = new DataView(this.memory.buffer);
                    const nowNs = BigInt(Date.now()) * 1000000n;
                    memView.setBigUint64(timePtr, nowNs, true);
                    return 0;
                },

                random_get: (bufPtr, bufLen) => {
                    const bytes = new Uint8Array(this.memory.buffer, bufPtr, bufLen);
                    crypto.getRandomValues(bytes);
                    return 0;
                }
            }
        };
    }

    /**
     * Run WASI WebAssembly module
     * @param {ArrayBuffer|Uint8Array|WebAssembly.Module} wasmBinary
     */
    async run(wasmBinary) {
        try {
            const imports = this.getImports();
            let instance;

            if (wasmBinary instanceof WebAssembly.Module) {
                instance = await WebAssembly.instantiate(wasmBinary, imports);
            } else {
                const compiled = await WebAssembly.instantiate(wasmBinary, imports);
                instance = compiled.instance;
            }

            this.instance = instance;
            this.memory = instance.exports.memory;

            if (instance.exports._start) {
                instance.exports._start();
            } else if (instance.exports.main) {
                instance.exports.main();
            }

            return { exitCode: 0 };
        } catch (err) {
            if (err.message && err.message.includes('WASI program exited')) {
                return { exitCode: this.exitCode };
            }
            throw err;
        }
    }
}
