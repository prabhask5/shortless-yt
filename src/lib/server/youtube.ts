/**
 * @fileoverview YouTube Data API v3 client for Shortless.
 *
 * This module is the single point of contact with the YouTube API. It handles:
 * - Constructing authenticated/unauthenticated API requests.
 * - Parsing raw API responses into normalized app types ({@link VideoItem},
 *   {@link ChannelItem}, etc.).
 * - Aggressive caching via the shared TTL cache to conserve the daily 10,000-unit
 *   API quota.
 * - Batching detail fetches in groups of 50 (YouTube's maximum `id` parameter
 *   size per request).
 * - Autocomplete suggestions via YouTube's undocumented JSONP suggestion endpoint.
 *
 * **Cache key strategy:**
 * Cache keys are human-readable, colon-separated strings that encode the
 * endpoint, query parameters, and pagination token. For example:
 * - `search:v:cats::medium:` — video search for "cats", no page token, medium
 *   duration, default order.
 * - `video:abc123` — individual video detail fetch (per-ID caching).
 * - `channel:UC123` — individual channel detail fetch (per-ID caching).
 * - `user:subs:<hash>:` — subscriptions for a user identified by a SHA-256
 *   hash prefix of their access token (avoids storing the token in keys).
 *
 * **Why detail fetches follow search:**
 * The YouTube `search` endpoint only returns `snippet` data (title, thumbnail,
 * channel). It does NOT include `contentDetails` (duration) or `statistics`
 * (view count, likes). To get those, a second call to the `videos` or
 * `channels` endpoint is required with the IDs from the search results.
 */

import { createHash } from 'node:crypto';
import { YOUTUBE_API_KEY } from './env.js';
import { publicCache, userCache } from './cache.js';
import type {
	VideoItem,
	ChannelItem,
	PlaylistItem,
	CommentItem,
	PaginatedResult
} from '$lib/types.js';

const BASE_URL = 'https://www.googleapis.com/youtube/v3';

// ===================================================================
// Cache TTL constants
// ===================================================================

const THIRTY_MINUTES = 30 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

// ===================================================================
// Request coalescing (singleflight)
// ===================================================================

/**
 * In-flight promise map for request deduplication.
 * If multiple callers request the same cache key concurrently, they share
 * a single API call instead of making duplicate requests.
 */
const inflight = new Map<string, Promise<unknown>>();

/**
 * Execute `fn` only if no other call with the same `key` is already in flight.
 * Concurrent callers receive the same promise. The entry is cleaned up
 * when the promise settles (success or failure).
 */
function singleflight<T>(key: string, fn: () => Promise<T>): Promise<T> {
	const existing = inflight.get(key);
	if (existing) return existing as Promise<T>;
	const promise = fn().finally(() => inflight.delete(key));
	inflight.set(key, promise);
	return promise;
}

// ===================================================================
// Internal helpers
// ===================================================================

/**
 * Produce a short, collision-resistant hash of an access token for use in cache keys.
 * Avoids storing raw token suffixes which could leak via debug/logging.
 */
function tokenHash(accessToken: string): string {
	return createHash('sha256').update(accessToken).digest('hex').slice(0, 16);
}

/**
 * Custom error class for YouTube API quota exhaustion.
 * When thrown, page loads can catch this and show a user-friendly quota message.
 */
export class QuotaExhaustedError extends Error {
	/** Milliseconds until the quota resets (midnight Pacific Time). */
	resetInMs: number;
	/** Human-readable reset time string. */
	resetAt: string;

	constructor() {
		const { resetInMs, resetAt } = getQuotaResetInfo();
		super(`YouTube API daily quota exceeded. Resets at ${resetAt}.`);
		this.name = 'QuotaExhaustedError';
		this.resetInMs = resetInMs;
		this.resetAt = resetAt;
	}
}

/**
 * Calculate time until the YouTube API quota resets.
 * YouTube quota resets at midnight Pacific Time (America/Los_Angeles).
 */
function getQuotaResetInfo(): { resetInMs: number; resetAt: string } {
	const now = new Date();
	/* Build "next midnight PT" by formatting today in PT, incrementing the day */
	const ptFormatter = new Intl.DateTimeFormat('en-US', {
		timeZone: 'America/Los_Angeles',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	});
	const parts = ptFormatter.formatToParts(now);
	const ptParts: Record<string, string> = {};
	for (const p of parts) {
		if (p.type !== 'literal') ptParts[p.type] = p.value;
	}
	/* Determine the actual PT offset (PST=-08:00 or PDT=-07:00) by comparing
	 * the formatted PT date with the UTC date. This avoids hardcoding a timezone offset. */
	const ptDateStr = `${ptParts.year}-${ptParts.month}-${ptParts.day}`;
	const ptHour = parseInt(ptParts.hour, 10);
	const ptMinute = parseInt(ptParts.minute, 10);
	const utcHour = now.getUTCHours();
	const utcMinute = now.getUTCMinutes();
	/* Calculate offset in minutes (UTC - PT). Handles day boundary wrap. */
	let offsetMinutes = utcHour * 60 + utcMinute - (ptHour * 60 + ptMinute);
	if (offsetMinutes < 0) offsetMinutes += 24 * 60;
	if (offsetMinutes > 12 * 60) offsetMinutes -= 24 * 60;
	const offsetHours = Math.floor(offsetMinutes / 60);
	const offsetMins = offsetMinutes % 60;
	const offsetStr = `-${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`;
	/* Next midnight PT = start of next day in PT */
	const tomorrowPT = new Date(`${ptDateStr}T00:00:00${offsetStr}`);
	tomorrowPT.setDate(tomorrowPT.getDate() + 1);
	const resetMs = tomorrowPT.getTime() - now.getTime();
	const hours = Math.floor(resetMs / (1000 * 60 * 60));
	const minutes = Math.ceil((resetMs % (1000 * 60 * 60)) / (1000 * 60));
	const resetAt = `${hours}h ${minutes}m from now`;

	return { resetInMs: resetMs > 0 ? resetMs : 0, resetAt };
}

/**
 * Global flag: once we detect a quota exhaustion (403 quotaExceeded),
 * all subsequent API calls fail fast until the reset time passes.
 * This prevents wasting time on requests that will definitely fail.
 */
let quotaExhaustedUntil = 0;

/** Check if the quota is currently known to be exhausted. */
export function isQuotaExhausted(): boolean {
	if (quotaExhaustedUntil === 0) return false;
	if (Date.now() >= quotaExhaustedUntil) {
		quotaExhaustedUntil = 0;
		return false;
	}
	return true;
}

/**
 * Low-level fetch wrapper for the YouTube Data API v3.
 *
 * Handles API key injection for public requests and Bearer token injection
 * for authenticated requests. All higher-level functions delegate to this.
 *
 * @param endpoint    - API endpoint path relative to the v3 base (e.g. "search", "videos").
 * @param params      - Query parameters to append to the request URL.
 * @param accessToken - Optional OAuth2 access token for authenticated endpoints.
 * @returns The parsed JSON response body.
 * @throws {QuotaExhaustedError} If the daily quota has been exceeded.
 * @throws {Error} If the API responds with a non-2xx status.
 */
async function youtubeApiFetch(
	endpoint: string,
	params: Record<string, string>,
	accessToken?: string
): Promise<unknown> {
	/* Fail fast if we already know the quota is exhausted */
	if (isQuotaExhausted()) {
		throw new QuotaExhaustedError();
	}

	const url = new URL(`${BASE_URL}/${endpoint}`);

	if (!accessToken) {
		url.searchParams.set('key', YOUTUBE_API_KEY());
	}

	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}

	const headers: Record<string, string> = {};
	if (accessToken) {
		headers['Authorization'] = `Bearer ${accessToken}`;
	}

	const res = await fetch(url.toString(), { headers });

	if (!res.ok) {
		const errorBody = await res.text();
		console.error(`[YOUTUBE API] ERROR ${res.status} on ${endpoint}: ${errorBody}`);

		/* Detect quota exhaustion and set the global flag */
		if (res.status === 403 && errorBody.includes('quotaExceeded')) {
			const { resetInMs } = getQuotaResetInfo();
			quotaExhaustedUntil = Date.now() + resetInMs;
			console.error(`[YOUTUBE API] QUOTA EXHAUSTED — all API calls will fail fast until reset`);
			throw new QuotaExhaustedError();
		}

		throw new Error(`YouTube API error ${res.status} on ${endpoint}: ${errorBody}`);
	}

	return res.json();
}

/**
 * Parse a raw YouTube API video resource into a normalized {@link VideoItem}.
 *
 * Handles both search results (where `id` is an object `{videoId}`) and
 * direct video resources (where `id` is a plain string).
 */
function parseVideoItem(item: Record<string, unknown>): VideoItem {
	const snippet = item.snippet as Record<string, unknown> | undefined;
	const contentDetails = item.contentDetails as Record<string, unknown> | undefined;
	const statistics = item.statistics as Record<string, unknown> | undefined;
	const thumbnails = snippet?.thumbnails as Record<string, Record<string, unknown>> | undefined;

	return {
		id:
			typeof item.id === 'string' ? item.id : ((item.id as Record<string, string>)?.videoId ?? ''),
		title: (snippet?.title as string) ?? '',
		thumbnailUrl: (thumbnails?.medium?.url as string) ?? (thumbnails?.default?.url as string) ?? '',
		channelId: (snippet?.channelId as string) ?? '',
		channelTitle: (snippet?.channelTitle as string) ?? '',
		viewCount: (statistics?.viewCount as string) ?? '0',
		publishedAt: (snippet?.publishedAt as string) ?? '',
		duration: (contentDetails?.duration as string) ?? '',
		description: (snippet?.description as string) ?? '',
		likeCount: (statistics?.likeCount as string) ?? '0',
		liveBroadcastContent: snippet?.liveBroadcastContent as string | undefined
	};
}

/**
 * Parse a raw YouTube API channel resource into a normalized {@link ChannelItem}.
 *
 * Handles both search results (where `id` is `{channelId}`) and direct
 * channel resources (where `id` is a plain string).
 */
function parseChannelItem(item: Record<string, unknown>): ChannelItem {
	const snippet = item.snippet as Record<string, unknown> | undefined;
	const statistics = item.statistics as Record<string, unknown> | undefined;
	const thumbnails = snippet?.thumbnails as Record<string, Record<string, unknown>> | undefined;
	const branding = item.brandingSettings as Record<string, unknown> | undefined;
	const brandingImage = branding?.image as Record<string, unknown> | undefined;

	return {
		id:
			typeof item.id === 'string'
				? item.id
				: ((item.id as Record<string, string>)?.channelId ?? ''),
		title: (snippet?.title as string) ?? '',
		description: (snippet?.description as string) ?? '',
		thumbnailUrl: (thumbnails?.medium?.url as string) ?? (thumbnails?.default?.url as string) ?? '',
		subscriberCount: (statistics?.subscriberCount as string) ?? '0',
		videoCount: (statistics?.videoCount as string) ?? '0',
		viewCount: (statistics?.viewCount as string) ?? undefined,
		publishedAt: (snippet?.publishedAt as string) ?? undefined,
		bannerUrl: (brandingImage?.bannerExternalUrl as string) ?? ''
	};
}

/** Parse a raw YouTube API playlist resource into a normalized {@link PlaylistItem}. */
function parsePlaylistItem(item: Record<string, unknown>): PlaylistItem {
	const snippet = item.snippet as Record<string, unknown> | undefined;
	const contentDetails = item.contentDetails as Record<string, unknown> | undefined;
	const thumbnails = snippet?.thumbnails as Record<string, Record<string, unknown>> | undefined;

	return {
		id:
			typeof item.id === 'string'
				? item.id
				: ((item.id as Record<string, string>)?.playlistId ?? ''),
		title: (snippet?.title as string) ?? '',
		description: (snippet?.description as string) ?? '',
		thumbnailUrl: (thumbnails?.medium?.url as string) ?? (thumbnails?.default?.url as string) ?? '',
		channelTitle: (snippet?.channelTitle as string) ?? '',
		itemCount: (contentDetails?.itemCount as number) ?? 0
	};
}

/**
 * Parse a raw YouTube API comment thread into a normalized {@link CommentItem}.
 *
 * Comment threads have a deeply nested structure:
 * `item.snippet.topLevelComment.snippet` contains the actual comment data.
 *
 * Uses `textOriginal` (plain text) instead of `textDisplay` (rendered HTML)
 * because our template renders comment text with Svelte's auto-escaping
 * (`{comment.text}`). Using `textDisplay` would show raw HTML tags as literal
 * text to the user. Falls back to `textDisplay` if `textOriginal` is unavailable.
 */
function parseCommentItem(item: Record<string, unknown>): CommentItem {
	const snippet = item.snippet as Record<string, unknown> | undefined;
	const topLevel = snippet?.topLevelComment as Record<string, unknown> | undefined;
	const commentSnippet = topLevel?.snippet as Record<string, unknown> | undefined;

	return {
		id: (item.id as string) ?? '',
		authorName: (commentSnippet?.authorDisplayName as string) ?? '',
		authorAvatarUrl: (commentSnippet?.authorProfileImageUrl as string) ?? '',
		text: (commentSnippet?.textOriginal as string) ?? (commentSnippet?.textDisplay as string) ?? '',
		likeCount: (commentSnippet?.likeCount as number) ?? 0,
		publishedAt: (commentSnippet?.publishedAt as string) ?? '',
		replyCount: (snippet?.totalReplyCount as number) ?? 0
	};
}

// ===================================================================
// Search
// ===================================================================

/**
 * Search YouTube for videos matching a query string.
 *
 * Performs a two-step process: first searches for video IDs via the `search`
 * endpoint, then fetches full video details (duration, statistics) via
 * {@link getVideoDetails}. This is necessary because YouTube's search endpoint
 * only returns snippet data, not `contentDetails` or `statistics`.
 *
 * @param query   - The search query string.
 * @param options - Optional pagination token, duration filter, and sort order.
 * @returns Paginated list of fully-hydrated video items.
 */
export async function searchVideos(
	query: string,
	options?: { pageToken?: string; videoDuration?: string; order?: string; channelId?: string }
): Promise<PaginatedResult<VideoItem>> {
	const cacheKey = `search:v:${encodeURIComponent(query)}:${options?.pageToken ?? ''}:${options?.videoDuration ?? ''}:${options?.order ?? ''}:${options?.channelId ?? ''}`;
	const cached = publicCache.get<PaginatedResult<VideoItem>>(cacheKey);
	if (cached) return cached;

	return singleflight(cacheKey, async () => {
		const params: Record<string, string> = {
			part: 'snippet',
			type: 'video',
			q: query,
			maxResults: '50'
		};
		if (options?.pageToken) params.pageToken = options.pageToken;
		if (options?.videoDuration) params.videoDuration = options.videoDuration;
		if (options?.order) params.order = options.order;
		if (options?.channelId) params.channelId = options.channelId;

		const data = (await youtubeApiFetch('search', params)) as Record<string, unknown>;
		const items = (data.items as Record<string, unknown>[]) ?? [];
		const videoIds = items
			.map((i) => (i.id as Record<string, string>)?.videoId ?? '')
			.filter(Boolean);

		const videos = videoIds.length > 0 ? await getVideoDetails(videoIds) : [];

		const pageInfoRaw = data.pageInfo as Record<string, unknown> | undefined;
		const result: PaginatedResult<VideoItem> = {
			items: videos,
			pageInfo: {
				nextPageToken: data.nextPageToken as string | undefined,
				totalResults: (pageInfoRaw?.totalResults as number) ?? 0
			}
		};

		publicCache.set(cacheKey, result, THIRTY_MINUTES);
		return result;
	});
}

/**
 * Search YouTube for channels matching a query string.
 *
 * Like {@link searchVideos}, uses a two-step process to get full channel
 * statistics (subscriber count, video count) from the `channels` endpoint.
 *
 * @param query     - The search query string.
 * @param pageToken - Optional pagination token for the next page.
 * @returns Paginated list of channel items with full statistics.
 */
export async function searchChannels(
	query: string,
	pageToken?: string
): Promise<PaginatedResult<ChannelItem>> {
	const cacheKey = `search:c:${encodeURIComponent(query)}:${pageToken ?? ''}`;
	const cached = publicCache.get<PaginatedResult<ChannelItem>>(cacheKey);
	if (cached) return cached;

	const params: Record<string, string> = {
		part: 'snippet',
		type: 'channel',
		q: query,
		maxResults: '50'
	};
	if (pageToken) params.pageToken = pageToken;

	const data = (await youtubeApiFetch('search', params)) as Record<string, unknown>;
	const items = (data.items as Record<string, unknown>[]) ?? [];
	const channelIds = items
		.map((i) => (i.id as Record<string, string>)?.channelId ?? '')
		.filter(Boolean);

	const channels = channelIds.length > 0 ? await getChannelDetails(channelIds) : [];

	const pageInfoRaw = data.pageInfo as Record<string, unknown> | undefined;
	const result: PaginatedResult<ChannelItem> = {
		items: channels,
		pageInfo: {
			nextPageToken: data.nextPageToken as string | undefined,
			totalResults: (pageInfoRaw?.totalResults as number) ?? 0
		}
	};

	publicCache.set(cacheKey, result, THIRTY_MINUTES);
	return result;
}

/**
 * Search YouTube for playlists matching a query string.
 *
 * Fetches full playlist details (including `itemCount`) in a follow-up call
 * to the `playlists` endpoint.
 *
 * @param query     - The search query string.
 * @param pageToken - Optional pagination token for the next page.
 * @returns Paginated list of playlist items.
 */
export async function searchPlaylists(
	query: string,
	pageToken?: string
): Promise<PaginatedResult<PlaylistItem>> {
	const cacheKey = `search:p:${encodeURIComponent(query)}:${pageToken ?? ''}`;
	const cached = publicCache.get<PaginatedResult<PlaylistItem>>(cacheKey);
	if (cached) return cached;

	const params: Record<string, string> = {
		part: 'snippet',
		type: 'playlist',
		q: query,
		maxResults: '50'
	};
	if (pageToken) params.pageToken = pageToken;

	const data = (await youtubeApiFetch('search', params)) as Record<string, unknown>;
	const items = (data.items as Record<string, unknown>[]) ?? [];

	const playlistIds = items
		.map((i) => (i.id as Record<string, string>)?.playlistId ?? '')
		.filter(Boolean);

	/* Search does not include contentDetails (itemCount), so fetch full details. */
	const playlists: PlaylistItem[] = [];
	if (playlistIds.length > 0) {
		const detailData = (await youtubeApiFetch('playlists', {
			part: 'snippet,contentDetails',
			id: playlistIds.join(','),
			maxResults: '50'
		})) as Record<string, unknown>;
		const detailItems = (detailData.items as Record<string, unknown>[]) ?? [];
		for (const item of detailItems) {
			playlists.push(parsePlaylistItem(item));
		}
	}

	const pageInfoRaw = data.pageInfo as Record<string, unknown> | undefined;
	const result: PaginatedResult<PlaylistItem> = {
		items: playlists,
		pageInfo: {
			nextPageToken: data.nextPageToken as string | undefined,
			totalResults: (pageInfoRaw?.totalResults as number) ?? 0
		}
	};

	publicCache.set(cacheKey, result, THIRTY_MINUTES);
	return result;
}

/**
 * Search YouTube with mixed result types (video, channel, playlist) in a single API call.
 *
 * Uses the YouTube search endpoint with `type` set to a comma-separated list of types.
 * This returns results in YouTube's natural relevance order with types interleaved,
 * rather than grouping all videos, then all channels, then all playlists.
 *
 * Video results are hydrated with full details (duration, statistics) via a follow-up
 * call to {@link getVideoDetails}. Channel and playlist results use snippet data only
 * from the search response (no follow-up detail fetch) to conserve API quota.
 *
 * @param query     - The search query string.
 * @param types     - Array of types to include (e.g. ['video', 'channel', 'playlist']).
 * @param pageToken - Optional pagination token.
 * @returns Object with tagged union results array and nextPageToken.
 */
export async function searchMixed(
	query: string,
	types: Array<'video' | 'channel' | 'playlist'>,
	pageToken?: string
): Promise<{
	results: Array<
		| { type: 'video'; item: VideoItem }
		| { type: 'channel'; item: ChannelItem }
		| { type: 'playlist'; item: PlaylistItem }
	>;
	nextPageToken?: string;
}> {
	const typeStr = types.join(',');
	const cacheKey = `search:mixed:${encodeURIComponent(query)}:${typeStr}:${pageToken ?? ''}`;
	const cached = publicCache.get<{
		results: Array<
			| { type: 'video'; item: VideoItem }
			| { type: 'channel'; item: ChannelItem }
			| { type: 'playlist'; item: PlaylistItem }
		>;
		nextPageToken?: string;
	}>(cacheKey);
	if (cached) return cached;

	const params: Record<string, string> = {
		part: 'snippet',
		type: typeStr,
		q: query,
		maxResults: '50'
	};
	if (pageToken) params.pageToken = pageToken;

	const data = (await youtubeApiFetch('search', params)) as Record<string, unknown>;
	const rawItems = (data.items as Record<string, unknown>[]) ?? [];
	const nextToken = data.nextPageToken as string | undefined;

	// Separate items by type and collect IDs for detail fetches
	const videoIds: string[] = [];
	const channelIds: string[] = [];
	const playlistIds: string[] = [];
	const itemOrder: Array<{ type: 'video' | 'channel' | 'playlist'; index: number }> = [];

	for (const raw of rawItems) {
		const idObj = raw.id as Record<string, string> | undefined;
		const kind = idObj?.kind as string | undefined;

		if (kind === 'youtube#video' && idObj?.videoId) {
			itemOrder.push({ type: 'video', index: videoIds.length });
			videoIds.push(idObj.videoId);
		} else if (kind === 'youtube#channel' && idObj?.channelId) {
			itemOrder.push({ type: 'channel', index: channelIds.length });
			channelIds.push(idObj.channelId);
		} else if (kind === 'youtube#playlist' && idObj?.playlistId) {
			itemOrder.push({ type: 'playlist', index: playlistIds.length });
			playlistIds.push(idObj.playlistId);
		}
	}

	// Hydrate video, channel, and playlist details in parallel (search only returns snippets)
	const [videoDetails, channelDetails, playlistDetails] = await Promise.all([
		videoIds.length > 0 ? getVideoDetails(videoIds) : Promise.resolve([]),
		channelIds.length > 0 ? getChannelDetails(channelIds) : Promise.resolve([]),
		playlistIds.length > 0 ? getPlaylistDetails(playlistIds) : Promise.resolve([])
	]);

	// Build lookup maps since detail fetches may reorder results
	const videoMap = new Map<string, VideoItem>();
	for (const v of videoDetails) videoMap.set(v.id, v);
	const channelMap = new Map<string, ChannelItem>();
	for (const c of channelDetails) channelMap.set(c.id, c);
	const playlistMap = new Map<string, PlaylistItem>();
	for (const p of playlistDetails) playlistMap.set(p.id, p);

	// Reconstruct results in YouTube's original order
	const results: Array<
		| { type: 'video'; item: VideoItem }
		| { type: 'channel'; item: ChannelItem }
		| { type: 'playlist'; item: PlaylistItem }
	> = [];

	for (const entry of itemOrder) {
		if (entry.type === 'video') {
			const video = videoMap.get(videoIds[entry.index]);
			if (video) results.push({ type: 'video', item: video });
		} else if (entry.type === 'channel') {
			const channel = channelMap.get(channelIds[entry.index]);
			if (channel) results.push({ type: 'channel', item: channel });
		} else {
			const playlist = playlistMap.get(playlistIds[entry.index]);
			if (playlist) results.push({ type: 'playlist', item: playlist });
		}
	}

	const result = { results, nextPageToken: nextToken };
	publicCache.set(cacheKey, result, THIRTY_MINUTES);
	return result;
}

// ===================================================================
// Detail fetchers
// ===================================================================

/**
 * Fetch full video details (snippet, contentDetails, statistics) for a list of IDs.
 *
 * Uses per-ID caching so the same video appearing across different contexts
 * (search results, trending, channel uploads, playlists) shares a single cache
 * entry. Only IDs not already cached are fetched from the API. Uncached IDs are
 * batched in groups of 50 (YouTube's maximum `id` parameter size per request).
 *
 * @param ids - Array of YouTube video IDs to look up.
 * @returns Array of fully-hydrated video items (order may differ from input).
 */
export async function getVideoDetails(ids: string[]): Promise<VideoItem[]> {
	const results: VideoItem[] = [];
	const uncachedIds: string[] = [];

	/* L1: check in-memory cache */
	for (const id of ids) {
		const cached = publicCache.get<VideoItem>(`video:${id}`);
		if (cached) {
			results.push(cached);
		} else {
			uncachedIds.push(id);
		}
	}

	/* L2: check Redis for L1 misses */
	if (uncachedIds.length > 0) {
		const stillMissing: string[] = [];
		try {
			const redisHits = await Promise.all(
				uncachedIds.map((id) =>
					publicCache
						.getWithRedis<VideoItem>(`video:${id}`, ONE_HOUR)
						.then((v) => ({ id, value: v }))
						.catch(() => ({ id, value: undefined }))
				)
			);
			for (const hit of redisHits) {
				if (hit.value) {
					results.push(hit.value);
				} else {
					stillMissing.push(hit.id);
				}
			}
		} catch {
			/* Redis entirely unavailable — fall through to API for all uncached IDs */
			stillMissing.push(...uncachedIds);
		}

		/* L3: Batch-fetch remaining IDs from YouTube API in groups of 50. */
		for (let i = 0; i < stillMissing.length; i += 50) {
			const batch = stillMissing.slice(i, i + 50);
			const data = (await youtubeApiFetch('videos', {
				part: 'snippet,contentDetails,statistics',
				id: batch.join(','),
				maxResults: '50'
			})) as Record<string, unknown>;

			const items = (data.items as Record<string, unknown>[]) ?? [];
			const videos = items.map(parseVideoItem);

			for (const video of videos) {
				publicCache.set(`video:${video.id}`, video, ONE_HOUR);
			}
			results.push(...videos);
		}
	}

	return results;
}

/**
 * Fetch full channel details (snippet, statistics, brandingSettings) for a list of IDs.
 *
 * Uses per-ID caching identical to {@link getVideoDetails}: each channel is cached
 * individually so the same channel appearing in search results, video watch pages,
 * and subscription lists shares a single cache entry. Only uncached IDs are fetched,
 * batched in groups of 50.
 *
 * @param ids - Array of YouTube channel IDs to look up.
 * @returns Array of fully-hydrated channel items.
 */
export async function getChannelDetails(ids: string[]): Promise<ChannelItem[]> {
	const results: ChannelItem[] = [];
	const uncachedIds: string[] = [];

	/* L1: check in-memory cache */
	for (const id of ids) {
		const cached = publicCache.get<ChannelItem>(`channel:${id}`);
		if (cached) {
			results.push(cached);
		} else {
			uncachedIds.push(id);
		}
	}

	/* L2: check Redis for L1 misses */
	if (uncachedIds.length > 0) {
		const stillMissing: string[] = [];
		try {
			const redisHits = await Promise.all(
				uncachedIds.map((id) =>
					publicCache
						.getWithRedis<ChannelItem>(`channel:${id}`, ONE_HOUR)
						.then((v) => ({ id, value: v }))
						.catch(() => ({ id, value: undefined }))
				)
			);
			for (const hit of redisHits) {
				if (hit.value) {
					results.push(hit.value);
				} else {
					stillMissing.push(hit.id);
				}
			}
		} catch {
			stillMissing.push(...uncachedIds);
		}

		/* L3: Batch-fetch remaining from YouTube API */
		for (let i = 0; i < stillMissing.length; i += 50) {
			const batch = stillMissing.slice(i, i + 50);
			const data = (await youtubeApiFetch('channels', {
				part: 'snippet,statistics,brandingSettings',
				id: batch.join(','),
				maxResults: '50'
			})) as Record<string, unknown>;

			const items = (data.items as Record<string, unknown>[]) ?? [];
			const channels = items.map(parseChannelItem);

			for (const channel of channels) {
				publicCache.set(`channel:${channel.id}`, channel, ONE_HOUR);
			}
			results.push(...channels);
		}
	}

	return results;
}

/**
 * Batch-fetch full playlist details (including itemCount from contentDetails).
 *
 * Search results only return snippet data for playlists, missing contentDetails.
 * This hydrates them with the full playlists endpoint.
 *
 * @param ids - Array of YouTube playlist IDs to look up.
 * @returns Array of fully-hydrated playlist items.
 */
export async function getPlaylistDetails(ids: string[]): Promise<PlaylistItem[]> {
	const results: PlaylistItem[] = [];
	const uncachedIds: string[] = [];

	/* L1: check in-memory cache */
	for (const id of ids) {
		const cached = publicCache.get<PlaylistItem>(`playlist:${id}`);
		if (cached) {
			results.push(cached);
		} else {
			uncachedIds.push(id);
		}
	}

	/* L2: check Redis for L1 misses */
	if (uncachedIds.length > 0) {
		const stillMissing: string[] = [];
		try {
			const redisHits = await Promise.all(
				uncachedIds.map((id) =>
					publicCache
						.getWithRedis<PlaylistItem>(`playlist:${id}`, ONE_HOUR)
						.then((v) => ({ id, value: v }))
						.catch(() => ({ id, value: undefined }))
				)
			);
			for (const hit of redisHits) {
				if (hit.value) {
					results.push(hit.value);
				} else {
					stillMissing.push(hit.id);
				}
			}
		} catch {
			stillMissing.push(...uncachedIds);
		}

		/* L3: Batch-fetch remaining from YouTube API */
		for (let i = 0; i < stillMissing.length; i += 50) {
			const batch = stillMissing.slice(i, i + 50);
			const data = (await youtubeApiFetch('playlists', {
				part: 'snippet,contentDetails',
				id: batch.join(','),
				maxResults: '50'
			})) as Record<string, unknown>;

			const items = (data.items as Record<string, unknown>[]) ?? [];
			const playlists = items.map(parsePlaylistItem);

			for (const pl of playlists) {
				publicCache.set(`playlist:${pl.id}`, pl, ONE_HOUR);
			}
			results.push(...playlists);
		}
	}

	return results;
}

/**
 * Fetch videos uploaded by a specific channel.
 *
 * YouTube does not have a direct "list videos by channel" endpoint.
 * Instead this performs a three-step process:
 * 1. Fetch the channel's `contentDetails` to get its hidden "uploads" playlist ID.
 * 2. List items from that playlist to get video IDs.
 * 3. Fetch full video details via {@link getVideoDetails}.
 *
 * @param channelId - The YouTube channel ID.
 * @param pageToken - Optional pagination token for the next page.
 * @returns Paginated list of the channel's uploaded videos.
 */
export async function getChannelVideos(
	channelId: string,
	pageToken?: string
): Promise<PaginatedResult<VideoItem>> {
	// Step 1: Resolve channel ID → uploads playlist ID (cached for 24h)
	const uploadsPlaylistId = await getUploadsPlaylistId(channelId);
	if (!uploadsPlaylistId) {
		return { items: [], pageInfo: { totalResults: 0 } };
	}

	// Step 2: Delegate to getPlaylistVideos (shared cache with playlist pages)
	return getPlaylistVideos(uploadsPlaylistId, pageToken);
}

/**
 * Resolve a channel ID to its uploads playlist ID, with L1/L2 caching.
 * Used by {@link getChannelVideos} and populated by {@link getSubscriptionFeed}.
 */
async function getUploadsPlaylistId(channelId: string): Promise<string | undefined> {
	const cacheKey = `ch:uploads:${channelId}`;
	let playlistId = publicCache.get<string>(cacheKey);
	if (playlistId) return playlistId;

	playlistId = (await publicCache.getWithRedis<string>(cacheKey, ONE_DAY)) ?? undefined;
	if (playlistId) return playlistId;

	const channelData = (await youtubeApiFetch('channels', {
		part: 'contentDetails',
		id: channelId
	})) as Record<string, unknown>;

	const channelItems = (channelData.items as Record<string, unknown>[]) ?? [];
	if (channelItems.length === 0) return undefined;

	const contentDetails = channelItems[0].contentDetails as Record<string, unknown>;
	const relatedPlaylists = contentDetails?.relatedPlaylists as Record<string, string>;
	playlistId = relatedPlaylists?.uploads;

	if (playlistId) {
		publicCache.set(cacheKey, playlistId, ONE_DAY);
	}

	return playlistId;
}

// ===================================================================
// Trending & categories
// ===================================================================

/**
 * Fetch trending (most popular) videos, optionally filtered by category.
 *
 * Uses the `videos` endpoint with `chart=mostPopular` rather than the
 * `search` endpoint, which means full details (duration, statistics) are
 * returned in a single API call -- no follow-up detail fetch needed.
 *
 * @param categoryId - Optional YouTube video category ID to filter by.
 * @param pageToken  - Optional pagination token for the next page.
 * @returns Paginated list of trending video items.
 */
export async function getTrending(
	categoryId?: string,
	pageToken?: string
): Promise<PaginatedResult<VideoItem>> {
	const cacheKey = `trending:${categoryId ?? ''}:${pageToken ?? ''}`;
	const cached = publicCache.get<PaginatedResult<VideoItem>>(cacheKey);
	if (cached) return cached;

	return singleflight(cacheKey, async () => {
		const params: Record<string, string> = {
			part: 'snippet,contentDetails,statistics',
			chart: 'mostPopular',
			regionCode: 'US',
			maxResults: '50'
		};
		if (categoryId) params.videoCategoryId = categoryId;
		if (pageToken) params.pageToken = pageToken;

		const data = (await youtubeApiFetch('videos', params)) as Record<string, unknown>;
		const items = (data.items as Record<string, unknown>[]) ?? [];
		const videos = items.map(parseVideoItem).filter((v) => v.liveBroadcastContent !== 'upcoming');

		// Populate per-ID video cache so getVideoDetails() can skip re-fetching these
		for (const video of videos) {
			publicCache.set(`video:${video.id}`, video, ONE_HOUR);
		}

		const pageInfoRaw = data.pageInfo as Record<string, unknown> | undefined;
		const result: PaginatedResult<VideoItem> = {
			items: videos,
			pageInfo: {
				nextPageToken: data.nextPageToken as string | undefined,
				totalResults: (pageInfoRaw?.totalResults as number) ?? 0
			}
		};

		publicCache.set(cacheKey, result, THIRTY_MINUTES);
		return result;
	});
}

/**
 * Fetch the list of assignable YouTube video categories for the US region.
 *
 * Categories are stable and rarely change, so results are cached for a full day.
 * Only "assignable" categories are returned (ones that can be set on uploads),
 * which filters out deprecated/internal-only categories.
 *
 * @returns Array of `{id, title}` objects for each assignable category.
 */
export async function getVideoCategories(): Promise<Array<{ id: string; title: string }>> {
	const cacheKey = 'categories';
	const cached = publicCache.get<Array<{ id: string; title: string }>>(cacheKey);
	if (cached) return cached;

	const data = (await youtubeApiFetch('videoCategories', {
		part: 'snippet',
		regionCode: 'US'
	})) as Record<string, unknown>;

	const items = (data.items as Record<string, unknown>[]) ?? [];
	const categories = items
		.filter((i) => {
			const snippet = i.snippet as Record<string, unknown> | undefined;
			return snippet?.assignable === true;
		})
		.map((i) => {
			const snippet = i.snippet as Record<string, unknown>;
			return {
				id: i.id as string,
				title: snippet.title as string
			};
		});

	publicCache.set(cacheKey, categories, ONE_DAY);
	return categories;
}

// ===================================================================
// Comments
// ===================================================================

/**
 * Fetch top-level comment threads for a video, sorted by relevance.
 *
 * @param videoId   - The YouTube video ID.
 * @param pageToken - Optional pagination token for the next page.
 * @returns Paginated list of comment items.
 */
export async function getComments(
	videoId: string,
	pageToken?: string
): Promise<PaginatedResult<CommentItem>> {
	const cacheKey = `comments:${videoId}:${pageToken ?? ''}`;
	const cached = publicCache.get<PaginatedResult<CommentItem>>(cacheKey);
	if (cached) return cached;

	return singleflight(cacheKey, async () => {
		const params: Record<string, string> = {
			part: 'snippet',
			videoId,
			order: 'relevance',
			maxResults: '100'
		};
		if (pageToken) params.pageToken = pageToken;

		const data = (await youtubeApiFetch('commentThreads', params)) as Record<string, unknown>;
		const items = (data.items as Record<string, unknown>[]) ?? [];
		const comments = items.map(parseCommentItem);

		const pageInfoRaw = data.pageInfo as Record<string, unknown> | undefined;
		const result: PaginatedResult<CommentItem> = {
			items: comments,
			pageInfo: {
				nextPageToken: data.nextPageToken as string | undefined,
				totalResults: (pageInfoRaw?.totalResults as number) ?? 0
			}
		};

		publicCache.set(cacheKey, result, THIRTY_MINUTES);
		return result;
	});
}

/**
 * Fetch replies to a specific comment thread.
 *
 * Uses the `comments` endpoint (not `commentThreads`) with `parentId` to get
 * the replies nested under a top-level comment.
 *
 * @param commentId - The top-level comment thread ID.
 * @param pageToken - Optional pagination token for the next page.
 * @returns Paginated list of reply comment items.
 */
export async function getCommentReplies(
	commentId: string,
	pageToken?: string
): Promise<PaginatedResult<CommentItem>> {
	const cacheKey = `replies:${commentId}:${pageToken ?? ''}`;
	const cached = publicCache.get<PaginatedResult<CommentItem>>(cacheKey);
	if (cached) return cached;

	const params: Record<string, string> = {
		part: 'snippet',
		parentId: commentId,
		maxResults: '100'
	};
	if (pageToken) params.pageToken = pageToken;

	const data = (await youtubeApiFetch('comments', params)) as Record<string, unknown>;
	const items = (data.items as Record<string, unknown>[]) ?? [];

	const replies: CommentItem[] = items.map((item) => {
		const snippet = item.snippet as Record<string, unknown> | undefined;
		return {
			id: (item.id as string) ?? '',
			authorName: (snippet?.authorDisplayName as string) ?? '',
			authorAvatarUrl: (snippet?.authorProfileImageUrl as string) ?? '',
			text: (snippet?.textOriginal as string) ?? (snippet?.textDisplay as string) ?? '',
			likeCount: (snippet?.likeCount as number) ?? 0,
			publishedAt: (snippet?.publishedAt as string) ?? '',
			replyCount: 0
		};
	});

	const pageInfoRaw = data.pageInfo as Record<string, unknown> | undefined;
	const result: PaginatedResult<CommentItem> = {
		items: replies,
		pageInfo: {
			nextPageToken: data.nextPageToken as string | undefined,
			totalResults: (pageInfoRaw?.totalResults as number) ?? 0
		}
	};

	publicCache.set(cacheKey, result, THIRTY_MINUTES);
	return result;
}

// ===================================================================
// Playlists
// ===================================================================

/**
 * Fetch metadata for a single playlist by ID.
 *
 * @param playlistId - The YouTube playlist ID.
 * @returns The playlist item, or `null` if it does not exist.
 */
export async function getPlaylist(playlistId: string): Promise<PlaylistItem | null> {
	const cacheKey = `playlist:${playlistId}`;
	const cached = publicCache.get<PlaylistItem | null>(cacheKey);
	if (cached !== undefined) return cached;

	const data = (await youtubeApiFetch('playlists', {
		part: 'snippet,contentDetails',
		id: playlistId
	})) as Record<string, unknown>;

	const items = (data.items as Record<string, unknown>[]) ?? [];
	if (items.length === 0) {
		publicCache.set(cacheKey, null, THIRTY_MINUTES);
		return null;
	}

	const playlist = parsePlaylistItem(items[0]);
	publicCache.set(cacheKey, playlist, ONE_HOUR);
	return playlist;
}

/**
 * Fetch videos contained in a playlist.
 *
 * Retrieves playlist item IDs first, then fetches full video details via
 * {@link getVideoDetails}.
 *
 * @param playlistId - The YouTube playlist ID.
 * @param pageToken  - Optional pagination token for the next page.
 * @returns Paginated list of video items in the playlist.
 */
export async function getPlaylistVideos(
	playlistId: string,
	pageToken?: string
): Promise<PaginatedResult<VideoItem>> {
	const cacheKey = `plvideos:${playlistId}:${pageToken ?? ''}`;
	const cached = publicCache.get<PaginatedResult<VideoItem>>(cacheKey);
	if (cached) return cached;

	return singleflight(cacheKey, async () => {
		const params: Record<string, string> = {
			part: 'snippet',
			playlistId,
			maxResults: '50'
		};
		if (pageToken) params.pageToken = pageToken;

		const data = (await youtubeApiFetch('playlistItems', params)) as Record<string, unknown>;
		const items = (data.items as Record<string, unknown>[]) ?? [];

		const videoIds = items
			.map((i) => {
				const snippet = i.snippet as Record<string, unknown> | undefined;
				const resourceId = snippet?.resourceId as Record<string, string> | undefined;
				return resourceId?.videoId ?? '';
			})
			.filter(Boolean);

		const videos = videoIds.length > 0 ? await getVideoDetails(videoIds) : [];

		const pageInfoRaw = data.pageInfo as Record<string, unknown> | undefined;
		const result: PaginatedResult<VideoItem> = {
			items: videos,
			pageInfo: {
				nextPageToken: data.nextPageToken as string | undefined,
				totalResults: (pageInfoRaw?.totalResults as number) ?? 0
			}
		};

		publicCache.set(cacheKey, result, THIRTY_MINUTES);
		return result;
	});
}

// ===================================================================
// Authenticated endpoints
// ===================================================================

/**
 * Fetch the authenticated user's channel subscriptions.
 *
 * Uses the user-scoped cache keyed by the last 8 characters of the access
 * token -- enough to distinguish sessions without storing the full token
 * in the cache key.
 *
 * @param accessToken - The user's OAuth2 access token.
 * @param pageToken   - Optional pagination token for the next page.
 * @returns Paginated list of subscribed channel items.
 */
export async function getSubscriptions(
	accessToken: string,
	pageToken?: string
): Promise<PaginatedResult<ChannelItem>> {
	const cacheKey = `user:subs:${tokenHash(accessToken)}:${pageToken ?? ''}`;
	const cached = userCache.get<PaginatedResult<ChannelItem>>(cacheKey);
	if (cached) return cached;

	const params: Record<string, string> = {
		part: 'snippet',
		mine: 'true',
		maxResults: '50',
		order: 'alphabetical'
	};
	if (pageToken) params.pageToken = pageToken;

	const data = (await youtubeApiFetch('subscriptions', params, accessToken)) as Record<
		string,
		unknown
	>;
	const items = (data.items as Record<string, unknown>[]) ?? [];

	const channels: ChannelItem[] = items.map((item) => {
		const snippet = item.snippet as Record<string, unknown> | undefined;
		const thumbnails = snippet?.thumbnails as Record<string, Record<string, unknown>> | undefined;
		const resourceId = snippet?.resourceId as Record<string, string> | undefined;

		return {
			id: resourceId?.channelId ?? '',
			title: (snippet?.title as string) ?? '',
			description: (snippet?.description as string) ?? '',
			thumbnailUrl:
				(thumbnails?.medium?.url as string) ?? (thumbnails?.default?.url as string) ?? '',
			subscriberCount: '0',
			videoCount: '0'
		};
	});

	const pageInfoRaw = data.pageInfo as Record<string, unknown> | undefined;
	const result: PaginatedResult<ChannelItem> = {
		items: channels,
		pageInfo: {
			nextPageToken: data.nextPageToken as string | undefined,
			totalResults: (pageInfoRaw?.totalResults as number) ?? 0
		}
	};

	userCache.set(cacheKey, result, THIRTY_MINUTES);
	return result;
}

/**
 * Check if the authenticated user is subscribed to a specific channel.
 *
 * Uses the `subscriptions` endpoint with `forChannelId` to check if a
 * subscription exists. Returns true if the user is subscribed.
 *
 * @param accessToken - The user's OAuth2 access token.
 * @param channelId   - The channel ID to check subscription status for.
 * @returns Whether the user is subscribed to the channel.
 */
export async function checkSubscription(accessToken: string, channelId: string): Promise<boolean> {
	const cacheKey = `user:sub:${tokenHash(accessToken)}:${channelId}`;
	const cached = userCache.get<boolean>(cacheKey);
	if (cached !== undefined) return cached;

	try {
		const data = (await youtubeApiFetch(
			'subscriptions',
			{
				part: 'id',
				mine: 'true',
				forChannelId: channelId
			},
			accessToken
		)) as Record<string, unknown>;

		const items = (data.items as unknown[]) ?? [];
		const isSubscribed = items.length > 0;
		userCache.set(cacheKey, isSubscribed, THIRTY_MINUTES);
		return isSubscribed;
	} catch (err) {
		console.warn(`[YOUTUBE] checkSubscription FAILED for ${channelId}:`, err);
		return false;
	}
}

/**
 * Fetch videos the authenticated user has liked.
 *
 * @param accessToken - The user's OAuth2 access token.
 * @param pageToken   - Optional pagination token for the next page.
 * @returns Paginated list of liked video items.
 */
export async function getLikedVideos(
	accessToken: string,
	pageToken?: string
): Promise<PaginatedResult<VideoItem>> {
	const cacheKey = `user:liked:${tokenHash(accessToken)}:${pageToken ?? ''}`;
	const cached = userCache.get<PaginatedResult<VideoItem>>(cacheKey);
	if (cached) return cached;

	const params: Record<string, string> = {
		part: 'snippet,contentDetails,statistics',
		myRating: 'like',
		maxResults: '50'
	};
	if (pageToken) params.pageToken = pageToken;

	const data = (await youtubeApiFetch('videos', params, accessToken)) as Record<string, unknown>;
	const items = (data.items as Record<string, unknown>[]) ?? [];
	const videos = items.map(parseVideoItem);

	// Populate per-ID video cache so getVideoDetails() can skip re-fetching these
	for (const video of videos) {
		publicCache.set(`video:${video.id}`, video, ONE_HOUR);
	}

	const pageInfoRaw = data.pageInfo as Record<string, unknown> | undefined;
	const result: PaginatedResult<VideoItem> = {
		items: videos,
		pageInfo: {
			nextPageToken: data.nextPageToken as string | undefined,
			totalResults: (pageInfoRaw?.totalResults as number) ?? 0
		}
	};

	userCache.set(cacheKey, result, THIRTY_MINUTES);
	return result;
}

/**
 * Fetch playlists owned by the authenticated user.
 *
 * @param accessToken - The user's OAuth2 access token.
 * @param pageToken   - Optional pagination token for the next page.
 * @returns Paginated list of the user's playlist items.
 */
export async function getUserPlaylists(
	accessToken: string,
	pageToken?: string
): Promise<PaginatedResult<PlaylistItem>> {
	const cacheKey = `user:playlists:${tokenHash(accessToken)}:${pageToken ?? ''}`;
	const cached = userCache.get<PaginatedResult<PlaylistItem>>(cacheKey);
	if (cached) return cached;

	const params: Record<string, string> = {
		part: 'snippet,contentDetails',
		mine: 'true',
		maxResults: '50'
	};
	if (pageToken) params.pageToken = pageToken;

	const data = (await youtubeApiFetch('playlists', params, accessToken)) as Record<string, unknown>;
	const items = (data.items as Record<string, unknown>[]) ?? [];
	const playlists = items.map(parsePlaylistItem);

	const pageInfoRaw = data.pageInfo as Record<string, unknown> | undefined;
	const result: PaginatedResult<PlaylistItem> = {
		items: playlists,
		pageInfo: {
			nextPageToken: data.nextPageToken as string | undefined,
			totalResults: (pageInfoRaw?.totalResults as number) ?? 0
		}
	};

	userCache.set(cacheKey, result, THIRTY_MINUTES);
	return result;
}

/**
 * Fetch a feed of recent videos from the authenticated user's subscriptions.
 *
 * YouTube doesn't provide a direct subscription feed endpoint, so this builds
 * one manually:
 * 1. Fetch subscriptions to get channel IDs.
 * 2. Batch-fetch channels to get each channel's uploads playlist ID.
 * 3. Fetch the most recent uploads from each channel's playlist.
 * 4. Merge all videos, sort by publish date (newest first), and return.
 *
 * To conserve API quota, limits to the first 15 subscribed channels.
 *
 * @param accessToken - The user's OAuth2 access token.
 * @returns Array of recent videos from subscriptions, sorted newest first.
 */
// ===================================================================
// Subscription feed — k-way merge of channel upload timelines
// ===================================================================

/** How many playlist items to fetch per channel per batch. */
const SUBFEED_BATCH_SIZE = 10;
/** How many videos to return per page of the subscription feed. */
const SUBFEED_PAGE_SIZE = 20;
/** Maximum number of subscribed channels to include in the feed. */
const SUBFEED_MAX_CHANNELS = 15;

/** Per-channel cursor state for subscription feed pagination. */
export interface SubFeedChannelCursor {
	/** Uploads playlist ID. */
	playlistId: string;
	/** Videos consumed from the current buffered batch. */
	offset: number;
	/** Token used to fetch the current batch (undefined = first page). */
	fetchToken?: string;
	/** Token for the next batch (undefined = no more pages). */
	nextToken?: string;
}

/** Serializable cursor for resuming the subscription feed k-way merge. */
export type SubFeedCursor = SubFeedChannelCursor[];

/** Result shape for the subscription feed. */
export interface SubFeedResult {
	items: VideoItem[];
	/** Cursor for the next page. Undefined when all channels are exhausted. */
	cursor?: SubFeedCursor;
}

/** Lightweight video reference from playlistItems, used for merge sorting. */
interface PlaylistVideoRef {
	id: string;
	publishedAt: string;
}

/** Working buffer for a single channel during the k-way merge. */
interface ChannelBuffer {
	playlistId: string;
	refs: PlaylistVideoRef[];
	offset: number;
	fetchToken?: string;
	nextToken?: string;
}

/**
 * Fetch one page of a channel's uploads playlist as lightweight refs.
 * Results are cached by the YouTube API client, so re-fetches on resume are free.
 */
async function fetchUploadsBatch(
	playlistId: string,
	pageToken?: string
): Promise<{ refs: PlaylistVideoRef[]; nextToken?: string }> {
	const params: Record<string, string> = {
		part: 'snippet',
		playlistId,
		maxResults: String(SUBFEED_BATCH_SIZE)
	};
	if (pageToken) params.pageToken = pageToken;

	const data = (await youtubeApiFetch('playlistItems', params)) as Record<string, unknown>;
	const items = (data.items as Record<string, unknown>[]) ?? [];

	const refs: PlaylistVideoRef[] = [];
	for (const item of items) {
		const snippet = item.snippet as Record<string, unknown> | undefined;
		const resourceId = snippet?.resourceId as Record<string, string> | undefined;
		const videoId = resourceId?.videoId;
		const publishedAt = (snippet?.publishedAt as string) ?? '';
		if (videoId) refs.push({ id: videoId, publishedAt });
	}

	return { refs, nextToken: data.nextPageToken as string | undefined };
}

/** Refill a channel buffer by fetching its next page. No-op if exhausted. */
async function refillBuffer(buf: ChannelBuffer): Promise<void> {
	if (!buf.nextToken) return;
	const { refs, nextToken } = await fetchUploadsBatch(buf.playlistId, buf.nextToken);
	buf.refs = refs;
	buf.offset = 0;
	buf.fetchToken = buf.nextToken;
	buf.nextToken = nextToken;
}

/** Peek at the next unconsumed video in a buffer, or undefined if empty. */
function peekBuffer(buf: ChannelBuffer): PlaylistVideoRef | undefined {
	return buf.offset < buf.refs.length ? buf.refs[buf.offset] : undefined;
}

/**
 * Build a subscription feed using a k-way merge of channel upload timelines.
 *
 * Each channel's uploads playlist is a sorted stream (newest first). This
 * function maintains a buffer per channel and always picks the globally
 * most recent video across all channels. When a channel's buffer is
 * exhausted, its next page is fetched on demand.
 *
 * On the first call (no cursor), discovers subscriptions and fetches
 * initial batches. On subsequent calls, reconstructs buffers from the
 * cursor (re-fetches hit the API cache).
 *
 * Only fetches full video details for the videos actually returned
 * (typically 20), not for all buffered videos — much more quota-efficient
 * than the naive "fetch everything and sort" approach.
 */
export async function getSubscriptionFeed(
	accessToken: string,
	cursor?: SubFeedCursor
): Promise<SubFeedResult> {
	let buffers: ChannelBuffer[];

	if (!cursor) {
		// First page: discover subscriptions → uploads playlists → initial batches
		const cacheKey = `user:subfeed:plids:${tokenHash(accessToken)}`;
		let playlistIds = userCache.get<string[]>(cacheKey);

		if (!playlistIds) {
			const subs = await getSubscriptions(accessToken);
			const channelIds = subs.items
				.map((ch) => ch.id)
				.filter(Boolean)
				.slice(0, SUBFEED_MAX_CHANNELS);

			if (channelIds.length === 0) return { items: [] };

			const channelData = (await youtubeApiFetch('channels', {
				part: 'contentDetails',
				id: channelIds.join(','),
				maxResults: '50'
			})) as Record<string, unknown>;

			const channelItems = (channelData.items as Record<string, unknown>[]) ?? [];
			playlistIds = [];
			for (const ch of channelItems) {
				const cd = ch.contentDetails as Record<string, unknown> | undefined;
				const rp = cd?.relatedPlaylists as Record<string, string> | undefined;
				const chId = (ch.id as string) ?? '';
				if (rp?.uploads) {
					playlistIds.push(rp.uploads);
					// Populate per-channel uploads cache so getChannelVideos() can skip the lookup
					if (chId) publicCache.set(`ch:uploads:${chId}`, rp.uploads, ONE_DAY);
				}
			}

			userCache.set(cacheKey, playlistIds, THIRTY_MINUTES);
		}

		// Fetch first batch from all channels in parallel
		const results = await Promise.all(
			playlistIds.map(async (pid) => {
				try {
					const { refs, nextToken } = await fetchUploadsBatch(pid);
					return {
						playlistId: pid,
						refs,
						offset: 0,
						fetchToken: undefined,
						nextToken
					} as ChannelBuffer;
				} catch (err) {
					console.warn(`[YOUTUBE] subfeed — failed initial fetch for ${pid}:`, err);
					return null;
				}
			})
		);
		buffers = results.filter((r): r is ChannelBuffer => r !== null);
	} else {
		// Resume from cursor: re-fetch each channel's current page (cached)
		const results = await Promise.all(
			cursor.map(async (ch) => {
				try {
					const { refs, nextToken } = await fetchUploadsBatch(ch.playlistId, ch.fetchToken);
					return {
						playlistId: ch.playlistId,
						refs,
						offset: ch.offset,
						fetchToken: ch.fetchToken,
						nextToken
					} as ChannelBuffer;
				} catch (err) {
					console.warn(`[YOUTUBE] subfeed — failed resume for ${ch.playlistId}:`, err);
					return null;
				}
			})
		);
		buffers = results.filter((r): r is ChannelBuffer => r !== null);
	}

	// K-way merge: repeatedly pick the globally most recent video
	const selectedIds: string[] = [];

	while (selectedIds.length < SUBFEED_PAGE_SIZE) {
		// Find the channel whose top video is most recent
		let bestIdx = -1;
		let bestDate = '';

		for (let i = 0; i < buffers.length; i++) {
			const top = peekBuffer(buffers[i]);
			if (!top) continue;
			if (bestIdx === -1 || top.publishedAt > bestDate) {
				bestIdx = i;
				bestDate = top.publishedAt;
			}
		}

		if (bestIdx === -1) {
			// All current buffers empty — try refilling channels that have more pages
			const toRefill = buffers.filter((b) => !peekBuffer(b) && b.nextToken);
			if (toRefill.length === 0) break; // truly exhausted
			await Promise.all(toRefill.map(refillBuffer));
			continue;
		}

		// Take this video and advance the channel's cursor
		selectedIds.push(buffers[bestIdx].refs[buffers[bestIdx].offset].id);
		buffers[bestIdx].offset++;

		// Eagerly refill if this channel's buffer is now exhausted
		if (!peekBuffer(buffers[bestIdx]) && buffers[bestIdx].nextToken) {
			await refillBuffer(buffers[bestIdx]);
		}
	}

	// Fetch full video details only for the selected IDs (quota-efficient)
	const videos = selectedIds.length > 0 ? await getVideoDetails(selectedIds) : [];

	// Preserve merge order (getVideoDetails may return in different order)
	const videoMap = new Map(videos.map((v) => [v.id, v]));
	const orderedVideos = selectedIds
		.map((id) => videoMap.get(id))
		.filter((v): v is VideoItem => v !== undefined);

	// Build cursor: only include channels that still have content
	const activeBuffers = buffers.filter((b) => peekBuffer(b) || b.nextToken);
	const newCursor: SubFeedCursor | undefined =
		activeBuffers.length > 0
			? activeBuffers.map((b) => ({
					playlistId: b.playlistId,
					offset: b.offset,
					fetchToken: b.fetchToken,
					nextToken: b.nextToken
				}))
			: undefined;

	return { items: orderedVideos, cursor: newCursor };
}

/**
 * Fetch the authenticated user's own YouTube channel profile (avatar, title).
 *
 * Uses the `channels` endpoint with `mine=true` to get the channel belonging
 * to the currently authenticated user.
 *
 * @param accessToken - The user's OAuth2 access token.
 * @returns Object with `avatarUrl` and `channelTitle`, or null if not found.
 */
export async function getUserProfile(
	accessToken: string
): Promise<{ avatarUrl: string; channelTitle: string } | null> {
	const cacheKey = `user:profile:${tokenHash(accessToken)}`;
	const cached = userCache.get<{ avatarUrl: string; channelTitle: string }>(cacheKey);
	if (cached) return cached;

	try {
		const data = (await youtubeApiFetch(
			'channels',
			{ part: 'snippet', mine: 'true' },
			accessToken
		)) as Record<string, unknown>;

		const items = (data.items as Record<string, unknown>[]) ?? [];
		if (items.length === 0) return null;

		const snippet = items[0].snippet as Record<string, unknown> | undefined;
		const thumbnails = snippet?.thumbnails as Record<string, Record<string, unknown>> | undefined;

		const profile = {
			avatarUrl: (thumbnails?.default?.url as string) ?? '',
			channelTitle: (snippet?.title as string) ?? ''
		};

		userCache.set(cacheKey, profile, THIRTY_MINUTES);
		return profile;
	} catch (err) {
		console.error('[YOUTUBE] getUserProfile FAILED:', err);
		return null;
	}
}

// ===================================================================
// Autocomplete
// ===================================================================

/**
 * Fetch search autocomplete suggestions from YouTube's suggestion service.
 *
 * This uses an undocumented YouTube endpoint (`suggestqueries-clients6`)
 * that returns results in a JSONP-like format rather than standard JSON.
 * The response looks like: `window.google.ac.h([[query,[suggestions...],...]])`.
 * We extract the inner JSON array with a regex and parse it manually.
 *
 * This endpoint does NOT count against the YouTube Data API quota because
 * it is a separate Google service used by the YouTube search bar itself.
 *
 * @param query - The partial search string to get suggestions for.
 * @returns Array of suggestion strings, or empty array on failure.
 */
export async function getAutocompleteSuggestions(query: string): Promise<string[]> {
	if (!query.trim()) return [];

	const cacheKey = `autocomplete:${encodeURIComponent(query)}`;
	const cached = publicCache.get<string[]>(cacheKey);
	if (cached) return cached;

	try {
		const url = `https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(query)}`;
		const res = await fetch(url);
		const text = await res.text();

		/*
		 * The response is JSONP-wrapped, not valid JSON. It looks like:
		 *   window.google.ac.h([["query",[["suggestion1",0],["suggestion2",0],...]])
		 * We use a greedy regex to extract the outermost JSON array, then parse
		 * the nested structure: parsed[1] is an array of [suggestion, weight] tuples.
		 */
		const match = text.match(/\[.+\]/s);
		if (!match) return [];

		const parsed = JSON.parse(match[0]) as unknown[];
		const suggestions = (parsed[1] as unknown[][])?.map((item) => item[0] as string) ?? [];

		publicCache.set(cacheKey, suggestions, THIRTY_MINUTES);
		return suggestions;
	} catch (err) {
		console.warn(`[YOUTUBE] getAutocompleteSuggestions FAILED for "${query}":`, err);
		return [];
	}
}
