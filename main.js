import './core/ui/designSystem.js';
// main.js - v2.0.0 (Refatorado com SystemManager centralizado)

import { systemManager } from './core/SystemManager.js';
import { WorkspaceSession } from './core/workspace/WorkspaceSession.js';
import { loadDeployment } from './core/host/config/deployment.js';

let workspace;

async function init() {
    const desktop = document.getElementById('desktop');

    try {
        console.log('[main.js] Inicializando unkayOS com SystemManager...');

        // Any SSO can plug in by defining this factory before the app boots.
        const hostWindow = /** @type {any} */ (window);
        if (typeof hostWindow.__UNKAY_IDENTITY_PROVIDER__ === 'function') {
            systemManager.identityProvider = hostWindow.__UNKAY_IDENTITY_PROVIDER__;
        }

        systemManager.deployment = await loadDeployment({ legacy: hostWindow.__UNKAYOS_DEPLOYMENT__ });

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
        workspace = new WorkspaceSession({ desktop, appManager: window.appManager, fs: window.wasmFileSystem, auth: window.authSystem, profile: systemManager.getSystem('hostProfile')?.id || 'rda' });
        await workspace.initialize();
        window.workspaceSession = workspace;
        /** @type {any} */ (window).unkayProfile = systemManager.getSystem('hostProfile');
        
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
        const title = document.createElement('h3');
        title.textContent = 'Erro ao inicializar unkayOS';
        const message = document.createElement('p');
        message.textContent = error.message;
        const details = document.createElement('small');
        details.textContent = 'Verifique o console para mais detalhes';
        errorDiv.append(title, message, details);
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
