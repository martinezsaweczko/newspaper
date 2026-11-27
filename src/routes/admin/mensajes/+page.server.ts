import { db } from '#lib/server/auth/index.ts';
import { sendErrorText } from '#lib/server/chat/http.ts';
import { chatReaders, conversations, thread } from '#lib/server/chat/messages.ts';
import { markConversationRead, send } from '#lib/server/chat/service.ts';
import { userLabel } from '#lib/user-label.ts';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/** `?lector=<users.id>`: the open conversation. */
function readerParam(value: FormDataEntryValue | string | null): number | null {
	if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) return null;
	return Number(value);
}

/**
 * The shared inbox: every conversation, and the one in `?lector=` with its messages. Opening a
 * conversation marks the reader's messages read for every admin. The page reloads this (`depends`)
 * whenever a message or a read receipt arrives on the live stream.
 */
export const load: PageServerLoad = async ({ url, locals, depends }) => {
	depends('app:mensajes');
	const selectedId = readerParam(url.searchParams.get('lector'));
	const readers = await chatReaders(db());
	const selected = readers.find((r) => r.id === selectedId) ?? null;
	if (selected && locals.user) await markConversationRead(locals.user, selected.id);
	const list = await conversations(db());
	return {
		conversations: list,
		readers: readers.map((r) => ({
			...r,
			key: userLabel({ kind: 'google', id: r.id, name: r.name })
		})),
		selected: selected
			? {
					...selected,
					key: userLabel({ kind: 'google', id: selected.id, name: selected.name }),
					messages: await thread(db(), selected.id)
				}
			: null,
		/** `?lector=` named someone who cannot chat (gone, blocked, or an admin). */
		missing: selectedId !== null && !selected
	};
};

export const actions: Actions = {
	enviar: async ({ request, locals }) => {
		const form = await request.formData();
		const to = readerParam(form.get('lector'));
		const text = form.get('texto');
		if (!locals.user || to === null) return fail(400, { error: sendErrorText('no-reader'), text });
		const result = await send(locals.user, text, to);
		if (!result.ok) {
			const status = result.error === 'rate' ? 429 : 400;
			return fail(status, { error: sendErrorText(result.error), text });
		}
		return { sent: true };
	}
};
