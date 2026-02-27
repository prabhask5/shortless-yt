<script lang="ts">
	/**
	 * @fileoverview DarkModeToggle component for switching between light and dark themes.
	 * @component
	 *
	 * Persists the user's theme preference in localStorage under the key "theme".
	 * The theme is applied by toggling "dark" / "light" CSS classes on the <html> element
	 * (document.documentElement). Tailwind and the app's custom CSS properties (--yt-bg,
	 * --yt-text, etc.) respond to these classes to switch the entire color scheme.
	 *
	 * On mount, the $effect reads the stored preference and applies it. If no preference
	 * is stored, it defaults to dark mode (isDark = true), matching YouTube's default.
	 *
	 * The button shows a sun icon in dark mode (click to switch to light) and a moon
	 * icon in light mode (click to switch to dark), which is the conventional pattern.
	 */

	/** Current theme state; defaults to dark mode */
	let isDark = $state(true);

	/*
	 * On mount: read the stored theme from localStorage and apply the correct
	 * CSS class to <html>. This runs once on component initialization.
	 * We use $effect to ensure we're in the browser (document/localStorage available).
	 */
	$effect(() => {
		/* Read stored preference — only runs once since localStorage is not reactive */
		const stored = localStorage.getItem('theme');
		const shouldBeDark = stored !== 'light';

		/* Apply the correct class to <html> for Tailwind/CSS custom properties */
		document.documentElement.classList.toggle('dark', shouldBeDark);
		document.documentElement.classList.toggle('light', !shouldBeDark);

		/* Sync component state without re-triggering — $effect tracks reads, not writes */
		isDark = shouldBeDark;
	});

	/**
	 * Toggles between dark and light mode.
	 * Updates the component state, swaps the CSS class on <html>, and
	 * persists the new preference to localStorage for future visits.
	 */
	function toggle() {
		isDark = !isDark;
		if (isDark) {
			document.documentElement.classList.remove('light');
			document.documentElement.classList.add('dark');
			localStorage.setItem('theme', 'dark');
		} else {
			document.documentElement.classList.remove('dark');
			document.documentElement.classList.add('light');
			localStorage.setItem('theme', 'light');
		}
	}
</script>

<button
	onclick={toggle}
	class="text-yt-text-secondary hover:bg-yt-surface-hover hover:text-yt-text flex h-9 w-9 items-center justify-center rounded-full transition-colors"
	aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
>
	{#if isDark}
		<!-- Sun icon: shown in dark mode, clicking it switches to light mode -->
		<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
			/>
		</svg>
	{:else}
		<!-- Moon icon: shown in light mode, clicking it switches to dark mode -->
		<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
			/>
		</svg>
	{/if}
</button>
