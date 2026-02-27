export interface VideoItem {
	id: string;
	title: string;
	thumbnailUrl: string;
	channelId: string;
	channelTitle: string;
	channelAvatarUrl?: string;
	viewCount: string;
	publishedAt: string;
	duration: string;
	description?: string;
	likeCount?: string;
	liveBroadcastContent?: string;
}

export interface ChannelItem {
	id: string;
	title: string;
	description: string;
	thumbnailUrl: string;
	subscriberCount: string;
	videoCount: string;
}

export interface PlaylistItem {
	id: string;
	title: string;
	description: string;
	thumbnailUrl: string;
	channelTitle: string;
	itemCount: number;
}

export interface CommentItem {
	id: string;
	authorName: string;
	authorAvatarUrl: string;
	text: string;
	likeCount: number;
	publishedAt: string;
	replyCount: number;
}

export interface SearchFilters {
	type: 'video' | 'channel' | 'playlist';
	order?: string;
	videoDuration?: string;
}

export interface PageInfo {
	nextPageToken?: string;
	totalResults: number;
}

export interface PaginatedResult<T> {
	items: T[];
	pageInfo: PageInfo;
}

export interface UserSession {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	channelId?: string;
	channelTitle?: string;
	avatarUrl?: string;
}
