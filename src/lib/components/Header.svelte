<script lang="ts">
	import SearchBar from './SearchBar.svelte';
	import DarkModeToggle from './DarkModeToggle.svelte';

	let {
		user,
		query
	}: {
		user?: { avatarUrl: string; channelTitle: string } | null;
		query?: string;
	} = $props();

	let mobileSearchOpen = $state(false);
	let userMenuOpen = $state(false);
</script>

<header
	class="border-yt-border bg-yt-bg sticky top-0 z-50 flex h-14 items-center gap-2 border-b px-4"
>
	{#if mobileSearchOpen}
		<!-- Mobile search view -->
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

		<!-- Desktop search -->
		<div class="mx-4 hidden flex-1 justify-center md:flex">
			<SearchBar initialQuery={query ?? ''} />
		</div>

		<!-- Right side actions -->
		<div class="ml-auto flex items-center gap-1">
			<!-- Mobile search toggle -->
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

			{#if user}
				<div class="relative">
					<button
						onclick={() => (userMenuOpen = !userMenuOpen)}
						class="ml-1 h-8 w-8 overflow-hidden rounded-full"
						aria-label="User menu"
					>
						<img src={user.avatarUrl} alt={user.channelTitle} class="h-full w-full object-cover" />
					</button>

					{#if userMenuOpen}
						<div
							class="border-yt-border bg-yt-surface absolute top-10 right-0 z-50 w-48 rounded-xl border py-2 shadow-lg"
						>
							<div class="border-yt-border border-b px-4 py-2">
								<p class="text-yt-text text-sm font-medium">{user.channelTitle}</p>
							</div>
							<a
								href="/api/auth/signout"
								class="text-yt-text hover:bg-yt-surface-hover block px-4 py-2 text-sm"
							>
								Sign out
							</a>
						</div>
					{/if}
				</div>
			{:else}
				<a
					href="/api/auth/signin"
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
