import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CurrentUser } from '../../types.ts';
import { localAdmin } from '../auth/current.ts';
import { messages, users } from '../db/schema.ts';
import { createTestDb, type TestDb } from '../db/test-db.ts';
import {
	chatReaders,
	cleanBody,
	conversations,
	FORMER_ADMIN,
	markRead,
	purgeMessages,
	retentionCutoff,
	sendMessage,
	thread,
	unreadForAdmins,
	unreadForReader
} from './messages.ts';

describe('cleanBody', () => {
	it('trims, normalises line breaks and folds long runs of empty lines', () => {
		expect(cleanBody('  hola\r\nqué tal  ')).toBe('hola\nqué tal');
		expect(cleanBody('a\n\n\n\n\n\nb')).toBe('a\n\n\nb');
	});

	it('refuses empty, non-text, too long and malformed text', () => {
		expect(cleanBody('   \n ')).toBeNull();
		expect(cleanBody(42)).toBeNull();
		expect(cleanBody('x'.repeat(2001))).toBeNull();
		expect(cleanBody('😀'.repeat(2000))).toBe('😀'.repeat(2000)); // characters, not UTF-16 units
		expect(cleanBody('a\uD800b')).toBeNull();
	});
});

describe('retentionCutoff', () => {
	it('goes back six calendar months', () => {
		expect(retentionCutoff(new Date('2026-11-27T10:00:00Z')).toISOString()).toBe(
			'2026-05-27T10:00:00.000Z'
		);
	});
});

let t: TestDb | null = null;
beforeAll(async () => {
	t = await createTestDb();
}, 60_000);
afterAll(async () => {
	await t?.drop();
});

const eqId = (id: number) => eq(users.id, id);
const t0 = new Date('2026-11-27T09:00:00Z');
const plus = (min: number) => new Date(t0.getTime() + min * 60_000);

describe('chat messages (needs local MySQL)', () => {
	let ana: CurrentUser & { id: number };
	let bea: CurrentUser & { id: number };
	let marta: CurrentUser & { id: number };
	const root = localAdmin('root');

	beforeEach(async (ctx) => {
		if (!t) return ctx.skip();
		await t.db.delete(messages);
		await t.db.delete(users);
		const make = async (email: string, name: string, role: 'user' | 'admin' = 'user') => {
			const [{ id }] = await t!.db
				.insert(users)
				.values({ email, name, role, status: 'approved', createdAt: t0 })
				.$returningId();
			return { id, kind: 'google', email, name, role, status: 'approved' } as CurrentUser & {
				id: number;
			};
		};
		ana = await make('ana@example.com', 'Ana');
		bea = await make('bea@example.com', '');
		marta = await make('marta@example.com', 'Marta', 'admin');
	});

	it('stores a conversation in both directions with its authors', async () => {
		const asked = await sendMessage(t!.db, ana, '¿Llega hoy El País?', null, t0);
		expect(asked).toMatchObject({
			ok: true,
			message: { readerId: ana.id, direction: 'in', sender: 'Ana', read: false }
		});
		await sendMessage(t!.db, marta, 'Sí, a las 8.', ana.id, plus(1));
		await sendMessage(t!.db, root, 'Ya está subido.', ana.id, plus(2));
		const all = await thread(t!.db, ana.id);
		expect(all.map((m) => [m.direction, m.sender, m.body])).toEqual([
			['in', 'Ana', '¿Llega hoy El País?'],
			['out', 'Marta', 'Sí, a las 8.'],
			['out', 'root', 'Ya está subido.']
		]);
		expect(await thread(t!.db, bea.id)).toEqual([]);
	});

	it('refuses what a person cannot send', async () => {
		expect(await sendMessage(t!.db, ana, '  ')).toEqual({ ok: false, error: 'empty' });
		expect(await sendMessage(t!.db, marta, 'hola')).toEqual({ ok: false, error: 'no-reader' });
		// an admin cannot be the reader side of a conversation
		expect(await sendMessage(t!.db, root, 'hola', marta.id)).toEqual({
			ok: false,
			error: 'no-reader'
		});
		const pending = { ...ana, status: 'pending' } as CurrentUser;
		expect(await sendMessage(t!.db, pending, 'hola')).toEqual({ ok: false, error: 'not-allowed' });
		expect(await sendMessage(t!.db, { ...root, status: 'blocked' }, 'x', ana.id)).toEqual({
			ok: false,
			error: 'not-allowed'
		});
	});

	it('counts unread on each side and marks them read', async () => {
		await sendMessage(t!.db, ana, 'uno', null, t0);
		await sendMessage(t!.db, ana, 'dos', null, plus(1));
		await sendMessage(t!.db, bea, 'hola', null, plus(2));
		await sendMessage(t!.db, marta, 'respuesta', ana.id, plus(3));
		expect(await unreadForAdmins(t!.db)).toBe(3);
		expect(await unreadForReader(t!.db, ana.id)).toBe(1);

		expect(await markRead(t!.db, ana.id, 'in', plus(4))).toBe(2);
		expect(await markRead(t!.db, ana.id, 'in', plus(5))).toBe(0);
		expect(await unreadForAdmins(t!.db)).toBe(1);
		expect(await unreadForReader(t!.db, ana.id)).toBe(1); // the reader's side is separate
		await markRead(t!.db, ana.id, 'out', plus(6));
		expect(await unreadForReader(t!.db, ana.id)).toBe(0);
		expect((await thread(t!.db, ana.id)).every((m) => m.read)).toBe(true);
	});

	it('lists conversations, newest first, with the last message and unread count', async () => {
		await sendMessage(t!.db, ana, 'hola', null, t0);
		await sendMessage(t!.db, bea, 'buenas', null, plus(1));
		await sendMessage(t!.db, marta, 'dime', ana.id, plus(2));
		const list = await conversations(t!.db);
		expect(list.map((c) => [c.name, c.last.body, c.last.direction, c.unread])).toEqual([
			['Ana', 'dime', 'out', 1],
			['bea@example.com', 'buenas', 'in', 1]
		]);
	});

	it('lists only approved readers to write to', async () => {
		expect((await chatReaders(t!.db)).map((r) => r.name)).toEqual(['bea@example.com', 'Ana']);
	});

	it('keeps an admin message after its author is deleted, and drops a deleted reader', async () => {
		await sendMessage(t!.db, marta, 'hola', ana.id, t0);
		await sendMessage(t!.db, bea, 'hola', null, t0);
		await t!.db.delete(users).where(eqId(marta.id));
		expect((await thread(t!.db, ana.id))[0].sender).toBe(FORMER_ADMIN);
		await t!.db.delete(users).where(eqId(bea.id));
		expect(await thread(t!.db, bea.id)).toEqual([]);
	});

	it('purges messages older than the cutoff', async () => {
		await sendMessage(t!.db, ana, 'viejo', null, new Date('2026-05-01T00:00:00Z'));
		await sendMessage(t!.db, ana, 'nuevo', null, t0);
		expect(await purgeMessages(t!.db, retentionCutoff(t0))).toBe(1);
		expect((await thread(t!.db, ana.id)).map((m) => m.body)).toEqual(['nuevo']);
	});
});
