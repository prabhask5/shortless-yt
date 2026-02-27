<script lang="ts">
	import '../app.css';
	import Header from '$lib/components/Header.svelte';
	import { authState } from '$lib/stores/auth';
	import { page } from '$app/stores';

	let { children } = $props();

	let query = $derived($page.url.searchParams.get('q') ?? '');

	$effect(() => {
		const data = $page.data;
		if (data.user) {
			authState.set({
				user: { avatarUrl: data.user.avatarUrl, channelTitle: data.user.channelTitle },
				isLoading: false
			});
		} else {
			authState.set({ user: null, isLoading: false });
		}
	});
</script>

<div class="bg-yt-bg text-yt-text flex min-h-screen flex-col">
	<Header user={$authState.user} {query} />
	<main class="flex-1">
		{@render children()}
	</main>
</div>
