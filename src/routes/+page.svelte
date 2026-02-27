<!--
	@component Home Page

	Renders the main landing page with two distinct layouts depending on
	whether the user is authenticated:
	- Authenticated: shows subscriptions bar + recent videos from subscribed channels.
	- Anonymous: shows category filter chips + trending videos.

	The video grid uses VirtualFeed for efficient rendering of large lists,
	with responsive column counts calculated from the viewport width.
	Pull-to-refresh support (via invalidateAll) lets mobile users swipe down
	to reload the feed data from the server.
-->
<script lang="ts">
	import VideoCard from '$lib/components/VideoCard.svelte';
	import VirtualFeed from '$lib/components/VirtualFeed.svelte';
	import ChannelBar from '$lib/components/ChannelBar.svelte';
	import CategoryChips from '$lib/components/CategoryChips.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import PullToRefresh from '$lib/components/PullToRefresh.svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// '0' maps to the synthetic "All" category chip prepended in the template
	let selectedCategory = $state('0');

	let columns = $state(1);

	/* Responsive column calculation: listens to window resize and maps
	 * breakpoints to column counts. The effect cleanup removes the listener
	 * to avoid leaks when this component is destroyed. */
	$effect(() => {
		function updateColumns() {
			const w = window.innerWidth;
			if (w >= 1280) columns = 4;
			else if (w >= 1024) columns = 3;
			else if (w >= 640) columns = 2;
			else columns = 1;
		}
		updateColumns();
		window.addEventListener('resize', updateColumns);
		return () => window.removeEventListener('resize', updateColumns);
	});

	async function handleCategoryChange(categoryId: string) {
		selectedCategory = categoryId;
		// Category filtering happens via re-fetch - for now show all trending
	}
</script>

<svelte:head>
	<title>Shortless YouTube</title>
	<meta name="description" content="YouTube without Shorts" />
</svelte:head>

<!-- Pull-to-refresh wraps the entire page; triggers a full server reload -->
<PullToRefresh onRefresh={() => invalidateAll()}>
	<div class="mx-auto max-w-screen-2xl px-4 py-4">
		<!-- Conditional rendering: auth users get subscriptions, anon users get category chips -->
		{#if data.authenticated && 'subscriptions' in data}
			{#if data.subscriptions && data.subscriptions.length > 0}
				<section class="mb-6">
					<h2 class="mb-3 text-lg font-medium">Subscriptions</h2>
					<ChannelBar
						channels={data.subscriptions.map((s) => ({
							id: s.id,
							title: s.title,
							thumbnailUrl: s.thumbnailUrl
						}))}
					/>
				</section>
			{/if}
		{:else if 'categories' in data && data.categories}
			<section class="mb-4">
				<CategoryChips
					categories={[{ id: '0', title: 'All' }, ...data.categories]}
					selected={selectedCategory}
					onChange={handleCategoryChange}
				/>
			</section>
		{/if}

		<!-- Video grid: subscription feed for auth users, trending for anon users -->
		<section>
			{#if data.authenticated && 'feed' in data}
				{#if data.feed && data.feed.length > 0}
					<VirtualFeed
						items={data.feed}
						{columns}
						estimateRowHeight={columns === 1 ? 300 : 280}
						gap={16}
					>
						{#snippet children(video)}
							<VideoCard {video} />
						{/snippet}
					</VirtualFeed>
				{:else}
					<p class="text-yt-text-secondary py-8 text-center">
						No recent videos from your subscriptions.
					</p>
				{/if}
			{:else if 'trending' in data && data.trending && data.trending.length > 0}
				<VirtualFeed
					items={data.trending}
					{columns}
					estimateRowHeight={columns === 1 ? 300 : 280}
					gap={16}
				>
					{#snippet children(video)}
						<VideoCard {video} />
					{/snippet}
				</VirtualFeed>
			{:else}
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{#each Array(12) as _unused, i (i)}
						<Skeleton variant="video-card" />
					{/each}
				</div>
			{/if}
		</section>
	</div>
</PullToRefresh>
