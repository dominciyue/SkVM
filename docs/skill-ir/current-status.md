# Skill IR 当前状态

更新于2026-10-09。工作分支为 `skill-ir-aot`，仅发布到用户 `origin`。本页是唯一实时状态入口；历史任务书与结果保留当时记录。

## 当前工作

**[AZ0–AZ18：授权性质抽象、真实检查与变化复用](../superpowers/plans/2026-10-09-authorization-property-abstraction-and-real-use.md)以 `completed-with-unmet-criteria` 收束，研究目标未达。** 显式v6的性质绑定、保守依赖收缩、窄局部摘要、采用诊断及有限格式恢复已实现。21个逻辑位置中4个已尝试，共5次尝试/4自然交付；单性质首件及具名修正均无材料采用或机器结果。生产比较快照为 `cef00a3c`。

本轮重点是让原问题真正决定证据需求，扩展现有局部摘要的适用范围，并在 Download、OWUI 的完整原 skill 中验证实际检查。新策略 `operation-evidence-v6`复用既有 inquiry/native、结构索引、材料和 CLI。当前机械摘要只覆盖有限的平坦普通helper；框架关系仍有残余，不能把离线垂直链写成全部AZ3–AZ8验收。

12位置质量面板只运行Download N/M/D首轮：N自然源码评价full，M遗漏全局GET权限而partial，D在工具调用前因官方workspace routing discovery failed未交付；其余9质量、2消费、6变化共17位置保留未运行。没有同条件D答案、第二任务或真实复用收益，比较为inconclusive。离线包搬移和变化撤回不替代这些验收。

方法合同见 [spec §14.39](skill-ir-aot-optimization-spec.md#1439-az-property-abstraction-and-real-use)，复核和取舍见 [研究 §7.61](skill-dsl-research.md#761-az-性质抽象材料采用与真实检查的开发决定)。实际结果以 [summary](../../results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/summary.json)、[accounting](../../results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/accounting.json)、[verification](../../results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/verification.json) 和 [状态](../../results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/status.json) 为准；requirements与outcomes分开，researchGoalAchieved=false。

## AY 已结束的真实结果

- [AY0–AY23](../superpowers/plans/2026-10-07-authorization-question-dependencies-and-usable-dsl.md) 已以 `completed-with-unmet-criteria` 收束。14 次归档尝试：10 delivered、2 unavailable、2 failed；12 个质量位置未运行。完整可用、比较收益及研究目标尚未达成。
- 最新生产语义为 `source-bindings/v35`。Download v35 接受3个源码单元、30个控制步骤、2次材料采用，仍有未解释callee和装饰器依赖；OWUI v35为0接受单元、0控制步骤、0材料采用，存在角色缺失及结论冲突。两次native自然终答均被独立评为partial。
- 两作者包已按原字节实际消费。Download消费者源码评阅full但机器partial；OWUI消费者仍有决定性helper未读。变化中policy-fresh、premise-fresh/previous已有运行；policy-previous路由失败、source-fresh额度拒绝，source-previous及质量位置保留未运行。
- 原件、计量及验收以 [最终收束](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/final-closure-v35.json)、[manifest](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/manifest.json)、[状态](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/status.json) 为准。历史 `acceptance` 字段表达要求，不代表实际通过。

2026-10-09只读复核确认：问题相关依赖目前仍要求全体可达调用；材料投影有原因丢失；格式拒绝消耗检查槽。`inquiry-result` 已具备整体Schema/缺题拒绝和局部有效结果保留，定向8 tests/40 assertions通过，应保持而非重复修复。详细依据统一在研究§7.61。

## 账号、运行和继承边界

- 开发 `gpt-6.1-sol/max`；实验沿用用户已授权的当前官方账号 `gpt-5.6-sol/high`，无需再次确认。第三方API和AV旧位置继续暂停。
- AY的2026-10-14额度恢复提示保留为历史。AZ先有4次自然交付，随后D首轮出现官方路由终态故障；当前channel=unavailable。已停止余下派发，不轮询或切换；恢复须有新的外部可用性证据，不能由旧日期推定。
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
| 当前AZ | [任务书](../superpowers/plans/2026-10-09-authorization-property-abstraction-and-real-use.md)、[当前计划](skill-ir-aot-optimization-plan.md)、spec§14.39、研究§7.61 |
| AY | [任务书](../superpowers/plans/2026-10-07-authorization-question-dependencies-and-usable-dsl.md)、[最终收束](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/final-closure-v35.json)，研究§7.60保留v5/v35形成过程 |
| AX | [summary](../../results/skill-ir/skill-dsl-research/development/authorization-property-execution-v1/summary.json)、[离线包核验](../../results/skill-ir/skill-dsl-research/development/authorization-property-execution-v1/verification/portable-package.json)；原unknown与11个未运行位置不改 |
| AW/AV | [AW summary](../../results/skill-ir/skill-dsl-research/development/authorization-control-materials-v1/summary.json)、[AV status](../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/status.json)，第三方暂停保持 |
| AR–AU及更早 | [唯一研究正文](skill-dsl-research.md)、[历史](history.md)、[证据索引](evidence-index.md)、[实验目录](../../results/skill-ir/experiment-catalog.json) |

普通命令见 [使用说明](../usage.md)，代码与测试定位见 [开发指南](developer-guide.md)。本轮不新增长期阅读文档，研究仍统一在一个正文中。仅更新当前状态及索引，不把逐次派发和测试日志持续堆到本页。
