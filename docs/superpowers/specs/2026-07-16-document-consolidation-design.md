# Skill IR 文档压缩与入口治理设计

**状态：** 已确认方案，待书面复核

**日期：** 2026-07-16

## 1. 目标

把当前分散在 `docs/skill-ir/` 与 `docs/superpowers/` 的 60 份 Markdown
压缩为约 11 份面向不同阅读任务的权威文档。治理的核心是减少文档总数和
重复内容，不是把原文件搬进 archive 目录。

历史原文由 Git 历史保留。仓库中只保留一份紧凑的历史文档，用于记录研究
演进、冻结决策和旧路径到新入口的迁移映射。

## 2. 当前问题

当前结构存在四类认知负担：

1. 50 份 `docs/skill-ir/*.md` 全部平铺在同一目录。
2. 当前契约、组件说明、设计草案、实施计划和单次实验结果混在一起。
3. 主 spec 约 51 KiB，主 plan 约 109 KiB，早期历史与当前状态并存。
4. 60 份文档中 48 份有仓库内引用，不能按文件名直接批量删除。

## 3. 目标文档集合

治理后保留以下 11 份文档：

| 文件 | 权威职责 |
|---|---|
| `docs/skill-ir/README.md` | 唯一入口、阅读顺序、状态图和链接索引。 |
| `docs/skill-ir/skill-ir-aot-optimization-spec.md` | 当前研究契约、claim、证据边界、工程终态。 |
| `docs/skill-ir/skill-ir-aot-optimization-plan.md` | 当前状态、下一步、冻结项，不保留早期逐任务教程。 |
| `docs/skill-ir/ir-core.md` | Schema、parser、validator、profiler、passes、lowering。 |
| `docs/skill-ir/evaluation-system.md` | Corpus、matrix、runner、scorer、analyzer、route health。 |
| `docs/skill-ir/optimization-and-artifacts.md` | Profile feedback、dual-source Final IR、package v1、semantic v2。 |
| `docs/skill-ir/real-skill-pilots.md` | 真实来源、provenance、Wave A/B、env-manager 任务和 scorer。 |
| `docs/skill-ir/experiment-results.md` | 冻结实验时间线、结果表、claim 边界和 `results/` 索引。 |
| `docs/skill-ir/history.md` | 研究演进、关键决策、被吸收文件到新入口的映射。 |
| `docs/skill-ir/related-work.md` | 论文基础和项目定位。 |
| `docs/skill-ir/weekly-report-2026-07-13-to-2026-07-16.md` | 本周中文汇报稿。 |

`skill-ir-aot-optimization-spec.md` 和
`skill-ir-aot-optimization-plan.md` 保持原路径，兼容项目规则和既有工作流。

## 4. 合并映射

### 4.1 合并到 `ir-core.md`

```text
aot-passes.md
ir-parser.md
ir-validator.md
lowering.md
profiler-traces.md
skill-ir-v1.md
```

### 4.2 合并到 `evaluation-system.md`

```text
automated-validation-strategy.md
benchmark-matrix.md
corpus-fixtures.md
experiment-design.md
final-ir-promotion-policy.md
harder-held-out-tasks.md
real-agent-dry-run.md
real-agent-scoring.md
result-analysis.md
route-health-probe.md
validation-planner.md
```

### 4.3 合并到 `optimization-and-artifacts.md`

```text
env-manager-dual-source-overlay.md
executable-artifact-runtime.md
profile-feedback-loop.md
semantic-artifact-runtime.md
validated-skill-artifact-package.md
```

### 4.4 合并到 `real-skill-pilots.md`

```text
env-manager-base-ir-source-audit.md
env-manager-pilot.md
env-manager-static-ir-design.md
env-manager-vertical-and-pooled-overlay-design.md
project-audit-and-realignment.md
real-pilot-execution-contract.md
real-skill-intake.md
```

### 4.5 合并到 `experiment-results.md`

```text
case-studies.md
discriminative-task11-run.md
env-manager-calibration-v1-run.md
env-manager-executable-artifact-v1-run.md
env-manager-semantic-artifact-v2-run.md
env-manager-static-v1-run.md
final-ir-multiskill-multimodel-run.md
harder-heldout-compressed-gpt41nano-run.md
harder-heldout-compressed-run.md
ir-pgo-validation-gpt41nano-run.md
multimodel-hard002-run.md
real-agent-smoke-run.md
true-long-task11-run.md
true-noisy-task11-run.md
```

### 4.6 合并到 `history.md`

```text
docs/skill-ir/env-manager-fixture-validator-implementation-plan.md
docs/skill-ir/real-pilot-correctness-plan.md
docs/skill-ir/real-pilot-runtime-contract-implementation-plan.md
docs/superpowers/specs/*.md
docs/superpowers/plans/*.md
```

`history.md` 不全文复制这些文件，只记录：原路径、日期、目的、最终状态、
替代入口和关键决策。完整原文通过 Git commit/history 获取。

## 5. 主 Spec 与 Plan 压缩

### Spec

只保留：

- 当前主 claim 与报告列；
- 已测轴和计划轴；
- PGO/Final IR/held-out 契约；
- artifact maturity 与北向目标；
- 当前 env-manager v2 结果；
- 不支持的主张。

早期 40-60 skill 规模、逐任务实现细节、完整文献摘录和历史运行过程移入
`history.md` 或对应组件文档。

### Plan

只保留：

- 当前 execution ledger；
- 已完成能力的紧凑清单；
- 当前阻塞和下一阶段；
- 冻结/禁止事项；
- 质量门禁。

Task 0-12 的逐步代码示例、旧 checkbox 和已完成阶段计划由 Git 历史和
`history.md` 接管。

## 6. 引用迁移规则

1. 先创建并验证新文档，再删除旧文档。
2. 所有精确旧路径替换为新权威路径，必要时带 Markdown anchor。
3. 替换范围包括全部 Git tracked 文件：代码、benchmark、JSON、Markdown、
   scripts 和结果元数据。
4. 周报中的现场文件顺序和命令说明同步更新。
5. 不修改冻结实验数字、package digest、lock 或 scored results。
6. 旧路径入站引用清零后才执行 `git rm`。
7. 删除后的原文通过 Git 历史恢复，不在仓库中创建重复 archive copy。

## 7. 自动断链检查

新增一个小型文档检查器和测试：

```text
scripts/check_skill_ir_doc_links.py
scripts/check_skill_ir_doc_links_test.py
```

检查器必须：

- 枚举 Git tracked 文本文件；
- 提取 `docs/skill-ir/*.md` 和 `docs/superpowers/**/*.md` 路径引用；
- 检查目标文件存在；
- 检查 Markdown 相对链接指向存在文件；
- 报告旧文档路径残留；
- 不扫描 `.git`、`.skvm`、raw workdir 或未跟踪实验材料。

治理完成的门禁是：

```text
canonical Markdown count = 11
broken tracked document references = 0
absorbed legacy path references = 0
weekly report references = current
git diff --check = pass
```

## 8. 删除与保留边界

可以删除：内容已合并、引用已迁移、结果由 `results/` 保留、原文可由 Git
历史恢复的 Markdown。

不能删除或改写：

- committed scored JSONL、CSV、summary 和 provenance；
- package、manifest、lock 和 source closure；
- 主 spec/plan 的稳定路径；
- 本周汇报稿；
- 当前代码所需的非文档 fixture。

## 9. 实施阶段

1. TDD 实现文档引用检查器。
2. 创建 7 份新入口/合并文档，并压缩 spec/plan。
3. 全局替换所有旧路径引用。
4. 更新周报的文件位置、现场顺序和命令说明。
5. 运行引用检查，确认旧路径零入站。
6. 删除 46 份被吸收的旧 `docs/skill-ir` 文档和包括本设计在内的 11 份
   `docs/superpowers` 阶段 spec/plan；最终总数为 11。
7. 运行文档、测试、编码和 Git 验证，追加 conversation log。

## 10. 非目标

- 不改功能代码、实验 scorer、package 或结果。
- 不重跑模型实验。
- 不把历史文件原样复制到 archive 目录。
- 不为了减少文件数把所有内容塞回一个超大 spec。
- 不承诺外部网站或旧 GitHub commit 中的历史链接自动重定向。
