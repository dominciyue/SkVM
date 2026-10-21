# Skill IR 当前状态

更新于2026-10-21（Asia/Shanghai）。工作分支为 `skill-ir-aot`，仅发布到用户 `origin`。本页是唯一实时状态入口；历史任务书与结果保留当时记录。

## 当前工作

**BU0–BU10已实施，有限模型队列准备中。** [任务书](../superpowers/plans/2026-10-21-authorization-source-differential-verification.md) identity为`authorization-source-differential-v1`，接管HEAD `9ac569b1`。独立要求、参数敏感M原函数观察及普通check/run/trial/details差分已接通；13案零模型回放检出真实提前拒绝和4个语义变异，4个中性控制无误报，缺映射/错误结果仍unknown。G仅源码评阅。见[执行记录](../../results/skill-ir/skill-dsl-research/development/authorization-source-differential-v1/execution.md)。开发`gpt-6-astra/high`，实验官方`gpt-5.6-sol/high`，第三方暂停，尚无本轮付费派发。

本轮重点是独立于作者的核验要求、参数敏感的Memos原函数观察、共享源码/程序差分及普通作者反例修复。十个正常模型用途用于LLM复核、两组修稿与实际使用，至多两次有据确认；停止同形N/R/E消费者面板。源码忠实性、用户政策、原题完整性分开评价。方法见[spec§14.60](skill-ir-aot-optimization-spec.md#1460-bu-source-differential-verification)、[研究§7.82](skill-dsl-research.md#782-bt-复核与-bu-源码差分核验)。旧原件、`.tmp/`和默认入口保留。

本机Stop That Shit 0.2.5已通过Codex插件入口安装启用，四个Hook原生信任为Active；CLI只读试运行记录Guard为armed并检查一次命令。新开发线程首行使用明确change指令，遵循完成责任、定向验证和不扩无关范围的原则；该工具不承诺自动保证研究效果。

## BT 已结束的实际结果

**BT0–BT21已完成并发布，工程及研究诊断最低目标达到，完整自动语义、自然质量和稳定净收益未达。** [任务书](../superpowers/plans/2026-10-21-authorization-semantic-validation-and-method-diagnosis.md) identity为`authorization-semantic-validation-v1`，基线`b0ab0c18`。10计划用途、9实际派发、15观察turn全部关闭，0/4额外确认。M末稿`6cb4bcad`修复3处源码顺序反例并通过局部资格；G末稿`6ec6765c`错误地把转换器加载失败当成阻止201，AE-G零调用不合格、分母保留。M原控制流抽取测试8子案例通过，完整模块与目标服务执行均0；G仅源码评阅。563文件预先冻结，作者使用`58c3ba23`，全部消费者同`d8a0a754`，RR/RE同参考原字节。

八消费位置交付7、整题0/8 full、评价域29/48 full、核心关系18/28正确；N/RR/RE/AE完整域分别7/9/10/3（各12域）。M参考规则/执行持平，G执行多覆盖writer错误处理一域；RE/RR观察token比为1.410/1.455，不能归为稳定执行收益。普通原/变输入、搬移与来源失效通过，G条件保留与语义不合格分开。132定向测试/905断言、主/研究类型与15文档测试通过；939原件无损归档并读回。known input14,779,426（含cache13,203,584一次）、output95,621，USD、准备/开发/评阅成本未知。开发`gpt-6-astra/high`，实验官方`gpt-5.6-sol/high`，第三方暂停；原件与`.tmp/`保留。

见[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/verification/acceptance-matrix.json)、[执行记录](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/execution.md)、[逐答裁定](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/evaluation/natural-review.json)和[成本](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/accounting.json)。方法合同见[spec§14.59](skill-ir-aot-optimization-spec.md#1459-bt-semantic-validation-and-method-diagnosis)，原因与下一责任见[研究§7.81](skill-dsl-research.md#781-bs-复核与-bt-源码语义核验及方法诊断)。保留局部执行，优先解决源码正文依据与原题剩余职责组织；本轮停止，不自动BU。

实质成果`80bd25e9`已推用户origin并核对远端同SHA，见[发布回执](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/publication.json)。以`completed-with-unmet-criteria`记录完整语义/质量/收益未达，诊断最低目标独立为true；本地原件和既存`.tmp/`保持。

## BS 已结束的实际结果

**BS0–BS22已完成并发布，以completed-with-unmet-criteria收束。** [任务书](../superpowers/plans/2026-10-20-authorization-task-coverage-and-semantic-transfer.md) identity为`authorization-task-coverage-v1`，从BR最终2100085b继续。14用途、15attempt、18观察turn全部关闭，使用1/4具名确认，无本轮active/unknown。开发`gpt-6-astra/high`，实验官方`gpt-5.6-sol/high`，第三方暂停。共享原题调查、事件反馈及普通报告已实施，嵌套函数owner故障红绿修复，生产至c3be4cc2。

M最后30步原稿29案有限值/条件一致但3案顺序错误；G最后7步原稿因route guard schema错误仅有条件字段结果，16案完整创建均未达。十二消费者整题0/12 full、六域43/72 full；E实际采用有限结果，但有补充也有退步，稳定净收益未建立。E/R观察token比M0/M1/G0/G1为1.659/0.752/0.967/1.081，同块同epoch同raw；M/G分epoch。普通M/G原/变输入、搬移、源码变化撤回和Download零模型兼容通过；127定向测试/984断言、主/研究类型及15文档测试通过。A-G恢复交付后宿主崩溃的原件与partial报告保持，两个turn usage未知；known input14,115,853（含cache12,484,224一次）/output104,905，实际USD等未知。见[验收](../../results/skill-ir/skill-dsl-research/development/authorization-task-coverage-v1/verification/acceptance-matrix.json)、[执行记录](../../results/skill-ir/skill-dsl-research/development/authorization-task-coverage-v1/execution.md)、[spec§14.58](skill-ir-aot-optimization-spec.md#1458-bs-task-coverage-and-semantic-transfer)、[研究§7.80](skill-dsl-research.md#780-br-复核与-bs-原题覆盖和跨结构语义使用)。900原件已无损打包并逐件读回核验，553登记来源已有Git留存。本地原件及`.tmp/`保持。实质成果17edc5c3已推用户origin并核对同SHA，见[发布回执](../../results/skill-ir/skill-dsl-research/development/authorization-task-coverage-v1/publication.json)。本轮停止，不自动BT。

## BR 已结束的实际结果

**BR有限队列已完成，以completed-with-unmet-criteria收束。** 从4216358f接管，[任务书](../superpowers/plans/2026-10-19-authorization-evidence-backed-answers-and-task-transfer.md) identity为`authorization-answer-transfer-v1`。9用途、10attempt、17观察turn全部交付并关闭，使用1/4具名确认，无活动/unknown。共享修复区分未执行外部依赖，并公开执行器已有数值比较语法；Memos首件五raw及确认七raw全部保留，按时间固定最后25步原稿。20已知结果案例匹配、2缺输入保留真实条件；源码调用顺序和完整转换仍未达。普通CLI、同稿时钟变化、搬移和源码变化撤回通过，见[普通使用说明](../../examples/authorization-assessment/shared-link-workflow/README.md)。

Download原四问两答均full，Memos消费者27/36维full、整题0/6；原输入E/R持平，变化输入E遗漏R已说明的转换错误。E/R观察总token比分别1.196和0.748，Download执行更贵；跨结构有限采用成立，完整自然质量和稳定净收益未达。实验官方gpt-5.6-sol/high，known input15,642,633（含cache13,998,592一次）/output110,124；USD、隐藏请求、开发/探子和真人成本unknown。Memos为已暴露源码及合成事实，不称held-out/liveAPI。972原件无损打包逐件核验，另保留95个已登记Download源码依赖；本地原件及.tmp保持。见[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/verification/acceptance-matrix.json)、[执行记录](../../results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/execution.md)、[spec§14.57](skill-ir-aot-optimization-spec.md#1457-br-evidence-backed-answers-and-task-transfer)及[研究§7.79](skill-dsl-research.md#779-bq-复核与-br-回答依据和跨任务检验)。实质成果e501c136已推用户origin并核对同SHA，见[发布回执](../../results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/publication.json)。本轮停止，不自动BS。

## BQ 已结束的实际结果

**BQ0–BQ17已执行并发布，以completed-with-unmet-criteria收束；实质成果34ed287e已核对用户origin同SHA。** 两个已知缺陷已在模型实际原稿中修复，真实试跑参与和普通固定稿消费成立；完整自然质量与稳定执行增量未达。[任务书](../superpowers/plans/2026-10-18-authorization-source-program-consistency-and-task-execution.md) identity为`authorization-source-program-consistency-v1`，从a0e306cb接管，共享工程c0b5ccf8。开发gpt-6-astra/high，实验官方gpt-5.6-sol/high，第三方暂停。

T-R/T-E均从BP52步原字节修至55步，首有效/最终稿均35/35字段与局部轨迹匹配，初稿32/35。None caller实际跳过外部权限调用，完整request缺version键显式default为null；正常、拒绝、unknown登记路径无关键退步。T-E有3批11案例，7案例对应最终revision，形成诊断→patch→验收链。固定T-E当前原字节经U-E普通消费，组合输入返回11/original/v1-original.pdf；无consumer编辑或主动trial。搬移重放与源码变化撤回通过，完整HTTP仍不获认证。

3用途全部交付，8观察turn，0活动/unknown，未用额外确认。T-E续作budget-reserve中断但首交付/current raw一致；U-E工具中断后final-child交付，中断保留。源码决策9/12 full，原四问6/12 full、整题0/3。T-E遗漏root fallback与构造器顺序，三答正常false/null完成说明仍不完整。两臂程序持平；T-E观察token/时间较低但说明遗漏更多，单对不建立稳定质量/净收益。known input8,739,932（含cache7,810,432一次）/output52,327，USD/隐藏请求/开发及真人成本unknown。

[执行记录](../../results/skill-ir/skill-dsl-research/development/authorization-source-program-consistency-v1/execution.md)、[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-source-program-consistency-v1/verification/acceptance-matrix.json)、[普通BQ命令](../../examples/authorization-assessment/download-workflow/README.md#current-bq-explicit-program)。原件无损压缩并逐件核验，原始本地文件和.tmp保留。方法见[spec§14.56](skill-ir-aot-optimization-spec.md#1456-bq-source-program-consistency-and-real-task-use)、[研究§7.78](skill-dsl-research.md#778-bp-复核与-bq-先修复后实际使用)。项目默认不变，不自动追加BR。

## BP 已结束的实际结果

**BP有限队列以completed-with-unmet-criteria收束：45首位置及3具名确认完成，工程与有限采用成立，重复局部质量优势和完整语义未达；证据提交4a9bcd19已发布并核对origin同SHA。** [当前任务书](../superpowers/plans/2026-10-16-authorization-quality-evidence-and-branch-reliability.md) identity为`authorization-quality-evidence-v1`，开发`gpt-6-astra/high`，实验官方账号`gpt-5.6-sol/high`，第三方暂停。方法见[spec§14.55](skill-ir-aot-optimization-spec.md#1455-bp-capability-quality-and-executable-support)和[研究§7.77](skill-dsl-research.md#777-bo-质量复核与-bp-能力实验决定)。固定52步A0、A1最终字段及局部轨迹均18/18、7/8、6/7；A2字段17/18、5/8、5/7，局部轨迹18/18、7/8、6/7。匿名外层激活和缺version键仍有缺口。普通入口五组和搬移失效均通过。

主面板R2对R1四域胜/平/负分别为对象0/11/1、分支3/7/2、变化2/9/1、条件0/11/1；每域的一次负向来自Q2-R2-1额度拒绝，分支另有一次已交付语义退步。原Q0-R0-0中断另轨确认仍不替换首件，跨epoch不作因果配对。全部34交付均遗漏正常完成与False/None返回值的完整区分；整题0/36 full，Q3-R0-1有独立版本查询manager误判。全部评阅、原件与分歧保留。局部改善和负向同表报告，不推一般可靠性或净收益。

用户明确通知额度重置后，精确历史身份恢复登记经12测试/73断言和BP类型验证，后续九位置已完成，原失败保持。S首对交付，但发现rules edit缺明确程序交付职责及可复用目标：S-R1仅解释、未编辑，S-R2提交55步。此指令混杂已在bce9dfd4红绿修复；原首对不得归因于纯执行增量。两次同epoch具名确认已从原A0/变化源码完成：rules54→62步、execute59→59步；终答同为F/F/F/P。全部48attempt/77观察turn、46交付，47完整归档加1只读核对的部分归档，0活动请求；维护21组零模型复算完成：原rules继承稿0/3，原execute及两确认的首/终稿均3/3局部匹配；rules终稿每输入保留4项上游条件，不能称无条件HTTP拒绝。两组仍缺实际None激活和缺version键处理。T-A0首4步无效、终10步可局部返回doc10，三臂辅助必要事实分别3/7、5/7、3/7且均partial；完整constructor及持久化边界仍缺。83项受影响测试/581断言、主/BP类型及15文档测试通过。分轴结论见[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-quality-evidence-v1/verification/acceptance-matrix.json)和[执行记录](../../results/skill-ir/skill-dsl-research/development/authorization-quality-evidence-v1/execution.md)。工程与证据已发布到用户origin，最终回执随本轮闭合提交保存；原中断标签和未知费用保留，不自动创建BQ。

## BO 已结束的实际结果

**BO0–BO17以completed-with-unmet-criteria收束有限队列：工程和普通使用完成，完整自动语义、四问质量及净收益未达。** 工程754b72f3与公开契约修复e8522ee9已发布；[当前任务书](../superpowers/plans/2026-10-16-authorization-call-semantics-and-program-repair.md)从89ef2864接管，identity为`authorization-call-semantics-v1`。固定A0为模型原稿45步，字段/局部轨迹18/18、额外7/8，匿名外层激活仍缺；A1独立23步，值7/18、局部调用17/18加8/8，上游未知与局部错误分列。普通CLI七组、搬移四组及源码变化撤回已验证；S0维护54步，副本三组局部反转成立，不替换A0。两对四问B/C为P/P/P/F对P/F/F/P、P/P/P/F对P/P/F/F，总token比1.045/2.269，均为质量与成本取舍。八attempt/七位置全部交付、15观察turn、0活动/未知；逐题14/32 full、整题0/8 full。known input17,911,460（含cache-read16,421,248一次）/output133,089，USD、开发评阅和真人成本未知。180测试/1285断言、主/研究类型及15文档测试通过。见[分轴验收](../../results/skill-ir/skill-dsl-research/development/authorization-call-semantics-v1/verification/acceptance-matrix.json)、[运行过程](../../results/skill-ir/skill-dsl-research/development/authorization-call-semantics-v1/execution.md)、[显式命令](../../examples/authorization-assessment/download-workflow/README.md#current-bo-explicit-program)、[spec§14.54](skill-ir-aot-optimization-spec.md#1454-bo-source-call-semantics-and-program-repair)和[研究§7.76](skill-dsl-research.md#776-bn-复核与-bo-源码调用语义修稿决定)。第三方继续暂停；本轮结束，不自动追加BP。

## BN 已结束的实际结果

**BN0–BN19以completed-with-unmet-criteria完成并发布：工程和八用途交付成立，完整自动程序及净收益未达。** [任务书](../superpowers/plans/2026-10-15-authorization-purpose-scoped-authoring-and-consumption.md)使用identity `authorization-purpose-scoped-program-v1`，工程662b9c0c，实质成果bd613fc2已推用户origin并核对同SHA，见[发布回执](../../results/skill-ir/skill-dsl-research/development/authorization-purpose-scoped-program-v1/publication.json)。最终联合254测试/1845断言、主/研究类型、15文档测试及9份修改文档链接/锚点通过。A0为21步，字段17/18、严格轨迹4/18及额外2/8；A1为17步，字段1/18（值14/18）、严格0/18及额外0/8，其上游全局权限条件超出旧局部oracle，保留范围差异而不抬分。两对B/C四问分别P/P/P/P对P/F/F/P、P/P/P/P对F/F/F/P；C总token为B的1.409/1.731倍，无净收益。C2拒绝且交付；S0维护28步，副本三输入符合有条件的局部反转，严格语义仍缺。8用途全部交付、14观察turn、0活动/未知，整题0/8 full。普通五场景、搬移和失效已验证；[显式BN命令](../../examples/authorization-assessment/download-workflow/README.md#current-bn-explicit-program)保留为需审阅辅助，BL默认不变，不自动追加同范围实验。known input14674048（含cache13155328）/output105898，USD/开发评阅/真人成本未知。见[分轴验收](../../results/skill-ir/skill-dsl-research/development/authorization-purpose-scoped-program-v1/verification/acceptance-matrix.json)、[spec§14.53](skill-ir-aot-optimization-spec.md#1453-bn-purpose-scoped-authoring-and-consumption)及[研究§7.75](skill-dsl-research.md#775-bm-复核与-bn-聚焦修稿和消费线路调整)。

## BM 已结束的实际结果

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

AZ启动前复核发现的依赖范围、投影诊断和格式计数问题已有有界修复，形成过程保留在研究§7.61。当前新增责任以§7.79和BR任务书为准；既有严格路径保留，渐进执行继续按实际结果标注。

## 账号、运行和继承边界

- BR开发 `gpt-6-astra/high`，按用户指定派发；实验沿用已授权的当前官方账号 `gpt-5.6-sol/high`，无需再次确认。第三方API和AV旧位置继续暂停。BQ共享实现和三项正常用途已完成，未用额外确认；BQ及更早旧队列保持结束，不向旧结果补行。
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
| 当前BU | [任务书](../superpowers/plans/2026-10-21-authorization-source-differential-verification.md)、spec§14.60、研究§7.82；已授权待开发，源码差分及反例修稿 |
| 已结束BT | [任务书](../superpowers/plans/2026-10-21-authorization-semantic-validation-and-method-diagnosis.md)、spec§14.59、研究§7.81；M局部修复、G语义缺口、29/48域与0/8整题 |
| 已结束BS | [任务书](../superpowers/plans/2026-10-20-authorization-task-coverage-and-semantic-transfer.md)、spec§14.58、研究§7.80；有限队列完成，工程通过，完整语义/自然质量/稳定净收益未达 |
| 已结束BR | [任务书](../superpowers/plans/2026-10-19-authorization-evidence-backed-answers-and-task-transfer.md)、spec§14.57、研究§7.79；completed-with-unmet-criteria，九用途与一次确认完成；有限复用成立，完整语义/质量/稳定收益未达 |
| BQ | [任务书](../superpowers/plans/2026-10-18-authorization-source-program-consistency-and-task-execution.md)、spec§14.56、研究§7.78；最终3c3059a8已发布，两个缺陷修复，完整自然质量与稳定增量未达 |
| BP | [任务书](../superpowers/plans/2026-10-16-authorization-quality-evidence-and-branch-reliability.md)、spec§14.55、研究§7.77；最终27d59677，有限队列完成，完整语义和重复执行质量优势未达 |
| BO | [任务书](../superpowers/plans/2026-10-16-authorization-call-semantics-and-program-repair.md)、spec§14.54、研究§7.76；有限自动调用语义与维护结果保留 |
| BN | [任务书](../superpowers/plans/2026-10-15-authorization-purpose-scoped-authoring-and-consumption.md)、spec§14.53、研究§7.75；有限队列已发布，完整程序/整题质量/净收益未达，实质成果bd613fc2 |
| BM | [任务书](../superpowers/plans/2026-10-14-authorization-branch-completion-and-directed-consumption.md)、spec§14.52、研究§7.74；有限队列收束，A0/A1为15/18、14/18，首对negative，完整自动程序和收益未达 |
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
