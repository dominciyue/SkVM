# Skill IR AOT 当前执行计划

更新于 2026-10-07。本页维护当前目标和未达责任，原件由研究正文与实验目录导航。

- 唯一实时入口：[current-status](current-status.md)。
- 当前任务书：[AW0–AW22 控制语义、局部材料与账号运行](../superpowers/plans/2026-10-07-authorization-control-materials-and-account-runtime.md)，planned-not-started，待新线程接管。开发模型 gpt-6.1-sol / max。
- 方法合同：[spec AW](skill-ir-aot-optimization-spec.md#1436-aw-control-materials-and-account-runtime-contract)；开发决定：[研究 §7.56](skill-dsl-research.md#756-aw-控制语义局部材料与账号运行开发决定)。
- 代码基线 853795491c78ccf24a2387bb4ea5b65ea0ebf44a；启动时保留任务书后续提交。质量/编写复用约60/40是精力分配。

## 当前目标

补齐真实授权源码中的有限正常/异常/短路关系，让来源材料在入口尚未完成时也能可靠保存、在连接成立后被实际使用。局部修复保留已有进展，减少真实上下文重复，完成原skill任务与变化使用。复用现有领域核心和CLI，新增行为显式启用。

账号运行作为一条有界接入责任：本机已通过ChatGPT登录，模型目录列出gpt-5.6-sol，尚未推理验证。通过官方Codex app-server/适配器接入同一领域工具，单列harness与用量。用户已明确授权使用当前账号做实验；通道验证通过后可执行，第三方付费API继续暂停。

## AW 队列

| 阶段 | 工作 | 初始状态 |
|---|---|---|
| AW0–AW2 | 接管、账号元数据/授权、真实失败测试 | 待执行 |
| AW3–AW5 | 有限控制、helper摘要与局部覆盖 | 待执行 |
| AW6–AW8 | 来源材料、操作连接、变化恢复 | 待执行 |
| AW9–AW10 | 局部上下文、进度与最终交付 | 待执行 |
| AW11–AW13 | 官方账号驱动/同核心接入、真实源码离线集成 | 待执行 |
| AW14–AW18 | 账号真实纵向链、完整skill/作者消费、变化及质量对照 | 账号实验已授权，待通道验证；离线工作继续 |
| AW19–AW22 | 独立复核、必要回归、文档发布、逐项收束 | 待执行 |

## 继承状态

[AV](../superpowers/plans/2026-10-06-authorization-source-assisted-closure.md)保持in-progress-paid-deferred-by-user：14首位置/29尝试已归档，397派发/385响应；12旧变化/质量位置未派发。两条最新调试均partial，四份作者稿有效，消费未形成稳定完整交付。停止状态修复已发布；894pass/1skip为AV归档验证。本次复核新鲜109pass/538断言及主类型通过。原件见[AV summary](../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/summary.json)。

AU/AT/AS/AR的失败、未知费用、封存及分母保留。AW使用新身份记录新实现及账号通道，不覆盖旧结果，不自动补跑AV十二行。

## 失败处理与验收

1. 可定位共享故障当场写失败测试、修生产实现、同例复验；暂停受影响模型派发，独立开发继续。
2. 一个错误字段局部修复，保留已接受解释；同因两轮无进展改接口/任务负担，不原样重抽整题。
3. 完整原任务不缩小，条件分支可构成充分回答；来源已有却未连上应记解释缺口。oracle和旧完整答案只在evaluator。
4. 材料保存、连接、恢复、实际采用和整体质量分别计数；旧final/check不进入缓存种子。
5. 账号额度/权限不可用暂停该通道，不购买额度、切身份或改用付费API；继续离线工程。
6. 工程、真实交付、比较和复用分别报告，有限队列终结不替代研究达成。

## 工作边界

继续skill-ir-aot，仅推用户origin，不新建分支/worktree。新开发线程接管后为本轮唯一代码/方法文档写者。保护历史原件、其他线程改动、held-out/Q1/readiness。分析允许源码，不执行目标应用。

问题和修复统一追加[研究正文](skill-dsl-research.md)，长期接口更新既有组件文档。临时运行集中在project-maintenance，结果和失败进入本轮results目录；不新建每阶段Markdown、不重复历史全量审计。付费通道与账号实验授权分开记录。
