/**
 * @fileoverview Liked videos page server load — auth-gated route.
 *
 * This route requires authentication because liked videos are per-user data
 * from the YouTube API. Unauthenticated users are redirected to the home page
 * rather than shown an error, since the nav link to this page is only visible
 * when logged in (the redirect is a safety net for direct URL access).
 *
 * Like all video-listing routes, results pass through `filterOutShorts` to
 * strip YouTube Shorts from the user's liked videos list.
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getLikedVideos } from '$lib/server/youtube';
import { filterOutShorts } from '$lib/server/shorts';

export const load: PageServerLoad = async ({ locals }) => {
	/* Auth guard: redirect unauthenticated users to home */
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
