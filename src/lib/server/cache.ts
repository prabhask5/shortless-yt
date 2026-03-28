/**
 * @fileoverview Two-layer TTL cache: in-memory L1 + Upstash Redis L2.
 *
 * The YouTube Data API v3 imposes a strict daily quota (default 10,000 units).
 * Aggressive caching is essential to stay under the limit.
 *
 * **L1 (in-memory):** Fast, zero-latency reads within a single serverless
 * invocation. On Vercel, this only lives as long as the warm instance (~5-15
 * minutes of inactivity). Serves as a hot cache for repeated reads within
 * the same request or closely-spaced requests hitting the same instance.
 *
 * **L2 (Upstash Redis):** Persists across all serverless invocations.
 * Accessed via HTTP (~1-5ms latency). When L1 misses, L2 is checked.
 * On L2 hit, the value is promoted back into L1. On L2 miss, the caller
 * fetches fresh data and writes to both layers.
 *
 * **Stale-while-revalidate:**
 * Each entry tracks both a `freshUntil` and an `expiresAt` timestamp.
 * `get()` returns data as long as `now < expiresAt` (3x fresh TTL), even
 * if the data is past its freshness window. Callers use `isFresh(key)` to
 * decide whether to do a lightweight revalidation check, and `refresh(key)`
 * to bump timestamps when the data turns out to be unchanged — avoiding
 * expensive full re-fetches of identical data.
 *
 * When Redis is not configured (local dev), the cache degrades gracefully
 * to L1-only behavior — identical to the original implementation.
 *
 * Two singleton instances are exported:
 * - `publicCache` — for data shared across all users (trending, video details, etc.)
 * - `userCache`  — for per-session authenticated data (subscriptions, liked videos)
 */

import { redisGet, redisSet, redisMGet } from './redis.js';

/** Internal representation of an L1 cache entry with freshness and hard-expiry timestamps. */
interface CacheEntry<T> {
	data: T;
	/** Unix epoch ms — data is considered fresh (no revalidation needed) until this time. */
	freshUntil: number;
	/** Unix epoch ms — data is evicted after this time (3x fresh TTL). */
	expiresAt: number;
}

/**
 * A two-layer key-value cache: in-memory L1 with Upstash Redis L2.
 *
 * L1 entries are lazily evicted on read (if hard-expired) and periodically
 * swept by a background interval. L2 entries are managed by Redis TTL.
 */
class TTLCache {
	private store = new Map<string, CacheEntry<unknown>>();
	private cleanupInterval: ReturnType<typeof setInterval>;
	private prefix: string;

	/**
	 * @param prefix - A namespace prefix for Redis keys to avoid collisions
	 *                 between cache instances (e.g. "pub:" vs "usr:").
	 */
	constructor(prefix: string) {
		this.prefix = prefix;
		this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
	}

	/**
	 * Retrieve a cached value by key. Returns data even if stale (past
	 * freshUntil but before expiresAt) — callers use {@link isFresh} to
	 * decide whether to revalidate.
	 *
	 * @param key - Cache key.
	 * @returns The cached value, or `undefined` if missing or hard-expired.
	 */
	get<T>(key: string): T | undefined {
		const entry = this.store.get(key);
		if (entry) {
			if (Date.now() > entry.expiresAt) {
				this.store.delete(key);
			} else {
				return entry.data as T;
			}
		}
		return undefined;
	}

	/**
	 * Check whether a cached entry is still within its fresh window.
	 * Returns false if the key is missing, hard-expired, or stale.
	 * Callers use this to decide whether to skip revalidation.
	 */
	isFresh(key: string): boolean {
		const entry = this.store.get(key);
		if (!entry) return false;
		const now = Date.now();
		if (now > entry.expiresAt) {
			this.store.delete(key);
			return false;
		}
		return now <= entry.freshUntil;
	}

	/**
	 * Bump the freshness and hard-expiry timestamps of an existing entry
	 * without re-fetching or changing its data. Also refreshes the Redis
	 * TTL. Use this when a lightweight revalidation check confirms the
	 * cached data is still current.
	 *
	 * @param key   - Cache key.
	 * @param ttlMs - Fresh TTL in milliseconds.
	 */
	refresh(key: string, ttlMs: number): void {
		const entry = this.store.get(key);
		if (!entry) return;
		const now = Date.now();
		entry.freshUntil = now + ttlMs;
		entry.expiresAt = now + ttlMs * 3;
		/* Refresh Redis TTL too */
		redisSet(this.prefix + key, entry.data, ttlMs * 2);
	}

	/**
	 * Batch-fetch a set of keys from Redis in a single MGET round trip, promoting
	 * all hits into L1. Keys already in L1 are included in the result without any
	 * Redis traffic. Returns a Map of key → value for every entry found in either
	 * L1 or L2; absent keys are simply omitted.
	 *
	 * Use this instead of N individual `getWithRedis` calls when fetching multiple
	 * related keys (e.g. per-video or per-channel detail caches).
	 *
	 * @param entries - Array of { key, ttlMs } pairs to look up.
	 * @returns Map of key → value for all found entries.
	 */
	async warmBatchFromRedis<T = unknown>(
		entries: Array<{ key: string; ttlMs: number }>
	): Promise<Map<string, T>> {
		const result = new Map<string, T>();

		const missing: Array<{ key: string; ttlMs: number }> = [];
		for (const entry of entries) {
			const l1 = this.get<T>(entry.key);
			if (l1 !== undefined) {
				result.set(entry.key, l1);
			} else {
				missing.push(entry);
			}
		}

		if (missing.length === 0) return result;

		const redisKeys = missing.map(({ key }) => this.prefix + key);
		const l2 = await redisMGet<T>(redisKeys);
		if (l2.size === 0) return result;

		const now = Date.now();
		for (let i = 0; i < missing.length; i++) {
			const { key, ttlMs } = missing[i];
			const val = l2.get(redisKeys[i]);
			if (val !== undefined) {
				this.store.set(key, {
					data: val,
					freshUntil: now + ttlMs,
					expiresAt: now + ttlMs * 3
				});
				result.set(key, val);
			}
		}

		return result;
	}

	/**
	 * Retrieve a cached value, checking Redis L2 if L1 misses.
	 * Use this for expensive operations where the Redis round trip is worth it.
	 * Data promoted from Redis is marked as fresh.
	 *
	 * @param key - Cache key.
	 * @param ttlMs - TTL to use when promoting from L2 to L1.
	 * @returns The cached value, or `undefined` if missing in both layers.
	 */
	async getWithRedis<T>(key: string, ttlMs: number): Promise<T | undefined> {
		/* L1 check — returns data even if stale (within hard expiry) */
		const l1 = this.get<T>(key);
		if (l1 !== undefined) return l1;

		/* L2 check */
		const l2 = await redisGet<T>(this.prefix + key);
		if (l2 !== undefined) {
			/* Promote to L1 as fresh (it's within Redis TTL) */
			const now = Date.now();
			this.store.set(key, {
				data: l2,
				freshUntil: now + ttlMs,
				expiresAt: now + ttlMs * 3
			});
			return l2;
		}

		return undefined;
	}

	/**
	 * Store a value in both L1 (in-memory) and L2 (Redis).
	 *
	 * L1 entries live for 3x the nominal TTL (stale-while-revalidate window).
	 * L2 (Redis) entries live for 2x TTL for cross-invocation persistence.
	 *
	 * @param key   - Cache key.
	 * @param data  - The value to cache.
	 * @param ttlMs - Time-to-live in milliseconds (freshness window).
	 */
	set<T>(key: string, data: T, ttlMs: number): void {
		const now = Date.now();
		/* L1 — fresh window + extended stale window (3x total) */
		this.store.set(key, {
			data,
			freshUntil: now + ttlMs,
			expiresAt: now + ttlMs * 3
		});
		/* L2 — Redis with 2x TTL for cross-invocation persistence */
		redisSet(this.prefix + key, data, ttlMs * 2);
	}

	/** Remove all entries from L1 (does not clear Redis). */
	clear(): void {
		this.store.clear();
	}

	/** Sweep hard-expired L1 entries. */
	private cleanup(): void {
		const now = Date.now();
		for (const [key, entry] of this.store) {
			if (now > entry.expiresAt) {
				this.store.delete(key);
			}
		}
	}

	/** Stop the background cleanup timer and clear L1. */
	destroy(): void {
		clearInterval(this.cleanupInterval);
		this.store.clear();
	}
}

/** Shared cache for public data (trending, video details, categories, etc.) */
export const publicCache = new TTLCache('pub:');

/** Cache for per-session/authenticated data (subscriptions, liked videos, etc.) */
export const userCache = new TTLCache('usr:');
