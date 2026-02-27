interface CacheEntry<T> {
	data: T;
	expiresAt: number;
}

class TTLCache {
	private store = new Map<string, CacheEntry<unknown>>();
	private cleanupInterval: ReturnType<typeof setInterval>;

	constructor() {
		this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
	}

	get<T>(key: string): T | undefined {
		const entry = this.store.get(key);
		if (!entry) return undefined;

		if (Date.now() > entry.expiresAt) {
			this.store.delete(key);
			return undefined;
		}

		return entry.data as T;
	}

	set<T>(key: string, data: T, ttlMs: number): void {
		this.store.set(key, {
			data,
			expiresAt: Date.now() + ttlMs
		});
	}

	clear(): void {
		this.store.clear();
	}

	private cleanup(): void {
		const now = Date.now();
		for (const [key, entry] of this.store) {
			if (now > entry.expiresAt) {
				this.store.delete(key);
			}
		}
	}

	destroy(): void {
		clearInterval(this.cleanupInterval);
		this.store.clear();
	}
}

/** Shared cache for public data (trending, video details, categories, etc.) */
export const publicCache = new TTLCache();

/** Cache for per-session/authenticated data (subscriptions, liked videos, etc.) */
export const userCache = new TTLCache();
