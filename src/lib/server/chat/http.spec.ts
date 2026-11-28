import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../chat/types.ts';
import { readJson, sendErrorText, sendResponse } from './http.ts';

const post = (body: string, type: string | null = 'application/json') =>
	new Request('http://localhost/chat/messages', {
		method: 'POST',
		headers: type ? { 'content-type': type } : {},
		body
	});

/** The status of the HttpError `run` throws (Kit's `error()`). */
async function statusOf(run: () => Promise<unknown>): Promise<number> {
	try {
		await run();
	} catch (err) {
		return (err as { status: number }).status;
	}
	throw new Error('expected an error');
}

describe('readJson', () => {
	it('returns a JSON object body, whatever the charset parameter', async () => {
		expect(await readJson(post('{"text":"hola"}'))).toEqual({ text: 'hola' });
		expect(await readJson(post('{}', 'Application/JSON; charset=utf-8'))).toEqual({});
	});

	it('refuses anything a cross-site form could send with 415', async () => {
		expect(
			await statusOf(() => readJson(post('text=hola', 'application/x-www-form-urlencoded')))
		).toBe(415);
		expect(await statusOf(() => readJson(post('{"text":"hola"}', 'text/plain')))).toBe(415);
		expect(await statusOf(() => readJson(post('{"text":"hola"}', null)))).toBe(415);
	});

	it('refuses malformed JSON and non-object bodies with 400', async () => {
		for (const body of ['{', 'null', '[1]', '"hola"', '42']) {
			expect(await statusOf(() => readJson(post(body)))).toBe(400);
		}
	});
});

describe('sendResponse', () => {
	it('answers a sent message with 201 and the message', async () => {
		const message = { id: 7, body: 'hola' } as ChatMessage;
		const res = sendResponse({ ok: true, message });
		expect(res.status).toBe(201);
		expect(await res.json()).toEqual({ message });
	});

	it('maps every failure to its status and Spanish text', async () => {
		const cases = [
			['empty', 400],
			['no-reader', 404],
			['not-allowed', 403],
			['rate', 429]
		] as const;
		for (const [error, status] of cases) {
			const res = sendResponse({ ok: false, error });
			expect(res.status).toBe(status);
			expect(await res.json()).toEqual({ error: sendErrorText(error) });
		}
		expect(sendErrorText('rate')).toMatch(/Espera un momento/);
	});
});
