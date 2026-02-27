import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getLikedVideos } from '$lib/server/youtube';
import { filterOutShorts } from '$lib/server/shorts';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session) {
		throw redirect(302, '/');
	}

	const result = await getLikedVideos(locals.session.accessToken);
	const filtered = await filterOutShorts(result.items);

	return {
		videos: filtered,
		nextPageToken: result.pageInfo.nextPageToken
	};
};
