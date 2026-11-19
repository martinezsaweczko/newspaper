import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CurrentUser } from '../../types.ts';
import { localAdmin } from '../auth/current.ts';
import { findUserById } from '../auth/accounts.ts';
import { createTestDb, type TestDb } from '../db/test-db.ts';
import { readingEvents, users, type UserRole, type UserStatus } from '../db/schema.ts';
import { applyAdminAction, groupByStatus, listUsers } from './users.ts';

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
