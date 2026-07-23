# Skill 优化、Final IR 与 Artifact Runtime

本文档说明静态/动态结合、dual-source repair、Final IR provenance、artifact package、
preflight、semantic validator 和 bounded repair。基础 IR 见 `ir-core.md`，实验数值见
`experiment-results.md`。

## 1. 优化分层

```text
L0 original SKILL.md
  -> static source audit
L1 base/ir-static
  -> development execution feedback
Final IR candidate
  -> package compiler
L2/L3 executable artifact candidate
  -> development validation
validated package candidate
```

静态 pass 可以改善明确规则和环境检查；动态 evidence 只处理运行中可复现的残差。
两者都不能使用 held-out 或 scorer expected。

## 2. Profile Feedback

较早的 profile loop 从 execution trace 生成 annotation，再由
`applyProfileGuidedRepair` 增加 check/recovery。它适合受控 rule failure，但不能
可靠表达完整 output schema、source-qualified finding 或 model-family 偏差。

当前真实 pilot 使用更严格的 typed dual-source evidence，旧 profile 路径保留用于
synthetic calibration 和兼容已有结果。

## 3. Dual-source RepairEvidence

```ts
buildDualSourceRepairEvidence(originalRows, staticRows, options)
```

Evidence 类型：

```text
json-schema-contract
source-qualified-finding
```

Lineage：

```text
reproduced
newly-observable
```

合并规则：

| Original | Static | 行为 |
|---|---|---|
| fail | pass | 视为静态已解决，不生成 repair。 |
| fail | fail | 生成 reproduced residual。 |
| pass | fail | 静态回归，阻断编译。 |
| prerequisite fail | finer residual visible | 可标 newly-observable，但必须保留 lineage。 |

`RepairEvidence` 只携带 typed failure、targetRef、task/model/run identity 和 evidence
digest，不携带 evaluator expected 集合。

## 4. Final IR Provenance

`FinalIRProvenanceSchema` 支持 legacy v1 和 identified v2。V2 记录：

- corpus、skill、source/base/overlay/final digest；
- original/static development result digest；
- repair catalog 与 policy；
- model/family/adapter/version/run/panel construction config；
- task split 和 task ids。

```ts
buildDualSourceFinalIRProvenance(...)
readAndValidateFinalIRProvenance(...)
validateConstructionConfigsMatchRows(...)
```

Held-out runner 会重新验证 provenance。缺 repair、digest drift、mixed identity、重复
evidence 或 development/held-out 混合都会拒绝。

## 5. Artifact Package

工程目标：

```text
package/
  skill-ir.json
  skill.md
  validation-policy.json
  package-manifest.json
  package-provenance.json
  artifacts/
    contracts/
    templates/
    checks/
    scripts/
```

Manifest 声明 catalog、artifact path、digest 和 executable entrypoint。Provenance
绑定 source/base IR、task contract、repair evidence 和 compiler identity。未声明文件、
路径逃逸、绝对路径、digest drift 或 catalog mismatch 均失败。

公开 API：

```ts
validateArtifactPackage(...)
readAndValidateArtifactDevelopmentLock(...)
readAndValidateSemanticArtifactDevelopmentLock(...)
```

V1 与 V2 schema 使用 literal/discriminated contract，支持新 catalog 时不能拓宽旧
lock 的语义。

## 6. Package Compiler

V1 compiler 从冻结 base IR、gold-isolated RepairEvidence 和用户可见 task contract
生成 template、structural checker、skill view、manifest 和 provenance。

V2 compiler 额外生成：

- semantic contract schema；
- evidence derivation program；
- semantic checker；
- semantic validation policy。

V2 compiler 不接受 evaluator payload、criterion id、threshold、held-out 或 B-layer
candidate。Canary tests 递归扫描 package sink。

编译与验证：

```powershell
bun ./src/benchmarks/skill-ir/semantic-artifact-run.ts `
  '--root-dir=.' `
  '--base-ir=benchmarks/skill-ir/pilots/env-manager/base-ir.json' `
  '--tasks=benchmarks/skill-ir/pilots/env-manager/tasks.json' `
  '--source=benchmarks/skill-ir/pilots/env-manager/source/SKILL.md' `
  '--out-dir=<new-package-dir>'

bun ./src/benchmarks/skill-ir/semantic-artifact-run.ts `
  '--verify-only=<package-dir>'
```

冻结 package 只运行 verify-only，不原地重新编译覆盖。

## 7. Preflight

```ts
preflightArtifactRun(input): Promise<PreparedArtifactRun>
materializeArtifactTemplates(prepared)
verifyProtectedWorkdir(prepared)
```

共同检查：

- package/provenance/lock/digest；
- skill/task/split/model/adapter/environment/context scope；
- workdir 和 output path containment；
- symlink/reparse/escape；
- executable、template 和 network/package-install policy；
- fixture protected snapshot。

V2 在 generation 前执行 evidence program，生成：

```text
.skvm-artifact/semantic-contract.json
```

Runtime contract 来自公开规则和 agent 可见 workdir。模型可读但不可修改；文件加入
protected digest。Evidence timeout、crash、invalid JSON 或 path 问题属于
infrastructure，不触发 semantic repair。

## 8. Runtime State Machine

```ts
runArtifactStateMachine(input): Promise<ArtifactRuntimeResult>
```

固定流程：

```text
generation
  -> protected check
  -> validate
  -> check-only: stop
  -> one-repair and eligible fail: one sanitized repair call
  -> protected check
  -> revalidate
  -> stop
```

无第三次 repair。Provider、validator schema、evidence 或 protected mutation failure
不能 repair。

Repair report 只投影：

```text
code
relativePath
jsonPointer
missingField
expectedType
```

未知字段、free-form message、absolute path、actual value、secret 或 B disposition 会
被 strict schema 拒绝。

## 9. Executable Artifact V1

Catalog：

```text
executable-artifact/v1
runtime-validation-report/v1
```

V1 checker 负责：

- required files 和 JSON parse；
- report 五数组结构；
- template sentinel；
- synthetic secret safety；
- protected input。

Development 结果中 runtime 通过但 scorer 仍拒绝 classification/schema，说明
structural validation 不是任务成功权威。V1 package、lock 和结果冻结，不原地修改。

## 10. Semantic Artifact V2

Catalog：

```text
executable-semantic-artifact/v2
runtime-validation-report/v2
semantic-error-codes/v1
```

### A 层，当前生效

合法证据：

- public skill rules；
- user-visible task contract；
- dotenv 变量名，不是值；
- TypeScript AST 中静态 environment reference；
- `Number(...)`、`parseInt(...)` 等明确类型证据；
- relative path 和 symbol table。

封闭错误码：

```text
MISSING_OBSERVED_VARIABLE
INVALID_RULE_TYPE
MISSING_RULE_CONSTRAINT
MISSING_SENSITIVE_MARKER
UNSUPPORTED_RULE_FIELD
INVALID_SOURCE_QUALIFIED_FINDING
MISSING_SOURCE_QUALIFIED_FINDING
```

证据不足时移除强约束并记录 limitation，不猜测 scorer gold。每个正向推断都有
reverse-evidence test。

### B 层，dormant

`classification-evidence.ts` 只导出类型。V2 没有 B producer、serializer、package
option 或 runtime import。Disposition 不得进入 package、runtime contract、repair、
raw/scored row、lock 或 gate。

## 11. Public-Contract Artifact V3

Catalog 身份：

```text
executable-public-contract-artifact/v3
skill-ir-public-runtime-contract/v3
runtime-validation-report/v3
public-contract-error-codes/v2
```

V3 当前已完成 contract/package schema、evidence producer、package compiler、
preflight、checker，以及 catalog-neutral 的 Runner snapshot/paired scorer 基础设施；
尚未完成 V3 report/repair 接线、冻结 package/lock 或真实实验。V1/V2 schema、parser、
digest 和结果保持不变。

`public-contract.ts` 定义：

- 只含变量名、definition/reference/source ref、public prefix、confirmed/advisory
  schema rule、source-qualified finding 和 limitation 的 runtime contract；
- 每个 variable、rule、finding 和 limitation 都必须有 agent 可见的 provenance
  evidence；
- strict schema 拒绝 scorer expected、secret value、held-out payload 和最终
  classification arrays；
- repair report 只允许封闭 code、安全路径/pointer/type、`contractRef` 和封闭
  `operation`；repair-eligible error 必须同时提供 contract ref 与 operation。

`artifact-package.ts` 增加独立 V3 manifest、provenance 和 preregistered development
lock。V3 lock 固定 shared generation 和 pre/post snapshot 状态机；`check-only` 与
`one-repair` 是同一 generation 的逻辑评分臂，不是两次模型生成。

公开 schema/API：

```ts
PublicRuntimeContractSchema
RuntimePublicValidationReportSchema
PublicContractArtifactPackageManifestSchema
PublicContractArtifactPackageProvenanceSchema
PublicContractArtifactDevelopmentLockSchema
validateArtifactPackage({ expectedCatalog: "executable-public-contract-artifact/v3" })
```

当前失败模式：

- 无公开证据的强约束被 schema 拒绝；
- 未知 repair operation、路径逃逸和自由文本字段被拒绝；
- package digest drift、undeclared file、manifest/provenance identity drift 被拒绝；
- V3 schema 通过不代表任务成功，离线确定性 scorer 仍是唯一成功权威。

### 11.1 Evidence Graph 与保守分类

`derivePublicRuntimeContractFromWorkdir(...)` 扫描 agent 可见 workdir，当前支持：

- `.env`/`.env.*` 变量名与安全 literal shape，绝不保留变量值；
- JavaScript/TypeScript 的静态 `process.env.NAME`、静态 bracket access 和
  `import.meta.env.NAME`；
- `Number(...)`/`parseInt(...)`、URI/boolean/integer literal shape；
- 敏感名称 public rule 和 source-qualified hardcoded literal shape；
- Vite/Next public prefix 对应的 client-visible reference；
- unsupported extension/encoding、dynamic access 和 conflicting evidence limitation。

`derivePublicContractClassification(...)` 只在 checker 内存中执行集合推导：

```text
definition ∩ reference -> definedAndUsed
definition - reference -> definedUnconfirmedUnused
reference - definition -> usedUndefined
sensitive literal finding -> hardcodedSecrets
public prefix + confirmed sensitive + client reference -> exposureRisks
```

最终五个分类数组不进入 runtime contract、package、provenance 或 repair input。
移除 definition/reference/type/public-prefix evidence 时，测试要求对应结论随之降级；
integer/URI/boolean 类型证据冲突时不输出 confirmed type，只记录
`conflicting-evidence`。Literal value、test canary、scorer expected 和 held-out
payload 均不在该 API 的输入类型中。

### 11.2 V3 Schema 与 Evidence 验证

```powershell
bun test `
  ./src/benchmarks/skill-ir/public-contract.test.ts `
  ./src/benchmarks/skill-ir/public-contract-evidence.test.ts `
  ./src/benchmarks/skill-ir/classification-evidence.test.ts `
  ./src/benchmarks/skill-ir/artifact-package.test.ts
bun run typecheck
```

Compiler、preflight 和 checker 只能消费该 contract，不得扩展 evidence 输入面；
checker 才能计算最终分类，且计算结果只用于校验 workdir。

### 11.3 Compiler、Preflight 与 Checker

```ts
compileEnvManagerPublicContractArtifactPackage(...)
preflightArtifactRun(...)
validatePublicContractOutputs(...)
```

Compiler 生成并逐文件 digest 绑定：

```text
artifacts/contracts/output-contract.json
artifacts/contracts/public-policy.json
artifacts/schemas/public-runtime-contract.schema.json
artifacts/scripts/evidence-program.mjs
artifacts/checks/public-contract-checker.mjs
artifacts/templates/.env.example
artifacts/templates/.env.schema.json
artifacts/templates/env-report.json
validation-policy.json
```

Gold-isolation 测试向 task evaluator、held-out prompt、secret 和 final classification
sink 注入 canary，并递归确认 package 中不存在这些值。两次独立编译要求所有文件
byte-for-byte 相同，随后通过 V3 catalog dispatch 验证 manifest/provenance/digest。

Preflight 在 generation 前执行 package 内 `evidence-program.mjs`，校验
`skill-ir-public-runtime-contract/v3` 后把
`.skvm-artifact/public-runtime-contract.json` 加入 protected snapshot。Evidence
timeout、非零退出、无效 JSON/schema、pre-existing path 或 link 都是 infrastructure
failure，不进入 repair。

Checker 只消费 output contract、protected runtime contract 和最终 workdir。它在
内存中推导 exact classification，检查 confirmed schema rule、source-qualified
finding、`.env.example` inventory、template sentinel 和 synthetic secret prefix。
所有 repair-eligible error 都带封闭 `contractRef`/`operation`；runtime validator
仍不是离线 scorer。

验证：

```powershell
bun test `
  ./src/benchmarks/skill-ir/public-contract-artifact-compiler.test.ts `
  ./src/benchmarks/skill-ir/public-contract-checker.test.ts `
  ./src/benchmarks/skill-ir/artifact-preflight.test.ts
```

### 11.4 共享 Generation Snapshot 与 Paired Scorer

`artifact-snapshot.ts` 将 generation 后与 repair 后的完整可评分 workdir 分别复制到：

```text
<out-dir>/snapshots/<generationIdentity>/pre-repair/
<out-dir>/snapshots/<generationIdentity>/post-repair/
```

`generationIdentity` 绑定 case、model/family、adapter/version、run index 和 panel。
快照拒绝路径逃逸、symbolic link、特殊文件、重复目标、缺失或变更的 protected input；
目录摘要按排序后的相对路径和逐文件 SHA-256 计算。scorer 在读取任何文件前重新验证
摘要，摘要漂移直接失败，不进入语义评分。

带完整 snapshot metadata 的一条 raw run 会展开为同一 generation 的两条逻辑行：

```text
check-only  -> pre-repair snapshot  -> generationUsage
one-repair -> post-repair snapshot -> aggregateUsage + 独立 repairUsage
```

重复的 `caseId + generationIdentity + logicalArm` 被拒绝。没有 snapshot metadata 的
旧 V1/V2 raw 行保持原单行语义。当前 paired scorer 只用于确定性 workdir evaluator；
runtime validator 仍不是 scorer，模型 stdout 也不参与 repair 因果差值。

验证：

```powershell
bun test `
  ./src/benchmarks/skill-ir/artifact-snapshot.test.ts `
  ./src/benchmarks/skill-ir/artifact-runtime.test.ts `
  ./src/benchmarks/skill-ir/scoring.test.ts `
  ./src/benchmarks/skill-ir/real-agent-run.test.ts
bun run typecheck
```

### 11.5 V3 Runtime Activation 与冻结 Lock

Runtime 已按 `prepared.catalog` dispatch `runtime-validation-report/v3`。Sanitized repair
投影仍保留原五个基础字段，并仅对 V3 增加封闭的 `contractRef` 和 `operation`；schema
继续拒绝 expected、actual、secret、message 和任意自由文本。repair task 指向 protected
`.skvm-artifact/public-runtime-contract.json`，最多调用一次。

本地 activation fixture 使用公开 `.env` 名称和 `Number(process.env.APP_PORT)` 证据，
构造 classification/schema known failure。初检能够定位
`variables/APP_PORT/classification` 与 contract-bound schema rule；一次 fixture repair
后二验通过，pre/post snapshot 保持同一 generation identity。这只证明机制可激活，
不代表真实模型或离线 scorer 已改善。

冻结产物：

```text
benchmarks/skill-ir/pilots/env-manager/packages/executable-public-contract-artifact-v3/
benchmarks/skill-ir/pilots/env-manager/env-manager-public-contract-artifact-v3-lock.json
```

Lock 固定 `xty/gpt-5.6-sol`、`bare-agent@workspace-public-contract-v3`、Windows/clean、
两个 development task × 2 repetitions、共享 generation、一次 repair 和数值 gate。
Runner 使用独立 system `ir-public-artifact-dev`；V3 禁止以 `check-only` 执行，逻辑
check-only 只能由 pre snapshot 派生。Package 共 13 个文件，约 9.15 MB，体积主要来自
自包含 parser；轻量 ABI 仍需另开 catalog，不能修改当前 digest。

Dry-run：

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts `
  '--corpus=pilot' '--model=xty/gpt-5.6-sol' '--model-family=gpt' `
  '--adapter=bare-agent' '--adapter-version=workspace-public-contract-v3' `
  '--repetitions=2' `
  '--panel-config-id=env-manager-public-contract-artifact-v3-development' `
  '--systems=ir-public-artifact-dev' '--contexts=clean' '--agents=skvm' `
  '--environments=windows' '--skills=env-manager' `
  '--tasks=env-manager-node-audit-dev-001,env-manager-vite-audit-dev-002' `
  '--limit=4' '--allow-artifact-development-replay' `
  '--artifact-package-dir=benchmarks/skill-ir/pilots/env-manager/packages/executable-public-contract-artifact-v3' `
  '--artifact-lock=benchmarks/skill-ir/pilots/env-manager/env-manager-public-contract-artifact-v3-lock.json' `
  '--artifact-repair-mode=one-repair' `
  '--out-dir=results/skill-ir/env-manager-public-contract-v3-development-dry-run-2026-07-21'
```

付费执行前边界为：V3 本地机制与冻结成立，4-row dry-run 通过；当时尚无真实效果
证据。后续冻结运行结果如下。

冻结真实 development 随后已执行：route probe `ok`；4 个 generation 中 3 个形成
完整 pair，pre/post 均为 mean 0.70、0 success，paired delta=0；1 个 generation 在
adapter 阶段 infrastructure failure。三次 repair 均触发但没有修改文件，pre/post
digest 相同，0 次二验通过。Development gate 失败，held-out 保持关闭。

Failure audit 显示报告字段外层数组存在，但非空元素为 object；V3 repair report 的
`expectedType=array` 没有充分表达 item type，强模型因此误判“已经满足”。同时离线
scorer 继续报告 schema criterion 失败，而 runtime residual 主要集中在 classification，
说明 runtime/scorer success contract 仍有覆盖差。该结果冻结为 V3 失败证据，下一轮
必须新开 catalog；不在 V3 package、lock、prompt、scorer 或 gate 上事后调优。

## 12. Lock 与实验门禁

Development lock 在付费前冻结：

- package/provenance digest；
- catalog/code catalog；
- model/family、adapter/version；
- task ids、split、context、environment；
- repetitions 和 repair modes；
- numerical scorer gate；
- attribution activation gate。

Runtime validation 与 scorer gate 分开。出现 repair 只证明状态机被激活，不证明
任务质量改善。

能力诊断不修改 mini lock，新增：

- `env-manager-gpt41-capability-diagnostic-lock.json`：协调 20 行诊断矩阵并绑定所有
  冻结输入 digest；
- `env-manager-executable-semantic-artifact-v2-gpt41-lock.json`：只把 runner model
  identity 改为 `xty/gpt-4.1`，package/catalog/gate/repair 上限保持不变。

协调 lock 的 criterion 只保存公开 criterion id 和 evidence class，不保存 expected
集合，也不进入 package、agent prompt 或 repair input。

## 13. 当前已知限制

- V2 仍不能完整推导 exact classification。
- Public schema 语义覆盖不足。
- V3 repair contract 尚未表达 array item schema；`expectedType=array` 对强模型仍有
  歧义。
- V3 runtime validator 与离线 scorer 的 schema success surface 尚未完全对齐。
- Repair 可能引入结构回归。
- V1/V2 历史 check/repair arms 使用独立 generation，因果 attribution 有噪声；V3
  后续实验必须使用当前共享 snapshot 路径。
- Evidence bundle 约 8.5 MiB，因为内嵌 TypeScript parser；外置需要新 ABI/catalog。

`failure-audit.ts` 将 scored runtime metadata 分类为 success、infrastructure、runtime
false pass、runtime/scorer aligned failure、repair revalidation failure 等，并把
mini/strong criterion transition 仅标为 capability-signal candidate。工具固定输出
`causalClaimAvailable=false`，最终归因仍需结合公开证据充分性和跨时间 provider 限制。
Audit runner 会严格校验冻结矩阵的每个 identity 格，runtime validation fields 必须
再次通过闭合 schema 与脱敏规则；重复 comparison key 直接失败。提交的 compact
evidence 用逐文件 digest 和 bundle digest 绑定，原始模型输出与 workdir 不进入仓库。

## 14. Skill-agnostic Validated Artifact Catalog

新 catalog 不再把 `skillId` 写进 schema literal，也不在通用 runtime 中按 skill 分支：

```text
validated-skill-artifact/v1
validated-skill-artifact-manifest/v1
validated-skill-artifact-provenance/v1
skill-artifact-execution-plan/v1
skill-artifact-execution-result/v1
```

实现：

```text
src/benchmarks/skill-ir/validated-artifact-catalog.ts
src/benchmarks/skill-ir/validated-artifact-runtime.ts
```

Manifest 声明带稳定 id/path/kind/digest 的 artifact、protected inputs、generated outputs、
provenance 和 execution plan。Validator 拒绝路径逃逸、反斜杠、symlink、特殊文件、重复
id/path、undeclared file、digest drift、manifest/provenance 漂移，以及 process/validate
节点对未声明或错误 kind artifact 的引用。

Execution plan 是有向无环依赖图。V1 只开放 `process` 和 `validate` 节点；每个节点使用
`interpreter.env + fallback`、script/check artifact id、参数数组和环境白名单。Runtime 使用
`Bun.spawn(argv)`，不经过 shell，不接收 command string；只展开完整参数 `{workdir}`。
保护输入在执行前和每个节点后复核。非零退出、timeout、validator invalid JSON/schema、
protected mutation 和语义 validation failure 分开记账。

Compact result 只包含节点 id/kind/status、exit class、process/validation duration、package
bytes，以及固定为 0 的 direct-only model generation/repair tokens；stdout、stderr、绝对路径
和 secret 不进入结果。该 runtime 是执行机制，离线 deterministic scorer 仍是任务成功权威。

### 14.1 Law Compiler Adapter

```text
src/benchmarks/skill-ir/law-artifact-compiler.ts
src/benchmarks/skill-ir/law-artifact-run.ts
benchmarks/skill-ir/pilots/law-to-markdown/packages/validated-skill-artifact-v1/
```

Adapter 只接收 source closure、base IR/source audit、resource contract 和 development prompt
投影。完整 task evaluator、held-out prompt、runtime output、profile feedback 和 secret 没有
compiler sink。Package 包含三个上游 Python scripts、canonical review template/schema、
direct tool plan、runtime checker、validation policy 和 candidate validation notes。

编译：

```powershell
bun ./src/benchmarks/skill-ir/law-artifact-run.ts `
  '--root-dir=.' `
  '--out-dir=benchmarks/skill-ir/pilots/law-to-markdown/packages/validated-skill-artifact-v1'

bun ./src/benchmarks/skill-ir/law-artifact-run.ts `
  '--verify-only=benchmarks/skill-ir/pilots/law-to-markdown/packages/validated-skill-artifact-v1'
```

冻结 package 只运行 `--verify-only`。新版本必须编译到新目录并使用新 lock，不能覆盖已经进入
实验的 digest。

Law direct plan：

```text
python law_to_markdown.py document.txt
  --out-dir markdown
  --law-decision auto
  --artifact-level minimal
-> python law_artifact_check.py --workdir {workdir}
```

上游脚本会在 `--out-dir` 下创建 `document/`，因此参数必须是 `markdown`。本地调试曾使用
`markdown/document` 并产生重复目录；activation test 已固定该回归。Checker 对
`最终审核结论：` 做精确枚举解析，不用“包含通过”之类的模糊子串；JSON report 使用 ASCII
escape，避免 Windows pipe codepage 损坏中文路径。

### 14.2 Law 本地 Activation

使用 workspace Python 且 resource probe 通过后，两个 development fixture 都在无 shell、
无模型调用下完成：

| Task | Runtime | Scorer | Hard gate | 残差 |
|---|---|---:|---|---|
| statute development | pass | 0.85 / success | 0 fail | `law-document-policy` 仍 fail。 |
| non-law standard development | pass | 1.00 / success | 0 fail | 无 scorer residual。 |

该结果只证明 catalog、adapter、direct process、validator 和既有 scorer 可以贯通。它没有
冻结 development lock，没有运行 held-out，也不能证明跨 skill 通用或 token break-even。
下一步先书面冻结 Law development 对照，再用第二种 phenotype skill 复用同一 core API。

冻结 GPT-4.1 诊断已执行 20 行。强模型产生 18 个低层 criterion 改善，但
classification/schema 在五个系统中持续失败；one-repair 4/4 激活、0/4 二验通过。
因此下一 catalog 应优先改进 public schema contract lowering、repair 定位和
pre/post repair 可评分快照，不能仅靠更换模型或扩大 repair 次数。
- 当前只有单一 GPT 模型族、bare-agent、Windows、clean development evidence。

## 14. 测试

```powershell
bun test `
  ./src/benchmarks/skill-ir/repair-evidence.test.ts `
  ./src/benchmarks/skill-ir/final-ir-provenance.test.ts `
  ./src/benchmarks/skill-ir/artifact-package.test.ts `
  ./src/benchmarks/skill-ir/public-contract.test.ts `
  ./src/benchmarks/skill-ir/artifact-preflight.test.ts `
  ./src/benchmarks/skill-ir/artifact-snapshot.test.ts `
  ./src/benchmarks/skill-ir/artifact-runtime.test.ts `
  ./src/benchmarks/skill-ir/semantic-evidence.test.ts `
  ./src/benchmarks/skill-ir/semantic-checker.test.ts `
  ./src/benchmarks/skill-ir/env-manager-semantic-activation.test.ts
bun run typecheck
```

## 15. 修改注意

1. 冻结 catalog/lock/result 永不原地调优。
2. 新 semantic code 需要新 code catalog 和 package digest。
3. 新 evidence rule 必须有 canary、reverse-evidence 和 limitation test。
4. Runtime validator 不得读取 scorer expected。
5. Held-out 只能消费通过 development gate 的同一 provenance-bound artifact。
6. 组件变化更新本文档，不再新增 package/run Markdown。

### Validated package 执行隔离

`validated-skill-artifact/v1` 在校验 package digest 后，不直接从冻结目录执行脚本。Runtime
先将完整 package 复制到操作系统临时目录，在该快照上展开 artifact placeholder 和运行节点，
结束后无条件删除快照。这样 Python import 产生的 `__pycache__`、工具侧缓存或误写只影响
临时副本；原 package 在多次调用后仍能通过 undeclared-file 与 digest 校验。Workdir 的
protected input snapshot、输出检查和 compact cost 记录保持不变。

## 16. V4 Coverage Audit 与确定性 Repair

V3 development 失败后，下一 catalog 不直接继续加 prompt。实现先增加一层
failure-to-contract coverage audit，把每个 scorer criterion 对齐到 runtime check、
公开 evidence、deterministic repair 和 residual gap。覆盖等级只有：

- `equivalent`：runtime success surface 与 scorer 的公开可观察要求等价；
- `partial`：runtime 能发现一部分失败，但仍存在 scorer-only 条件；
- `none`：runtime 当前没有对应检查。

Audit 表是研究记账和 claim 边界，不是第二份 scorer。它不得消费 evaluator expected
或 hidden fixture。Observed failure 只允许使用冻结 raw/scored 行中的 error code、
criterion id、路径和 JSON pointer。

候选 `executable-contract-repair-artifact/v4` 增加机器可执行 output/repair contract。
报告字段将被描述为 canonical `array<string>` 集合，而不是含糊的 `array`。Repairer
根据 protected public runtime contract 在内存中重建 classification，并以确定性方式
写回 `env-report.json`；结果日志只保存 operation 和 provenance ref，不保存重建值。

Schema repair 只消费 protected runtime evidence 与版本化 policy，并从零重建 schema，
不保留模型生成但没有 evidence 的 allowed-looking 字段。环境访问默认字符串语义与
`*_DSN` URI 语义属于 base rule；server-only DSN sensitivity 与 `_SIGNING_KEY` 长度
明确标记为 `development-learned-candidate`，绑定冻结 V3 evidence digest。它们必须有
reverse-evidence 与冲突测试，并在未参与构造的任务上验证后才能 promotion。

离线 replay 直接复制冻结 V3 pre-repair snapshot，先确认原失败，再运行 deterministic
repair、V3/V4 validation 和既有 deterministic scorer。该阶段不调用模型、不修改原
snapshot，也不产生主 claim。只有 replay 通过并解释全部 residual，才开始 V4 package
compiler、Runner dispatch、lock 和付费 development。

2026-07-22 的首次真实 snapshot replay 已满足上述本地门槛：冻结 V3 的三个完整
pre-repair snapshots 均从 runtime fail / scorer 0.70 变为 runtime pass / scorer 1.00，
classification 与 schema residual 全部清空，protected digest 全部稳定。Repair 每条
执行 canonical report、empty-redacted example 和 schema full rebuild，未调用模型。
Runtime contract 文件 SHA-256 绑定到 repair contract；hardlink 在写入前拒绝，生成文件
通过同目录临时文件替换。

Vite 的第一次 replay 曾停在 0.90，残留 server-side DSN sensitivity。V4 随后增加
development-learned candidate：只有名称以 `_DSN` 结尾、存在 server environment
reference 且不存在 client environment reference 时才推导 `sensitive=true`；
client-side reverse-evidence 防止无条件扩张。该规则是 in-sample development repair，
不是已验证通用知识。原 V3 批次的 1 条 generation infrastructure failure 仍单独记账，
source-generation 口径为 3/4、mean 0.75，gate 仍失败。

验证与重放命令：

```powershell
bun test `
  ./src/benchmarks/skill-ir/contract-coverage.test.ts `
  ./src/benchmarks/skill-ir/executable-repair-contract.test.ts `
  ./src/benchmarks/skill-ir/deterministic-artifact-repairer.test.ts

bun ./src/benchmarks/skill-ir/deterministic-repair-replay-run.ts `
  '--raw=results/skill-ir/env-manager-public-contract-v3-development-run-2026-07-21/raw-runs.jsonl' `
  '--tasks=benchmarks/skill-ir/pilots/env-manager/tasks.json' `
  '--output-contract=benchmarks/skill-ir/pilots/env-manager/packages/executable-public-contract-artifact-v3/artifacts/contracts/output-contract.json' `
  '--lock=benchmarks/skill-ir/pilots/env-manager/env-manager-public-contract-artifact-v3-lock.json' `
  '--source-evidence=results/skill-ir/env-manager-public-contract-v3-development-evidence-2026-07-21/summary.json' `
  '--method-freeze=benchmarks/skill-ir/pilots/env-manager/env-manager-v4-deterministic-replay-freeze.json' `
  '--replay-dir=results/skill-ir/env-manager-v4-deterministic-replay-run-2026-07-22' `
  '--out=results/skill-ir/env-manager-v4-deterministic-replay-evidence-2026-07-22/summary.json'
```

Method freeze 还绑定 `tasks.json` 与 `env-manager-grade.ts` 摘要，防止修改 evaluator
expected 后仍沿用同一 evidence identity。两个 learned rules 各自保存 rule id、
`env-schema-rules` lineage、V3 evidence digest 和 candidate status。

### V4 Package、Preflight 与 Runtime

V4 已编译为独立目录：

```text
benchmarks/skill-ir/pilots/env-manager/packages/executable-contract-repair-artifact-v4/
```

Package provenance 绑定 base IR、真实 source、公开 task contract、coverage audit、V4 replay
freeze/summary 与 learned-rule lineage。静态 package 只保存 repair recipe；运行时 contract
digest 由 preflight 在 workdir 中生成 public runtime contract 后绑定，写入并保护：

```text
.skvm-artifact/public-runtime-contract.json
.skvm-artifact/executable-repair-contract.json
```

Runner 使用独立 system `ir-contract-artifact-dev`。状态机固定为 generation、pre snapshot、
validate、一次 deterministic repair、revalidate、可选一次脱敏模型 repair、final validate、
post snapshot、stop。确定性修复通过后不会调用模型 repair；旧 catalog 的 runtime 分支保持
不变。V4 checker 只消费 protected contract 与最终 workdir，runtime validator 仍不是 scorer。

编译与校验：

```powershell
bun ./src/benchmarks/skill-ir/executable-contract-artifact-run.ts `
  '--base-ir=benchmarks/skill-ir/pilots/env-manager/base-ir.json' `
  '--tasks=benchmarks/skill-ir/pilots/env-manager/tasks.json' `
  '--source=benchmarks/skill-ir/pilots/env-manager/source/SKILL.md' `
  '--coverage-audit=results/skill-ir/env-manager-v4-deterministic-replay-evidence-2026-07-22/contract-coverage-audit.json' `
  '--replay-freeze=benchmarks/skill-ir/pilots/env-manager/env-manager-v4-deterministic-replay-freeze.json' `
  '--replay-summary=results/skill-ir/env-manager-v4-deterministic-replay-evidence-2026-07-22/summary.json' `
  '--out-dir=benchmarks/skill-ir/pilots/env-manager/packages/executable-contract-repair-artifact-v4'

bun ./src/benchmarks/skill-ir/executable-contract-artifact-run.ts `
  '--verify-only=benchmarks/skill-ir/pilots/env-manager/packages/executable-contract-repair-artifact-v4'
```

冻结 package 不应原地重编译；日常复核只执行 `--verify-only`。任何 recipe、checker、policy 或
provenance 变化都需要新 catalog/lock，不能修改本轮 digest 后继续使用原实验身份。

### V4 Frozen Development 结果

2026-07-22 使用冻结 `xty/gpt-5.6-sol`、Windows/clean/bare-agent、两个 development task ×
2 repetitions 执行真实 V4 批次。4 个预注册 generation 中 3 个完整，1 个在 generation
阶段因 Bun 1.3.14 internal assertion crash 计为 infrastructure。三个完整 pair 的 pre
scorer 均为 0.90，deterministic repair 后均为 1.00；`env-schema-rules` 3/3 从 fail 变为
pass，其他 15 个 criterion 状态保持 pass。Binary success 在 pre/post 都是 3/3，因此本轮
证明的是同一 generation 上确定性后处理带来的 criterion/score 改善，不是 success 翻转。

三条完整行都执行一次 deterministic repair 并通过二验，模型 residual repair 调用为 0，
model repair tokens 为 0。完整行 generation/aggregate tokens 合计 46409，均值 15469.67；
确定性修复耗时合计 230 ms，validation 合计 457 ms。正式 gate 仍按 4 行分母计算为 3/4、
mean 0.75、1 infrastructure，未通过并阻断 held-out；不补跑 crash 行，也不修改 package、
lock、scorer、tasks 或阈值。

Compact evidence：

```text
results/skill-ir/env-manager-contract-repair-v4-development-results-2026-07-22.jsonl
results/skill-ir/env-manager-contract-repair-v4-development-evidence-2026-07-22/summary.json
results/skill-ir/env-manager-contract-repair-v4-development-evidence-2026-07-22/failure-audit.jsonl
results/skill-ir/env-manager-contract-repair-v4-development-run-2026-07-22/development-gate-report.json
```
