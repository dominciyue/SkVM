# Skill IR 文档入口

本目录是 SkVM Skill IR / AOT 优化研究的唯一文档入口。当前项目研究如何把
自然语言 skill 编译成结构化 IR 和可执行 artifact，并利用 development
execution feedback 改善稳定性。

## 当前状态

- 已完成 Skill IR schema、parser、validator、profiler、静态 passes 和 lowering。
- 已建立真实 skill provenance、runner、持久化 workdir、确定性 scorer 和结果分析链路。
- `env-manager` 是当前唯一完成纵向实验的真实 pilot。
- `ir-static` 在冻结 development run 中改善了 partial correctness，但仍为 0/4 success。
- Dual-source Final IR、artifact v1 和 semantic artifact v2 均未通过 development gate。
- V2 真实触发了两次 repair，但均未通过 revalidation；held-out 未执行。
- 当前不能声称跨模型、跨 agent、跨 OS 或 token 节省。

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
3. `docs/skill-ir/weekly-report-2026-07-13-to-2026-07-16.md`

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
| `weekly-report-2026-07-13-to-2026-07-16.md` | 中文周报讲稿。 |

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
