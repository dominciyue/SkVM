# Memos shared-link analysis through the ordinary inquiry CLI

This example uses the original Memos `GetSharedMemo` question, a fixed model-authored program, and explicit synthetic request/database/time inputs. Source: `usememos/memos@cb42e326ba9cc266a6a9570c53e0fe04c62793f4`. The complete external GitHub security-review skill and its provenance are retained with the study. This is exposed development evidence; the Memos service, database and HTTP endpoints are not run.

From the repository root in PowerShell:

```powershell
$study = './results/skill-ir/skill-dsl-research/development/authorization-task-coverage-v1'
$program = "$study/authoring/M-automatic-program.json"
$input = "$study/inputs/memos-original.json"
bun src/index.ts authorization inquiry check --input=$input --domain-program=$program --strategy=question-checked-v1 --execution-policy=progressive --program-mode=consume --program-context=directed --program-support=execute --out=./results/local-memos/original
```

The input carries the source scope (`sourceRoot`, `allowedPaths`), complete natural question, and explicit scenario data. Supply another input file to change those facts. `M-automatic-program.json` is the author's last submitted raw, never a developer-corrected replacement. A partial or invalid result must remain partial or invalid.

Use the preregistered changed input with the same program. The authorization creator remains present, but the later conversion creator population is empty:

```powershell
$input = "$study/inputs/memos-changed.json"
bun src/index.ts authorization inquiry check --input=$input --domain-program=$program --strategy=question-checked-v1 --execution-policy=progressive --program-mode=consume --program-context=directed --program-support=execute --out=./results/local-memos/changed
```

These commands make zero model calls. Their output includes the ordinary session path; inspect that path with `bun src/index.ts authorization inquiry inspect --out=<session>`. Read its `execution.md` and `execution.json` for actual events, result, conditions, source bindings, draft revision and remaining duties. A computed value does not establish source-semantic completeness or live authorization.

The Memos checks above use tracked inputs/source/program directly. Full BS captured sessions and replay copies can be restored using `python scripts/research/authorization-task-coverage-v1/pack.py unpack`. It checks archive/member hashes and refuses to overwrite different local evidence. The historical BR archive and its Download dependencies retain their own restoration command: `python results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/pack-evidence.py unpack`. All originals remain in the development workspace.

To inspect rules without evaluation, use the same check command with `--program-support=rules` and a fresh output directory. To analyze a source change, copy the sources, initialize an input with `authorization inquiry init --from=<session> --source-root=<copy> --out=<new-input>`, then use `authorization inquiry compare --input=<new-input> --previous=<session> --domain-program=<program> --strategy=question-checked-v1 --execution-policy=progressive`. Do not silently rebind an old conclusion to changed source.

Verified ordinary results: the original input returns the finite memo 43 summary; the changed conversion population terminates `NOT_FOUND: not found`. Rules mode has no execution result. The frozen 30-step raw is SHA-256 `71af8c69179fb5363eb8408dd6335a6d7b0997e8d2c9395093ad0747e6cd2142`. Missing clock, users or conversion population retain unresolved conditions. The 29 source-first cases expose three incorrect call orders despite matching final NotFound values. The raw also lacks the public/bootstrap endpoint proof, and does not materialize all reaction/attachment rows or full response conversion. Treat its result as a partial finite model.

See current [ordinary checks](../../../results/skill-ir/skill-dsl-research/development/authorization-task-coverage-v1/verification/ordinary-M.json), [move/source invalidation](../../../results/skill-ir/skill-dsl-research/development/authorization-task-coverage-v1/verification/portability.json), [source review](../../../results/skill-ir/skill-dsl-research/development/authorization-task-coverage-v1/evaluation/M-source-review.json), and [registration](../../../results/skill-ir/skill-dsl-research/development/authorization-task-coverage-v1/registration.json). The [historical BR execution record](../../../results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/execution.md) retains the inherited 25-step program and clock-change experiment. No complete HTTP authorization or stable answer-quality benefit is implied by these finite checks.
