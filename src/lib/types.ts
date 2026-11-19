/** Shapes shared between server loaders and the UI. */

export interface Edition {
	/** base64url of the file name inside NEWSPAPER_DIR. */
	id: string;
	masthead: string;
	slug: string;
	/** ISO `YYYY-MM-DD`. */
	date: string;
	dateSource: 'filename' | 'mtime';
	region: string;
	size: number;
	mtimeMs: number;
}

export interface RegionGroup {
	region: string;
	editions: Edition[];
}

/** The signed-in person, as the hook puts it in `locals.user` and the layout hands to the UI. */
export interface CurrentUser {
	/** `users.id` for Google accounts; null for a local (users.json) admin. */
	id: number | null;
	kind: 'google' | 'local';
	email: string | null;
	name: string;
	role: 'user' | 'admin';
	status: 'pending' | 'approved' | 'blocked';
}
