/**
 * @fileoverview Watch page server load — fetches everything needed to render
 * a single video view: video details, channel info, and the first page of comments.
 *
 * The load is structured in two sequential phases:
 * 1. Fetch video details first (we need the video's `channelId` for step 2).
 * 2. Fetch channel details and comments in parallel, since they are independent.
 *
 * The `t` query parameter (start time in seconds) is parsed and passed through
 * so the embedded player can seek to the correct position on load.
 */
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { PaginatedResult, CommentItem } from '$lib/types';
import { getVideoDetails, getComments, getChannelDetails } from '$lib/server/youtube';

/* Factory function (not a constant) because we need a fresh object each time
 * to avoid shared mutable state between requests. */
const emptyComments = (): PaginatedResult<CommentItem> => ({
	items: [],
	pageInfo: { totalResults: 0 }
});

export const load: PageServerLoad = async ({ url }) => {
	const videoId = url.searchParams.get('v');
	if (!videoId) {
		throw error(400, 'Missing video ID');
	}

	/* Parse the optional `t` (time) param, used for chapter links and shared
	 * timestamps (e.g. /watch?v=abc&t=120 starts at 2:00) */
	const startTime = url.searchParams.get('t');

	/* Phase 1: fetch video details first -- we need channelId for the next step */
	const videos = await getVideoDetails([videoId]);

	if (videos.length === 0) {
		throw error(404, 'Video not found');
	}

	const video = videos[0];

	/* Phase 2: fetch channel details and comments in parallel.
	 * Comments use .catch() so a failure (e.g. comments disabled) does not
	 * break the entire page. */
	const [channels, comments] = await Promise.all([
		getChannelDetails([video.channelId]),
		getComments(videoId).catch(emptyComments)
	]);

	const channel = channels[0] ?? null;

	return {
		video,
		channel,
		comments: comments.items,
		commentsNextPageToken: comments.pageInfo.nextPageToken,
		startTime: startTime ? parseInt(startTime, 10) : undefined
	};
};
