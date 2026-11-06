# CISA CSET frameworks: extractor, inputs and seed generator

CISA's Cyber Security Evaluation Tool (CSET, github.com/cisagov/cset, MIT licence,
Battelle Energy Alliance / INL) ships its assessment content in a SQL Server database.
This folder turns that content into JSON inputs (`inputs/cset-*.json`, via `extract/`)
and then into Comp AI framework-editor seed files suffixed `.cset.json`:

```bash
bun packages/db/prisma/seed/sources/cset/index.ts
```

Eight frameworks under one family, "CISA assessments (CSET)". Ids are `sha256` of CSET
identifiers in the `comp-cset/v1` namespace (never text), arrays are sorted, and a second
run is byte-identical. `validate.ts` pins the counts; nothing is written if a check fails.

## Data model

| Row | Maturity modules (CPG 2.0, IMR, CRR, EDM, RRA, MVRA) | Standard sets (HHS 405(d), AWWA 4.0) |
| --- | --- | --- |
| Requirement | one per answerable question, `identifier` = CSET title (`1.A`, `EH:G1.Q1`, `AM:G2.Q1-P`). CPG 2.0's IT/OT child rows are answer slots, not questions, so they fold into the goal (34 rows); CRR/EDM facet sub-questions stay, named with their parent | one per requirement row, `identifier` = CSET title (`1.S.A.1`, `IA-1`) |
| `requirementFamily` | top grouping, `AM - Asset Management` when CSET has a code | standard category |
| Control | the question's goal grouping (`AM: Goal 1 - …`, `Dynamic Reconfiguration (Adaptive Response)`); CPG 2.0 has no goal level, so one control per goal question | category + sub-category (AWWA: one per category) |
| Policy | one per family, structural TipTap draft listing the family's controls | same |
| Task | one evidence task per control, quarterly, listing the control's items and how to answer | same |

Descriptions keep CSET's guidance (question intent, criteria, work products), CPG 2.0's
outcome / scope / risk / recommended action / IT and OT implementation criteria / cost-
impact-complexity / CISA services, references (CSF, 800-53, 800-82, CERT-RMM) and a
`Source:` attribution line. Counts: CPG 2.0 34 requirements / 34 controls / 6 families;
IMR 88 / 20 / 6; HHS 405(d) 63 / 19 / 10; MVRA 524 / 138 / 4; CRR 397 / 82 / 10;
EDM 116 / 20 / 4; RRA 48 / 10 / 1; AWWA 4.0 100 / 12 / 12.

`derived/answer-profiles.json` records, per framework, the CSET answer options
(`Y,I,S,N`, `Y,I,N`, `Y,N`, `Y,A,N`, `Y,N,NA,A`), whether answers are per IT/OT domain
(CPG 2.0 only) and the scoring model (`cpg`, `mil`, `tier`, `standard`); the answer layer
seeds its profile table from it.

## Extractor

## Source

The authoritative source is the database of a CSET standalone install (v13.0.0.0,
LocalDB instance `(localdb)\INLLocalDb2022`, database `CSETWeb`). The upgrade scripts in
the CSET source tree only carry models added after v10, so they are not used.

```powershell
# 1. dump the content tables to CSV (untrusted data; keep it outside the repo)
pwsh packages/db/prisma/seed/sources/cset/extract/dump-localdb.ps1 -OutDir C:\path\to\cset-db
# 2. write inputs/cset-*.json
bun packages/db/prisma/seed/sources/cset/extract/index.ts --csv C:\path\to\cset-db
```

The run is deterministic (sorted by sequence then id, 2-space JSON, LF) and asserts the
question, grouping and requirement counts below; a mismatch means CSET's content changed
and the counts in `extract/index.ts` need a deliberate update.

## Modules (`inputs/`)

| File | CSET module | Answer options | Content |
| --- | --- | --- | --- |
| `cset-cpg2.json` | Cross-Sector Cybersecurity Performance Goals 2.0 (model 21) | Y, I, S, N | 34 goals in 6 CSF 2.0 functions (`1.A`–`6.A`); each goal has two child rows, IT and OT, that carry the answers. Goals carry security practice, outcome, scope, recommended action, risk addressed, CISA services, IT/OT implementation criteria, cost/impact/complexity, and CSF 2.0 / 800-53 r5 / 800-82 r3 references. 102 rows, 6 groupings |
| `cset-imr.json` | Incident Management Review (model 15) | Y, I, N | 88 practices in 6 domains and 20 goals (`EH:G1.Q1`), 26 groupings. Retired by CISA in v13 (card hidden, content intact) |
| `cset-crr.json` | Cyber Resilience Review (model 4) | Y, I, N | 397 practices in 10 domains and 82 goals, with 98 sub-questions. Retired in v13 |
| `cset-edm.json` | External Dependencies Management (model 3) | Y, I, N | 116 practices, 3 domains plus MIL 1–5 groupings. Retired in v13 |
| `cset-rra.json` | Ransomware Readiness Assessment (model 5) | Y, N | 48 practices in 10 areas, three tiers (Basic, Intermediate, Advanced). Retired in v13 |
| `cset-mvra.json` | Minimum Viable Resilience Assessment, draft (model 9) | Y, A, N | 524 questions in Anticipate / Withstand / Recover / Adapt, three tiers, some with frequency options. Retired in v13 |
| `cset-hhs405d.json` | Healthcare 405(d) Cybersecurity Practices, Technical Volume 1 (set `HHS405d`) | Y, N, NA, A | 63 requirements in 10 categories (`1.S.A.1`), requirement mode |
| `cset-awwa40.json` | AWWA Cybersecurity Guidance v4.0 (set `AWWA 4.0`) | Y, N, NA, A | 100 requirements in 12 practice categories (`IA-1`). AWWA content redistributed by CISA inside CSET under CSET's MIT licence; cite as "AWWA, via CISA CSET v13" |

Text fields are kept exactly as CSET stores them, HTML included; the generator is where
tags are stripped and names shortened.

## Shape

Maturity module: `{ kind: 'maturity', source, modelId, modelName, title, answerOptions[],
levels[], groupings[{ id, title, parentId, sequence, ... }], questions[{ id, title, text,
levelId, groupingId, parentQuestionId, scope, securityPractice, outcome, recommendAction,
riskAddressed, services, implementationGuides, props{}, options[], references[], referenceText[] }] }`.

Standard module: `{ kind: 'standard', source, setName, fullName, requirements[{ id,
sequence, title, text, supplemental, category, subCategory, weight,
implementationRecommendations, references[] }] }`.

`extract/tables.ts` lists the tables read; `dump-localdb.ps1` keeps the same list and
skips tables a CSET version does not have.
