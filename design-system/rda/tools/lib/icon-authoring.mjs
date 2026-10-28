/** Shared contract for the Icon Studio, CLI and catalog build. */
export const ICON_GUIDELINES = Object.freeze({
  version: 2,
  ui: { viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 2, fill: 'none', linecap: 'round', linejoin: 'round', margin: 2, maxElements: 32 },
  brand: { preserveGeometry: true, fill: 'currentColor', preserveViewBox: true },
  scopes: {
    exclusive: 'Usos exclusivos: marcas ou ícones restritos a contextos ou produtos específicos (ex: The Orb no unkayOS, Cine). Não utilizar como ícone genérico de UI.',
    general: 'Uso geral no ecossistema: símbolos ou glifos institucionais proprietários de uso amplo e transversal (ex: rda-icon, rda-logo).'
  },
  previewSizes: [16, 20, 24, 32, 48],
  review: [
    'Silhueta reconhecível a 16 e 24 px',
    'Margem óptica e peso próximos ao catálogo Lucide',
    'Sem texto, emojis, sombras, gradientes ou detalhes decorativos',
    'Claro/escuro por currentColor; accent pertence ao consumidor',
    'Marca existente preserva seu desenho original',
    'Categorização clara de escopo: exclusivo (contexto específico) vs geral (ecossistema)'
  ],
});

export function createIconBrief({ name, description, kind = 'ui', scope = 'general', context = '' }) {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)) throw new Error('Use um nome em kebab-case.');
  if (!description?.trim()) throw new Error('Descreva a função e a metáfora visual do app.');
  if (!['ui', 'brand'].includes(kind)) throw new Error('Tipo de ícone inválido.');
  if (!['general', 'exclusive'].includes(scope)) throw new Error('Escopo de ícone inválido. Use "general" ou "exclusive".');

  const contract = kind === 'brand'
    ? 'Adapte o SVG original fornecido, preservando todos os paths, proporções e viewBox. Use fill="currentColor". Não redesenhe uma marca existente.'
    : 'Crie um SVG vetorial de interface com viewBox="0 0 24 24", fill="none", stroke="currentColor", stroke-width="2", stroke-linecap="round" e stroke-linejoin="round" na raiz. Use até 32 formas simples diretamente na raiz (path, circle, rect, line, polyline, polygon ou ellipse). Componha na área óptica de 2 a 22, com poucos detalhes e peso compatível com os ícones Lucide do RDA DS.';

  const scopeNote = scope === 'exclusive'
    ? `Escopo: EXCLUSIVO${context ? ` (Contexto: ${context})` : ''} — Este ícone é de uso específico para este contexto/produto (exemplo análogo: The Orb no unkayOS) e não deve ser usado como ícone genérico do ecossistema.`
    : 'Escopo: GERAL — Este ícone personalizado destina-se a uso generalizado e transversal no ecossistema RDA.';

  return `# Ícone ${name} — RDA Design System\n\nFunção e metáfora solicitadas:\n${description.trim()}\n\n${scopeNote}\n\n${contract}\n\nSem texto, emojis, cores literais, CSS, scripts, imagens, links, fontes, filtros, sombras ou gradientes. Não fixe width/height; o consumidor controla tamanho e cor. Entregue somente o SVG, sem Markdown.\n\nRevise em 16, 20, 24, 32 e 48 px nos temas claro e escuro. A validação técnica não substitui conferir silhueta, legibilidade, semelhança excessiva e identidade do app.\n\nDepois: valide no Icon Studio ou com icons:author validate; registre no catálogo custom (${scope}); gere o DS e sincronize o Unkayos.\n`;
}

const shapes = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);
const geometry = {
  path: ['d'], circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'], line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'], polygon: ['points'], g: [], svg: ['xmlns', 'viewBox'],
};
const common = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'clip-rule'];

/** Fail closed: return markup only after parsing and validating every element. */
export function validateIconSvg(source, { kind = 'ui', parser } = {}) {
  const errors = [];
  if (!['ui', 'brand'].includes(kind)) return { valid: false, errors: ['Tipo de ícone inválido.'] };
  if (typeof source !== 'string' || !source.trim()) return { valid: false, errors: ['Cole um SVG para validar.'] };
  if (source.length > (kind === 'ui' ? 16384 : 65536)) return { valid: false, errors: ['SVG excede o limite de tamanho.'] };
  if (/<!DOCTYPE|<!ENTITY|<\?/i.test(source)) return { valid: false, errors: ['Remova declarações XML, DOCTYPE e entidades.'] };
  const xmlParser = parser || (globalThis.DOMParser ? new globalThis.DOMParser() : null);
  if (!xmlParser) throw new Error('Forneça um DOMParser para validar SVG fora do navegador.');
  const doc = xmlParser.parseFromString(source, 'image/svg+xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root?.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg') return { valid: false, errors: ['SVG XML inválido ou namespace ausente.'] };
  const elements = [...root.querySelectorAll('*')];
  if (!elements.some(el => shapes.has(el.localName))) errors.push('Inclua pelo menos uma forma vetorial.');
  if (elements.length > (kind === 'ui' ? ICON_GUIDELINES.ui.maxElements : 256)) errors.push('Há formas demais para um ícone.');
  if (root.textContent.trim()) errors.push('Texto e conteúdo não vetorial não são permitidos.');
  const viewBox = root.getAttribute('viewBox')?.trim();
  const dimensions = viewBox?.split(/[ ,]+/).map(Number);
  if (!dimensions || dimensions.length !== 4 || dimensions.some(n => !Number.isFinite(n)) || dimensions[2] <= 0 || dimensions[3] <= 0) errors.push('Defina um viewBox válido.');
  if (kind === 'ui' && viewBox !== ICON_GUIDELINES.ui.viewBox) errors.push('Ícones de interface usam viewBox="0 0 24 24".');
  if (kind === 'ui') {
    for (const [attr, expected] of Object.entries({ fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) {
      if (root.getAttribute(attr) !== expected) errors.push(`Use ${attr}="${expected}" na raiz.`);
    }
  } else if (root.getAttribute('fill') !== 'currentColor') errors.push('Marcas monocromáticas usam fill="currentColor".');
  for (const element of [root, ...elements]) {
    const tag = element.localName;
    if (!(element === root || shapes.has(tag) || (kind === 'brand' && tag === 'g')) || element.namespaceURI !== root.namespaceURI) {
      errors.push(`Elemento não permitido: ${tag}.`);
      continue;
    }
    if (kind === 'ui' && element !== root && element.parentElement !== root) errors.push('Use formas diretamente na raiz, sem grupos aninhados.');
    const allowed = [...common, ...(geometry[tag] || []), ...(kind === 'brand' && element !== root ? ['transform'] : [])];
    for (const attribute of [...element.attributes]) {
      const { name, value } = attribute;
      if (!allowed.includes(name)) errors.push(`Atributo não permitido: ${name}.`);
      else if (['fill', 'stroke'].includes(name) && !['none', 'currentColor'].includes(value)) errors.push('Cores devem usar currentColor ou none.');
      else if (kind === 'ui' && name === 'fill' && value !== 'none') errors.push('Ícones de interface usam traço, sem preenchimento.');
      else if (kind === 'ui' && name === 'stroke' && value !== 'currentColor') errors.push('O traço deve herdar currentColor.');
      else if (kind === 'ui' && name === 'stroke-width' && value !== '2') errors.push('Espessura de traço deve ser 2.');
      else if (name === 'd' && (!/^[Mm]/.test(value.trim()) || /[^MmZzLlHhVvCcSsQqTtAa0-9eE+.,\s-]/.test(value))) errors.push('Path SVG inválido.');
      else if (name === 'points' && /[^0-9eE+.,\s-]/.test(value)) errors.push('Coordenadas inválidas.');
      else if (name === 'transform' && !/^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\([0-9eE+.,\s-]+\)\s*)+$/.test(value)) errors.push('Transformação inválida.');
      else if (['fill-rule', 'clip-rule'].includes(name) && !['evenodd', 'nonzero'].includes(value)) errors.push('Regra de preenchimento inválida.');
      else if (['stroke-linecap', 'stroke-linejoin'].includes(name) && value !== 'round') errors.push('Extremidades e junções devem ser round.');
      else if ((geometry[tag] || []).includes(name) && !['xmlns', 'viewBox', 'd', 'points'].includes(name) && (!Number.isFinite(Number(value)) || Math.abs(Number(value)) > 100000)) errors.push(`Medida inválida: ${name}.`);
    }
  }
  if (errors.length) return { valid: false, errors: [...new Set(errors)] };
  const svg = root.outerHTML;
  return {
    valid: true, errors: [], svg, innerXml: svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>')), viewBox,
    type: kind === 'ui' ? 'stroke' : 'fill',
    elements: kind === 'ui' ? elements.map(el => [el.localName, Object.fromEntries([...el.attributes].map(attr => [attr.name, attr.value]))]) : undefined,
  };
}
