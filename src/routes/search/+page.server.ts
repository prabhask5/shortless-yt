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

	const result = await searchVideos(query, { pageToken, videoDuration: 'medium' });
	const filtered = await filterOutShorts(result.items);
	return { query, type, results: filtered, nextPageToken: result.pageInfo.nextPageToken };
};
