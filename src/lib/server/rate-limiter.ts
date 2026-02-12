/**
 * In-memory, per-IP rate limiter for API endpoints.
 *
 * Strategy: Fixed-window rate limiting. Each unique (IP, endpoint) pair is
 * allowed a configurable number of requests within a 1-minute window.
 * When the counter reaches the per-endpoint maximum, subsequent requests are
 * rejected with a `retryAfter` value (in seconds) indicating when the window resets.
 *
 * A background interval runs every 60 seconds to prune expired entries,
 * preventing unbounded memory growth on long-running server instances.
 *
 * NOTE: State lives in a plain Map, so this limiter is scoped to a single
 * process and will not share state across multiple server instances.
 *
 * @module rate-limiter
 */

/**
 * Represents a single rate-limit tracking entry for one (IP, endpoint) pair.
 */
interface RateLimitEntry {
	/** Number of requests recorded in the current window. */
	count: number;
	/** Unix-epoch millisecond timestamp at which the current window expires. */
	resetAt: number;
}

/**
 * Primary store for all active rate-limit windows.
 * Keys are composite strings in the format "ip:endpoint".
 */
const limits = new Map<string, RateLimitEntry>();

/** Duration of each rate-limit window in milliseconds (1 minute). */
const WINDOW_MS = 60 * 1000; // 1 minute window

/**
 * Per-endpoint request caps within a single window.
 * Auth endpoints are tightly capped to deter brute-force attempts.
 * Any endpoint not explicitly listed falls back to the `default` value.
 */
const MAX_REQUESTS: Record<string, number> = {
	'/api/search': 30,
	'/api/videos': 60,
	'/api/related': 30,
	'/api/comments': 40,
	'/api/isShort': 10,
	'/api/recommended': 30,
	'/api/channel': 30,
	'/api/channel/videos': 30,
	'/api/playlist': 30,
	'/api/playlist/videos': 30,
	'/api/subscriptions': 20,
	'/api/subscriptions/check': 30,
	'/api/auth/login': 10,
	'/api/auth/callback': 10,
	'/api/auth/logout': 10,
	'/api/auth/me': 30,
	default: 60
};

/**
 * Checks whether a request from the given IP to the given endpoint is allowed.
 *
 * @param {string} ip - The client's IP address
 * @param {string} endpoint - The API route path (e.g. "/api/search")
 * @returns {{ allowed: boolean; retryAfter?: number }} Whether the request may proceed,
 *          with retryAfter (seconds) if rate-limited
 */
export function checkRateLimit(
	ip: string,
	endpoint: string
): { allowed: boolean; retryAfter?: number } {
	// Build a composite key so each IP is tracked independently per endpoint
	const key = `${ip}:${endpoint}`;
	const now = Date.now();
	const entry = limits.get(key);

	// No existing entry or window expired — start a fresh window
	if (!entry || now >= entry.resetAt) {
		limits.set(key, { count: 1, resetAt: now + WINDOW_MS });
		return { allowed: true };
	}

	// Look up the cap for this endpoint, falling back to default
	const max = MAX_REQUESTS[endpoint] || MAX_REQUESTS['default'];

	// Window is still active and cap reached — reject
	if (entry.count >= max) {
		// Convert remaining window time to whole seconds for Retry-After header
		const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
		return { allowed: false, retryAfter };
	}

	// Under the cap — allow and increment
	entry.count++;
	return { allowed: true };
}

/**
 * Periodic cleanup sweep that runs every 60 seconds.
 * Removes expired entries to prevent unbounded memory growth.
 */
setInterval(() => {
	const now = Date.now();
	for (const [key, entry] of limits) {
		if (now >= entry.resetAt) {
			limits.delete(key);
		}
	}
}, 60 * 1000);
