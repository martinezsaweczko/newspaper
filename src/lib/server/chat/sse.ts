/**
 * A Server-Sent Events response: a long-lived streaming GET the browser's `EventSource` reads and
 * reconnects by itself. A comment line every `keepAliveMs` keeps proxies from closing an idle
 * connection; before each one `check` may end the stream (a blocked or demoted account).
 */

const encoder = new TextEncoder();

/** One SSE message. `data` is JSON on a single line (JSON.stringify never emits a newline). */
export function sseEvent(event: string, data: unknown): string {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const SSE_HEADERS = {
	'content-type': 'text/event-stream; charset=utf-8',
	'cache-control': 'no-cache, no-transform',
	// nginx-style proxies: deliver each event at once instead of buffering the body
	'x-accel-buffering': 'no'
} as const;

export interface SseOptions {
	/**
	 * Called once the stream is open with `send(event, data)` and `close()`; returns the cleanup to
	 * run when the stream ends, whichever side ends it.
	 */
	open: (send: (event: string, data: unknown) => void, close: () => void) => () => void;
	/** Ends the stream when it resolves to false (checked before each keep-alive). */
	check?: () => Promise<boolean>;
	/** The request's abort signal: the client went away. */
	signal?: AbortSignal;
	keepAliveMs?: number;
	/** How long the browser waits before reconnecting after the stream ends. */
	retryMs?: number;
}

export function sseResponse({
	open,
	check,
	signal,
	keepAliveMs = 20_000,
	retryMs = 3000
}: SseOptions): Response {
	let finish = () => {};
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			let done = false;
			let cleanup = () => {};
			const write = (text: string) => {
				if (!done) controller.enqueue(encoder.encode(text));
			};
			const timer = setInterval(async () => {
				if (done) return;
				if (check) {
					const ok = await check().catch(() => false);
					if (!ok) return close();
				}
				write(': ping\n\n');
			}, keepAliveMs);
			finish = () => {
				if (done) return;
				done = true;
				clearInterval(timer);
				signal?.removeEventListener('abort', close);
				cleanup();
			};
			function close() {
				if (done) return;
				finish();
				try {
					controller.close();
				} catch {
					// already closed or cancelled
				}
			}
			write(`retry: ${retryMs}\n\n`);
			cleanup = open((event, data) => write(sseEvent(event, data)), close);
			if (done) return cleanup(); // closed while opening: finish() ran before cleanup existed
			if (signal?.aborted) close();
			else signal?.addEventListener('abort', close, { once: true });
		},
		cancel() {
			finish();
		}
	});
	return new Response(body, { headers: SSE_HEADERS });
}
