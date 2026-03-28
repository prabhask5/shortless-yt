/**
 * @fileoverview Subscription feed page server load.
 *
 * Shows the chronological k-way merge of recent uploads from all subscribed channels,
 * with the subscription channel bar above the feed. Redirects to login if not signed in.
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { PaginatedResult, VideoItem, ChannelItem } from '$lib/types';
import { getSubscriptions, getSubscriptionFeed } from '$lib/server/youtube';
import type { SubFeedCursor } from '$lib/server/youtube';
import { filterOutShorts, filterOutBrokenVideos } from '$lib/server/shorts';

const TARGET_INITIAL_VIDEOS = 12;

const emptyChannels: PaginatedResult<ChannelItem> = {
	items: [],
	pageInfo: { totalResults: 0 }
};

async function fetchSubscriptionData(accessToken: string, userId: string) {
	const subscriptionsPromise = getSubscriptions(accessToken, userId).catch((err) => {
		console.error('[SUBSCRIPTION PAGE] getSubscriptions FAILED:', err);
		return emptyChannels;
	});

	const collected: VideoItem[] = [];
	let hasMore = true;
	let cursor: SubFeedCursor | undefined = undefined;

	while (collected.length < TARGET_INITIAL_VIDEOS && hasMore) {
		let feedResult;
		try {
			feedResult = await getSubscriptionFeed(accessToken, userId, cursor);
		} catch (err) {
			console.error('[SUBSCRIPTION PAGE] getSubscriptionFeed FAILED:', err);
			break;
		}

		const clean = filterOutBrokenVideos(feedResult.items);
		const filtered = await filterOutShorts(clean);
		collected.push(...filtered);
		cursor = feedResult.cursor;
		hasMore = !!cursor;
	}

	const subscriptions = await subscriptionsPromise;

	return {
		subscriptions: subscriptions.items,
		feed: collected,
		cursor
	};
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session) redirect(302, '/api/auth/login');

	return {
		streamed: {
			subData: fetchSubscriptionData(locals.session.accessToken, locals.session.channelId)
		}
	};
};
