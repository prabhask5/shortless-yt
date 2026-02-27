/**
 * @fileoverview Playlist page server load — parallel fetch of playlist metadata and videos.
 *
 * Both the playlist details (title, thumbnail, description) and its video items
 * are fetched simultaneously via `Promise.all` since they are independent API calls.
 * After both resolve, Shorts are filtered from the video list before returning.
 *
 * The playlist existence check happens after the parallel fetch completes;
 * unlike the channel page, we cannot short-circuit early because both calls
 * are already in flight.
 */
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPlaylist, getPlaylistVideos } from '$lib/server/youtube';
import { filterOutShorts, filterOutBrokenVideos } from '$lib/server/shorts';

export const load: PageServerLoad = async ({ params }) => {
	const playlistId = params.id;
	console.log('[PLAYLIST PAGE] Loading playlist page, playlistId:', playlistId);

	console.log('[PLAYLIST PAGE] Fetching playlist metadata + videos in parallel');
	const [playlist, videosResult] = await Promise.all([
		getPlaylist(playlistId).catch((err) => {
			console.error('[PLAYLIST PAGE] getPlaylist FAILED for', playlistId, ':', err);
			return null;
		}),
		getPlaylistVideos(playlistId).catch((err) => {
			console.error('[PLAYLIST PAGE] getPlaylistVideos FAILED for', playlistId, ':', err);
			return {
				items: [] as import('$lib/types').VideoItem[],
				pageInfo: { totalResults: 0, nextPageToken: undefined as string | undefined }
			};
		})
	]);

	if (!playlist) {
		console.warn('[PLAYLIST PAGE] Playlist not found:', playlistId);
		throw error(404, 'Playlist not found');
	}

	console.log(
		'[PLAYLIST PAGE] Playlist:',
		playlist.title,
		'videos fetched:',
		videosResult.items.length
	);
	const cleanVideos = filterOutBrokenVideos(videosResult.items);
	const filteredVideos = await filterOutShorts(cleanVideos);
	console.log('[PLAYLIST PAGE] After shorts filter:', filteredVideos.length, 'videos remain');

	return {
		playlist,
		videos: filteredVideos,
		nextPageToken: videosResult.pageInfo.nextPageToken
	};
};
