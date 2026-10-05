import { filterNewByOccurrence, isAlreadyImported, createSubmitGuard } from '../src/services/import/dedupe';

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

  it('a partial re-import surfaces only the missing copy, and confirm must insert it', () => {
    // Regression: the preview sends just the one missing copy. A per-trade existence
    // check at confirm saw 1 matching row and skipped it, so it could never be added.
    // The preview is the only place that decides what is new; what it returns is inserted as sent.
    const file = ['DRAM|buy|27|69.65', 'DRAM|buy|27|69.65'];
    const sentToConfirm = filterNewByOccurrence(file, key, new Map([['DRAM|buy|27|69.65', 1]]));
    expect(sentToConfirm).toEqual(['DRAM|buy|27|69.65']);
  });
});

describe('createSubmitGuard', () => {
  it('refuses an identical batch submitted again within the window, but not a different one', () => {
    let t = 0;
    const g = createSubmitGuard(60_000, () => t);
    expect(g.isDuplicate('batch-A')).toBe(false);
    t = 5_000;
    expect(g.isDuplicate('batch-A')).toBe(true);
    expect(g.isDuplicate('batch-B')).toBe(false);
  });

  it('allows the same batch again after the window, or after forget (failed insert retry)', () => {
    let t = 0;
    const g = createSubmitGuard(60_000, () => t);
    g.isDuplicate('A');
    t = 61_000;
    expect(g.isDuplicate('A')).toBe(false);
    g.forget('A');
    expect(g.isDuplicate('A')).toBe(false);
  });
});
