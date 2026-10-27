/** Local shell state belongs to a terminal window, while file contents are shared. */
export function createTerminalFileSystem(base, initialPath) {
    let cwd = initialPath || base?.pwd?.() || '/home/user';
    const resolve = (path = '.') => {
        path = String(path || '.').replace(/^~(?=\/|$)/, '/home/user');
        const parts = (path.startsWith('/') ? path : cwd + '/' + path).split('/');
        const result = [];
        for (const part of parts) { if (part === '..') result.pop(); else if (part && part !== '.') result.push(part); }
        return '/' + result.join('/');
    };
    const facade = { ...base, pwd: () => cwd, resolve, normalize: resolve,
        cd(path = '/home/user') {
            const target = resolve(path);
            if (base.stat(target)?.type !== 'directory') throw Error('Diretório não encontrado: ' + target);
            cwd = target; return cwd;
        }
    };
    for (const name of ['ls', 'mkdir', 'rmdir', 'cat', 'touch', 'rm', 'exists', 'stat']) {
        facade[name] = (path, ...args) => base[name](resolve(path), ...args);
    }
    for (const name of ['cp', 'mv']) facade[name] = (source, destination, ...args) => base[name](resolve(source), resolve(destination), ...args);
    facade.find = (pattern, start, options) => base.find(pattern, resolve(start), options);
    return facade;
}

/** Quoting is supported; this local command parser does not evaluate shell code. */
export function parseCommandLine(text) {
    const words = []; let word = '', quote = '', escaped = false, started = false;
    for (const character of text) {
        if (escaped) {word += character; escaped = false; started = true;continue;}
        if (character === '\\' && quote !== "'") {escaped = true;started = true;continue;}
        if (quote) {if (character === quote) quote = '';else word += character;continue;}
        if (character === '"' || character === "'") {quote = character;started = true;continue;}
        if (/\s/.test(character)) {if (started) {words.push(word);word = '';started = false;}continue;}
        word += character;started = true;
    }
    if (quote || escaped) throw Error('Aspas ou escape sem fechamento.');
    if (started) words.push(word);
    return words;
}
