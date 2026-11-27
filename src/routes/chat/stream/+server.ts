import { userLabel } from '#lib/server/auth/current.ts';
import { sessionUser } from '#lib/server/auth/index.ts';
import { SESSION_COOKIE } from '#lib/server/auth/session.ts';
import { presence } from '#lib/server/chat/index.ts';
import { SSE_HEADERS, sseResponse } from '#lib/server/chat/sse.ts';
import { isStopping } from '#lib/server/lifecycle.ts';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * The live channel of every signed-in page (`EventSource`): `presence` events with whether an
 * admin is online, plus, for admins, who is online. Only approved accounts get here (the hook's
 * guard). The stream ends when the account is blocked, demoted, promoted or signed out
 * everywhere; the browser then reconnects and gets its new view, or is turned away.
 */
export const GET: RequestHandler = ({ locals, cookies, request }) => {
	const user = locals.user;
	if (!user || user.status !== 'approved') error(403, 'Tu cuenta todavía no puede leer.');
	// Shutting down: an empty stream that ends at once; the browser retries, reaching the next process.
	if (isStopping()) return new Response('retry: 3000\n\n', { headers: SSE_HEADERS });
	const member = { key: userLabel(user), admin: user.role === 'admin' };
	const token = cookies.get(SESSION_COOKIE);

	return sseResponse({
		signal: request.signal,
		open: (send, close) => presence.connect(member, (view) => send('presence', view), close),
		check: async () => {
			const now = await sessionUser(token);
			return (
				now !== null &&
				now.status === 'approved' &&
				userLabel(now) === member.key &&
				(now.role === 'admin') === member.admin
			);
		}
	});
};
