<!--
	@component ReloadPrompt — PWA update notification toast.

	When @vite-pwa/sveltekit detects a new service worker (i.e., a new deployment),
	this component shows a fixed-position toast at the bottom of the screen
	prompting the user to reload. Clicking "Update" activates the waiting
	service worker and reloads the page. Clicking "Dismiss" hides the toast
	until the next visit.

	Uses the `$pwaInfo` store from `virtual:pwa-info` (provided by @vite-pwa/sveltekit)
	to detect when a new service worker is waiting.
-->
<script lang="ts">
	import { onMount } from 'svelte';

	let needRefresh = $state(false);
	let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;

	onMount(async () => {
		/* Dynamically import the PWA registration module. This is only available
		 * in production builds — in dev mode, the import resolves to a no-op. */
		const { registerSW } = await import('virtual:pwa-register');

		updateSW = registerSW({
			/* Called when a new service worker is installed and waiting to activate.
			 * We show the toast so the user can choose when to reload. */
			onNeedRefresh() {
				needRefresh = true;
			},
			/* Called when all assets have been precached (first install or update).
			 * No user action needed here. */
			onOfflineReady() {
				// Silently ready — no toast needed for offline readiness
			}
		});
	});

	/** Activate the waiting service worker and reload the page to load new assets. */
	async function handleUpdate() {
		if (updateSW) {
			await updateSW(true);
		}
	}

	/** Dismiss the toast without updating (user will get the update on next visit). */
	function handleDismiss() {
		needRefresh = false;
	}
</script>

{#if needRefresh}
	<div
		class="bg-yt-surface border-yt-border fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-3 shadow-lg"
	>
		<span class="text-yt-text text-sm">New version available</span>
		<button
			onclick={handleUpdate}
			class="bg-yt-accent rounded-full px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
		>
			Update
		</button>
		<button
			onclick={handleDismiss}
			class="text-yt-text-secondary hover:text-yt-text text-sm"
			aria-label="Dismiss"
		>
			<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
				<path
					d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
				/>
			</svg>
		</button>
	</div>
{/if}
