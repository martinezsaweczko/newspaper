/**
 * The chat between readers and the administration, pure over a Drizzle handle. A conversation
 * belongs to one reader (an approved Google account with the `user` role); every admin sees every
 * conversation (a shared inbox). Live delivery is not here: see service.ts.
 */
import { and, asc, count, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { isoFromLocalDateTime } from '../../format/date.ts';
import { MAX_MESSAGE_LENGTH, type ChatMessage, type Conversation } from '../../chat/types.ts';
import type { CurrentUser } from '../../types.ts';
import type { Db } from '../db/index.ts';
import { messages, users, type MessageDirection } from '../db/schema.ts';

/** Shown as the author of an admin message whose account no longer exists. */
export const FORMER_ADMIN = 'Administración';

/**
 * The text to store, or null when there is nothing to send or it is too long. Line breaks become
 * `\n`, the ends are trimmed, and more than three line breaks in a row are folded.
 */
export function cleanBody(text: unknown): string | null {
	if (typeof text !== 'string') return null;
	const body = text
		.replace(/\r\n?/g, '\n')
		.replace(/\n{4,}/g, '\n\n\n')
		.trim();
	if (body.length === 0 || [...body].length > MAX_MESSAGE_LENGTH) return null;
	// a lone surrogate would not survive utf8mb4
	return body.isWellFormed() ? body : null;
}

/** Can this account have a conversation (be the reader side of one)? */
export const isChatReader = (user: CurrentUser | null): user is CurrentUser & { id: number } =>
	user !== null &&
	user.kind === 'google' &&
	user.id !== null &&
	user.status === 'approved' &&
	user.role === 'user';

export const isChatAdmin = (user: CurrentUser | null): boolean =>
	user !== null && user.status === 'approved' && user.role === 'admin';

export type SendError = 'empty' | 'not-allowed' | 'no-reader';
export type SendResult = { ok: true; message: ChatMessage } | { ok: false; error: SendError };

const reader = alias(users, 'reader');
const sender = alias(users, 'sender');

const columns = {
	id: messages.id,
	readerId: messages.readerId,
	direction: messages.direction,
	body: messages.body,
	createdAt: messages.createdAt,
	readAt: messages.readAt,
	senderLocal: messages.senderLocalUsername,
	senderName: sender.name,
	senderEmail: sender.email,
	readerName: reader.name,
	readerEmail: reader.email
};
type Joined = {
	id: number;
	readerId: number;
	direction: MessageDirection;
	body: string;
	createdAt: Date;
	readAt: Date | null;
	senderLocal: string | null;
	senderName: string | null;
	senderEmail: string | null;
	readerName: string;
	readerEmail: string;
};

function toMessage(row: Joined): ChatMessage {
	const author =
		row.direction === 'in'
			? row.readerName || row.readerEmail
			: row.senderLocal || row.senderName || row.senderEmail;
	return {
		id: row.id,
		readerId: row.readerId,
		direction: row.direction,
		body: row.body,
		sentAt: isoFromLocalDateTime(row.createdAt),
		sender: author || FORMER_ADMIN,
		read: row.readAt !== null
	};
}

const joined = (db: Db) =>
	db
		.select(columns)
		.from(messages)
		.innerJoin(reader, eq(reader.id, messages.readerId))
		.leftJoin(sender, eq(sender.id, messages.senderUserId));

/** Is `readerId` an account that can still hold a conversation? */
async function canReceive(db: Db, readerId: number): Promise<boolean> {
	const [row] = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.id, readerId), eq(users.status, 'approved'), eq(users.role, 'user')));
	return Boolean(row);
}

/**
 * Store a message. A reader writes to the administration (`to` is ignored); an admin writes to
 * reader `to`, who must still be an approved reader.
 */
export async function sendMessage(
	db: Db,
	from: CurrentUser,
	text: unknown,
	to: number | null = null,
	now = new Date()
): Promise<SendResult> {
	let values: typeof messages.$inferInsert;
	const body = cleanBody(text);
	if (isChatReader(from)) {
		if (body === null) return { ok: false, error: 'empty' };
		values = { readerId: from.id, direction: 'in', senderUserId: from.id, body, createdAt: now };
	} else if (isChatAdmin(from)) {
		if (body === null) return { ok: false, error: 'empty' };
		if (to === null || !(await canReceive(db, to))) return { ok: false, error: 'no-reader' };
		values = {
			readerId: to,
			direction: 'out',
			senderUserId: from.kind === 'google' ? from.id : null,
			senderLocalUsername: from.kind === 'local' ? from.name : null,
			body,
			createdAt: now
		};
	} else {
		return { ok: false, error: 'not-allowed' };
	}
	const [{ id }] = await db.insert(messages).values(values).$returningId();
	const [row] = await joined(db).where(eq(messages.id, id));
	return { ok: true, message: toMessage(row) };
}

/** The latest `limit` messages of a conversation, oldest first. */
export async function thread(db: Db, readerId: number, limit = 200): Promise<ChatMessage[]> {
	const rows = await joined(db)
		.where(eq(messages.readerId, readerId))
		.orderBy(desc(messages.id))
		.limit(limit);
	return rows.reverse().map(toMessage);
}

/**
 * Mark one side's messages of a conversation as read: `in` when an admin opened it, `out` when
 * the reader did. Returns how many changed.
 */
export async function markRead(
	db: Db,
	readerId: number,
	direction: MessageDirection,
	now = new Date()
): Promise<number> {
	const [result] = await db
		.update(messages)
		.set({ readAt: now })
		.where(
			and(
				eq(messages.readerId, readerId),
				eq(messages.direction, direction),
				isNull(messages.readAt)
			)
		);
	return result.affectedRows;
}

/** Admin messages the reader has not read yet. */
export async function unreadForReader(db: Db, readerId: number): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(messages)
		.where(
			and(eq(messages.readerId, readerId), eq(messages.direction, 'out'), isNull(messages.readAt))
		);
	return row?.n ?? 0;
}

/** Reader messages no admin has read yet (the shared inbox). */
export async function unreadForAdmins(db: Db): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(messages)
		.where(and(eq(messages.direction, 'in'), isNull(messages.readAt)));
	return row?.n ?? 0;
}

/** Every conversation, the most recent first, with its last message and unread count. */
export async function conversations(db: Db): Promise<Conversation[]> {
	const heads = await db
		.select({
			readerId: messages.readerId,
			lastId: sql<number>`max(${messages.id})`.mapWith(Number),
			unread: sql<number>`sum(${messages.direction} = 'in' and ${messages.readAt} is null)`.mapWith(
				Number
			)
		})
		.from(messages)
		.groupBy(messages.readerId);
	if (heads.length === 0) return [];
	const lastRows = await joined(db).where(
		inArray(
			messages.id,
			heads.map((h) => h.lastId)
		)
	);
	const last = new Map(lastRows.map((row) => [row.readerId, row]));
	return heads
		.sort((a, b) => b.lastId - a.lastId)
		.flatMap((head) => {
			const row = last.get(head.readerId);
			if (!row) return [];
			const message = toMessage(row);
			return [
				{
					readerId: head.readerId,
					name: row.readerName || row.readerEmail,
					email: row.readerEmail,
					last: { body: message.body, sentAt: message.sentAt, direction: message.direction },
					unread: head.unread
				}
			];
		});
}

/** Approved readers an admin can write to, by name. */
export async function chatReaders(db: Db): Promise<{ id: number; name: string; email: string }[]> {
	const rows = await db
		.select({ id: users.id, name: users.name, email: users.email })
		.from(users)
		.where(and(eq(users.status, 'approved'), eq(users.role, 'user')))
		.orderBy(asc(users.name), asc(users.email));
	return rows.map((r) => ({ id: r.id, name: r.name || r.email, email: r.email }));
}

/** Messages are kept this many months. */
export const RETENTION_MONTHS = 6;

/** `now` minus the retention period, in calendar months (UTC). */
export function retentionCutoff(now: Date, months = RETENTION_MONTHS): Date {
	const cutoff = new Date(now);
	cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
	return cutoff;
}

/** Delete messages older than `cutoff`. Returns how many went. */
export async function purgeMessages(db: Db, cutoff: Date): Promise<number> {
	const [result] = await db.delete(messages).where(lt(messages.createdAt, cutoff));
	return result.affectedRows;
}
