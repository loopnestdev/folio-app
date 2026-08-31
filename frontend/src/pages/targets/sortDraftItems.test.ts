import { describe, it, expect } from 'vitest';
import { sortDraftItems } from './TargetPortfolioDetailPage';

type Row = { key: string; category: string; allocation_pct: string };

const rows = (...specs: [string, string, string][]): Row[] =>
  specs.map(([key, category, allocation_pct]) => ({ key, category, allocation_pct }));

const keys = (r: Row[]) => r.map((x) => x.key);

describe('sortDraftItems', () => {
  it('sorts by category alphabetically ascending', () => {
    const input = rows(['a', 'Tech', '10'], ['b', 'Energy', '20'], ['c', 'Banks', '30']);
    expect(keys(sortDraftItems(input, 'category', 'asc'))).toEqual(['c', 'b', 'a']);
  });

  it('sorts by category descending', () => {
    const input = rows(['a', 'Tech', '10'], ['b', 'Energy', '20'], ['c', 'Banks', '30']);
    expect(keys(sortDraftItems(input, 'category', 'desc'))).toEqual(['a', 'b', 'c']);
  });

  it('is case-insensitive for category', () => {
    const input = rows(['a', 'tech', '10'], ['b', 'Energy', '20']);
    expect(keys(sortDraftItems(input, 'category', 'asc'))).toEqual(['b', 'a']);
  });

  it('always sinks blank categories to the bottom, both directions', () => {
    const input = rows(['a', 'Tech', '10'], ['b', '', '20'], ['c', 'Banks', '30'], ['d', '  ', '5']);
    expect(keys(sortDraftItems(input, 'category', 'asc'))).toEqual(['c', 'a', 'b', 'd']);
    expect(keys(sortDraftItems(input, 'category', 'desc'))).toEqual(['a', 'c', 'b', 'd']);
  });

  it('sorts by allocation numerically, not lexically', () => {
    const input = rows(['a', 'x', '9'], ['b', 'y', '100'], ['c', 'z', '20']);
    expect(keys(sortDraftItems(input, 'allocation', 'asc'))).toEqual(['a', 'c', 'b']);
    expect(keys(sortDraftItems(input, 'allocation', 'desc'))).toEqual(['b', 'c', 'a']);
  });

  it('treats blank / non-numeric allocation as 0', () => {
    const input = rows(['a', 'x', ''], ['b', 'y', '15'], ['c', 'z', '-5']);
    expect(keys(sortDraftItems(input, 'allocation', 'asc'))).toEqual(['c', 'a', 'b']);
  });

  it('does not mutate the input array', () => {
    const input = rows(['a', 'B', '2'], ['b', 'A', '1']);
    const snapshot = keys(input);
    sortDraftItems(input, 'category', 'asc');
    expect(keys(input)).toEqual(snapshot);
  });
});
