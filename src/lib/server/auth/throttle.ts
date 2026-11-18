/** In-memory login throttle: `max` failures per key within `windowMs`, then locked until the window passes. */
export function createThrottle({ max = 5, windowMs = 15 * 60 * 1000 } = {}) {
	const failures = new Map<string, number[]>();

	const recent = (key: string, now: number) => {
		const list = (failures.get(key) ?? []).filter((t) => now - t < windowMs);
		if (list.length) failures.set(key, list);
		else failures.delete(key);
		return list;
	};

	return {
		/** Seconds to wait before trying again, or 0 when allowed. */
		retryAfter(key: string, now = Date.now()): number {
			const list = recent(key, now);
			if (list.length < max) return 0;
			return Math.max(1, Math.ceil((list[0] + windowMs - now) / 1000));
		},
		fail(key: string, now = Date.now()): void {
			const list = recent(key, now);
			list.push(now);
			failures.set(key, list);
			if (failures.size > 10_000) failures.delete(failures.keys().next().value as string);
		},
		reset(key: string): void {
			failures.delete(key);
		}
	};
}

/** The login message shown while locked: `Demasiados intentos. Vuelve a intentarlo en 5 minutos.` */
export function throttleMessage(waitSeconds: number): string {
	const minutes = Math.max(1, Math.ceil(waitSeconds / 60));
	return `Demasiados intentos. Vuelve a intentarlo en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`;
}
