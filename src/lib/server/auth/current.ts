/**
 * Who is asking, and may they go there. Pure: the hook passes the cookie, the secret, the
 * users.json directory and a row loader (the cached DB lookup).
 */
import type { CurrentUser } from '../../types.ts';
import type { UserRow } from '../db/schema.ts';
import { verifyAnySession } from './session.ts';

/** A users.json account: always an approved admin. */
export function localAdmin(name: string): CurrentUser {
	return { id: null, kind: 'local', email: null, name, role: 'admin', status: 'approved' };
}

export function fromRow(row: UserRow): CurrentUser {
	return {
		id: row.id,
		kind: 'google',
		email: row.email,
		name: row.name || row.email,
		role: row.role,
		status: row.status
	};
}

/**
 * The user behind a session cookie, or null when the token is invalid or expired, the account is
 * gone, or the token's version is older than the account's (sign-out everywhere, block, role
 * change, password change).
 */
export async function resolveUser(
	token: string | undefined,
	deps: {
		secret: string;
		localUsers: { version(name: string): number | null };
		loadUser: (id: number) => Promise<UserRow | null>;
	},
	now = Date.now()
): Promise<CurrentUser | null> {
	const session = verifyAnySession(token, deps.secret, now);
	if (!session) return null;
	if (session.kind === 'local') {
		return deps.localUsers.version(session.user) === session.v ? localAdmin(session.user) : null;
	}
	const row = await deps.loadUser(session.id);
	return row && row.sessionVersion === session.v ? fromRow(row) : null;
}

/** A label for traces and logs: the account id, never the email. */
export { userLabel } from '../../user-label.ts';

export type Access =
	| { kind: 'pass' }
	| { kind: 'redirect'; location: string }
	| { kind: 'deny'; status: number; message: string };

/** The privacy policy and the terms: public for Google's consent screen, and for any account. */
export const LEGAL_PATHS = ['/privacidad', '/condiciones'] as const;
const PUBLIC = new Set<string>([
	'/login',
	'/auth/google',
	'/auth/google/callback',
	'/robots.txt',
	...LEGAL_PATHS
]);
export const PENDING_PATH = '/pendiente';

/**
 * `/privacidad/` → `/privacidad` (and the same for `/condiciones/`): the hook answers 308 before
 * the guard, so a pasted URL with a trailing slash reaches the public page instead of /login,
 * and each page keeps one canonical URL. Exactly one trailing slash on exactly these paths;
 * anything else is left to the guard.
 */
export function canonicalLegalPath(pathname: string): string | null {
	if (!pathname.endsWith('/')) return null;
	let bare = pathname.slice(0, -1);
	try {
		bare = decodeURI(bare);
	} catch {
		return null;
	}
	return (LEGAL_PATHS as readonly string[]).includes(bare) ? bare : null;
}
export const BLOCKED_PATH = '/bloqueado';

/** Routes reachable without a session. Static files are served by adapter-node before the hook. */
export function isPublic(pathname: string): boolean {
	return PUBLIC.has(pathname) || pathname.startsWith('/_app/');
}

const isAdminPath = (pathname: string) => pathname === '/admin' || pathname.startsWith('/admin/');
const PASS: Access = { kind: 'pass' };

/**
 * The guard. Signed out → /login (with `next`); pending → /pendiente; blocked → /bloqueado;
 * only approved users read; only admins reach /admin/**. Non-GET requests get a status instead
 * of a redirect. Sign-out is always allowed to a signed-in user.
 */
export function decideAccess(
	user: CurrentUser | null,
	method: string,
	pathname: string,
	search = ''
): Access {
	// Kit matches routes on the decoded path: decide on the same form, so `/%61dmin` is `/admin`.
	let decoded = pathname;
	try {
		decoded = decodeURI(pathname);
	} catch {
		// malformed escapes: Kit answers 400/404 itself
	}
	pathname = decoded;
	if (isPublic(pathname)) return PASS;
	const navigating = method === 'GET' || method === 'HEAD';
	if (!user) {
		if (!navigating) return { kind: 'deny', status: 401, message: 'Inicia sesión primero.' };
		const next =
			pathname === '/' && !search ? '' : `?next=${encodeURIComponent(pathname + search)}`;
		return { kind: 'redirect', location: `/login${next}` };
	}
	if (pathname === '/logout') return PASS;

	if (user.status !== 'approved') {
		const home = user.status === 'blocked' ? BLOCKED_PATH : PENDING_PATH;
		if (pathname === home) return PASS;
		if (!navigating) {
			return { kind: 'deny', status: 403, message: 'Tu cuenta todavía no puede leer.' };
		}
		return { kind: 'redirect', location: home };
	}

	if (pathname === PENDING_PATH || pathname === BLOCKED_PATH) {
		return { kind: 'redirect', location: '/' };
	}
	if (isAdminPath(pathname) && user.role !== 'admin') {
		return { kind: 'deny', status: 403, message: 'Esta sección es solo para administradores.' };
	}
	return PASS;
}
