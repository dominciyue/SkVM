# Skill IR AOT 当前执行计划

更新于2026-10-07。本页维护当前目标与未达责任；原件由研究正文和实验目录导航。

- 唯一实时入口：[current-status](current-status.md)。
- 当前任务书：[AX0–AX20 按授权问题求值与账号真实执行](../superpowers/plans/2026-10-07-authorization-property-analysis-and-account-execution.md)，in-progress。
- 方法合同：[spec AX](skill-ir-aot-optimization-spec.md#1437-ax-property-directed-analysis-and-controlled-account-execution)；决定依据：[研究§7.57–§7.58](skill-dsl-research.md#757-aw-收束后复核运行能力与按问题求值)。
- 复核基线ccf00985，启动时保留随后计划提交。开发模型gpt-6.1-sol/max；被测模型为已授权当前账号的gpt-5.6-sol/high。第三方API和AV十二旧位置继续暂停。

## 当前目标

在现有两个入口和领域核心中，按每个授权问题组织必要依赖、局部摘要和保守异常状态合并，减少整函数标注及路径展开负担。官方账号生产transport采用安装版本可兑现的受控能力合同，完成真实工具会话，再做完整原skill任务、变化复用和同条件对照。新行为显式选择operation-evidence-v4，旧默认和归档保持。

AX0–AX2已完成实际账号配置核验和一次匿名工具消费；首件失败与唯一Code Mode宿主修订分别保留。AX3/AX6的七个语义红测已绿，局部连续context合流保留正常/未知失败及全部来源，不跨对象/效果/控制边界。当前继续AX4–AX9需求frontier、覆盖和v4入口接线。账号与局部算法尚不能证明完整授权任务质量。

## AX 队列

| 阶段 | 责任 | 验收对象 |
|---|---|---|
| AX0–AX2 | 接管、实际账号配置、生产driver和真实smoke | 模型实际请求/消费宿主工具，输入与评价隔离 |
| AX3–AX6 | 红测、按问题依赖、增量解释、异常合流 | 16/64 context反例通过，相关未知/效果次序仍保留 |
| AX7–AX9 | helper摘要、失效、调度、inquiry/native接入 | 同核心和参数身份，旧默认兼容 |
| AX10–AX11 | Download和OWUI完整任务真实调试 | 原skill自然终答、当前领域检查、独立源码质量 |
| AX12–AX14 | 三变化、作者/原字节消费者、三臂对照 | fresh/previous与N/M-S/D-S按同版本评价 |
| AX15–AX18 | 机制、计量、语义复核、必要回归 | 首件/修订及工程/效果分开；原件可重算 |
| AX19–AX20 | 普通使用、研究复盘、发布与收束 | 六项结果状态、复制命令、具体剩余责任 |

20个逻辑首位置已定义，具名修订另列。质量/编写复用约60/40是精力安排，不是质量容错比例。约8–12小时是工作量规划，实际按完成情况执行；不等待、不重复验证凑时长。

## 立即修复与继续规则

1. 发现共享schema、连接、合流或运行缺陷，立即保留首件、写红测、修生产代码、同例复验；受影响后续派发暂停，独立工程继续。
2. 同因两轮无进展时调整接口或任务拆分，不原样重抽。原题和完整skill职责保留。
3. 机械排除和模型未核实的相关性分开；unknown副作用、资源替换和异常前后effect不能被裁掉。
4. 账号配置保护具体风险：evaluator/旧答案不进入模型，目标不执行，额外能力禁用或有界同条件计量；不追求公开协议不存在的证明，也不以提示词代替边界。
5. 账号无权限/额度时停止该通道并继续独立开发，不切付费API。内部请求或USD不可见保持unknown。
6. partial原材料可做材料级变化诊断；完整任务收益只在相应原/变质量满足后评价。
7. 六项状态分别是工程、账号运行、native交付、作者消费、质量比较、复用；有限队列结束不自动达成研究目标。

## 继承状态

[AW](../superpowers/plans/2026-10-07-authorization-control-materials-and-account-runtime.md)已以completed-with-unmet-criteria收束，937pass/1skip，双类型通过；24个逻辑真实位置未派发。同v3元数据重放字节下降7.7%/18.3%，实际token/质量收益未测。原件见[AW summary](../../results/skill-ir/skill-dsl-research/development/authorization-control-materials-v1/summary.json)。

[AV](../superpowers/plans/2026-10-06-authorization-source-assisted-closure.md)保持in-progress-paid-deferred-by-user，十二旧位置不补跑。AU/AT/AS/AR原件、失败、未知费用和封存保留；新账号研究不改旧结果，也不按新身份解除保护任务。readiness、held-out、Q1和历史0/6保持。

## 写入与发布

继续skill-ir-aot，只推用户origin，不创建分支/worktree。AX开发线程接管后为唯一代码和共享方法文档写者。研究问题及修复统一更新[研究正文](skill-dsl-research.md)；结果在本轮identity中，临时运行在project-maintenance。本轮不新增长期阅读文档、不清空历史材料、不重复全量审计。
