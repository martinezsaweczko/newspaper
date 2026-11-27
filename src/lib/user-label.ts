import type { CurrentUser } from './types.ts';

/**
 * A label for an account that is never its email: `users.id` for Google accounts, `local:<name>`
 * for users.json admins. Traces carry it, and it is the presence key the browser compares with.
 */
export function userLabel(user: Pick<CurrentUser, 'kind' | 'id' | 'name'>): string {
	return user.kind === 'google' ? String(user.id) : `local:${user.name}`;
}
