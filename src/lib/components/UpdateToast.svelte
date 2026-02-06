<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	let show = $state(false);
	let waitingWorker: ServiceWorker | null = null;

	onMount(() => {
		if (!browser || !('serviceWorker' in navigator)) return;

		navigator.serviceWorker.getRegistration().then((reg) => {
			if (!reg) return;

			// If there's already a waiting worker (e.g. user navigated back)
			if (reg.waiting) {
				waitingWorker = reg.waiting;
				show = true;
				return;
			}

			// Listen for new installs
			reg.addEventListener('updatefound', () => {
				const newWorker = reg.installing;
				if (!newWorker) return;

				newWorker.addEventListener('statechange', () => {
					if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
						waitingWorker = newWorker;
						show = true;
					}
				});
			});
		});
	});

	function reload() {
		if (waitingWorker) {
			waitingWorker.postMessage({ type: 'SKIP_WAITING' });
		}
		if (browser) {
			navigator.serviceWorker.addEventListener('controllerchange', () => {
				window.location.reload();
			});
		}
	}

	function dismiss() {
		show = false;
	}
</script>

{#if show}
	<div class="update-toast" role="alert">
		<div class="toast-inner">
			<svg class="toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
				<path
					d="M21 10.12h-6.78l2.74-2.82c-2.73-2.7-7.15-2.8-9.88-.1a6.875 6.875 0 000 9.79 7.02 7.02 0 009.88 0C18.32 15.65 19 14.08 19 12.1h2c0 2.08-.56 4.15-2.34 5.93a8.981 8.981 0 01-12.73 0 9.004 9.004 0 010-12.73 8.98 8.98 0 0112.73 0L21 3v7.12z"
				/>
			</svg>
			<span class="toast-text">A new version is available</span>
			<button class="toast-action" onclick={reload}>Update</button>
			<button class="toast-dismiss btn-icon" onclick={dismiss} aria-label="Dismiss">
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
	.update-toast {
		position: fixed;
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 700;
		animation: slideUp 0.3s ease-out;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(16px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}

	.toast-inner {
		display: flex;
		align-items: center;
		gap: 12px;
		background: var(--bg-chip-active);
		color: var(--bg-primary);
		border-radius: 8px;
		padding: 10px 12px 10px 16px;
		box-shadow: var(--shadow-lg);
		font-size: 14px;
		white-space: nowrap;
	}

	.toast-icon {
		flex-shrink: 0;
		opacity: 0.8;
	}

	.toast-text {
		flex: 1;
	}

	.toast-action {
		font-size: 14px;
		font-weight: 600;
		color: #3ea6ff;
		padding: 6px 12px;
		border-radius: 18px;
		white-space: nowrap;
	}

	.toast-action:hover {
		background: rgba(62, 166, 255, 0.1);
	}

	.toast-dismiss {
		flex-shrink: 0;
		color: var(--bg-primary);
		opacity: 0.7;
		width: 28px;
		height: 28px;
		min-height: 28px;
	}

	.toast-dismiss:hover {
		opacity: 1;
	}

	@media (max-width: 768px) {
		.update-toast {
			bottom: calc(var(--bottomnav-height) + env(safe-area-inset-bottom, 0px) + 12px);
			left: 12px;
			right: 12px;
			transform: none;
		}

		@keyframes slideUp {
			from {
				opacity: 0;
				transform: translateY(16px);
			}
			to {
				opacity: 1;
				transform: translateY(0);
			}
		}
	}
</style>
