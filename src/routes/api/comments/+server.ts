/**
 * @fileoverview Comment pagination API endpoint.
 *
 * The first page of comments is loaded server-side in the watch page's
 * `+page.server.ts` load function. Subsequent pages are fetched client-side
 * through this endpoint to avoid full-page navigations when the user clicks
 * "load more comments".
 *
 * Both `videoId` and `pageToken` are required -- the initial page (no token)
 * is handled by the server load, so this endpoint only serves continuation
 * requests.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getComments } from '$lib/server/youtube';

export const GET: RequestHandler = async ({ url }) => {
	const videoId = url.searchParams.get('videoId');
	const pageToken = url.searchParams.get('pageToken');

	if (!videoId) {
		throw error(400, 'Missing videoId parameter');
	}
	if (videoId.length > 20) throw error(400, 'videoId too long');

	if (!pageToken) {
		throw error(400, 'Missing pageToken parameter');
	}
	if (pageToken.length > 200) throw error(400, 'pageToken too long');

	try {
		const result = await getComments(videoId, pageToken);
		/* Cache for 5 minutes — matches the server-side TTL cache duration for
		 * comments. Browsers and CDN edges can serve repeat requests for the same
		 * comment page without hitting the server. */
		return json(
			{
				comments: result.items,
				nextPageToken: result.pageInfo.nextPageToken
			},
			{
				headers: { 'Cache-Control': 'public, max-age=300' }
			}
		);
	} catch (err) {
		console.error('[API COMMENTS] getComments FAILED for', videoId, ':', err);
		return json({ comments: [], nextPageToken: undefined });
	}
};
