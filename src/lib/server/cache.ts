/**
 * @fileoverview In-memory TTL (Time-To-Live) cache for YouTube API quota conservation.
 *
 * The YouTube Data API v3 imposes a strict daily quota (default 10,000 units).
 * Every search costs 100 units and every video/channel detail call costs 1 unit,
 * so aggressive caching is essential to stay under the limit.
 *
 * Two singleton cache instances are exported:
 * - `publicCache` — for data that is the same for all users (trending, video
 *   details, categories, search results, etc.).
 * - `userCache`  — for per-session authenticated data (subscriptions, liked
 *   videos, user playlists) keyed by a token suffix.
 *
 * Architecture notes:
 * - The cache is purely in-memory (a `Map`), which means it resets on server
 *   restart. This is acceptable because YouTube data changes frequently and
 *   the cache exists primarily to absorb repeated requests within short
 *   time windows (e.g. pagination, back-navigation).
 * - A background cleanup interval runs every 5 minutes to evict expired entries,
 *   preventing unbounded memory growth. The interval is conservative (5 min)
 *   rather than aggressive because `get()` already performs lazy eviction on
 *   access, so the sweep is just a safety net for entries that are never read
 *   again.
 */

/** Internal representation of a cache entry with an absolute expiration timestamp. */
interface CacheEntry<T> {
	data: T;
	/** Unix epoch milliseconds after which this entry is considered stale. */
	expiresAt: number;
}

/**
 * A simple key-value cache where each entry has an independent TTL.
 *
 * Entries are lazily evicted on read (if expired) and periodically swept
 * by a background interval to reclaim memory from entries that are never
 * re-read after expiry.
 */
class TTLCache {
	private store = new Map<string, CacheEntry<unknown>>();
	private cleanupInterval: ReturnType<typeof setInterval>;

	constructor() {
		/*
		 * Run a background sweep every 5 minutes. This is intentionally infrequent
		 * because `get()` already evicts stale entries on access — the sweep only
		 * catches "orphaned" entries that were written but never read again.
		 */
		this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
	}

	/**
	 * Retrieve a cached value by key.
	 *
	 * @param key - Cache key.
	 * @returns The cached value, or `undefined` if missing or expired.
	 */
	get<T>(key: string): T | undefined {
		const entry = this.store.get(key);
		if (!entry) return undefined;

		/* Lazy eviction: delete on read if the entry has expired. */
		if (Date.now() > entry.expiresAt) {
			this.store.delete(key);
			return undefined;
		}

		return entry.data as T;
	}

	/**
	 * Store a value with a given TTL.
	 *
	 * @param key   - Cache key.
	 * @param data  - The value to cache.
	 * @param ttlMs - Time-to-live in milliseconds from now.
	 */
	set<T>(key: string, data: T, ttlMs: number): void {
		this.store.set(key, {
			data,
			expiresAt: Date.now() + ttlMs
		});
	}

	/** Remove all entries from the cache. */
	clear(): void {
		this.store.clear();
	}

	/**
	 * Sweep all expired entries from the store.
	 * Called on a 5-minute interval as a safety net for memory reclamation.
	 */
	private cleanup(): void {
		const now = Date.now();
		let evicted = 0;
		for (const [key, entry] of this.store) {
			if (now > entry.expiresAt) {
				this.store.delete(key);
				evicted++;
			}
		}
		if (evicted > 0) {
			console.log(
				`[CACHE] Background cleanup evicted ${evicted} expired entries, ${this.store.size} remaining`
			);
		}
	}

	/** Stop the background cleanup timer and clear all data. */
	destroy(): void {
		clearInterval(this.cleanupInterval);
		this.store.clear();
	}
}

/** Shared cache for public data (trending, video details, categories, etc.) */
export const publicCache = new TTLCache();

/** Cache for per-session/authenticated data (subscriptions, liked videos, etc.) */
export const userCache = new TTLCache();
