/** HMAC-signed session tokens: `base64url(json).base64url(hmac-sha256)`. Pure. */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'np_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface Session {
	user: string;
	/** Expiry, seconds since the epoch. */
	exp: number;
}

function mac(payload: string, secret: string): string {
	return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function signSession(user: string, secret: string, now = Date.now(), ttlSeconds = SESSION_TTL_SECONDS): string {
	const payload = Buffer.from(
		JSON.stringify({ u: user, exp: Math.floor(now / 1000) + ttlSeconds })
	).toString('base64url');
	return `${payload}.${mac(payload, secret)}`;
}

export function verifySession(token: string | undefined, secret: string, now = Date.now()): Session | null {
	if (!token || token.length > 512) return null;
	const [payload, signature, extra] = token.split('.');
	if (!payload || !signature || extra !== undefined) return null;
	const expected = Buffer.from(mac(payload, secret));
	const given = Buffer.from(signature);
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
	try {
		const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { u?: unknown; exp?: unknown };
		if (typeof data.u !== 'string' || typeof data.exp !== 'number') return null;
		if (data.exp * 1000 <= now) return null;
		return { user: data.u, exp: data.exp };
	} catch {
		return null;
	}
}
