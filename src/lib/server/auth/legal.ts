import { parseAdminEmails } from './accounts.ts';

/** Who the legal pages name as responsible for the data, and where privacy requests go. */
export interface LegalContact {
	/** LEGAL_OPERATOR_NAME, or null: the pages then say "el administrador de este quiosco". */
	operator: string | null;
	/** LEGAL_CONTACT_EMAIL, else the first ADMIN_EMAILS address, else null (no address shown). */
	email: string | null;
}

/** Pure: resolved from the raw env values so it is unit-testable. */
export function legalContact(
	operatorName: string | undefined,
	contactEmail: string | undefined,
	adminEmails: string | undefined
): LegalContact {
	const operator = operatorName?.trim() || null;
	const explicit = contactEmail?.trim();
	const email = explicit?.includes('@')
		? explicit
		: ([...parseAdminEmails(adminEmails)][0] ?? null);
	return { operator, email };
}
