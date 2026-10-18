# Skill IR AOT 当前执行计划

更新于2026-10-18。唯一实时入口为[current-status](current-status.md)。

- 当前任务书：[BQ0–BQ17](../superpowers/plans/2026-10-18-authorization-source-program-consistency-and-task-execution.md)，状态 BQ0–BQ16已执行、BQ17发布收尾。共享修复和两个实际raw缺陷已解决，T-R/T-E首终稿35/35；T-E主动11案例，U-E固定消费交付，搬移失效通过。完整自然质量与稳定执行增量未达，发布后停止，不追加模型。
- 方法合同：[spec §14.56](skill-ir-aot-optimization-spec.md#1456-bq-source-program-consistency-and-real-task-use)；复核与开发过程统一在[研究 §7.78](skill-dsl-research.md#778-bp-复核与-bq-先修复后实际使用)。BP结果与合同保留在§7.77/§14.55。
- identity：`authorization-source-program-consistency-v1`，规划基线`27d59677f8a3257d1a4e0ee687519ad518306aba`。继续`skill-ir-aot`，只推用户origin，不建分支/worktree；新开发线程独占代码、共享方法文档与Git写入。
- 开发`gpt-6-astra/high`，按用户指定；实验沿已授权官方账号`gpt-5.6-sol/high`。第三方暂停；旧未知与保护证据保持。接管时tracked干净，原有未跟踪`.tmp/`不清理。

连续执行有限队列，不等待或重复验证凑时长。沿BK恢复合同区分旧unknown、本地宿主与研究处置；不重发原请求、不改终态/费用，核查隔离后可开展已授权独立用途。新额度/认证及重复通道故障按任务书暂停对应通道，仍推进独立工程。质量目标与成本分别判断，不因token未下降抹去有据的局部质量改善。

## 本轮责任与处置

| 责任 | 已确认依据 | BQ执行责任 |
|---|---|---|
| 调用保真 | BP漏caller外层条件，仅核对作者声明会漏掉未声明的关系 | 基于已读源码/真实调用边提供结构线索，普通入口两臂共用 |
| 输入语义 | when/field.default已存在；原稿直接读version导致缺键异常 | 区分已知缺键、null、空串、未知；模型依源码修raw，宿主不猜默认值 |
| 修稿闭环 | 自然说明可能正确但raw未改，旧trial与当前稿必须区分 | 当前revision、patch与多输入试跑可追溯，无程序改变不记已修 |
| 实际任务 | BP主面板R2无主动trial，规则准备已有局部帮助 | 一项真实项目产物排障，T-R/T-E同条件，再U-E普通消费 |
| 评价 | BP整题0/36，部分答案仅缺执行抽象细节 | 原评分保留；源码决策、关键遗漏、抽象说明及程序事件分轴 |
| 交付 | BP最终27d59677与origin一致 | 3正常用途+至多3具名确认；失败当场修，定向验证后发布 |

普通入口保留BL A0默认，[Download说明](../../examples/authorization-assessment/download-workflow/README.md#current-bq-explicit-program)提供固定BQ55步稿显式命令。BQ已复用同入口完成零模型重放和普通消费；原稿由模型修订，没有开发者语义修改或较好对照稿替换。两臂修改后需要重配对时从相同起点重做并计入具名确认，首件保留。完成有限队列后停止，不自动派发BR。

## 继承的真实结果

BP最终发布27d59677。45首位置及3具名确认收束，主面板34/36交付、0/36整题full；R0/R1/R2逐题full分别4/1/5/0、11/9/12/0、11/10/11/0。固定A0及空稿A1最终局部结果18/18、7/8、6/7，外层None激活和缺version键仍缺。规则组织与实际执行增量分开；83受影响测试/581断言、主/BP类型及15文档测试通过。原件、量规、全部失败和费用保持。

BO最终发布af8321c3。固定45步A0字段/局部18/18、额外7/8；A1独立23步值7/18，两个程序不拼接。两对四问full从基线2/8到辅助4/8，3改善/1退步/4持平，整题均未完整；修订进步、配对质量和成本分列。原八attempt/15观察turn全交付关闭，180测试/1285断言及类型/文档通过。本轮父复核另做五场景零调用重放，确认匿名反例仍在。

BL最终发布cb8a721a。A0/A1自动程序均15/18有限行为匹配；非法/跨根版本没有显式拒绝，缺外部事实时未保留constructor条件。两对原四问均full，消费更贵；C2无自然交付，原unavailable及后查interrupted均保留。程序确实执行与源码材料实际采用为0分别成立。[汇总](../../results/skill-ir/skill-dsl-research/development/authorization-reusable-program-v1/summary.json)和§7.73保持原证据；USD、开发和真人成本未知。

BM最终发布a1ea1f3c，八attempt/十二turn/七自然交付，A0原稿未改、A1新稿14/18，首对negative且无第二对；初始化、短路和完整自然质量未达。BN承接这些责任，旧原件与评分不回填。A0为修订既有自动稿，A1从零独立编写，二者不混合。BI/BJ及更早原件、held-out/prospective/Q1/readiness、历史0-of-6、旧未知与全src旧104失败保持。工程完成、实际自动主链、四问质量与净收益分别验收。
