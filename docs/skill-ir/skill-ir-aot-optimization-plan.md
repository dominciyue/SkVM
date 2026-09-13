# Skill IR AOT 当前执行计划

- 更新日期：2026-09-13
- 路线：G0–G14，单次真实 trace 驱动的通用 skill 优化
- 状态：`active`（G0–G6 completed，G7 active）
- 唯一实时状态：[current-status.md](current-status.md)
- 详细任务书：[持续开发任务书](../superpowers/plans/2026-09-13-general-skill-optimization-deepening.md)

本页只维护当前待执行任务与验收条件。U0–U7 已完成，旧结果见 `results/skill-ir/trace-guided-skill-optimization-20260913/final-report.json`；其 mixed 效果和未知 USD 成本不改写。

## 目标

将已有日志优化器推进为可用于不同结构 skill 的新包生成过程。输入 skill、一次真实运行记录和可取得的资源，模型选择有依据的脚本复用、程序生成或文档重组，经实际使用形成反馈。开发共享实现为主，语料阅读和少量实验服务实现。

## 待执行队列

| 阶段 | 状态 | 交付与验收 |
| --- | --- | --- |
| G0 现场与基线 | completed | 确认归属，建立机器恢复入口；规定的单次基线 9/9 tests、31 assertions |
| G1 语料驱动诊断 | completed | 30 份广读、10 份深读、8 项积压；去重、资源导航、动作合同三项已进入生产实现 |
| G2 单次 trace | completed | 精确选择一条真实非 API 记录；摘要、资源和 unknown 分开，复制记录不重复计数 |
| G3 可执行动作 | completed | 四类动作可表达依赖、参数和残余职责；局部错误诊断可持久化 |
| G4 模型优化 | completed | 已解除普遍缺陷/重复次数/行数门槛；真实单 trace proposal 因无质量失败证据而 no-change |
| G5 实现选择 | completed | 原脚本、领域组件、生成程序、文档重组按动作语义选择，不绑定 skill 名称 |
| G6 程序运行 | completed | 复用 Law 参数化脚本完成 5 项运行与独立字符流检查，首个缺依赖失败保留 |
| G7 通用包 | active | 不强制 API 字段，重组入口并保留必要资源与原件 |
| G8 CLI 接通 | planned | 可选新包输出，无须另走 API-only 构建脚本 |
| G9 局部修复 | planned | 受影响行为验证，依赖相关修改协调修复或回退 |
| G10 自然消费 | planned | 正常任务不提示 helper 命令，agent 完成剩余流程 |
| G11 上下文与计数 | planned | 修共享重复阅读，分开运行/模型响应/工具/重试和 usage |
| G12 多结构验证 | planned | API 兼容回归、两个不同结构非 API 成员的实际尝试 |
| G13 后加入成员 | planned | development 过程复用检查，不按 skill 名称写成功分支 |
| G14 交付 | planned | 相关验证、真实命令/包/结果与限制，精确提交推送 origin |

X1–X3 仅在主链达标且交付窗口允许时，深化多资源路径、信息缺失降级及纯文档重组；不无限续作。

## 复用与方法边界

- 复用 JIT Evidence/workspace/loop/proposals、trace adapters 与现有执行框架，不另建优化器。
- API/Env 是领域组件，不是两个 skill 本体，也不是所有 skill 必须服从的通用输入格式。
- 一次 trace 可支持有依据的局部修改；原 skill 未观测的关键规则与剩余职责保留。允许重组外观，不要求逐字不变。
- 原包默认保留，生成与部署分开；旧 log 模式按修改选轮不等于效果验证通过。
- 已有正例作回归，公开新阅读均为 development；不启动 Q1/held-out/prospective，不改历史结果。
- 工作在 skill-ir-aot；本轮结果目录为 `results/skill-ir/general-skill-optimization-20260913/`，G0 启动时才创建。

## 完成与失败处理

最低产品要求是单条 trace 经通用 CLI 产生可消费非 API 新包，另一个不同结构成员经过实际尝试；至少三项共享问题落实到实现；已有 API 路线不回归。效果逐项报告，没有实测就不能声称节省。

单个来源、任务或动作失败不关闭整轮；有新证据可修复，不能无信息重复请求。不可替代的资源缺失只阻止依赖它的工作。不能把所有阶段填终态当成产品完成；按任务书区分有收益、mixed/no-benefit 和 partial delivery。

## 启动方式

持续目标已启动。恢复时先读取 `results/skill-ir/general-skill-optimization-20260913/status.json`，按 `currentStage` 和 `nextAction` 继续；G0 基线不应为了恢复而重复运行。
