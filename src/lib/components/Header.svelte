<script lang="ts">
	/**
	 * @fileoverview Header component -- the sticky top navigation bar for the entire app.
	 * @component
	 *
	 * Contains the app logo, search bar, dark mode toggle, and user menu / sign-in button.
	 *
	 * The search bar has two rendering modes based on viewport width:
	 * - Desktop (md+): The SearchBar is always visible in the center of the header.
	 * - Mobile (<md): The SearchBar is hidden by default. A search icon button toggles
	 *   `mobileSearchOpen`, which replaces the entire header content with a back arrow
	 *   and a full-width SearchBar. This avoids cramming the search input into the
	 *   narrow mobile header alongside the logo and action buttons.
	 *
	 * The user menu is a simple dropdown that appears on avatar click, showing the
	 * channel name, liked videos link, and a sign-out link. When no user is signed in,
	 * a "Sign in" button links to the OAuth flow at /api/auth/login.
	 */
	import SearchBar from './SearchBar.svelte';
	import DarkModeToggle from './DarkModeToggle.svelte';

	/** @prop user - The signed-in user's avatar and channel title, or null/undefined if not signed in */
	/** @prop query - The current search query, used to pre-fill the SearchBar on search result pages */
	/** @prop onRefresh - Optional async callback for the mobile refresh button */
	let {
		user,
		query,
		onRefresh
	}: {
		user?: { avatarUrl: string; channelTitle: string } | null;
		query?: string;
		onRefresh?: () => Promise<void>;
	} = $props();

	/** Whether the mobile-only full-width search view is open */
	let mobileSearchOpen = $state(false);
	/** Whether the user avatar dropdown menu is visible */
	let userMenuOpen = $state(false);
	/** Whether a refresh is in progress */
	let refreshing = $state(false);

	async function handleRefresh() {
		if (refreshing || !onRefresh) return;
		refreshing = true;
		try {
			await onRefresh();
		} finally {
			refreshing = false;
		}
	}

	/** Close the user menu when clicking anywhere outside it */
	function handleWindowClick(e: MouseEvent) {
		if (userMenuOpen) {
			const target = e.target as HTMLElement;
			if (!target.closest('[data-user-menu]')) {
				userMenuOpen = false;
			}
		}
	}
</script>

<svelte:window onclick={handleWindowClick} />

<header
	class="border-yt-border bg-yt-bg sticky top-0 z-50 flex h-14 items-center gap-2 border-b px-4"
>
	{#if mobileSearchOpen}
		<!-- Mobile search view: replaces the entire header with a back button + full-width SearchBar -->
		<button
			onclick={() => (mobileSearchOpen = false)}
			class="text-yt-text shrink-0 p-2"
			aria-label="Close search"
		>
			<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
				<path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
			</svg>
		</button>
		<SearchBar initialQuery={query ?? ''} />
	{:else}
		<!-- Logo -->
		<a href="/" class="mr-2 flex shrink-0 items-center gap-1.5">
			<svg class="text-yt-accent h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
				<path
					d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z"
				/>
			</svg>
			<span class="text-yt-text text-lg font-bold">Shortless</span>
		</a>

		<!-- Desktop search: hidden on mobile, centered in the header on md+ screens -->
		<div class="mx-4 hidden flex-1 justify-center md:flex">
			<SearchBar initialQuery={query ?? ''} />
		</div>

		<!-- Right side actions: search (mobile), dark mode, refresh (mobile), user menu -->
		<div class="ml-auto flex items-center gap-1">
			<!-- Mobile search toggle: only visible on screens smaller than md breakpoint -->
			<button
				onclick={() => (mobileSearchOpen = true)}
				class="text-yt-text p-2 md:hidden"
				aria-label="Search"
			>
				<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
					<path
						d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
					/>
				</svg>
			</button>

			<DarkModeToggle />

			<!-- Mobile refresh button: only visible on mobile when onRefresh is provided -->
			{#if onRefresh}
				<button
					onclick={handleRefresh}
					disabled={refreshing}
					class="text-yt-text-secondary hover:text-yt-text p-2 transition-colors md:hidden"
					class:refreshing
					aria-label="Refresh feed"
				>
					<svg
						class="h-5 w-5"
						class:animate-spin={refreshing}
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M21 12a9 9 0 1 1-6.219-8.56" />
						<path d="M21 3v6h-6" />
					</svg>
				</button>
			{/if}

			<!-- User section: avatar dropdown when signed in, "Sign in" button when not -->
			{#if user}
				<div class="relative" data-user-menu>
					<button
						onclick={() => (userMenuOpen = !userMenuOpen)}
						class="ml-1 h-8 w-8 overflow-hidden rounded-full"
						aria-label="User menu"
					>
						{#if user.avatarUrl}
							<img
								src={user.avatarUrl}
								alt={user.channelTitle}
								class="h-full w-full object-cover"
							/>
						{:else}
							<svg class="text-yt-text h-full w-full" fill="currentColor" viewBox="0 0 24 24">
								<path
									d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
								/>
							</svg>
						{/if}
					</button>

					{#if userMenuOpen}
						<div
							class="border-yt-border bg-yt-surface absolute top-10 right-0 z-50 w-48 rounded-xl border py-2 shadow-lg"
						>
							<div class="border-yt-border border-b px-4 py-2">
								<p class="text-yt-text text-sm font-medium">{user.channelTitle}</p>
							</div>
							<a
								href="/liked"
								class="text-yt-text hover:bg-yt-surface-hover block px-4 py-2 text-sm"
							>
								Liked videos
							</a>
							<form method="POST" action="/api/auth/logout">
								<button
									type="submit"
									class="text-yt-text hover:bg-yt-surface-hover block w-full px-4 py-2 text-left text-sm"
								>
									Sign out
								</button>
							</form>
							<div class="border-yt-border my-1 border-t"></div>
							<a
								href="/about"
								class="text-yt-text-secondary hover:bg-yt-surface-hover block px-4 py-2 text-xs"
							>
								About
							</a>
							<a
								href="/terms"
								class="text-yt-text-secondary hover:bg-yt-surface-hover block px-4 py-2 text-xs"
							>
								Terms of Service
							</a>
							<a
								href="/privacy"
								class="text-yt-text-secondary hover:bg-yt-surface-hover block px-4 py-2 text-xs"
							>
								Privacy Policy
							</a>
						</div>
					{/if}
				</div>
			{:else}
				<a
					href="/api/auth/login"
					data-sveltekit-reload
					class="ml-1 flex items-center gap-1.5 rounded-full border border-blue-400/50 px-3 py-1.5 text-sm font-medium text-blue-400 hover:bg-blue-400/10"
				>
					<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
						<path
							d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
						/>
					</svg>
					Sign in
				</a>
			{/if}
		</div>
	{/if}
</header>
