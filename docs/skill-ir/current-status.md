# Skill IR 当前状态

更新于 2026-10-05。工作分支为 `skill-ir-aot`，仅发布到用户 origin。本页是唯一实时状态入口；机器状态和原始结果保存具体进度，历史任务书保存当时的执行记录。

## 当前工作

研究主线是 **按 skill/task 范围设计领域表达**。当前任务类为单 repo/ref、源码可见的授权与信任边界评估：围绕主体、资源、操作、条件和政策组织取证、判断与检查。质量约六成、编写复用约四成指开发投入安排，各项质量要求分别验收。

**[AT0–AT19 源码解释闭合与普通 skill 交付](../superpowers/plans/2026-10-05-authorization-focused-closure-and-delivery.md) 正在执行，当前推进 AT10–AT14。** 开发模型 `gpt-6.1-sol / max`，分析模型 `xty/gpt-5.6-sol`；从 `9c86e9eb` 接管，分支 `skill-ir-aot`，仅发布用户 origin。持久 focus、宿主身份、纯 helper 摘要、字段/返回对象和双入口绑定已实现；原件、封存和预算保留。[AT manifest](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/manifest.json)登记共同输入及所有位置。

累计152/152响应，美元、真人和开发用量未知。四作者稿格式有效且忠实（10/8/6/8题）。两份完整原 skill 的原任务 native 已实际消费，自然源码说明经核验充分、形式化结果仍不 checked；两条 debug 仍 partial。索引搜索同题实测将物理读取从8,379,114降到2,039,548字节，未建立质量收益。独立核验发现结束时全来源校验此前缺失，现已加预算内确定性校验并撤回失效结果：生产704 pass/1 skip/4654断言，AT脚本6 pass/23断言，双类型检查通过。下一步改任务 native、四份原字节消费、变化及12条质量位置；previous要求本轮来源full且checked/bounded基础。

最近完成的 [AS0–AS19](../superpowers/plans/2026-10-04-authorization-semantic-lowering-and-delivery.md) 以 `completed-with-unmet-criteria` 收束，完整源码质量与净收益未建立。[AS汇总](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/summary.json)和 [AS status](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/status.json)继续保存其原结果。`semantic-flow-v1` 已接入 inquiry/native，旧默认与 `guided-evidence-v2` 保留。

AS 固定 15 质量、4 native、8 变化、2 源码变化位置，作者4稿与原字节消费另列。12个可运行质量首轮均保留并评阅，源码语义完整为0；两份完整原 skill 的4个原/变 native位置均实际消费，最后1/4形式checked/bounded、0/4完整源码质量。4份作者稿格式有效并按原字节消费，下游仍部分失败。Memos remove三臂和五个依赖位置保持封存（8/29）；Paperless五个变化位置因无合格原基线零调用阻塞。Notes/Memos share封存不动。身份见 [manifest](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/manifest.json)、[继承封存](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/inherited-seals.json)及[依赖准入](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/verification/dependent-admissions.json)。

局部修复实际消除了协议、参数身份、坏稿恢复及候选定位的具体障碍，但已读helper未进入解释、current-offer/handle错误、源码条件遗漏和效果断言过强仍阻止完整交付。AS验证744 pass/1 skip/4867断言，另2项provider合同/8断言，共746项通过；主/AS类型和离线重放通过。39份已关闭原件共300派发/298响应，AS无活动实验；已知完整prompt 7,707,021、output 296,467，另有2次usage缺报，美元/真人/开发成本未知。本次接续复核重跑78项相关测试、405断言通过，未新增模型调用。

## AR 停止快照与继承事项

- 最后工程提交 `cc88bfb2`；已观察调用下界 507。AR 机器状态仍保存退出前的 `in-progress` 快照，不代表进程继续运行。八个主首行已留档并评阅，16 行分母及修订分别保留；六个未运行位置可按新计划承接，两个 Notes 位置及其它未知请求继续封存。
- 两份原 skill 生成的授权配置已经格式有效；随后独立 inquiry 消费中，Memos 最后请求未知，Download 已知修订仍有图和语义缺口。原 skill 的 native 完整授权链仍待验收。
- 新非 API 程序已从原 skill 生成，经保留候选的 host-recovery 导出 draft；同包原/变任务实际执行并交付。中性前提变化 previous 已 checked/bounded，8 次请求、零新源码工具动作；真实授权变化复用与净收益仍待检验。
- 复核发现互斥 admin/non-admin 路径被当作共同前驱，以及已接受角色拒绝事实在终答重新写成 unknown。AS 将模型的语义选择与宿主的身份、路径展开和结果关联分开，先以真实反例检验共享修复。

| 恢复所需信息 | 权威入口 |
|---|---|
| 最新执行及未达责任 | [AT任务书](../superpowers/plans/2026-10-05-authorization-focused-closure-and-delivery.md)；最近结果仍为[AS summary](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/summary.json) |
| AR 停止前状态 | [status.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/status.json)、[handoff.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/handoff.json) |
| 普通使用的失败与裁定 | [ordinary-adjudication.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/ordinary-adjudication.json) |
| 真实派发、响应与未知费用 | [ordinary-accounting.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/ordinary-accounting.json) |
| 语义评价及未运行分母 | [evaluation-summary.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/evaluation-summary.json) |
| 根因与方法 | [研究 §7.49](skill-dsl-research.md#749-as-复核与-at-源码解释闭合计划)；AS原设计与结果见[§7.48](skill-dsl-research.md#748-as-局部语义展开与真实交付) |

## 已有能力与待解决问题

| 路线 | 已有实现 | 当前使用边界 |
|---|---|---|
| 授权任务 DSL | 领域声明、authoring/prepare/edit/run/compare、只读源码工具、局部图、三值求值及引用/结论检查 | 有界 development 能力；决定性依赖、条件提取、协议服从及完整交付仍需完善，新增策略显式启用 |
| Trace 驱动 skill 包优化 | bare-agent 自动捕获、模型修改说明和脚本、局部验证修复、原子导出、自然消费 | 已有真实生成与消费记录；收益 mixed/negative，按各包证据判断 |
| 确定性基础 | IR parser/validator、lowering、API Tester/Env 后端、artifact 和 recipe import | 保留原支持合同及有界案例 |

AQ 旧/新策略 full均为2/20，原 skill checked交付为0/4；具体分母见[研究 §7.35](skill-dsl-research.md#735-aq-授权领域执行设计)。AS有形式交付与局部机制进展，完整质量仍未建立；下一责任是把可读/已读决定性依赖变成正确的接受解释，再取得原/变完整回答和合格复用基线。费用和人力缺测、readiness、历史 `0/6`、Q1 与保护输入保持原有状态。

## 开发与维护入口

- 普通命令和模型配置：[使用说明](../usage.md)。代码定位和检查：[开发指南](developer-guide.md)。
- 当前队列：[当前计划](skill-ir-aot-optimization-plan.md)；方法合同：[spec §14.34](skill-ir-aot-optimization-spec.md#1434-按-skilltask-范围设计领域-dsl)。
- 分类、方法、复盘：[唯一研究正文](skill-dsl-research.md)；旧结果：[证据索引](evidence-index.md)、[历史](history.md)、[实验目录](../../results/skill-ir/experiment-catalog.json)。

[治理](../superpowers/plans/2026-10-04-workspace-and-document-governance.md)已完成材料收存、旧日志压缩、正文归并和停止后的入口校正。当前阅读集 15 份，版本化材料 14 份；研究仍统一在一个正文中。原件及恢复索引在 `project-maintenance/20261004-governance/`，AR/AS 结果及 `.skvm` 保留。五份可再生成的 Python 字节码已清除；三个此前删除被拒绝的空目录保留。AS进程已结束，AT派发后取得共享文件和 Git 的唯一写入权；Git实时状态以实际检查为准。

更新本页时替换过时段落，不把逐次测试与派发日志不断追加为新的“当前状态”。
