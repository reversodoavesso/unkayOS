/** Branding is controlled by the operator, never by hostname or user preferences. */
export const deployment = Object.freeze({
  branding: globalThis.__UNKAYOS_DEPLOYMENT__?.branding === 'rda' ? 'rda' : 'neutral'
});
export const workspaceIcon = deployment.branding === 'rda' ? 'rda-icon' : 'layout-grid';
