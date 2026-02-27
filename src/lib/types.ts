/**
 * @fileoverview Shared TypeScript interfaces used across both client and server code.
 *
 * These types model the core domain objects returned by the YouTube Data API v3
 * after being parsed and normalized by the server-side YouTube client
 * (`$lib/server/youtube.ts`). They intentionally use simple string/number
 * fields rather than raw API response shapes so that the frontend never needs
 * to know about the YouTube API's nested structure.
 */

// ===================================================================
// YouTube resource types
// ===================================================================

/**
 * A normalized YouTube video.
 *
 * Combines fields from the YouTube API's `snippet`, `contentDetails`, and
 * `statistics` resource parts into a flat, frontend-friendly shape.
 */
export interface VideoItem {
	/** YouTube video ID (e.g. "dQw4w9WgXcQ"). */
	id: string;
	title: string;
	/** URL to the medium-quality thumbnail (or default fallback). */
	thumbnailUrl: string;
	channelId: string;
	channelTitle: string;
	/** Optional channel avatar, populated when available from supplemental fetches. */
	channelAvatarUrl?: string;
	/** Raw view count as a numeric string (e.g. "1234567"). */
	viewCount: string;
	/** ISO 8601 timestamp of when the video was published. */
	publishedAt: string;
	/** ISO 8601 duration string (e.g. "PT4M33S"). Empty string if unavailable. */
	duration: string;
	description?: string;
	/** Raw like count as a numeric string; "0" if hidden or unavailable. */
	likeCount?: string;
	/** Indicates if the video is a live broadcast ("live", "upcoming", or "none"). */
	liveBroadcastContent?: string;
}

/**
 * A normalized YouTube channel, combining snippet and statistics data.
 */
export interface ChannelItem {
	/** YouTube channel ID. */
	id: string;
	title: string;
	description: string;
	thumbnailUrl: string;
	/** Subscriber count as a numeric string; "0" if hidden by the channel owner. */
	subscriberCount: string;
	/** Total number of public videos as a numeric string. */
	videoCount: string;
	/** Total channel view count as a numeric string. */
	viewCount?: string;
	/** ISO 8601 timestamp of when the channel was created. */
	publishedAt?: string;
	/** Channel banner image URL from brandingSettings (may be empty). */
	bannerUrl?: string;
}

/**
 * A normalized YouTube playlist with basic metadata and item count.
 */
export interface PlaylistItem {
	/** YouTube playlist ID. */
	id: string;
	title: string;
	description: string;
	thumbnailUrl: string;
	/** Display name of the channel that owns this playlist. */
	channelTitle: string;
	/** Number of videos in the playlist. */
	itemCount: number;
}

/**
 * A top-level comment on a YouTube video (comment thread).
 *
 * Reply threads are not expanded; only the top-level comment and the
 * total reply count are included.
 */
export interface CommentItem {
	/** YouTube comment thread ID. */
	id: string;
	authorName: string;
	authorAvatarUrl: string;
	/** The comment body as rendered HTML (may contain links, bold, etc.). */
	text: string;
	likeCount: number;
	/** ISO 8601 timestamp. */
	publishedAt: string;
	/** Number of replies in this thread. */
	replyCount: number;
}

// ===================================================================
// Search & pagination
// ===================================================================

/** Active search filter state managed by the search UI. */
export interface SearchFilters {
	/** The type of YouTube resource to search for. */
	type: 'video' | 'channel' | 'playlist';
	/** Sort order (e.g. "relevance", "date", "viewCount"). */
	order?: string;
	/** Duration filter for video searches ("short", "medium", "long"). */
	videoDuration?: string;
}

/** Pagination metadata returned alongside every paginated list. */
export interface PageInfo {
	/** Opaque token to pass to the API for the next page; undefined on the last page. */
	nextPageToken?: string;
	/** Estimated total number of results (YouTube's estimate, not always exact). */
	totalResults: number;
}

/**
 * Generic wrapper for any paginated list of items.
 *
 * @template T - The item type (e.g. {@link VideoItem}, {@link ChannelItem}).
 */
export interface PaginatedResult<T> {
	items: T[];
	pageInfo: PageInfo;
}

// ===================================================================
// Authentication
// ===================================================================

/**
 * Server-side session data stored in the signed session cookie.
 *
 * Contains the Google OAuth2 tokens and optional cached profile information
 * so that the user's identity can be displayed without additional API calls.
 */
export interface UserSession {
	/** Google OAuth2 access token (short-lived, ~1 hour). */
	accessToken: string;
	/** Google OAuth2 refresh token (long-lived, used to obtain new access tokens). */
	refreshToken: string;
	/** Unix epoch milliseconds when the access token expires. */
	expiresAt: number;
	/** The authenticated user's YouTube channel ID, if known. */
	channelId?: string;
	/** The authenticated user's YouTube channel display name, if known. */
	channelTitle?: string;
	/** URL to the authenticated user's avatar image, if known. */
	avatarUrl?: string;
}
