import type { ShortsConfig } from '$lib/types';

const DEFAULT_CONFIG: ShortsConfig = {
	maxDurationSeconds: 60,
	keywords: ['#shorts', 'shorts', 'ytshorts', '#short']
};

let config = { ...DEFAULT_CONFIG };

export function parseDuration(iso8601: string): number {
	if (!iso8601) return 0;
	const match = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
	if (!match) return 0;
	const hours = parseInt(match[1] || '0', 10);
	const minutes = parseInt(match[2] || '0', 10);
	const seconds = parseInt(match[3] || '0', 10);
	return hours * 3600 + minutes * 60 + seconds;
}

export interface ShortDetection {
	isShort: boolean;
	reason?: string;
}

export function detectShort(
	durationSeconds: number,
	title: string,
	description: string,
	tags?: string[]
): ShortDetection {
	// Check duration
	if (durationSeconds > 0 && durationSeconds <= config.maxDurationSeconds) {
		// Also check if it matches keyword patterns (duration alone for very short videos is a strong signal)
		const hasKeyword = checkKeywords(title, description, tags);
		if (hasKeyword.match) {
			return {
				isShort: true,
				reason: `duration=${durationSeconds}s + keyword="${hasKeyword.keyword}"`
			};
		}
		// Duration alone: treat as short if <= 60s
		if (durationSeconds <= 60) {
			return { isShort: true, reason: `duration=${durationSeconds}s (<=60s)` };
		}
	}

	// Check keywords even if duration is longer (some misclassified shorts)
	if (durationSeconds <= config.maxDurationSeconds) {
		const hasKeyword = checkKeywords(title, description, tags);
		if (hasKeyword.match) {
			return {
				isShort: true,
				reason: `keyword="${hasKeyword.keyword}" + duration=${durationSeconds}s`
			};
		}
	}

	// Pure keyword match for videos with duration 0 (missing data)
	if (durationSeconds === 0) {
		const hasKeyword = checkKeywords(title, description, tags);
		if (hasKeyword.match) {
			return { isShort: true, reason: `keyword="${hasKeyword.keyword}" (duration unknown)` };
		}
	}

	return { isShort: false };
}

function checkKeywords(
	title: string,
	description: string,
	tags?: string[]
): { match: boolean; keyword?: string } {
	const lowerTitle = title.toLowerCase();
	const lowerDesc = description.toLowerCase();

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
