import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sseEvent, sseResponse } from './sse.ts';

const decoder = new TextDecoder();

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, text: string) {
	let seen = '';
	while (!seen.includes(text)) {
		const { value, done } = await reader.read();
		if (done) break;
		seen += decoder.decode(value);
	}
	return seen;
}

describe('sseEvent', () => {
	it('writes one event with its JSON on a single data line', () => {
		expect(sseEvent('presence', { admins: true, note: 'a\nb' })).toBe(
			'event: presence\ndata: {"admins":true,"note":"a\\nb"}\n\n'
		);
	});
});

describe('sseResponse', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('streams the retry hint, the events and keep-alives with SSE headers', async () => {
		const res = sseResponse({
			keepAliveMs: 1000,
			retryMs: 2000,
			open: (send) => {
				send('presence', { admins: false });
				return () => {};
			}
		});
		expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
		expect(res.headers.get('cache-control')).toContain('no-cache');
		const reader = res.body!.getReader();
		expect(await readUntil(reader, 'admins')).toBe(
			'retry: 2000\n\nevent: presence\ndata: {"admins":false}\n\n'
		);
		await vi.advanceTimersByTimeAsync(1000);
		expect(await readUntil(reader, 'ping')).toBe(': ping\n\n');
		await reader.cancel();
	});

	it('runs the cleanup once when the client goes away', async () => {
		const cleanup = vi.fn();
		const abort = new AbortController();
		const res = sseResponse({ signal: abort.signal, open: () => cleanup });
		const reader = res.body!.getReader();
		await reader.read();
		abort.abort();
		await reader.cancel();
		expect(cleanup).toHaveBeenCalledTimes(1);
	});

	it('ends the stream when the check fails', async () => {
		const cleanup = vi.fn();
		const res = sseResponse({
			keepAliveMs: 1000,
			check: async () => false,
			open: () => cleanup
		});
		const reader = res.body!.getReader();
		await reader.read(); // retry hint
		await vi.advanceTimersByTimeAsync(1000);
		expect(await reader.read()).toEqual({ done: true, value: undefined });
		expect(cleanup).toHaveBeenCalledTimes(1);
	});

	it('lets the open side close the stream', async () => {
		let close = () => {};
		const res = sseResponse({
			open: (_send, c) => {
				close = c;
				return () => {};
			}
		});
		const reader = res.body!.getReader();
		await reader.read();
		close();
		expect((await reader.read()).done).toBe(true);
	});
});
