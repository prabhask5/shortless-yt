/**
 * @fileoverview Comment replies API endpoint.
 *
 * Fetches replies to a specific top-level comment thread. Used client-side
 * when the user clicks the "N replies" button on a comment.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCommentReplies } from '$lib/server/youtube';

export const GET: RequestHandler = async ({ url }) => {
	const commentId = url.searchParams.get('commentId');
	const pageToken = url.searchParams.get('pageToken') ?? undefined;
	console.log('[API REPLIES] Reply request, commentId:', commentId, 'pageToken:', pageToken);

	if (!commentId) {
		console.error('[API REPLIES] Missing commentId parameter');
		throw error(400, 'Missing commentId parameter');
	}

	try {
		const result = await getCommentReplies(commentId, pageToken);
		console.log('[API REPLIES] Returning', result.items.length, 'replies for comment:', commentId);
		return json(
			{
				replies: result.items,
				nextPageToken: result.pageInfo.nextPageToken
			},
			{
				headers: { 'Cache-Control': 'public, max-age=300' }
			}
		);
	} catch (err) {
		console.error('[API REPLIES] getCommentReplies FAILED for', commentId, ':', err);
		return json({ replies: [], nextPageToken: undefined });
	}
};
