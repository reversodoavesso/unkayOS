/**
 * Mapeador de Arquivos Reais do UnkayOS
 * 
 * Esta ferramenta mapeia a estrutura real do projeto UnkayOS
 * para o sistema de arquivos virtual
 */

export class RealFileMapper {
    constructor(fileSystem) {
        this.fs = fileSystem;
        this.realStructure = null;
    }

    /**
     * Mapeia toda a estrutura real do projeto
     */
    async mapRealProjectStructure() {
        const structure = {
            // Arquivos raiz
            '/index.html': { type: 'file', realPath: '/index.html' },
            '/main.js': { type: 'file', realPath: '/main.js' },
            '/README.md': { type: 'file', realPath: '/README.md' },
            '/LICENSE': { type: 'file', realPath: '/LICENSE' },

            // Apps
            '/apps/apps.json': { type: 'file', realPath: '/apps/apps.json' },
            
            // Terminal
            '/apps/terminal/config.json': { type: 'file', realPath: '/apps/terminal/config.json' },
            '/apps/terminal/index.html': { type: 'file', realPath: '/apps/terminal/index.html' },
            '/apps/terminal/main.js': { type: 'file', realPath: '/apps/terminal/main.js' },
            '/apps/terminal/style.css': { type: 'file', realPath: '/apps/terminal/style.css' },
            '/apps/terminal/icon.svg': { type: 'file', realPath: '/apps/terminal/icon.svg' },
            '/apps/terminal/commands.js': { type: 'file', realPath: '/apps/terminal/commands.js' },

            // File Manager
            '/apps/file-manager/config.json': { type: 'file', realPath: '/apps/file-manager/config.json' },
            '/apps/file-manager/index.html': { type: 'file', realPath: '/apps/file-manager/index.html' },
            '/apps/file-manager/main.js': { type: 'file', realPath: '/apps/file-manager/main.js' },
            '/apps/file-manager/style.css': { type: 'file', realPath: '/apps/file-manager/style.css' },
            '/apps/file-manager/icon.svg': { type: 'file', realPath: '/apps/file-manager/icon.svg' },

            // Text Editor
            '/apps/text-editor/config.json': { type: 'file', realPath: '/apps/text-editor/config.json' },
            '/apps/text-editor/index.html': { type: 'file', realPath: '/apps/text-editor/index.html' },
            '/apps/text-editor/main.js': { type: 'file', realPath: '/apps/text-editor/main.js' },
            '/apps/text-editor/style.css': { type: 'file', realPath: '/apps/text-editor/style.css' },
            '/apps/text-editor/icon.svg': { type: 'file', realPath: '/apps/text-editor/icon.svg' },

            // Browser
            '/apps/browser/config.json': { type: 'file', realPath: '/apps/browser/config.json' },
            '/apps/browser/index.html': { type: 'file', realPath: '/apps/browser/index.html' },
            '/apps/browser/main.js': { type: 'file', realPath: '/apps/browser/main.js' },
            '/apps/browser/style.css': { type: 'file', realPath: '/apps/browser/style.css' },
            '/apps/browser/icon.svg': { type: 'file', realPath: '/apps/browser/icon.svg' },

            // Store
            '/apps/store/package.json': { type: 'file', realPath: '/apps/store/package.json' },
            '/apps/store/main.js': { type: 'file', realPath: '/apps/store/main.js' },
            '/apps/store/style.css': { type: 'file', realPath: '/apps/store/style.css' },
            '/apps/store/icon.svg': { type: 'file', realPath: '/apps/store/icon.svg' },

            // OpenUI
            '/apps/openui/package.json': { type: 'file', realPath: '/apps/openui/package.json' },
            '/apps/openui/main.js': { type: 'file', realPath: '/apps/openui/main.js' },
            '/apps/openui/style.css': { type: 'file', realPath: '/apps/openui/style.css' },
            '/apps/openui/icon.svg': { type: 'file', realPath: '/apps/openui/icon.svg' },

            // Core
            '/core/AppCore.js': { type: 'file', realPath: '/core/AppCore.js' },
            '/core/AppManager.js': { type: 'file', realPath: '/core/AppManager.js' },
            '/core/AppWindowSystem.js': { type: 'file', realPath: '/core/AppWindowSystem.js' },
            '/core/AuthSystem.js': { type: 'file', realPath: '/core/AuthSystem.js' },
            '/core/BaseApp.js': { type: 'file', realPath: '/core/BaseApp.js' },
            '/core/DragManager.js': { type: 'file', realPath: '/core/DragManager.js' },
            '/core/FileSystem.js': { type: 'file', realPath: '/core/FileSystem.js' },
            '/core/MenuApps.js': { type: 'file', realPath: '/core/MenuApps.js' },
            '/core/PositionManager.js': { type: 'file', realPath: '/core/PositionManager.js' },
            '/core/WindowLayerManager.js': { type: 'file', realPath: '/core/WindowLayerManager.js' },
            '/core/eventBus.js': { type: 'file', realPath: '/core/eventBus.js' },

            // Utils
            '/core/utils/generateCodeVerifier.js': { type: 'file', realPath: '/core/utils/generateCodeVerifier.js' },
            '/core/utils/generateUniqueId.js': { type: 'file', realPath: '/core/utils/generateUniqueId.js' },
            '/core/utils/loadJSON.js': { type: 'file', realPath: '/core/utils/loadJSON.js' },
            '/core/utils/pxToViewport.js': { type: 'file', realPath: '/core/utils/pxToViewport.js' },

            // Assets
            '/assets/style/global.css': { type: 'file', realPath: '/assets/style/global.css' },
            '/assets/images/wallpaper_01.jpg': { type: 'file', realPath: '/assets/images/wallpaper_01.jpg' },
            '/assets/icons/system/menu_list.svg': { type: 'file', realPath: '/assets/icons/system/menu_list.svg' },

            // Design System
            '/design-system/styles/base.css': { type: 'file', realPath: '/design-system/styles/base.css' },
            '/design-system/styles/icons.css': { type: 'file', realPath: '/design-system/styles/icons.css' },
            '/design-system/styles/main.css': { type: 'file', realPath: '/design-system/styles/main.css' },
            '/design-system/styles/tokens.css': { type: 'file', realPath: '/design-system/styles/tokens.css' },
            '/design-system/styles/typography.css': { type: 'file', realPath: '/design-system/styles/typography.css' },

            // Auth
            '/auth/callback.html': { type: 'file', realPath: '/auth/callback.html' },

            // Configs
            '/core/configs/auth-config.js': { type: 'file', realPath: '/core/configs/auth-config.js' }
        };

        this.realStructure = structure;
        return structure;
    }

    /**
     * Carrega o conteúdo de um arquivo real
     */
    async loadRealFileContent(virtualPath) {
        if (!this.realStructure) {
            await this.mapRealProjectStructure();
        }

        const mapping = this.realStructure[virtualPath];
        if (!mapping || mapping.type !== 'file') {
            throw new Error(`Arquivo não encontrado: ${virtualPath}`);
        }

        try {
            const response = await fetch(mapping.realPath);
            if (!response.ok) {
                throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.text();
        } catch (error) {
            throw new Error(`Erro ao carregar ${virtualPath}: ${error.message}`);
        }
    }

    /**
     * Sincroniza um arquivo específico do projeto real
     */
    async syncFile(virtualPath) {
        try {
            const content = await this.loadRealFileContent(virtualPath);
            const result = this.fs.writeFile(virtualPath, content);
            
            if (result.success) {
                return { success: true, message: `Arquivo ${virtualPath} sincronizado` };
            } else {
                return { success: false, error: result.error };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Sincroniza todos os arquivos mapeados
     */
    async syncAllFiles() {
        if (!this.realStructure) {
            await this.mapRealProjectStructure();
        }

        const results = [];
        const files = Object.keys(this.realStructure).filter(
            path => this.realStructure[path].type === 'file'
        );

        for (const virtualPath of files) {
            const result = await this.syncFile(virtualPath);
            results.push({ path: virtualPath, ...result });
        }

        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        return {
            success: failed === 0,
            message: `Sincronização concluída: ${successful} sucessos, ${failed} falhas`,
            results
        };
    }

    /**
     * Lista todos os arquivos reais mapeados
     */
    listMappedFiles() {
        if (!this.realStructure) {
            return [];
        }

        return Object.keys(this.realStructure)
            .filter(path => this.realStructure[path].type === 'file')
            .sort();
    }

    /**
     * Verifica se um caminho virtual está mapeado para um arquivo real
     */
    isRealFileMapped(virtualPath) {
        return this.realStructure && 
               this.realStructure[virtualPath] && 
               this.realStructure[virtualPath].type === 'file';
    }
}

// Instância global
export const realFileMapper = new RealFileMapper(window.fileSystem);
