/**
 * Playlist Info Endpoint
 *
 * GET /api/playlist
 *
 * Fetches metadata for a YouTube playlist, including its title, description,
 * channel owner, video count, and thumbnail. Used on the playlist detail page
 * to render the playlist header.
 *
 * Returns 404 if the playlist ID does not match any YouTube playlist.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPlaylistInfo } from '$lib/server/youtube-api';
import { checkRateLimit } from '$lib/server/rate-limiter';

/**
 * Handles GET requests for playlist metadata.
 *
 * @param {object} event - The SvelteKit request event.
 * @param {URL} event.url - The request URL containing query parameters.
 * @param {Function} event.getClientAddress - Returns the client's IP address for rate limiting.
 *
 * @returns {Response} JSON response with the following shapes:
 *   - Success (200): Playlist info object with title, description, channel, item count, thumbnails, etc.
 *   - Missing param (400): `{ error: "Missing playlist id" }`
 *   - Not found (404): `{ error: "Playlist not found" }`
 *   - Rate limited (429): `{ error: "Rate limit exceeded" }` with `Retry-After` header.
 *   - Server error (500): `{ error: string }`
 *
 * Query parameters:
 *   - `id` (required): The YouTube playlist ID (e.g., "PLxxxxxx").
 */
export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	// Rate-limit by client IP; includes Retry-After header when exceeded
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/playlist');
	if (!limit.allowed) {
		return json(
			{ error: 'Rate limit exceeded' },
			{ status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
		);
	}

	// Validate the required playlist ID parameter
	const id = url.searchParams.get('id');
	if (!id) return json({ error: 'Missing playlist id' }, { status: 400 });

	try {
		const result = await getPlaylistInfo(id);
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		// Distinguish between "not found" (404) and unexpected server errors (500)
		const status = message === 'Playlist not found' ? 404 : 500;
		return json({ error: message }, { status });
	}
};
