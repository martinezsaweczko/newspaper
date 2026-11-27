import { isChatReader } from '#lib/server/chat/messages.ts';
import { readJson } from '#lib/server/chat/http.ts';
import { markConversationRead } from '#lib/server/chat/service.ts';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** The reader has seen the administration's messages (the chat panel is open). */
export const POST: RequestHandler = async ({ locals, request }) => {
	const user = locals.user;
	if (!isChatReader(user)) error(403, 'Los administradores responden desde Mensajes.');
	await readJson(request);
	await markConversationRead(user, user.id);
	return new Response(null, { status: 204 });
};
