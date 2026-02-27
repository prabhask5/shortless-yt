/**
 * @fileoverview OAuth login initiation endpoint.
 *
 * Redirects the user to Google's OAuth consent screen. This is a server-only
 * route (+server.ts, not +page.server.ts) because no page rendering is needed --
 * the browser simply follows the 302 redirect to Google.
 *
 * The frontend links to this route with `data-sveltekit-reload` on the <a> tag
 * to bypass SvelteKit's client-side router, which would otherwise try to fetch
 * the redirect response and fail due to cross-origin CORS restrictions.
 */
import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGoogleAuthUrl } from '$lib/server/auth';

export const GET: RequestHandler = async () => {
	console.log('[AUTH LOGIN] Sign-in request received, building Google OAuth URL...');
	try {
		const url = getGoogleAuthUrl();
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
