import type { ScannedEdition } from './scan.ts';

/** Better copy of the same edition first: the larger file, then the original, then the newest. */
function better(a: ScannedEdition, b: ScannedEdition): boolean {
	if (a.size !== b.size) return a.size > b.size;
	if (a.copy !== b.copy) return !a.copy;
	return a.mtimeMs > b.mtimeMs;
}

/**
 * One file per masthead (slug) and date. Download copies (`Hola (1).pdf`) and the same issue
 * under two naming styles are the same edition; the larger file wins (a truncated download loses),
 * then the original without a copy marker, then the most recently modified. Keeps the input order.
 */
export function dedupeEditions(editions: ScannedEdition[]): ScannedEdition[] {
	const best = new Map<string, ScannedEdition>();
	for (const e of editions) {
		const key = `${e.slug}\u0000${e.date}`;
		const prev = best.get(key);
		if (!prev || better(e, prev)) best.set(key, e);
	}
	const keep = new Set(best.values());
	return editions.filter((e) => keep.has(e));
}
