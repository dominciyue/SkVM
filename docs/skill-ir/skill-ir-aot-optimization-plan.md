# Skill IR AOT 当前执行计划

- 更新日期：2026-09-27
- 路线：按skill/task范围设计领域表达，当前为源码可见授权与信任边界任务。
- 状态：AB0–AB13及独立AC/AD已完成，最终2525d387与origin对齐；新授权AE/AF/AG准备派发。
- 唯一入口：[current-status.md](current-status.md)
- 合同：[spec 14.34](skill-ir-aot-optimization-spec.md#1434-按-skilltask-范围设计领域-dsl)
- 当前任务书：[AE0–AE11](../superpowers/plans/2026-09-27-authorization-explicit-policy-result.md)、[AF0–AF8](../superpowers/plans/2026-09-27-authorization-scenario-workspace.md)、[AG0–AG8](../superpowers/plans/2026-09-27-token-accounting-semantics.md)
- 当前设计：[研究§7.26](skill-dsl-research.md#726-aeafag-结果表达场景复用与计量)；前轮证据保留在§7.25。

分类继续服务于范围，DSL价值包含编写、修改、质量与效率。AB同包/schema/核心可处理两项目八状态；Markdown 8/8 full、DSL 6/8 full，后者两项标签错误，必要控制与解释均正确。DSL整体收益未建立，准备/修改/运行负担及限制见研究§7.25。

## 当前独立并行队列

| 任务 | 完整目标 | 验收与所有权 |
|---|---|---|
| AE0–AE11 | 明确政策状态的v5协议、完整接线和MD/DSL效果对照 | 24首轮至多4共享修订；核心与共享文档/Git唯一写者 |
| AF0–AF8 | 场景工作区、普通v2声明生成和来源预览 | 离线新模块/handler/示例，已有输入不改，ready后交AE |
| AG0–AG8 | 计量语义纯模块、比较脚本、AB口径澄清 | 离线新路径，旧provider/报告只读，ready后交AE |

三者是不同目标，AF/AG不承担AE研究任务。均Astra ultra及宿主Fast/priority；精确速度倍率未测。侧任务不写Git、不装依赖、不写共享文档。AE先完成自己的工程/面板，侧任务ready后串行整合、分别提交。聚合测试在侧任务停止写入后运行；禁止互相覆盖。未知完成和失败如实记录，完成后停止。

AB token复核：旧+12.0%为非缓存input+output；完整prompt+output（含单列缓存读取）为+3.279%。本轮AG追加可复算说明，旧AB原件保留。

## 已完成AB交付队列

| 阶段 | 工作 | 验收要点 |
|---|---|---|
| AB0–AB2 | 基线、来源规则、新任务与oracle | 首合格来源；policy与实现分开；最多两项目八状态，失败不换样 |
| AB3–AB4 | locate与薄skill使用包 | 显式文件只读定位；复用现有runtime/v2，无repo专用分支 |
| AB5 | Markdown共同host研究入口 | 真实作者Markdown，源码/v4/计量共同，repair不换臂 |
| AB6–AB7 | 四作者原/变编写、输入准备修复 | 两臂同资料/工具/机会；主代理不代填；记录机械与语义负担 |
| AB8 | 真实对照（完成） | 16/16 completed、16次响应、0 unknown、0目标执行；原始标签保持 |
| AB9–AB10 | 评价、价值判断（完成） | MD 8 full、DSL 6 full/2标签错误；追加0，整体收益未建立 |
| AB11–AB13 | 普通使用、有限验证、发布 | 包能按实际路径使用；统一复盘；归属提交并推送用户origin |

## 工作边界

- 直接在skill-ir-aot，不建新分支/worktree，保留七项原修改与历史untracked，只推用户origin。
- 新项目按任务书登记external development；旧Q1/held-out/prospective/readiness和历史结果不动。
- 不做仓库主动发现、目标执行、部署验证或patch，不建设UI或通用模板引擎。
- 恢复及并行开发gpt-6-astra / ultra，被测xty/gpt-5.6-sol；认证网络和有目的付费已授权，美元unknown如实报告。
- 基线普通说明与DSL共享执行工具、公开事实和修复机会，作者材料真正独立；结论限同helper流程比较。
- 任务完成后停止，不等待或重复调用凑时长；受阻研究分支与独立工程分开推进。

## 已有结果与恢复

AA复核183/183测试、1337断言及typecheck通过；独立模型作者1/2首稿有效，行号修订后2/2完成，四次普通运行均正确deny→allow。五组plain/ledger都full，ledger input+output多54.6%、累计调用耗时多23.3%；header conditions解释更全但有一次修复。初轮与离线规则修订、作者与分析成本分别保留。

AB恢复读状态页、本任务书、研究§7.25及执行代理建立的`results/skill-ir/skill-dsl-research/development/authorization-external-reuse-v1/status.json`。当前结果的紧凑导航见[`results/skill-ir/experiment-catalog.json`](../../results/skill-ir/experiment-catalog.json)；统一研究正文及时更新主题，原始证据由[索引](evidence-index.md)与[历史](history.md)承载。

## 9月26日独立并行队列

AB revision 2从AB9恢复，保留16条真实生成结果，完整研究和交付由一个任务连续负责。另有两个独立目标，均非AB拆分：

| 队列 | 目标 | 任务书 |
|---|---|---|
| AC0–AC7（已集成`8f27afb3`） | DSL编辑schema、字段说明、结构差分检查和独立编辑示例 | [AC](../superpowers/plans/2026-09-26-authorization-authoring-editor-support.md) |
| AD0–AD7（已集成`ffc6578e`） | 既有实验目录的只读核验、检索、摘要导出工具 | [AD](../superpowers/plans/2026-09-26-experiment-catalog-maintenance.md) |

三任务Astra ultra、Fast配置；AC/AD仅写独占目录且不调用业务模型、不写Git索引。AB负责所有共享文档、精确归属提交和用户origin发布。工程间必要协作通过各自ready.json/integration-notes与任务消息，不并发覆盖文件。各自完成/partial独立记录，不把侧任务纳入AB实验分母。
