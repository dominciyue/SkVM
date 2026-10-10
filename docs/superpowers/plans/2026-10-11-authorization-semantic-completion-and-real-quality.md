# BD0–BD16：源码解释持续补齐、独立性质检查与真实质量比较

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` 按本任务书实施。用户已要求派发 `gpt-6.1-sol/max` 新开发线程，连续推进，不在常规阶段等待确认。主开发线程负责代码、方案取舍、验证及 Git；探子只做边界清楚的只读探索。

**Goal:** 让模型在真实源码上提交的不完整解释能够持续补齐，使已采用的跨源材料及时进入性质检查，并通过完整原 skill 的同期对照和合格材料的变化复用检验实际价值。

**Architecture:** 复用任务性质准备、v7 调用实例与对象关系、渐进 source-edit、只读取证和官方账号入口。把“接受一次编辑”“完成一项解释责任”“取得当前性质结果”“交付完整自然答案”分开管理；不增加通用语言引擎或另一套 CLI。

**Tech Stack:** TypeScript / Bun、Zod、既有源码索引与有限求值器、SkVM inquiry/native、官方账号 adapter、当前研究归档及源码评阅。

---

## 1. 身份、授权与执行范围

- 日期：2026-10-11。任务书状态：`completed-with-unmet-criteria`，有限外部执行结束、BD16已发布至`14aeb7f1`且远端SHA一致；实施基线`7f4ca507a853a1207a5d8fab858f838a9af566b8`，接管时live origin同SHA、工作树干净。BD0–BD9工程至`d747f44d`，联合179tests/1304断言、主类型与15文档测试通过，BD13负例在该集合；研究9tests/46断言及研究类型通过。1诊断与4质量首件全交付，四整题0full，两对tradeoff/negative，0合格跨源性质，六变化具名未运行。BD1精确机械重放与开发人工正例分存；finiteQueueComplete/researchGoalAchieved仍false。
- 已复核开发基线：`f37ee589ba5c6dceaaed44b005e52d6996ea76b6`。启动时记录任务书提交后的真实 HEAD，不把它当研究结果。
- 开发模型 `gpt-6.1-sol`，reasoning `max`。实际仓库 `D:\skill优化\SkVM`，继续 `skill-ir-aot`，仅推用户 `origin`，不新建分支/worktree。
- 新研究 identity：`authorization-semantic-completion-v1`；结果根目录 `results/skill-ir/skill-dsl-research/development/authorization-semantic-completion-v1/`，本轮运行空间 `D:\skill优化\project-maintenance\runs\authorization-semantic-completion-v1`。
- 实验继续用已授权官方账号 `gpt-5.6-sol/high`。开发模型与被测模型分开。第三方 API 仍暂停；不请求用户重复批准这组实验。
- 已暴露 Download 原四题、完整原 skill、允许源码及既有三变化为本轮真实范围。OWUI 仅离线反例；BB 两次未知终态/最终费用及处置保持原样，不重新派发其任务。
- held-out、Q1 reserve、prospective、readiness及历史`0/6`保持；本轮不选择新成员，不替换原始失败或旧冻结证据。
- 代码配置显式 `semantic-completion-v1`，继承 `task-binding-v1` 和 v7 核心。旧默认、旧策略的可重放解释不悄悄升级；只版本化实际改变的模型交互合同，不再复制一套领域内核。
- 开发精力继续约六成质量、四成编写与复用。没有“完整率达到六成即可”的标准，也不要求为时长重复工作。
- 发现共享缺陷立即保存首件、定位、红测、修复和具名复验。新根因可继续处理；不能把“至多一次局部修复”解释为本轮只允许修一个问题。

## 2. 必读上下文与复核依据

亲自阅读以下权威原文；历史巨型日志按具体问题定位，不重新审计整库：

1. `D:\skill优化\AGENTS.md`、仓库 `AGENTS.md`、[当前状态](../../skill-ir/current-status.md)、本任务书、[当前计划](../../skill-ir/skill-ir-aot-optimization-plan.md)。
2. [spec §14.43](../../skill-ir/skill-ir-aot-optimization-spec.md#1443-bd-semantic-completion-and-real-quality)及相邻 §14.41–14.42；[研究总文档 §1、§7.64–7.65、§11](../../skill-ir/skill-dsl-research.md#765-bd-解释持续补齐与独立质量比较)。
3. BC 根目录 `results/skill-ir/skill-dsl-research/development/authorization-task-binding-v1/` 的 `verification/acceptance-matrix.json`、`accounting.json`、五个 `attempts/*/*/source-review.json`。
4. 三处原件优先点验：`attempts/native-download/preparation-and-question-binding-1/run-result.json.gz`、`attempts/premise-fresh/original/inquiry-run.json.gz`、`attempts/source-fresh/original/inquiry-run.json.gz`。分别定位 partial 接收/缺字段、格式耗尽、入口与效果绑定不足；只抽取相关事件，不把整个巨大 prompt 打印进开发上下文。
5. 下表对应源码和测试；[usage](../../usage.md)、[developer-guide](../../skill-ir/developer-guide.md)对应入口。必要时查根 handoff/communication 的当前授权，不读取历史凭据。

### 已核实的事实与尚需红测的判断

| 事实 | 本轮责任 |
|---|---|
| BC 五次均 completed 并自然交付，17 prepared，0 合格跨源性质 | 当前主要瓶颈在解释生成/连接/完成过程，本轮不要先扩大任务数量 |
| 五次四题评阅为 11 full / 9 partial；Q1 为1/5、Q2为4/5、Q3为5/5、Q4为1/5 | 这些是重复任务与变化，不是20个独立任务；保留自然回答的价值和真实遗漏 |
| native 修订中 `file_response` 已接收、`complete=false`，还有7项字段未补 | `accepted` 保存了材料；是否漏排决定性补齐责任，必须用公开路径红测确认 |
| `inquiry-focus.ts` 的 `unaccepted`/`finished` 排除已有单元；已有 repair 主要处理参数 mismatch | 不直接删除全部调度限制；建立与当前性质有关的持续补齐责任 |
| premise 三次源码格式拒绝后，终答缺 `paths[].explanation`，`checksUsed=0`、`deliveryClosed=true` | 格式预算已与语义检查分计，但编辑和终答共用格式额度，仍会互相阻断 |
| `checkPropertyQueries` 在 runtime 的 `validate()` 才执行 | 让性质计算跟随有效材料状态，终答传输单独验收 |
| BC 四个 fresh 质量位置也要求 qualified DSL property | 修正新研究的准入：答案比较不要求 DSL 已成功，previous 保持材料资格要求 |
| BC native runner 没有设置可供 previous 读取的 `sessionPath`，inquiry 入口已有完整会话 | 优先复用已有会话入口并验证完整原包消费；不能让真实性质成功后再被归档形状挡住 |
| 公共跨文件测试使用脚本给出的完整语义提案 | 保留它们，再补真实不完整提案、阶段误用及渐进恢复的公开路径测试 |

上一轮复核新鲜通过49 tests/369 assertions；BC的1,833通过/1跳过为归档联合结果。准备80.59s→21.58s和派生重放恢复均有证据，本轮只防回归，不重新定位已解决的热点。

## 3. 本轮设计决定

### 3.1 已采用与待补齐同时存在

复用 `PropertyDemand.required/frontier/nextWork`、原源码位置、调用实例及已保存草稿，维护当前问题所需的解释责任。`complete=false` 不自动要求整函数全部解释；只把对当前性质仍有影响的未完成责任送回模型。源码不明或用户前提未知可留有具体依据的残余，不猜值。

最小内部记录可以采用以下形状，实际字段对齐现有类型后在本页记录变更：

```ts
import type { PropertyRequirement } from "../../task-dsl/authorization/property-demand.ts"

export interface SemanticCompletionItem {
  key: string
  questionId: string
  operationId: string
  handle: string
  sourceId: string
  sourceRevision: string
  receiverClass?: string
  callInstanceId?: string
  anchorId: string
  field: PropertyRequirement["field"] | "propertyBindings" | "call-binding"
  state: "pending" | "offered" | "resolved" | "residual" | "stale"
  reason: string
  unchangedAttempts: number
}
```

`key` 来自当前 question/operation/source revision/handle/receiver/call instance/anchor/field；不是仓库名、函数名或预期结果。只修一个字段不会消掉同一函数其他责任。`resolved` 必须来自当前 demand/绑定检查实际变化；改一句解释或重复提交不算进展。

每次展示一个小而相关的字段组及必要原文、保留值、允许形状。相同责任连续两次有效反馈后仍无保留进展，转具名 residual 并推进其他原题；依赖或草稿真正变化后可以重开。范围、总工具预算和最终交付仍有界，不无限回访，也不因已接受 partial 永久跳过。

### 3.2 性质检查独立于终答外壳

把现有 `checkPropertyQueries` 提取为当前材料状态的共享计算，`validate()` 复用其结果。合法语义修改、绑定清除、依赖状态变化、政策/前提变化和源码失效均需要更新或撤回相应结果；重复渲染同状态不重算。

- 检查输入仍是当前 program/slice/source units/dependencies/demands，不从自然答案反推守卫或效果。
- 缓存键必须包含上述语义依赖，不能只依赖 `slice.revision`；依赖状态单独变化也要失效。
- 计算必须使用一次确定的当前快照，不在渲染/检查过程中递归调用focus同步或修改工作队列；测试重复report不会增加求值或改变事务。
- 将 `propertyCheckStatus` 与 `finalDeliveryStatus` 分开。终答缺字段不伪造成功答案，也不抹掉原材料上的独立检查记录。
- 无效**语义编辑**必须使受影响旧 verdict 不再作为 current 使用。单纯**终答格式**错误可保留当前源检查，但不能保留已撤回的旧最终答案。raw 首件照常归档。
- 自动检查是确定性计算，计 `propertyEvaluations` 和耗时，不冒充模型调用、不烧掉保留的 final check 槽。

2026-10-11实施细节：缓存一次捕获program/slice/units/drafts/demands/dependency states和当前源码拒绝，report不驱动队列。静态通道公开mock发现原检查把“caller守卫→所选调用→callee primitive effect”的不同实例误作无前序；新`evaluationVersion:"semantic-completion/v1"`按实际所选调用的前序实例匹配，仍逐个检查效果对象。旧策略保留原求值版本。查询责任按同一原题的当前source owners唯一绑定关闭，禁止不同原题代替或重复绑定。

### 3.3 模型只承担当前阶段真正需要的语义

现有任务准备继续使用。源码阶段优先复用 `source-edit`，模型看到一个当前编辑表单及实际原文；宿主提供当前事务、版本、单位和字段定位。只暴露一种推荐提交方式；旧低层完整 interpretation 作为兼容接收，不在同一提示里并列展示多种嵌套模板。

如现有 Schema 无法做到，允许新增窄的模型端 envelope，由宿主展开为已有 `SourceEditSchema`。禁止从错误输入猜 role、condition、permission、principal/resource 或源码关系；未知字段、模糊目标、旧事务明确拒绝。删除可选值与“未提供”分别处理。

**官方账号的重要约束：** `thread/start` 的工具声明是静态的。只改 provider 的 `beforeDispatch` 阶段工具并不能证明官方通道已改善。须检查真实发送的静态工具 Schema、当前 context、宿主准入三者一致；阶段不匹配按当前事务返回精确修改说明。

### 3.4 预算分开，成本全部保留

沿用64总工具、768KiB源码展示、32MiB读取、45分钟会话。源码编辑与终答格式分别设置有限恢复计数；每个阶段首次错误后的两次修正机会，局部无进展规则更早触发时优先结束该责任。两阶段共享64总工具和下述预留额度，不按阶段额外扩容。语义最终检查仍最多2次。

源码格式额度耗尽后，保留源材料，进入终答阶段；终答仍有自己的格式修正机会，总工具预算继续收费并约束所有动作。调度主动为最后交付留下最多4个总工具单位（首次提交、至多两次格式更正及一次必要语义修订）；不是无条件增加到68工具。所有 rejected/blocked attempts 都计入真实总量。已有事实更新不得复活无效结论。

### 3.5 分支完整性从真实源码产生

复用已有控制流与问题义务，为模型显示“哪些相关分支已解释，哪些仍未知，以及阻断哪项结论”。源内可读却未解释的条件、源码范围外依赖、用户未给的运行值、独立政策缺失分别记录。

生产提示不得写入 Paperless 的正确版本规则或评阅答案。缺省/空值/显式选择、提前拒绝、资源变化、返回回退等匿名结构测试可使用明确测试含义。真实 Q1/Q4 的改善必须来自本次读取和解释。

### 3.6 比较与复用各用自己的准入

新质量比较仅要求当前公共输入可运行、共同源码/任务/模型/预算/完整skill一致，以及传输/只读合同已通过。D 即使全部性质 unknown，也执行该比较并如实计入。保留协议失败的端到端分母，另列有效回答的源码质量。

previous 继续要求同一性质、当前有效源材料、独立源码支持、可读取会话和失效信息。政策/前提变化重算结论，源码变化失效受影响解释；不能把 fresh 当 previous 或复制自然答案作为已检查材料。

## 4. 文件责任

以下均相对 `D:\skill优化\SkVM`；新线程按符号定位，不依赖可能变化的行号。

| 责任 | 修改现有文件 | 可新增文件 |
|---|---|---|
| 持续解释责任与调度 | `src/benchmarks/authorization-dsl/inquiry-focus.ts`、`inquiry-domain-runtime.ts`、`inquiry-progress.ts`；`src/task-dsl/authorization/property-demand.ts` | `src/benchmarks/authorization-dsl/semantic-completion.ts`及测试 |
| 窄模型提交合同 | `inquiry-wire.ts`、`inquiry-focus.ts`；`src/task-dsl/authorization/source-edit.ts` | 确需分离时建`src/benchmarks/authorization-dsl/semantic-completion-wire.ts`及测试 |
| 性质计算/失效 | `inquiry-domain-runtime.ts`、`property-runtime.test.ts`；`src/task-dsl/authorization/control-conclusion.ts`及`property-query.ts` | 优先复用现有类型和函数 |
| 双入口与预算 | `inquiry-native.ts`、`inquiry-run.ts`、`inquiry-local.ts`；`src/adapters/codex-account.ts`、现有CLI选项 | 窄显式选项，不新建执行循环 |
| 新配置与旧兼容 | `src/task-dsl/authorization/control-slice.ts`、既有策略解析和指南 | 显式`semantic-completion-v1`继承链 |
| 公开路径测试 | 当前native/wire/focus/property测试 | `src/benchmarks/authorization-dsl/semantic-completion-public.test.ts` |
| 研究 | 本轮结果根目录 | 小型study/runner/evaluation测试与机器原件，复用共享归档；禁止修改BC runner来承载BD |

不要批量重构目录、增加框架适配器或继续补 Python descriptor/decorator/module/Go 语义。若一个现有表达缺口确实挡住选定真实性质，先形成最小源码反例，再做有界共享修改并记录取舍，不按300行或测试数量判断价值。

## 5. BD0–BD16 工作队列

所有代码任务按“具体红测 → 预期失败 → 最小实现 → 定向绿测 → 阶段提交”推进；不每完成一个测试都做一轮历史全量审计。下面的断言是新测试适配器应验证的合同；适配器只能读取真实公共结果，不能生成成功单元。

### BD0 接管、登记与原件边界

- [x] 核对分支、原有修改、其他写线程及用户origin。记录本轮实施基线。
- [x] 创建新identity的manifest/status。区分`requirements`、`observedOutcomes`、`executionClosed`、`researchGoalAchieved`，初始成果一律pending；最小研究命令在BD9接通。
- [x] 登记第六节位置、输入、评价、恢复规则；BC五原件、BB未知处置按原路径引用，不复制历史结果成BD成功。
- [x] 小范围读取三件失败事件，形成责任表：触发参数、当前context、接收结果、材料状态、下一个focus、剩余预算。重复测试输出不进研究正文。

### BD1 从真实不完整提案建立红测

- [x] 在`semantic-completion-public.test.ts`建立公开fixture：复用现有`createInquiryTools`、`compileAuthorizationInquiry`、`createInquiryDomainRuntime`；通过`promptContext/propose/report`走真实事务。
- [x] 以BC已公开的partial形状建立匿名跨文件案例：合法角色先提交，决定性call role/condition稍后提交，helper先/后读取、同函数多题、同helper双调用分别覆盖。测试含义写明是手工fixture。
- [x] 记录BC真实提案的零调用派生重放；只机械迁移新事务身份，原语义缺失照留。另建显式人工参考提案用于判断表示能力，放evaluator/development，绝不发给真实模型。
- [x] 回归至少验证以下行为；将真实读取与提交过程封装为本文件内的fixture helper后执行断言：

```ts
expect(afterPartial.acceptedSourceUnits).toBeGreaterThan(0)
expect(afterPartial.unitComplete).toBe(false)
expect(afterPartial.pendingFields).toContain("role")
expect(nextOffer.sourceId).toBe(afterPartial.sourceId)
expect(nextOffer.handle).toBe(afterPartial.handle)
expect(afterRepair.retainedEarlierFields).toEqual(beforeRepair.retainedEarlierFields)
expect(afterRepair.resolvedRequiredFields).toBeGreaterThan(beforeRepair.resolvedRequiredFields)
```

- [x] 当前实现若在某例已经满足要求，记录通过，转最窄失败例；不为制造红测破坏代码。先确认责任确属调度，再实施BD2。

### BD2 保存当前解释责任

- [x] 实现第3.1节内部记录与从当前demand、query绑定及call mismatch生成责任的纯函数，输入全部来自当前来源。
- [x] 红测覆盖：保存partial不消待办、只修字段A不清字段B、相同id不同source revision/receiver/call分离、已证不相关分支不入队、源失效转stale、显式unresolved留原因。
- [x] 进展按实际字段/依赖状态度量，测试重复同值和只改文字不重置无进展计数。
- [x] 提交`feat: retain question-bound semantic completion work`。

### BD3 接入focus并完成公平推进

- [x] 红测覆盖已接收`complete=false`且仍有决定性missing/invalid字段的单元被重新提供；手动`revisit`不是唯一恢复方式。
- [x] 复用当前`retainedUnitItem`、草稿和`start`；相同source/receiver下保留handle，过期来源先失效。不要全量删除`finished`或取消预算。
- [x] 以当前性质到effect/guard/对象/控制的实际缺口优先，轮转原问题；共享后续问题不得因为第一题没有成功verdict永远拿不到自己的合法绑定事务。
- [x] 无进展两次转residual并留下原责任；helper/源版本变化能够重新开合适项，不无限重抽。
- [x] 公开测试验证：第二题独立完成、第一题仍partial；source/helper修复后只关闭对应责任；不会复制另一题的propertyBinding或verdict。
- [x] 提交`fix: revisit adopted partial source meaning without starving questions`。

### BD4 独立计算当前性质

- [x] 在`property-runtime.test.ts`与公开fixture先测：零次`authorization_check_result`时，合法源提案已使当前性质产生`checked/violated/unknown`和实际trace。
- [x] 从`validate()`提取共享计算；缓存当前来源、草稿、问题/政策/前提与依赖状态，渲染只读；相同状态不反复计算。
- [x] 分别验证失效：删binding、错误新语义、源SHA变、依赖从read变checked、政策/前提变化；终答只有格式错时保留独立源检查，finalDelivery仍失败。

```ts
expect(beforeFinal.semanticChecksUsed).toBe(0)
expect(beforeFinal.propertyEvaluationCount).toBeGreaterThan(0)
expect(beforeFinal.propertyTraceSourceCount).toBeGreaterThanOrEqual(2)
expect(afterMalformedFinal.finalDeliveryValid).toBe(false)
expect(afterMalformedFinal.currentPropertyBasis).toEqual(beforeFinal.currentPropertyBasis)
expect(afterInvalidSemanticEdit.currentCheckedVerdicts).toHaveLength(0)
```

- [x] `wholeTaskCertified`仍false，source语义仍需独立评阅；新增计量不伪装成模型检查次数。
- [x] 提交`feat: evaluate source properties independently of answer transport`。

### BD5 缩小当前模型提交合同

- [x] 把BC的四类真实格式失败写入`inquiry-wire.test.ts`/native公开测试：错误edit字段、混淆schemaVersion、缺role/explanation与null数组、终答路径缺explanation。
- [x] 选择一条推荐source-edit模型形式，宿主填当前机械外壳；原字段含义和非法值保持严格校验。不同时广告完整interpretation、低层unit和patch三套答案。
- [x] 示例合同只允许宿主机械展开；完整具体Schema必须在本阶段写入代码与组件文档后再跑模型：

```ts
type OfferedEditField = {
  slot: string
  anchorId: string
  field: string
  sourceStartLine: number
  sourceEndLine: number
  expectedShape: unknown
}
type CompletionEditProposal = {
  transactionId: string
  edits: Array<{ slot: string; value: unknown }>
}
```

slot只引用本次提供的anchor/field；`value`进入现有对应Zod字段验证，unknown不代表任意语义可执行。恢复返回准确slot和允许形状，不输出正确答案。
- [x] 官方静态tool声明、运行时phase验证、实际context三者做公开transport mock核验。provider兼容路径也测，不以`beforeDispatch`单侧通过代替官方账号接线。
- [x] 窄合同随`923fe56e`及`ad4b5bce`提交，与focus/自动计算依赖合并，未另造重复内核。

### BD6 分离编辑与终答的恢复预算

- [x] 复现premise形状：三次源码格式失败后首次终答漏字段，仍能获得独立的有限更正机会；格式错误计总工具但不计语义检查。
- [x] 两公共路径采用一致语义。源码无进展可转residual；最终答案有效后正常结束；连续错误达到上限明确交付失败。
- [x] 测试总量永不超过64；保留的final单位不会被自动read吃掉；不足时给具名原因；拒绝/撤回后不能交付过期答案。

```ts
expect(budgetAfterSourceErrors.semanticChecksUsed).toBe(0)
expect(budgetAfterSourceErrors.finalFormatRemaining).toBeGreaterThan(0)
expect(afterFinalCorrection.finalDeliveryValid).toBe(true)
expect(afterFinalCorrection.totalUsed).toBeLessThanOrEqual(64)
expect(afterStaleSource.currentCheckedVerdicts).toHaveLength(0)
```

- [x] 提交`fix: reserve bounded final delivery recovery independently`。

### BD7 将分支和缺失事实落实到原问题

- [x] 以匿名“参数缺省/空值/显式选择、过滤、回退、提前拒绝、选中不同对象”源码测试现有表达是否足够，不先扩语法。
- [x] 从已读取AST和模型当前提案构建原问题的分支/缺口视图：source位置、当前解释、受影响性质/原问题、缺的是源码解释还是用户值。
- [x] 不要求模型为所有函数填满角色；优先补当前effect/guard/对象路径。无法确定相关性时给具名待判断，不把未知误剪为无关。
- [x] 终答要求逐项说明“缺什么→哪条结论暂不可确定”，保留可确认的源内顺序。测试已允许且已读的router/helper不能自动标成范围外。
- [x] Q1/Q4真实正确答案留评价侧；生产只提供通用规则和原文。
- [x] 提交`feat: connect source branches and missing facts to original duties`。

### BD8 普通入口与可恢复会话接通

- [x] 复用`executeLocalInquiryRun`的完整skill加载、源快照、`session.json/input.json/run.json/report.json`和inspect/previous；它已经走同一官方native核心。
- [x] 为N/D同期比较提供一致的会话入口。若需暴露`domainTools`开关，窄范围贯穿现有local/CLI/account参数，默认兼容；N明确关闭领域工具，D显式启用新策略。禁止研究runner私造可复用session。
- [x] 采用组合验证：两入口匿名公开mock覆盖无properties→准备→读源→partial编辑→定向修复→自动性质→终答；普通会话mock覆盖完整skill加载/归档。完整原包/四题在四同期真实首件实际上下文中核对，不宣称有一个单体mock同时穿过完整原包四题全链。此测试组织调整避免重复构造同一原任务，保留两类证据的边界。
- [x] 会话搬移与只读inspect重建同一当前材料；源码变化使对应材料失效。无合格previous由原入口零调用返回具体原因。
- [x] 如果原生`skvm run`还不能直接被previous读取，复用现有会话写入帮助函数做无损接线，或明确把现有inquiry+完整skill作为本轮真实可恢复入口；不把未接通的原生入口写成已支持。
- [x] 提交`feat: retain reusable sessions for ordinary skill analysis`。

### BD9 实验实现与公平性检查

- [x] 在本轮研究目录实现小型`study.ts`、runner、evaluation和测试；复用公共运行/终态/计量函数，拒绝旧identity或BC gate暗中混入。
- [x] 写红测：D的当前性质全unknown时，N/D质量位置仍可派发；同一记录不能作为previous合格基础；未见源码/错误包/非法输入仍不能进入。
- [x] N/D均加载完整相同skill和四原题、模式/政策/前提、同允许源码；不把D独享的人写正确性质或历史源解释放进上下文。D自动准备及修复算自身成本。
- [x] 解包实际thread/start与后续tool响应核验原四题/原包、同source scopes、同模型/effort/总预算；evaluator哨兵全不出现。相同任务语义比输入字节完全相同更重要，任何差异需说明。
- [x] `prepare`与`replay`零模型；`run`只收登记ID与具名修订；只实现本轮需要的子命令，help和精确命令写回第八节后才派发。
- [x] 提交`test: separate quality comparison from checked-material reuse`。

### BD10 单次真实解释诊断与现场修复

- [x] 运行`extraction-download`一次：输入仅原Q2和共同允许源码，未喂人工参考。模型准备器展开两性质，0源编辑、两unknown；严格单性质条件未达，保留首件不回删。此为开发诊断，不计完整任务质量或泛化样本。
- [x] 记录每个责任从offered→原提案→accepted→pending/resolved→query的转移；区分没有读、看懂未提交、格式拒绝、被接收未调度、表达缺口、真实unknown。
- [x] 若失败，当场按责任修共享代码/合同，定向红绿后一次具名复验。两次同因无进展停止该点重抽，继续离线定位和独立工作；没有local checked也可进入BD11质量比较。
- [x] 人工参考提案只用于判断内核表达能力，归档为developer-authored；它通过不计真实模型采用。

### BD11 完整原任务的两次同期N/D比较

- [x] 按N1→D1、D2→N2执行四位置，均保留四原题。每次终态后及时评阅，再决定后续修复；不等跑完整个面板才处理已知共享缺陷。
- [x] D应观察持续责任、自动性质、完整原包是否实际使用。N不要求拥有D独有checked字段。
- [x] 如果共享实现修改影响比较条件，保留旧首件，新epoch以具名身份补齐匹配的一对；不得拼两版本最优值。相同原因两次无改善转诊断。
- [x] 独立评价逐题完整/正确/源码有据，另外核对局部性质当前trace。重点核验Q1所有相关选择分支、Q2授权顺序、Q3授权对象、Q4缺失事实与结论映射；评价信息不能反馈成运行时答案。
- [x] 即使D无合格性质，也完整报告N/D实际差异；两次重复只显示当前开发样本稳定性，不推统计显著或跨项目优势。

### BD12 同包的政策、前提、源码变化复用

- [ ] 原三变化fresh/previous实际pair未执行：当前0合格基础，六位置具名`unrun-material-ineligible`；原变化输入与四题保持。
- [x] 进入pair需要当前原任务里至少一个独立源码支持的合格跨源性质和可恢复会话；可以仅验该局部材料，但完整四题仍评阅。已完成BD11却无合格基础时六位置具名未执行，停止重复fresh凑结果，推进BD13–BD16。
- [ ] 真实previous采用/重算/省读未测；普通入口和确定性会话/失效测试已有，不能计实际复用。
- [ ] 真实source pair的依赖失效未测；确定性撤回验证保持，不能计变化收益。
- [x] 实际行为与确定性失效测试分开；新格式或语义错误仍按现场修复规则处理。

### BD13 反例与有限兼容验证

- [x] 复用并检查：错误对象、两调用实例、guard在effect之后、未注册middleware、unknown返回、stale source、绑定撤回不复活、无效终答不交付、问题缺失不被吞。
- [x] 增加partial恢复的反例：错字段未解决原责任、另一题正确解释不能关闭本题、缓存后依赖失效撤回结果、无进展不会无限耗预算。
- [x] OWUI已暴露结构只做离线输入对象权限与目标collection权限分离，不追加其真实未知请求。
- [x] 集中跑一次受影响联合测试与主/研究类型；有新修改才重复对应集合。

### BD14 效果、归因和费用

- [x] 为每attempt建立原题→prepared→source edit→采用→当前性质→原题终答→独立评阅的关系表。无check、unknown、错误、未交付分别统计。
- [x] 计端到端完整率、已交付答案质量、每题质量、源码引用、实际检查/修复、总工具/格式拒绝、input/output/cache、耗时、实际材料复用。input含cache时只计一次。
- [x] 同一attempt被引用不加样本或费用；独立计开发诊断、首件、修订、变更和未知。USD/隐藏请求/开发与探子token/真人分钟没有观测就保留unknown。
- [x] 预先采用五类结论：support、tradeoff、no-observed-difference、negative、inconclusive。质量提高与开销增加可并存；质量相同仅耗时下降时按该维度说，不换成稳定净收益。

### BD15 普通使用与研究复盘

- [x] 在现有usage/developer-guide说明完整原包的真实命令、partial如何继续、独立性质状态与最终答案、材料复用条件；无需新HTML或长期文档。
- [x] 研究正文只追加§7.65，并同步§1/§11；spec§14.43/current-status/当前计划更新真实实施结果。历史BC原件/结论保持。
- [x] 每个未达项给一个具体代码责任和最窄证据，不只写“模型没填”“质量未达”。根conversation_log记录阶段和验证，handoff/communication记录交接决定。

### BD16 发布和交接

- [x] 受影响测试、主/研究typecheck、文档单测、当前变更链接/导航、差异和新增原件可读性通过。全仓链接检查的八条历史失效经启动基线核实为既有问题，保留原件并单列；不写全仓全绿。有限抽核输入/答案/当前源码绑定，不再全量历史审计。
- [x] 仅提交本轮归属变更，推用户origin/skill-ir-aot；实质发布`14aeb7f1`与live远端SHA一致，32原件从提交读回、五gzip可解压且字节一致，[发布回执](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-completion-v1/verification/publication.json)随后单独提交。其他线程和历史本地材料保留。
- [x] 分别填写工程、真实局部检查、完整原任务质量、比较、复用和净收益。有限执行结束而关键项未达时保留`completed-with-unmet-criteria`，不标研究目标完成。
- [x] 若取得正向结果，明确是哪题/性质/变化、多少真实重复和多少总成本；若没有，准确交付改善前后机制与真实结果，不再扩无关语义。

## 6. 有限运行位置、配对及失败处置

本轮实施记录以[验收矩阵](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-completion-v1/verification/acceptance-matrix.json)、[summary](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-completion-v1/summary.json)、[收束](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-completion-v1/verification/authorized-execution-closeout.json)为准。已勾选表示该开发/观察责任已执行，不表示所有研究要求成功；未执行的三真实变化pair及previous效果保持未勾选。工程七提交`e041e903`、`923fe56e`、`ffcae40a`、`4a1976ba`、`ad4b5bce`、`ad42b0d4`、`d747f44d`按依赖归并了原拟提交目的。公开mock分别覆盖传输/core的partial恢复与普通完整skill会话，真实四首件再核验共同原四题和完整22文件bundle；人工fixture不计模型采用。

本轮登记1个诊断、4个质量、6个变化，共11个逻辑位置；具名修订是额外attempt，失败与成本保留，不替换首轮。

| 位置 | 入口与目的 | 准入 |
|---|---|---|
| `extraction-download` | 真实局部解释诊断，12工具/同允许源范围；不计整题效果 | 新公开partial恢复和协议测试通过 |
| `quality-n-1` / `quality-d-1` | 完整skill+原四题第一对 | 公共输入/只读/协议可运行即可，**不要求D有合格性质** |
| `quality-d-2` / `quality-n-2` | 第二对，交换顺序 | 没有尚未修复的共享工程故障 |
| `policy-fresh` / `policy-previous` | 原包政策变化 | 当前合格局部材料与可恢复会话，两个入口使用同变化 |
| `premise-fresh` / `premise-previous` | 原包前提变化 | 同上，当前性质重算 |
| `source-fresh` / `source-previous` | 原包源码变化 | 同上，依赖失效后再用 |

原任务输入：`results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/model/packages/download/inquiry.json`。原skill：`results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/SKILL.md`。变化事实源：BC的`model/inputs/download-policy.json`、`download-premise.json`、`download-source.json`；启动时验证其sourceRoot和原四题，不手工补正确properties。

N是完整原skill加同一只读源码工具、关闭领域工具；D同输入加新策略。优先都用现有local inquiry+完整skill+官方account静态工具的会话路径，避免N/D外围生命周期不同。不得将M/legacy仍开启领域工具称作裸N。完整运行同64工具/768KiB显示/32MiB读/45分钟，局部诊断预算单列。

遇到差结果先保存原始输入、实际模型上下文、响应和终态，判断根因。共享Schema/宿主故障先修复再跑受影响位置；模型含义缺漏用当前原文与通用合同定向恢复，不把评阅答案粘进prompt。安全拒绝、错误对象、真正缺失事实要保留，不为成功而修成allow/checked。

明确终态routing失败允许一次具名恢复；连续两次routing失败或累计三次恢复仍失败，暂停本轮新外部派发，推进离线工作。quota/auth直接暂停外部；unknown只核查原请求生命周期，不能自动重发/换账号/清锁。通道正常时不增加健康探针、不重问授权。

## 7. 可复核的完成标准

| 层面 | 要求 |
|---|---|
| 工程 | 当前partial责任可持续完成或具名终结；独立性质计算、失效、窄协议、预算及会话有公开路径测试 |
| 真实局部机制 | 实际模型提案产生至少一个当前跨源checked/violated，含非空调用/对象trace，并经独立源码复核 |
| 完整原任务 | 四题均保留、逐题评阅；原包实际消费；局部成功不能覆盖其余partial |
| 比较 | 至少一对同条件真实N/D可以解释差异；保留第二对和所有失败，D机器失败仍在分母 |
| 复用 | 同包变化时实际采用合格旧材料、重算并交付当前结论；无法达到时明确具名缺口 |
| 收益 | 分维度列质量、开销、复用；没有观测就不宣称人工/美元/普遍泛化收益 |

本轮允许方法得到负面结果。真正要解决的是“模型的正确局部工作能否被机制接住，以及机制是否帮助它补齐遗漏”。测试总数、接受单元数和文档完成数不作为研究成功指标。

## 8. 已存在的验证命令与新入口纪律

在`D:\skill优化\SkVM`按修改范围选择执行；Windows下Bun路径使用`./`，避免被当过滤词。

```powershell
bun test ./src/task-dsl/authorization/property-intent.test.ts ./src/benchmarks/authorization-dsl/task-binding-closure.test.ts ./src/benchmarks/authorization-dsl/task-binding-shared-properties.test.ts
bun test ./src/benchmarks/authorization-dsl/inquiry-focus.test.ts ./src/benchmarks/authorization-dsl/inquiry-wire.test.ts ./src/benchmarks/authorization-dsl/inquiry-native.test.ts ./src/benchmarks/authorization-dsl/property-runtime.test.ts
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
git diff --check
```

新文件创建后运行其精确test路径。BD9需实现并实际验证`study.ts help`、`prepare`、`run`、`replay`、`summarize`；研究tsconfig继承根配置，再运行本轮`bunx tsc --noEmit -p`。BD9已实现下列入口：`bun results/skill-ir/skill-dsl-research/development/authorization-semantic-completion-v1/study.ts help|prepare <position>|run <position> [named-revision]|replay|summarize`；prepare/replay零模型，run只登记位置。研究类型命令：`bunx tsc --noEmit -p ./results/skill-ir/skill-dsl-research/development/authorization-semantic-completion-v1/tsconfig.json`。质量不要求checked；变化pair要求独立评阅当前原四题材料和可读session。

## 9. 接管后的第一步

完成BD0后，直接从BC native修订的`file_response` partial事务和premise格式失败做BD1红测。先证明是哪一个责任被提前结束、哪一个格式计数阻断最终提交，再修改共享实现。不再从扩充语言语义、增加模型预算或新增评估表格开始。
