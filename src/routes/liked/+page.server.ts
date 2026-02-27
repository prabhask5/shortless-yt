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
import { filterOutShorts, filterOutBrokenVideos } from '$lib/server/shorts';

export const load: PageServerLoad = async ({ locals }) => {
	console.log('[LIKED PAGE] Loading liked videos, authenticated:', !!locals.session);

	if (!locals.session) {
		console.log('[LIKED PAGE] No session — redirecting to home');
		throw redirect(302, '/');
	}

	console.log('[LIKED PAGE] Fetching liked videos');
	let result;
	try {
		result = await getLikedVideos(locals.session.accessToken);
	} catch (err) {
		console.error('[LIKED PAGE] getLikedVideos FAILED:', err);
		return { videos: [], nextPageToken: undefined };
	}

	console.log('[LIKED PAGE] Liked videos fetched:', result.items.length);
	const clean = filterOutBrokenVideos(result.items);
	const filtered = await filterOutShorts(clean);
	console.log('[LIKED PAGE] After shorts filter:', filtered.length, 'videos remain');

	return {
		videos: filtered,
		nextPageToken: result.pageInfo.nextPageToken
	};
};
