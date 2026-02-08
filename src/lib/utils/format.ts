export function formatViewCount(count: string | number): string {
	const num = typeof count === 'string' ? parseInt(count, 10) : count;
	if (isNaN(num)) return '0 views';
	if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B views`;
	if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M views`;
	if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K views`;
	return `${num} views`;
}

export function formatDuration(iso8601: string): string {
	if (!iso8601) return '';
	const match = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
	if (!match) return '';
	const hours = parseInt(match[1] || '0', 10);
	const minutes = parseInt(match[2] || '0', 10);
	const seconds = parseInt(match[3] || '0', 10);

	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
	}
	return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatRelativeTime(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
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

export function formatLikeCount(count: number | string): string {
	const num = typeof count === 'string' ? parseInt(count, 10) : count;
	if (isNaN(num) || num === 0) return '';
	if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
	if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
	return num.toString();
}

export function formatDate(dateString: string): string {
	return new Date(dateString).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

export function formatSubscriberCount(count: string | number): string {
	const num = typeof count === 'string' ? parseInt(count, 10) : count;
	if (isNaN(num)) return '0 subscribers';
	if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B subscribers`;
	if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M subscribers`;
	if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K subscribers`;
	return `${num} subscribers`;
}

export function decodeEntities(text: string): string {
	return text
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/&#x27;/g, "'");
}
