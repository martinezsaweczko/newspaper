import { building } from '$app/env';
import { users } from '#lib/server/auth/index.ts';
import { isCrossSiteForm } from '#lib/server/auth/origin.ts';
import { SESSION_COOKIE, verifySession } from '#lib/server/auth/session.ts';
import { config, sessionSecret } from '#lib/server/config.ts';
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { mkdirSync } from 'node:fs';

export const init: ServerInit = () => {
	if (building) return;
	sessionSecret(); // fail fast in production without a secret
	mkdirSync(config.dataDir, { recursive: true });
};

/** Routes reachable without a session. Static files are served by adapter-node before this hook. */
function isPublic(pathname: string): boolean {
	return pathname === '/login' || pathname.startsWith('/_app/') || pathname === '/robots.txt';
}

export const handle: Handle = async ({ event, resolve }) => {
	if (isCrossSiteForm(event.request)) {
		return new Response('Cross-site form submissions are not allowed.', { status: 403 });
	}

	const session = verifySession(event.cookies.get(SESSION_COOKIE), sessionSecret());
	event.locals.user = session && users.has(session.user) ? session.user : null;

	const { pathname, search } = event.url;
	if (!event.locals.user && !isPublic(pathname)) {
		if (event.request.method !== 'GET' && event.request.method !== 'HEAD') {
			return new Response('Sign in first.', { status: 401 });
		}
		const next = pathname === '/' && !search ? '' : `?next=${encodeURIComponent(pathname + search)}`;
		return new Response(null, { status: 303, headers: { location: `/login${next}` } });
	}

	const response = await resolve(event);
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'same-origin');
	response.headers.set('x-frame-options', 'SAMEORIGIN');
	return response;
};
