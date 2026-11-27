import { userLabel } from '#lib/server/auth/current.ts';
import { sessionUser } from '#lib/server/auth/index.ts';
import { SESSION_COOKIE } from '#lib/server/auth/session.ts';
import { presence } from '#lib/server/chat/index.ts';
import { unreadFor } from '#lib/server/chat/service.ts';
import { SSE_HEADERS, sseResponse } from '#lib/server/chat/sse.ts';
import { isStopping } from '#lib/server/lifecycle.ts';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * The live channel of every signed-in page (`EventSource`): `presence` (is an admin online; for
 * admins, who is), `unread` (the badge count), `message` (a new chat message in a conversation the
 * account can see) and `read` (the other side read a conversation). Only approved accounts get here (the hook's
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
		open: (send, close) => {
			const leave = presence.connect(member, send, close);
			// the unread badge starts from the database; later changes arrive as `unread` events
			unreadFor(user).then(
				(count) => count !== null && send('unread', { count }),
				(err: unknown) =>
					console.warn(`[chat] could not count unread messages: ${(err as Error)?.message ?? err}`)
			);
			return leave;
		},
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
