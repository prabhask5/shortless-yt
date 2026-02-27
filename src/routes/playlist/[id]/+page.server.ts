import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPlaylist, getPlaylistVideos } from '$lib/server/youtube';
import { filterOutShorts } from '$lib/server/shorts';

export const load: PageServerLoad = async ({ params }) => {
	const playlistId = params.id;

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
