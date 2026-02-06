<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	let show = $state(false);

	onMount(() => {
		if (!browser) return;

		// Only show on iOS Safari when not in standalone mode
		const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
		const isStandalone =
			window.matchMedia('(display-mode: standalone)').matches ||
			(navigator as unknown as { standalone?: boolean }).standalone === true;
		const dismissed = localStorage.getItem('install_banner_dismissed');

		if (isIOS && !isStandalone && !dismissed) {
			show = true;
		}
	});

	function dismiss() {
		show = false;
		if (browser) {
			localStorage.setItem('install_banner_dismissed', 'true');
		}
	}
</script>

{#if show}
	<div class="install-banner safe-bottom">
		<div class="install-content">
			<div class="install-icon">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
					<path
						d="M18 15v3H6v-3H4v3c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-3h-2zm-1-4l-1.41-1.41L13 12.17V4h-2v8.17L8.41 9.59 7 11l5 5 5-5z"
					/>
				</svg>
			</div>
			<div class="install-text">
				<strong>Install Shortless</strong>
				<span
					>Tap <svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="currentColor"
						style="vertical-align: middle;"
						><path
							d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V10c0-1.1.9-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .9 2 2z"
						/></svg
					> then "Add to Home Screen"</span
				>
			</div>
			<button class="dismiss-btn btn-icon" onclick={dismiss} aria-label="Dismiss">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
					<path
						d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
					/>
				</svg>
			</button>
		</div>
	</div>
{/if}

<style>
	.install-banner {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: var(--modal-bg);
		border-top: 1px solid var(--border-color);
		padding: 12px 16px;
		z-index: 600;
		box-shadow: var(--shadow-md);
	}

	.install-content {
		display: flex;
		align-items: center;
		gap: 12px;
		max-width: 600px;
		margin: 0 auto;
	}

	.install-icon {
		width: 40px;
		height: 40px;
		background: var(--bg-secondary);
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: var(--text-link);
	}

	.install-text {
		flex: 1;
		font-size: 13px;
		line-height: 1.4;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.install-text span {
		color: var(--text-secondary);
	}

	.dismiss-btn {
		flex-shrink: 0;
	}
</style>
