# Skill IR 当前状态

更新于2026-10-14（Asia/Shanghai）。工作分支为 `skill-ir-aot`，仅发布到用户 `origin`。本页是唯一实时状态入口；历史任务书与结果保留当时记录。

## 当前工作

**BM0–BM20以completed-with-unmet-criteria收束有限队列：工程与实际交付成立，完整自动程序和净收益未达。** 8次真实attempt（含2个具名修复）、B1/C1依首对negative规则未运行，12观察turn、7自然交付、0活动/未知。A0修复后仍原14步、15/18；A1独立确认12步、14/18，不替换A0。首对C0/B0均P/P/F/P，C输入3.82倍、输出更高；耗时更高但C0有离线检查并行负载，不能作隔离性能因果结论。C2自然完成拒绝交付；S0维护17步，副本三场景及两个新增拒绝检查通过，初始化/短路仍缺。[执行记录](../../results/skill-ir/skill-dsl-research/development/authorization-branch-verified-consumption-v1/execution.md)、[任务书](../superpowers/plans/2026-10-14-authorization-branch-completion-and-directed-consumption.md)、[普通示例](../../examples/authorization-assessment/download-workflow/README.md)。184生产定向测试/1229断言、4研究测试/29断言、主/研究类型及15文档测试通过；旧全src104失败不称修复。known input17189793（含cache15432192）/output97517，USD/开发探子/真人成本未知。生产至2c618b0f，实质成果a84993eb已推用户origin并核对同SHA，见[发布回执](../../results/skill-ir/skill-dsl-research/development/authorization-branch-verified-consumption-v1/publication.json)。

## BL 已结束的实际结果

**BL以completed-with-unmet-criteria收束适用工程与八用途：自动编写和当前依据交付成立，完整可复用范围与净收益未达。** A0/A1首稿均0/18、最终均15/18；默认11/archive、空版本12/original、明确false拒绝。非法/跨根版本拒绝及constructor条件仍遗漏。两对C/B四问均full，C输入分别为B的4.63/5.23倍，输出和耗时也更高；两对negative。C2预算耗尽无自然答，只读确认interrupted，原unavailable/部分费用保留。S0一次模型维护及四case trial后，三个保留输入的源码变化重放符合反转条件；不替换固定稿。见[执行过程](../../results/skill-ir/skill-dsl-research/development/authorization-reusable-program-v1/execution.md)、[summary](../../results/skill-ir/skill-dsl-research/development/authorization-reusable-program-v1/summary.json)、[任务书](../superpowers/plans/2026-10-14-authorization-reusable-program-semantics-and-delivery.md)、[spec§14.51](skill-ir-aot-optimization-spec.md#1451-bl-reusable-program-semantics-and-delivery)及[研究§7.73](skill-dsl-research.md#773-bk-复核与-bl-可复用程序开发决定)。

BL共享实现至34ae933e，169定向测试/1136断言、主/研究类型、3研究测试/58断言及15文档测试通过；八归档本地关闭，14观察turn、7用途自然交付。已知input21,097,032（含cache19,419,008）、output106,101，C2最终usage及全部实际USD/开发探子/真人成本unknown。无损响应引用反事实少333568字节，不称因果token收益。full默认，普通示例使用固定14步A0；实质成果fe9abe21已推用户origin并核对同SHA，见[发布回执](../../results/skill-ir/skill-dsl-research/development/authorization-reusable-program-v1/publication.json)，原有`.tmp/`和原件保留。开发gpt-6-astra/high、实验官方gpt-5.6-sol/high，第三方暂停，无额外修复抽样。

## BK 已结束的实际结果

**BK0–BK19以completed-with-unmet-criteria收束：恢复工程和有限队列已完成，完整自动主链与稳定净收益未达。** A0真实写稿并同线程修订为12步原稿，消费前固定；默认计算文件11/archive/v1-archive.pdf，仍为conditional。14变化场景值匹配7/14、值及有限条件匹配5/14。A1独立算出空版本文件12；C1自然补答纠正原稿文件11，但没有改好固定程序。C0/B0、B1/C1四题均partial/full/full/full，两对C的input/output/时间更高，未见整题质量提升。C2本地超时未交付，随后只读查到interrupted；原unknown记录及最终费用未知保留、不重发。S0单回合真实patch适应副本权限反转，当前场景在文件选择前403，未替换消费稿。

新identity为`authorization-recoverable-authoring-v1`，开发`gpt-6-astra/high`、实验官方`gpt-5.6-sol/high`。8用途、9attempt、13已观察turn；已知用量input15,126,421（含cache13,788,416）/output84,408，其中C2仅部分用量，最终USD、隐藏请求、开发/探子和真人成本未知。原件、逐步过程与逐题评价见[BK summary](../../results/skill-ir/skill-dsl-research/development/authorization-recoverable-authoring-v1/summary.json)、[execution](../../results/skill-ir/skill-dsl-research/development/authorization-recoverable-authoring-v1/execution.md)及[任务书处置](../superpowers/plans/2026-10-13-authorization-recoverable-authoring-and-real-delivery.md)。方法见[spec§14.50](skill-ir-aot-optimization-spec.md#1450-bk-recoverable-authoring-and-real-delivery)、[研究§7.72](skill-dsl-research.md#772-bj-复核与-bk-可恢复自动编写决定)。下一责任是原稿版本/root查询/排序/外部参数缺口与最终自然交付保真，不追加本轮抽样。

本次明确调整后续恢复规则：BJ R0 原请求继续 unknown、不重发、不改费用；新独立 A0 在核查本地宿主关闭、做有界只读核查并记录隔离后可以执行，不再以找回旧 ephemeral 终态为永久前置。相同未知请求仍不得自动重发，额度/认证和重复通道故障仍暂停对应通道。实验沿用已授权官方账号 `gpt-5.6-sol/high`，第三方暂停。full默认、完整原skill/四问和保护证据保持。

BK生产提交b5aed825、实质证据e80d8367及研究结论25aa59fd已推送用户origin/skill-ir-aot，并核对远端同SHA，见[发布回执](../../results/skill-ir/skill-dsl-research/development/authorization-recoverable-authoring-v1/publication.json)。后续回执提交只补发布元数据。

## BJ 已结束的实际结果

**BJ以completed-with-unmet-criteria发布实质成果b43886c0，用户origin同SHA；实际自动主链与收益未达，R0原生命周期仍为completion-unknown。** [任务书](../superpowers/plans/2026-10-13-authorization-authoring-loop-and-program-completion.md)由`gpt-6.1-sol/max`线程实施，identity为`authorization-authoring-loop-v1`。同operation绑定、空稿详情、实际值/根因、首稿/patch计量、一次早期试写及源码变化的旧稿来源检查已接通；full默认。R0 child退出4，没有provider完成事件、模型工具或答案，后续外部派发暂停、不重发。14变体×2离线轨道保留原四问：BI原稿值匹配0/14，developer-assisted binding-only为6/14，两轨完整有限行为匹配均0/14。真实副本变化撤回旧返回、搬移后三场景fresh/previous一致，ShareLink绑定/撤销/恢复/拒绝和匿名双operation通过，均零provider。最新授权联合1950pass/1平台skip/12975断言及主/BJ类型通过。方法见[spec§14.49](skill-ir-aot-optimization-spec.md#1449-bj-authoring-loop-and-program-completion)、[研究§7.71](skill-dsl-research.md#771-bj-输入接线与自动编写运行闭环)；分轴、费用unknown和具名后续见[BJ summary](../../results/skill-ir/skill-dsl-research/development/authorization-authoring-loop-v1/summary.json)与[status](../../results/skill-ir/skill-dsl-research/development/authorization-authoring-loop-v1/status.json)。

实施基线为BI最终提交`ace945fa`。发布后复核的68项定向测试、502断言通过，普通自动稿仍为conditional且无文件返回；仅诊断性补入输入后仍暴露空version、拒绝及root回退缺口，未计为自动成功。空草稿details还可触发TypeError。BJ要求共享修复得到实际作者确认，恢复修稿、独立新编写、固定原稿消费与对照分别留账。

BJ生产源码`d811309d`、实质证据`b43886c0`及终态提交`af226837`已推送并核对用户origin，见[发布回执](../../results/skill-ir/skill-dsl-research/development/authorization-authoring-loop-v1/publication.json)。BJ适用开发已收束，当时采用等待原R0终态的规则；BK依上方新合同隔离旧未知并开展独立工作，BJ原结果不回填。

## BI 已结束的实际结果

**BI0–BI23以`completed-with-unmet-criteria`收束，八个真实位置全部交付，无活动或未知请求。** [任务书](../superpowers/plans/2026-10-13-authorization-authoring-closure-and-reliable-consumption.md)的共享工程已落地至c9749483；授权联合1942通过/1平台skip/12930断言、主/研究类型、15文档测试及当前链接锚点通过。实质成果已发布至3cce2d02并核对用户origin同SHA，见[回执](../../results/skill-ir/skill-dsl-research/development/authorization-authoring-closure-v1/publication.json)。identity为`authorization-authoring-closure-v1`，开发模型`gpt-6.1-sol/max`，实验`gpt-5.6-sol/high`。方法见[spec§14.48](skill-ir-aot-optimization-spec.md#1448-bi-authoring-closure-and-reliable-consumption)、[研究§7.70](skill-dsl-research.md#770-bi-作者目标有序修稿与保真消费)。

A2十二步原稿在C1/C2之前冻结；原/变输入下均因question/input绑定及版本、权限、root回退关系缺口无computed文件返回。自然四问分别为A1 P/F/P/F、A2 F/F/F/F、C1 F/P/F/F、C2 F/F/F/F；给定材料P0两臂均full，P1 compact第四问partial、full全full。P0为tradeoff，P1为negative，未建立稳定净收益，示例默认full、compact显式使用。自动稿普通命令及实际conditional结果见[Download说明](../../examples/authorization-assessment/download-workflow/README.md)，详细依据见[逐题评阅](../../results/skill-ir/skill-dsl-research/development/authorization-authoring-closure-v1/quality.json)、[配对成本](../../results/skill-ir/skill-dsl-research/development/authorization-authoring-closure-v1/comparison.json)与[汇总](../../results/skill-ir/skill-dsl-research/development/authorization-authoring-closure-v1/summary.json)。共享输入绑定反馈不回填冻结稿，也不追抽第三作者。

## BH 已结束的实际结果

**BH有限队列以`completed-with-unmet-criteria`收束，6次真实调用全部交付，无活动/未知请求。渐进编译、持久草稿、patch、compact/full和按需详情已接通；自动稿三次保留4步但未补齐版本/文件主链。Download与ShareLink共14离线场景通过。首个同epoch P对照为tradeoff：compact成本降低但答案退化；一次规则投影修复确认另列。** [可运行Download](../../examples/authorization-assessment/download-workflow/README.md)、[ShareLink离线例](../../examples/authorization-assessment/share-create-workflow/README.md)、[结果与分轴结论](../../results/skill-ir/skill-dsl-research/development/authorization-incremental-program-v1/summary.json)。当前最小剩余责任是隔离作者补齐source-supported版本/返回关系，并保持备选分支可见；未建立稳定净收益。

BG发布后复核曾复现坏资源步骤导致整份拒绝、自动修稿丢掉workflow；BH已修复局部编译与草稿保留，重放可保住七步，原提案语义缺口仍在。方法与真实观察见[任务书BH0–BH17](../superpowers/plans/2026-10-12-authorization-incremental-authoring-and-efficient-consumption.md)、[spec§14.47](skill-ir-aot-optimization-spec.md#1447-bh-incremental-program-authoring-and-consumption)、[研究§7.69](skill-dsl-research.md#769-bh-发布后复核与渐进编写消费决定)。identity为`authorization-incremental-program-v1`；五个首位置及一次具名确认均已结束，不追加同因重抽。ShareLink/OWUI旧未知不重发，第二任务仅离线；工程、自动化、质量与收益分轴记录。

## BG 已结束的实际结果

**[BG0–BG16：真实任务 DSL 全流程运行、渐进执行与可读结果](../superpowers/plans/2026-10-12-authorization-end-to-end-practical-execution.md)已完成实质执行，以`completed-with-unmet-criteria`收束。** Download的25步作者程序已从普通入口运行，保留完整原skill/四问、实际轨迹和自然答案。7次归档含5次模型交付、2次CLI版本检查在推理前拒绝，无活动或未知请求。直接使用[可运行示例](../../examples/authorization-assessment/download-workflow/README.md)，分轴结论见[summary](../../results/skill-ir/skill-dsl-research/development/authorization-practical-execution-v1/summary.json)。

identity为`authorization-practical-execution-v1`。请求10→授权根10→文件11/archive；只把version由null改为空串，同程序实际消费改为文件12/original，采用1份旧源码材料。10个零模型变体覆盖拒绝/缺失/回退；源码副本检查发现并修复helper来源依赖遗漏，当前权限摘要失效而无关选择保留。DSL同期答案四问full；首件及同信息Markdown均Q1 partial，其余full。自动编写产出3源合同，但无资源主链、0采用，完整自动化未达。同期一对DSL多21,797输入/1,489输出，快68,510ms；净收益/泛化不成立。known input5,308,698（含cache4,672,000）/output46,982，211工具；USD、隐藏请求、开发/探子成本和真人分钟unknown。方法见[spec§14.46](skill-ir-aot-optimization-spec.md#1446-bg-practical-end-to-end-execution)、[研究§7.68](skill-dsl-research.md#768-bg-全流程优先与同任务执行决定)。旧BF队列与保护证据不变。

实质成果已发布至`35a91c2a`，用户origin远端逐字核对一致，见[发布回执](../../results/skill-ir/skill-dsl-research/development/authorization-practical-execution-v1/publication.json)。授权相关1918通过/1平台skip/12792断言、主/研究类型和15文档测试通过；本轮未跑全src，旧104失败不称已修。

## BF 已结束的实际结果

**[BF0–BF17：真实可执行授权 DSL、自动编写接线与变化消费](../superpowers/plans/2026-10-12-authorization-executable-contract-and-authoring.md)以`completed-with-unmet-criteria`收束，BF17实质成果已发布至4a002635并核对用户origin远端。** 六首位置均有已知终态，9归档含8模型交付和1推理前失败，无BF活动/未知请求。作者程序从普通入口得到局部跨函数结果，自动编写未产生可采用材料；给定程序的普通消费及R1实际复用成立，整题质量和同条件净收益未达。各轴见[summary](../../results/skill-ir/skill-dsl-research/development/authorization-executable-contract-v1/summary.json)、[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-executable-contract-v1/verification/acceptance-matrix.json)、[执行收束](../../results/skill-ir/skill-dsl-research/development/authorization-executable-contract-v1/verification/authorized-execution-closeout.json)及[发布回执](../../results/skill-ir/skill-dsl-research/development/authorization-executable-contract-v1/verification/publication.json)；方法及复盘见[spec§14.45](skill-ir-aot-optimization-spec.md#1445-bf-executable-contract-and-authoring)、[研究§7.67](skill-dsl-research.md#767-bf-真实可执行程序与自动编写接线)与[当前计划](skill-ir-aot-optimization-plan.md)。

BF最终源码提交869c0cbe，源码树1da810d9。A在user=null时得到双源checked/unreachable、10节点实际轨迹；省略输入后unknown，完整Download与callee效果不获认证。C基础/变化/fresh/previous最终实际采用2/1/1/2；变化和fresh自行替换为仅根函数程序，previous恢复并使用两材料、当前输入为空且性质unknown。previous另提交的新请求程序被拒，合同invalidated且无当前evaluation，不能把检查freshness=current称为成功。原答案均保留，原四问共17/32逐题full、0/8整题full。known input12,734,868（含cache11,745,280）/output73,991，408工具单位含8作者读取；USD/隐藏/开发探子/真人未知，见[accounting](../../results/skill-ir/skill-dsl-research/development/authorization-executable-contract-v1/accounting.json)。最新1902通过/1平台skip/12662断言、2研究测试及主/BF类型通过；误跑全src留下104失败，集中历史冻结身份与缺本地prospective输入，未改保护锁，全仓验证未通过。三具名修订已用，可选第二对因无自动R1未运行；有限队列true、研究false，H候选/D显式/项目默认不变。

## BE 已结束的实际结果

**[BE0–BE18：领域问题前端、相关依赖与机制价值验证](../superpowers/plans/2026-10-11-authorization-question-workflow-and-mechanism-value.md)以`completed-with-unmet-criteria`收束，BE18实质成果已发布至`96ed3472`，live远端SHA一致。** 六质量首位置、两具名D修订及六变化逻辑位置均交付：16归档含14模型运行、2推理前配置失败；无BE活动/未知完成。原质量整题0/6 full，全部实际交付0/14 full；10次D共35检查均unknown、0合格跨源性质。政策/前提/source对照为tradeoff/negative/no-observed-difference，三个previous实际材料使用均0。有限模型队列及发布已完成，研究目标保持false，见[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-question-workflow-v1/verification/acceptance-matrix.json)、[执行收束](../../results/skill-ir/skill-dsl-research/development/authorization-question-workflow-v1/verification/authorized-execution-closeout.json)及[发布回执](../../results/skill-ir/skill-dsl-research/development/authorization-question-workflow-v1/verification/publication.json)。

已修请求receiver适用范围、部分源码转换异常及未知依赖误判，独立H与D领域声明接入既有BB/v7公共链。最终源码树`f3bce237`：225核心测试/1418断言、12研究测试/68断言及主/研究类型通过。H是同首件质量下比D低成本的普通辅助候选；一般H优于N、D稳定质量增量及净收益未建立，项目默认不变。D1/original固定基础，policy/premise各恢复1 partial R1但未实际使用，source撤回R1并保留R0，R2全false；当前普通会话搬移零模型通过。known input26,118,113（含cache24,207,744）/output141,637；USD/隐藏/开发探子/真人未知。方法见[spec§14.44](skill-ir-aot-optimization-spec.md#1444-be-question-workflow-and-mechanism-value)、[研究§7.66](skill-dsl-research.md#766-be-领域问题前端与机制价值验证)及[当前计划](skill-ir-aot-optimization-plan.md)。

发布后复核已以`74bf7bef`推送，追加到[研究§7.66](skill-dsl-research.md#766-be-领域问题前端与机制价值验证)：两条源码变化评阅误将请求查找的include_deleted参数传播到独立版本选择，现已勘误，原P/F/F/P和整题计数保留。实际D1/修订及policy-previous仅有可用helper、无可投影entry；BF承接DSL可表达性、模型编写和实际组合责任，BE队列仍关闭。

## BD 已结束的实际结果

**[BD0–BD16：源码解释持续补齐、独立性质检查与真实质量比较](../superpowers/plans/2026-10-11-authorization-semantic-completion-and-real-quality.md)以`completed-with-unmet-criteria`收束，BD16已发布至`14aeb7f1`并核对远端SHA。** 实施基线`7f4ca507`，工程至`d747f44d`；179pass/1304断言、主类型、9研究测试/46断言及15文档测试通过。1诊断与4同期质量首件全交付，四整题均partial；两对tradeoff/negative，D当前7unknown、0合格跨源性质，六变化位置具名未运行。工程、完整任务、比较、复用和收益各轴见[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-completion-v1/verification/acceptance-matrix.json)、[执行收束](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-completion-v1/verification/authorized-execution-closeout.json)及[发布回执](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-completion-v1/verification/publication.json)；finiteQueueComplete/researchGoalAchieved仍false。

identity为`authorization-semantic-completion-v1`，显式策略继承task-binding/v7，已实现持续partial责任、独立性质缓存、窄编辑、分阶段恢复和完整skill inquiry会话。D1/D2实际保留3/4 partial，D2连入file_response并产生两单元trace，resolver/condition/return/closure仍缺。两对同源码epoch`7cb93348`，N1/D1逐题为P/F/F/F、F/F/F/P，N2/D2为F/F/F/P、P/P/F/P；D两次input/output及耗时均高于N。五尝试known input9,048,390（含cache8,187,392）/output46,920，254总工具含32自动单位，USD/隐藏/开发/真人未知。方法和责任见[spec§14.43](skill-ir-aot-optimization-spec.md#1443-bd-semantic-completion-and-real-quality)、[研究§7.65](skill-dsl-research.md#765-bd-解释持续补齐与独立质量比较)及[当前计划](skill-ir-aot-optimization-plan.md)。

## BC 已结束的实际结果

**[BC0–BC14](../superpowers/plans/2026-10-10-authorization-task-binding-and-replay-reliability.md)以`completed-with-unmet-criteria`收束，发布至`f37ee589`。** 实施基线`ee1a0522`，11个Download逻辑位置中4个已尝试、7个因资格阻断未派发；5去重尝试全部completed并交付，包含原包首件/具名复验和policy/premise/source三fresh。合格跨源性质0，五份完整自然任务均source-partial，N/D比较与实际previous复用未达；`finiteQueueComplete`和`researchGoalAchieved`仍false。事实与原件见[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-task-binding-v1/verification/acceptance-matrix.json)和[授权执行收束](../../results/skill-ir/skill-dsl-research/development/authorization-task-binding-v1/verification/authorized-execution-closeout.json)。

本轮已接通无手写properties原包的任务前端、精确跨调用修复及有界源码准备。OWUI原scope173文件实测准备80.59s→21.58s，源SHA/revision保持；当前派生重放Download/OWUI准备7.99s/20.78s、2/7份原解释语义字节保持，零新模型/含义。联合1,833pass/1平台skip/12,044断言及主/BC类型通过。真实模型仍未补齐入口/effect角色、closure和本题性质绑定；premise最终格式拒绝未产生property checks，不能记为unknown verdict。准备deadline与完成后计量已红绿修复，原报告和校正分存，详见研究§7.64。

identity为`authorization-task-binding-v1`，显式策略复用v7及原CLI。原四题/完整skill保留，source变更的request_doc授权对象已被自然回答识别，仍无checked/violated跨源trace。当前known input16,788,094（含cache15,453,312）、output86,987，总端到端2,388,505ms；USD/隐藏请求/开发与探子成本/真人分钟未知，见[accounting](../../results/skill-ir/skill-dsl-research/development/authorization-task-binding-v1/accounting.json)。OWUI仅离线迁移，旧未知不解除，不追加身份或幸运重抽。合同见[spec§14.42](skill-ir-aot-optimization-spec.md#1442-bc-task-binding-and-replay-reliability)，复核与方法见[研究§7.64](skill-dsl-research.md#764-bc-任务性质准备与跨调用修复)。

## BB 已结束的实际结果

**[BB0–BB16：跨函数性质闭合、渐进解释与真实使用](../superpowers/plans/2026-10-09-authorization-interprocedural-property-closure.md)以 `completed-with-unmet-criteria` 收束，发布至 `b1aa7b4c`。** 用户2026-10-10重启后批准的一次OWUI具名运行再次超时无server终态/答案，随后限定批准三个fresh各一次。policy/source均交付、自然partial/各2采用/性质unknown；premise终态routing失败未交付。三个previous缺合格consumer基础。两次OWUI未知原件/最终费用按[限定处置](../../results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/verification/user-resume-1-fresh-disposition.json)保留。授权执行结束，完整队列及研究目标仍未达，见[收束](../../results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/verification/authorized-execution-closeout.json)和[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/verification/acceptance-matrix.json)。

BB先保留effect/context标注下的源码调用，沿真实调用实例连接实参/形参/receiver/返回对象，再让跨单元性质检查消费可达路径；已解释片段逐步采用，相关未知继续保留。复用现有求值器和普通入口，新增行为显式v7。先做匿名正反例和公共链，再进入两真实任务、同条件比较、两包消费和三变化。方法合同见[spec §14.41](skill-ir-aot-optimization-spec.md#1441-bb-interprocedural-property-closure)，复核依据见[研究 §7.63](skill-dsl-research.md#763-bb-跨函数性质闭合的复核与开发决定)。

16位置中13已尝试、3previous未运行，共15去重尝试/12自然交付；M引用不增加样本或费用。当前同epoch比较仍为Download N/D full、M partial，OWUI三臂partial；Download原包partial/8采用，OWUI具名末次32采用但未交付、性质undeclared。真实跨函数trace为0。主/研究类型、425核心测试与29研究测试通过；本次完整离线重放未通过，隔离计时定位在createInquiryTools准备阶段，180.53秒未返回，内部根因未确认。后续先拆分准备阶段，不能重复完整重放或据已有授权新增OWUI/fresh重抽。

## BA 继承的实际结果

[BA0–BA18](../superpowers/plans/2026-10-09-authorization-semantic-submission-and-adoption.md)保留 `in-progress-external-blocker`：22位置中两pilot共4尝试、3自然交付、20未运行，工程和失败证据已发布至 `ad936715`。Download修订7单元/7材料、1采用、0性质绑定，源码partial；OWUI首件5单元、0采用、1绑定unknown，原题自然答案full并保留上游/部署限制。离线修复恢复3采用，真实具名复验routing失败；两项完整真实机器链未成立。

两包原字节兼容和搬移检查通过，实际消费与变化复用未测。已知3份输入10,707,789（含缓存10,026,624）、输出46,863；第4份用量、实际USD与隐藏请求unknown。12质量、2消费、6变化未运行，previous另缺合格基础，比较inconclusive。原件和暂停不改写，见[summary](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-submission-v1/summary.json)及[研究 §7.62](skill-dsl-research.md#762-ba-从真实拒绝到可用语义编辑)。BB用新身份承接责任，不在BA补行。

## AZ 已结束的结果与本次复核

[AZ任务书](../superpowers/plans/2026-10-09-authorization-property-abstraction-and-real-use.md)以completed-with-unmet-criteria收束。21逻辑位置中4已尝试，共5尝试/4自然交付；3次领域运行都耗尽格式额度且0接受/采用/检查。N自然源码评价full，M漏全局GET权限而partial，D官方routing失败；17位置未运行。显式v6性质绑定、有限摘要与采用诊断已实现，完整框架关系仍缺。

原参数复核发现field/value待办形状、annotation合同、union错误提示和最终答案字段之间存在摩擦；有一次合法annotation还缺可执行condition，不能只修格式就宣称链闭合。57项定向回归/331断言通过。原件与结论保持：[summary](../../results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/summary.json)、[verification](../../results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/verification.json)、[status](../../results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/status.json)。

## AY 已结束的真实结果

- [AY0–AY23](../superpowers/plans/2026-10-07-authorization-question-dependencies-and-usable-dsl.md) 已以 `completed-with-unmet-criteria` 收束。14 次归档尝试：10 delivered、2 unavailable、2 failed；12 个质量位置未运行。完整可用、比较收益及研究目标尚未达成。
- AY结构语义为 `source-bindings/v35`，AZ v6复用它。Download v35 接受3个源码单元、30个控制步骤、2次材料采用，仍有未解释callee和装饰器依赖；OWUI v35为0接受单元、0控制步骤、0材料采用，存在角色缺失及结论冲突。两次native自然终答均被独立评为partial。
- 两作者包已按原字节实际消费。Download消费者源码评阅full但机器partial；OWUI消费者仍有决定性helper未读。变化中policy-fresh、premise-fresh/previous已有运行；policy-previous路由失败、source-fresh额度拒绝，source-previous及质量位置保留未运行。
- 原件、计量及验收以 [最终收束](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/final-closure-v35.json)、[manifest](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/manifest.json)、[状态](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/status.json) 为准。历史 `acceptance` 字段表达要求，不代表实际通过。

AZ启动前复核发现的依赖范围、投影诊断和格式计数问题已有有界修复，形成过程保留在研究§7.61。当前新增责任以§7.74和BM任务书为准；既有严格路径保留，渐进执行继续按实际结果标注。

## 账号、运行和继承边界

- BM开发 `gpt-6-astra/high`，按用户指定派发；实验沿用已授权的当前官方账号 `gpt-5.6-sol/high`，无需再次确认。第三方API和AV旧位置继续暂停。BM在新identity登记修订作者、独立作者、消费、基线、维护与具名确认；BL及更早旧队列保持结束，不向旧结果补行。
- BG有限执行已收束，无活动或未知请求；自动编写与重复上下文成本为未达项，不自动增加样本。后续新任务继续遵守具名恢复、账号未知和成本记录边界。
- BF六首位置及三具名修订已处置，可选反序第二对因自动R1未达未运行。自动编写、作者给定程序消费及变化复用各自分母；不会自动追加模型。新范围不升级旧readiness或改变项目默认。
- BE六质量首位置和六变化逻辑位置已完成，保持完整原skill/四问及失败分母。source-previous两件确定未派发，仅一个同输入/epoch的登记恢复交付；原件和79,770ms本地开销保留。R0/R1资格、恢复和实际使用分列，旧答案/评阅/verdict不进入previous；R2缺失使实际R2撤回实验未执行。旧BD六未运行不补行，OWUI继续仅离线。
- AY额度提示、AZ unavailable及BA `paused-recurring-routing`均保留；BC/BD已交付不解除旧未知。BE/BJ当时的暂停与恢复决定保留历史语境。BK将终态、宿主活动和处置分开：核查后无法恢复的unknown可隔离，允许已授权的新独立用途；相同请求不自动重发。新同因通道故障的一次有据恢复仍失败则暂停该通道，quota/auth立即暂停。不额外健康模型探针或重复轮询。
- 用户暂停已撤销，旧未知费用与原终态保留，BK的隔离决定不升级这些旧结果。BB已完成尝试已知input32,038,537（含cache29,105,920）、output136,921。两OWUI部分usage单列，BB premise失败用量未返回；最终未知量、USD、隐藏请求、开发/探子成本和真人分钟保持unknown。本地观测duration不代表未知尝试的服务器最终耗时。
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
| 当前BM | [任务书](../superpowers/plans/2026-10-14-authorization-branch-completion-and-directed-consumption.md)、spec§14.52、研究§7.74；已登记待接管，尚无工程/实验结果 |
| BL | [任务书](../superpowers/plans/2026-10-14-authorization-reusable-program-semantics-and-delivery.md)、spec§14.51、研究§7.73；适用工程/八用途收束，自动范围15/18、两对negative、C2缺交付，完整研究目标未达 |
| BK | [任务书](../superpowers/plans/2026-10-13-authorization-recoverable-authoring-and-real-delivery.md)、spec§14.50、研究§7.72；适用工程/有限队列结束，自动主链和净收益未达 |
| BJ | [任务书](../superpowers/plans/2026-10-13-authorization-authoring-loop-and-program-completion.md)、spec§14.49、研究§7.71；离线工程已验证，R0原生命周期unknown且不重发，自动主链/四问交付/收益未达 |
| BI | [任务书](../superpowers/plans/2026-10-13-authorization-authoring-closure-and-reliable-consumption.md)、spec§14.48、研究§7.70；已发布，工程与有限队列完成，自动主链及稳定收益未达 |
| BH | [任务书](../superpowers/plans/2026-10-12-authorization-incremental-authoring-and-efficient-consumption.md)、spec§14.47、研究§7.69；有限队列完成、自动主链与稳定收益未达；实际程序、首失败、修复和分轴结论已归档 |
| BG | [任务书](../superpowers/plans/2026-10-12-authorization-end-to-end-practical-execution.md)、[summary](../../results/skill-ir/skill-dsl-research/development/authorization-practical-execution-v1/summary.json)、spec§14.46、研究§7.68；主链运行/变化成立，自动编写和净收益未达 |
| BF | [任务书](../superpowers/plans/2026-10-12-authorization-executable-contract-and-authoring.md)、[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-executable-contract-v1/verification/acceptance-matrix.json)、spec§14.45、研究§7.67；工程/有限队列收束，整题质量与净收益未达 |
| BE | [任务书](../superpowers/plans/2026-10-11-authorization-question-workflow-and-mechanism-value.md)、[执行收束](../../results/skill-ir/skill-dsl-research/development/authorization-question-workflow-v1/verification/authorized-execution-closeout.json)、[发布回执](../../results/skill-ir/skill-dsl-research/development/authorization-question-workflow-v1/verification/publication.json)、spec§14.44、研究§7.66；有限队列及发布完成、研究未达，不自动重抽 |
| BD | [任务书](../superpowers/plans/2026-10-11-authorization-semantic-completion-and-real-quality.md)、[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-completion-v1/verification/acceptance-matrix.json)、spec§14.43、研究§7.65；有限执行结束、5交付/0整题full/0合格性质/6未运行，最终发布6c8c79e3 |
| BC | [任务书](../superpowers/plans/2026-10-10-authorization-task-binding-and-replay-reliability.md)、[收束](../../results/skill-ir/skill-dsl-research/development/authorization-task-binding-v1/verification/authorized-execution-closeout.json)、spec§14.42、研究§7.64；5交付/0合格跨源性质/7资格阻断 |
| BB | [任务书](../superpowers/plans/2026-10-09-authorization-interprocedural-property-closure.md)、[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/verification/acceptance-matrix.json)、spec§14.41、研究§7.63 |
| BA | [任务书](../superpowers/plans/2026-10-09-authorization-semantic-submission-and-adoption.md)、[summary](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-submission-v1/summary.json)，spec§14.40、研究§7.62 |
| AZ | [任务书](../superpowers/plans/2026-10-09-authorization-property-abstraction-and-real-use.md)、[summary](../../results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/summary.json)，spec§14.39、研究§7.61 |
| AY | [任务书](../superpowers/plans/2026-10-07-authorization-question-dependencies-and-usable-dsl.md)、[最终收束](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/final-closure-v35.json)，研究§7.60保留v5/v35形成过程 |
| AX | [summary](../../results/skill-ir/skill-dsl-research/development/authorization-property-execution-v1/summary.json)、[离线包核验](../../results/skill-ir/skill-dsl-research/development/authorization-property-execution-v1/verification/portable-package.json)；原unknown与11个未运行位置不改 |
| AW/AV | [AW summary](../../results/skill-ir/skill-dsl-research/development/authorization-control-materials-v1/summary.json)、[AV status](../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/status.json)，第三方暂停保持 |
| AR–AU及更早 | [唯一研究正文](skill-dsl-research.md)、[历史](history.md)、[证据索引](evidence-index.md)、[实验目录](../../results/skill-ir/experiment-catalog.json) |

普通命令见 [使用说明](../usage.md)，代码与测试定位见 [开发指南](developer-guide.md)。本轮不新增长期阅读文档，研究仍统一在一个正文中。仅更新当前状态及索引，不把逐次派发和测试日志持续堆到本页。
