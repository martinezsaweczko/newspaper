/** HMAC-signed session tokens: `base64url(json).base64url(hmac-sha256)`. Pure. */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'np_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface Session {
	user: string;
	/** Expiry, seconds since the epoch. */
	exp: number;
	/** The user's `sessionVersion` when the token was signed; bumping it revokes the token. */
	v: number;
}

function mac(payload: string, secret: string): string {
	return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function signSession(
	user: string,
	secret: string,
	now = Date.now(),
	ttlSeconds = SESSION_TTL_SECONDS,
	version = 1
): string {
	const payload = Buffer.from(
		JSON.stringify({ u: user, exp: Math.floor(now / 1000) + ttlSeconds, v: version })
	).toString('base64url');
	return `${payload}.${mac(payload, secret)}`;
}

export function verifySession(
	token: string | undefined,
	secret: string,
	now = Date.now()
): Session | null {
	if (!token || token.length > 512) return null;
	const [payload, signature, extra] = token.split('.');
	if (!payload || !signature || extra !== undefined) return null;
	const expected = Buffer.from(mac(payload, secret));
	const given = Buffer.from(signature);
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
	try {
		const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
			u?: unknown;
			exp?: unknown;
			v?: unknown;
		};
		if (typeof data.u !== 'string' || typeof data.exp !== 'number') return null;
		if (data.exp * 1000 <= now) return null;
		// Tokens signed before session versions existed carry no `v`: they count as version 1, so
		// a deploy does not log anyone out, and the first password change or logout-all (which
		// moves the user to version 2) revokes them like any other token.
		const v = data.v === undefined ? 1 : data.v;
		if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1) return null;
		return { user: data.u, exp: data.exp, v };
	} catch {
		return null;
	}
}

/**
 * The signed-in user for a session cookie, or null when the token is invalid, expired, the user
 * is gone, or the token's version is older than the user's current `sessionVersion`.
 */
export function sessionUser(
	token: string | undefined,
	secret: string,
	users: { version(name: string): number | null },
	now = Date.now()
): string | null {
	const session = verifySession(token, secret, now);
	if (!session) return null;
	return users.version(session.user) === session.v ? session.user : null;
}
