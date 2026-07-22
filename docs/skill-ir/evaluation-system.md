# Skill IR 评估系统

本文档说明 corpus、matrix、真实 agent runner、workdir scorer、分析器、route health
和 validation planning。冻结实验结果见 `docs/skill-ir/experiment-results.md`。

## 1. 目录

```text
benchmarks/skill-ir/corpus/                  corpus registry
benchmarks/skill-ir/tasks/                   synthetic calibration tasks
benchmarks/skill-ir/pilots/                  real pilot source/tasks/IR/package
src/benchmarks/skill-ir/matrix.ts            experiment matrix
src/benchmarks/skill-ir/real-agent.ts        materialization and command
src/benchmarks/skill-ir/real-agent-run.ts    plan and execute CLI
src/benchmarks/skill-ir/scoring.ts           raw -> scored
src/benchmarks/skill-ir/score-real-agent-runs.ts
scripts/analyze_skill_ir_results.py
scripts/analyze_skill_ir_slices.py
```

## 2. Corpus

Runner 必须显式选择：

```text
--corpus=calibration
--corpus=pilot
```

`calibration` 包含 synthetic seed，证据权重为 `calibration-low`。`pilot` 包含有
provenance 的真实 skill。Corpus entry 固定：

- source kind/path/digest；
- provenance 与 evidence weight；
- status：source-imported、tasks-authored、runnable；
- IR/task/resource path；
- license 和 upstream commit。

Runner 默认只收录 `runnable`。Pre-IR calibration 必须使用显式
`--allow-tasks-authored`，且仅允许一个 pilot、development、clean 和
`no-skill | original`。

## 3. Experiment Systems

```ts
type ExperimentSystem =
  | "no-skill"
  | "original"
  | "ir-only"
  | "ir-static"
  | "ir-profile"
  | "ir-pgo-dev"
  | "ir-pgo"
  | "ir-artifact-dev"
  | "skvm-aot";
```

冷启动默认系统由 `COLD_START_EXPERIMENT_SYSTEMS` 固定为：

```text
no-skill | original | ir-static
```

`ir-pgo-dev`、`ir-pgo` 和 `ir-artifact-dev` 都需要额外 provenance/lock guard。
`skvm-aot` 在接入真实 upstream AOT path 前不进入主表。

## 4. Matrix 和 Identity

`buildExperimentMatrix` 组合 skill、system、context、agent、environment 和 task。
每个真实 run 还记录：

```text
model
modelFamily
adapter
adapterVersion
runIndex
panelConfigId
skillProvenance
evidenceWeight
```

重复运行必须按完整 identity 配对。Partial identity、重复 construction evidence 或
混合 legacy/identified row 会失败，不允许用 task id 单独配对。

## 5. Materialization

`materializeCaseArtifacts` 为每行创建：

```text
task/task.json
skill/SKILL.md
workdir/
```

行为：

- no-skill 不注入 skill；
- original file source 读取 exact committed `SKILL.md` 和 resources；
- IR system 渲染对应 IR/final artifact；
- fixture 和 resource 复制到持久化 workdir；
- task JSON 使用用户可见 prompt，evaluator payload 不进入 prompt。

## 6. Runner CLI

无执行 dry-run 示例：

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts `
  '--corpus=pilot' `
  '--skills=env-manager' `
  '--systems=no-skill,original,ir-static' `
  '--contexts=clean' `
  '--agents=skvm' `
  '--environments=windows' `
  '--tasks=env-manager-node-audit-dev-001' `
  '--model=xty/gpt-4.1-mini' `
  '--adapter=bare-agent' `
  '--out-dir=results/skill-ir/example-dry-run'
```

不加 `--execute` 时只生成 `plan.json` 和 materialized artifacts。真实执行还需：

```text
--execute
--require-env=<provider-key-env>
```

API key 只存在环境变量，不写入 config、plan、raw/scored row 或文档。

## 7. 运行边界

### Development replay

- 只允许 pilot corpus；
- 一个显式 skill；
- 显式 development tasks；
- clean context；
- matching provenance/lock；
- 不得混入 held-out。

### Held-out PGO

- 必须提供 Final IR override directory；
- provenance 必须匹配 corpus、skill、source/base/final digest；
- construction evidence 只来自 development；
- selected skill 必须存在 repair；
- held-out task 不得出现在 construction evidence。

### Artifact development

- system 只能是 `ir-artifact-dev`；
- package catalog 和 lock identity 必须匹配；
- model、adapter、environment、context、tasks、repetitions、repair mode 和 digest
  由 lock 约束。

GPT-4.1 能力诊断使用两层 lock：

```text
env-manager-gpt41-capability-diagnostic-lock.json
  -> 冻结 12+4+4 矩阵、source/base/task/scorer/package digest、gate 和解释边界
env-manager-executable-semantic-artifact-v2-gpt41-lock.json
  -> 给现有 artifact runner 使用的 GPT-4.1 兼容投影
```

协调 lock 不传给 agent，也不包含 evaluator expected。它只用于预注册、dry-run
完整性验证和离线归因；runner lock 继续使用现有严格 semantic artifact schema。

能力诊断 dry-run compiler：

```powershell
bun ./src/benchmarks/skill-ir/capability-diagnostic-run.ts `
  --lock=benchmarks/skill-ir/pilots/env-manager/env-manager-gpt41-capability-diagnostic-lock.json `
  --out-dir=results/skill-ir/env-manager-gpt41-capability-diagnostic-dry-run
```

该 CLI 故意不支持 `--execute`。输出 `diagnostic-plan.json` 和三组已有 runner plan；
只有 route probe 通过后，才允许按保存参数分别执行。

## 8. Raw Rows 与 Workdir

`executePlan` 按行重建限定 workdir、执行 SkVM、提取 adapter `RunStatus`、token 和
artifact runtime metadata，再追加 `raw-runs.jsonl`。

Non-ok adapter status 即使 wrapper exit code 为 0，也按 infrastructure 处理，不让
final output 文本伪装成功。

Raw rows 和 workdir 默认保留本地，便于重评分和审计；compact scored rows 和 summary
提交到 Git。

Real-skill source closure 在 manifest 存在 `sourceFiles` 时只复制声明文件，并逐文件
验证 SHA-256。未登记的 `__pycache__`、本地日志或编辑器文件不能进入 materialized
original/static skill。没有 source manifest 的 legacy calibration fixture 继续使用旧的
目录复制兼容路径。

## 9. Scoring

```ts
scoreRawRunRows(...)
scoreRawRunRowsBySkill(...)
classifyFailureType(...)
```

Scorer 先处理执行/infrastructure，再调用 task evaluator。`env-manager` evaluator
读取最终 workdir，不使用 LLM judge，检查：

- protected inputs；
- synthetic secret leak；
- required artifacts；
- exact classification；
- `.env.example` safety；
- schema rules。

Hard gate 与 weighted threshold 同时满足才 success。Evaluator exception 只影响当前
row，并记录为 infrastructure/evaluation，不中断整批评分。

`law-to-markdown` 使用 `skill-ir-law-to-markdown` custom evaluator，覆盖 protected input、
artifact policy、字符流保真、heading hierarchy、项/目换行、报告 source 和审核结论。
法律与非法律 task 共用 criterion identity，但 payload check 按公开文档策略切换。路径
逃逸、symlink 逃逸、payload 错误和 workdir I/O 失败属于 infrastructure；普通内容或格式
错误属于 evaluation failure。Scored row 只保留 criterion pass/score。

资源预检：

```powershell
$env:SKVM_PYTHON = '<python-with-required-modules>'
bun ./src/benchmarks/skill-ir/resource-contract-run.ts `
  '--contract=benchmarks/skill-ir/pilots/law-to-markdown/resource-contract.json' `
  '--out=results/skill-ir/law-to-markdown-resource-probe/result.json'
```

Runner 尚不自动安装依赖；probe 非 `ok` 时不得执行付费 calibration。

评分命令：

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts `
  '--raw=<run-dir>/raw-runs.jsonl' `
  '--tasks=benchmarks/skill-ir/pilots/env-manager/tasks.json' `
  '--out=<run-dir>/scored-results.jsonl'
```

## 10. Analysis

主表：

```powershell
python scripts/analyze_skill_ir_results.py <scored.jsonl> <table.csv>
```

Slice：

```powershell
python scripts/analyze_skill_ir_slices.py <scored.jsonl> <slices.csv>
```

报告字段包括 mean/worst success、variance、rule violations、token、latency、paired
delta、regression、negative delta、infrastructure 和 provenance/model/context slice。

能力诊断 failure audit：

```powershell
bun ./src/benchmarks/skill-ir/failure-audit-run.ts `
  --lock=benchmarks/skill-ir/pilots/env-manager/env-manager-gpt41-capability-diagnostic-lock.json `
  --out-dir=results/skill-ir/env-manager-gpt41-capability-failure-audit
```

无 `--strong-scored` 时，CLI 从 lock 加载历史 mini 的 static/check-only/one-repair
20 行并生成 audit。强模型完成后必须提供三次 `--strong-scored=<path>`，再生成逐
criterion transition。Audit 只保留错误码、相对路径、JSON pointer、criterion pass
和失败分类，不复制 stdout、workdir 内容、secret 或 evaluator expected。

CLI 在输出前逐格验证冻结的 12+4+4 identity：model/family、skill、task、system/mode、
context、agent、environment、adapter/version、panel、run index、criteria 和 case id
必须完全匹配，重复或缺失格直接失败。Runtime report 重新通过 v1/v2 正式 schema，
白名单字符串还会拒绝绝对路径、控制字符、secret canary 与常见凭据形态。Comparison
索引也拒绝重复 key，不允许静默覆盖。

跨批次独立生成只能作诊断，不能替代同一冻结矩阵内 paired comparison。

V3 artifact 归因使用 `artifact-snapshot.ts` 保存同一 generation 的 pre/post workdir。
raw 行中的 snapshot reference 只携带 generation identity、phase、绝对路径和目录摘要；
scorer 先验证摘要，再展开 `check-only` 与 `one-repair` 两条逻辑行。前者读取 pre
snapshot 并只计 generation token，后者读取 post snapshot、计 aggregate token，且
继续单列 `repairUsage`。缺一侧快照、identity/phase 不一致、摘要漂移或重复逻辑 key
都会拒绝整批评分。没有 snapshot metadata 的历史 raw 行不自动展开。

`failure-audit.ts` 支持 v1/v2/v3 runtime report。V3 audit 只额外保留封闭
`contractRef` 与 `operation`，仍拒绝 secret canary、绝对路径、自由文本和超长字段；
stdout、workdir 内容、evaluator expected 不进入 compact audit。

### V4 Coverage Audit 与 Offline Replay

`contract-coverage-run.ts` 将六个 env-manager scorer criterion 映射到 runtime check、
公开 evidence、deterministic repair 和 residual gap。输入只包含 criterion registry、
封闭 runtime code 和失败 criterion id；输出不是 scorer，也不包含 evaluator payload。

```powershell
bun ./src/benchmarks/skill-ir/contract-coverage-run.ts `
  '--runtime-codes=INVALID_REPORT_FIELD_TYPE,MISSING_CLASSIFICATION_ENTRY' `
  '--failed-criteria=env-classification,env-schema-rules' `
  '--tasks=benchmarks/skill-ir/pilots/env-manager/tasks.json' `
  '--out=results/skill-ir/env-manager-v4-deterministic-replay-evidence-2026-07-22/contract-coverage-audit.json'
```

`deterministic-repair-replay-run.ts` 只复制冻结 lock 中的 development V3 pre snapshot。
CLI 校验 V3 package/lock/source summary digest、完整矩阵 identity、task split 与 generation
唯一性，并通过 `env-manager-v4-deterministic-replay-freeze.json` 绑定 tasks/scorer bytes、
criterion registry 和 learned-rule lineage。Repairer 自行读取并校验 protected runtime contract 文件；tasks/scorer payload
只在独立的 before/after evaluator 阶段加载。
Replay summary 投影 score、criterion id、runtime code、operation 和 digest，不提交复制的
workdir。原 raw 中没有完整 snapshot 的 generation 计入 source denominator；summary
同时报告 replay-only 3/3 与 gate-compatible source 3/4、mean 0.75，不伪造逻辑 arm，
也不从结果中静默消失。

离线 replay 是无模型的 development mechanism evidence，不能写成 V4 真实实验 gate 通过。
V4 Runner 现已通过独立 system `ir-contract-artifact-dev` 接线，并由
`env-manager-contract-repair-artifact-v4-lock.json` 冻结 2 个 development task × 2 次
repetition 的 4-generation 分母。2026-07-22 的 dry-run 生成 4 行计划但没有执行模型。

同日冻结付费 development 已完成。4 个 raw generation 全部保留；其中 3 个有完整 pre/post
snapshot，1 个 generation-stage Bun crash 形成 missing pair。Scorer 生成 7 个逻辑行：
3 个 check-only、3 个 one-repair 和 1 个 infrastructure。Generation gate 不以完整 pair
重新缩小分母，最终记录 3 success、paired 3、missing pair 1、mean 0.75、hard-gate
regression 0、infrastructure 1，gate failed。该结果不允许补跑或进入 held-out。

Generation gate 由 `artifact-development-gate.ts` 记账：完整 pre/post pair 以 post arm 判定
success/score，以 pre/post 判断 hard-gate regression；缺 raw generation 或缺 pair 都按 0 分
计入冻结分母并记为 infrastructure。CLI 从 lock 读取 task、次数和数值阈值，并验证 tasks
digest：

```powershell
bun ./src/benchmarks/skill-ir/artifact-development-gate-run.ts `
  '--raw=<run-dir>/raw-runs.jsonl' `
  '--scored=<scored-results.jsonl>' `
  '--lock=benchmarks/skill-ir/pilots/env-manager/env-manager-contract-repair-artifact-v4-lock.json' `
  '--out=<run-dir>/development-gate-report.json'
```

Dry-run 中含逗号的筛选参数在 PowerShell 必须整体使用单引号，例如
`'--tasks=env-manager-node-audit-dev-001,env-manager-vite-audit-dev-002'`。未整体引用会改变
传入 Runner 的任务集合，并被 lock 的 exact-match guard 拒绝。

Compact summary 将 raw、scored、gate、route probe、failure audit 和冻结 lock 全部以
SHA-256 绑定。Raw、snapshot、workdir 和 route artifacts 留本地；提交 scored JSONL、gate、
route probe compact row、failure audit 与 summary。Pre/post 中 binary success 均为 3/3，
归因报告只写 score 0.90→1.00 与 3 个 schema criterion 转绿，不写 repaired-to-success。

### V4 Infrastructure Diagnostic

`infrastructure-diagnostic-run.ts` 对冻结 raw 做只读、脱敏的 post-hoc 审计。Lock 绑定
raw/summary/gate SHA-256、完整 model/adapter/panel/task identity、一次执行和
`heldOutAllowed=false`；它不运行模型、不补跑 source generation，也不能把 report 标为
method evidence。

```powershell
bun ./src/benchmarks/skill-ir/infrastructure-diagnostic-run.ts `
  '--lock=benchmarks/skill-ir/pilots/env-manager/env-manager-v4-infrastructure-diagnostic-lock.json' `
  '--out=results/skill-ir/env-manager-v4-infrastructure-diagnostic-2026-07-22/report.json'
```

输出只含 task/run、stage、run status、exit code、封闭 crash class、Bun version 和安全字段
fingerprint；不保存 stdout、stderr、绝对路径或模型正文。当前审计得到 1 条
`bun-internal-assertion` / Bun 1.3.14 / generation record，reproducibility 为
`inconclusive`。若以后做复现 probe，必须新建 execution identity，不能回填冻结 V4 gate。

### Pre-IR Calibration Gate

`pre-ir-calibration-run.ts` 从 digest-bound lock 编译 `tasks-authored` skill 的精确
`no-skill | original` development 计划。`plan` 不执行；`route-probe` 只保存脱敏 route
状态；`execute` 要求 fresh resource probe、成功 route probe 和 API key 后运行完整矩阵。

`pre-ir-calibration-gate-run.ts` 验证 scored row 的 model/family/adapter/panel/task/split
身份，固定缺行与缺 pair 的分母，并报告 system success/mean/token、paired score delta 和
criterion pass transition。Gate 要求完整、零 infrastructure、no-skill 非饱和和至少一个
pair 有不同 outcome vector；不要求 original 优于 no-skill。Compact report 只绑定
lock/raw/scored/resource/route SHA-256，不保存路径、模型输出或 evaluator details。

Pre-IR lock 在 pilot 晋级后仍可按 digest 重建历史 plan，但 `route-probe/execute` 会重新
检查 live corpus 必须仍为 `tasks-authored` 且没有 base IR，因此旧阶段不能被误重放。

### Static Development Lock

`static-development.ts` 定义通用 `skill-ir-static-development-lock/v1`。Lock 要求 live pilot
已经 `runnable`，并同时绑定 source、tasks、resource contract、deterministic scorer、
profile-empty base IR 与 source-audit sidecar。计划只允许：

```text
no-skill | original | ir-static
development x clean x windows x 2 repetitions
```

当前 CLI 只开放 plan phase，尚未加入 fresh resource/route evidence 前拒绝 execute：

```powershell
bun ./src/benchmarks/skill-ir/static-development-run.ts `
  '--lock=benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-static-development-lock.json' `
  '--out-dir=results/skill-ir/law-to-markdown-static-development-dry-run-2026-07-23' `
  '--phase=plan'
```

冻结 law 矩阵为 12 rows / 4 complete triplets，模型 `xty/gpt-5.6-sol`，gate 为
`ir-static success >= 3/4`、mean `>= 0.85`、0 infrastructure、0 hard-gate regression、
至少一个相对 original 改善 pair。该 gate 在付费前写入 lock，不允许由结果反推。

## 11. Route Health

`route-probe-run.ts` 对每个模型运行一个代表 case，输出：

```text
ok | timeout | infrastructure | agent
```

Windows 超时时使用 process-tree termination，避免 `bun run -> cmd -> bun` 后代持有
pipe。Probe 只判断 route 可用性，不评分 skill quality。

```powershell
bun ./src/benchmarks/skill-ir/route-probe-run.ts `
  '--corpus=pilot' `
  '--models=xty/gpt-4.1-mini' `
  '--task=env-manager-node-audit-dev-001' `
  '--timeout-ms=120000' `
  '--require-env=SKVM_XTY_API_KEY'
```

## 12. Advisory Tools

Promotion policy 和 validation planner 根据已有 scored rows 产生保守信号：

```text
promote-ir-pgo -> 候选 regression validation，不是自动部署
keep-ir-profile -> 保留静态基线并审计 Final IR
hold-for-more-validation -> route health + 更多 paired evidence
```

它们不自动修改 corpus、base IR 或 package，当前冻结扩展，优先补真实 skill 证据。

## 13. 结果持久化

提交：

- scored JSONL；
- CSV/JSON summary；
- route probe compact row；
- overlay/final IR/provenance；
- package、manifest、lock。

不提交：

- API key 和 `.skvm/config`；
- provider log；
- bulky raw transcript；
- materialized workdir；
- external source checkout cache。

## 14. 测试和修改注意

```powershell
bun test ./src/benchmarks/skill-ir
python scripts/analyze_skill_ir_results_test.py
python scripts/analyze_skill_ir_slices_test.py
bun run typecheck
```

修改时：

1. 新系统必须显式更新 matrix、materialization、runner guard、scoring 和 docs。
2. 新 identity 字段必须端到端进入 plan/raw/scored/pairing/provenance。
3. 新 evaluator 先写 deterministic fixture tests。
4. 不把 infrastructure failure 解释为 skill regression。
5. 不为单次 run 新建文档；更新 `experiment-results.md` 和 compact results。
