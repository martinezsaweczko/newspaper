/**
 * Google accounts in the `users` table: first sign-in registration, linking, lookups.
 * Pure over a Drizzle handle (tests pass a throwaway database).
 */
import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.ts';
import { users, type UserRow } from '../db/schema.ts';
import type { VerifiedIdentity } from './google.ts';
import { OidcError } from './oidc.ts';

/** `ADMIN_EMAILS` as a set of lowercase addresses. */
export function parseAdminEmails(raw: string | undefined): Set<string> {
	return new Set(
		(raw ?? '')
			.split(/[,\s;]+/)
			.map((e) => e.trim().toLowerCase())
			.filter((e) => e.includes('@'))
	);
}

export async function findUserById(db: Db, id: number): Promise<UserRow | null> {
	const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
	return row ?? null;
}

export async function findUserByEmail(db: Db, email: string): Promise<UserRow | null> {
	const [row] = await db
		.select()
		.from(users)
		.where(eq(users.email, email.trim().toLowerCase()))
		.limit(1);
	return row ?? null;
}

const isDuplicate = (err: unknown) =>
	(err as { code?: string })?.code === 'ER_DUP_ENTRY' ||
	(err as { cause?: { code?: string } })?.cause?.code === 'ER_DUP_ENTRY';

/**
 * Record a verified Google sign-in and return the user's row.
 * - Known `sub`: refresh name, picture and last login (and the email, unless another row has it).
 * - Unknown `sub` but a row with that email and no `sub` (an admin created it): link it.
 * - Otherwise register: `pending`/`user`, or `approved`/`admin` when the email is in ADMIN_EMAILS
 *   (applied only when the row is created, so a later demotion in the dashboard sticks).
 * Throws OidcError('conflict') when the email already belongs to another Google account.
 */
export async function signInGoogleUser(
	db: Db,
	identity: VerifiedIdentity,
	adminEmails: Set<string>,
	now = new Date(),
	retry = true
): Promise<UserRow> {
	const profile = { name: identity.name, pictureUrl: identity.picture, lastLoginAt: now };
	try {
		const [bySub] = await db.select().from(users).where(eq(users.googleSub, identity.sub));
		if (bySub) {
			const changes: Partial<typeof users.$inferInsert> = { ...profile };
			if (bySub.email !== identity.email && !(await findUserByEmail(db, identity.email))) {
				changes.email = identity.email;
			}
			await db.update(users).set(changes).where(eq(users.id, bySub.id));
			return (await findUserById(db, bySub.id))!;
		}

		const byEmail = await findUserByEmail(db, identity.email);
		if (byEmail) {
			if (byEmail.googleSub !== null) {
				throw new OidcError('conflict', 'email already linked to another Google account');
			}
			await db
				.update(users)
				.set({ ...profile, googleSub: identity.sub })
				.where(eq(users.id, byEmail.id));
			return (await findUserById(db, byEmail.id))!;
		}

		const admin = adminEmails.has(identity.email);
		const [created] = await db
			.insert(users)
			.values({
				email: identity.email,
				googleSub: identity.sub,
				...profile,
				status: admin ? 'approved' : 'pending',
				role: admin ? 'admin' : 'user',
				createdAt: now,
				approvedAt: admin ? now : null
			})
			.$returningId();
		return (await findUserById(db, created.id))!;
	} catch (err) {
		// Two first sign-ins racing for the same sub or email: the loser re-reads the winner's row.
		if (retry && isDuplicate(err)) return signInGoogleUser(db, identity, adminEmails, now, false);
		throw err;
	}
}
