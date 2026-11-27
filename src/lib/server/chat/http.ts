/**
 * Helpers for the chat's JSON endpoints. They accept only `application/json` bodies: a cross-site
 * page cannot send one without a CORS preflight, which this app never grants (and the session
 * cookie is SameSite=Lax, so a cross-site fetch carries no session anyway).
 */
import { error, json } from '@sveltejs/kit';
import type { ChatSendResult } from './service.ts';

export async function readJson(request: Request): Promise<Record<string, unknown>> {
	const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
	if (type !== 'application/json') error(415, 'Se esperaba JSON.');
	try {
		const body: unknown = await request.json();
		if (body && typeof body === 'object' && !Array.isArray(body)) {
			return body as Record<string, unknown>;
		}
	} catch {
		// fall through
	}
	error(400, 'Petición no válida.');
}

const ERRORS = {
	empty: [400, 'Escribe un mensaje de hasta 2000 caracteres.'],
	'no-reader': [404, 'Ese lector ya no puede recibir mensajes.'],
	'not-allowed': [403, 'Tu cuenta no puede enviar mensajes.'],
	rate: [429, 'Has enviado muchos mensajes seguidos. Espera un momento.']
} as const;

/** The JSON answer to a send: the stored message, or a Spanish error with its status. */
export function sendResponse(result: ChatSendResult): Response {
	if (result.ok) return json({ message: result.message }, { status: 201 });
	const [status, message] = ERRORS[result.error];
	return json({ error: message }, { status });
}

/** The Spanish text of a failed send (for the admin form). */
export const sendErrorText = (error: keyof typeof ERRORS): string => ERRORS[error][1];
