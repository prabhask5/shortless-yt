/**
 * Channel Videos Endpoint
 *
 * GET /api/channel/videos
 *
 * Fetches a paginated list of videos uploaded by a specific YouTube channel.
 * Results can be sorted by date (newest first), view count, or oldest first.
 * Used on the channel detail page to render the channel's uploads grid.
 * YouTube Shorts are filtered out from results.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChannelVideos } from '$lib/server/youtube-api';
import { checkRateLimit } from '$lib/server/rate-limiter';

/**
 * Handles GET requests for a channel's uploaded videos.
 *
 * @param {object} event - The SvelteKit request event.
 * @param {URL} event.url - The request URL containing query parameters.
 * @param {Function} event.getClientAddress - Returns the client's IP address for rate limiting.
 *
 * @returns {Response} JSON response with the following shapes:
 *   - Success (200): `{ items: Video[], nextPageToken?: string }` - Paginated channel videos.
 *   - Missing param (400): `{ error: "Missing channel id" }`
 *   - Rate limited (429): `{ error: "Rate limit exceeded" }` with `Retry-After` header.
 *   - Server error (500): `{ error: string }`
 *
 * Query parameters:
 *   - `id` (required): The YouTube channel ID whose videos to fetch.
 *   - `order` (optional, default "date"): Sort order - "date" (newest), "viewCount" (most popular), or "oldest".
 *   - `pageToken` (optional): Token for fetching the next page of results.
 */
export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	// Rate-limit by client IP; includes Retry-After header when exceeded
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/channel/videos');
	if (!limit.allowed) {
		return json(
			{ error: 'Rate limit exceeded' },
			{ status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
		);
	}

	// Validate the required channel ID parameter
	const id = url.searchParams.get('id');
	if (!id) return json({ error: 'Missing channel id' }, { status: 400 });

	// Sort order for the uploads — defaults to newest first
	const order = (url.searchParams.get('order') || 'date') as 'date' | 'viewCount' | 'oldest';
	// Optional pagination token for infinite scroll
	const pageToken = url.searchParams.get('pageToken') || undefined;

	try {
		const result = await getChannelVideos(id, order, pageToken);
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
