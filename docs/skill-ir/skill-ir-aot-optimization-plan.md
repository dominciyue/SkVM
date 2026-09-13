# Skill IR AOT 当前执行计划

- 更新日期：2026-09-14
- 路线：C0–C10，原始输入内容、本地程序动作、元数据修复与同一新包消费
- 状态：`active`；C0 已完成，C1 正在执行；本轮尚未启动模型
- 唯一实时状态：[current-status.md](current-status.md)
- 详细任务书：[单次真实运行到新程序包](../superpowers/plans/2026-09-14-skill-optimization-end-to-end-repair.md) revision 1
- 方法依据：spec 14.32

本页以 C 队列为当前计划，下方 H/R 内容为保留的历史阶段摘要。二次复核确认默认新程序生产闭环仍为 partial：R6 新尝试 no-change 后消费旧 H8/H9 包，R7 从旧 H9 包得到文档候选；历史报告原样保留，不再将这些分段结果拼接成新闭环成功。

## 当前待执行队列

| 阶段 | 状态 | 下一交付 |
| --- | --- | --- |
| C0 | completed | 已创建 status/diagnosis；命名根因已分层；基线 12/12、48 assertions |
| C1–C2 | active | 自然任务执行前内容保存，并接入 Evidence/workspace/验证器 |
| C3–C4 | planned | 本地脚本修改、动作声明诊断、修复元数据采纳及最终一致性 |
| C5–C6 | planned | 局部机会判断、无人工评分文件的来源检查和正确推荐边界 |
| C7 | planned | 自动输入到同一新程序包的连续集成测试及旧包替换反例 |
| C8–C9 | planned | 原始 Law/I18n 的新真实尝试，同新包自然消费及少量成对效果 |
| C10 | planned | 一次相关回归、文档、精确提交并推用户 origin |

至少一条本次生成非 API 参数化程序的普通链必须完整通过原/变化任务；现成脚本路线另有真实尝试。no-change、文档候选、旧包成功和测试数不能替代。模型/网络/付费授权继续有效；只在 C0 启动时创建 `results/skill-ir/skill-optimization-end-to-end-repair-20260914/status.json`，本次仅制定计划。

## 上一轮目标与执行记录（历史）

将现有 JIT-optimize、程序验证、动作解析与通用 exporter 接成正常用户流程。默认用户选择 skill、描述自然任务和工作目录，系统运行一次后自动捕获并关联真实 trace，再复用或生成程序、改进文档，经实际验证与有限修复，导出新包。手工日志保留为高级兼容入口，不是用户必需工作。

H0 启动时的验证接线、待验证依赖和最终包状态缺口已由 H3–H7 修复；G 文档包与新 H8/H9 程序结果分开。已有 30 个阅读条目包含 10 个深读，追加阅读只围绕明确结构缺口。revision 2 追加的是自动采集与免手工接线，不能用历史程序结果替代。

## 上一轮已执行队列

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
| H13 工程使用 | completed | 普通自然入口、一次复制后的临时目录闭包/TXT 消费与实际命令均已验证；首个 cache 污染失败保留 |
| H14 验证与交付 | completed | 首次 343/347 后修复 4 项，针对性 18/18、最终 347/347；typecheck/文档通过，三分栏总报告已交付 |

执行顺序 H12 → R1–R7 → H13 → 适用 Y1/Y2 → H14 已完成。Y1 因无真实双程序前提记不适用，Y2 复用 R7 缺 provider cost 的真实支持 trace 完成；没有回滚或重抽 R6/R7 的模型样本。

| 新增阶段 | 状态 | 交付与验收 |
| --- | --- | --- |
| R1 自动采集 | completed | 本次 run/skill/task/trace 唯一关联；输入/skill 资源隔离，异常与不完整状态准确 |
| R2 自然任务入口 | completed | 正常运行一次后自动优化，无需 task.json/logs/locator；阶段恢复不重跑 source |
| R3 无人工评分文件 | completed | 重新执行 task/source 文件断言；旧 pass 与未评分 reference 不再冒充候选正确性，缺失案例局部保留 |
| R4 生成过程改进 | completed | `IMPLEMENTATION_CONTEXT` 组织入口/输入/格式/参数/检查；动作真实兑现；V3 绑定失效和 V5 能力边界通过 |
| R5 可用与恢复 | completed | 原子 staging/verify/publish、包内使用指南、失败下一动作与 package-only session 恢复；V6 通过 |
| R6 多结构实用 | completed | 两种结构均完成 fresh capture/handoff、optimizer 与历史验证包的原/变化消费；四个最终样本独立检查通过，当前 optimizer 结果为 no-change、effect unknown |
| R7 整体验收 | completed | 普通目录真实命令完成 source/capture/proposal；包失败经共享修复后只恢复导出；七项故障矩阵、V1–V6 与 bare-agent-only 支持矩阵已绑定 |

revision 3 在现有阶段补充 V1–V6：R1 保护同名资源/执行前输入；R3 实际执行输出断言并局部处理缺失案例；R4 处理修复后观察失效与参数适用边界；R5 避免半成品和重复副作用；R7 运行相应反例。V1 已临时实测空程序被旧 criterion 引用误提升，必须修复，不能只降低文档措辞。其余按代码定位写有针对性的回归，不新增大队列或审计协议。

R6 的机器入口为 `results/skill-ir/skill-optimization-production-closure-20260913/r6/report.json`。I18n generated checker 对 2-key 原输入和带新插值的 3-key 变化输入均独立 exit 0，系统 evaluator 最终均 5/5；Law 现成程序对两份无评分自然输入均实际运行，source-owned Stage3 各 8/8。当前新优化尝试均为 no-change，包内容按任务书复用 H8/H9，未导入其 report 充当新 capture。Windows 长路径、输出观察、评价隔离、锚点入口及 native command shell 的共享缺口已由 TDD 修复；首个无效 variation fixture 与命令重试保留。actual USD 和可比效果仍为 unknown。

R7 的机器入口为 `results/skill-ir/skill-optimization-production-closure-20260913/r7/report.json`。普通项目命令没有 task/log/locator/criteria/package-out 接线，source、capture、handoff 与 proposal 均由默认入口产生；原 Law 产物 Stage3 通过。该 optimizer 只给出未验证的文档改进，因此包为 draft，不新增程序行为正例。实际运行修复了 Windows 无 HOME 时 cache 落入 cwd，以及有效优化包无法再次导出的共享缺陷；首次 package failure 通过同一 session 的 package-only resume 完成，未重跑业务任务或 optimizer。自动 capture 当前只确认 bare-agent，其他注册 adapter 保持 unverified；USD unknown 不记零。

H13 的机器入口为 `results/skill-ir/skill-optimization-production-closure-20260913/h13/report.json`。R7 包一次复制到全新系统临时目录后，生产闭包核验在复制处通过；从新 cwd 使用复制包的 `python -B` TXT 命令，Stage3 A/B/overall 通过，输入和包均保持摘要不变，研究根路径匹配为 0。首次复制因预检查生成的未跟踪 Python cache 而被正确拒绝，失败保留且未改提交字节。该结果只证明局部 TXT 可搬运消费，不改变 draft/behavior not-run 与 effect unknown。随后进入 H14 有限回归和最终交付。

H14 的机器入口为 `results/skill-ir/skill-optimization-production-closure-20260913/h14/verification.json`，总报告为同 identity 的 `final-report.json`。首次合并回归 343/347，四项失败全部保留并归因为两项 Windows 路径测试、一个并发测试调度假设和一个嵌套 snapshot portable-key 生产缺陷；共享 reader 与测试边界修复后，针对性 18/18、最终合并 347/347、typecheck 与文档治理均通过。最终判断 engineering complete、behavior partial、effect unknown；无 readiness、prospective 或人工节省结论。当前路线停止扩展，等待复核。

Y1 多程序接力因当前真实最终选择没有双程序组合而 `not-applicable`；Y2 由 R7 实际 bare-agent trace 在成本字段未知时仍给出有依据的小改进、诊断和 draft/no-program 状态，记 `passed-existing-evidence`。没有新增模型调用、adapter 或真实样本。

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
- C0 才创建 `results/skill-ir/skill-optimization-end-to-end-repair-20260914/status.json`；不更新旧 H/R 状态来表示新工作。
- 复用模型、trace adapters、workspace/loop/proposals 和可选 API/Env 组件，不新建优化器、不统一强制 API/JSON 输入。
- 定向补充公开 development 材料与真实 trace；网络、认证 GitHub CLI、远端 API 和有用途付费调用按既有授权使用，实际及未知成本分列。
- 一次生成/验证、明确错误时一次自动修复；有新根因可继续改共享工程，不无限抽样或补样。
- 不启动 Q1/held-out/prospective、不修改 readiness 或历史证据；不重复历史全量审计、clean/摘要循环。
- 按新 C0–C10 任务书连续推进，常规检查点不等确认；最低新程序闭环条件达成后交付。尚有可执行必需工作时不把持续目标标记为完成。
