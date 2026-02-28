/**
 * @fileoverview Search page server load — uses YouTube's single mixed search endpoint.
 *
 * Always fetches all three types (video, channel, playlist) in one API call,
 * returning results interleaved by YouTube's natural relevance ordering.
 * Type filtering is handled client-side for instant chip toggling.
 *
 * Uses streaming so the page renders instantly with skeletons.
 *
 * NOTE: No fill-page loop here — search costs 100 quota units per API call,
 * so we only fetch a single page to conserve quota.
 */
import type { PageServerLoad } from './$types';
import type { VideoItem, ChannelItem, PlaylistItem } from '$lib/types';
import { searchMixed } from '$lib/server/youtube';
import { filterOutShorts, filterOutBrokenVideos } from '$lib/server/shorts';

export type SearchResult =
	| { type: 'video'; item: VideoItem }
	| { type: 'channel'; item: ChannelItem }
	| { type: 'playlist'; item: PlaylistItem };

async function fetchSearchResults(query: string, pageToken?: string) {
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

	const results: SearchResult[] = [];
	for (const r of rawResults) {
		if (r.type === 'video') {
			if (filteredVideoIds.has(r.item.id)) {
				results.push(r);
			}
		} else {
			results.push(r);
		}
	}

	return { results, nextPageToken: nextToken };
}

export const load: PageServerLoad = async ({ url }) => {
	const query = url.searchParams.get('q');
	const pageToken = url.searchParams.get('pageToken') ?? undefined;

	if (!query) {
		return { query: '', results: [] as SearchResult[], nextPageToken: undefined };
	}

	return {
		query,
		streamed: {
			searchData: fetchSearchResults(query, pageToken).catch((err) => {
				console.error('[SEARCH PAGE] Search FAILED:', err);
				return { results: [] as SearchResult[], nextPageToken: undefined };
			})
		}
	};
};
