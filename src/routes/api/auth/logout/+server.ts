/**
 * @fileoverview Logout endpoint — clears the session cookie and redirects home.
 *
 * Deleting the cookie is sufficient to log the user out because the session
 * is entirely cookie-based (no server-side session store). The encrypted
 * tokens in the cookie become inaccessible once the cookie is removed.
 * The `path: '/'` option ensures the deletion matches the path the cookie
 * was originally set on (cookies are path-scoped).
 */
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SESSION_COOKIE_NAME } from '$lib/server/auth';

export const GET: RequestHandler = async ({ cookies }) => {
	console.log('[AUTH LOGOUT] Logout request received, clearing session cookie');
	cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
	console.log('[AUTH LOGOUT] Session cookie cleared, redirecting to /');
	throw redirect(302, '/');
};
