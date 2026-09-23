# Skill IR AOT 当前执行计划

- 更新日期：2026-09-23
- 路线：按skill/task范围设计领域表达，当前为源码可见授权与信任边界任务。
- 状态：AA已完成发布；AB0–AB8已完成，16/16真实生成单元已闭合，AB9评价待执行。
- 唯一入口：[current-status.md](current-status.md)
- 合同：[spec 14.34](skill-ir-aot-optimization-spec.md#1434-按-skilltask-范围设计领域-dsl)
- 当前任务书：[AB0–AB13](../superpowers/plans/2026-09-22-authorization-external-reuse-and-baseline.md)
- 当前设计：[研究§7.25](skill-dsl-research.md#725-ab-外部复用与普通说明对照)

分类继续服务于范围，DSL价值包含编写、修改、质量与效率。AA证明作者v2/compare可用，普通plain与ledger在五组任务质量持平，ledger负担更大。AB稳定当前实现，已完成新项目和真正独立的普通说明对照生成；原始回答标签保留，语义评价尚未计入结论。

## 完整交付队列

| 阶段 | 工作 | 验收要点 |
|---|---|---|
| AB0–AB2 | 基线、来源规则、新任务与oracle | 首合格来源；policy与实现分开；最多两项目八状态，失败不换样 |
| AB3–AB4 | locate与薄skill使用包 | 显式文件只读定位；复用现有runtime/v2，无repo专用分支 |
| AB5 | Markdown共同host研究入口 | 真实作者Markdown，源码/v4/计量共同，repair不换臂 |
| AB6–AB7 | 四作者原/变编写、输入准备修复 | 两臂同资料/工具/机会；主代理不代填；记录机械与语义负担 |
| AB8 | 真实对照 | 16/16 completed、16次响应、0 unknown、0目标执行；原始标签14/2，待评价 |
| AB9–AB10 | 一次修订、价值判断 | 至多4追加；准备/修改/运行分列；不预设正向 |
| AB11–AB13 | 普通使用、有限验证、发布 | 包能按实际路径使用；统一复盘；归属提交并推送用户origin |

## 工作边界

- 直接在skill-ir-aot，不建新分支/worktree，保留七项原修改与历史untracked，只推用户origin。
- 新项目按任务书登记external development；旧Q1/held-out/prospective/readiness和历史结果不动。
- 不做仓库主动发现、目标执行、部署验证或patch，不建设UI或通用模板引擎。
- 开发gpt-6-astra / medium，被测xty/gpt-5.6-sol；认证网络和有目的付费已授权，美元unknown如实报告。
- 基线普通说明与DSL共享执行工具、公开事实和修复机会，作者材料真正独立；结论限同helper流程比较。
- 任务完成后停止，不等待或重复调用凑时长；受阻研究分支与独立工程分开推进。

## 已有结果与恢复

AA复核183/183测试、1337断言及typecheck通过；独立模型作者1/2首稿有效，行号修订后2/2完成，四次普通运行均正确deny→allow。五组plain/ledger都full，ledger input+output多54.6%、累计调用耗时多23.3%；header conditions解释更全但有一次修复。初轮与离线规则修订、作者与分析成本分别保留。

AB恢复读状态页、本任务书、研究§7.25及执行代理建立的`results/skill-ir/skill-dsl-research/development/authorization-external-reuse-v1/status.json`。当前结果的紧凑导航见[`results/skill-ir/experiment-catalog.json`](../../results/skill-ir/experiment-catalog.json)；统一研究正文及时更新主题，原始证据由[索引](evidence-index.md)与[历史](history.md)承载。
