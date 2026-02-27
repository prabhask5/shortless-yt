/**
 * @fileoverview Unified video pagination API endpoint.
 *
 * The first page of videos is loaded server-side in each page's
 * `+page.server.ts` load function. Subsequent pages are fetched client-side
 * through this endpoint to avoid full-page navigations.
 *
 * Supports multiple sources:
 * - `?source=trending&pageToken=X&categoryId=Y` — trending videos
 * - `?source=channel&pageToken=X&channelId=Y` — channel uploads
 * - `?source=liked&pageToken=X` — authenticated user's liked videos
 * - `?source=search&pageToken=X&q=Y` — search results (mixed types)
 * - `?source=subfeed&pageTokens=JSON&playlistIds=JSON` — subscription feed
 *
 * All video responses are filtered through `filterOutBrokenVideos` + `filterOutShorts`.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getTrending,
	getChannelVideos,
	getLikedVideos,
	searchMixed,
	getSubscriptionFeed
} from '$lib/server/youtube';
import type { SubFeedCursor } from '$lib/server/youtube';
import { filterOutShorts, filterOutBrokenVideos } from '$lib/server/shorts';
import type { VideoItem } from '$lib/types';

export const GET: RequestHandler = async ({ url, locals }) => {
	const source = url.searchParams.get('source');
	const pageToken = url.searchParams.get('pageToken');

	console.log('[API VIDEOS] Request, source:', source, 'pageToken:', pageToken);

	if (!source) {
		throw error(400, 'Missing source parameter');
	}

	try {
		if (source === 'trending') {
			if (!pageToken) throw error(400, 'Missing pageToken parameter');
			const categoryId = url.searchParams.get('categoryId') || undefined;
			const result = await getTrending(categoryId, pageToken);
			const clean = filterOutBrokenVideos(result.items);
			const filtered = await filterOutShorts(clean);
			console.log('[API VIDEOS] Trending: returning', filtered.length, 'videos');
			return json(
				{ items: filtered, nextPageToken: result.pageInfo.nextPageToken },
				{ headers: { 'Cache-Control': 'public, max-age=300' } }
			);
		}

		if (source === 'channel') {
			if (!pageToken) throw error(400, 'Missing pageToken parameter');
			const channelId = url.searchParams.get('channelId');
			if (!channelId) {
				throw error(400, 'Missing channelId parameter');
			}
			const result = await getChannelVideos(channelId, pageToken);
			const clean = filterOutBrokenVideos(result.items);
			const filtered = await filterOutShorts(clean);
			console.log('[API VIDEOS] Channel: returning', filtered.length, 'videos');
			return json(
				{ items: filtered, nextPageToken: result.pageInfo.nextPageToken },
				{ headers: { 'Cache-Control': 'public, max-age=300' } }
			);
		}

		if (source === 'liked') {
			if (!pageToken) throw error(400, 'Missing pageToken parameter');
			if (!locals.session) {
				throw error(401, 'Authentication required');
			}
			const result = await getLikedVideos(locals.session.accessToken, pageToken);
			const clean = filterOutBrokenVideos(result.items);
			const filtered = await filterOutShorts(clean);
			console.log('[API VIDEOS] Liked: returning', filtered.length, 'videos');
			return json(
				{ items: filtered, nextPageToken: result.pageInfo.nextPageToken },
				{ headers: { 'Cache-Control': 'private, max-age=60' } }
			);
		}

		if (source === 'search') {
			if (!pageToken) throw error(400, 'Missing pageToken parameter');
			const query = url.searchParams.get('q');
			if (!query) {
				throw error(400, 'Missing q parameter');
			}
			const { results: rawResults, nextPageToken: nextToken } = await searchMixed(
				query,
				['video', 'channel', 'playlist'],
				pageToken
			);

			const videoItems = rawResults
				.filter((r): r is { type: 'video'; item: VideoItem } => r.type === 'video')
				.map((r) => r.item);
			const cleanVideos = filterOutBrokenVideos(videoItems);
			const filteredVideos = await filterOutShorts(cleanVideos);
			const filteredVideoIds = new Set(filteredVideos.map((v) => v.id));

			const results = rawResults.filter(
				(r) => r.type !== 'video' || filteredVideoIds.has(r.item.id)
			);
			console.log('[API VIDEOS] Search: returning', results.length, 'results');
			return json(
				{ results, nextPageToken: nextToken },
				{ headers: { 'Cache-Control': 'public, max-age=300' } }
			);
		}

		if (source === 'subfeed') {
			if (!locals.session) {
				throw error(401, 'Authentication required');
			}
			const cursorRaw = url.searchParams.get('cursor');
			if (!cursorRaw) {
				throw error(400, 'Missing cursor parameter');
			}
			const feedCursor = JSON.parse(cursorRaw) as SubFeedCursor;
			const result = await getSubscriptionFeed(locals.session.accessToken, feedCursor);
			const clean = filterOutBrokenVideos(result.items);
			const filtered = await filterOutShorts(clean);
			console.log('[API VIDEOS] SubFeed: returning', filtered.length, 'videos');
			return json(
				{ items: filtered, cursor: result.cursor },
				{ headers: { 'Cache-Control': 'private, max-age=60' } }
			);
		}

		throw error(400, `Unknown source: ${source}`);
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('[API VIDEOS] FAILED:', err);
		return json({ items: [], nextPageToken: undefined });
	}
};
