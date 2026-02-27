/**
 * @fileoverview Search page server load — fetches all selected result types in parallel.
 *
 * By default, all three types (video, channel, playlist) are fetched simultaneously.
 * The `types` query parameter accepts a comma-separated list to filter to specific types.
 *
 * Results are returned as a tagged union array so the client can render the
 * appropriate card component for each result.
 */
import type { PageServerLoad } from './$types';
import type { VideoItem, ChannelItem, PlaylistItem } from '$lib/types';
import { searchVideos, searchChannels, searchPlaylists } from '$lib/server/youtube';
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
		const results: SearchResult[] = [];
		const fetches: Promise<void>[] = [];

		if (types.includes('video')) {
			fetches.push(
				searchVideos(query, { pageToken, videoDuration: 'medium' })
					.then(async (result) => {
						console.log(
							'[SEARCH PAGE] Video search returned',
							result.items.length,
							'results before filtering'
						);
						const clean = filterOutBrokenVideos(result.items);
						const filtered = await filterOutShorts(clean);
						console.log('[SEARCH PAGE] After filtering:', filtered.length, 'videos remain');
						for (const item of filtered) {
							results.push({ type: 'video', item });
						}
					})
					.catch((err) => {
						console.error('[SEARCH PAGE] Video search FAILED:', err);
					})
			);
		}

		if (types.includes('channel')) {
			fetches.push(
				searchChannels(query, pageToken)
					.then((result) => {
						console.log('[SEARCH PAGE] Channel search returned', result.items.length, 'results');
						for (const item of result.items) {
							results.push({ type: 'channel', item });
						}
					})
					.catch((err) => {
						console.error('[SEARCH PAGE] Channel search FAILED:', err);
					})
			);
		}

		if (types.includes('playlist')) {
			fetches.push(
				searchPlaylists(query, pageToken)
					.then((result) => {
						console.log('[SEARCH PAGE] Playlist search returned', result.items.length, 'results');
						for (const item of result.items) {
							results.push({ type: 'playlist', item });
						}
					})
					.catch((err) => {
						console.error('[SEARCH PAGE] Playlist search FAILED:', err);
					})
			);
		}

		await Promise.all(fetches);
		console.log('[SEARCH PAGE] Total combined results:', results.length);

		return { query, types, results, nextPageToken: pageToken };
	} catch (err) {
		console.error('[SEARCH PAGE] Search FAILED:', err);
		return { query, types, results: [] as SearchResult[], nextPageToken: undefined };
	}
};
