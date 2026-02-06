import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVideosByIds } from '$lib/server/youtube-api';
import { checkRateLimit } from '$lib/server/rate-limiter';

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/videos');
	if (!limit.allowed) {
		return json({ error: 'Rate limit exceeded' }, { status: 429 });
	}

	const ids = url.searchParams.get('ids');
	if (!ids) return json({ error: 'Missing ids parameter' }, { status: 400 });

	try {
		const videos = await getVideosByIds(ids);
		return json({ items: videos });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
