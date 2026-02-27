/**
 * @fileoverview Watch page server load — fetches everything needed to render
 * a single video view: video details, channel info, related videos, and comments.
 *
 * Phase 1 (blocking): Fetch video details — needed for the player and title.
 * Phase 2 (streamed): Channel details, related videos, and comments load in
 * the background while the page renders with the video player.
 */
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { PaginatedResult, CommentItem, VideoItem } from '$lib/types';
import {
	getVideoDetails,
	getComments,
	getChannelDetails,
	getChannelVideos
} from '$lib/server/youtube';
import { filterOutShorts, filterOutBrokenVideos } from '$lib/server/shorts';

const emptyComments = (): PaginatedResult<CommentItem> => ({
	items: [],
	pageInfo: { totalResults: 0 }
});

const emptyUploads: PaginatedResult<VideoItem> = {
	items: [],
	pageInfo: { totalResults: 0 }
};

async function fetchSidebarData(videoId: string, channelId: string) {
	console.log(
		'[WATCH PAGE] Phase 2: Fetching channel details + channel uploads + comments in parallel'
	);
	const [channels, comments, channelUploads] = await Promise.all([
		getChannelDetails([channelId]).catch((err) => {
			console.error('[WATCH PAGE] getChannelDetails FAILED:', err);
			return [];
		}),
		getComments(videoId).catch((err) => {
			console.warn('[WATCH PAGE] getComments FAILED (may be disabled):', err);
			return emptyComments();
		}),
		getChannelVideos(channelId).catch((err) => {
			console.warn('[WATCH PAGE] Channel uploads FAILED:', err);
			return emptyUploads;
		})
	]);

	const channel = channels[0] ?? null;
	const relatedClean = filterOutBrokenVideos(channelUploads.items.filter((v) => v.id !== videoId));
	const relatedFiltered = await filterOutShorts(relatedClean);

	console.log(
		'[WATCH PAGE] Phase 2 complete — channel:',
		channel?.title ?? 'null',
		'comments:',
		comments.items.length,
		'more from channel:',
		relatedFiltered.length
	);

	return {
		channel,
		relatedVideos: relatedFiltered,
		comments: comments.items,
		commentsNextPageToken: comments.pageInfo.nextPageToken
	};
}

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

	return {
		video,
		startTime: startTime ? parseInt(startTime, 10) : undefined,
		streamed: {
			sidebarData: fetchSidebarData(videoId, video.channelId)
		}
	};
};
