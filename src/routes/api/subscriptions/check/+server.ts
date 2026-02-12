/**
 * Subscription Check Endpoint
 *
 * GET /api/subscriptions/check
 *
 * Checks whether the authenticated user is subscribed to a specific YouTube
 * channel. Returns `{ isSubscribed: false }` gracefully when the user is not
 * authenticated or when the check fails, rather than returning error statuses.
 * This allows the UI to always render a subscribe/unsubscribe button without
 * needing to handle auth errors separately.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkSubscription } from '$lib/server/youtube-api';
import { getValidSession } from '$lib/server/auth';
import { checkRateLimit } from '$lib/server/rate-limiter';

/**
 * Handles GET requests to check if the user subscribes to a given channel.
 *
 * @param {object} event - The SvelteKit request event.
 * @param {URL} event.url - The request URL containing query parameters.
 * @param {object} event.cookies - SvelteKit cookie accessor for reading the session cookie.
 * @param {Function} event.getClientAddress - Returns the client's IP address for rate limiting.
 *
 * @returns {Response} JSON response with the following shapes:
 *   - Success (200): `{ isSubscribed: boolean }` - Whether the user subscribes to the channel.
 *   - Missing param (400): `{ error: "Missing channelId" }`
 *   - Rate limited (429): `{ error: "Rate limit exceeded" }` with `Retry-After` header.
 *   Note: Unauthenticated users or API errors return `{ isSubscribed: false }` (200), not 401/500.
 *
 * Query parameters:
 *   - `channelId` (required): The YouTube channel ID to check subscription status for.
 *
 * Authentication:
 *   Uses the `session_id` cookie if present. If absent or invalid, gracefully returns false.
 */
export const GET: RequestHandler = async ({ url, cookies, getClientAddress }) => {
	// Rate-limit by client IP; includes Retry-After header when exceeded
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/subscriptions/check');
	if (!limit.allowed) {
		return json(
			{ error: 'Rate limit exceeded' },
			{ status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
		);
	}

	// If not authenticated, gracefully return false instead of 401
	const sessionCookie = cookies.get('session_id');
	if (!sessionCookie) {
		return json({ isSubscribed: false });
	}

	// If the session is invalid/expired, also return false gracefully
	const session = await getValidSession(sessionCookie, cookies);
	if (!session) {
		return json({ isSubscribed: false });
	}

	// Validate the required channel ID parameter
	const channelId = url.searchParams.get('channelId');
	if (!channelId) return json({ error: 'Missing channelId' }, { status: 400 });

	try {
		const isSubscribed = await checkSubscription(session.accessToken, session.user.id, channelId);
		return json({ isSubscribed });
	} catch {
		// On API errors, default to "not subscribed" to avoid breaking the UI
		return json({ isSubscribed: false });
	}
};
