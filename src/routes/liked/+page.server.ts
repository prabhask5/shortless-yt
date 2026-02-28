/**
 * @fileoverview Liked videos page server load — auth-gated route.
 *
 * Uses streaming so the page renders instantly with skeletons while
 * liked videos are fetched in the background.
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { VideoItem } from '$lib/types';
import { getLikedVideos } from '$lib/server/youtube';
import { filterOutShorts, filterOutBrokenVideos } from '$lib/server/shorts';

/** Minimum filtered videos to collect before showing the initial page. */
const TARGET_INITIAL_VIDEOS = 12;
/** Maximum API pages to fetch during initial load to prevent runaway usage. */
const MAX_INITIAL_PAGES = 6;

async function fetchLikedVideos(accessToken: string) {
	const collected: VideoItem[] = [];
	let currentToken: string | undefined = undefined;

	for (let page = 0; page < MAX_INITIAL_PAGES; page++) {
		let result;
		try {
			result = await getLikedVideos(accessToken, currentToken);
		} catch (err) {
			console.error('[LIKED PAGE] getLikedVideos FAILED:', err);
			break;
		}

		const clean = filterOutBrokenVideos(result.items);
		const filtered = await filterOutShorts(clean);
		collected.push(...filtered);
		currentToken = result.pageInfo.nextPageToken;

		if (collected.length >= TARGET_INITIAL_VIDEOS || !currentToken) break;
	}

	return {
		videos: collected,
		nextPageToken: currentToken
	};
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session) {
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
