/**
 * Comments Endpoint
 *
 * GET /api/comments
 *
 * Fetches top-level comments for a video, or replies to a specific comment.
 * Supports two modes depending on which query parameters are provided:
 *   1. If `parentId` is set: fetches threaded replies for that comment.
 *   2. If `id` is set (and no `parentId`): fetches top-level comments for the video.
 *
 * Top-level comments can be sorted by relevance (default) or newest first.
 * Both modes support pagination via `pageToken`.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getComments, getCommentReplies } from '$lib/server/youtube-api';
import { checkRateLimit } from '$lib/server/rate-limiter';

/**
 * Handles GET requests for video comments or comment replies.
 *
 * @param {object} event - The SvelteKit request event.
 * @param {URL} event.url - The request URL containing query parameters.
 * @param {Function} event.getClientAddress - Returns the client's IP address for rate limiting.
 *
 * @returns {Response} JSON response with the following shapes:
 *   - Success (200): `{ items: Comment[], nextPageToken?: string, totalResults?: number }` - Paginated comments.
 *   - Missing param (400): `{ error: "Missing id parameter" }` (only when neither parentId nor id is provided).
 *   - Rate limited (429): `{ error: "Rate limit exceeded" }`
 *   - Server error (500): `{ error: string }`
 *
 * Query parameters:
 *   - `id` (required if no `parentId`): The YouTube video ID to fetch comments for.
 *   - `parentId` (optional): The comment ID to fetch threaded replies for. Takes priority over `id`.
 *   - `order` (optional, default "relevance"): Sort order - "relevance" or "newest" (mapped to YouTube API's "time").
 *   - `pageToken` (optional): Token for fetching the next page of comments/replies.
 */
export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	// Rate-limit by client IP to prevent abuse
	const ip = getClientAddress();
	const limit = checkRateLimit(ip, '/api/comments');
	if (!limit.allowed) {
		return json({ error: 'Rate limit exceeded' }, { status: 429 });
	}

	const videoId = url.searchParams.get('id');
	const parentId = url.searchParams.get('parentId');

	// Mode 1: Fetch replies to a specific comment thread
	if (parentId) {
		try {
			const pageToken = url.searchParams.get('pageToken') || undefined;
			const result = await getCommentReplies(parentId, pageToken);
			return json(result);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			return json({ error: message }, { status: 500 });
		}
	}

	// Mode 2: Fetch top-level comments for a video
	if (!videoId) return json({ error: 'Missing id parameter' }, { status: 400 });

	// Map user-friendly "newest" to YouTube API's "time"; default to "relevance"
	const order = (url.searchParams.get('order') === 'newest' ? 'time' : 'relevance') as
		| 'relevance'
		| 'time';
	const pageToken = url.searchParams.get('pageToken') || undefined;

	try {
		const result = await getComments(videoId, order, pageToken);
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
