import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUser } from '../../types.ts';
import { localAdmin } from '../auth/current.ts';
import { messages, users } from '../db/schema.ts';
import { createTestDb, type TestDb } from '../db/test-db.ts';

// The service reads the app's DB handle and the process-wide hub: point both at test doubles.
const state = vi.hoisted(() => ({
	db: null as unknown,
	published: [] as { to: unknown; event: string; data: unknown }[],
	failPublish: false
}));
vi.mock('../auth/index.ts', () => ({ db: () => state.db }));
vi.mock('./index.ts', () => ({
	presence: {
		publish(to: unknown, event: string, data: unknown) {
			if (state.failPublish) throw new Error('hub down');
			state.published.push({ to, event, data });
		}
	}
}));

const { markConversationRead, send, unreadFor } = await import('./service.ts');

let t: TestDb | null = null;
beforeAll(async () => {
	t = await createTestDb();
	state.db = t?.db;
}, 60_000);
afterAll(async () => {
	await t?.drop();
});

const events = () => state.published.map((p) => [p.to, p.event, p.data]);

describe('chat service (needs local MySQL)', () => {
	type Reader = CurrentUser & { id: number };
	let ana: Reader;
	let n = 0;
	const admin = () => localAdmin(`admin${(n += 1)}`); // a fresh rate-limit key per test

	beforeEach(async (ctx) => {
		if (!t) return ctx.skip();
		state.published.length = 0;
		state.failPublish = false;
		await t.db.delete(messages);
		await t.db.delete(users);
		const email = `ana${(n += 1)}@example.com`; // also a fresh key for the reader
		const [{ id }] = await t.db
			.insert(users)
			.values({ email, name: 'Ana', role: 'user', status: 'approved', createdAt: new Date() })
			.$returningId();
		ana = { id, kind: 'google', email, name: 'Ana', role: 'user', status: 'approved' };
	});

	it('delivers a reader message live to the reader and every admin, then the admin count', async () => {
		const result = await send(ana, '¿Llega hoy?');
		expect(result).toMatchObject({ ok: true, message: { direction: 'in', body: '¿Llega hoy?' } });
		const message = result.ok ? result.message : null;
		expect(events()).toEqual([
			[{ key: String(ana.id) }, 'message', message],
			[{ admins: true }, 'message', message],
			[{ admins: true }, 'unread', { count: 1 }]
		]);
	});

	it('delivers an admin reply with the reader unread count', async () => {
		await send(admin(), 'Sí', ana.id);
		expect(events().map(([to, event]) => [to, event])).toEqual([
			[{ key: String(ana.id) }, 'message'],
			[{ admins: true }, 'message'],
			[{ key: String(ana.id) }, 'unread']
		]);
		expect(state.published[2].data).toEqual({ count: 1 });
		expect(await unreadFor(ana)).toBe(1);
	});

	it('publishes nothing for a refused message', async () => {
		expect(await send(ana, '   ')).toEqual({ ok: false, error: 'empty' });
		expect(await send(admin(), 'hola', 999_999)).toEqual({ ok: false, error: 'no-reader' });
		expect(state.published).toEqual([]);
	});

	it('rate-limits a person after 10 messages in a minute', async () => {
		for (let i = 0; i < 10; i++) expect((await send(ana, `m${i}`)).ok).toBe(true);
		expect(await send(ana, 'una más')).toEqual({ ok: false, error: 'rate' });
		expect(await unreadFor(admin())).toBe(10); // the refused one was never stored
	});

	it('keeps a stored message when live delivery fails', async () => {
		state.failPublish = true;
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			expect((await send(ana, 'hola')).ok).toBe(true);
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('[chat] could not deliver'));
		} finally {
			warn.mockRestore();
		}
		expect(await unreadFor(admin())).toBe(1);
	});

	it('marks a conversation read and tells both sides, only when something changed', async () => {
		await send(ana, 'hola');
		state.published.length = 0;
		await markConversationRead(admin(), ana.id);
		expect(events()).toEqual([
			[{ key: String(ana.id) }, 'read', { readerId: ana.id, direction: 'in' }],
			[{ admins: true }, 'read', { readerId: ana.id, direction: 'in' }],
			[{ admins: true }, 'unread', { count: 0 }]
		]);
		state.published.length = 0;
		await markConversationRead(admin(), ana.id); // nothing left to mark
		expect(state.published).toEqual([]);
	});

	it('lets a reader mark only their own conversation', async () => {
		await send(admin(), 'hola', ana.id);
		state.published.length = 0;
		await markConversationRead({ ...ana, id: ana.id + 1 }, ana.id);
		expect(state.published).toEqual([]);
		await markConversationRead(ana, ana.id);
		expect(events().at(-1)).toEqual([{ key: String(ana.id) }, 'unread', { count: 0 }]);
	});

	it('has no starting count for an account without a chat side', async () => {
		expect(await unreadFor({ ...ana, status: 'pending' })).toBeNull();
	});
});
