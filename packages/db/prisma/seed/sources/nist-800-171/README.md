# NIST SP 800-171 Rev 2 and Rev 3 seed generator

Generates the framework-editor seed files for two platform frameworks, **NIST SP 800-171 Rev 2**
and **NIST SP 800-171 Rev 3**, grouped under one framework family, from NIST's official
machine-readable sources. Output lands next to the upstream seed files with the suffix
`.nist-800-171.json`, so upstream files are never edited and rebases stay clean.

```bash
bun packages/db/prisma/seed/sources/nist-800-171/index.ts
```

The run is deterministic: ids are `sha256` of NIST identifiers (never text) truncated to the
upstream `prefix_<24 hex>` shape, arrays are sorted by id, and a second run is byte-identical.
Every assertion in `validate.ts` must pass or nothing is written.

## Inputs (`inputs/`)

| File | Source | Used for |
| --- | --- | --- |
| `SP_800_171_2_0_0.json` | NIST CPRT export `.../framework/version/SP_800_171_2_0_0/export/json?element=all` | Rev 2 requirement text, basic/derived type, discussion |
| `SP_800_171_3_0_0.json` | NIST CPRT export `SP_800_171_3_0_0` | Rev 3 families, 97 active + 33 withdrawn requirements, sub-parts, 422 determinations, 88 ODPs, examine/interview/test, discussion, withdrawal reasons and `incorporated_into` / `addressed_by` links |
| `SP_800_171_A_3_0_0.json` | NIST CPRT export `SP_800_171_A_3_0_0` | Kept for reference; same assessment content as the Rev 3 export |
| `171a-r2-objectives.csv` | Sheet `SP800-171A` of NIST's SP 800-171A Rev 2 assessment-procedure workbook (3.1.19's examine/interview/test filled in from the PDF, which the workbook export left blank) | 320 Rev 2 assessment objectives with examine/interview/test objects |
| `r2-to-r3-change-analysis.csv` | Sheet `Change Analysis 800-171 R2-R3` of `sp800-171r2-to-r3-analysis.xlsx` (csrc.nist.gov) | Change flags and NIST's summary of changes per requirement |
| `frequencies.csv` | BomberJacket Networks cmmc-conmon (`cmcctool export-comp`) | BNI's recommended monitoring level per Rev 2 objective; sets each Rev 2 task's default frequency |
| `r2-titles.csv` | Hand-maintained, optional | Titles for Rev 2 controls (for example CMMC practice names). Empty by default: the Rev 3 title of the requirement a Rev 2 requirement maps to is used |

CPRT exports need a browser User-Agent header when downloaded with curl.

## Data model (evidence per assessment objective)

The two revisions are **independent**; nothing is shared between them except the family
policies. A client is assessed per assessment objective, so the objective is the evidence
container.

- **Requirement rows are assessment objectives.** Rev 2: `3.1.1[a]` (the 23 single-objective
  requirements use `[a]`). Rev 3: determination statements `A.03.01.01.a[01]` plus
  organization-defined parameters `A.03.01.01.ODP[01]`, which SP 800-171A Rev 3 scores as
  objectives in their own right. 320 + 510 = 830 rows.
- **One control per security requirement and revision:** 110 Rev 2 controls (`3.1.1 Account
  Management`) and 97 Rev 3 controls (`03.01.01 Account Management`). Each control's objectives
  link to it; the Rev 2 -> Rev 3 disposition is recorded in the description only.
- **One evidence task per assessment objective:** 830 tasks named `3.1.1[a] Authorized users are
  identified`. Each task description lists the artifacts that satisfy the objective, taken from
  the requirement's SP 800-171A examine and test objects and sorted into four categories
  (`artifacts.ts`): policy, procedure / SOP, configuration evidence, operational evidence. ODP
  tasks record the parameter value and where it is documented and enforced. Rev 2 task
  frequency comes from `frequencies.csv`; Rev 3 tasks default to quarterly (ODPs yearly).
- **17 policies**, one per Rev 3 family, shared by both revisions, as structural TipTap
  documents with `{{COMPANY}}` placeholders (`policy-content.ts`). Rev 2 controls link to the
  policy of their own family (14), Rev 3 controls to all 17.
- Policy and task links are emitted both as the global many-to-many relations and as the
  framework-scoped `FrameworkEditorControlPolicyTemplateLink` / `...TaskTemplateLink` rows that
  the manifest builder reads (207 policy links, 830 task links).
- `derived/master-artifact-list.csv` is a reference list, one row per objective, with the four
  artifact columns and the task frequency.

`controlFamily` and `requirementFamily` use the `AC - Access Control` form from the framework
import DTO.

## Correcting data later

Edit the inputs, rerun the generator, then append a new entry to
`seed/versions/nist-800-171.json` with release notes and reseed. Ids are stable, so
`FrameworkSyncOperation` diffs see edits as updates rather than remove-plus-add. Relation pairs
that disappear between runs are written to `*.unlink.nist-800-171.json` so the seed can
disconnect them.

Version history: `1.0.0` shared-control model (108 controls, one task per control);
`2.0.0` per-objective model described above.
