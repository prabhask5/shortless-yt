/**
 * Server-side in-memory cache for YouTube API responses.
 *
 * This module implements a TTL-based caching layer that sits between the
 * SvelteKit server routes and the YouTube Data API. Its purpose is to reduce
 * redundant API calls (and therefore quota consumption) by storing responses
 * in a bounded, auto-evicting Map.
 *
 * Caching strategy:
 * - Each entry has a TTL (time-to-live) that determines its "fresh" window.
 * - After the TTL expires but before 2x TTL, the entry is considered "stale"
 *   and can still be returned to callers (enabling a stale-while-revalidate
 *   pattern at the call site).
 * - After 2x TTL, the entry is fully expired and is deleted on access.
 * - The cache is capped at MAX_CACHE_SIZE entries. When the limit is reached,
 *   expired entries are purged first; if none are expired, the oldest 20% of
 *   entries are evicted to make room.
 *
 * The service worker (`static/sw.js`) provides an additional client-side
 * caching layer on top of this server-side cache.
 */

import type { CacheEntry } from '$lib/types';

/**
 * The central in-memory store. Keys are cache identifiers (typically built
 * from the API endpoint + query parameters), and values are timestamped
 * entries wrapping the cached data along with their TTL.
 */
const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Default TTL values (in milliseconds) for each category of cached data.
 *
 * TTLs are tuned to balance freshness against YouTube API quota usage:
 * - Frequently changing data (comments, search) gets shorter TTLs.
 * - Rarely changing data (shortCheck, channel metadata) gets longer TTLs.
 */
const DEFAULT_TTLS = {
	search: 10 * 60 * 1000, // 10 minutes -- search results change often
	video: 12 * 60 * 60 * 1000, // 12 hours -- video metadata is fairly stable
	comments: 5 * 60 * 1000, // 5 minutes -- comments update frequently
	related: 10 * 60 * 1000, // 10 minutes -- related videos shift moderately
	shortCheck: 7 * 24 * 60 * 60 * 1000, // 7 days -- a video's Short status never changes
	trending: 30 * 60 * 1000, // 30 minutes -- trending refreshes periodically
	subscriptions: 60 * 60 * 1000, // 1 hour -- subscription list is user-stable
	channel: 24 * 60 * 60 * 1000, // 24 hours -- channel info rarely changes
	channelThumbnail: 24 * 60 * 60 * 1000, // 24 hours -- channel avatars rarely change
	channelVideos: 30 * 60 * 1000, // 30 minutes -- new uploads appear periodically
	playlist: 60 * 60 * 1000, // 1 hour -- playlist metadata is stable
	playlistVideos: 30 * 60 * 1000, // 30 minutes -- playlist contents change moderately
	subscriptionCheck: 60 * 60 * 1000 // 1 hour -- subscription status is stable
} as const;

/** Upper bound on the number of entries the cache may hold. */
const MAX_CACHE_SIZE = 5000;

/**
 * Retrieve the default TTL for a given cache category.
 *
 * @param {keyof typeof DEFAULT_TTLS} type - The cache category key (e.g. 'search', 'video')
 * @returns {number} The TTL in milliseconds for the given category
 */
export function getCacheTTL(type: keyof typeof DEFAULT_TTLS): number {
	return DEFAULT_TTLS[type];
}

/**
 * Look up a cached entry by key, applying freshness and staleness checks.
 *
 * Freshness model (three zones based on the entry's age):
 *   1. age <= TTL         → fresh: returned with `stale: false`
 *   2. TTL < age <= 2×TTL → stale: returned with `stale: true`
 *   3. age > 2×TTL        → too old: entry is deleted and `null` is returned
 *
 * @template T The expected type of the cached data
 * @param {string} key - The cache key to look up
 * @returns {{ data: T; stale: boolean } | null} The cached data with staleness flag, or null
 */
export function cacheGet<T>(key: string): { data: T; stale: boolean } | null {
	const entry = cache.get(key) as CacheEntry<T> | undefined;
	if (!entry) return null;

	const age = Date.now() - entry.timestamp;
	const expired = age > entry.ttl; // Past the intended freshness window
	const staleLimit = entry.ttl * 2; // Allow stale reads up to 2x the TTL
	const tooOld = age > staleLimit; // Beyond 2x TTL — data is too old to use

	if (tooOld) {
		cache.delete(key);
		return null;
	}

	return { data: entry.data, stale: expired };
}

/**
 * Store a value in the cache under the given key.
 * If the cache has reached MAX_CACHE_SIZE, eviction runs first.
 *
 * @template T The type of the data being cached
 * @param {string} key - The cache key (should uniquely identify the request)
 * @param {T} data - The data to cache
 * @param {number} ttl - Time-to-live in milliseconds
 */
export function cacheSet<T>(key: string, data: T, ttl: number): void {
	if (cache.size >= MAX_CACHE_SIZE) {
		evictOldest();
	}
	cache.set(key, { data, timestamp: Date.now(), ttl });
}

/**
 * Evict entries from the cache to free space.
 *
 * Two-phase eviction strategy:
 *   1. First pass: remove all entries whose age exceeds their TTL (expired).
 *   2. Fallback: if no expired entries were found, sort by timestamp and remove the oldest 20%.
 */
function evictOldest(): void {
	const now = Date.now();
	const toDelete: string[] = [];

	// Phase 1: collect all expired entries (age > TTL)
	for (const [k, v] of cache) {
		if (now - v.timestamp > v.ttl) {
			toDelete.push(k);
		}
	}

	// Phase 2: if nothing was expired, fall back to evicting the oldest 20%
	if (toDelete.length === 0) {
		const entries = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
		const count = Math.ceil(entries.length * 0.2);
		for (let i = 0; i < count; i++) {
			toDelete.push(entries[i][0]);
		}
	}

	for (const k of toDelete) {
		cache.delete(k);
	}
}
