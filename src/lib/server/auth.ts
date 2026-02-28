/**
 * @fileoverview Google OAuth2 authentication and session cookie management.
 *
 * Implements the standard OAuth2 Authorization Code flow with Google:
 * 1. User clicks "Sign in" -> redirect to Google's consent screen.
 * 2. Google redirects back with an authorization code.
 * 3. Server exchanges the code for an access token + refresh token.
 * 4. Tokens are encrypted into an AES-256-GCM cookie for subsequent requests.
 *
 * **Session cookie strategy:**
 * The session payload (tokens, expiry, basic profile info) is encrypted with
 * AES-256-GCM using a key derived from `AUTH_SECRET`. This provides both
 * confidentiality (tokens are opaque in the cookie) and integrity (the GCM
 * auth tag prevents tampering).
 *
 * The access token scope is `youtube.readonly`, which allows reading
 * subscriptions, liked videos, and playlists but cannot modify anything.
 */

import {
	createHmac as nodeCreateHmac,
	createCipheriv,
	createDecipheriv,
	randomBytes
} from 'node:crypto';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET, PUBLIC_APP_URL } from './env.js';
import type { UserSession } from '$lib/types.js';

/** Name of the HTTP-only cookie that stores the encrypted session payload. */
export const SESSION_COOKIE_NAME = 'shortless_session';

/** Name of the short-lived cookie that stores the OAuth CSRF state parameter. */
export const STATE_COOKIE_NAME = 'shortless_oauth_state';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// ===================================================================
// OAuth2 flow
// ===================================================================

/**
 * Generate a cryptographically random OAuth state parameter for CSRF protection.
 *
 * @returns A 32-byte random string encoded as base64url.
 */
export function generateOAuthState(): string {
	return randomBytes(32).toString('base64url');
}

/**
 * Build the Google OAuth2 authorization URL.
 *
 * @param state - CSRF state parameter to include in the authorization request.
 * @returns A fully-qualified URL to redirect the user to Google's consent screen.
 */
export function getGoogleAuthUrl(state: string): string {
	const clientId = GOOGLE_CLIENT_ID();
	const appUrl = PUBLIC_APP_URL();
	const redirectUri = `${appUrl}/api/auth/callback`;

	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: 'https://www.googleapis.com/auth/youtube.readonly',
		access_type: 'offline',
		prompt: 'consent',
		state
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
	const redirectUri = `${PUBLIC_APP_URL()}/api/auth/callback`;

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
		console.error('[AUTH] Token refresh FAILED, status:', res.status, 'body:', errorBody);
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
// Session cookie encryption (AES-256-GCM)
// ===================================================================

/**
 * Derive a 32-byte AES-256 encryption key from AUTH_SECRET.
 *
 * Uses HMAC-SHA256 with a fixed label so any length of AUTH_SECRET produces
 * exactly 32 bytes suitable for AES-256. Memoized since AUTH_SECRET never
 * changes at runtime.
 */
let _encryptionKey: Buffer | null = null;
function getEncryptionKey(): Buffer {
	if (_encryptionKey) return _encryptionKey;
	_encryptionKey = nodeCreateHmac('sha256', AUTH_SECRET())
		.update('shortless-session-encryption')
		.digest();
	return _encryptionKey;
}

/**
 * Encrypt a {@link UserSession} into a cookie-safe AES-256-GCM string.
 *
 * Format: `<base64url-iv>.<base64url-authTag>.<base64url-ciphertext>`.
 * The 12-byte IV is randomly generated per encryption. The 16-byte GCM auth
 * tag ensures both integrity and authenticity. The ciphertext is the encrypted
 * JSON session payload.
 *
 * @param session - The session object to encrypt.
 * @returns A cookie-safe string in the format `iv.tag.ciphertext`.
 */
export function encryptSession(session: UserSession): string {
	const key = getEncryptionKey();
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);

	const plaintext = JSON.stringify(session);
	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();

	return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

/**
 * Validate and deserialize a session cookie string.
 *
 * Only accepts AES-256-GCM format (3 dot-separated parts): `iv.tag.ciphertext`.
 * Legacy HMAC-signed cookies are no longer accepted — users with old sessions
 * will be signed out and need to re-authenticate.
 *
 * @param cookie - The raw cookie string.
 * @returns The parsed {@link UserSession}, or `null` if invalid/tampered.
 */
export function decryptSession(cookie: string): UserSession | null {
	try {
		const parts = cookie.split('.');

		if (parts.length === 3) {
			return decryptAesGcm(parts[0], parts[1], parts[2]);
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Decrypt a session from the AES-256-GCM cookie format.
 */
function decryptAesGcm(ivB64: string, tagB64: string, ciphertextB64: string): UserSession | null {
	const key = getEncryptionKey();
	const iv = Buffer.from(ivB64, 'base64url');
	const tag = Buffer.from(tagB64, 'base64url');
	const ciphertext = Buffer.from(ciphertextB64, 'base64url');

	const decipher = createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(tag);

	const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	const session = JSON.parse(decrypted.toString('utf8')) as UserSession;

	if (!session.accessToken || !session.refreshToken || !session.expiresAt) {
		return null;
	}

	return session;
}
