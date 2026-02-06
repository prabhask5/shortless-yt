<script lang="ts">
	import { searchHistory } from '$lib/stores/search-history';

	interface Props {
		onSearch: (query: string) => void;
		initialValue?: string;
	}

	let { onSearch, initialValue = '' }: Props = $props();

	// eslint-disable-next-line svelte/prefer-writable-derived -- query must be writable (user input) while also syncing from prop
	let query = $state('');
	let showSuggestions = $state(false);
	let inputEl: HTMLInputElement | undefined = $state();

	$effect(() => {
		query = initialValue;
	});

	function handleSubmit(e: Event) {
		e.preventDefault();
		if (query.trim()) {
			onSearch(query.trim());
			showSuggestions = false;
			inputEl?.blur();
		}
	}

	function handleClear() {
		query = '';
		inputEl?.focus();
	}

	function handleSuggestionClick(item: string) {
		query = item;
		onSearch(item);
		showSuggestions = false;
	}

	function handleFocus() {
		if ($searchHistory.length > 0) {
			showSuggestions = true;
		}
	}

	function handleBlur() {
		// Delay to allow click on suggestion
		setTimeout(() => {
			showSuggestions = false;
		}, 200);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			showSuggestions = false;
			inputEl?.blur();
		}
	}
</script>

<form class="search-form" onsubmit={handleSubmit} role="search">
	<div class="search-input-wrapper">
		<input
			bind:this={inputEl}
			bind:value={query}
			type="text"
			placeholder="Search"
			class="search-input"
			onfocus={handleFocus}
			onblur={handleBlur}
			onkeydown={handleKeydown}
			aria-label="Search"
			enterkeyhint="search"
			autocomplete="off"
			spellcheck="false"
		/>
		{#if query}
			<button
				type="button"
				class="clear-btn btn-icon"
				onclick={handleClear}
				aria-label="Clear search"
			>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
					<path
						d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
					/>
				</svg>
			</button>
		{/if}
	</div>
	<button type="submit" class="search-btn" aria-label="Search">
		<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
			<path
				d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
			/>
		</svg>
	</button>

	{#if showSuggestions && $searchHistory.length > 0}
		<div class="suggestions">
			{#each $searchHistory.slice(0, 8) as item (item)}
				<button
					type="button"
					class="suggestion-item"
					onmousedown={() => handleSuggestionClick(item)}
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="history-icon">
						<path
							d="M13 3a9 9 0 00-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21a9 9 0 000-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"
						/>
					</svg>
					<span class="truncate">{item}</span>
				</button>
			{/each}
		</div>
	{/if}
</form>

<style>
	.search-form {
		display: flex;
		align-items: center;
		position: relative;
		width: 100%;
	}

	.search-input-wrapper {
		flex: 1;
		display: flex;
		align-items: center;
		background: var(--input-bg);
		border: 1px solid var(--input-border);
		border-radius: 40px 0 0 40px;
		height: 40px;
		padding: 0 4px 0 16px;
		position: relative;
	}

	.search-input-wrapper:focus-within {
		border-color: var(--input-focus-border);
	}

	.search-input {
		flex: 1;
		background: none;
		border: none;
		outline: none;
		color: var(--text-primary);
		font-size: 16px;
		height: 100%;
		padding: 0;
		min-width: 0;
	}

	.search-input::placeholder {
		color: var(--text-tertiary);
	}

	.clear-btn {
		width: 32px;
		height: 32px;
		min-height: 32px;
		flex-shrink: 0;
		color: var(--text-secondary);
	}

	.search-btn {
		height: 40px;
		width: 64px;
		border: 1px solid var(--input-border);
		border-left: none;
		border-radius: 0 40px 40px 0;
		background: var(--bg-secondary);
		color: var(--text-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.search-btn:hover {
		background: var(--bg-tertiary);
	}

	.suggestions {
		position: absolute;
		top: 44px;
		left: 0;
		right: 64px;
		background: var(--modal-bg);
		border-radius: 12px;
		box-shadow: var(--shadow-lg);
		border: 1px solid var(--border-color);
		padding: 8px 0;
		z-index: 200;
		max-height: 400px;
		overflow-y: auto;
	}

	.suggestion-item {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 8px 16px;
		font-size: 14px;
		text-align: left;
		min-height: 40px;
		color: var(--text-primary);
	}

	.suggestion-item:hover {
		background: var(--bg-hover);
	}

	.history-icon {
		flex-shrink: 0;
		color: var(--text-secondary);
	}

	@media (max-width: 600px) {
		.search-btn {
			width: 48px;
		}
	}
</style>
