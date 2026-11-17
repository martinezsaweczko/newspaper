export type RangeResult =
	| { kind: 'full' }
	| { kind: 'partial'; start: number; end: number }
	| { kind: 'unsatisfiable' };

/**
 * Parse a `Range` header for a resource of `size` bytes (RFC 9110 §14.1.2).
 * One byte range is honoured; a missing, malformed or multi-range header serves the whole file.
 */
export function parseRange(header: string | null | undefined, size: number): RangeResult {
	if (!header) return { kind: 'full' };
	const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
	if (!m) return { kind: 'full' };
	const [, a, b] = m;
	if (a === '' && b === '') return { kind: 'full' };

	if (a === '') {
		const suffix = Number(b);
		if (suffix === 0) return { kind: 'unsatisfiable' };
		if (size === 0) return { kind: 'unsatisfiable' };
		return { kind: 'partial', start: Math.max(0, size - suffix), end: size - 1 };
	}

	const start = Number(a);
	const end = b === '' ? size - 1 : Math.min(Number(b), size - 1);
	if (b !== '' && Number(b) < start) return { kind: 'full' };
	if (start >= size) return { kind: 'unsatisfiable' };
	return { kind: 'partial', start, end };
}

/** `inline; filename="ascii"; filename*=UTF-8''percent-encoded` (RFC 6266 / 5987). */
export function contentDisposition(type: 'inline' | 'attachment', filename: string): string {
	const ascii = filename.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
	const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
	return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
