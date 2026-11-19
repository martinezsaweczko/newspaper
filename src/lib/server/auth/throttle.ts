import { normaliseUsername } from './users.ts';

/**
 * In-memory throttle: `max` failures per key within `windowMs`, then locked until the window
 * passes. Memory is bounded: expired keys are swept and, past `maxEntries`, the key with the
 * oldest last failure is evicted.
 */
export function createThrottle({ max = 5, windowMs = 15 * 60 * 1000, maxEntries = 10_000 } = {}) {
	// Insertion order = order of the latest failure (keys are re-inserted on every failure).
	const failures = new Map<string, number[]>();

	const recent = (key: string, now: number) => {
		const list = (failures.get(key) ?? []).filter((t) => now - t < windowMs);
		if (!list.length) failures.delete(key);
		return list;
	};

	const sweep = (now: number) => {
		for (const [key, list] of failures) {
			if (now - list[list.length - 1] >= windowMs) failures.delete(key);
		}
		while (failures.size > maxEntries) failures.delete(failures.keys().next().value as string);
	};

	return {
		/** Seconds to wait before trying again, or 0 when allowed. */
		retryAfter(key: string, now = Date.now()): number {
			const list = recent(key, now);
			if (list.length < max) return 0;
			return Math.max(1, Math.ceil((list[list.length - max] + windowMs - now) / 1000));
		},
		fail(key: string, now = Date.now()): void {
			const list = recent(key, now);
			list.push(now);
			failures.delete(key);
			failures.set(key, list);
			if (failures.size > maxEntries) sweep(now);
		},
		reset(key: string): void {
			failures.delete(key);
		},
		/** Number of tracked keys (for tests). */
		size(): number {
			return failures.size;
		}
	};
}

/** The username part of a throttle key: normalised, or the trimmed lowercase input when invalid. */
export function throttleKey(username: string): string {
	return normaliseUsername(username) ?? username.trim().toLowerCase();
}

/**
 * Login throttle with three counters, all over the same window:
 * - per IP + username (`perPair`): the usual lock for one person mistyping;
 * - per username (`perUser`): locks a targeted account across IPs (an attacker can lock a user out
 *   for one window, which is the accepted trade-off on a small private site);
 * - per IP (`perIp`, deliberately high): slows password spraying from one address without letting
 *   one user's mistakes lock everyone else out behind a shared NAT or proxy.
 * A login is blocked when any counter is over its limit.
 */
export function createLoginThrottle({
	perPair = 5,
	perUser = 10,
	perIp = 50,
	windowMs = 15 * 60 * 1000,
	maxEntries = 10_000
} = {}) {
	const pair = createThrottle({ max: perPair, windowMs, maxEntries });
	const user = createThrottle({ max: perUser, windowMs, maxEntries });
	const ip = createThrottle({ max: perIp, windowMs, maxEntries });
	const pairKey = (address: string, name: string) => `${address}\u0000${throttleKey(name)}`;

	return {
		/** Seconds to wait before trying again, or 0 when allowed. */
		retryAfter(address: string, name: string, now = Date.now()): number {
			return Math.max(
				pair.retryAfter(pairKey(address, name), now),
				user.retryAfter(throttleKey(name), now),
				ip.retryAfter(address, now)
			);
		},
		fail(address: string, name: string, now = Date.now()): void {
			pair.fail(pairKey(address, name), now);
			user.fail(throttleKey(name), now);
			ip.fail(address, now);
		},
		/** After a successful login: clear that user's keys (the per-IP counter keeps running). */
		succeed(address: string, name: string): void {
			pair.reset(pairKey(address, name));
			user.reset(throttleKey(name));
		}
	};
}

/** The login message shown while locked: `Demasiados intentos. Vuelve a intentarlo en 5 minutos.` */
export function throttleMessage(waitSeconds: number): string {
	const minutes = Math.max(1, Math.ceil(waitSeconds / 60));
	return `Demasiados intentos. Vuelve a intentarlo en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`;
}
