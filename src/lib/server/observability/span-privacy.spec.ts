import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import {
	InMemorySpanExporter,
	SimpleSpanProcessor,
	TracerProvider,
	type ReadableSpan
} from '@opentelemetry/sdk-trace';
import { SpanKind } from '@opentelemetry/api';
import type * as Http from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isClientAddressKey, privateExporter } from './span-privacy.ts';
import { httpInstrumentationConfig } from './tracing.ts';

/** Every attribute name the HTTP instrumentation (old and stable semconv) uses for the peer. */
const IP_KEYS = [
	'client.address',
	'client.port',
	'network.peer.address',
	'network.peer.port',
	'net.peer.ip',
	'net.peer.port',
	'net.sock.peer.addr',
	'net.sock.peer.port',
	'http.client_ip'
];
const IP_LIKE = /\b\d{1,3}(\.\d{1,3}){3}\b|::1|::ffff:/;

describe('isClientAddressKey', () => {
	it.each([...IP_KEYS, 'http.request.header.x_forwarded_for', 'http.request.header.x-real-ip'])(
		'strips %s',
		(key) => expect(isClientAddressKey(key)).toBe(true)
	);
	it.each(['newspaper.user.id', 'http.route', 'server.address', 'url.path', 'http.method'])(
		'keeps %s',
		(key) => expect(isClientAddressKey(key)).toBe(false)
	);
});

describe('spans from a real incoming request', () => {
	const memory = new InMemorySpanExporter();
	const provider = new TracerProvider({
		spanProcessors: [new SimpleSpanProcessor({ exporter: privateExporter([memory]) })]
	});
	const instrumentation = new HttpInstrumentation({
		...httpInstrumentationConfig(undefined),
		// what the app adds (the hook sets these on the Kit root span)
		requestHook: (span) => span.setAttributes({ 'newspaper.user.id': '7' }),
		// even if someone captured forwarding headers later, they must not leave
		headersToSpanAttributes: { server: { requestHeaders: ['x-forwarded-for', 'forwarded'] } }
	});
	let server: Http.Server;
	let port = 0;

	beforeAll(async () => {
		instrumentation.setTracerProvider(provider);
		instrumentation.enable();
		// require-in-the-middle patches `require`, so load http through it after enable()
		const http = createRequire(import.meta.url)('node:http') as typeof Http;
		server = http.createServer((_req, res) => res.end('ok'));
		await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
		port = (server.address() as AddressInfo).port;
	});
	afterAll(async () => {
		instrumentation.disable();
		await new Promise((done) => server.close(done));
		await provider.shutdown();
	});

	it('has no client address attribute, and keeps the newspaper.* ones', async () => {
		const res = await fetch(`http://127.0.0.1:${port}/privacidad?x=1`, {
			headers: { 'x-forwarded-for': '203.0.113.9', forwarded: 'for=203.0.113.9' }
		});
		expect(await res.text()).toBe('ok');
		await provider.forceFlush();

		const incoming = memory.getFinishedSpans().find((s) => s.kind === SpanKind.SERVER);
		expect(incoming).toBeDefined();
		const attrs = (incoming as ReadableSpan).attributes;
		expect(attrs['newspaper.user.id']).toBe('7');
		expect(Object.keys(attrs).length).toBeGreaterThan(3); // the span still says what happened
		for (const key of Object.keys(attrs)) expect(isClientAddressKey(key), key).toBe(false);
		for (const [key, value] of Object.entries(attrs)) {
			if (key === 'server.address' || key === 'net.host.ip' || key === 'url.full') continue;
			if (key === 'http.url' || key === 'http.host' || key === 'net.host.name') continue;
			expect(String(value), key).not.toMatch(IP_LIKE);
		}
		expect(JSON.stringify(attrs)).not.toContain('203.0.113.9');
	});
});
