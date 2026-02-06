<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { checkAuth, authLoading } from '$lib/stores/auth';
	import { initTheme } from '$lib/stores/theme';
	import TopBar from '$lib/components/TopBar.svelte';
	import SideNav from '$lib/components/SideNav.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import OfflineBanner from '$lib/components/OfflineBanner.svelte';
	import InstallBanner from '$lib/components/InstallBanner.svelte';

	interface Props {
		children: import('svelte').Snippet;
	}

	let { children }: Props = $props();

	onMount(() => {
		initTheme();
		checkAuth();

		// Register service worker
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/sw.js').catch(() => {
				// SW registration failed, app still works
			});
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
