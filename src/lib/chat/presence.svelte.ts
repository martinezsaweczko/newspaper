/**
 * The browser side of `/chat/stream`: one `EventSource` for the whole app (the root layout opens
 * it for approved accounts), and its latest view as runes state. `EventSource` reconnects by
 * itself after a drop; until the first event the view is unknown (`admins` is null).
 */

class PresenceState {
	/** Is an admin online? null until the stream has answered. */
	admins: boolean | null = $state(null);
	/** Keys (`userLabel`) of everyone online; filled for admins only. */
	online: string[] = $state([]);
}

export const presence = new PresenceState();

let source: EventSource | null = null;
let users = 0;

/** Open the shared stream (reference-counted); returns the function that releases it. */
export function connectPresence(url = '/chat/stream'): () => void {
	users += 1;
	if (!source) {
		source = new EventSource(url);
		source.addEventListener('presence', (event) => {
			const view = JSON.parse((event as MessageEvent<string>).data) as {
				admins: boolean;
				online?: string[];
			};
			presence.admins = view.admins;
			presence.online = view.online ?? [];
		});
		source.addEventListener('error', () => {
			// CLOSED: turned away (signed out, blocked); the browser will not retry by itself.
			if (source?.readyState === EventSource.CLOSED) presence.admins = null;
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
			presence.admins = null;
			presence.online = [];
		}
	};
}
