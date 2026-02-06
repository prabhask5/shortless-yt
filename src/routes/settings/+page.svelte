<script lang="ts">
	import { browser } from '$app/environment';
	import { authState, signOut } from '$lib/stores/auth';
	import { theme, toggleTheme } from '$lib/stores/theme';

	let shortsThreshold = $state(60);

	// Load saved threshold
	if (browser) {
		const saved = localStorage.getItem('shorts_threshold');
		if (saved) shortsThreshold = parseInt(saved, 10);
	}

	function saveShortsThreshold() {
		if (browser) {
			localStorage.setItem('shorts_threshold', shortsThreshold.toString());
		}
	}

	function handleSignIn() {
		window.location.href = '/api/auth/login';
	}

	async function handleSignOut() {
		await signOut();
	}
</script>

<svelte:head>
	<title>Settings - Shortless</title>
</svelte:head>

<div class="settings-page">
	<h1 class="page-title">Settings</h1>

	<section class="settings-section">
		<h2 class="section-title">Appearance</h2>
		<div class="setting-row">
			<div class="setting-info">
				<span class="setting-label">Theme</span>
				<span class="setting-desc">Choose light or dark mode</span>
			</div>
			<button class="btn btn-secondary" onclick={toggleTheme}>
				{$theme === 'dark' ? 'Light mode' : 'Dark mode'}
			</button>
		</div>
	</section>

	<section class="settings-section">
		<h2 class="section-title">Shorts Filter</h2>
		<div class="setting-row">
			<div class="setting-info">
				<span class="setting-label">Maximum duration (seconds)</span>
				<span class="setting-desc">Videos shorter than this will be treated as Shorts</span>
			</div>
			<div class="threshold-control">
				<select bind:value={shortsThreshold} onchange={saveShortsThreshold} class="select-input">
					<option value={60}>60s (default)</option>
					<option value={90}>90s</option>
					<option value={120}>120s</option>
				</select>
			</div>
		</div>
	</section>

	<section class="settings-section">
		<h2 class="section-title">Account</h2>
		{#if $authState.isSignedIn && $authState.user}
			<div class="setting-row">
				<div class="setting-info">
					<div class="profile-row">
						<img
							src={$authState.user.picture}
							alt=""
							class="profile-avatar"
							referrerpolicy="no-referrer"
						/>
						<div>
							<span class="setting-label">{$authState.user.name}</span>
							<span class="setting-desc">{$authState.user.email}</span>
						</div>
					</div>
				</div>
				<button class="btn btn-secondary" onclick={handleSignOut}>Sign out</button>
			</div>
		{:else}
			<div class="setting-row">
				<div class="setting-info">
					<span class="setting-label">Google Account</span>
					<span class="setting-desc">Sign in to potentially get ad-free playback with Premium</span>
				</div>
				<button class="btn btn-primary" onclick={handleSignIn}>Sign in with Google</button>
			</div>
		{/if}
	</section>

	<section class="settings-section">
		<h2 class="section-title">About Premium & Ads</h2>
		<div class="info-card">
			<p>This app uses YouTube's official embedded player. Ad behavior is controlled by YouTube.</p>
			<p><strong>If you have YouTube Premium:</strong></p>
			<ul>
				<li>Make sure you're signed into Google in this browser</li>
				<li>Allow third-party cookies for youtube.com and google.com</li>
				<li>
					Some browsers block cross-site cookies, which may prevent Premium from applying in
					embedded players
				</li>
				<li>If Premium still doesn't apply, use the "Open on YouTube" button on the watch page</li>
			</ul>
			<p><strong>We cannot:</strong></p>
			<ul>
				<li>Detect whether you have Premium</li>
				<li>Guarantee ad-free playback</li>
				<li>Block or skip ads</li>
			</ul>
		</div>
	</section>
</div>

<style>
	.settings-page {
		max-width: 700px;
		margin: 0 auto;
		padding: 16px 0;
	}

	.page-title {
		font-size: 24px;
		font-weight: 600;
		margin-bottom: 32px;
	}

	.settings-section {
		margin-bottom: 32px;
	}

	.section-title {
		font-size: 16px;
		font-weight: 600;
		margin-bottom: 16px;
		color: var(--text-secondary);
	}

	.setting-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 16px;
		background: var(--bg-secondary);
		border-radius: 12px;
		margin-bottom: 8px;
	}

	.setting-info {
		flex: 1;
	}

	.setting-label {
		display: block;
		font-size: 14px;
		font-weight: 500;
	}

	.setting-desc {
		display: block;
		font-size: 13px;
		color: var(--text-secondary);
		margin-top: 2px;
	}

	.select-input {
		padding: 8px 12px;
		border-radius: 8px;
		border: 1px solid var(--input-border);
		background: var(--input-bg);
		color: var(--text-primary);
		font-size: 14px;
		min-height: 44px;
	}

	.profile-row {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.profile-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
	}

	.info-card {
		background: var(--bg-secondary);
		border-radius: 12px;
		padding: 20px;
		font-size: 14px;
		line-height: 1.6;
		color: var(--text-secondary);
	}

	.info-card p {
		margin-bottom: 12px;
	}

	.info-card strong {
		color: var(--text-primary);
	}

	.info-card ul {
		padding-left: 20px;
		list-style: disc;
		margin-bottom: 12px;
	}

	.info-card li {
		margin-bottom: 4px;
	}

	@media (max-width: 600px) {
		.setting-row {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
