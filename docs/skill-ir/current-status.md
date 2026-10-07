# Skill IR 当前状态

更新于2026-10-07。工作分支为`skill-ir-aot`，仅发布到用户origin。AW最终提交`5a25d759`及复核提交`ccf00985`已发布；AX正在开发。本页是唯一实时状态入口，历史任务书和原始结果保留当时记录。

## 当前工作

研究主线是 **按 skill/task 范围设计领域表达**。当前任务类为单 repo/ref、源码可见的授权与信任边界评估：围绕主体、资源、操作、条件和政策组织取证、判断与检查。质量约六成、编写复用约四成指开发投入安排，各项质量要求分别验收。

**当前队列：[AX0–AX20 按授权问题求值与账号真实执行](../superpowers/plans/2026-10-07-authorization-property-analysis-and-account-execution.md)，`in-progress`。** 开发模型`gpt-6.1-sol/max`，账号实验`gpt-5.6-sol/high`。用户已允许消耗当前账号额度；第三方API及AV十二旧位置继续暂停。20个首位置已登记。AX0–AX2已接通版本绑定的生产账号运行：首件因关闭Code Mode宿主而未调用工具；唯一具名修订实际完成匿名工具请求、一次宿主执行和正确消费。CLI 0.159.0-alpha.12.1有效权限、空额外roots、禁用工具/skills及固定指令来源已核验，通用全局用户政策按SHA约束而未声称不存在。两次可见会话内部请求数/USD未知。AX3/AX6七个语义反例及独立复核的来源归因反例已通过；局部连续context合流保留正常/未知失败，86项相关回归及主类型通过。AX4–AX9已接入源码不变裁剪、八锚点增量frontier、分层覆盖、共享决定性来源优先调度及公开v4入口；独立只读裁剪复核无阻塞发现，969pass/1平台skip/6166断言通过。材料语义版本与v3分离，完整skill原字节归档可核验。AX10原首件与四项具名修订保留；共享账号字段反馈、有限控制焦点和answer阶段已红绿修复。当前Download native与公开inquiry都交付自然答，形式仍部分；OWUI原native接受4源码单元/58步骤并交付自然答，仍有接收者参数/调用链接缺口。独立源码评阅确认两任务核心对象关系，具体分支和运行事实覆盖尚不足，未记任务通过。policy fresh/previous和premise fresh首件已保留；previous的A→B→A解释重新接纳暴露共享材料未恢复current状态，实际采用0。两个红测后已修共享存储，84项相关回归685断言及主类型通过，独立只读核验未见阻塞；提交后须用新具名公开baseline/登记做同版本成对复验。Download common-only作者已生成原稿，独立评阅确认任务忠实；OWUI作者继续，消费者与六臂质量尚待执行。截至13份已关闭归档，父会话可见input/output/cacheRead为28399731/119882/26429952，内部请求、USD、额外子会话及开发/探子用量未知；234上下文直接核验，OWUI28上下文以两份SHA匹配源码窗口的精确脱敏重建核验并单列。修前同src tree的六份归档184回调及完整状态/材料已零账号严格重放并提交；原失败保留，实际质量和复用收益未建立。原件见[AX status](../../results/skill-ir/skill-dsl-research/development/authorization-property-execution-v1/status.json)。合同见[spec AX](skill-ir-aot-optimization-spec.md#1437-ax-property-directed-analysis-and-controlled-account-execution)，决定见[研究§7.58](skill-dsl-research.md#758-ax-按授权问题求值与账号真实执行开发决定)。

**上一已结束队列：[AW0–AW22](../superpowers/plans/2026-10-07-authorization-control-materials-and-account-runtime.md)，`completed-with-unmet-criteria`。** 有限控制、来源材料、恢复和两个账号入口已有离线实现；937pass/1平台skip、双类型通过。同v3历史响应重放请求字节减少7.7%/18.3%，真实token/质量收益未测。生产transport固定在initialize后阻断，24个逻辑真实位置未派发；这不是账号推理失败的证据。Download测试作者接线和OWUI55项语义注解缺项保留。详见[AW summary](../../results/skill-ir/skill-dsl-research/development/authorization-control-materials-v1/summary.json)和[研究§7.56–§7.57](skill-dsl-research.md#756-aw-控制语义局部材料与账号运行开发决定)。

**上一队列：[AV0–AV20 源码辅助解释与授权任务真实闭合](../superpowers/plans/2026-10-06-authorization-source-assisted-closure.md)，`in-progress-paid-deferred-by-user`。** 用户暂缓付费实验；26个初始位置中14个已有29份尝试归档，六变化/六质量共12个尚未派发。v4模块实例定位真实采用：OWUI wire22/22读到两查询方法，仍1单元/9步骤、终答partial；普通Download v4基线22/22接受1单元但无保留依赖footprint，三种变化零compare均0恢复/1失效。四份完整原skill作者稿独立准入并按原字节消费，已有自然报告仍partial；额度拒绝、网关524、防循环无terminal与空end_turn均记未交付。防循环误记正常和空final误计交付两项反例先红绿，focused23项/155断言、联合894 pass/1平台skip/5789断言、主/AV严格类型及独立只读审查通过；零调用重判保留旧状态原件。全量raw重算为397派发/385响应、2只读恢复、1晚结算，修正先前少计2次的汇总；12项usage未知，全部实际USD未知，14份受保护旧证据字节不变。新配置端点`https://yes.hubniconico.com/v1`尚未调用、可用性未核实；逻辑模型仍`xty/gpt-5.6-sol`，后台身份和跨端点效应限制单列。目标执行0，`finiteQueueComplete:false`、`researchGoalAchieved:false`。开发模型`gpt-6.1-sol / max`，Flash未核实。恢复入口见[AV status](../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/status.json)、[当前摘要](../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/summary.json)与[原件分账](../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/accounting.json)。

最新已结束的 [AU0–AU21](../superpowers/plans/2026-10-05-authorization-operation-evidence-and-domain-closure.md) 状态为 `completed-with-unmet-criteria`：`finiteQueueComplete:true`，`researchGoalAchieved:false`。操作事实、结构候选、有限源码值、义务补读、材料恢复、双入口和完整原 skill 作者/消费者接线已有实现；完整质量和净收益未建立。

32 登记首位置中 13 个实跑、19 个零调用封存，共 25 份归档尝试，全部有原件 SHA 绑定的独立 AI 评阅和主 AI 裁定。12 个质量位置中实跑 6 个：Download N 自然终答 full，其余 5 个 partial；另 6 个封存。N 形式检查不适用，实跑 M-O/D-O 均未 checked/bounded。完整原 skill 的 Gitea 原/变 native 各一份，均 partial；原/变作者最终两稿忠实合格，但原字节消费者无终答，变化消费者封存。6 个变化位置均零调用封存，不能算实际复用收益。

Share 第十轮 request16 和 Gitea 原字节消费者 request22 的完成与 usage 仍未知，AU 两任务全部 16/10 种表示保持原封存。AU 没有活动尝试或缺失登记位置，旧未知和旧分母不改。历史入口是 [AU status](../../results/skill-ir/skill-dsl-research/development/authorization-operation-evidence-v1/status.json)、[summary](../../results/skill-ir/skill-dsl-research/development/authorization-operation-evidence-v1/summary.json) 与 [accounting](../../results/skill-ir/skill-dsl-research/development/authorization-operation-evidence-v1/accounting.json)。AV 显式修订未来只读执行的恢复政策：本地执行关闭、晚答隔离及恢复预算测试通过后，可登记新的 development 运行；旧费用/完成未知继续单列，不修改旧 guard 或原件。

操作共享和自动补读确已使用，但 OWUI D 仍停在无关 AuditLogger.write 入口，Download D 的决定性 root/helper 关系未闭合；没有两个不同结构的可信完整链来做预定机制比较，消融 0 调用并保留适用性理由。OWUI N/M-O 在 `5ac2d651`、D-O 在 `d50388db`；Download N/M-O 在 `d50388db`、D-O 在 `c7f201ba`。首答、修订和版本分列，不混作同版本效果；具体设计、失败责任和成本见 [研究 §7.53](skill-dsl-research.md#753-au-操作事实与结构取证原型有限队列已收束)。

最终联合验证 844 pass/1 平台 skip/5472 断言，主/AU 类型通过；[零模型回放](../../results/skill-ir/skill-dsl-research/development/authorization-operation-evidence-v1/verification/au18-final-replay.json)验证 87 个原件文件字节保持。累计 386 派发/384 响应，已知 fresh 10,326,651、cacheRead 1,663,488、完整 prompt 11,990,139、output 349,570；2 项 usage 未知，美元、开发/探子用量和真人时间未知，目标执行 0。有限队列结束与研究达标分别记录。

**AV 的直接依据：** 唯一词法候选把 OWUI 任务中的 write 选为 audit 入口；带行号 pathHint 导致 Download 已有 helper 无法连接；结构 ID 混入预算/绝对目录造成同源码身份变化。[研究 §7.54](skill-dsl-research.md#754-au-收束后复核入口来源连接和身份稳定性)保留零调用复现，77项定向测试/509断言通过。[§7.55](skill-dsl-research.md#755-av-源码辅助解释与局部恢复开发决定)记录新设计、执行次序和已授权的恢复政策变化。

最近的 [AT0–AT19](../superpowers/plans/2026-10-05-authorization-focused-closure-and-delivery.md) 有限队列已以 `completed-with-unmet-criteria` 收束。持久focus、宿主身份、纯有限helper摘要、字段/返回对象、源码终检和双入口已实现。[AT summary](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/summary.json)分别记录工程、实际使用、比较和成本结论；原件和封存保留。

12质量首位置均实跑、源码partial、checked/bounded为0；4完整原skill原/变native和4有效忠实作者稿的原字节消费均已完成。两个original native的自然条件说明充分，formal仍失败；changed native及消费者均partial。政策/前提fresh各一次，两previous因无full checked/bounded基础实际阻断、0调用。相同源码副本/输入的两次fresh均partial，第二次终答正确说明移除exact-document guard，第一次仍unknown。Go注释误定位具名消费者修订消除了假入口，但仍partial。37原件关闭、556派发/556响应，无活动或未知完成；[accounting](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/accounting.json)记录完整prompt 9,400,874、output 403,256，美元/真人/开发未知、目标执行0。718项共享回归及40项provider/研究检查通过（集合有重叠，不相加），双类型通过；[37原件零调用重放](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/verification/at17-final-replay.json)通过且原字节未改。搜索读取8,379,114→2,039,548字节仅证明机械减负；质量/净收益未建立，底层未闭合而未追加消融。

最近完成的 [AS0–AS19](../superpowers/plans/2026-10-04-authorization-semantic-lowering-and-delivery.md) 以 `completed-with-unmet-criteria` 收束，完整源码质量与净收益未建立。[AS汇总](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/summary.json)和 [AS status](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/status.json)继续保存其原结果。`semantic-flow-v1` 已接入 inquiry/native，旧默认与 `guided-evidence-v2` 保留。

AS 固定 15 质量、4 native、8 变化、2 源码变化位置，作者4稿与原字节消费另列。12个可运行质量首轮均保留并评阅，源码语义完整为0；两份完整原 skill 的4个原/变 native位置均实际消费，最后1/4形式checked/bounded、0/4完整源码质量。4份作者稿格式有效并按原字节消费，下游仍部分失败。Memos remove三臂和五个依赖位置保持封存（8/29）；Paperless五个变化位置因无合格原基线零调用阻塞。Notes/Memos share封存不动。身份见 [manifest](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/manifest.json)、[继承封存](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/inherited-seals.json)及[依赖准入](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/verification/dependent-admissions.json)。

局部修复实际消除了协议、参数身份、坏稿恢复及候选定位的具体障碍，但已读helper未进入解释、current-offer/handle错误、源码条件遗漏和效果断言过强仍阻止完整交付。AS验证744 pass/1 skip/4867断言，另2项provider合同/8断言，共746项通过；主/AS类型和离线重放通过。39份已关闭原件共300派发/298响应，AS无活动实验；已知完整prompt 7,707,021、output 296,467，另有2次usage缺报，美元/真人/开发成本未知。本次接续复核重跑78项相关测试、405断言通过，未新增模型调用。

## AR 停止快照与继承事项

- 最后工程提交 `cc88bfb2`；已观察调用下界 507。AR 机器状态仍保存退出前的 `in-progress` 快照，不代表进程继续运行。八个主首行已留档并评阅，16 行分母及修订分别保留；六个未运行位置可按新计划承接，两个 Notes 位置及其它未知请求继续封存。
- 两份原 skill 生成的授权配置已经格式有效；随后独立 inquiry 消费中，Memos 最后请求未知，Download 已知修订仍有图和语义缺口。原 skill 的 native 完整授权链仍待验收。
- 新非 API 程序已从原 skill 生成，经保留候选的 host-recovery 导出 draft；同包原/变任务实际执行并交付。中性前提变化 previous 已 checked/bounded，8 次请求、零新源码工具动作；真实授权变化复用与净收益仍待检验。
- 复核发现互斥 admin/non-admin 路径被当作共同前驱，以及已接受角色拒绝事实在终答重新写成 unknown。AS 将模型的语义选择与宿主的身份、路径展开和结果关联分开，先以真实反例检验共享修复。

| 恢复所需信息 | 权威入口 |
|---|---|
| 最新执行及未达责任 | [AX任务书](../superpowers/plans/2026-10-07-authorization-property-analysis-and-account-execution.md)；AW结果保留，AV十二旧位置继续暂停；历史原件不重写 |
| AR 停止前状态 | [status.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/status.json)、[handoff.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/handoff.json) |
| 普通使用的失败与裁定 | [ordinary-adjudication.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/ordinary-adjudication.json) |
| 真实派发、响应与未知费用 | [ordinary-accounting.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/ordinary-accounting.json) |
| 语义评价及未运行分母 | [evaluation-summary.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/evaluation-summary.json) |
| 根因与方法 | [AT结果 §7.49](skill-dsl-research.md#749-as-复核与-at-源码解释闭合计划)、[AT复核 §7.50](skill-dsl-research.md#750-at-复核任务拆分与领域表达的衔接)、[接入点与源码参考 §7.51](skill-dsl-research.md#751-系统修改的接入点源码参考与可检验贡献)；AS原设计与结果见[§7.48](skill-dsl-research.md#748-as-局部语义展开与真实交付) |

## 已有能力与待解决问题

2026-10-07收束后复核见[研究§7.57](skill-dsl-research.md#757-aw-收束后复核运行能力与按问题求值)：当时生产账号固定阻断；AX已用真实受控会话修复该入口，完整任务效果仍待测。16/64连续显式context异常的局部合流已通过正反测试，公共v4已接入并通过合同测试，完整任务效果仍待验。不能关掉异常、扩大路径上限或减少原问题。

| 路线 | 已有实现 | 当前使用边界 |
|---|---|---|
| 授权任务 DSL | 领域声明、authoring/prepare/edit/run/compare、只读源码工具、局部图、三值求值及引用/结论检查 | 有界 development 能力；决定性依赖、条件提取、协议服从及完整交付仍需完善，新增策略显式启用 |
| Trace 驱动 skill 包优化 | bare-agent 自动捕获、模型修改说明和脚本、局部验证修复、原子导出、自然消费 | 已有真实生成与消费记录；收益 mixed/negative，按各包证据判断 |
| 确定性基础 | IR parser/validator、lowering、API Tester/Env 后端、artifact 和 recipe import | 保留原支持合同及有界案例 |

AQ 旧/新策略 full均为2/20，原 skill checked交付为0/4；具体分母见[研究 §7.35](skill-dsl-research.md#735-aq-授权领域执行设计)。AT完整质量仍未建立；每个作者问题展开六类源码工作，GitHub消费者修订中7个已存unit仅1个落在CreateIssue，其余6个在无关repo创建函数。AU据此修任务/事实边界、结构相关性、领域摘要与义务调度，并将材料级复用和完整任务复用分别验收。费用和人力缺测、readiness、历史 `0/6`、Q1 与保护输入保持原有状态。

## 开发与维护入口

- 普通命令和模型配置：[使用说明](../usage.md)。代码定位和检查：[开发指南](developer-guide.md)。
- 当前队列：[当前计划](skill-ir-aot-optimization-plan.md)；新合同：[spec AX](skill-ir-aot-optimization-spec.md#1437-ax-property-directed-analysis-and-controlled-account-execution)，历史兼容见AW/AU章节。
- 分类、方法、复盘：[唯一研究正文](skill-dsl-research.md)；旧结果：[证据索引](evidence-index.md)、[历史](history.md)、[实验目录](../../results/skill-ir/experiment-catalog.json)。

[治理](../superpowers/plans/2026-10-04-workspace-and-document-governance.md)已完成材料收存、旧日志压缩、正文归并和停止后的入口校正。当前阅读集15份、版本化材料14份，本轮未新增长期阅读文档；研究继续统一在一个正文中。原件及恢复索引在`project-maintenance/20261004-governance/`，AR/AS结果及`.skvm`保留。AS、AT、AU、AW适用有限队列已结束，AV第三方队列暂停。AX接管后独占本轮代码与共享方法文档写入；发布与Git状态以实际检查为准。

更新本页时替换过时段落，不把逐次测试与派发日志不断追加为新的“当前状态”。
