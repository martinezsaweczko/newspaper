import {
	ADMIN_EMAILS,
	AUTH_DISABLED,
	COOKIE_SECURE,
	DATA_DIR,
	DATABASE_URL,
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET,
	GOOGLE_ISSUER,
	NEWSPAPER_DIR,
	PUBLIC_ORIGIN,
	SESSION_SECRET
} from '$app/env/private';
import { dev } from '$app/env';
import path from 'node:path';
import type { CurrentUser } from '../types.ts';
import { parseAdminEmails } from './auth/accounts.ts';
import { localAdmin } from './auth/current.ts';

/** Resolved runtime configuration (env declared in src/env.ts). */
export const config = {
	newspaperDir: path.resolve(NEWSPAPER_DIR),
	dataDir: path.resolve(DATA_DIR),
	cookieSecure: COOKIE_SECURE,
	/** Testing only: skip the login. Honoured by the dev server only, never by `node build`. */
	authDisabled: dev && AUTH_DISABLED,
	databaseUrl: DATABASE_URL,
	/** Emails that become approved admins when their account is created (lowercase). */
	adminEmails: parseAdminEmails(ADMIN_EMAILS),
	/** Google sign-in, or null when it is not configured (the button is hidden, routes 404). */
	google: googleConfig()
};

function googleConfig() {
	if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;
	if (!PUBLIC_ORIGIN) {
		console.warn(
			'[newspaper] GOOGLE_CLIENT_ID is set but PUBLIC_ORIGIN is not: Google sign-in is off.'
		);
		return null;
	}
	return {
		issuer: GOOGLE_ISSUER,
		clientId: GOOGLE_CLIENT_ID,
		clientSecret: GOOGLE_CLIENT_SECRET,
		redirectUri: `${PUBLIC_ORIGIN}/auth/google/callback`
	};
}

/** The user every request runs as while `authDisabled` is on: a local admin. */
export const DEV_USER: CurrentUser = localAdmin('tester');

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
