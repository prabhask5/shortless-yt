import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkSubscription } from '$lib/server/youtube-api';
import { getValidSession } from '$lib/server/auth';
import { checkRateLimit } from '$lib/server/rate-limiter';

export const GET: RequestHandler = async ({ url, cookies, getClientAddress }) => {
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/subscriptions/check');
	if (!limit.allowed) {
		return json(
			{ error: 'Rate limit exceeded' },
			{ status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
		);
	}

	const sessionCookie = cookies.get('session_id');
	if (!sessionCookie) {
		return json({ isSubscribed: false });
	}

	const session = await getValidSession(sessionCookie, cookies);
	if (!session) {
		return json({ isSubscribed: false });
	}

	const channelId = url.searchParams.get('channelId');
	if (!channelId) return json({ error: 'Missing channelId' }, { status: 400 });

	try {
		const isSubscribed = await checkSubscription(session.accessToken, session.user.id, channelId);
		return json({ isSubscribed });
	} catch {
		return json({ isSubscribed: false });
	}
};
