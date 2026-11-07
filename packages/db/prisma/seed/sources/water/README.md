# Water and wastewater framework (BNI method): inputs and seed generator

Turns EPA's water-sector cybersecurity checklist into a Comp AI framework that rides on the
CISA CPG 2.0 backbone seeded by `../cset`, plus AWWA-structured plan documents, CISA
tabletop interview questions and (through the API, not this seed) EPA's procurement
checklist for suppliers and integrators.

```bash
bun packages/db/prisma/seed/sources/cset/index.ts    # first: the CPG 2.0 controls it borrows
bun packages/db/prisma/seed/sources/water/index.ts
```

Writes `primitives/*.water.json`, `relations/*.water.json`, `versions/water.json` and
`primitives/FrameworkAnswerProfile.water.json`; ids are `sha256` of EPA item numbers and
CPG goal ids in the `comp-water/v1` namespace; a second run is byte-identical; `validate.ts`
pins the counts and checks that every borrowed CPG 2.0 id exists in the CSET set.

## Data model

| Row | Source |
| --- | --- |
| Family "Water sector (BNI method)" | — |
| Framework "Water and Wastewater Cybersecurity (EPA checklist on CISA CPG 2.0)", version "WCAT 3.1 / CPG 2.0" | — |
| 33 requirements, identifier `1.A` … `5.A`, family `1 - Identify` … `5 - Recover` | `inputs/wcat-3.1.json` (question, EPA priority flag, recommendation, fact sheet link) + `inputs/cpg-1.0.1-components.json` (outcome, risk, scope, CSF reference, cost/impact/complexity of the CPG 1.0.1 practice EPA numbers them after) |
| Controls: **none generated**; each requirement links to the CPG 2.0 goal control from the CSET set (`ct:cpg2:q:<goal>`), 27 goals in all | `inputs/wcat-to-cpg2.csv`, hand-curated (primary goal per item, optional secondary goals, note) |
| Evidence tasks: the CPG 2.0 goal's task from the CSET set, linked into this framework | — |
| 15 interview evidence tasks (`Interview evidence: <goal> <practice>`), yearly | `inputs/interview-questions.csv`, 87 questions chosen from `inputs/ctep-water-questions.json` and tagged to CPG 2.0 goals; questions for a goal the checklist never reaches are asked under the nearest goal (`INTERVIEW_FALLBACK` in `build.ts`) |
| 2 policies: Cybersecurity Risk Management Plan and Cyber Incident Response Plan, structured after AWWA's 2025 templates (headings only, BNI prompts), linked to Govern/Identify/Protect and Detect/Respond/Recover goals | `plans.ts` |
| Answer profile `Y, I, N, NA`, single domain, `standard` scoring (Yes met, In progress and No gaps, Not applicable excluded) | WCAT's Yes / In Progress / No / Not Applicable |

Because the controls are shared, an organization that adds both this framework and
"CISA Cross-Sector Cybersecurity Performance Goals 2.0" gets one control and one evidence
task per goal, and evidence collected once counts for both.

## Inputs and provenance

All source files are US government works (public domain). They are not committed; the
derived JSON is:

| File | From | Extract with |
| --- | --- | --- |
| `inputs/wcat-3.1.json` | `epa-water-cybersecurity-assessment-tool-3.1_links.xlsx` (epa.gov) | `python -I -X utf8 extract/xlsx-to-json.py --src <folder> --out inputs` |
| `inputs/epa-procurement-checklist.json` | `epa-cybersecurity-procurement-evaluation-checklist_06012026_1.xlsx` (epa.gov, v1.0 2025-10-14) | same |
| `inputs/cpg-1.0.1-components.json` | `20230320-CSF-aligned-Consolidated-Component-Listing.xlsx` (cisa.gov CPG 1.0.1) | same |
| `inputs/ctep-water-questions.json` | `Water-Wastewater-Systems-CTEP-Situation-Manual-112023-508.docx` (cisa.gov) | `python -I -X utf8 extract/ctep-questions.py --src <docx> --out inputs` |

The spreadsheets and the manual are untrusted downloads: the extractors use `zipfile` and
`xml.etree` only, run with `python -I`, and never evaluate workbook formulas or macros.
`inputs/epa-procurement-checklist.json` is consumed by `apps/api/scripts/generate-vendor-checklists.ts`
(the per-vendor procurement checklist feature), not by this seed.

AWWA's own template text is copyrighted and is not reproduced; only the section headings
are used, with attribution and a link to awwa.org.
