/**
 * @fileoverview Upstash Redis client with graceful fallback.
 *
 * Provides a Redis-backed cache that falls back to in-memory storage when
 * Redis credentials are not configured (local dev) or when Redis is unreachable.
 *
 * The Upstash REST-based client is ideal for Vercel serverless because it
 * uses HTTP requests (no persistent TCP connections). Each get/set is a
 * single HTTP round trip (~1-5ms to the nearest Upstash region).
 */

import { Redis } from '@upstash/redis';

let redis: Redis | null = null;

/**
 * Lazily initialize the Redis client. Returns null if credentials are missing
 * (e.g. local development without Upstash configured).
 */
function getRedis(): Redis | null {
	if (redis) return redis;

	const url =
		process.env.SHORTLESS_YT_CACHE_KV_URL ??
		process.env.UPSTASH_REDIS_REST_URL ??
		process.env.KV_REST_API_URL;
	const token =
		process.env.SHORTLESS_YT_CACHE_KV_TOKEN ??
		process.env.UPSTASH_REDIS_REST_TOKEN ??
		process.env.KV_REST_API_TOKEN;

	if (!url || !token) {
		return null;
	}

	redis = new Redis({ url, token });
	return redis;
}

/**
 * Get a value from Redis. Returns undefined on miss or error.
 */
export async function redisGet<T>(key: string): Promise<T | undefined> {
	const client = getRedis();
	if (!client) return undefined;

	try {
		const value = await client.get<T>(key);
		return value ?? undefined;
	} catch {
		return undefined;
	}
}

/**
 * Set a value in Redis with a TTL in milliseconds.
 * Fires and forgets — does not block on write completion.
 */
export function redisSet<T>(key: string, value: T, ttlMs: number): void {
	const client = getRedis();
	if (!client) return;

	const ttlSeconds = Math.max(1, Math.round(ttlMs / 1000));
	client.set(key, value, { ex: ttlSeconds }).catch(() => {
		/* Silently ignore write failures — the in-memory cache is the fallback. */
	});
}

/**
 * Batch-get multiple keys from Redis in a single HTTP round trip.
 * Returns a Map of key → value for keys that were found.
 */
export async function redisMGet<T>(keys: string[]): Promise<Map<string, T>> {
	const client = getRedis();
	const result = new Map<string, T>();
	if (!client || keys.length === 0) return result;

	try {
		const values = await client.mget<(T | null)[]>(...keys);
		for (let i = 0; i < keys.length; i++) {
			const v = values[i];
			if (v !== null && v !== undefined) {
				result.set(keys[i], v);
			}
		}
	} catch {
		/* Return empty map on error — callers fall back to HEAD probes. */
	}

	return result;
}

/**
 * Batch-set multiple key-value pairs in Redis using a pipeline.
 * Fires and forgets.
 */
export function redisMSet(entries: Array<{ key: string; value: unknown; ttlMs: number }>): void {
	const client = getRedis();
	if (!client || entries.length === 0) return;

	const pipeline = client.pipeline();
	for (const { key, value, ttlMs } of entries) {
		const ttlSeconds = Math.max(1, Math.round(ttlMs / 1000));
		pipeline.set(key, value, { ex: ttlSeconds });
	}
	pipeline.exec().catch(() => {
		/* Silently ignore pipeline failures. */
	});
}

/** Check if Redis is configured and available. */
export function isRedisAvailable(): boolean {
	return getRedis() !== null;
}
