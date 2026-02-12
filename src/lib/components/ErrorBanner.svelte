<script lang="ts">
	/**
	 * ErrorBanner.svelte
	 *
	 * A reusable inline error alert component that displays an error message with
	 * a warning icon and an optional dismiss button. Renders as a red-themed banner
	 * with `role="alert"` for screen reader accessibility. The banner is conditionally
	 * rendered only when `message` is truthy, so the parent can clear it by passing
	 * an empty string.
	 */

	interface Props {
		/** The error message text to display inside the banner. */
		message: string;
		/** Whether the banner can be dismissed by the user. Defaults to true. */
		dismissable?: boolean;
		/** Callback invoked when the user clicks the dismiss (X) button. */
		onDismiss?: () => void;
	}

	/**
	 * Destructured component props using Svelte 5 $props() rune.
	 * - `message`: required error text
	 * - `dismissable`: defaults to true, controls whether the X button renders
	 * - `onDismiss`: optional callback; dismiss button only appears when BOTH
	 *   `dismissable` is true AND `onDismiss` is provided
	 */
	let { message, dismissable = true, onDismiss }: Props = $props();
</script>

<!-- Banner is hidden when message is empty/falsy, allowing parent to clear errors -->
{#if message}
	<div class="error-banner" role="alert">
		<!-- Exclamation/warning circle icon -->
		<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
			<path
				d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
			/>
		</svg>
		<span class="error-text">{message}</span>
		<!-- Dismiss button requires both `dismissable` flag AND `onDismiss` callback -->
		{#if dismissable && onDismiss}
			<button class="dismiss-btn btn-icon" onclick={onDismiss} aria-label="Dismiss">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
					<path
						d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
					/>
				</svg>
			</button>
		{/if}
	</div>
{/if}

<style>
	.error-banner {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		background: rgba(204, 0, 0, 0.1);
		border: 1px solid var(--red-text);
		border-radius: 8px;
		color: var(--red-text);
		font-size: 14px;
		margin: 8px 0;
	}

	.error-text {
		flex: 1;
	}

	.dismiss-btn {
		color: var(--red-text);
		width: 32px;
		height: 32px;
		min-height: 32px;
	}
</style>
