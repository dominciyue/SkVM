# Authorization assessment example

This is a synthetic, self-contained source example for the ordinary authorization assessment entry. It is not a real vulnerability report and is not an evaluator fixture.

From the repository root, validate the input without creating a model provider:

```powershell
bun ./src/benchmarks/authorization-dsl/local-run.ts check --input=./examples/authorization-assessment/assessment.json
```

Run a new immutable session with the default domain arm, then inspect the latest saved session without resending it:

```powershell
bun ./src/benchmarks/authorization-dsl/local-run.ts run --input=./examples/authorization-assessment/assessment.json --model=xty/gpt-5.6-sol --out=./.skvm/authorization-demo
bun ./src/benchmarks/authorization-dsl/local-run.ts inspect --out=./.skvm/authorization-demo
```

Use `--arm=N`, `--arm=B`, or `--arm=D` on `check` and `run` when an explicit render is needed. If omitted, D is used. To adapt the example, edit `assessment.json`, the files below `project/`, and the model identifier. Keep `sourceIdentity` synchronized with `task.repository` and `task.sourceRef`, and list every declared source path in `sources`.
