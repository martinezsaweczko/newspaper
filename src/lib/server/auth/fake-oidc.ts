/**
 * Test only: a fake OpenID provider on 127.0.0.1 (node:http) that behaves like Google for the
 * authorization-code + PKCE flow. It signs RS256 ID tokens with a key it generates and publishes
 * in its own JWKS. `/authorize` consents at once for the identity set with `setIdentity`;
 * `setOverrides` breaks one claim (nonce, aud, iss, email_verified, exp) to test rejections.
 * Never imported by app code.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';

export interface FakeIdentity {
	sub: string;
	email: string;
	name?: string;
	picture?: string;
	email_verified?: boolean;
}

export interface FakeOverrides {
	nonce?: string;
	aud?: string;
	iss?: string;
	email_verified?: boolean;
	/** Seconds from now until `exp` (default 3600); negative = already expired. */
	expiresIn?: number;
	/** Sign with a key that is not in the JWKS. */
	foreignKey?: boolean;
}

interface Grant {
	redirectUri: string;
	challenge: string;
	nonce: string;
	identity: FakeIdentity;
}

const json = (res: ServerResponse, status: number, body: unknown) => {
	res.writeHead(status, { 'content-type': 'application/json' });
	res.end(JSON.stringify(body));
};

const readBody = (req: IncomingMessage) =>
	new Promise<string>((resolve, reject) => {
		let data = '';
		req.setEncoding('utf8');
		req.on('data', (chunk) => (data += chunk));
		req.on('end', () => resolve(data));
		req.on('error', reject);
	});

export async function startFakeOidc({
	clientId,
	clientSecret
}: {
	clientId: string;
	clientSecret: string;
}) {
	const kid = 'fake-key-1';
	const { privateKey, publicKey } = await generateKeyPair('RS256');
	const foreign: CryptoKey = (await generateKeyPair('RS256')).privateKey;
	const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };

	let identity: FakeIdentity = { sub: 'fake-sub-1', email: 'reader@example.com', name: 'Reader' };
	let overrides: FakeOverrides = {};
	const grants = new Map<string, Grant>();
	let issuer = '';

	const server = createServer(async (req, res) => {
		try {
			const url = new URL(req.url ?? '/', issuer);
			if (url.pathname === '/.well-known/openid-configuration') {
				return json(res, 200, {
					issuer,
					authorization_endpoint: `${issuer}/authorize`,
					token_endpoint: `${issuer}/token`,
					jwks_uri: `${issuer}/jwks`,
					response_types_supported: ['code'],
					id_token_signing_alg_values_supported: ['RS256'],
					code_challenge_methods_supported: ['S256']
				});
			}
			if (url.pathname === '/jwks') return json(res, 200, { keys: [jwk] });

			if (url.pathname === '/authorize') {
				const q = url.searchParams;
				const redirectUri = q.get('redirect_uri');
				if (
					q.get('response_type') !== 'code' ||
					q.get('client_id') !== clientId ||
					q.get('code_challenge_method') !== 'S256' ||
					!q.get('code_challenge') ||
					!q.get('nonce') ||
					!redirectUri
				) {
					return json(res, 400, { error: 'invalid_request' });
				}
				const code = randomBytes(16).toString('base64url');
				grants.set(code, {
					redirectUri,
					challenge: q.get('code_challenge')!,
					nonce: q.get('nonce')!,
					identity
				});
				const back = new URL(redirectUri);
				back.searchParams.set('code', code);
				back.searchParams.set('state', q.get('state') ?? '');
				res.writeHead(302, { location: back.toString() });
				return res.end();
			}

			if (url.pathname === '/token' && req.method === 'POST') {
				const form = new URLSearchParams(await readBody(req));
				const code = form.get('code') ?? '';
				const grant = grants.get(code);
				grants.delete(code); // single use
				const verifier = form.get('code_verifier') ?? '';
				const challenge = createHash('sha256').update(verifier).digest('base64url');
				if (
					!grant ||
					form.get('grant_type') !== 'authorization_code' ||
					form.get('client_id') !== clientId ||
					form.get('client_secret') !== clientSecret ||
					form.get('redirect_uri') !== grant.redirectUri ||
					challenge !== grant.challenge
				) {
					return json(res, 400, { error: 'invalid_grant' });
				}
				const now = Math.floor(Date.now() / 1000);
				const exp = now + (overrides.expiresIn ?? 3600);
				const idToken = await new SignJWT({
					email: grant.identity.email,
					email_verified: overrides.email_verified ?? grant.identity.email_verified ?? true,
					name: grant.identity.name,
					picture: grant.identity.picture,
					nonce: overrides.nonce ?? grant.nonce
				})
					.setProtectedHeader({ alg: 'RS256', kid })
					.setIssuer(overrides.iss ?? issuer)
					.setAudience(overrides.aud ?? clientId)
					.setSubject(grant.identity.sub)
					.setIssuedAt(Math.min(now, exp - 60))
					.setExpirationTime(exp)
					.sign(overrides.foreignKey ? foreign : privateKey);
				return json(res, 200, {
					access_token: 'fake-access-token',
					token_type: 'Bearer',
					expires_in: 3600,
					id_token: idToken
				});
			}
			json(res, 404, { error: 'not_found' });
		} catch (err) {
			json(res, 500, { error: (err as Error).message });
		}
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

	return {
		issuer,
		setIdentity(next: FakeIdentity) {
			identity = next;
		},
		setOverrides(next: FakeOverrides) {
			overrides = next;
		},
		close: () =>
			new Promise<void>((resolve) => {
				server.closeAllConnections();
				server.close(() => resolve());
			})
	};
}

export type FakeOidc = Awaited<ReturnType<typeof startFakeOidc>>;
