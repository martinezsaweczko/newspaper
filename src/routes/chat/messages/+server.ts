import { thread, isChatReader } from '#lib/server/chat/messages.ts';
import { readJson, sendResponse } from '#lib/server/chat/http.ts';
import { send } from '#lib/server/chat/service.ts';
import { db } from '#lib/server/auth/index.ts';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * A reader's conversation with the administration (the chat button): GET reads it, POST
 * `{ text }` writes to the admins. Admins use /admin/mensajes instead.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!isChatReader(user)) error(403, 'Los administradores responden desde Mensajes.');
	return json(
		{ messages: await thread(db(), user.id) },
		{ headers: { 'cache-control': 'no-store' } }
	);
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = locals.user;
	if (!isChatReader(user)) error(403, 'Los administradores responden desde Mensajes.');
	const { text } = await readJson(request);
	return sendResponse(await send(user, text));
};
