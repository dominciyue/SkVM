# A movable local source contract

This package contains a source example, an authored program and two ordinary inquiry inputs. It can be copied as one directory. The checker reads the source without running it, so FastAPI and the external middleware do not need installation.

`program.json` describes the two local functions and binds their actual call, formal arguments, condition and write. The source declarations have no internal graph IDs or prefilled verdict. `input.json` supplies the local root's `actor.allowed=false`; `input-change.json` supplies true. Omitting this value preserves unknown input. Request authentication and the external permission middleware remain separate unanswered duties.

From the repository root:

```sh
bun src/index.ts authorization inquiry check --input=examples/authorization-assessment/local-contract/input.json --method=D1 --strategy=question-checked-v1 --domain-program=examples/authorization-assessment/local-contract/program.json
bun src/index.ts authorization inquiry check --input=examples/authorization-assessment/local-contract/input-change.json --method=D1 --strategy=question-checked-v1 --domain-program=examples/authorization-assessment/local-contract/program.json
```

Both checks make zero model calls. The false input makes the write unreachable, so the separate guard-before-write query has no reachable effect to certify. The true input supports that guard ordering and leaves write reachability conditional on the actual field operation succeeding. Request certification remains false in both. Read the local properties together with `scope`, `conditions`, `semanticReview`, material uses and the remaining question. A source-bound mechanical check still requires review of the author's source meanings.

To consume this same program with a model, use your configured model route:

```sh
bun src/index.ts authorization inquiry run --input=examples/authorization-assessment/local-contract/input.json --out=.skvm/local-contract --method=D1 --strategy=question-checked-v1 --domain-program=examples/authorization-assessment/local-contract/program.json --model=<provider/model>
bun src/index.ts authorization inquiry inspect --out=<sessionPath returned by run>
bun src/index.ts authorization inquiry compare --input=examples/authorization-assessment/local-contract/input-change.json --previous=<sessionPath returned by run> --strategy=question-checked-v1 --domain-program=examples/authorization-assessment/local-contract/program.json
bun src/index.ts authorization inquiry run --input=examples/authorization-assessment/local-contract/input-change.json --out=.skvm/local-contract-change --method=D1 --strategy=question-checked-v1 --model=<same provider/model> --previous=<same sessionPath>
```

The last command can restore the exact archived program against matching current source bytes. It recomputes current properties and generates a new answer. Inspect and compare expose eligibility separately from actual material use. An unknown previous completion requires inspection before another dispatch.

For another source project, supply a relative `sourceRoot` and allowed paths in a new input, then replace every source passage, statement meaning, scope and query with that project's actual current source. The supplied parameter values are local function inputs; they do not create request authentication or object grants. Source edits invalidate the affected declarations until they are reviewed and updated. Keep original request questions and missing facts alongside the local contract.
