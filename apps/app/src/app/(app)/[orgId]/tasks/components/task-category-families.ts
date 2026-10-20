/**
 * Group evidence categories (one per control) under their control family so the
 * evidence page nests Family -> Control -> tasks (one task per assessment objective
 * for NIST SP 800-171). Frameworks without families keep the flat category grid.
 */
export interface CategoryWithFamily {
  id: string;
  name: string;
  controlFamily?: string | null;
}

/** Sentinel for categories without a family; avoids colliding with a real family named "Other". */
export const UNCATEGORIZED_CATEGORY_FAMILY = '__uncategorized__';

export const UNCATEGORIZED_CATEGORY_FAMILY_LABEL = 'Other';

export interface CategoryFamilyGroup<C extends CategoryWithFamily> {
  family: string;
  label: string;
  categories: C[];
}

/** Natural order, so `3.1.2` sorts before `3.1.10`. */
export function compareCategoryNames(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true });
}

/**
 * Returns `null` when no category carries a family (render the flat grid), otherwise the
 * families in natural order with their categories sorted by name; categories without a
 * family go last under "Other".
 */
export function groupCategoriesByFamily<C extends CategoryWithFamily>(
  categories: C[],
): CategoryFamilyGroup<C>[] | null {
  if (!categories.some((category) => category.controlFamily?.trim())) return null;

  const byFamily = new Map<string, C[]>();
  const other: C[] = [];
  for (const category of categories) {
    const family = category.controlFamily?.trim();
    if (family) {
      const existing = byFamily.get(family);
      if (existing) existing.push(category);
      else byFamily.set(family, [category]);
    } else {
      other.push(category);
    }
  }

  const groups: CategoryFamilyGroup<C>[] = Array.from(byFamily.entries())
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([family, items]) => ({
      family,
      label: family,
      categories: items.sort(compareCategoryNames),
    }));

  if (other.length > 0) {
    groups.push({
      family: UNCATEGORIZED_CATEGORY_FAMILY,
      label: UNCATEGORIZED_CATEGORY_FAMILY_LABEL,
      categories: other.sort(compareCategoryNames),
    });
  }

  return groups;
}
