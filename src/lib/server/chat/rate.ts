/**
 * Per-person send limits for the chat, in memory: each limit is "at most `max` in `windowMs`".
 * `take` records the attempt only when every limit allows it.
 */
export interface RateLimit {
	max: number;
	windowMs: number;
}

export function createRateLimiter(limits: RateLimit[], now: () => number = Date.now) {
	const longest = Math.max(...limits.map((l) => l.windowMs));
	const sent = new Map<string, number[]>();
	return {
		take(key: string): boolean {
			const t = now();
			const recent = (sent.get(key) ?? []).filter((at) => t - at < longest);
			const allowed = limits.every(
				({ max, windowMs }) => recent.filter((at) => t - at < windowMs).length < max
			);
			if (allowed) recent.push(t);
			if (recent.length > 0) sent.set(key, recent);
			else sent.delete(key);
			return allowed;
		}
	};
}
