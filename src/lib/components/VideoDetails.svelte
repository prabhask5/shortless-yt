<script lang="ts">
	let {
		title,
		viewCount,
		publishedAt,
		channelId,
		channelTitle,
		channelAvatarUrl,
		subscriberCount,
		description,
		likeCount
	}: {
		title: string;
		viewCount: string;
		publishedAt: string;
		channelId: string;
		channelTitle: string;
		channelAvatarUrl?: string;
		subscriberCount?: string;
		description: string;
		likeCount?: string;
	} = $props();

	let expanded = $state(false);

	function formatNumber(count: string): string {
		const n = parseInt(count);
		if (isNaN(n)) return count;
		if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
		return `${n}`;
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function formatTimeAgo(dateStr: string): string {
		const now = Date.now();
		const then = new Date(dateStr).getTime();
		const seconds = Math.floor((now - then) / 1000);
		if (seconds < 60) return 'just now';
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
		const days = Math.floor(hours / 24);
		if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
		const weeks = Math.floor(days / 7);
		if (weeks < 4) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
		const months = Math.floor(days / 30);
		if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
		const years = Math.floor(days / 365);
		return `${years} year${years !== 1 ? 's' : ''} ago`;
	}

	let formattedViews = $derived(formatNumber(viewCount));
	let formattedDate = $derived(formatDate(publishedAt));
	let timeAgo = $derived(formatTimeAgo(publishedAt));
	let formattedLikes = $derived(likeCount ? formatNumber(likeCount) : null);
	let formattedSubs = $derived(subscriberCount ? formatNumber(subscriberCount) : null);
</script>

<div class="flex flex-col gap-3 py-3">
	<!-- Title -->
	<h1 class="text-yt-text text-lg font-semibold md:text-xl">
		{title}
	</h1>

	<!-- Stats row -->
	<div class="text-yt-text-secondary flex flex-wrap items-center gap-2 text-sm">
		<span>{formattedViews} views</span>
		<span>&middot;</span>
		<span title={formattedDate}>{timeAgo}</span>
		{#if formattedLikes}
			<span>&middot;</span>
			<span class="flex items-center gap-1">
				<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
					<path
						d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 2 7.59 8.59C7.22 8.95 7 9.45 7 10v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"
					/>
				</svg>
				{formattedLikes}
			</span>
		{/if}
	</div>

	<!-- Channel info -->
	<div class="flex items-center gap-3 py-2">
		<a href="/channel/{channelId}" class="shrink-0">
			{#if channelAvatarUrl}
				<img
					src={channelAvatarUrl}
					alt={channelTitle}
					class="h-10 w-10 rounded-full"
					loading="lazy"
				/>
			{:else}
				<div
					class="bg-yt-surface text-yt-text flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium"
				>
					{channelTitle.charAt(0).toUpperCase()}
				</div>
			{/if}
		</a>

		<div class="min-w-0 flex-1">
			<a
				href="/channel/{channelId}"
				class="text-yt-text block truncate text-sm font-medium hover:underline"
			>
				{channelTitle}
			</a>
			{#if formattedSubs}
				<span class="text-yt-text-secondary text-xs">{formattedSubs} subscribers</span>
			{/if}
		</div>
	</div>

	<!-- Description -->
	{#if description}
		<div
			class="bg-yt-surface text-yt-text rounded-xl p-3 text-sm"
			role="region"
			aria-label="Video description"
		>
			<div class={expanded ? '' : 'line-clamp-3'}>
				<p class="break-words whitespace-pre-wrap">{description}</p>
			</div>
			<button
				onclick={() => (expanded = !expanded)}
				class="text-yt-text-secondary hover:text-yt-text mt-2 text-xs font-medium"
			>
				{expanded ? 'Show less' : 'Show more'}
			</button>
		</div>
	{/if}
</div>
