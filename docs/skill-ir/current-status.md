# Skill IR 当前状态

更新于 2026-09-21。工作分支为 `skill-ir-aot`，仅发布到用户 origin。本页是唯一实时状态入口；历史任务书保存当时的执行记录。

## 当前方向与任务

当前研究范围是单 repo/ref、源码可见的授权与信任边界评估。领域声明表达主体、资源关系、操作、条件、政策来源和入口；程序展开检查义务，模型分析控制路径，宿主检查引用与覆盖，评价者复核语义。

[V0–V10](../superpowers/plans/2026-09-20-authorization-dsl-prototype-development.md)及 [W0–W9](../superpowers/plans/2026-09-21-authorization-dsl-transport-and-evaluation.md)已完成，W 最终发布为 `fa6b064`。下一任务书为 [X0–X13 完整能力交付](../superpowers/plans/2026-09-21-authorization-dsl-capability-delivery.md)，状态 `planned-not-started`；本次只制定计划，没有启动新实现或模型实验。

用户在 W 复核后确认按完整能力阶段推进：评价要求校准、可选/分支关系、普通自备输入、第二项目 development 与小型对照放入同一轮。第二项目提前检验共性，旧三例不必先全部满分；内部仍小步测试和提交。研究与开发复盘统一维护在[研究总文档 §7.21](skill-dsl-research.md#721-x-完整能力阶段设计)。

## W 阶段实际结果

- 工程闭环稳定运行：窄 wire、宿主引用归一化、schema/fallback/repair 计量、关闭与迟到事件、分层评价、恢复和离线 replay 均有确定性测试；任一 error 级 wire 归一化诊断都不会产生 canonical result。
- 三个既有 Open WebUI development 案例共六个 fresh-context 单元全部 completed。`transportValid`、`deliveryComplete` 和 `semanticDecisionCorrect` 均为 6/6；没有 completion-unknown。
- file 与 controlled-text 的 B/D 四单元均为 full-success。trusted-header 两臂都正确返回 `unknown`，但严格 review 均为 partial：两臂都没有明确列出四种条件结果，D 还漏掉可选 signup 路径，B 的密码认证关闭分支也没有明确写出 403。
- B 共 5 次 provider dispatch、15,866 input、6,116 output、3,456 cache-read tokens；D 共 3 次 dispatch、7,013 input、3,302 output、3,456 cache-read tokens。总计 8 次调用，实际 USD 全部未报告，保持 unknown。
- D 在本小样本中少两次调用、少 8,853 input 和 2,814 output tokens，没有比 B 更高的语义或证据完整性。W 当时决定先研究关系缺口；后续复核还发现评价的显式表达要求需要校准，关系层是待验证解释。X 保留这一正向开销观察并增加第二项目检查。W9 的 invalid wire 交付缺陷已以红绿回归修复，六个存档最终结果不变。

证据：[W status](../../results/skill-ir/skill-dsl-research/development/authorization-transport-v1/status.json)、[W summary](../../results/skill-ir/skill-dsl-research/development/authorization-transport-v1/summary.json)、[W evaluation](../../results/skill-ir/skill-dsl-research/development/authorization-transport-v1/runs/initial-wire-v1/evaluation-summary.json)、[V replay](../../results/skill-ir/skill-dsl-research/development/authorization-transport-v1/v-replay-initial.json)。V 原始结果继续保存在 `authorization-v0`。

## 已有工程能力

| 路线 | 当前可用能力 | 当前效果记录 |
|---|---|---|
| 授权领域 DSL 原型 | canonical JSON、显式义务、编号源码、窄 wire、宿主引用绑定、关闭/迟到计量、分层评价、B/D 实验入口 | W 三对完成；工程传输可行，D 无质量优势，trusted-header 仍有共同语义漏项 |
| Trace 驱动 skill 包优化 | bare-agent 自动捕获、日志导入、模型修改说明和脚本、局部验证与修复、原子包导出、自然消费记录 | F 后继包三次实际消费通过；配对工具调用 62→64、输入 token 58,828→190,516，效果 negative |
| 既有确定性基础 | IR parser/validator、lowering、API Tester/Env 后端、artifact 与显式 recipe import | 保留各自有界案例及原评价口径 |

普通使用入口：

```powershell
skvm run --prompt="<task>" --skill=./skill --workdir=./project --model=<id> --optimize
```

优化模型默认沿用 `--model`；具体选项、已有日志与恢复见[使用说明](../usage.md)。当前授权原型使用开发脚本，命令与类型见[开发指南](developer-guide.md)。

## 文档与历史入口

- [当前计划](skill-ir-aot-optimization-plan.md)：近期队列与验收。
- [研究总文档](skill-dsl-research.md)：分类依据、当前设计、开发问题及方法变化。
- [spec 14.34](skill-ir-aot-optimization-spec.md#1434-按-skilltask-范围设计领域-dsl)：持续适用的方法合同。
- [证据索引](evidence-index.md)与[历史](history.md)：旧阶段结果、限制和恢复路径。
- [F 完成记录](../../results/skill-ir/general-generation-reinforcement-20260914/completion-audit.json)：既有通用生成路线的详细交付。

S/D/E/T 的来源、分类和设计保留在研究正文与原始证据中；本地化 I1 暂缓。新 development 工作沿用各历史身份的原始结果，不修改 Q1、held-out、prospective 或 readiness。工作树中的无关源码与本地实验材料由各自任务处理。
