<script lang="ts">
	/**
	 * ChannelCard.svelte
	 *
	 * Displays a YouTube channel as a clickable card in search results. Shows the
	 * channel avatar (with a letter fallback if no thumbnail), title, custom URL
	 * handle, subscriber count, and description. Links to the channel detail page.
	 * On mobile (<=768px), switches to a centered vertical layout.
	 * Uses `contain: layout style` for rendering performance optimization
	 * (avoids `content-visibility: auto` which causes Firefox layout freezes).
	 */

	import { formatSubscriberCount } from '$lib/utils/format';

	interface Props {
		/** The channel data object containing all display information */
		channel: {
			/** YouTube channel ID, used to build the link to /channel/[id] */
			id: string;
			/** Display name of the channel */
			title: string;
			/** Channel description text, shown truncated to 2 lines */
			description: string;
			/** URL for the channel's avatar image */
			thumbnailUrl: string;
			/** Raw subscriber count string; formatted by formatSubscriberCount for display */
			subscriberCount?: string;
			/** Total number of videos on the channel (currently unused in template) */
			videoCount?: string;
			/** Custom vanity URL handle (e.g., "@channelname") */
			customUrl?: string;
		};
	}

	let { channel }: Props = $props();
</script>

<!-- data-sveltekit-preload-data="hover" triggers data loading on hover for faster navigation -->
<a href="/channel/{channel.id}" class="channel-card" data-sveltekit-preload-data="hover">
	<div class="channel-avatar">
		<!-- Show the channel thumbnail if available; otherwise display a fallback circle
			 with the first letter of the channel name -->
		{#if channel.thumbnailUrl}
			<img
				src={channel.thumbnailUrl}
				alt={channel.title}
				loading="lazy"
				decoding="async"
				width="80"
				height="80"
				referrerpolicy="no-referrer"
			/>
		{:else}
			<div class="avatar-fallback">{channel.title.charAt(0).toUpperCase()}</div>
		{/if}
	</div>
	<div class="channel-info">
		<h3 class="channel-title">{channel.title}</h3>
		{#if channel.customUrl}
			<span class="channel-handle">{channel.customUrl}</span>
		{/if}
		{#if channel.subscriberCount}
			<span class="channel-subs">{formatSubscriberCount(channel.subscriberCount)}</span>
		{/if}
		{#if channel.description}
			<p class="channel-desc line-clamp-2">{channel.description}</p>
		{/if}
	</div>
</a>

<style>
	.channel-card {
		display: flex;
		align-items: center;
		gap: 24px;
		padding: 16px;
		border-radius: 12px;
		text-decoration: none;
		color: var(--text-primary);
		transition: background-color 0.15s;
		contain: layout style;
	}

	.channel-card:hover {
		background: var(--bg-hover);
		text-decoration: none;
	}

	.channel-avatar {
		flex-shrink: 0;
	}

	.channel-avatar img {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		object-fit: cover;
	}

	.avatar-fallback {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: var(--bg-tertiary);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 32px;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.channel-info {
		flex: 1;
		min-width: 0;
	}

	.channel-title {
		font-size: 18px;
		font-weight: 500;
		margin-bottom: 4px;
	}

	.channel-handle {
		font-size: 13px;
		color: var(--text-secondary);
		display: block;
		margin-bottom: 2px;
	}

	.channel-subs {
		font-size: 13px;
		color: var(--text-secondary);
		display: block;
		margin-bottom: 6px;
	}

	.channel-desc {
		font-size: 13px;
		color: var(--text-secondary);
		line-height: 1.4;
	}

	@media (max-width: 768px) {
		.channel-card {
			flex-direction: column;
			text-align: center;
			gap: 12px;
			padding: 12px;
		}

		.channel-avatar img,
		.avatar-fallback {
			width: 60px;
			height: 60px;
			font-size: 24px;
		}

		.channel-title {
			font-size: 16px;
		}
	}
</style>
