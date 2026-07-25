# Skill IR AOT 当前执行计划

**最后更新：** 2026-07-25

本文件只记录当前状态和下一步。已完成阶段的详细演进见
`docs/skill-ir/history.md`，组件契约见对应权威文档。

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
| `experimental-design` second phenotype | v1 benchmark contract 失败并冻结 | 本地机制仍有效，但 scorer 拒绝合法等价实现；下一步建立独立 v2 语义 benchmark。 |
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

### 当前下一刀：Experimental-design Benchmark v2

1. 保留 v1 task、scorer、audit、lock、package 与结果，不原地修改。
2. 以公开语义合同重建 v2 task/scorer；语义成功为主指标，确定性 profile 为独立次指标。
3. 为每个 development criterion 编写 canonical-valid、alternative-valid 与
   invalid-control differential fixture。
4. 先通过 v2 benchmark contract audit 和书面评审，再决定是否执行
   `no-skill | original` API calibration。
5. v2 development gate 通过后才进入 held-out；完整泛化结论必须由未参与设计的
   Wave B `api-tester` replication 支撑。
6. Token 只按包含 compile/profile/package 成本的重复调用口径报告，不提前声称 break-even。

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
- [ ] Bun 1.3.14 的 benchmark 聚合在 Windows 上无结尾退出状态；全仓库测试另有缺
  `sh/python3` 的既有环境失败。付费前继续使用分组测试并保留该基础设施限制。
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
- [ ] 下一 adapter 必须复用相同 manifest/execution-plan/runtime API；若需要修改 catalog core，
  记录抽象失败并新版本化，不能以 Law 单例声称通用。
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
- [ ] 若后续重建 experimental-design benchmark，使用新 task/scorer/audit/lock/version 和新的
  development fixtures；不得读取当前模型正文生成 expected，不得覆盖 v1。
- [ ] 新 benchmark 必须先通过多实现 local differential tests 和书面评审，再决定是否投入 API
  calibration；当前 held-out 永久不进入修正过程。

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

- [ ] 在 `benchmarks/skill-ir/pilots/experimental-design/v2/` 建立独立的 public
  contract、2 development + 2 held-out task 身份和 audit fixture 根。
- [ ] 冻结公开可见的输入、输出、方法适用性、assignment/analysis/allocation unit、
  allocation 安全和报告一致性要求。
- [ ] 明确禁止私有 schema version、封闭 method enum、唯一 PRNG/schedule 和逐字
  report label 进入主成功条件。
- [ ] v1 path/digest 测试必须证明旧 task/scorer/audit/lock/package/result 未变化。

#### Task 8.11.2：语义主 Scorer 与确定性次指标

- [ ] 先写 scorer RED tests，覆盖合法等价方法、allocation 顺序和中英文报告措辞。
- [ ] 主 scorer 只输出 `primarySemanticScore`、criterion 和 hard-gate；runtime checker
  仍与离线 scorer 分离。
- [ ] 单独计算 `deterministicProfileScore` 与 reproducibility；除公开合同明确要求外，
  profile 不得改变 primary success。
- [ ] 输出显式支持“semantic pass / profile differ”，防止 benchmark-specific profile
  被误当成语义失败。

#### Task 8.11.3：Differential Fixture 与 v2 Audit

- [ ] 每个 development criterion 至少提供 canonical-valid、alternative-valid 与
  invalid-control；task 分支必须独立覆盖。
- [ ] 增加 reverse-evidence 和 gold-isolation 测试：移除公开证据后约束消失或变为
  `unconfirmed`，evaluator expected、held-out、历史模型正文和 package answer 不可达。
- [ ] 生成新的 v2 audit manifest/report；任何 alternative-valid 被拒、invalid-control
  被接受或 source anchor 漂移都 fail closed。
- [ ] audit 通过前 corpus 保持非主实验状态，不创建付费 lock。

#### Task 8.11.4：Calibration、IR 与 Artifact Development

- [ ] 书面评审通过后冻结 v2 `no-skill | original` development calibration lock，
  先 dry-run、resource probe 和 route probe，再执行唯一付费批次。
- [ ] baseline 有区分度后构造 source-audited v2 base IR；静态 IR 与 artifact
  只消费公开 source/task contract，不消费 scorer gold 或 held-out。
- [ ] 冻结 `no-skill | original | ir-static | validated-artifact` development lock
  与数值 gate；primary semantic、profile、runtime、token 和 infrastructure 分列。
- [ ] development gate 未过时冻结失败，不补跑、不调 scorer、不进入 held-out。

#### Task 8.11.5：Held-out、Wave B 与摊销

- [ ] v2 development gate 通过后另建 held-out lock，只消费冻结产物。
- [ ] 冻结 Wave A 方法后，以 `api-tester` 为首个 Wave B skill，复用 catalog/runtime/
  lock 生命周期；通用 core 不得新增 skill-id 分支。
- [ ] 记录 adapter LOC、artifact kind 复用率、core branch delta 和新 failure taxonomy；
  据此区分“框架复用”与“catalog 已泛化”。
- [ ] 在质量不回归前提下，按 `N=1,2,5,10` 报告 compile/profile/package/runtime
  总成本和 break-even；没有同口径数据时不声称 token reduction。

文件级 TDD 的具体文件名、接口和命令将在本设计书面评审通过后，按
`superpowers:writing-plans` 另行拆解。当前冻结顺序为：

```text
v2 public contract
-> scorer differential tests
-> v2 audit
-> baseline calibration
-> base IR / artifact development
-> held-out
-> Wave B replication
-> repeated-call amortization
```
