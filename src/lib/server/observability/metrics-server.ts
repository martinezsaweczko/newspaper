/**
 * The LAN-only metrics endpoint: its own node:http server on METRICS_PORT, separate from the app
 * port (so a reverse proxy in front of the app never exposes it). Only `GET|HEAD /metrics` from an
 * allowed source address reaches `handler`; X-Forwarded-For is never consulted.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { isAllowed, type Cidr } from './cidr.ts';

export type MetricsHandler = (req: IncomingMessage, res: ServerResponse) => void;

export function createMetricsServer(handler: MetricsHandler, allow: readonly Cidr[]): Server {
	return createServer((req, res) => {
		const plain = (status: number, body: string) => {
			res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
			res.end(body);
		};
		// the socket's peer address only: proxies cannot widen access with headers
		if (!isAllowed(req.socket.remoteAddress, allow)) return plain(403, 'Forbidden\n');
		const pathname = (req.url ?? '/').split('?')[0];
		if (pathname !== '/metrics') return plain(404, 'Not found\n');
		if (req.method !== 'GET' && req.method !== 'HEAD') {
			res.setHeader('allow', 'GET, HEAD');
			return plain(405, 'Method not allowed\n');
		}
		handler(req, res);
	});
}

/**
 * Listen without ever taking the app down: a busy port (e.g. a second `npm run dev`) or a bad
 * host only logs a warning. Unref'd so it never delays a graceful shutdown.
 */
export function listenMetrics(server: Server, port: number, host: string): Promise<boolean> {
	return new Promise((resolve) => {
		server.once('error', (err: NodeJS.ErrnoException) => {
			console.warn(
				`[telemetry] metrics endpoint not started on ${host}:${port}: ${err.code ?? err.message}`
			);
			resolve(false);
		});
		server.listen(port, host, () => {
			server.unref();
			resolve(true);
		});
	});
}
