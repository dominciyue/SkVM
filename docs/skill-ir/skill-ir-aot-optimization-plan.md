# Skill IR AOT 当前执行计划

更新于 2026-10-05。本页维护未达责任与长期边界；阶段原件通过[研究正文](skill-dsl-research.md)、[历史](history.md)和[实验目录](../../results/skill-ir/experiment-catalog.json)查阅。

- 唯一实时入口：[current-status](current-status.md)。
- 当前任务书：[AU0–AU21 操作级取证与授权 DSL 贯通](../superpowers/plans/2026-10-05-authorization-operation-evidence-and-domain-closure.md)，开发线程已接管，AU0进行中，开发模型`gpt-6.1-sol / max`。启动提交`dfe7ec32`，工作区干净；旧结果与封存不变。
- 方法合同：[spec AU](skill-ir-aot-optimization-spec.md#1434-au-operation-evidence-contract)。
- 根因复核与设计：[研究 §7.50–7.52](skill-dsl-research.md#750-at-复核任务拆分与领域表达的衔接)。

## 当前目标

让同一操作的多个问题共享来源解释，由结构取证提供符号/继承/调用及对象候选，领域义务决定补读与核对动作；完成有限权限/对象摘要、同源答案和变化重算。沿用现有CLI、领域核心、provider及只读工具，新策略显式启用。

研究基线为`ba277160`，启动时保留后续任务书提交。AR/AS/AT原件与封存保持。投入约60%质量、40%编写复用、约8–12小时是主动工作安排，不作为质量结论或追加重复实验的理由。

## AU 队列

| 阶段 | 本轮工作 | 当前状态 |
|---|---|---|
| AU0–AU2 | 接管、内部合同与兼容、外部代码到结构探针 | 已授权待执行 |
| AU3–AU6 | 操作事实、结构索引、框架对象关系、义务调度 | 已授权待执行 |
| AU7–AU10 | 有限语义、领域摘要、检查到动作、两入口真实贯通 | 已授权待执行 |
| AU11–AU14 | 材料复用、原skill原/变、4稿消费、三类变化配对 | 已授权待执行 |
| AU15–AU17 | 四任务三臂12位置、适用消融、源码评阅与即时修复 | 已授权待执行 |
| AU18–AU21 | 联合验证、研究整合、发布与完成判定 | 已授权待执行 |

最近[AT任务书](../superpowers/plans/2026-10-05-authorization-focused-closure-and-delivery.md)以`completed-with-unmet-criteria`结束：12质量首位置partial、checked/bounded为0，两个original native自然说明充分而formal未通，changed及作者消费均partial。原件及准确分母见[AT summary](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/summary.json)。AS和AR记录继续保留。

AU先修真实接口再运行比较，原问题不删减，oracle不进入模型输入。材料级恢复按自身依赖和审查等级处理，最终结论重新计算；完整任务复用收益依赖真实充分答案。共享错误及时修复，不借新identity原样重抽旧失败。

## 失败处理

1. 每项真实不良表现当场定位、针对性修复并复验；同根因共用修复，逐项关联结果。共享缺陷暂停受影响派发，不耗完整批次后再修。
2. 原答、修订、未派发和未知分别保留。格式、源码遗漏、语义、检查器和运行环境错误分开，修格式后仍评价原任务。
3. 新的修订必须有新的诊断依据；同一错误两轮无进展时调整接口/任务调度，不原样反复重抽。无法消除的未知保留并继续独立工作。
4. 封存按逻辑任务及来源识别，不用 AU 新身份、改文件名或新模型绕过。零派发配置失败可在明确恢复后继续；仅USD/usage未知不扩大为未知完成。
5. 已接受提取事实仍须独立源码评价；evaluator、旧答案和人工正确图不进入被测模型输入。

## 工作及治理边界

- 在 `skill-ir-aot` 继续，仅发布用户 `origin`，不新建分支或 worktree。AU启动后成为共享状态与Git唯一写者。
- 新能力 opt-in，旧默认/协议及历史结果保留。保护输入、Q1、readiness 与旧 prospective 不动。
- 允许认证网络及有目的模型调用；计量实际 provider 调用、token、时间、已知费用及 unknown，开发代理成本分列。
- 只分析允许源码，不执行目标、验证部署或自动应用业务 patch。源码行为、用户前提、规范政策、模型解释、宿主派生分别标来源。
- 后续问题继续写入现有研究正文和相应组件章节；阶段状态、失败、评审和费用存 results。临时运行集中在 `project-maintenance/runs/<identity>/`。
- [治理任务书](../superpowers/plans/2026-10-04-workspace-and-document-governance.md)及本地恢复索引负责原件收存。已结束 AR 的机器状态仅为最后快照，不再作为当前队列执行命令。
