/**
 * A short-lived cache of user rows by id, so a page with dozens of front-page thumbnails costs
 * one query, not dozens. Admin actions call `invalidate` so a block or demotion applies at once
 * in this process; elsewhere it applies within `ttlMs`. Concurrent misses share one load.
 */
export function createUserCache<T>({
	load,
	ttlMs = 5000,
	maxEntries = 1000,
	now = () => Date.now()
}: {
	load: (id: number) => Promise<T | null>;
	ttlMs?: number;
	maxEntries?: number;
	now?: () => number;
}) {
	const entries = new Map<number, { value: Promise<T | null>; expires: number }>();

	return {
		get(id: number): Promise<T | null> {
			const t = now();
			const hit = entries.get(id);
			if (hit && hit.expires > t) return hit.value;
			if (entries.size >= maxEntries) {
				for (const [key, entry] of entries) if (entry.expires <= t) entries.delete(key);
				if (entries.size >= maxEntries) entries.delete(entries.keys().next().value as number);
			}
			const value = load(id);
			const entry = { value, expires: t + ttlMs };
			entries.set(id, entry);
			// a failed load is not cached
			value.catch(() => {
				if (entries.get(id) === entry) entries.delete(id);
			});
			return value;
		},
		/** Forget one user, or everyone. */
		invalidate(id?: number): void {
			if (id === undefined) entries.clear();
			else entries.delete(id);
		},
		size: () => entries.size
	};
}

export type UserCache<T> = ReturnType<typeof createUserCache<T>>;
