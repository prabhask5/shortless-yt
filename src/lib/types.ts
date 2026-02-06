export interface VideoItem {
	id: string;
	title: string;
	description: string;
	channelId: string;
	channelTitle: string;
	publishedAt: string;
	thumbnails: {
		default?: Thumbnail;
		medium?: Thumbnail;
		high?: Thumbnail;
		maxres?: Thumbnail;
	};
	duration: string; // ISO 8601 duration
	durationSeconds: number;
	viewCount: string;
	likeCount: string;
	commentCount: string;
	tags?: string[];
	isShort: boolean;
	shortReason?: string;
	liveBroadcastContent?: string;
}

export interface Thumbnail {
	url: string;
	width: number;
	height: number;
}

export interface CommentThread {
	id: string;
	topLevelComment: Comment;
	totalReplyCount: number;
	replies?: Comment[];
}

export interface Comment {
	id: string;
	authorDisplayName: string;
	authorProfileImageUrl: string;
	authorChannelUrl?: string;
	textDisplay: string;
	textOriginal: string;
	likeCount: number;
	publishedAt: string;
	updatedAt: string;
	parentId?: string;
}

export interface SearchResponse {
	items: VideoItem[];
	nextPageToken?: string;
	totalResults: number;
	filteredCount: number;
	backfillPages: number;
}

export interface CommentsResponse {
	items: CommentThread[];
	nextPageToken?: string;
	totalResults: number;
	commentsDisabled?: boolean;
}

export interface UserProfile {
	id: string;
	name: string;
	email: string;
	picture: string;
	channelId?: string;
}

export interface AuthState {
	isSignedIn: boolean;
	user: UserProfile | null;
}

export interface CacheEntry<T> {
	data: T;
	timestamp: number;
	ttl: number;
}

export interface ShortsConfig {
	maxDurationSeconds: number;
	keywords: string[];
}
