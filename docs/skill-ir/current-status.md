# Skill IR 当前状态

更新于2026-10-09。工作分支为 `skill-ir-aot`，仅发布到用户 `origin`。本页是唯一实时状态入口；历史任务书与结果保留当时记录。

## 当前工作

**用户已授权 [AZ0–AZ18：授权性质抽象、真实检查与变化复用](../superpowers/plans/2026-10-09-authorization-property-abstraction-and-real-use.md)，状态 `authorized-not-started`。** 复核基线为 `10bc06f0`；本轮先完成任务书与方法合同，再派发 `gpt-6.1-sol / max` 新开发线程。尚无 AZ 生产实现或效果结果。

本轮重点是让原问题真正决定证据需求，扩展现有局部摘要的适用范围，补齐材料未采用诊断和有限格式恢复，并在 Download、OWUI 的完整原 skill 中验证实际检查。先做一个性质的开发里程碑，再回到全部原问题及跨结构使用。新策略计划显式启用为 `operation-evidence-v6`，复用既有 inquiry/native、结构索引、材料和 CLI，不继续无关键路径依据的通用语言语义扩张。

方法合同见 [spec §14.39](skill-ir-aot-optimization-spec.md#1439-az-property-abstraction-and-real-use)，复核和取舍见 [研究 §7.61](skill-dsl-research.md#761-az-性质抽象材料采用与真实检查的开发决定)。新结果位置为 `results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/`，由新开发线程登记；现阶段不提供尚不存在的机器报告链接。

## AY 已结束的真实结果

- [AY0–AY23](../superpowers/plans/2026-10-07-authorization-question-dependencies-and-usable-dsl.md) 已以 `completed-with-unmet-criteria` 收束。14 次归档尝试：10 delivered、2 unavailable、2 failed；12 个质量位置未运行。完整可用、比较收益及研究目标尚未达成。
- 最新生产语义为 `source-bindings/v35`。Download v35 接受3个源码单元、30个控制步骤、2次材料采用，仍有未解释callee和装饰器依赖；OWUI v35为0接受单元、0控制步骤、0材料采用，存在角色缺失及结论冲突。两次native自然终答均被独立评为partial。
- 两作者包已按原字节实际消费。Download消费者源码评阅full但机器partial；OWUI消费者仍有决定性helper未读。变化中policy-fresh、premise-fresh/previous已有运行；policy-previous路由失败、source-fresh额度拒绝，source-previous及质量位置保留未运行。
- 原件、计量及验收以 [最终收束](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/final-closure-v35.json)、[manifest](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/manifest.json)、[状态](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/status.json) 为准。历史 `acceptance` 字段表达要求，不代表实际通过。

2026-10-09只读复核确认：问题相关依赖目前仍要求全体可达调用；材料投影有原因丢失；格式拒绝消耗检查槽。`inquiry-result` 已具备整体Schema/缺题拒绝和局部有效结果保留，定向8 tests/40 assertions通过，应保持而非重复修复。详细依据统一在研究§7.61。

## 账号、运行和继承边界

- 开发 `gpt-6.1-sol/max`；实验沿用用户已授权的当前官方账号 `gpt-5.6-sol/high`，无需再次确认。第三方API和AV旧位置继续暂停。
- AY最后记录额度拒绝，提示恢复时间2026-10-14 16:47；这是历史记录，不代表当前已恢复。新线程按AZ任务书检查可用证据，明确不可用时不发试探推理、不等待或轮询凑时长，继续所有独立工程工作。
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
