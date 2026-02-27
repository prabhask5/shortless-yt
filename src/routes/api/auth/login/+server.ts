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
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGoogleAuthUrl } from '$lib/server/auth';

export const GET: RequestHandler = async () => {
	const url = getGoogleAuthUrl();
	throw redirect(302, url);
};
