/**
 * OAuth Login Endpoint
 *
 * GET /api/auth/login
 *
 * Initiates the Google OAuth 2.0 authorization flow with PKCE (Proof Key for
 * Code Exchange). Generates a cryptographic state token and PKCE code verifier,
 * stores them server-side, sets a short-lived `oauth_state` cookie for CSRF
 * protection, and redirects the user to Google's consent screen.
 *
 * This endpoint does NOT return JSON -- it always issues a 302 redirect to
 * Google's authorization URL.
 */

import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	generateCodeVerifier,
	generateCodeChallenge,
	generateState,
	buildAuthUrl,
	storePkceState
} from '$lib/server/auth';
import { checkRateLimit } from '$lib/server/rate-limiter';

/**
 * Handles GET requests to start the OAuth login flow.
 *
 * @param {object} event - The SvelteKit request event.
 * @param {Function} event.getClientAddress - Returns the client's IP address for rate limiting.
 * @param {object} event.cookies - SvelteKit cookie accessor for setting the CSRF state cookie.
 *
 * @returns {never} Always throws a SvelteKit redirect (302) to Google's OAuth consent page.
 *   - Rate limited (429): Returns a plain text "Rate limit exceeded" response instead of redirecting.
 *
 * Query parameters: None.
 *
 * Side effects:
 *   - Stores PKCE state (code verifier + state token) in server-side memory.
 *   - Sets an `oauth_state` httpOnly cookie (5-minute TTL) for CSRF validation in the callback.
 */
export const GET: RequestHandler = async ({ getClientAddress, cookies }) => {
	// Rate-limit by client IP to prevent login abuse
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/auth/login');
	if (!limit.allowed) {
		return new Response('Rate limit exceeded', { status: 429 });
	}

	// Generate PKCE parameters: state for CSRF protection, code verifier/challenge for OAuth security
	const state = generateState();
	const codeVerifier = generateCodeVerifier();
	const codeChallenge = await generateCodeChallenge(codeVerifier);

	// Store the code verifier keyed by state so the callback can retrieve it
	storePkceState(state, codeVerifier);

	// Set a short-lived cookie to verify state on callback (CSRF protection)
	cookies.set('oauth_state', state, {
		path: '/',
		httpOnly: true,
		secure: false,
		sameSite: 'lax',
		maxAge: 300 // 5 minutes — must complete login within this window
	});

	// Redirect to Google's authorization page
	const authUrl = buildAuthUrl(state, codeChallenge);
	redirect(302, authUrl);
};
