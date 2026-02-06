import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchVideos } from '$lib/server/youtube-api';
import { checkRateLimit } from '$lib/server/rate-limiter';

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/search');
	if (!limit.allowed) {
		return json(
			{ error: 'Rate limit exceeded' },
			{ status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
		);
	}

	const q = url.searchParams.get('q');
	if (!q) return json({ error: 'Missing query parameter q' }, { status: 400 });

	const pageToken = url.searchParams.get('pageToken') || undefined;
	const regionCode = url.searchParams.get('regionCode') || 'US';
	const relevanceLanguage = url.searchParams.get('relevanceLanguage') || 'en';

	try {
		const result = await searchVideos(q, pageToken, regionCode, relevanceLanguage);
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
