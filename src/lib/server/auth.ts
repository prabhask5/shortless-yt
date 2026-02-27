/**
 * @fileoverview Google OAuth2 authentication and session cookie management.
 *
 * Implements the standard OAuth2 Authorization Code flow with Google:
 * 1. User clicks "Sign in" -> redirect to Google's consent screen.
 * 2. Google redirects back with an authorization code.
 * 3. Server exchanges the code for an access token + refresh token.
 * 4. Tokens are serialized into an HMAC-signed cookie for subsequent requests.
 *
 * **Session cookie strategy:**
 * Rather than storing sessions in a database, the session payload (tokens,
 * expiry, basic profile info) is base64url-encoded and signed with an
 * HMAC-SHA256 signature using the `AUTH_SECRET` env var. This is similar to
 * how JWTs work but simpler -- there is no header or registered claims, just
 * `payload.signature`. The signature prevents tampering; the base64url
 * encoding ensures the cookie is safe for HTTP headers (no `+`, `/`, or `=`
 * characters that standard base64 would produce).
 *
 * The access token scope is `youtube.readonly`, which allows reading
 * subscriptions, liked videos, and playlists but cannot modify anything.
 */

import { createHmac as nodeCreateHmac } from 'node:crypto';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET, PUBLIC_APP_URL } from './env.js';
import type { UserSession } from '$lib/types.js';

/** Name of the HTTP-only cookie that stores the signed session payload. */
export const SESSION_COOKIE_NAME = 'shortless_session';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// ===================================================================
// OAuth2 flow
// ===================================================================

/**
 * Build the Google OAuth2 authorization URL.
 *
 * @returns A fully-qualified URL to redirect the user to Google's consent screen.
 */
export function getGoogleAuthUrl(): string {
	const clientId = GOOGLE_CLIENT_ID();
	const appUrl = PUBLIC_APP_URL();
	const redirectUri = `${appUrl}/api/auth/callback`;
	console.log(
		'[AUTH] Building Google OAuth URL, client_id:',
		clientId.slice(0, 12) + '...',
		'redirect_uri:',
		redirectUri
	);

	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: 'https://www.googleapis.com/auth/youtube.readonly',
		access_type: 'offline',
		prompt: 'consent'
	});

	const url = `${GOOGLE_AUTH_URL}?${params.toString()}`;
	console.log('[AUTH] Google OAuth URL built successfully');
	return url;
}

/**
 * Exchange an authorization code for an access token and refresh token.
 *
 * @param code - The one-time authorization code returned by Google's consent redirect.
 * @returns Object containing `access_token`, `refresh_token`, and `expires_in` (seconds).
 * @throws {Error} If the token exchange request fails (e.g. invalid/expired code).
 */
export async function exchangeCode(
	code: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
	const redirectUri = `${PUBLIC_APP_URL()}/api/auth/callback`;
	console.log('[AUTH] Exchanging authorization code, redirect_uri:', redirectUri);

	const res = await fetch(GOOGLE_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: GOOGLE_CLIENT_ID(),
			client_secret: GOOGLE_CLIENT_SECRET(),
			redirect_uri: redirectUri,
			grant_type: 'authorization_code'
		})
	});

	if (!res.ok) {
		const errorBody = await res.text();
		console.error('[AUTH] Token exchange FAILED, status:', res.status, 'body:', errorBody);
		throw new Error(`Token exchange failed: ${res.status} ${errorBody}`);
	}

	const data = (await res.json()) as {
		access_token: string;
		refresh_token: string;
		expires_in: number;
	};

	console.log(
		'[AUTH] Token exchange SUCCESS, has_access_token:',
		!!data.access_token,
		'has_refresh_token:',
		!!data.refresh_token,
		'expires_in:',
		data.expires_in
	);

	return {
		access_token: data.access_token,
		refresh_token: data.refresh_token,
		expires_in: data.expires_in
	};
}

/**
 * Refresh an expired access token using the stored refresh token.
 *
 * Google access tokens expire after ~1 hour. This function silently obtains
 * a new one so the user does not need to re-authenticate.
 *
 * @param refreshToken - The long-lived refresh token obtained during initial auth.
 * @returns Object containing a fresh `access_token` and its `expires_in` (seconds).
 * @throws {Error} If the refresh request fails (e.g. token revoked by user).
 */
export async function refreshAccessToken(
	refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
	console.log('[AUTH] Refreshing access token...');
	const res = await fetch(GOOGLE_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			refresh_token: refreshToken,
			client_id: GOOGLE_CLIENT_ID(),
			client_secret: GOOGLE_CLIENT_SECRET(),
			grant_type: 'refresh_token'
		})
	});

	if (!res.ok) {
		const errorBody = await res.text();
		console.error('[AUTH] Token refresh FAILED, status:', res.status, 'body:', errorBody);
		throw new Error(`Token refresh failed: ${res.status} ${errorBody}`);
	}

	const data = (await res.json()) as {
		access_token: string;
		expires_in: number;
	};

	console.log('[AUTH] Token refresh SUCCESS, expires_in:', data.expires_in);
	return {
		access_token: data.access_token,
		expires_in: data.expires_in
	};
}

// ===================================================================
// Session cookie serialization
// ===================================================================

/**
 * Serialize a {@link UserSession} into a cookie-safe signed string.
 *
 * The format is `<base64url-payload>.<base64url-hmac>`. The HMAC ensures
 * integrity -- if anyone modifies the payload, the signature will not match
 * on decryption and the session will be rejected.
 *
 * @param session - The session object to serialize.
 * @returns A cookie-safe string in the format `payload.signature`.
 */
export function encryptSession(session: UserSession): string {
	console.log(
		'[AUTH] Encrypting session, has accessToken:',
		!!session.accessToken,
		'has refreshToken:',
		!!session.refreshToken
	);
	const payload = JSON.stringify(session);
	const encoded = Buffer.from(payload, 'utf-8').toString('base64url');
	const signature = signHmac(encoded);
	const result = `${encoded}.${signature}`;
	console.log('[AUTH] Session encrypted, cookie length:', result.length, 'chars');
	return result;
}

/**
 * Validate and deserialize a session cookie string.
 *
 * Verifies the HMAC signature, decodes the payload, and performs basic
 * structural validation on the resulting session object.
 *
 * @param cookie - The raw cookie string in `payload.signature` format.
 * @returns The parsed {@link UserSession}, or `null` if invalid/tampered.
 */
export function decryptSession(cookie: string): UserSession | null {
	try {
		console.log('[AUTH] Decrypting session cookie, length:', cookie.length);
		const dotIndex = cookie.lastIndexOf('.');
		if (dotIndex === -1) {
			console.warn('[AUTH] Session cookie has no dot separator — invalid format');
			return null;
		}

		const encoded = cookie.slice(0, dotIndex);
		const signature = cookie.slice(dotIndex + 1);

		const expectedSignature = signHmac(encoded);
		if (signature !== expectedSignature) {
			console.warn(
				'[AUTH] Session cookie HMAC signature mismatch — cookie was tampered or AUTH_SECRET changed'
			);
			return null;
		}

		const payload = Buffer.from(encoded, 'base64url').toString('utf-8');
		const session = JSON.parse(payload) as UserSession;

		if (!session.accessToken || !session.refreshToken || !session.expiresAt) {
			console.warn(
				'[AUTH] Session cookie structural validation FAILED — missing fields. accessToken:',
				!!session.accessToken,
				'refreshToken:',
				!!session.refreshToken,
				'expiresAt:',
				!!session.expiresAt
			);
			return null;
		}

		console.log(
			'[AUTH] Session decrypted successfully, token ends: ...',
			session.accessToken.slice(-6)
		);
		return session;
	} catch (err) {
		console.error('[AUTH] Session decryption threw error:', err);
		return null;
	}
}

/**
 * Produce an HMAC-SHA256 signature for the given data string.
 *
 * @param data - The string to sign (typically the base64url-encoded session payload).
 * @returns The HMAC digest as a base64url-encoded string.
 */
function signHmac(data: string): string {
	const hmac = nodeCreateHmac('sha256', AUTH_SECRET());
	hmac.update(data);
	/* base64url output matches the encoding used for the payload, keeping
	 * the entire cookie value cookie-safe without extra escaping. */
	return hmac.digest('base64url');
}
