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

## 8. Raw Rows 与 Workdir

`executePlan` 按行重建限定 workdir、执行 SkVM、提取 adapter `RunStatus`、token 和
artifact runtime metadata，再追加 `raw-runs.jsonl`。

Non-ok adapter status 即使 wrapper exit code 为 0，也按 infrastructure 处理，不让
final output 文本伪装成功。

Raw rows 和 workdir 默认保留本地，便于重评分和审计；compact scored rows 和 summary
提交到 Git。

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

跨批次独立生成只能作诊断，不能替代同一冻结矩阵内 paired comparison。

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
