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

async function fetchLikedVideos(accessToken: string, userId: string) {
	const collected: VideoItem[] = [];
	let hasMore = true;
	let currentToken: string | undefined = undefined;

	while (collected.length < TARGET_INITIAL_VIDEOS && hasMore) {
		let result;
		try {
			result = await getLikedVideos(accessToken, userId, currentToken);
		} catch (err) {
			console.error('[LIKED PAGE] getLikedVideos FAILED:', err);
			break;
		}

		const clean = filterOutBrokenVideos(result.items);
		const filtered = await filterOutShorts(clean);
		collected.push(...filtered);
		currentToken = result.pageInfo.nextPageToken;
		hasMore = !!currentToken;
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
			likedData: fetchLikedVideos(locals.session.accessToken, locals.session.channelId).catch(
				(err) => {
					console.error('[LIKED PAGE] getLikedVideos FAILED:', err);
					return { videos: [], nextPageToken: undefined };
				}
			)
		}
	};
};
