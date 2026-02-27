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
 * - `user:subs:x1y2z3ab:` — subscriptions for a user identified by the last
 *   8 characters of their access token (avoids storing the full token in keys).
 *
 * **Why detail fetches follow search:**
 * The YouTube `search` endpoint only returns `snippet` data (title, thumbnail,
 * channel). It does NOT include `contentDetails` (duration) or `statistics`
 * (view count, likes). To get those, a second call to the `videos` or
 * `channels` endpoint is required with the IDs from the search results.
 */

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

const FIVE_MINUTES = 5 * 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

// ===================================================================
// Internal helpers
// ===================================================================

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
 * @throws {Error} If the API responds with a non-2xx status.
 */
async function youtubeApiFetch(
	endpoint: string,
	params: Record<string, string>,
	accessToken?: string
): Promise<unknown> {
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

	/* Log the request — mask the API key in the URL for security */
	const logUrl = url.toString().replace(/key=[^&]+/, 'key=***MASKED***');
	console.log(
		`[YOUTUBE API] Fetching ${endpoint}, authenticated: ${!!accessToken}, url: ${logUrl}`
	);
	const startTime = Date.now();

	const res = await fetch(url.toString(), { headers });
	const elapsed = Date.now() - startTime;

	if (!res.ok) {
		const errorBody = await res.text();
		console.error(`[YOUTUBE API] ERROR ${res.status} on ${endpoint} (${elapsed}ms): ${errorBody}`);
		throw new Error(`YouTube API error ${res.status} on ${endpoint}: ${errorBody}`);
	}

	console.log(`[YOUTUBE API] SUCCESS ${endpoint} — ${res.status} (${elapsed}ms)`);
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

	return {
		id:
			typeof item.id === 'string'
				? item.id
				: ((item.id as Record<string, string>)?.channelId ?? ''),
		title: (snippet?.title as string) ?? '',
		description: (snippet?.description as string) ?? '',
		thumbnailUrl: (thumbnails?.medium?.url as string) ?? (thumbnails?.default?.url as string) ?? '',
		subscriberCount: (statistics?.subscriberCount as string) ?? '0',
		videoCount: (statistics?.videoCount as string) ?? '0'
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
	options?: { pageToken?: string; videoDuration?: string; order?: string }
): Promise<PaginatedResult<VideoItem>> {
	const cacheKey = `search:v:${query}:${options?.pageToken ?? ''}:${options?.videoDuration ?? ''}:${options?.order ?? ''}`;
	const cached = publicCache.get<PaginatedResult<VideoItem>>(cacheKey);
	if (cached) {
		console.log(`[YOUTUBE] searchVideos CACHE HIT for "${query}", ${cached.items.length} items`);
		return cached;
	}
	console.log(`[YOUTUBE] searchVideos CACHE MISS for "${query}", fetching from API...`);

	const params: Record<string, string> = {
		part: 'snippet',
		type: 'video',
		q: query,
		maxResults: '20'
	};
	if (options?.pageToken) params.pageToken = options.pageToken;
	if (options?.videoDuration) params.videoDuration = options.videoDuration;
	if (options?.order) params.order = options.order;

	const data = (await youtubeApiFetch('search', params)) as Record<string, unknown>;
	const items = (data.items as Record<string, unknown>[]) ?? [];
	const videoIds = items
		.map((i) => (i.id as Record<string, string>)?.videoId ?? '')
		.filter(Boolean);

	const videos = videoIds.length > 0 ? await getVideoDetails(videoIds) : [];
	console.log(
		`[YOUTUBE] searchVideos for "${query}" — found ${videoIds.length} IDs, got ${videos.length} video details`
	);

	const pageInfoRaw = data.pageInfo as Record<string, unknown> | undefined;
	const result: PaginatedResult<VideoItem> = {
		items: videos,
		pageInfo: {
			nextPageToken: data.nextPageToken as string | undefined,
			totalResults: (pageInfoRaw?.totalResults as number) ?? 0
		}
	};

	publicCache.set(cacheKey, result, FIVE_MINUTES);
	return result;
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
	const cacheKey = `search:c:${query}:${pageToken ?? ''}`;
	const cached = publicCache.get<PaginatedResult<ChannelItem>>(cacheKey);
	if (cached) return cached;

	const params: Record<string, string> = {
		part: 'snippet',
		type: 'channel',
		q: query,
		maxResults: '20'
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

	publicCache.set(cacheKey, result, FIVE_MINUTES);
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
	const cacheKey = `search:p:${query}:${pageToken ?? ''}`;
	const cached = publicCache.get<PaginatedResult<PlaylistItem>>(cacheKey);
	if (cached) return cached;

	const params: Record<string, string> = {
		part: 'snippet',
		type: 'playlist',
		q: query,
		maxResults: '20'
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

	publicCache.set(cacheKey, result, FIVE_MINUTES);
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
	console.log(`[YOUTUBE] getVideoDetails called with ${ids.length} IDs`);
	const results: VideoItem[] = [];
	const uncachedIds: string[] = [];

	/* Check individual video cache first — avoids redundant API calls when the
	 * same video ID appears in different batch combinations (e.g. a video that
	 * shows up in both search results and trending). */
	for (const id of ids) {
		const cached = publicCache.get<VideoItem>(`video:${id}`);
		if (cached) {
			results.push(cached);
		} else {
			uncachedIds.push(id);
		}
	}

	if (uncachedIds.length > 0) {
		console.log(
			`[YOUTUBE] getVideoDetails — ${results.length} individual cache hits, ${uncachedIds.length} need fetching`
		);
	}

	/* Batch-fetch uncached IDs in groups of 50 (YouTube API maximum). */
	for (let i = 0; i < uncachedIds.length; i += 50) {
		const batch = uncachedIds.slice(i, i + 50);
		console.log(`[YOUTUBE] getVideoDetails fetching batch of ${batch.length} from API`);
		const data = (await youtubeApiFetch('videos', {
			part: 'snippet,contentDetails,statistics',
			id: batch.join(','),
			maxResults: '50'
		})) as Record<string, unknown>;

		const items = (data.items as Record<string, unknown>[]) ?? [];
		const videos = items.map(parseVideoItem);
		console.log(`[YOUTUBE] getVideoDetails batch returned ${videos.length} videos`);

		/* Cache each video individually so future requests for any subset
		 * of these IDs will hit the per-ID cache. */
		for (const video of videos) {
			publicCache.set(`video:${video.id}`, video, FIFTEEN_MINUTES);
		}
		results.push(...videos);
	}

	console.log(`[YOUTUBE] getVideoDetails total: ${results.length} videos`);
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
	console.log(`[YOUTUBE] getChannelDetails called with ${ids.length} IDs`);
	const results: ChannelItem[] = [];
	const uncachedIds: string[] = [];

	/* Per-ID cache check — same pattern as getVideoDetails. */
	for (const id of ids) {
		const cached = publicCache.get<ChannelItem>(`channel:${id}`);
		if (cached) {
			results.push(cached);
		} else {
			uncachedIds.push(id);
		}
	}

	if (uncachedIds.length > 0) {
		console.log(
			`[YOUTUBE] getChannelDetails — ${results.length} individual cache hits, ${uncachedIds.length} need fetching`
		);
	}

	for (let i = 0; i < uncachedIds.length; i += 50) {
		const batch = uncachedIds.slice(i, i + 50);
		const data = (await youtubeApiFetch('channels', {
			part: 'snippet,statistics,brandingSettings',
			id: batch.join(','),
			maxResults: '50'
		})) as Record<string, unknown>;

		const items = (data.items as Record<string, unknown>[]) ?? [];
		const channels = items.map(parseChannelItem);
		console.log(`[YOUTUBE] getChannelDetails batch returned ${channels.length} channels`);

		for (const channel of channels) {
			publicCache.set(`channel:${channel.id}`, channel, ONE_HOUR);
		}
		results.push(...channels);
	}

	console.log(`[YOUTUBE] getChannelDetails total: ${results.length} channels`);
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
	const cacheKey = `chvideos:${channelId}:${pageToken ?? ''}`;
	const cached = publicCache.get<PaginatedResult<VideoItem>>(cacheKey);
	if (cached) {
		console.log(
			`[YOUTUBE] getChannelVideos CACHE HIT for ${channelId}, ${cached.items.length} items`
		);
		return cached;
	}
	console.log(`[YOUTUBE] getChannelVideos CACHE MISS for ${channelId}, fetching from API...`);

	// Step 1: Get channel's uploads playlist ID
	const channelData = (await youtubeApiFetch('channels', {
		part: 'contentDetails',
		id: channelId
	})) as Record<string, unknown>;

	const channelItems = (channelData.items as Record<string, unknown>[]) ?? [];
	if (channelItems.length === 0) {
		return { items: [], pageInfo: { totalResults: 0 } };
	}

	const contentDetails = channelItems[0].contentDetails as Record<string, unknown>;
	const relatedPlaylists = contentDetails?.relatedPlaylists as Record<string, string>;
	const uploadsPlaylistId = relatedPlaylists?.uploads;

	if (!uploadsPlaylistId) {
		return { items: [], pageInfo: { totalResults: 0 } };
	}

	// Step 2: Get playlist items
	const params: Record<string, string> = {
		part: 'snippet',
		playlistId: uploadsPlaylistId,
		maxResults: '20'
	};
	if (pageToken) params.pageToken = pageToken;

	const playlistData = (await youtubeApiFetch('playlistItems', params)) as Record<string, unknown>;
	const playlistItems = (playlistData.items as Record<string, unknown>[]) ?? [];

	const videoIds = playlistItems
		.map((i) => {
			const snippet = i.snippet as Record<string, unknown> | undefined;
			const resourceId = snippet?.resourceId as Record<string, string> | undefined;
			return resourceId?.videoId ?? '';
		})
		.filter(Boolean);

	// Step 3: Get full video details
	const videos = videoIds.length > 0 ? await getVideoDetails(videoIds) : [];

	const pageInfoRaw = playlistData.pageInfo as Record<string, unknown> | undefined;
	const result: PaginatedResult<VideoItem> = {
		items: videos,
		pageInfo: {
			nextPageToken: playlistData.nextPageToken as string | undefined,
			totalResults: (pageInfoRaw?.totalResults as number) ?? 0
		}
	};

	publicCache.set(cacheKey, result, FIVE_MINUTES);
	return result;
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
	if (cached) {
		console.log(`[YOUTUBE] getTrending CACHE HIT, ${cached.items.length} items`);
		return cached;
	}
	console.log(
		`[YOUTUBE] getTrending CACHE MISS, fetching from API... categoryId: ${categoryId ?? 'none'}`
	);

	const params: Record<string, string> = {
		part: 'snippet,contentDetails,statistics',
		chart: 'mostPopular',
		regionCode: 'US',
		maxResults: '20'
	};
	if (categoryId) params.videoCategoryId = categoryId;
	if (pageToken) params.pageToken = pageToken;

	const data = (await youtubeApiFetch('videos', params)) as Record<string, unknown>;
	const items = (data.items as Record<string, unknown>[]) ?? [];
	const videos = items.map(parseVideoItem);
	console.log(`[YOUTUBE] getTrending returned ${videos.length} videos`);

	const pageInfoRaw = data.pageInfo as Record<string, unknown> | undefined;
	const result: PaginatedResult<VideoItem> = {
		items: videos,
		pageInfo: {
			nextPageToken: data.nextPageToken as string | undefined,
			totalResults: (pageInfoRaw?.totalResults as number) ?? 0
		}
	};

	publicCache.set(cacheKey, result, FIVE_MINUTES);
	return result;
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
	if (cached) {
		console.log(`[YOUTUBE] getVideoCategories CACHE HIT, ${cached.length} categories`);
		return cached;
	}
	console.log('[YOUTUBE] getVideoCategories CACHE MISS, fetching from API...');

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

	console.log(`[YOUTUBE] getVideoCategories returned ${categories.length} assignable categories`);
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
	if (cached) {
		console.log(`[YOUTUBE] getComments CACHE HIT for ${videoId}, ${cached.items.length} comments`);
		return cached;
	}
	console.log(`[YOUTUBE] getComments CACHE MISS for ${videoId}, fetching from API...`);

	const params: Record<string, string> = {
		part: 'snippet',
		videoId,
		order: 'relevance',
		maxResults: '20'
	};
	if (pageToken) params.pageToken = pageToken;

	const data = (await youtubeApiFetch('commentThreads', params)) as Record<string, unknown>;
	const items = (data.items as Record<string, unknown>[]) ?? [];
	const comments = items.map(parseCommentItem);
	console.log(`[YOUTUBE] getComments for ${videoId} returned ${comments.length} comments`);

	const pageInfoRaw = data.pageInfo as Record<string, unknown> | undefined;
	const result: PaginatedResult<CommentItem> = {
		items: comments,
		pageInfo: {
			nextPageToken: data.nextPageToken as string | undefined,
			totalResults: (pageInfoRaw?.totalResults as number) ?? 0
		}
	};

	publicCache.set(cacheKey, result, FIVE_MINUTES);
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
		publicCache.set(cacheKey, null, FIVE_MINUTES);
		return null;
	}

	const playlist = parsePlaylistItem(items[0]);
	publicCache.set(cacheKey, playlist, FIFTEEN_MINUTES);
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

	const params: Record<string, string> = {
		part: 'snippet',
		playlistId,
		maxResults: '20'
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

	publicCache.set(cacheKey, result, FIVE_MINUTES);
	return result;
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
	const cacheKey = `user:subs:${accessToken.slice(-8)}:${pageToken ?? ''}`;
	const cached = userCache.get<PaginatedResult<ChannelItem>>(cacheKey);
	if (cached) {
		console.log(`[YOUTUBE] getSubscriptions CACHE HIT, ${cached.items.length} channels`);
		return cached;
	}
	console.log('[YOUTUBE] getSubscriptions CACHE MISS, fetching from API...');

	const params: Record<string, string> = {
		part: 'snippet',
		mine: 'true',
		maxResults: '20',
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

	userCache.set(cacheKey, result, FIVE_MINUTES);
	return result;
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
	const cacheKey = `user:liked:${accessToken.slice(-8)}:${pageToken ?? ''}`;
	const cached = userCache.get<PaginatedResult<VideoItem>>(cacheKey);
	if (cached) {
		console.log(`[YOUTUBE] getLikedVideos CACHE HIT, ${cached.items.length} videos`);
		return cached;
	}
	console.log('[YOUTUBE] getLikedVideos CACHE MISS, fetching from API...');

	const params: Record<string, string> = {
		part: 'snippet,contentDetails,statistics',
		myRating: 'like',
		maxResults: '20'
	};
	if (pageToken) params.pageToken = pageToken;

	const data = (await youtubeApiFetch('videos', params, accessToken)) as Record<string, unknown>;
	const items = (data.items as Record<string, unknown>[]) ?? [];
	const videos = items.map(parseVideoItem);

	const pageInfoRaw = data.pageInfo as Record<string, unknown> | undefined;
	const result: PaginatedResult<VideoItem> = {
		items: videos,
		pageInfo: {
			nextPageToken: data.nextPageToken as string | undefined,
			totalResults: (pageInfoRaw?.totalResults as number) ?? 0
		}
	};

	userCache.set(cacheKey, result, FIVE_MINUTES);
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
	const cacheKey = `user:playlists:${accessToken.slice(-8)}:${pageToken ?? ''}`;
	const cached = userCache.get<PaginatedResult<PlaylistItem>>(cacheKey);
	if (cached) {
		console.log(`[YOUTUBE] getUserPlaylists CACHE HIT, ${cached.items.length} playlists`);
		return cached;
	}
	console.log('[YOUTUBE] getUserPlaylists CACHE MISS, fetching from API...');

	const params: Record<string, string> = {
		part: 'snippet,contentDetails',
		mine: 'true',
		maxResults: '20'
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

	userCache.set(cacheKey, result, FIVE_MINUTES);
	return result;
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
	const cacheKey = `user:profile:${accessToken.slice(-8)}`;
	const cached = userCache.get<{ avatarUrl: string; channelTitle: string }>(cacheKey);
	if (cached) {
		console.log(`[YOUTUBE] getUserProfile CACHE HIT`);
		return cached;
	}
	console.log('[YOUTUBE] getUserProfile CACHE MISS, fetching from API...');

	try {
		const data = (await youtubeApiFetch(
			'channels',
			{ part: 'snippet', mine: 'true' },
			accessToken
		)) as Record<string, unknown>;

		const items = (data.items as Record<string, unknown>[]) ?? [];
		if (items.length === 0) {
			console.warn('[YOUTUBE] getUserProfile returned no channels');
			return null;
		}

		const snippet = items[0].snippet as Record<string, unknown> | undefined;
		const thumbnails = snippet?.thumbnails as Record<string, Record<string, unknown>> | undefined;

		const profile = {
			avatarUrl: (thumbnails?.default?.url as string) ?? '',
			channelTitle: (snippet?.title as string) ?? ''
		};

		console.log('[YOUTUBE] getUserProfile SUCCESS:', profile.channelTitle);
		userCache.set(cacheKey, profile, FIVE_MINUTES);
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

	const cacheKey = `autocomplete:${query}`;
	const cached = publicCache.get<string[]>(cacheKey);
	if (cached) {
		console.log(
			`[YOUTUBE] getAutocompleteSuggestions CACHE HIT for "${query}", ${cached.length} suggestions`
		);
		return cached;
	}
	console.log(`[YOUTUBE] getAutocompleteSuggestions CACHE MISS for "${query}", fetching...`);

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

		console.log(
			`[YOUTUBE] getAutocompleteSuggestions for "${query}" returned ${suggestions.length} suggestions`
		);
		publicCache.set(cacheKey, suggestions, FIVE_MINUTES);
		return suggestions;
	} catch (err) {
		console.warn(`[YOUTUBE] getAutocompleteSuggestions FAILED for "${query}":`, err);
		return [];
	}
}
