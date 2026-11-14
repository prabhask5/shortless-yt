/**
 * @fileoverview Redis L2 cache client with graceful fallback.
 *
 * Connects to plain Redis over TCP using REDIS_URL (e.g. redis://host:6379/0).
 * Without REDIS_URL there is no L2 and callers fall back to the in-memory L1 cache.
 *
 * Every function here is best-effort: on any error, or while the connection is
 * down, reads return a miss and writes are dropped, so a Redis outage only
 * costs cache hits, never a failed request.
 */

import { createClient } from 'redis';

type TcpClient = ReturnType<typeof createClient>;

let client: TcpClient | null = null;
let notConfiguredWarned = false;

/**
 * Connects once in the background and reconnects automatically. Returns the
 * client only while it is connected; while down, returns null so callers skip
 * Redis instead of waiting on a queued command.
 */
function getRedis(): TcpClient | null {
	if (!process.env.REDIS_URL) {
		if (!notConfiguredWarned)
			console.warn('[CACHE] Redis L2 not configured — REDIS_URL is not set');
		notConfiguredWarned = true;
		return null;
	}
	if (!client) {
		const c = createClient({
			url: process.env.REDIS_URL,
			disableOfflineQueue: true,
			socket: { connectTimeout: 2000 }
		});
		let warned = false;
		c.on('error', (err) => {
			if (!warned) console.warn(`[CACHE] Redis L2 error: ${err?.message ?? err}`);
			warned = true;
		});
		c.on('ready', () => {
			warned = false;
			console.log('[CACHE] Redis L2 connected');
		});
		c.connect().catch(() => {
			/* reported by the 'error' handler; the client keeps retrying */
		});
		client = c;
	}
	return client.isReady ? client : null;
}

function decode<T>(raw: string | null): T | undefined {
	if (raw === null) return undefined;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return undefined;
	}
}

/** Get a value from Redis. Returns undefined on miss or error. */
export async function redisGet<T>(key: string): Promise<T | undefined> {
	const c = getRedis();
	if (!c) return undefined;
	try {
		return decode<T>(await c.get(key));
	} catch {
		return undefined;
	}
}

/** Set a value in Redis with a TTL in milliseconds. Fire and forget. */
export function redisSet<T>(key: string, value: T, ttlMs: number): void {
	const c = getRedis();
	if (!c) return;
	c.setEx(key, Math.max(1, Math.round(ttlMs / 1000)), JSON.stringify(value)).catch(() => {});
}

/** Batch-get keys in one round trip. Returns a Map of key → value for keys found. */
export async function redisMGet<T>(keys: string[]): Promise<Map<string, T>> {
	const result = new Map<string, T>();
	const c = getRedis();
	if (!c || keys.length === 0) return result;
	try {
		const values = await c.mGet(keys);
		for (let i = 0; i < keys.length; i++) {
			const v = decode<T>(values[i] ?? null);
			if (v !== undefined) result.set(keys[i], v);
		}
	} catch {
		/* Return what we have — callers fall back to HEAD probes. */
	}
	return result;
}

/** Batch-set key-value pairs using a pipeline. Fire and forget. */
export function redisMSet(entries: Array<{ key: string; value: unknown; ttlMs: number }>): void {
	const c = getRedis();
	if (!c || entries.length === 0) return;
	const pipeline = c.multi();
	for (const { key, value, ttlMs } of entries) {
		pipeline.setEx(key, Math.max(1, Math.round(ttlMs / 1000)), JSON.stringify(value));
	}
	pipeline.execAsPipeline().catch(() => {});
}

/** Check if Redis is configured and currently connected. */
export function isRedisAvailable(): boolean {
	return getRedis() !== null;
}
