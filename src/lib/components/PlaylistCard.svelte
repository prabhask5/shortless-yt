<script lang="ts">
	/**
	 * PlaylistCard.svelte
	 *
	 * Displays a YouTube playlist as a clickable card in search results. Shows the
	 * playlist thumbnail with a video count badge overlay, the title, a clickable
	 * channel name link, and an optional description. The entire card links to the
	 * playlist detail page, while the channel name navigates to the channel page
	 * independently (via event interception). On mobile (<=768px), the thumbnail
	 * shrinks for a more compact layout. Uses `contain: layout style` for
	 * rendering performance optimization.
	 */

	import { goto } from '$app/navigation';

	interface Props {
		/** The playlist data object containing all display information */
		playlist: {
			/** YouTube playlist ID, used to build the link to /playlist/[id] */
			id: string;
			/** Display title of the playlist, truncated to 2 lines via CSS */
			title: string;
			/** Playlist description text, shown truncated to 2 lines */
			description: string;
			/** URL for the playlist thumbnail image */
			thumbnailUrl: string;
			/** YouTube channel ID of the playlist owner, used for channel navigation */
			channelId: string;
			/** Display name of the channel that owns the playlist */
			channelTitle: string;
			/** Number of videos in the playlist, shown as an overlay badge */
			itemCount?: number;
		};
	}

	let { playlist }: Props = $props();

	/**
	 * Navigates to the playlist owner's channel page. Handles both click and
	 * keyboard events (only responds to Enter key for keyboard). Stops event
	 * propagation and prevents default to avoid triggering the parent <a> tag's
	 * navigation to the playlist page.
	 * @param e - The mouse click or keyboard event from the channel name element
	 */
	function goToChannel(e: MouseEvent | KeyboardEvent) {
		// Only respond to Enter key for keyboard events; ignore Tab, Shift, etc.
		if (e instanceof KeyboardEvent && e.key !== 'Enter') return;
		// Prevent the click from bubbling up to the parent <a> tag (playlist link)
		e.preventDefault();
		e.stopPropagation();
		goto(`/channel/${playlist.channelId}`);
	}
</script>

<!-- data-sveltekit-preload-data="hover" triggers data loading on hover for faster navigation -->
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
		<!-- Uses != null (not !== null) to check for both null and undefined -->
		{#if playlist.itemCount != null}
			<span class="video-count-badge">{playlist.itemCount} videos</span>
		{/if}
	</div>
	<div class="playlist-info">
		<h3 class="playlist-title line-clamp-2">{playlist.title}</h3>
		<!-- Channel name is a nested interactive element within the card's <a> tag.
			 Uses role="link" + tabindex for keyboard accessibility, and goToChannel
			 intercepts click/keydown to navigate to the channel page instead of the playlist -->
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
