# Memos shared-link analysis through the ordinary inquiry CLI

This example uses the original Memos `GetSharedMemo` question, a fixed model-authored program, and explicit synthetic request/database/time inputs. Source: `usememos/memos@cb42e326ba9cc266a6a9570c53e0fe04c62793f4`. The complete external GitHub security-review skill and its provenance are retained with the study. This is exposed development evidence; the Memos service, database and HTTP endpoints are not run.

From the repository root in PowerShell:

```powershell
$study = './results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1'
$program = "$study/authoring/automatic-program.json"
$input = "$study/inputs/memos-original.json"
bun src/index.ts authorization inquiry check --input=$input --domain-program=$program --strategy=question-checked-v1 --execution-policy=progressive --program-mode=consume --program-context=directed --program-support=execute --out=./results/local-memos/original
```

The input carries the source scope (`sourceRoot`, `allowedPaths`), complete natural question, and explicit scenario data. Supply another input file to change those facts. `automatic-program.json` is the author's last submitted raw, never a developer-corrected replacement. A partial or invalid result must remain partial or invalid.

Change only the preregistered clock input (2000 to 2001) with the same program:

```powershell
$input = "$study/inputs/memos-changed.json"
bun src/index.ts authorization inquiry check --input=$input --domain-program=$program --strategy=question-checked-v1 --execution-policy=progressive --program-mode=consume --program-context=directed --program-support=execute --out=./results/local-memos/changed
```

These commands make zero model calls. Their output includes the ordinary session path; inspect that path with `bun src/index.ts authorization inquiry inspect --out=<session>`. Read its `execution.md` and `execution.json` for actual events, result, conditions, source bindings, draft revision and remaining duties. A computed value does not establish source-semantic completeness or live authorization.

The Memos checks above use tracked inputs/source/program directly. To restore the full captured experiment sessions, replay copies and the 95 registered Download source dependencies from a fresh checkout, run `python "$study/pack-evidence.py" unpack`. It verifies the published archive parts, source bundle and every member before restoring files, confines source restoration to the registered Download directory, and refuses to overwrite different local evidence. All originals remain in the development workspace.

To inspect rules without evaluation, use the same check command with `--program-support=rules` and a fresh output directory. To analyze a source change, copy the sources, initialize an input with `authorization inquiry init --from=<session> --source-root=<copy> --out=<new-input>`, then use `authorization inquiry compare --input=<new-input> --previous=<session> --domain-program=<program> --strategy=question-checked-v1 --execution-policy=progressive`. Do not silently rebind an old conclusion to changed source.

Verified ordinary results: the original input returns the finite memo 43 summary; changing only the clock to 2001 terminates `NOT_FOUND: not found`. Rules mode has no execution result. The frozen 25-step raw is SHA-256 `2e762d8c06c04d3959e3553d2385ca9a81b7f6f1fc5eba405f7ba0359dc76ff5`. All 20 known-disposition/scalar cases match and both missing-input cases retain real conditions. These are selected summaries: reaction/attachment rows and full protobuf/placement conversion are not materialized, and some source checks are moved earlier than the real call chain.

The [BR execution record](../../../results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/execution.md) links actual model consumption, source-derived cases, first/final drafts, ordinary replay, costs and known gaps. See [ordinary checks](../../../results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/verification/ordinary-checks.json), [CLI commands](../../../results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/verification/ordinary-cli-commands.json), [move/source invalidation](../../../results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/verification/portability.json), and [source review](../../../results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/evaluation/confirmation-source-review.json). Complete source/skill/task/input origins are in [provenance.json](../../../results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/provenance.json). No complete HTTP authorization or stable answer-quality benefit is implied by these finite checks.
