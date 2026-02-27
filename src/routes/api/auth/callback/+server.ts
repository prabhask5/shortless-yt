/**
 * @fileoverview OAuth callback endpoint — handles the redirect from Google after consent.
 *
 * Flow:
 * 1. Google redirects back here with a `code` query parameter (or `error` if denied).
 * 2. We exchange the authorization code for access + refresh tokens via `exchangeCode`.
 * 3. The tokens are encrypted into a single session cookie so that subsequent
 *    server-side loads can make authenticated YouTube API calls.
 * 4. The user is redirected to the home page with their session now active.
 *
 * Cookie security settings:
 * - `httpOnly`: prevents client-side JS from reading the token (XSS mitigation)
 * - `secure`: only sent over HTTPS
 * - `sameSite: 'lax'`: allows the cookie on top-level navigations but blocks
 *   cross-site POST requests (CSRF mitigation)
 * - `maxAge: 30 days`: long-lived session; refresh token handles re-auth
 */
import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exchangeCode, encryptSession, SESSION_COOKIE_NAME } from '$lib/server/auth';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	if (!code) {
		throw error(400, 'Missing authorization code');
	}

	/* Google sends an `error` param if the user denied consent or something went wrong */
	const errorParam = url.searchParams.get('error');
	if (errorParam) {
		throw error(400, `OAuth error: ${errorParam}`);
	}

	/* Exchange the one-time auth code for long-lived tokens */
	const tokens = await exchangeCode(code);

	const session = {
		accessToken: tokens.access_token,
		refreshToken: tokens.refresh_token,
		expiresAt: Date.now() + tokens.expires_in * 1000
	};

	/* Encrypt the session before storing in a cookie so tokens are not
	 * exposed in plaintext, even though the cookie is httpOnly. */
	const encrypted = encryptSession(session);

	cookies.set(SESSION_COOKIE_NAME, encrypted, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 30 // 30 days
	});

	throw redirect(302, '/');
};
