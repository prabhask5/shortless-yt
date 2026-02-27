/**
 * @fileoverview Channel page server load — two-step fetch for channel profile and videos.
 *
 * Step 1: Fetch channel details (title, avatar, subscriber count, etc.) and
 *         validate that the channel exists (404 if not).
 * Step 2: Fetch the channel's uploaded videos and filter out Shorts.
 *
 * These steps are sequential (not parallel) because we want to 404 early if
 * the channel does not exist, avoiding a wasted videos API call.
 */
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getChannelDetails, getChannelVideos } from '$lib/server/youtube';
import { filterOutShorts } from '$lib/server/shorts';

export const load: PageServerLoad = async ({ params }) => {
	const channelId = params.id;

	/* Step 1: validate channel existence */
	const channels = await getChannelDetails([channelId]);
	if (channels.length === 0) {
		throw error(404, 'Channel not found');
	}

	/* Step 2: fetch videos and strip Shorts */
	const channel = channels[0];
	const videosResult = await getChannelVideos(channelId);
	const filteredVideos = await filterOutShorts(videosResult.items);

	return {
		channel,
		videos: filteredVideos,
		nextPageToken: videosResult.pageInfo.nextPageToken
	};
};
