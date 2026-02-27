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
 * - `?source=subfeed&cursor=JSON` — subscription feed
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

/**
 * Validate that a parsed subfeed cursor has the expected shape:
 * an array of objects with `playlistId: string` and `offset: number`.
 */
function isValidSubFeedCursor(value: unknown): value is SubFeedCursor {
	if (!Array.isArray(value)) return false;
	if (value.length > 15) return false;
	for (const item of value) {
		if (typeof item !== 'object' || item === null) return false;
		if (typeof (item as Record<string, unknown>).playlistId !== 'string') return false;
		if (typeof (item as Record<string, unknown>).offset !== 'number') return false;
	}
	return true;
}

export const GET: RequestHandler = async ({ url, locals }) => {
	const source = url.searchParams.get('source');
	const pageToken = url.searchParams.get('pageToken');

	if (!source) {
		throw error(400, 'Missing source parameter');
	}

	try {
		if (source === 'trending') {
			if (!pageToken) throw error(400, 'Missing pageToken parameter');
			if (pageToken.length > 200) throw error(400, 'pageToken too long');
			const categoryId = url.searchParams.get('categoryId') || undefined;
			const result = await getTrending(categoryId, pageToken);
			const clean = filterOutBrokenVideos(result.items);
			const filtered = await filterOutShorts(clean);
			return json(
				{ items: filtered, nextPageToken: result.pageInfo.nextPageToken },
				{ headers: { 'Cache-Control': 'public, max-age=300' } }
			);
		}

		if (source === 'channel') {
			if (!pageToken) throw error(400, 'Missing pageToken parameter');
			if (pageToken.length > 200) throw error(400, 'pageToken too long');
			const channelId = url.searchParams.get('channelId');
			if (!channelId) {
				throw error(400, 'Missing channelId parameter');
			}
			if (channelId.length > 30) throw error(400, 'channelId too long');
			const result = await getChannelVideos(channelId, pageToken);
			const clean = filterOutBrokenVideos(result.items);
			const filtered = await filterOutShorts(clean);
			return json(
				{ items: filtered, nextPageToken: result.pageInfo.nextPageToken },
				{ headers: { 'Cache-Control': 'public, max-age=300' } }
			);
		}

		if (source === 'liked') {
			if (!pageToken) throw error(400, 'Missing pageToken parameter');
			if (pageToken.length > 200) throw error(400, 'pageToken too long');
			if (!locals.session) {
				throw error(401, 'Authentication required');
			}
			const result = await getLikedVideos(locals.session.accessToken, pageToken);
			const clean = filterOutBrokenVideos(result.items);
			const filtered = await filterOutShorts(clean);
			return json(
				{ items: filtered, nextPageToken: result.pageInfo.nextPageToken },
				{ headers: { 'Cache-Control': 'private, max-age=60' } }
			);
		}

		if (source === 'search') {
			if (!pageToken) throw error(400, 'Missing pageToken parameter');
			if (pageToken.length > 200) throw error(400, 'pageToken too long');
			const query = url.searchParams.get('q');
			if (!query) {
				throw error(400, 'Missing q parameter');
			}
			if (query.length > 500) throw error(400, 'q too long');
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
			if (cursorRaw.length > 5000) throw error(400, 'cursor too long');

			let feedCursor: SubFeedCursor;
			try {
				const parsed = JSON.parse(cursorRaw);
				if (!isValidSubFeedCursor(parsed)) {
					throw error(400, 'Invalid cursor shape');
				}
				feedCursor = parsed;
			} catch (e) {
				if (e && typeof e === 'object' && 'status' in e) throw e;
				throw error(400, 'Invalid cursor JSON');
			}

			const result = await getSubscriptionFeed(locals.session.accessToken, feedCursor);
			const clean = filterOutBrokenVideos(result.items);
			const filtered = await filterOutShorts(clean);
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
