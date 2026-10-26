/** Scope selectors without corrupting media/supports/keyframe rules. */
export function scopeAppCss(source, namespace) {
  if (!source) return '';
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(source);
  const scope = `.${CSS.escape(namespace)}`;
  const selectors = text => {
    const parts = []; let start = 0, depth = 0, quote = '';
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (character === '\\') { index++; continue; }
      if (quote) { if (character === quote) quote = ''; continue; }
      if (character === '"' || character === "'") { quote = character; continue; }
      if (character === '(' || character === '[') depth++;
      if (character === ')' || character === ']') depth--;
      if (character === ',' && depth === 0) { parts.push(text.slice(start, index)); start = index + 1; }
    }
    parts.push(text.slice(start));
    return parts.map(part => {
      const selector = part.trim();
      if (selector.startsWith(scope + ' ') || selector === scope) return selector;
      if (/^(:root|html|body)(?=[\s.#[:>+~]|$)/.test(selector)) return selector.replace(/^(:root|html|body)/, scope);
      return `${scope} ${selector}`;
    }).join(', ');
  };
  const serialize = rules => [...rules].map(rule => {
    if (rule.type === CSSRule.STYLE_RULE) {
      const style = /** @type {CSSStyleRule} */ (rule);
      return `${selectors(style.selectorText)} { ${style.style.cssText} }`;
    }
    if ('cssRules' in rule) return `${rule.cssText.slice(0, rule.cssText.indexOf('{'))}{ ${serialize(rule.cssRules)} }`;
    return rule.cssText;
  }).join('\n');
  return serialize(sheet.cssRules);
}
