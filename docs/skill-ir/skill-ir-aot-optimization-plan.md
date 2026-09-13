# Skill IR AOT 当前执行计划

- 更新日期：2026-09-14
- 路线：H0–H14 + R1–R7，自动采集真实运行的 skill 优化生产链
- 状态：`active-R5`；H0–H12、R1–R4 已完成，恢复入口为 `results/skill-ir/skill-optimization-production-closure-20260913/status.json`
- 唯一实时状态：[current-status.md](current-status.md)
- 详细任务书：[生产链持续任务书](../superpowers/plans/2026-09-13-skill-optimization-production-closure.md) revision 3
- 方法依据：spec 14.31

本页只维护当前待执行任务。G0–G14 已完成，历史机器结果见 `results/skill-ir/general-skill-optimization-20260913/final-report.json`，整体效果 mixed。U/G 与早期受保护结果不改写。

## 目标与缺口

将现有 JIT-optimize、程序验证、动作解析与通用 exporter 接成正常用户流程。默认用户选择 skill、描述自然任务和工作目录，系统运行一次后自动捕获并关联真实 trace，再复用或生成程序、改进文档，经实际验证与有限修复，导出新包。手工日志保留为高级兼容入口，不是用户必需工作。

H0 启动时的验证接线、待验证依赖和最终包状态缺口已由 H3–H7 修复；G 文档包与新 H8/H9 程序结果分开。已有 30 个阅读条目包含 10 个深读，追加阅读只围绕明确结构缺口。revision 2 追加的是自动采集与免手工接线，不能用历史程序结果替代。

## 待执行队列

| 阶段 | 状态 | 交付与验收 |
| --- | --- | --- |
| H0 现场与基线 | completed | log 入口在 `runLogOnly` 提前返回；39/39 tests、106 assertions；恢复记录已建立 |
| H1 定向语料用例 | completed | `case-notes.json` 绑定 I18n/Law/Experimental/Env 的真实 trace、职责、质量依据和代码测试 |
| H2 条件范围 | completed | action 可携带有来源的 skill/task/environment/unknown 约束；workspace 单列来源，旧 action 兼容；聚焦测试 38/38 |
| H3 局部状态 | completed | pending 沿依赖与共享文件组传播；独立通过保留，help-only 不提升；18/18 tests + typecheck |
| H4 验证计划 | completed | action 建议解析真实 task/workdir 资源，参考输出摘要由引擎派生；自检不冒充独立依据；19/19 tests |
| H5 循环接通 | completed | log 正常路径真实执行 selection/plan/program/check/resolution，写 proposal 并影响选轮；84/84 tests |
| H6 修复与回退 | completed | 一次自动局部修复只复验受影响动作；失败的依赖/共享文件组回退，独立通过保留；39/39 tests |
| H7 包与入口 | completed | v2 包归档最终验证报告并区分 draft/recommendation；v1 只读兼容；CLI 精确披露；41/41 tests |
| H8 新程序实用 | completed | I18n 普通优化链生成 Python checker；原 trace 1/1、未回灌变化输入 4/4；普通 agent 实际调用并完成残余报告 |
| H9 现成程序复用 | completed | Law 真实 0.7 trace 产生 reuse-script；修订包、12/12 变化检查和自然 read/exec/复核通过 |
| H10 条件变化与降级 | completed | 5/5 预登记条件通过；8 条 acquisition 整命令误分类由共享解析器修复，历史报告不回写 |
| H11 实际使用开销 | completed | 常规入口策略与 general-skill gzip trace 接入完成；同任务配对质量通过、discovery 2→1、tool 11→9，完整指标与 unknown USD 并列 |
| H12 过程复用 | completed | Env 同入口单次尝试为合理 no-change，未制造程序或包 |
| H13 工程使用 | pending | 研究 runner 外的正常入口、可搬运包与真实命令 |
| H14 验证与交付 | pending | 有限回归、文档、精确提交并推用户 origin |

执行顺序调整为当前 H12 → R1–R7 → H13 → 适用 Y1/Y2 → H14。R 队列是用户最新要求的必需开发，不是可选调研；本次只追加文档，尚未将 R 阶段标为已执行。

| 新增阶段 | 状态 | 交付与验收 |
| --- | --- | --- |
| R1 自动采集 | completed | 本次 run/skill/task/trace 唯一关联；输入/skill 资源隔离，异常与不完整状态准确 |
| R2 自然任务入口 | completed | 正常运行一次后自动优化，无需 task.json/logs/locator；阶段恢复不重跑 source |
| R3 无人工评分文件 | completed | 重新执行 task/source 文件断言；旧 pass 与未评分 reference 不再冒充候选正确性，缺失案例局部保留 |
| R4 生成过程改进 | completed | `IMPLEMENTATION_CONTEXT` 组织入口/输入/格式/参数/检查；动作真实兑现；V3 绑定失效和 V5 能力边界通过 |
| R5 可用与恢复 | active | 新包易调用、原成果保留、失败有具体下一动作；完成 V6 原子发布与不重放 |
| R6 多结构实用 | pending | 两种结构同入口真实尝试，至少一条原/变化任务完整通过 |
| R7 整体验收 | pending | 无人工接线命令、故障与恢复测试、准确支持矩阵 |

revision 3 在现有阶段补充 V1–V6：R1 保护同名资源/执行前输入；R3 实际执行输出断言并局部处理缺失案例；R4 处理修复后观察失效与参数适用边界；R5 避免半成品和重复副作用；R7 运行相应反例。V1 已临时实测空程序被旧 criterion 引用误提升，必须修复，不能只降低文档措辞。其余按代码定位写有针对性的回归，不新增大队列或审计协议。

Y1 多程序接力、Y2 缺信息可用性只在包含 R 队列的主链达标且收尾窗口前有明确问题时执行，不能替代主链或用于凑时长。

## 最低工程交付

1. 普通 CLI/log 路径实际完成动作实施、程序验证、修复/回退和最终包导出。
2. 至少一个真实非 API 新程序由优化器生成，原/变化输入按独立规则检查并自然消费；文档改写不能替代。
3. 现成脚本复用经过实际执行，另一结构经过同流程尝试；no-change 不计收益。
4. 条件范围、待验证依赖和 snapshot/验证一致性修复进入生产代码与行为测试。
5. 原件保留、失败/未知清楚，已支持路径无需研究 runner 手工接线，相关测试与类型检查通过。
6. 新增 R1–R7：默认入口自动捕获本次真实 trace，至少一项无人工评分文件路径有实际覆盖；两种结构同流程尝试，其中一条原/变化任务完整通过，恢复不重跑原业务任务。未知外部 agent 不冒充已支持。

工程、任务质量和效果分别判定。质量不退化时争取减少目标开销或重复机械工作，允许小收益并如实保留 mixed；不从多个指标事后挑一个下降就宣布总体成功。阶段全终态、包闭包通过和单测数量均不能替代最低工程要求。

## 工作方式与恢复

- 直接在 `skill-ir-aot` 开发，只推用户 `origin`，保留其他线程 tracked/未跟踪材料。
- H0 才创建 `results/skill-ir/skill-optimization-production-closure-20260913/status.json`；当前不得伪造运行结果。
- 复用模型、trace adapters、workspace/loop/proposals 和可选 API/Env 组件，不新建优化器、不统一强制 API/JSON 输入。
- 定向补充公开 development 材料与真实 trace；网络、认证 GitHub CLI、远端 API 和有用途付费调用按既有授权使用，实际及未知成本分列。
- 一次生成/验证、明确错误时一次自动修复；有新根因可继续改共享工程，不无限抽样或补样。
- 不启动 Q1/held-out/prospective、不修改 readiness 或历史证据；不重复历史全量审计、clean/摘要循环。
- 按任务书连续推进，常规检查点不等确认；完成主线与适用追加任务后交付。尚有可执行必需工作时不把持续目标标记为完成。
