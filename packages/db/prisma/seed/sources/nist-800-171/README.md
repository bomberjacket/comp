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
| `171a-r2-objectives.csv` | Sheet `SP800-171A` of NIST's SP 800-171A Rev 2 assessment-procedure workbook | 320 Rev 2 assessment objectives with examine/interview/test objects |
| `r2-to-r3-change-analysis.csv` | Sheet `Change Analysis 800-171 R2-R3` of `sp800-171r2-to-r3-analysis.xlsx` (csrc.nist.gov) | Change flags and NIST's summary of changes per requirement |
| `frequencies.csv` | BomberJacket Networks cmmc-conmon (`cmcctool export-comp`) | BNI's recommended monitoring level per Rev 2 objective; drives default task frequency |
| `objective-overrides.csv` | Hand-maintained | Optional per-objective control assignment for the two requirements NIST split across two Rev 3 requirements (3.4.7, 3.7.2) |

CPRT exports need a browser User-Agent header when downloaded with curl.

## Data model

- **Requirement rows are assessment objectives.** Rev 2: `3.1.1[a]` (the 23 single-objective
  requirements use `[a]`). Rev 3: determination statements `A.03.01.01.a[01]` plus
  organization-defined parameters `A.03.01.01.ODP[01]`, which SP 800-171A Rev 3 scores as
  objectives in their own right.
- **One shared control set, keyed to Rev 3.** 97 controls named `03.01.01 Account Management`
  carry both frameworks: Rev 2 objectives link to them via NIST's disposition of each Rev 2
  requirement (77 carried, 22 incorporated into another Rev 3 requirement). The 11 Rev 2
  requirements NIST withdrew without a home (5 "addressed by", 6 withdrawn outright) get a
  `(Rev 2 only)` control. 108 controls in total.
- **17 policies**, one per Rev 3 family, as structural TipTap documents with `{{COMPANY}}`
  placeholders. The prose is a draft for CCA review; edit `content` only.
- **108 tasks**, one per control, `MANUAL`, with the dominant BNI monitoring level of the
  control's Rev 2 objectives mapped onto Comp AI's `monthly | quarterly | yearly`.
- Policy and task links are emitted both as the global many-to-many relations and as the
  framework-scoped `FrameworkEditorControlPolicyTemplateLink` / `...TaskTemplateLink` rows that
  the manifest builder reads.

`controlFamily` and `requirementFamily` use the `AC - Access Control` form from the framework
import DTO.

## Correcting data later

Edit the inputs, rerun the generator, then append a new entry (for example `1.0.1`) to
`seed/versions/nist-800-171.json` with release notes and reseed. Ids are stable, so
`FrameworkSyncOperation` diffs see edits as updates rather than remove-plus-add. Relation pairs
that disappear between runs are written to `*.unlink.nist-800-171.json` so the seed can
disconnect them.
