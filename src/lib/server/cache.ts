import type { CacheEntry } from '$lib/types';

const cache = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTLS = {
	search: 10 * 60 * 1000, // 10 minutes
	video: 12 * 60 * 60 * 1000, // 12 hours
	comments: 5 * 60 * 1000, // 5 minutes
	related: 10 * 60 * 1000, // 10 minutes
	shortCheck: 7 * 24 * 60 * 60 * 1000, // 7 days
	trending: 30 * 60 * 1000, // 30 minutes
	subscriptions: 60 * 60 * 1000, // 1 hour
	channel: 24 * 60 * 60 * 1000, // 24 hours
	channelThumbnail: 24 * 60 * 60 * 1000, // 24 hours
	channelVideos: 30 * 60 * 1000, // 30 minutes
	playlist: 60 * 60 * 1000, // 1 hour
	playlistVideos: 30 * 60 * 1000, // 30 minutes
	subscriptionCheck: 60 * 60 * 1000 // 1 hour
} as const;

const MAX_CACHE_SIZE = 5000;

export function getCacheTTL(type: keyof typeof DEFAULT_TTLS): number {
	return DEFAULT_TTLS[type];
}

export function cacheGet<T>(key: string): { data: T; stale: boolean } | null {
	const entry = cache.get(key) as CacheEntry<T> | undefined;
	if (!entry) return null;

	const age = Date.now() - entry.timestamp;
	const expired = age > entry.ttl;
	const staleLimit = entry.ttl * 2;
	const tooOld = age > staleLimit;

	if (tooOld) {
		cache.delete(key);
		return null;
	}

	return { data: entry.data, stale: expired };
}

export function cacheSet<T>(key: string, data: T, ttl: number): void {
	if (cache.size >= MAX_CACHE_SIZE) {
		evictOldest();
	}
	cache.set(key, { data, timestamp: Date.now(), ttl });
}

function evictOldest(): void {
	const now = Date.now();
	const toDelete: string[] = [];

	for (const [k, v] of cache) {
		if (now - v.timestamp > v.ttl) {
			toDelete.push(k);
		}
	}

	if (toDelete.length === 0) {
		// Evict oldest 20%
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
