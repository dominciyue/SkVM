# Skill IR AOT 当前执行计划

**最后更新：** 2026-07-21

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
| GPT-4.1 capability diagnostic | 已冻结设计 | 20 个 development rows；只替换模型和 run identity。 |
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

## 4. 下一阶段顺序

### 已完成前置：文档治理

- `docs/skill-ir/README.md` 已成为唯一入口。
- 重复组件、设计和实验说明已按内容重建为权威文档。
- 旧路径已全局替换，58 份被吸收文档已删除。
- Git 与 `history.md` 保留历史，链接检查器阻止旧路径回流。

### Step 2：并行完成 v2 failure audit 与强模型诊断

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

### Step 3：合并两路证据后设计下一 catalog

- 先合并 2A failure taxonomy 与 2B capability diagnosis，禁止只看强模型总分改设计。
- 共享或绑定 initial generation，降低两臂生成噪声。
- 保存 pre/post repair 可评分 snapshot。
- 重新设计 schema public-contract lowering。
- 评审 B-layer classification 是否进入 production。
- 如外置 parser，使用新 ABI、digest、catalog 和 lock。

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

- [ ] 运行 package verify、20 行 dry-run、全 focused tests、typecheck。
- [ ] 使用 `original` development task 对 `xty/gpt-4.1` 做一次 route probe；仅验证
  路由、凭据和 bare-agent 可执行性。
- [ ] Probe 失败时停止，不创建付费 development 结果。

```powershell
bun ./src/benchmarks/skill-ir/route-probe-run.ts `
  --corpus=pilot --models=xty/gpt-4.1 --adapter=bare-agent `
  --system=original --context=clean --agent=skvm --environment=windows `
  --task=env-manager-node-audit-dev-001 --timeout-ms=120000 `
  --require-env=SKVM_XTY_API_KEY `
  --out-dir=results/skill-ir/env-manager-gpt41-capability-route-probe
```

### Task 2.5：冻结 development 执行与评分

- [ ] 按 dry-run 中保存的参数执行 baseline 12 行、check-only 4 行、one-repair 4 行。
- [ ] 每组立即运行现有 deterministic scorer 和 analyzer；infra 行不重解释为 semantic。
- [ ] 用 failure-audit CLI 合并历史 mini 与新 GPT-4.1 scored rows。
- [ ] Gate 未过或任务饱和时仍停止 held-out，不修改 scorer/package/lock。

### Task 2.6：结果与文档收口

- [ ] 提交 compact plan、scored JSONL、CSV、summary、audit 和 provenance；raw/workdir 留本地。
- [ ] 更新 `experiment-results.md`、`optimization-and-artifacts.md` 和本计划 ledger。
- [ ] 追加 conversation log，运行完整质量门禁，代码审查后提交推送。

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
