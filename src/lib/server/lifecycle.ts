/**
 * Process shutdown state. Once SIGTERM/SIGINT arrives, responses carry `Connection: close` and
 * live streams end at once, so adapter-node's graceful shutdown can drain every socket instead of
 * waiting SHUTDOWN_TIMEOUT for browsers that reconnect over a kept-alive connection.
 */
let stopping = false;

export const isStopping = (): boolean => stopping;

export function markStopping(): void {
	stopping = true;
}
