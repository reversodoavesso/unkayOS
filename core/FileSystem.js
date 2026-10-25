// core/FileSystem.js - v1.0.0
// Sistema de arquivos virtual para UnkayOS

/**
 * Sistema de arquivos virtual que simula operações de arquivos e diretórios
 * Utiliza LocalStorage para persistência e simula uma estrutura hierárquica
 */
export class FileSystem {
    constructor() {
        this.STORAGE_KEY = 'unkayOS_filesystem';
        this.currentPath = '/';
        this.separator = '/';
        
        // Inicializa o sistema de arquivos
        this.initializeFileSystem();
    }

    /**
     * Inicializa o sistema de arquivos com estrutura padrão
     */
    initializeFileSystem() {
        let fs = this.loadFileSystem();
        
        if (!fs || Object.keys(fs).length === 0) {
            // Cria estrutura inicial baseada na estrutura real do UnkayOS
            fs = this.createRealFileSystemStructure();
            this.saveFileSystem(fs);
        }
    }

    /**
     * Cria a estrutura do sistema de arquivos baseada na estrutura real do UnkayOS
     */
    createRealFileSystemStructure() {
        const now = new Date().toISOString();
        
        return {
            // Raiz do sistema
            '/': {
                type: 'directory',
                name: '',
                children: ['apps', 'assets', 'auth', 'core', 'design-system', 'docs', 'system-apps', 'home', 'tmp'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            // Aplicativos do sistema (estrutura real)
            '/apps': {
                type: 'directory',
                name: 'apps',
                parent: '/',
                children: ['about', 'browser', 'clock', 'file-manager', 'process-manager', 'system-info', 'taskbar', 'terminal', 'text-editor', 'apps.json'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            '/apps/apps.json': {
                type: 'file',
                name: 'apps.json',
                parent: '/apps',
                content: `{
  "app_configs": [
    { "id": "terminal", "path": "/apps/terminal/" },
    { "id": "about", "path": "/apps/about/" },
    { "id": "clock", "path": "/apps/clock/" },
    { "id": "system-info", "path": "/apps/system-info/" },
    { "id": "taskbar", "path": "/apps/taskbar/" },
    { "id": "theorb", "path": "/apps/browser/" },
    { "id": "process-manager", "path": "/apps/process-manager/" },
    { "id": "file-manager", "path": "/apps/file-manager/" },
    { "id": "text-editor", "path": "/apps/text-editor/" }
  ]
}`,
                permissions: 'rw-r--r--',
                owner: 'system',
                created: now,
                modified: now,
                size: 450
            },

            // Terminal
            '/apps/terminal': {
                type: 'directory',
                name: 'terminal',
                parent: '/apps',
                children: ['config.json', 'index.html', 'main.js', 'style.css', 'icon.svg', 'commands.js', 'filesystem-commands.js'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            '/apps/terminal/config.json': {
                type: 'file',
                name: 'config.json',
                parent: '/apps/terminal',
                content: `{
  "app_name": "Terminal",
  "icon_url": "icon.svg",
  "dirApp": "index.html",
  "jsFile": "main.js",
  "styleFile": "style.css",
  "mode": "system_window",
  "width": "800px",
  "height": "500px",
  "x_position": "10vw",
  "y_position": "10vh",
  "minWidth": 200,
  "minHeight": 100,
  "autorun": false,
  "hidden": false
}`,
                permissions: 'rw-r--r--',
                owner: 'system',
                created: now,
                modified: now,
                size: 300
            },

            // File Manager
            '/apps/file-manager': {
                type: 'directory',
                name: 'file-manager',
                parent: '/apps',
                children: ['config.json', 'index.html', 'main.js', 'style.css', 'icon.svg'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            '/apps/file-manager/config.json': {
                type: 'file',
                name: 'config.json',
                parent: '/apps/file-manager',
                content: `{
  "app_name": "Gerenciador de Arquivos",
  "icon_url": "icon.svg",
  "dirApp": "index.html",
  "jsFile": "main.js",
  "styleFile": "style.css",
  "mode": "system_window",
  "width": "800px",
  "height": "600px",
  "x_position": "10vw",
  "y_position": "5vh",
  "minWidth": 600,
  "minHeight": 400,
  "autorun": false,
  "hidden": false
}`,
                permissions: 'rw-r--r--',
                owner: 'system',
                created: now,
                modified: now,
                size: 350
            },

            // Browser (TheOrb)
            '/apps/browser': {
                type: 'directory',
                name: 'browser',
                parent: '/apps',
                children: ['config.json', 'index.html', 'main.js', 'style.css', 'icon.svg'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            // Outros apps básicos
            '/apps/about': {
                type: 'directory',
                name: 'about',
                parent: '/apps',
                children: ['config.json', 'index.html', 'main.js', 'style.css', 'icon.svg'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            '/apps/clock': {
                type: 'directory',
                name: 'clock',
                parent: '/apps',
                children: ['config.json', 'index.html', 'main.js', 'style.css', 'icon.svg'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            '/apps/system-info': {
                type: 'directory',
                name: 'system-info',
                parent: '/apps',
                children: ['config.json', 'index.html', 'main.js', 'style.css', 'icon.svg'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            '/apps/taskbar': {
                type: 'directory',
                name: 'taskbar',
                parent: '/apps',
                children: ['config.json', 'index.html', 'main.js', 'style.css', 'icon.svg'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            '/apps/process-manager': {
                type: 'directory',
                name: 'process-manager',
                parent: '/apps',
                children: ['config.json', 'index.html', 'main.js', 'style.css', 'icon.svg'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            // Text Editor
            '/apps/text-editor': {
                type: 'directory',
                name: 'text-editor',
                parent: '/apps',
                children: ['config.json', 'index.html', 'main.js', 'style.css', 'icon.svg'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            '/apps/text-editor/config.json': {
                type: 'file',
                name: 'config.json',
                parent: '/apps/text-editor',
                content: `{
  "app_name": "Editor de Texto",
  "icon_url": "icon.svg", 
  "dirApp": "index.html",
  "jsFile": "main.js",
  "styleFile": "style.css",
  "mode": "system_window",
  "width": "900px",
  "height": "700px",
  "x_position": "5vw",
  "y_position": "5vh",
  "minWidth": 600,
  "minHeight": 400,
  "autorun": false,
  "hidden": false
}`,
                permissions: 'rw-r--r--',
                owner: 'system',
                created: now,
                modified: now,
                size: 320
            },

            // Assets do sistema
            '/assets': {
                type: 'directory',
                name: 'assets',
                parent: '/',
                children: ['icons', 'images', 'style'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            '/assets/icons': {
                type: 'directory',
                name: 'icons',
                parent: '/assets',
                children: ['apps', 'others', 'system'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            '/assets/icons/system': {
                type: 'directory',
                name: 'system',
                parent: '/assets/icons',
                children: ['menu_list.svg'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            '/assets/icons/apps': {
                type: 'directory',
                name: 'apps',
                parent: '/assets/icons',
                children: ['code_app.svg', 'gamestore_app.svg', 'generic_app_icon.svg', 'snake_game_app.svg'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            '/assets/images': {
                type: 'directory',
                name: 'images',
                parent: '/assets',
                children: ['wallpaper_01.jpg'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            '/assets/style': {
                type: 'directory',
                name: 'style',
                parent: '/assets',
                children: ['global.css'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            '/assets/style/global.css': {
                type: 'file',
                name: 'global.css',
                parent: '/assets/style',
                content: '/* Estilos globais do UnkayOS */',
                permissions: 'rw-r--r--',
                owner: 'system',
                created: now,
                modified: now,
                size: 35
            },

            // Core do sistema
            '/core': {
                type: 'directory',
                name: 'core',
                parent: '/',
                children: ['AppCore.js', 'AppManager.js', 'AppWindowSystem.js', 'AuthSystem.js', 'BaseApp.js', 'DragManager.js', 'FileSystem.js', 'MenuApps.js', 'PositionManager.js', 'WindowLayerManager.js', 'eventBus.js', 'configs', 'utils'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            '/core/FileSystem.js': {
                type: 'file',
                name: 'FileSystem.js',
                parent: '/core',
                content: '// Sistema de arquivos virtual do UnkayOS\n// Este arquivo contém a implementação completa do sistema de arquivos',
                permissions: 'rw-r--r--',
                owner: 'system',
                created: now,
                modified: now,
                size: 125
            },

            '/core/configs': {
                type: 'directory',
                name: 'configs',
                parent: '/core',
                children: ['auth-config.js'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            '/core/utils': {
                type: 'directory',
                name: 'utils',
                parent: '/core',
                children: ['generateCodeVerifier.js', 'generateUniqueId.js', 'loadJSON.js', 'pxToViewport.js'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            // Autenticação
            '/auth': {
                type: 'directory',
                name: 'auth',
                parent: '/',
                children: ['callback.html'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            // Design System
            '/design-system': {
                type: 'directory',
                name: 'design-system',
                parent: '/',
                children: ['styles'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            '/design-system/styles': {
                type: 'directory',
                name: 'styles',
                parent: '/design-system',
                children: ['base.css', 'icons.css', 'main.css', 'tokens.css', 'typography.css'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            // Documentação
            '/docs': {
                type: 'directory',
                name: 'docs',
                parent: '/',
                children: ['filesystem-guide.md', 'README.md'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            '/docs/filesystem-guide.md': {
                type: 'file',
                name: 'filesystem-guide.md',
                parent: '/docs',
                content: '# Sistema de Arquivos UnkayOS\n\nDocumentação completa do sistema de arquivos.',
                permissions: 'rw-r--r--',
                owner: 'system',
                created: now,
                modified: now,
                size: 85
            },

            // Apps do sistema
            '/system-apps': {
                type: 'directory',
                name: 'system-apps',
                parent: '/',
                children: ['menu-apps', 'taskbar'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            // Diretório home para usuários
            '/home': {
                type: 'directory',
                name: 'home',
                parent: '/',
                children: ['user'],
                permissions: 'rwxr-xr-x',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            },

            '/home/user': {
                type: 'directory',
                name: 'user',
                parent: '/home',
                children: ['Desktop', 'Documents', 'Downloads', 'Projects'],
                permissions: 'rwxrwxrwx',
                owner: 'user',
                created: now,
                modified: now,
                size: 0
            },

            '/home/user/Desktop': {
                type: 'directory',
                name: 'Desktop',
                parent: '/home/user',
                children: [],
                permissions: 'rwxrwxrwx',
                owner: 'user',
                created: now,
                modified: now,
                size: 0
            },

            '/home/user/Documents': {
                type: 'directory',
                name: 'Documents',
                parent: '/home/user',
                children: ['welcome.txt', 'notas.md', 'codigo.js'],
                permissions: 'rwxrwxrwx',
                owner: 'user',
                created: now,
                modified: now,
                size: 0
            },

            '/home/user/Documents/welcome.txt': {
                type: 'file',
                name: 'welcome.txt',
                parent: '/home/user/Documents',
                content: `Bem-vindo ao UnkayOS!

Este é um sistema operacional web modular e completo.

O sistema de arquivos agora reflete a estrutura real do projeto:
- /apps/ - Aplicativos do sistema
- /core/ - Núcleo do sistema
- /assets/ - Recursos visuais
- /docs/ - Documentação

Explore o sistema usando os comandos:
- ls -l para ver detalhes dos arquivos
- cd para navegar
- cat para ler arquivos
- tree para ver a estrutura

Você também pode usar o file-manager para interface gráfica!
Ou o text-editor para editar arquivos de texto!

Comandos úteis:
- edit <arquivo> - Abre arquivo no editor de texto
- text-editor - Abre o editor vazio
- fm - Abre o gerenciador de arquivos

Divirta-se explorando o UnkayOS!`,
                permissions: 'rw-rw-r--',
                owner: 'user',
                created: now,
                modified: now,
                size: 700
            },

            '/home/user/Documents/notas.md': {
                type: 'file',
                name: 'notas.md',
                parent: '/home/user/Documents',
                content: `# Minhas Notas - UnkayOS

## Sistema de Arquivos
- ✅ Implementado sistema virtual completo
- ✅ Integração com aplicativos
- ✅ Comandos de terminal

## Aplicativos Desenvolvidos
- Terminal com comandos Unix-like
- File Manager com interface gráfica
- **Editor de Texto** - Novo! 🎉

## Funcionalidades do Editor
- Abrir/salvar arquivos
- Buscar e substituir
- Numeração de linhas
- Atalhos de teclado
- Múltiplos formatos de fonte
- Histórico undo/redo

## Próximos Passos
- [ ] Syntax highlighting
- [ ] Múltiplas abas
- [ ] Auto-complete
- [ ] Plugins

---
*Editado no Editor de Texto do UnkayOS*`,
                permissions: 'rw-rw-r--',
                owner: 'user',
                created: now,
                modified: now,
                size: 650
            },

            '/home/user/Documents/codigo.js': {
                type: 'file',
                name: 'codigo.js',
                parent: '/home/user/Documents',
                content: `// Exemplo de código JavaScript - UnkayOS
// Este arquivo pode ser editado no Editor de Texto

class ExemploApp extends BaseApp {
    constructor(CORE, standardAPIs) {
        super(CORE, standardAPIs);
        this.dados = [];
    }

    async onRun() {
        console.log('App iniciado!');
        
        // Acesso ao sistema de arquivos
        const arquivos = this.fs.ls('/home/user/Documents');
        console.log('Arquivos encontrados:', arquivos);
        
        // Criação de elementos
        this.criarInterface();
    }

    criarInterface() {
        const container = this.$('.app-container');
        container.innerHTML = \`
            <h1>Meu App</h1>
            <button id="btn-acao">Clique aqui</button>
            <div id="resultado"></div>
        \`;
        
        this.$('#btn-acao').addEventListener('click', () => {
            this.executarAcao();
        });
    }

    executarAcao() {
        const resultado = this.$('#resultado');
        resultado.textContent = 'Ação executada com sucesso!';
        
        // Salvar dados no sistema de arquivos
        const dados = JSON.stringify(this.dados);
        this.fs.touch('/home/user/meus-dados.json', dados);
    }

    onCleanup() {
        console.log('Limpando recursos...');
        super.onCleanup();
    }
}

export default ExemploApp;`,
                permissions: 'rw-rw-r--',
                owner: 'user',
                created: now,
                modified: now,
                size: 1200
            },

            '/home/user/Downloads': {
                type: 'directory',
                name: 'Downloads',
                parent: '/home/user',
                children: [],
                permissions: 'rwxrwxrwx',
                owner: 'user',
                created: now,
                modified: now,
                size: 0
            },

            '/home/user/Projects': {
                type: 'directory',
                name: 'Projects',
                parent: '/home/user',
                children: [],
                permissions: 'rwxrwxrwx',
                owner: 'user',
                created: now,
                modified: now,
                size: 0
            },

            // Temporários
            '/tmp': {
                type: 'directory',
                name: 'tmp',
                parent: '/',
                children: [],
                permissions: 'rwxrwxrwx',
                owner: 'system',
                created: now,
                modified: now,
                size: 0
            }
        };
    }

    /**
     * Carrega o sistema de arquivos do localStorage
     */
    loadFileSystem() {
        if (this.memoryTree && Object.keys(this.memoryTree).length > 0) {
            return this.memoryTree;
        }
        try {
            if (typeof localStorage !== 'undefined') {
                const data = localStorage.getItem(this.STORAGE_KEY);
                if (data) {
                    this.memoryTree = JSON.parse(data);
                    return this.memoryTree;
                }
            }
        } catch (error) {
            console.error('[FileSystem] Erro ao carregar sistema de arquivos:', error);
        }
        if (!this.memoryTree || Object.keys(this.memoryTree).length === 0) {
            this.memoryTree = this.createRealFileSystemStructure();
        }
        return this.memoryTree;
    }

    /**
     * Salva o sistema de arquivos no localStorage e sincroniza com o kernel Wasm
     */
    saveFileSystem(fs) {
        this.memoryTree = fs;
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(fs));
            }
        } catch (error) {
            // Cota do localStorage excedida; memória e OPFS garantem operação contínua
        }
        if (typeof window !== 'undefined' && window.wasmFileSystem?.isReady) {
            window.wasmFileSystem.importLegacyTree(fs).catch(() => {});
        }
    }

    /**
     * Normaliza um caminho, resolvendo . e ..
     */
    normalizePath(path) {
        if (!path.startsWith('/')) {
            path = this.resolvePath(path);
        }

        const parts = path.split('/').filter(part => part !== '');
        const normalized = [];

        for (const part of parts) {
            if (part === '.') {
                continue;
            } else if (part === '..') {
                normalized.pop();
            } else {
                normalized.push(part);
            }
        }

        return '/' + normalized.join('/');
    }

    /**
     * Resolve um caminho relativo para absoluto
     */
    resolvePath(path) {
        if (path.startsWith('/')) {
            return path;
        }
        
        if (this.currentPath === '/') {
            return '/' + path;
        }
        
        return this.currentPath + '/' + path;
    }

    /**
     * Verifica se um caminho existe
     */
    exists(path) {
        const fs = this.loadFileSystem();
        const normalizedPath = this.normalizePath(path);
        return normalizedPath in fs;
    }

    /**
     * Obtém informações sobre um arquivo ou diretório
     */
    stat(path) {
        const fs = this.loadFileSystem();
        const normalizedPath = this.normalizePath(path);
        
        if (!this.exists(normalizedPath)) {
            throw new Error(`Caminho não encontrado: ${path}`);
        }
        
        return { ...fs[normalizedPath], path: normalizedPath };
    }

    /**
     * Lista o conteúdo de um diretório
     */
    readdir(path = '.') {
        const fs = this.loadFileSystem();
        const normalizedPath = this.normalizePath(path);
        
        if (!this.exists(normalizedPath)) {
            throw new Error(`Diretório não encontrado: ${path}`);
        }
        
        const item = fs[normalizedPath];
        if (item.type !== 'directory') {
            throw new Error(`${path} não é um diretório`);
        }
        
        return item.children.map(child => {
            const childPath = normalizedPath === '/' ? `/${child}` : `${normalizedPath}/${child}`;
            return {
                name: child,
                path: childPath,
                ...fs[childPath]
            };
        });
    }

    /**
     * Lê o conteúdo de um arquivo
     */
    readFile(path) {
        const fs = this.loadFileSystem();
        const normalizedPath = this.normalizePath(path);
        
        if (!this.exists(normalizedPath)) {
            throw new Error(`Arquivo não encontrado: ${path}`);
        }
        
        const item = fs[normalizedPath];
        if (item.type !== 'file') {
            throw new Error(`${path} não é um arquivo`);
        }
        
        return item.content || '';
    }

    /**
     * Escreve conteúdo em um arquivo
     */
    writeFile(path, content, options = {}) {
        const fs = this.loadFileSystem();
        const normalizedPath = this.normalizePath(path);
        const parentPath = this.getParentPath(normalizedPath);
        const fileName = this.getBaseName(normalizedPath);
        
        // Verifica se o diretório pai existe
        if (!this.exists(parentPath)) {
            throw new Error(`Diretório pai não encontrado: ${parentPath}`);
        }
        
        const parentDir = fs[parentPath];
        if (parentDir.type !== 'directory') {
            throw new Error(`${parentPath} não é um diretório`);
        }
        
        const now = new Date().toISOString();
        const isNew = !this.exists(normalizedPath);
        
        if (isNew) {
            // Adiciona o arquivo ao diretório pai
            if (!parentDir.children.includes(fileName)) {
                parentDir.children.push(fileName);
                parentDir.modified = now;
            }
        }
        
        // Cria ou atualiza o arquivo
        fs[normalizedPath] = {
            type: 'file',
            name: fileName,
            parent: parentPath,
            content: content,
            permissions: options.permissions || 'rw-rw-r--',
            owner: options.owner || 'user',
            created: isNew ? now : (fs[normalizedPath]?.created || now),
            modified: now,
            size: content.length
        };
        
        this.saveFileSystem(fs);
    }

    /**
     * Cria um diretório
     */
    mkdir(path, options = {}) {
        const fs = this.loadFileSystem();
        const normalizedPath = this.normalizePath(path);
        
        if (this.exists(normalizedPath)) {
            if (!options.force) {
                throw new Error(`Diretório já existe: ${path}`);
            }
            return;
        }
        
        const parentPath = this.getParentPath(normalizedPath);
        const dirName = this.getBaseName(normalizedPath);
        
        // Verifica se o diretório pai existe
        if (!this.exists(parentPath)) {
            if (options.recursive) {
                this.mkdir(parentPath, options);
            } else {
                throw new Error(`Diretório pai não encontrado: ${parentPath}`);
            }
        }
        
        const parentDir = fs[parentPath];
        if (parentDir.type !== 'directory') {
            throw new Error(`${parentPath} não é um diretório`);
        }
        
        const now = new Date().toISOString();
        
        // Adiciona o diretório ao pai
        if (!parentDir.children.includes(dirName)) {
            parentDir.children.push(dirName);
            parentDir.modified = now;
        }
        
        // Cria o diretório
        fs[normalizedPath] = {
            type: 'directory',
            name: dirName,
            parent: parentPath,
            children: [],
            permissions: options.permissions || 'rwxrwxr-x',
            owner: options.owner || 'user',
            created: now,
            modified: now,
            size: 0
        };
        
        this.saveFileSystem(fs);
    }

    /**
     * Remove um arquivo ou diretório
     */
    remove(path, options = {}) {
        const fs = this.loadFileSystem();
        const normalizedPath = this.normalizePath(path);
        
        if (!this.exists(normalizedPath)) {
            if (!options.force) {
                throw new Error(`Caminho não encontrado: ${path}`);
            }
            return;
        }
        
        const item = fs[normalizedPath];
        const parentPath = item.parent;
        
        // Se for diretório, verifica se está vazio ou se recursive está habilitado
        if (item.type === 'directory') {
            if (item.children.length > 0 && !options.recursive) {
                throw new Error(`Diretório não está vazio: ${path}`);
            }
            
            // Remove recursivamente se necessário
            if (options.recursive) {
                for (const child of item.children) {
                    const childPath = normalizedPath === '/' ? `/${child}` : `${normalizedPath}/${child}`;
                    this.remove(childPath, options);
                }
            }
        }
        
        // Remove do diretório pai
        if (parentPath && this.exists(parentPath)) {
            const parentDir = fs[parentPath];
            const index = parentDir.children.indexOf(item.name);
            if (index > -1) {
                parentDir.children.splice(index, 1);
                parentDir.modified = new Date().toISOString();
            }
        }
        
        // Remove o item
        delete fs[normalizedPath];
        
        this.saveFileSystem(fs);
    }

    /**
     * Move/renomeia um arquivo ou diretório
     */
    move(srcPath, destPath) {
        const fs = this.loadFileSystem();
        const normalizedSrc = this.normalizePath(srcPath);
        const normalizedDest = this.normalizePath(destPath);
        
        if (!this.exists(normalizedSrc)) {
            throw new Error(`Origem não encontrada: ${srcPath}`);
        }
        
        if (this.exists(normalizedDest)) {
            throw new Error(`Destino já existe: ${destPath}`);
        }
        
        const srcItem = { ...fs[normalizedSrc] };
        const srcParentPath = srcItem.parent;
        const destParentPath = this.getParentPath(normalizedDest);
        const destName = this.getBaseName(normalizedDest);
        
        // Verifica se o diretório de destino existe
        if (!this.exists(destParentPath)) {
            throw new Error(`Diretório de destino não encontrado: ${destParentPath}`);
        }
        
        // Remove da origem
        if (srcParentPath && this.exists(srcParentPath)) {
            const srcParentDir = fs[srcParentPath];
            const index = srcParentDir.children.indexOf(srcItem.name);
            if (index > -1) {
                srcParentDir.children.splice(index, 1);
                srcParentDir.modified = new Date().toISOString();
            }
        }
        
        // Adiciona ao destino
        const destParentDir = fs[destParentPath];
        if (!destParentDir.children.includes(destName)) {
            destParentDir.children.push(destName);
            destParentDir.modified = new Date().toISOString();
        }
        
        // Atualiza o item
        srcItem.name = destName;
        srcItem.parent = destParentPath;
        srcItem.modified = new Date().toISOString();
        
        // Se for diretório, atualiza todos os filhos recursivamente
        if (srcItem.type === 'directory') {
            this.updateChildrenPaths(fs, normalizedSrc, normalizedDest);
        }
        
        // Remove o item antigo e adiciona o novo
        delete fs[normalizedSrc];
        fs[normalizedDest] = srcItem;
        
        this.saveFileSystem(fs);
    }

    /**
     * Copia um arquivo ou diretório
     */
    copy(srcPath, destPath, options = {}) {
        const fs = this.loadFileSystem();
        const normalizedSrc = this.normalizePath(srcPath);
        const normalizedDest = this.normalizePath(destPath);
        
        if (!this.exists(normalizedSrc)) {
            throw new Error(`Origem não encontrada: ${srcPath}`);
        }
        
        if (this.exists(normalizedDest) && !options.force) {
            throw new Error(`Destino já existe: ${destPath}`);
        }
        
        const srcItem = fs[normalizedSrc];
        const destParentPath = this.getParentPath(normalizedDest);
        const destName = this.getBaseName(normalizedDest);
        
        // Verifica se o diretório de destino existe
        if (!this.exists(destParentPath)) {
            throw new Error(`Diretório de destino não encontrado: ${destParentPath}`);
        }
        
        const now = new Date().toISOString();
        
        if (srcItem.type === 'file') {
            // Copia arquivo
            this.writeFile(normalizedDest, srcItem.content, {
                permissions: srcItem.permissions,
                owner: srcItem.owner
            });
        } else {
            // Copia diretório
            this.mkdir(normalizedDest, {
                permissions: srcItem.permissions,
                owner: srcItem.owner
            });
            
            // Copia recursivamente se necessário
            if (options.recursive) {
                for (const child of srcItem.children) {
                    const childSrc = normalizedSrc === '/' ? `/${child}` : `${normalizedSrc}/${child}`;
                    const childDest = normalizedDest === '/' ? `/${child}` : `${normalizedDest}/${child}`;
                    this.copy(childSrc, childDest, options);
                }
            }
        }
    }

    /**
     * Atualiza caminhos dos filhos após mover um diretório
     */
    updateChildrenPaths(fs, oldPath, newPath) {
        for (const key in fs) {
            if (key.startsWith(oldPath + '/')) {
                const relativePath = key.substring(oldPath.length);
                const newKey = newPath + relativePath;
                
                fs[newKey] = { ...fs[key] };
                fs[newKey].parent = newPath + '/' + fs[newKey].parent.substring(oldPath.length + 1);
                
                delete fs[key];
            }
        }
    }

    /**
     * Obtém o caminho do diretório pai
     */
    getParentPath(path) {
        if (path === '/') return null;
        const parts = path.split('/');
        parts.pop();
        return parts.join('/') || '/';
    }

    /**
     * Obtém o nome do arquivo/diretório
     */
    getBaseName(path) {
        if (path === '/') return '';
        const parts = path.split('/');
        return parts[parts.length - 1];
    }

    /**
     * Muda o diretório atual
     */
    changeDirectory(path) {
        const normalizedPath = this.normalizePath(path);
        
        if (!this.exists(normalizedPath)) {
            throw new Error(`Diretório não encontrado: ${path}`);
        }
        
        const item = this.stat(normalizedPath);
        if (item.type !== 'directory') {
            throw new Error(`${path} não é um diretório`);
        }
        
        this.currentPath = normalizedPath;
        return this.currentPath;
    }

    /**
     * Obtém o diretório atual
     */
    getCurrentDirectory() {
        return this.currentPath;
    }

    /**
     * Busca arquivos por padrão
     */
    find(pattern, startPath = '.', options = {}) {
        const results = [];
        const normalizedStart = this.normalizePath(startPath);
        
        if (!this.exists(normalizedStart)) {
            throw new Error(`Diretório não encontrado: ${startPath}`);
        }
        
        this._findRecursive(normalizedStart, pattern, results, options);
        return results;
    }

    /**
     * Busca recursiva para find
     */
    _findRecursive(currentPath, pattern, results, options) {
        try {
            const items = this.readdir(currentPath);
            
            for (const item of items) {
                const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
                
                if (regex.test(item.name)) {
                    results.push({
                        path: item.path,
                        name: item.name,
                        type: item.type
                    });
                }
                
                if (item.type === 'directory' && options.recursive !== false) {
                    this._findRecursive(item.path, pattern, results, options);
                }
            }
        } catch (error) {
            // Ignora erros de acesso durante busca recursiva
        }
    }

    /**
     * Sincroniza o sistema de arquivos virtual com arquivos reais do projeto
     * Esta função pode ser chamada para atualizar o sistema de arquivos
     */
    async syncWithRealFiles() {
        try {
            // Carrega apps.json real
            const response = await fetch('/apps/apps.json');
            if (response.ok) {
                const appsData = await response.text();
                this.writeFile('/apps/apps.json', appsData);
            }
            
            // Atualiza configurações dos apps reais
            const appConfigs = [
                'terminal', 'about', 'clock', 'system-info', 
                'taskbar', 'browser', 'process-manager', 'file-manager'
            ];
            
            for (const app of appConfigs) {
                try {
                    const configResponse = await fetch(`/apps/${app}/config.json`);
                    if (configResponse.ok) {
                        const configData = await configResponse.text();
                        this.writeFile(`/apps/${app}/config.json`, configData);
                    }
                } catch (e) {
                    console.warn(`Não foi possível carregar config de ${app}:`, e);
                }
            }
            
            return { success: true, message: 'Sistema de arquivos sincronizado com arquivos reais' };
        } catch (error) {
            console.error('Erro ao sincronizar com arquivos reais:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Reseta o sistema de arquivos e recria com estrutura atual
     */
    resetFileSystem() {
        localStorage.removeItem(this.storageKey);
        this.initializeFileSystem();
        return { success: true, message: 'Sistema de arquivos resetado com estrutura real' };
    }
}

// Instância global do sistema de arquivos
export const fileSystem = new FileSystem();

// API simplificada para uso em aplicativos
export const fs = {
    // Operações de diretório
    ls: (path) => fileSystem.readdir(path),
    cd: (path) => fileSystem.changeDirectory(path),
    pwd: () => fileSystem.getCurrentDirectory(),
    mkdir: (path, options) => fileSystem.mkdir(path, options),
    rmdir: (path, options) => fileSystem.remove(path, { ...options, recursive: false }),
    
    // Operações de arquivo
    cat: (path) => fileSystem.readFile(path),
    touch: (path, content = '') => fileSystem.writeFile(path, content),
    rm: (path, options) => fileSystem.remove(path, options),
    cp: (src, dest, options) => fileSystem.copy(src, dest, options),
    mv: (src, dest) => fileSystem.move(src, dest),
    
    // Utilitários
    exists: (path) => fileSystem.exists(path),
    stat: (path) => fileSystem.stat(path),
    find: (pattern, startPath, options) => fileSystem.find(pattern, startPath, options),
    
    // Caminhos
    normalize: (path) => fileSystem.normalizePath(path),
    resolve: (path) => fileSystem.resolvePath(path),
    basename: (path) => fileSystem.getBaseName(path),
    dirname: (path) => fileSystem.getParentPath(path)
};
