# Gitea issue field analysis through the ordinary inquiry CLI

This example inspects BU's model-authored repair and retains the historical BT program for `go-gitea/gitea@fc28937a8d772fe9e4025c9b5f24d5db4d86610b`. The original task covers the route, permissions, fields, creation and later errors. Inputs are synthetic observations; these commands do not create an issue or contact the target service.

Run from the repository root in PowerShell:

BU retains this error as a source-review case. `ToAPIIssue` has no error return to its caller: loader failures produce an empty API issue, and the handler still emits 201. Its database-backed loader and converter dependencies do not provide a narrow isolated boundary comparable to Memos access resolution. No Gitea original function or handwritten Gitea simulator is counted as executed source evidence. BU's check arm receives explicitly labelled source-review feedback; it is evaluated separately from Memos mechanical counterexamples.

## BU repaired current raw

The check-arm author read the converter body and removed the unsupported rejection in its first patch. Its chronological last raw preserves 201 on converter load failure and sets `response_body_empty=true`. It also represents the `NewIssue` request as an unresolved external boundary, so the returned summary remains conditional and does not establish a database commit.

```powershell
$bu = './results/skill-ir/skill-dsl-research/development/authorization-source-differential-v1'
bun src/index.ts authorization inquiry check --input="$bu/inputs/gitea-original.json" --domain-program="$bu/automatic/G-final.json" --strategy=question-checked-v1 --execution-policy=progressive --program-mode=consume --program-context=directed --program-support=execute --out=./results/local-gitea/bu-final
```

The [ordinary original/error checks](../../../results/skill-ir/skill-dsl-research/development/authorization-source-differential-v1/verification/ordinary-G.json) use identical raw bytes; full sessions are restored by `python -X utf8 scripts/research/authorization-source-differential-v1/pack.py unpack` after the study bundle is published. Permission construction, public-only owner checks, assignee helpers and full transaction/conversion internals remain incomplete. The [eligibility scope](../../../results/skill-ir/skill-dsl-research/development/authorization-source-differential-v1/automatic/G-eligibility.json) permits diagnostic consumption with these duties, not an authorization certificate.

## Ordinary model use of the frozen BU program

The same current raw can be consumed through the existing skill entrypoint. This command uses the configured official account and makes model requests; use a fresh output directory for a new intended task. The retained study uses fixed registered budgets and keeps its original failed attempts.

```powershell
bun src/index.ts authorization inquiry run --input="$bu/inputs/gitea-original.json" --domain-program="$bu/automatic/G-final.json" --skill=./results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/model/source-skills/github-security-review/SKILL.md --model=gpt-5.6-sol --harness=codex-account --account-boundary="$bu/account-boundary.json" --method=D1 --strategy=question-checked-v1 --execution-policy=progressive --program-mode=consume --program-context=directed --program-support=execute --source-structure=true --out=./results/local-gitea/bu-use
```

Restore the archived study sessions with `python -X utf8 scripts/research/authorization-source-differential-v1/pack.py unpack`. The command checks part/member hashes and preserves different existing files. Reading or unpacking the retained evidence does not rerun the model. Source fidelity, independent policy and complete natural-task coverage remain separate judgments.

## Historical BT program

This earlier raw is **not qualified for automatic answer consumption**: it incorrectly treats converter load errors as preventing 201.

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
