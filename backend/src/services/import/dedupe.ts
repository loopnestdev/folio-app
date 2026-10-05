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

/**
 * Double-submit guard for the confirm step.
 *
 * Confirm receives exactly the trades the preview decided were new, so it must insert
 * them as sent: a per-trade "does a matching row exist?" check there cannot tell a
 * genuinely missing copy of an identical fill from one that is already saved. What it
 * was really protecting against is the same batch being submitted twice (double
 * click, retry), so guard that explicitly: an identical batch for the same portfolio
 * within `windowMs` is refused.
 */
export function createSubmitGuard(windowMs = 60_000, now: () => number = Date.now) {
  const recent = new Map<string, number>();
  return {
    /** Returns true if this exact batch was already submitted within the window; otherwise records it. */
    isDuplicate(batchKey: string): boolean {
      const t = now();
      for (const [k, at] of recent) if (t - at > windowMs) recent.delete(k);
      if (recent.has(batchKey)) return true;
      recent.set(batchKey, t);
      return false;
    },
    /** Forget a batch (used when the insert failed so a retry is allowed). */
    forget(batchKey: string) { recent.delete(batchKey); },
  };
}
