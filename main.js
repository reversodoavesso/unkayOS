import './core/ui/designSystem.js';
// main.js - v2.0.0 (Refatorado com SystemManager centralizado)

import { systemManager } from './core/SystemManager.js';
import { WorkspaceSession } from './core/workspace/WorkspaceSession.js';

let workspace;

async function init() {
    const desktop = document.getElementById('desktop');

    try {
        console.log('[main.js] Inicializando unkayOS com SystemManager...');
        
        // Inicializa todos os sistemas de forma centralizada e ordenada
        await systemManager.initialize(desktop);
        
        // Sistemas agora estão disponíveis via systemManager.getSystem()
        // Para compatibilidade temporária, ainda expõe no window
        window.appManager = systemManager.getSystem('appManager');
        window.authSystem = systemManager.getSystem('authSystem');
        window.keyboardManager = systemManager.getSystem('keyboardManager');
        window.fullscreenManager = systemManager.getSystem('fullscreenManager');
        window.contextMenuManager = systemManager.getSystem('contextMenuManager');
        window.unkayFileSystem = {
            fileSystem: systemManager.getSystem('fileSystem'),
            fs: systemManager.getSystem('fs')
        };
        window.wasmFileSystem = systemManager.getSystem('wasmFileSystem');
        window.wasmFs = systemManager.getSystem('wasmFs');
        window.unkay = systemManager.getSystem('unkaySDK');
        window.loadingManager = systemManager.getSystem('loadingManager');
        window.loadingUI = systemManager.getSystem('loadingUI');
        window.lazyResourceLoader = systemManager.getSystem('lazyResourceLoader');
        workspace = new WorkspaceSession({ desktop, appManager: window.appManager, fs: window.wasmFileSystem, auth: window.authSystem });
        await workspace.initialize();
        window.workspaceSession = workspace;
        
        console.log('[main.js] unkayOS inicializado com sucesso');
        console.log('[main.js] Estatísticas do sistema:', systemManager.getSystemStats());
        
    } catch (error) {
        console.error('[main.js] Falha ao inicializar unkayOS:', error);
        
        // Mostra erro na tela para o usuário
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #ff4444;
            color: white;
            padding: 20px;
            border-radius: 8px;
            font-family: monospace;
            z-index: 99999;
        `;
        errorDiv.innerHTML = `
            <h3>Erro ao inicializar unkayOS</h3>
            <p>${error.message}</p>
            <small>Verifique o console para mais detalhes</small>
        `;
        document.body.appendChild(errorDiv);
    }
}

// Event listener para shutdown limpo
window.addEventListener('beforeunload', async () => {
    if (systemManager.isInitialized) {
        await workspace?.destroy();
        await systemManager.shutdown();
    }
});

init();
