# 当前状态：按 Skill 类别选择代码固化粒度

更新于 2026-10-29。工作分支 `skill-ir-aot`，只发布到用户 `origin`。本页是唯一实时入口。

## 当前工作

老师重新确定课题为 **基于 Skill 分类的分层代码固化 Agent 运行时优化机制**：结合真实运行的确定性和数据依赖，选择固化范围与检查方式；检查失败时把有效中间状态交给模型继续，以输出质量保持为前提，评价延迟、token 和调用量。

已接通工具执行后证据、普通官方账号任务和内容检查：默认 JIT 用实际回执、退出状态、声明产物变化及检查结果晋升，旧签名策略仅显式基线。bare-agent 与 codex-account 都支持显式子流程，失败保留有效前缀并交回模型。

2026-10-29 的真实账号故障确认已完成并交付：错误 sum=99 被拒绝，前缀仅执行一次，模型修复为 6 并写报告。首轮预算关闭失败原件保留，只读查得 interrupted；修复允许预算耗尽后的同一回合交付。证据在 `results/skill-ir/tiered-solidification-20261029/`。手写候选用于接线确认，未证明自动分类、候选生成或效率收益。

运行方式和检查范围见[示例](../../examples/tiered-solidification/README.md)与[主文档](tiered-solidification.md)；后续队列见[计划](skill-ir-aot-optimization-plan.md)。

研究定位：SkillSmith 已有有效上游恢复，Adaptive Skill Granularity 已有宏/微路由。待检验增量是类别对验证/粒度选择的帮助，以及依赖与检查如何确定可继续使用的状态。先按 4 个 skill、2 类做小规模接线，再决定跨类对照；不把恢复或分类本身称为新颖成果。

## 已有成果与保留边界

| 可复用基础 | 已知证据与缺口 |
|---|---|
| 真实 trace、程序提案、包导出与消费 | 已有多 skill 开发案例，收益 mixed；尚无按类别稳定加速结论 |
| JIT 模板与显式本地子流程 | 新增结构检查、有效前缀保留、失败输出恢复及模型接续；数值关系/保存约束及外部语义评价接口已接通；自动选择、通用语义质量与跨会话恢复待做 |
| 有限 DSL、独立要求、源码差分与失效处理 | BU 的 M 有限匹配从 14/30 到 23/30；保留为局部验证资产 |

最后结束的旧队列是 BU，发布收口提交 `3380b800`。十用途已关闭，无该队列的活动或未知请求；完整自动语义、一般授权安全与稳定净收益仍未建立。见[BU结果](../../results/skill-ir/skill-dsl-research/development/authorization-source-differential-v1/summary.json)、[证据索引](evidence-index.md)和[旧阶段表](history.md#2026-10-28-新课题切换前的阶段索引)。

## 开发与资料入口

- 新课题只维护[主文档](tiered-solidification.md)和[计划](skill-ir-aot-optimization-plan.md)。已结束任务书、旧研究长文、旧开发指南与汇报稿退出工作目录；按[历史索引](history.md)从 Git 恢复。脚本实际读取的版本化文档保留原字节。
- 分类入口：[classification-and-routing](classification-and-routing.md)；结果入口：[results README](../../results/skill-ir/README.md)。清理 3,496 份与归档一致的实验展开副本及可重建缓存，共 12,361 文件、20.91 GB 逻辑长度；归档、自动包、跟踪原件和唯一记录保留。
- 普通命令见[使用说明](../usage.md)。沿用 `run`，新增可选 `--subworkflow`，默认行为保持。
- 官方账号 `gpt-5.6-sol/high` 实验授权保留；第三方付费通道继续暂停。未知/活动请求不重发，held-out/Q1/prospective 不进入本轮治理。
- 旧实验按原合同解释，不改变冻结原件或补写未知费用；新方法的调用、时间和质量需要重新测量。

2026-10-29 CLI 具名确认 cli-confirmation 已核对 completed/delivered、report.txt 行数 3/合计 6、summary.sum=6、前缀一次。此前 cli-success 虽交付但未写报告，作为失败保留。四次真实运行及未知费用见 `results/skill-ir/tiered-solidification-20261029/summary.json`；155 项定向测试、712 断言及最终类型检查通过。
