// core/HostDropManager.js - unkayOS 2.0 Host Drag & Drop Integration
// Allows users to drag and drop files from Windows/Linux host directly onto unkayOS desktop

import { wasmFileSystem } from './WasmFileSystem.js';
import { fileSystem } from './FileSystem.js';
import eventBus from './eventBus.js';

const getVfs = () => (typeof window !== 'undefined' && window.wasmFileSystem) || wasmFileSystem;

export class HostDropManager {
    constructor() {
        this.desktopElement = null;
        this.overlayElement = null;
        this.dragCounter = 0;
    }

    /**
     * Initialize host drag & drop on desktop element
     * @param {HTMLElement} desktopElement
     */
    initialize(desktopElement) {
        if (!desktopElement) return;
        this.desktopElement = desktopElement;

        // Prevent default browser behavior of opening dragged files
        if (typeof window !== 'undefined') {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                window.addEventListener(eventName, (e) => e.preventDefault(), false);
            });
        }

        desktopElement.addEventListener('dragenter', this.handleDragEnter.bind(this));
        desktopElement.addEventListener('dragover', this.handleDragOver.bind(this));
        desktopElement.addEventListener('dragleave', this.handleDragLeave.bind(this));
        desktopElement.addEventListener('drop', this.handleDrop.bind(this));

        console.log('[HostDropManager] Host drag & drop initialized on desktop');
    }

    handleDragEnter(e) {
        if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
            this.dragCounter++;
            this.showOverlay();
        }
    }

    handleDragOver(e) {
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy';
        }
    }

    handleDragLeave() {
        this.dragCounter--;
        if (this.dragCounter <= 0) {
            this.dragCounter = 0;
            this.hideOverlay();
        }
    }

    async handleDrop(e) {
        this.dragCounter = 0;
        this.hideOverlay();

        const files = e.dataTransfer ? e.dataTransfer.files : [];
        if (!files || files.length === 0) return;

        console.log(`[HostDropManager] Dropped ${files.length} file(s) from host`);

        const importedFiles = [];
        const desktopDir = '/home/guest/Desktop';
        const vfs = getVfs();

        // Ensure desktop directory exists
        try {
            await vfs.mkdir(desktopDir, { recursive: true });
        } catch {}

        for (const file of files) {
            try {
                const buffer = await file.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                const targetPath = `${desktopDir}/${file.name}`;

                // Write into Wasm VFS
                await vfs.writeFile(targetPath, bytes);

                // Sync into legacy memory cache as well
                try {
                    fileSystem.writeFile(targetPath, new TextDecoder('utf-8').decode(bytes));
                } catch {}

                importedFiles.push({ name: file.name, size: file.size, path: targetPath });
                console.log(`[HostDropManager] Successfully imported: ${file.name} (${file.size} bytes)`);
            } catch (err) {
                console.error(`[HostDropManager] Failed to import ${file.name}:`, err);
            }
        }

        // Emit notification and desktop refresh
        eventBus.emit('desktop:files-imported', { files: importedFiles });
    }

    showOverlay() {
        if (!this.overlayElement && typeof document !== 'undefined') {
            this.overlayElement = document.createElement('div');
            this.overlayElement.className = 'desktop-drop-overlay';
            this.overlayElement.innerHTML = `
                <div style="font-size: 3rem; margin-bottom: 12px;">📥</div>
                <div>Solte os arquivos para importar para o unkayOS Desktop</div>
                <div style="font-size: 0.9rem; opacity: 0.8; margin-top: 6px;">Salvo em /home/guest/Desktop (Wasm OPFS)</div>
            `;
            if (this.desktopElement) {
                this.desktopElement.appendChild(this.overlayElement);
            }
        }
        if (this.overlayElement) {
            this.overlayElement.style.display = 'flex';
        }
    }

    hideOverlay() {
        if (this.overlayElement) {
            this.overlayElement.style.display = 'none';
        }
    }
}

export const hostDropManager = new HostDropManager();
