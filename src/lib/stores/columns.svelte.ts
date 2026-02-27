/**
 * @fileoverview Shared responsive columns rune.
 *
 * Extracts the duplicated `updateColumns` resize effect from multiple pages
 * into a single reusable utility. Returns a reactive `columns` value that
 * updates on window resize.
 */

/**
 * Create a reactive columns count based on window width breakpoints.
 *
 * Breakpoints match Tailwind's defaults:
 * - xl (1280px+): 4 columns
 * - lg (1024px+): 3 columns
 * - sm (640px+):  2 columns
 * - below 640px:  1 column
 *
 * @param maxColumns - Maximum number of columns (default 4). For pages that
 *   don't need 4 columns (e.g., liked videos maxes at 3), pass a lower value.
 */
export function useColumns(maxColumns: number = 4) {
	let columns = $state(1);

	$effect(() => {
		function updateColumns() {
			const w = window.innerWidth;
			if (maxColumns >= 4 && w >= 1280) columns = 4;
			else if (maxColumns >= 3 && w >= 1024) columns = 3;
			else if (w >= 640) columns = 2;
			else columns = 1;
		}
		updateColumns();
		window.addEventListener('resize', updateColumns);
		return () => window.removeEventListener('resize', updateColumns);
	});

	return {
		get value() {
			return columns;
		}
	};
}
