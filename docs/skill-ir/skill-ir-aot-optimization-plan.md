# Skill IR AOT 当前执行计划

**最后更新：** 2026-07-31

本文件只记录当前状态和下一步。已完成阶段的详细演进见
`docs/skill-ir/history.md`，组件契约见对应权威文档。

## 0. 当前执行窗口

Task 16.21 已按预注册失败分支关闭：skill-unique local audit 与真实 8-row matrix 都完成，但强模型
no-skill/original 仍 4/4、0 differing pair。当前活跃任务转为 Task 16.22 Wave B cross-skill replication。
顺序固定为：

```text
冻结 Task 16.21 负结果
-> 选择一个不同 phenotype 的真实 Wave B skill
-> public contract + deterministic scorer audit
-> no-skill | exact original development baseline
-> 只有区分度 gate 通过才允许 base IR / ir-static
-> development gate 后才允许 held-out
```

本窗口禁止新增 runtime、transport 或 artifact catalog 版本。旧 package、lock、runner 和 compact
result 保持原路径与 digest；后文旧任务中的未完成动作若已被后续 gate 或 Task 16.21 覆盖，均不再是
活跃 checkbox。新的实现优先复用通用 runner/scoring/gate，仅在测量合同本身需要时增加代码。

## 1. 当前 Ledger

| Workstream | 状态 | 当前结论或下一步 |
|---|---|---|
| IR schema/parser/validator/profiler/passes/lowering | 完成 | 保持回归测试，按 `ir-core.md` 修改。 |
| Synthetic corpus/matrix/analyzer | 完成，低权重 | 只用于 calibration 和受控失败。 |
| Real-agent runner/scorer/pairing | 完成 | 已支持 persistent workdir 和完整 run identity。 |
| Real skill provenance intake | 完成首轮 | 6 个 pilot，Wave A 3 + Wave B 3。 |
| `env-manager` task/scorer/base IR | 完成 | 首个 runnable 真实 pilot，保留冻结实验链路。 |
| Static IR development run | 完成 | Partial correctness 改善，binary success 仍 0/4。 |
| Dual-source Final IR | 完成候选 | V1/v2 均未过 development gate。 |
| Executable artifact v1 | 冻结失败证据 | Validator semantic coverage 不足，repair 未触发。 |
| Semantic artifact v2 | 冻结失败证据 | Repair 触发 2 次，均未通过 revalidation。 |
| GPT-4.1 capability diagnostic | 完成，gate 失败 | 20 行均无 infra；强模型改善基础执行，但五系统仍 0/4 成功。 |
| V3 public-contract artifact | 设计已确认 | 先做公开 contract、B derivation、共享 snapshot 与一次修复。 |
| V4 contract-repair development | 冻结 gate 失败 | 3 个完整 pair 从 0.90 到 1.00；1 个 Bun infrastructure，禁止补跑。 |
| V4 infrastructure diagnosis | 完成 | Bun 1.3.14 assertion 已脱敏分类，reproducibility 仍 inconclusive。 |
| `law-to-markdown` vertical slice | Held-out gate 失败并冻结 | Development 4/4、0.925；held-out 2/4、0.725，manual task 两次回归。 |
| `experimental-design` second phenotype | v2 基线饱和 | stable Pi 两批均 4/4 vs 4/4、0 differing；Task 16.21 转向 skill-unique semantic surface。 |
| Benchmark contract audit | Wave A v1 已完成 | 3/3 pilot audit failed，历史结果降为 `support-real`；先修复测量再继续付费。 |
| Held-out / pooled panel / Wave B | Law 已执行，其余阻断 | v2 audit 与 development gate 通过后，优先用 `api-tester` 做冻结 Wave B replication。 |
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
- Digest-bound source audit sidecar，逐节点覆盖 IR 语义并拒绝 evaluator/held-out evidence。
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

Law static development 暴露的文本 IR 阻塞为：

```text
required: ir-static success >= 3/4, mean >= 0.85, hard-gate regressions = 0, infra = 0
observed: ir-static success = 1/4, mean = 0.7875, hard-gate regressions = 0, infra = 0
paired original->static: 1 positive, 1 negative, 2 equal, mean delta = 0
```

公开 script 已定义 canonical review label 与 report fields，但当前 IR/lowering 只输出自然语言
要求；Windows bare-agent 的 shell 路径也未可靠执行 bundled script。下一阶段转向
template/schema 与 direct tool-plan 固态化，不继续堆文本规则。

该方向的 validated artifact development 已在 2026-07-24 通过：

```text
16/16 rows, 4/4 quartets, infrastructure = 0
validated-artifact: success = 4/4, mean = 0.925, model tokens = 0
original: success = 0/4, mean = 0.750
ir-static: success = 1/4, mean = 0.800
pairwise artifact vs best(original, static): 3 positive, 1 equal, 0 negative
```

Law held-out 已执行但 gate 失败：artifact 在法规 task 两次均为 0.85/success，在非法律
manual task 两次均为 0.60/failure；总计 2/4、mean 0.725，并发生 2 次逐样本回归。
当前阻塞是 Law package 的 task-boundary 泛化与付费 orchestration 仍写死 Law。Catalog、
manifest、execution-plan 与 runtime 已被第二个 `experimental-design` phenotype 原样复用；
该 pilot 只有本地 mechanism evidence，没有真实 baseline 或 development gate。Break-even
继续禁止计算。

## 4. 下一阶段顺序

### 当前下一刀：Wave B 不同真实 Skill 复用

1. Task 16.21 已按预注册停止规则关闭；保留所有 task、scorer、audit、lock 和 compact result，不原地修改。
2. 从冻结 intake 中优先选择 `api-tester`，审计 exact source、license、resource closure 和可确定性判分面。
3. 先冻结 2 development + 2 held-out、task-visible contract、deterministic scorer 和本地差分/泄漏/物化审计。
4. 复用 direct Node Pi、short-path budget、runner/scoring/gate core；不新增 runtime、transport 或 artifact catalog。
5. 先运行 `no-skill | exact original` development 区分度 gate；只有 gate 通过才构造 base IR 和 ir-static。
6. Wave B 报告通用 core branch delta、adapter LOC、artifact kind 复用率、质量、稳定性与 token 成本；
   development gate 前不消费 held-out。

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

### Step 3：合并两路证据后设计下一 catalog（已完成）

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

第一刀已完成 `law-to-markdown` 的 task/scorer 纵切、pre-IR calibration、source-audited base
IR 和冻结 static development。当前只支持
`.txt`，同时显式记录上游脚本对 `python-docx`/`pdfplumber` 的 eager import；依赖 probe
未通过时禁止付费运行。Source-audited base IR 与机器可检验的 evidence sidecar 已使该
pilot 晋级 `runnable`。Static 12-row gate 已失败并冻结，不进入 held-out。下一轮先设计新
catalog，只从公开 bundled script/source contract 编译 canonical report template/schema 和
Windows-safe direct interpreter tool plan，再以新的 development lock 做本地 activation 与付费验证。

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

## 13. Step 7：Law Base IR 与 Static Development

### Task 7.1：机器可检验的 Source Audit

**文件：**

```text
新增 src/skill-ir/source-audit.ts
新增 src/skill-ir/source-audit.test.ts
更新 src/skill-ir/corpus-fixtures.test.ts
```

- [x] RED：缺失/重复 target、digest 漂移、越界行号、未批准 JSON pointer、evaluator、
  fixture、threshold 和 held-out prompt 均失败。
- [x] GREEN：每个有稳定 id 的 IR semantic node 都必须映射到固定 digest 的 source 行、
  development prompt 或 resource-contract pointer；base IR `profile` 必须为空。

### Task 7.2：`law-to-markdown` Base IR 与 Corpus 晋级

**文件：**

```text
新增 benchmarks/skill-ir/pilots/law-to-markdown/base-ir.json
新增 benchmarks/skill-ir/pilots/law-to-markdown/base-ir-source-audit.json
更新 benchmarks/skill-ir/corpus/corpora/pilot.json
```

- [x] 用中文 IR 显式表达输入分支、工具优先级、用户回退授权、格式层级、Stage3 双检查、
  最多两次恢复和条件产物，不引入 evaluator expected。
- [x] Manifest 晋级 `runnable`，同时绑定 `irPath` 与 `sourceAuditPath`。
- [x] 冻结独立 static-development lock，只包含 `no-skill | original | ir-static`、两个
  development tasks、clean context 和预注册 repetitions。
- [x] Plan-only CLI 生成 12-row/4-triplet dry-run，确认 0 held-out、0 PGO/artifact。
- [x] 补齐 `plan | route-probe | execute` 三阶段门禁；非 plan 阶段重跑资源 probe，route
  probe 使用 lock 冻结的 180 秒超时，execute 只接受同目录且身份一致的成功 probe。
- [x] 实现 static gate：12-row/4-triplet 固定分母，缺失或 raw infrastructure 计 0，逐对报告
  original→ir-static score/criterion transition、hard-gate regression 与 strict improvement。
- [x] 运行一次冻结付费 development 并评分：12/12 rows、4/4 triplets、0 infra；static 1/4、
  mean 0.7875，gate failed。未创建 held-out lock，未运行 PGO 或 artifact promotion。

### Task 7.3：验证与记录

- [x] Focused/core 回归、law scorer、typecheck、文档链接与 secret scan 通过；新增 runnable
  pilot 引出的 matrix/override/lifecycle 回归已修复。
- [x] 生成 `ir-static` dry-run，确认 12 rows、4 triplets、无 held-out/PGO/artifact system。
- [x] Static runner/gate focused tests 12/12 与 typecheck 通过；plan CLI 再次生成 12 rows。
- **历史基础设施限制（已绕开）：** Bun 1.3.14 的 benchmark 聚合曾在 Windows 上无结尾退出
  状态；全仓库测试另有缺 `sh/python3` 的环境失败。后续通过分组测试和冻结 Pi harness 完成了
  有效实验，该条不再是当前待办。
- [x] 更新 spec/plan/组件文档和 conversation log；dry-run/raw workdir 只留本地。

### Task 7.4：Static Failure Audit 与下一 Artifact 边界

- [x] 冻结 static 失败证据；不补跑、不修改本次 scorer/base IR/lock/gate。
- [x] 对照公开 bundled script 与最终 workdir，确认主要残差是 canonical review label/template
  未被 lowering 固化；2 个 non-law row 另暴露 Windows shell tool-plan gap。
- [x] 起草新的 law executable artifact design：只允许使用 source closure、resource contract 和
  用户可见 task contract，编译 canonical report schema/template 与 direct Python tool plan；
  evaluator payload、held-out、当前模型输出不得成为 compiler input。
- [x] 先做本地 fixture activation 与泄漏反向测试，再冻结新的 development lock；仍不运行 held-out。

## 14. Step 8：通用 Artifact Catalog 与 Law Pilot

### Task 8.1：冻结 skill-agnostic catalog contract

**文件：**

```text
新增 src/benchmarks/skill-ir/validated-artifact-catalog.ts
新增 src/benchmarks/skill-ir/validated-artifact-catalog.test.ts
更新 docs/skill-ir/optimization-and-artifacts.md
```

- [x] RED：拒绝绝对/逃逸/反斜杠路径、重复 artifact/node id、未知 artifact kind/node kind、
  未声明 artifact 引用、digest 漂移、undeclared file、shell command string、任意 env 继承和
  skill-specific catalog 字段。
- [x] GREEN：实现 `validated-skill-artifact/v1` 的 manifest、provenance、execution-plan
  strict schema 和 package validator；skill id 只作为数据，不参与 dispatch。
- [x] GREEN：验证 compiler inputs、artifact records、process/validate nodes 和 protected
  outputs 的引用闭包；保持 V1-V4 历史 package/parser/digest 不变。

### Task 8.2：通用 execution-plan runtime

**文件：**

```text
新增 src/benchmarks/skill-ir/validated-artifact-runtime.ts
新增 src/benchmarks/skill-ir/validated-artifact-runtime.test.ts
```

- [x] RED：process 节点不得经过 shell；未声明 executable、placeholder、artifact、工作目录
  逃逸、非零退出、timeout 和 protected input mutation 必须 fail closed。
- [x] GREEN：按拓扑顺序解释封闭 process/validate 节点，参数级展开 `{workdir}`、
  `{artifact:<id>}` 和 `{env:<approved-name>}`；只把批准环境传给子进程。
- [x] GREEN：输出 `skill-artifact-execution-result/v1`，分列 process/validation duration、
  exit class、节点状态、model token=0 和 package bytes；不保存 stdout/stderr/绝对路径。

### Task 8.3：Law compiler adapter

**文件：**

```text
新增 src/benchmarks/skill-ir/law-artifact-compiler.ts
新增 src/benchmarks/skill-ir/law-artifact-compiler.test.ts
新增 src/benchmarks/skill-ir/law-artifact-run.ts
新增 benchmarks/skill-ir/pilots/law-to-markdown/packages/validated-skill-artifact-v1/
```

- [x] RED：向 evaluator、held-out prompt、runtime output 和 secret 注入 canary，递归扫描 package
  必须不存在；删除 bundled script/report label/resource evidence 时编译失败。
- [x] GREEN：只从 source closure、base IR/source audit、resource contract 和 development prompt
  投影编译 Python scripts、canonical report contract、review schema、direct tool plan 与 checker。
- [x] GREEN：两次独立编译 byte-for-byte 相同；manifest/provenance 绑定逐文件 digest、
  compiler identity 和 forbidden evidence classes；`--verify-only` 不覆盖冻结 package。

### Task 8.4：Law 本地 activation 与 scorer 对齐

**文件：**

```text
新增 src/benchmarks/skill-ir/law-artifact-activation.test.ts
更新 docs/skill-ir/evaluation-system.md
更新 docs/skill-ir/real-skill-pilots.md
```

- [x] RED：构造法律与非法律 development fixture，先确认 direct tool plan 未执行时 scorer
  不通过对应成功面。
- [x] GREEN：使用 workspace Python 资源 probe 后，在临时 workdir 无 shell 执行 package；
  输入 digest 不变，法律任务生成 canonical report+deliverable，非法律任务只生成拒绝报告。
- [x] GREEN：运行既有 deterministic scorer，分开记录 runtime validation 与 scorer 结果；
  本地通过只记 mechanism evidence，不进入 held-out 或主 claim。

### Task 8.5：冻结前审计与跨 Skill 复用门槛

**文件：**

```text
新增 src/benchmarks/skill-ir/validated-artifact-development.ts
新增 src/benchmarks/skill-ir/validated-artifact-development.test.ts
新增 src/benchmarks/skill-ir/validated-artifact-development-run.ts
新增 src/benchmarks/skill-ir/validated-artifact-development-run.test.ts
新增 src/benchmarks/skill-ir/validated-artifact-development-gate.ts
新增 src/benchmarks/skill-ir/validated-artifact-development-gate.test.ts
新增 benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-validated-artifact-development-lock.json
更新 src/benchmarks/skill-ir/matrix.ts
更新 src/benchmarks/skill-ir/scoring.ts
更新 docs/skill-ir/evaluation-system.md
更新 docs/skill-ir/real-skill-pilots.md
```

- [x] RED/GREEN：实现独立的 `skill-ir-validated-artifact-development-lock/v1`，绑定 source、
  tasks、resource/scorer/base IR/source audit、冻结 package 三个入口 digest 与 compiler/catalog/
  runtime/planner/runner/gate implementation digest；任何漂移 fail closed，不复用或修改 static lock。
- [x] RED/GREEN：从 lock 编译 16 行/4 四元组 dry-run；前三臂为 12 条模型行，artifact 为
  4 条 `direct-deterministic` 行。拒绝 held-out、PGO、额外 context/system/repetition 和假模型身份。
- [x] RED/GREEN：实现 `artifact-execute` 免费阶段，安全物化同一 fixture，验证 resource/package、
  无 shell 执行 4 行并写 compact raw/scored/cost evidence；不得调用模型或读取 evaluator expected
  作为 runtime 输入。
- [x] RED/GREEN：实现固定 16 行分母 gate；缺失/重复/身份漂移按失败或拒绝，要求 artifact
  4/4 success、总均分与逐 task 均分不低于 0.85、0 infra、0 hard-gate failure，且逐匹配样本
  不低于 `original` 与 `ir-static` 的较优结果。
- [x] GREEN：dry-run 与本地 artifact 4 行通过后才进入 route probe/付费完整 development；
  gate 未通过不执行 held-out，不调 scorer/package/lock。
- [x] Experimental-design adapter 已复用相同 manifest/execution-plan/runtime API，通用 core 未新增
  skill-id 分支；Law 单例不再作为 catalog 泛化的唯一依据。
- [x] 成本表固定报告 compile/profile/model generation/model repair/process/validation/package bytes；
  另列 research diagnostic cost；质量不回归前 break-even 保持未计算，不宣传 token 节省。
- [x] 更新 spec、plan、组件文档、experiment results 和 conversation log；执行 focused tests、
  typecheck、文档链接、secret scan 和 `git diff --check`。

### Task 8.6：从属 Execution Freeze 与完整 Development Gate

Task 8.5 的父 lock 保持不可变。其 direct runner 已绑定 digest 且只实现
`plan | artifact-execute`，因此本任务新增从属 execution freeze 和独立 orchestration，不原地
扩展父 lock 已绑定文件。

**文件：**

```text
新增 src/benchmarks/skill-ir/validated-artifact-development-execution-freeze.ts
新增 src/benchmarks/skill-ir/validated-artifact-development-execution-freeze.test.ts
新增 src/benchmarks/skill-ir/validated-artifact-development-execution-run.ts
新增 src/benchmarks/skill-ir/validated-artifact-development-execution-run.test.ts
新增 benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-validated-artifact-execution-freeze.json
更新 docs/skill-ir/evaluation-system.md
更新 docs/skill-ir/real-skill-pilots.md
更新 docs/skill-ir/experiment-results.md
```

- [x] RED：execution freeze schema 拒绝父 lock digest、model runner、scoring、route/resource、
  adapter 或 orchestration digest 漂移；父 lock 内容仍由既有 validator 独立验证。
- [x] GREEN：冻结 `skill-ir-validated-artifact-development-execution-freeze/v1`，仅补充执行
  provenance，不覆盖父 lock 的矩阵、模型、gate、package 或 scorer 身份。
- [x] RED/GREEN：实现 compact route result；probe 必须来自 `original × 首个 development
  task × repetition 1`，且绑定父 lock 与 execution freeze digest，禁止持久化命令和模型正文。
- [x] RED/GREEN：完整 execute 先重跑 resource probe，再验证同目录 route evidence；只执行
  12 条冻结模型行、零重试，并在同一批次重跑 4 条 direct artifact 行。
- [x] RED/GREEN：合并恰好 16 条 raw/scored row，运行既有冻结 gate，并输出 compact
  scored/cost/summary/gate；缺行、重复、身份漂移或 prerequisite failure 必须 fail closed。
- [x] route probe 通过后执行一次冻结付费 development。Gate 未通过时原样记录，禁止补跑、
  调 scorer/package/lock、计算 break-even 或进入 held-out。
- [x] 更新权威组件文档、实验结果和 conversation log；运行 focused/full tests、typecheck、
  文档链接、secret scan、digest verification 和 `git diff --check` 后提交推送。

实际结果：16/16 rows、4/4 quartets、0 infrastructure；artifact 4/4、mean 0.925、
0 hard-gate failure、0 pairwise regression、0 model token，冻结 development gate passed。
该结果只解锁 held-out lock 设计，不解锁直接执行或 break-even 主张。

### Task 8.7：Law Held-out Lock 与独立验证

**文件：**

```text
新增 src/benchmarks/skill-ir/validated-artifact-heldout.ts
新增 src/benchmarks/skill-ir/validated-artifact-heldout.test.ts
新增 src/benchmarks/skill-ir/validated-artifact-heldout-run.ts
新增 src/benchmarks/skill-ir/validated-artifact-heldout-run.test.ts
新增 src/benchmarks/skill-ir/validated-artifact-heldout-gate.ts
新增 src/benchmarks/skill-ir/validated-artifact-heldout-gate.test.ts
新增 benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-validated-artifact-heldout-lock.json
更新 docs/skill-ir/evaluation-system.md
更新 docs/skill-ir/real-skill-pilots.md
更新 docs/skill-ir/experiment-results.md
```

- [x] RED：held-out lock 必须绑定已通过 development gate/summary digest、同一 package/parent
  lock/execution freeze、冻结两个 held-out task 和既有 deterministic scorer；development
  gate 必须为 16/16、4/4、0 infra、passed，任何漂移拒绝。
- [x] RED：验证 package 仍为 `constructionSplit=development`，两个 held-out task 不在构造
  `taskContract` 中，`held-out` 仍是 forbidden evidence class；禁止重编 package 或改 provenance。
- [x] GREEN：编译 `skill-ir-validated-artifact-heldout-plan/v1`，只允许
  `no-skill | original | ir-static | validated-artifact`、Windows、clean、GPT-5.6、
  bare-agent、2 held-out tasks × 2 repetitions、16 rows / 4 quartets 和零重试。
- [x] RED/GREEN：实现 `plan | route-probe | execute`；route/resource/execute 与 development
  结果目录隔离，route 同时绑定 held-out lock 与上游 freeze，禁止 development output
  进入 runtime/scorer/compiler。
- [x] RED/GREEN：实现独立 held-out gate，要求 artifact 4/4、mean/task mean≥0.85、
  0 infra、0 hard-gate failure；逐样本不低于三条 baseline 中最好者，且至少 1 个严格提升。
- [x] RED/GREEN：缺行按冻结分母 0 分/infrastructure，重复、task split、model/adapter、
  repetition 或 panel identity 漂移直接拒绝；成本继续分列 model/process/validation/package。
- [x] 付费前提交并推送 held-out lock、实现和数值 gate；完成 dry-run、resource 与 route
  probe 后执行唯一一次 held-out，不补跑。
- [x] 无论 gate 成败都原样持久化 compact evidence，再决定第二 phenotype skill 复用与
  amortized cost 实验。

实际结果：16/16 rows、4/4 quartets、0 infrastructure。Artifact 为 2/4、mean 0.725；
法规 task 两次均为 0.85/success，manual task 两次均为 0.60/failure。相对
`max(no-skill, original, ir-static)` 为 1 strict improvement、1 equal、2 regressions，
held-out gate failed。失败已冻结，不重编 package、不调 scorer、不补跑；break-even 保持阻断。

### Task 8.8：第二 Phenotype Catalog Reuse

- [x] 选择 `experimental-design` 作为与 Law direct document pipeline 不同的真实 skill；
  固定第一阶段为 stdlib-only 随机分配 phenotype，不同时引入 `pyDOE3` DOE 矩阵。
- [x] 冻结用户可见输入/输出合同、方法选择规则、checker/scorer 边界、2+2 split、禁止
  Law held-out feedback 和禁止本阶段执行 held-out。

#### Task 8.8.1：任务、Scorer 与资源合同

**文件：**

```text
新增 benchmarks/skill-ir/pilots/experimental-design/tasks.json
新增 benchmarks/skill-ir/pilots/experimental-design/resource-contract.json
新增 src/bench/evaluators/experimental-design-grade.ts
新增 src/bench/evaluators/experimental-design-grade.test.ts
更新 src/bench/evaluators/index.ts
更新 src/benchmarks/skill-ir/corpus-registry.test.ts
```

- [x] RED：四个 task 必须恰为 2 development + 2 held-out；prompt 只能声明公开合同，eval
  payload 不得被复制到 prompt；pilot 在没有 IR/source audit 前仍不可进入主矩阵。
- [x] RED：scorer 对输入保护、三项产物、plan schema、方法/单位安全、allocation 一致性、
  seeded reproducibility 与报告完整性分别判分；路径逃逸和非法 payload 计 infrastructure。
- [x] GREEN：实现 workdir-only deterministic evaluator，hard gate 固定为输入保护、三项产物
  和 assignment-unit safety，阈值固定为 0.85。
- [x] GREEN：资源合同只要求 Python >=3.10 与标准库，网络/安装禁止；上游 numpy/pandas/
  pyDOE3 能力保留为后续 DOE 扩展，不作为本轮 infrastructure。

#### Task 8.8.2：Base IR 与 Source Audit

**文件：**

```text
新增 benchmarks/skill-ir/pilots/experimental-design/base-ir.json
新增 benchmarks/skill-ir/pilots/experimental-design/base-ir-source-audit.json
更新 benchmarks/skill-ir/corpus/corpora/pilot.json
更新 src/skill-ir/corpus-fixtures.test.ts
```

- [x] RED：source audit 必须覆盖每个 IR semantic node，拒绝 evaluator、fixture、threshold、
  held-out prompt 与 Law result 作为证据。
- [x] GREEN：profile-empty base IR 显式表达 assignment/analysis unit、nuisance handling、
  method decision、seeded schedule、replication/pseudoreplication 检查与 fail-closed recovery。
- [x] GREEN：pilot 只有在 tasks、resource、IR 和 source audit 均可验证时才晋升 `runnable`。

#### Task 8.8.3：Experimental-design Compiler Adapter

**文件：**

```text
新增 src/benchmarks/skill-ir/experimental-design-artifact-compiler.ts
新增 src/benchmarks/skill-ir/experimental-design-artifact-compiler.test.ts
新增 src/benchmarks/skill-ir/experimental-design-artifact-run.ts
新增 benchmarks/skill-ir/pilots/experimental-design/packages/validated-skill-artifact-v1/
```

- [x] RED：compiler input digest 漂移、缺公开 source/resource evidence、held-out/evaluator/runtime/
  Law failure canary、非 development task contract 均 fail closed。
- [x] RED：两次独立编译必须 byte-for-byte 相同；package 必须通过现有通用 validator，且
  catalog/runtime core 不得出现 `experimental-design` 分支。
- [x] GREEN：adapter 编译 stdlib Python generator、plan/report template、schema、direct
  tool plan 与 checker；按公开字段选择 cluster/stratified-block/permuted-block/simple。
- [x] GREEN：provenance 绑定所有 compiler input、artifact digest、compiler identity 和
  forbidden evidence classes；`--verify-only` 不覆盖冻结 package。

#### Task 8.8.4：本地 Activation 与隔离验证

**文件：**

```text
新增 src/benchmarks/skill-ir/experimental-design-artifact-activation.test.ts
更新 docs/skill-ir/optimization-and-artifacts.md
更新 docs/skill-ir/evaluation-system.md
更新 docs/skill-ir/real-skill-pilots.md
```

- [x] RED：未执行 package 时 development fixture 不满足 artifact success；篡改 protected
  input、method、seed、allocation unit 或 schedule completeness 时 checker/scorer 必须失败。
- [x] GREEN：两个 development fixture 通过同一通用 runtime 执行，protected digest 不变，
  runtime validation 与 deterministic scorer 独立通过，model token 为 0。
- [x] GREEN：canary scan 和 reverse-evidence 测试证明 evaluator expected、held-out 与
  Law failure 未进入 package；移除公开字段时 checker 降级或显式失败，不猜测金标。

#### Task 8.8.5：Development Calibration 与阶段门禁

- [x] 在所有本地机制测试与文档通过后，冻结仅含 `no-skill | original`、两个 development
  task、clean/Windows/bare-agent、单一预注册强模型和零重试的 calibration lock。
- [x] 先 dry-run 与 route probe，再执行唯一一次 development calibration；不得运行 held-out，
  不得根据输出改 scorer/task/package。
- [x] Calibration 只判断任务可执行性、baseline 饱和度和 scorer 区分度。随后再决定是否冻结
  `no-skill | original | ir-static | validated-artifact` development lock；没有新 lock 时
  不得把本地 activation 写成真实优化成功。
- [x] 更新 spec/plan/组件文档/experiment results/conversation log，运行 focused/full Skill IR
  tests、typecheck、文档链接、secret scan、digest verification 与 `git diff --check` 后提交推送。

本地机制阶段实际结果：2/2 development fixture runtime/scorer pass，score 均为 1.00，
protected digest unchanged，model token 0；committed package 为 9 artifacts、2 nodes、
33878 bytes。现有 pre-IR lock 生命周期与 Law-specific development orchestration 都不能作为
新 pilot 的冻结付费合同，因此本轮不绕过 lock 直接付费；8.8.5 转入下一阶段的通用
orchestration TDD。

### Task 8.9：Skill-neutral Baseline Calibration Orchestration

本任务只解决 `runnable` pilot 的冻结 baseline 诊断，不修改既有 pre-IR/Law lock、runner、
gate、package 或历史结果。设计与实施权威均保留在本 spec/plan，不再新增重复阶段文档。

#### Task 8.9.1：通用 Lock 与生命周期验证

**文件：**

```text
新增 src/benchmarks/skill-ir/baseline-calibration.ts
新增 src/benchmarks/skill-ir/baseline-calibration.test.ts
```

- [x] RED：拒绝非 `runnable` pilot、manifest path 漂移、source/task/resource/scorer/base IR/
  source audit/implementation digest 漂移和 held-out task。
- [x] RED：拒绝重复 task、非 `no-skill | original`、非 clean/Windows、非 2 repetitions、
  retry、held-out/PGO/main-claim promotion。
- [x] GREEN：实现 `skill-ir-baseline-calibration-lock/v1`，skill/task/model/adapter 为冻结数据，
  验证 base IR schema 和逐节点 source audit，旧 lock 文件与摘要保持不变。

#### Task 8.9.2：Planner、Route 与 Execute Guard

**文件：**

```text
新增 src/benchmarks/skill-ir/baseline-calibration-run.ts
新增 src/benchmarks/skill-ir/baseline-calibration-run.test.ts
```

- [x] RED：plan 必须恰为 8 rows/4 pairs，禁止 held-out/IR/artifact system；所有行必须匹配
  lock 的 model、adapter、panel、task 和 run index。
- [x] RED：route output 不得包含命令、stdout/stderr、绝对路径或模型正文；execute 缺 API、
  resource、同 lock/case/model 的成功 route 时 fail closed。
- [x] GREEN：实现 `plan | route-probe | execute`，runnable 路径不使用
  `--allow-tasks-authored`，模型重试固定为 0，execute 前重新验证 lock 和 corpus 生命周期。

#### Task 8.9.3：Baseline Gate

**文件：**

```text
新增 src/benchmarks/skill-ir/baseline-calibration-gate.ts
新增 src/benchmarks/skill-ir/baseline-calibration-gate.test.ts
新增 src/benchmarks/skill-ir/baseline-calibration-gate-run.ts
新增 src/benchmarks/skill-ir/baseline-calibration-gate-run.test.ts
```

- [x] RED：缺行/缺 pair/infrastructure/no-skill 饱和/两臂完全相同必须失败；重复或冻结身份漂移
  直接拒绝。
- [x] GREEN：按 8 rows/4 pairs 固定分母报告两臂 success/mean/tokens、逐 pair score delta 和
  criterion transitions；不保留 evaluator details。
- [x] GREEN：通过只产生 `fullDevelopmentPlanningAllowed=true`，held-out/main claim/scorer
  retuning/package recompile 始终为 false。

#### Task 8.9.4：Experimental-design 预注册与无成本验收

**文件：**

```text
新增 benchmarks/skill-ir/pilots/experimental-design/
  experimental-design-baseline-calibration-lock.json
更新 docs/skill-ir/evaluation-system.md
更新 docs/skill-ir/real-skill-pilots.md
```

- [x] 计算并冻结 source/tasks/resource/scorer/base IR/source audit 与所有执行实现 digest；
  模型固定 `xty/gpt-5.6-sol`，adapter 固定
  `bare-agent/workspace-experimental-design-baseline-v1`。
- [x] 运行 lock validator、8-row dry-run、resource probe；验证计划只有两个 development task，
  不含 package/held-out，且旧 Law lock/digest 未变化。
- [x] 提交并推送通用实现、lock 和付费前数值 gate 后才允许 route probe。

#### Task 8.9.5：唯一 Development Calibration

- [x] 在同一输出目录执行一次 route probe；失败时停止，不执行付费矩阵。
- [x] Route 通过后执行唯一 8-row、零重试 development calibration，随后用冻结 scorer 生成
  scored rows 和 gate report。
- [x] Gate 通过才起草四臂 skill-neutral development lock；失败则冻结诊断，不补跑、不修改
  task/scorer/package，不执行 held-out。
- [x] 持久化脱敏 compact evidence，更新 spec/plan/组件文档/experiment results/conversation
  log；运行 focused/full Skill IR tests、typecheck、文档链接、secret scan、digest verification
  和 `git diff --check` 后提交推送。

实际结果：route/resource 均 `ok`，8/8 rows、4/4 pairs、0 infrastructure。No-skill 与
original 都是 0/4、mean 0.30，token 为 45265/81822；四个 pair outcome 完全相同，
`differingPairs=0`，gate failed。Audit 排除了 original 注入和 prompt 编码问题，并发现 scorer
强制 task prompt 未声明的 schema/method enum、唯一 xorshift32 schedule 与逐字 report labels。
本批冻结为 benchmark contract failure；不建立四臂 development lock，不补跑、不改当前
task/scorer/package，不执行 held-out。

### Task 8.10：Pre-paid Benchmark Contract Coverage

- [x] 冻结 `skill-ir-benchmark-contract-audit/v1` 设计：scorer requirement 必须同时绑定
  scorer source anchor 与 task/source/workdir public evidence；audit 不进入 runtime、package、
  lowering、repair 或模型上下文。
- [x] 在 `benchmark-contract-audit.ts` 先写 schema/validator 失败测试，再实现 digest、development
  scope、criterion/hard-gate 全覆盖、合法 evidence locator、risk class/equivalence policy 和
  canary 完整性检查。
- [x] 在 `benchmark-contract-audit-run.ts` 及测试中接入 custom evaluator registry；隔离执行
  canonical-valid / alternative-valid / invalid-control fixture，只输出 ID、状态和稳定错误码。
- [x] 独立复核后收紧 fail-closed 边界：requirement 按 task 分支覆盖，允许显式窄化
  `requirement.taskIds`；bound file/canary realpath containment；执行快照二次 digest；
  evaluator path/source digest/object 三重身份；报告 ID 使用有界 ASCII。
- [x] 为 `env-manager`、`law-to-markdown`、`experimental-design` 分别编写
  `benchmark-contract-audit.json` 和最小 canary fixtures；scorer/task/source 只读且 digest 绑定。
- [x] 先运行本地 focused tests，再生成三个 committed compact audit report；任何缺公开证据、
  evaluator/base artifact 自证、未公开唯一 schedule 或合法等价实现被拒绝均 fail closed。
- [x] 历史 raw/scored/lock/package 不改写；未通过审计的 pilot 只把未来 corpus
  `evidenceWeight` 降为 `support-real`，并在 experiment results 中重述历史结论边界。
- [x] 更新 spec、evaluation system、real-skill pilot、experiment results 和 conversation log；
  运行全量 tests、typecheck、链接/digest/secret 检查后提交推送。
- [x] Experimental-design v2 已使用独立 task/scorer/audit/lock/version 和 development fixtures
  重建；未读取模型正文生成 expected，也未覆盖 v1。
- [x] v2 已先通过多实现 local differential tests 和书面评审，再投入 API calibration；冻结
  held-out 未进入修正过程。

文件级 TDD 顺序：

```text
1. benchmark-contract-audit.test.ts -> benchmark-contract-audit.ts
2. benchmark-contract-audit-run.test.ts -> benchmark-contract-audit-run.ts
3. benchmark-contract-audit-pilots.test.ts -> pilots/*/benchmark-contract-audit.json + audit-fixtures/
4. results/skill-ir/benchmark-contract-audit/*.json
5. corpus evidenceWeight + 权威组件/结果文档
```

### Task 8.11：Experimental-design Benchmark v2 与跨 Skill 泛化入口

本任务先修复测量合同，再恢复优化实验。它不修改 v1，不把 deterministic profile
当成主成功金标，也不在 audit 通过前调用 API。

#### Task 8.11.1：v2 身份与公开语义合同

- [x] 在 `benchmarks/skill-ir/pilots/experimental-design/v2/` 建立独立的 public
  contract、2 development + 2 held-out task 身份和 audit fixture 根。
- [x] 冻结公开可见的输入、输出、方法适用性、assignment/analysis/allocation unit、
  allocation 安全和报告一致性要求。
- [x] Development/held-out 物理分文件；scorer 实现前提交 `task-split-freeze.json`
  绑定 2+2 task/fixture digest，任何 API run 前再提交 `heldout-freeze.json`
  绑定 scorer digest 和创建提交。
- [x] 固定并测试 individual/cluster × strata/no-strata × sequential/non-sequential 的
  八种组合；混合 strata、重复 unit、非法 arms 和成员级 cluster allocation 必须在
  public task schema 层拒绝。
- [x] 明确禁止私有 schema version、封闭 method enum、唯一 PRNG/schedule 和逐字
  report label 进入主成功条件。
- [x] v1 path/digest 测试必须证明旧 task/scorer/audit/lock/package/result 未变化。

#### Task 8.11.2：语义主 Scorer 与确定性次指标

- [x] 先写 scorer RED tests，覆盖合法等价方法、allocation 顺序和中英文报告措辞。
- [x] 主 scorer 按 `0.10/0.10/0.25/0.35/0.20` 聚合五项语义分数；四个前置
  criterion 与 report contradiction 为 hard gate，row threshold 固定 `0.95`。
- **历史预注册门禁：** v2 development gate 固定为 0 infrastructure、success≥3/4、mean≥0.95、
  每个 task 至少一次成功、相对 baseline 无 hard-gate regression；后续两轮 baseline 均因
  no-skill 饱和和无区分度失败，未进入 IR/artifact 阶段。
- [x] 方法只按公开 `designProperties` 和 allocation invariants 判定，不比较自由文本
  method 名称；plan/report 两处的四个布尔属性必须与 scorer 派生值逐项相等。
  seed 的唯一 schedule 只进入 profile 次指标。
- [x] 报告正文不做关键词判分；只交叉验证公开 fenced JSON `design-evidence` block
  与 study/plan/allocation，明确唯一 block、严格 JSON、重复 key/block 的失败语义；
  `limitationFlags` 按公开 source-derived 集合比较，warnings 措辞保持自由。
- **延后次指标：** `deterministicProfileScore`、reproducibility 和显式
  “semantic pass / profile differ”不进入当前 Task 16.21；只有新的语义主指标先证明有区分度后
  才恢复，且不得改变 primary success。

#### Task 8.11.3：Differential Fixture 与 v2 Audit

- [x] 每个 development criterion 至少提供 canonical-valid、alternative-valid 与
  invalid-control；task 分支必须独立覆盖。
- [x] Alternative-valid 覆盖自由 method 名称、不同合法 schedule、中英文报告和 key/row
  顺序、八种组合；invalid-control 覆盖 cluster 拆分、unit 缺失/重复、非法 arm、
  stratum/sequential 失衡、重复/非法 evidence block、错误 limitationFlags 和 report
  evidence 冲突。
- [x] 增加 reverse-evidence 和 gold-isolation 测试：移除公开证据后约束消失或变为
  `unconfirmed`，evaluator expected、held-out、历史模型正文和 package answer 不可达。
- [x] 生成新的 v2 audit manifest/report；任何 alternative-valid 被拒、invalid-control
  被接受或 source anchor 漂移都 fail closed。
- [x] audit 通过前 corpus 保持非主实验状态，不创建付费 lock。

#### Task 8.11.4：Calibration、IR 与 Artifact Development

- [x] v2 已在书面评审后冻结 `no-skill | original` development calibration lock，并完成
  dry-run、resource/route qualification 与两轮唯一付费批次；两轮均 8/8 rows、0 infrastructure。
- **门禁阻断：** normal 与 harder development baseline 均为 no-skill/original 4/4、mean 1.0、
  0 differing pair，因此未构造 source-audited base IR，也未冻结四臂 development lock。
- **失败处置已执行：** 不补跑、不调旧 scorer、不进入 held-out；下一步由 Task 16.21 重新定义
  skill-unique 语义测量面。

#### Task 8.11.5：Held-out、Wave B 与摊销

- [x] 实现 held-out 隔离负向测试：development audit/lock/compiler/package/scorer
  不得消费 held-out ID、path、digest、fixture 或 sentinel。
- **阻断中的 held-out 工作：** 只有 Task 16.21 的新 development gate 通过后，才另建 held-out
  lock 并验证 freeze、parent gate、package/scorer digest 与 fail-closed 回流隔离。
- **未来 Wave B：** Wave A 方法冻结后，以 `api-tester` 为首个跨 skill 复用对象；通用 core
  不得新增 skill-id 分支，并报告 adapter LOC、artifact kind 复用率、core branch delta 和 failure
  taxonomy。
- **未来摊销实验：** 质量不回归后再按 `N=1,2,5,10` 报告 compile/profile/package/runtime
  总成本和 break-even；当前没有同口径数据，不声称 token reduction。

Task 8.11A 的文件级 TDD 计划见下一节。当前冻结顺序为：

```text
2+2 task creation
-> task-split freeze
-> v2 public contract + scorer differential tests
-> development-only v2 audit
-> held-out freeze
-> baseline calibration
-> base IR / artifact development
-> held-out
-> Wave B replication
-> repeated-call amortization
```

## 14. Task 8.11A Experimental-design v2 Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一个不消费 held-out、通过公开合同 differential audit 的
`experimental-design-v2` 本地 benchmark；本阶段不调用 API、不注册主 corpus、不构造
base IR 或 artifact。

**Architecture:** v2 使用独立目录和 evaluator ID。共享 domain 模块只负责解析公开
study/contract/plan/allocation/report 并计算五项语义结果；evaluator bridge 只处理安全
workdir I/O 和框架返回值。Task split 在 scorer 前冻结，scorer 与 development-only audit
完成后再冻结 held-out identity。`public task/source + source audit + public contract`
属于 scorer/audit 的输入前置，不是额外 promotion gate。Spec §24.5 中该箭头表示
task-split freeze 后的 readiness 验证：文件在 Task 14.2 一次性创建，在 Task 14.3
随 split 冻结，不会在 freeze 后另造一套合同或增加一次通过门槛。

**Tech Stack:** Bun、TypeScript、Zod、`yaml` 的 strict JSON duplicate-key 检查、现有
custom evaluator registry、`skill-ir-benchmark-contract-audit/v1`、SHA-256 provenance。

### 14.1 文件结构

```text
benchmarks/skill-ir/pilots/experimental-design/v2/
  public-contract.json
  public-contract-source-audit.json
  development/tasks.json
  heldout/tasks.json
  task-split-freeze.json
  benchmark-contract-audit.json
  audit-fixtures/
  heldout-freeze.json

src/benchmarks/skill-ir/
  experimental-design-v2-contract.ts
  experimental-design-v2-contract.test.ts
  experimental-design-v2-task-freeze.ts
  experimental-design-v2-task-freeze.test.ts
  experimental-design-v2-task-freeze-run.ts
  experimental-design-v2-audit.test.ts
  experimental-design-v2-heldout-freeze.ts
  experimental-design-v2-heldout-freeze.test.ts
  experimental-design-v2-heldout-freeze-run.ts

src/bench/evaluators/
  experimental-design-grade-v2.ts
  experimental-design-grade-v2.test.ts
  index.ts

results/skill-ir/benchmark-contract-audit/
  experimental-design-v2.json
```

职责边界：

- `experimental-design-v2-contract.ts`：纯语义、无 registry/corpus/package/held-out I/O。
- `experimental-design-grade-v2.ts`：安全读 workdir，调用纯语义函数，注册
  `skill-ir-experimental-design-v2`。
- `*-task-freeze.ts`：绑定 2+2 task、公开合同、source audit 和 v1 immutable refs。
- `*-heldout-freeze.ts`：绑定 task split、scorer、passed audit 和 held-out sentinel。
- v2 audit 继续复用通用 audit engine，不给通用 engine 增加 skill-specific 分支。

### Task 14.2：公开合同、2+2 Task 与八组合语义

**Files:**

- Create: `src/benchmarks/skill-ir/experimental-design-v2-contract.ts`
- Create: `src/benchmarks/skill-ir/experimental-design-v2-contract.test.ts`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/public-contract.json`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/public-contract-source-audit.json`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/development/tasks.json`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/heldout/tasks.json`

- [x] **Step 1: 写八组合和 schema 拒绝的 RED tests**

测试矩阵固定为：

```ts
const supportedCases = [
  ["individual", false, false],
  ["individual", true, false],
  ["individual", false, true],
  ["individual", true, true],
  ["cluster", false, false],
  ["cluster", true, false],
  ["cluster", false, true],
  ["cluster", true, true],
] as const
```

每个 case 构造合法 `study` 与至少两个不同但合法的 allocation，断言二者均通过且不要求
相同行顺序。另写失败用例：重复/空 unit ID、少于两个或重复 arms、部分 unit 缺 stratum、
非布尔 sequential、cluster unit 下显式嵌套 `members`/`memberAssignments` 等成员级
assignment 结构、重复/断档/与 unit 不一致的 `order`、无 strata 的全局失衡。
`assignmentUnit` 保持非空自由文本，不按标签词汇或翻译做隐藏分类；CSV 物理行可以
重排，但每行 `order` 必须绑定该 unit 在 `study.units` 中的 1-based 位置。

- [x] **Step 2: 运行 contract test 并确认 RED**

```powershell
bun test ./src/benchmarks/skill-ir/experimental-design-v2-contract.test.ts
```

Expected: FAIL，原因是 `experimental-design-v2-contract.ts` 或导出尚不存在。

- [x] **Step 3: 实现共享 public contract 类型和派生 API**

导出接口固定为：

```ts
export type ExperimentalDesignV2Study =
  z.infer<typeof ExperimentalDesignV2StudySchema>

export type ExperimentalDesignV2AllocationRow = {
  order: number
  unitId: string
  stratum: string
  arm: string
}

export type ExperimentalDesignV2Properties = {
  preservesAssignmentUnits: boolean
  balancesGlobally: boolean
  balancesWithinStrata: boolean
  supportsSequentialEnrollment: boolean
}

export type ExperimentalDesignV2AllocationAssessment = {
  coverageValid: boolean
  armsValid: boolean
  strataValid: boolean
  sequentialValid: boolean
  properties: ExperimentalDesignV2Properties
}

export function parseExperimentalDesignV2Study(value: unknown):
  ExperimentalDesignV2Study

export function parseExperimentalDesignV2AllocationCsv(text: string):
  ExperimentalDesignV2AllocationRow[]

export function assessExperimentalDesignV2Allocation(
  study: ExperimentalDesignV2Study,
  rows: ExperimentalDesignV2AllocationRow[],
): ExperimentalDesignV2AllocationAssessment

export function deriveExperimentalDesignV2LimitationFlags(
  study: ExperimentalDesignV2Study,
): string[]

export const ExperimentalDesignV2PublicContractSourceAuditSchema:
  z.ZodType<{
    schemaVersion:
      "skill-ir-experimental-design-v2-public-contract-source-audit/v1"
    contractId: "experimental-design-public-contract-v2"
    entries: Array<{
      claimId: string
      source: { path: string; sha256: string }
      quote: string
    }>
  }>
```

顺序固定为 assignment-unit validation → stratum partition → per-partition sequential block
或 final balance → global diagnostics。Strata 存在时不把全局失衡作为主失败，只如实写入
`balancesGlobally`。

- [x] **Step 4: 编写公开合同和 source audit**

`public-contract.json` 必须公开：

```json
{
  "contractId": "experimental-design-public-contract-v2",
  "protectedInputs": ["study.json", "design-contract.json"],
  "outputs": [
    "design/design-plan.json",
    "design/allocation.csv",
    "design/design-report.md"
  ],
  "passThreshold": 0.95,
  "criterionWeights": {
    "design-input-integrity": 0.1,
    "design-artifact-contract": 0.1,
    "design-semantics": 0.25,
    "design-allocation-safety": 0.35,
    "design-report-consistency": 0.2
  },
  "designPropertyKeys": [
    "preservesAssignmentUnits",
    "balancesGlobally",
    "balancesWithinStrata",
    "supportsSequentialEnrollment"
  ],
  "reportEvidenceOpening": "```json design-evidence",
  "reportEvidenceClosing": "```"
}
```

`public-contract-source-audit.json` 逐项绑定已有 source closure path/digest/quote。它只证明
public contract 的来源，随 task split 一起验证，不新增 promotion gate。Validator 必须
确认 source digest、quote substring、claim ID 唯一，并覆盖 public contract 声明的全部
`sourceClaimIds`。

- [x] **Step 5: 编写分离的 2+2 task**

固定身份：

```text
development:
  experimental-design-v2-stratified-dev-001
  experimental-design-v2-cluster-sequential-dev-002
held-out:
  experimental-design-v2-stratified-sequential-heldout-001
  experimental-design-v2-cluster-stratified-heldout-002
```

每个 task 的 fixtures 包含 `study.json` 和与 `public-contract.json` 语义相同的
`design-contract.json`；prompt 只要求读取公开合同并生成三项输出。五项 criterion
权重固定为 `0.10/0.10/0.25/0.35/0.20`，`hardGateIds` 包含五项 criterion，其中
report evaluator 仅在事实冲突时返回 `pass=false`；`passThreshold=0.95`。

- [x] **Step 6: 运行 contract test 并确认 GREEN**

```powershell
bun test ./src/benchmarks/skill-ir/experimental-design-v2-contract.test.ts
```

Expected: 八组合、非法 schema、两份 task 身份与公开合同一致性全部 PASS。

- [x] **Step 7: 提交 task creation**

```powershell
git add src/benchmarks/skill-ir/experimental-design-v2-contract.ts `
  src/benchmarks/skill-ir/experimental-design-v2-contract.test.ts `
  benchmarks/skill-ir/pilots/experimental-design/v2
git commit -m "test: author experimental design v2 contract"
```

该提交 hash 作为下一任务 `taskCommit`，此后 2+2 task 内容不得原地修改。

### Task 14.3：Task-split Freeze 与 v1 Immutability

**Files:**

- Create: `src/benchmarks/skill-ir/experimental-design-v2-task-freeze.ts`
- Create: `src/benchmarks/skill-ir/experimental-design-v2-task-freeze.test.ts`
- Create: `src/benchmarks/skill-ir/experimental-design-v2-task-freeze-run.ts`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/task-split-freeze.json`

- [x] **Step 1: 写 freeze RED tests**

必须覆盖：

```text
accept exact 2+2 split + public contract/source audit
reject task/public-contract/source-audit digest drift
reject development/held-out ID overlap or split mismatch
reject fixture projection drift
reject taskCommit not containing the frozen task bytes
reject any change to frozen v1 task/scorer/audit/lock/package/report
reject task prompt/eval containing evaluator expected or held-out feedback
```

- [x] **Step 2: 运行 freeze test 并确认 RED**

```powershell
bun test ./src/benchmarks/skill-ir/experimental-design-v2-task-freeze.test.ts
```

Expected: FAIL，原因是 freeze schema/validator 尚不存在。

- [x] **Step 3: 实现 freeze API**

```ts
export const ExperimentalDesignV2FrozenFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict()

export const ExperimentalDesignV2FrozenTaskSetSchema =
  ExperimentalDesignV2FrozenFileSchema.extend({
    split: z.enum(["development", "heldout"]),
    taskIds: z.array(z.string().min(1)).length(2),
  }).strict()

export const ExperimentalDesignV2TaskSplitFreezeSchema = z.object({
  schemaVersion: z.literal(
    "skill-ir-experimental-design-v2-task-split-freeze/v1",
  ),
  benchmarkId: z.literal("experimental-design-v2"),
  taskCommit: z.string().regex(/^[a-f0-9]{40}$/),
  publicContract: ExperimentalDesignV2FrozenFileSchema,
  publicContractSourceAudit: ExperimentalDesignV2FrozenFileSchema,
  developmentTasks: ExperimentalDesignV2FrozenTaskSetSchema,
  heldoutTasks: ExperimentalDesignV2FrozenTaskSetSchema,
  fixtureProjectionSha256: Sha256Schema,
  sourceClosure: z.array(ExperimentalDesignV2FrozenFileSchema).min(1),
  frozenV1: z.array(ExperimentalDesignV2FrozenFileSchema).length(6),
  heldoutSentinel: z.string().regex(
    /^TEST_ONLY_HELDOUT_V2_[A-Z0-9_]+$/,
  ),
}).strict()

export async function createExperimentalDesignV2TaskSplitFreeze(
  rootDir: string,
  taskCommit: string,
): Promise<ExperimentalDesignV2TaskSplitFreeze>

export async function verifyExperimentalDesignV2TaskSplitFreeze(
  rootDir: string,
  value: unknown,
): Promise<ExperimentalDesignV2TaskSplitFreeze>
```

`fixtureProjectionSha256` 使用按 task ID、fixture path 排序后的 UTF-8 bytes 计算；validator
对每个冻结文件执行等价于 `git show "$taskCommit:$relativePath"` 的读取，验证 task
creation commit 中的原始 bytes，且所有 resolved path 必须留在 repo root。
该 validator 不得只调用 source-audit shape schema；必须在生产路径复核每个
source digest、quote substring、claim ID 唯一性和 `publicContract.sourceClaimIds` 全覆盖。

`heldoutSentinel` 在 task split 冻结时生成，只用于证明 development scorer/audit 没有
消费 held-out；它不是任务答案，也不得进入 task prompt、public contract、scorer、
audit manifest 或 compact report。后续 held-out freeze 必须逐字复用同一 sentinel，
不得重新生成。

`frozenV1` 必须精确包含以下六项，不能用目录摘要替代：

```text
benchmarks/skill-ir/pilots/experimental-design/tasks.json
src/bench/evaluators/experimental-design-grade.ts
benchmarks/skill-ir/pilots/experimental-design/benchmark-contract-audit.json
benchmarks/skill-ir/pilots/experimental-design/experimental-design-baseline-calibration-lock.json
benchmarks/skill-ir/pilots/experimental-design/packages/validated-skill-artifact-v1/package-manifest.json
results/skill-ir/benchmark-contract-audit/experimental-design.json
```

- [x] **Step 4: 实现 CLI 并生成 freeze**

```powershell
$taskSplitCommit = git rev-parse HEAD
bun ./src/benchmarks/skill-ir/experimental-design-v2-task-freeze-run.ts `
  --task-commit=$taskSplitCommit `
  --out=benchmarks/skill-ir/pilots/experimental-design/v2/task-split-freeze.json
```

CLI 只允许 `--task-commit`、`--out`、`--verify-only`。`--verify-only` 不改文件。

- [x] **Step 5: 运行 freeze test 与 verify-only**

```powershell
bun test ./src/benchmarks/skill-ir/experimental-design-v2-task-freeze.test.ts
bun ./src/benchmarks/skill-ir/experimental-design-v2-task-freeze-run.ts `
  --verify-only=benchmarks/skill-ir/pilots/experimental-design/v2/task-split-freeze.json
```

Expected: PASS；v1 frozen refs 和 2+2 digest 全部一致。

- [x] **Step 6: 提交 task-split freeze**

```powershell
git add src/benchmarks/skill-ir/experimental-design-v2-task-freeze.ts `
  src/benchmarks/skill-ir/experimental-design-v2-task-freeze.test.ts `
  src/benchmarks/skill-ir/experimental-design-v2-task-freeze-run.ts `
  benchmarks/skill-ir/pilots/experimental-design/v2/task-split-freeze.json
git commit -m "feat: freeze experimental design v2 task split"
```

Scorer 实现只能从该提交之后开始。

### Task 14.4：v2 语义 Scorer 与 Registry

**Files:**

- Create: `src/bench/evaluators/experimental-design-grade-v2.ts`
- Create: `src/bench/evaluators/experimental-design-grade-v2.test.ts`
- Modify: `src/bench/evaluators/index.ts`

- [x] **Step 1: 写 evaluator RED tests**

五个 checks 固定为：

```ts
type ExperimentalDesignV2Check =
  | "input-integrity"
  | "artifact-contract"
  | "design-semantics"
  | "allocation-safety"
  | "report-consistency"
```

Tests 必须验证：

- alternative method 名称、合法不同行顺序、中英文正文和额外 JSON fields 通过；
- plan `designProperties` 缺失/漂移使 `design-semantics` fail；
- allocation 覆盖、arm、strata、sequential 或 cluster 失败使 allocation fail；
- report block 缺失/多个/非法/重复 key 时 `pass=true, score=0`；
- report 与派生属性或 `limitationFlags` 冲突时 `pass=false`；
- 报告四个原子检查为 `0/0.25/0.5/0.75/1`；
- 路径逃逸、symlink/junction 和 unreadable workdir 只记 infrastructure。

- [x] **Step 2: 运行 evaluator test 并确认 RED**

```powershell
bun test ./src/bench/evaluators/experimental-design-grade-v2.test.ts
```

Expected: FAIL，原因是 v2 evaluator 尚不存在/未注册。

- [x] **Step 3: 实现 evaluator bridge**

Payload 固定为：

```ts
const PayloadSchema = z.object({
  schemaVersion: z.literal("skill-ir-experimental-design-eval/v2"),
  check: z.enum([
    "input-integrity",
    "artifact-contract",
    "design-semantics",
    "allocation-safety",
    "report-consistency",
  ]),
  paths: z.object({
    study: SafeRelativePathSchema,
    contract: SafeRelativePathSchema,
    plan: SafeRelativePathSchema,
    allocation: SafeRelativePathSchema,
    report: SafeRelativePathSchema,
  }).strict(),
  protectedSha256: z.object({
    study: Sha256Schema,
    contract: Sha256Schema,
  }).strict(),
}).strict()
```

严格 JSON 先用 `JSON.parse` 拒绝 JSON 以外语法，再用
`parseDocument(text, { schema: "json", uniqueKeys: true })` 拒绝重复 key。Evaluator
只读取 payload 指向的 workdir 文件并调用共享 contract API；不得 import corpus registry、
task registry、package、freeze 或 result 模块。

- [x] **Step 4: 注册独立 evaluator ID**

在 `src/bench/evaluators/index.ts` 增加：

```ts
import "./experimental-design-grade-v2.ts"
```

并增加 registry path/digest：

```ts
[
  "skill-ir-experimental-design-v2",
  "src/bench/evaluators/experimental-design-grade-v2.ts",
]
```

使用 `Get-FileHash -Algorithm SHA256` 写入最终 source digest；不得改 v1 evaluator 的
path/digest。

- [x] **Step 5: 运行 evaluator、scoring 与 registry tests**

```powershell
bun test ./src/bench/evaluators/experimental-design-grade-v2.test.ts `
  ./src/benchmarks/skill-ir/scoring.test.ts `
  ./src/benchmarks/skill-ir/benchmark-contract-audit-run.test.ts
```

Expected: PASS；五项权重经现有 scorer 聚合为 `primarySemanticScore`，hard gate 和
`0.95` threshold 生效。当前通用 row 字段仍为 `evaluatorScore`；对 v2 它就是
`primarySemanticScore`，本阶段不改通用 row schema。`deterministicProfileScore` 只有
artifact 存在后才可计算，8.11A 不生成伪值。

- [x] **Step 6: 提交 scorer**

```powershell
git add src/bench/evaluators/experimental-design-grade-v2.ts `
  src/bench/evaluators/experimental-design-grade-v2.test.ts `
  src/bench/evaluators/index.ts
git commit -m "feat: add experimental design v2 semantic scorer"
```

### Task 14.5：Differential Fixtures 与 Development-only Audit

**Files:**

- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures/canonical-complete/`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures/alt-individual-plain/`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures/alt-individual-strata/`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures/alt-individual-sequential/`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures/alt-individual-strata-sequential/`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures/alt-cluster-plain/`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures/alt-cluster-strata/`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures/alt-cluster-sequential/`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures/alt-cluster-strata-sequential/`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures/alt-report-chinese/`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures/invalid-protected-input/`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures/invalid-missing-artifact/`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures/invalid-unit-coverage/`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures/invalid-arm/`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures/invalid-cluster-split/`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures/invalid-stratum-balance/`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures/invalid-sequential-block/`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures/invalid-plan-properties/`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures/invalid-report-block/`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures/invalid-limitation-flags/`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures/invalid-report-contradiction/`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/benchmark-contract-audit.json`
- Create: `src/benchmarks/skill-ir/experimental-design-v2-audit-fixtures.ts`
- Create: `src/benchmarks/skill-ir/experimental-design-v2-audit.test.ts`
- Create: `results/skill-ir/benchmark-contract-audit/experimental-design-v2.json`

- [x] **Step 1: 写 audit RED test**

Test 必须断言：

```ts
expect(manifest.scope.split).toBe("development")
expect(manifest.scope.taskIds).toEqual([
  "experimental-design-v2-stratified-dev-001",
  "experimental-design-v2-cluster-sequential-dev-002",
])
expect(report.status).toBe("passed")
expect(serialized).not.toContain("experimental-design-v2-stratified-sequential-heldout-001")
expect(serialized).not.toContain("experimental-design-v2-cluster-stratified-heldout-002")
expect(serialized).not.toContain(taskSplitFreeze.heldoutSentinel)
```

同时读取 v2 scorer source，断言其 dependency boundary 不包含 corpus/task registry、
heldout freeze、compiler、package 或 result import。

- [x] **Step 2: 运行 audit test 并确认 RED**

```powershell
bun test ./src/benchmarks/skill-ir/experimental-design-v2-audit.test.ts
```

Expected: FAIL，原因是 v2 audit manifest/fixtures/report 尚不存在。

- [x] **Step 3: 创建 canary fixture 矩阵**

至少包含：

```text
canonical-valid:
  input/artifacts/plan/allocation/report
alternative-valid:
  all 8 assignment×strata×sequential combinations
  free method names
  alternative legal row/key order
  Chinese and English report prose
  arbitrary unscored warnings
invalid-control:
  protected input drift
  missing artifact
  duplicate/missing unit
  invalid arm
  cluster split/member-level assignment
  mixed/missing stratum
  stratum imbalance
  sequential block imbalance
  plan property mismatch
  missing/multiple/invalid/duplicate-key evidence block
  wrong limitationFlags
  report factual contradiction
```

每个 semantic/safety requirement 对两个 development task 分支均有 audit canary；八组合
可以绑定任一 development criterion，但不引用 held-out task ID。

除 `invalid-missing-artifact` 外，每个 fixture 目录固定包含：

```text
study.json
design-contract.json
design/design-plan.json
design/allocation.csv
design/design-report.md
```

`invalid-missing-artifact` 只故意省略 `design/design-report.md`。Fixture 不使用 symlink、
junction、绝对路径或运行时生成文件。矩阵由
`experimental-design-v2-audit-fixtures.ts` 确定性生成；绑定 input-integrity 的 canonical
fixture 逐字复用冻结 task 中的 protected input bytes，其他 alternative fixture 只改变
公开合同允许变化的产物或 study 组合。

- [x] **Step 4: 编写 v2 audit manifest**

Manifest 使用现有 `skill-ir-benchmark-contract-audit/v1`，只绑定 development task file、
v2 scorer 和公开 source/contract evidence。Requirements 不得出现 evaluator expected、
held-out path/digest、v1 model output 或 package answer。

通用 audit schema 增加 `partial-control + expectedScore`，用于区分“evaluator 接受该输出”
与“criterion 满分”。该扩展只比较公开 scorer 返回的部分分数，不增加 skill-specific 分支；
`partial-control` 必须满足 `expectedPass=true` 且 `expectedScore<1`。

- [x] **Step 5: 运行 audit 并持久化 compact report**

```powershell
bun ./src/benchmarks/skill-ir/benchmark-contract-audit-run.ts `
  --manifest=benchmarks/skill-ir/pilots/experimental-design/v2/benchmark-contract-audit.json `
  --out=results/skill-ir/benchmark-contract-audit/experimental-design-v2.json
```

Expected: exit 0、`status=passed`，所有 canonical/alternative/invalid canary outcome
matched；report 不含 fixture payload、held-out 或模型正文。

- [x] **Step 6: 运行 audit tests**

```powershell
bun test ./src/benchmarks/skill-ir/experimental-design-v2-audit.test.ts `
  ./src/benchmarks/skill-ir/benchmark-contract-audit.test.ts `
  ./src/benchmarks/skill-ir/benchmark-contract-audit-run.test.ts `
  ./src/benchmarks/skill-ir/benchmark-contract-audit-pilots.test.ts
```

Expected: v2 passed；三个 v1 pilot 仍保持原冻结 failed 结果。

- [x] **Step 7: 提交 audit**

```powershell
git add benchmarks/skill-ir/pilots/experimental-design/v2/audit-fixtures `
  benchmarks/skill-ir/pilots/experimental-design/v2/benchmark-contract-audit.json `
  src/benchmarks/skill-ir/experimental-design-v2-audit.test.ts `
  results/skill-ir/benchmark-contract-audit/experimental-design-v2.json
git commit -m "test: audit experimental design v2 benchmark"
```

该提交 hash 作为 held-out freeze 的 `inputsCommit`。

### Task 14.6：Held-out Freeze 与非消费隔离

**Files:**

- Create: `src/benchmarks/skill-ir/experimental-design-v2-heldout-freeze.ts`
- Create: `src/benchmarks/skill-ir/experimental-design-v2-heldout-freeze.test.ts`
- Create: `src/benchmarks/skill-ir/experimental-design-v2-heldout-freeze-run.ts`
- Create: `benchmarks/skill-ir/pilots/experimental-design/v2/heldout-freeze.json`

- [x] **Step 1: 写 held-out isolation RED tests**

覆盖：

```text
accept exact task-split + scorer + passed audit + inputsCommit
reject held-out task/fixture/scorer/audit digest drift
reject audit report status != passed
reject audit manifest/canaries containing held-out IDs/path/digest/sentinel
reject scorer source/registry identity drift
reject development lock/compiler/package/feedback-shaped sink containing held-out refs
reject inputsCommit not containing the bound scorer/audit bytes
```

- [x] **Step 2: 运行 held-out freeze test 并确认 RED**

```powershell
bun test ./src/benchmarks/skill-ir/experimental-design-v2-heldout-freeze.test.ts
```

Expected: FAIL，原因是 held-out freeze module 尚不存在。

- [x] **Step 3: 实现 held-out freeze API**

```ts
import {
  ExperimentalDesignV2FrozenFileSchema,
  ExperimentalDesignV2TaskSplitFreezeSchema,
} from "./experimental-design-v2-task-freeze"

export const ExperimentalDesignV2HeldoutFreezeSchema = z.object({
  schemaVersion: z.literal(
    "skill-ir-experimental-design-v2-heldout-freeze/v1",
  ),
  benchmarkId: z.literal("experimental-design-v2"),
  inputsCommit: z.string().regex(/^[a-f0-9]{40}$/),
  taskSplitFreeze: ExperimentalDesignV2FrozenFileSchema,
  heldoutTasks: ExperimentalDesignV2FrozenFileSchema,
  scorer: ExperimentalDesignV2FrozenFileSchema.extend({
    evaluatorId: z.literal("skill-ir-experimental-design-v2"),
  }).strict(),
  auditManifest: ExperimentalDesignV2FrozenFileSchema,
  auditReport: ExperimentalDesignV2FrozenFileSchema,
  heldoutSentinel: z.string().regex(/^TEST_ONLY_HELDOUT_V2_[A-Z0-9_]+$/),
}).strict()

export async function createExperimentalDesignV2HeldoutFreeze(
  rootDir: string,
  inputsCommit: string,
): Promise<ExperimentalDesignV2HeldoutFreeze>

export async function verifyExperimentalDesignV2HeldoutFreeze(
  rootDir: string,
  value: unknown,
): Promise<ExperimentalDesignV2HeldoutFreeze>

export function assertNoExperimentalDesignV2HeldoutEvidence(
  sinkName: "development-lock" | "compiler" | "package" | "feedback",
  value: unknown,
  freeze: ExperimentalDesignV2HeldoutFreeze,
): void
```

Verifier 递归扫描 development task、audit manifest/report、scorer source 和 registry
serialization，禁止出现 held-out task IDs、held-out file/fixture digest 或 sentinel。
`heldoutSentinel` 必须等于 `ExperimentalDesignV2TaskSplitFreezeSchema` 中已冻结的值；
freeze 创建器只复制，不生成新值。
该 API 不接受 raw/scored/profile/compiler/package 输入类型。

- [x] **Step 4: 生成并 verify held-out freeze**

```powershell
$auditInputsCommit = git rev-parse HEAD
bun ./src/benchmarks/skill-ir/experimental-design-v2-heldout-freeze-run.ts `
  --inputs-commit=$auditInputsCommit `
  --out=benchmarks/skill-ir/pilots/experimental-design/v2/heldout-freeze.json
bun ./src/benchmarks/skill-ir/experimental-design-v2-heldout-freeze-run.ts `
  --verify-only=benchmarks/skill-ir/pilots/experimental-design/v2/heldout-freeze.json
```

Expected: PASS；held-out 内容已冻结但没有被 development 路径消费。

- [x] **Step 5: 提交 held-out freeze**

```powershell
git add src/benchmarks/skill-ir/experimental-design-v2-heldout-freeze.ts `
  src/benchmarks/skill-ir/experimental-design-v2-heldout-freeze.test.ts `
  src/benchmarks/skill-ir/experimental-design-v2-heldout-freeze-run.ts `
  benchmarks/skill-ir/pilots/experimental-design/v2/heldout-freeze.json
git commit -m "feat: freeze experimental design v2 heldout identity"
```

本提交只解除“可起草 baseline calibration lock”的阻塞，不允许直接执行 API。

### Task 14.7：阶段文档、验证与证据边界

**Files:**

- Modify: `docs/skill-ir/skill-ir-aot-optimization-spec.md`
- Modify: `docs/skill-ir/skill-ir-aot-optimization-plan.md`
- Modify: `docs/skill-ir/evaluation-system.md`
- Modify: `docs/skill-ir/real-skill-pilots.md`
- Modify: `docs/skill-ir/experiment-results.md`
- Modify: `D:\skill优化\conversation_log.md`

- [x] **Step 1: 更新阶段状态**

只允许写：

```text
v2 task split frozen
v2 local semantic scorer implemented
v2 development-only benchmark contract audit passed/failed
v2 held-out identity frozen if and only if audit passed
no API run, no baseline result, no IR/artifact result, no cross-skill claim
```

Task 8.11.1–8.11.3 按实际证据勾选；8.11.4–8.11.5 的 API/IR/artifact/held-out/Wave B
条目保持未完成。

- [x] **Step 2: 运行 focused verification**

```powershell
bun test ./src/bench/evaluators/experimental-design-grade-v2.test.ts `
  ./src/benchmarks/skill-ir/experimental-design-v2-contract.test.ts `
  ./src/benchmarks/skill-ir/experimental-design-v2-task-freeze.test.ts `
  ./src/benchmarks/skill-ir/experimental-design-v2-audit.test.ts `
  ./src/benchmarks/skill-ir/experimental-design-v2-heldout-freeze.test.ts `
  ./src/benchmarks/skill-ir/benchmark-contract-audit.test.ts `
  ./src/benchmarks/skill-ir/benchmark-contract-audit-run.test.ts `
  ./src/benchmarks/skill-ir/benchmark-contract-audit-pilots.test.ts
bunx tsc --noEmit
```

Expected: 0 fail；三个 v1 audit 继续 failed-as-expected，v2 audit 与 freeze tests 按新
身份通过。

- [x] **Step 3: 运行文档、secret、digest 与 diff 检查**

```powershell
python scripts/check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py --root .
rg -n "sk-[A-Za-z0-9_-]{16,}|SKVM_XTY_API_KEY\\s*[:=]\\s*[^A-Z_]" `
  src benchmarks docs results
git diff --check
```

Expected: 文档 0 broken/legacy、secret scan 无命中、所有 freeze/audit digest verify-only
通过、diff check 退出 0。

- [x] **Step 4: 提交并推送阶段结果**

```powershell
git add docs/skill-ir
git commit -m "docs: record experimental design v2 contract audit"
git push origin skill-ir-aot
```

不得暂存 `docs/skill-ir/1.md` 或既有未跟踪 `results/skill-ir/*`；只添加本计划明确列出的
compact v2 report。

## 15. Experimental-design v3 历史诊断

v3 曾用 root 精确白名单修复 v2 漏检，并完成 46/46 本地 canary 与一次 8-row calibration。
真实 runner 审计发现 original 在 agent 前获得 source closure，而 scorer 将其误判为模型新增输出；
因此机械 gate 虽通过，研究晋升被否决。该批次只保留为 materialization contamination 历史
诊断，不作为活跃 benchmark、模型比较、skill 增益或后续 expected 来源。

## 16. Task 8.13 Experimental-design v2 合并修订

### Task 16.1：设计收敛与历史边界

- [x] Spec/plan 固定 v2 为唯一活跃下一代 benchmark，采用 `contractRevision=materialized-delta/v1`。
- [x] 固定 v3 只保留单份失效诊断；当前树删除其 evaluator/corpus/task/freeze/audit/lock 入口。
- [x] 固定 v1 历史不变；旧 v2/v3 演进由 Git 和历史摘要保留，不继续复制版本目录。

### Task 16.2：通用 Initial-workdir Manifest

- [x] RED：拒绝 manifest 位于 workdir 内、摘要漂移、绝对/逃逸路径、duplicate path、
  symlink/junction/reparse/special entry 和未排序记录。
- [x] GREEN：抽取 production `prepareRunWorkspace`；复制 task fixture 与可选 skill resources 后、
  agent setup 前生成 `skvm-initial-workdir-manifest/v1`，写到 run 目录并返回 digest reference。
- [x] GREEN：CLI、plan、raw row、scoring `RunResult` 端到端携带 manifest path/digest；agent prompt
  与 workdir 均不可见 manifest 内容。

### Task 16.3：v2 Final-delta Scorer 与 Oracle

- [x] RED：两臂各自合法 initial resources 不算额外输出；initial 修改/删除、额外文件/目录、
  output 缺失/损坏、reparse entry 分别失败。
- [x] GREEN：v2 artifact criterion 按 initial/final delta 判断；三个 output 必须新增，initial
  entry 必须保持，其他新增拒绝。
- [x] 将 v3 hard-coded reference vectors、row reorder、arm 双射、自由 method 和 invalid controls
  合入 v2 oracle test，不调用生产 assessor 生成 expected。

### Task 16.4：无模型 Materialization Audit

- [x] 使用与 `executeRun` 相同的 workspace preparation 生成 no-skill/original initial manifest；
  验证 original source closure 摘要和 no-skill 隔离。
- [x] 固定 compact report schema；空 agent 只允许 missing-output，合法三输出 delta 通过，资源被
  误判为 extra 时 fail closed。
- [x] 将 materialization audit 加入 pre-IR lock/runner 的 route 前置条件和 digest guard。

### Task 16.5：重建 v2 身份并退役 v3

- [x] 更新 v2 public contract/tasks/evaluator payload、task-split freeze、development audit、
  held-out freeze 和 pre-IR calibration lock；保留 2+2 split 与既有语义权重/阈值。
- [x] `pilot.json` 只保留一个 `experimental-design-v2` tasks-authored 条目；registry 只注册 v2。
- [x] 删除当前树中的 v3 重复实现与 compact active evidence，将付费批次压缩为单份历史
  invalid-calibration report；不删除本地未跟踪 raw/workdir。

### Task 16.6：实验与收口

- [x] 运行 v2 contract/oracle/differential/materialization audit、freeze verify-only、完整 Skill IR
  tests、typecheck、文档链接、secret scan 和 `git diff --check`。v2 focused 为 102/102；完整
  Skill IR 为 555 pass / 4 skip / 8 fail，修正 Wave A 预期后剩余失败是 initial-workdir 演进使
  历史 Law execution freeze 摘要 fail closed，旧 lock 不改写。
- [x] 在新 v2 lock、materialization audit 与 route probe 均通过后执行唯一 8-row 强模型
  calibration；权威 gate 因 3 个 Bun infrastructure crash 失败，仅 1/4 pair 可比较。冻结该批次，
  不补跑、不调 v2 scorer、不运行 held-out。
- [x] 更新组件文档、compact results 与 conversation log，分阶段提交且不暂存既有 untracked
  raw/result 或 `docs/skill-ir/1.md`。

后续运行时恢复顺序：

```text
freeze failed v2 batch
-> qualify a stable SkVM execution runtime locally
-> preregister a new v2 calibration identity/lock with the runtime identity
-> route probe
-> complete 8-row rerun with zero infrastructure required
-> only then resume base IR audit
```

该步骤只替换并冻结 execution runtime，不修改 v2 task/public contract/evaluator/threshold，不创建
v3/v4 benchmark。若新批次仍出现 infrastructure failure，同样冻结并停止付费实验。

### Task 16.7：Stable execution runtime qualification

- [x] 冻结 `skill-ir-execution-runtime-qualification/v1`：编译产物绑定 source commit、Bun
  version、platform/arch 和 executable SHA-256；固定 20 次顺序 `--help` probe、零失败、零
  timeout、零 Bun crash signature。
- [x] RED/GREEN：资格报告拒绝失败计数、绝对路径、digest/commit/platform 漂移；新增
  runtime-qualified pre-IR lock，绑定 report 与 executable，但不改变 v2 task/scorer/threshold。
- [x] RED/GREEN：pre-IR plan 只对 runtime-qualified lock 将 `bun run skvm run` 投影为
  `<qualified executable> run`；普通 runner、v1/v2 lock 和历史 execution freeze 保持原行为。
- [x] 构建本机 `skvm.exe`，运行本地资格门禁并提交 compact report 与新 calibration lock；binary
  只作本地载体，不进 Git。
- [x] 新 identity 下执行 8-row dry-run 与 resource/route probe；resource 为 `ok`，正式 route
  在 56.79 秒后以 exit 3、`status=agent` 阻断。按预注册规则冻结且不补跑，完整 matrix 未执行。
- [x] 首个 compiled lock 的 route probe 因 binary 默认读取 `~/.skvm`、缺少 `xty/*` route 而在
  API 前失败；冻结该 preflight 结果。RED/GREEN 增加 lock-bound relative `cacheRoot`，pre-IR
  route/execute 显式传递 child env；最终 replacement lock 另绑定三份 parent orchestration 摘要。
- [x] 提交 compact preflight summary/failure audit 并同步权威文档和 conversation log。Route 未过，
  因而没有 raw/scored/gate；base IR audit 与 held-out 继续禁止。

### Task 16.8：Fetch-active runtime diagnosis and replacement

- [x] 用独立非方法 root-cause probe 复现同一 binary/task/model 路径：158.69 秒后 Bun 1.3.14
  Windows x64 standalone 在 `fetch(11)` 状态触发 internal assertion，exit 3，确认旧 route 的
  `unresolved-agent-or-runtime-exit` 属于 Bun runtime crash family。
- [x] RED/GREEN：新增 compact route diagnostic，使用封闭 failure code、runtime identity、byte
  count 和 raw digest；禁止 stdout/stderr 正文、命令、绝对路径、secret 和模型输出进入结果。
- [x] RED/GREEN：fetch-active runner 在返回失败前写独立 diagnostic/report；既有
  `skill-ir-pre-ir-route-probe-result/v1` 字节和语义保持不变。
- [x] 从 Bun 官方 release 下载候选 runtime 到 ignored 本地目录，记录版本/revision/二进制 SHA，
  不修改全局 Bun；用候选构建独立 `skvm.exe`。
- [x] 候选先通过 startup qualification，再执行一次预注册 fetch-active route；任一 crash/timeout/
  nonzero 均冻结并停止，不通过重复运行筛选成功样本。
- [x] 只有 fetch-active route exit 0、无 runtime failure 且产物完整，才建立新的 8-row v2
  calibration identity；否则不执行 matrix、scoring、gate、base IR 或 held-out。
- [x] 新矩阵完整 8 rows / 4 pairs，但两行 Bun 1.3.13 internal assertion；gate failed，冻结且不
  补跑，base IR/held-out 继续禁止。
- [x] 同步 compact evidence、spec/plan/组件文档/experiment results/conversation log，运行 focused
  tests、typecheck、文档链接、secret scan 和 `git diff --check`。

### Task 16.9：显式 Node HTTP Transport Qualification

- [x] 先写协议 RED tests：Node helper 只从 stdin 接收 URL/header/body，输出封闭
  status/header/body envelope；非零退出、非法 JSON、超时和过大响应 fail closed，stderr 不进入
  compact evidence。
- [x] OpenAI-compatible provider 新增显式 transport seam；默认仍使用现有 fetch，只有新 lock
  注入的 helper env 才使用 Node subprocess。API key 不进入 argv、文件或 compact report。
- [x] 新 execution lock 绑定 repository-local node executable locator/digest、helper source digest、
  compiled SkVM、startup/fetch qualification 和 parent orchestration；旧 lock 全部保持不可变。
- [x] 无模型协议测试通过后只运行一条预注册 fetch-active route；失败则冻结，不运行 8-row。
- [x] 只有 transport route 通过才建立新的 8-row identity；仍要求 0 infrastructure、0 retries，
  未过 gate 不进入 base IR 或 held-out。
- [x] Node HTTP 8-row matrix 完整执行，但两行仍触发相同 Bun internal assertion；gate 因 2 infra、
  no-skill comparable pair 饱和和 0 differing pair 失败。冻结结果，不补跑、不进入 base IR。

### Task 16.10：ASCII Bun Source Runtime Qualification

- [x] RED/GREEN：新增与 compiled v1 分离的 source-runtime guard/report schema，绑定 ASCII Bun
  executable、committed source entry、source commit、cache、Node helper 和 parent orchestration。
- [x] Command projection 只接受精确 workspace prefix，并改写为 `<bun> run <entry> run ...`；旧
  compiled lock/command 与历史 report 字节不改变。
- [x] 用固定 20 次 `--help` 做 startup qualification；通过后只运行一个新的预注册 fetch-active
  route。模型、task、scorer、transport helper 与超时保持不变。
- [x] Source candidate route 通过后建立独立 8-row identity；最终 identity 的 resource 为 `ok`，
  但 route 在 88.083 秒后 exit 3。虽然 3/3 公开输出已物化，pre-IR compact route 缺少 stream
  failure fingerprint，无法关闭归因。按预注册规则冻结，不执行矩阵、不补跑、不进入
  base IR/held-out。

### Task 16.11：Source Route Diagnostic Closure

- [x] RED/GREEN：让最终 pre-IR route 在 nonzero/timeout 前写 compact diagnostic，字段只允许封闭
  failure code、exit/status、runtime identity、stream byte count/digest 和公开输出计数；禁止正文、
  命令、绝对路径、环境值、secret 与模型文本。
- [x] 文件级 TDD 边界：先在 `pre-ir-calibration-run.test.ts` 写失败测试，覆盖 nonzero 分类、stream
  摘要脱敏、3/3 output、missing output fail-closed，以及最终 source lock 在 execute 前必须消费通过的
  `route-diagnostic.json`；保留既有 compact v1 精确相等测试。
- [x] `pre-ir-route-diagnostic.ts` 只增加共享的公开输出检查与 final-route wrapper；
  `pre-ir-fetch-active-qualification-run.ts` 改为复用该检查，不产生新 runner/runtime/transport 版本。
- [x] `pre-ir-calibration-run.ts` 在写完闭合 diagnostic 后才判定 route 成败；旧
  `route-probe.json` 继续按 v1 写入，只有 fetch-qualified source final lock 强制校验新证据。
- [x] 复用 fetch-active diagnostic 的分类逻辑与 v1 简洁 source-runner 编排，不再增加 transport 或
  Bun 小版本候选；旧 route result、lock 和 compact evidence 保持不可变。
- [x] 新 identity 先做一个 route probe；只有 exit 0、failureCode=`none`、3/3 output 才执行一次
  8-row/4-pair 矩阵。仍要求 0 infrastructure 和至少一个 differing pair，失败即冻结。
- [x] 新 route 在 67.358 秒后 exit 0、`failureCode=none`、3/3 output；唯一 8-row 矩阵完整写出，
  但 4 行跨 no-skill/original 触发 Bun internal assertion。Gate 为 4 infrastructure、1 comparable
  pair、1 differing pair，唯一可比较 delta=-0.75，按预注册规则冻结且不补跑。
- [x] v2 baseline gate 真正通过前，不构造 base IR、ir-static、artifact，不运行 held-out，也不把
  candidate qualification、聚合均分或 token 记作 skill 优化证据。

### Task 16.12：v1-style Source Runner Boundary Audit

- [x] 不创建新 runtime/transport/catalog 版本；对比 v1 可执行 benchmark 路径与当前 v2 source matrix
  的进程边界、adapter 生命周期和退出阶段，定位 internal assertion 是否来自可移除的嵌套 Bun/
  teardown 边界。
- [x] 调用图确认两轮都复用 `real-agent-run.executePlan -> skvm run -> executeRun -> bare-agent`；
  `bare-agent.teardown()` 为空，v2 额外边界是 pinned Bun/source entry、initial workdir manifest 与
  Node HTTP helper。现有证据不足以把 crash 单独归因于 runner、teardown、task 或 helper。
- [x] 先做本地、无 API 的调用图与最小进程测试；现有 `real-agent-run.test.ts` 已覆盖逐行子进程、
  explicit env、initial manifest、non-ok status 与 artifact repair 收尾。没有得到能把真实 crash 收敛到
  单一 runner 边界的复现，因此本阶段不提出付费实验。
- [x] 不得把 1 个 comparable pair 或污染后的 aggregate token 当成 original/skill 效果；下一次付费前
  仍需新的预注册 calibration identity，但不得以 runtime 小版本或 transport 分叉制造版本堆积。

文件级 TDD：

```text
Create  src/benchmarks/skill-ir/benchmark-evidence.ts
Create  src/benchmarks/skill-ir/benchmark-evidence.test.ts
Create  src/benchmarks/skill-ir/benchmark-evidence-run.ts
Create  results/skill-ir/benchmark-and-optimization-evidence-2026-07-29.json
Modify  docs/skill-ir/evaluation-system.md
Modify  docs/skill-ir/experiment-results.md
```

- [x] RED：v1/v2 contract audit、v2 materialization audit、v1/v2 calibration gate 输入必须经过
  schema 和 digest 校验；缺证据、digest 漂移、v2 任一 measurement metric 回归时 fail closed。
- [x] GREEN：生成 Pareto dominance 判定。只有 v2 在 canary match、alternative-valid false
  rejection、private contract issue、materialization protection 上无回归且至少一项严格改善，才输出
  `v2-measurement-contract-dominates`。
- [x] 把 operational evidence 与 measurement dominance 分列；v1 的 0 infrastructure 不抵消其合同
  audit failed，v2 的 4 infrastructure 也不得伪装成真实区分度或 Skill 优化证据。
- [x] 机械生成 runner boundary：共享 orchestrator/adapter、command/manifest/helper 差异、两轮
  infra/comparable pair 数；结论只能是 `runner-only-cause-not-established`，除非最小进程测试能复现。

### Task 16.13：Current Skill Optimization Evidence Ledger

- [x] 同一分析器消费 env-manager v4、law-to-markdown development/held-out 与 experimental-design v2
  冻结 compact evidence，生成逐 Skill 状态和总项目 evidence level。
- [x] Env-manager 只记为 3 个 complete pair 的 deterministic repair 正向机制证据；development gate
  因 1 infrastructure 失败，不能记作通过。
- [x] Law-to-markdown 分开记录 development gate passed 与 held-out gate failed；held-out artifact
  0.725 低于 ir-static 0.8375，因此不得输出稳定泛化或 break-even claim。
- [x] Experimental-design v2 只记为 measurement contract passed、真实 baseline blocked；尚未进入
  base IR、ir-static 或 artifact 优化阶段。
- [x] 总项目状态只能由最弱必要层决定：当前为 `partial-mechanism-evidence`，跨 Skill 稳定提升、
  跨模型/上下文和 token break-even 继续为 false。

### Task 16.14：Deterministic Source-process Replay

**Files:**

```text
Create  src/benchmarks/skill-ir/source-process-replay.ts
Create  src/benchmarks/skill-ir/source-process-replay.test.ts
Create  src/benchmarks/skill-ir/source-process-replay-run.ts
Create  results/skill-ir/experimental-design-v2-source-process-replay-2026-07-29.json
Modify  docs/skill-ir/evaluation-system.md
Modify  docs/skill-ir/experiment-results.md
```

- [x] RED：loopback responder 必须按 session 严格执行 read-inputs → shell-stress → write-outputs →
  read-outputs → final 五阶段；乱序、额外请求、错误 model/tool schema 必须记为 protocol failure。
- [x] RED：source child 必须真实运行 `src/index.ts run`、`bare-agent`、Node HTTP helper、initial
  workdir manifest 和 no-skill/original 两臂；report 不得保留 stream/task/skill/tool 正文、API key、
  绝对路径或环境值。
- [x] GREEN：正式 replay 固定两臂各 10 次、20 行顺序执行；每行 5 次 provider request、3/3 output，
  通过门槛为 20/20 exit 0、零 timeout、零 Bun crash、零 protocol failure。
- [x] GREEN：report 绑定 Bun/source/provider/transport/helper 摘要，提供 `--verify-only`，任一输入或
  compact report identity 漂移 fail closed；`methodEvidence=false`、`paidRerunAllowed=false`。
- [x] 实验解释：失败只定位 infrastructure phase；通过只说明固定、低延迟、无真实模型的 trajectory
  稳定，不证明 benchmark 区分度、Skill 优化、模型能力或 token 节省，也不自动放行付费重跑。

正式结果：Bun 1.3.13 下两臂各 10/10，合计 20/20 exit zero、protocol/output complete，0 timeout、
0 crash、0 nonzero；no-skill/original median 分别为 577.8/597.4 ms。由此只否定“固定 source
process 边界必崩”的假设。下一步从既有本地 conversation/session/raw 中生成不含正文的 trajectory
shape/latency audit；四个 crash 行缺少 finalized conversation，不能伪造其工具序列。

### Task 16.15：Privacy-preserving Trajectory Shape / Latency Audit

**Files:**

```text
Create  src/benchmarks/skill-ir/trajectory-shape-audit.ts
Create  src/benchmarks/skill-ir/trajectory-shape-audit.test.ts
Create  src/benchmarks/skill-ir/trajectory-shape-audit-run.ts
Create  results/skill-ir/experimental-design-v2-trajectory-shape-audit-2026-07-29.json
Modify  docs/skill-ir/evaluation-system.md
Modify  docs/skill-ir/experiment-results.md
```

- [x] RED：8 个 raw row 必须与排除 route 后的 8 个 matrix session 按顺序、task、system/run 和时长
  唯一映射；少行、多行、错序、状态或 duration 漂移都 fail closed。
- [x] RED：完成行必须有 request/response 成对且以 `end_turn` 结束；crash 行没有 finalized
  conversation 时必须记为 unavailable，不能投影为零调用。
- [x] RED：序列化报告不得出现 prompt、skill/model 正文、messages、tool arguments/results、stream
  正文、secret/env、token 或绝对路径；unknown tool 只允许归入 `other`。
- [x] GREEN：输出逐行 response/tool/fan-out/stop-reason/provider-duration 摘要，以及 successful-only
  envelope；绑定 raw/plan/sessions/conversation digest 并支持 `--verify-only`。
- [x] 实验解释：只比较 deterministic replay 与历史成功行 envelope；crash 前轨迹不可观察，不建立
  因果、不证明 Skill/model/benchmark/token，也不自动放行付费重跑。

正式结果：8/8 row/session mapping 通过，4 条成功行 trajectory available，4 条 Bun crash 行为
`session-not-finalized`。成功 envelope 为 response 6--16、tool call 最大 23、fan-out 最大 6、
provider response 最大 26.783 秒、raw duration 最大 220.124 秒；旧 replay 为 5/11/3/0.674 秒，
四项 coverage 全 false。下一步先覆盖该 envelope，仍不调用 API。

### Task 16.16：Delayed / High-fan-out Source-process Replay

**Files:**

```text
Create  src/benchmarks/skill-ir/delayed-source-process-replay.ts
Create  src/benchmarks/skill-ir/delayed-source-process-replay.test.ts
Create  src/benchmarks/skill-ir/delayed-source-process-replay-run.ts
Create  results/skill-ir/experimental-design-v2-delayed-source-process-replay-2026-07-29.json
Modify  docs/skill-ir/evaluation-system.md
Modify  docs/skill-ir/experiment-results.md
```

- [x] 冻结本地两臂各 1 行，固定 16 次 provider response、23 个 tool call、最大 fan-out 6，并以
  `27s,13s×14,12s` 的 221 秒 wall-clock schedule 覆盖历史成功行 envelope；不读取历史正文。
- [x] 继续复用 Bun 1.3.13 source entry、Node HTTP helper、`bare-agent` 和同一 tool executor；不创建
  runtime、transport 或 benchmark 新版本。
- [x] RED：phase、tool count/fan-out、delay schedule、final end-turn 和 compact privacy contract 任一
  漂移必须 fail closed。
- [x] GREEN：两行必须 exit 0、protocol complete、3/3 output、0 timeout/crash；失败只定位本地
  infrastructure，成功只说明已观察**成功行** envelope 可稳定 replay。
- [x] 即使通过，crash 行轨迹仍不可观察，`paidRerunAllowed=false`；下一步应先设计 flush-on-each-turn
  的真实 route trace，不直接重跑 8-row matrix。

正式结果：no-skill/original 分别为 222.625/222.535 秒；两行 16/16 response、23 tool、fan-out 6、
3/3 output、exit 0，0 timeout/crash/nonzero/protocol failure。Response/tool/fan-out/configured delay/
wall-clock/successful envelope 六项 coverage 全 true。该结果不放行付费 matrix，只把下一变量收敛到
自由 response/tool 内容、非确定时序和 crash 前未持久化阶段。

### Task 16.17：Durable Compact Runtime Trace

**Files:**

```text
Create  src/core/durable-runtime-trace.ts
Create  src/core/durable-runtime-trace.test.ts
Modify  src/core/agent-loop.ts
Create  src/benchmarks/skill-ir/durable-runtime-trace-validation.ts
Create  src/benchmarks/skill-ir/durable-runtime-trace-validation.test.ts
Create  src/benchmarks/skill-ir/durable-runtime-trace-validation-run.ts
Create  results/skill-ir/experimental-design-v2-durable-runtime-trace-validation-2026-07-29.json
Create  src/benchmarks/skill-ir/durable-runtime-trace-route.ts
Create  src/benchmarks/skill-ir/durable-runtime-trace-route.test.ts
Create  src/benchmarks/skill-ir/durable-runtime-trace-route-run.ts
Create  benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-durable-runtime-trace-route-lock.json
Modify  docs/skill-ir/evaluation-system.md
Modify  docs/skill-ir/experiment-results.md
```

- [x] 先冻结独立 trace schema 与隐私 contract；使用 opt-in 环境开关，默认运行与现有 conversation
  logger 行为不变，不创建 runtime/transport/benchmark 版本。
- [x] Trace 逐事件同步 append + flush：provider-request-start、provider-response-received、tool-batch-start、
  tool-batch-end、turn-end、finalize；每行有 sequence、turn、duration、封闭 tool type/count/fan-out。
- [x] 禁止 prompt/message/model text、tool argument/result、stdout/stderr、token、secret、env value、
  command 和绝对路径；crash 后只允许解释“最后一个持久化事件”，不得补全缺失事件。
- [x] 先用 deterministic delayed replay 注入 trace，验证成功行事件完整；再为一条真实 route 建立新的
  development-only diagnostic lock。未完成书面 freeze 与本地测试前不调用 API。
- [x] 真实 route 无论成功或 crash 都冻结 compact trace；它不进 benchmark 分母，不直接放行 8-row
  matrix，也不产生 Skill/model/token claim。

冻结细节：使用 `SKVM_DURABLE_RUNTIME_TRACE` 指向本地 JSONL；每事件同步 append + fsync，writer 失败
时 fail closed。Local validation 以 `delayScale=0` 运行两臂真实 source child，每段预期 80 个事件；
raw trace 不提交。下一条真实 route 固定 original × cluster-sequential development × clean × Windows ×
`gpt-5.6-sol`，retries 0；付费前仍需独立 diagnostic lock 与本地 gate 通过。

正式结果：本地 trace validation 160/160 事件通过。唯一真实 route 在 180.254 秒被外层 watchdog
终止，trace 停在第 10 轮 `provider-request-start`；前 9 轮均闭合，0 stderr、0/3 output、无 Bun
assertion。任务内部 timeout 为 300 秒而外层 lock 为 180 秒，冻结结论为 timeout contract 倒挂；
不修改旧 lock、不重跑。Task 16.17 是最后一个专用 Bun infrastructure feature。下一执行合同必须先
静态验证 outer watchdog 至少覆盖 task timeout 与 teardown grace；在此之前不运行 8-row matrix。

### Task 16.18：Stable Pi Harness Qualification 与 Development Baseline

**Files:**

```text
Create  src/benchmarks/skill-ir/stable-harness-calibration.ts
Create  src/benchmarks/skill-ir/stable-harness-calibration.test.ts
Create  src/benchmarks/skill-ir/stable-harness-calibration-run.ts
Create  src/benchmarks/skill-ir/stable-harness-calibration-run.test.ts
Create  benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-pi-calibration-lock.json
Create  results/skill-ir/experimental-design-v2-pi-calibration-2026-07-29/invalidation-audit.json
Create  results/skill-ir/experimental-design-v2-pi-post-cleanup-2026-07-29/qualification.json
Create  results/skill-ir/experimental-design-v2-pi-post-cleanup-2026-07-29/gate-report.json
Create  results/skill-ir/experimental-design-v2-pi-post-cleanup-2026-07-29/calibration-analysis.json
Modify  src/adapters/pi.ts
Create  src/adapters/pi.test.ts
Modify  src/benchmarks/skill-ir/real-agent-run.ts
Modify  src/benchmarks/skill-ir/real-agent-run.test.ts
Modify  docs/skill-ir/evaluation-system.md
Modify  docs/skill-ir/experiment-results.md
```

- [x] 冻结 `PiAdapter`、项目本地 `pi 0.67.68`、managed OpenAI-compatible route、Windows/clean/
  `gpt-5.6-sol`、retries 0；不得使用全局未知版本、native user config 或 unpinned npx fallback。
- [x] RED/GREEN：timeout budget 必须为 task 300000 + teardown grace 60000 <= outer watchdog 360000；
  materialized command/task、lock 任一漂移都 fail closed。
- [x] RED/GREEN：给 generic non-artifact execution 增加 opt-in per-row outer watchdog；默认缺失时保持旧
  runner 行为，启用时 timeout 必须写成 infrastructure row，不能挂住整个 matrix。
- [x] 先 dry-run 8-row plan，但只付费运行 original × cluster-sequential-dev-002 × run1 qualification；
  需要 version/resource/exit/runStatus/3-output 全通过。失败即停止，不换 harness、不重试。
- [x] Qualification 通过后运行固定 8 行 no-skill|original paired development matrix，使用既有 v2
  scorer/gate；raw 本地，compact result 持久化。
- [x] 解释边界：Pi 与 bare-agent 不直接配对；本轮不证明 Bun、Skill optimization、held-out 或 token。
  Matrix 可用后下一步必须回到 base IR/ir-static，不再继续基础设施开发。

执行结果：首次 matrix 因 Pi inject 残留 `AGENTS.md` 被 scorer 正确拒绝，4 条 original 都出现同一
`UNEXPECTED_ENTRY`，已冻结为 invalid harness evidence。TDD 修复 resolver 与注入文件恢复/清理后，
新 qualification 通过且 residue 为空。新 8-row matrix 为 8/8 rows、4/4 pairs、0 infrastructure；
no-skill/original 均 4/4、mean 1.0，differing pairs 0。Gate 因 no-skill saturation 与无区分度失败，
不放行 base IR/held-out。Original aggregate token 为 no-skill 的 3.29x、平均 latency 为 1.37x，当前
原 skill 对强模型只增加成本。Task 16.18 工程与实验执行均完成；下一任务转向 development-only harder
task contract，不再继续 Bun/transport 修复。

### Task 16.19：Strong-model Harder Development Contract

本任务沿用 `experimental-design-v2` 的公开语义合同与确定性 scorer，不新建 benchmark 版本，
也不修改已经冻结的 Task 16.18 lock、结果或 held-out。目标是在 development-only 范围增加
能让最强预注册模型暴露真实设计错误的任务，从而恢复 `no-skill | original` 的区分度，再决定
是否值得编译 base IR。新的任务集合必须使用新的 task-set identity 与 calibration lock，不能将
Task 16.18 的结果覆盖或混入新 gate。

**Files:**

```text
Create  benchmarks/skill-ir/pilots/experimental-design/v2/harder-development/tasks.json
Create  benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-harder-pi-calibration-lock.json
Create  src/benchmarks/skill-ir/experimental-design-v2-harder-development.ts
Create  src/benchmarks/skill-ir/experimental-design-v2-harder-development.test.ts
Create  src/benchmarks/skill-ir/experimental-design-v2-harder-audit.ts
Create  src/benchmarks/skill-ir/experimental-design-v2-harder-audit.test.ts
Create  src/benchmarks/skill-ir/experimental-design-v2-harder-audit-run.ts
Create  src/benchmarks/skill-ir/experimental-design-v2-harder-calibration.ts
Create  src/benchmarks/skill-ir/experimental-design-v2-harder-calibration.test.ts
Create  src/benchmarks/skill-ir/experimental-design-v2-harder-calibration-run.ts
Create  src/benchmarks/skill-ir/experimental-design-v2-harder-calibration-analysis.ts
Create  src/benchmarks/skill-ir/experimental-design-v2-harder-calibration-analysis.test.ts
Create  results/skill-ir/experimental-design-v2-harder-development-saturation-audit-2026-07-31.json
Create  results/skill-ir/experimental-design-v2-harder-development-contract-audit-2026-07-31.json
Create  results/skill-ir/experimental-design-v2-harder-development-materialization-audit-2026-07-31.json
Create  results/skill-ir/experimental-design-v2-harder-pi-calibration-2026-07-31/qualification.json
Create  results/skill-ir/experimental-design-v2-harder-pi-calibration-2026-07-31/gate-report.json
Create  results/skill-ir/experimental-design-v2-harder-pi-calibration-2026-07-31/calibration-analysis.json
Modify  docs/skill-ir/evaluation-system.md
Modify  docs/skill-ir/experiment-results.md
```

- [x] 从 Task 16.18 有效 8-row matrix 做 failure/saturation audit，只使用 development 输出和公开
  contract，禁止读取 held-out、scorer 私有中间值或 evaluator expected。
- [x] 定义两个 supplemental task：3-arm individual+strata+sequential 与
  4-arm cluster+strata+sequential，均含 full/partial block 和 analysis-unit difference；公共合同、输出、
  五项 criterion 与阈值不变，不进入默认 corpus manifest。
- [x] TDD 编写 development-only task-set validator、负向 canary 与 materialization audit；证明 task
  难度来自公开输入语义，而不是隐藏答案、私有 enum 或 harness 差异。
- [x] Differential audit 对每项任务验证 canonical、alternative-valid、sequential/stratum invalid、
  report contradiction 与 extra-output；任意合法 allocation 和 CSV row order 必须通过。
- [x] 在任何付费运行前冻结新 task-set identity、source/task/scorer digest、模型、adapter、repetitions、
  timeout、gate、audit 与结果路径；held-out freeze、旧 2+2 tasks 和 v2 scorer 保持字节不变。
- [x] 先跑本地 fixture、dry-run 与 single-route qualification，再运行一次冻结的
  `no-skill | original` development paired matrix。
- [x] 只有新 gate 同时满足无 infrastructure failure、no-skill 不饱和、存在可比较且有差异的 pairs，
  才允许为 supplemental task-set 构造 source-audited base IR / `ir-static`；否则冻结失败证据并回到
  task-contract audit，不继续堆 runtime 版本。

执行结果：qualification 通过（route 195.693 秒、3/3 outputs、零 residue）。唯一 8-row matrix 为
8/8 rows、4/4 pairs、0 infrastructure；no-skill/original 均 4/4、mean 1.0、0 differing pair，gate 因
`noSkillNonSaturated=false` 与 `distinguishable=false` 失败。Original 相对 no-skill 使用 2.1856x
aggregate token 和 1.0854x latency，仍无质量增益。Task 16.19 已按失败分支冻结，不进入 base IR、
held-out 或新 runtime；下一任务先审计 public contract 是否已经足以替代 skill 的操作指导。

### Task 16.20：Public Contract Task Sufficiency Audit

- [x] 对 development prompt、`design-contract.json`、原 skill/source closure 和 scorer public projection
  建立逐条 instruction provenance；禁止读取 held-out tasks 或 raw model text。
- [x] 区分 scorer 必需的可观察输出合同、用户完成任务必需的程序性指导，以及只存在于原 skill 的增量
  知识，生成 instruction-overlap / sufficiency compact report。
- [x] 用删除公开证据则约束消失的 reverse test 和 gold/held-out leak canary 验证报告；不得为了制造
  no-skill failure 隐藏用户任务本身必须知道的输出格式或判分标准。
- [x] 根据 audit 结果三选一：收紧公开 task contract、转向原 skill 真正独有且可确定性检查的能力面，
  或冻结“强模型下该 skill 无可测增益”的负结果；完成书面评审前不创建第三批任务、不调用 API。

执行结果：compact audit 绑定 15 个输入、2 份饱和分析和完整 8-file source closure。19 条 instruction
中 13 条 scorer-required 要求全部向 no-skill 披露，`noSkillOperationalCoverage=1.0`；原 skill 的
6 类增量知识均未被当前 scorer 测量，`skillIncrementalMeasurementCoverage=0`。Reverse-evidence、
evaluation-split/gold/raw/model canary、digest 和 quote drift 测试全部通过。结论冻结为当前任务合同在
已测 surface 上足以替代 skill 操作指导；不创建新任务、不调用 API、不放行 base IR。

### Task 16.21：Skill-unique Semantic Surface 与 IR Re-entry 设计

- [x] 在书面设计中拆分 `task-visible interface` 与 `source-derived deterministic semantic oracle`：前者
  继续公开必要输入/输出/schema/安全合同，后者只能从公开 source、task input 和 workdir 推导，不能把
  解题配方或 scorer expected 投影进 no-skill prompt。
- [x] 从六类未测增量知识中选择 independent replication/pseudoreplication 与 analysis-design alignment
  两个能力面；真实随机化仅保留为未来 profile，并为本轮规则写死 source provenance、保守降级、
  reverse-evidence 和 leak canary。
- [x] 冻结新 development task/scorer 之前，定义 no-skill 可见面、oracle 输入面、hard gate、替代合法解、
  held-out 隔离和旧 v2 task 的历史身份；书面评审通过前不创建第三批任务或调用 API。
- [x] 区分度门禁失败后停止 base IR re-entry；没有把旧 IR 分数与新 benchmark 混算。
- [x] 因 baseline 不可区分，未构造 dual-source evidence、Final IR 或 validated artifact，也未消费 held-out。
- [x] 旧 Env/Law/Experimental-design artifact 保持原 identity；本轮没有以不兼容 task/scorer/source
  contract 覆盖任何旧 package 或 lock digest。

#### Task 16.21.1：Task split 与公开接口（先于 scorer）

**Files:**

```text
Create  benchmarks/skill-ir/pilots/experimental-design/v2/skill-unique/public-interface.json
Create  benchmarks/skill-ir/pilots/experimental-design/v2/skill-unique/development/tasks.json
Create  benchmarks/skill-ir/pilots/experimental-design/v2/skill-unique/heldout/tasks.json
Create  benchmarks/skill-ir/pilots/experimental-design/v2/skill-unique/task-split-freeze.json
Create  src/benchmarks/skill-ir/experimental-design-skill-unique-contract.test.ts
Create  src/benchmarks/skill-ir/experimental-design-skill-unique-contract.ts
Modify  benchmarks/skill-ir/corpus/corpora/pilot.json
```

- [x] RED：拒绝循环/多根/未知 parent、重复 entity、无 treatment-response lineage、非法 count、混合 split、
  task-visible expected/gold/source quote/held-out sentinel 和旧 v2 identity 覆盖。
- [x] GREEN：构造 2 development + 2 held-out、两文件公开接口和 split freeze；corpus 只增加同一真实
  source 的 capability-calibration entry，不增加 pilot 计数，也不晋级 runnable/base IR。

#### Task 16.21.2：Oracle 与 deterministic scorer

**Files:**

```text
Create  src/benchmarks/skill-ir/experimental-design-skill-unique-oracle.test.ts
Create  src/benchmarks/skill-ir/experimental-design-skill-unique-oracle.ts
Create  src/bench/evaluators/experimental-design-skill-unique-grade.test.ts
Create  src/bench/evaluators/experimental-design-skill-unique-grade.ts
Modify  src/bench/evaluators/index.ts
```

- [x] RED：覆盖 replicate/count/measurement 推导、pseudoreplication、aggregate 与 hierarchical 两族
  合法解、缺 ancestor/invented grouping、输入 mutation、缺/多输出和 symlink/path escape。
- [x] GREEN：实现五项二值 hard gate、1.00 threshold；payload 只含路径与 protected digest，oracle
  只读 agent-visible graph，缺公开证据返回 `unconfirmed`。

#### Task 16.21.3：差分、泄漏与物化审计

**Files:**

```text
Create  src/benchmarks/skill-ir/experimental-design-skill-unique-audit.test.ts
Create  src/benchmarks/skill-ir/experimental-design-skill-unique-audit.ts
Create  src/benchmarks/skill-ir/experimental-design-skill-unique-audit-run.ts
Create  benchmarks/skill-ir/pilots/experimental-design/v2/skill-unique/source-oracle-provenance.json
Create  results/skill-ir/experimental-design-skill-unique-contract-audit-2026-07-31.json
Create  results/skill-ir/experimental-design-skill-unique-materialization-audit-2026-07-31.json
```

- [x] RED/GREEN：每个 development task 跑 canonical、alternative、四类 semantic invalid 和三类文件边界
  invalid；alternative wording/order 不得影响结果。
- [x] RED/GREEN：reverse-evidence、gold/source quote/raw/model/held-out canary 与 production
  `prepareRunWorkspace` 的 no-skill/original 两臂物化全部 fail closed 或通过预期检查。

本地结果：2 tasks x 9 cases = 18/18 matched；2 tasks x 2 systems x 9 materialization checks =
36/36 passed。Oracle/scorer 只证明测量机制成立，尚无模型区分度、IR 增益或 held-out 结果。

#### Task 16.21.4：本地门禁与一次强模型 calibration

- [x] 本地 audit 全绿且 spec/plan/组件文档同步后，先提交 task/scorer/audit；再冻结新的 Pi calibration
  method lock 和数值 gate，不修改任何旧 runner/lock digest。
- [x] 复用现有 `real-agent-run`、custom scoring 与 gate primitives 完成 dry-run、resource/route
  qualification 和唯一 8-row run；没有新增 runtime/transport/catalog 版本。早期三个 execution identity
  的 API 前失败均保持冻结；direct Node + short-path identity 的 qualification 与 matrix 最终通过执行
  链路，结果见 Task 16.21.5。
- [x] Gate 失败则冻结 compact evidence 并转 Wave B；通过才勾选上层 base IR re-entry，随后另写
  source-audited base IR TDD，不在本 task 顺手生成 Final IR 或消费 held-out。

该 execution-boundary architecture review 已在 Task 16.21.5 完成。基础设施通过后，真实结果仍因
no-skill 饱和与 0 differing pair 触发停止规则；当前活跃动作已转为 Task 16.22。

#### Task 16.21.5：Direct Node Pi execution boundary

**Files:**

```text
Modify  src/adapters/pi.ts
Modify  src/adapters/pi.test.ts
Create  src/benchmarks/skill-ir/pi-package-execution-probe.ts
Create  src/benchmarks/skill-ir/pi-package-execution-probe.test.ts
Create  results/skill-ir/pi-package-execution-probe-2026-07-31.json
Create  benchmarks/skill-ir/pilots/experimental-design/v2/skill-unique/pi-direct-cli-calibration-lock.json
Modify  src/benchmarks/skill-ir/experimental-design-skill-unique-calibration.ts
Modify  src/benchmarks/skill-ir/experimental-design-skill-unique-calibration-run.ts
Modify  corresponding tests and active documentation
```

- [x] RED：在含非 ASCII 的 cwd 中从 Bun parent 调用 installed Pi package `--version`；要求 command 为
  Node + `dist/cli.js`，拒绝 `.bin`/junction、缺 Node、缺 CLI、版本漂移和 timeout。
- [x] GREEN：adapter resolution 顺序固定为 explicit repo -> installed package -> PATH -> npx；普通 fallback
  语义保持，compact probe 不保存绝对路径或 stdout/stderr。
- [x] Probe 通过后才提交新的 execution lock；继承原 task/source/scorer/model/matrix/gate，绑定 Node、Pi
  CLI、adapter/source runner/coordinator digest，不覆盖失败 lock。
- [x] 新 lock 先 dry-run 与唯一 qualification；通过才运行一次 8-row matrix/scoring/gate。任何 API 前
  infrastructure failure 都冻结并停止，不能归因为 skill 或模型。

本地 probe 已通过：Node v23.8.0 直接启动 Pi 0.67.68，exit 0、非 timeout、821ms；报告只保存
executable/package/CLI digest 和封闭状态。新 direct-cli lock 已通过 schema/digest/probe 验证；正式
dry-run 为 8 rows、4 complete pairs，下一步提交 lock 后只运行一条预注册 original qualification。

Direct-cli v1 qualification 已在 API 前失败，但 Node + Pi CLI 选择正确；同一 `Bun.spawn(node --version)`
在 265 字符真实 cwd 复现 ENOENT，短 cwd 成功，根因为 Windows/Bun cwd length。下一步增加 plan-time
`maximumWorkDirLength=220` guard，并以 `results/skill-ir/su-pi-direct-v1` 为冻结短 output root；其
dry-run 最大 workdir 长度 201。新 short-path lock 是本问题最后一个 execution identity，仍失败则转
Wave B/stable external harness，不再继续修当前 coordinator。

Short-path schema/lock/guard 已通过 9 tests、82 assertions 与 typecheck；正式 dry-run 为 8 rows、
4 complete pairs、最大 workdir 201。提交该 identity 后才允许唯一 qualification。

最终结果：qualification passed（30.075 秒、2/2 outputs、零 residue）；matrix 8/8、4/4 pairs、0 infra，
但两臂均 4/4、mean 1.0、0 differing。Original 89,217 tokens，no-skill 28,061 tokens。Gate failed，
Task 16.21 不进入 base IR/held-out。

### Task 16.22：Wave B 不同真实 Skill 复用

- [x] 选择 `api-tester`：exact source 为 `laolaoshiren/claude-code-skills-zh` commit
  `1e221579b0504082d25d5548b194399a7785f10f` 的 `skills/api-tester/SKILL.md`，MIT；无 bundled
  script/resource，运行期只需要 Node 与已固定 `yaml` package。
- [x] 冻结 benchmark 形态为离线 `api-test-generator/v1`：候选生成 JS generator、derived plan 与 report；
  scorer 执行 generator 并从 agent-visible OpenAPI 独立推导语义，不比较框架/命名/措辞。
- [x] 先写 2 development + 2 held-out、task-visible public contract 与 split freeze；scorer 文件不得在
  split freeze commit 之前出现。
- [x] TDD 实现 source-derived oracle、五项 hard-gate scorer、两族 alternative-valid、invalid control、
  reverse-evidence、leak 与 production materialization audit；本地审计未通过前不调用 API。
- [x] 复用 direct Node Pi、short-path budget、source materialization、paired scoring 与 distinguishability
  gate；通用 core 不得增加 `api-tester` id 分支，不新增 runtime/transport/catalog。
- [ ] 先跑 `no-skill | exact original` development gate。失败则冻结该 skill/model/task surface 的负结果；
  通过才编译同 source/task identity 的 base IR 和 ir-static。
- [ ] 报告 core branch delta、skill-specific adapter LOC、artifact kind 复用率、paired quality、稳定性和
  token 成本；development gate 前不消费 held-out。

#### Task 16.22.1：Source closure、public contract 与 2+2 split

**Files:**

```text
Create  benchmarks/skill-ir/pilots/api-tester/source/SKILL.md
Create  benchmarks/skill-ir/pilots/api-tester/source/LICENSE.upstream
Create  benchmarks/skill-ir/pilots/api-tester/public-interface.json
Create  benchmarks/skill-ir/pilots/api-tester/development/tasks.json
Create  benchmarks/skill-ir/pilots/api-tester/heldout/tasks.json
Create  benchmarks/skill-ir/pilots/api-tester/task-split-freeze.json
Create  src/benchmarks/skill-ir/api-tester-contract.test.ts
Create  src/benchmarks/skill-ir/api-tester-contract.ts
Modify  benchmarks/skill-ir/corpus/corpora/pilot.json
```

- [x] RED：拒绝 source/license digest 漂移、非 2+2 split、混合 split、重复 task、绝对/逃逸路径、task-visible
  expected/gold/oracle/source quote、held-out sentinel、网络/package-install 权限和缺失 CLI/output ABI。
- [x] GREEN：提交 exact source closure、两种 development OpenAPI 表示、两种不同 held-out domain、公开
  generator ABI 和 split freeze；corpus 仍为 `tasks-authored` 且无 `irPath`。

执行结果：source closure 同时冻结上游 CRLF digest 与 committed LF digest；YAML/JSON development、
billing/webhook held-out、public generator ABI 和 split freeze 已建立。新增通用门禁要求
`tasks-authored-calibration` 显式且只选择一个 skill，防止旧 Wave A 与新 Wave B 默认混跑。

#### Task 16.22.2：Oracle、Scorer 与本地审计

- [x] RED/GREEN：独立解析 OpenAPI YAML/JSON，推导 operation、schema constraint、security、response 与
  independence oracle；公开证据不足时返回 `unconfirmed`。
- [x] RED/GREEN：候选 generator 在隔离副本执行两次，要求相同 digest、输入不变、无网络/路径逃逸；
  五项 criterion 全部 hard gate，threshold 1.00。
- [x] RED/GREEN：两族 alternative-valid 通过，operation/boundary/auth/secret/determinism/file invalid 被拒；
  reverse-evidence 与 gold/raw/model/source-quote/held-out canary fail closed。
- [x] 生产 `prepareRunWorkspace` 的 no-skill/original materialization audit 全绿后，才起草 calibration lock。

执行结果：development differential contract audit 为 18/18 matched，生产 no-skill/original
materialization 为 36/36 checks；两份 report 均已持久化。Task 16.22.2 关闭，下一步只起草并评审
Task 16.22.3 calibration lock；lock 冻结前不得调用 API。

#### Task 16.22.3：Strong-model baseline 与 IR re-entry gate

- [x] 新 lock 冻结 `gpt-5.6-sol`、Pi 0.67.68、Windows/clean、2 tasks x 2 systems x 2 repetitions、retries 0，
  复用 direct Node + short-path 路径政策；8-row/4-pair dry-run 与 220 字符路径预算已验证。
- [ ] 先运行唯一 original/YAML qualification，要求 Pi 版本、Node/`yaml` resource probe、三个输出、route
  status 与 harness residue 全部通过；qualification failed 时不得启动 8-row matrix。
- [ ] 唯一 8-row baseline 要求完整分母、0 infrastructure、no-skill 非饱和、至少 1 differing pair 和每个
  task 至少一次 original success；结果出现前冻结数值 gate。
- [ ] Gate failed 则停止；passed 才另写 base IR/source audit TDD，不在 baseline task 顺手生成 IR/Final IR。
