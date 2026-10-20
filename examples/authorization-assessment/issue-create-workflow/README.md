# Gitea issue field analysis through the ordinary inquiry CLI

This example consumes the last seven-step model-authored program for `go-gitea/gitea@fc28937a8d772fe9e4025c9b5f24d5db4d86610b`. The original task covers the route, permissions, fields, creation and later errors. The program only models part of that task. Inputs are synthetic observations; these commands do not create an issue or contact the target service.

Run from the repository root in PowerShell:

```powershell
$study = './results/skill-ir/skill-dsl-research/development/authorization-task-coverage-v1'
$program = "$study/authoring/G-automatic-program.json"
$input = "$study/inputs/gitea-original.json"
bun src/index.ts authorization inquiry check --input=$input --domain-program=$program --strategy=question-checked-v1 --execution-policy=progressive --program-mode=consume --program-context=directed --program-support=execute --out=./results/local-gitea/original
$input = "$study/inputs/gitea-changed.json"
bun src/index.ts authorization inquiry check --input=$input --domain-program=$program --strategy=question-checked-v1 --execution-policy=progressive --program-mode=consume --program-context=directed --program-support=execute --out=./results/local-gitea/changed
```

Both commands make zero model calls. Inspect the returned session path with `bun src/index.ts authorization inquiry inspect --out=<session>`, then read its `execution.md` and `execution.json`. Use `--program-support=rules` and a fresh output directory for a view without evaluation.

The original reader input conditionally computes `can_write_issues=false`, deadline `0` and milestone `0`. The changed writer input conditionally computes `true`, `2000` and `12`. The route guard has a schema error: its `permission` is an object where a string is required. Progressive execution keeps that guard unresolved and carries its condition through every later value. Its refetch error is **not represented by this program**: the returned record is field preparation, not an HTTP success or a completed creation. Token scope, administrator exceptions, assignee validation, service effects, transaction behavior, close/refetch and response conversion remain outside this finite computation. The last raw is preserved, SHA-256 `0a788fe597115c5674a9db63943eff159abba39e4be605fbb6d7f61e95de28aa`.

The write-permission requirement is an independently supplied experimental user policy, not a claim about Gitea's upstream intended policy. Source behavior and policy compliance must be evaluated separately. The available source does not establish `db.WithTx` commit/rollback internals. A conversion helper can return an empty issue object while the handler still responds 201.

See [ordinary checks](../../../results/skill-ir/skill-dsl-research/development/authorization-task-coverage-v1/verification/ordinary-G.json), [source review](../../../results/skill-ir/skill-dsl-research/development/authorization-task-coverage-v1/evaluation/G-source-review.json), and [registration](../../../results/skill-ir/skill-dsl-research/development/authorization-task-coverage-v1/registration.json). Restore full captured evidence with `python scripts/research/authorization-task-coverage-v1/pack.py unpack`; differing local bytes are never overwritten. For moving a session and withdrawing stale source conclusions, follow the [shared-link example](../shared-link-workflow/README.md).
