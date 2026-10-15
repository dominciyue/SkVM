# BO0–BO17：源码调用保真、自动程序修稿与按需消费

> 执行者：使用 executing-plans、systematic-debugging 和 test-driven-development。用户已授权本轮接续；读完上下文后直接实施有限队列，不在常规检查点等待确认。

**状态：** completed-with-unmet-criteria。BO0–BO17有限队列收束，工程/普通使用成立，自动完整语义/自然全题/净收益未达。八attempt含一个具名修复确认、15观察turn、全交付且关闭；两对总token比1.045/2.269。S0维护54步、三局部反转符合副本源码，不替换A0。2026-10-16从89ef2864接管；本轮后停止，不自动创建下一轮。

**目标：** 让模型写出的同一份程序忠实表达源码中的调用激活、正常完成前提、授权短路及拒绝后的停止，并让普通消费者看清程序算出了什么、还依赖什么。先补可复用的作者反馈和执行语义检查，再做有限真实编写与消费，检验收益。

**架构：** 复用现有 resource workflow、`when`、guard、external、patch/trial、directed 用途和 SkVM 入口。源码意义由作者模型判断；宿主检查声明与程序的依赖/轨迹是否一致。基于已发送数据修复消费重复，不新增通用 IR、解释器或第二套上下文系统。

**技术栈：** TypeScript/Bun、Zod、既有只读源码工具、官方账号 adapter、确定性有限事实执行及独立源码评价。

- 仓库：`D:\skill优化\SkVM`；分支 `skill-ir-aot`；仅推用户 `origin`，不创建分支/worktree。
- 已复核基线：`21100431f6a427ffe46f7d07f822f231aafe567e`，与 origin 一致；tracked 干净，既有 `.tmp/` 保留。
- 新结果 identity：`authorization-call-semantics-v1`，仅写 `results/skill-ir/skill-dsl-research/development/authorization-call-semantics-v1/`。
- 开发模型 `gpt-6-astra/high`；实验官方账号 `gpt-5.6-sol/high`。第三方付费 API 暂停，旧 unknown 不重发。
- 约 8–12 小时是实质工作参考；完成即收束，不等待、不反复验证凑时长。

## 一、BN 复核决定与本轮要改变的东西

BN 工程与八个用途已完成，14 个观察 turn 均关闭，无活动或未知请求。A0 从既有 14 步改成 21 步，返回字段经独立映射为 17/18，严格事件轨迹仅 4/18，额外轨迹 2/8。A1 从空稿生成 17 步，字段 1/18、值单列 14/18、严格 0/18；它加入有源码依据的上游全局权限条件，超出旧局部 oracle。保留范围差异，不能删掉正确条件或补成 grant 来提高分数。

两对普通消费者分别有两题、三题优于基线，整题均未 full。总 observed token 为基线 1.409/1.731 倍；第一对 fresh input 和 output 下降，第二对均上升。第一对时间更短含恢复网络重试与 final-child 差异，不解释为隔离性能收益。已知 input 14,674,048（cache-read 13,155,328 已包含一次）、output 105,898，USD/开发评阅/真人成本未知。A0 固定原稿与 S0 维护稿各自保留。

复核读到了以下具体实现，因此 BO 不重复 BN 的方案：

1. `resource-relations.ts` 已能用 `when` 跳过调用。A0 却先无条件调用 `object_grant`，后面的 `choose` 只选择值，不能撤回已经发生的查询。问题在源码到程序的激活关系和作者反馈，不是缺一个通用短路解释器。
2. A0 调用了 `permission_checker_construct`，但结果既未控制后续执行，也未形成必要条件。`program-authoring-context.ts` 的 `executionBlockers` 主要追踪已有 `event.gaps`；已知但未使用的完成标记不形成缺口。单纯再提醒“继续修稿”不足以定位这类差异。
3. `program-obligations.ts` 已有 call-completion 候选和 mapped-unreviewed 状态，但引用精确或覆盖声明存在，尚未检查调用的激活、完成与后继使用关系。语法候选本身不能证明授权含义。
4. `inquiry-context.ts` 已有跨包精确引用和 sourceIndexDelta，BN 八用途实际发送包可重建。不能再次假设“每轮都重发全部目录”。`program-consumption-context.ts` 的 details 默认仍可能同时返回 program/execution/currentDraft 与 steps/events；应从实际发送包确定重复量再改。
5. 原四问的 Q4 经常缺少外部调用未知如何影响后续结果；这是自然答案完整性责任，不能把“返回值接近”“已有泛泛 coverage gap”当作补齐。

复核新鲜执行了 resource-relations、authoring-context、consumption-context、delivery、inquiry-context 及 BN study 六文件测试：49 pass、287 assertions、0 fail。未重跑历史全量审计。BN 原件和评分类别保持。

## 二、必读上下文与职责边界

按顺序阅读：

1. 父目录与仓库 `AGENTS.md`，`docs/skill-ir/current-status.md`，本任务书全文。
2. [当前执行计划](../../skill-ir/skill-ir-aot-optimization-plan.md)、[spec §14.54](../../skill-ir/skill-ir-aot-optimization-spec.md#1454-bo-source-call-semantics-and-program-repair)、[研究 §7.76](../../skill-ir/skill-dsl-research.md#776-bn-复核与-bo-源码调用语义修稿决定)。历史按需追到 BN §14.53/§7.75。
3. BN `execution.md`、`verification/acceptance-matrix.json`、`evaluation/program-summary.json`、`evaluation/quality.json`、`verification/actual-wire.json`、A0/A1 原稿，以及 [普通运行说明](../../../examples/authorization-assessment/download-workflow/README.md)。按需读原始 account-turn，不通读所有旧轮材料。
4. `src/task-dsl/authorization/{resource-relations,resource-program-draft,program-obligations,program-authoring-context,program-trial,program-consumption-context,program-delivery}.ts`；`src/benchmarks/authorization-dsl/{inquiry-native,inquiry-context}.ts`；`src/adapters/codex-account.ts` 的实际发送与终态接线。
5. BN input 绑定的 Paperless 源码，重点 `views.py` 的请求/root/版本链、`permissions.py` 的 owner-aware helper，以及实际相关 versioning/DRF 源码。路径由 input.sourceRoot 解析，不能改为最新上游版本。

开发线程独占生产代码、研究驱动及共享文档写入；父复核线程派发后只写自己的自动化记录。探子只做窄范围只读核验，遵守 AGENTS 的等待与上下文规则。原 skill、四问、允许源码、输入事实和前提完整保留；不读新 held-out/Q1 reserve，不启动 prospective，不修改 readiness 或历史冻结证据。模型实验输入不得包含本任务书的案例答案、独立 evaluator、开发者参考程序、旧评阅结论或修复后的完整目标程序。

## 三、实现合同

### 3.1 调用有三个不同问题

- **激活：** 当前分支是否应该执行这个调用；映射到已有 `when` 或包含它的控制依赖。
- **完成：** 只有正常返回才可继续，还是异常被源码显式处理；不能用返回值真假代替正常完成。`False`/`None` 也可能是正常返回。
- **取值：** 返回值是否被后续表达式、guard 或 return 使用；“值被忽略”不自动证明“完成可忽略”。

优先在现有 coverage/authoringTarget 与程序反馈中建立可查的关系，复用现有表达式、来源和步骤身份。模型声明源码意义，宿主只核对步骤存在、当前来源、依赖方向、激活/完成关系是否真正连上。未声明、歧义、只引用宽区间均保留 unreviewed，不推断为授权成功。不要要求每一个已读调用填表；只针对当前程序实际采用或作者声明相关的调用，按需取详情。

如果已有 `when`、guard 和显式有限完成事实能表达反例，就不加执行语法。只有匿名反例证明返回值与完成状态无法区分时，才为 `external` 增加一个可选、向后兼容的完成表示，先在本节记录设计。不得把所有 external 默认改成授权 guard；不得按 `ObjectPermissionChecker`、Paperless 或 skill 名称决定行为。现有 constructor 的 `value:true` 是有限完成抽象，不能推广成所有调用“truthy 才成功”。

### 3.2 诊断服务修稿，不提供答案

反馈提供当前源码位置、模型自己的映射、实际执行事件、未被消费的结果、真实依赖路径及可选择的修稿动作。可说明“此调用完成声明没有后继依赖”“此步骤在两个 trial 中都执行”；不能从 evaluator 提供正确 owner 条件、root 对象或参考 patch。源码语义审查可由作者模型完成并引用原行，独立评阅仍负责判定是否忠实。

一次 patch/trial 后立即返回该 revision 的差异与剩余责任，已解决项移出当前前沿。没有实际进展的重复提交不续额度。每个结构告警要允许具名解释“返回值有意忽略、完成仍需约束”或“源码捕获异常”，避免机械告警逼出错误 guard。

### 3.3 分层评价与消费

沿用历史 18 输入和 8 个额外轨迹，旧分数保持；BO 新评价分别记录字段值、局部调用顺序/参数/短路/控制条件、上游未决前提与完整四问。新增上游条件不应被误判成局部值错，也不能掩盖真实多执行调用或漏控制前提。评价器的 scope 分层先用匿名正反例验证，再评价自动稿，禁止看到新结果后选有利分母。

消费者默认只需当前结果、必要条件、覆盖边界和按需原文。复用现有 exact references 与 delta；对 default details 的同包重复、无关作者草稿、重复问题文字做有证据的缩减。任何变更必须能从实际已发送材料恢复必要程序和轨迹；新子会话自包含。避免只量归档字节，避免把字节比例说成 token 收益。

## 四、执行队列 BO0–BO17

### BO0 — 接管与一次性登记

核对当前 HEAD/origin、线程状态和 BN 八用途终态；创建新 identity 的最小 status/accounting/计划位置。BO新runner按五正常位置和两个条件位置定义分母，不照抄BN八位置数组；BN的C2在BO不设真实调用，denied由BO12普通零模型验证覆盖。旧未知按历史记录隔离，不重查全部历史。状态使用工程、采用、有限语义、自然质量、收益五轴；planned acceptance 与 achieved result 分字段。登记 `.tmp/` 等既有内容，不清理。

### BO1 — 建立可复查的源码到程序差异

只读分析 BN A0/A1 的三个具体遗漏及其原源码；在新 `diagnosis.json` 中记录 source span、raw step、实际 event、当前诊断是否可见。对 A1 全局权限另标范围差异。记录源码已读、判断已写、程序采用、执行影响四层，避免又把来源没读与语义没接线混成一个失败。

### BO2 — 先写匿名失败测试

责任文件为 resource-relations、program-obligations、program-authoring-context 及各自 `.test.ts`。至少覆盖：

- 无条件调用后再 choose，值相同但事件不忠实；正确 `when` 可跳过。
- 先构造再 owner/无 owner 短路；构造完成未知不能因 owner 为真就消失；匿名外层分支可跳过整段。
- 返回 False/None 的正常调用，不因假值被误判成构造失败；不明确完成时保持具名未知。
- 忽略返回值但必须等待完成；有源码捕获异常的不同情况。
- 不同 user/resource/permission 参数、明确拒绝、非法输入后不再产生查询或文件返回。
- 合法上游未知与局部计算分列，不删除条件，也不把额外范围当作局部错误。

新增测试必须先针对缺失诊断/契约失败，再最小实现。现有 executor 已支持的行为直接用作保留测试，不制造伪红测。

### BO3 — 共享调用关系与反馈实现

复用 program-obligations 的当前来源身份与 authoringTarget；只增加必要的关系/诊断，不建平行覆盖账本。将实际语法候选、作者关系、程序依赖、执行事件连接起来，宽引用与语义未审查分别保留。优先改反馈而不改 resource-relations；确需完成语义字段时按 §3.1 先更新设计并添加兼容测试。禁止补通用 Python 语法。

### BO4 — 接入真实作者工具循环

责任为 program-authoring-context、program-trial、resource-program-draft、inquiry-native 与窄范围 adapter 接线。patch/trial/details 返回当前修稿前沿，能够解释“调用已发生但结果被后面的分支忽略”。保留局部正确稿、revision 和当前输入；不让 raw 草稿与已采用稿混用。用 fake-account 走 source→proposal→诊断→patch→trial→最终交付，不能只测直接调用反馈函数。

### BO5 — 固定评价的范围与独立性

在新结果目录实现研究 evaluator，复用 BN 原始 18/8 输入和实际轨迹，保留原评价器与分数不写回。正反例证实：多做权限查询不能凭字段匹配通过；缺正常完成前提不能凭泛泛 gap 通过；合法全局未知不会被偷偷填真；部分有效结果仍能展示。按来源约束明确本轮 finite execution 只覆盖哪些局部步骤，完整四问继续独立审查。

### BO6 — 现有材料离线接线与定位

对 BN 原稿产生 BO 当前诊断，旧稿不改；在开发者匿名稿上证明正确 `when` 和完成关系确实执行。对既有 ShareLink 材料只做接口/失效离线兼容，不另起真实研究面板。普通入口要能逐步显示执行、跳过、条件和拒绝。开发者稿不参与自动作者或消费成功计数。

### BO7 — 从实际发送包定位消费负担

只读 BN B0/C0/C1/B1 的 client 事件和工具调用；统计首次包、重复包、details 全量/定向、来源目录、程序/轨迹、final child 及现有引用命中。列出实际重复路径和可消除字节，不假设所有数组都重发。现有 transmission 的粗字节分类与 provider usage 分开。已被 exact reference 解决的部分不再改。

### BO8 — 实现一个有证据的消费简化

责任为 program-consumption-context、inquiry-context 和必要的 codex-account；优先让 details 的默认视图不重复附带 raw program/currentDraft/steps/events，保留显式原文取回与当前 basis。若 BO7 没发现实质重复，登记无需改动，转向减少重复探索的问答材料组织，不堆新摘要字段。通过真实编码/解码、缺引用、stale、无历史 child 的失败测试。full 默认及 strict 原入口保持兼容。

### BO9 — 发布首个工程 epoch

运行受影响模块、普通 source→program→run/inspect 接线、主/研究类型检查。提交实现，登记源码 epoch 后才开始新真实作者。只对本轮改动文档跑链接检查，不重跑全部历史审计。旧全 src 104 失败和既存缺档原状保留。

### BO10 — A0：从 BN 固定原稿做自动修稿

在新会话把 BN A0 原字节作为已知有缺口的待修稿；模型获得原 skill、原四问、允许源码、输入与本轮通用反馈。不得提供诊断文档中的正确语义、参考 patch 或 evaluator expected。记录首稿、每次 patch/trial 和最终自动原字节；实际检查 source-reading→关系判断→采用→事件变化链。A0 结束后先评价 18/8、四问及费用，再决定是否有具名共享修复。不能用自然答修改固定程序。

### BO11 — A1：从空稿独立编写

同一实现、任务和输入，从空稿独立生成；不见 A0/旧评阅或开发者程序。既有完整源码与公共说明一致。A0 是修稿、A1 是从零两个轨道；A1 不替换 A0。若新共享缺陷已被 A0 揭示，先修再执行 A1并标 epoch；不让已知坏协议继续花费。

### BO12 — 固定 A0 与普通使用

固定 A0 最终自动原件再消费。即使 incomplete，也可作为明确需审阅的分析辅助；缺稿则记 not-run，不用 A1 或历史成功稿补位。沿用 Download `run.ps1`，显式 `-ProgramFile` 运行 default、empty-version、denied、invalid-version、no-external；新增 owner/null-owner/匿名输入仅零模型。fresh/previous 与搬移结果一致，源码变化撤回旧结果。返回 descriptor 不执行业务下载。更新现有 README，不新建 CLI。

### BO13 — B0/C0：第一对真实普通消费

串行同 epoch、模型、源码、完整 skill/四问、输入事实、时间/工具/显示预算，先 B0 后 C0。B 为原 skill 加同只读源码工具；C 加固定 A0 及 BO 消费线路，禁止编辑稿。预加工与作者成本单列并计入摊销分析，结论仅是整个程序辅助流程比较。观察真实工具、程序实际重算、引用、四问完整性和全部 usage；不把 evaluator 或旧正确答案放进任何臂。

### BO14 — 按首对证据决定是否确认

只在第一对有具体质量改善或成本下降且没有未修共享缺陷时，执行空版本反序 C1/B1；否则记录停止这一路重复采样，转 BO15/BO16。最多两对，不抽到成功。出现共享缺陷时当场修复、测试并冻结新 epoch，额外修复确认另列；跨 epoch 不能拼成同条件配对。结论允许 quality/cost tradeoff、negative、inconclusive。两对均保留四问质量且总 observed input+output 下降，才可描述“两对有界正向观察”；不能据此证明所有 skill 泛化或真实 USD 节省。

### BO15 — S0：同包源码变化维护

仅在 A0 有实际程序时，使用既有允许副本的一项真实源码变化，模型重新读取变化源码并修自己的稿。沿用 BN 维护范围，不提供目标程序；旧返回先失效。保存原稿、改稿与三个原事实输入重放，区分局部变更正确与全请求未决。若 A0 缺稿，完成失效工程验证，S0 记 not-run，不手写成功稿。修稿/消费的失败均计入总账。

### BO16 — 联合验证、研究复盘与交付

受影响联合测试和主/研究类型各一遍，失败有据修复后只扩到相关范围。保存 18/8 分轴、完整四问评阅、实际发送比较、生命周期与成本、ordinary execution.md。先逐题检查答案全文再判 full；错误结论、重要遗漏、范围差异和未交付分字段，不削减旧 full 标准。更新 current-status、spec §14.54、plan、研究 §7.76/开头/§11 当前问题表、usage/示例；长历史正文不反复整体改写。研究问题表必须与最新结果一致，不能继续写 BM 为当前。

### BO17 — 发布并停止有限队列

仅提交本轮归属实现、测试、紧凑原件和文档，核对 origin 同 SHA；不清理他人内容或旧 `.tmp/`。外部 handoff/communication/conversation_log 追加简短真实状态。五轴逐一写 achieved/unmet，不把有限队列关闭当目标达成。给出可运行命令、实际返回/条件、源码执行轨迹和下一个具体缺口。本轮终结，不自动创建 BP 或增加第三对。

## 五、实验、当场修复与终止规则

**BO13–BO14首对决定。** B0/C0同e8522ee9及同sourceTree/skill/source/account/预算绑定，串行运行。B0四问P/P/P/F，C0为P/F/F/P；正常完成前提责任按Q4评价，Q2源内顺序完整不重复扣分。C0总observed input+output为620862，B0为594130，比1.04499；fresh比0.60423、output比0.65298。时间比0.57527含B0无工具child与两臂恢复差异，不当作隔离速度收益。两题具体改善满足已登记确认条件，Q4退步及作者成本保留；执行反序空版本C1/B1，不加第三对，不声称净收益。

**BO10具名确认与BO12固定。** A0/advertised-call-contract正常关闭并交付，8次patch、5批trial、45步，原件SHA256为3298dd5172216b632d0230036d79fe7e2359335dd829a70346730bdde07ff609。模型自己采用when、两个正常完成guard和call元数据；18字段/局部轨迹全通过，额外7/8，唯一剩余匿名外层helper激活失败。四问P/F/F/F，精确版本排序未查清。input4905175含cache4576000、output36805；耗时1314346ms含通道恢复和四观察turn，不作为隔离性能效果。首件原件、成本、旧分数保留；额外预算和自己的前稿使公共说明净效应不可单独归因。A1不见这些评阅和原稿。

**BO10现场修复。** A0-first增加到33步却仍断言DSL无法条件化external；实际thread/start说明与宽松步骤schema均未公开when。先对实际账号工具说明做红测，再给program/patch共同补已有when、正常完成与真假区别、关系元数据说明；details说明同步overview/raw。无executor变更，不供应源内正确条件。原稿17/18字段、4/18局部轨迹和2/8额外轨迹保留，四问P/P/F/P。注册A0/advertised-call-contract唯一确认，用新工具表会话恢复自己的原稿，不重导入BN原稿。首次完成答案current，续作是host预算中断且已知终态/本地关闭；选择器允许这种有效交付，仍拒绝unknown/stale/active。后续生产epoch分列。

**BO0–BO8实施记录（2026-10-16）。** 复用现有有限求值：已知 False/None 的自等测试可表示正常完成，未知仍保留条件，因此没有增加执行语法。可选 `coverage[].call` 声明 activation/completion/resultUse、完成 guard 和后继；宿主报告实际依赖、事件与 trial 差异，源码意义始终 unreviewed。native/account 的 source→proposal→patch→trial→details→answer 假账号链已红绿验证。独立核验发现 trialCase 详情漏带调用诊断，已先红测再修复。BN 实际包证明 C0/C1 已有45/42次目录delta、245/234次引用；一个全量details是可削减对象，既有编码器整流反事实各减少29145/29137字节，不是实测token收益。显式 directed 的未指定步骤active details改用已有紧凑事件投影，`format:raw`仍按当前basis取回；full默认保持。18/8范围评价先以匿名正反例固定，再读BN原稿；上游来源定位与语义证明分开。ShareLink离线兼容完成，零模型。

- 正常位置 A0、A1、B0、C0、S0 五个；按 BO14 条件再有 C1/B1，最多七个。最多另开两个具名共享修复确认用途；不足不补，全部位置、阶段和原件分列。
- 沿用 BN 驱动实际每用途总上限：64 工具单位、2,700,000ms、786,432 显示字节、33,554,432 读取字节；新 manifest 写入相同数值，不以 adapter 默认值代替。每作者最多两次已知终态续作、一次受控无工具 final，共享原预算。模型调用次数与宿主工具单位分别统计。
- 发现表现不好立即定位是源码理解、程序关系、输入事实、传输还是评阅问题；先保留失败。共享 bug 用红测修复后继续，模型含义错误用当前源码/自己的反馈修稿，不能由开发者代填。正常完整未知、外部事实缺失不伪装成宿主故障，不为了得分补 grant。
- 同因两次修复没有新增可用证据，停止该真实位置，完成独立工程与归纳。修复确认额度不因另换名字重置；无需把已知错误的整个面板跑完。
- BN 无活动请求；旧 BJ/OWUI 等 unknown 只隔离，不重发。新 unknown 先只读核查，原终态/费用保留；本地进程关闭且用途隔离后，独立位置可继续。额度/认证拒绝暂停该通道；重复路由故障按一次有据恢复上限停止通道，继续离线工作，不切第三方。
- input 包含 cache-read 一次；另列 fresh input、cache-read、output、耗时、工具、恢复/final turns、作者与维护成本。未报告 USD 就 unknown；无实测真人分钟不称人力节省。字节缩减不换算成 token 收益，网络恢复干扰单列。

**BO15–BO17收束。** S0独立维护增加9步并按副本views.py:1421移除not的实际含义反转授权guard；默认/空版本在文件选择前停止，原denied输入返回11/archive，三次零模型有限重算成立。匿名外层激活仍缺，DRF新增literal不构成上游控制。自然四问F/P/F/P，构造顺序与正常完成说明仍不足。S0不替换固定A0。全部八attempt、15观察turn交付关闭，0活动/未知；14/32逐题full、0/8整题full。known input17911460（含cache16421248）/output133089；USD/开发评阅/真人成本未知。最终180测试/1285断言、主/研究类型、15文档测试通过；study与文档链接检查随发布记录。五轴见[验收矩阵](../../../results/skill-ir/skill-dsl-research/development/authorization-call-semantics-v1/verification/acceptance-matrix.json)。完成适用BO0–17工作不等于研究目标达成；停止，不追加BP。

## 六、完成判据和定向命令

| 轴 | 要回答的问题 | 完成依据 |
|---|---|---|
| 工程 | 激活、完成、取值差异能否被通用工具识别并供修稿？ | 匿名正反例、真实工具链、旧模式兼容 |
| 自动程序 | 模型是否自己把关系写入原稿且实际改变执行？ | A0/A1 分列原件、patch/trial 和 18/8 分轴；目标为局部有限范围全通过，未达逐项留存 |
| 普通使用 | 同一稿在不同输入/变化源码下是否给可复查过程？ | 真实 CLI、事件轨迹、fresh/previous、失效与维护 |
| 自然质量 | 完整 skill 四问是否都得到有据答案？ | 全文独立源码评阅，程序轨迹不代替自然答案 |
| 效果 | 相同任务质量下开销是否下降，或增加成本换来什么？ | 有限同期配对、完整成本分账与真实采用，允许负结论 |

从仓库根运行定向检查起点，新增实现测试追加到同一集合：

```powershell
bun test ./src/task-dsl/authorization/resource-relations.test.ts ./src/task-dsl/authorization/program-obligations.test.ts ./src/task-dsl/authorization/program-authoring-context.test.ts ./src/task-dsl/authorization/program-trial.test.ts ./src/task-dsl/authorization/program-consumption-context.test.ts ./src/task-dsl/authorization/program-delivery.test.ts ./src/benchmarks/authorization-dsl/inquiry-context.test.ts
bun run typecheck
python -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py
```

本轮研究目录提供 `study.ts status/offline/verify/summarize` 等已有风格恢复入口及自己的 tsconfig；真实 run 必须选择具名用途，status/verify 不得隐式发模型请求。不要修改 BN runner 或再次执行 BN verify-wire 写回旧证据。研究过程和被否决的方案统一追加研究总文档；用户读当前状态与普通示例即可理解结果。
