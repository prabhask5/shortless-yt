/**
 * @fileoverview OAuth callback endpoint — handles the redirect from Google after consent.
 *
 * Flow:
 * 1. Verify the `state` query parameter matches the state cookie (CSRF protection).
 * 2. Google redirects back here with a `code` query parameter (or `error` if denied).
 * 3. We exchange the authorization code for access + refresh tokens via `exchangeCode`.
 * 4. The tokens are encrypted into a single session cookie so that subsequent
 *    server-side loads can make authenticated YouTube API calls.
 * 5. The user is redirected to the home page with their session now active.
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
import {
	exchangeCode,
	encryptSession,
	SESSION_COOKIE_NAME,
	STATE_COOKIE_NAME
} from '$lib/server/auth';
import { PUBLIC_APP_URL } from '$lib/server/env';
import { timingSafeEqual } from 'node:crypto';

export const GET: RequestHandler = async ({ url, cookies }) => {
	/* ── Error handling (check before code to avoid processing invalid requests) ── */
	const errorParam = url.searchParams.get('error');
	if (errorParam) {
		console.error('[AUTH CALLBACK] OAuth error from Google');
		throw error(400, 'OAuth authorization was denied or failed. Please try again.');
	}

	/* ── CSRF state verification ────────────────────────────────────────── */
	const stateParam = url.searchParams.get('state');
	const stateCookie = cookies.get(STATE_COOKIE_NAME);

	if (!stateParam || !stateCookie || stateParam.length !== stateCookie.length) {
		throw error(403, 'Invalid OAuth state — please try signing in again');
	}

	/* Timing-safe comparison to prevent timing attacks on the CSRF state */
	const stateMatch = timingSafeEqual(
		Buffer.from(stateParam, 'utf8'),
		Buffer.from(stateCookie, 'utf8')
	);
	if (!stateMatch) {
		throw error(403, 'Invalid OAuth state — please try signing in again');
	}

	/* State verified — clean up the one-time state cookie */
	cookies.delete(STATE_COOKIE_NAME, { path: '/' });

	/* ── Authorization code ────────────────────────────────────────────── */
	const code = url.searchParams.get('code');
	if (!code) {
		throw error(400, 'Missing authorization code');
	}

	/* ── Token exchange ─────────────────────────────────────────────────── */
	let tokens: { access_token: string; refresh_token: string; expires_in: number };
	try {
		tokens = await exchangeCode(code);
	} catch (err) {
		console.error(
			'[AUTH CALLBACK] Token exchange failed:',
			err instanceof Error ? err.message : err
		);
		throw error(500, 'Authentication failed. Please try signing in again.');
	}

	if (!tokens.refresh_token) {
		console.error('[AUTH CALLBACK] No refresh_token in response — cannot maintain session');
		throw error(500, 'Authentication incomplete — please try signing in again.');
	}

	const session = {
		accessToken: tokens.access_token,
		refreshToken: tokens.refresh_token,
		expiresAt: Date.now() + tokens.expires_in * 1000
	};

	const encrypted = encryptSession(session);

	const isSecure = PUBLIC_APP_URL().startsWith('https://');

	cookies.set(SESSION_COOKIE_NAME, encrypted, {
		path: '/',
		httpOnly: true,
		secure: isSecure,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 30 // 30 days
	});

	throw redirect(302, '/');
};
