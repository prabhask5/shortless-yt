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
 * When Redis is not configured (local dev), the cache degrades gracefully
 * to L1-only behavior — identical to the original implementation.
 *
 * Two singleton instances are exported:
 * - `publicCache` — for data shared across all users (trending, video details, etc.)
 * - `userCache`  — for per-session authenticated data (subscriptions, liked videos)
 */

import { redisGet, redisSet } from './redis.js';

/** Internal representation of an L1 cache entry with an absolute expiration timestamp. */
interface CacheEntry<T> {
	data: T;
	/** Unix epoch milliseconds after which this entry is considered stale. */
	expiresAt: number;
}

/**
 * A two-layer key-value cache: in-memory L1 with Upstash Redis L2.
 *
 * L1 entries are lazily evicted on read (if expired) and periodically swept
 * by a background interval. L2 entries are managed by Redis TTL.
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
	 * Retrieve a cached value by key. Checks L1 first, then L2 (Redis).
	 *
	 * @param key - Cache key.
	 * @returns The cached value, or `undefined` if missing or expired.
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
	 * Retrieve a cached value, checking Redis L2 if L1 misses.
	 * Use this for expensive operations where the Redis round trip is worth it.
	 *
	 * @param key - Cache key.
	 * @param ttlMs - TTL to use when promoting from L2 to L1.
	 * @returns The cached value, or `undefined` if missing in both layers.
	 */
	async getWithRedis<T>(key: string, ttlMs: number): Promise<T | undefined> {
		/* L1 check */
		const l1 = this.get<T>(key);
		if (l1 !== undefined) return l1;

		/* L2 check */
		const l2 = await redisGet<T>(this.prefix + key);
		if (l2 !== undefined) {
			/* Promote to L1 */
			this.store.set(key, { data: l2, expiresAt: Date.now() + ttlMs });
			return l2;
		}

		return undefined;
	}

	/**
	 * Store a value in both L1 (in-memory) and L2 (Redis).
	 *
	 * @param key   - Cache key.
	 * @param data  - The value to cache.
	 * @param ttlMs - Time-to-live in milliseconds.
	 */
	set<T>(key: string, data: T, ttlMs: number): void {
		/* L1 */
		this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
		/* L2 — fire and forget */
		redisSet(this.prefix + key, data, ttlMs);
	}

	/** Remove all entries from L1 (does not clear Redis). */
	clear(): void {
		this.store.clear();
	}

	/** Sweep expired L1 entries. */
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
