import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getChannelDetails, getChannelVideos } from '$lib/server/youtube';
import { filterOutShorts } from '$lib/server/shorts';

export const load: PageServerLoad = async ({ params }) => {
	const channelId = params.id;

	const channels = await getChannelDetails([channelId]);
	if (channels.length === 0) {
		throw error(404, 'Channel not found');
	}

	const channel = channels[0];
	const videosResult = await getChannelVideos(channelId);
	const filteredVideos = await filterOutShorts(videosResult.items);

	return {
		channel,
		videos: filteredVideos,
		nextPageToken: videosResult.pageInfo.nextPageToken
	};
};
