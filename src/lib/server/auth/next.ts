/**
 * Sanitise a post-login `next` target: only same-site relative paths survive.
 * Anything else (absolute URLs, `//host`, backslashes, control characters, the login page itself)
 * becomes `/`.
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
	return url.pathname + url.search + url.hash;
}
