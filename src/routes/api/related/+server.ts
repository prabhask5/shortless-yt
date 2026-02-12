/**
 * Related Videos Endpoint
 *
 * GET /api/related
 *
 * Fetches videos related to a given video ID. Used on the video watch page
 * to populate the "Up next" / sidebar recommendations. Results are paginated
 * and filtered to exclude YouTube Shorts.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRelatedVideos } from '$lib/server/youtube-api';
import { checkRateLimit } from '$lib/server/rate-limiter';

/**
 * Handles GET requests for related videos.
 *
 * @param {object} event - The SvelteKit request event.
 * @param {URL} event.url - The request URL containing query parameters.
 * @param {Function} event.getClientAddress - Returns the client's IP address for rate limiting.
 *
 * @returns {Response} JSON response with the following shapes:
 *   - Success (200): `{ items: Video[], nextPageToken?: string }` - Paginated related videos.
 *   - Missing param (400): `{ error: "Missing id parameter" }`
 *   - Rate limited (429): `{ error: "Rate limit exceeded" }`
 *   - Server error (500): `{ error: string }`
 *
 * Query parameters:
 *   - `id` (required): The YouTube video ID to find related content for.
 *   - `pageToken` (optional): Token for fetching the next page of related results.
 */
export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	// Rate-limit by client IP to prevent abuse
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/related');
	if (!limit.allowed) {
		return json({ error: 'Rate limit exceeded' }, { status: 429 });
	}

	// The video ID is required to look up related content
	const id = url.searchParams.get('id');
	if (!id) return json({ error: 'Missing id parameter' }, { status: 400 });

	// Optional pagination token for infinite scroll
	const pageToken = url.searchParams.get('pageToken') || undefined;

	try {
		const result = await getRelatedVideos(id, pageToken);
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
