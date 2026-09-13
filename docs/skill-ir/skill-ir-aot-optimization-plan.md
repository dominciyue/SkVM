# Skill IR AOT 当前执行计划

- 更新日期：2026-09-13
- 路线：H0–H14，单次 trace 驱动的 skill 优化生产链
- 状态：`planned-not-started`；仅任务书登记，未启动 H0 或新持续目标
- 唯一实时状态：[current-status.md](current-status.md)
- 详细任务书：[生产链持续任务书](../superpowers/plans/2026-09-13-skill-optimization-production-closure.md) revision 1
- 方法依据：spec 14.31

本页只维护当前待执行任务。G0–G14 已完成，历史机器结果见 `results/skill-ir/general-skill-optimization-20260913/final-report.json`，整体效果 mixed。U/G 与早期受保护结果不改写。

## 目标与缺口

将现有 JIT-optimize、程序验证、动作解析与通用 exporter 接成正常用户流程。用户提供 skill、一次真实 trace 和可取得资源，模型复用或生成程序、改进文档，经实际验证与有限修复，导出新包供普通 agent 使用。

复核确认：验证组件尚未被正常 loop/CLI 调用；待验证依赖可能错误提升下游；G 四个包身份实际均只改 SKILL.md。已有 30 个阅读条目包含 10 个深读，材料足以开始工程修复；追加阅读只围绕明确结构缺口。

## 待执行队列

| 阶段 | 状态 | 交付与验收 |
| --- | --- | --- |
| H0 现场与基线 | pending | 实际 log/loop/export 调用链、归属和恢复记录 |
| H1 定向语料用例 | pending | 原文/trace/机械职责/代码测试映射，无阅读数量门槛 |
| H2 条件范围 | pending | 区分长期规则、任务约束、环境事实，保持原用途 |
| H3 局部状态 | pending | not-run 依赖传递；未知不冒充通过或失败 |
| H4 验证计划 | pending | 程序参数、资源和有依据检查由正常优化流程产生 |
| H5 循环接通 | pending | 正常 CLI/log 真实调用程序验证、持久化并影响推荐轮次 |
| H6 修复与回退 | pending | 一次自动局部修复，失败组安全恢复，最终 snapshot 一致 |
| H7 包与入口 | pending | 兼容旧 proposal；准确描述局部检查与整个任务状态 |
| H8 新程序实用 | pending | 非 API 参数化程序由优化器产生、验证并自然消费 |
| H9 现成程序复用 | pending | 另一资源结构的真实程序执行与同流程尝试 |
| H10 条件变化与降级 | pending | 合法空/可选缺失可处理，必需缺失只影响相关步骤 |
| H11 实际使用开销 | pending | 针对 trace 修生成/交接策略，质量与全部指标并列 |
| H12 过程复用 | pending | 后加入 development 结构实际尝试，无名称特判 |
| H13 工程使用 | pending | 研究 runner 外的正常入口、可搬运包与真实命令 |
| H14 验证与交付 | pending | 有限回归、文档、精确提交并推用户 origin |

Y1 多程序接力、Y2 缺信息可用性只在主链达标且收尾窗口前有明确问题时执行，不能替代主链或用于凑时长。

## 最低工程交付

1. 普通 CLI/log 路径实际完成动作实施、程序验证、修复/回退和最终包导出。
2. 至少一个真实非 API 新程序由优化器生成，原/变化输入按独立规则检查并自然消费；文档改写不能替代。
3. 现成脚本复用经过实际执行，另一结构经过同流程尝试；no-change 不计收益。
4. 条件范围、待验证依赖和 snapshot/验证一致性修复进入生产代码与行为测试。
5. 原件保留、失败/未知清楚，已支持路径无需研究 runner 手工接线，相关测试与类型检查通过。

工程、任务质量和效果分别判定。质量不退化时争取减少目标开销或重复机械工作，允许小收益并如实保留 mixed；不从多个指标事后挑一个下降就宣布总体成功。阶段全终态、包闭包通过和单测数量均不能替代最低工程要求。

## 工作方式与恢复

- 直接在 `skill-ir-aot` 开发，只推用户 `origin`，保留其他线程 tracked/未跟踪材料。
- H0 才创建 `results/skill-ir/skill-optimization-production-closure-20260913/status.json`；当前不得伪造运行结果。
- 复用模型、trace adapters、workspace/loop/proposals 和可选 API/Env 组件，不新建优化器、不统一强制 API/JSON 输入。
- 定向补充公开 development 材料与真实 trace；网络、认证 GitHub CLI、远端 API 和有用途付费调用按既有授权使用，实际及未知成本分列。
- 一次生成/验证、明确错误时一次自动修复；有新根因可继续改共享工程，不无限抽样或补样。
- 不启动 Q1/held-out/prospective、不修改 readiness 或历史证据；不重复历史全量审计、clean/摘要循环。
- 按任务书连续推进，常规检查点不等确认；完成主线与适用追加任务后交付。尚有可执行必需工作时不把持续目标标记为完成。
