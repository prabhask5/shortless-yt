<script lang="ts">
	/**
	 * WatchPlayer.svelte
	 *
	 * Embeds a YouTube video player using the YouTube IFrame Player API.
	 * Handles three concerns:
	 *   1. Lazy-loading the IFrame API script (only once, shared across navigations)
	 *   2. Creating / destroying the YT.Player instance tied to the current videoId
	 *   3. Showing a loading spinner or error fallback while the player initialises
	 *
	 * When the `videoId` prop changes (e.g. user clicks a related video), the $effect
	 * rune detects it and either swaps the video in the existing player or creates
	 * a fresh player instance.
	 */

	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	interface Props {
		/** The YouTube video ID to play (e.g. "dQw4w9WgXcQ") */
		videoId: string;
	}

	/** Destructure props with Svelte 5 $props() rune */
	let { videoId }: Props = $props();

	/** $state rune: reference to the container <div> obtained via bind:this. Used for DOM manipulation by the YT API. */
	let playerContainer: HTMLDivElement | undefined = $state();
	/** $state rune: the YT.Player instance. Tracked so we can destroy it on cleanup or video change. */
	let player: YT.Player | undefined = $state();
	/** $state rune: flips to true once the player fires its onReady event, hiding the loading spinner */
	let ready = $state(false);
	/** $state rune: flips to true if the player fires onError, showing the error fallback UI */
	let error = $state(false);

	/**
	 * Loads the YouTube IFrame Player API script into the document.
	 * Returns a promise that resolves when `window.YT.Player` is available.
	 *
	 * Three code paths:
	 *   - API already loaded: resolve immediately
	 *   - Script tag exists but API not ready yet (another component started loading):
	 *     poll every 100ms until it's available
	 *   - First load: inject the <script> tag and resolve via the global
	 *     `onYouTubeIframeAPIReady` callback that YouTube's script invokes
	 *
	 * @returns A promise that resolves when the YT IFrame API is fully available
	 */
	function loadYTApi(): Promise<void> {
		return new Promise((resolve) => {
			// Fast path: API already loaded from a previous navigation
			if (window.YT && window.YT.Player) {
				resolve();
				return;
			}

			// Another component already injected the script -- wait for it
			const existing = document.getElementById('yt-iframe-api');
			if (existing) {
				const check = setInterval(() => {
					if (window.YT && window.YT.Player) {
						clearInterval(check);
						resolve();
					}
				}, 100);
				return;
			}

			// First time: inject the YouTube IFrame API script and wire the global callback
			window.onYouTubeIframeAPIReady = () => resolve();
			const tag = document.createElement('script');
			tag.id = 'yt-iframe-api';
			tag.src = 'https://www.youtube.com/iframe_api';
			document.head.appendChild(tag);
		});
	}

	/**
	 * Creates a new YT.Player instance inside the playerContainer.
	 * Destroys any existing player first to avoid leaking iframes.
	 * Performs direct DOM manipulation (innerHTML / appendChild) because the
	 * YouTube IFrame API requires a raw DOM element to attach to.
	 */
	function createPlayer() {
		if (!playerContainer || !window.YT) return;

		// Tear down previous player instance if one exists
		if (player) {
			player.destroy();
		}

		// Create a fresh target <div> for the YT API to replace with an <iframe>
		const div = document.createElement('div');
		div.id = 'yt-player-' + videoId;
		// eslint-disable-next-line svelte/no-dom-manipulating -- YouTube IFrame API requires DOM manipulation
		playerContainer.innerHTML = '';
		// eslint-disable-next-line svelte/no-dom-manipulating
		playerContainer.appendChild(div);

		player = new window.YT.Player(div.id, {
			videoId,
			width: '100%',
			height: '100%',
			playerVars: {
				autoplay: 1,
				modestbranding: 1, // Reduce YouTube branding
				rel: 0, // Don't show related videos from other channels at end
				playsinline: 1, // Inline playback on iOS
				origin: browser ? window.location.origin : undefined
			},
			events: {
				/** Called when the player is fully initialised and ready to play */
				onReady: () => {
					ready = true;
				},
				/** Called on any playback error (invalid video, embedding restricted, etc.) */
				onError: () => {
					error = true;
				}
			}
		});
	}

	/**
	 * Lifecycle: on mount, load the YT API then create the player.
	 * The returned cleanup function destroys the player when the component unmounts
	 * (e.g. navigating away from the watch page) to prevent memory leaks.
	 */
	onMount(() => {
		loadYTApi().then(createPlayer);

		return () => {
			if (player) {
				try {
					player.destroy();
				} catch {
					/* ignore -- player may already be detached */
				}
			}
		};
	});

	/**
	 * $effect rune: reacts to changes in `videoId`.
	 * When the user navigates to a different video (e.g. via related sidebar),
	 * SvelteKit reuses this component with a new videoId prop. This effect
	 * detects the change and either:
	 *   - Calls loadVideoById on the existing player (cheaper, no iframe teardown)
	 *   - Falls back to creating a new player if the existing one isn't ready
	 */
	$effect(() => {
		if (videoId && browser && window.YT && window.YT.Player) {
			if (player && typeof player.loadVideoById === 'function') {
				player.loadVideoById(videoId);
			} else {
				createPlayer();
			}
		}
	});
</script>

<!-- Player wrapper maintains 16:9 aspect ratio via CSS; black background acts as letterbox -->
<div class="player-wrapper">
	<!-- bind:this captures the DOM reference used by createPlayer() to inject the YT iframe -->
	<div class="player-container" bind:this={playerContainer}>
		<!-- Loading spinner shown until the YT player fires onReady or onError -->
		{#if !ready && !error}
			<div class="player-loading">
				<div class="spinner"></div>
			</div>
		{/if}
	</div>
	<!-- Error overlay with a fallback link to watch on youtube.com directly -->
	{#if error}
		<div class="player-error">
			<p>Video playback error</p>
			<a
				href="https://www.youtube.com/watch?v={videoId}"
				target="_blank"
				rel="noopener"
				class="btn btn-secondary"
			>
				Open on YouTube
			</a>
		</div>
	{/if}
</div>

<style>
	.player-wrapper {
		position: relative;
		width: 100%;
		aspect-ratio: 16/9;
		background: #000;
		border-radius: 12px;
		overflow: hidden;
	}

	.player-container {
		width: 100%;
		height: 100%;
	}

	.player-container :global(iframe) {
		width: 100%;
		height: 100%;
		border: none;
	}

	.player-loading {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #000;
	}

	.spinner {
		width: 48px;
		height: 48px;
		border: 3px solid rgba(255, 255, 255, 0.2);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.player-error {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		background: #000;
		color: #fff;
	}

	@media (max-width: 768px) {
		.player-wrapper {
			border-radius: 0;
		}
	}
</style>
