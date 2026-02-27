<script lang="ts">
	/**
	 * @fileoverview VideoChapters component that parses and displays chapter timestamps.
	 * @component
	 *
	 * Extracts chapter markers from the video description by scanning for lines that start
	 * with a timestamp pattern (e.g., "0:00 Introduction", "1:23:45 Conclusion"). YouTube
	 * creators add chapters to descriptions in this plain-text format, so we parse them
	 * with a regex rather than relying on a separate API.
	 *
	 * Each chapter is rendered as a clickable button that calls onSeek() with the timestamp
	 * in seconds, which causes the VideoPlayer to reload with the new start time.
	 *
	 * The component renders nothing if no chapters are found in the description.
	 */

	/** @prop description - The full video description text to scan for chapter timestamps */
	/** @prop onSeek - Callback invoked with the chapter's time in seconds when clicked */
	let { description, onSeek }: { description: string; onSeek: (seconds: number) => void } =
		$props();

	/** Represents a single parsed chapter with its timestamp and label */
	interface Chapter {
		/** Total seconds from the start of the video */
		time: number;
		/** Chapter title text (everything after the timestamp on that line) */
		label: string;
		/** Human-readable timestamp string for display (e.g., "1:23" or "1:02:30") */
		formatted: string;
	}

	/**
	 * Scans each line of the description for timestamp patterns and extracts chapters.
	 *
	 * The regex `^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+(.+)$` matches:
	 * - An optional hours group: 1-2 digits followed by ":"
	 * - A required minutes group: 1-2 digits
	 * - A required seconds group: exactly 2 digits
	 * - Everything after the whitespace becomes the chapter label
	 *
	 * Examples of matched lines: "0:00 Intro", "12:34 Main topic", "1:02:30 Finale"
	 *
	 * @param desc - The full video description text
	 * @returns Array of parsed Chapter objects, in the order they appear in the description
	 */
	function parseChapters(desc: string): Chapter[] {
		const lines = desc.split('\n');
		const chapters: Chapter[] = [];
		const timestampRegex = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+(.+)$/;

		for (const line of lines) {
			const trimmed = line.trim();
			const match = trimmed.match(timestampRegex);
			if (match) {
				const hours = match[1] ? parseInt(match[1]) : 0;
				const minutes = parseInt(match[2]);
				const seconds = parseInt(match[3]);
				/* Convert H:M:S to total seconds for the embed player's &start= param */
				const totalSeconds = hours * 3600 + minutes * 60 + seconds;
				const label = match[4].trim();

				/* Re-format the timestamp for consistent display (pad minutes/seconds) */
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

	/** Reactively re-parse chapters whenever the description prop changes */
	let chapters = $derived(parseChapters(description));
</script>

<!-- Only render the chapters panel if timestamps were found in the description -->
{#if chapters.length > 0}
	<div class="bg-yt-surface rounded-xl p-3">
		<h3 class="text-yt-text mb-2 text-sm font-medium">Chapters</h3>
		<div class="flex flex-col">
			<!-- Keyed by time (seconds) since each chapter has a unique timestamp -->
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
