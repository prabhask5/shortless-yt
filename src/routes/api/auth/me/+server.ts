import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getValidSession } from '$lib/server/auth';
import { checkRateLimit } from '$lib/server/rate-limiter';

export const GET: RequestHandler = async ({ cookies, getClientAddress }) => {
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/auth/me');
	if (!limit.allowed) {
		return json({ error: 'Rate limit exceeded' }, { status: 429 });
	}

	const sessionCookie = cookies.get('session_id');
	if (!sessionCookie) {
		return json({ isSignedIn: false, user: null });
	}

	const session = await getValidSession(sessionCookie, cookies);
	if (!session) {
		// Don't delete cookie — might be a transient failure (server restart)
		// The cookie is harmless if invalid and avoids forcing re-login unnecessarily
		return json({ isSignedIn: false, user: null });
	}

	return json({ isSignedIn: true, user: session.user });
};
