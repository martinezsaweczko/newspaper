/**
 * The browser side of `/chat/stream`: one `EventSource` for the whole app (the root layout opens
 * it for approved accounts). Its latest state is runes state (who is online, the unread badge);
 * chat messages and read receipts go to whoever subscribed with `onLive`. `EventSource`
 * reconnects by itself after a drop; until the first event the state is unknown (`admins` null).
 */
import { armSound, playDrop } from './sound.svelte.ts';
import type { ChatMessage, ChatRead } from './types.ts';

class LiveState {
	/** Is an admin online? null until the stream has answered. */
	admins: boolean | null = $state(null);
	/** Keys (`userLabel`) of everyone online; filled for admins only. */
	online: string[] = $state([]);
	/** Unread messages: the admins' replies for a reader, the shared inbox for an admin. */
	unread = $state(0);
}

export const live = new LiveState();

interface LiveEvents {
	message: ChatMessage;
	read: ChatRead;
}
type Listener<K extends keyof LiveEvents> = (data: LiveEvents[K]) => void;
const listeners: { [K in keyof LiveEvents]: Set<Listener<K>> } = {
	message: new Set(),
	read: new Set()
};

/** Listen for chat messages or read receipts; returns the unsubscribe function. */
export function onLive<K extends keyof LiveEvents>(event: K, listener: Listener<K>): () => void {
	listeners[event].add(listener);
	return () => listeners[event].delete(listener);
}

let source: EventSource | null = null;
let users = 0;

const parse = <T>(event: Event) => JSON.parse((event as MessageEvent<string>).data) as T;

/**
 * Open the shared stream (reference-counted); returns the function that releases it. `mine` is
 * the viewer's own message direction (`in` for a reader, `out` for an admin): messages the other
 * way play the drop.
 */
export function connectLive(mine: 'in' | 'out', url = '/chat/stream'): () => void {
	users += 1;
	armSound();
	if (!source) {
		source = new EventSource(url);
		source.addEventListener('presence', (event) => {
			const view = parse<{ admins: boolean; online?: string[] }>(event);
			live.admins = view.admins;
			live.online = view.online ?? [];
		});
		source.addEventListener('unread', (event) => {
			live.unread = parse<{ count: number }>(event).count;
		});
		source.addEventListener('message', (event) => {
			const message = parse<ChatMessage>(event);
			if (message.direction !== mine) playDrop(message.id);
		});
		for (const name of ['message', 'read'] as const) {
			source.addEventListener(name, (event) => {
				const data = parse<LiveEvents[typeof name]>(event);
				for (const listener of listeners[name]) (listener as Listener<typeof name>)(data);
			});
		}
		source.addEventListener('error', () => {
			// CLOSED: turned away (signed out, blocked); the browser will not retry by itself.
			if (source?.readyState === EventSource.CLOSED) live.admins = null;
		});
	}
	let released = false;
	return () => {
		if (released) return;
		released = true;
		users -= 1;
		if (users === 0 && source) {
			source.close();
			source = null;
			live.admins = null;
			live.online = [];
			live.unread = 0;
		}
	};
}
