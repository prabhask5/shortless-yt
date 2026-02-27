import type { VideoItem } from '$lib/types.js';

/** Permanent cache for shorts detection results (videoId -> isShort) */
const shortsCache = new Map<string, boolean>();

/**
 * Parse an ISO 8601 duration string (PT#H#M#S) to total seconds.
 */
export function parseDurationSeconds(iso8601: string): number {
	const match = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
	if (!match) return 0;

	const hours = parseInt(match[1] ?? '0', 10);
	const minutes = parseInt(match[2] ?? '0', 10);
	const seconds = parseInt(match[3] ?? '0', 10);

	return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Check if a video is a YouTube Short by making a HEAD request to the shorts URL.
 * If the server responds with 200, it's a Short. If it redirects (303), it's a regular video.
 */
export async function isShort(videoId: string): Promise<boolean> {
	const cached = shortsCache.get(videoId);
	if (cached !== undefined) return cached;

	try {
		const res = await fetch(`https://www.youtube.com/shorts/${videoId}`, {
			method: 'HEAD',
			redirect: 'manual'
		});

		// 200 = it's a Short (page exists at /shorts/ URL)
		// 303 or other redirect = it's a regular video (redirects away from /shorts/)
		const result = res.status === 200;
		shortsCache.set(videoId, result);
		return result;
	} catch {
		// On network error, assume it's not a short (don't filter it out)
		return false;
	}
}

/**
 * Filter out YouTube Shorts from a list of videos.
 *
 * Strategy:
 * 1. Videos with duration > 180s are definitely not Shorts - keep them.
 * 2. Videos with duration <= 60s are very likely Shorts - check with isShort().
 * 3. Videos with duration 61-180s are borderline - check with isShort().
 * 4. Videos with no duration info - check with isShort().
 */
export async function filterOutShorts(videos: VideoItem[]): Promise<VideoItem[]> {
	const results: VideoItem[] = [];
	const toCheck: Array<{ video: VideoItem; index: number }> = [];

	for (let i = 0; i < videos.length; i++) {
		const video = videos[i];
		const durationSeconds = video.duration ? parseDurationSeconds(video.duration) : 0;

		if (video.duration && durationSeconds > 180) {
			// Definitely not a Short
			results.push(video);
		} else {
			// Could be a Short - need to check
			toCheck.push({ video, index: i });
		}
	}

	// Batch check all borderline videos concurrently
	if (toCheck.length > 0) {
		const checks = await Promise.all(toCheck.map(({ video }) => isShort(video.id)));

		for (let i = 0; i < toCheck.length; i++) {
			if (!checks[i]) {
				results.push(toCheck[i].video);
			}
		}
	}

	return results;
}
