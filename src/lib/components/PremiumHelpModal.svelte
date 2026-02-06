<script lang="ts">
	interface Props {
		videoId: string;
		show: boolean;
		onClose: () => void;
	}

	let { videoId, show, onClose }: Props = $props();

	function handleBackdropClick(e: MouseEvent) {
		if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
			onClose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if show}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={handleBackdropClick}>
		<div class="modal safe-bottom" role="dialog" aria-modal="true" aria-label="Premium help">
			<div class="modal-header">
				<h2 class="modal-title">Premium not applying?</h2>
				<button class="btn-icon" onclick={onClose} aria-label="Close">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
						<path
							d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
						/>
					</svg>
				</button>
			</div>

			<div class="modal-body">
				<p>
					This app uses YouTube's official embedded player. If you have YouTube Premium but still
					see ads, here's why:
				</p>

				<div class="help-section">
					<h3>Third-party cookie restrictions</h3>
					<p>
						Many browsers block third-party cookies by default. Since the video player is embedded
						from youtube.com, your browser may not recognize your Premium login.
					</p>
				</div>

				<div class="help-section">
					<h3>What you can try</h3>
					<ul>
						<li>
							Allow third-party cookies for <code>youtube.com</code> and <code>google.com</code> in your
							browser settings
						</li>
						<li>Make sure you're signed into Google in this browser (not just in this app)</li>
						<li>Try using Safari or Chrome, which may handle embedded logins better</li>
						<li>Open the video directly on YouTube (button below)</li>
					</ul>
				</div>

				<div class="help-section">
					<h3>Important notes</h3>
					<ul>
						<li>This app cannot guarantee ad-free playback</li>
						<li>We cannot detect whether you have Premium</li>
						<li>
							Premium ad-free playback depends entirely on YouTube recognizing your session in the
							embedded player
						</li>
					</ul>
				</div>
			</div>

			<div class="modal-footer">
				<a
					href="https://www.youtube.com/watch?v={videoId}"
					target="_blank"
					rel="noopener"
					class="btn btn-primary"
				>
					Open on YouTube
				</a>
				<button class="btn btn-secondary" onclick={onClose}>Close</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: var(--bg-overlay);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 16px;
		padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
	}

	.modal {
		background: var(--modal-bg);
		border-radius: 16px;
		max-width: 560px;
		width: 100%;
		max-height: 90vh;
		max-height: 90dvh;
		overflow-y: auto;
		box-shadow: var(--shadow-lg);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 24px 0;
	}

	.modal-title {
		font-size: 20px;
		font-weight: 600;
	}

	.modal-body {
		padding: 16px 24px;
		font-size: 14px;
		line-height: 1.6;
		color: var(--text-secondary);
	}

	.modal-body > p {
		margin-bottom: 16px;
	}

	.help-section {
		margin-bottom: 20px;
	}

	.help-section h3 {
		font-size: 15px;
		font-weight: 600;
		color: var(--text-primary);
		margin-bottom: 8px;
	}

	.help-section ul {
		padding-left: 20px;
		list-style: disc;
	}

	.help-section li {
		margin-bottom: 6px;
	}

	code {
		background: var(--bg-secondary);
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 13px;
	}

	.modal-footer {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
		padding: 0 24px 20px;
	}

	.modal-footer a {
		text-decoration: none;
	}

	@media (max-width: 600px) {
		.modal {
			max-height: 80vh;
			max-height: 80dvh;
		}

		.modal-header {
			padding: 16px 16px 0;
		}

		.modal-body {
			padding: 12px 16px;
		}

		.modal-footer {
			padding: 0 16px 16px;
			flex-direction: column;
		}
	}
</style>
