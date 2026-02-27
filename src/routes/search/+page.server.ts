/**
 * @fileoverview Search page server load — uses YouTube's single mixed search endpoint.
 *
 * By default, all three types (video, channel, playlist) are searched in one API call,
 * which returns results interleaved by relevance (YouTube's natural ordering).
 * The `types` query parameter accepts a comma-separated list to filter to specific types.
 *
 * Video results are filtered for broken videos and Shorts after the search.
 */
import type { PageServerLoad } from './$types';
import type { VideoItem, ChannelItem, PlaylistItem } from '$lib/types';
import { searchMixed } from '$lib/server/youtube';
import { filterOutShorts, filterOutBrokenVideos } from '$lib/server/shorts';

export type SearchResult =
	| { type: 'video'; item: VideoItem }
	| { type: 'channel'; item: ChannelItem }
	| { type: 'playlist'; item: PlaylistItem };

const VALID_TYPES = ['video', 'channel', 'playlist'] as const;

export const load: PageServerLoad = async ({ url }) => {
	const query = url.searchParams.get('q');
	const typesParam = url.searchParams.get('types') ?? 'video,channel,playlist';
	const types = typesParam
		.split(',')
		.filter((t): t is 'video' | 'channel' | 'playlist' =>
			VALID_TYPES.includes(t as (typeof VALID_TYPES)[number])
		);
	const pageToken = url.searchParams.get('pageToken') ?? undefined;

	console.log(
		'[SEARCH PAGE] Loading search, query:',
		query,
		'types:',
		types.join(','),
		'pageToken:',
		pageToken
	);

	if (!query) {
		console.log('[SEARCH PAGE] No query — returning empty results');
		return { query: '', types, results: [] as SearchResult[], nextPageToken: undefined };
	}

	try {
		const { results: rawResults, nextPageToken: nextToken } = await searchMixed(
			query,
			types,
			pageToken
		);

		console.log('[SEARCH PAGE] Mixed search returned', rawResults.length, 'results');

		// Filter video results: remove broken videos and shorts, keep channels/playlists as-is
		const videoItems = rawResults
			.filter((r): r is { type: 'video'; item: VideoItem } => r.type === 'video')
			.map((r) => r.item);

		const cleanVideos = filterOutBrokenVideos(videoItems);
		const filteredVideos = await filterOutShorts(cleanVideos);
		const filteredVideoIds = new Set(filteredVideos.map((v) => v.id));

		console.log(
			'[SEARCH PAGE] After filtering:',
			filteredVideos.length,
			'of',
			videoItems.length,
			'videos remain'
		);

		// Reconstruct results in original order, replacing video items with filtered versions
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

		console.log('[SEARCH PAGE] Final results:', results.length);
		return { query, types, results, nextPageToken: nextToken };
	} catch (err) {
		console.error('[SEARCH PAGE] Search FAILED:', err);
		return { query, types, results: [] as SearchResult[], nextPageToken: undefined };
	}
};
