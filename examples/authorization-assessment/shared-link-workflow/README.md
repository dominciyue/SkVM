# Memos shared-link analysis through the ordinary inquiry CLI

This example uses the original Memos `GetSharedMemo` question, a fixed model-authored program, and explicit synthetic request/database/time inputs. Source: `usememos/memos@cb42e326ba9cc266a6a9570c53e0fe04c62793f4`. The complete external GitHub security-review skill and its provenance are retained with the study. This is exposed development evidence; the Memos service, database and HTTP endpoints are not run.

From the repository root in PowerShell:

## BU source differential check

The explicit BU observer runs the two fixed original access files in a local Go test with a disclosed type shim and parameter-sensitive fake storage. It does not start Memos, a database or an HTTP endpoint. The observer command is trusted local host configuration; it is not an arbitrary-command sandbox and cannot be replaced by the model.

```powershell
$bu = './results/skill-ir/skill-dsl-research/development/authorization-source-differential-v1'
bun src/index.ts authorization inquiry check --input="$bu/inputs/memos-original.json" --domain-program="$bu/automatic/M-initial.json" --source-verification="$bu/verification-config.json" --strategy=question-checked-v1 --execution-policy=progressive --program-mode=consume --program-context=directed --program-support=execute --out=./results/local-memos/bu-initial
```

This command makes zero model calls and one isolated original-function observation. Its witness has creator 17 deleted, active viewer 22, memo 43 in Space 8, and membership `(8,22)`. The original context resolver calls `GetUser(17)`, `GetSpace(8)`, then `GetSpaceMember(8,22)` before policy rejection. The initial program stops at `creator_valid` after `GetUser`; the check reports missing space/member calls and a call-order counterexample despite the same final denial.

Read `executableContract.sourceVerification` in the check result and the source-verification field in the ordinary execution archive. Each independent requirement has its scope, current mapping, observation and first difference. Missing mappings, unobserved error results, unsupported roots and stale sources remain named `unknown`; the local match does not establish policy compliance or full task completeness. The explicit configuration is also accepted by ordinary `run`, and the same feedback appears through program details and trial tools during authoring.

The observer needs the local Go toolchain at `.tmp/bt-source/toolchain/go/bin/go.exe` (Go 1.27.0); its module/cache setup disables Go network downloads. See the tracked [observer](../../../scripts/research/authorization-source-differential-v1/source-tests/observe.py) and [type shim](../../../scripts/research/authorization-source-differential-v1/source-tests/shim.go). Missing prerequisites yield an observer failure, never a matching empty trace. The source adapter currently covers activated local access resolution and policy, not every upstream handler branch or later conversion query.

The actual BU check-arm author received these differences through ordinary details, patched the creator guard into a fact, and placed the decision after context resolution. Check its unedited chronological last raw on the same input:

```powershell
bun src/index.ts authorization inquiry check --input="$bu/inputs/memos-original.json" --domain-program="$bu/automatic/M-final.json" --source-verification="$bu/verification-config.json" --strategy=question-checked-v1 --execution-policy=progressive --program-mode=consume --program-context=directed --program-support=execute --out=./results/local-memos/bu-final
```

This yields five `matched-on-cases` requirements for the current input. Across that input and five preregistered changes, the same raw yields 23 matched, 4 counterexample and 3 unknown requirement-case pairs. The four differences describe one inherited premature rejection of an unrecognized audience. Query errors without observed results remain unknown. The [author review](../../../results/skill-ir/skill-dsl-research/development/authorization-source-differential-v1/evaluation/M-author-review.json), [ordinary checks](../../../results/skill-ir/skill-dsl-research/development/authorization-source-differential-v1/verification/ordinary-M.json) and [move/source withdrawal](../../../results/skill-ir/skill-dsl-research/development/authorization-source-differential-v1/verification/portability-M.json) retain that scope; no developer corrected the final raw.

## Ordinary model use of the frozen BU program

The same current raw can be consumed through the existing skill entrypoint. This command uses the configured official account and makes model requests; use a fresh output directory for a new intended task. The retained study uses fixed registered budgets and keeps its original failed attempts.

```powershell
bun src/index.ts authorization inquiry run --input="$bu/inputs/memos-original.json" --domain-program="$bu/automatic/M-final.json" --source-verification="$bu/verification-config.json" --skill=./results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/model/source-skills/github-security-review/SKILL.md --model=gpt-5.6-sol --harness=codex-account --account-boundary="$bu/account-boundary.json" --method=D1 --strategy=question-checked-v1 --execution-policy=progressive --program-mode=consume --program-context=directed --program-support=execute --source-structure=true --out=./results/local-memos/bu-use
```

Restore the archived study sessions with `python -X utf8 scripts/research/authorization-source-differential-v1/pack.py unpack`. The command checks part/member hashes and preserves different existing files. Reading or unpacking the retained evidence does not rerun the model. Source fidelity, independent policy and complete natural-task coverage remain separate judgments.

## Historical BT fixed program

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
