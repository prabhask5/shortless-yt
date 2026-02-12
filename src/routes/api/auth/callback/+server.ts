/**
 * OAuth Callback Endpoint
 *
 * GET /api/auth/callback
 *
 * Handles the redirect from Google's OAuth 2.0 consent screen. This endpoint:
 *   1. Validates the returned `state` parameter against the stored CSRF cookie.
 *   2. Consumes the PKCE code verifier associated with the state.
 *   3. Exchanges the authorization code for access and refresh tokens.
 *   4. Fetches the user's Google profile.
 *   5. Creates a server-side session and sets a `session_id` cookie.
 *   6. Redirects the user back to the home page.
 *
 * On any failure, redirects to the home page with an `auth_error` query parameter
 * so the client can display an appropriate error message.
 *
 * This endpoint does NOT return JSON -- it always issues a 302 redirect.
 */

import { redirect, isRedirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	consumePkceState,
	exchangeCode,
	getUserProfile,
	createSessionCookie
} from '$lib/server/auth';
import { logAuthEvent } from '$lib/server/logger';
import { checkRateLimit } from '$lib/server/rate-limiter';

/**
 * Handles the OAuth callback GET request from Google.
 *
 * @param {object} event - The SvelteKit request event.
 * @param {URL} event.url - The callback URL with `code`, `state`, and possibly `error` query params.
 * @param {object} event.cookies - SvelteKit cookie accessor for reading/writing auth cookies.
 * @param {Function} event.getClientAddress - Returns the client's IP address for rate limiting.
 *
 * @returns {never} Always throws a SvelteKit redirect (302):
 *   - On success: Redirects to `/` with a `session_id` cookie set (7-day TTL).
 *   - On error: Redirects to `/?auth_error=<reason>` with a descriptive error code.
 *   - Rate limited (429): Returns a plain text "Rate limit exceeded" response.
 *
 * Query parameters (provided by Google):
 *   - `code` (present on success): The authorization code to exchange for tokens.
 *   - `state` (present on success): The CSRF state token to validate.
 *   - `error` (present on failure): Error code from Google (e.g., "access_denied").
 */
export const GET: RequestHandler = async ({ url, cookies, getClientAddress }) => {
	// Rate-limit by client IP to prevent callback abuse
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/auth/callback');
	if (!limit.allowed) {
		return new Response('Rate limit exceeded', { status: 429 });
	}

	// Extract Google's callback parameters
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const error = url.searchParams.get('error');

	// If Google returned an error (e.g., user denied consent), redirect with the error
	if (error) {
		logAuthEvent('oauth_error', false);
		redirect(302, '/?auth_error=' + encodeURIComponent(error));
	}

	// Both code and state are required for a valid callback
	if (!code || !state) {
		redirect(302, '/?auth_error=missing_params');
	}

	// CSRF protection: verify the state matches what we stored in the cookie during login
	const storedState = cookies.get('oauth_state');
	if (state !== storedState) {
		logAuthEvent('csrf_mismatch', false);
		redirect(302, '/?auth_error=csrf_mismatch');
	}

	// State cookie is single-use; delete it now that it's been verified
	cookies.delete('oauth_state', { path: '/' });

	// Retrieve and consume the PKCE code verifier stored during the login step
	const codeVerifier = consumePkceState(state);
	if (!codeVerifier) {
		redirect(302, '/?auth_error=expired_state');
	}

	try {
		// Exchange the authorization code + PKCE verifier for OAuth tokens
		const tokens = await exchangeCode(code, codeVerifier);
		// Fetch the user's Google profile using the new access token
		const user = await getUserProfile(tokens.accessToken);
		// Create a persistent server-side session
		const sessionCookie = await createSessionCookie(
			tokens.accessToken,
			tokens.refreshToken,
			tokens.expiresIn,
			user
		);

		// Set the session cookie with a 7-day expiry
		cookies.set('session_id', sessionCookie, {
			path: '/',
			httpOnly: true,
			secure: false,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 7 // 7 days
		});

		logAuthEvent('login_success', true);
		redirect(302, '/');
	} catch (err) {
		// Re-throw SvelteKit redirects (they are thrown, not returned)
		if (isRedirect(err)) throw err;
		logAuthEvent('login_failed', false);
		const message = err instanceof Error ? err.message : 'unknown';
		redirect(302, '/?auth_error=' + encodeURIComponent(message));
	}
};
