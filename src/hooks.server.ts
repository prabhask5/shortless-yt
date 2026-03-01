/**
 * @fileoverview SvelteKit server hook for session management and rate limiting.
 *
 * This hook runs on every incoming server request before any route handler or
 * load function executes. It handles two concerns:
 *
 * **1. Session hydration:**
 * Reads and validates the encrypted session cookie, attaching the decoded
 * token data to `event.locals.session` so downstream handlers can check
 * authentication without re-parsing the cookie themselves. Supports both
 * AES-256-GCM encrypted session format.
 *
 * **2. API rate limiting:**
 * Protects the YouTube API quota (10,000 units/day) by rate-limiting requests
 * to `/api/` endpoints. Uses a per-IP sliding window counter stored in memory.
 * On Vercel serverless, each function instance maintains its own counter — this
 * is imperfect but still effective because popular routes hit the same warm
 * instance and it blocks the most common abuse pattern (scripted rapid requests).
 *
 * **3. Content Security Policy (CSP):**
 * Handled natively by SvelteKit via `kit.csp.directives` in `svelte.config.js`,
 * using nonce-based script-src instead of unsafe-inline.
 */

import type { Handle } from '@sveltejs/kit';
import {
	decryptSession,
	encryptSession,
	refreshAccessToken,
	SESSION_COOKIE_NAME
} from '$lib/server/auth';
import { PUBLIC_APP_URL } from '$lib/server/env';

// ===================================================================
// Rate limiting
// ===================================================================

/**
 * Per-IP request counter for the sliding window rate limiter.
 *
 * Each entry tracks the number of requests within the current window and
 * the timestamp when the window started. When the window expires, the
 * counter resets on the next request.
 */
interface RateLimitEntry {
	/** Number of requests made within the current window. */
	count: number;
	/** Unix timestamp (ms) when the current window started. */
	windowStart: number;
}

/** Duration of the rate limit sliding window in milliseconds (1 minute). */
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Maximum number of API requests allowed per IP per window.
 * 60 requests/minute is generous for legitimate use (autocomplete debounces
 * at 300ms, comments load one page at a time) but blocks automated abuse.
 */
const RATE_LIMIT_MAX_REQUESTS = 60;

/**
 * In-memory rate limit state, keyed by client IP address.
 *
 * On Vercel serverless, this persists across requests to the same warm
 * function instance but resets when the instance is recycled. This is
 * acceptable — the rate limiter is a best-effort defense, not a guarantee.
 */
const rateLimitMap = new Map<string, RateLimitEntry>();

/**
 * Background cleanup interval that removes stale rate limit entries.
 *
 * Runs every 2 minutes to prevent the Map from growing unbounded if many
 * unique IPs hit the server. Entries older than 2x the window duration are
 * considered stale (they'll be reset on next access anyway, but this
 * reclaims memory from IPs that never return).
 */
setInterval(() => {
	const now = Date.now();
	for (const [ip, entry] of rateLimitMap) {
		if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
			rateLimitMap.delete(ip);
		}
	}
}, 2 * 60_000);

/**
 * Check whether a request from the given IP should be rate-limited.
 *
 * Uses a fixed-window counter: the first request in a window starts the
 * timer, and subsequent requests increment the counter. If the counter
 * exceeds {@link RATE_LIMIT_MAX_REQUESTS} within the window, the request
 * is rejected. When the window expires, the counter resets.
 *
 * @param ip - The client's IP address (from `event.getClientAddress()`).
 * @returns `true` if the request should be blocked (rate limit exceeded).
 */
function isRateLimited(ip: string): boolean {
	const now = Date.now();
	const entry = rateLimitMap.get(ip);

	if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
		/* First request or window expired — start a new window. */
		rateLimitMap.set(ip, { count: 1, windowStart: now });
		return false;
	}

	entry.count++;
	return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

// ===================================================================
// Main hook
// ===================================================================

export const handle: Handle = async ({ event, resolve }) => {
	const cookie = event.cookies.get(SESSION_COOKIE_NAME);
	const path = event.url.pathname;

	/* ── Rate limiting for API endpoints ────────────────────────────────
	 * Applies to all /api/ routes including auth endpoints. */
	if (path.startsWith('/api/')) {
		const ip = event.getClientAddress();
		if (isRateLimited(ip)) {
			console.warn(
				`[RATE LIMIT] IP ${ip} exceeded ${RATE_LIMIT_MAX_REQUESTS} requests/min on ${path}`
			);
			return new Response(JSON.stringify({ error: 'Too many requests. Please slow down.' }), {
				status: 429,
				headers: {
					'Content-Type': 'application/json',
					'Retry-After': '60'
				}
			});
		}
	}

	/* ── Session hydration ──────────────────────────────────────────────
	 * Decrypt the session cookie and attach to locals so downstream handlers
	 * can access the user's tokens without re-parsing.
	 * If the access token has expired, silently refresh it using the refresh
	 * token and update the cookie so subsequent requests use the fresh token. */
	if (cookie) {
		let session = decryptSession(cookie);

		if (session) {
			const isExpired = Date.now() > session.expiresAt;

			if (isExpired && session.refreshToken) {
				try {
					const refreshed = await refreshAccessToken(session.refreshToken);
					session = {
						...session,
						accessToken: refreshed.access_token,
						expiresAt: Date.now() + refreshed.expires_in * 1000
					};
					/* Write the updated session cookie so the browser stores the fresh token */
					const isSecure = PUBLIC_APP_URL().startsWith('https://');
					event.cookies.set(SESSION_COOKIE_NAME, encryptSession(session), {
						path: '/',
						httpOnly: true,
						secure: isSecure,
						sameSite: 'lax',
						maxAge: 60 * 60 * 24 * 30 // 30 days
					});
				} catch (err) {
					console.error('[HOOKS] Token refresh FAILED, clearing session:', err);
					session = null;
					event.locals.session = null;
					event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
				}
			}

			if (session) {
				event.locals.session = {
					accessToken: session.accessToken,
					refreshToken: session.refreshToken,
					expiresAt: session.expiresAt
				};
			}
		} else {
			event.locals.session = null;
			event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
		}
	} else {
		event.locals.session = null;
	}

	return await resolve(event);
};
