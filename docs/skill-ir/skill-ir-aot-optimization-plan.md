# Skill IR AOT 当前执行计划

更新于 2026-10-05。本页维护未达责任与长期边界；阶段原件通过[研究正文](skill-dsl-research.md)、[历史](history.md)和[实验目录](../../results/skill-ir/experiment-catalog.json)查阅。

- 唯一实时入口：[current-status](current-status.md)。
- 最近任务书：[AT0–AT19 源码解释闭合与普通 skill 交付](../superpowers/plans/2026-10-05-authorization-focused-closure-and-delivery.md)，有限队列已收束，完整质量与净收益未达；[AT summary](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/summary.json)为实际结论。AS原件保留。
- 方法合同：[spec §14.34](skill-ir-aot-optimization-spec.md#1434-at-focused-source-transactions)。
- 根因复核与设计：[研究 §7.49](skill-dsl-research.md#749-as-复核与-at-源码解释闭合计划)。

## 当前目标

让模型集中解释当前源码，宿主管理稳定的解释事务、机械身份、摘要组合与同源答案。优先闭合已读helper、参数/对象关系、授权条件和实际源码效果，再验证普通skill与变化复用。沿用现有CLI、领域核心和只读工具。

AR原始结果和停止快照保持。AS已实现共享局部语义与修复、运行全部可准入首轮/原skill/作者消费并完成评阅，质量和真实变化复用验收未达。投入约60%质量、40%编写复用及约12小时是主动工作安排，不作为质量结论或追加重复实验的理由。

## AT 队列

| 阶段 | 本轮工作 | 当前状态 |
|---|---|---|
| AT0–AT2 | 接管、义务与完成边界、失败测试 | 完成 |
| AT3–AT7 | 持久focus、摘要组合、来源检查、阶段上下文与双入口 | 工程实现完成；未建立完整质量收益 |
| AT8–AT9 | 两个真实纵向案例、即时修复及框架/多问题缺口 | 8个调试尝试已评阅；最终仍partial |
| AT10–AT13 | 两原skill原/变、4作者稿消费、真实变化与适用性 | 全部适用位置完成；native自然充分2/4、formal0/4；作者4有效、消费者均partial；4fresh partial、2previous阻断0调用 |
| AT14–AT16 | 4任务三臂12位置、逐条评阅/小消融、实际减负 | 首轮12/12运行、0完整；具名定位回修消除假入口仍partial；只有机械減负，底层未通不填消融 |
| AT17–AT19 | 联合验证、唯一研究正文和发布 | 37原件零调用重放、相关回归/provider及双类型通过；工程与证据交付，origin发布回执以Git为准 |

AS保留12个首轮0完整、4native最后1形式通过/0完整、4作者稿有效但消费均partial的原结果。新队列对接这些缺口，原始问题不删减、评价答案不进入模型输入。具体分母在AT0登记；原结果见[AS summary](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/summary.json)。

本轮不再重抽。后续代码责任是 `inquiry-focus.ts` / `inquiry-worklist.ts` 的问题相关定位和继承关系闭合，`inquiry-semantic.ts` / `semantic-flow.ts` 的真实callee参数/对象连接与有序权限谓词边界。先取得full源码且checked/bounded的当前base，再作政策/前提previous和同版本质量/成本比较；不得借新identity复跑旧失败来替代接口改进。

## 失败处理

1. 每项真实不良表现当场定位、针对性修复并复验；同根因共用修复，逐项关联结果。共享缺陷暂停受影响派发，不耗完整批次后再修。
2. 原答、修订、未派发和未知分别保留。格式、源码遗漏、语义、检查器和运行环境错误分开，修格式后仍评价原任务。
3. 新的修订必须有新的诊断依据；同一错误两轮无进展时调整接口/任务调度，不原样反复重抽。无法消除的未知保留并继续独立工作。
4. 封存按逻辑任务及来源识别，不用 AT 新身份、改文件名或新模型绕过。零派发配置失败可在明确恢复后继续；仅USD/usage未知不扩大为未知完成。
5. 已接受提取事实仍须独立源码评价；evaluator、旧答案和人工正确图不进入被测模型输入。

## 工作及治理边界

- 在 `skill-ir-aot` 继续，仅发布用户 `origin`，不新建分支或 worktree。AT启动后成为共享状态与Git唯一写者。
- 新能力 opt-in，旧默认/协议及历史结果保留。保护输入、Q1、readiness 与旧 prospective 不动。
- 允许认证网络及有目的模型调用；计量实际 provider 调用、token、时间、已知费用及 unknown，开发代理成本分列。
- 只分析允许源码，不执行目标、验证部署或自动应用业务 patch。源码行为、用户前提、规范政策、模型解释、宿主派生分别标来源。
- 后续问题继续写入现有研究正文和相应组件章节；阶段状态、失败、评审和费用存 results。临时运行集中在 `project-maintenance/runs/<identity>/`。
- [治理任务书](../superpowers/plans/2026-10-04-workspace-and-document-governance.md)及本地恢复索引负责原件收存。已结束 AR 的机器状态仅为最后快照，不再作为当前队列执行命令。
