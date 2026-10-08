# BA0–BA18：授权语义提交、实际采用与完整任务验证

> **For agentic workers:** 使用 `superpowers:executing-plans`、`systematic-debugging`、`test-driven-development` 和 `verification-before-completion`。用户已要求接续开发并派发新线程；按本任务书连续推进，常规可逆修改无需再次确认。主开发者负责设计、代码与最终验证，只读探子负责窄范围定位和独立核验。

**Goal:** 让真实模型通过普通 skill 入口可靠提交局部授权语义，由同一宿主编译、采用并检查；完成两份完整原任务和变化使用，测清实际质量及开销。先消除模型与宿主交互中的具体障碍，再补真实链上暴露的领域缺口。

**Architecture:** 复用 `operation-evidence-v6`、既有 source interpretation/focus、property query、materials/projection、有限控制、native/inquiry 与账号通道。在同一核心上增加宿主管理的语义编辑视图及编译入口，统一协议选择、诊断和预算状态。旧协议仍可明确使用；不另建 CLI、通用 IR、agent 平台或完整 Python 解释器。

**Tech Stack:** TypeScript、Bun、Zod/Ajv、既有源码结构索引与有限求值器、Codex Account Adapter。开发模型 `gpt-6.1-sol / max`；实验只用已授权的当前官方账号 `gpt-5.6-sol / high`。

日期：2026-10-09。状态：`in-progress`（Download同输入复验7单元/7材料、1采用、0绑定/性质检查、源码partial，同因重抽暂停；OWUI首件5单元、0采用、1绑定unknown，自然源码答案full，正在修复await与残余调用来源顺序并准备具名复验）。复核基线：`29c400fff55b74185fb518fc366d61b50967e3ea`；实际接管HEAD为`1c822e10121d49aae8026dba8caa5399b5e09dab`，启动工作树干净。实施及真实结果按勾选项与新identity原件区分，未勾选要求不能作为结果。事务优先修复回归1736 pass/1 skip/11424 assertions及主typecheck通过；所有首件/修订原件不可覆盖。

## 一、接管与事实基础

### 1.1 责任、目录和读取顺序

- 继续 `D:/skill优化/SkVM` 的 `skill-ir-aot`，只推用户 `origin`；不新建分支/worktree。新线程是本轮代码、共享文档和 Git 的唯一写者。
- 新 identity：`authorization-semantic-submission-v1`。结果统一写 `results/skill-ir/skill-dsl-research/development/authorization-semantic-submission-v1/`；运行目录为 `D:/skill优化/project-maintenance/runs/authorization-semantic-submission-v1/`。不要调用旧 study 的写入入口。
- 主开发者亲自读父/仓库 AGENTS、[current-status](../../skill-ir/current-status.md)、本文全文、[spec §14.40](../../skill-ir/skill-ir-aot-optimization-spec.md#1440-ba-semantic-submission-and-adoption)、[研究正文](../../skill-ir/skill-dsl-research.md) §1/§7.62/§11。协议兼容需要时读 §14.39/研究 §7.61。
- 再读 [AZ summary](../../../results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/summary.json)、[status](../../../results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/status.json)、[已结束任务书](2026-10-09-authorization-property-abstraction-and-real-use.md)的实际收束及未勾选项；不是从头重跑 AZ。
- 关键原件：AZ `attempts/single-download/{original,format-contract-1}/public-report.json`、M/D 首轮的 `run-result.json.gz`、各 `runtime-observation.json`、`evaluation/reviews.json`。按 JSON 路径提取，不把巨型报告整份塞进上下文。
- 根 `conversation_log.md` 追加阶段记录；handoff/communication 仅按跨线程需要查阅。普通接口查 [usage](../../usage.md) 与 [developer-guide](../../skill-ir/developer-guide.md)，修改的代码亲自完整阅读。

### 1.2 已复核的失败链

| 事实 | 证据入口 | 本轮要解决什么 |
|---|---|---|
| AZ5次尝试、4自然交付；3次领域运行均格式预算耗尽、0接受单元/采用/检查 | AZ summary、三次 runtime-observation | 通道恢复和领域可用性是两项责任 |
| 修订件第一次把 frontier 的 field/value 填进 annotations，使用 delegated、delegate、operation-failure 等非合同值 | `format-contract-1/public-report.json` 的 `telemetry.account.toolRejections[0]` | 缺失项的展示形状与实际编辑合同要一致 |
| 第二次只错 role=guard，却同时收到缺 unit、candidateId、schemaVersion 应为 focused-update 等错误 | 同文件 `toolRejections[1]`；`inquiry-focus.ts:43–51`、`codex-account-session.ts:173–208` | 这些是 union 其它分支的报错，不能据此误判当前阶段已变；只反馈实际选中协议的错误 |
| 一次 role=condition 提交已过 wire，但只给解释文字，缺有限 condition，且邻近调用未解释 | 同文件 `domain.focus.sourceInterpretations[0]` | 格式成功后还需要可执行语义；不能把谓词从自然说明里静默猜出来 |
| 结果提交含 gaps 和 behavior 模式的 not_assessed；此后正确形状的检查也因格式额度封闭被拒 | 同文件 `toolRejections[2]`、`telemetry.account.tools`；`inquiry-native.ts:113,157,215,228–234` | 交付模型视图、有限格式纠正和有效检查额度必须一致 |
| 一次 D 会话 failed/workspace routing discovery failed、quotaRefused=false、host tools=0 后，runner 把其余17位置全部封存 | AZ `study.ts:69–78,131–138`、D report | 只证实该会话失败；实现有上限的同通道恢复，避免永久暂停循环 |
| 同一自然 prompt，但 M 规范化为1题，D 使用旧作者稿4/11题 | AZ `study.ts:47–53`、summary limitations | 比较前统一原问题、前提、政策与共享核心的编译输入 |

复核定向运行 native/focus 与 AZ study/summarize：57 tests、331 assertions、0 failures。它验证现有合同按代码执行，尚未验证该合同适合真实模型。旧1713测试和历史结果保持原口径。

### 1.3 继承边界

保持完整原 skill、原问题及允许源码；Cloudflare/GitHub skill 的其它职责不删除。当前特化仍是单 repo/ref、源码可见的授权/信任边界任务。held-out、Q1、prospective、readiness、历史0/6及旧结果不改。新样本仍是已暴露 development，不能标 unseen。

质量/编写复用约六四分配指开发投入。所有真实运行和修复计费/用量保留，USD 缺报为 unknown。第三方 API 与 AV 旧位置继续暂停；不读取或输出凭据，不换账号/模型/端点绕开拒绝。无需重新征求已授权的官方账号实验许可。

## 二、方法与执行合同

### 2.1 宿主组织编辑，模型解释语义

本轮增加**一种**显式版本化的语义编辑合同，建议名 `authorization-source-edit/v1`，由 BA1 确定准确字段并更新 spec。它是既有 source interpretation 的输入适配，编译回同一 `SourceInterpretation`/semantic-flow/property checker；不复制第二套求值语义。

- 宿主给出当前事务、源码版本、anchor、待填字段、允许类型/枚举、相关原行和已有草稿。模型不再重复生成宿主已知的多层 schemaVersion/focus/revision 路由壳。
- 编辑必须绑定明确的当前事务；过期、跨题、跨源码、冲突身份继续拒绝。宿主只填写机械元数据，不替模型选择 permission/effect/allow/deny 或生成用户前提。
- 若视图要求按 field/value 修正，就实现相应的带类型局部编辑；不能继续展示这种待办形状却只接受另一种嵌套 annotation。每个字段的语义仍由现有 Schema 检查。兼容旧 annotation 输入，不自动把 guard/delegated 等词换成“最像”的合法值。
- 条件字段必须提供可计算的有限表达式，或具名 unresolved。展示同一来源派生的表达式结构/操作符合同；必要的匿名语法示例由真实 Schema 测试验证，不能预填当前任务答案。可机械翻译的源码语法沿用已有 lowering，未知语义不强行转换。
- 当前单元允许持久化合法局部草稿，完整单元只在必要字段及出处验证满足时采用。分别统计合法编辑、保留草稿、accepted units、material uses、bound queries、checked properties 和完整原任务，避免把草稿保留当作完成。
- 保留原始工具参数与编译后的内部提案。接线测试必须穿过官方传输参数验证、公共工具、focus、lowering、projection、property check，而非只注入 `initialSemanticUnits`。

### 2.2 一个协议来源与精确反馈

Schema、模型可见字段说明、空表单/匿名示例、解析器、错误描述共用定义。先按显式 discriminator/current transaction 识别动作，再解释该动作错误。未知/冲突 discriminator 单独报错，不从多个 union 失败分支拼一份互相矛盾的修复要求。

官方账号启动时注册的是静态工具合同，普通 provider 入口可按阶段缩窄；两条路径都要实测/回归。不能只优化动态 prompt 却保留官方静态 union 的冲突反馈。Schema 路由简化后仍需完整语义校验，未知字段和无法解释的意义不静默丢弃。

答案使用同一当前结构生成 model view 和 canonical result。behavior 模式不要求独立政策判断；conformance 明确政策来源与状态。必要字段、missing 项内部形状和枚举都要显示，旧 `gaps` 不可通过删除来伪造完整。自然输出与机器结果不同处要如实标明。

### 2.3 预算与当场修复

保留一个全局工具/时间/显示预算，格式错误仍计真实工具与成本。默认2次格式纠正、2次语义检查继续有界；“没有格式重试机会”不应让尚存的有效语义检查永远不可调用。BA4 明确状态机：拒绝后展示剩余合法动作；合法检查可使用未消耗的保留额度；进一步无效提交立即失败且不生成新语义或额外额度。不能靠扩大所有预算掩盖接口问题。

计数粒度是**单次真实会话attempt**，不按题目、单元或focus重置。新编辑模式记录totalUsed/limit、formatRejectCount、semanticChecksUsed/limit、finalOnly、deliveryClosed：首个格式拒绝后允许2次纠正，第三次拒绝进入finalOnly；此后仍允许形状有效的最终检查，若再次格式无效则关闭工具交付、只给自然终答。有效形状的检查进入语义检查后才增加semanticChecksUsed，即使语义检查失败也计一次。每次真实工具尝试在totalUsed中只计一次。探索调度为未消耗的2个检查位置预留总量，格式尝试仍花真实总量，不再把同一失败同时扣格式和探索两份总量；总量64等实验上限不增加。首轮实测表明：探索已到上限后，静态合同无效的final尝试仍会消耗预留位置，不能同时保证两次有效检查、计全部实际尝试及固定总量。因此checksRemaining显示min(未消耗语义额度,实际总量剩余)，不退还失败成本、不增加额度。finalOnly中错误交付也花实际总量，不生成额外修复额度。旧策略计数兼容，新模式/代码版本在manifest明示。

每次不佳表现当场写故障归因：协议/宿主、未读、局部语义、连接/摘要、结论、通道、评价。对已确认共享缺陷立即停受影响位置，原件红测→共享修复→绿测→具名复验。一个根因修订后仍无进展，停止同因重抽并继续离线定位或独立工作；新证据揭示不同根因时可继续修，不能用“一次修复已用完”封死后续开发。禁止把已知坏实现跑完整板。

### 2.4 临时通道故障与未知完成分别处理

- 明确 quota/auth 拒绝：记录并暂停真实派发，不自动切换或反复试探。
- 未知完成/活动会话：先核查原生命周期，不能重复发送可能仍在执行的同一任务。
- 已终态 failed 的 workspace routing/连接故障：核验上一会话已关闭、同一账号/CLI配置仍符合要求，在已就绪的真实任务上允许**一次**新会话恢复尝试，保留 parentAttempt/retryReason。它不是新的独立样本，失败成本不能删除。
- 恢复仍出现同类故障：暂停该通道，继续确定性开发，等待新的配置/外部状态证据；不对每个位置各试一遍，不睡眠轮询。自动重连若已在同一会话发生也计入记录，不能重命名后当新预算。
- 不要求先用一个额外付费探针证明可用，再跑真正任务。现有授权足以支持有目的的恢复。通道标签表达观测时间及原因，不把单次终态解释为账号永久失效。

“已就绪”只要求新位置输入/skill/源码存在且普通check通过、当前实现快照和预算已登记、无活动或未知完成；由新study写`readyToDispatch`及依据。它不要求通道已成功、该性质已通过或上一任务已经采用。BA7先实现恢复能力，BA9准备好首个输入后执行恢复，二者无真实成功的循环前提。

### 2.5 同题比较与源答案隔离

新建一份共同 task-facts：从原自然请求得到同一问题清单/分组、前提、用户政策与允许源码。只整理任务要求，不填守卫、正确对象、漏洞结论等源码答案。主质量面板的 M/D 必须编译为相同义务/问题身份与公共事实，仅模型可见任务表达不同；N获得相同原问题和事实、同一完整 skill 与源码工具。

旧作者稿单列消费测试，不能充当 D 主面板独有的预加工输入。记录模型实际收到的消息与工具合同，不能只比较 task.json prompt。原件、oracle、旧结论和研究评语始终不进被测模型环境。

## 三、实施队列

每个代码任务先写有意义的红测并确认失败原因，再修改共享实现、跑相关绿测、阶段提交。仅文档变更不运行全仓代码回归。

### BA0：接管与失败重放

**落点：** 新 identity 的 `study.ts`、`study.test.ts`、`manifest.json`、`status.json`、`failure-analysis.json`。

- [x] 保存接管 HEAD/干净状态、账号已知终态与路径；不清理历史结果。
- [x] 从上述三次领域尝试提取原始参数、所见合同、局部诊断和预算变化，制作最小离线回归夹具；旧文件只读。
- [x] 将原件事实、当前代码重放、待验证推断分开。尤其不要把 union 的候选分支报错当成真实 focus 切换。
- [x] 新 runner 禁止写入 AZ/AY；登记下述22个主位置和独立修订机制，requirements 与 outcomes 分开。（3 tests/17 assertions通过；dispatch后续接线。）

### BA1：语义编辑合同及失败测试

**落点：** `src/benchmarks/authorization-dsl/inquiry-focus.ts`、`inquiry-wire.ts`；`src/task-dsl/authorization/source-interpretation.ts` 及对应测试。确需独立职责时只新增一个 source-edit 模块及测试。

- [x] 在本文/spec确定编辑合同、宿主/模型字段所有权、事务失效和旧格式兼容（spec§14.40；source-edit模块）。
- [x] 红测：模型按展示的待填槽位提交可编译；field/value 与 annotation 不再互相误导；错误 role、无解释、无 predicate、假 anchor、过期事务、冲突版本仍准确拒绝。
- [x] 覆盖空/部分草稿与多次局部补齐；不预置成功语义，不把首轮坏提案改成好原件。

### BA2：编译到既有语义链

**落点：** 上述合同模块、`inquiry-domain-runtime.ts`、`inquiry-focus.ts`、`source-interpretation.ts`。

- [x] 实现机械路由填充、带类型局部编辑合并与旧 SourceInterpretation 编译；每个生成字段可追到当前事务/模型输入。
- [x] 保留已有效的同源字段，错误或旧版本字段不会污染其它题；更新解释后撤回过期检查。
- [x] 将完整、明确 unresolved、仍待填写分开，交付采用流水；不把 source-readable 算作 source-interpreted。

### BA3：传输诊断与答案合同

**落点：** `src/adapters/codex-account-session.ts`、`codex-account.ts`、`inquiry-wire.ts`、`inquiry-focus.ts`、`inquiry-native.ts`、`inquiry-run.ts` 及测试。

- [x] 对 AZ role=guard 的原参数重放，错误指向 role 及六个允许值，不要求无关 unit/candidateId 或另一个协议版本（官方传输原件回归8个union错误→1个实际字段错误）。
- [x] 定义和校验从同一 Schema 生成；测试当前模型示例，检查静态官方注册和动态 provider 视图的等价性。
- [x] behavior/conformance 的答案模板覆盖 explanation、missing 的实际形状、paths 和政策状态；错 gaps/状态不静默吞掉。
- [x] 修复只影响授权工具时限定在该边界；其它账号工具保留通用AJV校验及原回归。

### BA4：修复预算状态与交付接线

**落点：** `inquiry-native.ts`、`inquiry-run.ts`、账号适配和对应测试。

- [ ] 红测 AZ 序列：两次格式错误→一次通过 wire 但语义不完整→一次错误答案→有效的有缺口答案；每一步合法动作与真实计数一致。
- [x] 格式纠正耗尽后不再提供无限修复；剩余有效检查仍可执行，结果不可被旧 checked 污染。总预算不增加，失败/重放调用不双记。
- [x] 测试连续错误、工具去重、迟到结果、源码变更、checked后非法更新及所有原题保留。

### BA5：可填写的性质前沿与局部完成

**落点：** `property-demand.ts`、`property-query.ts`、`inquiry-focus.ts`、`inquiry-worklist.ts`、`inquiry-context.ts`、`inquiry-progress.ts`。

- [x] 每个当前 slot 展示源行、所缺字段、合法类型、相关原题、当前已知值及为何必须填；不只列 missing 名称。
- [ ] 针对已读源码先完成一个可表达性质所需的角色、predicate和对象联系；未知影响保持有来源的残余，不要求模型凭散文证明安全。
- [ ] 合法局部草稿复用并只发送增量；同因没有新材料时不重复读全文件/重发整图。保留按需查看完整原文能力。
- [x] 匿名匹配守卫、错对象、效果先于守卫、提前返回及未知helper反例；性质范围确实不同，不能仅改 revision。5个公共编辑反例保持satisfied/violated/unknown，另验证其它源码未绑定占位不伪造重复绑定。

### BA6：穿过真实公共入口的离线闭合

**落点：** `source-assisted-entrypoints.test.ts`、`codex-account.test.ts`、`property-runtime.test.ts`、投影/有限摘要测试。

- [x] 用受限 mock 通过实际账号动态工具参数验证和普通 native/inquiry 完成读源码→语义编辑→接受单元→material use→bound query→性质检查。
- [x] mock只按本轮公开模型合同构造参数，不注入 initialSemanticUnits、不调用 store.accept 捷径；同时保留上述内部测试。匿名item写入链在官方静态工具及structured inquiry均取得1单元/1材料/1使用，性质bound、checked且trace非空；未知异常未删除。
- [x] 采用丢失要定位到具体门槛：root/role/receiver、实参、callee、摘要适用范围或source覆盖；仅修当前反例所需共享缺陷。Download模型把调用解释为primitive effect，不能宿主改义；OWUI缺await函数值创建、context残余丢来源顺序名，分别红绿修复，真实闭合仍待复验。
- [x] 旧 AZ 原参数重放仍按原含义拒绝/保留；另外生成的修正夹具明确是开发样例，不回填历史采用数。

### BA7：有界官方通道恢复

**落点：** 新 study 的通道分类/恢复与测试，必要时共享 account/session 生命周期；旧 AZ runner不改。

- [x] 区分 quota、认证、已终态瞬时 routing、未知完成和本地配置失败；新runner红测→绿测，旧4完成/1失败事实保留。
- [x] 为已终态 routing 实现一次具名恢复，连接原失败，严格同账号/模型/入口。重复routing则停止该通道而不是把全部任务标工程完成（真实恢复待BA9）。
- [x] 使用BA9的pilot-download/original进行一次同账号恢复，已completed且通道available；保留AZ原failed生命周期、parent和成本，不额外发探针。

### BA8：统一任务事实与真实模型输入

**落点：** 新 study 的 `model/task-facts`、renderer、input-equivalence 测试；必要时复用 `operation-program.ts` 的普通输入编译，避免在runner另造执行器。

- [x] 从完整原自然任务建立共同题目/前提/政策映射，逐条关联原文；原作者声明保留到作者面板。整段原请求为q1，逐句requirements保留原文偏移，不填源码答案。
- [x] M/D在运行前具有同一语义程序、义务和来源；普通入口实际消息仅任务表达按臂变化，工具/摘要/恢复政策共用（公共入口匿名测试，真实加载证据待各attempt）。
- [ ] 检查完整skill、同源码ref、同资源预算、同原问题及oracle隔离；不把相同prompt字节当成全部公平性。
- [ ] 复用现有skill/claim/instructionSources记录，保存原SKILL.md路径、字节数/已有摘要、实际加载来源和伴随文件清单；对比实际账号system输入或可核验加载记录，不另造摘要链。公平性结果汇入新identity的`input-equivalence.json`，缺实际加载证据要明确失败。

### BA9：两项真实采用里程碑

**材料：** Download的原问题子性质、OWUI的原问题子性质，各一次普通native开发运行；原完整任务分母仍在主面板中。

- [ ] 首先验证Download提交、保留、采用、性质检查的完整流水。格式通过后发现语义缺口，继续定位并当场修复。
- [ ] OWUI用同一实现验证另一源码结构，不按skill/repo名构造成功图。
- [ ] 每项独立源码复核：机械自洽与源码正确分别记录。合法条件结论可以成立，允许源码中的决定性控制漏读仍需修复。
- [ ] 一次针对修订仍0采用时，暂停同因扩样，明确实际失败层；继续做可验证的接口/连接修正，不用新语法扩张替代使用证据。

### BA10：决定性链的领域补齐

**落点：** `operation-work.ts`、`operation-links.ts`、`source-material-projection.ts`、`procedure-summary.ts`、`property-dependencies.ts` 与现有有限控制模块。

- [ ] 根据 BA9 的实际首阻断修复 caller/callee对象联系、继承权限、返回对象与效果关联；优先复用已有MRO/参数/源码证明。
- [ ] 只有真实缺口要求时补一个有来源/适用条件/失效依据的框架摘要；正例和override/错对象/异常顺序反例同时验证。
- [ ] 动态装饰器等未知不能默认为无影响；说明其对当前性质的实际残余，不为了checked删边。外围语言能力必须给出当前关键路径证据。
- [ ] 新支持需要真实材料采用验证；只通过内部构造图时标工程部分完成。剩余AZ框架大清单不自动全部继承为本轮开发范围。

当前共享修复：实际process_file的await模块函数参数缺创建，随后context残余调用丢来源顺序名；两个匿名反例分别红→绿。原提案零调用重放恢复5可用/3使用但仍不完整，缺失/错源/晚建反证全部拒绝；投影校验器不改。受影响1739 pass/1 skip/0 fail、主/研究tsc及15文档测试通过，真实同输入具名复验待派发。该离线3使用不得回填原件0使用或算真实BA9完成。

### BA11：完整原任务第一重复

- [ ] 固定当前实现快照与共同task-facts，运行 Download N/M/D、OWUI D/M/N，共6位置，均完整skill+完整原问题的普通native入口。
- [ ] N只有共同源码工具；M是同一领域核心的自然任务视图；D是声明视图。自然答案质量用同一评价标准，机器采用是另一指标。
- [ ] 坏表现当场复核并处理共享原因；修订另立attempt/epoch。D失败不取消该任务N/M的有意义诊断，也不继续跑已知坏代码。

### BA12：同版本第二重复与比较

- [ ] 再运行同两任务×三臂6位置，顺序Download D/N/M、OWUI M/D/N。有效性和质量无选择性重抽。
- [ ] 若中途实现改变，按epoch显示旧首件和新版配对；没有同版本配对就报告inconclusive，不混成两个重复。
- [ ] 以共同源码答案完整度/错误率比较N/M/D；格式错误保留端到端分母。协议有效答案的语义率另列，不能删坏行制造收益。
- [ ] 只有两个任务两重复，报告逐题和逐次差异，不宣称统计稳定/类别普遍适用。

### BA13：作者包与两入口实际消费

- [ ] 旧两份作者包先原字节兼容检查；需要迁移时通过共享机械迁移器并另存身份，不主代理代填源码答案。
- [ ] 两个普通消费位置：一个 native、一个 inquiry，经同一语义编辑/采用核心，保留原完整问题、来源与原skill加载记录。
- [ ] 搬移后依赖可取回、失效正确，实际工具确被使用；有包不等于消费者完成。作者准备/修复成本单列，不混进质量主板的D优势。

### BA14：政策、前提与源码变化

- [ ] 在当前同版本合格Download基础上运行3种变化×fresh/previous=6位置；两个臂共享变化和最终质量要求。
- [ ] 政策变化保持模式不变，避免把behavior→conformance混成policy-only；前提只改用户实际给出的事实；源码变化明确受影响材料。
- [ ] 检验旧结论撤回、未变材料采用及真实少读/少解释，恢复与准备成本全记；不能以reusable=true和0材料声称复用。
- [ ] 无合格基础则previous具名阻断；可做partial材料或fresh诊断，但另标范围，不能补一个历史包冒充当前基础。

### BA15：独立评价与开销归因

- [ ] 对所有原答和修订用相同源码、原问题标准评阅，尽量隐藏臂名；争议回到源行。记录条件完整、错误允许/拒绝、漏控制、未分析和合理unknown。
- [ ] 分开 source-semantic quality、protocol delivery、source coverage、mechanical check、material adoption 与完整任务；不能用partial总标签盖住根因。
- [ ] 总输入含缓存仅计一次；分别记输出、可见调用、格式失败、重复源码/Schema字节、耗时、作者/恢复成本。未知USD/隐藏请求/开发和真人分钟不填0。
- [ ] 结果可为positive/tradeoff/no-observed-difference/negative/inconclusive。D更贵且更差就明确negative；质效不变但编写/复用方便也须有独立证据。

### BA16：针对性减负与机制反证

- [x] 只有轨迹表明重复协议/全图/源码传输构成开销时，复用既有增量context，减少已知机械重复；语义及预算不变，来源仍可查。两Download轨迹10,651字节装饰器待办重复，调度理由参数改为512字节上限/原行引用，索引和残余义务不变；实际成本收益待实测。
- [ ] 对已成立的一个真实链做零调用撤去/破坏材料连接、错对象、过期来源反证，确认checker实际使用材料，避免仅出现计数。
- [ ] 如进行额外真实消融，先写清可区分的机制假设和位置，沿同模型/输入/预算记录；不为凑运行时长增加面板或第三方服务。

### BA17：有限回归、研究归纳与恢复入口

- [ ] 运行受影响测试、主/研究类型检查及当前结果零调用汇总；仅对新增变更/失败重复。
- [ ] 更新既有研究§1/§7.62/§11、spec§14.40、current-status、当前plan、实际接口涉及的usage/developer-guide。新结果只用一份summary/status/accounting/verification与短README。
- [ ] 文档测试及本轮链接检查通过即可；4条已知冻结历史日志断链保留，不全历史清扫。不新增日期化docs/skill-ir报告。
- [ ] 提供一个普通用户可执行的完整流程和具名恢复位置；命令由公共入口实际验证，不交付只有study内部能跑的实现。

### BA18：提交发布与真实验收

- [ ] 按功能提交本轮代码/测试/文档/证据，暂存白名单确认，无凭据或其它线程修改；推用户origin并核对远端。
- [ ] 状态同时列工程责任、真实使用、研究效果、未执行位置及原因。未实现的BA项继续标partial/open，不以文档写完替代执行。
- [ ] 研究目标仅在真实完整链与对应效果条件有证据时标达成；正常质量未知、通道阻断或负结论均诚实收束。没有必要等到固定小时数，更不能承诺必须正向。

## 四、位置与验收

主位置为 **22个**：2个子性质开发、12个完整质量、2个作者包消费、6个变化。每个逻辑位置可有具名修订，但不变成新独立样本；通道恢复同样归属原位置。未运行保留分母和原因。各类成本分别汇总，重叠使用证据不重复计数。

BA0注册稳定位置ID：`pilot-download`、`pilot-owui`就是BA9的两项；`quality-{download|owui}-{N|M|D}-repeat-{1|2}`为12项；`consumer-download-inquiry`、`consumer-owui-native`为2项；`change-download-{policy|premise|source}-{fresh|previous}`为6项。修订和通道恢复只增加同positionId下的attemptId，不再增设“子性质成功”样本。

| 层级 | 验收依据 |
|---|---|
| 交互工程 | 实际展示的合同可填写、编译一致、错误精确、预算有限且可用；旧版本兼容 |
| 领域采用 | 真实提案产生当前材料/性质绑定，检查有非空轨迹且错对象/失效反证有效 |
| 任务可用 | 完整原问题有有据结论和必要条件；源码语义与机械检查各自成立、范围明确 |
| 质量效果 | 同版本、同题同事实的自然答案评价；协议失败和未交付保留 |
| 编写与复用 | 原包/新包真实消费，变化后保留正确性，准备/恢复成本完整可见 |
| 未达项 | 具体责任、最小复现、最后已验证状态与后续动作；不以测试数替代效果 |

工程里程碑尽早进入真实运行，不等所有可选优化完成。明确共享错误先修再继续；账号确实受阻时把时间用于有具体红测的工程工作，不等待/重复请求凑时长。

## 五、启动时可用命令

```powershell
Set-Location 'D:\skill优化\SkVM'
git status --short --branch
bun test ./src/benchmarks/authorization-dsl/inquiry-native.test.ts ./src/benchmarks/authorization-dsl/inquiry-focus.test.ts
bun test ./src/adapters/codex-account-session.test.ts ./src/adapters/codex-account.test.ts ./src/benchmarks/authorization-dsl/source-assisted-entrypoints.test.ts
bun test ./src/task-dsl/authorization/source-interpretation.test.ts ./src/task-dsl/authorization/property-query.test.ts ./src/benchmarks/authorization-dsl/property-runtime.test.ts
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
```

这些是已存在的定位/验证入口，不必接管即全部重跑。新study命令在BA0实现后写入本节及结果README；不把尚未存在的恢复命令展示为可执行。官方网络传输沿现有账号适配，不新增裸模型旁路。研究问题、实现缺陷及解决过程统一追加研究总文档，不新开第二份研究正文。

当前已实现：`bun results/skill-ir/skill-dsl-research/development/authorization-semantic-submission-v1/study.ts dry-run|prepare|run <positionId> [named-revision]`，`equivalence`为零调用共同输入核验。真实恢复位置为`run pilot-download`；先核实原终态及ready，登记parent/reason，一次恢复后重复routing会封闭通道。变更位置要求当前合格基础，不从历史报告替代。
