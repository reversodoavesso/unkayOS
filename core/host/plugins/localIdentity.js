import { createGuestAuthSystem } from '../guestAuth.js';
export function create() { return { identity: createGuestAuthSystem() }; }
