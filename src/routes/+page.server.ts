/**
 * @fileoverview Home page server load — dual strategy for authenticated vs anonymous users.
 *
 * Authenticated users see their subscription channels (horizontal bar) plus
 * recent videos from subscribed channels. Anonymous users see category chips
 * plus trending videos.
 *
 * Uses SvelteKit streaming: returns promises so the page renders immediately
 * with skeleton placeholders, then fills in when data arrives.
 */
import type { PageServerLoad } from './$types';
import type { PaginatedResult, VideoItem, ChannelItem } from '$lib/types';
import {
	getTrending,
	getVideoCategories,
	getSubscriptions,
	getSubscriptionFeed
} from '$lib/server/youtube';
import type { SubFeedCursor } from '$lib/server/youtube';
import { filterOutShorts, filterOutBrokenVideos } from '$lib/server/shorts';

const emptyChannels: PaginatedResult<ChannelItem> = {
	items: [],
	pageInfo: { totalResults: 0 }
};

async function fetchAuthData(accessToken: string) {
	const [subscriptions, feedResult] = await Promise.all([
		getSubscriptions(accessToken).catch((err) => {
			console.error('[HOME PAGE] getSubscriptions FAILED:', err);
			return emptyChannels;
		}),
		getSubscriptionFeed(accessToken).catch((err) => {
			console.error('[HOME PAGE] getSubscriptionFeed FAILED:', err);
			return { items: [] as VideoItem[], cursor: undefined as SubFeedCursor | undefined };
		})
	]);

	const cleanFeed = filterOutBrokenVideos(feedResult.items);
	const filteredFeed = await filterOutShorts(cleanFeed);

	return {
		subscriptions: subscriptions.items,
		feed: filteredFeed,
		cursor: feedResult.cursor
	};
}

async function fetchAnonData(categoryId?: string) {
	const emptyVideos: PaginatedResult<VideoItem> = {
		items: [],
		pageInfo: { totalResults: 0 }
	};
	const [trending, categories] = await Promise.all([
		getTrending(categoryId).catch((err) => {
			console.error('[HOME PAGE] getTrending FAILED (anon path):', err);
			return emptyVideos;
		}),
		getVideoCategories().catch((err) => {
			console.error('[HOME PAGE] getVideoCategories FAILED:', err);
			return [] as { id: string; title: string }[];
		})
	]);

	const cleanTrending = filterOutBrokenVideos(trending.items);
	const filteredTrending = await filterOutShorts(cleanTrending);

	return {
		trending: filteredTrending,
		categories,
		nextPageToken: trending.pageInfo.nextPageToken
	};
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const categoryId = url.searchParams.get('category') || undefined;

	if (locals.session) {
		return {
			authenticated: true as const,
			streamed: {
				authData: fetchAuthData(locals.session.accessToken)
			}
		};
	}

	return {
		authenticated: false as const,
		selectedCategory: categoryId ?? '0',
		streamed: {
			anonData: fetchAnonData(categoryId)
		}
	};
};
