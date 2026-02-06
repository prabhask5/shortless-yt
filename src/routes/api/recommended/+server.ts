import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTrendingVideos, getSubscriptionFeed } from '$lib/server/youtube-api';
import { getValidSession } from '$lib/server/auth';
import { checkRateLimit } from '$lib/server/rate-limiter';

export const GET: RequestHandler = async ({ url, cookies, getClientAddress }) => {
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/recommended');
	if (!limit.allowed) {
		return json({ error: 'Rate limit exceeded' }, { status: 429 });
	}

	const pageToken = url.searchParams.get('pageToken') || undefined;
	const offset = parseInt(url.searchParams.get('offset') || '0', 10);

	try {
		const sessionCookie = cookies.get('session_id');
		if (sessionCookie) {
			const session = await getValidSession(sessionCookie, cookies);
			if (session) {
				const result = await getSubscriptionFeed(
					session.accessToken,
					session.user.id,
					pageToken,
					offset
				);
				return json(result);
			}
		}

		// Not signed in or invalid session — return trending
		const result = await getTrendingVideos(pageToken);
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
