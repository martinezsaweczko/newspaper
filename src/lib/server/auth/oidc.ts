/**
 * A minimal OpenID Connect client for the authorization-code flow with PKCE (S256), as Google
 * implements it. The issuer is configurable so tests can run against a local fake provider.
 * Tokens and secrets are never logged or put in error messages.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export const GOOGLE_ISSUER = 'https://accounts.google.com';

export type OidcFailure =
	| 'config' // discovery or JWKS could not be loaded
	| 'state' // missing/expired/tampered flow cookie or state mismatch
	| 'denied' // the provider returned an error (e.g. the user cancelled)
	| 'token' // the code exchange failed
	| 'id_token' // signature, iss, aud or exp invalid
	| 'nonce'
	| 'unverified' // email_verified is not true
	| 'conflict'; // the email belongs to another Google account

export class OidcError extends Error {
	constructor(
		readonly reason: OidcFailure,
		detail: string
	) {
		super(detail);
		this.name = 'OidcError';
	}
}

export interface OidcClientConfig {
	issuer: string;
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	/** Seconds of clock skew accepted on exp/iat (default 30). */
	clockTolerance?: number;
	timeoutMs?: number;
}

interface Discovery {
	issuer: string;
	authorization_endpoint: string;
	token_endpoint: string;
	jwks_uri: string;
}

export interface IdClaims extends JWTPayload {
	sub: string;
	email?: string;
	email_verified?: boolean | string;
	name?: string;
	picture?: string;
	nonce?: string;
}

/** A random URL-safe value (state, nonce, PKCE verifier). */
export function randomToken(bytes = 32): string {
	return randomBytes(bytes).toString('base64url');
}

/** The PKCE S256 challenge of a verifier. */
export function pkceChallenge(verifier: string): string {
	return createHash('sha256').update(verifier).digest('base64url');
}

/** Google signs `iss` with or without the scheme; any other issuer must match exactly. */
export function acceptedIssuers(issuer: string): string[] {
	return issuer === GOOGLE_ISSUER ? [GOOGLE_ISSUER, 'accounts.google.com'] : [issuer];
}

export function createOidcClient(config: OidcClientConfig) {
	const timeoutMs = config.timeoutMs ?? 10_000;
	let discovery: Promise<Discovery> | null = null;
	let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

	const discover = (): Promise<Discovery> => {
		discovery ??= (async () => {
			const url = `${config.issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`;
			const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
			if (!res.ok) throw new OidcError('config', `discovery returned ${res.status}`);
			const doc = (await res.json()) as Partial<Discovery>;
			if (!doc.issuer || !doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
				throw new OidcError('config', 'discovery document is incomplete');
			}
			if (doc.issuer.replace(/\/+$/, '') !== config.issuer.replace(/\/+$/, '')) {
				throw new OidcError('config', 'discovery issuer does not match GOOGLE_ISSUER');
			}
			return doc as Discovery;
		})().catch((err) => {
			discovery = null; // retry on the next sign-in
			throw err instanceof OidcError ? err : new OidcError('config', (err as Error).message);
		});
		return discovery;
	};

	return {
		config,

		/** The provider URL to send the browser to. */
		async authorizationUrl(input: { state: string; nonce: string; verifier: string }) {
			const meta = await discover();
			const url = new URL(meta.authorization_endpoint);
			url.search = new URLSearchParams({
				response_type: 'code',
				client_id: config.clientId,
				redirect_uri: config.redirectUri,
				scope: 'openid email profile',
				state: input.state,
				nonce: input.nonce,
				code_challenge: pkceChallenge(input.verifier),
				code_challenge_method: 'S256',
				prompt: 'select_account'
			}).toString();
			return url;
		},

		/** Exchange the authorization code for an ID token (the raw JWT). */
		async exchangeCode(code: string, verifier: string): Promise<string> {
			const meta = await discover();
			let res: Response;
			try {
				res = await fetch(meta.token_endpoint, {
					method: 'POST',
					headers: {
						'content-type': 'application/x-www-form-urlencoded',
						accept: 'application/json'
					},
					body: new URLSearchParams({
						grant_type: 'authorization_code',
						code,
						redirect_uri: config.redirectUri,
						client_id: config.clientId,
						client_secret: config.clientSecret,
						code_verifier: verifier
					}),
					signal: AbortSignal.timeout(timeoutMs)
				});
			} catch (err) {
				throw new OidcError('token', `token endpoint unreachable: ${(err as Error).name}`);
			}
			if (!res.ok) throw new OidcError('token', `token endpoint returned ${res.status}`);
			const body = (await res.json().catch(() => ({}))) as { id_token?: unknown };
			if (typeof body.id_token !== 'string') throw new OidcError('token', 'no id_token');
			return body.id_token;
		},

		/** Verify signature (provider JWKS), iss, aud, exp and nonce; require a verified email. */
		async verifyIdToken(idToken: string, nonce: string): Promise<IdClaims> {
			const meta = await discover();
			jwks ??= createRemoteJWKSet(new URL(meta.jwks_uri), { timeoutDuration: timeoutMs });
			let claims: IdClaims;
			try {
				const result = await jwtVerify(idToken, jwks, {
					issuer: acceptedIssuers(meta.issuer),
					audience: config.clientId,
					algorithms: ['RS256'],
					clockTolerance: config.clockTolerance ?? 30,
					requiredClaims: ['sub', 'exp', 'iat']
				});
				claims = result.payload as IdClaims;
			} catch (err) {
				throw new OidcError('id_token', `id token rejected: ${(err as { code?: string }).code}`);
			}
			if (typeof claims.nonce !== 'string' || claims.nonce !== nonce) {
				throw new OidcError('nonce', 'nonce mismatch');
			}
			if (claims.email_verified !== true && claims.email_verified !== 'true') {
				throw new OidcError('unverified', 'email not verified');
			}
			if (typeof claims.email !== 'string' || !claims.email.includes('@')) {
				throw new OidcError('unverified', 'no email');
			}
			return claims;
		}
	};
}

export type OidcClient = ReturnType<typeof createOidcClient>;
