import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChannelInfo } from '$lib/server/youtube-api';
import { checkRateLimit } from '$lib/server/rate-limiter';

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/channel');
	if (!limit.allowed) {
		return json(
			{ error: 'Rate limit exceeded' },
			{ status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
		);
	}

	const id = url.searchParams.get('id');
	if (!id) return json({ error: 'Missing channel id' }, { status: 400 });

	try {
		const result = await getChannelInfo(id);
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		const status = message === 'Channel not found' ? 404 : 500;
		return json({ error: message }, { status });
	}
};
