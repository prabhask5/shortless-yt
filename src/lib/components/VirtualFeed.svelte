<script lang="ts" generics="T">
	/**
	 * @fileoverview VirtualFeed component — responsive grid with infinite scroll.
	 * @component
	 *
	 * Renders items in a CSS grid with responsive column count. Uses
	 * IntersectionObserver on a sentinel element to detect when the user
	 * scrolls near the bottom, triggering `onLoadMore` for pagination.
	 *
	 * No virtualization library — plain DOM rendering handles 100+ cards
	 * without issue, and avoids nested-scroll-context problems with
	 * pull-to-refresh and mobile UX.
	 */
	import type { Snippet } from 'svelte';

	let {
		items,
		columns = 1,
		gap = 16,
		children,
		hasMore = false,
		loadingMore = false,
		onLoadMore
	}: {
		items: T[];
		columns?: number;
		gap?: number;
		children: Snippet<[T]>;
		hasMore?: boolean;
		loadingMore?: boolean;
		onLoadMore?: () => void;
	} = $props();

	let sentinelEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (!sentinelEl || !hasMore || !onLoadMore) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && !loadingMore) {
					onLoadMore();
				}
			},
			{ rootMargin: '500px' }
		);
		observer.observe(sentinelEl);
		return () => observer.disconnect();
	});
</script>

<div
	style="display: grid; grid-template-columns: repeat({columns}, minmax(0, 1fr)); gap: {gap}px; width: 100%;"
>
	{#each items as item, i (i)}
		{@render children(item)}
	{/each}
</div>

{#if loadingMore}
	<div class="flex justify-center py-4">
		<div
			class="border-yt-text-secondary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
		></div>
	</div>
{/if}

{#if hasMore && !loadingMore}
	<div bind:this={sentinelEl} aria-hidden="true"></div>
{/if}
