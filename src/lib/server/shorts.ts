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
 * **Caching strategy:**
 * Results are cached in three layers:
 * 1. In-memory Map (L1) — zero-latency, same serverless instance only
 * 2. Upstash Redis (L2) — persists across all serverless invocations
 * 3. HEAD probes (L3) — only when both caches miss
 *
 * Before probing, we batch-fetch all unknown video IDs from Redis in a single
 * MGET call (~1-5ms), dramatically reducing HEAD probes on cold serverless starts.
 *
 * **Fail-safe behavior:**
 * On HEAD probe timeout or network failure, we keep the video (return false)
 * rather than risk hiding legitimate content. Failed probes are NOT cached
 * so they'll be retried on the next request.
 */

import type { VideoItem } from '$lib/types.js';
import { redisMGet, redisMSet } from './redis.js';

/**
 * Maximum number of entries in the in-memory shorts detection cache.
 * At ~50 bytes per entry (11-char videoId key + boolean value + Map overhead),
 * 50,000 entries consume roughly 2.5 MB — well within serverless limits.
 */
const SHORTS_CACHE_MAX_SIZE = 50_000;

/**
 * Timeout in milliseconds for each HEAD probe request.
 * 2 seconds is plenty for a HEAD-only request (no body transferred).
 * On timeout we keep the video and retry on the next request.
 */
const HEAD_PROBE_TIMEOUT_MS = 2_000;

/**
 * Maximum number of concurrent HEAD probes.
 * HEAD requests are tiny (~200 bytes), so high concurrency is safe.
 * 20 covers a full page of results in a single parallel batch.
 */
const HEAD_PROBE_CONCURRENCY = 20;

/** TTL for shorts detection results in Redis (7 days). A video's Short status never changes. */
const SHORTS_REDIS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Redis key prefix for shorts detection. */
const SHORTS_KEY_PREFIX = 'short:';

/**
 * In-memory L1 cache for shorts detection results (videoId -> isShort).
 * Uses a plain Map with FIFO eviction when the size limit is reached.
 */
const shortsCache = new Map<string, boolean>();

/**
 * Store a shorts detection result in L1 cache, evicting the oldest 10%
 * of entries if the cache has reached its maximum size.
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
 * @param videoId - The YouTube video ID to check.
 * @returns `true` if the video is a Short, `false` if it's a regular video (or probe failed).
 */
async function probeIsShort(videoId: string): Promise<boolean> {
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
		/* Fail-safe: keep the video on timeout/network error. It's better to
		 * occasionally show a Short than to hide legitimate videos.
		 * We do NOT cache this result so it will be retried on the next request. */
		return false;
	}
}

/**
 * Filter out YouTube Shorts from a list of videos.
 *
 * Applies a multi-layer filtering strategy:
 *
 * 1. **Duration pre-filter:** Videos with `duration > 180s` are kept immediately.
 * 2. **Live stream skip:** Zero-duration videos with views are kept (never Shorts).
 * 3. **L1 cache check:** In-memory Map lookup (same serverless instance).
 * 4. **L2 cache check:** Batch Redis MGET for all L1 misses (single HTTP call).
 * 5. **HEAD probe:** Remaining unknowns are probed via HEAD request.
 *
 * @param videos - Array of video items to filter.
 * @returns Array of videos with all detected Shorts removed.
 */
export async function filterOutShorts(videos: VideoItem[]): Promise<VideoItem[]> {
	const toCheck: Array<{ video: VideoItem; index: number }> = [];
	const keep: boolean[] = new Array(videos.length).fill(true);

	for (let i = 0; i < videos.length; i++) {
		const video = videos[i];
		const durationSeconds = video.duration ? parseDurationSeconds(video.duration) : 0;

		if (video.duration && durationSeconds > 180) {
			/* Guaranteed not a Short — keep. */
		} else if (
			durationSeconds === 0 &&
			(video.duration === 'P0D' || video.duration === 'PT0S') &&
			video.viewCount &&
			video.viewCount !== '0'
		) {
			/* Live stream — keep. */
		} else {
			toCheck.push({ video, index: i });
		}
	}

	if (toCheck.length === 0) return videos;

	/* Step 1: Check L1 (in-memory) for all candidates. */
	const needRedis: Array<{ video: VideoItem; index: number }> = [];
	for (const entry of toCheck) {
		const cached = shortsCache.get(entry.video.id);
		if (cached !== undefined) {
			if (cached) keep[entry.index] = false;
		} else {
			needRedis.push(entry);
		}
	}

	/* Step 2: Batch-check Redis (L2) for all L1 misses in a single MGET. */
	const needProbe: Array<{ video: VideoItem; index: number }> = [];
	if (needRedis.length > 0) {
		const redisKeys = needRedis.map((e) => SHORTS_KEY_PREFIX + e.video.id);
		const redisResults = await redisMGet<boolean>(redisKeys);

		for (let i = 0; i < needRedis.length; i++) {
			const redisValue = redisResults.get(redisKeys[i]);
			if (redisValue !== undefined) {
				/* Promote to L1 */
				shortsCacheSet(needRedis[i].video.id, redisValue);
				if (redisValue) keep[needRedis[i].index] = false;
			} else {
				needProbe.push(needRedis[i]);
			}
		}
	}

	/* Step 3: HEAD-probe remaining unknowns in batches. */
	if (needProbe.length > 0) {
		const probeResults: boolean[] = new Array(needProbe.length);
		const redisWrites: Array<{ key: string; value: boolean; ttlMs: number }> = [];

		for (let i = 0; i < needProbe.length; i += HEAD_PROBE_CONCURRENCY) {
			const batch = needProbe.slice(i, i + HEAD_PROBE_CONCURRENCY);
			const batchResults = await Promise.all(batch.map(({ video }) => probeIsShort(video.id)));
			for (let j = 0; j < batchResults.length; j++) {
				probeResults[i + j] = batchResults[j];
			}
		}

		for (let i = 0; i < needProbe.length; i++) {
			if (probeResults[i]) {
				keep[needProbe[i].index] = false;
			}
			/* Write successful probe results to Redis (fire and forget).
			 * Only cache definitive results (probe didn't timeout). */
			if (shortsCache.has(needProbe[i].video.id)) {
				redisWrites.push({
					key: SHORTS_KEY_PREFIX + needProbe[i].video.id,
					value: probeResults[i],
					ttlMs: SHORTS_REDIS_TTL_MS
				});
			}
		}

		if (redisWrites.length > 0) {
			redisMSet(redisWrites);
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

		if (!video.id) {
			reasons.push('missing ID');
		}

		if (!video.title || /^(deleted|private)\s+video$/i.test(video.title.trim())) {
			reasons.push(`bad title: "${video.title}"`);
		}

		if (!video.thumbnailUrl) {
			reasons.push('no thumbnail');
		}

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
