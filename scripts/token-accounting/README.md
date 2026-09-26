# Explicit token accounting

This offline utility normalizes declared token semantics, aggregates explicit groups,
and compares complete measurements. It does not load providers, credentials or the
environment, scan a repository, estimate prices, or infer quality or human effort.
It uses the repository's installed Bun/TypeScript/Zod dependencies.

## Input meaning

| `semantics` | Meaning of `input` | Complete prompt formula |
|---|---|---|
| `skvm-disjoint` | Input excluding separately counted cache reads and writes | `input + cacheRead + cacheWrite`, only when all three are known |
| `inclusive-input` | Full input already containing cache subsets | `input`, even when the cache breakdown is unknown |
| `unknown` | No supported partition or subset interpretation | `null`, with a diagnostic |

These are source assertions, not guesses based on field names. Supply an `evidence`
reference to the mapping or source contract. In `skvm-disjoint`, that evidence must
establish that cache writes do not overlap input or cache reads. In `inclusive-input`,
both cache fields are asserted to be subsets of input; their mutual overlap is not
assumed. Fresh input cannot be derived from these inclusive fields. When the overlap
with input is not known, use `unknown`.

`output` includes any reasoning subset. Optional `reasoningOutput` is retained and
checked against output, but never added again. `actualUSD` is independently supplied
money, never inferred from tokens. Null and absent fields stay unknown; explicit `0`
is known zero. Negative, fractional, unsafe, NaN and infinite token counters are
rejected, as are cache subsets greater than known inclusive input, reasoning greater
than known output, and arithmetic overflow. No clamp hides inconsistencies.

## Pure interface

`src/measurement/token-accounting.ts` exports `InputTokenSemantics`,
`UsageObservation`, `NormalizedTokenObservation`, `UsageGroup`,
`TokenGroupAggregate`, `TokenGroupComparison`, their component types, schemas and:

```ts
normalizeTokenObservation(observation)
aggregateTokenObservations(group, observations)
compareTokenGroups(baselineAggregate, candidateAggregate)
```

Normalization retains a detached `raw` record, nullable `promptTokens`, `totalTokens`
and `freshInputAndOutputTokens`, formula/source `basis`, and diagnostics. `totalTokens`
requires known prompt and output. Missing cache details can coexist with a complete
inclusive prompt; diagnostics therefore do not all mean the complete total is unknown.

Each aggregate metric has `knownSubtotal`, `completeRecords`, `unknownRecords`, and
`total`. `total` is null if any record lacks that metric, or the group is empty.
The subtotal of a derived metric sums only records with that complete derived metric;
it does not collect partial components from incomplete records. Raw input/output/cache
metrics have their own subtotals. `inputTokens` retains the group's declared meaning.
Records and groups are sorted without mutating caller inputs.

A group requires `id`, `account`, `source`, `semantics`, and `evidence`. Keep analysis,
author and development-agent accounts separate. Comparisons require distinct group
IDs, disjoint observation IDs, equal account/source, and equal semantics. When both
semantics are unknown, every delta and percentage is null with `unknown-semantics`. This
conservative source check avoids silently comparing different measurement contracts.
The caller still owns experimental comparability: this check cannot establish matched
tasks, equivalent quality, causal attribution or savings. Percent change is
`(candidate / baseline - 1) * 100`; zero baseline or incomplete totals produce null
and a reason. The returned metric `actualUSD` compares only reported money.

The module deliberately does not reuse `TokenUsageSchema` defaults, which turn absent
cache counters into zero. Its nullable fields apply the existing cost-accounting
principle that missing is not measured zero, without importing the AOT production
ledger or requiring invented human minutes and quality fields.

## Explicit JSON entry

```powershell
bun ./scripts/token-accounting/cli.ts --input=./scripts/token-accounting/fixtures/example.json
bun ./scripts/token-accounting/cli.ts --input=./observations.json --out=./comparison.json
```

Input is `token-accounting-input/v1`: `groups` contains group metadata plus an
`observations` array; `comparisons` contains explicit `{baseline, candidate}` group
IDs. See the small synthetic fixture. Unknown extra fields, versions, groups and
duplicate IDs are rejected. Output is deterministic `token-accounting-report/v1`.
Omitting `--out` writes JSON to stdout. Providing it creates a new file exclusively;
existing files (including the input itself) are never overwritten. Parent directories
must already exist. Failures exit 1. Reads and writes are local and explicit.

## Reproduce the AB clarification

The separate historical extractor reads only the 19 paths listed by the explicit AB
manifest: summary, panel, author summary, and 16 mapped provider run snapshots. It
checks usage against response/telemetry and summary, records byte hashes before and
after extraction, and keeps author and analysis accounts separate. The author records
are four archived aggregate observations, not a measured provider-call denominator.

```powershell
# Create an empty output directory first; the extractor will not overwrite outputs.
bun ./scripts/token-accounting/clarify-ab.ts --repo-root=. --input=./scripts/token-accounting/fixtures/ab-sources.json --out-dir=./new-ab-accounting-output
bun ./scripts/token-accounting/cli.ts --input=./results/skill-ir/token-accounting-semantics-20260927/observations.json
```

The extractor writes `observations.json`, `comparison.json`, and
`ab-accounting-clarification.json`. Its fixed AB requirements are deliberate; it is
not a general archive importer. Output files are individually exclusive, not a
multi-file transaction: after an I/O failure use another empty directory. Never point
outputs at original evidence. Original API usage was not retained here; mapped usage
cannot prove gateway compliance or recover missing fields defaulted by old adapters.
Author cache writes, provider-call count, human minutes and actual USD remain unknown.

AB complete prompt+output is MD 84,111 and DSL 86,869 (+3.2790003685605917%). The old
+11.969116945722647% remains the noncached input+output metric. Response-duration delta
is unchanged at -8.492489676207594%. This accounting correction does not change scores
or establish a method benefit. Source contracts and limitations are in the AG result
root's `source-semantics.json`; the original AB files are read-only.

## Verify and maintain

```powershell
bun test ./src/measurement/token-accounting.test.ts ./scripts/token-accounting
bun ./node_modules/typescript/bin/tsc --project ./scripts/token-accounting/tsconfig.json --noEmit
```

Tests cover semantic partitions, missing/zero/invalid/subset values, duplicate IDs,
deterministic grouping, source/account isolation, zero denominators, real CLI file
behavior, and independent AB archive extraction. Tests use short-lived directories
inside this script directory; they never write historical evidence. Do not change a
provider mapping by changing this utility. Establish a new source contract first,
preserve the original counters, and add a focused counterexample before changing a
formula. AE owns shared documentation and integration; this utility requires no host
or public CLI changes.
