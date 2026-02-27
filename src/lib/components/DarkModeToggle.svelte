<script lang="ts">
	let isDark = $state(true);

	$effect(() => {
		const stored = localStorage.getItem('theme');
		if (stored === 'light') {
			isDark = false;
			document.documentElement.classList.remove('dark');
			document.documentElement.classList.add('light');
		} else {
			isDark = true;
			document.documentElement.classList.remove('light');
			document.documentElement.classList.add('dark');
		}
	});

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
		<!-- Sun icon -->
		<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
			/>
		</svg>
	{:else}
		<!-- Moon icon -->
		<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
			/>
		</svg>
	{/if}
</button>
