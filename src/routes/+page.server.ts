/**
 * @fileoverview Home page server load — dual strategy for authenticated vs anonymous users.
 *
 * Authenticated users see their subscription channels (horizontal bar) plus
 * trending videos. Anonymous users see category chips plus trending videos.
 *
 * Both paths run their YouTube API calls in parallel via `Promise.all` to
 * minimize total latency. All video results pass through `filterOutShorts`
 * to strip YouTube Shorts from the feed (the core feature of this app).
 */
import type { PageServerLoad } from './$types';
import type { PaginatedResult, VideoItem, ChannelItem } from '$lib/types';
import { getTrending, getVideoCategories, getSubscriptions } from '$lib/server/youtube';
import { filterOutShorts } from '$lib/server/shorts';

/* Empty fallbacks used when API calls fail gracefully.
 * This prevents the page from erroring out entirely if, for example,
 * the user's OAuth token has expired but the trending endpoint still works. */
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
		/* Authenticated path: fetch subscriptions (requires user token) and
		 * trending videos in parallel. Either can fail independently without
		 * breaking the whole page thanks to the .catch() fallbacks. */
		const [subscriptions, trending] = await Promise.all([
			getSubscriptions(locals.session.accessToken).catch(() => emptyChannels),
			getTrending().catch(() => emptyVideos)
		]);

		const filteredTrending = await filterOutShorts(trending.items);

		/* `authenticated: true as const` creates a discriminated union so the
		 * Svelte page can narrow the type and access `subscriptions` safely. */
		return {
			authenticated: true as const,
			subscriptions: subscriptions.items,
			trending: filteredTrending,
			nextPageToken: trending.pageInfo.nextPageToken
		};
	}

	/* Anonymous path: show category chips (no auth needed) alongside trending.
	 * Both calls are wrapped in .catch() so the page still renders even if
	 * the API key is invalid or quota is exhausted. */
	const [trending, categories] = await Promise.all([
		getTrending().catch(() => emptyVideos),
		getVideoCategories().catch(() => [] as { id: string; title: string }[])
	]);

	const filteredTrending = await filterOutShorts(trending.items);

	return {
		authenticated: false as const,
		trending: filteredTrending,
		categories,
		nextPageToken: trending.pageInfo.nextPageToken
	};
};
