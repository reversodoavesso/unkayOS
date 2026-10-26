export { iconMarkup, registerIcons } from '../../design-system/rda/web/icons.js';
import { accentPresets } from '../../design-system/rda/accents.js';
export { accentPresets };
export const normalizeAccent = value => typeof value === 'string' && Object.hasOwn(accentPresets, value) ? value : 'cyan';
