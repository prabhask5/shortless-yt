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

	const sessionId = cookies.get('session_id');
	if (!sessionId) {
		return json({ isSignedIn: false, user: null });
	}

	const session = await getValidSession(sessionId);
	if (!session) {
		cookies.delete('session_id', { path: '/' });
		return json({ isSignedIn: false, user: null });
	}

	return json({ isSignedIn: true, user: session.user });
};
