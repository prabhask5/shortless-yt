<script lang="ts">
	/**
	 * Root Layout (+layout.svelte)
	 *
	 * The top-level layout that wraps every page in the Shortless app. Responsible for:
	 * - Importing global CSS styles (app.css)
	 * - Initializing theme (light/dark mode) and checking authentication state on mount
	 * - Registering the service worker for offline support, caching, and PWA functionality
	 * - Rendering the persistent app shell: TopBar, SideNav (desktop), BottomNav (mobile),
	 *   and global overlays (OfflineBanner, InstallBanner, UpdateToast)
	 * - Showing a full-screen loading spinner while auth state is being determined
	 *
	 * Data flow:
	 *   onMount -> initTheme() sets CSS theme class on <html>
	 *   onMount -> checkAuth() reads session cookie, populates authState store
	 *   onMount -> registers SW via requestIdleCallback (or setTimeout fallback)
	 *   $authLoading store -> controls visibility of the full-screen loading overlay
	 */
	import '../app.css';
	import { onMount } from 'svelte';
	import { checkAuth, authLoading } from '$lib/stores/auth';
	import { initTheme } from '$lib/stores/theme';
	import TopBar from '$lib/components/TopBar.svelte';
	import SideNav from '$lib/components/SideNav.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import OfflineBanner from '$lib/components/OfflineBanner.svelte';
	import InstallBanner from '$lib/components/InstallBanner.svelte';
	import UpdateToast from '$lib/components/UpdateToast.svelte';

	/** Props interface: receives child page content as a Svelte 5 snippet */
	interface Props {
		children: import('svelte').Snippet;
	}

	/**
	 * $props() rune: Destructures the `children` snippet passed by SvelteKit's router.
	 * This snippet represents the current page component rendered inside the layout.
	 */
	let { children }: Props = $props();

	onMount(() => {
		// Initialize theme from localStorage preference (applies 'dark' or 'light' class to <html>)
		initTheme();
		// Check if the user has a valid auth session cookie and populate the authState store
		checkAuth();

		// Register service worker (deferred to reduce main-thread work during initial paint)
		if ('serviceWorker' in navigator) {
			/**
			 * Registers /sw.js which handles:
			 * - Caching API responses (recommended, search, videos) with TTL-based freshness
			 * - Caching YouTube thumbnails (i.ytimg.com) in a separate cache
			 * - Offline fallback for cached content
			 */
			const registerSW = () => {
				navigator.serviceWorker
					.register('/sw.js')
					.then((registration) => {
						// When the user returns to the tab, check if there is a new SW version available.
						// This enables the UpdateToast component to prompt for a reload.
						document.addEventListener('visibilitychange', () => {
							if (document.visibilityState === 'visible') {
								registration.update();
							}
						});
					})
					.catch(() => {});
			};
			// Defer SW registration until the browser is idle to avoid blocking initial render.
			// Falls back to setTimeout(fn, 1) for browsers without requestIdleCallback support.
			if ('requestIdleCallback' in window) {
				requestIdleCallback(registerSW);
			} else {
				setTimeout(registerSW, 1);
			}
		}
	});
</script>

{#if $authLoading}
	<div class="auth-loading-overlay">
		<div class="auth-spinner"></div>
	</div>
{/if}

<div class="app-shell">
	<TopBar />
	<SideNav />
	<main class="main-content">
		{@render children()}
	</main>
	<BottomNav />
	<OfflineBanner />
	<InstallBanner />
	<UpdateToast />
</div>

<style>
	.auth-loading-overlay {
		position: fixed;
		inset: 0;
		z-index: 9999;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-primary, #fff);
	}

	.auth-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--text-secondary, #888);
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.app-shell {
		min-height: 100vh;
		min-height: 100dvh;
	}

	.main-content {
		margin-top: calc(var(--topbar-height) + env(safe-area-inset-top, 0px));
		margin-left: var(--sidenav-width);
		min-height: calc(100vh - var(--topbar-height));
		min-height: calc(100dvh - var(--topbar-height));
		padding: 16px 24px;
		padding-bottom: 24px;
	}

	@media (max-width: 768px) {
		.main-content {
			margin-left: 0;
			padding: 12px;
			padding-bottom: calc(var(--bottomnav-height) + env(safe-area-inset-bottom, 0px) + 12px);
		}
	}
</style>
