# Skill IR AOT 当前执行计划

更新于2026-10-16。唯一实时入口为[current-status](current-status.md)。

- 当前任务书：[BO0–BO17](../superpowers/plans/2026-10-16-authorization-call-semantics-and-program-repair.md)，in-progress；BO0–BO8工程已实现，正在联合验证，研究模型调用尚未开始。用户已授权BN结束后接续一轮，开发线程从89ef2864接管。BN最终21100431已发布，八用途/14观察turn全部交付且0活动/未知；A0字段17/18、严格4/18，A1值14/18但上游条件超出旧局部oracle。两对C总token1.409/1.731倍，完整语义与净收益未达，不重开BN。
- 方法合同：[spec§14.54](skill-ir-aot-optimization-spec.md#1454-bo-source-call-semantics-and-program-repair)；复核与开发过程统一在[研究§7.76](skill-dsl-research.md#776-bn-复核与-bo-源码调用语义修稿决定)。BN结果保留在§7.75。
- identity：`authorization-call-semantics-v1`，已核对规划基线`21100431f6a427ffe46f7d07f822f231aafe567e`。继续`skill-ir-aot`，只推用户origin，不建分支/worktree；新开发线程独占代码、共享方法文档与Git写入。
- 开发`gpt-6-astra/high`，按用户指定；实验沿已授权官方账号`gpt-5.6-sol/high`。第三方暂停，OWUI/历史未知ShareLink仅离线，旧未知和保护证据保持。接管时tracked干净，原有未跟踪`.tmp/`不清理。

约8–12小时为参考实质任务窗口，不等待或重复验证凑时长。沿BK恢复合同区分旧unknown、本地宿主与研究处置；不重发原请求、不改终态/费用，核查隔离后可开展已授权独立用途。新额度/认证及重复通道故障按任务书暂停对应通道，仍推进独立工程。

## 本轮责任与处置

| 责任 | 实际缺口 | BO动作 |
|---|---|---|
| 调用保真 | when已支持，但作者仍先无条件查询再选择值 | 检查激活、正常完成、取值及后继依赖，具体事件反馈供自动修稿 |
| 执行含义 | constructor存在但没有实际控制依赖 | 匿名反例验证；先复用guard/when，必要完成字段须有反例且兼容 |
| 范围评价 | A1全局条件与局部oracle口径不同 | 先固定局部轨迹/上游前提分层，不删合法条件、不回填旧评分 |
| 消费实现 | token仍更高，已有增量并非未接通 | 从实际发送包定位details重复，复用引用，不再叠摘要机制 |
| 自动化与维护 | 自然正确说明不能修好程序 | A0修稿、A1独立、固定A0消费与S0维护原件分轨 |
| 效果判断 | BN两对存在质量与成本取舍 | BO首对后有据决定确认，最多两对，不采样到正向 |

普通入口当前仍保留BL A0默认，[Download说明](../../examples/authorization-assessment/download-workflow/README.md#current-bn-explicit-program)提供BN显式命令。BO沿同入口交付自己的原稿与事件过程；缺稿记未运行，不以旧稿或开发者稿填位。五正常用途、两条件确认、最多两具名共享修复，遇已知缺陷先修再继续；完成有限队列后停止，不自动派发BP。

## 继承的真实结果

BL最终发布cb8a721a。A0/A1自动程序均15/18有限行为匹配；非法/跨根版本没有显式拒绝，缺外部事实时未保留constructor条件。两对原四问均full，消费更贵；C2无自然交付，原unavailable及后查interrupted均保留。程序确实执行与源码材料实际采用为0分别成立。[汇总](../../results/skill-ir/skill-dsl-research/development/authorization-reusable-program-v1/summary.json)和§7.73保持原证据；USD、开发和真人成本未知。

BM最终发布a1ea1f3c，八attempt/十二turn/七自然交付，A0原稿未改、A1新稿14/18，首对negative且无第二对；初始化、短路和完整自然质量未达。BN承接这些责任，旧原件与评分不回填。A0为修订既有自动稿，A1从零独立编写，二者不混合。BI/BJ及更早原件、held-out/prospective/Q1/readiness、历史0-of-6、旧未知与全src旧104失败保持。工程完成、实际自动主链、四问质量与净收益分别验收。
