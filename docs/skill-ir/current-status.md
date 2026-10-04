# Skill IR 当前状态

更新于 2026-10-04。工作分支为 `skill-ir-aot`，仅发布到用户 origin。本页是唯一实时状态入口；机器状态和原始结果保存具体进度，历史任务书保存当时的执行记录。

## 当前工作

研究主线是 **按 skill/task 范围设计领域表达**。当前任务类为单 repo/ref、源码可见的授权与信任边界评估：围绕主体、资源、操作、条件和政策组织取证、判断与检查。质量约六成、编写复用约四成指开发投入安排，各项质量要求分别验收。

**AS0–AS7 共享实现已接通；OWUI D-S 第四次已实际交付保留的诊断回答，旧同步崩溃消失，但 helper 参数缺口使检查未通过。入口参数修复已通过回归，零调用重放另暴露路径上限，正在同位置具名复验。** 唯一活动任务书为 [AS0–AS19 局部语义展开与真实交付](../superpowers/plans/2026-10-04-authorization-semantic-lowering-and-delivery.md)。本轮从干净且远端对齐的 `c90787f0` 继续，当前机器状态见 [AS status](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/status.json)。重点是显式选择/合流、同一状态生成结果、原 skill 实际消费和真实授权变化复用。旧 `guided-evidence-v2` 保留，新 `semantic-flow-v1` 显式选择；真实使用和质量收益尚未验证，失败即时定位并具名修后复验。

AS 固定 15 质量、4 native、8 变化、2 源码变化位置，作者 4 稿另列。原作者 Memos 未知消费与预选 remove 原任务的源码、v1 政策及三种角色问题一致，原 remove 三臂和依赖它的五个变化位置保留 blocked（8/29），不以换表示或 AS 身份解封。Notes 和 Memos share 仍封存；其它预选任务继续。精确指针见 [AS manifest](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/manifest.json) 与 [继承封存](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/inherited-seals.json)。

## AR 停止快照与继承事项

- 最后工程提交 `cc88bfb2`；已观察调用下界 507。AR 机器状态仍保存退出前的 `in-progress` 快照，不代表进程继续运行。八个主首行已留档并评阅，16 行分母及修订分别保留；六个未运行位置可按新计划承接，两个 Notes 位置及其它未知请求继续封存。
- 两份原 skill 生成的授权配置已经格式有效；随后独立 inquiry 消费中，Memos 最后请求未知，Download 已知修订仍有图和语义缺口。原 skill 的 native 完整授权链仍待验收。
- 新非 API 程序已从原 skill 生成，经保留候选的 host-recovery 导出 draft；同包原/变任务实际执行并交付。中性前提变化 previous 已 checked/bounded，8 次请求、零新源码工具动作；真实授权变化复用与净收益仍待检验。
- 复核发现互斥 admin/non-admin 路径被当作共同前驱，以及已接受角色拒绝事实在终答重新写成 unknown。AS 将模型的语义选择与宿主的身份、路径展开和结果关联分开，先以真实反例检验共享修复。

| 恢复所需信息 | 权威入口 |
|---|---|
| 当前队列 | [AS 任务书](../superpowers/plans/2026-10-04-authorization-semantic-lowering-and-delivery.md)；[AS status](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/status.json) |
| AR 停止前状态 | [status.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/status.json)、[handoff.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/handoff.json) |
| 普通使用的失败与裁定 | [ordinary-adjudication.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/ordinary-adjudication.json) |
| 真实派发、响应与未知费用 | [ordinary-accounting.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/ordinary-accounting.json) |
| 语义评价及未运行分母 | [evaluation-summary.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/evaluation-summary.json) |
| 根因与方法 | [研究 §7.47](skill-dsl-research.md#747-2026-10-04-主线程复核优先修分支合流与图答案同步)、[§7.48](skill-dsl-research.md#748-as-局部语义展开与真实交付) |

## 已有能力与待解决问题

| 路线 | 已有实现 | 当前使用边界 |
|---|---|---|
| 授权任务 DSL | 领域声明、authoring/prepare/edit/run/compare、只读源码工具、局部图、三值求值及引用/结论检查 | 有界 development 能力；决定性依赖、条件提取、协议服从及完整交付仍需完善，新增策略显式启用 |
| Trace 驱动 skill 包优化 | bare-agent 自动捕获、模型修改说明和脚本、局部验证修复、原子导出、自然消费 | 已有真实生成与消费记录；收益 mixed/negative，按各包证据判断 |
| 确定性基础 | IR parser/validator、lowering、API Tester/Env 后端、artifact 和 recipe import | 保留原支持合同及有界案例 |

AQ 旧/新策略 full 均为 2/20，原 skill checked 交付为 0/4；具体分母见[研究 §7.35](skill-dsl-research.md#735-aq-授权领域执行设计)。AR 已有局部改进，整体效果仍未建立。美元费用、真人耗时仍缺测；readiness、历史 `0/6`、Q1 与保护输入保持原有状态。

## 开发与维护入口

- 普通命令和模型配置：[使用说明](../usage.md)。代码定位和检查：[开发指南](developer-guide.md)。
- 当前队列：[当前计划](skill-ir-aot-optimization-plan.md)；方法合同：[spec §14.34](skill-ir-aot-optimization-spec.md#1434-按-skilltask-范围设计领域-dsl)。
- 分类、方法、复盘：[唯一研究正文](skill-dsl-research.md)；旧结果：[证据索引](evidence-index.md)、[历史](history.md)、[实验目录](../../results/skill-ir/experiment-catalog.json)。

[本轮治理](../superpowers/plans/2026-10-04-workspace-and-document-governance.md)已完成材料收存、旧日志压缩、正文归并和停止后的入口校正。当前阅读集 15 份，版本化材料 14 份；研究仍统一在一个正文中。原件及恢复索引在 `project-maintenance/20261004-governance/`，AR 结果及 `.skvm` 保留。五份可再生成的 Python 字节码已清除；三个此前删除被拒绝的空目录保留。治理发布完成后 AS 取得共享文件和 Git 的唯一写入权；Git 实时状态以实际检查为准。

更新本页时替换过时段落，不把逐次测试与派发日志不断追加为新的“当前状态”。
