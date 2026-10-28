# 当前状态：按 Skill 类别选择代码固化粒度

更新于 2026-10-28。工作分支 `skill-ir-aot`，只发布到用户 `origin`。本页是唯一实时入口。

## 当前工作

老师重新确定课题为 **基于 Skill 分类的分层代码固化 Agent 运行时优化机制**：结合真实运行的确定性和数据依赖，选择固化范围与检查方式；检查失败时把有效中间状态交给模型继续，以输出质量保持为前提，评价延迟、token 和调用量。

本轮完成文献核对、实现缺口审查和文档/结果导航治理。**新运行时机制尚未实现，新效果实验尚未启动。** 方法、文献、现有资产和评价方案统一在[新课题主文档](tiered-solidification.md)，具体开发顺序见[当前计划](skill-ir-aot-optimization-plan.md)。

下一项是普通入口的最小完整链：**成功子流程继续剩余任务；检查失败时保留有效前缀，撤回错误结果，让模型从当前状态继续。** 复用 SkVM runtime/hooks、trace、solidifier 和验证组件，不继续扩写授权语言语法。

## 已有成果与保留边界

| 可复用基础 | 已知证据与缺口 |
|---|---|
| 真实 trace、程序提案、包导出与消费 | 已有多 skill 开发案例，收益 mixed；尚无按类别稳定加速结论 |
| JIT 模板执行与降级 | 已有实现；缺子流程继续、独立产物检查和完整中间状态交还 |
| 有限 DSL、独立要求、源码差分与失效处理 | BU 的 M 有限匹配从 14/30 到 23/30；保留为局部验证资产 |

最后结束的旧队列是 BU，发布收口提交 `3380b800`。十用途已关闭，无该队列的活动或未知请求；完整自动语义、一般授权安全与稳定净收益仍未建立。见[BU结果](../../results/skill-ir/skill-dsl-research/development/authorization-source-differential-v1/summary.json)、[证据索引](evidence-index.md)和[旧阶段表](history.md#2026-10-28-新课题切换前的阶段索引)。

## 开发与资料入口

- 新课题只维护[主文档](tiered-solidification.md)和[计划](skill-ir-aot-optimization-plan.md)；旧 spec、DSL 研究长文及旧开发指南转为历史/按需参考，路径保留。
- 分类入口：[classification-and-routing](classification-and-routing.md)；结果入口：[results README](../../results/skill-ir/README.md)。本轮删除的是重复的当前叙述，未删除原始实验或 `.tmp/`。
- 普通 SkVM 命令仍见[使用说明](../usage.md)；新课题没有新增 CLI 或改变默认行为。
- 官方账号 `gpt-5.6-sol/high` 实验授权保留；第三方付费通道继续暂停。未知/活动请求不重发，held-out/Q1/prospective 不进入本轮治理。
- 旧实验按原合同解释，不改变冻结原件或补写未知费用；新方法的调用、时间和质量需要重新测量。
