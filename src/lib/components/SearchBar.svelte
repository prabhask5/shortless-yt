<script lang="ts">
	/**
	 * @fileoverview SearchBar component with autocomplete suggestions.
	 * @component
	 *
	 * Provides a YouTube-style search input with a debounced autocomplete dropdown.
	 * As the user types, suggestions are fetched from `/api/suggest` after a 300ms
	 * debounce delay to avoid excessive API calls. The dropdown supports full keyboard
	 * navigation (ArrowUp/Down to highlight, Enter to select, Escape to dismiss).
	 *
	 * Key behavior:
	 * - The dropdown only appears when there are suggestions and the input is focused.
	 * - Selecting a suggestion (via click or Enter) immediately navigates to the search page.
	 * - A clear button (X) resets the input and re-focuses it for quick re-typing.
	 * - Blur hides the dropdown with a 200ms delay so click events on suggestions fire first.
	 */
	import { goto } from '$app/navigation';

	/** @prop initialQuery - Pre-fills the search input, used when returning to a search results page */
	let { initialQuery = '' }: { initialQuery?: string } = $props();

	// svelte-ignore state_referenced_locally
	let query = $state(initialQuery);
	/** Autocomplete suggestions returned from the API */
	let suggestions = $state<string[]>([]);
	/** Whether the autocomplete dropdown is visible */
	let showDropdown = $state(false);
	/** Currently highlighted suggestion index; -1 means none selected (keyboard nav) */
	let selectedIndex = $state(-1);
	/** Reference to the <input> DOM element for programmatic focus */
	let inputEl = $state<HTMLInputElement | null>(null);
	/** Timer handle for the debounce; cleared on each new keystroke */
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Handles each keystroke in the search input.
	 * Resets the keyboard selection, debounces for 300ms, then fetches autocomplete
	 * suggestions from the server. Empty queries immediately clear the dropdown.
	 */
	function handleInput() {
		/* Reset keyboard selection whenever the user types a new character */
		selectedIndex = -1;
		if (debounceTimer) clearTimeout(debounceTimer);

		if (!query.trim()) {
			suggestions = [];
			showDropdown = false;
			return;
		}

		/* 300ms debounce prevents firing a request on every single keystroke */
		debounceTimer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/suggest?q=${encodeURIComponent(query)}`);
				if (res.ok) {
					const data = await res.json();
					/* Handle both { suggestions: [...] } and plain [...] response shapes */
					suggestions = data.suggestions ?? data ?? [];
					showDropdown = suggestions.length > 0;
				}
			} catch {
				suggestions = [];
				showDropdown = false;
			}
		}, 300);
	}

	/**
	 * Handles keyboard navigation within the autocomplete dropdown.
	 * ArrowDown/Up cycles through suggestions, Enter selects or submits,
	 * Escape dismisses the dropdown. When the dropdown is closed, Enter
	 * simply submits the current query.
	 * @param e - The keyboard event from the input element
	 */
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
				/* Clamp to the last suggestion index */
				selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				/* -1 means "back to the typed query" (no suggestion highlighted) */
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

	/**
	 * Navigates to the search results page with the current query.
	 * No-ops on empty/whitespace-only input.
	 */
	function doSearch() {
		if (query.trim()) {
			showDropdown = false;
			goto(`/search?q=${encodeURIComponent(query.trim())}`);
		}
	}

	/**
	 * Selects a suggestion from the dropdown (via mouse click) and immediately searches.
	 * @param suggestion - The suggestion text clicked by the user
	 */
	function selectSuggestion(suggestion: string) {
		query = suggestion;
		showDropdown = false;
		doSearch();
	}

	/** Clears the search input, hides suggestions, and re-focuses the input for quick re-entry. */
	function clearQuery() {
		query = '';
		suggestions = [];
		showDropdown = false;
		inputEl?.focus();
	}

	/**
	 * Hides the dropdown on blur with a 200ms delay.
	 * The delay is necessary because blur fires before click -- without it,
	 * clicking a suggestion would close the dropdown before the click registers.
	 */
	function handleBlur() {
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

	<!-- Autocomplete dropdown: positioned absolutely below the search input.
	     Uses role="listbox" + role="option" for screen reader accessibility.
	     Each suggestion uses onmousedown (not onclick) so it fires before the input's blur event. -->
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
