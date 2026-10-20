# Skill IR AOT 当前执行计划

更新于2026-10-20。唯一实时入口为[current-status](current-status.md)。

- 当前任务书：[BS0–BS22](../superpowers/plans/2026-10-20-authorization-task-coverage-and-semantic-transfer.md)，用户已授权，in-progress；已完成BS0–BS8共享工程与首次调用前登记，尚未派发账号实验。原题覆盖、源码执行顺序与自然回答接线共同推进，避免继续只修Download。
- 方法合同：[spec §14.58](skill-ir-aot-optimization-spec.md#1458-bs-task-coverage-and-semantic-transfer)；复核与开发过程统一在[研究 §7.80](skill-dsl-research.md#780-br-复核与-bs-原题覆盖和跨结构语义使用)。BR/BQ/BP历史结论保持。
- identity：`authorization-task-coverage-v1`，规划基线`2100085ba37e1f01ef9fc7002905feeeb78e7042`。继续`skill-ir-aot`，只推用户origin，不建分支/worktree；父线程交付计划后，新开发线程独占代码、共享方法文档与Git写入。
- 开发`gpt-6-astra/high`，按用户指定；实验沿已授权官方账号`gpt-5.6-sol/high`。第三方暂停；旧未知与保护证据保持。接管时tracked干净，原有未跟踪`.tmp/`不清理。

BS正常用途14个：Memos修稿与Gitea空稿两个作者，两个任务各原/变输入N/R/E共十二消费者；最多4个具名确认。先源码定题/oracle，后看程序能力；真实skill、代码、研究任务/政策、合成输入分列。共享错误及时红绿修复，不跑满已知坏版本；未知请求只读恢复。完整自然质量和执行增量分别评价，有限队列结束不自动BT。

## 本轮责任与处置

| 责任 | 已确认依据 | 当前处置/未达责任 |
|---|---|---|
| 回答覆盖 | BR原题及结果已发送，Memos仍漏匿名入口/转换错误 | 复用原题调查投影，核对实际读取/采用；不新增答案填空协议 |
| 源码语义 | Memos值相同但调用及错误顺序不同 | 同时失败/先后effect反例，修共享反馈，再由模型修程序 |
| 迁移 | 读取任务已有有限采用 | 已暴露Gitea CreateIssue空稿检验写入、后续错误及政策比较，不执行服务 |
| 自动与复用 | 固定最后原稿，原/变输入和搬移 | 作者原字节保存，不按最高分选稿，不替换开发者业务程序 |
| 评价 | N/R/E同信息，完整原问题保留 | 14正常用途/4确认上限；值、顺序、答案、实际采用与成本分轴 |
| 交付 | 现有CLI和报告已有接口 | 改可读投影及同核普通入口；完整JSON保留，不新增展示系统 |

普通入口保留现有默认，[Download说明](../../examples/authorization-assessment/download-workflow/README.md#current-bq-explicit-program)与[Memos说明](../../examples/authorization-assessment/shared-link-workflow/README.md)继续可用。BS不得将研究runner成功代替普通入口，更新说明应注明原稿版本和真实范围。新结果集中BS identity，历史原件不回填。

## 继承的真实结果

BR最终2100085b，9用途/10attempt/17turn全部交付关闭。最后25步Memos原稿20已知结果/标量匹配、2缺输入保留条件；普通变化、搬移和源失效通过，源码顺序/转换不完整。Download2/2整题full，Memos27/36维、0/6整题。E/R原输入持平、变化少一完整维度，token比1.196/0.748。input15,642,633（cache13,998,592已含一次）/output110,124，USD和真人成本unknown；原件与历史结果保持。

BQ最终3c3059a8。两臂自动55步稿首终35/35，T-E11主动案例含最终7例，U-E固定消费得到11/original；原四问6/12、整题0/3full，源码决策9/12full。三用途8观察turn全部关闭、无活动/unknown；完整自然质量和稳定执行增量未达。父复核零模型computed且无事件缺口，外层conditional保留作者coverage，不能混作无返回或完整认证。

BP最终发布27d59677。45首位置及3具名确认收束，主面板34/36交付、0/36整题full；R0/R1/R2逐题full分别4/1/5/0、11/9/12/0、11/10/11/0。固定A0及空稿A1最终局部结果18/18、7/8、6/7，外层None激活和缺version键仍缺。规则组织与实际执行增量分开；83受影响测试/581断言、主/BP类型及15文档测试通过。原件、量规、全部失败和费用保持。

BO最终发布af8321c3。固定45步A0字段/局部18/18、额外7/8；A1独立23步值7/18，两个程序不拼接。两对四问full从基线2/8到辅助4/8，3改善/1退步/4持平，整题均未完整；修订进步、配对质量和成本分列。原八attempt/15观察turn全交付关闭，180测试/1285断言及类型/文档通过。本轮父复核另做五场景零调用重放，确认匿名反例仍在。

BL最终发布cb8a721a。A0/A1自动程序均15/18有限行为匹配；非法/跨根版本没有显式拒绝，缺外部事实时未保留constructor条件。两对原四问均full，消费更贵；C2无自然交付，原unavailable及后查interrupted均保留。程序确实执行与源码材料实际采用为0分别成立。[汇总](../../results/skill-ir/skill-dsl-research/development/authorization-reusable-program-v1/summary.json)和§7.73保持原证据；USD、开发和真人成本未知。

BM最终发布a1ea1f3c，八attempt/十二turn/七自然交付，A0原稿未改、A1新稿14/18，首对negative且无第二对；初始化、短路和完整自然质量未达。BN承接这些责任，旧原件与评分不回填。A0为修订既有自动稿，A1从零独立编写，二者不混合。BI/BJ及更早原件、held-out/prospective/Q1/readiness、历史0-of-6、旧未知与全src旧104失败保持。工程完成、实际自动主链、四问质量与净收益分别验收。
