# Skill IR 当前状态

更新于2026-10-09。工作分支为 `skill-ir-aot`，仅发布到用户 `origin`。本页是唯一实时状态入口；历史任务书与结果保留当时记录。

## 当前工作

**[BA0–BA18：授权语义提交、实际采用与完整任务验证](../superpowers/plans/2026-10-09-authorization-semantic-submission-and-adoption.md)当前为 `in-progress-external-blocker`，研究目标未达。** 开发模型 `gpt-6.1-sol/max`，接管HEAD `1c822e10`。22位置中两pilot共4尝试：3自然交付，最新OWUI具名复验在 `11dc68a5` 终态路由失败、无交付；一次恢复已用，通道暂停。20位置未执行，原因逐项保留在[summary](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-submission-v1/summary.json)。

宿主管理语义编辑、精确协议反馈、有限检查预算及await/残余调用顺序修复已有工程证据。Download修订7单元/7材料、1采用、0性质绑定，源码partial；OWUI首件5单元、0采用、1绑定unknown，原题自然答案full且有明确上游/部署限制。离线重放恢复3采用不回填真实原件；两项完整真实机器链仍未成立。两作者包已原字节兼容、搬移恢复检查通过，实际消费与变化复用未测。

BA共同任务事实保留原问题，M/D共用相同义务及核心，旧作者包单列消费。12完整质量、2消费、6变化位置均未运行；previous变化还缺合格当前Download基础。4尝试中3份用量已知：输入10,707,789（含缓存10,026,624）、输出46,863；路由失败尝试用量、实际USD及隐藏请求unknown，比较inconclusive。恢复须先取得新的外部路由证据，再核实无活动/未知完成并登记新具名OWUI复验；不重复探针或绕过暂停。

方法合同见[spec §14.40](skill-ir-aot-optimization-spec.md#1440-ba-semantic-submission-and-adoption)，复核和取舍见[研究 §7.62](skill-dsl-research.md#762-ba-从真实拒绝到可用语义编辑)。新结果写入authorization-semantic-submission-v1；任务书里的要求不能视为结果。

## AZ 已结束的结果与本次复核

[AZ任务书](../superpowers/plans/2026-10-09-authorization-property-abstraction-and-real-use.md)以completed-with-unmet-criteria收束。21逻辑位置中4已尝试，共5尝试/4自然交付；3次领域运行都耗尽格式额度且0接受/采用/检查。N自然源码评价full，M漏全局GET权限而partial，D官方routing失败；17位置未运行。显式v6性质绑定、有限摘要与采用诊断已实现，完整框架关系仍缺。

原参数复核发现field/value待办形状、annotation合同、union错误提示和最终答案字段之间存在摩擦；有一次合法annotation还缺可执行condition，不能只修格式就宣称链闭合。57项定向回归/331断言通过。原件与结论保持：[summary](../../results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/summary.json)、[verification](../../results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/verification.json)、[status](../../results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/status.json)。

## AY 已结束的真实结果

- [AY0–AY23](../superpowers/plans/2026-10-07-authorization-question-dependencies-and-usable-dsl.md) 已以 `completed-with-unmet-criteria` 收束。14 次归档尝试：10 delivered、2 unavailable、2 failed；12 个质量位置未运行。完整可用、比较收益及研究目标尚未达成。
- AY结构语义为 `source-bindings/v35`，AZ v6复用它。Download v35 接受3个源码单元、30个控制步骤、2次材料采用，仍有未解释callee和装饰器依赖；OWUI v35为0接受单元、0控制步骤、0材料采用，存在角色缺失及结论冲突。两次native自然终答均被独立评为partial。
- 两作者包已按原字节实际消费。Download消费者源码评阅full但机器partial；OWUI消费者仍有决定性helper未读。变化中policy-fresh、premise-fresh/previous已有运行；policy-previous路由失败、source-fresh额度拒绝，source-previous及质量位置保留未运行。
- 原件、计量及验收以 [最终收束](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/final-closure-v35.json)、[manifest](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/manifest.json)、[状态](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/status.json) 为准。历史 `acceptance` 字段表达要求，不代表实际通过。

AZ启动前复核发现的依赖范围、投影诊断和格式计数问题已有有界修复，形成过程保留在研究§7.61。当前新增责任以§7.62为准；`inquiry-result`的整体Schema/缺题拒绝及局部保留继续保持。

## 账号、运行和继承边界

- 开发 `gpt-6.1-sol/max`；实验沿用用户已授权的当前官方账号 `gpt-5.6-sol/high`，无需再次确认。第三方API和AV旧位置继续暂停。
- AY的2026-10-14额度提示及AZ的channel=unavailable保留为历史观测。BA首个Download恢复成功；OWUI的await-argument-read-1再次终态 `workspace routing discovery failed`、quotaRefused=false，0模型动态调用/2宿主启动读取、用量缺报。当前 `paused-recurring-routing`，无活动或未知完成；一次恢复已用，不额外探针、轮询、普通CLI旁路或切换。
- 不自动切账号、模型、端点或购买额度；未知完成先核查本地生命周期。缺报USD、隐藏请求、开发/探子成本和真人分钟保持unknown。
- 保留原skill、全部原问题、允许源码、用户独立政策及前提。模型输入隔离评价器、历史答案和开发修复记录。held-out、Q1、prospective、readiness和历史 `0/6` 不变。
- 主开发线程是代码、共享方法文档和Git的唯一写者。继续现有分支，不创建worktree；只读探子按AGENTS使用。

## 能力与证据边界

| 路线 | 已有基础 | 当前需要验证 |
|---|---|---|
| 授权任务DSL | 领域声明、作者/prepare/edit/run/compare、只读取证、局部控制、材料失效、检查和账号双入口 | 性质相关范围、真实局部采用、完整原任务质量及变化复用 |
| Trace驱动skill优化 | 自动捕获、修改说明/脚本、局部修复、包导出和自然消费 | 历史收益mixed/negative，按具体包证据判断 |
| 确定性基础 | IR解析/验证、API Tester/Env后端、artifact/recipe导入 | 保留原支持合同及有界正反例，不混成当前DSL效果 |

质量约六成、编写复用约四成指开发投入，各项质量要求分别验收。工程测试、实际使用、同条件收益分别报告；协议失败保留端到端分母，源码语义与机械检查分别评价。

## 恢复和历史入口

| 阶段 | 保留记录 |
|---|---|
| 当前BA | [任务书](../superpowers/plans/2026-10-09-authorization-semantic-submission-and-adoption.md)、[当前计划](skill-ir-aot-optimization-plan.md)、spec§14.40、研究§7.62 |
| AZ | [任务书](../superpowers/plans/2026-10-09-authorization-property-abstraction-and-real-use.md)、[summary](../../results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/summary.json)，spec§14.39、研究§7.61 |
| AY | [任务书](../superpowers/plans/2026-10-07-authorization-question-dependencies-and-usable-dsl.md)、[最终收束](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/final-closure-v35.json)，研究§7.60保留v5/v35形成过程 |
| AX | [summary](../../results/skill-ir/skill-dsl-research/development/authorization-property-execution-v1/summary.json)、[离线包核验](../../results/skill-ir/skill-dsl-research/development/authorization-property-execution-v1/verification/portable-package.json)；原unknown与11个未运行位置不改 |
| AW/AV | [AW summary](../../results/skill-ir/skill-dsl-research/development/authorization-control-materials-v1/summary.json)、[AV status](../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/status.json)，第三方暂停保持 |
| AR–AU及更早 | [唯一研究正文](skill-dsl-research.md)、[历史](history.md)、[证据索引](evidence-index.md)、[实验目录](../../results/skill-ir/experiment-catalog.json) |

普通命令见 [使用说明](../usage.md)，代码与测试定位见 [开发指南](developer-guide.md)。本轮不新增长期阅读文档，研究仍统一在一个正文中。仅更新当前状态及索引，不把逐次派发和测试日志持续堆到本页。
