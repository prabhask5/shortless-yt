<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	interface Props {
		videoId: string;
	}

	let { videoId }: Props = $props();

	let playerContainer: HTMLDivElement | undefined = $state();
	let player: YT.Player | undefined = $state();
	let ready = $state(false);
	let error = $state(false);

	function loadYTApi(): Promise<void> {
		return new Promise((resolve) => {
			if (window.YT && window.YT.Player) {
				resolve();
				return;
			}

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

			window.onYouTubeIframeAPIReady = () => resolve();
			const tag = document.createElement('script');
			tag.id = 'yt-iframe-api';
			tag.src = 'https://www.youtube.com/iframe_api';
			document.head.appendChild(tag);
		});
	}

	function createPlayer() {
		if (!playerContainer || !window.YT) return;

		if (player) {
			player.destroy();
		}

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
				modestbranding: 1,
				rel: 0,
				playsinline: 1,
				origin: browser ? window.location.origin : undefined
			},
			events: {
				onReady: () => {
					ready = true;
				},
				onError: () => {
					error = true;
				}
			}
		});
	}

	onMount(() => {
		loadYTApi().then(createPlayer);

		return () => {
			if (player) {
				try {
					player.destroy();
				} catch {
					/* ignore */
				}
			}
		};
	});

	// React to videoId changes
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

<div class="player-wrapper">
	<div class="player-container" bind:this={playerContainer}>
		{#if !ready && !error}
			<div class="player-loading">
				<div class="spinner"></div>
			</div>
		{/if}
	</div>
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
