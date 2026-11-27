/**
 * The process-wide presence hub, on globalThis so the dev server's re-imports share one. The
 * stored hub carries the version of its shape: after a hot reload that changed the hub's API, an
 * old instance (missing new methods) is replaced instead of reused. Bump HUB_VERSION whenever
 * `createPresence` gains or changes a method.
 */
import { createPresence, type Presence } from './presence.ts';

const HUB_VERSION = 2; // 2: publish() for chat events
const KEY = Symbol.for('newspaper.chat.presence');
type Stored = { version: number; hub: Presence };
const store = globalThis as typeof globalThis & { [KEY]?: Stored | Partial<Presence> };

const current = store[KEY];
if (!current || !('version' in current) || current.version !== HUB_VERSION) {
	// Streams registered on an old hub (stored bare before versioning, or an older version) end
	// here; their browsers reconnect to the new one within seconds.
	const old: Partial<Presence> | undefined = current && 'hub' in current ? current.hub : current;
	old?.closeAll?.();
	store[KEY] = { version: HUB_VERSION, hub: createPresence() };
}

export const presence: Presence = (store[KEY] as Stored).hub;
