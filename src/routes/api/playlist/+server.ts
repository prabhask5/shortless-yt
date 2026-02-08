import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPlaylistInfo } from '$lib/server/youtube-api';
import { checkRateLimit } from '$lib/server/rate-limiter';

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/playlist');
	if (!limit.allowed) {
		return json(
			{ error: 'Rate limit exceeded' },
			{ status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
		);
	}

	const id = url.searchParams.get('id');
	if (!id) return json({ error: 'Missing playlist id' }, { status: 400 });

	try {
		const result = await getPlaylistInfo(id);
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		const status = message === 'Playlist not found' ? 404 : 500;
		return json({ error: message }, { status });
	}
};
