# Skill IR AOT 当前执行计划

更新于 2026-10-06。本页维护未达责任与长期边界；阶段原件通过[研究正文](skill-dsl-research.md)、[历史](history.md)和[实验目录](../../results/skill-ir/experiment-catalog.json)查阅。

- 唯一实时入口：[current-status](current-status.md)。
- 当前任务书：[AV0–AV20 源码辅助解释与授权任务真实闭合](../superpowers/plans/2026-10-06-authorization-source-assisted-closure.md)，`in-progress`。AV0–AV5完成，继续AV6；真实实验尚未开始。用户授权连续开发，模型`gpt-6.1-sol / max`，Flash尚未核实；设计基线`9d7db8e8`。
- 新执行合同：[spec AV](skill-ir-aot-optimization-spec.md#1435-av-source-assisted-closure-contract)。旧默认和 AU 合同继续兼容，历史原件保留。
- 根因复核：[研究 §7.54](skill-dsl-research.md#754-au-收束后复核入口来源连接和身份稳定性)；本轮设计：[§7.55](skill-dsl-research.md#755-av-源码辅助解释与局部恢复开发决定)。

## 当前目标

先修已复现的词法错入口、行号定位不一致和来源身份污染，再由源码解析提供机械调用/有限分支骨架，让模型集中解释授权语义。完成四类缺口、同源自然交付、只读请求恢复以及完整原 skill 的作者/消费和变化使用。沿用现有 CLI、provider、focus、领域核心和只读工具，计划新策略 `operation-evidence-v2` 显式启用。

设计基线为 `9d7db8e8`，启动时保留后续任务书发布提交。历史原件、未知请求和分母保持。投入约60%质量、40%编写复用、约8–12小时是主动工作安排，不作为质量结论或追加重复实验的理由。

## AV 队列

| 阶段 | 本轮工作 | 当前状态 |
|---|---|---|
| AV0–AV3 | 接管及三项共享缺陷的失败测试、实现和真实来源探针 | 已完成 |
| AV4–AV7 | 源码骨架、窄解释提案、义务调度、四类缺口与同源交付 | AV4–AV5完成，AV6进行中 |
| AV8–AV9 | 只读超时恢复、晚答隔离、双入口与薄 runner | 已授权，尚未执行 |
| AV10–AV11 | Download、OWUI 纵向链与即时修复，Go 结构兼容 | 已授权，尚未执行 |
| AV12–AV14 | 两完整 skill 原/变使用、四稿原字节消费、三类变化复用 | 已授权，尚未执行 |
| AV15–AV17 | 同版本六位置质量比较、适用机制对照与独立源码裁定 | 已授权，尚未执行 |
| AV18–AV20 | 有关回归、零调用重放、研究整合与 origin 发布 | 已授权，尚未执行 |

最近 AU 的32登记首位置为13实跑/19零调用封存，共25归档尝试；六个实跑质量位置为一 full、五 partial。Share/Gitea旧请求完成与usage未知、旧封存和分母保持，见[AU summary](../../results/skill-ir/skill-dsl-research/development/authorization-operation-evidence-v1/summary.json)和[accounting](../../results/skill-ir/skill-dsl-research/development/authorization-operation-evidence-v1/accounting.json)。AV 对未来只读请求显式采用新的有界恢复合同，测试和本地状态核验通过后可执行本轮新 development 位置；不修改旧 guard 或旧原件。

最近[AT任务书](../superpowers/plans/2026-10-05-authorization-focused-closure-and-delivery.md)以`completed-with-unmet-criteria`结束：12质量首位置partial、checked/bounded为0，两个original native自然说明充分而formal未通，changed及作者消费均partial。原件及准确分母见[AT summary](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/summary.json)。AS和AR记录继续保留。

AV先修真实接口与纵向链再运行比较，原问题不删减，oracle不进入模型输入。材料级恢复按自身依赖和审查等级处理，最终结论重新计算；完整任务复用收益依赖真实充分答案。初始26个工作位置用于留全失败与依赖处置，不是必须耗满的调用配额。

## 失败处理

1. 每项真实不良表现当场定位、针对性修复并复验；同根因共用修复，逐项关联结果。共享缺陷暂停受影响派发，不耗完整批次后再修。
2. 原答、修订、未派发和未知分别保留。格式、源码遗漏、语义、检查器和运行环境错误分开，修格式后仍评价原任务。
3. 新的修订必须有新的诊断依据；同一错误两轮无进展时调整接口/任务调度，不原样反复重抽。无法消除的未知保留并继续独立工作。
4. 旧封存按旧合同保留；AV 的只读超时须先关闭本地执行、隔离晚答，再在原预算内有限恢复并关联原请求。外部副作用或仍活动执行器暂停受影响动作；远端完成与费用未知保留，不扩大成整个逻辑任务永久封存。
5. 已接受提取事实仍须独立源码评价；evaluator、旧答案和人工正确图不进入被测模型输入。

## 工作及治理边界

- 在 `skill-ir-aot` 继续，仅发布用户 `origin`，不新建分支或 worktree。AV启动后成为共享状态与Git唯一写者。
- 新能力 opt-in，旧默认/协议及历史结果保留。保护输入、Q1、readiness 与旧 prospective 不动。
- 允许认证网络及有目的模型调用；计量实际 provider 调用、token、时间、已知费用及 unknown，开发代理成本分列。
- 只分析允许源码，不执行目标、验证部署或自动应用业务 patch。源码行为、用户前提、规范政策、模型解释、宿主派生分别标来源。
- 后续问题继续写入现有研究正文和相应组件章节；阶段状态、失败、评审和费用存 results。临时运行集中在 `project-maintenance/runs/<identity>/`。
- [治理任务书](../superpowers/plans/2026-10-04-workspace-and-document-governance.md)及本地恢复索引负责原件收存。已结束 AR 的机器状态仅为最后快照，不再作为当前队列执行命令。
