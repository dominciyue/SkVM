# Skill IR AOT 当前执行计划

更新于2026-10-21。唯一实时入口为[current-status](current-status.md)。

- 当前任务书：[BT0–BT21](../superpowers/plans/2026-10-21-authorization-semantic-validation-and-method-diagnosis.md)，用户已授权，计划已登记待开发接管；当前尚无BT生产实现或模型调用。
- 方法合同：[spec §14.59](skill-ir-aot-optimization-spec.md#1459-bt-semantic-validation-and-method-diagnosis)；复核与开发过程统一在[研究 §7.81](skill-dsl-research.md#781-bs-复核与-bt-源码语义核验及方法诊断)。BS及更早历史结论保持。
- identity：`authorization-semantic-validation-v1`，规划基线`03484a23438d30f198bfc6bec349ed362e54a66f`，实际从含计划的最新提交接管。继续`skill-ir-aot`，只推用户origin，不建分支/worktree；父线程交付计划后，新开发线程独占代码、共享方法文档与Git写入。
- 开发`gpt-6-astra/high`，按用户指定；实验沿已授权官方账号`gpt-5.6-sol/high`。第三方暂停；旧未知与保护证据保持。接管时tracked干净，原有未跟踪`.tmp/`不清理。

BT正常用途10个：M/G两份BS末稿的自动修订，以及两个原任务各N（源码基础）、RR（参考材料rules）、RE（同参考材料执行）、AE（自动稿执行）四消费者；最多4个具名确认。先固定源码依据与量规，再看自动稿能力。参考制作独立留账，不交给自动作者，不称自动成功。原题和计划失败分母保留；无效或已知核心错误稿的AE零调用记失败，其余方法诊断继续。即时修复共享错误，未知请求只读恢复，有限队列结束不自动BU。

## 本轮责任与处置

| 责任 | 已确认依据 | 当前处置/未达责任 |
|---|---|---|
| 作者恢复 | BS A-G provider已完成后宿主崩溃，正常续作缺失 | 普通入口恢复持久raw与累计预算；旧失败保持 |
| 源码语义 | M有限值匹配但三个顺序错误；G缺创建链 | 固定上游函数测试/独立源码评阅，区分字段、顺序与效果 |
| 领域关系 | 候选和引用已有，仍误排父路由 | 复用入口/效果与先后/失败关系，缺可达或对象依据保留unknown |
| 自动与参考 | 坏稿消费混合了生成问题与方法问题 | 自动A与参考R分轨，RR/RE隔离执行增量，AE/RE诊断生成差距 |
| 评价 | BS N/R/E为14/14/15域full，整题均无完整 | 10用途/4确认；核心关系、严重错误、原题完整性与成本分别报告 |
| 交付 | 既有CLI、checkpoint、trial可复用 | 同核普通恢复和两示例，不重建平台；源码变化继续撤回 |

普通入口保留现有默认，[Download说明](../../examples/authorization-assessment/download-workflow/README.md#current-bq-explicit-program)、[Memos说明](../../examples/authorization-assessment/shared-link-workflow/README.md)与[Gitea说明](../../examples/authorization-assessment/issue-create-workflow/README.md)保留现有真实能力和限制；BT实现后同步新恢复与使用命令。源码测试若需完整上游checkout，限定已暴露同commit和隔离依赖，不启动目标服务；无法执行的部分明确按源码评阅报告。新结果集中BT identity，历史原件不回填。

## 继承的真实结果

BS最终03484a23，14用途/15attempt/18turn全部本地关闭，900原件归档核验。M最后30步29案有限值/条件匹配、3案顺序错误；G最后7步permission形状错误且缺创建链。十二自然回答整题0/12，N/R/E各24域为14/14/15 full；执行实际采用，局部补充和退步并存。嵌套owner共享故障已修，作者首末原件及两个turn未知用量保持；127定向测试/984断言及类型、文档检查通过。详见研究§7.80，BT不回填该历史结果。

BR最终2100085b，9用途/10attempt/17turn全部交付关闭。最后25步Memos原稿20已知结果/标量匹配、2缺输入保留条件；普通变化、搬移和源失效通过，源码顺序/转换不完整。Download2/2整题full，Memos27/36维、0/6整题。E/R原输入持平、变化少一完整维度，token比1.196/0.748。input15,642,633（cache13,998,592已含一次）/output110,124，USD和真人成本unknown；原件与历史结果保持。

BQ最终3c3059a8。两臂自动55步稿首终35/35，T-E11主动案例含最终7例，U-E固定消费得到11/original；原四问6/12、整题0/3full，源码决策9/12full。三用途8观察turn全部关闭、无活动/unknown；完整自然质量和稳定执行增量未达。父复核零模型computed且无事件缺口，外层conditional保留作者coverage，不能混作无返回或完整认证。

BP最终发布27d59677。45首位置及3具名确认收束，主面板34/36交付、0/36整题full；R0/R1/R2逐题full分别4/1/5/0、11/9/12/0、11/10/11/0。固定A0及空稿A1最终局部结果18/18、7/8、6/7，外层None激活和缺version键仍缺。规则组织与实际执行增量分开；83受影响测试/581断言、主/BP类型及15文档测试通过。原件、量规、全部失败和费用保持。

BO最终发布af8321c3。固定45步A0字段/局部18/18、额外7/8；A1独立23步值7/18，两个程序不拼接。两对四问full从基线2/8到辅助4/8，3改善/1退步/4持平，整题均未完整；修订进步、配对质量和成本分列。原八attempt/15观察turn全交付关闭，180测试/1285断言及类型/文档通过。本轮父复核另做五场景零调用重放，确认匿名反例仍在。

BL最终发布cb8a721a。A0/A1自动程序均15/18有限行为匹配；非法/跨根版本没有显式拒绝，缺外部事实时未保留constructor条件。两对原四问均full，消费更贵；C2无自然交付，原unavailable及后查interrupted均保留。程序确实执行与源码材料实际采用为0分别成立。[汇总](../../results/skill-ir/skill-dsl-research/development/authorization-reusable-program-v1/summary.json)和§7.73保持原证据；USD、开发和真人成本未知。

BM最终发布a1ea1f3c，八attempt/十二turn/七自然交付，A0原稿未改、A1新稿14/18，首对negative且无第二对；初始化、短路和完整自然质量未达。BN承接这些责任，旧原件与评分不回填。A0为修订既有自动稿，A1从零独立编写，二者不混合。BI/BJ及更早原件、held-out/prospective/Q1/readiness、历史0-of-6、旧未知与全src旧104失败保持。工程完成、实际自动主链、四问质量与净收益分别验收。
