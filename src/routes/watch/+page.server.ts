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
	console.log('[WATCH PAGE] Loading watch page, videoId:', videoId);

	if (!videoId) {
		console.error('[WATCH PAGE] Missing video ID in URL');
		throw error(400, 'Missing video ID');
	}

	const startTime = url.searchParams.get('t');

	console.log('[WATCH PAGE] Phase 1: Fetching video details for', videoId);
	let videos;
	try {
		videos = await getVideoDetails([videoId]);
	} catch (err) {
		console.error('[WATCH PAGE] getVideoDetails FAILED for', videoId, ':', err);
		throw error(500, 'Failed to load video details');
	}

	if (videos.length === 0) {
		console.warn('[WATCH PAGE] Video not found:', videoId);
		throw error(404, 'Video not found');
	}

	const video = videos[0];
	console.log('[WATCH PAGE] Phase 1 complete — video:', video.title, 'channel:', video.channelId);

	console.log('[WATCH PAGE] Phase 2: Fetching channel details + comments in parallel');
	const [channels, comments] = await Promise.all([
		getChannelDetails([video.channelId]).catch((err) => {
			console.error('[WATCH PAGE] getChannelDetails FAILED:', err);
			return [];
		}),
		getComments(videoId).catch((err) => {
			console.warn('[WATCH PAGE] getComments FAILED (may be disabled):', err);
			return emptyComments();
		})
	]);

	const channel = channels[0] ?? null;
	console.log(
		'[WATCH PAGE] Phase 2 complete — channel:',
		channel?.title ?? 'null',
		'comments:',
		comments.items.length
	);

	return {
		video,
		channel,
		comments: comments.items,
		commentsNextPageToken: comments.pageInfo.nextPageToken,
		startTime: startTime ? parseInt(startTime, 10) : undefined
	};
};
