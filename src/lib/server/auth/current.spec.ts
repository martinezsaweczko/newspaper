import { describe, expect, it, vi } from 'vitest';
import type { CurrentUser } from '../../types.ts';
import type { UserRow } from '../db/schema.ts';
import { decideAccess, localAdmin, resolveUser, userLabel } from './current.ts';
import {
	signGoogleSession,
	signSession,
	signToken,
	verifyAnySession,
	verifySession
} from './session.ts';

const secret = 'test-secret-that-is-long-enough-123456';
const now = Date.UTC(2026, 10, 19, 9, 0, 0);

const row = (over: Partial<UserRow> = {}): UserRow => ({
	id: 7,
	email: 'ana@example.com',
	googleSub: 'sub-ana',
	name: 'Ana',
	pictureUrl: null,
	status: 'approved',
	role: 'user',
	sessionVersion: 2,
	createdAt: new Date(now),
	approvedAt: new Date(now),
	approvedBy: null,
	lastLoginAt: null,
	...over
});

describe('session payloads for both account kinds', () => {
	it('round-trips a Google session and keeps it apart from local ones', () => {
		const token = signGoogleSession(7, secret, now, 60, 2);
		expect(verifyAnySession(token, secret, now)).toEqual({
			kind: 'google',
			id: 7,
			exp: now / 1000 + 60,
			v: 2
		});
		// a Google token is never a local admin's
		expect(verifySession(token, secret, now)).toBeNull();
		expect(verifyAnySession(signSession('ana', secret, now), secret, now)?.kind).toBe('local');
		expect(verifyAnySession(token, secret, now + 60_000)).toBeNull();
	});

	it('rejects malformed Google payloads and flow tokens replayed as sessions', () => {
		const exp = now / 1000 + 60;
		for (const bad of [
			{ k: 'g', id: '7', exp, v: 1 },
			{ k: 'g', id: 0, exp, v: 1 },
			{ k: 'g', id: 7, exp, v: 0 },
			{ k: 'g', id: 7, exp },
			{ k: 'x', u: 'ana', exp, v: 1 }
		]) {
			expect(verifyAnySession(signToken(bad, secret), secret, now), JSON.stringify(bad)).toBeNull();
		}
		const flow = signToken({ u: 'ana', exp, v: 1 }, secret, 'oidc-flow');
		expect(verifyAnySession(flow, secret, now)).toBeNull();
	});
});

describe('resolveUser', () => {
	const localUsers = { version: (name: string) => (name === 'root' ? 3 : null) };

	it('resolves local admins by users.json version', async () => {
		const loadUser = vi.fn();
		const deps = { secret, localUsers, loadUser };
		expect(await resolveUser(signSession('root', secret, now, 60, 3), deps, now)).toEqual(
			localAdmin('root')
		);
		expect(await resolveUser(signSession('root', secret, now, 60, 2), deps, now)).toBeNull();
		expect(await resolveUser(signSession('gone', secret, now, 60, 1), deps, now)).toBeNull();
		expect(loadUser).not.toHaveBeenCalled();
	});

	it('resolves Google accounts by row and session_version', async () => {
		const deps = { secret, localUsers, loadUser: async (id: number) => (id === 7 ? row() : null) };
		expect(await resolveUser(signGoogleSession(7, secret, now, 60, 2), deps, now)).toEqual({
			id: 7,
			kind: 'google',
			email: 'ana@example.com',
			name: 'Ana',
			role: 'user',
			status: 'approved'
		});
		// bumped by a block or a role change
		expect(await resolveUser(signGoogleSession(7, secret, now, 60, 1), deps, now)).toBeNull();
		expect(await resolveUser(signGoogleSession(8, secret, now, 60, 1), deps, now)).toBeNull();
		expect(await resolveUser(undefined, deps, now)).toBeNull();
	});

	it('labels users for traces without their email', () => {
		expect(userLabel(localAdmin('root'))).toBe('local:root');
		expect(userLabel({ ...localAdmin('x'), kind: 'google', id: 7 })).toBe('7');
	});
});

describe('decideAccess', () => {
	const user = (over: Partial<CurrentUser> = {}): CurrentUser => ({
		id: 7,
		kind: 'google',
		email: 'ana@example.com',
		name: 'Ana',
		role: 'user',
		status: 'approved',
		...over
	});
	const go = (u: CurrentUser | null, path: string, method = 'GET', search = '') =>
		decideAccess(u, method, path, search);

	it('lets anyone reach the login and the Google round trip', () => {
		for (const path of ['/login', '/auth/google', '/auth/google/callback', '/_app/x.js']) {
			expect(go(null, path)).toEqual({ kind: 'pass' });
		}
	});

	it('sends the signed-out to /login with next, and refuses their posts', () => {
		expect(go(null, '/')).toEqual({ kind: 'redirect', location: '/login' });
		expect(go(null, '/paper/x', 'GET', '?date=2026-11-17')).toEqual({
			kind: 'redirect',
			location: '/login?next=%2Fpaper%2Fx%3Fdate%3D2026-11-17'
		});
		expect(go(null, '/logout', 'POST')).toMatchObject({ kind: 'deny', status: 401 });
	});

	it('keeps pending accounts on /pendiente and blocked ones on /bloqueado', () => {
		const pending = user({ status: 'pending' });
		const blocked = user({ status: 'blocked' });
		for (const path of ['/', '/paper/x', '/pdf/abc', '/thumb/abc', '/admin', '/bloqueado']) {
			expect(go(pending, path)).toEqual({ kind: 'redirect', location: '/pendiente' });
		}
		for (const path of ['/', '/pdf/abc', '/pendiente']) {
			expect(go(blocked, path)).toEqual({ kind: 'redirect', location: '/bloqueado' });
		}
		expect(go(pending, '/pendiente')).toEqual({ kind: 'pass' });
		expect(go(blocked, '/bloqueado')).toEqual({ kind: 'pass' });
		expect(go(pending, '/logout', 'POST')).toEqual({ kind: 'pass' });
		expect(go(pending, '/admin/usuarios', 'POST')).toMatchObject({ kind: 'deny', status: 403 });
	});

	it('lets approved readers read and only admins administer', () => {
		const reader = user();
		for (const path of ['/', '/paper/x', '/pdf/abc', '/thumb/abc']) {
			expect(go(reader, path)).toEqual({ kind: 'pass' });
		}
		expect(go(reader, '/pendiente')).toEqual({ kind: 'redirect', location: '/' });
		for (const path of ['/admin', '/admin/usuarios', '/%61dmin/usuarios', '/admin/']) {
			expect(go(reader, path), path).toMatchObject({ kind: 'deny', status: 403 });
		}
		expect(go(reader, '/administrar')).toEqual({ kind: 'pass' }); // not the /admin tree
		expect(go(user({ role: 'admin' }), '/admin/usuarios', 'POST')).toEqual({ kind: 'pass' });
		expect(go(localAdmin('root'), '/admin/usuarios')).toEqual({ kind: 'pass' });
	});
});
