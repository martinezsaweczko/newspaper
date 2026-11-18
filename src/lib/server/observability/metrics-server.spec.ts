import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { parseAllowList } from './cidr.ts';
import { createMetricsServer, listenMetrics } from './metrics-server.ts';

const servers: Server[] = [];

async function start(allow: string) {
	const server = createMetricsServer((_req, res) => {
		res.writeHead(200, { 'content-type': 'text/plain' });
		res.end('newspaper_editions 3\n');
	}, parseAllowList(allow));
	servers.push(server);
	expect(await listenMetrics(server, 0, '127.0.0.1')).toBe(true);
	return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
	await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

describe('metrics server', () => {
	it('serves /metrics to an allowed address', async () => {
		const base = await start('127.0.0.0/8');
		const res = await fetch(`${base}/metrics?x=1`);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain('newspaper_editions');
	});

	it('rejects a source outside the allowlist, whatever X-Forwarded-For says', async () => {
		const base = await start('10.9.9.9/32');
		const res = await fetch(`${base}/metrics`, { headers: { 'x-forwarded-for': '10.9.9.9' } });
		expect(res.status).toBe(403);
		expect(await res.text()).not.toContain('newspaper_');
	});

	it.each([
		['/', 404],
		['/metrics/extra', 404],
		['/login', 404]
	])('%s -> %i', async (path, status) => {
		const base = await start('127.0.0.0/8');
		expect((await fetch(`${base}${path}`)).status).toBe(status);
	});

	it('only allows GET and HEAD', async () => {
		const base = await start('127.0.0.0/8');
		expect((await fetch(`${base}/metrics`, { method: 'HEAD' })).status).toBe(200);
		const post = await fetch(`${base}/metrics`, { method: 'POST' });
		expect(post.status).toBe(405);
		expect(post.headers.get('allow')).toBe('GET, HEAD');
	});

	it('only warns when the port is taken', async () => {
		const base = await start('127.0.0.0/8');
		const port = Number(new URL(base).port);
		const second = createMetricsServer(() => {}, []);
		expect(await listenMetrics(second, port, '127.0.0.1')).toBe(false);
	});
});
