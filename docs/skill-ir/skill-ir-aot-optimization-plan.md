# Skill IR AOT 当前执行计划

更新于2026-10-16。唯一实时入口为[current-status](current-status.md)。

- 当前任务书：[BP0–BP21](../superpowers/plans/2026-10-16-authorization-quality-evidence-and-branch-reliability.md)，planned-not-started。用户已授权新线程实际开发，优先补外层激活、独立编写可靠性与 rules/execute 对照，以对象关系、分支、变化一致性和条件忠实性为主要质量轴。
- 方法合同：[spec §14.55](skill-ir-aot-optimization-spec.md#1455-bp-capability-quality-and-executable-support)；复核与开发过程统一在[研究 §7.77](skill-dsl-research.md#777-bo-质量复核与-bp-能力实验决定)。BO结果与合同保留在§7.76/§14.54。
- identity：`authorization-quality-evidence-v1`，规划基线`af8321c313bcd3216620c1436802bacd8420fca8`。继续`skill-ir-aot`，只推用户origin，不建分支/worktree；新开发线程独占代码、共享方法文档与Git写入。
- 开发`gpt-6-astra/high`，按用户指定；实验沿已授权官方账号`gpt-5.6-sol/high`。第三方暂停；旧未知与保护证据保持。接管时tracked干净，原有未跟踪`.tmp/`不清理。

连续执行有限队列，不等待或重复验证凑时长。沿BK恢复合同区分旧unknown、本地宿主与研究处置；不重发原请求、不改终态/费用，核查隔离后可开展已授权独立用途。新额度/认证及重复通道故障按任务书暂停对应通道，仍推进独立工程。质量目标与成本分别判断，不因token未下降抹去有据的局部质量改善。

## 本轮责任与处置

| 责任 | 已确认依据 | BP执行责任 |
|---|---|---|
| 调用保真 | BO A0 18/18加7/8，匿名外层激活仍缺 | BP2–4补共享依赖反馈和实际工具广告，不代填条件 |
| 作者可靠性 | BO A1局部调用较好但值7/18 | A0修稿，A1/A2空稿分轨，不选最好稿代替固定A0 |
| 消费机制 | 当前context均含执行信息，缺rules-only对照 | BP5–7纯规则文档及无结果泄漏支持，默认兼容 |
| 局部质量 | BO两对3改善/1退步/4持平，Q3两组改善 | 六情形×三臂×两重复；逐能力/逐题/整题共同报告 |
| 变化与采用 | BO副本三局部反转成立 | 两维护用途同材料比较；已暴露ShareLink辅助组 |
| 实证与交付 | BO工程、实际程序和自然答分别有记录 | 保留原件、错误和未知；局部质量可单独成立，成本另轴 |

普通入口保留BL A0默认，[Download说明](../../examples/authorization-assessment/download-workflow/README.md#current-bo-explicit-program)提供BO显式命令。BP沿同入口增加当前稿与支持选择；缺稿记未运行，不用旧稿或开发者稿填位。最多45首位置及6具名修复确认，源码/评分/首答与修订分轨。完成有限队列后停止，不自动派发BQ。

## 继承的真实结果

BO最终发布af8321c3。固定45步A0字段/局部18/18、额外7/8；A1独立23步值7/18，两个程序不拼接。两对四问full从基线2/8到辅助4/8，3改善/1退步/4持平，整题均未完整；修订进步、配对质量和成本分列。原八attempt/15观察turn全交付关闭，180测试/1285断言及类型/文档通过。本轮父复核另做五场景零调用重放，确认匿名反例仍在。

BL最终发布cb8a721a。A0/A1自动程序均15/18有限行为匹配；非法/跨根版本没有显式拒绝，缺外部事实时未保留constructor条件。两对原四问均full，消费更贵；C2无自然交付，原unavailable及后查interrupted均保留。程序确实执行与源码材料实际采用为0分别成立。[汇总](../../results/skill-ir/skill-dsl-research/development/authorization-reusable-program-v1/summary.json)和§7.73保持原证据；USD、开发和真人成本未知。

BM最终发布a1ea1f3c，八attempt/十二turn/七自然交付，A0原稿未改、A1新稿14/18，首对negative且无第二对；初始化、短路和完整自然质量未达。BN承接这些责任，旧原件与评分不回填。A0为修订既有自动稿，A1从零独立编写，二者不混合。BI/BJ及更早原件、held-out/prospective/Q1/readiness、历史0-of-6、旧未知与全src旧104失败保持。工程完成、实际自动主链、四问质量与净收益分别验收。
