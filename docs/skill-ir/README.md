# Skill IR 文档入口

本目录是 SkVM Skill IR / AOT 优化研究的唯一文档入口。当前项目研究如何把
自然语言 skill 编译成结构化 IR 和可执行 artifact，并利用 development
execution feedback 改善稳定性。

## 当前状态

- 已完成 Skill IR schema、parser、validator、profiler、静态 passes 和 lowering。
- 已建立真实 skill provenance、runner、持久化 workdir、确定性 scorer 和结果分析链路。
- `env-manager` 已形成确定性 repair 的 development 机制信号：3 个完整 pair 为
  `0.90 -> 1.00`，但固定分母含 1 个 infrastructure failure，gate 未通过。
- Law validated artifact 的冻结 development 为 4/4、mean 0.925、gate 通过；独立 held-out
  为 2/4、mean 0.725，并在 manual task 上两次回归，package 未晋升。
- `experimental-design` v1 因私有 enum、唯一 schedule 和报告字面量约束冻结为低权重历史证据。
- `experimental-design` v2 的 contract audit 42/42、materialization audit 36/36，stable Pi
  harness 已达到 8/8 rows、0 infrastructure；但普通与 harder 两批 no-skill/original 都为
  4/4、mean 1.00、0 differing pair，base IR 与 held-out 均未放行。
- Task 16.20 task-sufficiency audit 发现 13/13 scorer-required 操作要求已向 no-skill 披露，
  原 skill 的 6 类增量知识 0/6 被旧 scorer 测量。Task 16.21 已建立 skill-unique surface，完成
  18/18 differential、36/36 materialization audit。Direct Node + short-path 修复后 qualification 通过，
  唯一 8-row 强模型矩阵为 8/8、0 infrastructure；但 no-skill/original 均 4/4、mean 1.0、0 differing
  pair，original token 为 no-skill 的 3.1794 倍。Task 16.21 按停止规则关闭，base IR/held-out 不放行；
  下一步转向 Wave B 的不同真实 skill，不继续增加 experimental-design harder task 或 runtime 版本。
- Task 16.22 已选择真实 `api-tester` 作为首个 Wave B replication，并在 scorer 前冻结 exact source、
  public generator ABI、2 development + 2 held-out split。公开 OpenAPI oracle 与五项确定性 evaluator 已
  TDD 实现，可接受合法边界/越界无效两类策略并拒绝主要语义与产物错误。Development contract audit
  18/18、production materialization 36/36 已持久化。强模型 calibration lock 已在付费前冻结，8-row/
  4-pair short-path dry-run 全绿；qualification、baseline 和 IR 尚未运行，corpus 仍为 `tasks-authored`。
- 已加入 skill-neutral 的付费前 benchmark contract audit。三个 Wave A v1 benchmark 均未通过：
  env-manager 缺公开精确 schema rule 与分类金标合同，Law 的两个任务都拒绝等价审核措辞，
  experimental-design 的 plan 合同 2/2 通过，但 assignment、allocation、report 共 6/6
  等价实现被拒且四类 plan 约束未公开；三者未来权重降为 `support-real`，历史结果保持不可变。
- 当前不能声称跨模型、跨 agent、跨 OS 或 token 节省。

当前活跃开发只读取本文件、spec 最新章节、plan 的“当前执行窗口”和对应组件文档。历史 lock、
runner、package 与 result 保持原路径以维持 digest/provenance，不属于默认修改面。

## 按读者选择入口

### 第一次了解项目

1. `docs/skill-ir/skill-ir-aot-optimization-spec.md`
2. `docs/skill-ir/experiment-results.md`
3. `docs/skill-ir/skill-ir-aot-optimization-plan.md`

### 修改 Skill IR 核心

1. `docs/skill-ir/ir-core.md`
2. `src/skill-ir/`
3. `src/profiler/`

### 修改 runner、scorer 或分析器

1. `docs/skill-ir/evaluation-system.md`
2. `src/benchmarks/skill-ir/`
3. `src/bench/evaluators/env-manager-grade.ts`

### 修改 PGO、Final IR 或 artifact runtime

1. `docs/skill-ir/optimization-and-artifacts.md`
2. `src/benchmarks/skill-ir/repair-evidence.ts`
3. `src/benchmarks/skill-ir/artifact-runtime.ts`
4. `src/benchmarks/skill-ir/semantic-evidence.ts`

### 扩充真实 skill

1. `docs/skill-ir/real-skill-pilots.md`
2. `benchmarks/skill-ir/corpus/real-skill-intake.json`
3. `benchmarks/skill-ir/corpus/corpora/pilot.json`

### 查看实验或准备汇报

1. `docs/skill-ir/experiment-results.md`
2. `results/skill-ir/`

## 权威文档

| 文档 | 职责 |
|---|---|
| `skill-ir-aot-optimization-spec.md` | 当前研究契约、claim 和证据边界。 |
| `skill-ir-aot-optimization-plan.md` | 当前进度、下一步和冻结项。 |
| `ir-core.md` | IR 核心类型、接口、passes 和 lowering。 |
| `evaluation-system.md` | Corpus、matrix、runner、scorer、analyzer。 |
| `optimization-and-artifacts.md` | 动态回流、Final IR、package 和 runtime。 |
| `real-skill-pilots.md` | 真实来源、Wave A/B 和 env-manager 契约。 |
| `experiment-results.md` | 冻结实验结果与 `results/` 索引。 |
| `history.md` | 研究演进和旧文档迁移映射。 |
| `related-work.md` | 相关论文和项目定位。 |

## 代码与数据地图

```text
src/skill-ir/                         Skill IR schema/parser/validator/passes/lowering
src/profiler/                         trace 和 profile annotation
src/benchmarks/skill-ir/              matrix/runner/scoring/feedback/artifact
src/bench/evaluators/                 确定性 benchmark evaluator
benchmarks/skill-ir/corpus/            corpus registry 和 provenance
benchmarks/skill-ir/pilots/            真实 pilot source/tasks/IR/package/lock
results/skill-ir/                      committed scored rows、summary、CSV、provenance
.skvm/                                 本地配置、cache、log、raw source checkout，不提交
```

## 主流程

```text
Public SKILL.md + source provenance
  -> static parse/audit
  -> base Skill IR
  -> validate + static passes
  -> ir-static
  -> original/static development execution
  -> typed residual RepairEvidence
  -> provenance-bound Final IR candidate
  -> artifact package compiler
  -> preflight + runtime contract + generation
  -> validate + at most one repair + revalidate
  -> deterministic offline scorer
  -> development gate
  -> held-out only if gate passes
  -> freeze pass/failure without held-out feedback
```

## 常用无成本验证

```powershell
cd D:\skill优化\SkVM
python scripts/check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py --root .
bun test ./src/benchmarks/skill-ir
bun run typecheck
git diff --check
```

验证 semantic artifact package：

```powershell
bun ./src/benchmarks/skill-ir/semantic-artifact-run.ts `
  '--verify-only=benchmarks/skill-ir/pilots/env-manager/packages/executable-semantic-artifact-v2'
```

## 文档规则

1. 当前规则只写入上述权威文档，不再为每轮小修改新增 Markdown。
2. 组件行为变化时更新对应组件文档，不在 spec/plan 复制完整实现。
3. 单次实验的详细数据进入 `results/`；`experiment-results.md` 只保留索引和结论。
4. 历史设计不在仓库重复存全文；Git history 保存原文，`history.md` 保存决策摘要。
5. 新增或改名文档后必须运行链接检查器。
6. 任何 held-out、跨模型或 token 主张必须能回指冻结结果，不能从计划推断。
