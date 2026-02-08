<script lang="ts">
	import { formatSubscriberCount } from '$lib/utils/format';

	interface Props {
		channel: {
			id: string;
			title: string;
			description: string;
			thumbnailUrl: string;
			subscriberCount?: string;
			videoCount?: string;
			customUrl?: string;
		};
	}

	let { channel }: Props = $props();
</script>

<a href="/channel/{channel.id}" class="channel-card" data-sveltekit-preload-data="hover">
	<div class="channel-avatar">
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
