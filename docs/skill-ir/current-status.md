# Skill IR 当前状态

更新于2026-10-23（Asia/Shanghai）。工作分支为 `skill-ir-aot`，仅发布到用户 `origin`。本页是唯一实时状态入口；历史任务书与结果保留当时记录。

## 当前工作

**BU0–BU19已完成并发布，实质成果`0b46a974`已核对用户origin。** [任务书](../superpowers/plans/2026-10-21-authorization-source-differential-verification.md) identity为`authorization-source-differential-v1`。M检查臂通过普通反例反馈修复局部提前拒绝，base未修；G两臂均修复converter后的201，只有源码评阅依据。十用途全部交付，11尝试、18实际推理turn及2个派发前拒绝记录，1次具名CLI恢复；无活动/未知请求。见[汇总](../../results/skill-ir/skill-dsl-research/development/authorization-source-differential-v1/summary.json)、[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-source-differential-v1/verification/acceptance-matrix.json)与[执行记录](../../results/skill-ir/skill-dsl-research/development/authorization-source-differential-v1/execution.md)。

保留独立任务要求、参数敏感M原函数观察及普通反例修稿。当前加五个预登记变化输入：M base为14匹配/9反例/7未知，check为23/4/3；遗留audience提前退出和错误结果缺观察明确保留。两次实际使用采用有限结果并披露原稿缺口，完整自动语义、一般安全与稳定质量/净收益未建立。源码忠实性、用户政策、原题完整性分开评价。方法见[spec§14.60](skill-ir-aot-optimization-spec.md#1460-bu-source-differential-verification)、[研究§7.82](skill-dsl-research.md#782-bt-复核与-bu-源码差分核验)。旧原件、`.tmp/`和默认入口保留。

Stop That Shit 0.2.5本开发线程最初为observing/unconfirmed；随后通过本机初始化入口及真实hook确认armed。未手改状态或追加模型探针。全局AGENTS更新曾使M检查臂续作在派发前拒绝；用户明确授权继续后续队列，BU单独登记新通用指令摘要，保留原记录及实验输入/工具合同。U-M初次又因CLI升级在派发前拒绝；核验协议并以17a5d925精确接纳alpha.11后具名恢复，实际隔离检查通过。

## 账号、运行和继承边界

BU开发gpt-6-astra/high，实验官方gpt-5.6-sol/high；第三方暂停。十用途与一次具名恢复已关闭，旧active/unknown不重发，quota/auth规则保持。旧未知、费用和未运行分母不回填；既有隔离决定见[历史账号边界](history.md#账号运行和继承边界)。保留完整原skill、原问题、允许源码及独立政策；模型不能读评价器、历史答案和正确patch。held-out、Q1、prospective、readiness与项目默认保持。主线程唯一写入，继续skill-ir-aot，仅用户origin。

## 能力与证据边界

| 路线 | 已有基础 | 当前需要验证 |
|---|---|---|
| 授权任务DSL | 领域声明、作者/prepare/edit/run/compare、只读取证、局部控制、材料失效、检查和账号双入口 | 性质相关范围、真实局部采用、完整原任务质量及变化复用 |
| Trace驱动skill优化 | 自动捕获、修改说明/脚本、局部修复、包导出和自然消费 | 历史收益mixed/negative，按具体包证据判断 |
| 确定性基础 | IR解析/验证、API Tester/Env后端、artifact/recipe导入 | 保留原支持合同及有界正反例，不混成当前DSL效果 |

质量约六成、编写复用约四成指开发投入，各项质量要求分别验收。工程测试、实际使用、同条件收益分别报告；688原件已无损归档为6分卷并核验，45次研究隔离原函数执行单列，美元与开发成本未知；协议失败保留端到端分母，源码语义与机械检查分别评价。

## 恢复和历史入口

各阶段长记录已迁入[历史归档](history.md#2026-10-22-当前入口历史归档)，阶段标题锚点保留在该页。

| 阶段 | 保留记录 |
|---|---|
| 当前BU | [任务书](../superpowers/plans/2026-10-21-authorization-source-differential-verification.md)、spec§14.60、研究§7.82；有限队列已发布，具名局部修复和实际使用成立，停止BU |
| 已结束BT | [任务书](../superpowers/plans/2026-10-21-authorization-semantic-validation-and-method-diagnosis.md)、spec§14.59、研究§7.81；M局部修复、G语义缺口、29/48域与0/8整题 |
| 已结束BS | [任务书](../superpowers/plans/2026-10-20-authorization-task-coverage-and-semantic-transfer.md)、spec§14.58、研究§7.80；有限队列完成，工程通过，完整语义/自然质量/稳定净收益未达 |
| 已结束BR | [任务书](../superpowers/plans/2026-10-19-authorization-evidence-backed-answers-and-task-transfer.md)、spec§14.57、研究§7.79；completed-with-unmet-criteria，九用途与一次确认完成；有限复用成立，完整语义/质量/稳定收益未达 |
| BQ | [任务书](../superpowers/plans/2026-10-18-authorization-source-program-consistency-and-task-execution.md)、spec§14.56、研究§7.78；最终3c3059a8已发布，两个缺陷修复，完整自然质量与稳定增量未达 |
| BP | [任务书](../superpowers/plans/2026-10-16-authorization-quality-evidence-and-branch-reliability.md)、spec§14.55、研究§7.77；最终27d59677，有限队列完成，完整语义和重复执行质量优势未达 |
| BO | [任务书](../superpowers/plans/2026-10-16-authorization-call-semantics-and-program-repair.md)、spec§14.54、研究§7.76；有限自动调用语义与维护结果保留 |
| BN | [任务书](../superpowers/plans/2026-10-15-authorization-purpose-scoped-authoring-and-consumption.md)、spec§14.53、研究§7.75；有限队列已发布，完整程序/整题质量/净收益未达，实质成果bd613fc2 |
| BM | [任务书](../superpowers/plans/2026-10-14-authorization-branch-completion-and-directed-consumption.md)、spec§14.52、研究§7.74；有限队列收束，A0/A1为15/18、14/18，首对negative，完整自动程序和收益未达 |
| BL | [任务书](../superpowers/plans/2026-10-14-authorization-reusable-program-semantics-and-delivery.md)、spec§14.51、研究§7.73；适用工程/八用途收束，自动范围15/18、两对negative、C2缺交付，完整研究目标未达 |
| BK | [任务书](../superpowers/plans/2026-10-13-authorization-recoverable-authoring-and-real-delivery.md)、spec§14.50、研究§7.72；适用工程/有限队列结束，自动主链和净收益未达 |
| BJ | [任务书](../superpowers/plans/2026-10-13-authorization-authoring-loop-and-program-completion.md)、spec§14.49、研究§7.71；离线工程已验证，R0原生命周期unknown且不重发，自动主链/四问交付/收益未达 |
| BI | [任务书](../superpowers/plans/2026-10-13-authorization-authoring-closure-and-reliable-consumption.md)、spec§14.48、研究§7.70；已发布，工程与有限队列完成，自动主链及稳定收益未达 |
| BH | [任务书](../superpowers/plans/2026-10-12-authorization-incremental-authoring-and-efficient-consumption.md)、spec§14.47、研究§7.69；有限队列完成、自动主链与稳定收益未达；实际程序、首失败、修复和分轴结论已归档 |
| BG | [任务书](../superpowers/plans/2026-10-12-authorization-end-to-end-practical-execution.md)、[summary](../../results/skill-ir/skill-dsl-research/development/authorization-practical-execution-v1/summary.json)、spec§14.46、研究§7.68；主链运行/变化成立，自动编写和净收益未达 |
| BF | [任务书](../superpowers/plans/2026-10-12-authorization-executable-contract-and-authoring.md)、[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-executable-contract-v1/verification/acceptance-matrix.json)、spec§14.45、研究§7.67；工程/有限队列收束，整题质量与净收益未达 |
| BE | [任务书](../superpowers/plans/2026-10-11-authorization-question-workflow-and-mechanism-value.md)、[执行收束](../../results/skill-ir/skill-dsl-research/development/authorization-question-workflow-v1/verification/authorized-execution-closeout.json)、[发布回执](../../results/skill-ir/skill-dsl-research/development/authorization-question-workflow-v1/verification/publication.json)、spec§14.44、研究§7.66；有限队列及发布完成、研究未达，不自动重抽 |
| BD | [任务书](../superpowers/plans/2026-10-11-authorization-semantic-completion-and-real-quality.md)、[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-completion-v1/verification/acceptance-matrix.json)、spec§14.43、研究§7.65；有限执行结束、5交付/0整题full/0合格性质/6未运行，最终发布6c8c79e3 |
| BC | [任务书](../superpowers/plans/2026-10-10-authorization-task-binding-and-replay-reliability.md)、[收束](../../results/skill-ir/skill-dsl-research/development/authorization-task-binding-v1/verification/authorized-execution-closeout.json)、spec§14.42、研究§7.64；5交付/0合格跨源性质/7资格阻断 |
| BB | [任务书](../superpowers/plans/2026-10-09-authorization-interprocedural-property-closure.md)、[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/verification/acceptance-matrix.json)、spec§14.41、研究§7.63 |
| BA | [任务书](../superpowers/plans/2026-10-09-authorization-semantic-submission-and-adoption.md)、[summary](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-submission-v1/summary.json)，spec§14.40、研究§7.62 |
| AZ | [任务书](../superpowers/plans/2026-10-09-authorization-property-abstraction-and-real-use.md)、[summary](../../results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/summary.json)，spec§14.39、研究§7.61 |
| AY | [任务书](../superpowers/plans/2026-10-07-authorization-question-dependencies-and-usable-dsl.md)、[最终收束](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/final-closure-v35.json)，研究§7.60保留v5/v35形成过程 |
| AX | [summary](../../results/skill-ir/skill-dsl-research/development/authorization-property-execution-v1/summary.json)、[离线包核验](../../results/skill-ir/skill-dsl-research/development/authorization-property-execution-v1/verification/portable-package.json)；原unknown与11个未运行位置不改 |
| AW/AV | [AW summary](../../results/skill-ir/skill-dsl-research/development/authorization-control-materials-v1/summary.json)、[AV status](../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/status.json)，第三方暂停保持 |
| AR–AU及更早 | [唯一研究正文](skill-dsl-research.md)、[历史](history.md)、[证据索引](evidence-index.md)、[实验目录](../../results/skill-ir/experiment-catalog.json) |

普通命令见 [使用说明](../usage.md)，代码与测试定位见 [开发指南](developer-guide.md)。本轮不新增长期阅读文档，研究仍统一在一个正文中。仅更新当前状态及索引，不把逐次派发和测试日志持续堆到本页。

[发布回执](../../results/skill-ir/skill-dsl-research/development/authorization-source-differential-v1/verification/publication.json)保留远端核对。本任务书已收束，不自动启动BV。
