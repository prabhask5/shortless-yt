import type { PageServerLoad } from './$types';
import type { PaginatedResult, VideoItem, ChannelItem } from '$lib/types';
import { getTrending, getVideoCategories, getSubscriptions } from '$lib/server/youtube';
import { filterOutShorts } from '$lib/server/shorts';

const emptyChannels: PaginatedResult<ChannelItem> = {
	items: [],
	pageInfo: { totalResults: 0 }
};

const emptyVideos: PaginatedResult<VideoItem> = {
	items: [],
	pageInfo: { totalResults: 0 }
};

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.session) {
		const [subscriptions, trending] = await Promise.all([
			getSubscriptions(locals.session.accessToken).catch(() => emptyChannels),
			getTrending().catch(() => emptyVideos)
		]);

		const filteredTrending = await filterOutShorts(trending.items);

		return {
			authenticated: true as const,
			subscriptions: subscriptions.items,
			trending: filteredTrending,
			nextPageToken: trending.pageInfo.nextPageToken
		};
	}

	const [trending, categories] = await Promise.all([getTrending(), getVideoCategories()]);

	const filteredTrending = await filterOutShorts(trending.items);

	return {
		authenticated: false as const,
		trending: filteredTrending,
		categories,
		nextPageToken: trending.pageInfo.nextPageToken
	};
};
