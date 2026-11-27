import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { httpInstrumentationConfig, isLiveStream } from './tracing.ts';

const req = (url: string, localPort = 3000) => ({ url, socket: { localPort } }) as IncomingMessage;

describe('httpInstrumentationConfig', () => {
	const ignore = httpInstrumentationConfig(9464).ignoreIncomingRequestHook!;

	it('skips Prometheus scrapes and the live stream, nothing else', () => {
		expect(ignore(req('/metrics', 9464))).toBe(true);
		expect(ignore(req('/chat/stream'))).toBe(true);
		expect(ignore(req('/chat/stream?x=1'))).toBe(true);
		expect(ignore(req('/'))).toBe(false);
		expect(ignore(req('/pdf/abc'))).toBe(false);
	});

	it('matches only the stream path itself', () => {
		expect(isLiveStream('/chat/streamer')).toBe(false);
		expect(isLiveStream(undefined)).toBe(false);
	});
});
