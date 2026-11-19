/**
 * Sanitise a post-login `next` target: only same-site relative paths survive.
 * Anything else (absolute URLs, `//host`, backslashes, control characters, the login page itself,
 * or a path that only turns into `//host` after dot-segment normalisation) becomes `/`.
 */
export function sanitizeNext(raw: string | null | undefined): string {
	if (!raw || raw.length > 2048) return '/';
	if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
	for (const ch of raw) {
		const code = ch.charCodeAt(0);
		if (ch === '\\' || code < 0x20 || code === 0x7f) return '/';
	}
	let url: URL;
	try {
		url = new URL(raw, 'http://local.invalid');
	} catch {
		return '/';
	}
	if (url.origin !== 'http://local.invalid') return '/';
	if (url.pathname === '/login' || url.pathname.startsWith('/login/')) return '/';
	const result = url.pathname + url.search + url.hash;
	// Dot segments are resolved by the URL parser, so `/..//evil.com` only becomes the
	// protocol-relative `//evil.com` here: check the normalised result, not just the input.
	if (!result.startsWith('/') || result.startsWith('//') || result.startsWith('/\\')) return '/';
	if (new URL(result, 'http://local.invalid').origin !== 'http://local.invalid') return '/';
	return result;
}
