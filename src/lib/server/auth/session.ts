/** HMAC-signed tokens: `base64url(json).base64url(hmac-sha256)`. Pure. */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'np_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** A local (users.json) admin's session. */
export interface Session {
	user: string;
	/** Expiry, seconds since the epoch. */
	exp: number;
	/** The user's `sessionVersion` when the token was signed; bumping it revokes the token. */
	v: number;
}

/** A Google account's session: `users.id` plus that row's `session_version`. */
export interface GoogleSession {
	id: number;
	exp: number;
	v: number;
}

export type AnySession = ({ kind: 'local' } & Session) | ({ kind: 'google' } & GoogleSession);

/** Session tokens keep the bare payload MAC; other purposes are domain-separated. */
function mac(payload: string, secret: string, purpose: string): string {
	const input = purpose === 'session' ? payload : `${purpose}:${payload}`;
	return createHmac('sha256', secret).update(input).digest('base64url');
}

/** Sign any JSON object. `purpose` keeps a token of one kind from being replayed as another. */
export function signToken(data: object, secret: string, purpose = 'session'): string {
	const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
	return `${payload}.${mac(payload, secret, purpose)}`;
}

/** The signed object, or null when the signature does not match. Expiry is the caller's job. */
export function readToken(
	token: string | undefined,
	secret: string,
	purpose = 'session',
	maxLength = 512
): Record<string, unknown> | null {
	if (!token || token.length > maxLength) return null;
	const [payload, signature, extra] = token.split('.');
	if (!payload || !signature || extra !== undefined) return null;
	const expected = Buffer.from(mac(payload, secret, purpose));
	const given = Buffer.from(signature);
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
	try {
		const data: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
		return data && typeof data === 'object' && !Array.isArray(data)
			? (data as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

export function signSession(
	user: string,
	secret: string,
	now = Date.now(),
	ttlSeconds = SESSION_TTL_SECONDS,
	version = 1
): string {
	return signToken({ u: user, exp: Math.floor(now / 1000) + ttlSeconds, v: version }, secret);
}

export function signGoogleSession(
	id: number,
	secret: string,
	now = Date.now(),
	ttlSeconds = SESSION_TTL_SECONDS,
	version = 1
): string {
	return signToken({ k: 'g', id, exp: Math.floor(now / 1000) + ttlSeconds, v: version }, secret);
}

const validVersion = (v: unknown): v is number =>
	typeof v === 'number' && Number.isSafeInteger(v) && v >= 1;

/** Any valid, unexpired session token: a local admin's or a Google account's. */
export function verifyAnySession(
	token: string | undefined,
	secret: string,
	now = Date.now()
): AnySession | null {
	const data = readToken(token, secret);
	if (!data || typeof data.exp !== 'number' || data.exp * 1000 <= now) return null;
	if (data.k === 'g') {
		if (typeof data.id !== 'number' || !Number.isSafeInteger(data.id) || data.id < 1) return null;
		if (!validVersion(data.v)) return null;
		return { kind: 'google', id: data.id, exp: data.exp, v: data.v };
	}
	if (data.k !== undefined || typeof data.u !== 'string') return null;
	// Tokens signed before session versions existed carry no `v`: they count as version 1, so
	// a deploy does not log anyone out, and the first password change or logout-all (which
	// moves the user to version 2) revokes them like any other token.
	const v = data.v === undefined ? 1 : data.v;
	if (!validVersion(v)) return null;
	return { kind: 'local', user: data.u, exp: data.exp, v };
}

/** A local admin's session token, or null (also for Google sessions). */
export function verifySession(
	token: string | undefined,
	secret: string,
	now = Date.now()
): Session | null {
	const session = verifyAnySession(token, secret, now);
	if (!session || session.kind !== 'local') return null;
	return { user: session.user, exp: session.exp, v: session.v };
}

/**
 * The signed-in local admin for a session cookie, or null when the token is invalid, expired, the
 * user is gone, or the token's version is older than the user's current `sessionVersion`.
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
