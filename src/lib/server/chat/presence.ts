/**
 * Who is connected right now, kept in this process's memory only (never stored). Every open
 * `/chat/stream` is one connection; a person is online while they have at least one, and for a
 * grace period after the last one closes, so a reload or a dropped connection does not flicker.
 *
 * Readers learn only whether an admin is online; admins get the keys of everyone online. Each
 * connection is sent a view only when its view changed. `publish` delivers other events (chat
 * messages) to one person's connections or to every admin's.
 *
 * One process only: with more than one replica each pod would see just its own connections.
 */

export interface PresenceMember {
	/** `userLabel()`: the account id or `local:<name>`, never the email. */
	key: string;
	admin: boolean;
}

export interface PresenceView {
	/** Is at least one admin online? */
	admins: boolean;
	/** Keys of everyone online, sorted; admins only. */
	online?: string[];
}

export interface PresenceCounts {
	connections: number;
	online: { user: number; admin: number };
}

/** Sends one SSE event down a connection. */
export type Emit = (event: string, data: unknown) => void;

/** Who a published event is for: every admin, or one person by key. */
export type Audience = { admins: true } | { key: string };

interface Connection {
	member: PresenceMember;
	send: Emit;
	close: () => void;
	last: string;
}

interface Entry {
	member: PresenceMember;
	connections: number;
	/** Pending "goes offline" timer after the last connection closed. */
	leaving: ReturnType<typeof setTimeout> | null;
}

export function createPresence({
	graceMs = 30_000,
	// unref: a pending "goes offline" must not keep a stopping process alive
	setTimer = (fn, ms) => setTimeout(fn, ms).unref(),
	clearTimer = clearTimeout
}: {
	graceMs?: number;
	setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
	clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
} = {}) {
	const entries = new Map<string, Entry>();
	const connections = new Set<Connection>();

	const viewFor = (member: PresenceMember): PresenceView => {
		const admins = [...entries.values()].some((e) => e.member.admin);
		return member.admin ? { admins, online: [...entries.keys()].sort() } : { admins };
	};

	const push = (conn: Connection, force = false) => {
		const view = viewFor(conn.member);
		const json = JSON.stringify(view);
		if (!force && json === conn.last) return;
		conn.last = json;
		emit(conn, 'presence', view);
	};
	const emit = (conn: Connection, event: string, data: unknown) => {
		try {
			conn.send(event, data);
		} catch {
			// the stream is already closed: its disconnect is on its way
		}
	};
	const broadcast = () => {
		for (const conn of connections) push(conn);
	};

	return {
		/**
		 * Register an open stream. `send` gets the first `presence` view at once; the returned
		 * function must be called when the stream ends (it is safe to call twice).
		 */
		connect(member: PresenceMember, send: Emit, close: () => void = () => {}): () => void {
			const conn: Connection = { member, send, close, last: '' };
			let entry = entries.get(member.key);
			const arrived = !entry;
			if (!entry) {
				entry = { member, connections: 0, leaving: null };
				entries.set(member.key, entry);
			}
			if (entry.leaving) {
				clearTimer(entry.leaving);
				entry.leaving = null;
			}
			const roleChanged = entry.member.admin !== member.admin;
			entry.connections += 1;
			entry.member = member; // a role change reconnects with the new role
			if (arrived || roleChanged) broadcast(); // the others first: this one gets its view next
			connections.add(conn);
			push(conn, true);

			let done = false;
			return () => {
				if (done) return;
				done = true;
				connections.delete(conn);
				const current = entries.get(member.key);
				if (!current) return;
				current.connections -= 1;
				if (current.connections > 0) return;
				current.leaving = setTimer(() => {
					if (entries.get(member.key) !== current || current.connections > 0) return;
					entries.delete(member.key);
					broadcast();
				}, graceMs);
			};
		},

		/** Send an event to every open stream of `to`. */
		publish(to: Audience, event: string, data: unknown): void {
			for (const conn of connections) {
				const match = 'admins' in to ? conn.member.admin : conn.member.key === to.key;
				if (match) emit(conn, event, data);
			}
		},

		/** Keys of everyone online (including those inside the grace period), sorted. */
		online(): string[] {
			return [...entries.keys()].sort();
		},

		counts(): PresenceCounts {
			const online = { user: 0, admin: 0 };
			for (const e of entries.values()) online[e.member.admin ? 'admin' : 'user'] += 1;
			return { connections: connections.size, online };
		},

		/** End every open stream (shutdown): the browsers reconnect to the next process. */
		closeAll(): void {
			for (const conn of [...connections]) {
				try {
					conn.close();
				} catch {
					// already closed
				}
			}
		}
	};
}

export type Presence = ReturnType<typeof createPresence>;
