/** The process-wide presence hub (on globalThis so the dev server's re-imports share one). */
import { createPresence, type Presence } from './presence.ts';

const KEY = Symbol.for('newspaper.chat.presence');
const store = globalThis as typeof globalThis & { [KEY]?: Presence };

export const presence: Presence = (store[KEY] ??= createPresence());
