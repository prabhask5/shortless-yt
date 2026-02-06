interface RateLimitEntry {
	count: number;
	resetAt: number;
}

const limits = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS: Record<string, number> = {
	'/api/search': 30,
	'/api/videos': 60,
	'/api/related': 30,
	'/api/comments': 40,
	'/api/isShort': 10,
	'/api/recommended': 30,
	'/api/auth/login': 10,
	'/api/auth/callback': 10,
	'/api/auth/logout': 10,
	'/api/auth/me': 30,
	default: 60
};

export function checkRateLimit(
	ip: string,
	endpoint: string
): { allowed: boolean; retryAfter?: number } {
	const key = `${ip}:${endpoint}`;
	const now = Date.now();
	const entry = limits.get(key);

	if (!entry || now >= entry.resetAt) {
		limits.set(key, { count: 1, resetAt: now + WINDOW_MS });
		return { allowed: true };
	}

	const max = MAX_REQUESTS[endpoint] || MAX_REQUESTS['default'];
	if (entry.count >= max) {
		const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
		return { allowed: false, retryAfter };
	}

	entry.count++;
	return { allowed: true };
}

// Periodic cleanup
setInterval(() => {
	const now = Date.now();
	for (const [key, entry] of limits) {
		if (now >= entry.resetAt) {
			limits.delete(key);
		}
	}
}, 60 * 1000);
