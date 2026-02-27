<!--
	@component Home Page

	Renders the main landing page with two distinct layouts depending on
	whether the user is authenticated:
	- Authenticated: shows subscriptions bar + recent videos from subscribed channels.
	- Anonymous: shows category filter chips + trending videos.

	Uses SvelteKit streaming for instant page load with YouTube-style skeletons.
-->
<script lang="ts">
	import VideoCard from '$lib/components/VideoCard.svelte';
	import VirtualFeed from '$lib/components/VirtualFeed.svelte';
	import ChannelBar from '$lib/components/ChannelBar.svelte';
	import CategoryChips from '$lib/components/CategoryChips.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import PullToRefresh from '$lib/components/PullToRefresh.svelte';
	import { invalidateAll, goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let selectedCategory = $derived(
		'selectedCategory' in data ? (data.selectedCategory as string) : '0'
	);

	let columns = $state(1);

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

	function handleCategoryChange(categoryId: string) {
		if (categoryId === '0') {
			goto('/');
		} else {
			goto(`/?category=${categoryId}`);
		}
	}
</script>

<svelte:head>
	<title>Shortless YouTube</title>
	<meta name="description" content="YouTube without Shorts" />
</svelte:head>

{#snippet videoSkeletons()}
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
		{#each Array(12) as _unused, i (i)}
			<Skeleton variant="video-card" />
		{/each}
	</div>
{/snippet}

<PullToRefresh onRefresh={() => invalidateAll()}>
	<div class="mx-auto max-w-screen-2xl px-4 py-4">
		{#if data.authenticated && 'streamed' in data && data.streamed.authData}
			{#await data.streamed.authData}
				<!-- Skeleton: subscription bar placeholder + video grid -->
				<section class="mb-6">
					<div class="bg-yt-surface mb-3 h-5 w-32 animate-pulse rounded"></div>
					<div class="flex gap-4 overflow-hidden">
						{#each Array(8) as _unused, i (i)}
							<div class="flex shrink-0 flex-col items-center gap-2">
								<div class="bg-yt-surface h-14 w-14 animate-pulse rounded-full"></div>
								<div class="bg-yt-surface h-3 w-12 animate-pulse rounded"></div>
							</div>
						{/each}
					</div>
				</section>
				<section>
					{@render videoSkeletons()}
				</section>
			{:then authData}
				{#if authData.subscriptions && authData.subscriptions.length > 0}
					<section class="mb-6">
						<h2 class="mb-3 text-lg font-medium">Subscriptions</h2>
						<ChannelBar
							channels={authData.subscriptions.map((s) => ({
								id: s.id,
								title: s.title,
								thumbnailUrl: s.thumbnailUrl
							}))}
						/>
					</section>
				{/if}
				<section>
					{#if authData.feed && authData.feed.length > 0}
						<VirtualFeed
							items={authData.feed}
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
				</section>
			{:catch}
				<p class="text-yt-text-secondary py-8 text-center">Failed to load feed.</p>
			{/await}
		{:else if 'streamed' in data && data.streamed.anonData}
			{#await data.streamed.anonData}
				<!-- Skeleton: chip bar placeholder + video grid -->
				<section class="mb-4">
					<div class="flex gap-2 overflow-hidden">
						{#each Array(6) as _unused, i (i)}
							<div class="bg-yt-surface h-8 w-20 shrink-0 animate-pulse rounded-lg"></div>
						{/each}
					</div>
				</section>
				<section>
					{@render videoSkeletons()}
				</section>
			{:then anonData}
				{#if anonData.categories && anonData.categories.length > 0}
					<section class="mb-4">
						<CategoryChips
							categories={[{ id: '0', title: 'All' }, ...anonData.categories]}
							selected={selectedCategory}
							onChange={handleCategoryChange}
						/>
					</section>
				{/if}
				<section>
					{#if anonData.trending && anonData.trending.length > 0}
						<VirtualFeed
							items={anonData.trending}
							{columns}
							estimateRowHeight={columns === 1 ? 300 : 280}
							gap={16}
						>
							{#snippet children(video)}
								<VideoCard {video} />
							{/snippet}
						</VirtualFeed>
					{:else}
						{@render videoSkeletons()}
					{/if}
				</section>
			{:catch}
				<p class="text-yt-text-secondary py-8 text-center">Failed to load trending videos.</p>
			{/await}
		{/if}
	</div>
</PullToRefresh>
