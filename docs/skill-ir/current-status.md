# Skill IR 当前状态

更新于 2026-09-21。工作分支为 `skill-ir-aot`，仅发布到用户 origin。本页是唯一实时状态入口；历史任务书保存当时的执行记录。

## 当前方向与任务

当前研究范围是单 repo/ref、源码可见的授权与信任边界评估。领域声明表达主体、资源关系、操作、条件、政策来源和入口；程序展开检查义务，模型分析控制路径，宿主检查引用与覆盖，评价者复核语义。

[V0–V10](../superpowers/plans/2026-09-20-authorization-dsl-prototype-development.md)已完成，最终提交 `43d6d89`。下一任务书为 [W0–W9 结果传输、运行计量与评价修复](../superpowers/plans/2026-09-21-authorization-dsl-transport-and-evaluation.md)，状态 `planned-not-started`。本次仅复核与整理文档，没有启动 W 实现或模型运行。

下一轮按三件事推进：让宿主管理引用和重复元数据；补齐超时后的调用生命周期；把语义判断、引用有效性和完整交付分别评价。然后在现有三个案例上做三组新 B/D 配对。研究、当前设计与问题复盘统一维护在[研究总文档](skill-dsl-research.md)。

## V 阶段实际结果

- 工程闭环已运行：声明、义务展开、B/D 渲染、固定上下文宿主、结果检查、逐次记录、语义 review 和离线 replay。
- initial 六单元中四个完成、两个超时；仅 file 一组完整。修订 pair 中 B 再次超时，方法效果为 `not-established`。
- file 的 B final 与 D final 的语义 review 均支持关键事实。B 的 partial 来自三项 citation-text mismatch；这一差异首先说明结果交付受引用格式影响。
- trusted-header D 保留合理的 deployment unknown，但漏掉部分认证分支与条件结果，属于后续仍需观察的推理问题。
- V 归档记录 18 次 provider call、15 次响应、3 次 pending-at-timeout；已知 input 57,172、output 31,770、cache-read 1,408 tokens，实际美元费用 unknown。
- 9 月 21 日离线 mock 复现：宿主超时返回后，迟到的无效响应仍可触发 fallback，返回快照只记录早先请求。W 将修复关闭规则和事件落盘；历史实际有无额外迟到调用仍待原始记录核对，不推算费用。

证据：[V status](../../results/skill-ir/skill-dsl-research/development/authorization-v0/status.json)、[summary](../../results/skill-ir/skill-dsl-research/development/authorization-v0/summary.json)、[offline replay](../../results/skill-ir/skill-dsl-research/development/authorization-v0/offline-replay.json)、[本次复核](../../results/skill-ir/skill-dsl-research/development/review-20260921.json)。

## 已有工程能力

| 路线 | 当前可用能力 | 当前效果记录 |
|---|---|---|
| 授权领域 DSL 原型 | canonical JSON、显式义务、固定源码分析、结果与变化检查、B/D 实验入口 | V 比较不完整；W 修复共享消费与计量问题后复测 |
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
