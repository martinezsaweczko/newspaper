import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { sanitizeNext } from './next.ts';
import { isCrossSiteForm } from './origin.ts';
import { signSession, verifySession } from './session.ts';
import { createThrottle, throttleMessage } from './throttle.ts';
import {
	addUser,
	authenticate,
	createUserDirectory,
	hashPassword,
	normaliseUsername,
	readUsers,
	removeUser,
	verifyPassword
} from './users.ts';

describe('password hashing', () => {
	it('verifies the right password and rejects others', async () => {
		const hash = await hashPassword('correct horse');
		expect(hash).toMatch(/^scrypt\$16384\$8\$1\$/);
		expect(await verifyPassword('correct horse', hash)).toBe(true);
		expect(await verifyPassword('correct horsf', hash)).toBe(false);
		expect(await hashPassword('correct horse')).not.toBe(hash); // salted
	});

	it('rejects malformed hashes', async () => {
		expect(await verifyPassword('x', 'plain')).toBe(false);
		expect(await verifyPassword('x', 'scrypt$1$1$1$aa$bb')).toBe(false);
		expect(await verifyPassword('x', 'scrypt$99999999$8$1$aa$bb')).toBe(false);
	});
});

describe('users file', () => {
	const dir = mkdtempSync(path.join(tmpdir(), 'np-users-'));
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	it('adds, authenticates, updates and removes users', async () => {
		expect(await addUser(dir, 'Ana', 'secret-pass')).toBe('created');
		expect(Object.keys(readUsers(dir).users)).toEqual(['ana']);
		expect(await authenticate(dir, 'ANA', 'secret-pass')).toBe('ana');
		expect(await authenticate(dir, 'ana', 'wrong-pass')).toBeNull();
		expect(await authenticate(dir, 'nobody', 'secret-pass')).toBeNull();

		const users = createUserDirectory(dir);
		expect(users.has('ana')).toBe(true);

		expect(await addUser(dir, 'ana', 'another-pass')).toBe('updated');
		expect(await authenticate(dir, 'ana', 'secret-pass')).toBeNull();
		expect(await authenticate(dir, 'ana', 'another-pass')).toBe('ana');

		expect(removeUser(dir, 'ana')).toBe(true);
		expect(removeUser(dir, 'ana')).toBe(false);
		expect(await authenticate(dir, 'ana', 'another-pass')).toBeNull();
	});

	it('validates names and password length', async () => {
		await expect(addUser(dir, '../evil', 'long-enough')).rejects.toThrow();
		await expect(addUser(dir, 'bob', 'short')).rejects.toThrow();
		expect(normaliseUsername(' Bob.Smith ')).toBe('bob.smith');
		expect(normaliseUsername('')).toBeNull();
	});
});

describe('session tokens', () => {
	const secret = 'test-secret-that-is-long-enough-123456';
	const now = Date.UTC(2026, 10, 17, 9, 0, 0);

	it('signs and verifies', () => {
		const token = signSession('ana', secret, now);
		expect(verifySession(token, secret, now)).toEqual({ user: 'ana', exp: now / 1000 + 7 * 86400 });
	});

	it('rejects tampering, a wrong secret and garbage', () => {
		const token = signSession('ana', secret, now);
		const [payload, sig] = token.split('.');
		const forged = Buffer.from(JSON.stringify({ u: 'admin', exp: 9e9 })).toString('base64url');
		expect(verifySession(`${forged}.${sig}`, secret, now)).toBeNull();
		expect(verifySession(`${payload}.${sig.slice(0, -1)}A`, secret, now)).toBeNull();
		expect(verifySession(token, 'other-secret', now)).toBeNull();
		expect(verifySession(`${token}.x`, secret, now)).toBeNull();
		expect(verifySession('', secret, now)).toBeNull();
		expect(verifySession(undefined, secret, now)).toBeNull();
	});

	it('expires', () => {
		const token = signSession('ana', secret, now, 60);
		expect(verifySession(token, secret, now + 59_000)).not.toBeNull();
		expect(verifySession(token, secret, now + 60_000)).toBeNull();
	});
});

describe('sanitizeNext', () => {
	it.each([
		['/paper/el-correo?x=1#top', '/paper/el-correo?x=1#top'],
		['/?date=2026-11-17&region=Galicia', '/?date=2026-11-17&region=Galicia'],
		[null, '/'],
		['', '/'],
		['https://evil.example/', '/'],
		['//evil.example/', '/'],
		['/\\evil.example', '/'],
		['\\\\evil.example', '/'],
		['javascript:alert(1)', '/'],
		['/login?next=/x', '/'],
		['/%0d%0aSet-Cookie:x', '/%0d%0aSet-Cookie:x'],
		['/\nx', '/'],
		['paper', '/']
	])('%s -> %s', (raw, expected) => {
		expect(sanitizeNext(raw)).toBe(expected);
	});

	it.each([
		'/..//evil.com',
		'/./..//evil.com',
		'/%2e%2e//evil.com',
		'/%2E%2E//evil.com/x?y=1',
		'/..\\evil.com',
		'//evil.com',
		'https://evil.com',
		'/\\evil.com',
		'/%09/evil.com',
		'/%0a/evil.com',
		'/..%09//evil.com',
		'/../%2fevil.com',
		'/a/../..//evil.com'
	])('keeps %s on this site', (raw) => {
		const result = sanitizeNext(raw);
		expect(result.startsWith('/')).toBe(true);
		expect(result.startsWith('//')).toBe(false);
		expect(result.startsWith('/\\')).toBe(false);
		expect(new URL(result, 'http://local.invalid').origin).toBe('http://local.invalid');
	});
});

describe('login throttle', () => {
	it('locks after max failures and unlocks after the window', () => {
		const t = createThrottle({ max: 3, windowMs: 60_000 });
		for (let i = 0; i < 3; i++) t.fail('ip', 1000 + i);
		expect(t.retryAfter('ip', 2000)).toBe(59);
		expect(t.retryAfter('ip', 61_000 + 1000)).toBe(0);
		t.fail('other', 0);
		t.reset('other');
		expect(t.retryAfter('other', 1)).toBe(0);
	});

	it('words the wait in Spanish with singular and plural minutes', () => {
		expect(throttleMessage(1)).toBe('Demasiados intentos. Vuelve a intentarlo en 1 minuto.');
		expect(throttleMessage(60)).toBe('Demasiados intentos. Vuelve a intentarlo en 1 minuto.');
		expect(throttleMessage(61)).toBe('Demasiados intentos. Vuelve a intentarlo en 2 minutos.');
		expect(throttleMessage(300)).toBe('Demasiados intentos. Vuelve a intentarlo en 5 minutos.');
	});
});

describe('isCrossSiteForm', () => {
	const post = (headers: Record<string, string>) =>
		new Request('http://nas.lan:3000/login', { method: 'POST', headers });
	const form = { 'content-type': 'application/x-www-form-urlencoded', host: 'nas.lan:3000' };

	it('accepts same host over plain http and rejects other origins', () => {
		expect(isCrossSiteForm(post({ ...form, origin: 'http://nas.lan:3000' }))).toBe(false);
		expect(isCrossSiteForm(post({ ...form, origin: 'https://nas.lan:3000' }))).toBe(false);
		expect(isCrossSiteForm(post({ ...form, origin: 'http://evil.example' }))).toBe(true);
		expect(isCrossSiteForm(post(form))).toBe(true);
		expect(isCrossSiteForm(post({ 'content-type': 'application/json', host: 'x' }))).toBe(false);
		expect(isCrossSiteForm(new Request('http://nas.lan/'))).toBe(false);
	});
});
