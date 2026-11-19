import { signInGoogleUser } from '#lib/server/auth/accounts.ts';
import { FLOW_COOKIE, FLOW_COOKIE_PATH, finishSignIn } from '#lib/server/auth/google.ts';
import { db, googleClient, userCache } from '#lib/server/auth/index.ts';
import { OidcError, type OidcFailure } from '#lib/server/auth/oidc.ts';
import {
	SESSION_COOKIE,
	SESSION_TTL_SECONDS,
	signGoogleSession
} from '#lib/server/auth/session.ts';
import { config, sessionSecret } from '#lib/server/config.ts';
import { recordLogin } from '#lib/server/observability/metrics.ts';
import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** The `?error=` code /login turns into a Spanish message. */
const LOGIN_ERROR: Partial<Record<OidcFailure, string>> = {
	denied: 'cancelado',
	unverified: 'sin-verificar',
	conflict: 'cuenta'
};

/**
 * Google's redirect back. A GET, so `state` (checked against the signed flow cookie) is the CSRF
 * protection; Kit's form origin check does not apply here.
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
	const client = googleClient();
	if (!client) error(404, 'Not Found');
	const flowCookie = cookies.get(FLOW_COOKIE);
	// single use, whatever happens next
	cookies.delete(FLOW_COOKIE, {
		path: FLOW_COOKIE_PATH,
		httpOnly: true,
		sameSite: 'lax',
		secure: config.cookieSecure
	});

	let target: string;
	try {
		const secret = sessionSecret();
		const { identity, next } = await finishSignIn(client, secret, url.searchParams, flowCookie);
		const user = await signInGoogleUser(db(), identity, config.adminEmails);
		userCache.invalidate(user.id);
		cookies.set(
			SESSION_COOKIE,
			signGoogleSession(user.id, secret, Date.now(), SESSION_TTL_SECONDS, user.sessionVersion),
			{
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: config.cookieSecure,
				maxAge: SESSION_TTL_SECONDS
			}
		);
		recordLogin('success');
		console.log(`[auth] Google sign-in: user ${user.id} (${user.status}, ${user.role})`);
		// pending and blocked accounts are sent on to /pendiente or /bloqueado by the guard
		target = next;
	} catch (err) {
		recordLogin('failure');
		const reason = err instanceof OidcError ? err.reason : 'internal';
		console.warn(`[auth] Google sign-in failed (${reason}): ${(err as Error).message}`);
		const code = err instanceof OidcError ? (LOGIN_ERROR[err.reason] ?? 'google') : 'google';
		target = `/login?error=${code}`;
	}
	redirect(303, target);
};
