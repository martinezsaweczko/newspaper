/**
 * The chat as the routes use it: store (messages.ts), then deliver live over the open streams
 * (presence hub), count (metrics) and trace. Message text never goes into a span, log or metric.
 */
import type { ChatRead } from '../../chat/types.ts';
import type { CurrentUser } from '../../types.ts';
import { userLabel } from '../../user-label.ts';
import { db } from '../auth/index.ts';
import type { MessageDirection } from '../db/schema.ts';
import { recordChatMessage } from '../observability/metrics.ts';
import { withSpan } from '../observability/trace.ts';
import { presence } from './index.ts';
import {
	isChatAdmin,
	isChatReader,
	markRead,
	sendMessage,
	unreadForAdmins,
	unreadForReader,
	type SendResult
} from './messages.ts';
import { createRateLimiter } from './rate.ts';

/** A person may send 10 messages a minute and 60 an hour. */
const limiter = createRateLimiter([
	{ max: 10, windowMs: 60_000 },
	{ max: 60, windowMs: 3_600_000 }
]);

const readerKey = (readerId: number) => ({ key: String(readerId) });
const ADMINS = { admins: true } as const;

const warn = (what: string) => (err: unknown) =>
	console.warn(`[chat] ${what}: ${(err as Error)?.message ?? err}`);

/** Tell every admin how many reader messages are unread. */
async function pushAdminUnread(): Promise<void> {
	presence.publish(ADMINS, 'unread', { count: await unreadForAdmins(db()) });
}

/** Tell a reader how many admin messages they have not read. */
async function pushReaderUnread(readerId: number): Promise<void> {
	presence.publish(readerKey(readerId), 'unread', { count: await unreadForReader(db(), readerId) });
}

export type ChatSendResult = SendResult | { ok: false; error: 'rate' };

/** A reader writes to the administration, or an admin writes to reader `to`. */
export async function send(
	from: CurrentUser,
	text: unknown,
	to: number | null = null
): Promise<ChatSendResult> {
	if (!limiter.take(userLabel(from))) return { ok: false, error: 'rate' };
	const direction: MessageDirection = isChatAdmin(from) ? 'out' : 'in';
	const result = await withSpan(
		'newspaper.chat.send',
		{ 'newspaper.chat.direction': direction },
		async (span) => {
			const r = await sendMessage(db(), from, text, to);
			span.setAttribute('newspaper.chat.result', r.ok ? 'sent' : r.error);
			return r;
		}
	);
	if (!result.ok) return result;
	const message = result.message;
	recordChatMessage(message.direction);
	presence.publish(readerKey(message.readerId), 'message', message);
	presence.publish(ADMINS, 'message', message);
	const unread =
		message.direction === 'in' ? pushAdminUnread() : pushReaderUnread(message.readerId);
	await unread.catch(warn('could not update the unread count'));
	return result;
}

/**
 * Mark a conversation read: by its reader (the admins' messages) or by an admin (the reader's).
 * Tells both sides when something changed.
 */
export async function markConversationRead(by: CurrentUser, readerId: number): Promise<void> {
	const direction: MessageDirection | null = isChatAdmin(by)
		? 'in'
		: isChatReader(by) && by.id === readerId
			? 'out'
			: null;
	if (!direction) return;
	const changed = await markRead(db(), readerId, direction);
	if (changed === 0) return;
	const read: ChatRead = { readerId, direction };
	presence.publish(readerKey(readerId), 'read', read);
	presence.publish(ADMINS, 'read', read);
	await (direction === 'in' ? pushAdminUnread() : pushReaderUnread(readerId)).catch(
		warn('could not update the unread count')
	);
}

/** The unread count a new stream starts with, or null for accounts without a chat side. */
export async function unreadFor(user: CurrentUser): Promise<number | null> {
	if (isChatAdmin(user)) return unreadForAdmins(db());
	if (isChatReader(user)) return unreadForReader(db(), user.id);
	return null;
}
