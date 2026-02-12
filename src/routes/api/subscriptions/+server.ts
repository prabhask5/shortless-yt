/**
 * Subscriptions List Endpoint
 *
 * GET /api/subscriptions
 *
 * Fetches the authenticated user's YouTube channel subscriptions. Returns a
 * paginated list of channels the user is subscribed to, including channel
 * thumbnails, names, and subscriber counts. Requires authentication.
 *
 * Used on the subscriptions page to display the user's subscription list.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSubscriptions } from '$lib/server/youtube-api';
import { getValidSession } from '$lib/server/auth';
import { checkRateLimit } from '$lib/server/rate-limiter';

/**
 * Handles GET requests for the user's subscriptions list.
 *
 * @param {object} event - The SvelteKit request event.
 * @param {URL} event.url - The request URL containing query parameters.
 * @param {object} event.cookies - SvelteKit cookie accessor for reading the session cookie.
 * @param {Function} event.getClientAddress - Returns the client's IP address for rate limiting.
 *
 * @returns {Response} JSON response with the following shapes:
 *   - Success (200): `{ items: Subscription[], nextPageToken?: string }` - Paginated subscription list.
 *   - Not authenticated (401): `{ error: "Not authenticated" }` or `{ error: "Invalid session" }`
 *   - Rate limited (429): `{ error: "Rate limit exceeded" }` with `Retry-After` header.
 *   - Server error (500): `{ error: string }`
 *
 * Query parameters:
 *   - `pageToken` (optional): Token for fetching the next page of subscriptions.
 *
 * Authentication:
 *   Requires a valid `session_id` cookie. Returns 401 if the cookie is missing or the session is invalid.
 */
export const GET: RequestHandler = async ({ url, cookies, getClientAddress }) => {
	// Rate-limit by client IP; includes Retry-After header when exceeded
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/subscriptions');
	if (!limit.allowed) {
		return json(
			{ error: 'Rate limit exceeded' },
			{ status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
		);
	}

	// Authentication is required — check for the session cookie
	const sessionCookie = cookies.get('session_id');
	if (!sessionCookie) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	// Validate the session and refresh tokens if needed
	const session = await getValidSession(sessionCookie, cookies);
	if (!session) {
		return json({ error: 'Invalid session' }, { status: 401 });
	}

	// Optional pagination token for loading more subscriptions
	const pageToken = url.searchParams.get('pageToken') || undefined;

	try {
		const result = await getSubscriptions(session.accessToken, session.user.id, pageToken);
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
