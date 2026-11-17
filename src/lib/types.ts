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
