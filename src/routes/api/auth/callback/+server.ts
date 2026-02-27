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
import { PUBLIC_APP_URL } from '$lib/server/env';

export const GET: RequestHandler = async ({ url, cookies }) => {
	console.log('[AUTH CALLBACK] Received callback request, URL:', url.toString());

	const code = url.searchParams.get('code');
	if (!code) {
		console.error('[AUTH CALLBACK] Missing authorization code in callback URL');
		throw error(400, 'Missing authorization code');
	}

	/* Google sends an `error` param if the user denied consent or something went wrong */
	const errorParam = url.searchParams.get('error');
	if (errorParam) {
		console.error('[AUTH CALLBACK] OAuth error from Google:', errorParam);
		throw error(400, `OAuth error: ${errorParam}`);
	}

	console.log('[AUTH CALLBACK] Exchanging authorization code for tokens...');

	let tokens: { access_token: string; refresh_token: string; expires_in: number };
	try {
		tokens = await exchangeCode(code);
		console.log('[AUTH CALLBACK] Token exchange successful, expires_in:', tokens.expires_in);
	} catch (err) {
		console.error('[AUTH CALLBACK] Token exchange FAILED:', err);
		throw error(
			500,
			`Authentication failed: ${err instanceof Error ? err.message : 'Unknown error during token exchange'}`
		);
	}

	if (!tokens.refresh_token) {
		console.warn('[AUTH CALLBACK] No refresh_token in response — user may need to re-consent');
	}

	const session = {
		accessToken: tokens.access_token,
		refreshToken: tokens.refresh_token,
		expiresAt: Date.now() + tokens.expires_in * 1000
	};

	/* Encrypt the session before storing in a cookie so tokens are not
	 * exposed in plaintext, even though the cookie is httpOnly. */
	const encrypted = encryptSession(session);

	/* BUG FIX: secure flag must be dynamic — on localhost (HTTP) the browser
	 * silently refuses to set cookies with Secure flag, breaking auth entirely. */
	const isSecure = PUBLIC_APP_URL().startsWith('https://');
	console.log(
		'[AUTH CALLBACK] Setting session cookie, secure:',
		isSecure,
		'PUBLIC_APP_URL:',
		PUBLIC_APP_URL()
	);

	cookies.set(SESSION_COOKIE_NAME, encrypted, {
		path: '/',
		httpOnly: true,
		secure: isSecure,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 30 // 30 days
	});

	console.log('[AUTH CALLBACK] Session cookie set successfully, redirecting to /');
	throw redirect(302, '/');
};
