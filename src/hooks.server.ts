import type { Handle } from '@sveltejs/kit';
import { decryptSession, SESSION_COOKIE_NAME } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	const cookie = event.cookies.get(SESSION_COOKIE_NAME);
	if (cookie) {
		const session = decryptSession(cookie);
		if (session) {
			event.locals.session = {
				accessToken: session.accessToken,
				refreshToken: session.refreshToken,
				expiresAt: session.expiresAt
			};
		} else {
			event.locals.session = null;
			event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
		}
	} else {
		event.locals.session = null;
	}

	return resolve(event);
};
