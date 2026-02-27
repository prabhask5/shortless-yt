/**
 * @fileoverview SvelteKit server hook for session management, rate limiting, and security headers.
 *
 * This hook runs on every incoming server request before any route handler or
 * load function executes. It handles three concerns:
 *
 * **1. Session hydration:**
 * Reads and validates the encrypted session cookie, attaching the decoded
 * token data to `event.locals.session` so downstream handlers can check
 * authentication without re-parsing the cookie themselves. Supports both
 * AES-256-GCM (current) and legacy HMAC (migration) session formats.
 *
 * **2. API rate limiting:**
 * Protects the YouTube API quota (10,000 units/day) by rate-limiting requests
 * to `/api/` endpoints. Uses a per-IP sliding window counter stored in memory.
 * On Vercel serverless, each function instance maintains its own counter — this
 * is imperfect but still effective because popular routes hit the same warm
 * instance and it blocks the most common abuse pattern (scripted rapid requests).
 *
 * **3. Content Security Policy (CSP):**
 * Sets CSP headers on page responses (not API responses) to restrict resource
 * loading. This mitigates XSS impact by preventing unauthorized script execution
 * and data exfiltration even if a vulnerability is introduced in the future.
 */

import type { Handle } from '@sveltejs/kit';
import { decryptSession, SESSION_COOKIE_NAME } from '$lib/server/auth';

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
	let evicted = 0;
	for (const [ip, entry] of rateLimitMap) {
		if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
			rateLimitMap.delete(ip);
			evicted++;
		}
	}
	if (evicted > 0) {
		console.log(
			`[RATE LIMIT] Cleanup evicted ${evicted} stale entries, ${rateLimitMap.size} remaining`
		);
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
// Content Security Policy
// ===================================================================

/**
 * CSP directives for page responses.
 *
 * - `default-src 'self'`: only load resources from our own origin by default.
 * - `script-src 'self' 'unsafe-inline'`: allow our own scripts and SvelteKit's
 *   inline hydration scripts. `'unsafe-inline'` is needed because SvelteKit
 *   injects inline `<script>` tags for data hydration.
 * - `style-src 'self' 'unsafe-inline'`: Tailwind generates stylesheet files,
 *   but Svelte may inject inline styles for transitions/animations.
 * - `img-src`: allow images from our origin plus YouTube's CDN domains (video
 *   thumbnails, channel avatars, comment author avatars).
 * - `frame-src`: only allow YouTube embeds (the video player iframe).
 * - `connect-src 'self'`: restrict fetch/XHR to our own origin (all YouTube
 *   API calls are proxied through our server endpoints).
 * - `font-src 'self'`: only load fonts from our own origin.
 * - `worker-src 'self'`: allow the PWA service worker.
 */
const CSP_DIRECTIVES = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' https://*.ytimg.com https://*.ggpht.com https://*.googleusercontent.com data:",
	'frame-src https://www.youtube.com',
	"connect-src 'self'",
	"font-src 'self'",
	"worker-src 'self'"
].join('; ');

// ===================================================================
// Main hook
// ===================================================================

export const handle: Handle = async ({ event, resolve }) => {
	const cookie = event.cookies.get(SESSION_COOKIE_NAME);
	const path = event.url.pathname;

	console.log(
		`[HOOKS] Incoming request: ${event.request.method} ${path}, cookie present: ${!!cookie}`
	);

	/* ── Rate limiting for API endpoints ────────────────────────────────
	 * Only applies to /api/ routes (comments pagination, autocomplete proxy).
	 * Auth endpoints (/api/auth/*) are excluded because they are user-initiated
	 * one-shot actions, not repeatable data queries. */
	if (path.startsWith('/api/') && !path.startsWith('/api/auth/')) {
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
	 * can access the user's tokens without re-parsing. */
	if (cookie) {
		const session = decryptSession(cookie);

		if (session) {
			const isExpired = Date.now() > session.expiresAt;
			console.log(
				`[HOOKS] Session valid, accessToken ends: ...${session.accessToken.slice(-6)}, expired: ${isExpired}, expiresAt: ${new Date(session.expiresAt).toISOString()}`
			);
			event.locals.session = {
				accessToken: session.accessToken,
				refreshToken: session.refreshToken,
				expiresAt: session.expiresAt
			};
		} else {
			console.warn(
				`[HOOKS] Session cookie INVALID (decryption failed or structural validation failed) — deleting cookie`
			);
			event.locals.session = null;
			event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
		}
	} else {
		console.log(`[HOOKS] No session cookie — unauthenticated request`);
		event.locals.session = null;
	}

	const response = await resolve(event);

	/* ── CSP headers ────────────────────────────────────────────────────
	 * Only set on page responses (HTML), not API endpoints (JSON).
	 * API responses don't render in a browser context, so CSP is irrelevant. */
	if (!path.startsWith('/api/')) {
		response.headers.set('Content-Security-Policy', CSP_DIRECTIVES);
	}

	return response;
};
