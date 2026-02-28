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

/** Minimum filtered videos to collect before showing the initial page. */
const TARGET_INITIAL_VIDEOS = 12;
/** Maximum API pages to fetch during initial load to prevent runaway usage. */
const MAX_INITIAL_PAGES = 6;

const emptyChannels: PaginatedResult<ChannelItem> = {
	items: [],
	pageInfo: { totalResults: 0 }
};

async function fetchAuthData(accessToken: string) {
	const subscriptionsPromise = getSubscriptions(accessToken).catch((err) => {
		console.error('[HOME PAGE] getSubscriptions FAILED:', err);
		return emptyChannels;
	});

	/* Fetch subscription feed pages until we have enough filtered videos. */
	const collected: VideoItem[] = [];
	let cursor: SubFeedCursor | undefined = undefined;

	for (let page = 0; page < MAX_INITIAL_PAGES; page++) {
		let feedResult;
		try {
			feedResult = await getSubscriptionFeed(accessToken, cursor);
		} catch (err) {
			console.error('[HOME PAGE] getSubscriptionFeed FAILED:', err);
			break;
		}

		const clean = filterOutBrokenVideos(feedResult.items);
		const filtered = await filterOutShorts(clean);
		collected.push(...filtered);
		cursor = feedResult.cursor;

		if (collected.length >= TARGET_INITIAL_VIDEOS || !cursor) break;
	}

	const subscriptions = await subscriptionsPromise;

	return {
		subscriptions: subscriptions.items,
		feed: collected,
		cursor
	};
}

async function fetchAnonData(categoryId?: string) {
	const categoriesPromise = getVideoCategories().catch((err) => {
		console.error('[HOME PAGE] getVideoCategories FAILED:', err);
		return [] as { id: string; title: string }[];
	});

	/* Fetch trending pages until we have enough filtered videos. */
	const collected: VideoItem[] = [];
	let currentToken: string | undefined = undefined;

	for (let page = 0; page < MAX_INITIAL_PAGES; page++) {
		let trending;
		try {
			trending = await getTrending(categoryId, currentToken);
		} catch (err) {
			console.error('[HOME PAGE] getTrending FAILED (anon path):', err);
			break;
		}

		const clean = filterOutBrokenVideos(trending.items);
		const filtered = await filterOutShorts(clean);
		collected.push(...filtered);
		currentToken = trending.pageInfo.nextPageToken;

		if (collected.length >= TARGET_INITIAL_VIDEOS || !currentToken) break;
	}

	const categories = await categoriesPromise;

	return {
		trending: collected,
		categories,
		nextPageToken: currentToken
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
