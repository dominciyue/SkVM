# Native pytest development evidence

Core c2f10b3; source-duty/batch integration ff01f99; reproducible fixture9931b2f.
Only existing sources and deterministic synthetic cases. No real API calls.

## Results, kept separate

- `first-run/`: twelve native suites,630collected pytest items,630skipped,
  0failed/0errors/0HTTP. Includes628planned cases and2explicit incomplete-operation
  placeholders;578constructed request data and50unresolved cases remain as before.
  Native collection is demonstrated, not native API-test success.
- `cross-member/`: Lambda emit-test-code and Jeremy emit-and-report, each two exposed
  inputs. Four actual suite/Python outputs exactly equal corresponding panel bytes.
  Pactflow's Drift format was not relabeled pytest. Full source duties remain partial.
- `archive-comparison.json`: all12embedded form reports unchanged, all suite/code
  hashes match, JUnit summaries cover all rows, all4mapping artifacts exact.
- `loopback-first-run/`: standalone source/fixture identity, exact Python and JSON,
  every oracle/modified oracle, seven subprocess logs andJUnit documents, received
  request bytes. Three positive pytest tests pass; three no-oracle tests skip;
  15designed fault cases are detected at the specified runtime assertion layer.
  There are15actual local HTTP calls; wrong binding sends none; redirects not followed.
- `runtime-first-failure/`: actual failed initial emitted code/suite/oracle retained.
  It incorrectly used HTTPX Response as a context manager; core-evidence.json has
  original traceback. Fixed with explicit finally-close. Duplicate-key and empty-source
  REDs also retained. First test syntax typo and initial TS errors are recorded.

Core regression22tests/172assertions, mapping/batch17tests/80assertions, native fixture
test7assertions and main/explicit script typechecks passed. Counts refer to recorded
runs, not one fictitious combined command. Native-stage local test+archive HTTP calls
through this checkpoint93, remote/model/paid0; developer-agent cost unmeasured/separate.
Source/example/body/schema validity still does not supply real credentials or statuses.

## Commands

With Bun1.3.14, Python3.12.13, pytest8.3.3 and httpx0.27.0, from repository root:

```powershell
bun scripts/skill-ir/api-pytest-development.ts --inputs=results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json --out=results/skill-ir/local-native-repro --python=D:/anaconda/python.exe
bun scripts/skill-ir/skill-family-baseline.ts --config=results/skill-ir/skill-family-pytest-development-20260911/cross-member-config.json --out=results/skill-ir/local-native-mapping
bun scripts/skill-ir/api-pytest-loopback.ts --out=results/skill-ir/local-native-fixture --python=D:/anaconda/python.exe
bun test ./src/skill-ir/api-pytest-suite.test.ts ./src/skill-ir/api-pytest-runtime.test.ts ./src/skill-ir/api-pytest-oracle.test.ts ./scripts/skill-ir/api-pytest-development.test.ts
```

Replace the explicit Python path with your prepared interpreter. Use NEW output paths.
Batch runs isolated Python with no oracle, parent conftest or auto-loaded plugins. The
fixture runs only its own127.0.0.1server and closes it. Old oracle ports in archives are
historical values, not running services; rerun the harness to obtain a new fixture.

`verify-archive.ts <new-report.json>` rechecks the fixed archive paths. A new clean
checkout/dependency archive for these revisions is the next step; old clean evidence
is still valid only for be89a50, not automatically for the native/form revisions.
