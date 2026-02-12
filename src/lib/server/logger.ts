/**
 * Structured Logging Module
 *
 * Provides leveled, structured logging for the server-side application.
 * All log output goes to stdout via `console.log` in a consistent format:
 *
 *   [ISO-timestamp] LEVEL message { ...structured data }
 *
 * In production, only the log line is printed (no data objects) to keep
 * log volume manageable. In development, structured data objects are
 * printed alongside the message for debugging convenience.
 *
 * Specialized loggers (`logApiCall`, `logShortsFilter`, `logAuthEvent`)
 * standardize the shape of frequently-logged events so log aggregation
 * and searching is consistent.
 *
 * @module server/logger
 */

/** Whether the app is running in development mode (enables verbose logging). */
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Shape of a structured log entry.
 *
 * @property {'info' | 'warn' | 'error' | 'debug'} level - Severity level
 * @property {string} message - Human-readable log message
 * @property {Record<string, unknown>} [data] - Optional structured context (only printed in dev)
 * @property {string} timestamp - ISO 8601 timestamp of when the event occurred
 */
interface LogEntry {
	level: 'info' | 'warn' | 'error' | 'debug';
	message: string;
	data?: Record<string, unknown>;
	timestamp: string;
}

/**
 * Core log writer. Formats and prints a log entry to stdout.
 * In dev mode, appends the structured data object for inspection.
 * In production, only the formatted log line is printed.
 *
 * @param {LogEntry} entry - The structured log entry to write
 */
function log(entry: LogEntry): void {
	const line = `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.message}`;
	if (entry.data && isDev) {
		console.log(line, entry.data);
	} else {
		console.log(line);
	}
}

/**
 * Logs an informational message. Used for general operational events
 * (cache hits, API calls, successful operations).
 *
 * @param {string} message - The log message
 * @param {Record<string, unknown>} [data] - Optional structured context
 */
export function logInfo(message: string, data?: Record<string, unknown>): void {
	log({ level: 'info', message, data, timestamp: new Date().toISOString() });
}

/**
 * Logs a warning. Used for recoverable issues that deserve attention
 * (e.g. rate limit approaching, token refresh failures that fall back gracefully).
 *
 * @param {string} message - The warning message
 * @param {Record<string, unknown>} [data] - Optional structured context
 */
export function logWarn(message: string, data?: Record<string, unknown>): void {
	log({ level: 'warn', message, data, timestamp: new Date().toISOString() });
}

/**
 * Logs an error. Used for unexpected failures (YouTube API errors,
 * auth failures, unhandled exceptions).
 *
 * @param {string} message - The error message
 * @param {Record<string, unknown>} [data] - Optional structured context (e.g. error stack, endpoint)
 */
export function logError(message: string, data?: Record<string, unknown>): void {
	log({ level: 'error', message, data, timestamp: new Date().toISOString() });
}

/**
 * Logs a debug message. Only emitted in development mode — completely
 * silent in production to avoid log noise.
 *
 * @param {string} message - The debug message
 * @param {Record<string, unknown>} [data] - Optional structured context
 */
export function logDebug(message: string, data?: Record<string, unknown>): void {
	if (isDev) {
		log({ level: 'debug', message, data, timestamp: new Date().toISOString() });
	}
}

// ─── Specialized Loggers ────────────────────────────────────────────

/**
 * Logs a YouTube API call with its parameters and cache status.
 * Called by youtube-api.ts for every API interaction to enable
 * quota usage tracking and cache hit-rate monitoring.
 *
 * @param {string} endpoint - The YouTube API endpoint (e.g. "search.list", "videos.list")
 * @param {Record<string, string>} params - Query parameters sent to the API
 * @param {boolean} cacheHit - Whether the response was served from the in-memory cache
 */
export function logApiCall(
	endpoint: string,
	params: Record<string, string>,
	cacheHit: boolean
): void {
	logInfo(`API call: ${endpoint}`, { ...params, cacheHit });
}

/**
 * Logs Shorts filtering statistics for a single request.
 * Useful for monitoring false-positive rates and backfill frequency.
 *
 * @param {number} filteredCount - How many videos were classified as Shorts and removed
 * @param {number} totalCount - Total videos evaluated before filtering
 * @param {number} backfillPages - Number of additional API pages fetched to compensate for filtered results
 */
export function logShortsFilter(
	filteredCount: number,
	totalCount: number,
	backfillPages: number
): void {
	logInfo('Shorts filter stats', { filteredCount, totalCount, backfillPages });
}

/**
 * Logs an authentication lifecycle event (login, logout, token refresh, etc.).
 *
 * @param {string} event - The auth event name (e.g. "login", "token_refresh", "logout")
 * @param {boolean} success - Whether the operation completed successfully
 */
export function logAuthEvent(event: string, success: boolean): void {
	logInfo(`Auth: ${event}`, { success });
}
