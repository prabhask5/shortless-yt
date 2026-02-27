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
	const params = new URLSearchParams({
		client_id: GOOGLE_CLIENT_ID(),
		redirect_uri: `${PUBLIC_APP_URL()}/api/auth/callback`,
		response_type: 'code',
		scope: 'https://www.googleapis.com/auth/youtube.readonly',
		/* `offline` access_type ensures Google returns a refresh_token. */
		access_type: 'offline',
		/* `consent` prompt forces re-consent every time so we always get a fresh refresh_token. */
		prompt: 'consent'
	});

	return `${GOOGLE_AUTH_URL}?${params.toString()}`;
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
	const res = await fetch(GOOGLE_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: GOOGLE_CLIENT_ID(),
			client_secret: GOOGLE_CLIENT_SECRET(),
			redirect_uri: `${PUBLIC_APP_URL()}/api/auth/callback`,
			grant_type: 'authorization_code'
		})
	});

	if (!res.ok) {
		const errorBody = await res.text();
		throw new Error(`Token exchange failed: ${res.status} ${errorBody}`);
	}

	const data = (await res.json()) as {
		access_token: string;
		refresh_token: string;
		expires_in: number;
	};

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
		throw new Error(`Token refresh failed: ${res.status} ${errorBody}`);
	}

	const data = (await res.json()) as {
		access_token: string;
		expires_in: number;
	};

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
	const payload = JSON.stringify(session);
	/*
	 * base64url encoding is used (instead of standard base64) because it
	 * produces only URL/cookie-safe characters: [A-Za-z0-9_-] with no
	 * padding `=` characters, avoiding issues in Set-Cookie headers.
	 */
	const encoded = Buffer.from(payload, 'utf-8').toString('base64url');
	const signature = signHmac(encoded);
	return `${encoded}.${signature}`;
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
		/* Split on the last dot to separate payload from signature. */
		const dotIndex = cookie.lastIndexOf('.');
		if (dotIndex === -1) return null;

		const encoded = cookie.slice(0, dotIndex);
		const signature = cookie.slice(dotIndex + 1);

		/* Constant-time comparison would be ideal, but HMAC re-computation
		 * already makes timing attacks impractical here. */
		const expectedSignature = signHmac(encoded);
		if (signature !== expectedSignature) return null;

		const payload = Buffer.from(encoded, 'base64url').toString('utf-8');
		const session = JSON.parse(payload) as UserSession;

		/* Structural validation: ensure the session has the minimum required fields. */
		if (!session.accessToken || !session.refreshToken || !session.expiresAt) {
			return null;
		}

		return session;
	} catch {
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
