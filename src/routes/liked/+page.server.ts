/**
 * @fileoverview Liked videos page server load — auth-gated route.
 *
 * Uses streaming so the page renders instantly with skeletons while
 * liked videos are fetched in the background.
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getLikedVideos } from '$lib/server/youtube';
import { filterOutShorts, filterOutBrokenVideos } from '$lib/server/shorts';

async function fetchLikedVideos(accessToken: string) {
	console.log('[LIKED PAGE] Fetching liked videos');
	const result = await getLikedVideos(accessToken);

	console.log('[LIKED PAGE] Liked videos fetched:', result.items.length);
	const clean = filterOutBrokenVideos(result.items);
	const filtered = await filterOutShorts(clean);
	console.log('[LIKED PAGE] After shorts filter:', filtered.length, 'videos remain');

	return {
		videos: filtered,
		nextPageToken: result.pageInfo.nextPageToken
	};
}

export const load: PageServerLoad = async ({ locals }) => {
	console.log('[LIKED PAGE] Loading liked videos, authenticated:', !!locals.session);

	if (!locals.session) {
		console.log('[LIKED PAGE] No session — redirecting to home');
		throw redirect(302, '/');
	}

	return {
		streamed: {
			likedData: fetchLikedVideos(locals.session.accessToken).catch((err) => {
				console.error('[LIKED PAGE] getLikedVideos FAILED:', err);
				return { videos: [], nextPageToken: undefined };
			})
		}
	};
};
