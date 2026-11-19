/** The app-wide reading log, recording from the PDF route without ever failing it. */
import type { CurrentUser } from '../../types.ts';
import { db } from '../auth/index.ts';
import type { ReadingKind } from '../db/schema.ts';
import type { EditionFacts } from '../library/index.ts';
import { createReadingLog, readerOf } from './log.ts';

export const readingLog = createReadingLog(db);

let warned = false;

/**
 * Record an opening in the background. A database failure is logged once at warn level and never
 * reaches the PDF response.
 */
export function recordReading(user: CurrentUser, facts: EditionFacts, kind: ReadingKind): void {
	const reader = readerOf(user);
	if (!reader) return;
	readingLog.record(reader, facts, kind).then(
		() => {
			warned = false;
		},
		(err: unknown) => {
			if (warned) return;
			warned = true;
			console.warn(`[reading] could not record an opening: ${(err as Error)?.message ?? err}`);
		}
	);
}
