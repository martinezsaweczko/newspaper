import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../db/test-db.ts';
import { users } from '../db/schema.ts';
import { findUserById, parseAdminEmails, signInGoogleUser } from './accounts.ts';
import { startFakeOidc, type FakeOidc } from './fake-oidc.ts';
import { beginSignIn, finishSignIn, FLOW_TTL_SECONDS, identityFromClaims } from './google.ts';
import {
	acceptedIssuers,
	createOidcClient,
	OidcError,
	pkceChallenge,
	type OidcClient
} from './oidc.ts';

const SECRET = 'test-secret-that-is-long-enough-123456';
const CLIENT_ID = 'newspaper-test.apps.example';
const CLIENT_SECRET = 'fake-client-secret';
const REDIRECT = 'http://app.test/auth/google/callback';

let provider: FakeOidc;
let client: OidcClient;

beforeAll(async () => {
	provider = await startFakeOidc({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
	client = createOidcClient({
		issuer: provider.issuer,
		clientId: CLIENT_ID,
		clientSecret: CLIENT_SECRET,
		redirectUri: REDIRECT
	});
});
afterAll(() => provider.close());
beforeEach(() => {
	provider.setOverrides({});
	provider.setIdentity({ sub: 'sub-ana', email: 'Ana@Example.com', name: 'Ana Pérez' });
});

/** Browser stand-in: start, follow the provider's consent redirect, return to the callback. */
async function roundTrip(
	next: string | null = '/paper/el-diario',
	tamper: (params: URLSearchParams) => void = () => {}
) {
	const { url, cookie } = await beginSignIn(client, SECRET, next);
	const res = await fetch(url, { redirect: 'manual' });
	expect(res.status).toBe(302);
	const back = new URL(res.headers.get('location')!);
	expect(back.origin + back.pathname).toBe(REDIRECT);
	tamper(back.searchParams);
	return { params: back.searchParams, cookie };
}

const reasonOf = async (promise: Promise<unknown>) => {
	try {
		await promise;
		return 'ok';
	} catch (err) {
		return err instanceof OidcError ? err.reason : `unexpected: ${(err as Error).message}`;
	}
};

describe('Google OIDC flow against a fake provider', () => {
	it('sends PKCE S256, state and nonce to the provider', async () => {
		const { url } = await beginSignIn(client, SECRET, '/');
		const q = new URL(url).searchParams;
		expect(q.get('client_id')).toBe(CLIENT_ID);
		expect(q.get('redirect_uri')).toBe(REDIRECT);
		expect(q.get('code_challenge_method')).toBe('S256');
		expect(q.get('code_challenge')).toMatch(/^[\w-]{43}$/);
		expect(q.get('state')).toMatch(/^[\w-]{43}$/);
		expect(q.get('nonce')).toMatch(/^[\w-]{43}$/);
		expect(q.get('scope')).toBe('openid email profile');
		expect(pkceChallenge('abc')).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
	});

	it('completes: verified identity (lowercased email) and the sanitised next', async () => {
		const { params, cookie } = await roundTrip('/paper/el-diario?date=2026-11-17');
		const { identity, next } = await finishSignIn(client, SECRET, params, cookie);
		expect(identity).toEqual({
			sub: 'sub-ana',
			email: 'ana@example.com',
			name: 'Ana Pérez',
			picture: null
		});
		expect(next).toBe('/paper/el-diario?date=2026-11-17');
	});

	it('never carries an off-site next through the round trip', async () => {
		const { params, cookie } = await roundTrip('//evil.example/x');
		expect((await finishSignIn(client, SECRET, params, cookie)).next).toBe('/');
	});

	it('rejects a tampered state, a missing or forged cookie and an expired flow', async () => {
		const tampered = await roundTrip('/', (p) =>
			p.set('state', p.get('state')!.slice(0, -1) + 'A')
		);
		expect(await reasonOf(finishSignIn(client, SECRET, tampered.params, tampered.cookie))).toBe(
			'state'
		);
		const noCookie = await roundTrip();
		expect(await reasonOf(finishSignIn(client, SECRET, noCookie.params, undefined))).toBe('state');
		const forged = await roundTrip();
		expect(
			await reasonOf(
				finishSignIn(client, 'another-secret-xxxxxxxxxxxxxxxxxxxx', forged.params, forged.cookie)
			)
		).toBe('state');
		const late = await roundTrip();
		const later = Date.now() + (FLOW_TTL_SECONDS + 1) * 1000;
		expect(await reasonOf(finishSignIn(client, SECRET, late.params, late.cookie, later))).toBe(
			'state'
		);
	});

	it('reports a provider error (user cancelled) after checking state', async () => {
		const { params, cookie } = await roundTrip('/', (p) => {
			p.delete('code');
			p.set('error', 'access_denied');
		});
		expect(await reasonOf(finishSignIn(client, SECRET, params, cookie))).toBe('denied');
	});

	it('rejects a reused code and a code paired with another flow (PKCE)', async () => {
		const first = await roundTrip();
		await finishSignIn(client, SECRET, first.params, first.cookie);
		expect(await reasonOf(finishSignIn(client, SECRET, first.params, first.cookie))).toBe('token');
		// a code from one flow cannot be redeemed with another flow's cookie: state differs, and
		// with a forged matching state the verifier would not match the challenge
		const a = await roundTrip();
		const b = await roundTrip();
		b.params.set('code', a.params.get('code')!);
		expect(await reasonOf(finishSignIn(client, SECRET, b.params, b.cookie))).toBe('token');
	});

	it('rejects a wrong nonce', async () => {
		provider.setOverrides({ nonce: 'not-the-nonce' });
		const { params, cookie } = await roundTrip();
		expect(await reasonOf(finishSignIn(client, SECRET, params, cookie))).toBe('nonce');
	});

	it('rejects a wrong audience, a wrong issuer and a foreign signature', async () => {
		for (const bad of [
			{ aud: 'someone-else' },
			{ iss: 'https://evil.example' },
			{ foreignKey: true }
		]) {
			provider.setOverrides(bad);
			const { params, cookie } = await roundTrip();
			expect(
				await reasonOf(finishSignIn(client, SECRET, params, cookie)),
				JSON.stringify(bad)
			).toBe('id_token');
		}
	});

	it('rejects an expired ID token', async () => {
		provider.setOverrides({ expiresIn: -3600 });
		const { params, cookie } = await roundTrip();
		expect(await reasonOf(finishSignIn(client, SECRET, params, cookie))).toBe('id_token');
	});

	it('requires email_verified', async () => {
		provider.setOverrides({ email_verified: false });
		const { params, cookie } = await roundTrip();
		expect(await reasonOf(finishSignIn(client, SECRET, params, cookie))).toBe('unverified');
	});

	it('accepts both of Google’s iss spellings and only exact ones elsewhere', () => {
		expect(acceptedIssuers('https://accounts.google.com')).toEqual([
			'https://accounts.google.com',
			'accounts.google.com'
		]);
		expect(acceptedIssuers('http://127.0.0.1:1')).toEqual(['http://127.0.0.1:1']);
	});

	it('keeps only https pictures and falls back to the email for a missing name', () => {
		const id = identityFromClaims({
			sub: 's',
			email: ' Bo@X.org ',
			picture: 'javascript:alert(1)'
		});
		expect(id).toEqual({ sub: 's', email: 'bo@x.org', name: 'bo@x.org', picture: null });
	});

	it('fails with a config error when the issuer is unreachable', async () => {
		const offline = createOidcClient({
			issuer: 'http://127.0.0.1:9',
			clientId: CLIENT_ID,
			clientSecret: CLIENT_SECRET,
			redirectUri: REDIRECT,
			timeoutMs: 2000
		});
		expect(await reasonOf(beginSignIn(offline, SECRET, '/'))).toBe('config');
	});
});

describe('ADMIN_EMAILS', () => {
	it('parses a comma-separated, case-insensitive list', () => {
		expect([...parseAdminEmails(' Ana@Example.com, bo@x.org;;nope ')]).toEqual([
			'ana@example.com',
			'bo@x.org'
		]);
		expect(parseAdminEmails(undefined).size).toBe(0);
	});
});

describe('registering Google accounts (needs local MySQL)', () => {
	let t: TestDb | null = null;
	beforeAll(async () => {
		t = await createTestDb();
	}, 60_000);
	afterAll(async () => {
		await t?.drop();
	});

	const admins = parseAdminEmails('Boss@Example.com');
	const at = new Date('2026-11-19T10:00:00Z');

	it('creates a new account as pending user, then refreshes it on the next sign-in', async (ctx) => {
		if (!t) return ctx.skip();
		const { params, cookie } = await roundTrip();
		const { identity } = await finishSignIn(client, SECRET, params, cookie);
		const row = await signInGoogleUser(t.db, identity, admins, at);
		expect(row).toMatchObject({
			email: 'ana@example.com',
			googleSub: 'sub-ana',
			status: 'pending',
			role: 'user',
			sessionVersion: 1,
			approvedAt: null,
			approvedBy: null
		});
		expect(row.createdAt.toISOString()).toBe(at.toISOString());

		const later = new Date('2026-11-20T08:30:00Z');
		const again = await signInGoogleUser(t.db, { ...identity, name: 'Ana P.' }, admins, later);
		expect(again.id).toBe(row.id);
		expect(again.name).toBe('Ana P.');
		expect(again.lastLoginAt?.toISOString()).toBe(later.toISOString());
		expect(again.createdAt.toISOString()).toBe(at.toISOString());
	});

	it('makes an ADMIN_EMAILS address an approved admin, case-insensitively', async (ctx) => {
		if (!t) return ctx.skip();
		provider.setIdentity({ sub: 'sub-boss', email: 'BOSS@example.com', name: 'Jefa' });
		const { params, cookie } = await roundTrip();
		const { identity } = await finishSignIn(client, SECRET, params, cookie);
		const row = await signInGoogleUser(t.db, identity, admins, at);
		expect(row).toMatchObject({ status: 'approved', role: 'admin', approvedBy: null });
		expect(row.approvedAt?.toISOString()).toBe(at.toISOString());
	});

	it('links a row an admin created by email, and refuses an email owned by another sub', async (ctx) => {
		if (!t) return ctx.skip();
		const [{ id }] = await t.db
			.insert(users)
			.values({ email: 'carla@example.com', status: 'approved', createdAt: at, approvedAt: at })
			.$returningId();
		const linked = await signInGoogleUser(
			t.db,
			{ sub: 'sub-carla', email: 'carla@example.com', name: 'Carla', picture: null },
			admins,
			at
		);
		expect(linked).toMatchObject({ id, googleSub: 'sub-carla', status: 'approved', name: 'Carla' });

		const err = await signInGoogleUser(
			t.db,
			{ sub: 'sub-impostor', email: 'carla@example.com', name: 'X', picture: null },
			admins,
			at
		).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(OidcError);
		expect((err as OidcError).reason).toBe('conflict');
		expect((await findUserById(t.db, id))?.googleSub).toBe('sub-carla');
	});
});
