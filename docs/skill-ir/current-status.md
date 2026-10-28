# 当前状态：按 Skill 类别选择代码固化粒度

更新于 2026-10-28。工作分支 `skill-ir-aot`，只发布到用户 `origin`。本页是唯一实时入口。

## 当前工作

老师重新确定课题为 **基于 Skill 分类的分层代码固化 Agent 运行时优化机制**：结合真实运行的确定性和数据依赖，选择固化范围与检查方式；检查失败时把有效中间状态交给模型继续，以输出质量保持为前提，评价延迟、token 和调用量。

已有首个**本地子流程执行—检查—状态交还—继续完成任务**原型：普通 bare-agent 支持显式 `--subworkflow`，成功和故障示例已实跑，模型侧为脚本替身。2026-10-28 追加完成相关工作、外部路由/恢复代码及公开 skill 正文调研，形成[主文档](tiered-solidification.md)和[下一开发队列 P0–P6](skill-ir-aot-optimization-plan.md)；未新增生产实现或真实模型实验。

直接试接线：`bun examples/tiered-solidification/run.ts --mode=failure`。操作真实文件，故意生成不合格摘要，再从第一步结果接续，生成最终报告。详见[运行说明](../../examples/tiered-solidification/README.md)。下一步先明确多类任务及独立评价，接执行后证据和通用账号通道，再做自动候选、透明路由和真实恢复配对。

研究定位：SkillSmith 已有有效上游恢复，Adaptive Skill Granularity 已有宏/微路由。待检验增量是类别对验证/粒度选择的帮助，以及依赖与检查如何确定可继续使用的状态。先按 4 个 skill、2 类做小规模接线，再决定跨类对照；不把恢复或分类本身称为新颖成果。

## 已有成果与保留边界

| 可复用基础 | 已知证据与缺口 |
|---|---|
| 真实 trace、程序提案、包导出与消费 | 已有多 skill 开发案例，收益 mixed；尚无按类别稳定加速结论 |
| JIT 模板与显式本地子流程 | 新增结构检查、有效前缀保留、失败输出恢复及模型接续；分类/自动选择、业务语义与跨会话恢复待做 |
| 有限 DSL、独立要求、源码差分与失效处理 | BU 的 M 有限匹配从 14/30 到 23/30；保留为局部验证资产 |

最后结束的旧队列是 BU，发布收口提交 `3380b800`。十用途已关闭，无该队列的活动或未知请求；完整自动语义、一般授权安全与稳定净收益仍未建立。见[BU结果](../../results/skill-ir/skill-dsl-research/development/authorization-source-differential-v1/summary.json)、[证据索引](evidence-index.md)和[旧阶段表](history.md#2026-10-28-新课题切换前的阶段索引)。

## 开发与资料入口

- 新课题只维护[主文档](tiered-solidification.md)和[计划](skill-ir-aot-optimization-plan.md)。已结束任务书、旧研究长文、旧开发指南与汇报稿退出工作目录；按[历史索引](history.md)从 Git 恢复。脚本实际读取的版本化文档保留原字节。
- 分类入口：[classification-and-routing](classification-and-routing.md)；结果入口：[results README](../../results/skill-ir/README.md)。清理 3,496 份与归档一致的实验展开副本及可重建缓存，共 12,361 文件、20.91 GB 逻辑长度；归档、自动包、跟踪原件和唯一记录保留。
- 普通命令见[使用说明](../usage.md)。沿用 `run`，新增可选 `--subworkflow`，默认行为保持。
- 官方账号 `gpt-5.6-sol/high` 实验授权保留；第三方付费通道继续暂停。未知/活动请求不重发，held-out/Q1/prospective 不进入本轮治理。
- 旧实验按原合同解释，不改变冻结原件或补写未知费用；新方法的调用、时间和质量需要重新测量。
