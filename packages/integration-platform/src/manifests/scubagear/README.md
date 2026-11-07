# CISA ScubaGear integration

Consumes the `ScubaResults_<uuid>.json` that CISA's ScubaGear (SCuBA baseline
assessment for Microsoft 365) writes, and turns every SCuBA policy into a check
mapped to a NIST SP 800-171 Rev 2 assessment objective.

ScubaGear runs on a Windows host (`Invoke-SCuBA -ProductNames * -M365Environment gcc`);
nothing here talks to the tenant. BNI runs it, uploads the file, the checks read it.

## How it is stored

A `scubagear` connection is `custom` auth with three credential fields:
`connectionName`, `environment` (commercial, gcc, gcchigh, dod) and `scubaResults`.
The results file is **compacted** (`compactScubaResults`: MetaData, Summary and the
per-policy rows are kept, `Raw` is dropped, HTML is stripped) and stored as the
`scubaResults` credential, so it is encrypted at rest and reaches `ctx.credentials`
on every run path (manual run, scheduled Trigger task, server run) with no runtime
changes. Uploading a new file is a credential rotation (`PUT …/credentials` merges).
The app's `scubagear-account-settings-body.tsx` does the compaction in the browser
and records tenant, timestamp, tool version and product list in the connection
metadata for display.

## Checks

- `scubagear-report`: a file is present, newer than `max_report_age_days`
  (default 90), with the per-product summary and the policies this build does not
  know (newer baselines) as evidence.
- `scuba-ms-<product>-<group>-<n>` (one per policy, 109 for ScubaGear 2.0.0): the
  policy's result becomes `Pass` → pass; `Fail` → finding (SHALL high, SHOULD
  medium); `Warning` (unmet SHOULD) → informational pass, or a low finding when the
  connection variable `should_policies` is `findings`; `Error` → medium finding;
  `N/A` (manual policy) and `Omitted` → log only. Every result carries the policy
  text, CISA's 800-53 controls, the Rev 2 objective, report id, timestamp and age.
  A stale report yields one "stale" finding per check instead of policy results.

Policies are matched by versionless id (`MS.AAD.3.2v3` still hits `MS.AAD.3.2`), so a
wording bump in a later ScubaGear does not orphan the check.

Results are shown per evidence task (task page → Automations tab), never per
connection: the upload calls `POST /v1/integrations/tasks/run-connection/:id`, which
runs every check against the tasks its objective maps to and sets each task's status
(failed / done) the same way the daily schedule does. Comp AI skips tasks marked
MANUAL, so the NIST seed marks the task templates of every objective with a check
AUTOMATED (`inputs/automated-objectives.json`, written by
`scripts/export-automated-objectives.ts`).

## Mapping

`objective-map.ts` is hand-curated: one Rev 2 objective per policy, chosen from the
policy text and CISA's SCuBA → 800-53 r5 mapping. Conventions: SI-8 mail hygiene →
3.14.2[b]; sharing, DLP and forwarding → 3.1.3[e]; "admins only" → 3.1.7[c]. Four
policies (password expiry, DMARC contacts, CSP, internal lobby bypass) have no Rev 2
counterpart and are evidence-only. Rev 3 objectives are a later pass.

## Regenerating the catalogue

`policies.generated.ts` comes from a full sample results file of the target ScubaGear
version plus its mapping CSV (both in the cisagov/ScubaGear repo, CC0):

```
bun run scripts/generate-scubagear-policies.ts \
  --results <ScubaResults_<uuid>.json> \
  --mapping <scuba-to-nist-sp-800-53-r5-fedramp-high.csv> \
  --version 2.0.0
```

Then add objectives for new policies in `objective-map.ts` (the test suite fails on a
key that no longer exists) and refresh `__tests__/fixtures/ScubaResults_sample.json`
(the sample with `Raw` removed).
