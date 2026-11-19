import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CurrentUser } from '../../types.ts';
import { localAdmin } from '../auth/current.ts';
import { findUserById } from '../auth/accounts.ts';
import { createTestDb, type TestDb } from '../db/test-db.ts';
import { readingEvents, users, type UserRole, type UserStatus } from '../db/schema.ts';
import { decideAccess, resolveUser } from '../auth/current.ts';
import { signGoogleSession } from '../auth/session.ts';
import { applyAdminAction, deleteUser, groupByStatus, listUsers } from './users.ts';

let t: TestDb | null = null;
beforeAll(async () => {
	t = await createTestDb();
}, 60_000);
afterAll(async () => {
	await t?.drop();
});

const at = new Date('2026-11-19T10:00:00Z');
let seq = 0;

async function make(status: UserStatus, role: UserRole = 'user') {
	seq += 1;
	const [{ id }] = await t!.db
		.insert(users)
		.values({
			email: `u${seq}@example.com`,
			googleSub: `sub-${seq}`,
			name: `User ${seq}`,
			status,
			role,
			createdAt: new Date(at.getTime() + seq * 1000),
			approvedAt: status === 'approved' ? at : null
		})
		.$returningId();
	return id;
}

const asActor = (id: number): CurrentUser => ({
	id,
	kind: 'google',
	email: null,
	name: 'Admin',
	role: 'admin',
	status: 'approved'
});
const get = async (id: number) => (await findUserById(t!.db, id))!;

describe('admin user actions (needs local MySQL)', () => {
	let admin = 0;
	beforeEach(async (ctx) => {
		if (!t) return ctx.skip();
		await t.db.delete(readingEvents);
		await t.db.update(users).set({ approvedBy: null });
		await t.db.delete(users);
		admin = await make('approved', 'admin');
	});

	it('approves a pending user and records who and when', async () => {
		const id = await make('pending');
		expect(await applyAdminAction(t!.db, asActor(admin), 'approve', id, at)).toEqual({ ok: true });
		expect(await get(id)).toMatchObject({
			status: 'approved',
			approvedBy: admin,
			sessionVersion: 1
		});
		expect((await get(id)).approvedAt?.toISOString()).toBe(at.toISOString());
		// a local admin approves too, without an approved_by row
		const other = await make('pending');
		expect(await applyAdminAction(t!.db, localAdmin('root'), 'approve', other, at)).toEqual({
			ok: true
		});
		expect(await get(other)).toMatchObject({ status: 'approved', approvedBy: null });
		// approving twice is a stale action
		expect(await applyAdminAction(t!.db, asActor(admin), 'approve', id)).toEqual({
			ok: false,
			error: 'invalid-state'
		});
	});

	it('blocking bumps session_version; unblocking restores reading without a bump', async () => {
		const id = await make('approved');
		expect(await applyAdminAction(t!.db, asActor(admin), 'block', id)).toEqual({ ok: true });
		expect(await get(id)).toMatchObject({ status: 'blocked', sessionVersion: 2 });
		expect(await applyAdminAction(t!.db, asActor(admin), 'unblock', id)).toEqual({ ok: true });
		expect(await get(id)).toMatchObject({ status: 'approved', sessionVersion: 2 });
		// a pending request can be blocked; unblocking it approves it
		const pending = await make('pending');
		await applyAdminAction(t!.db, asActor(admin), 'block', pending);
		await applyAdminAction(t!.db, asActor(admin), 'unblock', pending, at);
		expect(await get(pending)).toMatchObject({ status: 'approved', approvedBy: admin });
	});

	it('role changes bump session_version', async () => {
		const id = await make('approved');
		expect(await applyAdminAction(t!.db, asActor(admin), 'promote', id)).toEqual({ ok: true });
		expect(await get(id)).toMatchObject({ role: 'admin', sessionVersion: 2 });
		expect(await applyAdminAction(t!.db, asActor(admin), 'demote', id)).toEqual({ ok: true });
		expect(await get(id)).toMatchObject({ role: 'user', sessionVersion: 3 });
		// only approved accounts can be promoted
		const pending = await make('pending');
		expect(await applyAdminAction(t!.db, asActor(admin), 'promote', pending)).toEqual({
			ok: false,
			error: 'invalid-state'
		});
	});

	it('an admin cannot block or demote themselves', async () => {
		await make('approved', 'admin'); // not the last admin, so only the self rule applies
		for (const action of ['block', 'demote'] as const) {
			expect(await applyAdminAction(t!.db, asActor(admin), action, admin)).toEqual({
				ok: false,
				error: 'self'
			});
		}
		expect(await get(admin)).toMatchObject({
			status: 'approved',
			role: 'admin',
			sessionVersion: 1
		});
	});

	it('the last admin cannot be demoted or blocked, even by a local admin', async () => {
		for (const action of ['block', 'demote'] as const) {
			expect(await applyAdminAction(t!.db, localAdmin('root'), action, admin)).toEqual({
				ok: false,
				error: 'last-admin'
			});
		}
		const second = await make('approved', 'admin');
		expect(await applyAdminAction(t!.db, localAdmin('root'), 'demote', admin)).toEqual({
			ok: true
		});
		expect(await applyAdminAction(t!.db, asActor(second), 'demote', second)).toEqual({
			ok: false,
			error: 'self'
		});
	});

	it('refuses unknown ids and non-admin actors', async () => {
		expect(await applyAdminAction(t!.db, asActor(admin), 'approve', 999_999)).toEqual({
			ok: false,
			error: 'not-found'
		});
		const id = await make('pending');
		const reader: CurrentUser = { ...asActor(id), role: 'user' };
		expect(await applyAdminAction(t!.db, reader, 'approve', id)).toEqual({
			ok: false,
			error: 'invalid-state'
		});
	});

	it('lists accounts oldest first and groups them by status', async () => {
		const p = await make('pending');
		const b = await make('blocked');
		const groups = groupByStatus(await listUsers(t!.db));
		expect(groups.pending.map((r) => r.id)).toEqual([p]);
		expect(groups.blocked.map((r) => r.id)).toEqual([b]);
		expect(groups.approved.map((r) => r.id)).toEqual([admin]);
		const [row] = await t!.db.select().from(users).where(eq(users.id, p));
		expect(row.status).toBe('pending');
	});
});

describe('deleting an account (needs local MySQL)', () => {
	let admin = 0;
	beforeEach(async (ctx) => {
		if (!t) return ctx.skip();
		await t.db.delete(readingEvents);
		await t.db.update(users).set({ approvedBy: null });
		await t.db.delete(users);
		admin = await make('approved', 'admin');
	});

	const read = (userId: number | null, localUsername: string | null = null) => ({
		userId,
		localUsername,
		editionPath: 'el-pais-2026-11-19.pdf',
		mastheadSlug: 'el-pais',
		region: 'Nacional',
		editionDate: '2026-11-19',
		kind: 'open' as const,
		createdAt: at
	});
	const eventsOf = async (id: number) =>
		(
			await t!.db
				.select({ n: sql<number>`count(*)` })
				.from(readingEvents)
				.where(eq(readingEvents.userId, id))
		)[0].n;

	it('removes the user and, through the cascade, their reading history only', async () => {
		const reader = await make('approved');
		const other = await make('approved');
		// the reader approved someone: approved_by is set null, not a blocker
		await t!.db.update(users).set({ approvedBy: reader }).where(eq(users.id, other));
		await t!.db
			.insert(readingEvents)
			.values([read(reader), read(reader), read(other), read(null, 'root')]);
		expect(await eventsOf(reader)).toBe(2);

		expect(await deleteUser(t!.db, asActor(admin), reader)).toEqual({ ok: true });
		expect(await findUserById(t!.db, reader)).toBeNull();
		expect(await eventsOf(reader)).toBe(0);
		expect(await eventsOf(other)).toBe(1);
		expect(await t!.db.select().from(readingEvents)).toHaveLength(2);
		expect(await get(other)).toMatchObject({ approvedBy: null });
		// gone means gone: a second delete is a stale action
		expect(await deleteUser(t!.db, asActor(admin), reader)).toEqual({
			ok: false,
			error: 'not-found'
		});
	});

	it('deletes pending and blocked accounts too', async () => {
		const pending = await make('pending');
		const blocked = await make('blocked');
		expect(await deleteUser(t!.db, asActor(admin), pending)).toEqual({ ok: true });
		expect(await deleteUser(t!.db, localAdmin('root'), blocked)).toEqual({ ok: true });
		expect(await findUserById(t!.db, pending)).toBeNull();
		expect(await findUserById(t!.db, blocked)).toBeNull();
	});

	it('refuses to delete yourself', async () => {
		await make('approved', 'admin'); // not the last admin: the refusal is about "self"
		expect(await deleteUser(t!.db, asActor(admin), admin)).toEqual({ ok: false, error: 'self' });
		expect(await findUserById(t!.db, admin)).not.toBeNull();
	});

	it('refuses to delete the last approved admin, even for a local admin', async () => {
		expect(await deleteUser(t!.db, localAdmin('root'), admin)).toEqual({
			ok: false,
			error: 'last-admin'
		});
		expect(await findUserById(t!.db, admin)).not.toBeNull();
		// with a second approved admin it goes through
		const second = await make('approved', 'admin');
		expect(await deleteUser(t!.db, asActor(second), admin)).toEqual({ ok: true });
	});

	it('refuses non-admin actors and unknown ids', async () => {
		const reader = await make('approved');
		const asReader: CurrentUser = { ...asActor(reader), role: 'user' };
		expect(await deleteUser(t!.db, asReader, admin)).toEqual({
			ok: false,
			error: 'invalid-state'
		});
		expect(await deleteUser(t!.db, asActor(admin), 999_999)).toEqual({
			ok: false,
			error: 'not-found'
		});
	});

	it('signs the deleted user out: their session cookie now lands on /login', async () => {
		const reader = await make('approved');
		const secret = 'test-secret-that-is-long-enough-123456';
		const token = signGoogleSession(reader, secret, Date.now(), 3600, 1);
		const deps = {
			secret,
			localUsers: { version: () => null },
			loadUser: (id: number) => findUserById(t!.db, id)
		};
		const before = await resolveUser(token, deps);
		expect(before).toMatchObject({ id: reader, status: 'approved' });
		expect(decideAccess(before, 'GET', '/')).toEqual({ kind: 'pass' });

		expect(await deleteUser(t!.db, asActor(admin), reader)).toEqual({ ok: true });
		const after = await resolveUser(token, deps);
		expect(after).toBeNull();
		expect(decideAccess(after, 'GET', '/')).toEqual({ kind: 'redirect', location: '/login' });
		expect(decideAccess(after, 'GET', '/pdf/abc')).toEqual({
			kind: 'redirect',
			location: '/login?next=%2Fpdf%2Fabc'
		});
	});
});
