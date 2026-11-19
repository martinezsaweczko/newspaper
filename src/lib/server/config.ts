import {
	AUTH_DISABLED,
	COOKIE_SECURE,
	DATA_DIR,
	DATABASE_URL,
	NEWSPAPER_DIR,
	SESSION_SECRET
} from '$app/env/private';
import { dev } from '$app/env';
import path from 'node:path';

/** Resolved runtime configuration (env declared in src/env.ts). */
export const config = {
	newspaperDir: path.resolve(NEWSPAPER_DIR),
	dataDir: path.resolve(DATA_DIR),
	cookieSecure: COOKIE_SECURE,
	/** Testing only: skip the login. Honoured by the dev server only, never by `node build`. */
	authDisabled: dev && AUTH_DISABLED,
	databaseUrl: DATABASE_URL
};

/** The user every request runs as while `authDisabled` is on. */
export const DEV_USER = 'tester';

if (AUTH_DISABLED) {
	console.warn(
		dev
			? '[newspaper] AUTH_DISABLED is on: the login is skipped (dev server only).'
			: '[newspaper] AUTH_DISABLED is ignored outside the dev server.'
	);
}

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
