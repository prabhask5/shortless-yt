<script lang="ts">
	/**
	 * TopBar.svelte
	 *
	 * Fixed top navigation bar for the application. Contains the site logo/brand link,
	 * a centered search box, a dark/light theme toggle, and user authentication controls
	 * (sign in button or avatar dropdown menu). Sits at the top of every page and uses
	 * `position: fixed` with z-index layering above other content.
	 */

	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authState, signOut } from '$lib/stores/auth';
	import { theme, toggleTheme } from '$lib/stores/theme';
	import SearchBox from './SearchBox.svelte';

	/** @state Tracks whether the user account dropdown menu is currently open */
	let showUserMenu = $state(false);

	/**
	 * Handles a search submission from the SearchBox child component.
	 * Navigates to the search results page with the query as a URL parameter.
	 * @param query - The user's search query string
	 */
	function handleSearch(query: string) {
		goto(`/results?q=${encodeURIComponent(query)}`);
	}

	/**
	 * Initiates the OAuth sign-in flow by redirecting the browser
	 * to the server-side authentication endpoint. Uses a full page
	 * redirect (not SvelteKit navigation) since this is an external auth flow.
	 */
	function handleSignIn() {
		window.location.href = '/api/auth/login';
	}

	/**
	 * Signs the user out by calling the auth store's signOut function,
	 * then closes the user menu dropdown.
	 */
	async function handleSignOut() {
		await signOut();
		showUserMenu = false;
	}

	/**
	 * Toggles the visibility of the user account dropdown menu.
	 */
	function handleMenuToggle() {
		showUserMenu = !showUserMenu;
	}

	/**
	 * Global click handler attached to the window to close the user menu
	 * when clicking anywhere outside the menu container. Uses DOM traversal
	 * via `.closest()` to determine if the click target is within the menu.
	 * @param e - The native mouse click event
	 */
	function handleOutsideClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.user-menu-container')) {
			showUserMenu = false;
		}
	}

	/**
	 * @derived Reactively extracts the 'q' search parameter from the current page URL.
	 * Tracks `$page.url` so it updates whenever the URL changes (e.g., navigating
	 * back to a search results page). Passed to SearchBox to pre-fill the input.
	 */
	let initialQuery = $derived($page.url.searchParams.get('q') || '');
</script>

<!-- Attach a global window click listener to close the user menu on outside clicks -->
<svelte:window onclick={handleOutsideClick} />

<!-- safe-top class adds padding for iOS notch/status bar area -->
<header class="topbar safe-top">
	<div class="topbar-inner">
		<div class="topbar-start">
			<a href="/" class="logo-link" aria-label="Home">
				<svg class="logo-icon" viewBox="0 0 105 20" width="105" height="20">
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
			</a>
		</div>

		<div class="topbar-center">
			<SearchBox onSearch={handleSearch} initialValue={initialQuery} />
		</div>

		<div class="topbar-end">
			<!-- Theme toggle: shows sun icon in dark mode, moon icon in light mode -->
			<button
				class="btn-icon"
				onclick={toggleTheme}
				aria-label="Toggle theme"
				title={$theme === 'dark' ? 'Light mode' : 'Dark mode'}
			>
				{#if $theme === 'dark'}
					<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"
						><path
							d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"
						/></svg
					>
				{:else}
					<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"
						><path
							d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"
						/></svg
					>
				{/if}
			</button>

			<!-- Auth-dependent rendering: show avatar dropdown if signed in, sign-in button otherwise -->
		{#if $authState.isSignedIn && $authState.user}
				<div class="user-menu-container">
					<button class="avatar-btn" onclick={handleMenuToggle} aria-label="Account menu">
						<!-- referrerpolicy="no-referrer" prevents Google from rejecting the avatar request -->
					<img
							src={$authState.user.picture}
							alt={$authState.user.name}
							class="avatar-img"
							referrerpolicy="no-referrer"
						/>
					</button>
					{#if showUserMenu}
						<div class="user-menu">
							<div class="user-menu-header">
								<img
									src={$authState.user.picture}
									alt=""
									class="menu-avatar"
									referrerpolicy="no-referrer"
								/>
								<div>
									<div class="menu-name">{$authState.user.name}</div>
									<div class="menu-email">{$authState.user.email}</div>
								</div>
							</div>
							<div class="user-menu-divider"></div>
							<button class="user-menu-item" onclick={handleSignOut}>
								<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"
									><path
										d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"
									/></svg
								>
								Sign out
							</button>
						</div>
					{/if}
				</div>
			{:else}
				<button class="btn btn-secondary sign-in-btn" onclick={handleSignIn}>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"
						><path
							d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2a7.2 7.2 0 01-6-3.22c.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08a7.2 7.2 0 01-6 3.22z"
						/></svg
					>
					Sign in
				</button>
			{/if}
		</div>
	</div>
</header>

<style>
	.topbar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: var(--topbar-height);
		background: var(--topbar-bg);
		border-bottom: 1px solid var(--border-color);
		z-index: 100;
		padding-top: env(safe-area-inset-top, 0px);
	}

	.topbar-inner {
		display: flex;
		align-items: center;
		height: var(--topbar-height);
		padding: 0 16px;
		gap: 16px;
		max-width: 100%;
	}

	.topbar-start {
		flex-shrink: 0;
	}

	.logo-link {
		display: flex;
		align-items: center;
		color: var(--text-primary);
		text-decoration: none;
	}

	.logo-link:hover {
		text-decoration: none;
	}

	.topbar-center {
		flex: 1;
		max-width: 640px;
		margin: 0 auto;
	}

	.topbar-end {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.sign-in-btn {
		border-radius: 18px;
		border: 1px solid var(--border-color-strong);
		font-size: 14px;
		padding: 5px 15px;
		white-space: nowrap;
	}

	.avatar-btn {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		overflow: hidden;
		padding: 0;
		cursor: pointer;
	}

	.avatar-img {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		object-fit: cover;
	}

	.user-menu-container {
		position: relative;
	}

	.user-menu {
		position: absolute;
		top: 44px;
		right: 0;
		width: 300px;
		background: var(--modal-bg);
		border-radius: 12px;
		box-shadow: var(--shadow-lg);
		border: 1px solid var(--border-color);
		overflow: hidden;
		z-index: 200;
	}

	.user-menu-header {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 16px;
	}

	.menu-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
	}

	.menu-name {
		font-size: 16px;
		font-weight: 500;
	}

	.menu-email {
		font-size: 13px;
		color: var(--text-secondary);
	}

	.user-menu-divider {
		height: 1px;
		background: var(--border-color);
	}

	.user-menu-item {
		display: flex;
		align-items: center;
		gap: 16px;
		width: 100%;
		padding: 10px 16px;
		font-size: 14px;
		text-align: left;
		min-height: 44px;
	}

	.user-menu-item:hover {
		background: var(--bg-hover);
	}

	@media (max-width: 600px) {
		.logo-icon text {
			display: none;
		}
		.topbar-inner {
			padding: 0 8px;
			gap: 8px;
		}
	}
</style>
