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
	console.log('[CHANNEL PAGE] Loading channel page, channelId:', channelId);

	console.log('[CHANNEL PAGE] Step 1: Fetching channel details');
	let channels;
	try {
		channels = await getChannelDetails([channelId]);
	} catch (err) {
		console.error('[CHANNEL PAGE] getChannelDetails FAILED for', channelId, ':', err);
		throw error(500, 'Failed to load channel');
	}

	if (channels.length === 0) {
		console.warn('[CHANNEL PAGE] Channel not found:', channelId);
		throw error(404, 'Channel not found');
	}

	const channel = channels[0];
	console.log('[CHANNEL PAGE] Step 1 complete — channel:', channel.title);

	console.log('[CHANNEL PAGE] Step 2: Fetching channel videos');
	let videosResult;
	try {
		videosResult = await getChannelVideos(channelId);
	} catch (err) {
		console.error('[CHANNEL PAGE] getChannelVideos FAILED for', channelId, ':', err);
		videosResult = { items: [], pageInfo: { totalResults: 0 } };
	}

	console.log('[CHANNEL PAGE] Channel videos fetched:', videosResult.items.length);
	const filteredVideos = await filterOutShorts(videosResult.items);
	console.log('[CHANNEL PAGE] After shorts filter:', filteredVideos.length, 'videos remain');

	return {
		channel,
		videos: filteredVideos,
		nextPageToken: videosResult.pageInfo.nextPageToken
	};
};
