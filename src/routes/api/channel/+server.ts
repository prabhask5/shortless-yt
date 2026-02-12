/**
 * Channel Info Endpoint
 *
 * GET /api/channel
 *
 * Fetches metadata for a YouTube channel, including its name, description,
 * subscriber count, banner image, and avatar. Used on the channel detail page
 * to render the channel header.
 *
 * Returns 404 if the channel ID does not match any YouTube channel.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChannelInfo } from '$lib/server/youtube-api';
import { checkRateLimit } from '$lib/server/rate-limiter';

/**
 * Handles GET requests for channel metadata.
 *
 * @param {object} event - The SvelteKit request event.
 * @param {URL} event.url - The request URL containing query parameters.
 * @param {Function} event.getClientAddress - Returns the client's IP address for rate limiting.
 *
 * @returns {Response} JSON response with the following shapes:
 *   - Success (200): Channel info object with name, description, statistics, thumbnails, etc.
 *   - Missing param (400): `{ error: "Missing channel id" }`
 *   - Not found (404): `{ error: "Channel not found" }`
 *   - Rate limited (429): `{ error: "Rate limit exceeded" }` with `Retry-After` header.
 *   - Server error (500): `{ error: string }`
 *
 * Query parameters:
 *   - `id` (required): The YouTube channel ID (e.g., "UCxxxxxx").
 */
export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	// Rate-limit by client IP; includes Retry-After header when exceeded
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/channel');
	if (!limit.allowed) {
		return json(
			{ error: 'Rate limit exceeded' },
			{ status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
		);
	}

	// Validate the required channel ID parameter
	const id = url.searchParams.get('id');
	if (!id) return json({ error: 'Missing channel id' }, { status: 400 });

	try {
		const result = await getChannelInfo(id);
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		// Distinguish between "not found" (404) and unexpected server errors (500)
		const status = message === 'Channel not found' ? 404 : 500;
		return json({ error: message }, { status });
	}
};
