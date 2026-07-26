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

CLI 只接受 `plan | route-probe | execute`。后两个 phase 都重新运行 resource probe；route
probe 只保存 compact status，execute 要求同目录已有成功且身份一致的 probe：
probe 还携带 lock SHA-256，防止同名 lock 漂移后误用旧结果。

```powershell
bun ./src/benchmarks/skill-ir/static-development-run.ts `
  '--lock=benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-static-development-lock.json' `
  '--out-dir=results/skill-ir/law-to-markdown-static-development-dry-run-2026-07-23' `
  '--phase=plan'
```

将最后一项依次改为 `--phase=route-probe` 和 `--phase=execute`。执行结果写入
`<out-dir>/run/raw-runs.jsonl`，评分后运行：

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts `
  '--raw=<out-dir>/run/raw-runs.jsonl' `
  '--tasks=benchmarks/skill-ir/pilots/law-to-markdown/tasks.json' `
  '--out=<out-dir>/scored.jsonl'

bun ./src/benchmarks/skill-ir/static-development-gate-run.ts `
  '--lock=benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-static-development-lock.json' `
  '--raw=<out-dir>/run/raw-runs.jsonl' `
  '--scored=<out-dir>/scored.jsonl' `
  '--resource=<out-dir>/resource-probe.json' `
  '--route=<out-dir>/route-probe.json' `
  '--out=<out-dir>/gate-report.json'
```

冻结 law 矩阵为 12 rows / 4 complete triplets，模型 `xty/gpt-5.6-sol`，gate 为
`ir-static success >= 3/4`、mean `>= 0.85`、0 infrastructure、0 hard-gate regression、
至少一个相对 original 改善 pair。该 gate 在付费前写入 lock，不允许由结果反推。
缺 raw/scored 或 raw infrastructure 均在固定分母中按 0 分处理。Gate 通过只允许规划新的
held-out lock，不能直接执行 held-out 或写成主 claim。

2026-07-23 冻结批次得到 `ir-static=1/4, mean=0.7875`，与 original 聚合结果相同；
1 个 pair 改善 document-policy，1 个 pair 回归 review-outcome，2 个相同，gate failed。
Failure audit 显示 scorer 的 canonical review strings 来自公开 bundled script，但当前 lowering
未将其物化为 template/schema；该差距进入下一 catalog 设计，本 gate/scorer 不做事后修改。

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

## 15. Validated Artifact 本地验证

通用 package/runtime 的工程测试：

```powershell
bun test `
  ./src/benchmarks/skill-ir/validated-artifact-catalog.test.ts `
  ./src/benchmarks/skill-ir/validated-artifact-runtime.test.ts `
  ./src/benchmarks/skill-ir/law-artifact-compiler.test.ts
```

Law 真实 Python activation 需要先设置已通过 resource contract 的解释器：

```powershell
$env:SKVM_PYTHON = '<python-with-docx-and-pdfplumber>'
bun test ./src/benchmarks/skill-ir/law-artifact-activation.test.ts
```

Activation 会编译临时 package、运行 resource probe、分别执行两个 development fixture，
再调用既有 `lawToMarkdownGrade`。未设置 `SKVM_PYTHON` 时集成测试显式 skip，不会错误使用
缺依赖的默认解释器。Runtime pass 与 scorer success 分列；测试失败时不能通过放宽 scorer、
读取 evaluator expected 或运行 held-out 修补。

## 16. Law Validated Artifact Development

冻结 lock：

```text
benchmarks/skill-ir/pilots/law-to-markdown/
  law-to-markdown-validated-artifact-development-lock.json
```

无成本生成 16 行计划：

```powershell
bun ./src/benchmarks/skill-ir/validated-artifact-development-run.ts `
  '--phase=plan' `
  '--out-dir=results/skill-ir/law-to-markdown-validated-artifact-development-dry-run-2026-07-24'
```

只执行 4 条 direct artifact 行：

```powershell
$env:SKVM_PYTHON = '<python-with-docx-and-pdfplumber>'
bun ./src/benchmarks/skill-ir/validated-artifact-development-run.ts `
  '--phase=artifact-execute' `
  '--out-dir=results/skill-ir/law-to-markdown-validated-artifact-development-artifact-arm-2026-07-24'
```

计划固定为 `no-skill | original | ir-static | validated-artifact`、2 task × 2 repetition：
16 个逻辑样本中 12 行属于模型臂，4 行属于 direct deterministic 臂。`artifact-execute`
不会读取 API key 或调用模型；runner 只把 fixture 投影到 workdir，package runtime 看不到
evaluator payload，最终 workdir 才交给既有 scorer。

`buildValidatedArtifactDevelopmentGateReport` 使用 16 行固定分母。缺行按 infrastructure
失败，重复/身份漂移直接拒绝；artifact 必须 4/4 success、总均分和逐 task 均分均不低于
0.85、无 hard-gate/基础设施失败，并逐样本不低于 original 与 ir-static 中较高者。

完整模型对照不修改上述已绑定 direct runner，而使用从属 execution freeze：

```text
benchmarks/skill-ir/pilots/law-to-markdown/
  law-to-markdown-validated-artifact-execution-freeze.json
```

该 freeze 绑定父 lock digest、model runner、scoring、route/resource、bare-agent 与独立
orchestration 源码。先在同一输出目录执行 route probe：

```powershell
$env:SKVM_PYTHON = '<python-with-docx-and-pdfplumber>'
bun ./src/benchmarks/skill-ir/validated-artifact-development-execution-run.ts `
  '--phase=route-probe' `
  '--out-dir=results/skill-ir/law-to-markdown-validated-artifact-development-run-2026-07-24'
```

成功后只把 `--phase` 改为 `execute`。Execute 会重新验证父 lock、execution freeze 和资源，
只接受同目录中绑定两个 digest 的成功 route evidence，执行冻结 12 条模型行并重跑 4 条
direct 行，最终生成 16 行 gate。Raw transcript、provider log、plan 与 workdir 不提交；
compact resource/route/scored/cost/summary/gate 可以持久化。Gate 失败仍是有效结果，禁止补跑、
调 scorer/package/lock 或进入 held-out。

2026-07-24 冻结批次已完成：16/16 rows、4/4 quartets、0 infrastructure。Artifact 为
4/4 success、mean 0.925、0 hard-gate failure、0 pairwise regression 和 0 model tokens；
original 为 0/4、mean 0.75，ir-static 为 1/4、mean 0.80。Gate passed 只允许起草新的
held-out lock，本 runner 与 development lock 仍禁止直接执行 held-out。

## 17. Law Validated Artifact Held-out

独立 held-out 实验使用：

```text
benchmarks/skill-ir/pilots/law-to-markdown/
  law-to-markdown-validated-artifact-heldout-lock.json
```

该 lock 递归绑定已通过的 development lock、execution freeze、gate 与 summary，并直接冻结
tasks、resource contract、deterministic scorer 及 held-out planner/runner/gate 摘要。三项
直接输入必须与 development lock 完全相同；runner 不使用硬编码 task 或资源路径。Package
仍保持 `constructionSplit=development`，两个 held-out task 不得出现在构造 task contract
中，`held-out` 仍是 forbidden evidence class。

无成本生成 16 行 held-out 计划：

```powershell
bun ./src/benchmarks/skill-ir/validated-artifact-heldout-run.ts `
  '--phase=plan' `
  '--out-dir=results/skill-ir/law-to-markdown-validated-artifact-heldout-run-2026-07-24'
```

同一输出目录依次运行 `--phase=route-probe` 和 `--phase=execute`。Route probe 只持久化
脱敏身份与状态，并同时绑定 held-out lock 和上游 execution freeze 摘要。Execute 固定执行
12 条 GPT-5.6 模型行与 4 条 direct artifact 行，`retries=0`；development raw output、
workdir 或模型正文均不能作为输入。

Held-out gate 使用 16 行固定分母，并把 `no-skill`、`original`、`ir-static` 三者中的最高分
作为逐样本基线。Artifact 必须 4/4 success、总均分和逐任务均分不低于 0.85、零
infrastructure/hard-gate failure/paired regression，且至少一个四元组严格提升。缺行按
0 分与 infrastructure 计入；重复或 task/model/adapter/repetition identity 漂移直接拒绝。
Gate 通过只构成 Law 单 skill 的 held-out evidence，不扩展为跨 skill、跨模型、跨 agent、
跨 OS 或 break-even 结论。

2026-07-24 唯一正式批次得到 16/16 rows、4/4 quartets、0 infrastructure。Artifact 为
2/4、mean 0.725；法规 task 两次为 0.85/success，manual task 两次为 0.60/failure。
逐四元组比较三条 baseline 的最佳值后为 1 improvement、1 equal、2 regressions，gate
failed。失败集中在 manual 的 `law-document-policy` 与 `law-review-outcome`；冻结脚本把
带“章/条”结构的设备手册判作可交付法律文档。该观察只进入失败审计，不得进入当前
package、IR、scorer 或重跑决策。

## 18. Experimental-design 本地机制验证

新 scorer 为 `src/bench/evaluators/experimental-design-grade.ts`，只读取最终 workdir。六项
criterion 分别检查输入保护、三项产物、plan contract、assignment/replication safety、
seeded allocation consistency 和 report completeness；前三类安全面中的输入保护、产物和
assignment safety 是 hard gate，阈值 0.85。

四个任务固定为 2 development + 2 held-out。本阶段只运行两个 development fixture：
stratified individual assignment 与 cluster assignment。Package 通过同一个
`runValidatedArtifactPlan` 执行，两个任务的 runtime validation 与离线 scorer 均通过，
score 为 1.00，模型 token 为 0。Held-out 的 sequential/permuted-block 与 simple-randomized
任务只注册和验证 split，没有执行。

现有 `pre-ir-calibration-lock/v1` 只允许 `tasks-authored` 生命周期；现有 validated artifact
development lock 又把 Law identity 写成 literal。两者都不能无修改地作为本 pilot 的冻结
付费合同。下一阶段先抽象 skill-neutral baseline/development orchestration，保留旧 Law
lock/digest 不变，再执行 `no-skill | original` calibration。绕过 lock 直接调用 runner 的
结果不得进入研究证据。

## 19. Runnable Baseline Calibration

通用 runner 使用 `skill-ir-baseline-calibration-lock/v1`，服务已经具有 source-audited base IR
的 `runnable` pilot。它不替代 `tasks-authored` pre-IR runner，也不修改任何 Law lock。

Experimental-design 的冻结实例位于：

```text
benchmarks/skill-ir/pilots/experimental-design/
  experimental-design-baseline-calibration-lock.json
```

无成本生成计划：

```powershell
bun ./src/benchmarks/skill-ir/baseline-calibration-run.ts `
  '--lock=benchmarks/skill-ir/pilots/experimental-design/experimental-design-baseline-calibration-lock.json' `
  '--out-dir=results/skill-ir/experimental-design-baseline-calibration-2026-07-25' `
  '--phase=plan'
```

计划固定为 `no-skill | original`、两个 development task、2 repetitions，共 8 rows/4 pairs，
且 `allowTasksAuthored=false`、`retries=0`。Lock 绑定 source/tasks/resource/scorer/base IR/
source audit 和 lock/runner/gate/model/scoring/route/resource/adapter 实现摘要；route evidence
再绑定 lock digest。

同一输出目录按 `plan -> route-probe -> execute` 推进。Route/execute 要求
`SKVM_XTY_API_KEY`，Python 由 `SKVM_PYTHON` 选择。Execute 后先用既有
`score-real-agent-runs.ts` 生成 scored JSONL，再运行：

```powershell
bun ./src/benchmarks/skill-ir/baseline-calibration-gate-run.ts `
  '--lock=benchmarks/skill-ir/pilots/experimental-design/experimental-design-baseline-calibration-lock.json' `
  '--raw=results/skill-ir/experimental-design-baseline-calibration-2026-07-25/run/raw-runs.jsonl' `
  '--scored=results/skill-ir/experimental-design-baseline-calibration-2026-07-25/scored.jsonl' `
  '--resource=results/skill-ir/experimental-design-baseline-calibration-2026-07-25/resource-probe.json' `
  '--route=results/skill-ir/experimental-design-baseline-calibration-2026-07-25/route-probe.json' `
  '--out=results/skill-ir/experimental-design-baseline-calibration-2026-07-25/gate-report.json'
```

Gate 固定要求 8/8 rows、4/4 pairs、0 infrastructure、no-skill 非饱和和至少一个两臂 outcome
差异。通过只允许起草新的四臂 development lock；held-out、scorer/task/package 调整、PGO 和
主 claim 始终被禁止。

2026-07-25 的正式结果为 8/8 rows、4/4 pairs、0 infrastructure；no-skill/original 都是
0/4、mean 0.30，四个 pair 完全相同，gate failed。两臂均通过输入保护和产物存在，只在
plan/assignment/allocation/report 四项语义检查失败。Exact-source 和 prompt-encoding 审计
排除了注入与编码问题；scorer contract 审计确认其强制了 prompt 未声明的 schema enum、
唯一 PRNG schedule 和逐字 report labels。该结果冻结为 benchmark contract failure，
不能归因为模型或 skill；四臂 development 与 held-out 均不得执行。

## 20. 付费前 Benchmark Contract Audit

入口：

```powershell
bun ./src/benchmarks/skill-ir/benchmark-contract-audit-run.ts `
  '--manifest=benchmarks/skill-ir/pilots/<skill>/benchmark-contract-audit.json' `
  '--out=results/skill-ir/benchmark-contract-audit/<skill>.json'
```

Audit manifest 使用 `skill-ir-benchmark-contract-audit/v1`，绑定 development tasks、scorer、
公开 source 与 canary fixture。每条 scorer requirement 分别记录源码锚点和合法公开证据；
evaluator payload、IR、package、历史结果、held-out 和模型正文不得充当公开证据。

Runner 先执行静态合同验证，再从 custom evaluator registry 调用真实 scorer 运行
`canonical-valid`、`alternative-valid` 和 `invalid-control` canary。任何 digest、criterion、
hard gate、证据 locator 或 canary 漂移都会产生 `failed`；命令仍写出脱敏 report，并以非零
退出码结束，便于 CI 和付费前 gate 阻断。

Evaluator 身份同时绑定 registry path、冻结 source digest 和模块加载后注册对象。Runner
从 digest 验证过的 task bytes 构造 criterion，并把 canary 复制到临时目录后再次计算树摘要，
只有快照摘要仍匹配时才交给 evaluator，避免检查与执行读取两份不同输入。Bound file 与
canary 根目录都经过 `realpath` containment，父目录 junction 逃逸同样 fail closed。

审计报告只保存 requirement/canary ID、状态与稳定错误码，不保存 evaluator payload、fixture
内容、secret、模型输出或 held-out 数据；`provenance.manifestSha256` 绑定 schema parse
后的运行时 manifest 值序列化摘要。报告可见 ID 仅允许有界 ASCII 标识符。未通过的 pilot
在 corpus 中降为 `support-real`，
表示仍可用于来源、基础设施和失败机制分析，但不能支撑稳定性主 claim。历史实验文件保持
不可变。

Manifest 的核心字段：

```text
tasks/scorer/sources          path + sha256
scope                         development task IDs
criteria                      criterion ID + task IDs + hardGate + requirement IDs
requirements                  class + equivalence + optional taskIds + scorerAnchors + publicEvidence
canaries                      task/criterion + role + fixturePath/digest + expectedPass
```

`publicEvidence` 只接受 `task-prompt`、`skill-source` 和 `workdir-fixture`。对于
`exact-public-contract`，每个适用 task 分支的 `contractTokens` 都必须能从该分支声明的公开
内容中找到；对于 `semantic-equivalence`，每个适用 task 分支至少要有一项
`alternative-valid` canary；`safety-invariant` 则逐分支要求 canonical-valid 与
invalid-control。仅部分 task 适用的要求必须显式声明 `requirement.taskIds`。Runner 返回非零
表示审计阻断，这是预期研究结果，不是命令基础设施失败。

Canary 目录使用排序后的 `relativePath + fileDigest` 生成树摘要。根目录或任意子项出现
symlink/junction/special file、目录内容漂移或 digest 不一致时，静态审计和 runner 都拒绝执行。

2026-07-25 对三个 Wave A pilot 的冻结结果：

| Pilot | Static | Canary | 结论 |
|---|---|---|---|
| env-manager | failed | 0 | 两个 task 均缺精确 schema rule 与分类成员金标的公开合同。 |
| law-to-markdown | passed | 0/2 matched | 法律/非法律两个分支的公开合法结论措辞都被逐字 scorer 拒绝。 |
| experimental-design | failed | 2/8 matched | plan 字段合同 2/2 通过；assignment、allocation、report 6/6 被拒，另有四类私有 plan 约束。 |

Compact reports：

```text
results/skill-ir/benchmark-contract-audit/env-manager.json
results/skill-ir/benchmark-contract-audit/law-to-markdown.json
results/skill-ir/benchmark-contract-audit/experimental-design.json
```

三者未来默认 `evidenceWeight=support-real`。这不会改写历史结果，也不表示三个真实 source
无效；它只撤回旧 benchmark 对稳定性主 claim 的资格。任何新付费运行都要先设计新版本合同并
通过本审计。

## 21. Benchmark v2 的指标分层

`experimental-design` v1 的 task/scorer/lock/result 永久冻结。后续若继续该 skill，
必须使用独立的 `experimental-design-v2` 身份，先修复测量合同。

v2 的主 scorer 判定公开语义：输入保持、产物完整、方法适用性、分配安全和报告一致性。
它必须接受公开合同允许的合法等价实现，不能把私有 schema、封闭 enum、唯一 PRNG、
唯一 schedule 或逐字报告模板当成默认成功条件。确定性 allocation/profile 属于独立
次指标；只有公开合同明确要求的确定性行为才可进入 hard gate。

五项权重固定为 `0.10/0.10/0.25/0.35/0.20`，row threshold 为 `0.95`。输入、
产物、方法语义、allocation 安全和“报告无事实冲突”是 hard gate。方法名称是自由文本；
scorer 检查公开 `designProperties` 与 allocation invariants。报告自然语言不判分，
只校验公开 fenced JSON `design-evidence` block 与 study/plan/allocation 是否一致。

`designProperties` 在 plan 和 report evidence 中均为必填，四个公开布尔值必须逐项等于
scorer 从 study/allocation 复算的值；plan 不一致记为 `designSemantics=0`，report 不一致
记为 `reportContradiction=true`。初版支持 individual/cluster、strata/no-strata、
sequential/non-sequential 的八种组合，按 assignment unit -> stratum partition ->
sequential block 的固定顺序判定。混合 strata、重复 unit、非法 arms 和成员级 cluster
allocation 在 task schema 层拒绝。

报告必须且只能有一个 opening marker 为 `json design-evidence` 的严格 JSON fenced block；
多个、缺失、非法 JSON 或重复 key 令 report criterion 得 `pass=true, score=0`，不单独触发
hard gate；已出现字段与 study/plan/allocation 冲突时才返回 `pass=false`。结构化
`limitationFlags` 比较公开 source-derived 集合，额外自然语言 warnings 不比较措辞。

实现位于 `experimental-design-grade-v2.ts`，注册 ID 为
`skill-ir-experimental-design-v2`。五个 payload check 共用严格 path schema；文件路径逐段
拒绝 symlink/junction 和根目录逃逸。Payload、workdir、路径与 I/O 问题记 infrastructure；
缺失/损坏的 agent 产物记 evaluation failure。Plan 不要求 schema version，`method` 为
非空自由文本并允许额外字段；主语义只比较公开 study 字段、四个 `designProperties` 和
allocation invariants。当前通用 scored row 的 `evaluatorScore` 即 v2 的
`primarySemanticScore`，artifact 尚未存在时不生成 `deterministicProfileScore` 伪值。

结果表必须分列：

```text
primarySemanticScore
deterministicProfileScore
profileReproducibility
runtime/process/validation/package cost
modelGenerationTokens
modelRepairTokens
```

v2 audit、development gate 和 Wave B replication 是三个不同门槛。audit 只证明
benchmark 合同可测，development gate 才允许消费 held-out，Wave B 才能支持跨 skill
泛化。没有包含 compile/profile/package 成本的重复调用实验，不报告总 token 节省或
break-even。

时序固定为：2+2 task creation -> task-split freeze -> scorer/development-only audit ->
held-out freeze -> calibration。`task-split-freeze` 先绑定 task/fixture；任意 API run 前的
`heldout-freeze` 再绑定 scorer digest。该隔离是非消费式隔离而非实验者盲法。Development
audit、lock、compiler、package、scorer 和 feedback API 都不得读取 held-out
ID/path/digest/content；只有 development gate 通过后，held-out runner 才能消费冻结
package。对应的 path/digest/sentinel 泄漏和结果回流均须有 fail-closed 负向测试。

Task-split freeze 由 `experimental-design-v2-task-freeze-run.ts` 生成或只读验证。生成模式
只接受 `--task-commit` 与 `--out`，`--verify-only` 不写文件；validator 会从该 commit
读取公开合同、source audit、2+2 tasks、source closure 与六项 v1 immutable refs，复核
fixture projection、claim coverage、quote 和 digest。冻结摘要使用 Git blob bytes；工作区
只允许 Git text 文件的 CRLF/LF 检出差异，其他内容漂移均拒绝。

Development-only differential audit 由 `experimental-design-v2-audit-fixtures.ts` 确定性
生成 30 个隔离 fixture 和 manifest，再由通用 `benchmark-contract-audit-run.ts` 执行。
当前 compact report 记录 42/42 canary matched、`status=passed`，覆盖两个 development task
分支、八种公开组合、替代合法产物、非法控制与 report 的 `0/0.25/0.5/0.75` 部分分数。
通用审计因此支持 `partial-control.expectedScore`：`pass=true` 只表示没有事实冲突或 hard-gate
失败，不再被错误等同于 criterion 满分。Manifest、fixture 和 compact report 均不含 held-out
ID、digest、sentinel、模型正文或 evaluator payload；该结果是 benchmark contract evidence，
不是模型运行或 Skill IR 优化结果。

Held-out identity 由 `experimental-design-v2-heldout-freeze-run.ts` 在 audit passed 后生成：

```powershell
bun ./src/benchmarks/skill-ir/experimental-design-v2-heldout-freeze-run.ts `
  --inputs-commit=826de3b0178d964028eb9428c8e6d924eb1a4c52 `
  --out=benchmarks/skill-ir/pilots/experimental-design/v2/heldout-freeze.json
bun ./src/benchmarks/skill-ir/experimental-design-v2-heldout-freeze-run.ts `
  --verify-only=benchmarks/skill-ir/pilots/experimental-design/v2/heldout-freeze.json
```

Verifier 从 `inputsCommit` 读取 Git blob，并与工作区字节核对；它同时复核 task-split freeze、
held-out task digest、v2 scorer/registry identity、audit manifest provenance、passed report 和
全部 matched canary。`assertNoExperimentalDesignV2HeldoutEvidence` 为 development lock、compiler、
package 和 feedback 四类 construction sink 提供递归 fail-closed 扫描。Freeze 不执行 API，
不读取 held-out 输出，也不允许 compiler/repair 消费 held-out。

Registry 是可追加扩展点，不作为整文件 immutable blob。Freeze 要求旧 `inputsCommit` 中包含
冻结 evaluatorId/path/digest 三元组，当前运行时 registry map 仍映射到相同 path/digest；新增
其他 evaluator 不使历史 freeze 失效。Scorer 文件自身、task、audit 和 held-out bytes 仍按
freeze digest 与工作区逐字复核，不能借 registry 的可追加性放宽。

## 22. Experimental-design v3 校准与物化有效性审计

v3 修复了 v2 只枚举 `design/`、漏检 root extra output 的问题：root 与 `design/` 均使用精确
白名单，并增加不调用生产 assessor 构造 expected 的 hard-coded oracle。46/46 development
canary matched，task-split、scorer/audit 和 held-out identity 都已冻结。预 IR lock v2 还会在
plan、execute 和 gate 读取时重验 held-out freeze，防止静默回落到 v1 task。

冻结 calibration 命令：

```powershell
bun ./src/benchmarks/skill-ir/pre-ir-calibration-run.ts `
  '--lock=benchmarks/skill-ir/pilots/experimental-design/v3/experimental-design-v3-pre-ir-calibration-lock.json' `
  '--out-dir=results/skill-ir/experimental-design-v3-pre-ir-calibration-2026-07-27' `
  '--phase=plan'
# resource/route 通过后，分别改为 --phase=route-probe 和 --phase=execute
```

结果为 8/8 rows、4/4 pairs、0 infrastructure、3 differing pairs，机械 gate 通过。不过 post-run
tree audit 发现 `executeRun.copySkillBundle` 在 original agent 启动前复制 skill resource closure
到 workdir，v3 scorer 又把这些预置资源视为额外模型输出。三个完成 evaluator 的 original 行均
触发 `design-artifact-contract`；第四行在 evaluator 前任务退出。no-skill 没有预置资源。

因此 v3 calibration 是“运行链路完整但测量边界污染”的冻结证据，不是 original 负增益或 Skill
IR 优化证据。后续 v4 必须以 workdir 外、摘要绑定的 initial manifest 为权威，评价 final delta；
在真实 API 前还要跑 materialization canary。Local benchmark fixture audit 与真实 runner
materialization audit 以后是两个独立门槛。
