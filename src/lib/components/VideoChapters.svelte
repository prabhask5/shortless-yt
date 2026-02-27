<script lang="ts">
	let { description, onSeek }: { description: string; onSeek: (seconds: number) => void } =
		$props();

	interface Chapter {
		time: number;
		label: string;
		formatted: string;
	}

	function parseChapters(desc: string): Chapter[] {
		const lines = desc.split('\n');
		const chapters: Chapter[] = [];
		// Match timestamps like 0:00, 1:23, 01:23, 1:23:45
		const timestampRegex = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+(.+)$/;

		for (const line of lines) {
			const trimmed = line.trim();
			const match = trimmed.match(timestampRegex);
			if (match) {
				const hours = match[1] ? parseInt(match[1]) : 0;
				const minutes = parseInt(match[2]);
				const seconds = parseInt(match[3]);
				const totalSeconds = hours * 3600 + minutes * 60 + seconds;
				const label = match[4].trim();

				let formatted: string;
				if (hours > 0) {
					formatted = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
				} else {
					formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
				}

				chapters.push({ time: totalSeconds, label, formatted });
			}
		}

		return chapters;
	}

	let chapters = $derived(parseChapters(description));
</script>

{#if chapters.length > 0}
	<div class="bg-yt-surface rounded-xl p-3">
		<h3 class="text-yt-text mb-2 text-sm font-medium">Chapters</h3>
		<div class="flex flex-col">
			{#each chapters as chapter (chapter.time)}
				<button
					onclick={() => onSeek(chapter.time)}
					class="hover:bg-yt-surface-hover flex items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors"
				>
					<span class="text-yt-accent w-14 shrink-0 font-mono text-xs">
						{chapter.formatted}
					</span>
					<span class="text-yt-text text-sm">
						{chapter.label}
					</span>
				</button>
			{/each}
		</div>
	</div>
{/if}
