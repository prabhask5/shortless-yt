<script lang="ts">
	import { goto } from '$app/navigation';

	interface Props {
		playlist: {
			id: string;
			title: string;
			description: string;
			thumbnailUrl: string;
			channelId: string;
			channelTitle: string;
			itemCount?: number;
		};
	}

	let { playlist }: Props = $props();

	function goToChannel(e: MouseEvent | KeyboardEvent) {
		if (e instanceof KeyboardEvent && e.key !== 'Enter') return;
		e.preventDefault();
		e.stopPropagation();
		goto(`/channel/${playlist.channelId}`);
	}
</script>

<a href="/playlist/{playlist.id}" class="playlist-card" data-sveltekit-preload-data="hover">
	<div class="playlist-thumb">
		{#if playlist.thumbnailUrl}
			<img
				src={playlist.thumbnailUrl}
				alt={playlist.title}
				loading="lazy"
				decoding="async"
				width="320"
				height="180"
				referrerpolicy="no-referrer"
			/>
		{/if}
		{#if playlist.itemCount != null}
			<span class="video-count-badge">{playlist.itemCount} videos</span>
		{/if}
	</div>
	<div class="playlist-info">
		<h3 class="playlist-title line-clamp-2">{playlist.title}</h3>
		<span
			class="playlist-channel"
			role="link"
			tabindex="0"
			onclick={goToChannel}
			onkeydown={goToChannel}>{playlist.channelTitle}</span
		>
		{#if playlist.description}
			<p class="playlist-desc line-clamp-2">{playlist.description}</p>
		{/if}
	</div>
</a>

<style>
	.playlist-card {
		display: flex;
		gap: 16px;
		padding: 8px;
		border-radius: 12px;
		text-decoration: none;
		color: var(--text-primary);
		transition: background-color 0.15s;
		contain: layout style;
	}

	.playlist-card:hover {
		background: var(--bg-hover);
		text-decoration: none;
	}

	.playlist-thumb {
		position: relative;
		flex-shrink: 0;
		width: 240px;
		aspect-ratio: 16/9;
		border-radius: 8px;
		overflow: hidden;
		background: var(--skeleton-bg);
	}

	.playlist-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.video-count-badge {
		position: absolute;
		bottom: 4px;
		right: 4px;
		background: rgba(0, 0, 0, 0.8);
		color: #fff;
		font-size: 12px;
		font-weight: 500;
		padding: 2px 6px;
		border-radius: 4px;
	}

	.playlist-info {
		flex: 1;
		min-width: 0;
		padding: 4px 0;
	}

	.playlist-title {
		font-size: 16px;
		font-weight: 500;
		margin-bottom: 6px;
		line-height: 1.4;
	}

	.playlist-channel {
		font-size: 13px;
		color: var(--text-secondary);
		text-decoration: none;
		display: block;
		margin-bottom: 6px;
	}

	.playlist-channel:hover {
		color: var(--text-primary);
	}

	.playlist-desc {
		font-size: 13px;
		color: var(--text-secondary);
		line-height: 1.4;
	}

	@media (max-width: 768px) {
		.playlist-thumb {
			width: 140px;
		}

		.playlist-title {
			font-size: 14px;
		}
	}
</style>
