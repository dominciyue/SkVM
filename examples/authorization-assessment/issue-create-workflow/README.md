# Gitea issue field analysis through the ordinary inquiry CLI

This example inspects the latest BT model-authored program for `go-gitea/gitea@fc28937a8d772fe9e4025c9b5f24d5db4d86610b`. It is **not qualified for automatic answer consumption**: a converter-load error is incorrectly treated as preventing HTTP 201. The original task covers the route, permissions, fields, creation and later errors. Inputs are synthetic observations; these commands do not create an issue or contact the target service.

Run from the repository root in PowerShell:

```powershell
$study = './results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1'
$program = "$study/automatic/G-final.json"
$input = "$study/inputs/gitea-original.json"
bun src/index.ts authorization inquiry check --input=$input --domain-program=$program --strategy=question-checked-v1 --execution-policy=progressive --program-mode=consume --program-context=directed --program-support=execute --out=./results/local-gitea/original
$input = "$study/inputs/gitea-changed.json"
bun src/index.ts authorization inquiry check --input=$input --domain-program=$program --strategy=question-checked-v1 --execution-policy=progressive --program-mode=consume --program-context=directed --program-support=execute --out=./results/local-gitea/changed
```

Both commands make zero model calls. Inspect the returned session path with `bun src/index.ts authorization inquiry inspect --out=<session>`, then read its `execution.md` and `execution.json`. Use `--program-support=rules` and a fresh output directory for a view without evaluation.

The original reader input computes `can_write_issues=false`, deadline `0`, milestone `0` and a finite 201 summary. The changed writer input reaches its injected refetch error after the modeled creation steps. These observations do not certify either the source semantics or a committed creation. The frozen raw SHA-256 is `6ec6765c946df6d8a975e20897cbef87de9029239411d32703da61bea90d767e`; no developer changed its business steps after the author.

The source counterexample is reproducible with `bun scripts/research/authorization-semantic-validation-v1/review-g.ts`. When `errors.responseLoad` represents a converter `LoadAttachments` failure, the raw stops at `response_load_completed`. Source `services/convert/issue.go:36–48` instead returns an empty `api.Issue`, and the handler still calls `ctx.JSON(StatusCreated, ...)` at `routers/api/v1/repo/issue.go:652`. This is why AE-G is ineligible despite the corrected format and useful partial field/order model. Admin permission construction, precise middleware error order and writer assignee checks also remain incomplete.

For an explicitly prepared local reference, use `$program = "$study/reference/G-program.json"` with the same commands and original question. This reference is developer-prepared, not an automatic-author success. It assumes handler entry and the declared permission context; writer assignee validation/blocking and full conversion remain outside its scope. Rules and execution views use exactly the same raw bytes.

The write-permission requirement is an independently supplied experimental user policy, not a claim about Gitea's upstream intended policy. Source behavior and policy compliance must be evaluated separately. The available source does not establish `db.WithTx` commit/rollback internals. A conversion helper can return an empty issue object while the handler still responds 201.

See [ordinary checks](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/verification/ordinary-G.json), [source review](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/evaluation/G-source-review.json), and [registration](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/registration.json). The [move/source-change observation](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/verification/portability-G.json) preserves the initial overly strict assertion; its [review](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/verification/portability-G-review.json) verifies that all five stale route guards become unknown and their conditions propagate through return. The original source and old answer are not reused. Follow the [shared-link example](../shared-link-workflow/README.md) for ordinary relocation and known-terminal author recovery.

Full BT sessions and replay copies are retained in three verified archive parts. Restore them with `python -X utf8 scripts/research/authorization-semantic-validation-v1/pack.py unpack`; the command checks member hashes and refuses to overwrite different local evidence. Tracked inputs, source and final programs suffice for the ordinary commands above. All 939 original files remain locally; archive verification does not certify the automatic program's semantics.
