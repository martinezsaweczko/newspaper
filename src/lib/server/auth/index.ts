import { config } from '../config.ts';
import { getDbHandle, type Db } from '../db/index.ts';
import type { UserRow } from '../db/schema.ts';
import { findUserById } from './accounts.ts';
import { createOidcClient, type OidcClient } from './oidc.ts';
import { createLoginThrottle } from './throttle.ts';
import { createUserCache } from './user-cache.ts';
import { createUserDirectory } from './users.ts';

/** Process-wide auth state for the server routes. */
export const users = createUserDirectory(config.dataDir);
/** Per IP+username 5, per username 10, per IP 50 failures in 15 minutes (see throttle.ts). */
export const loginThrottle = createLoginThrottle({
	perPair: 5,
	perUser: 10,
	perIp: 50,
	windowMs: 15 * 60 * 1000
});

/** The app's database (pool created on first use; migrated by the init hook). */
export const db = (): Db => getDbHandle(config.databaseUrl).db;

/** Google users by id, 5 s; admin actions invalidate their entry. */
export const userCache = createUserCache<UserRow>({ load: (id) => findUserById(db(), id) });

const google: OidcClient | null = config.google ? createOidcClient(config.google) : null;
/** The Google OIDC client, or null when Google sign-in is not configured. */
export const googleClient = () => google;
