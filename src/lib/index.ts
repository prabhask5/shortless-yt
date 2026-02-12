/**
 * index.ts -- Public barrel export for the `$lib` module.
 *
 * This file serves as the convenience re-export hub for the most commonly
 * used types across the Shortless YT application. SvelteKit aliases this
 * directory as `$lib`, so consumers can write:
 *
 *   import type { VideoItem, SearchResponse } from '$lib';
 *
 * rather than importing from the deeper `$lib/types` path. Only a curated
 * subset of types is re-exported here; less frequently used types
 * (e.g. ChannelInfo, PlaylistInfo, EnhancedSearchResponse) should be
 * imported directly from `$lib/types`.
 */

// Re-export the most commonly used types for convenient access via `$lib`.
export type {
	/** A single YouTube video with metadata and Shorts classification. */
	VideoItem,
	/** A top-level comment thread containing the root comment and its replies. */
	CommentThread,
	/** A single YouTube comment (top-level or reply). */
	Comment,
	/** Paginated response for video search/listing endpoints (Shorts pre-filtered). */
	SearchResponse,
	/** Paginated response for comment thread endpoints. */
	CommentsResponse,
	/** Authenticated user's Google/YouTube profile information. */
	UserProfile,
	/** Current authentication state (signed-in flag and optional user profile). */
	AuthState,
	/** Configuration controlling the Shorts detection heuristics. */
	ShortsConfig
} from './types';
