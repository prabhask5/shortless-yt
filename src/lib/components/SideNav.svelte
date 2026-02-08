<script lang="ts">
	import { page } from '$app/stores';

	let currentPath: string = $derived($page.url.pathname);
</script>

<nav class="sidenav" aria-label="Main navigation">
	<a href="/" class="nav-item" class:active={currentPath === '/'} aria-label="Home">
		<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
			<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
		</svg>
		<span class="nav-label">Home</span>
	</a>
	<a
		href="/subscriptions"
		class="nav-item"
		class:active={currentPath === '/subscriptions'}
		aria-label="Subscriptions"
	>
		<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
			<path
				d="M4 6h16v2H4zm2-4h12v2H6zm14 8H4c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-8c0-1.1-.9-2-2-2zm0 10H4v-8h16v8zm-10-7.27v6.53L16 16l-6-3.27z"
			/>
		</svg>
		<span class="nav-label">Subscriptions</span>
	</a>
	<a
		href="/settings"
		class="nav-item"
		class:active={currentPath === '/settings'}
		aria-label="Settings"
	>
		<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
			<path
				d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
			/>
		</svg>
		<span class="nav-label">Settings</span>
	</a>
</nav>

<style>
	.sidenav {
		position: fixed;
		top: var(--topbar-height);
		left: 0;
		bottom: 0;
		width: var(--sidenav-width);
		background: var(--sidenav-bg);
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 4px 0;
		padding-top: calc(4px + env(safe-area-inset-top, 0px));
		z-index: 50;
		overflow-y: auto;
	}

	.nav-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 64px;
		padding: 16px 0 14px;
		border-radius: 10px;
		color: var(--text-primary);
		text-decoration: none;
		font-size: 10px;
		gap: 4px;
		transition: background-color 0.15s;
		min-height: 44px;
	}

	.nav-item:hover {
		background: var(--bg-hover);
		text-decoration: none;
	}

	.nav-item.active {
		font-weight: 600;
	}

	.nav-label {
		line-height: 1;
	}

	@media (max-width: 768px) {
		.sidenav {
			display: none;
		}
	}
</style>
