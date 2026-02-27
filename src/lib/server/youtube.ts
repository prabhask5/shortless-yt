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

// Cache TTLs
const FIVE_MINUTES = 5 * 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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

	const res = await fetch(url.toString(), { headers });

	if (!res.ok) {
		const errorBody = await res.text();
		throw new Error(`YouTube API error ${res.status} on ${endpoint}: ${errorBody}`);
	}

	return res.json();
}

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

function parseCommentItem(item: Record<string, unknown>): CommentItem {
	const snippet = item.snippet as Record<string, unknown> | undefined;
	const topLevel = snippet?.topLevelComment as Record<string, unknown> | undefined;
	const commentSnippet = topLevel?.snippet as Record<string, unknown> | undefined;

	return {
		id: (item.id as string) ?? '',
		authorName: (commentSnippet?.authorDisplayName as string) ?? '',
		authorAvatarUrl: (commentSnippet?.authorProfileImageUrl as string) ?? '',
		text: (commentSnippet?.textDisplay as string) ?? '',
		likeCount: (commentSnippet?.likeCount as number) ?? 0,
		publishedAt: (commentSnippet?.publishedAt as string) ?? '',
		replyCount: (snippet?.totalReplyCount as number) ?? 0
	};
}

// ---------------------------------------------------------------------------
// Public search functions
// ---------------------------------------------------------------------------

export async function searchVideos(
	query: string,
	options?: { pageToken?: string; videoDuration?: string; order?: string }
): Promise<PaginatedResult<VideoItem>> {
	const cacheKey = `search:v:${query}:${options?.pageToken ?? ''}:${options?.videoDuration ?? ''}:${options?.order ?? ''}`;
	const cached = publicCache.get<PaginatedResult<VideoItem>>(cacheKey);
	if (cached) return cached;

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

	// Fetch full details (duration, viewCount)
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

	// Fetch full playlist details for itemCount
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

// ---------------------------------------------------------------------------
// Detail fetchers
// ---------------------------------------------------------------------------

export async function getVideoDetails(ids: string[]): Promise<VideoItem[]> {
	const results: VideoItem[] = [];

	// Batch in groups of 50
	for (let i = 0; i < ids.length; i += 50) {
		const batch = ids.slice(i, i + 50);
		const batchKey = `vdetails:${batch.join(',')}`;
		const cached = publicCache.get<VideoItem[]>(batchKey);

		if (cached) {
			results.push(...cached);
			continue;
		}

		const data = (await youtubeApiFetch('videos', {
			part: 'snippet,contentDetails,statistics',
			id: batch.join(','),
			maxResults: '50'
		})) as Record<string, unknown>;

		const items = (data.items as Record<string, unknown>[]) ?? [];
		const videos = items.map(parseVideoItem);
		publicCache.set(batchKey, videos, FIFTEEN_MINUTES);
		results.push(...videos);
	}

	return results;
}

export async function getChannelDetails(ids: string[]): Promise<ChannelItem[]> {
	const results: ChannelItem[] = [];

	for (let i = 0; i < ids.length; i += 50) {
		const batch = ids.slice(i, i + 50);
		const batchKey = `cdetails:${batch.join(',')}`;
		const cached = publicCache.get<ChannelItem[]>(batchKey);

		if (cached) {
			results.push(...cached);
			continue;
		}

		const data = (await youtubeApiFetch('channels', {
			part: 'snippet,statistics,brandingSettings',
			id: batch.join(','),
			maxResults: '50'
		})) as Record<string, unknown>;

		const items = (data.items as Record<string, unknown>[]) ?? [];
		const channels = items.map(parseChannelItem);
		publicCache.set(batchKey, channels, ONE_HOUR);
		results.push(...channels);
	}

	return results;
}

export async function getChannelVideos(
	channelId: string,
	pageToken?: string
): Promise<PaginatedResult<VideoItem>> {
	const cacheKey = `chvideos:${channelId}:${pageToken ?? ''}`;
	const cached = publicCache.get<PaginatedResult<VideoItem>>(cacheKey);
	if (cached) return cached;

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

// ---------------------------------------------------------------------------
// Trending & categories
// ---------------------------------------------------------------------------

export async function getTrending(
	categoryId?: string,
	pageToken?: string
): Promise<PaginatedResult<VideoItem>> {
	const cacheKey = `trending:${categoryId ?? ''}:${pageToken ?? ''}`;
	const cached = publicCache.get<PaginatedResult<VideoItem>>(cacheKey);
	if (cached) return cached;

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

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function getComments(
	videoId: string,
	pageToken?: string
): Promise<PaginatedResult<CommentItem>> {
	const cacheKey = `comments:${videoId}:${pageToken ?? ''}`;
	const cached = publicCache.get<PaginatedResult<CommentItem>>(cacheKey);
	if (cached) return cached;

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

// ---------------------------------------------------------------------------
// Playlists
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Authenticated user endpoints
// ---------------------------------------------------------------------------

export async function getSubscriptions(
	accessToken: string,
	pageToken?: string
): Promise<PaginatedResult<ChannelItem>> {
	const cacheKey = `user:subs:${accessToken.slice(-8)}:${pageToken ?? ''}`;
	const cached = userCache.get<PaginatedResult<ChannelItem>>(cacheKey);
	if (cached) return cached;

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

export async function getLikedVideos(
	accessToken: string,
	pageToken?: string
): Promise<PaginatedResult<VideoItem>> {
	const cacheKey = `user:liked:${accessToken.slice(-8)}:${pageToken ?? ''}`;
	const cached = userCache.get<PaginatedResult<VideoItem>>(cacheKey);
	if (cached) return cached;

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

export async function getUserPlaylists(
	accessToken: string,
	pageToken?: string
): Promise<PaginatedResult<PlaylistItem>> {
	const cacheKey = `user:playlists:${accessToken.slice(-8)}:${pageToken ?? ''}`;
	const cached = userCache.get<PaginatedResult<PlaylistItem>>(cacheKey);
	if (cached) return cached;

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

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------

export async function getAutocompleteSuggestions(query: string): Promise<string[]> {
	if (!query.trim()) return [];

	const cacheKey = `autocomplete:${query}`;
	const cached = publicCache.get<string[]>(cacheKey);
	if (cached) return cached;

	try {
		const url = `https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(query)}`;
		const res = await fetch(url);
		const text = await res.text();

		// Response is JSONP-like: window.google.ac.h([...])
		// Extract the JSON array from it
		const match = text.match(/\[.+\]/s);
		if (!match) return [];

		const parsed = JSON.parse(match[0]) as unknown[];
		const suggestions = (parsed[1] as unknown[][])?.map((item) => item[0] as string) ?? [];

		publicCache.set(cacheKey, suggestions, FIVE_MINUTES);
		return suggestions;
	} catch {
		return [];
	}
}
