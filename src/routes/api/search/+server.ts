/**
 * Search Endpoint
 *
 * GET /api/search
 *
 * Searches YouTube for videos, channels, or playlists matching a query string.
 * When type is "video" (the default), uses `searchVideos` which filters out
 * YouTube Shorts. For other types (channel, playlist), uses `searchAll`.
 *
 * Cached by the service worker with a 10-minute TTL.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchVideos, searchAll } from '$lib/server/youtube-api';
import { checkRateLimit } from '$lib/server/rate-limiter';

/**
 * Handles GET requests for YouTube search.
 *
 * @param {object} event - The SvelteKit request event.
 * @param {URL} event.url - The request URL containing query parameters.
 * @param {Function} event.getClientAddress - Returns the client's IP address for rate limiting.
 *
 * @returns {Response} JSON response with the following shapes:
 *   - Success (200): `{ items: SearchResult[], nextPageToken?: string }` - Paginated results.
 *   - Missing param (400): `{ error: "Missing query parameter q" }`
 *   - Rate limited (429): `{ error: "Rate limit exceeded" }` with `Retry-After` header.
 *   - Server error (500): `{ error: string }`
 *
 * Query parameters:
 *   - `q` (required): The search query string.
 *   - `type` (optional, default "video"): Result type filter - "video", "channel", or "playlist".
 *   - `pageToken` (optional): Token for fetching the next page of results.
 *   - `regionCode` (optional, default "US"): ISO 3166-1 alpha-2 country code for regional results.
 *   - `relevanceLanguage` (optional, default "en"): ISO 639-1 language code for relevance ranking.
 */
export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	// Rate-limit by client IP; includes Retry-After header when exceeded
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/search');
	if (!limit.allowed) {
		return json(
			{ error: 'Rate limit exceeded' },
			{ status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
		);
	}

	// The search query is the only required parameter
	const q = url.searchParams.get('q');
	if (!q) return json({ error: 'Missing query parameter q' }, { status: 400 });

	// Extract optional parameters with sensible defaults
	const type = url.searchParams.get('type') || 'video';
	const pageToken = url.searchParams.get('pageToken') || undefined;
	const regionCode = url.searchParams.get('regionCode') || 'US';
	const relevanceLanguage = url.searchParams.get('relevanceLanguage') || 'en';

	try {
		// Use the Shorts-filtering search for videos; generic search for channels/playlists
		if (type === 'video') {
			const result = await searchVideos(q, pageToken, regionCode, relevanceLanguage);
			return json(result);
		} else {
			const result = await searchAll(q, type, pageToken);
			return json(result);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
