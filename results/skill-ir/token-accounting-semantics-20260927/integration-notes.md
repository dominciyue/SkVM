# AG integration notes for AE

AG owns only `src/measurement/token-accounting.ts`, its test,
`scripts/token-accounting/`, its taskbook, and this result root. AE is the sole owner
of shared documentation, root logs, Git staging/commits/pushes and host integration.
No provider/core/old report was changed. There were zero business model calls and
no dependency installs. Developer-agent cost is unreported; no actual speed multiplier
was measured for the requested Fast/priority setup.

## Direct AE integration

```ts
import { aggregateTokenObservations, compareTokenGroups } from "../../measurement/token-accounting.ts"

// For the current openai-compatible mapped usage only, with the limitations below.
const aggregate = aggregateTokenObservations({
  id: "ae-markdown-v5",
  account: "ae-analysis",
  source: "skvm-openai-compatible-mapped-usage",
  semantics: "skvm-disjoint",
  evidence: "src/providers/openai-compatible.ts:263-277; exact AE run source pointers",
}, attempts.map(attempt => ({
  id: `${unitId}/${attempt.id}`, // globally unique across compared groups
  semantics: "skvm-disjoint" as const,
  input: attempt.usage?.input ?? null,
  output: attempt.usage?.output ?? null,
  cacheRead: attempt.usage?.cacheRead ?? null,
  cacheWrite: attempt.usage?.cacheWrite ?? null,
  actualUSD: attempt.costUsd ?? null,
  evidence: `${runPath}#/attempts/${attemptIndexById.get(attempt.id)}/usage`,
})))
// Build the corresponding group using a different id and disjoint observation IDs.
// compareTokenGroups(baseline, candidate).metrics.totalTokens.percentChange
```

The import above assumes a consumer under `src/benchmarks/authorization-dsl`;
adjust only the relative path for other locations. `attempts`, `unitId`, `runPath`
and the index map are the host's existing data, not globals provided by this module.
Prefer a flat list of every actual attempt, including fallback/repair or missing
responses; never count only the successful answer. Use `??`, not `||`, so zero survives.
`metrics.totalTokens.total` is the complete prompt+output total, not the fresh-input
subtotal. `metrics.totalTokens.knownSubtotal` covers only records with a complete total;
its `unknownRecords` identifies missing records. Do not label that subtotal as full.

Comparisons require equal account, source and semantics. For a genuinely different
source contract, report separately until its comparison is justified. Both unknown
semantics yield null delta/percentage and `unknown-semantics`; mismatched semantics
are rejected. The module does not infer experimental comparability or effect.

Current openai-compatible/openrouter input is mapped as prompt minus cacheRead;
cacheWrite is adapter zero. This reconstructs the mapped prompt but cannot prove
the gateway obeyed the API contract or recover fields already defaulted/clamped.
Do not inject upstream cache-write fields into this mapped observation: overlap
would be unproven. Author `input_tokens` already includes its cache subset; use
`inclusive-input`, and keep author/development/analysis accounts separate. See
`source-semantics.json` for line references and official-contract limitations.

## Shared research/usage wording to merge

AG has added a pure normalization/aggregation/comparison module and an explicit
offline JSON command. Observations declare disjoint, inclusive, or unknown input
semantics; missing counters remain unknown, complete totals are separate from known
subtotals, and incompatible accounts or sources cannot be silently compared. No
provider or historical telemetry/report format was changed.

AB's 16 archived analysis usages have been independently recomputed. MD fresh input
69,011 plus cache-read 6,528 gives complete prompt 75,539; adding output 8,572 gives
84,111. DSL prompt 77,875 plus output 8,994 gives 86,869, or +3.2790003685605917%.
The original +11.969116945722647% is retained and explicitly named fresh input+output.
Response-duration delta remains -8.492489676207594%. Author input already includes
cached input: MD 774,416 + 14,714 = 789,130 and DSL 656,890 + 14,759 = 671,649.
These accounts are not combined into a savings rate.

Quality remains MD 8/8 full and DSL 6/8 full; actual authorization reasoning is
correct in both arms 8/8, with the original two DSL label errors preserved. The
correction establishes accounting consistency, not improved quality, actual USD,
human time or overall method benefit. Original summary/panel/raw files retain their
bytes. New evidence is `results/skill-ir/token-accounting-semantics-20260927/`.

CLI documentation can link `scripts/token-accounting/README.md` and give:

```powershell
bun ./scripts/token-accounting/cli.ts --input=./observations.json --out=./comparison.json
```

No `--out` means stdout; an existing output is refused. Unknown amounts are never
estimated from characters or prices. Full-repository checks are left to AE.

## Catalog suggestion (advisory only)

Add one separate AG engineering/accounting entry pointing to `status.json`,
`ab-accounting-clarification.json`, `comparison.json`, and `ready.json`; explicitly
label the new entry as offline clarification with zero new analysis units and zero
business model calls. Retain the AB entry and its original source paths and quality
denominator. Link the correction rather than rewriting the historical +11.969% field.
Keep the catalog schema and renderer unchanged unless AE's established schema needs
an ordinary additional reference. AG did not edit either.

## Independent review

Two read-only reviews inspected the pure module and the scripts/new evidence.
Neither found a blocking correctness defect. The script review identified stale
in-progress status metadata, updated during final delivery. Non-blocking constraints
are intentional: the AB importer is fixed to one archived attempt per known unit,
extracts usage rather than copying prompt/model content, and publishes three exclusive
files individually. I/O failure may leave partial new outputs; retry in a new empty
directory. No old evidence is overwritten.
