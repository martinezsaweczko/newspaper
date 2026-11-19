import { building } from '$app/env';
import { decideAccess, resolveUser, userLabel } from '#lib/server/auth/current.ts';
import { db, userCache, users } from '#lib/server/auth/index.ts';
import { isCrossSiteForm } from '#lib/server/auth/origin.ts';
import { SESSION_COOKIE } from '#lib/server/auth/session.ts';
import { config, DEV_USER, sessionSecret } from '#lib/server/config.ts';
import { closeDbHandle } from '#lib/server/db/index.ts';
import { redactUrl, runMigrations, waitForDb } from '#lib/server/db/migrate.ts';
import { seedIgnoreFile } from '#lib/server/library/ignore.ts';
import { seedRegionsFile } from '#lib/server/library/regions.ts';
import {
	cachedLoader,
	initMetrics,
	recordHttpRequest,
	recordPageView,
	setDbGauges
} from '#lib/server/observability/metrics.ts';
import { gaugeValues } from '#lib/server/reading/views.ts';
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { mkdirSync } from 'node:fs';

export const init: ServerInit = async () => {
	if (building) return; // never touch the database during `vite build`
	sessionSecret(); // fail fast in production without a secret
	mkdirSync(config.dataDir, { recursive: true });
	seedRegionsFile(config.dataDir);
	seedIgnoreFile(config.dataDir);
	initMetrics();
	// newspaper_users / newspaper_readers_active: one cached query per minute at most
	setDbGauges(cachedLoader(() => gaugeValues(db())));
	// wait for MySQL (container start order), then apply pending migrations from /drizzle
	await waitForDb(config.databaseUrl);
	await runMigrations(db());
	console.log(`[db] migrations applied on ${redactUrl(config.databaseUrl)}`);
	// adapter-node emits this after the HTTP server has closed; the pool's sockets would otherwise
	// keep the process alive until the container runtime kills it
	process.once('sveltekit:shutdown' as 'beforeExit', () => void closeDbHandle());
	if (!config.google) console.log('[auth] Google sign-in is not configured: local admins only.');
};

export const handle: Handle = async (input) => {
	const started = performance.now();
	let status = 500;
	let contentType: string | null = null;
	try {
		const response = await guarded(input);
		status = response.status;
		contentType = response.headers.get('content-type');
		return response;
	} finally {
		// route id (e.g. /thumb/[id]), never the raw path: keeps the label set small
		const { route, request, isDataRequest } = input.event;
		recordHttpRequest(route.id, request.method, status, (performance.now() - started) / 1000);
		recordPageView({ route: route.id, method: request.method, status, contentType, isDataRequest });
	}
};

const guarded: Handle = async ({ event, resolve }) => {
	if (isCrossSiteForm(event.request)) {
		return new Response('No se permiten envíos de formularios desde otros sitios.', {
			status: 403
		});
	}

	// Rejects removed users and tokens older than the account's session version (password change,
	// `npm run user:logout-all`, block, role change). users.json is re-read only when it changes;
	// Google accounts come from a 5-second cache, so a page of thumbnails is one query.
	event.locals.user = await resolveUser(event.cookies.get(SESSION_COOKIE), {
		secret: sessionSecret(),
		localUsers: users,
		loadUser: (id) => userCache.get(id)
	});
	if (!event.locals.user && config.authDisabled) event.locals.user = DEV_USER;
	if (event.locals.user) {
		// the account id or `local:<name>`, never the email
		event.tracing.root.setAttributes({
			'newspaper.user.id': userLabel(event.locals.user),
			'newspaper.user.role': event.locals.user.role
		});
	}

	const { pathname, search } = event.url;
	const access = decideAccess(event.locals.user, event.request.method, pathname, search);
	if (access.kind === 'redirect') {
		return new Response(null, { status: 303, headers: { location: access.location } });
	}
	if (access.kind === 'deny') {
		return new Response(access.message, {
			status: access.status,
			headers: { 'content-type': 'text/plain; charset=utf-8' }
		});
	}

	const response = await resolve(event);
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'same-origin');
	response.headers.set('x-frame-options', 'SAMEORIGIN');
	return response;
};
