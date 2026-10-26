/// <reference types="vite/client" />

interface Window {
  appManager: import('./core/AppManager.js').AppManager;
  loadedAppDetails: import('./core/AppManager.js').AppManager['loadedAppDetails'];
  workspaceSession: import('./core/workspace/WorkspaceSession.js').WorkspaceSession;
}
