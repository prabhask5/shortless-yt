import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getComments, getCommentReplies } from '$lib/server/youtube-api';
import { checkRateLimit } from '$lib/server/rate-limiter';

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/comments');
	if (!limit.allowed) {
		return json({ error: 'Rate limit exceeded' }, { status: 429 });
	}

	const videoId = url.searchParams.get('id');
	const parentId = url.searchParams.get('parentId');

	if (parentId) {
		try {
			const pageToken = url.searchParams.get('pageToken') || undefined;
			const result = await getCommentReplies(parentId, pageToken);
			return json(result);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			return json({ error: message }, { status: 500 });
		}
	}

	if (!videoId) return json({ error: 'Missing id parameter' }, { status: 400 });

	const order = (url.searchParams.get('order') === 'newest' ? 'time' : 'relevance') as
		| 'relevance'
		| 'time';
	const pageToken = url.searchParams.get('pageToken') || undefined;

	try {
		const result = await getComments(videoId, order, pageToken);
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
