# Skill IR 研究历史与文档迁移

本文件只记录研究演进、关键决策和旧文档迁移。被吸收文档的完整原文由 Git 历史
保留，不在仓库中复制 archive。

## 1. 恢复历史原文

查看某文件删除前版本：

```powershell
git log --all -- <old-path>
git show <commit>:<old-path>
```

查看治理前完整文档树：

```powershell
git ls-tree -r --name-only 2884d92 docs/skill-ir docs/superpowers
```

## 2. 研究演进

### 2026-07-04 至 2026-07-06：项目定位和 IR 基础

- 从“把 skill 转成代码”收紧为 SkVM AOT pass 中的 Skill IR。
- 建立 schema、parser、validator、trace annotation、passes 和 lowering。
- 初始规模设想用于探索，后来不再作为当前成功标准。

关键原则：静态阅读与动态 execution feedback 都进入优化，但必须通过显式 IR 和
provenance，而不是直接改 prompt。

### 2026-07-07 至 2026-07-10：Synthetic Task 11 工具链

- 建立 matrix、real-agent runner、raw/scored JSONL、analyzer 和 context slice。
- 跑 clean/noisy/long/compressed 与多个模型。
- 加入 route health、harder held-out seed task、promotion policy 和 validation planner。

结果显示部分 seed 上 IR 有增益，但许多任务过易，模型族行为不同，且 token 常
增加。这一阶段降级为 calibration evidence。

### 2026-07-13：研究证据校准

- Synthetic seed 标为 `calibration-low`。
- No-skill 重新成为主基线。
- Token reduction 降为 secondary/break-even future claim。
- 工程终态定义为 Validated Skill Artifact Package。
- 确定真实来源和 3+3 pilot。

### 2026-07-15：真实 Skill 纵向链路

- 审计四个来源，提交 Wave A source closure 和 provenance。
- Exact original file materialization、run identity、persistent workdir 和 scorer 成立。
- Env-manager 2 development + 2 held-out task 和六项 deterministic evaluator 完成。
- Pre-IR calibration 发现 original 未优于 no-skill。
- Static IR 提高 partial score 并消除 hard-gate failure，但仍 0/4。

### 2026-07-16：Final IR 与 Executable Artifact

- Dual-source original/static residual repair 和 provenance v2 完成。
- 两个 Final IR candidate 均未过门。
- Artifact v1 建立 package/compiler/preflight/checker/one-repair runtime，暴露 semantic
  false pass 和 repair 休眠。
- Semantic v2 加入保守 A evidence、dormant B isolation 和 protected runtime contract。
- 本地 activation 成立；真实 development 触发两次 repair，但 gate 失败。
- Held-out 正确保持阻断。

## 3. 关键冻结决策

1. 完整主表固定为 `no-skill | original | ir-static | ir-pgo`。
2. `ir-pgo` 只消费通过 development gate 的 provenance-bound Final IR。
3. Dynamic overlay 使用 original/static 双源，不读取 scorer expected。
4. Wave B 必须使用冻结 Wave A 方法，不能继续调同一配置。
5. Runtime validator 与 offline scorer 分离。
6. Repair 最多一次，revalidation 后停止。
7. V1/V2 package、lock 和失败结果不可原地调优。
8. 当前不声称 held-out、跨模型、跨 agent、跨 OS 或 token 节省。

## 4. 文档治理决策

2026-07-16 将 61 份阶段性/当前 Markdown 重建为 11 份权威文档：

- 不机械拼接旧文档；
- 当前内容按 reader task 重写；
- 单次实验压为结果表和 `results/` 索引；
- 旧全文由 Git 保留；
- 全项目旧路径引用清零后删除原文件；
- 新增自动断链和 legacy path 检查。

2026-07-21，独立周报讲稿从当前文档集移除；当前权威集合为 10 份。该变化不影响
研究契约、组件说明、冻结实验结果或 Git 中的历史版本。

## 5. 旧路径迁移

### IR Core

以下文件迁移到 `docs/skill-ir/ir-core.md`：

```text
docs/skill-ir/aot-passes.md
docs/skill-ir/ir-parser.md
docs/skill-ir/ir-validator.md
docs/skill-ir/lowering.md
docs/skill-ir/profiler-traces.md
docs/skill-ir/skill-ir-v1.md
```

### Evaluation System

以下文件迁移到 `docs/skill-ir/evaluation-system.md`：

```text
docs/skill-ir/automated-validation-strategy.md
docs/skill-ir/benchmark-matrix.md
docs/skill-ir/corpus-fixtures.md
docs/skill-ir/experiment-design.md
docs/skill-ir/final-ir-promotion-policy.md
docs/skill-ir/harder-held-out-tasks.md
docs/skill-ir/real-agent-dry-run.md
docs/skill-ir/real-agent-scoring.md
docs/skill-ir/result-analysis.md
docs/skill-ir/route-health-probe.md
docs/skill-ir/validation-planner.md
```

### Optimization And Artifacts

以下文件迁移到 `docs/skill-ir/optimization-and-artifacts.md`：

```text
docs/skill-ir/env-manager-dual-source-overlay.md
docs/skill-ir/executable-artifact-runtime.md
docs/skill-ir/profile-feedback-loop.md
docs/skill-ir/semantic-artifact-runtime.md
docs/skill-ir/validated-skill-artifact-package.md
```

### Real Skill Pilots

以下文件迁移到 `docs/skill-ir/real-skill-pilots.md`：

```text
docs/skill-ir/env-manager-base-ir-source-audit.md
docs/skill-ir/env-manager-pilot.md
docs/skill-ir/env-manager-static-ir-design.md
docs/skill-ir/env-manager-vertical-and-pooled-overlay-design.md
docs/skill-ir/project-audit-and-realignment.md
docs/skill-ir/real-pilot-execution-contract.md
docs/skill-ir/real-skill-intake.md
```

### Experiment Results

以下文件迁移到 `docs/skill-ir/experiment-results.md`：

```text
docs/skill-ir/case-studies.md
docs/skill-ir/discriminative-task11-run.md
docs/skill-ir/env-manager-calibration-v1-run.md
docs/skill-ir/env-manager-executable-artifact-v1-run.md
docs/skill-ir/env-manager-semantic-artifact-v2-run.md
docs/skill-ir/env-manager-static-v1-run.md
docs/skill-ir/final-ir-multiskill-multimodel-run.md
docs/skill-ir/harder-heldout-compressed-gpt41nano-run.md
docs/skill-ir/harder-heldout-compressed-run.md
docs/skill-ir/ir-pgo-validation-gpt41nano-run.md
docs/skill-ir/multimodel-hard002-run.md
docs/skill-ir/real-agent-smoke-run.md
docs/skill-ir/true-long-task11-run.md
docs/skill-ir/true-noisy-task11-run.md
```

### Historical Plans And Designs

以下文件由本文件摘要，完整内容从 Git 获取：

```text
docs/skill-ir/env-manager-fixture-validator-implementation-plan.md
docs/skill-ir/real-pilot-correctness-plan.md
docs/skill-ir/real-pilot-runtime-contract-implementation-plan.md
docs/superpowers/plans/2026-07-15-env-manager-static-ir.md
docs/superpowers/plans/2026-07-15-tasks-authored-calibration.md
docs/superpowers/plans/2026-07-16-document-consolidation.md
docs/superpowers/plans/2026-07-16-dual-source-overlay.md
docs/superpowers/plans/2026-07-16-executable-artifact-package-implementation.md
docs/superpowers/plans/2026-07-16-semantic-artifact-v2-implementation.md
docs/superpowers/plans/2026-07-16-weekly-report.md
docs/superpowers/specs/2026-07-16-document-consolidation-design.md
docs/superpowers/specs/2026-07-16-dual-source-overlay-design.md
docs/superpowers/specs/2026-07-16-runner-orchestrated-artifact-package-design.md
docs/superpowers/specs/2026-07-16-semantic-artifact-v2-design.md
docs/superpowers/specs/2026-07-16-weekly-report-design.md
```

## 6. Commit 入口

| 阶段 | 代表 commit |
|---|---|
| IR schema/validator/parser | `4ad6f49`, `0f450fa` 及相邻提交 |
| Real evidence realignment | `7c0dfc0`, `3a4ad40`, `02cc70f` |
| Real source/provenance | `72af4df`, `6778e22`, `031e0e7` |
| Env-manager scorer/static | `a1480f2`, `78c02b7`, `2a10a38` |
| Dual-source Final IR | `97c0ec8` |
| Artifact v1 | `92f1880` 至 `1dc988d` |
| Semantic v2 | `0a4a1ee` 至 `f4cfe22` |
| Weekly report | `3bf69be` |

## 7. 使用历史时的边界

- 旧计划描述当时假设，不自动覆盖当前 spec。
- 旧 synthetic run 不自动升级为 real-skill evidence。
- 旧 scorer amendment 必须与对应 result identity 一起解释。
- 当前状态以 `README.md`、spec、plan 和 experiment results 为准。
