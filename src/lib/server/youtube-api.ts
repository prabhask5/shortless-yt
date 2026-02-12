/**
 * @fileoverview YouTube Data API v3 wrapper with caching, Shorts filtering, and quota management.
 *
 * This module is the core server-side data layer for the Shortless YT application. It wraps
 * every YouTube API call with:
 *   1. **In-memory caching** — Each endpoint has a TTL-based cache to minimize quota usage.
 *   2. **Shorts filtering** — Videos detected as Shorts are automatically removed from results.
 *   3. **Backfill logic** — When too many results are filtered out (Shorts), additional API pages
 *      are fetched to maintain a minimum visible result count.
 *   4. **Channel thumbnail enrichment** — Video results are enriched with channel avatar URLs
 *      via a batched, cache-aware lookup.
 *   5. **Structured logging** — Every API call (cache hit or miss) is logged for debugging.
 *
 * All exported functions return typed response objects (see `$lib/types`).
 */

import { env } from '$env/dynamic/private';
import { cacheGet, cacheSet, getCacheTTL } from './cache';
import { detectShort, parseDuration } from './shorts-filter';
import { logApiCall, logError, logShortsFilter } from './logger';
import type {
	VideoItem,
	SearchResponse,
	CommentsResponse,
	CommentThread,
	Comment,
	ChannelInfo,
	PlaylistInfo,
	SubscriptionChannel,
	SearchResultItem,
	EnhancedSearchResponse
} from '$lib/types';

/** Base URL for all YouTube Data API v3 requests */
const API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * Retrieves the YouTube API key from environment variables.
 * @returns {string} The YouTube Data API v3 key
 * @throws {Error} If the YT_API_KEY environment variable is not set
 */
function getApiKey(): string {
	const key = env.YT_API_KEY;
	if (!key) throw new Error('YT_API_KEY environment variable is not set');
	return key;
}

/**
 * Makes an authenticated GET request to the YouTube Data API using the server API key.
 * This is the low-level fetch wrapper used by all public-data endpoints (no OAuth required).
 *
 * @param {string} endpoint - The API endpoint path (e.g. 'search', 'videos', 'channels')
 * @param {Record<string, string>} params - Query parameters to include in the request (excluding 'key')
 * @returns {Promise<unknown>} The parsed JSON response body
 * @throws {Error} If the API returns a non-OK status (includes status code and truncated body)
 * @throws {Error} Specific error message when quota is exceeded (HTTP 429)
 */
async function ytFetch(endpoint: string, params: Record<string, string>): Promise<unknown> {
	const url = new URL(`${API_BASE}/${endpoint}`);
	url.searchParams.set('key', getApiKey());
	// Append all non-empty params to the URL
	for (const [k, v] of Object.entries(params)) {
		if (v) url.searchParams.set(k, v);
	}

	const res = await fetch(url.toString());
	if (!res.ok) {
		const body = await res.text();
		logError(`YouTube API error: ${endpoint}`, { status: res.status, body: body.slice(0, 500) });
		// Distinguish quota errors from other API failures for upstream handling
		if (res.status === 429) {
			throw new Error('YouTube API quota exceeded');
		}
		throw new Error(`YouTube API error ${res.status}: ${body.slice(0, 200)}`);
	}
	return res.json();
}

/**
 * Maps a raw YouTube API video resource into a normalized VideoItem.
 * Also runs Shorts detection on the video to flag it for filtering.
 *
 * @param {any} item - A raw video resource from the YouTube API (videos.list or search.list response item)
 * @returns {VideoItem} A normalized video object with Shorts detection metadata
 */
function mapVideoItem(item: any): VideoItem {
	const snippet = item.snippet || {};
	const contentDetails = item.contentDetails || {};
	const statistics = item.statistics || {};
	const duration = contentDetails.duration || ''; // ISO 8601 duration (e.g. "PT5M30S")
	const durationSeconds = parseDuration(duration); // Convert to raw seconds for Shorts detection

	// Run the multi-signal Shorts detection heuristic
	const detection = detectShort(
		durationSeconds,
		snippet.title || '',
		snippet.description || '',
		snippet.tags
	);

	return {
		// The `id` field differs between videos.list (string) and search.list (object with videoId)
		id: typeof item.id === 'string' ? item.id : item.id?.videoId || '',
		title: snippet.title || '',
		description: snippet.description || '',
		channelId: snippet.channelId || '',
		channelTitle: snippet.channelTitle || '',
		publishedAt: snippet.publishedAt || '',
		thumbnails: snippet.thumbnails || {},
		duration,
		durationSeconds,
		viewCount: statistics.viewCount || '0',
		likeCount: statistics.likeCount || '0',
		commentCount: statistics.commentCount || '0',
		tags: snippet.tags,
		isShort: detection.isShort,
		shortReason: detection.reason,
		liveBroadcastContent: snippet.liveBroadcastContent
	};
}

/**
 * Fetches channel thumbnail URLs for a list of channel IDs, using cache where possible.
 * Uncached IDs are batch-fetched from the YouTube API (up to 50 per request, the API max).
 *
 * @param {string[]} channelIds - Array of YouTube channel IDs to fetch thumbnails for
 * @returns {Promise<Map<string, string>>} Map of channelId → thumbnail URL
 */
async function getChannelThumbnails(channelIds: string[]): Promise<Map<string, string>> {
	const result = new Map<string, string>();
	if (channelIds.length === 0) return result;

	// Partition IDs into cached vs uncached to minimize API calls
	const uncachedIds: string[] = [];
	for (const id of channelIds) {
		const cached = cacheGet<string>(`channelThumb:${id}`);
		if (cached && !cached.stale) {
			result.set(id, cached.data);
		} else {
			uncachedIds.push(id);
		}
	}

	if (uncachedIds.length === 0) return result;

	// Batch fetch up to 50 per call (YouTube API limit for channels.list)
	for (let i = 0; i < uncachedIds.length; i += 50) {
		const batch = uncachedIds.slice(i, i + 50);
		try {
			logApiCall('channels.list (thumbnails)', { ids: batch.join(',') }, false);
			const data: any = await ytFetch('channels', {
				part: 'snippet',
				id: batch.join(',')
			});
			for (const item of data.items || []) {
				const url = item.snippet?.thumbnails?.default?.url || '';
				if (url) {
					result.set(item.id, url);
					cacheSet(`channelThumb:${item.id}`, url, getCacheTTL('channelThumbnail'));
				}
			}
		} catch {
			// Non-critical — thumbnails are decorative, so we continue without them
		}
	}

	return result;
}

/**
 * Enriches an array of VideoItem objects with their channel's thumbnail URL.
 * Deduplicates channel IDs before fetching to avoid redundant API calls.
 * Mutates the input array in-place by setting `channelThumbnail` on each video.
 *
 * @param {VideoItem[]} videos - Array of videos to enrich (mutated in-place)
 * @returns {Promise<void>}
 */
async function enrichWithChannelThumbnails(videos: VideoItem[]): Promise<void> {
	// Deduplicate channel IDs across all videos to minimize API calls
	const uniqueChannelIds = [...new Set(videos.map((v) => v.channelId).filter(Boolean))];
	if (uniqueChannelIds.length === 0) return;

	const thumbs = await getChannelThumbnails(uniqueChannelIds);
	for (const video of videos) {
		const thumb = thumbs.get(video.channelId);
		if (thumb) video.channelThumbnail = thumb;
	}
}

/**
 * Searches YouTube for videos matching a query, with automatic Shorts filtering and backfill.
 *
 * **Backfill strategy:** If more than 50% of results on a page are Shorts, the function
 * fetches additional pages (up to MAX_BACKFILL = 3 extra) to ensure at least MIN_VISIBLE = 20
 * non-Shorts results are returned. This prevents sparse result pages.
 *
 * @param {string} query - The search query string
 * @param {string} [pageToken] - YouTube API pagination token for fetching subsequent pages
 * @param {string} [regionCode='US'] - ISO 3166-1 alpha-2 country code for regional results
 * @param {string} [relevanceLanguage='en'] - ISO 639-1 language code for relevance ranking
 * @param {number} [maxResults=25] - Max results per API page (YouTube caps at 50)
 * @returns {Promise<SearchResponse>} Filtered search results with pagination metadata
 */
export async function searchVideos(
	query: string,
	pageToken?: string,
	regionCode = 'US',
	relevanceLanguage = 'en',
	maxResults = 25
): Promise<SearchResponse> {
	const cacheKey = `search:${query}:${pageToken || ''}:${regionCode}:${relevanceLanguage}`;
	const cached = cacheGet<SearchResponse>(cacheKey);
	if (cached && !cached.stale) {
		logApiCall('search', { query, cacheHit: 'true' }, true);
		return cached.data;
	}

	/** Minimum number of non-Shorts videos to aim for before returning */
	const MIN_VISIBLE = 20;
	/** Maximum number of additional API pages to fetch when Shorts ratio is high */
	const MAX_BACKFILL = 3;

	let allVisible: VideoItem[] = [];
	let currentPageToken = pageToken;
	let totalFiltered = 0;
	let backfillPages = 0;
	let lastPageToken: string | undefined;

	// Iteratively fetch pages until we have enough visible (non-Shorts) results
	while (allVisible.length < MIN_VISIBLE && backfillPages <= MAX_BACKFILL) {
		const params: Record<string, string> = {
			part: 'snippet',
			type: 'video',
			q: query,
			maxResults: maxResults.toString(),
			regionCode,
			relevanceLanguage
		};
		if (currentPageToken) params.pageToken = currentPageToken;

		logApiCall('search.list', params, false);
		const searchResult: any = await ytFetch('search', params);

		// Extract video IDs from search results (search.list only returns snippet, not full data)
		const videoIds = (searchResult.items || [])
			.map((item: any) => item.id?.videoId)
			.filter(Boolean)
			.join(',');

		if (!videoIds) break;

		// Hydrate with full video data (contentDetails + statistics) for Shorts detection
		const videos = await getVideosByIds(videoIds);

		// Separate Shorts from regular videos
		const visible = videos.filter((v) => !v.isShort);
		const filtered = videos.length - visible.length;
		totalFiltered += filtered;

		allVisible.push(...visible);
		lastPageToken = searchResult.nextPageToken;
		currentPageToken = searchResult.nextPageToken;

		if (!currentPageToken) break; // No more pages available

		// Trigger backfill if >50% of this page was Shorts, or if we're already backfilling
		if (backfillPages > 0 || visible.length < videos.length * 0.5) {
			backfillPages++;
		} else {
			break; // Enough visible results and low Shorts ratio — stop fetching
		}
	}

	logShortsFilter(totalFiltered, allVisible.length + totalFiltered, backfillPages);

	await enrichWithChannelThumbnails(allVisible);

	const result: SearchResponse = {
		items: allVisible,
		nextPageToken: lastPageToken,
		totalResults: allVisible.length,
		filteredCount: totalFiltered,
		backfillPages
	};

	cacheSet(cacheKey, result, getCacheTTL('search'));

	// If we had stale cached data, serve it while fresh data is being computed
	if (cached?.stale) {
		return cached.data;
	}

	return result;
}

/**
 * Fetches full video details for a comma-separated list of video IDs.
 * Leverages per-video caching: only uncached IDs are fetched from the API.
 * Returns videos in the same order as the input ID list.
 *
 * @param {string} ids - Comma-separated YouTube video IDs (e.g. "abc123,def456")
 * @returns {Promise<VideoItem[]>} Fully hydrated video items in input order
 */
export async function getVideosByIds(ids: string): Promise<VideoItem[]> {
	if (!ids) return [];

	// Split the comma-separated IDs and check each against the cache
	const idList = ids.split(',');
	const uncachedIds: string[] = [];
	const cachedVideos: VideoItem[] = [];

	for (const id of idList) {
		const cached = cacheGet<VideoItem>(`video:${id}`);
		if (cached && !cached.stale) {
			cachedVideos.push(cached.data);
		} else {
			uncachedIds.push(id);
		}
	}

	// All videos were in cache — no API call needed
	if (uncachedIds.length === 0) {
		logApiCall('videos.list', { ids, cacheHit: 'true' }, true);
		return cachedVideos;
	}

	// Fetch only the uncached IDs from the API (snippet + contentDetails + statistics)
	logApiCall('videos.list', { ids: uncachedIds.join(',') }, false);
	const result: any = await ytFetch('videos', {
		part: 'snippet,contentDetails,statistics',
		id: uncachedIds.join(',')
	});

	const newVideos = (result.items || []).map((item: any) => mapVideoItem(item));

	// Cache each newly fetched video individually for future requests
	for (const video of newVideos) {
		cacheSet(`video:${video.id}`, video, getCacheTTL('video'));
	}

	// Merge cached and fresh videos, then reorder to match the original input ID sequence.
	// Uses a Map for O(n) lookup instead of O(n²) with Array.find()
	const allVideos = [...cachedVideos, ...newVideos];
	const videoMap = new Map(allVideos.map((v) => [v.id, v]));
	const ordered = idList
		.map((id) => videoMap.get(id))
		.filter((v): v is VideoItem => v !== undefined);

	return ordered;
}

/**
 * Fetches videos related to a given video. Since YouTube deprecated the `relatedToVideoId`
 * parameter in 2023, this uses a fallback strategy: it extracts the first segment of the
 * video title (before any `-` or `|` separator) and searches for that as a query.
 * The source video is excluded from results.
 *
 * @param {string} videoId - The YouTube video ID to find related videos for
 * @param {string} [pageToken] - Pagination token for subsequent pages
 * @returns {Promise<SearchResponse>} Related videos with Shorts filtered out
 */
export async function getRelatedVideos(
	videoId: string,
	pageToken?: string
): Promise<SearchResponse> {
	const cacheKey = `related:${videoId}:${pageToken || ''}`;
	const cached = cacheGet<SearchResponse>(cacheKey);
	if (cached && !cached.stale) {
		logApiCall('related', { videoId, cacheHit: 'true' }, true);
		return cached.data;
	}

	// Workaround: YouTube deprecated relatedToVideoId in 2023.
	// Extract the main topic from the video title (text before first separator) as a search query.
	const video = await getVideosByIds(videoId);
	const query = video[0]?.title?.split(/[-|]/)[0]?.trim() || videoId;

	const params: Record<string, string> = {
		part: 'snippet',
		type: 'video',
		q: query,
		maxResults: '20'
	};
	if (pageToken) params.pageToken = pageToken;

	logApiCall('search.list (related)', params, false);
	const searchResult: any = await ytFetch('search', params);

	// Collect video IDs but exclude the source video to avoid showing it in its own "related" list
	const videoIds = (searchResult.items || [])
		.map((item: any) => item.id?.videoId)
		.filter(Boolean)
		.filter((id: string) => id !== videoId)
		.join(',');

	const videos = videoIds ? await getVideosByIds(videoIds) : [];
	const visible = videos.filter((v) => !v.isShort);
	const filteredCount = videos.length - visible.length;

	await enrichWithChannelThumbnails(visible);

	const result: SearchResponse = {
		items: visible,
		nextPageToken: searchResult.nextPageToken,
		totalResults: visible.length,
		filteredCount,
		backfillPages: 0
	};

	cacheSet(cacheKey, result, getCacheTTL('related'));
	return result;
}

/**
 * Fetches comment threads for a video, including top-level comments and their replies.
 * Gracefully handles videos with comments disabled (returns empty list with flag).
 *
 * @param {string} videoId - The YouTube video ID to fetch comments for
 * @param {'relevance' | 'time'} [order='relevance'] - Sort order: 'relevance' (top comments) or 'time' (newest first)
 * @param {string} [pageToken] - Pagination token for fetching subsequent pages
 * @returns {Promise<CommentsResponse>} Comment threads with pagination info, or empty with `commentsDisabled: true`
 */
export async function getComments(
	videoId: string,
	order: 'relevance' | 'time' = 'relevance',
	pageToken?: string
): Promise<CommentsResponse> {
	const cacheKey = `comments:${videoId}:${order}:${pageToken || ''}`;
	const cached = cacheGet<CommentsResponse>(cacheKey);
	if (cached && !cached.stale) {
		logApiCall('commentThreads', { videoId, cacheHit: 'true' }, true);
		return cached.data;
	}

	const params: Record<string, string> = {
		part: 'snippet,replies',
		videoId,
		maxResults: '20',
		order,
		textFormat: 'plainText' // Request plain text to avoid HTML entities in comment bodies
	};
	if (pageToken) params.pageToken = pageToken;

	try {
		logApiCall('commentThreads.list', params, false);
		const result: any = await ytFetch('commentThreads', params);

		// Map each thread: extract the top-level comment and any inline replies
		const items: CommentThread[] = (result.items || []).map((item: any) => {
			// `replies.comments` contains up to 5 inline replies; more require a separate API call
			const replies = item.replies?.comments || [];

			return {
				id: item.id,
				topLevelComment: mapComment(item.snippet?.topLevelComment),
				totalReplyCount: item.snippet?.totalReplyCount || 0,
				replies: replies.map((r: any) => mapComment(r))
			};
		});

		const response: CommentsResponse = {
			items,
			nextPageToken: result.nextPageToken,
			totalResults: result.pageInfo?.totalResults || items.length
		};

		cacheSet(cacheKey, response, getCacheTTL('comments'));
		return response;
	} catch (err) {
		// YouTube returns 403 when comments are disabled on a video
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes('commentsDisabled') || message.includes('403')) {
			return { items: [], totalResults: 0, commentsDisabled: true };
		}
		throw err;
	}
}

/**
 * Fetches replies to a specific top-level comment thread.
 * Used when a comment thread has more replies than the inline 5 returned by commentThreads.list.
 *
 * @param {string} parentId - The ID of the parent comment to fetch replies for
 * @param {string} [pageToken] - Pagination token for subsequent reply pages
 * @returns {Promise<{ items: Comment[]; nextPageToken?: string }>} Paginated list of reply comments
 */
export async function getCommentReplies(
	parentId: string,
	pageToken?: string
): Promise<{ items: Comment[]; nextPageToken?: string }> {
	const params: Record<string, string> = {
		part: 'snippet',
		parentId,
		maxResults: '20',
		textFormat: 'plainText'
	};
	if (pageToken) params.pageToken = pageToken;

	logApiCall('comments.list', params, false);
	const result: any = await ytFetch('comments', params);

	return {
		items: (result.items || []).map((item: any) => mapComment(item)),
		nextPageToken: result.nextPageToken
	};
}

/**
 * Makes an OAuth-authenticated GET request to the YouTube Data API.
 * Unlike `ytFetch`, this uses a user's OAuth access token (Bearer) instead of the server API key.
 * Required for user-specific endpoints like subscriptions and channel memberships.
 *
 * @param {string} endpoint - The API endpoint path (e.g. 'subscriptions')
 * @param {Record<string, string>} params - Query parameters (excluding authorization)
 * @param {string} accessToken - The user's OAuth 2.0 access token
 * @returns {Promise<unknown>} The parsed JSON response body
 * @throws {Error} If the API returns a non-OK status or quota is exceeded
 */
async function ytFetchAuth(
	endpoint: string,
	params: Record<string, string>,
	accessToken: string
): Promise<unknown> {
	const url = new URL(`${API_BASE}/${endpoint}`);
	for (const [k, v] of Object.entries(params)) {
		if (v) url.searchParams.set(k, v);
	}

	// Use Bearer token auth instead of API key for user-scoped requests
	const res = await fetch(url.toString(), {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!res.ok) {
		const body = await res.text();
		logError(`YouTube API error (auth): ${endpoint}`, {
			status: res.status,
			body: body.slice(0, 500)
		});
		if (res.status === 429) {
			throw new Error('YouTube API quota exceeded');
		}
		throw new Error(`YouTube API error ${res.status}: ${body.slice(0, 200)}`);
	}
	return res.json();
}

/**
 * Fetches trending (most popular) videos for a given region.
 * Uses the YouTube `videos.list` endpoint with `chart=mostPopular`.
 * Also used as a fallback when the subscription feed is empty or fails.
 *
 * @param {string} [pageToken] - Pagination token for subsequent pages
 * @param {string} [regionCode='US'] - ISO 3166-1 alpha-2 country code
 * @returns {Promise<SearchResponse>} Trending videos with Shorts filtered out
 */
export async function getTrendingVideos(
	pageToken?: string,
	regionCode = 'US'
): Promise<SearchResponse> {
	const cacheKey = `trending:${regionCode}:${pageToken || ''}`;
	const cached = cacheGet<SearchResponse>(cacheKey);
	if (cached && !cached.stale) {
		logApiCall('trending', { regionCode, cacheHit: 'true' }, true);
		return cached.data;
	}

	const params: Record<string, string> = {
		part: 'snippet,contentDetails,statistics',
		chart: 'mostPopular',
		regionCode,
		maxResults: '25'
	};
	if (pageToken) params.pageToken = pageToken;

	logApiCall('videos.list (trending)', params, false);
	const data: any = await ytFetch('videos', params);

	const videos = (data.items || []).map((item: any) => mapVideoItem(item));
	const visible = videos.filter((v: VideoItem) => !v.isShort);
	const filteredCount = videos.length - visible.length;

	await enrichWithChannelThumbnails(visible);

	// Side-effect: cache each individual video for reuse by getVideosByIds
	for (const video of visible) {
		cacheSet(`video:${video.id}`, video, getCacheTTL('video'));
	}

	const result: SearchResponse = {
		items: visible,
		nextPageToken: data.nextPageToken,
		totalResults: visible.length,
		filteredCount,
		backfillPages: 0
	};

	cacheSet(cacheKey, result, getCacheTTL('trending'));
	return result;
}

/**
 * Builds a personalized subscription feed for an authenticated user.
 *
 * **Strategy:** YouTube doesn't have a direct "subscription feed" API, so this function
 * constructs one by:
 *   1. Fetching the user's subscribed channel IDs (cached per user)
 *   2. Selecting ~4 channels using a deterministic shuffle seeded by `offset` (for pagination rotation)
 *   3. Fetching recent uploads from each channel's upload playlist (UC→UU convention)
 *   4. Hydrating, filtering Shorts, shuffling, and returning
 *
 * Falls back to trending videos if the user has no subscriptions or if any step fails.
 *
 * @param {string} accessToken - The user's OAuth 2.0 access token
 * @param {string} userId - Unique user ID for cache key scoping
 * @param {string} [pageToken] - Unused for sub feed (kept for interface consistency); passed to trending fallback
 * @param {number} [offset=0] - Channel rotation offset for pagination (increments by 4 per page)
 * @returns {Promise<SearchResponse>} Personalized feed with Shorts filtered out
 */
export async function getSubscriptionFeed(
	accessToken: string,
	userId: string,
	pageToken?: string,
	offset = 0
): Promise<SearchResponse> {
	const feedCacheKey = `subFeed:${userId}:${offset}`;
	const cachedFeed = cacheGet<SearchResponse>(feedCacheKey);
	if (cachedFeed && !cachedFeed.stale) {
		logApiCall('subscriptionFeed', { userId, offset: String(offset), cacheHit: 'true' }, true);
		return cachedFeed.data;
	}

	try {
		// --- Step 1: Get the user's subscribed channel IDs (from cache or API) ---
		const subsCacheKey = `subs:${userId}`;
		let channelIds: string[];
		const cachedSubs = cacheGet<string[]>(subsCacheKey);

		if (cachedSubs && !cachedSubs.stale) {
			channelIds = cachedSubs.data;
		} else {
			// Fetch subscriptions list (costs 1 quota unit)
			logApiCall('subscriptions.list', { mine: 'true' }, false);
			const subsData: any = await ytFetchAuth(
				'subscriptions',
				{
					part: 'snippet',
					mine: 'true',
					maxResults: '50',
					order: 'relevance'
				},
				accessToken
			);

			channelIds = (subsData.items || [])
				.map((item: any) => item.snippet?.resourceId?.channelId)
				.filter(Boolean);

			if (channelIds.length === 0) {
				// No subscriptions — fall back to trending
				return getTrendingVideos(pageToken);
			}

			cacheSet(subsCacheKey, channelIds, getCacheTTL('subscriptions'));
		}

		// --- Step 2: Select ~4 channels via deterministic shuffle ---
		// The offset-based seed ensures each "page" selects different channels,
		// providing variety across pagination without true randomness.
		const shuffled = [...channelIds];
		const seed = offset;
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = (seed + i * 7) % (i + 1); // Deterministic pseudo-random swap
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		const selectedChannels = shuffled.slice(0, 4);

		// --- Step 3: Fetch recent uploads from each channel ---
		// YouTube channel IDs start with "UC"; replacing with "UU" gives the uploads playlist ID
		const playlistIds = selectedChannels.map((id) => 'UU' + id.slice(2));

		// Fetch uploads in parallel (1 quota unit each)
		const allVideoIds: string[] = [];
		const fetchPromises = playlistIds.map(async (playlistId) => {
			try {
				logApiCall('playlistItems.list', { playlistId }, false);
				const plData: any = await ytFetch('playlistItems', {
					part: 'snippet',
					playlistId,
					maxResults: '8' // 8 recent videos per channel = ~32 total candidates
				});
				return (plData.items || [])
					.map((item: any) => item.snippet?.resourceId?.videoId)
					.filter(Boolean);
			} catch {
				return []; // Skip channels that fail (e.g. deleted channels)
			}
		});

		const results = await Promise.all(fetchPromises);
		for (const ids of results) {
			allVideoIds.push(...ids);
		}

		if (allVideoIds.length === 0) {
			return getTrendingVideos(pageToken);
		}

		// --- Step 4: Hydrate, filter, shuffle, and return ---
		// Single batch API call for all video IDs (1 quota unit)
		const videos = await getVideosByIds(allVideoIds.join(','));
		const visible = videos.filter((v) => !v.isShort);

		// Fisher-Yates shuffle to mix videos from different channels
		for (let i = visible.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[visible[i], visible[j]] = [visible[j], visible[i]];
		}

		await enrichWithChannelThumbnails(visible);

		const feedResult: SearchResponse = {
			items: visible,
			// Signal more pages available if we haven't exhausted all subscribed channels
			nextPageToken: offset + 4 < channelIds.length ? String(offset + 4) : undefined,
			totalResults: visible.length,
			filteredCount: videos.length - visible.length,
			backfillPages: 0
		};

		cacheSet(feedCacheKey, feedResult, getCacheTTL('trending'));
		return feedResult;
	} catch (err) {
		// Graceful degradation: show trending videos if subscription feed fails
		logError('Subscription feed failed, falling back to trending', {
			error: err instanceof Error ? err.message : String(err)
		});
		return getTrendingVideos(pageToken);
	}
}

/**
 * Fetches detailed information about a YouTube channel, including statistics and branding.
 * As a side-effect, populates the channel thumbnail cache for use by `enrichWithChannelThumbnails`.
 *
 * @param {string} channelId - The YouTube channel ID (starts with "UC")
 * @returns {Promise<ChannelInfo>} Channel metadata including subscriber count, banner, and thumbnails
 * @throws {Error} If the channel is not found
 */
export async function getChannelInfo(channelId: string): Promise<ChannelInfo> {
	const cacheKey = `channel:${channelId}`;
	const cached = cacheGet<ChannelInfo>(cacheKey);
	if (cached && !cached.stale) {
		logApiCall('channels.list (info)', { channelId, cacheHit: 'true' }, true);
		return cached.data;
	}

	logApiCall('channels.list (info)', { channelId }, false);
	const data: any = await ytFetch('channels', {
		part: 'snippet,statistics,brandingSettings',
		id: channelId
	});

	const item = data.items?.[0];
	if (!item) throw new Error('Channel not found');

	const snippet = item.snippet || {};
	const stats = item.statistics || {};
	const branding = item.brandingSettings || {};

	const info: ChannelInfo = {
		id: item.id,
		title: snippet.title || '',
		description: snippet.description || '',
		customUrl: snippet.customUrl,
		publishedAt: snippet.publishedAt || '',
		thumbnails: snippet.thumbnails || {},
		bannerUrl: branding.image?.bannerExternalUrl, // Channel banner image URL
		subscriberCount: stats.subscriberCount || '0',
		videoCount: stats.videoCount || '0',
		viewCount: stats.viewCount || '0'
	};

	cacheSet(cacheKey, info, getCacheTTL('channel'));

	// Side-effect: pre-populate the thumbnail cache so video enrichment can skip this channel
	const thumbUrl = snippet.thumbnails?.default?.url;
	if (thumbUrl) {
		cacheSet(`channelThumb:${channelId}`, thumbUrl, getCacheTTL('channelThumbnail'));
	}

	return info;
}

/**
 * Fetches videos from a specific channel with sorting options.
 * Uses the channel's uploads playlist (UC→UU ID convention) rather than the search API,
 * which is more quota-efficient and returns results in upload order.
 *
 * For `viewCount` sorting, fetches 50 results and sorts client-side (YouTube's playlistItems
 * endpoint doesn't support sorting). For `oldest`, reverses the default date-descending order.
 *
 * @param {string} channelId - The YouTube channel ID (starts with "UC")
 * @param {'date' | 'viewCount' | 'oldest'} [order='date'] - Sort order for results
 * @param {string} [pageToken] - Pagination token (ignored for viewCount sort since all results are fetched at once)
 * @returns {Promise<SearchResponse>} Channel videos with Shorts filtered out
 */
export async function getChannelVideos(
	channelId: string,
	order: 'date' | 'viewCount' | 'oldest' = 'date',
	pageToken?: string
): Promise<SearchResponse> {
	const cacheKey = `channelVideos:${channelId}:${order}:${pageToken || ''}`;
	const cached = cacheGet<SearchResponse>(cacheKey);
	if (cached && !cached.stale) {
		logApiCall('channelVideos', { channelId, cacheHit: 'true' }, true);
		return cached.data;
	}

	// YouTube convention: replace "UC" prefix with "UU" to get the uploads playlist
	const uploadsPlaylistId = 'UU' + channelId.slice(2);
	// Fetch more results for viewCount sort since we need a larger pool to sort from
	const maxResults = order === 'viewCount' ? '50' : '25';

	const params: Record<string, string> = {
		part: 'snippet',
		playlistId: uploadsPlaylistId,
		maxResults
	};
	// Skip pagination for viewCount (we sort a single large batch client-side)
	if (pageToken && order !== 'viewCount') params.pageToken = pageToken;

	logApiCall('playlistItems.list (channel videos)', params, false);
	const plData: any = await ytFetch('playlistItems', params);

	const videoIds = (plData.items || [])
		.map((item: any) => item.snippet?.resourceId?.videoId)
		.filter(Boolean);

	if (videoIds.length === 0) {
		const empty: SearchResponse = {
			items: [],
			totalResults: 0,
			filteredCount: 0,
			backfillPages: 0
		};
		cacheSet(cacheKey, empty, getCacheTTL('channelVideos'));
		return empty;
	}

	const videos = await getVideosByIds(videoIds.join(','));
	let visible = videos.filter((v) => !v.isShort);

	await enrichWithChannelThumbnails(visible);

	// Apply client-side sorting (playlist API always returns newest-first)
	if (order === 'viewCount') {
		visible.sort((a, b) => parseInt(b.viewCount) - parseInt(a.viewCount));
	} else if (order === 'oldest') {
		visible.reverse(); // Reverse the default newest-first order
	}

	const result: SearchResponse = {
		items: visible,
		// No pagination for viewCount sort (single batch); otherwise pass through YouTube's token
		nextPageToken: order === 'viewCount' ? undefined : plData.nextPageToken,
		totalResults: visible.length,
		filteredCount: videos.length - visible.length,
		backfillPages: 0
	};

	cacheSet(cacheKey, result, getCacheTTL('channelVideos'));
	return result;
}

/**
 * Fetches metadata for a YouTube playlist (title, description, item count, etc.).
 * Also fetches the playlist owner's channel thumbnail.
 *
 * @param {string} playlistId - The YouTube playlist ID
 * @returns {Promise<PlaylistInfo>} Playlist metadata including channel thumbnail
 * @throws {Error} If the playlist is not found
 */
export async function getPlaylistInfo(playlistId: string): Promise<PlaylistInfo> {
	const cacheKey = `playlist:${playlistId}`;
	const cached = cacheGet<PlaylistInfo>(cacheKey);
	if (cached && !cached.stale) {
		logApiCall('playlists.list', { playlistId, cacheHit: 'true' }, true);
		return cached.data;
	}

	logApiCall('playlists.list', { playlistId }, false);
	const data: any = await ytFetch('playlists', {
		part: 'snippet,contentDetails',
		id: playlistId
	});

	const item = data.items?.[0];
	if (!item) throw new Error('Playlist not found');

	const snippet = item.snippet || {};
	const info: PlaylistInfo = {
		id: item.id,
		title: snippet.title || '',
		description: snippet.description || '',
		channelId: snippet.channelId || '',
		channelTitle: snippet.channelTitle || '',
		publishedAt: snippet.publishedAt || '',
		thumbnails: snippet.thumbnails || {},
		itemCount: item.contentDetails?.itemCount || 0
	};

	// Enrich with the playlist owner's channel avatar
	if (info.channelId) {
		const thumbs = await getChannelThumbnails([info.channelId]);
		info.channelThumbnail = thumbs.get(info.channelId);
	}

	cacheSet(cacheKey, info, getCacheTTL('playlist'));
	return info;
}

/**
 * Fetches videos from a YouTube playlist with pagination support.
 * Shorts are automatically filtered out of the results.
 *
 * @param {string} playlistId - The YouTube playlist ID
 * @param {string} [pageToken] - Pagination token for subsequent pages
 * @returns {Promise<SearchResponse>} Playlist videos with Shorts filtered out
 */
export async function getPlaylistVideos(
	playlistId: string,
	pageToken?: string
): Promise<SearchResponse> {
	const cacheKey = `playlistVideos:${playlistId}:${pageToken || ''}`;
	const cached = cacheGet<SearchResponse>(cacheKey);
	if (cached && !cached.stale) {
		logApiCall('playlistVideos', { playlistId, cacheHit: 'true' }, true);
		return cached.data;
	}

	const params: Record<string, string> = {
		part: 'snippet',
		playlistId,
		maxResults: '25'
	};
	if (pageToken) params.pageToken = pageToken;

	logApiCall('playlistItems.list (playlist)', params, false);
	const plData: any = await ytFetch('playlistItems', params);

	const videoIds = (plData.items || [])
		.map((item: any) => item.snippet?.resourceId?.videoId)
		.filter(Boolean);

	if (videoIds.length === 0) {
		return { items: [], totalResults: 0, filteredCount: 0, backfillPages: 0 };
	}

	// Hydrate video IDs with full metadata (for Shorts detection + statistics)
	const videos = await getVideosByIds(videoIds.join(','));
	const visible = videos.filter((v) => !v.isShort);

	await enrichWithChannelThumbnails(visible);

	const result: SearchResponse = {
		items: visible,
		nextPageToken: plData.nextPageToken,
		totalResults: visible.length,
		filteredCount: videos.length - visible.length,
		backfillPages: 0
	};

	cacheSet(cacheKey, result, getCacheTTL('playlistVideos'));
	return result;
}

/**
 * Fetches the authenticated user's subscription list (channels they're subscribed to).
 * Returns channels in alphabetical order with pagination support.
 *
 * @param {string} accessToken - The user's OAuth 2.0 access token
 * @param {string} userId - Unique user ID for cache key scoping
 * @param {string} [pageToken] - Pagination token for subsequent pages
 * @returns {Promise<{ channels: SubscriptionChannel[]; nextPageToken?: string }>} Paginated subscription list
 */
export async function getSubscriptions(
	accessToken: string,
	userId: string,
	pageToken?: string
): Promise<{ channels: SubscriptionChannel[]; nextPageToken?: string }> {
	const cacheKey = `subscriptionsList:${userId}:${pageToken || ''}`;
	const cached = cacheGet<{ channels: SubscriptionChannel[]; nextPageToken?: string }>(cacheKey);
	if (cached && !cached.stale) {
		logApiCall('subscriptions.list (list)', { cacheHit: 'true' }, true);
		return cached.data;
	}

	const params: Record<string, string> = {
		part: 'snippet',
		mine: 'true',
		maxResults: '50', // YouTube API max per page for subscriptions
		order: 'alphabetical'
	};
	if (pageToken) params.pageToken = pageToken;

	logApiCall('subscriptions.list (list)', params, false);
	const data: any = await ytFetchAuth('subscriptions', params, accessToken);

	// Map raw API items to our normalized SubscriptionChannel type
	const channels: SubscriptionChannel[] = (data.items || []).map((item: any) => ({
		channelId: item.snippet?.resourceId?.channelId || '',
		title: item.snippet?.title || '',
		description: item.snippet?.description || '',
		thumbnailUrl: item.snippet?.thumbnails?.default?.url || '',
		publishedAt: item.snippet?.publishedAt || ''
	}));

	const result = { channels, nextPageToken: data.nextPageToken };
	cacheSet(cacheKey, result, getCacheTTL('subscriptionCheck'));
	return result;
}

/**
 * Checks whether the authenticated user is subscribed to a specific channel.
 * Uses the `forChannelId` filter on the subscriptions API to check without fetching all subs.
 * Returns `false` on any error (non-throwing for UI display purposes).
 *
 * @param {string} accessToken - The user's OAuth 2.0 access token
 * @param {string} userId - Unique user ID for cache key scoping
 * @param {string} channelId - The YouTube channel ID to check subscription status for
 * @returns {Promise<boolean>} `true` if subscribed, `false` otherwise (including on error)
 */
export async function checkSubscription(
	accessToken: string,
	userId: string,
	channelId: string
): Promise<boolean> {
	const cacheKey = `subCheck:${userId}:${channelId}`;
	const cached = cacheGet<boolean>(cacheKey);
	if (cached && !cached.stale) {
		return cached.data;
	}

	try {
		logApiCall('subscriptions.list (check)', { channelId }, false);
		const data: any = await ytFetchAuth(
			'subscriptions',
			{
				part: 'snippet',
				mine: 'true',
				forChannelId: channelId // Filters to only this channel's subscription
			},
			accessToken
		);

		// If items array is non-empty, the user is subscribed to this channel
		const isSubscribed = (data.items || []).length > 0;
		cacheSet(cacheKey, isSubscribed, getCacheTTL('subscriptionCheck'));
		return isSubscribed;
	} catch {
		return false; // Fail silently — subscription status is non-critical UI info
	}
}

/**
 * Performs a mixed-type search across videos, channels, and playlists.
 * Unlike `searchVideos` (video-only), this returns a heterogeneous list of `SearchResultItem`
 * that can contain any combination of the three types.
 *
 * Videos in the results are hydrated with full metadata and filtered for Shorts.
 * Channels and playlists are returned with basic snippet data from the search response.
 * The final result preserves the original API ordering.
 *
 * @param {string} query - The search query string
 * @param {string} [type='video,channel,playlist'] - Comma-separated resource types to include
 * @param {string} [pageToken] - Pagination token for subsequent pages
 * @returns {Promise<EnhancedSearchResponse>} Mixed-type search results in original API order
 */
export async function searchAll(
	query: string,
	type: string = 'video,channel,playlist',
	pageToken?: string
): Promise<EnhancedSearchResponse> {
	const cacheKey = `searchAll:${query}:${type}:${pageToken || ''}`;
	const cached = cacheGet<EnhancedSearchResponse>(cacheKey);
	if (cached && !cached.stale) {
		logApiCall('search.list (all)', { query, cacheHit: 'true' }, true);
		return cached.data;
	}

	const params: Record<string, string> = {
		part: 'snippet',
		q: query,
		type,
		maxResults: '20'
	};
	if (pageToken) params.pageToken = pageToken;

	logApiCall('search.list (all)', params, false);
	const searchResult: any = await ytFetch('search', params);

	// First pass: collect non-video items immediately, and gather video IDs for batch hydration
	const items: SearchResultItem[] = [];
	const videoIds: string[] = [];

	for (const item of searchResult.items || []) {
		const kind = item.id?.kind;
		if (kind === 'youtube#video') {
			// Defer video processing — collect IDs for batch hydration below
			videoIds.push(item.id.videoId);
		} else if (kind === 'youtube#channel') {
			items.push({
				kind: 'channel',
				channel: {
					id: item.id.channelId,
					title: item.snippet?.title || '',
					description: item.snippet?.description || '',
					thumbnailUrl: item.snippet?.thumbnails?.default?.url || '',
					customUrl: item.snippet?.customUrl
				}
			});
		} else if (kind === 'youtube#playlist') {
			items.push({
				kind: 'playlist',
				playlist: {
					id: item.id.playlistId,
					title: item.snippet?.title || '',
					description: item.snippet?.description || '',
					thumbnailUrl:
						item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '',
					channelId: item.snippet?.channelId || '',
					channelTitle: item.snippet?.channelTitle || ''
				}
			});
		}
	}

	// Hydrate video results with full metadata (needed for Shorts detection)
	if (videoIds.length > 0) {
		const videos = await getVideosByIds(videoIds.join(','));
		const visible = videos.filter((v) => !v.isShort);

		await enrichWithChannelThumbnails(visible);

		// Second pass: rebuild the final list in the original API order,
		// interleaving hydrated videos with channel/playlist items
		const finalItems: SearchResultItem[] = [];
		for (const item of searchResult.items || []) {
			const kind = item.id?.kind;
			if (kind === 'youtube#video') {
				const video = visible.find((v) => v.id === item.id.videoId);
				if (video) finalItems.push({ kind: 'video', video });
				// Shorts are silently dropped (no placeholder in the result)
			} else if (kind === 'youtube#channel') {
				const ch = items.find((i) => i.kind === 'channel' && i.channel?.id === item.id.channelId);
				if (ch) finalItems.push(ch);
			} else if (kind === 'youtube#playlist') {
				const pl = items.find(
					(i) => i.kind === 'playlist' && i.playlist?.id === item.id.playlistId
				);
				if (pl) finalItems.push(pl);
			}
		}

		const result: EnhancedSearchResponse = {
			items: finalItems,
			nextPageToken: searchResult.nextPageToken,
			totalResults: finalItems.length
		};
		cacheSet(cacheKey, result, getCacheTTL('search'));
		return result;
	}

	// No videos in results — return channels/playlists only
	const result: EnhancedSearchResponse = {
		items,
		nextPageToken: searchResult.nextPageToken,
		totalResults: items.length
	};
	cacheSet(cacheKey, result, getCacheTTL('search'));
	return result;
}

/**
 * Maps a raw YouTube API comment resource into a normalized Comment object.
 * Works for both top-level comments and replies (replies have a `parentId`).
 *
 * @param {any} item - A raw comment resource from the YouTube API
 * @returns {Comment} A normalized comment object with author info, text, and metadata
 */
function mapComment(item: any): Comment {
	const snippet = item?.snippet || {};
	return {
		id: item?.id || '',
		authorDisplayName: snippet.authorDisplayName || '',
		authorProfileImageUrl: snippet.authorProfileImageUrl || '',
		authorChannelUrl: snippet.authorChannelUrl || '',
		textDisplay: snippet.textDisplay || '', // HTML-rendered text (may contain links)
		textOriginal: snippet.textOriginal || '', // Plain text version of the comment
		likeCount: snippet.likeCount || 0,
		publishedAt: snippet.publishedAt || '',
		updatedAt: snippet.updatedAt || '', // Differs from publishedAt if comment was edited
		parentId: snippet.parentId // Only present for reply comments
	};
}
