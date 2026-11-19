/**
 * The admin side of Google accounts: list them by status, approve, block, unblock, promote,
 * demote. Pure over a Drizzle handle; the route only parses forms and invalidates the user cache.
 * Blocking and role changes bump `session_version`, which ends the account's sessions at once.
 * Deleting removes the row; its reading history goes with it (ON DELETE CASCADE).
 */
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { CurrentUser } from '../../types.ts';
import type { Db } from '../db/index.ts';
import { users, type UserRole, type UserRow, type UserStatus } from '../db/schema.ts';

export type AdminError = 'not-found' | 'self' | 'last-admin' | 'invalid-state';
export type AdminResult = { ok: true } | { ok: false; error: AdminError };
export type AdminAction = 'approve' | 'block' | 'unblock' | 'promote' | 'demote';

const OK: AdminResult = { ok: true };
const fail = (error: AdminError): AdminResult => ({ ok: false, error });

/** The admin's own row (a local admin has none). */
const isSelf = (actor: CurrentUser, id: number) => actor.kind === 'google' && actor.id === id;
/** approved_by: the acting Google admin; null for a local admin. */
const actorId = (actor: CurrentUser) => (actor.kind === 'google' ? actor.id : null);

export async function listUsers(db: Db): Promise<UserRow[]> {
	return db.select().from(users).orderBy(asc(users.createdAt), asc(users.id));
}

export function groupByStatus(rows: UserRow[]): Record<UserStatus, UserRow[]> {
	const groups: Record<UserStatus, UserRow[]> = { pending: [], approved: [], blocked: [] };
	for (const row of rows) groups[row.status].push(row);
	return groups;
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

async function lockRow(tx: Tx, id: number): Promise<UserRow | null> {
	const [row] = await tx.select().from(users).where(eq(users.id, id)).for('update');
	return row ?? null;
}

/** Would removing `id` from the approved admins leave none? */
async function isLastAdmin(tx: Tx, row: UserRow): Promise<boolean> {
	if (row.role !== 'admin' || row.status !== 'approved') return false;
	const others = await tx
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.role, 'admin'), eq(users.status, 'approved'), ne(users.id, row.id)))
		.for('update');
	return others.length === 0;
}

const bump = sql`${users.sessionVersion} + 1`;

export async function applyAdminAction(
	db: Db,
	actor: CurrentUser,
	action: AdminAction,
	id: number,
	now = new Date()
): Promise<AdminResult> {
	if (actor.role !== 'admin' || actor.status !== 'approved') return fail('invalid-state');
	return db.transaction(async (tx) => {
		const row = await lockRow(tx, id);
		if (!row) return fail('not-found');
		const set = (changes: Partial<typeof users.$inferInsert> | Record<string, unknown>) =>
			tx.update(users).set(changes).where(eq(users.id, id));

		switch (action) {
			case 'approve':
				if (row.status !== 'pending') return fail('invalid-state');
				await set({ status: 'approved', approvedAt: now, approvedBy: actorId(actor) });
				return OK;
			case 'unblock':
				if (row.status !== 'blocked') return fail('invalid-state');
				await set({
					status: 'approved',
					approvedAt: row.approvedAt ?? now,
					approvedBy: row.approvedAt ? row.approvedBy : actorId(actor)
				});
				return OK;
			case 'block':
				if (row.status === 'blocked') return fail('invalid-state');
				if (isSelf(actor, id)) return fail('self');
				if (await isLastAdmin(tx, row)) return fail('last-admin');
				await set({ status: 'blocked', sessionVersion: bump });
				return OK;
			case 'promote':
			case 'demote': {
				const role: UserRole = action === 'promote' ? 'admin' : 'user';
				if (row.role === role || row.status !== 'approved') return fail('invalid-state');
				if (role === 'user' && isSelf(actor, id)) return fail('self');
				if (role === 'user' && (await isLastAdmin(tx, row))) return fail('last-admin');
				await set({ role, sessionVersion: bump });
				return OK;
			}
		}
	});
}

/**
 * Deletes a Google account and, through `reading_events.user_id ON DELETE CASCADE`, its whole
 * reading history (`approved_by` pointing at it is set null). Its sessions end on the next
 * request: the hook no longer finds the user (the route invalidates the cache entry). Nobody
 * deletes themselves, and the last approved admin stays. Rendered front pages are not personal
 * data and are left alone.
 */
export async function deleteUser(db: Db, actor: CurrentUser, id: number): Promise<AdminResult> {
	if (actor.role !== 'admin' || actor.status !== 'approved') return fail('invalid-state');
	return db.transaction(async (tx) => {
		const row = await lockRow(tx, id);
		if (!row) return fail('not-found');
		if (isSelf(actor, id)) return fail('self');
		if (await isLastAdmin(tx, row)) return fail('last-admin');
		await tx.delete(users).where(eq(users.id, id));
		return OK;
	});
}

export const ADMIN_ACTIONS: readonly AdminAction[] = [
	'approve',
	'block',
	'unblock',
	'promote',
	'demote'
];
