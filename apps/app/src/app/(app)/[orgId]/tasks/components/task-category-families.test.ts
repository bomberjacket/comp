import { describe, expect, it } from 'vitest';
import {
  UNCATEGORIZED_CATEGORY_FAMILY,
  compareCategoryNames,
  groupCategoriesByFamily,
} from './task-category-families';

describe('groupCategoriesByFamily', () => {
  it('returns null when no category has a family (flat grid)', () => {
    expect(
      groupCategoriesByFamily([
        { id: 'c1', name: 'Access reviews' },
        { id: 'c2', name: 'Backups', controlFamily: null },
        { id: 'c3', name: 'Logging', controlFamily: '  ' },
      ]),
    ).toBeNull();
  });

  it('groups by family in natural order, categories sorted naturally, Other last', () => {
    const groups = groupCategoriesByFamily([
      { id: 'c10', name: '3.1.10 Session Lock', controlFamily: 'AC - Access Control' },
      { id: 'c2', name: '3.1.2 Transaction Control', controlFamily: 'AC - Access Control' },
      { id: 'u', name: 'Uncategorized' },
      { id: 'at', name: '3.2.1 Literacy Training', controlFamily: 'AT - Awareness and Training' },
      { id: 'c1', name: '3.1.1 Account Management', controlFamily: 'AC - Access Control' },
    ]);
    expect(groups).not.toBeNull();
    expect(groups!.map((g) => g.family)).toEqual([
      'AC - Access Control',
      'AT - Awareness and Training',
      UNCATEGORIZED_CATEGORY_FAMILY,
    ]);
    expect(groups![0].categories.map((c) => c.id)).toEqual(['c1', 'c2', 'c10']);
    expect(groups![2].label).toBe('Other');
    expect(groups![2].categories.map((c) => c.id)).toEqual(['u']);
  });
});

describe('compareCategoryNames', () => {
  it('sorts numerically inside names', () => {
    const names = ['3.1.10 B', '3.1.2 A', '3.1.1 C'].map((name) => ({ name }));
    expect(names.sort(compareCategoryNames).map((n) => n.name)).toEqual([
      '3.1.1 C',
      '3.1.2 A',
      '3.1.10 B',
    ]);
  });
});
