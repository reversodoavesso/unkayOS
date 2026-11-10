import { accentPresets } from '../../design-system/rda/accents.js';
export { accentPresets };

const legacyAccents = Object.freeze({
  cyan: 'primary',
  violet: 'nebula',
  blue: 'cobalt',
  rose: 'magma',
  fuchsia: 'lotus',
  teal: 'aurora',
  indigo: 'cobalt'
});

export const normalizeAccent = value => {
  if (typeof value !== 'string') return 'primary';
  if (Object.hasOwn(accentPresets, value)) return value;
  if (Object.hasOwn(legacyAccents, value)) return legacyAccents[value];
  return 'primary';
};
