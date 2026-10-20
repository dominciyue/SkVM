# Memos shared-link analysis through the ordinary inquiry CLI

This example uses the original Memos `GetSharedMemo` question, a fixed model-authored program, and explicit synthetic request/database/time inputs. Source: `usememos/memos@cb42e326ba9cc266a6a9570c53e0fe04c62793f4`. The complete external GitHub security-review skill and its provenance are retained with the study. This is exposed development evidence; the Memos service, database and HTTP endpoints are not run.

From the repository root in PowerShell:

```powershell
$study = './results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1'
$program = "$study/automatic/M-final.json"
$input = "$study/inputs/memos-original.json"
bun src/index.ts authorization inquiry check --input=$input --domain-program=$program --strategy=question-checked-v1 --execution-policy=progressive --program-mode=consume --program-context=directed --program-support=execute --out=./results/local-memos/original
```

The input carries the source scope (`sourceRoot`, `allowedPaths`), complete natural question, and explicit scenario data. Supply another input file to change those facts. `M-final.json` is the author's last submitted raw, never a developer-corrected replacement. A partial or invalid result must remain partial or invalid.

Use the preregistered changed input with the same program. The authorization creator remains present, but the later conversion creator population is empty:

```powershell
$input = "$study/inputs/memos-changed.json"
bun src/index.ts authorization inquiry check --input=$input --domain-program=$program --strategy=question-checked-v1 --execution-policy=progressive --program-mode=consume --program-context=directed --program-support=execute --out=./results/local-memos/changed
```

These commands make zero model calls. Their output includes the ordinary session path; inspect that path with `bun src/index.ts authorization inquiry inspect --out=<session>`. Read its `execution.md` and `execution.json` for actual events, result, conditions, source bindings, draft revision and remaining duties. A computed value does not establish source-semantic completeness or live authorization.

The Memos checks above use tracked inputs/source/program directly. Full BT sessions and replay copies can be restored using `python -X utf8 scripts/research/authorization-semantic-validation-v1/pack.py unpack`: 939 originals are retained in three verified parts. The historical BS command remains `python scripts/research/authorization-task-coverage-v1/pack.py unpack`. These commands check archive/member hashes and refuse to overwrite different local evidence. The historical BR archive and its Download dependencies retain their own restoration command: `python results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/pack-evidence.py unpack`. All originals remain in the development workspace.

To inspect rules without evaluation, use the same check command with `--program-support=rules` and a fresh output directory. To analyze a source change, copy the sources, initialize an input with `authorization inquiry init --from=<session> --source-root=<copy> --out=<new-input>`, then use `authorization inquiry compare --input=<new-input> --previous=<session> --domain-program=<program> --strategy=question-checked-v1 --execution-policy=progressive`. Do not silently rebind an old conclusion to changed source.

Verified BT ordinary results: the original input returns the finite memo 43 summary; the changed conversion population terminates `NOT_FOUND: not found`. Rules mode has no execution result. The frozen raw is SHA-256 `6cb4bcadcffe26c46741923043d3e0d3bd69e1bc31d68996bbda2172a61032b4`. Missing clock, users or conversion population retain unresolved conditions. The author's repair preserves context lookup order before creator/audience rejection, including space/member errors. A faulty inherited viewer-error fixture was retained and separately corrected for source review. The raw lacks the public/bootstrap endpoint proof and full reaction/attachment/protobuf materialization; assigned-memo conversion's repeated context and Space queries remain outside the verified local scope. Effect declarations on ordinary summary steps yield unknown call evidence.

An independently prepared reference can be inspected with the same commands and `--domain-program="$study/reference/M-program.json"`. It covers a smaller source-reviewed local read decision. It is developer-prepared diagnostic material, not automatic-author success; its rules and execute views use identical bytes.

Ordinary account recovery uses the original skill and purpose with a known closed previous author session:

```powershell
bun src/index.ts authorization inquiry run --input="$study/inputs/memos-author.json" --skill=./results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/model/source-skills/github-security-review/SKILL.md --model=gpt-5.6-sol --harness=codex-account --account-boundary=./results/skill-ir/skill-dsl-research/development/authorization-executable-contract-v1/account-boundary.json --method=D1 --strategy=question-checked-v1 --execution-policy=progressive --program-context=directed --program-support=execute --authoring-target=reusable --source-structure=true --program-mode=edit --previous=<closed-author-session> --resume-author=true --out=./results/local-memos/recovered
```

Do not supply another program file during recovery. The saved current raw is recompiled against current source, and original host budgets and spent turns remain cumulative. Missing recovery counters, active/unknown requests or exhausted budgets refuse dispatch. The deterministic ordinary-entry regression injects a host projection failure after a saved provider terminal, then resumes the same author and verifies an actual patch; BT's real M author completed without requiring that host-failure recovery.

See current [ordinary checks](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/verification/ordinary-M.json), [move/source invalidation](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/verification/portability-M.json), [source review](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/evaluation/M-source-review.json), and [registration](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/registration.json). The historical BS and BR records remain unchanged. No complete HTTP authorization or stable answer-quality benefit is implied by these finite checks.
