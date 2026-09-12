# Skill IR AOT 当前执行计划

- 更新日期：2026-09-13
- 路线：U0–U7
- 状态：`active`（U0–U6 completed，U7 in-progress）
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
| U1 Evidence | completed | Pi run-summary、bare-agent runtime-event、既有 conversation 与本轮 Pi consumption report adapter 均保留缺失和未知 |
| U2 模型优化 | completed | 优化模型读取真实 evidence；保留首次错误分类与 `NUL` 失败，修订 proposal 覆盖六类机会 |
| U3 有界固化 | completed | 两个包复用未放宽的 API Tester v2 helper/checker，保留剩余职责与不适用 fallback |
| U4 新 skill 包 | completed | 真实 agent 在普通目录读取包、调用 helper 并通过独立 checker；首次路径错误完整保留 |
| U5 Agent 消费 | completed | 3 skill / 3 repo 完成匹配；同一 helper 用于两个成员，第三个成员为有依据 no-change |
| U6 成对评估 | completed | 两个成员 × 原/变化输入共 4 对；质量 4/4 对 4/4，效果 mixed，USD unknown |
| U7 收口 | in-progress | 运行一次合并测试/typecheck/文档检查，核对暂存归属，提交并推送 origin |

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

执行一次 U7 合并验证，归档必要且脱敏的 proposal/trace/result closure，精确暂存本线程文件后提交并推送。
机器恢复状态见 `results/skill-ir/trace-guided-skill-optimization-20260913/status.json`。治理线程已经完成导航收敛；
本线程只同步唯一实时入口、方法文档与结果索引，不恢复已合并的历史说明。
