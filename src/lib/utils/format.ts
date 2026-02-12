/**
 * Display Formatting Utilities
 *
 * Pure functions for converting raw YouTube API values (counts, durations,
 * timestamps, HTML entities) into human-readable display strings that match
 * YouTube's own formatting conventions.
 *
 * Used by VideoCard, VideoMeta, CommentItem, ChannelCard, and other
 * UI components that render video/channel metadata.
 *
 * @module utils/format
 */

/**
 * Formats a view count into a compact human-readable string.
 * Mirrors YouTube's display format (e.g. "1.2M views", "453K views").
 *
 * @param {string | number} count - Raw view count from the YouTube API (may be a string or number)
 * @returns {string} Formatted view count with "views" suffix (e.g. "1.2M views", "53 views")
 *
 * @example
 * formatViewCount(1_234_567)  // "1.2M views"
 * formatViewCount("53000")    // "53.0K views"
 * formatViewCount("invalid")  // "0 views"
 */
export function formatViewCount(count: string | number): string {
	const num = typeof count === 'string' ? parseInt(count, 10) : count;
	if (isNaN(num)) return '0 views';
	// Use B/M/K suffixes with one decimal place for compact display
	if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B views`;
	if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M views`;
	if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K views`;
	return `${num} views`;
}

/**
 * Converts an ISO 8601 duration string into a timestamp-style display string.
 * Used on video thumbnails and player UI to show video length.
 *
 * @param {string} iso8601 - Duration from YouTube's `contentDetails.duration` (e.g. "PT1H2M30S")
 * @returns {string} Formatted duration (e.g. "1:02:30", "4:13", or "" if invalid)
 *
 * @example
 * formatDuration("PT1H2M30S")  // "1:02:30"
 * formatDuration("PT4M13S")    // "4:13"
 * formatDuration("PT45S")      // "0:45"
 */
export function formatDuration(iso8601: string): string {
	if (!iso8601) return '';
	// Match the PT prefix followed by optional hours, minutes, seconds groups
	const match = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
	if (!match) return '';
	const hours = parseInt(match[1] || '0', 10);
	const minutes = parseInt(match[2] || '0', 10);
	const seconds = parseInt(match[3] || '0', 10);

	// Include hours only when present; always zero-pad minutes and seconds
	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
	}
	return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Converts an ISO 8601 date string into a human-friendly relative time string.
 * Mimics YouTube's "3 days ago", "2 months ago" display style. Uses approximate
 * month (30 days) and year (365 days) calculations — exact precision is not
 * needed for a relative display.
 *
 * @param {string} dateString - ISO 8601 date from the YouTube API (e.g. "2024-06-15T10:30:00Z")
 * @returns {string} Relative time string (e.g. "3 days ago", "just now")
 *
 * @example
 * formatRelativeTime("2024-01-01T00:00:00Z")  // "1 year ago" (if current year is 2025)
 */
export function formatRelativeTime(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();

	// Cascade from largest to smallest time unit, returning the first that applies
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHour / 24);
	const diffWeek = Math.floor(diffDay / 7);
	const diffMonth = Math.floor(diffDay / 30);
	const diffYear = Math.floor(diffDay / 365);

	if (diffYear > 0) return `${diffYear} year${diffYear > 1 ? 's' : ''} ago`;
	if (diffMonth > 0) return `${diffMonth} month${diffMonth > 1 ? 's' : ''} ago`;
	if (diffWeek > 0) return `${diffWeek} week${diffWeek > 1 ? 's' : ''} ago`;
	if (diffDay > 0) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
	if (diffHour > 0) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
	if (diffMin > 0) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
	return 'just now';
}

/**
 * Formats a like count into a compact string without a label suffix.
 * Unlike formatViewCount, this returns an empty string for zero/invalid
 * values (YouTube hides like counts when they are zero).
 *
 * @param {number | string} count - Raw like count from the YouTube API
 * @returns {string} Formatted count (e.g. "1.2M", "453", or "" for zero/invalid)
 *
 * @example
 * formatLikeCount(1_500)   // "1.5K"
 * formatLikeCount(0)       // ""
 */
export function formatLikeCount(count: number | string): string {
	const num = typeof count === 'string' ? parseInt(count, 10) : count;
	// Return empty for zero or invalid — YouTube hides the count in this case
	if (isNaN(num) || num === 0) return '';
	if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
	if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
	return num.toString();
}

/**
 * Formats an ISO 8601 date string into a localized absolute date.
 * Used in video descriptions and channel pages where an exact date is more
 * informative than a relative time.
 *
 * @param {string} dateString - ISO 8601 date from the YouTube API
 * @returns {string} Localized date string (e.g. "Jun 15, 2024")
 *
 * @example
 * formatDate("2024-06-15T10:30:00Z")  // "Jun 15, 2024"
 */
export function formatDate(dateString: string): string {
	return new Date(dateString).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

/**
 * Formats a subscriber count into a compact human-readable string.
 * Identical logic to formatViewCount but with "subscribers" suffix.
 * Used on ChannelCard and channel pages.
 *
 * @param {string | number} count - Raw subscriber count from the YouTube API
 * @returns {string} Formatted count with "subscribers" suffix (e.g. "1.2M subscribers")
 *
 * @example
 * formatSubscriberCount(2_300_000)  // "2.3M subscribers"
 */
export function formatSubscriberCount(count: string | number): string {
	const num = typeof count === 'string' ? parseInt(count, 10) : count;
	if (isNaN(num)) return '0 subscribers';
	if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B subscribers`;
	if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M subscribers`;
	if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K subscribers`;
	return `${num} subscribers`;
}

/**
 * Decodes common HTML entities back into their literal characters.
 * YouTube's API returns HTML-encoded text in titles and descriptions
 * (e.g. "&amp;" instead of "&"). This reverses the encoding for display.
 *
 * Only handles the most common entities — a full HTML parser is unnecessary
 * since YouTube consistently uses this small subset.
 *
 * @param {string} text - HTML-encoded text from the YouTube API
 * @returns {string} Decoded plain text
 *
 * @example
 * decodeEntities("Tom &amp; Jerry")     // "Tom & Jerry"
 * decodeEntities("It&#39;s a test")     // "It's a test"
 */
export function decodeEntities(text: string): string {
	return text
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/&#x27;/g, "'");
}
