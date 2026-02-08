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

const API_BASE = 'https://www.googleapis.com/youtube/v3';

function getApiKey(): string {
	const key = env.YT_API_KEY;
	if (!key) throw new Error('YT_API_KEY environment variable is not set');
	return key;
}

async function ytFetch(endpoint: string, params: Record<string, string>): Promise<unknown> {
	const url = new URL(`${API_BASE}/${endpoint}`);
	url.searchParams.set('key', getApiKey());
	for (const [k, v] of Object.entries(params)) {
		if (v) url.searchParams.set(k, v);
	}

	const res = await fetch(url.toString());
	if (!res.ok) {
		const body = await res.text();
		logError(`YouTube API error: ${endpoint}`, { status: res.status, body: body.slice(0, 500) });
		if (res.status === 429) {
			throw new Error('YouTube API quota exceeded');
		}
		throw new Error(`YouTube API error ${res.status}: ${body.slice(0, 200)}`);
	}
	return res.json();
}

function mapVideoItem(item: any): VideoItem {
	const snippet = item.snippet || {};
	const contentDetails = item.contentDetails || {};
	const statistics = item.statistics || {};
	const duration = contentDetails.duration || '';
	const durationSeconds = parseDuration(duration);

	const detection = detectShort(
		durationSeconds,
		snippet.title || '',
		snippet.description || '',
		snippet.tags
	);

	return {
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

async function getChannelThumbnails(channelIds: string[]): Promise<Map<string, string>> {
	const result = new Map<string, string>();
	if (channelIds.length === 0) return result;

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

	// Batch fetch up to 50 per call
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
			// Non-critical — continue without thumbnails
		}
	}

	return result;
}

async function enrichWithChannelThumbnails(videos: VideoItem[]): Promise<void> {
	const uniqueChannelIds = [...new Set(videos.map((v) => v.channelId).filter(Boolean))];
	if (uniqueChannelIds.length === 0) return;

	const thumbs = await getChannelThumbnails(uniqueChannelIds);
	for (const video of videos) {
		const thumb = thumbs.get(video.channelId);
		if (thumb) video.channelThumbnail = thumb;
	}
}

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

	const MIN_VISIBLE = 20;
	const MAX_BACKFILL = 3;

	let allVisible: VideoItem[] = [];
	let currentPageToken = pageToken;
	let totalFiltered = 0;
	let backfillPages = 0;
	let lastPageToken: string | undefined;

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

		const videoIds = (searchResult.items || [])
			.map((item: any) => item.id?.videoId)
			.filter(Boolean)
			.join(',');

		if (!videoIds) break;

		// Hydrate with full video data
		const videos = await getVideosByIds(videoIds);

		const visible = videos.filter((v) => !v.isShort);
		const filtered = videos.length - visible.length;
		totalFiltered += filtered;

		allVisible = allVisible.concat(visible);
		lastPageToken = searchResult.nextPageToken;
		currentPageToken = searchResult.nextPageToken;

		if (!currentPageToken) break;
		if (backfillPages > 0 || visible.length < videos.length * 0.5) {
			backfillPages++;
		} else {
			break;
		}
	}

	logShortsFilter(totalFiltered, allVisible.length + totalFiltered, backfillPages);

	const result: SearchResponse = {
		items: allVisible,
		nextPageToken: lastPageToken,
		totalResults: allVisible.length,
		filteredCount: totalFiltered,
		backfillPages
	};

	cacheSet(cacheKey, result, getCacheTTL('search'));

	// Serve stale in background if needed
	if (cached?.stale) {
		return cached.data;
	}

	return result;
}

export async function getVideosByIds(ids: string): Promise<VideoItem[]> {
	if (!ids) return [];

	// Check individual video caches
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

	if (uncachedIds.length === 0) {
		logApiCall('videos.list', { ids, cacheHit: 'true' }, true);
		return cachedVideos;
	}

	logApiCall('videos.list', { ids: uncachedIds.join(',') }, false);
	const result: any = await ytFetch('videos', {
		part: 'snippet,contentDetails,statistics',
		id: uncachedIds.join(',')
	});

	const newVideos = (result.items || []).map((item: any) => mapVideoItem(item));

	// Cache individually
	for (const video of newVideos) {
		cacheSet(`video:${video.id}`, video, getCacheTTL('video'));
	}

	// Merge and return in original order
	const allVideos = [...cachedVideos, ...newVideos];
	const ordered = idList
		.map((id) => allVideos.find((v) => v.id === id))
		.filter((v): v is VideoItem => v !== undefined);

	// Enrich with channel thumbnails
	await enrichWithChannelThumbnails(ordered);

	return ordered;
}

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

	// YouTube deprecated relatedToVideoId in 2023, use search with video title as fallback
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

	const videoIds = (searchResult.items || [])
		.map((item: any) => item.id?.videoId)
		.filter(Boolean)
		.filter((id: string) => id !== videoId)
		.join(',');

	const videos = videoIds ? await getVideosByIds(videoIds) : [];
	const visible = videos.filter((v) => !v.isShort);
	const filteredCount = videos.length - visible.length;

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
		textFormat: 'plainText'
	};
	if (pageToken) params.pageToken = pageToken;

	try {
		logApiCall('commentThreads.list', params, false);
		const result: any = await ytFetch('commentThreads', params);

		const items: CommentThread[] = (result.items || []).map((item: any) => {
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
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes('commentsDisabled') || message.includes('403')) {
			return { items: [], totalResults: 0, commentsDisabled: true };
		}
		throw err;
	}
}

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

async function ytFetchAuth(
	endpoint: string,
	params: Record<string, string>,
	accessToken: string
): Promise<unknown> {
	const url = new URL(`${API_BASE}/${endpoint}`);
	for (const [k, v] of Object.entries(params)) {
		if (v) url.searchParams.set(k, v);
	}

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

	// Enrich with channel thumbnails
	await enrichWithChannelThumbnails(visible);

	// Cache individual videos
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

export async function getSubscriptionFeed(
	accessToken: string,
	userId: string,
	pageToken?: string,
	offset = 0
): Promise<SearchResponse> {
	try {
		// Check cached subscription channel IDs
		const subsCacheKey = `subs:${userId}`;
		let channelIds: string[];
		const cachedSubs = cacheGet<string[]>(subsCacheKey);

		if (cachedSubs && !cachedSubs.stale) {
			channelIds = cachedSubs.data;
		} else {
			// Fetch subscriptions (1 quota unit)
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

		// Pick ~4 random channels, rotate via offset
		const shuffled = [...channelIds];
		// Deterministic shuffle based on offset to rotate selection
		const seed = offset;
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = (seed + i * 7) % (i + 1);
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		const selectedChannels = shuffled.slice(0, 4);

		// Derive upload playlist IDs (UC → UU)
		const playlistIds = selectedChannels.map((id) => 'UU' + id.slice(2));

		// Fetch recent uploads from each (1 unit each)
		const allVideoIds: string[] = [];
		const fetchPromises = playlistIds.map(async (playlistId) => {
			try {
				logApiCall('playlistItems.list', { playlistId }, false);
				const plData: any = await ytFetch('playlistItems', {
					part: 'snippet',
					playlistId,
					maxResults: '8'
				});
				return (plData.items || [])
					.map((item: any) => item.snippet?.resourceId?.videoId)
					.filter(Boolean);
			} catch {
				return [];
			}
		});

		const results = await Promise.all(fetchPromises);
		for (const ids of results) {
			allVideoIds.push(...ids);
		}

		if (allVideoIds.length === 0) {
			return getTrendingVideos(pageToken);
		}

		// Hydrate in one batch (1 unit)
		const videos = await getVideosByIds(allVideoIds.join(','));
		const visible = videos.filter((v) => !v.isShort);

		// Shuffle results
		for (let i = visible.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[visible[i], visible[j]] = [visible[j], visible[i]];
		}

		return {
			items: visible,
			nextPageToken: offset + 4 < channelIds.length ? String(offset + 4) : undefined,
			totalResults: visible.length,
			filteredCount: videos.length - visible.length,
			backfillPages: 0
		};
	} catch (err) {
		logError('Subscription feed failed, falling back to trending', {
			error: err instanceof Error ? err.message : String(err)
		});
		return getTrendingVideos(pageToken);
	}
}

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
		bannerUrl: branding.image?.bannerExternalUrl,
		subscriberCount: stats.subscriberCount || '0',
		videoCount: stats.videoCount || '0',
		viewCount: stats.viewCount || '0'
	};

	cacheSet(cacheKey, info, getCacheTTL('channel'));

	// Side-effect: populate thumbnail cache
	const thumbUrl = snippet.thumbnails?.default?.url;
	if (thumbUrl) {
		cacheSet(`channelThumb:${channelId}`, thumbUrl, getCacheTTL('channelThumbnail'));
	}

	return info;
}

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

	// Derive uploads playlist ID (UC → UU)
	const uploadsPlaylistId = 'UU' + channelId.slice(2);
	const maxResults = order === 'viewCount' ? '50' : '25';

	const params: Record<string, string> = {
		part: 'snippet',
		playlistId: uploadsPlaylistId,
		maxResults
	};
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

	if (order === 'viewCount') {
		visible.sort((a, b) => parseInt(b.viewCount) - parseInt(a.viewCount));
	} else if (order === 'oldest') {
		visible.reverse();
	}

	const result: SearchResponse = {
		items: visible,
		nextPageToken: order === 'viewCount' ? undefined : plData.nextPageToken,
		totalResults: visible.length,
		filteredCount: videos.length - visible.length,
		backfillPages: 0
	};

	cacheSet(cacheKey, result, getCacheTTL('channelVideos'));
	return result;
}

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

	// Fetch channel thumbnail
	if (info.channelId) {
		const thumbs = await getChannelThumbnails([info.channelId]);
		info.channelThumbnail = thumbs.get(info.channelId);
	}

	cacheSet(cacheKey, info, getCacheTTL('playlist'));
	return info;
}

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

	const videos = await getVideosByIds(videoIds.join(','));
	const visible = videos.filter((v) => !v.isShort);

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
		maxResults: '50',
		order: 'alphabetical'
	};
	if (pageToken) params.pageToken = pageToken;

	logApiCall('subscriptions.list (list)', params, false);
	const data: any = await ytFetchAuth('subscriptions', params, accessToken);

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
				forChannelId: channelId
			},
			accessToken
		);

		const isSubscribed = (data.items || []).length > 0;
		cacheSet(cacheKey, isSubscribed, getCacheTTL('subscriptionCheck'));
		return isSubscribed;
	} catch {
		return false;
	}
}

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

	const items: SearchResultItem[] = [];
	const videoIds: string[] = [];

	for (const item of searchResult.items || []) {
		const kind = item.id?.kind;
		if (kind === 'youtube#video') {
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

	// Only hydrate video results
	if (videoIds.length > 0) {
		const videos = await getVideosByIds(videoIds.join(','));
		const visible = videos.filter((v) => !v.isShort);

		// Rebuild in original order
		const finalItems: SearchResultItem[] = [];
		for (const item of searchResult.items || []) {
			const kind = item.id?.kind;
			if (kind === 'youtube#video') {
				const video = visible.find((v) => v.id === item.id.videoId);
				if (video) finalItems.push({ kind: 'video', video });
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

	const result: EnhancedSearchResponse = {
		items,
		nextPageToken: searchResult.nextPageToken,
		totalResults: items.length
	};
	cacheSet(cacheKey, result, getCacheTTL('search'));
	return result;
}

function mapComment(item: any): Comment {
	const snippet = item?.snippet || {};
	return {
		id: item?.id || '',
		authorDisplayName: snippet.authorDisplayName || '',
		authorProfileImageUrl: snippet.authorProfileImageUrl || '',
		authorChannelUrl: snippet.authorChannelUrl || '',
		textDisplay: snippet.textDisplay || '',
		textOriginal: snippet.textOriginal || '',
		likeCount: snippet.likeCount || 0,
		publishedAt: snippet.publishedAt || '',
		updatedAt: snippet.updatedAt || '',
		parentId: snippet.parentId
	};
}
