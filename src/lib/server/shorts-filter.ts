/**
 * Shorts Detection & Filtering Module
 *
 * YouTube does not expose a reliable "isShort" flag in its Data API v3,
 * so this module uses a multi-signal heuristic combining video duration
 * and keyword presence (in title, description, and tags) to classify
 * videos as Shorts.
 *
 * Detection tiers (highest to lowest confidence):
 *   1. Short duration (<=60s) + keyword match → strongest signal
 *   2. Short duration alone (<=60s) → still treated as a Short
 *   3. Keyword match with unknown duration (0s) → fallback for missing metadata
 *
 * The detection is intentionally aggressive: the core product goal is to
 * hide Shorts entirely, so false positives are preferred over false negatives.
 *
 * @module shorts-filter
 */

import type { ShortsConfig } from '$lib/types';

/**
 * Default thresholds and keyword list for Shorts detection.
 * The maxDurationSeconds can be overridden in Settings (stored in localStorage).
 */
const DEFAULT_CONFIG: ShortsConfig = {
	maxDurationSeconds: 60,
	keywords: ['#shorts', 'shorts', 'ytshorts', '#short']
};

/** Mutable runtime config — starts as a shallow copy of DEFAULT_CONFIG. */
let config = { ...DEFAULT_CONFIG };

/**
 * Parses an ISO 8601 duration string (e.g. "PT1H2M30S") into total seconds.
 * YouTube's `contentDetails.duration` uses this format.
 *
 * @param {string} iso8601 - An ISO 8601 duration string (e.g. "PT4M13S")
 * @returns {number} The total duration in seconds, or 0 if the input is missing/invalid
 */
export function parseDuration(iso8601: string): number {
	if (!iso8601) return 0;
	// Match the PT prefix followed by optional H, M, S groups
	// e.g. "PT15S" → 15s, "PT1M30S" → 90s, "PT1H" → 3600s
	const match = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
	if (!match) return 0;
	const hours = parseInt(match[1] || '0', 10);
	const minutes = parseInt(match[2] || '0', 10);
	const seconds = parseInt(match[3] || '0', 10);
	return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Result of a Shorts detection check.
 * @property {boolean} isShort - Whether the video was classified as a YouTube Short
 * @property {string} [reason] - Human-readable explanation of why (only when isShort is true)
 */
export interface ShortDetection {
	isShort: boolean;
	reason?: string;
}

/**
 * Determines whether a video is a YouTube Short using a multi-signal heuristic.
 *
 * The detection cascades through three tiers:
 *   1. Short duration + keyword → highest confidence
 *   2. Short duration alone (<=60s) → strong signal even without keywords
 *   3. Keyword with unknown duration → catches Shorts with missing metadata
 *
 * @param {number} durationSeconds - Video length in seconds (0 means unknown)
 * @param {string} title - The video title
 * @param {string} description - The video description
 * @param {string[]} [tags] - Optional array of video tags
 * @returns {ShortDetection} Whether the video is a Short and why
 */
export function detectShort(
	durationSeconds: number,
	title: string,
	description: string,
	tags?: string[]
): ShortDetection {
	// --- Tier 1 & 2: Duration is within the Shorts threshold ---
	if (durationSeconds > 0 && durationSeconds <= config.maxDurationSeconds) {
		// Check if keywords reinforce the duration signal (highest confidence)
		const hasKeyword = checkKeywords(title, description, tags);
		if (hasKeyword.match) {
			return {
				isShort: true,
				reason: `duration=${durationSeconds}s + keyword="${hasKeyword.keyword}"`
			};
		}
		// Even without keywords, <=60s is treated as a Short
		if (durationSeconds <= 60) {
			return { isShort: true, reason: `duration=${durationSeconds}s (<=60s)` };
		}
	}

	// Check keywords for videos within max duration (catches edge cases when
	// maxDurationSeconds is configured higher than 60)
	if (durationSeconds <= config.maxDurationSeconds) {
		const hasKeyword = checkKeywords(title, description, tags);
		if (hasKeyword.match) {
			return {
				isShort: true,
				reason: `keyword="${hasKeyword.keyword}" + duration=${durationSeconds}s`
			};
		}
	}

	// --- Tier 3: Duration unknown (0), rely purely on keywords ---
	// YouTube API sometimes returns 0 for newly uploaded or processing videos
	if (durationSeconds === 0) {
		const hasKeyword = checkKeywords(title, description, tags);
		if (hasKeyword.match) {
			return { isShort: true, reason: `keyword="${hasKeyword.keyword}" (duration unknown)` };
		}
	}

	return { isShort: false };
}

/**
 * Scans video metadata for Shorts-related keywords.
 * All comparisons are case-insensitive. Description is truncated to first 500 chars
 * for performance (Shorts hashtags are almost always at the beginning).
 *
 * @param {string} title - The video title to scan
 * @param {string} description - The video description to scan (first 500 chars only)
 * @param {string[]} [tags] - Optional video tags to scan
 * @returns {{ match: boolean; keyword?: string }} Whether a keyword was found and which one
 */
function checkKeywords(
	title: string,
	description: string,
	tags?: string[]
): { match: boolean; keyword?: string } {
	const lowerTitle = title.toLowerCase();
	const lowerDesc = description.toLowerCase();

	// Check title and description against each configured keyword
	for (const kw of config.keywords) {
		const lowerKw = kw.toLowerCase();
		if (lowerTitle.includes(lowerKw)) {
			return { match: true, keyword: kw };
		}
		// Only check first 500 chars of description for performance
		if (lowerDesc.slice(0, 500).includes(lowerKw)) {
			return { match: true, keyword: kw };
		}
	}

	// Check video tags separately — tags are structured metadata and a reliable signal
	if (tags) {
		for (const tag of tags) {
			const lowerTag = tag.toLowerCase();
			for (const kw of config.keywords) {
				if (lowerTag.includes(kw.toLowerCase())) {
					return { match: true, keyword: `tag:${tag}` };
				}
			}
		}
	}

	return { match: false };
}
