# AT0–AT19：源码解释闭合与普通 skill 交付

> **For the executing agent:** use the executing-plans, systematic-debugging, test-driven-development and verification-before-completion workflows. The user has authorized continuous execution, purposeful paid calls and publication to their origin. Routine checkpoints do not require confirmation. Apply the latest AGENTS subagent rules: bounded read-only scouts, default role, fork_turns=none, main-agent implementation and final decisions.

日期：2026-10-05。状态：`in-progress / AT8–AT9`。开发模型：`gpt-6.1-sol / max`。工作目录：`D:/skill优化/SkVM`；分支：`skill-ir-aot`。仅发布用户 `origin`，不建分支或 worktree。

被测模型默认沿用AS的 `xty/gpt-5.6-sol` 与现有配置路由；开发代理模型和被测模型分开。若路由实际不可用，先登记替代模型与原因，再让同一配对块使用相同模型；不能仅为新方法换强模型后归因方法收益。凭据不进入日志或报告。

**目标：让宿主稳定组织“定位 → 解释 → 组合 → 核对 → 回答”，使已读的决定性源码真正进入正确答案，再完成原 skill、作者稿与变化使用。** 复用 AS 的局部语义、路径展开和只读工具，减少模型维护协议和全局状态的负担。领域范围继续是单 repo/ref、源码可见的授权与信任边界评估。

本轮约 60% 开发投入用于质量、40% 用于编写及复用。准备约一夜、可接近 12 小时的主动工作；按产物和问题推进，不等钟、不重复验证凑时长。旧 AS 已结束，不能恢复其 runner 追加首轮或改写评分。AT 是新的 exposed-development 身份。

## 一、接管上下文与已经核实的问题

按次序本人阅读：根/仓库 AGENTS、[current-status](../../skill-ir/current-status.md)、本任务书、[spec §14.34](../../skill-ir/skill-ir-aot-optimization-spec.md#1434-按-skilltask-范围设计领域-dsl)、[研究总文档 §1、§7.48–§7.49](../../skill-ir/skill-dsl-research.md)、[开发指南](../../skill-ir/developer-guide.md)授权组件。AS [summary](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/summary.json)、[status](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/status.json)与原始评阅作为失败入口；不用重读九月全史。

代码基线为 `d05f018ba0d35b075c6decf4bcf3c6317cb46ce7`。启动以实际Git为准，保留其后的任务书发布提交。AR的`cc88bfb2`仅是历史恢复定位。AS进程已经idle；派发后AT取得共享文件及Git唯一写入权。

主线程本次核实：

| 事实 | 实现或原件定位 | 对下一轮的要求 |
|---|---|---|
| 12 个可运行质量首轮全部未达完整源码质量；M-L 有正确的局部结论 | AS summary 的 blocks；primary-source-reviews | 同时区分缺材料、未解释、解释错误与协议失败；保留局部正确信息 |
| 已读 helper 只被置为 awaiting-interpretation；当前 offer 每轮重新选择 | `inquiry-worklist.ts` 的 sync；`inquiry-domain-runtime.ts` 的 modelContext | 宿主固定一个解释事务，直到接受、明确缺口或有理由切换 |
| 模型仍维护 itemId、handle、add/replace、draftId、revision、pathId | `inquiry-semantic.ts` 的 guide/applySemanticBlocks/assembleSemanticResult | 将可确定的路由身份绑定到宿主事务，语义选择留给模型 |
| rejectedBlocks、整队列与旧状态反复进入上下文 | `inquiry-domain-runtime.ts` 的 modelFeedback；`inquiry-native.ts` 的 beforeDispatch | 当前阶段只提供相关合同、窗口和诊断；完整历史留在档案 |
| Gitea 最后 native 形式 checked/bounded，却说 non-writer 的 projects 被忽略 | AS `runs/native-github-security-review-gitea-create-issue-original/attempt-2/report.json`；handler 原行624仍传 form.Projects，service 原行53–57处理 projectIDs | 关键参数传递、效果和最终解释要有可定位的逐项核对 |
| 同一 Gitea 答案声明 performed/complete，又承认 model NewIssue 未解释 | AS `evaluations/as17-repair-source-reviews.json` | 调用到达、授权允许、源码效果与运行成功分层；未闭合决定性调用须保留缺口 |
| 4 份作者稿有效，原字节消费均不完整 | AS authors/exactAuthorConsumers；ordinary-source-reviews | 先改善共用分析链，保留作者任务的全部问题，避免手改稿掩盖下游失败 |

一份 Gitea native 原始请求中，第5次消息约74,841字符，其中当前局部上下文52,940字符；第11次约89,599字符，局部上下文47,959字符。这只是该记录的字符诊断，不代替 token 或证明因果。AT0 应核对组成，决定去掉哪些重复内容。

本次零模型调用复核：四个相关测试文件 78/78、405 assertions；远端同 SHA。AS 全轮口径为744项联合通过、1 skip，另2项provider合同通过，合计746；没有重跑全部历史实验。

## 二、确定的开发方向

新增显式策略名 `focused-closure-v1`，沿用现有 inquiry 与 native 入口、provider、trace、领域声明和局部展开器。它是同一授权 DSL 的执行改进；旧策略及旧原件继续按原合同使用。优先提取共享核心，不复制一套 runtime。

### 2.1 宿主管理当前解释事务

- 一个活动事务对应明确的 question、源码位置、当前源码版本和工作项。选择真实候选后，宿主绑定 focusId、unit 身份、原行证据及 add/replace；模型不再重复填写这些可派生值。
- 模型回答该源码单元的条件、对象、调用、返回和相关效果。含糊入口仍需选择实际候选；同名、读过、索引唯一都不自动证明调用关系。
- focus 保持到接受、显式不可解释、来源失效或有理由切换。修复只面向当前草稿，保留其他问题及正确单元；错误提交不能隐式覆盖接受状态。
- focus绑定当前来源、问题与政策/前提版本。来源变化使受影响解释及下游摘要失效；政策/前提变化保留与其无关的已核对来源摘要，但当前link/review/answer失效并重算。旧版本回复不能提交到新事务，失效记录保留，不整表抹去独立正确结果。
- 采用 `locate / interpret / link / review / answer` 阶段的窄模型合同。阶段由宿主及真实缺口确定；保留显式请求切换或补读的渠道，避免将调度器变成死锁。
- 已读决定性 helper 优先解释；只读工具和解释动作共享本会话预算，不能有隐藏的模型调用。公平性按完成一项工作或显式让出后轮转，不每次渲染就换 offer。

### 2.2 以有界函数摘要组合调用链

AS 的 blocks/choose/call/return/effect 继续表达局部源码。新增的组合能力关注：参数与对象映射、正常/拒绝/异常返回、决定性授权条件、相关效果及明确未解决依赖。避免把所有下游分支复制进全局路径后才能回答。

- 摘要必须来自当前会话实际展示的源码和模型提交；记录解释覆盖到哪个范围、哪些调用仍待分析。它是待核验的源码解释，不能用函数名、旧答案或人工正确图代填。
- 返回 true、通过 guard、到达 service call、出现源码写入操作分别记录。外部不可见依赖保持边界；一般日志、格式化、驱动内部细节按与当前结论的关系处理，不递归穷举整个仓库。
- 只有源码支持的参数传递/别名可组合；未知对象和值不被默认绑定。条件摘要保留分支、异常与 owner/grant 未指定的情况。
- 必须保留摘要与展开结果之间的检查；若某种摘要无法忠实表达，降为明确的局部缺口，不标 complete。
- 先用共享函数实现 compositional summaries；AT2 比较与直接复用现有 semantic unit 的差异，能用现有类型完成的部分不新增语法。

### 2.3 检查结论是否由当前源码解释支持

- 重要主张要能定位到当前源码范围及解释单元：哪个主体、哪个资源、哪个控制、哪个实际操作，调用参数到下游如何变化。
- 宿主检查引用存在、范围真实、版本、对象/参数关系、分支与依赖状态，以及结构化结论和当前摘要的冲突。字符串相似或函数同名不足以验证源码含义。
- 增加一次有明确目标的局部源码复查机会：对“被忽略/未检查/一定创建”等决定性主张展示关联原文和当前解释，要求确认或修正。该调用计入所有调用、预算和成本；评价 oracle 和先前正确答案始终隔离。
- 复查是运行内自查，不能自称独立证明。最终质量由另行源码评阅判断。若无决定性问题，不循环调用 reviewer。
- 终答绑定宿主当前快照，不让模型复制 revision/pathId；仍拒绝语义矛盾，不静默把模型的 allow/performed 改成另一种答案。原 skill 最终 prose 与结构结果同源；两者内容冲突要显式报告。

## 三、工作队列

每个阶段按“失败测试 → 预期失败 → 共享实现 → 聚焦验证 → 真实适用检查”推进。下面的新模块路径是责任边界，若现有模块可承载，优先在原模块扩展并在本任务书记载。

### AT0 接管、失败台账与合理完成边界

- 创建 `results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/`，只放本轮 status、manifest、repair-events、运行原件、计量与评价。薄研究 runner 只能调用生产实现，不复制语义求值。
- 核对 AS 原始答案与4个具名任务：OWUI ingestion、Paperless Download、Paperless ShareLink create、Gitea CreateIssue。为每项记录原始任务要求、决定性义务、已有材料、允许范围内的缺口、协议障碍和错误解释。
- 文件隔离：`model/`只放原始用户任务/政策/前提和来源选择信息；源码裁定、正确行号、错误答案解释、义务期望值放`evaluator/`。运行输入用明确allowlist组装，不能glob整个结果根或把repair-event当提示。源码窗口只能来自本会话允许工具或合格的来源摘要复用；评价日志不进入被测provider上下文。
- 区分“满足原任务所需的授权解释”和“无限追到框架/数据库每个内部函数”。接口到达只能支持接口到达结论；若声称最终源码效果，必须覆盖可能推翻该结论的可见调用。正确且充分的条件回答可以完整，泛泛 unknown 不算解决。
- 继承 AS `inherited-seals.json` 的具体逻辑任务，不扩大封存到仅费用未知的已响应调用；本轮不解封 Notes/Memos。选用前述4个已公开且可运行任务。
- 记录原请求的 prompt、tool schema、源码窗口、反馈各自字符/字节与实际 token，完成一份紧凑的根因表，避免重复原全量审计。

### AT1 设计共享执行合同与评价面

- 更新 spec §14.34、研究 §7.49 和开发指南相应章节，写清状态转移、摘要组合、来源界线、失败处理、旧默认兼容。
- 锁定本轮质量单位和第一轮输入后再运行；义务范围由原始任务决定，不能看结果后减少。
- 主指标同时报：原任务是否正确且充分、必要义务的正确/遗漏/错误数量、结构交付及普通消费。协议成功不代替语义；一个辅助细节错误也要保留其级别，不只给全零总分。

### AT2 写共享断点的失败测试

修改/新增 `src/benchmarks/authorization-dsl/inquiry-focus.test.ts`、`inquiry-semantic.test.ts`、`inquiry-native.test.ts`；领域摘要测试在 `src/task-dsl/authorization/procedure-summary.test.ts`。至少覆盖：

1. 同一单元在拒绝后的下一轮仍可修复，不被轮转丢失。
2. 已读决定性 helper 进入解释动作；不能因为引用存在就关闭义务。
3. 宿主分配身份，重复相同提交幂等；变更单元使用当前版本并保留历史。
4. 一个错误 helper 不损坏另一个问题的已接受状态。
5. caller/resource 同名但非同一对象，不得误组合；参数正确映射时可组合。
6. reader 分支仅清空 labels、仍传 projectIDs，摘要不能称全部字段均被丢弃。
7. helper 返回成功、调用可达、写操作不同；未解释的决定性 callee 阻止强效果声明。
8. 文件不存在/版本缺失等操作失败与权限拒绝分开。
9. owner 未指定时保留完整条件分支；owner/direct/group 权限不被默认合并。
10. 新源码/政策/前提变化按各自依赖失效；旧答案不能作为新事实。
11. 两入口都只曝光当前阶段所需合同，并保留实际源码可读渠道。
12. final 与当前状态绑定且所有原问题仍在，budget 终止保留已解决部分与具体缺口。

匿名单元可以取自已暴露失败的结构，不把具名正确结论硬编码到生产分支。测试必须区分坏实现与期望行为。

### AT3 实现持久 focus 与阶段窄合同

- 主要文件：`inquiry-domain-runtime.ts`、`inquiry-worklist.ts`、`inquiry-local-extraction.ts`、`inquiry-wire.ts`；必要时新增 `inquiry-focus.ts`。
- 引入可序列化的当前 focus 与阶段，宿主按来源绑定更新；模型提交内容不带可确定的 questionId/handle/op/revision。多候选选择仍显式，跨问题绑定仍拒绝。
- current offer 的生命周期与一次 `modelContext()` 调用解耦；查询和渲染不得推动队列状态。
- 完成拒绝恢复、主动 defer、后续回到同一单元及来源失效测试。

### AT4 实现有界摘要与按需组合

- 主要文件：`semantic-flow.ts`、`inquiry-semantic.ts`、`control-conclusion.ts`；如确需独立职责，新增 `procedure-summary.ts`。
- 摘要记录源码支持的输入/输出映射、条件、授权关系、相关效果和决定性未知；通过既有解析和降低管线消费。
- 共享 helper 的源码解释可以复用，调用场景的参数/政策判定单独组合。避免同函数在6–8个问题中重复全量生成；跨问题复用不得带入另一问题的用户前提或政策答案。
- 环、无法表达的动态语义和超界分支给出具体缺口。无需建设通用静态分析器或完整编译器。

### AT5 将决定性关系带入闭合检查

- 对 entry、前提、主体、资源、guard、effect、helper/return 的每条关键关系保存原行证据和提取来源。
- 区分实际读取、被解释、被组合、被复查四种进度；该统计覆盖 semantic units 路径，避免只数旧 acceptedUpdates 得到假零。
- 已标决定性且源码可读的 callee 未解释时，结果不能把它当 external-unknown。摘要的 closed 状态由真实覆盖和依赖决定，单填 complete:true 不足以提升。
- 阻断沿真实依赖传播到受影响claim/effect；独立已解决义务可以交付。问题/任务整体是否完整按原始义务汇总，部分交付不得借用旧答案标全绿，也不因一个局部缺口抹掉全部正确内容。
- 准确声明机制能检查的属性；整体源码语义仍交给独立评阅。

### AT6 缩小模型上下文、整理局部修复

- focus 阶段只展示对应 schema、源码窗口、caller关系、必要已接受摘要及当前诊断；保留一个紧凑的其余义务列表。
- 合并同一错误的重复反馈，不把全部 guide、全队列、整图和旧失败 raw 反复发送。原件完整归档，不通过删除记录降低表面成本。
- 文本不得机械截断决定性源码；过长函数可用带原行号的连续/分块窗口及明确剩余范围，累计覆盖到哪里要可见。
- 增加无进展识别：相同源码/草稿/诊断重复后转向具名局部修复或精确缺口，不重复原样重抽。

### AT7 同源答案、局部源码复查和普通入口

- 主要文件：`inquiry-run.ts`、`inquiry-native.ts`、`inquiry-wire.ts`、`inquiry-local.ts`、策略解析器及现有 CLI 测试。
- inquiry/native 共用 focus、摘要、来源检查、修复和终答组装。继续加载完整原 skill/参考资料，保护其他职责；本轮只执行用户指定授权切片。
- 最后一次分析从当前摘要回答所有原问题。宿主绑定版本/路径/引用，模型提供解释和政策映射；最终 prose 必须和结构结果一致。
- 复用现有 strategy 入口，不新增平行 CLI。记录所有自动调度、模型复查和自然消费的真实 trace；没有旁路 provider。

### AT8 两个真实纵向调试案例

当前执行：前两轮ShareLink共32/32响应，完整质量仍未达。首项合同修订消除工具字段障碍，但第二轮已读继承/serializer正文未进入focus窗口。第二项具名修复接通有界supporting窗口和caller重访；相关675 pass/1 skip/4499断言及主/ATtypecheck通过。作者原字节消费runner与公开预算已备。下一步第二项具名修订；若仍无解释进展，回到共享接口，不直接派主面板。实际费用未知。

- 按原始请求跑 Paperless ShareLink create 与 Gitea CreateIssue，新策略各1次作为调试首轮；完整保留。
- 两个案例分别检验继承/serializer/owner-helper链，以及 route/reader/writer/参数/服务效果链。模型从普通允许源码自行取证；评价方拥有的正确字段与行号不注入答案。
- 每个失败马上分类并走后述修复循环；暂停所有已知受同一缺陷影响的待派发位置（共同核心缺陷可同时影响两个调试案例），未受影响工作继续。修复后保存代码版本、同题复验和实际采用证据，再恢复对应队列。已经运行的首轮仍留在原版本块，暂停的未派发位置不计失败调用。
- 先争取一个正确、充分的真实纵向交付。若两次具名修订仍没有解释进展，回到 AT3–AT7 调整共享接口，不直接发主面板。

### AT9 框架和多问题缺口处理

- 检查 Python 继承/serializer 路由、Go middleware/多层service等缺口：允许范围内原文可查则接通；确需已声明依赖的原文时，按锁定依赖版本取得并记录为新来源修订，两臂共享相同来源。
- 不凭常识填 DRF/Gitea 框架行为；无法取得准确版本时留下具体边界。同一问题反复打不开的框架路径不拖住其他案例。
- 检验6–8问题作者配置时的共享源码与摘要复用，避免一次源函数被重复当作6个独立查找。

### AT10 完整原 skill 原任务与变化任务

- 使用 AS 已归档的完整 Cloudflare security-audit 和 GitHub security-review，分别绑定 ShareLink create、Gitea CreateIssue；原版/已有真实政策变化共4个位置。
- 同一原包、公开 ordinary/native 入口、明确的新策略。检查原文加载、领域工具实际使用、所有原始问题、原/变化答案一致性；禁止人工补图或替换最终稿。
- 以独立源码复核决定是否取得合格基线。失败位置仍保留并修复，共享机制同样回到生产代码。
- 这里4个位置都是fresh普通消费，变化位置可以独立运行，不依赖原任务已通过；原/变是否均完整与AT12的previous复用收益分别验收。

### AT11 作者声明与消费

- 两个原 skill 的自然任务各生成原稿和政策变化稿，共4份。复用既有 authoring 接口，不另建输入向导。
- 每份按原字节校验并实际消费，问题不删减；最多一次普通作者诊断修订后继续。若失效，记录未消费原因和完整分母。
- 允许宿主机械派生路径/元数据，不让主代理替作者补语义字段或把评阅结论放进作者输入。
- 报告作者结构有效、声明是否忠实任务、消费质量分别的结果。模型作者分钟和用户操作步骤分列，真人时间未观察时保持 unknown。
- 一次作者修订仅限制作者字段生成；有效稿的下游共享runtime失败按统一修复流程处理，不要求重写作者稿。消费阻塞不吞掉作者稿分母或已有编写证据。

### AT12 真实政策/前提变化复用

- 在已合格的原任务上，分别选择政策变化和已声明前提变化；每项 fresh 与 previous 各运行一次，共4个位置。
- 复用仅是当前绑定的来源解释和可用摘要；独立政策映射、受前提影响的分支和最终回答重算。历史final、evaluator和其他模型的正确答案不导入。
- 若完整基线仍未取得，允许跑 fresh 变化来定位问题，但 reuse 效果保留未达；不把整个变化方向都置于零工作状态。
- 报告质量是否保持、实际少了哪些读取/生成、总token/时延/所有准备成本。记录修订新增成本，不只比较最好的两行。

### AT13 源码变化与适用性

- 用一个具名原任务的真实可检查源码变化，执行旧材料 compare/失效及新材料 fresh；只在普通开发副本修改，不改旧来源原件。
- 不同ref、helper变化、selector变化必须使相关摘要失效。复用范围能准确证明时做局部失效，否则使用现有 conservative-fresh。
- 这是失效与新源码解释检验；不要求为本轮额外建立通用跨版本增量分析系统。

### AT14 同条件方法对照

- 四个原始请求：OWUI ingestion、Paperless Download、Paperless ShareLink create、Gitea CreateIssue。
- 三臂：`M-L`（Markdown + legacy）、`M-F`（Markdown + focused-closure-v1）、`D-F`（领域声明 + focused-closure-v1），共12个登记位置。
- M-F/D-F共用同一核心、模型、允许源码、原始问题/政策、预算和修复机会；Markdown具备与DSL相同的用户信息，不能藏字段制造优势。M-L获得相同的原始只读源码工具、来源范围、provider预算和诊断恢复规则，保持legacy调度；focus/摘要组合/定向复查是F执行支持的一部分，不声称三臂执行器相同。
- AT8 是适应性调试，和主面板分列。主面板运行前记录当前代码与共同输入；若发现共享bug，当场停受影响行、修复、复验，形成新版本块；没有运行的行继续运行，已失败的行保留。不得为了“同版本”把已知故障跑满。
- 比較 M-F/M-L 解释执行支持的价值；M-F/D-F 比较表达方式。成功时也不能把共同源码和执行器的收益全算到语法上。
- 预算建议：主面板每一个位置（一个任务×一个臂的一次会话）最多24次provider请求，包括fallback/修复/复查；每位置48次工具动作、8MiB物理读、512KiB累计源码展示，每次最多6000输出token、300秒请求超时。12位置首轮理论上限288次请求；单列重开会话的开发修订不塞进这288内，单独登记预算并计入总成本。AT1可根据真实请求大小作一次有据调整，并同时作用于三臂；这不是用户付费总额上限。作者多问题消费可独立登记每会话32次请求，费用全部记录。

### AT15 逐条评阅、错误回修与小型消融

- 所有已完成行做原始源码裁定：完成哪些义务、哪句结论有误、哪份可读原文尚未使用、为什么条件回答足够或不足。保留首答、修订和正确部分。
- 独立只读复核重点检查：Projects/labels分支、GET权限、owner-aware helper、源对象与输出对象、opaque call后的effect、最终prose和结构冲突。
- 只在真实采用了新机制的2个不同结构案例上做有理由的消融，共最多4个初始位置：关闭固定focus，或关闭摘要组合/定向复查中的一个。保持其余事实及资源不变；不要把多项同时关掉后归因单一组件。
- 若没有真实采用或底层仍未通，优先修共享实现，不为填消融表追加无效调用。

### AT16 减少实际浪费

- 依据本轮trace减少重复读取、重复解释、无效重试和冗余tool schema。优先改跨任务都出现的浪费。
- 有质量合格位置时，做一个同任务前后有据复验；保持不劣再记录具体token/时延收益。若质量仍未达，明确哪些效率改动只减少机械开销。
- 支持一个任务的示例不写仓库专用成功分支，不手工改生成包代替生产修复。

### AT17 联合验证与零调用重放

- 运行当前变更覆盖的领域、provider、native、CLI及本轮研究测试，主 typecheck；不重复所有历史付费实验。
- 零调用重放从已存原件推导新摘要/计量/评价，保持原字节；重放因旧实现绑定失败则用原版本入口解释，不能修改冻结摘要。
- 核对普通入口两种表达的能力一致、完整原skill保持、无目标代码执行及未记录调用。只检查本轮提交的证据和必要来源绑定。
- 文档检查一次，有具体失败再修；不做整盘清理或多个clean worktree审计。

### AT18 研究复盘与开发文档

- 更新现有研究正文 §1、§7.49、§11，按“假设—具体失败—实现—采用记录—评价—仍缺什么”记述。解释是否解决了AS的6类断点。
- current-status、当前plan、spec、developer-guide、usage只写当前状态和实际命令；旧AS原始结论保持。当前阅读集保持规模，不新建每阶段Markdown组件文档。
- summary明确工程完成、完整实际使用、方法比较和成本四个结论；未达项仍可说明已完成有限队列，但不能写全部验收成功。

### AT19 发布和可继续的交接

- 按模块/阶段提交，只推用户 origin，查询远端SHA和ahead/behind。保留他人已有修改，不做无授权清理。
- 最终提供：可直接运行的普通命令、同包原/变使用结果、12位置主表与修订、4作者稿及消费、实际调用/成本、已知失败的下一步代码定位。
- 保持唯一活动任务状态。全部适用工作终结后关闭本轮；若技术条件确实未达，列清未达目标和已尝试的修复，不用另开identity重复抽取假装完成。

## 四、每次失败的处理规则

1. 每个实际不良结果先判定原因：传输/结构合同、身份或队列、材料不足、已读未解释、错误语义、评价争议、预算。保存原答及对应源码，写一个短 repair-event。
2. 共享实现缺陷立即暂停相同路径的后续派发；用匿名失败测试修通，再复验最初触发任务。无关实现和零调用工作继续。
3. 提示/调度问题用通用合同修复；参数化对象、分支和effect错误回到真实原文与局部提案。不能把正确答案直接写进提示、配置或脚手架。
4. 每项有可修原因的失败在本进程内至少进行一次针对性修复/复验。共用原因可共用代码，但每项记录修复是否适用、是否实际改善。两次同根因无进展后先改接口/分工或明确边界，不继续原样抽样。
5. 工程缺陷的原地修复与语义质量修订分别计量；只有观察到机制被使用才讨论效果。准确的未知不强改成肯定结论；预算不足可以形成单列扩预算诊断，不能混成同预算胜利。
6. 响应已知但usage/USD缺报，继续记录unknown；终态未知的具体请求按既有恢复/封存合同处理，不自动重发。其他任务无需一起等待。

## 五、验收与节奏

| 交付面 | 目标与可检查证据 |
|---|---|
| 共享工程 | focus/摘要/检查/终答双入口实际接通，旧默认兼容；关键反例测试通过 |
| 真实完整链 | 两份完整原skill原/变4位置获得有据且充分回答，原问题不丢；失败仍在总分母 |
| 作者与复用 | 4稿原字节消费；有合格基础的fresh/previous质量和实际开销配对；没有真人观测则不填分钟 |
| 方法效果 | 12个主登记位置及所有修订/未运行项，必要义务完整情况和错误严重度，表示/执行支持贡献分开 |
| 成本与可维护性 | 调用、完整prompt/output/cache、阶段耗时、已知与未知费用；原始记录可恢复，导航保持精简 |

预计主动工作安排：AT0–AT2约1–1.5小时；AT3–AT7约3–4小时；AT8–AT13约3–4小时；AT14–AT16约2小时；AT17–AT19约1小时。只是安排，实际以问题和资源为准。每个较长阶段保存短恢复点，不以等待、增加报告或反复全量验证充数。

验证命令从仓库根执行，按实际变更选择必要集合：

```powershell
bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl
bun run typecheck
python -B -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py
python -B scripts/check_skill_ir_doc_links.py
bun ./scripts/experiment-catalog/cli.ts check --root=. --catalog=results/skill-ir/experiment-catalog.json
git diff --check
```

AT0为新结果目录准备本轮薄runner及其typecheck/replay真实命令，写入本文件执行记录后使用。不开机即生成大量未来路径占位；未创建的文件只作为代码责任说明，不放坏链接。

## 六、执行记录

- 2026-10-05：执行线程从 `9c86e9eb510b929da139eb128273ba4442e0ec58` 接管，实际工作区干净；本人阅读当前任务书、spec §14.34、研究 §1/§7.48–7.49/§11、组件指南及交接。当前先建立 AT0 输入/评价隔离和失败台账，之后顺序推进 AT2 红例、AT3–AT7 共享实现及真实纵向调试；旧 AS 不追加调用或修改原件。
- 2026-10-05：AT0输入/封存/义务台账已锁定；AT2红绿覆盖持久拒绝恢复、helper解释、对象返回、labels字段范围、操作错误、延期重访、答案路径及双入口阶段。AT3–AT7复用semantic unit，共享focus管理事务；只有纯有限标量helper摘要组合，复杂对象/效果继续精确展开。预算公开传到ordinary入口，默认保持。领域/CLI联合653 pass/1 skip/4347断言；新增研究allowlist测试1/1。主typecheck发现CLI测试期望对象需补4个新可选字段，已据原测试修正，复验后进入AT8。新薄runner命令：`bun results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/study.ts develop debug-paperless-share-create-D-F`；`replay`零调用。当前真实完整质量/费用仍未知。
- 2026-10-05：主线程完成AS原件/核心代码复核及78项聚焦回归；编写AT任务书并同步当前入口。此时AT生产开发和真实实验尚未开始。下一线程按实际提交接管。
- 发布前只读可执行性复核后，明确了每位置预算、evaluator输入隔离、focus失效范围、局部依赖阻断、fresh变化独立运行和作者/消费分层。原始只读工具公平与执行器干预分开；无需新增审批门槛。
- 文档验证发现AS归档的两份检查日志复述已撤下文档路径，扫描新增5条历史引用误报；按现有retired-reference机制登记精确source/target，原始AS日志及793份证据未改。

AT8/AT9执行记录（2026-10-05）：ShareLink调试首轮完成但未达质量，21派发/21响应，实际美元未知；首轮原件固定。独立轨迹/合同复核发现工具字段、谓词说明、link参数和错误values生命周期缺陷，匿名TDD修复后相关668 pass/1 skip，4367断言，两项typecheck通过。新增输入修订locked-framework-v1仅扩充锁文件哈希匹配的DRF3.18.1源码，所有Paperless臂共享；原始输入/政策不改。具名修订at8-source-contract-and-typed-link-v1待同题复验，暂停受影响派发到该修订验证。
