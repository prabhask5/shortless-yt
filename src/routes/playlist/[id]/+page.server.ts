/**
 * @fileoverview Playlist page server load — parallel fetch of playlist metadata and videos.
 *
 * Both the playlist details (title, thumbnail, description) and its video items
 * are fetched simultaneously via `Promise.all` since they are independent API calls.
 * After both resolve, Shorts are filtered from the video list before returning.
 */
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPlaylist, getPlaylistVideos } from '$lib/server/youtube';
import { filterOutShorts, filterOutBrokenVideos } from '$lib/server/shorts';
import type { VideoItem } from '$lib/types';

/** Minimum filtered videos to collect before displaying. */
const TARGET_INITIAL_VIDEOS = 12;
/** Maximum API pages to fetch during initial load. */
const MAX_INITIAL_PAGES = 6;

export const load: PageServerLoad = async ({ params }) => {
	const playlistId = params.id;

	const [playlist, firstPage] = await Promise.all([
		getPlaylist(playlistId).catch((err) => {
			console.error('[PLAYLIST PAGE] getPlaylist FAILED:', err);
			return null;
		}),
		getPlaylistVideos(playlistId).catch((err) => {
			console.error('[PLAYLIST PAGE] getPlaylistVideos FAILED:', err);
			return {
				items: [] as VideoItem[],
				pageInfo: { totalResults: 0, nextPageToken: undefined as string | undefined }
			};
		})
	]);

	if (!playlist) {
		throw error(404, 'Playlist not found');
	}

	/* Collect enough filtered videos across multiple pages */
	const collected: VideoItem[] = [];

	const clean = filterOutBrokenVideos(firstPage.items);
	const filtered = await filterOutShorts(clean);
	collected.push(...filtered);
	let currentToken: string | undefined = firstPage.pageInfo.nextPageToken;

	for (let page = 1; page < MAX_INITIAL_PAGES; page++) {
		if (collected.length >= TARGET_INITIAL_VIDEOS || !currentToken) break;

		let pageResult;
		try {
			pageResult = await getPlaylistVideos(playlistId, currentToken);
		} catch {
			break;
		}

		const pageClean = filterOutBrokenVideos(pageResult.items);
		const pageFiltered = await filterOutShorts(pageClean);
		collected.push(...pageFiltered);
		currentToken = pageResult.pageInfo.nextPageToken;
	}

	return {
		playlist,
		videos: collected,
		nextPageToken: currentToken
	};
};
