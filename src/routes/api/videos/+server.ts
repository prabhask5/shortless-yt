/**
 * Video Details Endpoint
 *
 * GET /api/videos
 *
 * Fetches full video details (title, description, statistics, etc.) for one or
 * more YouTube videos by their IDs. Used when the client already knows which
 * video IDs it needs and wants to hydrate them with complete metadata.
 *
 * Cached by the service worker with a 12-hour TTL.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVideosByIds } from '$lib/server/youtube-api';
import { checkRateLimit } from '$lib/server/rate-limiter';

/**
 * Handles GET requests for video details by ID(s).
 *
 * @param {object} event - The SvelteKit request event.
 * @param {URL} event.url - The request URL containing query parameters.
 * @param {Function} event.getClientAddress - Returns the client's IP address for rate limiting.
 *
 * @returns {Response} JSON response with the following shapes:
 *   - Success (200): `{ items: Video[] }` - Array of video detail objects.
 *   - Missing param (400): `{ error: "Missing ids parameter" }`
 *   - Rate limited (429): `{ error: "Rate limit exceeded" }`
 *   - Server error (500): `{ error: string }`
 *
 * Query parameters:
 *   - `ids` (required): Comma-separated list of YouTube video IDs to look up.
 */
export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	// Rate-limit by client IP to prevent abuse
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/videos');
	if (!limit.allowed) {
		return json({ error: 'Rate limit exceeded' }, { status: 429 });
	}

	// Validate the required 'ids' query parameter
	const ids = url.searchParams.get('ids');
	if (!ids) return json({ error: 'Missing ids parameter' }, { status: 400 });

	try {
		// Delegate to the YouTube API wrapper which handles caching internally
		const videos = await getVideosByIds(ids);
		return json({ items: videos });
	} catch (err) {
		// Normalize the error to a string message for the client
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
