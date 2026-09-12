# Skill IR AOT 当前执行计划

- 更新日期：2026-09-13
- 路线：U0–U7
- 状态：`active`（U0 completed，U1 in-progress）
- 唯一实时状态：[current-status.md](current-status.md)
- 详细任务书：[2026-09-13-api-task-usable-delivery.md](../superpowers/plans/2026-09-13-api-task-usable-delivery.md)

本页只维护未完成任务与验收条件。完成记录写入 Git 和 `results/skill-ir/`，不在这里追加执行流水。

## 目标

用一次可审计的端到端交付回答：真实 agent trace 能否驱动模型优化，产出一个职责完整的新 skill 包，并在
agent 的新消费任务中保持或改善质量，同时给出真实一次性成本与重复使用成本。

## U0–U7

| 阶段 | 当前状态 | 交付与验收 |
|---|---|---|
| U0 输入冻结 | completed | 已确认 JIT optimize 基线 45 pass / 0 fail，并绑定两份仓库内真实运行材料 |
| U1 Evidence | in-progress | 为 Pi run-summary 与 bare-agent runtime-event trace 建立 adapter；缺失与未知显式记录 |
| U2 模型优化 | planned-not-started | 优化模型读取完整 closure，输出逐项 proposal；覆盖所有有证据支持的机会 |
| U3 有界固化 | planned-not-started | 只固化稳定、可验证部分；保留剩余职责和适用边界，可复用现有 IR/API/checker |
| U4 新 skill 包 | planned-not-started | 生成独立、可安装、可验证的新包；provenance 绑定输入、proposal 和接受决定 |
| U5 Agent 消费 | planned-not-started | 新 agent 在未写入答案的新任务中真实加载并使用新包，保存完整 trace |
| U6 成对评估 | planned-not-started | 同一任务口径比较原包与新包的质量、失败、token、调用和人工分钟 |
| U7 收口 | planned-not-started | 只声明证据支持的结论，链接结果，记录限制与下一轮可执行入口 |

## 复用边界

- 首选复用现有 JIT Evidence/workspace/proposal、Skill IR、API TaskContract、checker 和 artifact package 能力。
- API request/pytest 是 U3 可选后端，不是路线的默认入口。
- 不改变构造算法、评价语义、冻结绑定或产品行为；治理只调整文档、文档检查器和必要导航引用。
- 历史 Q1/Q2、API Tester、Env Manager 等证据只按各自原范围引用，不冒充 U0–U7 结果。

## 整体验收

- 输入、Evidence、proposal、接受决定、新包、消费 trace 和评价结果形成可复核 closure。
- 新包职责完整；未自动化工作没有因固化而消失。
- 至少一个真实消费任务完成成对比较，并分开报告质量、运行成本、构造成本和人工成本。
- 任一失败、缺失或未测量项都保留为显式状态，不用空行、补写或外推掩盖。

## 停止条件

- trace 或原 skill 无法形成可靠 closure。
- proposal 需要未公开答案或越过受保护边界。
- 新包无法保留原职责，或 checker 不能验证关键输出。
- 成对任务发生不可归因的基础设施失败；冻结本轮，不偷偷换样或重跑。

## 下一动作

完成 U1 adapter 的 RED/GREEN 与 loader 集成，再按任务书推进 U2。机器恢复状态见
`results/skill-ir/trace-guided-skill-optimization-20260913/status.json`。阶段状态变化时同步更新本页和
`current-status.md`；方法变化由开发线程先更新最新任务书/spec，治理线程只合并导航与最新字节。
