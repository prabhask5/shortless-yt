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
import { filterOutShorts } from '$lib/server/shorts';

export const load: PageServerLoad = async ({ params }) => {
	const playlistId = params.id;

	/* Fetch metadata and videos in parallel for minimum latency */
	const [playlist, videosResult] = await Promise.all([
		getPlaylist(playlistId),
		getPlaylistVideos(playlistId)
	]);

	if (!playlist) {
		throw error(404, 'Playlist not found');
	}

	const filteredVideos = await filterOutShorts(videosResult.items);

	return {
		playlist,
		videos: filteredVideos,
		nextPageToken: videosResult.pageInfo.nextPageToken
	};
};
