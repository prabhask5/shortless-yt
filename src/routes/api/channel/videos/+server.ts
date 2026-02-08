import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChannelVideos } from '$lib/server/youtube-api';
import { checkRateLimit } from '$lib/server/rate-limiter';

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/channel/videos');
	if (!limit.allowed) {
		return json(
			{ error: 'Rate limit exceeded' },
			{ status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
		);
	}

	const id = url.searchParams.get('id');
	if (!id) return json({ error: 'Missing channel id' }, { status: 400 });

	const order = (url.searchParams.get('order') || 'date') as 'date' | 'viewCount' | 'oldest';
	const pageToken = url.searchParams.get('pageToken') || undefined;

	try {
		const result = await getChannelVideos(id, order, pageToken);
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
