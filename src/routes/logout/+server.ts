import { SESSION_COOKIE } from '#lib/server/auth/session.ts';
import { config } from '#lib/server/config.ts';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies }) => {
	// `secure` must match how the cookie was set, or plain-http browsers ignore the deletion
	cookies.delete(SESSION_COOKIE, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: config.cookieSecure
	});
	redirect(303, '/login');
};
