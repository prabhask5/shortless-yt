/**
 * @fileoverview Multi-layer YouTube Shorts filtering strategy.
 *
 * YouTube does not expose a public "isShort" flag in its Data API v3.
 * This module combines two independent heuristics to reliably detect and
 * filter out Shorts from video listings:
 *
 * **Layer 1 — Duration pre-filter (cheap, local):**
 * Videos with a duration > 180 seconds are guaranteed to not be Shorts
 * (YouTube enforces a 60-second limit on Shorts, but we use a generous 180s
 * threshold because some vertical videos near the boundary are not technically
 * Shorts). This layer eliminates the majority of regular videos without any
 * network calls.
 *
 * **Layer 2 — HEAD request probe (authoritative, remote):**
 * For videos that pass through Layer 1 (duration <= 180s or unknown), we
 * perform a HEAD request to `https://www.youtube.com/shorts/{videoId}`. If
 * YouTube responds with 200, the video is a Short (the /shorts/ page exists);
 * if it responds with a 303 redirect, the video is a regular video (YouTube
 * redirects away from the /shorts/ URL). This is the most reliable detection
 * method available without an official API flag.
 *
 * **Fail-safe behavior:**
 * The primary purpose of this application is to remove all Shorts. On HEAD
 * probe timeout or network failure, we treat the video as a Short (remove it)
 * rather than risk showing a Short to the user. Failed probes are NOT cached
 * so they'll be retried on the next request — if the video is a regular video,
 * it will be shown once the probe succeeds.
 *
 * **Cache bounding:**
 * Results are cached per video ID because a video's Short status never changes
 * after upload. The cache is capped at {@link SHORTS_CACHE_MAX_SIZE} entries
 * with FIFO eviction to prevent unbounded memory growth on long-running servers.
 */

import type { VideoItem } from '$lib/types.js';

/**
 * Maximum number of entries in the shorts detection cache.
 * At ~50 bytes per entry (11-char videoId key + boolean value + Map overhead),
 * 50,000 entries consume roughly 2.5 MB — well within serverless limits.
 */
const SHORTS_CACHE_MAX_SIZE = 50_000;

/**
 * Timeout in milliseconds for each HEAD probe request.
 * 3 seconds is generous for a HEAD-only request. If YouTube is slower than
 * this, we treat the video as a Short (fail-safe) and don't cache the result
 * so it can be retried on the next page load.
 */
const HEAD_PROBE_TIMEOUT_MS = 3_000;

/** Maximum number of concurrent HEAD probes. */
const HEAD_PROBE_CONCURRENCY = 6;

/**
 * Permanent cache for shorts detection results (videoId -> isShort).
 *
 * Uses a plain Map with FIFO eviction when the size limit is reached.
 * Map insertion order is guaranteed in JavaScript, so iterating from the
 * beginning gives us the oldest entries for eviction.
 */
const shortsCache = new Map<string, boolean>();

/**
 * Store a shorts detection result in the cache, evicting the oldest 10%
 * of entries if the cache has reached its maximum size.
 *
 * Eviction is done in bulk (10% at a time) rather than one-at-a-time to
 * amortize the cost — a single eviction pass handles the next ~5,000
 * insertions without needing to evict again.
 *
 * @param videoId - The YouTube video ID.
 * @param value   - Whether the video is a Short.
 */
function shortsCacheSet(videoId: string, value: boolean): void {
	if (shortsCache.size >= SHORTS_CACHE_MAX_SIZE) {
		const toDelete = Math.floor(SHORTS_CACHE_MAX_SIZE * 0.1);
		const iterator = shortsCache.keys();
		for (let i = 0; i < toDelete; i++) {
			const key = iterator.next().value;
			if (key !== undefined) shortsCache.delete(key);
		}
	}
	shortsCache.set(videoId, value);
}

/**
 * Parse an ISO 8601 duration string (PT#H#M#S) to total seconds.
 *
 * YouTube's `contentDetails.duration` field uses ISO 8601 duration format.
 * Examples: "PT1M30S" -> 90, "PT1H" -> 3600, "PT45S" -> 45.
 *
 * @param iso8601 - The ISO 8601 duration string from YouTube's API.
 * @returns Duration in seconds, or 0 if the string cannot be parsed.
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
 *
 * Makes a HEAD request to `https://www.youtube.com/shorts/{videoId}` with
 * `redirect: 'manual'` so we can inspect the status code:
 * - **200** = Short (the `/shorts/` page exists for this video)
 * - **303** = Regular video (YouTube redirects away from `/shorts/`)
 *
 * The request has a {@link HEAD_PROBE_TIMEOUT_MS} timeout via AbortController.
 * On timeout or any network error, the video is **treated as a Short** (fail-safe:
 * the app's primary purpose is to filter Shorts, so we err on the side of removal).
 * Failed results are NOT cached so they'll be retried on subsequent requests.
 *
 * @param videoId - The YouTube video ID to check.
 * @returns `true` if the video is a Short (or probe failed), `false` if it's a regular video.
 */
export async function isShort(videoId: string): Promise<boolean> {
	const cached = shortsCache.get(videoId);
	if (cached !== undefined) return cached;

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), HEAD_PROBE_TIMEOUT_MS);

		const res = await fetch(`https://www.youtube.com/shorts/${videoId}`, {
			method: 'HEAD',
			redirect: 'manual',
			signal: controller.signal
		});

		clearTimeout(timeout);

		const result = res.status === 200;
		shortsCacheSet(videoId, result);
		return result;
	} catch {
		/* Fail-safe: treat as Short on timeout/network error. The primary purpose
		 * of this application is removing Shorts — it's better to temporarily hide
		 * a regular short-duration video than to show a Short to the user.
		 *
		 * We do NOT cache this result so it will be retried on the next request.
		 * If the video is actually a regular video, it will appear once the probe
		 * succeeds. */
		return true;
	}
}

/**
 * Filter out YouTube Shorts from a list of videos.
 *
 * Applies a two-layer filtering strategy to each video:
 *
 * 1. **Duration pre-filter:** Videos with `duration > 180s` are guaranteed not
 *    to be Shorts (YouTube max is 60s, with 180s as a safety margin) and are
 *    kept immediately without any network calls.
 *
 * 2. **Live stream skip:** Videos with `duration === 'P0D'` or duration that
 *    parses to 0 seconds but have views are likely live streams — they are
 *    kept without HEAD probes since live streams are never Shorts.
 *
 * 3. **HEAD probe:** Remaining videos with `duration <= 180s` or no duration
 *    data are checked via {@link isShort}. Probes run in batches of
 *    {@link HEAD_PROBE_CONCURRENCY} to avoid overwhelming the network.
 *
 * @param videos - Array of video items to filter.
 * @returns Array of videos with all detected Shorts removed.
 */
export async function filterOutShorts(videos: VideoItem[]): Promise<VideoItem[]> {
	const toCheck: Array<{ video: VideoItem; index: number }> = [];

	/* Build a per-video keep/skip decision array that preserves original order. */
	const keep: boolean[] = new Array(videos.length).fill(true);

	for (let i = 0; i < videos.length; i++) {
		const video = videos[i];
		const durationSeconds = video.duration ? parseDurationSeconds(video.duration) : 0;

		if (video.duration && durationSeconds > 180) {
			/* Guaranteed not a Short — keep (already true). */
		} else if (
			durationSeconds === 0 &&
			(video.duration === 'P0D' || video.duration === 'PT0S') &&
			video.viewCount &&
			video.viewCount !== '0'
		) {
			/* Live stream or unparseable duration with views — never a Short, keep. */
		} else {
			toCheck.push({ video, index: i });
		}
	}

	if (toCheck.length > 0) {
		/* Process HEAD probes in batches to cap concurrency. */
		const checks: boolean[] = new Array(toCheck.length);
		for (let i = 0; i < toCheck.length; i += HEAD_PROBE_CONCURRENCY) {
			const batch = toCheck.slice(i, i + HEAD_PROBE_CONCURRENCY);
			const batchResults = await Promise.all(batch.map(({ video }) => isShort(video.id)));
			for (let j = 0; j < batchResults.length; j++) {
				checks[i + j] = batchResults[j];
			}
		}

		for (let i = 0; i < toCheck.length; i++) {
			if (checks[i]) {
				keep[toCheck[i].index] = false;
			}
		}
	}

	return videos.filter((_, i) => keep[i]);
}

/**
 * Filter out pseudo-deleted or broken videos from a list.
 *
 * YouTube keeps deleted/private/unavailable videos in playlists and search
 * results as ghost entries. These typically have:
 * - Empty or missing title (e.g. "Deleted video", "Private video", or blank)
 * - No thumbnail URL
 * - Zero duration
 * - "0" view count with no other stats
 *
 * This filter runs before shorts filtering to avoid wasting HEAD probes on
 * videos that would break the watch page anyway.
 *
 * @param videos - Array of video items to filter.
 * @returns Array of videos with broken/deleted entries removed.
 */
export function filterOutBrokenVideos(videos: VideoItem[]): VideoItem[] {
	const results: VideoItem[] = [];

	for (const video of videos) {
		const reasons: string[] = [];

		// No ID at all
		if (!video.id) {
			reasons.push('missing ID');
		}

		// No title or placeholder deleted/private titles
		if (!video.title || /^(deleted|private)\s+video$/i.test(video.title.trim())) {
			reasons.push(`bad title: "${video.title}"`);
		}

		// No thumbnail
		if (!video.thumbnailUrl) {
			reasons.push('no thumbnail');
		}

		// Zero duration AND zero views — likely a ghost entry
		const hasZeroDuration =
			!video.duration || video.duration === 'P0D' || video.duration === 'PT0S';
		const hasZeroViews = !video.viewCount || video.viewCount === '0';
		if (hasZeroDuration && hasZeroViews) {
			reasons.push(`zero duration (${video.duration}) + zero views`);
		}

		if (reasons.length === 0) {
			results.push(video);
		}
	}

	return results;
}
