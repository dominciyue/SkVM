# Skill IR AOT 当前执行计划

**最后更新：** 2026-07-23

本文件只记录当前状态和下一步。已完成阶段的详细演进见
`docs/skill-ir/history.md`，组件契约见对应权威文档。

## 1. 当前 Ledger

| Workstream | 状态 | 当前结论或下一步 |
|---|---|---|
| IR schema/parser/validator/profiler/passes/lowering | 完成 | 保持回归测试，按 `ir-core.md` 修改。 |
| Synthetic corpus/matrix/analyzer | 完成，低权重 | 只用于 calibration 和受控失败。 |
| Real-agent runner/scorer/pairing | 完成 | 已支持 persistent workdir 和完整 run identity。 |
| Real skill provenance intake | 完成首轮 | 6 个 pilot，Wave A 3 + Wave B 3。 |
| `env-manager` task/scorer/base IR | 完成 | 当前唯一 runnable 真实 pilot。 |
| Static IR development run | 完成 | Partial correctness 改善，binary success 仍 0/4。 |
| Dual-source Final IR | 完成候选 | V1/v2 均未过 development gate。 |
| Executable artifact v1 | 冻结失败证据 | Validator semantic coverage 不足，repair 未触发。 |
| Semantic artifact v2 | 冻结失败证据 | Repair 触发 2 次，均未通过 revalidation。 |
| GPT-4.1 capability diagnostic | 完成，gate 失败 | 20 行均无 infra；强模型改善基础执行，但五系统仍 0/4 成功。 |
| V3 public-contract artifact | 设计已确认 | 先做公开 contract、B derivation、共享 snapshot 与一次修复。 |
| V4 contract-repair development | 冻结 gate 失败 | 3 个完整 pair 从 0.90 到 1.00；1 个 Bun infrastructure，禁止补跑。 |
| V4 infrastructure diagnosis | 完成 | Bun 1.3.14 assertion 已脱敏分类，reproducibility 仍 inconclusive。 |
| `law-to-markdown` vertical slice | 当前 | Pre-IR gate 已通过；下一步做 source-audited base IR。 |
| Held-out / pooled panel / Wave B | 阻断 | Development method 尚未通过门禁。 |
| 文档压缩与入口治理 | 完成 | 10 份权威文档、唯一入口和仓库级旧路径门禁已生效。 |

## 2. 已完成能力

- Skill IR v1 严格 schema 和跨引用 validator。
- JSON candidate parser 与 extraction prompt。
- Trace/profile annotation 和静态/profile-guided passes。
- Controller/checker/adapter/skill view lowering。
- Explicit calibration/pilot corpus registry。
- `no-skill`、`original`、`ir-static`、`ir-pgo-dev`、`ir-pgo`、
  `ir-artifact-dev` 调度边界。
- File-backed exact original source 和 source closure materialization。
- Model/family/adapter/version/run/panel/provenance identity。
- Persistent workdir 与 deterministic evaluator dispatch。
- Paired result、slice、route health、promotion 和 validation plan 工具。
- Dual-source RepairEvidence、Final IR provenance 和 regression guard。
- Package compiler、manifest/provenance digest、preflight、protected snapshot。
- Structural v1 与 semantic v2 checker。
- Check-only / one-repair / revalidate bounded state machine。
- V2 A evidence、dormant B isolation、canary 和 reverse-evidence tests。

## 3. 当前阻塞

Semantic v2 的 development scorer gate 失败：

```text
required: success >= 3/4, mean >= 0.85, hard-gate regressions = 0, infra = 0
observed: success = 0/4, mean = 0.625, hard-gate regressions = 0, infra = 0
```

具体残差：

- exact classification 全部失败；
- schema rules 全部失败；
- 两个 Vite runtime false pass；
- 两个 Node repair 均未通过 revalidation；
- 当前没有 pre-repair scorer snapshot，不能做严格 repair attribution。

GPT-4.1 单变量诊断也未解除阻塞：

```text
no-skill/original/ir-static/check-only: success = 0/4, mean = 0.7000
one-repair: success = 0/4, mean = 0.6625, repair = 4/4, repaired-to-pass = 0/4
```

强模型相对历史 mini 修复 18 个准则级失败，集中在产物完整性、示例安全和一次泄漏；
`classification` 与 `schema` 在所有系统中继续失败。这支持“模型能力影响基础执行质量”，
同时表明当前主要瓶颈仍在 public contract lowering、validator 与 repair 约束。

## 4. 下一阶段顺序

### 已完成前置：文档治理

- `docs/skill-ir/README.md` 已成为唯一入口。
- 重复组件、设计和实验说明已按内容重建为权威文档。
- 旧路径已全局替换，58 份被吸收文档已删除。
- Git 与 `history.md` 保留历史，链接检查器阻止旧路径回流。

### Step 2：并行完成 v2 failure audit 与强模型诊断（已完成）

#### 2A. 冻结 v2 failure audit

- 对 4 个 one-repair workdir 做 validator/scorer 差异审计。
- 区分 A false pass、A false negative、repair regression 和 scorer-only semantics。
- 记录哪些 schema 规则可从公开证据推导，哪些必须保持 unconfirmed。
- 不修改 v2 package、lock、catalog 或结果。

每行审计固定记录：initial output、runtime validation、repair trigger/result、
revalidation、offline scorer criteria 和最终失败分类。

#### 2B. GPT-4.1 单变量能力诊断

实验身份：

```text
diagnosticId = env-manager-v2-gpt41-capability-diagnostic-v1
model = xty/gpt-4.1
systems = no-skill | original | ir-static | check-only | one-repair
tasks = Node + Vite development
repetitions = 2
rows = 20
```

执行拆成同一 diagnostic identity 下的三组冻结 run：

```text
baseline:   no-skill | original | ir-static   = 12 rows
artifact:   check-only                        = 4 rows
artifact:   one-repair                        = 4 rows
```

付费前必须提交并校验新 diagnostic lock。只允许改变 model、run identity、lock 和结果
目录；scorer、tasks、fixtures、base IR、v2 package/catalog、repair 上限与 gate 保持不变。
先 route probe，再运行 development；不运行 held-out。

判定顺序：

1. 强模型 `no-skill` 是否已使任务饱和。
2. `original`、`ir-static` 和 artifact 是否仍有相对差异。
3. Runtime validator 是否 fail、repair 是否触发、二验是否通过。
4. Offline deterministic scorer 是否通过同一 criteria。
5. 将强模型逐 criterion 结果与冻结 mini failure audit 对齐。

只有公开证据充分、mini 在同一失败类型上稳定失败、GPT-4.1 成功时，才把该项标为
“支持模型能力瓶颈”。若 GPT-4.1 重复相同错误，优先归因于 contract/validator/lowering；
若所有系统均通过，则记录任务饱和，不写成 Skill IR 增益。跨时间 provider 差异作为限制
单独披露。

### Step 3：合并两路证据后设计下一 catalog（当前）

- Catalog 固定为 `executable-public-contract-artifact/v3`，V1/V2 不原地修改。
- 编译 public output/schema policy 与 agent-visible evidence graph。
- B-layer 只启用可从 definition/reference/framework/literal evidence 推导的分类。
- 同一 generation 保存 pre/post snapshot，scorer 生成逻辑 check-only/one-repair 对。
- Repair 使用 contract ref 与封闭 operation，不接收 actual/gold/free-form message。
- 主开发模型固定为 `xty/gpt-5.6-sol`，Opus/DeepSeek 只做资格与诊断。

### Step 4：新的 env-manager development gate

- 新 design/spec 和 TDD plan 先评审。
- 本地 activation 先通过。
- Lock、scorer、tasks、model、repetitions 和 gate 在付费前冻结。
- Development gate 未过不执行 held-out。

### Step 5：第二个真实 skill replication

优先在 `law-to-markdown` 或边界更轻的中文约束 skill 上复现：

- exact source/provenance；
- no-skill task；
- deterministic scorer；
- base IR；
- development/held-out split；
- frozen method，不按第二个 skill 结果回调第一份配置。

当前第一刀固定为 `law-to-markdown` 的 task/scorer 纵切。先只支持 `.txt`，同时显式记录
上游脚本对 `python-docx`/`pdfplumber` 的 eager import；依赖 probe 未通过时禁止付费运行。
本阶段结束状态必须是 `tasks-authored`，不能提前写 `base-ir.json` 或改为 `runnable`。

### Step 6：固定多模型 panel

只有单模型纵向机制通过后再执行：

- panel preregistration；
- balanced per-model evidence；
- conflict exclusion；
- aggregate/per-model/worst-model/negative-delta 报告；
- leave-one-model-out 只作为独立 transfer ablation。

### Step 7：Wave B replication

冻结 Wave A 方法和 scorer 后，运行：

```text
zh-code-reviewer
api-tester
zh-readme
```

Wave B 不得用于调优同一份主结果配置。

## 5. Step 2 文件级实施计划

> 执行方式：当前会话内按 TDD 顺序实施，每项完成后单独验证并更新本节状态。

### Task 2.1：诊断 lock 与完整性验证

**新增文件：**

```text
src/benchmarks/skill-ir/capability-diagnostic.ts
src/benchmarks/skill-ir/capability-diagnostic.test.ts
benchmarks/skill-ir/pilots/env-manager/env-manager-gpt41-capability-diagnostic-lock.json
benchmarks/skill-ir/pilots/env-manager/env-manager-executable-semantic-artifact-v2-gpt41-lock.json
```

- [x] RED：测试拒绝 held-out、非 GPT-4.1、非 20 行矩阵、digest 漂移和 gate 漂移。
- [x] GREEN：实现严格 Zod schema 与 source/base IR/task/scorer/package/runner-lock digest 校验。
- [x] GREEN：协调 lock 绑定三组 run、公开 criterion id、历史 mini result 路径和解释边界。
- [x] 验证：

```powershell
bun test ./src/benchmarks/skill-ir/capability-diagnostic.test.ts
```

### Task 2.2：三组 dry-run plan compiler

**新增文件：**

```text
src/benchmarks/skill-ir/capability-diagnostic-run.ts
src/benchmarks/skill-ir/capability-diagnostic-run.test.ts
```

- [x] RED：要求输出恰好 `12 + 4 + 4` 行，全部为 development/clean/windows/GPT-4.1。
- [x] GREEN：复用 `buildPlan` 生成 baseline、check-only、one-repair 三组 plan。
- [x] GREEN：artifact 两臂必须携带 runner-compatible GPT-4.1 lock；禁止 `--execute`
  绕过 route probe。
- [x] 验证：

```powershell
bun test ./src/benchmarks/skill-ir/capability-diagnostic-run.test.ts
bun ./src/benchmarks/skill-ir/capability-diagnostic-run.ts `
  --lock=benchmarks/skill-ir/pilots/env-manager/env-manager-gpt41-capability-diagnostic-lock.json `
  --out-dir=results/skill-ir/env-manager-gpt41-capability-diagnostic-dry-run
```

### Task 2.3：离线 failure audit 与能力对照

**新增文件：**

```text
src/benchmarks/skill-ir/failure-audit.ts
src/benchmarks/skill-ir/failure-audit.test.ts
src/benchmarks/skill-ir/failure-audit-run.ts
```

- [x] RED：覆盖 success、infra、runtime false pass、runtime/scorer aligned failure、
  repair revalidation failure 和 baseline-without-runtime-metadata。
- [x] GREEN：按 case/system/mode/task/runIndex 对齐 raw/scored runtime 与六项 scorer
  criteria，只输出错误码、相对路径、JSON pointer 和判定，不复制文件内容或 secret。
- [x] GREEN：比较 mini 与 GPT-4.1 的 criterion transition，输出
  `mini-fail/strong-pass` 候选；不自动宣称模型因果或 Skill IR 增益。
- [x] 验证：

```powershell
bun test ./src/benchmarks/skill-ir/failure-audit.test.ts
```

### Task 2.4：无成本门禁与 route probe

- [x] 运行 package verify、20 行 dry-run、全 focused tests、typecheck。
- [x] 使用 `original` development task 对 `xty/gpt-4.1` 做一次 route probe；仅验证
  路由、凭据和 bare-agent 可执行性。
- [x] Probe status=`ok`，允许进入冻结 development；失败停止规则未触发。

```powershell
bun ./src/benchmarks/skill-ir/route-probe-run.ts `
  --corpus=pilot --models=xty/gpt-4.1 --adapter=bare-agent `
  --system=original --context=clean --agent=skvm --environment=windows `
  --task=env-manager-node-audit-dev-001 --timeout-ms=120000 `
  --require-env=SKVM_XTY_API_KEY `
  --out-dir=results/skill-ir/env-manager-gpt41-capability-route-probe
```

### Task 2.5：冻结 development 执行与评分

- [x] 按 dry-run 中保存的参数执行 baseline 12 行、check-only 4 行、one-repair 4 行。
- [x] 每组立即运行现有 deterministic scorer 和 analyzer；20 行 infra 均为 0。
- [x] 用 failure-audit CLI 合并历史 mini 与新 GPT-4.1 scored rows。
- [x] Gate 未过，停止 held-out；scorer/package/lock 保持冻结。

### Task 2.6：结果与文档收口

- [x] 提交 compact scored JSONL、CSV、summary、audit 和 provenance；raw/workdir 留本地。
- [x] 更新 `experiment-results.md`、`optimization-and-artifacts.md`、spec 和本计划 ledger。
- [x] 追加 conversation log，运行完整质量门禁并完成独立代码审查。

## 6. 冻结项

- 不修改 executable-artifact/v1 package、lock 和结果。
- 不修改 executable-semantic-artifact/v2 package、lock、catalog 和结果。
- 不根据 held-out 数据生成 repair；当前 held-out 仍未执行。
- 不继续扩 promotion/validation planner，优先补真实 skill 研究内核。
- 不把 synthetic seed 结果混入 real-skill 主结论。
- 不把 Windows 上的 environment label 写成真实 Linux/macOS evidence。
- 不在单 adapter 下声称 cross-agent。
- 不在没有 break-even 分析时声称 token reduction。

## 7. 开发规则

1. 先读 `docs/skill-ir/README.md` 和对应组件文档。
2. 行为变更使用 TDD：RED -> minimal GREEN -> focused regression。
3. 新实验先冻结 source、task、scorer、matrix、model、lock 和 gate。
4. Component doc 与代码同阶段更新；不新增重复 run 文档。
5. 结果提交 compact scored JSONL、CSV、summary 和 provenance；raw/workdir 留本地。
6. 每个阶段追加 `D:\skill优化\conversation_log.md`。

## 8. 质量门禁

```powershell
python scripts/check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py --root .
bun test ./src/benchmarks/skill-ir
python scripts/analyze_skill_ir_results_test.py
python scripts/analyze_skill_ir_slices_test.py
bun run typecheck
git diff --check
```

全仓上游 `bun test` 在当前 Windows 环境仍有既有失败。报告时必须区分 Skill IR
focused scope 与 upstream full-suite baseline。

## 9. Step 3 文件级 TDD 实施计划

### Task 3.1：旗舰模型资格审计

**不修改生产代码。**

- [x] 用同一 `no-skill` Node development case、Windows/clean/bare-agent、repetition=1
  运行 `xty/gpt-5.6-sol`、`xty/claude-opus-4-8`、`xty/deepseek-v4-pro`。
- [x] 使用现有 deterministic scorer，记录 route status、score、hard gate、token 和
  latency；不把资格结果写成 Skill IR 增益。
- [x] GPT-5.6 route/harness 正常后，冻结为 V3 primary model；异常才按预注册顺序回退
  Opus、DeepSeek。

资格审计于 2026-07-21 完成：三条 route 均正常且 hard gate 均通过；GPT-5.6 得分
0.80，Opus/DeepSeek 均为 0.70。GPT-5.6 延迟和 token 也低于本轮另外两条 route，
因此保持为 V3 primary model。三者都未通过最终成功阈值，且共同残留 classification
失败；该结果只验证 model route、harness 和 primary-model 选择，不计入 Skill IR
方法证据。

### Task 3.2：V3 contract 与 package schema

**文件：**

```text
新增 src/benchmarks/skill-ir/public-contract.ts
新增 src/benchmarks/skill-ir/public-contract.test.ts
修改 src/benchmarks/skill-ir/artifact-package.ts
修改 src/benchmarks/skill-ir/artifact-package.test.ts
```

- [x] RED：拒绝 scorer expected、secret value、held-out payload、final classification
  arrays、未知 operation 和无 provenance evidence。
- [x] GREEN：定义 `skill-ir-public-runtime-contract/v3`、closed error catalog、
  contractRef、confirmed/advisory/limitation 和 V3 manifest/provenance/lock。
- [x] GREEN：保持 V1/V2 parser 与 digest validation 完全不变。
- [x] 验证：

```powershell
bun test ./src/benchmarks/skill-ir/public-contract.test.ts `
  ./src/benchmarks/skill-ir/artifact-package.test.ts
```

### Task 3.3：Evidence graph 与保守 B derivation

**文件：**

```text
新增 src/benchmarks/skill-ir/public-contract-evidence.ts
新增 src/benchmarks/skill-ir/public-contract-evidence.test.ts
修改 src/benchmarks/skill-ir/classification-evidence.ts
```

- [x] RED：覆盖 definition/reference 集合运算、unconfirmed、used-undefined、
  source-qualified hardcoded finding、Vite/Next public exposure 和冲突降级。
- [x] RED：canary 与 reverse-evidence；移除公开证据后对应约束必须消失。
- [x] GREEN：只输出 evidence graph 与 limitation；最终 classification arrays 只在
  checker 内计算，不序列化到 runtime contract。

### Task 3.4：V3 compiler、preflight 与 checker

**文件：**

```text
新增 src/benchmarks/skill-ir/public-contract-artifact-compiler.ts
新增 src/benchmarks/skill-ir/public-contract-artifact-compiler.test.ts
新增 src/benchmarks/skill-ir/public-contract-evidence-cli.ts
新增 src/benchmarks/skill-ir/public-contract-checker.ts
新增 src/benchmarks/skill-ir/public-contract-checker-cli.ts
新增 src/benchmarks/skill-ir/public-contract-checker.test.ts
修改 src/benchmarks/skill-ir/artifact-preflight.ts
修改 src/benchmarks/skill-ir/artifact-preflight.test.ts
```

- [x] RED：package 不得包含 evaluator/held-out/B gold canary，输出必须 byte
  deterministic，V1/V2 digest 不变。
- [x] GREEN：编译 output contract、public policy、evidence program、checker、
  deterministic skeleton、manifest 和 provenance。
- [x] GREEN：preflight 生成并保护 runtime contract；checker 独立验证 schema、
  classification、exposure、source-qualified findings 和 protected inputs。

### Task 3.5：共享 generation snapshot 与 paired scorer

**文件：**

```text
新增 src/benchmarks/skill-ir/artifact-snapshot.ts
新增 src/benchmarks/skill-ir/artifact-snapshot.test.ts
修改 src/benchmarks/skill-ir/artifact-runtime.ts
修改 src/benchmarks/skill-ir/artifact-runtime.test.ts
修改 src/benchmarks/skill-ir/real-agent-run.ts
修改 src/benchmarks/skill-ir/real-agent-run.test.ts
修改 src/benchmarks/skill-ir/scoring.ts
修改 src/benchmarks/skill-ir/scoring.test.ts
```

- [x] RED：pre/post 必须共享 generation identity；snapshot 路径逃逸、link、digest
  drift、缺 protected input 和重复 logical row 都失败。
- [x] GREEN：generation 后复制完整可评分 workdir 到 pre snapshot；repair 后复制 post
  snapshot；raw metadata 只保存路径、digest 和 identity。
- [x] GREEN：scorer 从同一 raw run 生成逻辑 check-only/one-repair rows，分别读取
  pre/post snapshot；repair cost 单独保留。

实现说明：旧 V1/V2 raw 行没有 snapshot metadata 时继续按单行评分；带完整 paired
metadata 的行会在评分前验证目录摘要，再展开为两条逻辑行。`check-only` 只计
generation token，`one-repair` 计 aggregate token 并保留 `repairUsage`。当前实现面向
确定性 workdir scorer；下一任务再接通 V3 report/repair 和新 system identity。

### Task 3.6：V3 repair、lock 与本地 activation

**文件：**

```text
修改 src/benchmarks/skill-ir/artifact-runtime.ts
修改 src/benchmarks/skill-ir/artifact-runtime.test.ts
新增 src/benchmarks/skill-ir/env-manager-public-contract-activation.test.ts
新增 benchmarks/skill-ir/pilots/env-manager/packages/executable-public-contract-artifact-v3/
新增 benchmarks/skill-ir/pilots/env-manager/env-manager-public-contract-artifact-v3-lock.json
```

- [x] RED：report 只允许 closed code、relative path、JSON pointer、contractRef 和
  operation；禁止 expected/actual/secret/free-form message。
- [x] GREEN：`preflight -> generate -> snapshot -> validate -> <=1 repair ->
  revalidate -> snapshot -> stop`。
- [x] GREEN：本地 fixture 必须证明 v2 known failure 在 V3 initial validation 中被
  精确定位，并至少有一条 one-repair repaired-to-pass。
- [x] 冻结新 package/lock/gate 前运行全 focused tests、typecheck、doc links 和
  package digest verify。

冻结身份：`executable-public-contract-artifact/v3`、`xty/gpt-5.6-sol`、两个
development task × 2 repetitions，共 4 个初始 generation。scorer gate 为至少 3/4
成功、mean ≥ 0.85、0 hard-gate regression、0 infrastructure failure；attribution gate
要求至少一次真实 repair。`check-only` 不是独立执行模式，而是 pre snapshot 逻辑臂。

### Task 3.7：GPT-5.6 development 实验

- [x] dry-run、route probe 和冻结 4-generation development 已完成。
- [x] 主归因只比较同一 generation 的 pre/post snapshot；3 个完整 pair 为
  0.70→0.70，另有 1 个 generation infrastructure failure。由于 gate 已明确失败，
  本轮停止新增付费 no-skill/original/ir-static batch；背景比较只引用既有冻结结果，
  不混入 paired repair delta。
- [x] Gate 未过不运行 held-out，不修改 scorer/package/lock；结果写 compact evidence
  bundle，raw/workdir 留本地。

Gate 判定：0 success、完整 pair mean 0.70、1 infrastructure failure；最低成功数、
最低均分和最大 infrastructure 三项失败。Repair 3/3 激活、0/3 repaired-to-pass，三组
pre/post digest 完全相同。下一阶段先设计新 catalog，补足 array item schema 和
runtime/scorer contract coverage；不得在 V3 上事后调 prompt 或补跑。

## 10. Step 4 文件级 TDD 实施计划

Step 4 只消费冻结 V3 development 证据，不修改 V3 package、lock、checker、scorer
或结果。候选新 catalog 暂定为 `executable-contract-repair-artifact/v4`；只有本地
snapshot replay 通过后才允许编译 package、冻结 lock 或发起付费实验。

### Task 4.1：Failure-to-contract coverage audit

**文件：**

```text
新增 src/benchmarks/skill-ir/contract-coverage.ts
新增 src/benchmarks/skill-ir/contract-coverage.test.ts
新增 src/benchmarks/skill-ir/contract-coverage-run.ts
更新 docs/skill-ir/optimization-and-artifacts.md
```

- [x] RED：六个 scorer criterion 必须逐项映射到 runtime check、公开 evidence、
  deterministic repair 与剩余 gap；criterion 漂移、未知 checker code 和重复映射失败。
- [x] GREEN：输出 `equivalent | partial | none` 覆盖等级，明确 validator 与 scorer
  的成功面是否等价；不得读取或序列化 evaluator `expected`、secret value 或 held-out。
- [x] GREEN：将冻结 V3 的 `INVALID_REPORT_FIELD_TYPE`、
  `MISSING_CLASSIFICATION_ENTRY` 和 schema residual 纳入 observed-failure audit。

### Task 4.2：V4 output/repair contract

**文件：**

```text
新增 src/benchmarks/skill-ir/executable-repair-contract.ts
新增 src/benchmarks/skill-ir/executable-repair-contract.test.ts
```

- [x] RED：覆盖 `array.items`、object properties/required、set semantics、稳定排序、
  closed repair operation 和 provenance ref；拒绝 literal gold arrays、自由文本、
  secret、绝对路径、evaluator payload 和 held-out source。
- [x] GREEN：报告五字段表达为 `array<string>`、去重、按字典序 canonicalize；
  schema rule 只允许从公开 evidence 或带 development provenance 的版本化候选 policy
  推导；两类来源必须可区分。
- [x] GREEN：新 contract 有独立 schema/catalog identity，不复用或修改 V3 digest。

### Task 4.3：Deterministic repairer 与真实 snapshot replay

**文件：**

```text
新增 src/benchmarks/skill-ir/deterministic-artifact-repairer.ts
新增 src/benchmarks/skill-ir/deterministic-artifact-repairer.test.ts
新增 src/benchmarks/skill-ir/deterministic-repair-replay-run.ts
新增 benchmarks/skill-ir/pilots/env-manager/env-manager-v4-deterministic-replay-freeze.json
```

- [x] RED：复制冻结 V3 pre-repair snapshot 后，先复现 V3 validation/scorer failure；
  repairer 不得修改 protected input 或 protected runtime contract。
- [x] GREEN：只执行 closed operations；从 public runtime evidence 重建 canonical report，
  并补写公开证据充分的 schema rules。输出只记录 operation/path/pointer/ref，不记录值。
- [x] GREEN：至少在 Node 与 Vite development 的三个完整 snapshots 上离线重放；
  分列 runtime pass、scorer criterion transition、digest change 与无法修复的 gap。
- [x] GREEN：deterministic repair 先执行；模型一次修复只保留给 deterministic repair
  后仍存在、且 report 可安全表达的 residual。

Method freeze 绑定 V3 raw/lock/source summary/output contract、`tasks.json`、实际 scorer
源码、两项 task id、六项 criterion id 和两个 development-learned rule lineage；任一
摘要或 registry 漂移均拒绝 replay。

离线重放于 2026-07-22 完成：三个冻结 V3 pre-repair snapshot 均复现
runtime fail、scorer 0.70 与 classification/schema residual；确定性 repair 后三条均为
runtime pass、scorer 1.00、无 residual，protected digest 全部稳定。Schema 与 example
均由 contract/policy 全量重建，不复用模型的无证据字段。原 V3 批次的 1 条 generation
infrastructure failure 继续单列，因此 source-generation 口径为 3/4 success、mean 0.75，
不具备 development gate 资格。该结果只证明本地 repair semantics 与 scorer success
surface 对齐，不代表 V4 package、Runner 或真实模型实验已完成。

### Task 4.4：结果记账、Runner 与实验冻结

#### Task 4.4A：Generation-level gate accounting

**文件：**

```text
新增 src/benchmarks/skill-ir/artifact-development-gate.ts
新增 src/benchmarks/skill-ir/artifact-development-gate.test.ts
新增 src/benchmarks/skill-ir/artifact-development-gate-run.ts
新增 src/benchmarks/skill-ir/artifact-development-gate-run.test.ts
```

- [x] RED：从冻结 lock 枚举 `taskId × repetition` 的预期 generation；缺 raw generation、
  generation 存在但没有完整 pre/post pair、重复 identity 和非 development task 均显式失败或
  形成 infrastructure generation record。
- [x] GREEN：gate denominator 固定为预注册 generation 数；完整 pair 只使用 post arm 计算
  success/score，并用 pre/post 判定 hard-gate regression；缺失项按 0 分进入均值并单列
  infrastructure，不伪造 check-only/one-repair scored row。
- [x] GREEN：输出同时报告 paired generation、missing generation、missing pair、success、
  mean、regression、infrastructure 与每项 gate condition，避免只看完整 pair 得出偏高结论。

#### Task 4.4B：V4 package schema、compiler 与 validator

**文件：**

```text
修改 src/benchmarks/skill-ir/artifact-package.ts
修改 src/benchmarks/skill-ir/artifact-package.test.ts
新增 src/benchmarks/skill-ir/executable-contract-artifact-compiler.ts
新增 src/benchmarks/skill-ir/executable-contract-artifact-compiler.test.ts
新增 src/benchmarks/skill-ir/executable-contract-artifact-run.ts
新增 src/benchmarks/skill-ir/executable-contract-checker.ts
新增 src/benchmarks/skill-ir/executable-contract-checker.test.ts
新增 src/benchmarks/skill-ir/executable-contract-checker-cli.ts
新增 src/benchmarks/skill-ir/deterministic-artifact-repairer-cli.ts
```

- [x] RED：新 manifest/provenance 必须使用 `executable-contract-repair-artifact/v4`，绑定
  base IR、真实 source、公开 task contract、coverage audit、V4 replay freeze/summary 和
  development-learned rule lineage；manifest/provenance/digest/undeclared-file 漂移全部拒绝。
- [x] GREEN：package 保存静态 repair recipe，不伪造尚不存在的 runtime contract digest；
  evidence program、V4 checker 和 deterministic repairer 均为自包含可执行 artifact。
- [x] GREEN：V4 checker 验证 protected runtime contract 与 preflight-bound executable repair
  contract 的 digest/task/output identity，再复用公开 workdir success surface；不得读取 scorer、
  expected、held-out、secret value 或 raw model output。

#### Task 4.4C：Preflight binding 与 deterministic-first runtime

**文件：**

```text
修改 src/benchmarks/skill-ir/artifact-preflight.ts
修改 src/benchmarks/skill-ir/artifact-preflight.test.ts
修改 src/benchmarks/skill-ir/artifact-runtime.ts
修改 src/benchmarks/skill-ir/artifact-runtime.test.ts
```

- [x] RED：V4 preflight 必须先生成并保护 public runtime contract，再从 package recipe 生成
  `.skvm-artifact/executable-repair-contract.json`；任一 digest、task、output、link 或 scope 漂移
  均在模型调用前失败。
- [x] GREEN：V4 状态机固定为 `generation -> pre snapshot -> validate -> deterministic repair
  -> validate -> optional one sanitized model repair for residual -> validate -> post snapshot -> stop`。
- [x] GREEN：确定性修复、模型修复和 validation 成本/状态分列；确定性修复通过时不得调用
  模型 repair，仍有安全可表达 residual 时最多调用一次；protected mutation 与任何阶段
  infrastructure failure 均 fail closed。

#### Task 4.4D：Runner dispatch、package/lock freeze 与 dry-run

**文件：**

```text
修改 src/benchmarks/skill-ir/matrix.ts
修改 src/benchmarks/skill-ir/matrix.test.ts
修改 src/benchmarks/skill-ir/real-agent.ts
修改 src/benchmarks/skill-ir/real-agent-run.ts
修改 src/benchmarks/skill-ir/real-agent-run.test.ts
新增 benchmarks/skill-ir/pilots/env-manager/packages/executable-contract-repair-artifact-v4/
新增 benchmarks/skill-ir/pilots/env-manager/env-manager-contract-repair-artifact-v4-lock.json
```

- [x] RED：新 system `ir-contract-artifact-dev` 只能通过显式 artifact-development bypass、
  V4 package 和完全匹配的新 lock 调度；旧 V1/V2/V3 system/package/lock 组合保持拒绝。
- [x] GREEN：锁定 `xty/gpt-5.6-sol`、Windows/clean/bare-agent、两个 development task ×
  两次 repetition、共享 generation、确定性优先状态机、scorer identity 与数值 gate；lock 在
  付费前绑定 package manifest/provenance digest。
- [x] GREEN：完成 package verify、4-generation dry-run 和 gate analyzer 空/缺 pair fixture；
  本任务只冻结方法，不用 dry-run 声称优化成功。
- [x] 新付费 development 继续使用同一 shared-generation package/lock。Gate 未过不得运行
  held-out；付费结果不得反向修改 package、scorer、tasks、model、repetitions 或数值 gate。
  实际 4 个 generation 中 3 个形成完整 pair，pre mean 0.90、post mean 1.00，确定性修复
  3/3 通过且模型 repair 为 0；另 1 个 generation 因 Bun internal assertion crash 计为
  infrastructure。冻结 gate 为 3/4、mean 0.75、1 infrastructure，失败并阻断 held-out。

## 11. Step 5 文件级 TDD 实施计划

### Task 5.1：V4 基础设施诊断身份与脱敏审计

**文件：**

```text
新增 src/benchmarks/skill-ir/infrastructure-diagnostic.ts
新增 src/benchmarks/skill-ir/infrastructure-diagnostic.test.ts
新增 src/benchmarks/skill-ir/infrastructure-diagnostic-run.ts
新增 benchmarks/skill-ir/pilots/env-manager/env-manager-v4-infrastructure-diagnostic-lock.json
更新 docs/skill-ir/evaluation-system.md
```

- [x] RED：拒绝把 diagnostic 当作 method evidence，拒绝缺失 V4 gate/summary digest、未知
  runtime identity、held-out、retry 或修改冻结 V4 identity 的输入。
- [x] GREEN：从 raw infrastructure row 只投影 stage、run status、exit code、Bun version、
  封闭 crash class 和脱敏 fingerprint；不输出 stdout、绝对路径、secret 或模型正文。
- [x] GREEN：新 CLI 生成 compact audit；复现 probe 使用新的 run identity，结果只能支持
  `reproducible | not-observed | inconclusive`，不能回填 V4 gate。

### Task 5.2：`law-to-markdown` 2+2 task 与资源契约

**文件：**

```text
新增 benchmarks/skill-ir/pilots/law-to-markdown/tasks.json
新增 benchmarks/skill-ir/pilots/law-to-markdown/resource-contract.json
新增 src/benchmarks/skill-ir/resource-contract.ts
新增 src/benchmarks/skill-ir/resource-contract-run.ts
新增 src/benchmarks/skill-ir/resource-contract.test.ts
修改 benchmarks/skill-ir/corpus/corpora/pilot.json
修改 src/skill-ir/corpus-fixtures.test.ts
更新 docs/skill-ir/real-skill-pilots.md
```

- [x] RED：要求 2 个 development、2 个 held-out，覆盖法律转换和非法律拒绝；prompt 不含
  evaluator expected、隐藏标题答案或 held-out 泄漏。
- [x] GREEN：固定 `.txt` fixture、用户可见输出契约、禁止网络/安装和 bundled-script 使用
  边界；资源契约声明 Python 及两个 eager-import module 的付费前 probe。
- [x] GREEN：manifest 只晋升到 `tasks-authored` 并声明 `tasksPath`，不写 `irPath`。

### Task 5.3：`law-to-markdown` 确定性 scorer

**文件：**

```text
新增 src/bench/evaluators/law-to-markdown-grade.ts
新增 src/bench/evaluators/law-to-markdown-grade.test.ts
修改 src/bench/evaluators/index.ts
新增 src/benchmarks/skill-ir/law-to-markdown-pilot.test.ts
更新 docs/skill-ir/evaluation-system.md
```

- [x] RED：输入修改、错误产物集合、字符流变化、法律层级错误、非法律仍生成最终成果和
  审核结论错误分别失败；路径逃逸和 evaluator I/O 异常记为 infrastructure。
- [x] GREEN：scorer 只读取最终 workdir，以 hard gate + weighted threshold 判定；测试同时
  覆盖 perfect、partial、unsafe 和 non-law case。
- [x] GREEN：scored row 只保留 criterion pass/score，不泄漏完整 expected 文本。

### Task 5.4：本地门禁与下一实验冻结

- [x] 运行 focused Bun tests、全部 Skill IR tests、Python resource probe、typecheck 和文档链接检查。
- [x] 只在 probe 通过后生成 `no-skill | original x development` dry-run；本任务不付费。
- [x] 更新 spec、plan、组件文档、conversation log；提交并推送功能与文档，不提交 raw workdir。

## 12. Step 6 文件级 TDD 实施计划

本阶段只校准第二个真实 skill 的原始链路。不得创建 base IR、修改 task/scorer、运行
held-out 或把结果写成 Skill IR 增益。

### Task 6.1：Pre-IR calibration lock 与计划编译

**文件：**

```text
新增 src/benchmarks/skill-ir/pre-ir-calibration.ts
新增 src/benchmarks/skill-ir/pre-ir-calibration.test.ts
新增 src/benchmarks/skill-ir/pre-ir-calibration-run.ts
新增 src/benchmarks/skill-ir/pre-ir-calibration-run.test.ts
新增 benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-pre-ir-calibration-lock.json
更新 docs/skill-ir/real-skill-pilots.md
```

- [x] RED：拒绝 digest drift、非 tasks-authored skill、held-out task、static/PGO/artifact
  system、非 clean context、错误模型/adapter/panel、重试、非 8-row 完整矩阵和 secret。
- [x] GREEN：验证 `skill-ir-pre-ir-calibration-lock/v1`，只从 lock 生成 2 systems ×
  2 development tasks × 2 repetitions 的 exact plan。
- [x] GREEN：`plan` phase 不调用模型；`route-probe` 只执行一个 original generation 并输出
  脱敏 `methodEvidence=false` 结果；`execute` 必须在资源与 route probe 通过后运行完整矩阵。

### Task 6.2：Calibration gate 与 compact evidence

**文件：**

```text
新增 src/benchmarks/skill-ir/pre-ir-calibration-gate.ts
新增 src/benchmarks/skill-ir/pre-ir-calibration-gate.test.ts
新增 src/benchmarks/skill-ir/pre-ir-calibration-gate-run.ts
更新 docs/skill-ir/evaluation-system.md
更新 docs/skill-ir/experiment-results.md
```

- [x] RED：缺 row/pair、duplicate identity、非 development、identity drift、infrastructure、
  两臂饱和、无 paired outcome difference 和 evaluator payload sink 必须被显式记录或拒绝。
- [x] GREEN：固定分母为 8 generations；报告 system success/mean/token、4 个 pair、
  criterion transition、negative delta、saturation 与 distinguishability，不保存模型正文。
- [x] GREEN：Gate 只决定是否允许 base IR audit；不要求 original 优于 no-skill，不允许
  held-out、scorer retuning、PGO 或主 claim。

### Task 6.3：资源、route 与冻结 development 实验

- [x] 使用 `SKVM_PYTHON` 重新运行 resource probe；失败立即停止。
- [x] 运行 lock-bound dry-run，确认 8 rows、4 complete pairs、0 held-out、0 IR system。
- [x] API key 存在时运行一个独立 route probe；通过后执行一次冻结 8-generation calibration。
- [x] 使用既有 deterministic scorer 生成 scored rows，再运行 calibration gate；不根据输出
  修改 task、scorer、lock、模型、repetitions 或 gate。
- [x] 更新 spec、plan、组件文档、experiment results 和 conversation log；只提交 compact
  evidence，raw/workdir/route tail 保留本地。

### Task 6.4：验证与提交

- [x] 运行 focused RED/GREEN、全部 Skill IR/evaluator tests、typecheck、文档链接与 secret scan。
- [x] 提交并推送设计、实现和 compact evidence；记录 gate 是否允许进入 base IR audit。
