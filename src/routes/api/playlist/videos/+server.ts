/**
 * Playlist Videos Endpoint
 *
 * GET /api/playlist/videos
 *
 * Fetches a paginated list of videos within a YouTube playlist. Used on the
 * playlist detail page to render the playlist's video items. Results include
 * full video metadata (title, duration, thumbnails, etc.) and support
 * pagination via `pageToken` for infinite scroll.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPlaylistVideos } from '$lib/server/youtube-api';
import { checkRateLimit } from '$lib/server/rate-limiter';

/**
 * Handles GET requests for videos within a playlist.
 *
 * @param {object} event - The SvelteKit request event.
 * @param {URL} event.url - The request URL containing query parameters.
 * @param {Function} event.getClientAddress - Returns the client's IP address for rate limiting.
 *
 * @returns {Response} JSON response with the following shapes:
 *   - Success (200): `{ items: Video[], nextPageToken?: string }` - Paginated playlist videos.
 *   - Missing param (400): `{ error: "Missing playlist id" }`
 *   - Rate limited (429): `{ error: "Rate limit exceeded" }` with `Retry-After` header.
 *   - Server error (500): `{ error: string }`
 *
 * Query parameters:
 *   - `id` (required): The YouTube playlist ID whose videos to fetch.
 *   - `pageToken` (optional): Token for fetching the next page of playlist items.
 */
export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	// Rate-limit by client IP; includes Retry-After header when exceeded
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/playlist/videos');
	if (!limit.allowed) {
		return json(
			{ error: 'Rate limit exceeded' },
			{ status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
		);
	}

	// Validate the required playlist ID parameter
	const id = url.searchParams.get('id');
	if (!id) return json({ error: 'Missing playlist id' }, { status: 400 });

	// Optional pagination token for loading more items
	const pageToken = url.searchParams.get('pageToken') || undefined;

	try {
		const result = await getPlaylistVideos(id, pageToken);
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
