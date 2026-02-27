/**
 * @fileoverview OAuth login initiation endpoint.
 *
 * Redirects the user to Google's OAuth consent screen. This is a server-only
 * route (+server.ts, not +page.server.ts) because no page rendering is needed --
 * the browser simply follows the 302 redirect to Google.
 *
 * Before redirecting, a random `state` parameter is generated and stored in a
 * short-lived httpOnly cookie. The callback endpoint verifies the state to
 * prevent CSRF attacks (login CSRF / session fixation).
 *
 * The frontend links to this route with `data-sveltekit-reload` on the <a> tag
 * to bypass SvelteKit's client-side router, which would otherwise try to fetch
 * the redirect response and fail due to cross-origin CORS restrictions.
 */
import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGoogleAuthUrl, generateOAuthState, STATE_COOKIE_NAME } from '$lib/server/auth';
import { PUBLIC_APP_URL } from '$lib/server/env';

export const GET: RequestHandler = async ({ cookies }) => {
	console.log('[AUTH LOGIN] Sign-in request received, generating OAuth state and building URL...');

	const state = generateOAuthState();
	console.log('[AUTH LOGIN] Generated OAuth state:', state.slice(0, 8) + '...');

	/* Store the state in a short-lived cookie so the callback can verify it.
	 * 10-minute maxAge is generous — the consent screen rarely takes that long. */
	const isSecure = PUBLIC_APP_URL().startsWith('https://');
	cookies.set(STATE_COOKIE_NAME, state, {
		path: '/',
		httpOnly: true,
		secure: isSecure,
		sameSite: 'lax',
		maxAge: 600 // 10 minutes
	});

	try {
		const url = getGoogleAuthUrl(state);
		console.log(
			'[AUTH LOGIN] Redirecting to Google OAuth, redirect_uri will point to /api/auth/callback'
		);
		throw redirect(302, url);
	} catch (err) {
		/* Re-throw SvelteKit redirects — they use throw for control flow */
		if (
			err &&
			typeof err === 'object' &&
			'status' in err &&
			(err as { status: number }).status === 302
		) {
			throw err;
		}
		console.error('[AUTH LOGIN] FAILED to build Google OAuth URL:', err);
		throw error(
			500,
			`Failed to initiate sign-in: ${err instanceof Error ? err.message : 'Unknown error'}`
		);
	}
};
