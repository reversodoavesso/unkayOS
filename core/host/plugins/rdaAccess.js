import { createLocalAccess } from '../../features/access/index.js';
import { mapRdaTier } from './rdaTiers.js';

// Remote authorization remains server-side. Tiers are legacy UI compatibility only.
export function create() {
    return { access: Object.freeze({ ...createLocalAccess(), getTier: mapRdaTier }) };
}
