<!--
	@component Home Page

	Renders the main landing page with two distinct layouts depending on
	whether the user is authenticated:
	- Authenticated: shows subscriptions bar + recent videos from subscribed channels.
	- Anonymous: shows category filter chips + trending videos with infinite scroll.

	Uses SvelteKit streaming for instant page load with YouTube-style skeletons.
-->
<script lang="ts">
	import VideoCard from '$lib/components/VideoCard.svelte';
	import VirtualFeed from '$lib/components/VirtualFeed.svelte';
	import ChannelBar from '$lib/components/ChannelBar.svelte';
	import CategoryChips from '$lib/components/CategoryChips.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { useColumns } from '$lib/stores/columns.svelte';
	import { goto } from '$app/navigation';
	import type { VideoItem } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let selectedCategory = $derived(
		'selectedCategory' in data ? (data.selectedCategory as string) : '0'
	);

	const cols = useColumns();

	/** Maximum client-side pagination retries when all results are filtered out */
	const MAX_CLIENT_PAGES = 6;

	/* ── Anon trending: infinite scroll state ── */
	let trendingItems = $state<VideoItem[]>([]);
	let trendingNextToken = $state<string | undefined>(undefined);
	let trendingLoading = $state(false);

	/* Track which data promise we're subscribed to, to prevent stale callbacks */
	let trendingGeneration = 0;

	$effect(() => {
		if (!data.authenticated && 'streamed' in data && data.streamed.anonData) {
			const gen = ++trendingGeneration;
			data.streamed.anonData.then((anonData) => {
				if (gen !== trendingGeneration) return;
				trendingItems = anonData.trending ?? [];
				trendingNextToken = anonData.nextPageToken;
			});
		}
	});

	async function loadMoreTrending() {
		if (!trendingNextToken || trendingLoading) return;
		trendingLoading = true;
		try {
			let token: string | undefined = trendingNextToken;
			for (let page = 0; page < MAX_CLIENT_PAGES && token; page++) {
				let url = `/api/videos?source=trending&pageToken=${encodeURIComponent(token)}`;
				if (selectedCategory !== '0') url += `&categoryId=${encodeURIComponent(selectedCategory)}`;
				const res: Response = await fetch(url);
				if (!res.ok) break;
				const json: { items: VideoItem[]; nextPageToken?: string } = await res.json();
				if (json.items.length > 0) {
					trendingItems.push(...json.items);
				}
				token = json.nextPageToken;
				if (json.items.length > 0) break;
			}
			trendingNextToken = token;
		} finally {
			trendingLoading = false;
		}
	}

	/* ── Auth feed: infinite scroll via k-way merge cursor ── */
	let authFeed = $state<VideoItem[]>([]);
	let subFeedCursor = $state<unknown>(undefined);
	let authFeedLoading = $state(false);

	let authGeneration = 0;

	$effect(() => {
		if (data.authenticated && 'streamed' in data && data.streamed.authData) {
			const gen = ++authGeneration;
			data.streamed.authData.then((authData) => {
				if (gen !== authGeneration) return;
				authFeed = authData.feed ?? [];
				subFeedCursor = authData.cursor;
			});
		}
	});

	async function loadMoreAuthFeed() {
		if (!subFeedCursor || authFeedLoading) return;
		authFeedLoading = true;
		try {
			let cursor: unknown = subFeedCursor;
			for (let page = 0; page < MAX_CLIENT_PAGES && cursor; page++) {
				const res: Response = await fetch(
					`/api/videos?source=subfeed&cursor=${encodeURIComponent(JSON.stringify(cursor))}`
				);
				if (!res.ok) break;
				const json: { items: VideoItem[]; cursor?: unknown } = await res.json();
				if (json.items.length > 0) {
					authFeed.push(...json.items);
				}
				cursor = json.cursor;
				if (json.items.length > 0) break;
			}
			subFeedCursor = cursor;
		} finally {
			authFeedLoading = false;
		}
	}

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
				{#if authFeed.length > 0}
					<VirtualFeed
						items={authFeed}
						columns={cols.value}
						gap={16}
						hasMore={!!subFeedCursor}
						loadingMore={authFeedLoading}
						onLoadMore={loadMoreAuthFeed}
					>
						{#snippet children(video)}
							<VideoCard {video} />
						{/snippet}
					</VirtualFeed>
				{:else if !subFeedCursor}
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
				{#if trendingItems.length > 0}
					<VirtualFeed
						items={trendingItems}
						columns={cols.value}
						gap={16}
						hasMore={!!trendingNextToken}
						loadingMore={trendingLoading}
						onLoadMore={loadMoreTrending}
					>
						{#snippet children(video)}
							<VideoCard {video} />
						{/snippet}
					</VirtualFeed>
				{:else if trendingNextToken}
					{@render videoSkeletons()}
				{:else}
					<p class="text-yt-text-secondary py-8 text-center">No trending videos found.</p>
				{/if}
			</section>
		{:catch}
			<p class="text-yt-text-secondary py-8 text-center">Failed to load trending videos.</p>
		{/await}
	{/if}
</div>
