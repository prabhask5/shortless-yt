/**
 * @fileoverview Search page server load — dispatches to the correct YouTube
 * search endpoint based on the `type` query parameter (video, channel, or playlist).
 *
 * For video searches, Shorts are excluded through two complementary mechanisms:
 * 1. `videoDuration: 'medium'` tells the YouTube API to omit videos under 4 minutes,
 *    which eliminates most Shorts at the API level.
 * 2. `filterOutShorts` performs a second pass to catch any that slip through
 *    (e.g. videos just over the duration threshold that are still tagged as Shorts).
 *
 * Channel and playlist searches do not need Shorts filtering since they return
 * different resource types entirely.
 */
import type { PageServerLoad } from './$types';
import { searchVideos, searchChannels, searchPlaylists } from '$lib/server/youtube';
import { filterOutShorts } from '$lib/server/shorts';

export const load: PageServerLoad = async ({ url }) => {
	const query = url.searchParams.get('q');
	const type = (url.searchParams.get('type') as 'video' | 'channel' | 'playlist') || 'video';
	const pageToken = url.searchParams.get('pageToken') ?? undefined;

	console.log(
		'[SEARCH PAGE] Loading search, query:',
		query,
		'type:',
		type,
		'pageToken:',
		pageToken
	);

	if (!query) {
		console.log('[SEARCH PAGE] No query — returning empty results');
		return { query: '', type, results: [], nextPageToken: undefined };
	}

	try {
		if (type === 'channel') {
			console.log('[SEARCH PAGE] Searching channels for:', query);
			const result = await searchChannels(query, pageToken);
			console.log('[SEARCH PAGE] Channel search returned', result.items.length, 'results');
			return { query, type, results: result.items, nextPageToken: result.pageInfo.nextPageToken };
		}

		if (type === 'playlist') {
			console.log('[SEARCH PAGE] Searching playlists for:', query);
			const result = await searchPlaylists(query, pageToken);
			console.log('[SEARCH PAGE] Playlist search returned', result.items.length, 'results');
			return { query, type, results: result.items, nextPageToken: result.pageInfo.nextPageToken };
		}

		console.log('[SEARCH PAGE] Searching videos for:', query);
		const result = await searchVideos(query, { pageToken, videoDuration: 'medium' });
		console.log(
			'[SEARCH PAGE] Video search returned',
			result.items.length,
			'results before shorts filter'
		);
		const filtered = await filterOutShorts(result.items);
		console.log('[SEARCH PAGE] After shorts filter:', filtered.length, 'videos remain');
		return { query, type, results: filtered, nextPageToken: result.pageInfo.nextPageToken };
	} catch (err) {
		console.error('[SEARCH PAGE] Search FAILED for query:', query, 'type:', type, 'error:', err);
		return { query, type, results: [], nextPageToken: undefined };
	}
};
