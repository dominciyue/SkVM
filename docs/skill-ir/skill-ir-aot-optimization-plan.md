# Skill IR AOT 当前执行计划

更新于2026-10-21。唯一实时入口为[current-status](current-status.md)。

- 当前任务书：[BU0–BU19](../superpowers/plans/2026-10-21-authorization-source-differential-verification.md)，已获用户授权，待新开发线程接管。
- 方法合同：[spec §14.60](skill-ir-aot-optimization-spec.md#1460-bu-source-differential-verification)；复盘统一在[研究 §7.82](skill-dsl-research.md#782-bt-复核与-bu-源码差分核验)，同时维护该文§1与§11。
- identity：`authorization-source-differential-v1`，基线BT最终`491812b4ade0751ad6dc8989d12677e5d0d4a870`。实际接管含计划的新提交，继续skill-ir-aot，仅用户origin，不建分支/worktree。
- 开发gpt-6-astra/high，实验已授权官方gpt-5.6-sol/high；第三方暂停，旧unknown不重发，历史原件和.tmp保留。
- 本机STS插件0.2.5已安装启用，四Hook已信任，真实只读命令有armed检查记录。新开发线程用明确change指令及Skill约束工作范围，不以插件代替代码正确性验证。

## 本轮责任

| 责任 | 当前缺口 | 交付 |
|---|---|---|
| 独立核验要求 | 作者漏声明关系便没有检查项 | 原题/政策确定要求，缺映射具名unknown |
| 源码行为依据 | M fake忽略查询参数，G未读callee正文 | 参数敏感原函数观察；G具名执行或源码评阅边界 |
| 共享比较 | 目前只核对程序自洽 | 同输入的对象、事件、首错和返回差分 |
| 普通修稿 | 真实反例未接进正常作者反馈 | check/run/trial/details共用比较器，模型正常patch复验 |
| 方法判断 | 多轮消费者面板无稳定优势 | 真实错误、正确控制、变异及LLM复核/修稿诊断 |
| 文档 | 当前入口堆积历史，旧plan曾停留待开发 | BU末期压缩当前状态、复用history与现有研究正文 |

顺序：BU0–BU10定义责任、源码观察和共享实现；BU11–BU16十个正常模型用途及至多两次有据确认；BU17–BU19验证、文档与发布。代码错误当场定向修复，不继续跑同一坏实现；同因两次无改善时暂停该责任，继续独立工作。有限队列结束不自动BV。

首要真实结构为Memos既有原access函数。保留共享比较接口和两个匿名测试结构；G若缺可执行边界，按源码评阅报告，不为第二结构扩建完整框架。原题质量、源码忠实性、政策满足、自动修稿和成本分别验收。普通入口和默认保持兼容，新检查显式使用。

## 继承的证据

BT最终491812b4已发布，十用途关闭；M修稿修复局部顺序，Gconverter错误仍在。八消费位置29/48域full、整题0/8；参考执行对规则没有稳定优势。具体数字、原件和132项定向验证见[BT执行记录](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/execution.md)与[验收](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/verification/acceptance-matrix.json)。

BS及更早结果保持，统一查[研究正文](skill-dsl-research.md)、[历史](history.md)及current-status历史表；本页不再重复各轮摘要。BU尚未产生实现或效果结果。
