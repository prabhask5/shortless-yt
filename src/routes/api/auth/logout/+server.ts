/**
 * @fileoverview Logout endpoint — revokes Google tokens and clears the session cookie.
 *
 * Uses POST to prevent CSRF attacks (GET logout can be triggered by <img> tags).
 * Revokes the Google refresh token so stolen tokens become permanently invalid.
 */
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SESSION_COOKIE_NAME, decryptSession } from '$lib/server/auth';

const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export const POST: RequestHandler = async ({ cookies }) => {
	const cookie = cookies.get(SESSION_COOKIE_NAME);

	if (cookie) {
		const session = decryptSession(cookie);
		/* Revoke the refresh token with Google (best-effort, don't block on failure) */
		if (session?.refreshToken) {
			fetch(GOOGLE_REVOKE_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ token: session.refreshToken })
			}).catch(() => {
				/* Silently ignore revocation failures — cookie deletion still logs the user out */
			});
		}
	}

	cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
	throw redirect(302, '/');
};
