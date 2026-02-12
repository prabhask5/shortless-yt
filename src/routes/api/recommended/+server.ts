/**
 * Recommended / Home Feed Endpoint
 *
 * GET /api/recommended
 *
 * Serves the main home page feed. Behavior varies based on authentication:
 *   - Authenticated users: Returns a personalized subscription feed built from
 *     the user's subscribed channels' recent uploads.
 *   - Anonymous users: Returns YouTube trending/popular videos as a fallback.
 *
 * Supports infinite scroll via pageToken and offset parameters.
 * Cached by the service worker with a 30-minute TTL.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTrendingVideos, getSubscriptionFeed } from '$lib/server/youtube-api';
import { getValidSession } from '$lib/server/auth';
import { checkRateLimit } from '$lib/server/rate-limiter';

/**
 * Handles GET requests for the recommended/home feed.
 *
 * @param {object} event - The SvelteKit request event.
 * @param {URL} event.url - The request URL containing query parameters.
 * @param {object} event.cookies - SvelteKit cookie accessor for reading session data.
 * @param {Function} event.getClientAddress - Returns the client's IP address for rate limiting.
 *
 * @returns {Response} JSON response with the following shapes:
 *   - Success (200): `{ items: Video[], nextPageToken?: string }` - Paginated video list.
 *   - Rate limited (429): `{ error: "Rate limit exceeded" }`
 *   - Server error (500): `{ error: string }`
 *
 * Query parameters:
 *   - `pageToken` (optional): Token for fetching the next page of results (used by trending).
 *   - `offset` (optional, default 0): Numeric offset for subscription feed pagination.
 */
export const GET: RequestHandler = async ({ url, cookies, getClientAddress }) => {
	// Rate-limit by client IP to prevent abuse
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/recommended');
	if (!limit.allowed) {
		return json({ error: 'Rate limit exceeded' }, { status: 429 });
	}

	// Pagination parameters for infinite scroll support
	const pageToken = url.searchParams.get('pageToken') || undefined;
	const offset = parseInt(url.searchParams.get('offset') || '0', 10);

	try {
		// Attempt to serve a personalized subscription feed if the user is signed in
		const sessionCookie = cookies.get('session_id');
		if (sessionCookie) {
			const session = await getValidSession(sessionCookie, cookies);
			if (session) {
				const result = await getSubscriptionFeed(
					session.accessToken,
					session.user.id,
					pageToken,
					offset
				);
				return json(result);
			}
		}

		// Not signed in or invalid session — return trending
		const result = await getTrendingVideos(pageToken);
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
