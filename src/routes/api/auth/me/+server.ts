/**
 * Current User Endpoint
 *
 * GET /api/auth/me
 *
 * Returns the current authentication status and user profile. Used by the
 * client on app initialization to determine if the user is signed in and
 * to display their name/avatar in the UI.
 *
 * This endpoint never returns error statuses for missing/invalid sessions;
 * it always returns a 200 with `isSignedIn: false` to simplify client logic.
 * The session cookie is intentionally not deleted on invalid sessions to
 * handle transient server restarts gracefully.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getValidSession } from '$lib/server/auth';
import { checkRateLimit } from '$lib/server/rate-limiter';

/**
 * Handles GET requests for the current user's auth status.
 *
 * @param {object} event - The SvelteKit request event.
 * @param {object} event.cookies - SvelteKit cookie accessor for reading the session cookie.
 * @param {Function} event.getClientAddress - Returns the client's IP address for rate limiting.
 *
 * @returns {Response} JSON response with the following shapes:
 *   - Signed in (200): `{ isSignedIn: true, user: { id, name, picture } }`
 *   - Not signed in (200): `{ isSignedIn: false, user: null }`
 *   - Rate limited (429): `{ error: "Rate limit exceeded" }`
 *
 * Query parameters: None.
 *
 * Authentication:
 *   Reads the `session_id` cookie. If absent or invalid, returns `isSignedIn: false`.
 */
export const GET: RequestHandler = async ({ cookies, getClientAddress }) => {
	// Rate-limit by client IP to prevent abuse
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/auth/me');
	if (!limit.allowed) {
		return json({ error: 'Rate limit exceeded' }, { status: 429 });
	}

	// Check for the session cookie
	const sessionCookie = cookies.get('session_id');
	if (!sessionCookie) {
		return json({ isSignedIn: false, user: null });
	}

	// Validate the session (may refresh tokens internally if expired)
	const session = await getValidSession(sessionCookie, cookies);
	if (!session) {
		// Don't delete cookie — might be a transient failure (server restart)
		// The cookie is harmless if invalid and avoids forcing re-login unnecessarily
		return json({ isSignedIn: false, user: null });
	}

	return json({ isSignedIn: true, user: session.user });
};
