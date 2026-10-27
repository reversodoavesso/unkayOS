// apps/text-editor/main.js - Editor de Texto UnkayOS

import { BaseApp } from '../../core/BaseApp.js';

export default class TextEditorApp extends BaseApp {
    
    static parameters = {
        file: {
            type: 'string',
            required: false,
            description: 'Caminho do arquivo para abrir automaticamente'
        },
        content: {
            type: 'string',
            required: false,
            description: 'Conteúdo inicial para um novo documento'
        }
    };

    constructor(CORE, standardAPIs, appContentRoot = null, desktopElement = null) {
        super(CORE, standardAPIs, appContentRoot, desktopElement);
        
        // Estado do editor
        this.currentFile = null;
        this.currentPath = '/home/user';
        this.isModified = false;
        this.undoHistory = [];
        this.redoHistory = [];
        this.maxHistorySize = 100;
        this.searchMatches = [];
        this.currentSearchIndex = -1;
        
        // Elementos do DOM
        this.textArea = null;
        this.lineNumbers = null;
        this.statusElements = {};
        
        // Configurações
        this.config = {
            fontSize: 14,
            fontFamily: 'monospace',
            tabSize: 4,
            autoSave: false
        };
    }

    async onRun(terminalOutputCallback = null, appParams = {}) {
        console.log('[TextEditor] Iniciando aplicativo...', appParams);
        super.onRun(terminalOutputCallback, appParams);
        
        // Inicializa os elementos DOM
        this.initializeElements();
        
        // Configura event listeners
        this.setupEventListeners();
        
        // Configura atalhos de teclado
        await this.setupKeyboardShortcuts();
        
        // Configura menus de contexto
        await this.setupContextMenus();
        
        // Atualiza a interface
        this.updateInterface();
        
        // Carrega a árvore de arquivos da sidebar
        this.loadFileTree();
        
        // Se um arquivo foi especificado nos parâmetros, abre ele
        if (appParams.file) {
            this.openFile(appParams.file);
        } else if (appParams.filePath) {
            this.openFile(appParams.filePath);
        } else if (typeof appParams.content === 'string') {
            this.textArea.value = appParams.content;
            this.isModified = true;
            this.clearHistory();
            this.updateInterface();
        }
        
        console.log('[TextEditor] Editor de texto inicializado');
    }

    async setupContextMenus() {
        await this.registerContextMenu('.file-tree-item', ({ matchedElement }) => {
            const fullPath = matchedElement?.dataset?.path;
            const itemType = matchedElement?.dataset?.type;
            if (!fullPath) return [];
            const items = [];
            if (itemType === 'file') {
                items.push({
                    label: 'Abrir no Editor',
                    icon: 'file-text',
                    action: () => this.openFile(fullPath)
                });
            }
            items.push(
                {
                    label: 'Abrir local no Gerenciador de Arquivos',
                    icon: 'folder-open',
                    action: () => {
                        const dir = itemType === 'directory' ? fullPath : this.fs.dirname(fullPath);
                        this.appManager?.runApp('file-manager', { path: dir });
                    }
                },
                {
                    label: 'Copiar caminho',
                    icon: 'copy',
                    action: () => navigator.clipboard?.writeText?.(fullPath)
                }
            );
            return items;
        });

        await this.registerContextMenu(() => [
            { type: 'header', label: 'Editor de Texto' },
            {
                label: 'Novo arquivo',
                icon: 'file-plus',
                shortcut: 'Ctrl+N',
                action: () => this.newFile()
            },
            {
                label: 'Abrir arquivo...',
                icon: 'folder-open',
                shortcut: 'Ctrl+O',
                action: () => this.showOpenDialog()
            },
            {
                label: 'Salvar',
                icon: 'save',
                shortcut: 'Ctrl+S',
                disabled: !this.isModified,
                action: () => this.saveFile()
            },
            {
                label: 'Salvar como...',
                icon: 'download',
                shortcut: 'Ctrl+Shift+S',
                action: () => this.showSaveAsDialog()
            },
            { type: 'separator' },
            {
                label: 'Desfazer',
                icon: 'undo-2',
                shortcut: 'Ctrl+Z',
                disabled: this.undoHistory.length <= 1,
                action: () => this.undo()
            },
            {
                label: 'Refazer',
                icon: 'redo-2',
                shortcut: 'Ctrl+Y',
                disabled: this.redoHistory.length === 0,
                action: () => this.redo()
            },
            { type: 'separator' },
            {
                label: 'Buscar no texto...',
                icon: 'search',
                shortcut: 'Ctrl+F',
                action: () => this.showSearchPanel(false)
            },
            {
                label: 'Substituir...',
                icon: 'replace',
                shortcut: 'Ctrl+H',
                action: () => this.showSearchPanel(true)
            }
        ]);
    }

    initializeElements() {
        console.log('[TextEditor] Inicializando elementos DOM...');
        
        // Elementos principais
        this.textArea = this.$('#text-editor');
        this.lineNumbers = this.$('#line-numbers');
        
        console.log('[TextEditor] Elementos encontrados:', {
            textArea: !!this.textArea,
            lineNumbers: !!this.lineNumbers
        });
        
        // Elementos de status
        this.statusElements = {
            fileStatus: this.$('#file-status'),
            filePath: this.$('#file-path'),
            cursorPosition: this.$('#cursor-position'),
            selectionInfo: this.$('#selection-info'),
            wordCount: this.$('#word-count')
        };
        
        // Elementos de busca
        this.searchPanel = this.$('#search-panel');
        this.searchInput = this.$('#search-input');
        this.replaceInput = this.$('#replace-input');
        this.replaceRow = this.$('#replace-row');
        
        // Modais
        this.openModal = this.$('#open-modal');
        this.saveAsModal = this.$('#save-as-modal');
    }

    setupEventListeners() {
        // Botões da toolbar
        this.$('#btn-new').addEventListener('click', () => this.newFile());
        this.$('#btn-open').addEventListener('click', () => this.showOpenDialog());
        this.$('#btn-save').addEventListener('click', () => this.saveFile());
        this.$('#btn-save-as').addEventListener('click', () => this.showSaveAsDialog());
        this.$('#btn-undo').addEventListener('click', () => this.undo());
        this.$('#btn-redo').addEventListener('click', () => this.redo());
        this.$('#btn-find').addEventListener('click', () => this.showSearchPanel());
        this.$('#btn-replace').addEventListener('click', () => this.showSearchPanel(true));
        
        // Sidebar
        this.$('#toggle-sidebar').addEventListener('click', () => this.toggleSidebar());
        
        // Configurações
        this.$('#font-size')?.addEventListener('change', (e) => this.setFontSize(e.target.value));
        this.$('#font-family')?.addEventListener('change', (e) => this.setFontFamily(e.target.value));
        
        // Editor de texto
        this.textArea.addEventListener('input', () => this.onTextChange());
        this.textArea.addEventListener('scroll', () => this.syncLineNumbers());
        this.textArea.addEventListener('keydown', (e) => this.onKeyDown(e));
        this.textArea.addEventListener('click', () => this.updateCursorPosition());
        this.textArea.addEventListener('keyup', () => this.updateCursorPosition());
        
        // Busca
        this.$('#search-input').addEventListener('input', () => this.performSearch());
        this.$('#search-prev').addEventListener('click', () => this.findPrevious());
        this.$('#search-next').addEventListener('click', () => this.findNext());
        this.$('#search-close').addEventListener('click', () => this.hideSearchPanel());
        this.$('#replace-one').addEventListener('click', () => this.replaceOne());
        this.$('#replace-all').addEventListener('click', () => this.replaceAll());
        
        // Modais
        this.setupModalEventListeners();
    }

    setupModalEventListeners() {
        // Modal de abrir arquivo
        this.$('#open-modal-close').addEventListener('click', () => this.hideOpenDialog());
        this.$('#open-cancel').addEventListener('click', () => this.hideOpenDialog());
        this.$('#open-confirm').addEventListener('click', () => this.confirmOpenFile());
        
        // Modal de salvar como
        this.$('#save-as-modal-close').addEventListener('click', () => this.hideSaveAsDialog());
        this.$('#save-as-cancel').addEventListener('click', () => this.hideSaveAsDialog());
        this.$('#save-as-confirm').addEventListener('click', () => this.confirmSaveAs());
        
        // Fechar modal clicando no fundo
        this.openModal.addEventListener('click', (e) => {
            if (e.target === this.openModal) this.hideOpenDialog();
        });
        this.saveAsModal.addEventListener('click', (e) => {
            if (e.target === this.saveAsModal) this.hideSaveAsDialog();
        });
    }

    async setupKeyboardShortcuts() {
        // Usando o novo sistema de gerenciamento de teclado
        await this.registerKeyboardShortcut('ctrl+n', () => this.newFile());
        await this.registerKeyboardShortcut('ctrl+o', () => this.showOpenDialog());
        await this.registerKeyboardShortcut('ctrl+s', () => this.saveFile());
        await this.registerKeyboardShortcut('ctrl+shift+s', () => this.showSaveAsDialog());
        await this.registerKeyboardShortcut(['ctrl+z'], () => this.undo());
        await this.registerKeyboardShortcut(['ctrl+shift+z', 'ctrl+y'], () => this.redo());
        await this.registerKeyboardShortcut('ctrl+f', () => this.showSearchPanel());
        await this.registerKeyboardShortcut('ctrl+h', () => this.showSearchPanel(true));
        await this.registerKeyboardShortcut('ctrl+a', () => this.textArea.select());
        await this.registerKeyboardShortcut('escape', () => {
            this.hideSearchPanel();
            this.hideOpenDialog();
            this.hideSaveAsDialog();
        });
    }

    // === OPERAÇÕES DE ARQUIVO ===

    newFile() {
        if (this.isModified) {
            if (!confirm('Você tem alterações não salvas. Deseja continuar?')) {
                return;
            }
        }
        
        this.currentFile = null;
        this.textArea.value = '';
        this.isModified = false;
        this.clearHistory();
        this.updateInterface();
        this.textArea.focus();
    }

    async showOpenDialog() {
        this.currentPath = this.currentFile ? this.fs.dirname(this.currentFile) : '/home/user';
        await this.updateFileList('open');
        this.openModal.style.display = 'flex';
        this.$('#file-name-input').value = '';
        this.$('#file-name-input').focus();
    }

    hideOpenDialog() {
        this.openModal.style.display = 'none';
    }

    async confirmOpenFile() {
        const fileName = this.$('#file-name-input').value.trim();
        if (!fileName) {
            alert('Por favor, insira um nome de arquivo.');
            return;
        }
        
        const filePath = this.currentPath === '/' ? `/${fileName}` : `${this.currentPath}/${fileName}`;
        await this.openFile(filePath);
        this.hideOpenDialog();
    }

    async openFile(filePath) {
        try {
            if (!this.fs.exists(filePath)) {
                alert(`Arquivo não encontrado: ${filePath}`);
                return;
            }
            
            const stat = this.fs.stat(filePath);
            if (stat.type !== 'file') {
                alert('O caminho especificado não é um arquivo.');
                return;
            }
            
            const content = this.fs.cat(filePath);
            
            if (this.isModified) {
                if (!confirm('Você tem alterações não salvas. Deseja continuar?')) {
                    return;
                }
            }
            
            this.currentFile = filePath;
            this.textArea.value = content;
            this.isModified = false;
            this.clearHistory();
            this.addToHistory();
            this.updateInterface();
            this.textArea.focus();
            
            console.log(`[TextEditor] Arquivo aberto: ${filePath}`);
        } catch (error) {
            console.error('[TextEditor] Erro ao abrir arquivo:', error);
            alert(`Erro ao abrir arquivo: ${error.message}`);
        }
    }

    async saveFile() {
        if (!this.currentFile) {
            this.showSaveAsDialog();
            return;
        }
        
        try {
            this.fs.touch(this.currentFile, this.textArea.value);
            this.isModified = false;
            this.updateInterface();
            console.log(`[TextEditor] Arquivo salvo: ${this.currentFile}`);
        } catch (error) {
            console.error('[TextEditor] Erro ao salvar arquivo:', error);
            alert(`Erro ao salvar arquivo: ${error.message}`);
        }
    }

    async showSaveAsDialog() {
        this.currentPath = this.currentFile ? this.fs.dirname(this.currentFile) : '/home/user';
        await this.updateFileList('save');
        this.saveAsModal.style.display = 'flex';
        
        const fileName = this.currentFile ? this.fs.basename(this.currentFile) : 'sem-titulo.txt';
        this.$('#save-file-name-input').value = fileName;
        this.$('#save-file-name-input').focus();
        this.$('#save-file-name-input').select();
    }

    hideSaveAsDialog() {
        this.saveAsModal.style.display = 'none';
    }

    async confirmSaveAs() {
        const fileName = this.$('#save-file-name-input').value.trim();
        if (!fileName) {
            alert('Por favor, insira um nome de arquivo.');
            return;
        }
        
        const filePath = this.currentPath === '/' ? `/${fileName}` : `${this.currentPath}/${fileName}`;
        
        if (this.fs.exists(filePath)) {
            if (!confirm(`O arquivo ${fileName} já existe. Deseja substituí-lo?`)) {
                return;
            }
        }
        
        try {
            this.fs.touch(filePath, this.textArea.value);
            this.currentFile = filePath;
            this.isModified = false;
            this.updateInterface();
            this.hideSaveAsDialog();
            console.log(`[TextEditor] Arquivo salvo como: ${filePath}`);
        } catch (error) {
            console.error('[TextEditor] Erro ao salvar arquivo:', error);
            alert(`Erro ao salvar arquivo: ${error.message}`);
        }
    }

    // === NAVEGAÇÃO DE ARQUIVOS ===

    async updateFileList(mode = 'open') {
        const listElement = mode === 'open' ? this.$('#file-list') : this.$('#save-file-list');
        const pathElement = mode === 'open' ? this.$('#current-path') : this.$('#save-current-path');
        
        pathElement.textContent = this.currentPath;
        listElement.innerHTML = '';
        
        try {
            const items = this.fs.ls(this.currentPath);
            
            // Adiciona item para voltar ao diretório pai
            if (this.currentPath !== '/') {
                const parentItem = this.createFileItem('..', 'directory', 0, true);
                listElement.appendChild(parentItem);
            }
            
            // Ordena: diretórios primeiro, depois arquivos
            const sortedItems = items.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === 'directory' ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });
            
            for (const item of sortedItems) {
                const fileItem = this.createFileItem(item.name, item.type, item.size);
                listElement.appendChild(fileItem);
            }
        } catch (error) {
            console.error('[TextEditor] Erro ao listar arquivos:', error);
            listElement.innerHTML = '<div class="file-item">Erro ao carregar diretório</div>';
        }
    }

    createFileItem(name, type, size, isParent = false) {
        const item = document.createElement('div');
        item.className = `file-item ${type}`;
        
        const icon = document.createElement('rda-icon');
        icon.setAttribute('size', '20');
        icon.setAttribute('name', isParent ? 'chevron-up' : (type === 'directory' ? 'folder' : 'file-text'));
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-name';
        nameSpan.textContent = name;
        
        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'file-size';
        sizeSpan.textContent = type === 'file' ? this.formatFileSize(size) : '';
        
        item.appendChild(icon);
        item.appendChild(nameSpan);
        item.appendChild(sizeSpan);
        
        // Event listeners
        item.addEventListener('click', () => {
            // Remove seleção anterior
            item.parentElement.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            
            if (type === 'directory' || isParent) {
                // Navegar para diretório
                this.navigateToDirectory(name, isParent);
            } else {
                // Selecionar arquivo
                const input = item.closest('.modal').querySelector('input[type="text"]');
                input.value = name;
            }
        });
        
        item.addEventListener('dblclick', () => {
            if (type === 'directory' || isParent) {
                this.navigateToDirectory(name, isParent);
            } else {
                // Abrir arquivo diretamente
                const confirmBtn = item.closest('.modal').querySelector('.btn-primary');
                confirmBtn.click();
            }
        });
        
        return item;
    }

    async navigateToDirectory(dirName, isParent = false) {
        try {
            if (isParent) {
                this.currentPath = this.fs.dirname(this.currentPath);
            } else {
                this.currentPath = this.currentPath === '/' ? `/${dirName}` : `${this.currentPath}/${dirName}`;
            }
            
            // Atualiza a lista de arquivos no modal ativo
            const openModal = this.openModal.style.display !== 'none';
            await this.updateFileList(openModal ? 'open' : 'save');
        } catch (error) {
            console.error('[TextEditor] Erro ao navegar:', error);
            alert('Erro ao acessar o diretório.');
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // === EDIÇÃO DE TEXTO ===

    onTextChange() {
        this.isModified = true;
        this.updateInterface();
        this.updateLineNumbers();
    }

    onKeyDown(e) {
        // Captura mudanças para histórico antes de aplicar
        if (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete' || 
            (e.key.length === 1 && !e.ctrlKey && !e.altKey)) {
            this.addToHistory();
        }
        
        // Manipulação de Tab
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = this.textArea.selectionStart;
            const end = this.textArea.selectionEnd;
            const spaces = ' '.repeat(this.config.tabSize);
            
            this.textArea.value = this.textArea.value.substring(0, start) + 
                                 spaces + 
                                 this.textArea.value.substring(end);
            
            this.textArea.selectionStart = this.textArea.selectionEnd = start + this.config.tabSize;
            this.onTextChange();
        }
    }

    // === HISTÓRICO (UNDO/REDO) ===

    addToHistory() {
        const currentState = this.textArea.value;
        if (this.undoHistory.length === 0 || this.undoHistory[this.undoHistory.length - 1] !== currentState) {
            this.undoHistory.push(currentState);
            if (this.undoHistory.length > this.maxHistorySize) {
                this.undoHistory.shift();
            }
            this.redoHistory = []; // Limpa redo history ao adicionar nova mudança
        }
    }

    undo() {
        if (this.undoHistory.length > 1) {
            this.redoHistory.push(this.undoHistory.pop());
            this.textArea.value = this.undoHistory[this.undoHistory.length - 1];
            this.updateInterface();
        }
    }

    redo() {
        if (this.redoHistory.length > 0) {
            const state = this.redoHistory.pop();
            this.undoHistory.push(state);
            this.textArea.value = state;
            this.updateInterface();
        }
    }

    clearHistory() {
        this.undoHistory = [this.textArea.value];
        this.redoHistory = [];
    }

    // === BUSCA E SUBSTITUIÇÃO ===

    showSearchPanel(showReplace = false) {
        this.searchPanel.style.display = 'block';
        this.replaceRow.style.display = showReplace ? 'flex' : 'none';
        this.searchInput.focus();
        this.searchInput.select();
    }

    hideSearchPanel() {
        this.searchPanel.style.display = 'none';
        this.clearSearchHighlights();
        this.textArea.focus();
    }

    performSearch() {
        const searchTerm = this.searchInput.value;
        if (!searchTerm) {
            this.clearSearchHighlights();
            return;
        }
        
        const text = this.textArea.value;
        this.searchMatches = [];
        
        let index = 0;
        while ((index = text.indexOf(searchTerm, index)) !== -1) {
            this.searchMatches.push({
                start: index,
                end: index + searchTerm.length
            });
            index++;
        }
        
        if (this.searchMatches.length > 0) {
            this.currentSearchIndex = 0;
            this.highlightCurrentMatch();
        } else {
            this.currentSearchIndex = -1;
        }
    }

    findNext() {
        if (this.searchMatches.length === 0) return;
        
        this.currentSearchIndex = (this.currentSearchIndex + 1) % this.searchMatches.length;
        this.highlightCurrentMatch();
    }

    findPrevious() {
        if (this.searchMatches.length === 0) return;
        
        this.currentSearchIndex = this.currentSearchIndex <= 0 ? 
            this.searchMatches.length - 1 : this.currentSearchIndex - 1;
        this.highlightCurrentMatch();
    }

    highlightCurrentMatch() {
        if (this.currentSearchIndex >= 0 && this.currentSearchIndex < this.searchMatches.length) {
            const match = this.searchMatches[this.currentSearchIndex];
            this.textArea.focus();
            this.textArea.setSelectionRange(match.start, match.end);
            this.textArea.scrollIntoView();
        }
    }

    clearSearchHighlights() {
        this.searchMatches = [];
        this.currentSearchIndex = -1;
    }

    replaceOne() {
        if (this.currentSearchIndex >= 0 && this.currentSearchIndex < this.searchMatches.length) {
            const match = this.searchMatches[this.currentSearchIndex];
            const replaceText = this.replaceInput.value;
            
            this.textArea.value = this.textArea.value.substring(0, match.start) +
                                 replaceText +
                                 this.textArea.value.substring(match.end);
            
            this.addToHistory();
            this.onTextChange();
            this.performSearch(); // Reperform search to update matches
        }
    }

    replaceAll() {
        const searchTerm = this.searchInput.value;
        const replaceText = this.replaceInput.value;
        
        if (!searchTerm) return;
        
        const originalText = this.textArea.value;
        const newText = originalText.replaceAll(searchTerm, replaceText);
        
        if (newText !== originalText) {
            this.addToHistory();
            this.textArea.value = newText;
            this.onTextChange();
        }
        
        this.performSearch(); // Update search results
    }

    // === INTERFACE ===

    updateInterface() {
        // Nome do arquivo
        const fileName = this.currentFile ? this.fs.basename(this.currentFile) : 'Novo arquivo';
        this.statusElements.fileStatus.textContent = fileName;
        
        // Caminho do arquivo
        this.statusElements.filePath.textContent = this.currentFile || '';
        
        // Contadores
        const text = this.textArea.value;
        
        this.statusElements.wordCount.textContent = `${this.countWords(text)} palavras`;
        
        // Números de linha
        this.updateLineNumbers();
        this.updateCursorPosition();
        
        // Estado dos botões
        const canUndo = this.undoHistory.length > 1;
        const canRedo = this.redoHistory.length > 0;
        
        this.$('#btn-undo').disabled = !canUndo;
        this.$('#btn-redo').disabled = !canRedo;
        this.$('#btn-save').disabled = !this.isModified;
    }

    updateLineNumbers() {
        const lines = this.textArea.value.split('\n');
        const lineNumbersHtml = lines.map((_, index) => 
            `<div class="line-number">${index + 1}</div>`
        ).join('');
        
        this.lineNumbers.innerHTML = lineNumbersHtml;
        this.syncLineNumbers();
    }

    syncLineNumbers() {
        this.lineNumbers.scrollTop = this.textArea.scrollTop;
    }

    updateCursorPosition() {
        const cursorPos = this.textArea.selectionStart;
        const text = this.textArea.value.substring(0, cursorPos);
        const lines = text.split('\n');
        const line = lines.length;
        const column = lines[lines.length - 1].length + 1;
        
        this.statusElements.cursorPosition.textContent = `Linha ${line}, Coluna ${column}`;
    }

    setFontSize(size) {
        this.config.fontSize = parseInt(size);
        this.textArea.style.fontSize = `${size}px`;
        this.lineNumbers.style.fontSize = `${size}px`;
    }

    setFontFamily(family) {
        this.config.fontFamily = family;
        this.textArea.style.fontFamily = family;
        this.lineNumbers.style.fontFamily = family;
    }

    toggleSidebar() {
        const sidebar = this.$('#file-sidebar');
        const toggle = this.$('#toggle-sidebar');
        
        if (sidebar.style.display === 'none') {
            sidebar.style.display = 'flex';
            toggle.textContent = '−';
        } else {
            sidebar.style.display = 'none';
            toggle.textContent = '+';
        }
    }

    loadFileTree() {
        const treeContainer = this.$('#file-tree');
        treeContainer.innerHTML = '<div style="padding: 8px; color: var(--color-text-secondary);">Carregando...</div>';
        
        try {
            this.renderFileTree('/home/user', treeContainer);
        } catch (error) {
            console.error('[TextEditor] Erro ao carregar árvore de arquivos:', error);
            treeContainer.innerHTML = '<div style="padding: 8px; color: var(--color-error);">Erro ao carregar arquivos</div>';
        }
    }

    renderFileTree(path, container, level = 0) {
        try {
            const items = this.fs.ls(path);
            
            // Ordena: diretórios primeiro, depois arquivos
            const sortedItems = items.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === 'directory' ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });
            
            container.innerHTML = '';
            
            for (const item of sortedItems) {
                const itemPath = path === '/' ? `/${item.name}` : `${path}/${item.name}`;
                const treeItem = this.createTreeItem(item.name, item.type, itemPath, level);
                container.appendChild(treeItem);
            }
        } catch (error) {
            console.error('[TextEditor] Erro ao renderizar árvore:', error);
        }
    }

    createTreeItem(name, type, fullPath, level) {
        const item = document.createElement('div');
        item.className = 'file-tree-item';
        item.dataset.path = fullPath;
        item.dataset.type = type;
        item.style.paddingLeft = `${8 + (level * 16)}px`;
        
        const icon = document.createElement('rda-icon');
        icon.setAttribute('size', '20');
        icon.setAttribute('name', type === 'directory' ? 'folder' : 'file-text');
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = name;
        
        item.appendChild(icon);
        item.appendChild(nameSpan);
        
        // Event listener
        item.addEventListener('click', () => {
            // Remove seleção anterior
            this.$('#file-tree').querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            
            if (type === 'file') {
                this.openFile(fullPath);
            }
        });
        
        return item;
    }

    countWords(text) {
        if (!text.trim()) return 0;
        return text.trim().split(/\s+/).length;
    }

    onCleanup() {
        console.log('[TextEditor] Limpando recursos do editor de texto...');
        
        // Remove event listeners globais
        document.removeEventListener('keydown', this.setupKeyboardShortcuts);
        
        super.onCleanup();
    }
}
