/**
 * Users live in `DATA_DIR/users.json` with scrypt hashes. node:crypto only, no auth deps.
 * Every function takes the data dir so it is testable with a tmp dir and usable from the CLI.
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const KEY_LENGTH = 64;
const PARAMS = { N: 16384, r: 8, p: 1 };
export const MIN_PASSWORD_LENGTH = 8;

function scryptAsync(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
	return new Promise((resolve, reject) =>
		scrypt(
			password.normalize('NFKC'),
			salt,
			KEY_LENGTH,
			{ ...options, maxmem: 64 * 1024 * 1024 },
			(err, key) => (err ? reject(err) : resolve(key))
		)
	);
}

/** `scrypt$N$r$p$salt$hash` (salt and hash base64url). */
export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const key = await scryptAsync(password, salt, PARAMS);
	return [
		'scrypt',
		PARAMS.N,
		PARAMS.r,
		PARAMS.p,
		salt.toString('base64url'),
		key.toString('base64url')
	].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const parts = stored.split('$');
	if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
	const [N, r, p] = parts.slice(1, 4).map(Number);
	if (![N, r, p].every((v) => Number.isInteger(v) && v > 0) || N > 2 ** 20) return false;
	const salt = Buffer.from(parts[4], 'base64url');
	const expected = Buffer.from(parts[5], 'base64url');
	if (expected.length !== KEY_LENGTH) return false;
	const key = await scryptAsync(password, salt, { N, r, p });
	return timingSafeEqual(key, expected);
}

export interface UserRecord {
	hash: string;
	created: string;
	/** Signed into every session token; bumping it signs the user out everywhere. Absent = 1. */
	sessionVersion?: number;
}

/** A record's session version: a positive integer, 1 when missing or malformed. */
export function sessionVersionOf(record: UserRecord): number {
	const v = record.sessionVersion;
	return typeof v === 'number' && Number.isSafeInteger(v) && v >= 1 ? v : 1;
}

export interface UsersFile {
	users: Record<string, UserRecord>;
}

/** Usernames are case-insensitive: stored lowercase. */
export function normaliseUsername(name: string): string | null {
	const n = name.trim().toLowerCase();
	return /^[a-z0-9][a-z0-9._-]{0,31}$/.test(n) ? n : null;
}

export function usersFilePath(dataDir: string): string {
	return path.join(dataDir, 'users.json');
}

export function readUsers(dataDir: string): UsersFile {
	try {
		const data = JSON.parse(readFileSync(usersFilePath(dataDir), 'utf8')) as Partial<UsersFile>;
		return { users: data.users && typeof data.users === 'object' ? data.users : {} };
	} catch {
		return { users: {} };
	}
}

function writeUsers(dataDir: string, file: UsersFile): void {
	mkdirSync(dataDir, { recursive: true });
	const target = usersFilePath(dataDir);
	const tmp = `${target}.${process.pid}.tmp`;
	writeFileSync(tmp, JSON.stringify(file, null, '\t') + '\n', { mode: 0o600 });
	renameSync(tmp, target);
}

/**
 * Create a user or change their password. Returns 'created' or 'updated'.
 * Changing a password bumps `sessionVersion`, which revokes the user's existing sessions.
 */
export async function addUser(
	dataDir: string,
	name: string,
	password: string
): Promise<'created' | 'updated'> {
	const user = normaliseUsername(name);
	if (!user) throw new Error('Usernames are 1-32 characters: letters, digits, ".", "_" or "-".');
	if (password.length < MIN_PASSWORD_LENGTH) {
		throw new Error(`Passwords need at least ${MIN_PASSWORD_LENGTH} characters.`);
	}
	const file = readUsers(dataDir);
	const previous = file.users[user];
	const existed = previous !== undefined;
	file.users[user] = {
		hash: await hashPassword(password),
		created: previous?.created ?? new Date().toISOString(),
		sessionVersion: previous ? sessionVersionOf(previous) + 1 : 1
	};
	writeUsers(dataDir, file);
	return existed ? 'updated' : 'created';
}

/** Sign a user out everywhere: bump their `sessionVersion`. Returns the new version, or null. */
export function logoutAll(dataDir: string, name: string): number | null {
	const user = normaliseUsername(name);
	const file = readUsers(dataDir);
	const record = user ? file.users[user] : undefined;
	if (!user || !record) return null;
	record.sessionVersion = sessionVersionOf(record) + 1;
	writeUsers(dataDir, file);
	return record.sessionVersion;
}

export function removeUser(dataDir: string, name: string): boolean {
	const user = normaliseUsername(name);
	const file = readUsers(dataDir);
	if (!user || !(user in file.users)) return false;
	delete file.users[user];
	writeUsers(dataDir, file);
	return true;
}

// A real hash of a random password: unknown users cost the same time as known ones.
let dummyHash: Promise<string> | null = null;

/** Returns the normalised username when the password matches, else null. */
export async function authenticate(
	dataDir: string,
	name: string,
	password: string
): Promise<string | null> {
	const user = normaliseUsername(name);
	const record = user ? readUsers(dataDir).users[user] : undefined;
	if (!user || !record) {
		dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
		await verifyPassword(password, await dummyHash);
		return null;
	}
	return (await verifyPassword(password, record.hash)) ? user : null;
}

/**
 * Cached lookup for the request hook: re-reads users.json only when its inode, mtime or size
 * changes, so checking a session costs a stat, not a read and parse. File timestamps come from a
 * coarse clock, so a file modified less than a second ago is not trusted to be cached: a quick
 * second write (e.g. logout-all right after a login) could keep the same stamp.
 */
export function createUserDirectory(dataDir: string) {
	let stamp = '';
	let versions = new Map<string, number>();
	const refresh = () => {
		let current = 'missing';
		let settled = true;
		try {
			const stat = statSync(usersFilePath(dataDir));
			current = `${stat.ino}:${stat.mtimeMs}:${stat.size}`;
			settled = Date.now() - stat.mtimeMs >= 1000;
		} catch {
			// no users file yet
		}
		if (current !== stamp || !settled) {
			stamp = current;
			const { users } = readUsers(dataDir);
			versions = new Map(Object.entries(users).map(([n, r]) => [n, sessionVersionOf(r)]));
		}
	};
	return {
		has(name: string): boolean {
			refresh();
			return versions.has(name);
		},
		/** The user's current session version, or null when there is no such user. */
		version(name: string): number | null {
			refresh();
			return versions.get(name) ?? null;
		}
	};
}
