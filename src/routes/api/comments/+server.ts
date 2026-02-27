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
	console.log('[API COMMENTS] Comment request, videoId:', videoId, 'pageToken:', pageToken);

	if (!videoId) {
		console.error('[API COMMENTS] Missing videoId parameter');
		throw error(400, 'Missing videoId parameter');
	}

	if (!pageToken) {
		console.error('[API COMMENTS] Missing pageToken parameter');
		throw error(400, 'Missing pageToken parameter');
	}

	try {
		const result = await getComments(videoId, pageToken);
		console.log('[API COMMENTS] Returning', result.items.length, 'comments for video:', videoId);
		return json({
			comments: result.items,
			nextPageToken: result.pageInfo.nextPageToken
		});
	} catch (err) {
		console.error('[API COMMENTS] getComments FAILED for', videoId, ':', err);
		return json({ comments: [], nextPageToken: undefined });
	}
};
