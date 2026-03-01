<!--
	@component SlowLoadNotice

	Fixed bottom-of-screen notice that appears after a delay when content
	is still loading. Provides transparency about longer load times caused
	by shorts filtering.

	Shows after `delayMs` (default 2s) and auto-hides when `visible` becomes false.
-->
<script lang="ts">
	let { visible, delayMs = 2000 }: { visible: boolean; delayMs?: number } = $props();

	let showNotice = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if (visible) {
			timer = setTimeout(() => (showNotice = true), delayMs);
		} else {
			clearTimeout(timer);
			showNotice = false;
		}
		return () => clearTimeout(timer);
	});
</script>

{#if showNotice}
	<div
		class="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-neutral-800 px-4 py-2.5 text-sm text-neutral-300 shadow-lg"
	>
		Taking a moment to filter out short-form videos...
	</div>
{/if}
