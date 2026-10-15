# Skill IR AOT 当前执行计划

更新于2026-10-16。唯一实时入口为[current-status](current-status.md)。

- 当前任务书：[BO0–BO17](../superpowers/plans/2026-10-16-authorization-call-semantics-and-program-repair.md)，completed-with-unmet-criteria。工程、八attempt交付及普通使用完成；固定A0字段/局部18/18、额外7/8，匿名激活未达；A1独立值7/18。两对总token比1.045/2.269，无净收益。S0三组局部反转成立，完整语义仍缺。完成有限队列后停止，不自动派发BP，不重开BN。
- 方法合同：[spec§14.54](skill-ir-aot-optimization-spec.md#1454-bo-source-call-semantics-and-program-repair)；复核与开发过程统一在[研究§7.76](skill-dsl-research.md#776-bn-复核与-bo-源码调用语义修稿决定)。BN结果保留在§7.75。
- identity：`authorization-call-semantics-v1`，已核对规划基线`21100431f6a427ffe46f7d07f822f231aafe567e`。继续`skill-ir-aot`，只推用户origin，不建分支/worktree；新开发线程独占代码、共享方法文档与Git写入。
- 开发`gpt-6-astra/high`，按用户指定；实验沿已授权官方账号`gpt-5.6-sol/high`。第三方暂停，OWUI/历史未知ShareLink仅离线，旧未知和保护证据保持。接管时tracked干净，原有未跟踪`.tmp/`不清理。

约8–12小时为参考实质任务窗口，不等待或重复验证凑时长。沿BK恢复合同区分旧unknown、本地宿主与研究处置；不重发原请求、不改终态/费用，核查隔离后可开展已授权独立用途。新额度/认证及重复通道故障按任务书暂停对应通道，仍推进独立工程。

## 本轮责任与处置

| 责任 | 已确认依据 | BO处置与剩余判断 |
|---|---|---|
| 调用保真 | A0模型补入when和正常完成guard，18/18加7/8 | 匿名外层激活仍缺；自然解释不能修程序 |
| 执行含义 | False/None/unknown匿名测试及实际工具链通过 | 复用既有guard/when，不扩executor；来源含义仍需审查 |
| 范围评价 | A1调用17/18加8/8、值7/18 | 上游条件保留，deleted过滤/非法转换错误另列 |
| 消费实现 | 增量包实际可重建；C0显式raw、C1取目录 | 新默认概览有工程证据，但未被两消费者实际采用 |
| 自动化与维护 | A0固定、A1独立、S0维护54步及三局部反转 | 三轨原件保留，完整语义未达 |
| 效果判断 | 两对质量/成本取舍，总token1.045/2.269倍 | 无净收益；不追加第三对或BP |

普通入口仍保留BL A0默认，[Download说明](../../examples/authorization-assessment/download-workflow/README.md#current-bo-explicit-program)提供BO显式命令和已知缺口。BO沿同入口交付自己的原稿与事件过程；缺稿记未运行，不以旧稿或开发者稿填位。五正常用途、两条件确认、最多两具名共享修复，遇已知缺陷先修再继续；完成有限队列后停止，不自动派发BP。

## 继承的真实结果

BL最终发布cb8a721a。A0/A1自动程序均15/18有限行为匹配；非法/跨根版本没有显式拒绝，缺外部事实时未保留constructor条件。两对原四问均full，消费更贵；C2无自然交付，原unavailable及后查interrupted均保留。程序确实执行与源码材料实际采用为0分别成立。[汇总](../../results/skill-ir/skill-dsl-research/development/authorization-reusable-program-v1/summary.json)和§7.73保持原证据；USD、开发和真人成本未知。

BM最终发布a1ea1f3c，八attempt/十二turn/七自然交付，A0原稿未改、A1新稿14/18，首对negative且无第二对；初始化、短路和完整自然质量未达。BN承接这些责任，旧原件与评分不回填。A0为修订既有自动稿，A1从零独立编写，二者不混合。BI/BJ及更早原件、held-out/prospective/Q1/readiness、历史0-of-6、旧未知与全src旧104失败保持。工程完成、实际自动主链、四问质量与净收益分别验收。
