# 历史结论与恢复

当前开发从 [current-status](current-status.md) 进入。旧任务书、设计稿、研究流水与重复汇报已退出工作目录，原始实验报告仍在原位置，历史正文由 Git 保存。

## 2026-10-28 新课题切换前的阶段索引

| 阶段 | 已形成的资产与主要结论 | 证据入口 |
|---|---|---|
| IR/AOT 与 API、Env 开发 | 解析、校验、构造及有限产物检查可复用；局部通过不代表整个 skill 自动化 | [证据索引](evidence-index.md)、[API 组件](api-task-engine.md) |
| 真实 trace 驱动的包优化 | 已有脚本生成、包导出和再次消费；质量、时间及 token 收益 mixed | [U 总报告](../../results/skill-ir/trace-guided-skill-optimization-20260913/final-report.json)、[G 总报告](../../results/skill-ir/general-skill-optimization-20260913/final-report.json) |
| 分类与 DSL 准备 S/D/E/T | 已暴露语料用于开发，形成任务范围和评价材料；不是生态分布或未见泛化结论 | [S 研究结果](../../results/skill-ir/skill-task-dsl-preparation-20260919/research-report.md)、[研究结果根](../../results/skill-ir/skill-dsl-research/) |
| 授权分析 V–BE | 普通入口、源码工具、作者与复用链形成；未建立稳定的 DSL 表示优势 | [机器目录](../../results/skill-ir/experiment-catalog.json)及各主题验收矩阵 |
| 可执行授权程序 BF–BT | 有限程序能试跑、修订、搬移和变化失效；局部行为与整题自然回答仍有差距 | [Download 示例](../../examples/authorization-assessment/download-workflow/README.md)、[Memos 示例](../../examples/authorization-assessment/shared-link-workflow/README.md) |
| 源码差分 BU | M 六输入、五要求共 30 项：base 14/9/7、check 23/4/3（匹配/反例/未知）；G 仅源码评阅。局部修稿有效，一般质量和净收益未建立 | [BU 汇总](../../results/skill-ir/skill-dsl-research/development/authorization-source-differential-v1/summary.json)、[验收](../../results/skill-ir/skill-dsl-research/development/authorization-source-differential-v1/verification/acceptance-matrix.json) |

以上各阶段均已结束。新课题继承运行、检查和状态管理资产，按类别选择固化粒度及真实恢复收益需要重新验证。各阶段分母、原始失败、未知费用和研究边界按原报告解释，不合并成一个总成功率。

## 读取或恢复旧文档

本次精简前的完整文档快照在提交 **`6ef2126c869ce7d74b0121d0802cbe0af3cb48d4`**。已删除路径列于[退休路径清单](../../scripts/skill_ir_legacy_doc_paths.txt)；本次删除名单及保留依据见[治理盘点](../../results/skill-ir/governance-inventory-20261028.json)。

在仓库中读取旧正文，不需要改变工作区：

```powershell
git show 6ef2126c:docs/skill-ir/skill-dsl-research.md
git show 6ef2126c:docs/skill-ir/developer-guide.md
git show 6ef2126c:docs/skill-ir/skill-ir-aot-optimization-spec.md
git show 6ef2126c:docs/superpowers/plans/2026-10-21-authorization-source-differential-verification.md
```

需要更早某次实验的合同，以该实验记录的提交为准。若文档在此次治理之前已经删除，可先执行 `git log --all -- <仓库相对路径>`；删除提交的父提交仍有正文。旧 `history.md` 在上述快照中也保留了早期路径和恢复提交表。

确实需要恢复为工作文件时，先确认目标无新修改，再执行 `git restore --source=<原提交> -- <路径>`。历史验证需使用实验自己的提交、依赖和行尾约定；不要拿当前文档冒充当时冻结的字节。

## 为什么还有旧 Markdown

[文档清单](../../scripts/skill_ir_doc_governance.json)中的 `versionedMaterials` 是运行/验证输入，不是额外的当前说明：

| 保留组 | 实际读取方 |
|---|---|
| API request/form/body-negatives 三份开发合同 | `scripts/skill-ir/api-request-specimens-development.ts`、`src/skill-ir/skill-family-current-v2-n10-revision.ts` |
| 分类手册及分类方法材料 | 分类与 annotation-package 的冻结输入、验证记录 |
| class-proof 恢复材料与 2026-09-11 任务书 | `scripts/skill-ir/skill-family-class-proof.ts` 的 E6 文件绑定 |
| current-v2 状态、复现、review 与 2026-09-12 任务书 | `scripts/skill-ir/skill-family-current-v2-prospective.ts` 的输入/报告绑定 |

这些文件保留原路径和原字节。N7 readiness 的旧 spec 通过 `git show <codeCommit>:<path>` 读取，因此不需要在当前目录保留一份巨大 spec。BS 的一次性文档验证脚本也应在其历史提交执行。

## 本地材料与日常维护

- 2026-10-04 搬迁材料的 ZIP、原路径和恢复前缀见仓外 `project-maintenance/20261004-governance/archive-index.json`。2026-10-28 已核对并删除的展开副本按 `project-maintenance/20261028-deep-clean/README.md` 恢复。
- 导师讨论稿、已结束复核的重复说明、Git 已有副本及被最终稿取代的治理中间稿已删除。原始运行记录、归档包、唯一未提交差异、旧交接备忘和个人正式报告保留。
- 新方法只更新[主文档](tiered-solidification.md)，实施顺序只更新[当前计划](skill-ir-aot-optimization-plan.md)，逐次执行记录进入对应结果根或 Git。不要再为每次复核复制一份研究总文档。
