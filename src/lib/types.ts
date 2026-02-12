/**
 * types.ts -- Core type definitions for the Shortless YT application.
 *
 * This module defines all shared TypeScript interfaces used across the
 * client and server layers, including video metadata, comments, search
 * results, authentication state, caching, channel/playlist info, and
 * the Shorts-filtering configuration. These types mirror and extend the
 * shapes returned by the YouTube Data API v3, adding application-specific
 * fields such as Shorts detection flags and cache TTL metadata.
 */

/**
 * Represents a single YouTube video with all metadata needed for display
 * and Shorts filtering. Combines data from the YouTube `videos` and
 * `search` API endpoints into a unified shape.
 */
export interface VideoItem {
	/** YouTube video ID (the `v` query parameter in watch URLs). */
	id: string;

	/** Full title of the video. */
	title: string;

	/** Video description text (may be truncated by the API on search results). */
	description: string;

	/** YouTube channel ID that uploaded this video. */
	channelId: string;

	/** Display name of the channel that uploaded this video. */
	channelTitle: string;

	/** URL for the uploading channel's avatar thumbnail, if resolved. */
	channelThumbnail?: string;

	/** ISO 8601 timestamp of when the video was published. */
	publishedAt: string;

	/**
	 * Map of available thumbnail resolutions for this video.
	 * Not all resolutions are guaranteed to exist for every video.
	 */
	thumbnails: {
		/** 120x90 default thumbnail. */
		default?: Thumbnail;
		/** 320x180 medium thumbnail. */
		medium?: Thumbnail;
		/** 480x360 high-quality thumbnail. */
		high?: Thumbnail;
		/** 1280x720 maximum resolution thumbnail (not always available). */
		maxres?: Thumbnail;
	};

	/** Video duration in ISO 8601 duration format (e.g. "PT4M33S"). */
	duration: string;

	/** Video duration converted to total seconds, used for Shorts detection thresholds. */
	durationSeconds: number;

	/** Total view count as a string (YouTube API returns large numbers as strings). */
	viewCount: string;

	/** Total like count as a string. */
	likeCount: string;

	/** Total comment count as a string. */
	commentCount: string;

	/** Author-specified tags/keywords associated with the video. */
	tags?: string[];

	/** Whether this video has been classified as a YouTube Short by the app's filter logic. */
	isShort: boolean;

	/**
	 * Human-readable explanation of why the video was flagged as a Short
	 * (e.g. "duration under 60s", "contains #shorts tag"). Only present
	 * when {@link isShort} is `true`.
	 */
	shortReason?: string;

	/**
	 * Live broadcast status from the YouTube API.
	 * Possible values: "none", "upcoming", "live".
	 */
	liveBroadcastContent?: string;
}

/**
 * Represents a single thumbnail image at a specific resolution.
 * YouTube provides thumbnails at several standard sizes; each
 * resolution is optional depending on the video and API endpoint.
 */
export interface Thumbnail {
	/** Fully-qualified URL to the thumbnail image. */
	url: string;

	/** Width of the thumbnail in pixels. */
	width: number;

	/** Height of the thumbnail in pixels. */
	height: number;
}

/**
 * A top-level comment thread on a YouTube video. Each thread contains
 * the original (top-level) comment and optionally its replies.
 * Maps to the YouTube `commentThreads` API resource.
 */
export interface CommentThread {
	/** Unique identifier for this comment thread. */
	id: string;

	/** The original top-level comment that started the thread. */
	topLevelComment: Comment;

	/** Total number of replies to the top-level comment (may exceed the number loaded in {@link replies}). */
	totalReplyCount: number;

	/** Array of reply comments, if any have been fetched. May be a partial list. */
	replies?: Comment[];
}

/**
 * A single YouTube comment, either a top-level comment or a reply.
 * Contains the comment body, author info, and engagement metadata.
 */
export interface Comment {
	/** Unique identifier for this comment. */
	id: string;

	/** Display name of the comment author. */
	authorDisplayName: string;

	/** URL to the comment author's profile/avatar image. */
	authorProfileImageUrl: string;

	/** URL to the comment author's YouTube channel page, if available. */
	authorChannelUrl?: string;

	/** Comment body with HTML formatting applied by YouTube (links, bold, etc.). */
	textDisplay: string;

	/** Raw/original comment text as entered by the author, without HTML formatting. */
	textOriginal: string;

	/** Number of likes on this comment. */
	likeCount: number;

	/** ISO 8601 timestamp of when the comment was originally posted. */
	publishedAt: string;

	/** ISO 8601 timestamp of the most recent edit (matches {@link publishedAt} if never edited). */
	updatedAt: string;

	/** ID of the parent comment, present only when this comment is a reply. */
	parentId?: string;
}

/**
 * Paginated response shape for video search and listing endpoints.
 * Used by `/api/search` and `/api/videos` routes. Includes metadata
 * about Shorts filtering to support transparent backfill behavior.
 */
export interface SearchResponse {
	/** Array of video items returned for the current page. Shorts have already been filtered out. */
	items: VideoItem[];

	/** Opaque token for fetching the next page of results. Absent on the last page. */
	nextPageToken?: string;

	/** Estimated total number of results from the YouTube API (before filtering). */
	totalResults: number;

	/** Number of videos that were removed by the Shorts filter in this response batch. */
	filteredCount: number;

	/**
	 * Number of additional YouTube API pages that were fetched behind the scenes
	 * to backfill results after Shorts were filtered out, ensuring the page is
	 * adequately populated.
	 */
	backfillPages: number;
}

/**
 * Paginated response shape for comment thread endpoints.
 * Used by `/api/comments` routes.
 */
export interface CommentsResponse {
	/** Array of comment threads for the current page. */
	items: CommentThread[];

	/** Opaque token for fetching the next page of comments. Absent on the last page. */
	nextPageToken?: string;

	/** Total number of top-level comment threads on the video. */
	totalResults: number;

	/** If `true`, the video owner has disabled comments on this video. */
	commentsDisabled?: boolean;
}

/**
 * Authenticated user profile information retrieved from Google OAuth.
 * Stored client-side to display user identity and manage subscriptions.
 */
export interface UserProfile {
	/** Google account user ID. */
	id: string;

	/** User's display name from their Google account. */
	name: string;

	/** User's email address from their Google account. */
	email: string;

	/** URL to the user's Google profile picture. */
	picture: string;

	/** The user's YouTube channel ID, if they have a channel linked to their Google account. */
	channelId?: string;
}

/**
 * Represents the current authentication state of the application.
 * Used by client-side stores to gate authenticated features
 * (e.g. subscriptions, liked videos).
 */
export interface AuthState {
	/** Whether the user is currently signed in with a valid session. */
	isSignedIn: boolean;

	/** The authenticated user's profile, or `null` if not signed in. */
	user: UserProfile | null;
}

/**
 * Generic cache wrapper that stores data alongside timing metadata.
 * Used by the server-side caching layer (`cache.ts`) to implement
 * TTL-based cache invalidation.
 *
 * @typeParam T - The type of the cached data payload.
 */
export interface CacheEntry<T> {
	/** The cached data payload. */
	data: T;

	/** Unix timestamp (in milliseconds) of when this entry was written to the cache. */
	timestamp: number;

	/** Time-to-live in milliseconds. The entry is considered stale after `timestamp + ttl`. */
	ttl: number;
}

/**
 * Configuration for the Shorts detection/filtering algorithm.
 * Controls the heuristics used to identify and exclude YouTube Shorts
 * from all video listings throughout the app.
 */
export interface ShortsConfig {
	/** Maximum video duration (in seconds) below which a video may be classified as a Short. */
	maxDurationSeconds: number;

	/**
	 * List of keywords/hashtags (e.g. "#shorts", "short") whose presence
	 * in a video's title, description, or tags triggers Short classification.
	 */
	keywords: string[];
}

/**
 * Detailed information about a YouTube channel.
 * Used on the channel detail page (`/channel/[id]`) to render
 * the channel banner, avatar, stats, and metadata.
 */
export interface ChannelInfo {
	/** YouTube channel ID. */
	id: string;

	/** Display name of the channel. */
	title: string;

	/** Channel description / "About" text. */
	description: string;

	/** Channel's custom vanity URL slug (e.g. "@channelname"), if one has been set. */
	customUrl?: string;

	/** ISO 8601 timestamp of when the channel was created. */
	publishedAt: string;

	/**
	 * Channel avatar/profile thumbnails at various resolutions.
	 * Not all resolutions are guaranteed to be present.
	 */
	thumbnails: {
		/** 88x88 default avatar. */
		default?: Thumbnail;
		/** 240x240 medium avatar. */
		medium?: Thumbnail;
		/** 800x800 high-quality avatar. */
		high?: Thumbnail;
	};

	/** URL to the channel's banner/header image, if one has been uploaded. */
	bannerUrl?: string;

	/** Total subscriber count as a string (may be rounded by YouTube for privacy). */
	subscriberCount: string;

	/** Total number of public videos on the channel as a string. */
	videoCount: string;

	/** Total cumulative view count across all channel videos as a string. */
	viewCount: string;
}

/**
 * Metadata about a YouTube playlist. Used on the playlist detail
 * page (`/playlist/[id]`) and in search results that include playlists.
 */
export interface PlaylistInfo {
	/** YouTube playlist ID. */
	id: string;

	/** Title of the playlist. */
	title: string;

	/** Description text of the playlist. */
	description: string;

	/** YouTube channel ID of the playlist owner. */
	channelId: string;

	/** Display name of the playlist owner's channel. */
	channelTitle: string;

	/** ISO 8601 timestamp of when the playlist was created. */
	publishedAt: string;

	/**
	 * Playlist cover thumbnails at various resolutions.
	 * Typically derived from the first video in the playlist.
	 */
	thumbnails: {
		/** 120x90 default thumbnail. */
		default?: Thumbnail;
		/** 320x180 medium thumbnail. */
		medium?: Thumbnail;
		/** 480x360 high-quality thumbnail. */
		high?: Thumbnail;
		/** 1280x720 maximum resolution thumbnail (not always available). */
		maxres?: Thumbnail;
	};

	/** Number of videos contained in this playlist. */
	itemCount: number;

	/** URL for the playlist owner's channel avatar, if resolved. */
	channelThumbnail?: string;
}

/**
 * A channel that the authenticated user is subscribed to.
 * Used on the subscriptions page (`/subscriptions`) to list
 * and link to subscribed channels.
 */
export interface SubscriptionChannel {
	/** YouTube channel ID of the subscribed channel. */
	channelId: string;

	/** Display name of the subscribed channel. */
	title: string;

	/** Channel description snippet. */
	description: string;

	/** URL to the subscribed channel's avatar/profile image. */
	thumbnailUrl: string;

	/** ISO 8601 timestamp of when the user subscribed to this channel. */
	publishedAt: string;
}

/**
 * A polymorphic search result item that can represent a video, channel,
 * or playlist. The `kind` discriminator field determines which payload
 * property is populated.
 */
export interface SearchResultItem {
	/** Discriminator indicating the type of search result. */
	kind: 'video' | 'channel' | 'playlist';

	/** Video data, present only when `kind` is `"video"`. */
	video?: VideoItem;

	/**
	 * Channel data, present only when `kind` is `"channel"`.
	 * Contains a lightweight subset of channel metadata for search result display.
	 */
	channel?: {
		/** YouTube channel ID. */
		id: string;
		/** Display name of the channel. */
		title: string;
		/** Channel description snippet. */
		description: string;
		/** URL to the channel's avatar/profile image. */
		thumbnailUrl: string;
		/** Subscriber count as a string (may not always be available). */
		subscriberCount?: string;
		/** Total public video count as a string. */
		videoCount?: string;
		/** Channel's custom vanity URL slug, if set. */
		customUrl?: string;
	};

	/**
	 * Playlist data, present only when `kind` is `"playlist"`.
	 * Contains a lightweight subset of playlist metadata for search result display.
	 */
	playlist?: {
		/** YouTube playlist ID. */
		id: string;
		/** Title of the playlist. */
		title: string;
		/** Playlist description snippet. */
		description: string;
		/** URL to the playlist's cover thumbnail. */
		thumbnailUrl: string;
		/** YouTube channel ID of the playlist owner. */
		channelId: string;
		/** Display name of the playlist owner. */
		channelTitle: string;
		/** Number of videos in the playlist, if available. */
		itemCount?: number;
	};
}

/**
 * Paginated response shape for the enhanced search endpoint that returns
 * mixed result types (videos, channels, and playlists).
 * Used by `/api/search` when enhanced/mixed results mode is active.
 */
export interface EnhancedSearchResponse {
	/** Array of mixed search result items for the current page. */
	items: SearchResultItem[];

	/** Opaque token for fetching the next page of results. Absent on the last page. */
	nextPageToken?: string;

	/** Estimated total number of results from the YouTube API. */
	totalResults: number;
}
