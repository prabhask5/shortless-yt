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

	if (!query) {
		return { query: '', type, results: [], nextPageToken: undefined };
	}

	if (type === 'channel') {
		const result = await searchChannels(query, pageToken);
		return { query, type, results: result.items, nextPageToken: result.pageInfo.nextPageToken };
	}

	if (type === 'playlist') {
		const result = await searchPlaylists(query, pageToken);
		return { query, type, results: result.items, nextPageToken: result.pageInfo.nextPageToken };
	}

	/* Video search: request 'medium' duration to pre-filter Shorts at the API level,
	 * then run the secondary filterOutShorts pass for completeness. */
	const result = await searchVideos(query, { pageToken, videoDuration: 'medium' });
	const filtered = await filterOutShorts(result.items);
	return { query, type, results: filtered, nextPageToken: result.pageInfo.nextPageToken };
};
