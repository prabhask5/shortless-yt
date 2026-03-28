/**
 * @fileoverview Home page server load — curated feed for authenticated users, trending for anon.
 *
 * Authenticated users see a randomly-ordered curated feed drawn from their subscription
 * pool (pages 1 & 2 of each subscribed channel's uploads, shuffled, cached 7 days).
 * Each page load starts at a different random offset in the pool for variety.
 *
 * Anonymous users see category chips plus trending videos.
 *
 * Uses SvelteKit streaming: returns promises so the page renders immediately
 * with skeleton placeholders, then fills in when data arrives.
 */
import type { PageServerLoad } from './$types';
import type { VideoItem } from '$lib/types';
import {
	getTrending,
	getVideoCategories,
	getSubscriptions,
	getCuratedFeed
} from '$lib/server/youtube';
import { filterOutShorts, filterOutBrokenVideos } from '$lib/server/shorts';

/** Minimum filtered videos to collect before showing the initial page. */
const TARGET_INITIAL_VIDEOS = 12;

async function fetchCuratedData(accessToken: string, userId: string) {
	const subscriptionsPromise = getSubscriptions(accessToken, userId).catch((err) => {
		console.error('[HOME PAGE] getSubscriptions FAILED:', err);
		return { items: [], pageInfo: { totalResults: 0 } };
	});

	/* Fetch curated feed pages until we have enough filtered videos. */
	const collected: VideoItem[] = [];
	let cursorVal: import('$lib/server/youtube').CuratedFeedCursor | undefined = undefined;
	let hasMore = true;

	while (collected.length < TARGET_INITIAL_VIDEOS && hasMore) {
		let result;
		try {
			result = await getCuratedFeed(accessToken, userId, 20, cursorVal);
		} catch (err) {
			console.error('[HOME PAGE] getCuratedFeed FAILED:', err);
			break;
		}
		const clean = filterOutBrokenVideos(result.items);
		const filtered = await filterOutShorts(clean);
		collected.push(...filtered);
		cursorVal = result.cursor;
		hasMore = !!cursorVal;
	}

	const subscriptions = await subscriptionsPromise;

	return {
		subscriptions: subscriptions.items,
		feed: collected,
		cursor: cursorVal
	};
}

async function fetchAnonData(categoryId?: string) {
	const categoriesPromise = getVideoCategories().catch((err) => {
		console.error('[HOME PAGE] getVideoCategories FAILED:', err);
		return [] as { id: string; title: string }[];
	});

	const collected: VideoItem[] = [];
	let hasMore = true;
	let currentToken: string | undefined = undefined;

	while (collected.length < TARGET_INITIAL_VIDEOS && hasMore) {
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
		hasMore = !!currentToken;
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
				authData: fetchCuratedData(locals.session.accessToken, locals.session.channelId)
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
