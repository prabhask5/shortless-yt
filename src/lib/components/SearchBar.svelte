<script lang="ts">
	import { goto } from '$app/navigation';

	let { initialQuery = '' }: { initialQuery?: string } = $props();

	// svelte-ignore state_referenced_locally
	let query = $state(initialQuery);
	let suggestions = $state<string[]>([]);
	let showDropdown = $state(false);
	let selectedIndex = $state(-1);
	let inputEl = $state<HTMLInputElement | null>(null);
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	function handleInput() {
		selectedIndex = -1;
		if (debounceTimer) clearTimeout(debounceTimer);

		if (!query.trim()) {
			suggestions = [];
			showDropdown = false;
			return;
		}

		debounceTimer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/suggest?q=${encodeURIComponent(query)}`);
				if (res.ok) {
					const data = await res.json();
					suggestions = data.suggestions ?? data ?? [];
					showDropdown = suggestions.length > 0;
				}
			} catch {
				suggestions = [];
				showDropdown = false;
			}
		}, 300);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!showDropdown) {
			if (e.key === 'Enter') {
				doSearch();
			}
			return;
		}

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, -1);
				break;
			case 'Enter':
				e.preventDefault();
				if (selectedIndex >= 0) {
					query = suggestions[selectedIndex];
				}
				showDropdown = false;
				doSearch();
				break;
			case 'Escape':
				showDropdown = false;
				selectedIndex = -1;
				break;
		}
	}

	function doSearch() {
		if (query.trim()) {
			showDropdown = false;
			goto(`/search?q=${encodeURIComponent(query.trim())}`);
		}
	}

	function selectSuggestion(suggestion: string) {
		query = suggestion;
		showDropdown = false;
		doSearch();
	}

	function clearQuery() {
		query = '';
		suggestions = [];
		showDropdown = false;
		inputEl?.focus();
	}

	function handleBlur() {
		// Delay to allow click on suggestion
		setTimeout(() => {
			showDropdown = false;
		}, 200);
	}
</script>

<div class="relative w-full max-w-2xl">
	<form
		onsubmit={(e) => {
			e.preventDefault();
			doSearch();
		}}
		class="flex items-center"
	>
		<div class="relative flex flex-1 items-center">
			<input
				bind:this={inputEl}
				bind:value={query}
				oninput={handleInput}
				onkeydown={handleKeydown}
				onfocus={() => {
					if (suggestions.length > 0) showDropdown = true;
				}}
				onblur={handleBlur}
				type="text"
				placeholder="Search"
				class="border-yt-border bg-yt-bg text-yt-text placeholder:text-yt-text-secondary h-10 w-full rounded-l-full border px-4 pr-10 text-sm outline-none focus:border-blue-500"
				aria-label="Search"
				autocomplete="off"
			/>

			{#if query}
				<button
					type="button"
					onclick={clearQuery}
					class="text-yt-text-secondary hover:text-yt-text absolute right-2 flex h-6 w-6 items-center justify-center rounded-full"
					aria-label="Clear search"
				>
					<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
						<path
							d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
						/>
					</svg>
				</button>
			{/if}
		</div>

		<button
			type="submit"
			class="border-yt-border bg-yt-surface text-yt-text-secondary hover:bg-yt-surface-hover flex h-10 items-center justify-center rounded-r-full border border-l-0 px-5"
			aria-label="Search"
		>
			<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
				<path
					d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
				/>
			</svg>
		</button>
	</form>

	<!-- Autocomplete dropdown -->
	{#if showDropdown}
		<ul
			class="border-yt-border bg-yt-surface absolute top-11 z-50 w-full overflow-hidden rounded-xl border shadow-lg"
			role="listbox"
		>
			{#each suggestions as suggestion, i (suggestion)}
				<li role="option" aria-selected={i === selectedIndex}>
					<button
						onmousedown={() => selectSuggestion(suggestion)}
						class="text-yt-text flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors {i ===
						selectedIndex
							? 'bg-yt-surface-hover'
							: 'hover:bg-yt-surface-hover'}"
					>
						<svg
							class="text-yt-text-secondary h-4 w-4 shrink-0"
							fill="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
							/>
						</svg>
						{suggestion}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
