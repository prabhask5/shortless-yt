<script lang="ts">
	import { goto } from '$app/navigation';
	import { searchHistory, clearHistory } from '$lib/stores/search-history';
	import { page } from '$app/stores';

	let authError = $derived($page.url.searchParams.get('auth_error'));

	function handleSearchClick(query: string) {
		goto(`/results?q=${encodeURIComponent(query)}`);
	}
</script>

<svelte:head>
	<title>Shortless - YouTube without Shorts</title>
</svelte:head>

<div class="home-page">
	{#if authError}
		<div class="auth-error">
			<p>Sign-in failed: {authError}</p>
			<a href="/" class="btn btn-secondary">Dismiss</a>
		</div>
	{/if}

	<div class="hero">
		<div class="hero-icon">
			<svg viewBox="0 0 105 20" width="210" height="40">
				<rect x="0" y="2" width="28" height="16" rx="4" fill="#ff0000" />
				<polygon points="11,6 11,14 19,10" fill="white" />
				<text
					x="32"
					y="15"
					font-size="14"
					font-weight="700"
					fill="currentColor"
					font-family="Roboto, sans-serif">Shortless</text
				>
			</svg>
		</div>
		<p class="hero-subtitle">YouTube without the Shorts</p>
	</div>

	{#if $searchHistory.length > 0}
		<div class="recent-section">
			<div class="recent-header">
				<h2 class="recent-title">Recent searches</h2>
				<button class="clear-btn" onclick={clearHistory}>Clear all</button>
			</div>
			<div class="recent-chips">
				{#each $searchHistory.slice(0, 10) as item (item)}
					<button class="chip" onclick={() => handleSearchClick(item)}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
							<path
								d="M13 3a9 9 0 00-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21a9 9 0 000-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"
							/>
						</svg>
						{item}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="features">
		<div class="feature-card">
			<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
				<path
					d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
				/>
			</svg>
			<h3>Search</h3>
			<p>Find videos without Shorts cluttering your results</p>
		</div>
		<div class="feature-card">
			<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
				<path d="M8 5v14l11-7z" />
			</svg>
			<h3>Watch</h3>
			<p>Full video playback with related videos and comments</p>
		</div>
		<div class="feature-card">
			<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
				<path
					d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31A7.902 7.902 0 0112 20zm6.31-3.1L7.1 5.69A7.902 7.902 0 0112 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"
				/>
			</svg>
			<h3>No Shorts</h3>
			<p>Shorts are automatically detected and filtered out everywhere</p>
		</div>
	</div>
</div>

<style>
	.home-page {
		max-width: 800px;
		margin: 0 auto;
		padding: 40px 0;
	}

	.auth-error {
		background: rgba(204, 0, 0, 0.1);
		border: 1px solid var(--red-text);
		border-radius: 8px;
		padding: 12px 16px;
		margin-bottom: 24px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		color: var(--red-text);
		font-size: 14px;
	}

	.hero {
		text-align: center;
		padding: 48px 0 32px;
	}

	.hero-icon {
		margin-bottom: 16px;
		color: var(--text-primary);
	}

	.hero-subtitle {
		font-size: 18px;
		color: var(--text-secondary);
	}

	.recent-section {
		margin-bottom: 48px;
	}

	.recent-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}

	.recent-title {
		font-size: 16px;
		font-weight: 600;
	}

	.clear-btn {
		font-size: 13px;
		color: var(--text-link);
		padding: 4px 8px;
	}

	.clear-btn:hover {
		text-decoration: underline;
	}

	.recent-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		background: var(--bg-chip);
		border-radius: 18px;
		font-size: 14px;
		color: var(--text-primary);
		min-height: 36px;
		transition: background-color 0.15s;
	}

	.chip:hover {
		background: var(--bg-tertiary);
	}

	.features {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
	}

	.feature-card {
		background: var(--bg-secondary);
		border-radius: 12px;
		padding: 24px;
		text-align: center;
	}

	.feature-card svg {
		color: var(--text-tertiary);
		margin-bottom: 12px;
	}

	.feature-card h3 {
		font-size: 16px;
		font-weight: 600;
		margin-bottom: 8px;
	}

	.feature-card p {
		font-size: 13px;
		color: var(--text-secondary);
		line-height: 1.5;
	}

	@media (max-width: 768px) {
		.home-page {
			padding: 24px 0;
		}

		.hero {
			padding: 24px 0 16px;
		}

		.features {
			grid-template-columns: 1fr;
		}
	}
</style>
