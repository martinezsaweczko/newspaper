import { COOKIE_SECURE, DATA_DIR, NEWSPAPER_DIR, SESSION_SECRET } from '$app/env/private';
import { dev } from '$app/env';
import path from 'node:path';

/** Resolved runtime configuration (env declared in src/env.ts). */
export const config = {
	newspaperDir: path.resolve(NEWSPAPER_DIR),
	dataDir: path.resolve(DATA_DIR),
	cookieSecure: COOKIE_SECURE
};

const DEV_SECRET = 'newspaper-dev-only-secret-do-not-use-in-production';
let warned = false;

/** The session HMAC key. Required in production; a fixed dev fallback (with a warning) otherwise. */
export function sessionSecret(): string {
	if (SESSION_SECRET) {
		if (!dev && SESSION_SECRET.length < 32) {
			throw new Error('SESSION_SECRET must be at least 32 characters.');
		}
		return SESSION_SECRET;
	}
	if (!dev) throw new Error('SESSION_SECRET is required in production (32+ random characters).');
	if (!warned) {
		console.warn('[newspaper] SESSION_SECRET is not set: using an insecure development secret.');
		warned = true;
	}
	return DEV_SECRET;
}
