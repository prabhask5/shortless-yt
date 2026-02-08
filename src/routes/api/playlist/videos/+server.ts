import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPlaylistVideos } from '$lib/server/youtube-api';
import { checkRateLimit } from '$lib/server/rate-limiter';

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/playlist/videos');
	if (!limit.allowed) {
		return json(
			{ error: 'Rate limit exceeded' },
			{ status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
		);
	}

	const id = url.searchParams.get('id');
	if (!id) return json({ error: 'Missing playlist id' }, { status: 400 });

	const pageToken = url.searchParams.get('pageToken') || undefined;

	try {
		const result = await getPlaylistVideos(id, pageToken);
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
