/**
 * Duplicate detection for imported trades that respects multiplicity.
 *
 * A single order is often reported as several identical fills (e.g. three
 * "sell 100 @ 4.71" lines on the same day). Treating "an identical row exists"
 * as "already imported" collapses those fills into one on first import, and on
 * a re-import hides the ones that went missing. Instead, the Nth occurrence of
 * a key in a file counts as already imported only if the database already holds
 * at least N rows with that key.
 */

/** True when this is the `occurrence`-th (1-based) copy of a key in the file and the DB already holds that many. */
export function isAlreadyImported(existingCount: number, occurrence: number): boolean {
  return existingCount >= occurrence;
}

/**
 * Parse-time filter: returns the items that are NOT already in the database,
 * keeping the right number of copies of each identical item.
 * `existingCounts` maps a key to how many rows with that key the DB holds.
 */
export function filterNewByOccurrence<T>(
  items: T[],
  keyOf: (item: T) => string,
  existingCounts: Map<string, number>,
): T[] {
  const seen = new Map<string, number>();
  return items.filter((item) => {
    const key = keyOf(item);
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    return !isAlreadyImported(existingCounts.get(key) ?? 0, occurrence);
  });
}
