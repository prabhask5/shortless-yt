import { createHmac as nodeCreateHmac } from 'node:crypto';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET, PUBLIC_APP_URL } from './env.js';
import type { UserSession } from '$lib/types.js';

export const SESSION_COOKIE_NAME = 'shortless_session';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * Build the Google OAuth2 authorization URL.
 */
export function getGoogleAuthUrl(): string {
	const params = new URLSearchParams({
		client_id: GOOGLE_CLIENT_ID(),
		redirect_uri: `${PUBLIC_APP_URL()}/api/auth/callback`,
		response_type: 'code',
		scope: 'https://www.googleapis.com/auth/youtube.readonly',
		access_type: 'offline',
		prompt: 'consent'
	});

	return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens.
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
 * Refresh an expired access token using the refresh token.
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

/**
 * Encrypt a UserSession into a cookie-safe string.
 * Uses base64 encoding with an HMAC signature for integrity.
 */
export function encryptSession(session: UserSession): string {
	const payload = JSON.stringify(session);
	const encoded = Buffer.from(payload, 'utf-8').toString('base64url');
	const signature = signHmac(encoded);
	return `${encoded}.${signature}`;
}

/**
 * Decrypt and validate a session cookie string.
 * Returns null if the cookie is invalid or tampered with.
 */
export function decryptSession(cookie: string): UserSession | null {
	try {
		const dotIndex = cookie.lastIndexOf('.');
		if (dotIndex === -1) return null;

		const encoded = cookie.slice(0, dotIndex);
		const signature = cookie.slice(dotIndex + 1);

		const expectedSignature = signHmac(encoded);
		if (signature !== expectedSignature) return null;

		const payload = Buffer.from(encoded, 'base64url').toString('utf-8');
		const session = JSON.parse(payload) as UserSession;

		if (!session.accessToken || !session.refreshToken || !session.expiresAt) {
			return null;
		}

		return session;
	} catch {
		return null;
	}
}

function signHmac(data: string): string {
	const hmac = nodeCreateHmac('sha256', AUTH_SECRET());
	hmac.update(data);
	return hmac.digest('base64url');
}
