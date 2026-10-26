import { iconMarkup } from './designSystem.js';
import { currentRelease } from '../release-info.js';

const stages = { module: 'Carregamento do módulo', html: 'Carregamento da interface', css: 'Carregamento dos estilos', resource: 'Carregamento de recursos', start: 'Inicialização' };
function safeResource(value) {
  try { const url = new URL(String(value), location.origin); return url.origin + url.pathname; }
  catch (_) { return ''; }
}
export function describeAppFailure({ appName, appId, error, stage = 'resource', resource = '', online = navigator.onLine !== false }) {
  if (!Object.hasOwn(stages, stage)) stage = 'resource';
  const code = error?.code === 'APP_MODULE_INVALID' ? error.code : { module: 'APP_MODULE_LOAD_FAILED', start: 'APP_START_FAILED' }[stage] || 'APP_RESOURCE_LOAD_FAILED';
  const message = String(error?.message || error || 'Falha sem mensagem adicional.').replace(/https?:\/\/[^\s<>"']+/g, safeResource).slice(0, 600);
  return {
    appName: String(appName), appId: String(appId), code, stage: stages[stage], resource: resource ? safeResource(resource) : '', message,
    version: currentRelease.version,
    description: !online ? 'Você está sem conexão. Conecte-se à internet e tente novamente.' : stage === 'start'
      ? 'O aplicativo encontrou um problema ao iniciar. Você pode tentar abri-lo novamente.'
      : 'Uma parte necessária deste aplicativo não pôde ser carregada. Tente novamente. Se continuar, recarregue o sistema.'
  };
}
export function formatAppDiagnostic(failure) {
  return [`Aplicativo: ${failure.appName} (${failure.appId})`, `Versão: ${failure.version}`, `Código: ${failure.code}`, `Etapa: ${failure.stage}`, failure.resource && `Arquivo: ${failure.resource}`, `Mensagem: ${failure.message}`].filter(Boolean).join('\n');
}
const node = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text) el.textContent = text; return el; };

/** Composes official EmptyState, Buttons and icons; all diagnostic content is text. */
export function renderAppLoadError(host, failure, { onRetry, onClose, onReload = () => location.reload(), copy = text => navigator.clipboard.writeText(text) }) {
  const panel = node('section', 'rda-empty-state rda-unkay-app-error');
  const icon = node('div', 'rda-empty-state__icon'); icon.setAttribute('aria-hidden', 'true'); icon.innerHTML = iconMarkup('alert-triangle', { size: 28 });
  const title = node('h2', 'rda-empty-state__title', `Não foi possível abrir ${failure.appName}`);
  title.tabIndex = -1; title.setAttribute('role', 'alert');
  const description = node('p', 'rda-empty-state__description', failure.description);
  const actions = node('div', 'rda-empty-state__action rda-unkay-app-error__actions');
  const status = node('p', 'rda-unkay-app-error__status'); status.setAttribute('role', 'status');
  function button(label, color, action, glyph) {
    const el = node('button', 'rda-button rda-button--md'); el.type = 'button'; el.dataset.color = color;
    if (glyph) el.innerHTML = iconMarkup(glyph, { size: 16 });
    el.appendChild(node('span', '', label)); el.addEventListener('click', action); return el;
  }
  const retry = button('Tentar novamente', 'primary', async () => {
    retry.disabled = true;
    try { await onRetry(); }
    catch (_) { status.textContent = 'Não foi possível repetir a abertura. Recarregue o sistema para tentar novamente.'; }
    finally { retry.disabled = false; }
  }, 'refresh-cw');
  actions.append(retry, button('Fechar', 'secondary', onClose));
  const details = node('details', 'rda-unkay-app-error__details');
  details.appendChild(node('summary', '', 'Detalhes técnicos'));
  const list = node('dl');
  for (const [label, value] of [['Código', failure.code], ['Aplicativo', failure.appId], ['Versão', failure.version], ['Etapa', failure.stage], ['Arquivo', failure.resource], ['Mensagem', failure.message]]) {
    if (!value) continue;
    list.append(node('dt', '', label), node('dd', '', value));
  }
  const copyButton = button('Copiar diagnóstico', 'secondary', async () => {
    try { await copy(formatAppDiagnostic(failure)); status.textContent = 'Diagnóstico copiado.'; }
    catch (_) { status.textContent = 'Não foi possível copiar. Você pode selecionar os detalhes acima.'; }
  }, 'copy');
  details.append(list, copyButton);
  const reload = button('Recarregar sistema', 'ghost', onReload);
  reload.title = 'Recarrega a página e pode interromper outros aplicativos abertos.';
  panel.append(icon, title, description, actions, details, reload, status);
  host.replaceChildren(panel); host.setAttribute('aria-busy', 'false');
  return panel;
}
