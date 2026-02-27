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

const emptyChannels: PaginatedResult<ChannelItem> = {
	items: [],
	pageInfo: { totalResults: 0 }
};

const emptyVideos: PaginatedResult<VideoItem> = {
	items: [],
	pageInfo: { totalResults: 0 }
};

export const load: PageServerLoad = async ({ locals }) => {
	console.log('[HOME PAGE] Loading home page, authenticated:', !!locals.session);

	if (locals.session) {
		console.log('[HOME PAGE] Authenticated path — fetching subscriptions + trending in parallel');
		const [subscriptions, trending] = await Promise.all([
			getSubscriptions(locals.session.accessToken).catch((err) => {
				console.error('[HOME PAGE] getSubscriptions FAILED:', err);
				return emptyChannels;
			}),
			getTrending().catch((err) => {
				console.error('[HOME PAGE] getTrending FAILED (auth path):', err);
				return emptyVideos;
			})
		]);

		console.log(
			'[HOME PAGE] Auth results — subscriptions:',
			subscriptions.items.length,
			'trending:',
			trending.items.length
		);
		const filteredTrending = await filterOutShorts(trending.items);
		console.log(
			'[HOME PAGE] After shorts filter:',
			filteredTrending.length,
			'videos remain (from',
			trending.items.length,
			')'
		);

		return {
			authenticated: true as const,
			subscriptions: subscriptions.items,
			trending: filteredTrending,
			nextPageToken: trending.pageInfo.nextPageToken
		};
	}

	console.log('[HOME PAGE] Anonymous path — fetching trending + categories in parallel');
	const [trending, categories] = await Promise.all([
		getTrending().catch((err) => {
			console.error('[HOME PAGE] getTrending FAILED (anon path):', err);
			return emptyVideos;
		}),
		getVideoCategories().catch((err) => {
			console.error('[HOME PAGE] getVideoCategories FAILED:', err);
			return [] as { id: string; title: string }[];
		})
	]);

	console.log(
		'[HOME PAGE] Anon results — trending:',
		trending.items.length,
		'categories:',
		categories.length
	);
	const filteredTrending = await filterOutShorts(trending.items);
	console.log(
		'[HOME PAGE] After shorts filter:',
		filteredTrending.length,
		'videos remain (from',
		trending.items.length,
		')'
	);

	return {
		authenticated: false as const,
		trending: filteredTrending,
		categories,
		nextPageToken: trending.pageInfo.nextPageToken
	};
};
