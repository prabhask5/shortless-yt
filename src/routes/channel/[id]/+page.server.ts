/**
 * @fileoverview Channel page server load — fetches channel profile, videos, and subscription status.
 *
 * Step 1 (blocking): Fetch channel details — needed for banner, profile, and 404 check.
 * Step 2 (streamed): Videos and subscription status load in the background.
 */
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { VideoItem } from '$lib/types';
import { getChannelDetails, getChannelVideos, checkSubscription } from '$lib/server/youtube';
import { filterOutShorts, filterOutBrokenVideos } from '$lib/server/shorts';

/** Minimum number of non-short videos to collect before showing the initial page. */
const TARGET_INITIAL_VIDEOS = 12;
/** Maximum API pages to fetch during initial load to prevent runaway usage. */
const MAX_INITIAL_PAGES = 6;

async function fetchChannelVideos(channelId: string, accessToken?: string) {
	const isSubscribedPromise = accessToken
		? checkSubscription(accessToken, channelId).catch(() => false)
		: Promise.resolve(false);

	const collected: VideoItem[] = [];
	let currentToken: string | undefined = undefined;

	for (let page = 0; page < MAX_INITIAL_PAGES; page++) {
		let videosResult;
		try {
			videosResult = await getChannelVideos(channelId, currentToken);
		} catch (err) {
			console.error('[CHANNEL PAGE] video fetch FAILED for', channelId, ':', err);
			break;
		}

		let filtered = filterOutBrokenVideos(videosResult.items);
		filtered = await filterOutShorts(filtered);
		collected.push(...filtered);

		const nextToken =
			'nextPageToken' in videosResult.pageInfo
				? (videosResult.pageInfo.nextPageToken as string | undefined)
				: undefined;
		currentToken = nextToken;

		if (collected.length >= TARGET_INITIAL_VIDEOS || !currentToken) break;
	}

	collected.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

	const isSubscribed = await isSubscribedPromise;

	return {
		videos: collected,
		isSubscribed,
		nextPageToken: currentToken
	};
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const channelId = params.id;

	let channels;
	try {
		channels = await getChannelDetails([channelId]);
	} catch (err) {
		console.error('[CHANNEL PAGE] getChannelDetails FAILED for', channelId, ':', err);
		throw error(500, 'Failed to load channel');
	}

	if (channels.length === 0) {
		throw error(404, 'Channel not found');
	}

	const channel = channels[0];

	return {
		channel,
		streamed: {
			channelData: fetchChannelVideos(channelId, locals.session?.accessToken)
		}
	};
};
