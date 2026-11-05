import { createLocalAccess } from '../../features/access/index.js';
export function create() { return { access: createLocalAccess() }; }
