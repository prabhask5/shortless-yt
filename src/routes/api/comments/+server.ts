import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getComments } from '$lib/server/youtube';

export const GET: RequestHandler = async ({ url }) => {
	const videoId = url.searchParams.get('videoId');
	const pageToken = url.searchParams.get('pageToken');

	if (!videoId) {
		throw error(400, 'Missing videoId parameter');
	}

	if (!pageToken) {
		throw error(400, 'Missing pageToken parameter');
	}

	const result = await getComments(videoId, pageToken);
	return json({
		comments: result.items,
		nextPageToken: result.pageInfo.nextPageToken
	});
};
