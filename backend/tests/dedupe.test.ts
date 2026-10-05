import { filterNewByOccurrence, isAlreadyImported } from '../src/services/import/dedupe';

const key = (s: string) => s;

describe('import duplicate detection respects identical fills', () => {
  it('keeps every copy of an identical fill on a first import', () => {
    // Three identical "sell 100 @ 4.71" fills used to collapse into one.
    const fills = ['TE|sell|100|4.71', 'TE|sell|100|4.71', 'TE|sell|100|4.71', 'TE|sell|510|4.71'];
    expect(filterNewByOccurrence(fills, key, new Map())).toEqual(fills);
  });

  it('skips everything on a full re-import', () => {
    const fills = ['A', 'A', 'B'];
    expect(filterNewByOccurrence(fills, key, new Map([['A', 2], ['B', 1]]))).toEqual([]);
  });

  it('re-surfaces only the copies that are missing', () => {
    // DB holds 1 of 2 identical fills (the second was lost by the old check).
    const fills = ['DRAM|buy|27|69.65', 'DRAM|buy|27|69.65', 'DRAM|buy|7|69.65'];
    const existing = new Map([['DRAM|buy|27|69.65', 1], ['DRAM|buy|7|69.65', 1]]);
    expect(filterNewByOccurrence(fills, key, existing)).toEqual(['DRAM|buy|27|69.65']);
  });

  it('does not add copies when the DB already has more than the file', () => {
    expect(filterNewByOccurrence(['A'], key, new Map([['A', 3]]))).toEqual([]);
  });

  it('isAlreadyImported: the Nth copy is a duplicate only if N copies exist', () => {
    expect(isAlreadyImported(0, 1)).toBe(false);
    expect(isAlreadyImported(1, 1)).toBe(true);
    expect(isAlreadyImported(1, 2)).toBe(false);
    expect(isAlreadyImported(2, 2)).toBe(true);
  });

  it('the confirm-time sequence inserts each copy once and then skips on re-run', () => {
    // Mirrors the route: the DB count grows as copies are inserted within the batch.
    const run = (dbCount: number, copies: number) => {
      let count = dbCount; let inserted = 0;
      for (let occ = 1; occ <= copies; occ++) { if (!isAlreadyImported(count, occ)) { count++; inserted++; } }
      return { inserted, count };
    };
    expect(run(0, 3)).toEqual({ inserted: 3, count: 3 });
    expect(run(3, 3)).toEqual({ inserted: 0, count: 3 });
    expect(run(1, 2)).toEqual({ inserted: 1, count: 2 });
    expect(run(2, 3)).toEqual({ inserted: 1, count: 3 });
  });
});
