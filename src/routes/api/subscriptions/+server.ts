import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSubscriptions } from '$lib/server/youtube-api';
import { getValidSession } from '$lib/server/auth';
import { checkRateLimit } from '$lib/server/rate-limiter';

export const GET: RequestHandler = async ({ url, cookies, getClientAddress }) => {
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/subscriptions');
	if (!limit.allowed) {
		return json(
			{ error: 'Rate limit exceeded' },
			{ status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
		);
	}

	const sessionCookie = cookies.get('session_id');
	if (!sessionCookie) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const session = await getValidSession(sessionCookie, cookies);
	if (!session) {
		return json({ error: 'Invalid session' }, { status: 401 });
	}

	const pageToken = url.searchParams.get('pageToken') || undefined;

	try {
		const result = await getSubscriptions(session.accessToken, session.user.id, pageToken);
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
