# Skill IR 当前状态

更新于2026-10-12。工作分支为 `skill-ir-aot`，仅发布到用户 `origin`。本页是唯一实时状态入口；历史任务书与结果保留当时记录。

## 当前工作

**[BF0–BF17：真实可执行授权 DSL、自动编写接线与变化消费](../superpowers/plans/2026-10-12-authorization-executable-contract-and-authoring.md)以`completed-with-unmet-criteria`收束，BF17待发布核对。** 六首位置均有已知终态，9归档含8模型交付和1推理前失败，无BF活动/未知请求。作者程序从普通入口得到局部跨函数结果，自动编写未产生可采用材料；给定程序的普通消费及R1实际复用成立，整题质量和同条件净收益未达。各轴见[summary](../../results/skill-ir/skill-dsl-research/development/authorization-executable-contract-v1/summary.json)、[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-executable-contract-v1/verification/acceptance-matrix.json)与[执行收束](../../results/skill-ir/skill-dsl-research/development/authorization-executable-contract-v1/verification/authorized-execution-closeout.json)；方法及复盘见[spec§14.45](skill-ir-aot-optimization-spec.md#1445-bf-executable-contract-and-authoring)、[研究§7.67](skill-dsl-research.md#767-bf-真实可执行程序与自动编写接线)与[当前计划](skill-ir-aot-optimization-plan.md)。

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

AZ启动前复核发现的依赖范围、投影诊断和格式计数问题已有有界修复，形成过程保留在研究§7.61。当前新增责任以§7.67为准；`inquiry-result`的整体Schema/缺题拒绝及局部保留继续保持。

## 账号、运行和继承边界

- 开发 `gpt-6.1-sol/max`；实验沿用用户已授权的当前官方账号 `gpt-5.6-sol/high`，无需再次确认。第三方API和AV旧位置继续暂停。
- BF六首位置及三具名修订已处置，可选反序第二对因自动R1未达未运行。自动编写、作者给定程序消费及变化复用各自分母；不会自动追加模型。新范围不升级旧readiness或改变项目默认。
- BE六质量首位置和六变化逻辑位置已完成，保持完整原skill/四问及失败分母。source-previous两件确定未派发，仅一个同输入/epoch的登记恢复交付；原件和79,770ms本地开销保留。R0/R1资格、恢复和实际使用分列，旧答案/评阅/verdict不进入previous；R2缺失使实际R2撤回实验未执行。旧BD六未运行不补行，OWUI继续仅离线。
- AY额度提示、AZ unavailable及BA `paused-recurring-routing`均保留；BC/BD已交付不解除旧未知。BE明确终态routing失败允许一次具名恢复，连续两次或本轮累计三次恢复仍失败则暂停外部派发。quota/auth立即暂停，unknown只核查原生命周期；历史累计成本及旧未知不清除，不额外健康探针、轮询或旁路。
- 用户暂停已撤销，两次未知经过各自限定人工处置保留；后续未知保护不变。BB已完成尝试已知input32,038,537（含cache29,105,920）、output136,921。两OWUI部分usage单列，BB premise失败用量未返回；最终未知量、USD、隐藏请求、开发/探子成本和真人分钟保持unknown。本地观测duration不代表未知尝试的服务器最终耗时。
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
| 当前BF | [任务书](../superpowers/plans/2026-10-12-authorization-executable-contract-and-authoring.md)、[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-executable-contract-v1/verification/acceptance-matrix.json)、spec§14.45、研究§7.67；工程/有限队列收束，整题质量与净收益未达 |
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
