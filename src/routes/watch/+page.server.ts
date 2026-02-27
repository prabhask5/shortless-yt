import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { PaginatedResult, CommentItem } from '$lib/types';
import { getVideoDetails, getComments, getChannelDetails } from '$lib/server/youtube';

const emptyComments = (): PaginatedResult<CommentItem> => ({
	items: [],
	pageInfo: { totalResults: 0 }
});

export const load: PageServerLoad = async ({ url }) => {
	const videoId = url.searchParams.get('v');
	if (!videoId) {
		throw error(400, 'Missing video ID');
	}

	const startTime = url.searchParams.get('t');

	const videos = await getVideoDetails([videoId]);

	if (videos.length === 0) {
		throw error(404, 'Video not found');
	}

	const video = videos[0];

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
