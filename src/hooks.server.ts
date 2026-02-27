/**
 * @fileoverview SvelteKit server hook for session management.
 *
 * This hook runs on every incoming server request before any route handler or
 * load function executes. Its sole responsibility is to hydrate
 * `event.locals.session` from the signed session cookie so that downstream
 * handlers can check authentication without re-parsing the cookie themselves.
 *
 * Flow:
 * 1. Read the session cookie from the request.
 * 2. If present, verify the HMAC signature and decode the payload via
 *    {@link decryptSession}.
 * 3. If valid, attach the token data to `event.locals.session`.
 * 4. If invalid (tampered or malformed), clear the corrupt cookie and set
 *    `event.locals.session` to `null` so downstream code treats the user
 *    as unauthenticated.
 * 5. If no cookie exists, set `event.locals.session` to `null`.
 */

import type { Handle } from '@sveltejs/kit';
import { decryptSession, SESSION_COOKIE_NAME } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	const cookie = event.cookies.get(SESSION_COOKIE_NAME);
	const path = event.url.pathname;

	console.log(
		`[HOOKS] Incoming request: ${event.request.method} ${path}, cookie present: ${!!cookie}`
	);

	if (cookie) {
		const session = decryptSession(cookie);

		if (session) {
			const isExpired = Date.now() > session.expiresAt;
			console.log(
				`[HOOKS] Session valid, accessToken ends: ...${session.accessToken.slice(-6)}, expired: ${isExpired}, expiresAt: ${new Date(session.expiresAt).toISOString()}`
			);
			event.locals.session = {
				accessToken: session.accessToken,
				refreshToken: session.refreshToken,
				expiresAt: session.expiresAt
			};
		} else {
			console.warn(
				`[HOOKS] Session cookie INVALID (HMAC failed or structural validation failed) — deleting cookie`
			);
			event.locals.session = null;
			event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
		}
	} else {
		console.log(`[HOOKS] No session cookie — unauthenticated request`);
		event.locals.session = null;
	}

	return resolve(event);
};
