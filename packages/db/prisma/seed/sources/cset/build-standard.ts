import { cleanText, firstLine, joinSections, referenceLine, sentenceCase, stripTrailingPeriod, truncate } from './text';
import type { BuiltRequirement, ModuleBuild, ModuleDef, RequirementJson, StandardModuleJson } from './types';

const bySeq = (a: RequirementJson, b: RequirementJson): number => (a.sequence ?? 0) - (b.sequence ?? 0) || a.id - b.id;

/**
 * Standard (requirement-mode) sets: one requirement row per CSET requirement, family =
 * standard category, control = category + sub-category (AWWA's sub-category equals its
 * category, so one control per category there).
 */
export function buildStandard(module: ModuleDef, doc: StandardModuleJson): ModuleBuild {
  const families = new Map<string, string>();
  const requirements: BuiltRequirement[] = [];
  const seen = new Set<string>();
  const order = new Map<string, number>();

  for (const r of [...doc.requirements].sort(bySeq)) {
    const category = cleanText(r.category) || 'General';
    const subCategory = cleanText(r.subCategory) || category;
    const familyKey = category;
    if (!order.has(familyKey)) order.set(familyKey, order.size);
    families.set(familyKey, category);
    const controlKey = subCategory === category ? `c:${category}` : `c:${category}|${subCategory}`;
    const identifier = r.title.trim();
    if (!identifier || seen.has(identifier)) throw new Error(`${module.key}: duplicate or empty identifier ${identifier} (requirement ${r.id})`);
    seen.add(identifier);
    const text = cleanText(r.text);
    const name = truncate(sentenceCase(stripTrailingPeriod(firstLine(text))), 200);
    const refs = referenceLine(r.references);
    requirements.push({
      identifier,
      name,
      description: joinSections([
        `${identifier}: ${text}`,
        r.supplemental ? `Guidance: ${cleanText(r.supplemental)}` : null,
        r.implementationRecommendations ? `Implementation: ${cleanText(r.implementationRecommendations)}` : null,
        refs ? `References: ${refs}.` : null,
        `Family: ${category}${subCategory !== category ? ` > ${subCategory}` : ''}.`,
        `Source: ${module.attribution}.`,
      ]),
      familyLabel: category,
      familyKey,
      controlKey,
      controlName: subCategory === category ? category : `${category}: ${subCategory}`,
      controlDescription: `${subCategory} requirements of ${doc.fullName ?? module.name}. Family: ${category}.`,
      summary: `${identifier} ${name}`,
    });
  }
  return { module, requirements, families };
}
