/**
 * Database schema (MySQL 8.4, Drizzle). Change it here, then `npm run db:generate` writes the
 * migration into /drizzle; the server applies pending migrations at start (hooks.server.ts init).
 * Times are DATETIME in UTC: the pool runs with `timezone: 'Z'` and the app always sets them.
 */
import {
	bigint,
	date,
	datetime,
	index,
	int,
	mysqlEnum,
	mysqlTable,
	varchar,
	type AnyMySqlColumn
} from 'drizzle-orm/mysql-core';

export const USER_STATUSES = ['pending', 'approved', 'blocked'] as const;
export const USER_ROLES = ['user', 'admin'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
export type UserRole = (typeof USER_ROLES)[number];

/** People who sign in with Google. Local admins (users.json) are not in this table. */
export const users = mysqlTable('users', {
	id: int('id').autoincrement().primaryKey(),
	/** Lowercase. */
	email: varchar('email', { length: 254 }).notNull().unique('users_email_uq'),
	/** Google's stable account id (`sub`); null for a row an admin created before the first sign-in. */
	googleSub: varchar('google_sub', { length: 255 }).unique('users_google_sub_uq'),
	name: varchar('name', { length: 200 }).notNull().default(''),
	pictureUrl: varchar('picture_url', { length: 2048 }),
	status: mysqlEnum('status', USER_STATUSES).notNull().default('pending'),
	role: mysqlEnum('role', USER_ROLES).notNull().default('user'),
	/** Signed into every session token; bumping it signs the user out everywhere. */
	sessionVersion: int('session_version').notNull().default(1),
	createdAt: datetime('created_at').notNull(),
	approvedAt: datetime('approved_at'),
	/** The approving admin; null when a local (users.json) admin approved or ADMIN_EMAILS did. */
	approvedBy: int('approved_by').references((): AnyMySqlColumn => users.id, {
		onDelete: 'set null'
	}),
	lastLoginAt: datetime('last_login_at')
});

export const READING_KINDS = ['open', 'download'] as const;
export type ReadingKind = (typeof READING_KINDS)[number];

/**
 * Who opened which edition, and when. Kept forever (see the privacy notice). The reader is either
 * a Google account (`user_id`) or a local users.json admin (`local_username`): exactly one is set.
 * Enforced by reading/log.ts, not by a CHECK: MySQL forbids CHECKs on a column with ON DELETE
 * CASCADE.
 */
export const readingEvents = mysqlTable(
	'reading_events',
	{
		id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
		userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }),
		/** The users.json name of a local admin (they have no users row). */
		localUsername: varchar('local_username', { length: 64 }),
		/** Relative path of the PDF inside NEWSPAPER_DIR. */
		editionPath: varchar('edition_path', { length: 1024 }).notNull(),
		mastheadSlug: varchar('masthead_slug', { length: 160 }).notNull(),
		region: varchar('region', { length: 120 }).notNull(),
		editionDate: date('edition_date', { mode: 'string' }).notNull(),
		kind: mysqlEnum('kind', READING_KINDS).notNull(),
		createdAt: datetime('created_at').notNull()
	},
	(t) => [
		index('reading_events_user_created_idx').on(t.userId, t.createdAt),
		index('reading_events_masthead_created_idx').on(t.mastheadSlug, t.createdAt),
		index('reading_events_created_idx').on(t.createdAt),
		index('reading_events_local_created_idx').on(t.localUsername, t.createdAt)
	]
);

export const MESSAGE_DIRECTIONS = ['in', 'out'] as const;
/** `in`: the reader wrote to the administration; `out`: an admin wrote to the reader. */
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

/**
 * The chat between a reader and the administration (a shared inbox: every admin sees every
 * conversation). A conversation is identified by its reader, always a Google account; deleting
 * the account deletes it. The admin who wrote an `out` message is `sender_user_id` (a Google
 * admin; null once that account is deleted) or `sender_local_username` (a users.json admin).
 * Deleted after 6 months (chat/retention.ts).
 */
export const messages = mysqlTable(
	'messages',
	{
		id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
		readerId: int('reader_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		direction: mysqlEnum('direction', MESSAGE_DIRECTIONS).notNull(),
		senderUserId: int('sender_user_id').references(() => users.id, { onDelete: 'set null' }),
		senderLocalUsername: varchar('sender_local_username', { length: 64 }),
		body: varchar('body', { length: 2000 }).notNull(),
		createdAt: datetime('created_at').notNull(),
		/** When the other side read it: any admin for `in`, the reader for `out`. */
		readAt: datetime('read_at')
	},
	(t) => [
		index('messages_reader_idx').on(t.readerId, t.id),
		index('messages_unread_idx').on(t.direction, t.readAt),
		index('messages_created_idx').on(t.createdAt)
	]
);

export type UserRow = typeof users.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type ReadingEventRow = typeof readingEvents.$inferSelect;
