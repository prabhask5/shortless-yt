/**
 * @fileoverview Channel page server load — fetches channel profile, videos, and subscription status.
 *
 * Step 1 (blocking): Fetch channel details — needed for banner, profile, and 404 check.
 * Step 2 (streamed): Videos and subscription status load in the background.
 *
 * Supports sort order via `sort` query param: 'recent' (default), 'oldest', 'popular'.
 */
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { VideoItem } from '$lib/types';
import {
	getChannelDetails,
	getChannelVideos,
	checkSubscription,
	searchVideos
} from '$lib/server/youtube';
import { filterOutShorts, filterOutBrokenVideos } from '$lib/server/shorts';

async function fetchChannelVideos(channelId: string, sort: string, accessToken?: string) {
	const videoFetch =
		sort === 'popular'
			? searchVideos('', { order: 'viewCount', channelId })
			: getChannelVideos(channelId);

	const [videosResult, isSubscribed] = await Promise.all([
		videoFetch.catch((err) => {
			console.error('[CHANNEL PAGE] video fetch FAILED for', channelId, ':', err);
			return { items: [] as VideoItem[], pageInfo: { totalResults: 0 } };
		}),
		accessToken
			? checkSubscription(accessToken, channelId).catch(() => false)
			: Promise.resolve(false)
	]);

	let filteredVideos = filterOutBrokenVideos(videosResult.items);
	filteredVideos = await filterOutShorts(filteredVideos);

	if (sort === 'oldest') {
		filteredVideos = filteredVideos.reverse();
	}

	return {
		videos: filteredVideos,
		isSubscribed,
		nextPageToken:
			'nextPageToken' in videosResult.pageInfo ? videosResult.pageInfo.nextPageToken : undefined
	};
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const channelId = params.id;
	const sort = (url.searchParams.get('sort') as 'recent' | 'oldest' | 'popular') ?? 'recent';

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
		sort,
		streamed: {
			channelData: fetchChannelVideos(channelId, sort, locals.session?.accessToken)
		}
	};
};
