/**
 * Logout Endpoint
 *
 * POST /api/auth/logout
 *
 * Signs the user out by deleting their `session_id` cookie. This is the only
 * POST endpoint in the API. The server-side session data is not explicitly
 * invalidated here -- it will expire naturally via TTL. The cookie deletion
 * alone is sufficient to prevent further authenticated requests.
 *
 * No request body or query parameters are required.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logAuthEvent } from '$lib/server/logger';

/**
 * Handles POST requests to log the user out.
 *
 * @param {object} event - The SvelteKit request event.
 * @param {object} event.cookies - SvelteKit cookie accessor for deleting the session cookie.
 *
 * @returns {Response} JSON response:
 *   - Success (200): `{ success: true }`
 *
 * Query parameters: None.
 * Request body: None.
 *
 * Side effects:
 *   - Deletes the `session_id` cookie.
 *   - Logs the logout event via the auth logger.
 */
export const POST: RequestHandler = async ({ cookies }) => {
	// Remove the session cookie to sign the user out
	cookies.delete('session_id', { path: '/' });
	// Log the logout for audit/monitoring purposes
	logAuthEvent('logout', true);
	return json({ success: true });
};
