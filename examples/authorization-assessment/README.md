# Authorization assessment example

This is a synthetic, self-contained source example for the ordinary authorization assessment entry. It is not a real vulnerability report and is not an evaluator fixture.

From the repository root, validate the input through the opt-in top-level command without creating a model provider:

```powershell
bun ./src/index.ts authorization check --input=./examples/authorization-assessment/assessment.json
```

Run a new immutable session with the default baseline B arm, then inspect the latest saved session without resending it:

```powershell
bun ./src/index.ts authorization run --input=./examples/authorization-assessment/assessment.json --model=xty/gpt-5.6-sol --out=./.skvm/authorization-demo
bun ./src/index.ts authorization inspect --out=./.skvm/authorization-demo
```

Use `--arm=N`, `--arm=B`, or `--arm=D` on `check` and `run` when an explicit historical render is needed. If omitted, B is used by both the CLI and the public check/run functions. To adapt the example, either edit `assessment.json` and the files below `project/`, or edit the less repetitive `authoring.json` and create a separate normalized file with `authorization init --from=... --out=...`. The command never overwrites either file. A condition request is opt-in; without one, the existing ledger/wire-v2 path remains in use.
