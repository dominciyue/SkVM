# Skill IR 当前状态

更新于2026-10-08。工作分支为`skill-ir-aot`，仅发布到用户origin。AX离线交付`191a37e0`及复核`b8918e4d`已发布；用户已授权AY接续开发和账号实验。本页是唯一实时状态入口，历史任务书和原始结果保留当时记录。

## 当前工作

研究主线是 **按 skill/task 范围设计领域表达**。当前任务类为单 repo/ref、源码可见的授权与信任边界评估：围绕主体、资源、操作、条件和政策组织取证、判断与检查。质量约六成、编写复用约四成指开发投入安排，各项质量要求分别验收。

**当前队列：[AY0–AY23 授权问题依赖、完整使用与收益验证](../superpowers/plans/2026-10-07-authorization-question-dependencies-and-usable-dsl.md)，`in-progress`。** AY登记22个首位置并承接AX11个未运行位置；账号已知终态修复和v5初版依赖/双入口已接通。Download具名尝试与OWUI首/修订均交付自然答，独立源码partial、结构终答缺失；原件和评价保留。OWUI修订接受6来源单元/实际3材料投影。逐题分母、框架边界、schema拒绝check计数、空块/字段进展、receiver值绑定、终答枚举、按receiver的框架footprint及静态FastAPI Depends组合已红绿修复。原注释当前零模型回放识别真实middleware，route/auth/session仍为read未采用，完整ASGI/DRF与对象链待闭合；字段主体误判/未解释callee/展开上限及原答保留。总token增加与fresh下降分列，净收益未建立。ASGI注册/方法已进入来源队列，OWUI回放11注册/11方法、仍3普通采用；外部来源/continuation待闭合。DRF action声明/router/as_view来源已进入当前v11队列，原wheel追加源码回放保留GET→download声明与22项来源工作；identity订阅找回继承dispatch，应用类wrapper及映射/请求采用仍未证明。通用纯转发参数包与super实际self已接通，原lock追加schema装饰器源码；12来源/78调用探针保留dispatch alias/闭包handler缺口、采用0。普通class decorator候选已进入read/interpret/link及精确receiver依赖，真实两class保留1/2声明与14/20工作、变换采用0；receiver/MRO、闭包及实例字段仍具名。局部直接callable与稳定外层参数已沿同一binder/六角色/投影接通；真实49局部定义仍全有具名边界，5个选中factory闭包未采用。联合1111pass/1平台skip、主/AY类型通过。新开发线程使用`gpt-6.1-sol/max`，官方账号实验`gpt-5.6-sol/high`，用户已明确授权；第三方API及AV十二旧位置继续暂停。22首位置覆盖两完整原skill、两作者包消费、三变化fresh/previous和两任务三臂两次对照；正向效果以预登记质量/减负判据实测，首件与修订分列。方法合同见[spec AY](skill-ir-aot-optimization-spec.md#1438-ay-question-dependencies-and-usable-domain-execution)，决定见[研究§7.60](skill-dsl-research.md#760-ay-问题依赖完整使用与收益验证)，现场状态见[AY status](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/status.json)。

**AX承接快照：** [AX0–AX20](../superpowers/plans/2026-10-07-authorization-property-analysis-and-account-execution.md)原状态`in-progress-account-channel-blocked`保留。20首位置中9已尝试、17归档、活动0；11待运行映射到AY新版本位置，旧分母不重写。生产树`6042b79e`的`explicit-source-revisit`保存`usageLimitExceeded`及明确failed事件，旧adapter记`completion-unknown`。AY先分开终态/交付/用量并追加只读裁定，确认旧执行结束后登记新尝试；原始unknown和缺报用量保持，未知活动请求不自动重发，不切换账号/模型/端点或购买额度。指定通道是否恢复以实际运行判断。

AX工程已接通性质需求/八锚点frontier、保守局部异常合流、分层覆盖、来源材料和inquiry/native共同核心。A→B→A材料重新接纳及检查后显式回访均已红绿修复，最后生产修复`9039fd3f`已发布，原失败不升级。Download和OWUI完整原skill均真实尝试并交付自然答，formal均未满足；10份已交付领域答已独立评阅和主裁定，只有旧premise fresh自然条件说明full，formal仍失败。当前N/M-S/D-S六位置尚未运行、质量和真实复用收益未建立。

两份common-only模型作者稿已按原字节准入，完整交付包现含418文件、原/变Download各95文件、OWUI允许范围173文件和两份完整skill的22/8文件；ZIP逐entry字节核验与仓库外11公开零推理命令通过，实际消费者0。两份合格afc冻结模型提案仅用于当前未变纯核心的机制比较：两个源码单元的必需标注分别3→4、7→7、离线载荷增加；实际投影各1项精确绑定，合流开/关均14规则/3终态、失败来源合并0，没有减负或真实token收益证据。历史184/58回调严格重放封存，当前版本严格成功0；四份smoke/作者capture另核验，隐藏请求与原生后台活动不声称穷尽。

17份可见父会话input/output/cacheRead为34358571/152441/31914752，非缓存input2443819；301上下文直接核验，OWUI28上下文/2源码窗口精确脱敏重建单列。内部请求、隐藏重试/额外子会话、开发/探子、USD及真人时间unknown。研究脚本23测试104断言及含打包脚本的严格类型通过；有限队列与研究目标均false。恢复与六项结果见[AX summary](../../results/skill-ir/skill-dsl-research/development/authorization-property-execution-v1/summary.json)、[AX status](../../results/skill-ir/skill-dsl-research/development/authorization-property-execution-v1/status.json)；交付核验见[portable package](../../results/skill-ir/skill-dsl-research/development/authorization-property-execution-v1/verification/portable-package.json)。合同见[spec AX](skill-ir-aot-optimization-spec.md#1437-ax-property-directed-analysis-and-controlled-account-execution)，决定见[研究§7.58](skill-dsl-research.md#758-ax-按授权问题求值与账号真实执行开发决定)。

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
| 最新执行及未达责任 | [AY任务书](../superpowers/plans/2026-10-07-authorization-question-dependencies-and-usable-dsl.md)承接AX；AW结果保留，AV十二旧位置继续暂停；历史原件不重写 |
| AR 停止前状态 | [status.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/status.json)、[handoff.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/handoff.json) |
| 普通使用的失败与裁定 | [ordinary-adjudication.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/ordinary-adjudication.json) |
| 真实派发、响应与未知费用 | [ordinary-accounting.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/ordinary-accounting.json) |
| 语义评价及未运行分母 | [evaluation-summary.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/evaluation-summary.json) |
| 根因与方法 | [AT结果 §7.49](skill-dsl-research.md#749-as-复核与-at-源码解释闭合计划)、[AT复核 §7.50](skill-dsl-research.md#750-at-复核任务拆分与领域表达的衔接)、[接入点与源码参考 §7.51](skill-dsl-research.md#751-系统修改的接入点源码参考与可检验贡献)；AS原设计与结果见[§7.48](skill-dsl-research.md#748-as-局部语义展开与真实交付) |

## 已有能力与待解决问题

2026-10-07复核见[研究§7.59](skill-dsl-research.md#759-ax-离线交付复核与下一步方法建议)：418文件/ZIP、63项相关测试/360断言、主与AX严格类型及公开check通过，未新增模型调用。账号真实动态工具能力已经存在，通道拒绝与语义失败分开处理。性质需求目前以源码可达性和增量标注为主；已有框架/实参候选尚未形成完整问题链。该建议现已纳入AY计划，等待实施和真实验收。旧评分、16/64合流反例、原题和异常条件均保留。

| 路线 | 已有实现 | 当前使用边界 |
|---|---|---|
| 授权任务 DSL | 领域声明、authoring/prepare/edit/run/compare、只读源码工具、局部图、三值求值及引用/结论检查 | 有界 development 能力；决定性依赖、条件提取、协议服从及完整交付仍需完善，新增策略显式启用 |
| Trace 驱动 skill 包优化 | bare-agent 自动捕获、模型修改说明和脚本、局部验证修复、原子导出、自然消费 | 已有真实生成与消费记录；收益 mixed/negative，按各包证据判断 |
| 确定性基础 | IR parser/validator、lowering、API Tester/Env 后端、artifact 和 recipe import | 保留原支持合同及有界案例 |

AQ 旧/新策略 full均为2/20，原 skill checked交付为0/4；具体分母见[研究 §7.35](skill-dsl-research.md#735-aq-授权领域执行设计)。AT完整质量仍未建立；每个作者问题展开六类源码工作，GitHub消费者修订中7个已存unit仅1个落在CreateIssue，其余6个在无关repo创建函数。AU据此修任务/事实边界、结构相关性、领域摘要与义务调度，并将材料级复用和完整任务复用分别验收。费用和人力缺测、readiness、历史 `0/6`、Q1 与保护输入保持原有状态。

## 开发与维护入口

- 普通命令和模型配置：[使用说明](../usage.md)。代码定位和检查：[开发指南](developer-guide.md)。
- 当前队列：[当前计划](skill-ir-aot-optimization-plan.md)；新合同：[spec AY](skill-ir-aot-optimization-spec.md#1438-ay-question-dependencies-and-usable-domain-execution)，历史兼容见AX/AW/AU章节。
- 分类、方法、复盘：[唯一研究正文](skill-dsl-research.md)；旧结果：[证据索引](evidence-index.md)、[历史](history.md)、[实验目录](../../results/skill-ir/experiment-catalog.json)。

[治理](../superpowers/plans/2026-10-04-workspace-and-document-governance.md)已完成材料收存、旧日志压缩、正文归并和停止后的入口校正。当前阅读集15份、版本化材料14份，本轮未新增长期阅读文档；研究继续统一在一个正文中。原件及恢复索引在`project-maintenance/20261004-governance/`，AR/AS结果及`.skvm`保留。AS、AT、AU、AW适用有限队列已结束，AV第三方队列暂停。AY接管后独占本轮代码与共享方法文档写入；发布与Git状态以实际检查为准。

更新本页时替换过时段落，不把逐次测试与派发日志不断追加为新的“当前状态”。
