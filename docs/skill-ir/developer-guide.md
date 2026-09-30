# Skill IR 开发指南

本指南说明开发入口、组件分工和常用检查。项目进度见 [current-status.md](current-status.md)，历史阶段见 [history.md](history.md)。

## 1. 先建立项目视图

1. 阅读 [current-status.md](current-status.md)。
2. 按任务阅读 [当前 plan](skill-ir-aot-optimization-plan.md)及相关 spec/组件章节。
3. 需要整体背景时阅读 [架构](../architecture.md)、[使用说明](../usage.md)和[JIT Boost](../jit-boost.md)。
4. 检查工作树，保留其他线程的未提交修改。

已实现的通用流程是“真实 trace → 模型优化 → 新 skill 包 → agent 消费”。授权方向另有一个窄域开发能力，用 canonical declaration、义务展开、固定上下文零工具宿主和逐事实评价比较 organized instruction 与领域支持；它已有 opt-in 顶层命令，但不是通用安全 DSL、目标执行器或生产默认安全决策。下文说明可复用的现有工程流程，当前领域工作见[当前计划](skill-ir-aot-optimization-plan.md)与 spec 14.34。

### 1.1 授权 DSL 开发原型

AM共享模块：`control-context.ts::buildControlContext`对实际源摘要、宿主符号ID及范围做纯检查，完整单元按增量UTF-8字节和源码位置分配预算；原选择先保留，可靠小函数扩展单列host-context，大/不可靠单元给省略或range-uncertain。`indexAuthorizationSymbols`复用发现器词法边界，处理Python多行声明、字符串、续行和可确定的单行装饰器；复杂语法仍不是AST/语义调用图。普通prepare的`--context=callable-v1`只支持v2，索引12文件/1MiB、最终64KiB；显式启用时关闭整类成员枚举。报告v2可选controlContext不改变source映射/入口/义务，引用继续不能跨省略。

`authoring-assist.ts`提供`AuthorizationAuthoringContextSchema`、`createAuthorizationAuthoringDraft`、紧凑字段指引和`renderAuthoringTask`。init context生成已知v2元数据/entry seed/guide；领域字典为空，needs-input而非虚构可运行稿。首稿/修订使用同一个publicBrief/outputContract/editScope/knownFields，修订只附candidate/diagnostics。指引明确premise.atEntry是同场景已声明入口的字符串key，branch assumption.condition是同场景conditions的精确key，不能写boolean、描述或lowered ID；该补充在AM生成关闭后加入，未测模型收益。context位置是作者提供，sourceRef仍authored。local edit扩展public-instruction和response-detail，仅替换已有字段并返回affectedText；文本一致性仍由作者/评审决定。

`material-reuse.ts::reusePreparedMaterial`读取旧prepared input与新普通输入，验证全部已绑定raw文件的摘要/缺失状态、repo/ref/入口及快照拼接，再原样继承report和pending gaps；不写文件/调用provider。验证读取新输入实际选择的sourceRoot；身份按repo/ref/相对路径/原始字节绑定，可搬移字节相同的副本，未保留行的变化也失效。它不证明整个仓库或所有allowlisted文件相同，sourceRoot目录字符串不是物理身份。普通prepare的`--reuse`独占发布新assessment/source/report/reuse记录，拒绝与request/discover/proposal/context并用。`transitionPreparedGaps`保留缺口原件与退休理由；resolved需current中新纳入、previous未保留的同路径范围，not-relevant需明确任务scope/premise JSON Pointer的变化和理由。纯前提实验不提交gapChanges；旧无materialBinding报告具名失效，不能默默清空缺口。修改这条链运行control-context/material-reuse/authoring-assist/local-edit-text、普通CLI相关测试及typecheck；普通usage给出字段与命令。

AM研究入口集中在[authorization-control-context-v1](../../results/skill-ir/skill-dsl-research/development/authorization-control-context-v1/)。`study.ts check/replay`核对输入及准备/分析留账，`authors.ts replay`核对8稿/8消费与继承，`evaluate.ts replay`从独立ratings重算两维结果，`accounting.ts`重算全部阶段费用和真实分摊；均零provider。生成前base/shared-revision freeze保持原字节，生成关闭后的指引与核验变化由verification-freeze另绑定原生成freeze、generation-closed和43次调用。关闭标记禁止后续paid派发；重放仍检查当前实现与验证身份，不更新旧hash来绕过拒绝。修改研究driver时同时运行结果根tsconfig类型检查及protocol/generation-options测试。

AM归档在Git中按原字节保存。格式检查只对source快照的末尾空行、带行号preview的行尾空格和manifest/journal原有CRLF设置精确属性；研究driver、生产代码和文档仍走普通检查。不要为了格式检查修改冻结源码、prompt或响应；发布前核对暂存Git blob与工作区归档字节，以及当前verification freeze文件摘要。

[V0–V10 任务书](../superpowers/plans/2026-09-20-authorization-dsl-prototype-development.md)、[W0–W9 任务书](../superpowers/plans/2026-09-21-authorization-dsl-transport-and-evaluation.md)、[X0–X13 任务书](../superpowers/plans/2026-09-21-authorization-dsl-capability-delivery.md)、[Y0–Y14 任务书](../superpowers/plans/2026-09-22-authorization-dsl-transfer-and-value.md)和[研究 §7.19–7.22](skill-dsl-research.md#719-v-开发合同与持续复盘)描述已实现接口及当前扩展。它处理单 repository/ref、fixed-context、source-visible authorization obligation。领域代码位于 `src/task-dsl/authorization/`，实验代码位于 `src/benchmarks/authorization-dsl/`。

公开边界如下：

- `locateAuthorizationSource({root,file,match,limit?})`：只读一个显式文件，字面匹配返回当前文件行号、总行数、邻近上下文、zero/unique/multiple 与截断状态；默认20项，复用portable source reader阻止路径/junction逃逸。CLI为`authorization locate`，不调用模型、不推断函数边界。
- `composeAuthorizationAuthoring(base,replacements)`：可选v2编写辅助，白名单顶层字段整项替换，拒绝重复替换、未知字段、空来源和结构错误，保留base SHA与逐字段来源。不做深merge、表达式或政策推断；返回后仍须普通check验证引用及源码行范围。本轮作者重复工作触发增加，作者原稿未用此后补工具，不声称实测节省。
- `executeMarkdownStudyRun({...local,markdown})`：AB研究入口，独立作者原文替换声明/说明，plain/v4与普通执行共用源码、合同、provider、修复和计量，不把manifest默认分析问题暗中追加给MD。保存原文、来源、路径、SHA与prompt分节；空白或未知来源在provider前拒绝。已存在输出只inspect，同输入/模型/源码/Markdown身份才返回原结果，未知完成不重发。普通CLI无prompt override。模型生成均完成后才消费evaluator。
- 可复用薄包见[SKILL](../../examples/authorization-assessment/reusable-skill/SKILL.md)，依赖已有SkVM/Bun；AB研究数据和脚本集中于[结果根](../../results/skill-ir/skill-dsl-research/development/authorization-external-reuse-v1)。相关验证包含`source-location.test.ts`、`authoring-compose.test.ts`和`markdown-study.test.ts`，修改共享宿主后运行授权聚合与typecheck。

AB离线复现使用结果根的`evaluate-panel.ts --replay`，绑定冻结rubric与review-decisions中的原始响应SHA；它会重写派生review，不改run/result且不调用provider。`verify-prompt-parity.ts --real`核对八状态的作者原文、共同源码与合同。`verify-portable-recorded.ts`把作者输入/源码放入普通临时目录，经注入保留wire完成执行、公共CLI check/inspect/compare，并核对结果payload；这是交付验证，不是新增模型结果。标签、实际授权推理、必要语义与解释分别记录，不能用正文正确覆盖错误canonical标签。

AC编辑资产为[`authoring-v2.schema.json`](../../schemas/authorization/authoring-v2.schema.json)，完整用法见[编辑示例](../../examples/authorization-assessment/editor-support/README.md)。`editor-support/schema.ts`以已有Ajv提供`loadAuthoringEditorSchema()`及`checkEditorStructure(value)`，返回JSON Pointer诊断，不变异输入或访问provider。严格声明不能加入`$schema`，用编辑器`json.schemas`关联本地资产。`bun ./src/benchmarks/authorization-dsl/editor-support/verify.ts`对实际Zod结构及有限正反例检查漂移；runtimeOnlyChecks列明引用、行号顺序、政策就绪、Unicode与真实文件等剩余检查。新增refinement仍需维护者同步清单和反例，有限差分不证明完整语义等价。修改时运行该目录测试、verify和授权聚合/typecheck。

实验导航维护使用[`scripts/experiment-catalog`](../../scripts/experiment-catalog/README.md)的独立check/show/export入口。只读解析catalog及显式artifact路径元数据，保留不同度量、unknown/null/0和扩展字段；export独占创建新文件，拒绝覆盖或写入登记artifact目录。摘要包含读取时间与SHA，不能替代原始结果或被视为最终实时状态。该脚本目录不在全仓typecheck范围，修改时同时运行README列出的严格脚本类型检查；无新长期文档成员。

- `parseAuthorizationTask(input)`：strict 解析 canonical declaration，错误带字段路径。
- `compileAuthorizationTask(task)`：解析引用与政策状态，只把显式 obligation × entry 展开为稳定 `author::entry` ID。
- `AnalysisRequirementSchema` / `compileAnalysisRequirements(task, requirements)`：strict 解析六类公开分析问题，并把作者显式 requirement × authored obligation 映射到 runnable expanded obligation；同义务检查 prerequisite 和 cycle，局部错误不抹掉独立有效 ledger。
- `renderAuthorizationTask(compiled, "N" | "B" | "D", analysisPlan?, conditionPlan?, options?)`：历史三臂共用同一事实、analysis requirements、answer-free condition plan、result contract 与 source marker；N 把 canonical facts 确定性写成自然说明，B/D 共用 JSON declaration，D 增加领域因果与 prerequisite 方法。研究专用 `options` 只允许在仍记录历史 render arm 的前提下选择自然 declaration 和 plain public questions；共同 result contract 明确 conclusion 是相对 declared policy expectation，而不是 allow/deny 的同义词。`measureAuthorizationPromptCharacters` 分节记录字符但不推算 token。
- `buildAuthorizationSourceCatalog(bundle)` / `resolveAuthorizationSourceCitation(...)`：为全部 exact source 生成 ref-bound ID 与 crop 行标签，并由宿主派生 canonical path/quote。
- `AuthorizationWireResultV1Schema` / `normalizeAuthorizationWireResult(...)`：解析不含请求元数据、path 或 quote 的窄模型 wire，显式绑定 canonical result v0；不猜 obligation、结论或缺失语义，任一 error 级归一化诊断都不交付 canonical result。显式 analysis requirements 使用独立 wire/v2 并增加 coverage sidecar；ready condition request 使用 wire/v3 再增加 versioned condition sidecar。canonical 始终为 v0，旧 v1/v2 strict schema 不接受后续字段。
- `RelationCoverageSchema` / `validateRelationCoverage(plan, canonical, coverage)`：检查每个 exact requirement × expanded obligation 的 coverage、状态和同义务 fact pointer；返回机械 valid/invalid、计数和诊断，`semanticSupport` 固定 `unreviewed`，不把引用存在性升级为因果支持。
- `AuthorizationConditionAnalysisRequestV1Schema` / `compileConditionAnalysisRequest(task, request)`：可选 sidecar 用 authored-obligation-scoped `conditionBindings[{id,name}]` 给 task v0 的既有 condition 增加稳定 ID；按唯一 condition 名取回 basis，只展开到同 authored obligation 的 runnable expanded IDs，不预填 branch 或 effect。省略请求返回 `not-requested`，不要求普通任务伪造条件结果。
- `AuthorizationConditionAnalysisResultV1Schema` / `validateConditionAnalysisResult(plan, canonical, result)`：机械检查 branch 上限、同分支赋值冲突、重复 assumptions、condition/obligation 归属、显式 unexamined/completeness、unknown missing facts 及同义务 canonical fact pointer。`bounded` 表示所有请求条件至少被考虑，不表示真值表或程序路径穷举；`semanticSupport` 固定 `unreviewed`。
- `normalizeAuthorizationAuthoringInput(input)`：strict 解析较少重复字段的 `authorization-assessment-authoring/v1`，从task唯一派生sourceIdentity并物化共享`authorization-core-v1`，或原样保留task-supplied requirements；返回字段来源和`sourceRefVerification: authored`。缺政策、expectation、源码范围或引用时一次返回带`path/fix`的`needs-input`，不猜allow/deny、不搜索源码、不修改原对象。可选condition request原样进入独立normalized input。
- `loadLocalAuthorizationInput(inputFile)` / `loadLocalAuthorizationInputValue(value, inputFile)`：strict解析普通或作者v1/v2输入，校验task与sourceIdentity的repository/ref、相对sourceRoot、portable source路径、junction/symlink边界、声明行范围及ready plan。value入口供未写文件的工作区预览使用，与文件入口共用验证；显式`../`可选择父目录共享源码，但effective root不得因junction悄然越出声明边界。无显式requirements时实例化`authorization-core-v1`，伪称默认profile但内容漂移的输入会被拒绝。
- `checkLocalAuthorizationInput(...)` / `executeLocalAuthorizationRun(...)` / `inspectLocalAuthorizationOutput(...)`：普通自备输入的 provider-free 检查、每次新 session 运行和离线读取。check/run 接受 N/B/D，默认 B；arm、字符分项和 provider-reported token 随 session 保存。session 不覆盖，dispatch 后缺终态标 `completion-unknown`，不会自动重发；inspect 交叉检查 session/result/dispatch/run 的身份与状态，不直接信任单个结果文件。
- `runAuthorizationCli(argv, dependencies)`：顶层`skvm authorization init/compose/check/run/inspect/compare`的薄路由。init可写synthetic完整例子，或用同目录`--from`规范化authoring；目标存在时拒绝覆盖。compose动态调用独立handler，check-only不创建provider或输出。check/inspect不创建provider，run默认B并创建新session；输入带condition request时preview、host、session和inspect共同保存wire/v3 sidecar，否则旧ledger/v2不变。source checkout的Node shim会在Windows PATH中解析npm Bun背后的真实`bun.exe`。
- `validateAuthorizationResult(compiled, answer, sourceBundle)`：分别检查结构、声明义务、引用存在、范围声明和依赖快照；语义支持仍为 `unreviewed`。
- `runAuthorizationTask(...)`：在注入 provider、精确源码束和固定预算下生成；可选 condition request 必须与 ready analysis plan 一起启用。宿主按 v1/v2/v3 保存 raw wire、canonical、coverage/condition sidecar 及各自 validation，并让关系或条件机械诊断共用至多一次 repair；每次 dispatch 固定 phase，per-call/unit deadline、四次派发上限、closed state 和 JSONL lifecycle event 防止 timeout 后新 fallback；没有可执行工具或 evaluator 输入。
- `evaluateAuthorizationGeneration`、`summarizeAuthorizationRun` 与 `summarizeAuthorizationPair`：消费哈希绑定的 development-agent review，不能从关键词或 citation 存在性推断正确性；v1 单列 semantic decision、evidence semantics、transport 与 delivery，旧 `taskDecisionCorrect` 仍按 v0 口径保留。
- `AuthorizationEvaluationRubricsV2Schema`、`createAuthorizationReviewTemplateV2` 与 `evaluateAuthorizationGenerationV2`：新增 evaluator-only v2 路径，逐 criterion 标注 `necessary-semantics | explanation-completeness | optional-detail`。必要语义 missing 为 partial、contradicted 为 incorrect；可选细节 missing 单列但不改变结论正确性。review 继续绑定 output hash、attempt、rubric 与精确源码位置；代码引文不能替代未陈述的因果。v0/v1 API 与 W 产物保持兼容。
- `materializeAuthorizationCapabilityReviews(...)`、`evaluateAuthorizationCapabilityRunDirectory(...)` 与 `replayAuthorizationCapabilityEvaluation(...)`：在真实生成全部结束后离线绑定 review、写逐单元和项目/案例/臂/重复聚合，并从原始 run/review 重算摘要；rubric-only source 与模型 source bundle 分离装载，三个入口均不创建 provider 或执行目标。
- `buildAuthorizationStudyMethods(...)` / `checkAuthorizationValueStudyExperiment(...)` / `executeAuthorizationValueStudyExperiment(...)`：Y 的实验专用 P/L/C 接线，`studyArm` 与历史 `renderArm` 分开且三者都固定 `renderArm=B`。experiment/v1继续要求每例各一次P/L/C；experiment/v2从普通normalized input物化exact source，只要求每例P/C各两次和第二次反序。P 看完整自然任务事实和与 L/C 相同的公共问题，但不生成 ledger/coverage、使用 wire/v1；L 增加 ledger/coverage、使用 wire/v2；C 再增加 answer-free condition request/result、使用 wire/v3。check 只验证并物化公开输入，evaluator 路径不进入 prompt；run 在 provider 前冻结 config SHA、实现 revision、顺序和规则，每单元独立 session，终态或未知完成不自动重发。`summarizeAuthorizationStudyUnit` 只消费 evaluator v2 的语义结论，字段存在本身不产生质量分，并分列 first response、prompt fallback、repair、token/cache、调用、时间和未知费用。
- `materializeAuthorizationValueStudyReviews(...)` / `evaluateAuthorizationValueStudyRunDirectory(...)` / `replayAuthorizationValueStudyEvaluation(...)`：在全部生成关闭后离线物化hash-bound v2 review、写逐单元与按项目/案例/臂汇总，并从原run/review重放。review必须显式选择保留的initial或repair，答案pointer可指canonical result以及同次wire的coverage/condition sidecar；rubric source仍与模型source bundle分开读取。P缺coverage记`not-applicable`，L/C缺失才记`missing`。候选按结论/必要语义/decision、逐criterion解释缺口、调用/token、作者负担依次选择；零单元候选不得以零缺口参与比较。三个命令均不创建provider或执行目标。

声明顶层字段为 `schemaVersion/taskId/request/repository/sourceRef/sourceMode/policySources/principals/resources/entries/obligations/scopeAssurance/requiredAnalysis/constraints`。每条 obligation 明确 `principalId/resourceId/relation/operation/expectation/conditions/policySourceId/entryIds`；`expectation` 是规范方向，不是源码观察。模型 wire 按 exact expanded ID 返回结论：`source_supported_failure` 表示固定源码支持该规范期待在声明条件下失败，`source_refuted` 表示固定源码支持规范期待被执行、从而反驳 failure，`unknown` 表示固定源码与声明上下文不足以在两者间判断；它们不是 allow/deny 的直接同义词。答案还须给出 entry、binding、control、effect、condition 事实、`sourceId/startLine/endLine`、缺失事实/最小观察和 bounded scope claim。宿主另存 canonical task/repository/ref/path/quote。

关系 ledger 的 requirement 字段为 `id/kind/obligationIds/question/applicability/prerequisiteIds`，kind 限于 entry-control、identity-binding、resource-binding、authorization-decision、effect-reachability、external-assumption。运行时先复用义务 compiler，再按显式 authored ID 展开；不搜索未声明主体/资源组合，也不判定问题答案。entry 固定为 `pending`，包含 kind、公开 question、required/when-present 和同 expanded obligation 的 prerequisite IDs。重复 ID、陌生/不可运行 obligation、陌生或跨义务依赖、dependency cycle 返回结构诊断；有独立有效 entry 时 plan 为 partial，否则 blocked。`author::entry` 的两个 segment 对 `%`/`:` 转义以保持特殊 ID 唯一，现有普通 ID 不变。

coverage item 为 `requirementId/obligationId/status/explanation/factPointers`。addressed 与 not-applicable 至少指向一个本次 canonical result 中同义务的 `/results/<n>/facts/<group>/<n>` fact；required 不可标 not-applicable，when-present 的不适用仍需 source-backed explanation，无法判断则为有理由的 unknown。host 输入有 `analysisRequirements` 时先要求 plan ready，再把 ledger 和闭集 pair 放入 prompt，使用 wire/v2；initial/repair artifact 分别保留 raw wire、canonical v0、coverage 和 validation。coverage 错误只触发既有一次 deterministic repair，不调用隐藏 reviewer；一次后仍错时 run 为 `completed-with-diagnostics` 而非完整交付。修改关系/coverage 时运行 `bun test ./src/task-dsl/authorization/relations.test.ts ./src/task-dsl/authorization/relation-result.test.ts ./src/task-dsl/authorization/transport.test.ts ./src/benchmarks/authorization-dsl/host.test.ts`，再运行授权全套与 typecheck。

条件请求顶层为 `schemaVersion/requests`；每项包含 authored `obligationId`、`conditionBindings[{id,name}]` 和 `maxBranches`（默认8，范围1–12）。同义务条件名必须唯一，绑定 ID 在sidecar内唯一；compiler 返回 `authorObligationId/obligationId/conditions[{id,name,basis}]/maxBranches`。条件结果顶层为 `schemaVersion/analyses`；每项含 expanded obligation、带 assumptions/effect/explanation/factPointers/missingFacts 的 branches、`unexaminedConditionIds`、`bounded|incomplete` 与 limitations。reachable/blocked 至少引用一个同义务 canonical fact；unknown effect 至少给一个决定性缺失事实；已被决定性控制确定的效果可保留无关unknown assumption而不虚构缺失事实。AA实测header首答暴露旧规则假拒绝，修订只改机械条件，语义仍须独立复核。Y4 已把 ready condition plan 接到 renderer、wire/v3 和 host；initial/repair 分别保留 sidecar 与 `semanticSupport: unreviewed` validation，跨义务 condition ID 或 fact pointer 可触发同一次 diagnostics-only repair。修改此组件先运行 conditions/render/transport/host 聚焦测试，再运行授权全套与 typecheck。

自备输入入口在仓库根使用以下命令；只有 `run` 初始化 provider：

Z公共选择由`resolveAuthorizationMethod`统一解析：`plain|ledger|conditions`映射既有执行输入，显式选择固定B；省略按condition request/default保留兼容。`checkLocalAuthorizationInput(input, arm, method, wireVersion)`与`executeLocalAuthorizationRun({method, wireVersion, ...})`共享选择；CLI为`--method=... --wire=legacy|v4|v5`。session/check/dispatch/report保存并交叉核对methodSelection与wireVersion，旧缺省字段仍可inspect。

AH可选`AuthorizationReasoningStrategy`定义于`src/task-dsl/authorization/reasoning-plan.ts`，`compileAuthorizationReasoningPlan`只展开runnable义务中声明的主体、目标、入口、关系及条件为四类局部问题，`renderAuthorizationReasoningPlan`不给源码答案。`renderAuthorizationTask`的`reasoningStrategy` option在standard时不增加prompt段，在`control-binding-v1`时把同一段提供给普通DSL与独立Markdown；修复提示复用该段。普通`--reasoning=standard|control-binding-v1`贯穿check/run/preview/session/dispatch/inspect/compare，未知值在provider前拒绝；历史session缺字段按standard读取。执行依赖保存策略和实际问题计划，改变策略需复查旧结果。宿主只验证已有wire、引用和关联，语义仍由评价者复核。相关测试在reasoning-plan/render/host/local-run/markdown-study/CLI。

AH面板从[冻结配置](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-quality-v1/panel-config.json)经`run-panel.ts check|run|status|evaluate|replay`，独立盲审意见、定位机械归一化、[裁定](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-quality-v1/evaluator/adjudications.json)和[汇总](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-quality-v1/panel-summary.json)保存在同一结果根。`adjudicate-review.ts`只对9条二审中的一条预先记录的解释criterion更正，原始意见与原始模型字节不改；`evaluate-panel.ts replay`核对汇总逐字一致且不初始化provider。44条真实公开development单元中，M0/M1各8/11、D0 5/11、D1 7/11 full；方法没有跨表示稳定质量增量，默认仍为standard。维护该支架时先跑上述相关测试、主typecheck和AH脚本typecheck；不得把机械引用验证当作语义正确性。

`compactAuthorizationSchema(method)`是wire/v4唯一模型schema：顶层results，fact为`id/kind/statement/citations`，item-local coverage/condition以factIds引用同义务事实。`normalizeCompactAuthorizationResult`排序分组并构造canonical pointer，复用v1 citation绑定、relation/condition validator；宿主补固定身份、版本和declared-only scope，不补语义答案。未知ID、重复ID、非法source/range和条件遗漏均保留定位诊断。host对复用的validation不重复检查；schema/fallback使用相同schema和同一生命周期，schema错误记录在attempt.schemaValidation，首答指标与protocolMetrics保存在run。compact只在显式选择时启用，旧wire不重解释。

`evaluateAuthorizationGenerationV3`在原hash-bound v2语义review上接受显式responseDetails校准，单列响应细节，不从关键词推断任务义务；公开明确要求的响应项仍影响完整性。Z冻结配置、原始运行、评价、重放和作者步骤位于`results/skill-ir/skill-dsl-research/development/authorization-protocol-usability-v1/`。先用`run-panel.ts --check`零provider检查；已有冻结run不得为复查重发，`evaluate-panel.ts --replay`从保留答案与review离线重算。修改组件先运行compact-transport/CLI/evaluate聚焦测试，再运行授权聚合和typecheck。

`policy-result.ts`定义严格wire/v5，要求模型用`satisfied|violated|undetermined`而非旧`conclusion`表达声明政策状态，再机械映射到canonical v0的`source_refuted|source_supported_failure|unknown`。事实、coverage/condition、引用和旧v4校验被复用；宿主保存原v5与normalizer/v5，check/run/inspect/compare/resume及Markdown研究入口只在显式`--wire=v5`时选用。错误wire不产生成功canonical，unknown仍需决定性缺失事实。修改时跑policy-result、compact-transport、host、local-run、CLI测试及授权聚合/typecheck；[AE冻结配置、逐项review、汇总与离线搬移复现](../../results/skill-ir/skill-dsl-research/development/authorization-explicit-policy-v1/panel-summary.json)保留每次调用。24个development单元四组均6/6 full，未显示v5质量增量，旧默认不变。

场景工作区位于`src/benchmarks/authorization-dsl/authoring-workspace/{schema,plan,materialize}.ts`，公开`planAuthorizationWorkspace(workspaceFile,outDir)`与`materializeAuthorizationWorkspace(workspaceFile,outDir)`。它将共同authoring/v2 base和每个显式整字段replacement组装成普通v2输入与非语义来源sidecar；先在作者坐标检查，再在最终输出坐标校验，不能借搬移放宽sourceRoot边界。`skvm authorization compose --workspace=... --out=... [--check-only]`经独立handler进入：预览只读、跨平台；发布目前仅Windows，要求已存在的输出父目录且拒绝覆盖已有输出，进程骤停可能留下专属暂存目录。它不判断政策真值或复用模型答案；修改时运行工作区、compose路由和普通CLI测试，完整例子及限制见[场景工作区README](../../examples/authorization-assessment/scenario-workspace/README.md)。

AH增加`authoring-workspace/changes.ts`的`compareAuthorizationWorkspaces(before,after)`及`snapshotAuthorizationWorkspace(plan)`。plan从同次loader读取保留已验证base和有效源码字节摘要；报告顶层共同变化、variant继承/显式覆盖、有效变化、增删和复查原因。源码坐标变化但字节相同不算源码内容变更，源码字节变化会进入有效变化；完整run依赖另由`change-report.ts`比较。`authorization compose --check-only --compare-with=<old-workspace.json>`只读两份plan，不初始化provider或发布目录；无效plan不输出可用比较。整字段override遮住共同政策变动仅提示作者核对，不自动判错或加交互审批。修改时运行`authoring-workspace`与`authorization-compose.test.ts`。

AI的可选`analysisContract`由`assessment-contract.ts`严格解析authoring/v2的场景、入口、条件名称，在lowering时变成normalized input的canonical IDs；`assessment-program.ts`只为runnable expanded入口生成局部premise和显式请求的branch ID，既不生成effect也不把作者假设转成源码事实。`publicInstruction`可放逐字共同公开要求，缺省时从sidecar字段生成；legacy与explicit两个assessment mode都显示同一段。`outcome-result.ts`提供wire/v6互斥`decision`：无条件allow/deny任务返回模型观察的`allow|deny|unknown`，宿主用`conclusionFromObservedDecision`对照作者政策；conditional任务继续由模型返回`conditional-policy.policyStatus`。v6的`branchResults`是plain也可使用的薄输出，先复用compact citation/fact归一化与既有condition validator，再核对显式branch ID和假设闭集；结构通过仍不代表源码语义正确。普通check/run默认在有sidecar时选explicit-v1/v6；`--assessment=legacy`保留公开要求并关闭program，旧输入仍用旧默认。explicit-v1与旧wire或control-binding-v1组合会在provider前诊断。会话、原始decision、派生conclusion、branch验证与完整变更依赖一起持久化；inspect核对mode和program身份，已dispatch未知完成不重发。作者workspace把analysisContract作为整字段替换并报告继承/override，provenance增加当前场景摘要供识别过期来源文字；editor schema仅负责结构，与runtime引用校验分工。修改时跑assessment-contract/program/outcome-result、render、host、local-run、compose/editor-support测试和主typecheck。

[task-semantics合成示例](../../examples/authorization-assessment/task-semantics/README.md)展示可搬移的完整authoring/v2、两条不同边界的场景、请求分支与政策整字段替换；其离线普通临时目录验证结果在[AI ordinary example](../../results/skill-ir/skill-dsl-research/development/authorization-task-semantics-v1/ordinary-example.json)。这里的`unknown`是实际部署证据不足时可表达的模型结果，宿主不会把固定源码裁剪当作全仓或部署证明。AI真实作者研究材料、冻结输入、调用和评分继续放在结果根，不进入普通示例运行路径。

AJ证据准备由`evidence-preparation/{schema,prepare}.ts`提供`prepareAuthorizationEvidence({inputFile,outDir,request})`。请求使用`authorization-evidence-request/v1`：必须列出原输入的`sourceRoot`、可读文件白名单、每个已声明入口的原行范围、按`from`连接的指名依赖，以及`maxFiles/maxBytes/maxDepth`预算。读取复用portable reader；依赖可附literal `match`，但只能验证唯一命中处在所报行范围，不会推断函数边界、控制有效性或部署状态。入口缺失、越界、身份不符时没有可运行输入；非入口依赖缺失/歧义/超预算给`partial`和具名gap。所有纳入文件保留原始行号，每个文件最多一个连续片段，声明范围都保留后才用剩余预算扩展为完整文件。公开`authorization prepare --input=... --request=... --out=... [--check-only=true] [--proposal-model=provider/model]`把普通normalized输入、`source/`快照和`report.json`发布到新目录，拒绝覆盖；check-only不写文件或调用provider。

`LocalAuthorizationInputSchema`可选`evidencePreparation`报告。loader核对repo/ref、报告状态、精确文件列表、原路径及片段行数后把原坐标写入source catalog；report中的`ready`只表示所声明的依赖已准备，不证明源码路径完整。`renderSourceBundle`把同一报告和缺口交给普通check预览及真实host；session的check/source bundle/独立report/dispatch/result保留它并在inspect交叉核对。`createExecutionDependencies`把报告纳入比较，报告或共享源码变化使既有答案进入`needs-review`。修改此链路运行`evidence-preparation`、`local-input`、`local-run`、CLI prepare与compare相关测试，再跑授权聚合和typecheck。若准备请求未写范围，给出`range-required` gap；可显式标`unresolvedReason`为`dynamic-dispatch`、`external-middleware`或`missing-symbol`以保留具体缺口。可选模型提案只调用一次，读取有界候选窗口，生成的路径/坐标仍经过同一validator；`proposal.json`单列实际usage/费用（若提供），不把提议当作已验证的授权事实。

AJ局部修改由`authoring-workspace/local-edit.ts`的`applyAuthorizationLocalEdit(base,request)`完成。`authorization-local-edit/v1`只允许现有policy字段`text/location/revision/reason`、现有scenario字段`relation/expectation/operation`和现有analysisContract premise的`statement`；同一字段重复、未知key及其他字段拒绝。纯函数不改base，输出`value`或`draft`、真实变化路径、明确提供的路径、受影响场景、诊断及关系变化复查提示。任何policy操作都要求每个引用场景显式提交本次`expectation`，即便值不变；程序不从政策文本或源码推断标签。`authorization edit --input=<v2> --edit=<patch> --out=<new-directory> [--check-only=true]`用既有composer核对变更后的顶层值，并搬移相对sourceRoot，在新目录保存普通`assessment.json`和`edit-report.json`；不完整patch仅保存`draft.json`与诊断，不产生可运行输入。普通check/run/compare仍负责真实输入与旧答案复查。修改此链路运行local-edit、CLI edit、authoring-workspace与普通CLI测试，再跑授权聚合和typecheck。

[AJ可搬移示例](../../examples/authorization-assessment/evidence-editing/README.md)用两份同字节源码展示准备请求由`range-required` partial到ready、局部政策patch和普通生命周期；临时目录零provider演练见[ordinary-example](../../results/skill-ir/skill-dsl-research/development/authorization-evidence-editing-v1/ordinary-example.json)。[40单元质量汇总](../../results/skill-ir/skill-dsl-research/development/authorization-evidence-editing-v1/panel-summary.json)与[8次作者消费汇总](../../results/skill-ir/skill-dsl-research/development/authorization-evidence-editing-v1/author-use-summary.json)分别由`evaluate-panel.ts replay`和`evaluate-author-use.ts replay`离线核对，生成脚本不能读评价oracle。AJ公开development对照显示两表示共用的helper字节改善质量，但同材料M/D没有稳定差异；Paperless DSL作者额外声明helper入口，扩大义务数。prepare的`ready`仅针对请求中声明的依赖；`partial`可运行但缺口必须送到分析，检查与引用验证不代表控制语义正确。可选模型proposal只在显式指定时发生一次，结果仍须过同一范围/预算校验；AJ实测仅用mock覆盖提案路径。维护结果脚本时以冻结配置SHA、逐run身份和review文件复算，不改历史初答；模型缺终态仍按原session处理，不自动重发。

`src/measurement/token-accounting.ts`提供纯函数`normalizeTokenObservation`、`aggregateTokenObservations`、`compareTokenGroups`；`scripts/token-accounting/cli.ts`离线读取显式JSON，输出完整prompt/total、已知小计与缺值计数，同一账户/来源/缓存口径才能比较。`skvm-disjoint`把适配器非缓存input与cacheRead相加；`inclusive-input`不能重复加缓存；`unknown`不推算百分比。AE面板逐次记录fallback/repair用量；AB历史澄清见[AG证据](../../results/skill-ir/token-accounting-semantics-20260927/ab-accounting-clarification.json)，旧raw和summary未改。实际美元缺失保留null，不以字符或价格估算。修改时运行计量模块和脚本测试及脚本独立typecheck，命令与数据合同见[计量README](../../scripts/token-accounting/README.md)。

AK在同一组件加入显式request/report v2。`segments.ts`合并重叠/相邻原范围并按原字节拼接远距片段，报告同时保留原包络和连续snapshot坐标；包络不授予跨缺口引用。`sourceRangeText`供catalog/resolver/canonical validator共享使用，catalog按实际原行编号渲染`OMITTED`，loader校验映射和entry覆盖，execution dependencies及结果快照包含映射。旧v1的连续范围和余量扩整文件行为不变。修改此链路先测Unicode/CRLF/末行、错映射、原行引用、跨缺口、搬移及run/inspect/compare。

`discoverAuthorizationEvidence({inputFile,request,maxReadBytes?,maxDisplayBytes?})`只读作者白名单，建立Python/Go/JS词法符号及引用候选，记录missing/ambiguous/cycle/dynamic/budget诊断；不是语义调用图。`readDiscoveryWindows`只接受已按1MiB候选索引累计预算读取文件的literal/range补窗；普通输入校验和最终快照读取另行发生，该数不是全流程物理I/O上限。默认12文件、64KiB累计展示、64KiB最终材料、深度3；初窗预留一半展示预算供补读。`proposeBoundedAuthorizationDependencies`复用telemetry进行至多两轮位置提议和一次纯格式修订，索引中的未展示位置拒绝。准备不读取oracle或旧答案，不执行目标；超出词法能力时由作者显式补依赖。CLI `--discover=true`要求request/v2，`--proposal-model`显式启用模型，`--proposal-timeout-ms`最多300000；check-only零调用。提议前检查新目录/写入，将dispatch/response事件及account放在独立attempt目录，失败后usage仍可恢复，未知完成不自动重发。`authorizationScopePreview`只展示入口、支持位置、场景和义务计数，不删用户的真正多入口。聚焦命令为`bun test ./src/cli/authorization-prepare.test.ts ./src/benchmarks/authorization-dsl/evidence-preparation`，之后跑共享引用/run回归和typecheck。

AK实际8job/14准备调用中7发布、1失败；40质量计划单元36完成、4阻塞，36full含12合理unknown。同材料M/D最终一致；不以ready、少token或引用存在代替决定性源码闭合。8fresh作者消费保持16义务，主口径12/16full，owner非空附加假设仅为14/16敏感性。作者首稿5有效、正常修订后6，两次另记的完整schema诊断纠正后8；这项研究driver接口偏离保留首稿/首修，不能视为共享分析器修复。结果与裁定见[AK合并摘要](../../results/skill-ir/skill-dsl-research/development/authorization-bounded-preparation-v2/summary.json)和[研究§7.30](skill-dsl-research.md#730-ak-有界依赖准备与源码片段)。本轮总74次provider调用、actual USD及真人时间未知。生成driver不读oracle，评价包仅在所有单元关闭后构建。

AL的`location-selection.ts`提供纯`selectEvidenceLocation(context,selector,purpose)`和`evidenceLocationId`。窗口/符号ID绑定repository/ref/path/digest/真实片段，shown-range不能跨省略或使用未知窗口，indexed-symbol可读未展示正文但不能将其直接纳入证据；literal-search在显式范围内消歧，错literal保留失败。内部模型协议为`authorization-dependency-selection/v3`，说明只进description，最终仍转为普通request/v2坐标；旧request/v1规则不改。`readDiscoveryWindows`返回每项resolved/unresolved、候选、request identity和预算，安全缺口不抛整批；retained host context、unsafe path和源码digest不一致仍fail closed。prepare按父依赖结果处理子项并保留独立有效位置。

二轮位置提示包含同任务/政策、已验证依赖摘要、必要旧窗口和新窗口；`recordDiscoveryDisplay`将每次编号源码展示计入累计64KiB，并拆分unique/resent。account的sourceDisplay只统计实际dispatch轮次，round另记promptBytes/metadataBytes；取消后的未发窗口不冒充模型展示。没有新增源码信息不追加位置调用，二轮再求补读留下round-limit gap。普通CLI合并具名read缺口，在最终prepare重读时比对索引digest，并用原loader核验发布快照；partial可运行而invalid无可运行发布。修改时运行location-selection、discovery、proposal、prepare和CLI prepare测试，连同共有引用/run回归与typecheck。AL3–AL5聚焦50 tests/236 assertions通过；后续多行/重复属性反例补到55 tests/260 assertions。真实准备、质量、作者与消费结果按各自分母见研究§7.31，不能用ready代替关键控制闭合。

AL6将`editor-support/schema.ts`的`authoringEditorDiagnostics`接入versioned normalizer及普通loader。显式v2或无版本但至少三项task metadata/两项命名字典且无task envelope的声明可获v2结构建议，未知版本/不明形状仍只给version诊断。Ajv结构失败先返回，不进入source/reference/provider；runtime Zod及引用refinement仍为后续权威。既有点路径保持，新增schemaPath给精确JSON Pointer（包括unknown property），fix要求作者明确版本/政策/期待。init模板报告`authoringEditorGuidance`的本地schema/required fields；prepare无效输入也保留同诊断。不插入版本、不修改政策接受、不用v2 schema解析v1或normalized。编辑支持/authoring/CLI的33 tests/751 assertions通过。

AL7复用现有premise statement、scenario relation/expectation、conditions和requestedBranches表达owner unspecified/absent/other-present/self；未增领域状态字段。`owner-premise.test.ts`核对既有local-edit、普通preview/program与`createExecutionDependencies`均保留精确声明；单premise变化会进入assessmentContract/program/prompt摘要，源码及未编辑场景字节不改。compare因共享模型上下文保守复查所有运行场景，不能将局部作者字段修改误称为局部答案复用。未声明facts仍not-declared；仅显式branch展开，重复/相反条件赋值沿已有contract validator报具体路径，不解析自然语言矛盾。14项相关测试/88断言通过；未写项目名或函数名特例。

AL研究入口的注册/生成与评价隔离：`register.ts`先物化八个原seed、共同brief、20质量行及8作者/消费行，工程提交后保存实现字节；生成入口`prepare-study/panel/authors/consumers.ts`只读公共输入和冻结身份，不打开evaluator。claim在dispatch前独占，已有claim不重发；每稿最多一次diagnostics修订，失效作者阻塞消费，宿主不代填领域字段。`evaluate.ts`只在完整生成分母关闭后构造匿名包和复算review，`coverage`单独记录实际原行覆盖而不判语义。以下命令为零provider复算，真实run不重复：

```powershell
$al = './results/skill-ir/skill-dsl-research/development/authorization-location-recovery-v3'
bun "$al/replay-archived.ts"
bun "$al/prepare-study.ts" replay
bun "$al/panel.ts" replay
bun "$al/authors.ts" replay
bun "$al/consumers.ts" replay
bun "$al/shared-revision.ts" replay
bun "$al/portable-check.ts" replay
bun "$al/evaluate.ts" replay
bun "$al/evaluate.ts" source-reuse
bun "$al/evaluate.ts" summary
python "$al/verification-audit.py"
bunx tsc --project "$al/tsconfig.json"
```

AL仓外示例的具名副本保留在`D:/skill优化/project-maintenance/authorization-al-portable-20260929`；用途和字节检查在结果根`portable-verification.json`。复制两个完整示例目录即可保留相对来源；源码与编号材料按原字节归档，不为风格检查修剪。冻结核心源码复算仍使用LF checkout；旧AK实现hash因本轮修改拒绝时保持原件及拒绝边界，不更新旧hash。

`evaluate.ts replay`核对20主行、8消费行和4修订行的packet/answer绑定与派生评价。`source-reuse`重新生成文件字节/ref证明，`summary`重算七阶段成本及准备摊销，均不创建provider。旧compare-summary的sameSourceBytes检查整个bundle JSON，因此文件不变而报告元数据变化时可能false；以新增文件级证明判源码身份，原字段不改。唯一修订freeze记录`97bcb6bb`的59项当前实现字节，原58项freeze保留；不能改历史hash来让旧实现runner通过。

`verification-audit.py`只读当前AL文件和Git blob，核对两次freeze、注册来源、计划/完成分母、七阶段token和JSON/JSONL解析，并保存作者产物的当前digest。它不评价语义，不读本地provider配置，也不执行目标；`evidence-audit.json`是本次检查快照，不能替代原响应或成本账户。

最终只读复核追加的补读ID反例由`discoveryReadRequestIds`处理：唯一原ID保持，碰撞时分配未使用后缀，原值仍在request.id；既有读取及第二轮未执行请求的gap共用此规则，避免普通CLI取到另一项缺口的selector。三项红测后35项聚焦/193断言通过，不增加provider修订。此修正发生在所有真实生成之后，`verification-freeze.json`单独绑定当前离线实现及旧revision freeze；原58项/研究修订59项按当时Git字节核对，不能冒充新实现下的真实观测。summary的verificationImplementation只表示最终复算实现。

从仓根执行以下复算均不初始化provider，也不执行目标；不重跑创建目录或真实run命令：

```powershell
$ak = './results/skill-ir/skill-dsl-research/development/authorization-bounded-preparation-v2'
bun "$ak/prepare-study.ts" replay
bun "$ak/run-panel.ts" replay
bun "$ak/authors.ts" replay
bun "$ak/author-consume.ts" replay
bun "$ak/evaluate.ts" replay
bun "$ak/evaluate-author-use.ts" replay
bun "$ak/summarize.ts" replay
bunx tsc --noEmit --project "$ak/tsconfig.json"
```

AK新实现使旧AJ作者evaluator的冻结`local-run.ts`哈希校验拒绝；AJ面板evaluator仍复现。保留旧配置与原产物，不改哈希使旧runner冒充同实现重放。

新checkout复算时以`core.autocrlf=false`保留冻结实现及既有来源的LF字节；本轮结果目录的`.gitattributes`另外保留归档原字节。源码截取末尾空行、编号预览中的`line | `和材料文本属于实际记录，只对这些归档路径关闭空白风格检查，不修剪证据；脚本和说明仍做普通diff检查。

```powershell
bun ./src/index.ts authorization check --input=./examples/authorization-assessment/assessment.json
bun ./src/index.ts authorization run --input=./examples/authorization-assessment/assessment.json --model=<provider/model> --out=./.skvm/authorization-demo
bun ./src/index.ts authorization inspect --out=./.skvm/authorization-demo
```

输入顶层为 `schemaVersion/task/sourceIdentity/sourceRoot/sources` 及可选 `analysisProfile/analysisRequirements/conditionAnalysisRequest`。`sourceIdentity` 必须与 task repository/ref 相同；sourceRoot 相对输入文件目录，显式父目录段可选共同源码根，解析后仍须处在该显式边界内；sources 是相对 sourceRoot 的显式普通路径，不需要 case manifest、oracle、evaluator 或 review。可复制 `examples/authorization-assessment/` 后修改 task 身份、政策/主体/资源/入口/义务、sourceIdentity、源码位置、sources 和模型配置；也可编辑同目录authoring.json后用`authorization init --from=... --out=...`产生独立normalized input。先运行 check；字段、路径、声明位置或依赖错误均在 provider 前给出结构诊断。省略 `--arm` 使用 B；需要历史研究对照时才显式加 `--arm=N` 或 `--arm=D`。run 在 `<output-root>/sessions/<id>/` 保存 input、task、source bundle、profile、preview、dispatch、events、host run、result 与文本摘要，根目录的 append-only `sessions.jsonl` 只用于定位；再次 run 总是新 session。每个结果都显式带 `decisiveMissingFacts` 与 `suggestedObservations`，unknown 不得以空泛结论代替决定性缺失事实。

恢复按 artifact 状态处理：invalid check 与没有 `dispatch.json` 的 `provider-unavailable` 都未发模型请求，修正输入或 route 后可有意建立新 session；已有 dispatch 但无终态的 session 保持 `completion-unknown`，只 inspect 和保留，不自动重发；completed session 可在不装载 evaluator 的情况下反复 inspect。仓库自定义 route 位于本地缓存时，run 前可设置 `$env:SKVM_CACHE = "$PWD/.skvm"`。传入 exact session 目录可避免根索引最新项的歧义。

X9 的冻结开发面板使用 experiment-only 薄编排器；`check` 只物化公开输入并验证 5-case/23-unit 分母、顺序和路径，零 provider。`run` 在 provider 创建前保存配置 SHA、实现 revision、预算与单元顺序，再复用普通入口为每个单元建立独立 session；配置中的 evaluator 路径只进入 metadata，生成阶段不读取内容。

```powershell
bun ./src/benchmarks/authorization-dsl/capability-run.ts check --config=./results/skill-ir/skill-dsl-research/development/authorization-capability-v1/experiment-config-v1.json
bun ./src/benchmarks/authorization-dsl/capability-run.ts run --config=./results/skill-ir/skill-dsl-research/development/authorization-capability-v1/experiment-config-v1.json
bun ./src/benchmarks/authorization-dsl/capability-evaluate.ts review --config=./results/skill-ir/skill-dsl-research/development/authorization-capability-v1/experiment-config-v1.json --plan=./results/skill-ir/skill-dsl-research/development/authorization-capability-v1/review-plan-v1.json
bun ./src/benchmarks/authorization-dsl/capability-evaluate.ts evaluate --config=./results/skill-ir/skill-dsl-research/development/authorization-capability-v1/experiment-config-v1.json
bun ./src/benchmarks/authorization-dsl/capability-evaluate.ts replay --config=./results/skill-ir/skill-dsl-research/development/authorization-capability-v1/experiment-config-v1.json --output=./results/skill-ir/skill-dsl-research/development/authorization-capability-v1/runs/x9-initial-v1/x10-evaluation-replay.json
```

若单元已有合法终态或 dispatch 后缺终态，恢复只记录并跳过，不自动重发；只有 session 已初始化且没有 dispatch artifact 时可建立新 session 继续。`dispatch-claim.json`、`unit-result.json` 和 local session artifacts 都绑定 config/revision/unit/task/model/arm/input；不一致时在 provider 创建前失败。真实运行前必须先提交配置及其 `implementationRevision`。

Y7的P/L/C价值面板使用独立study runner，不改写上述历史capability配置：

```powershell
bun ./src/benchmarks/authorization-dsl/value-study.ts check --config=./results/skill-ir/skill-dsl-research/development/authorization-transfer-value-v1/study/experiment-config-v1.json
bun ./src/benchmarks/authorization-dsl/value-study.ts run --config=./results/skill-ir/skill-dsl-research/development/authorization-transfer-value-v1/study/experiment-config-v1.json
bun ./src/benchmarks/authorization-dsl/value-evaluate.ts review --config=./results/skill-ir/skill-dsl-research/development/authorization-transfer-value-v1/study/experiment-config-v1.json --plan=./results/skill-ir/skill-dsl-research/development/authorization-transfer-value-v1/study/y9-review-plan-v1.json
bun ./src/benchmarks/authorization-dsl/value-evaluate.ts evaluate --config=./results/skill-ir/skill-dsl-research/development/authorization-transfer-value-v1/study/experiment-config-v1.json
bun ./src/benchmarks/authorization-dsl/value-evaluate.ts replay --config=./results/skill-ir/skill-dsl-research/development/authorization-transfer-value-v1/study/experiment-config-v1.json --output=./results/skill-ir/skill-dsl-research/development/authorization-transfer-value-v1/study/y9-evaluation-replay-v1.json
```

`check`只检查五个公开development任务、条件request、15单元轮换和prompt隔离，不初始化provider或读取evaluator内容。`run`将`studyArm`与`renderArm=B`同时绑定到unit/session/result；P保存plain public-question snapshot且`ledgerGenerated=false`，L/C保存实际plan。冻结实现为`4524bfe25ec4c8cc66948872609f05f56c91512e`，配置SHA为`b0aa6278c14526e95be138cc56c5325f911c58a85f1b6396b55601827b27140b`；Y7 mock用exact config临时副本和空evaluator占位完成15/15，只验证机械链，不进入真实结果分母。Y9 review/evaluate/replay全程离线，15/15结论与必要语义正确；C因一个真实条件枚举增量按预定规则胜出，但调用/token更高，ordinary默认仍为B/L且condition layer保持opt-in。

Y11迁移配置使用experiment/v2。真实`run`已经冻结，不应为复查重复调用provider；以下`check`与`replay`是零provider、零目标执行的可复制验证：

```powershell
bun ./src/benchmarks/authorization-dsl/value-study.ts check --config=./results/skill-ir/skill-dsl-research/development/authorization-transfer-value-v1/migration/experiment-config-v2.json
bun ./src/benchmarks/authorization-dsl/value-evaluate.ts replay --config=./results/skill-ir/skill-dsl-research/development/authorization-transfer-value-v1/migration/experiment-config-v2.json --output=./results/skill-ir/skill-dsl-research/development/authorization-transfer-value-v1/migration/y11-evaluation-replay-v1.json
```

迁移三任务12/12决策正确、8 full/4 partial；P/C各4 full、2 partial，C没有质量增量，却使用12比8次调用、109,743比37,489 known tokens和约2.36倍known time。lock四答共同漏答案级HTTP 403，属于保留的task-level输出缺口，不以task-specific post-hoc prompt修补。当前默认仍为B/L，C仅在交付物明确需要有界条件分支时opt-in。机器结论位于`y12-value-judgment-v1.json`；这仍是development/method-fixed migration，不是held-out可靠性或人工节省证据。

X11 的一次有依据修订没有扩展主面板 runner，而是用同一普通 `local-run.ts` 为两个受影响任务的 B/D 各建一个 session。冻结身份在 `revision-config-v1.json`，新输出 review 绑定在 `revision-review-plan-v1.json`；以下命令只从已存在的 run/source/review policy 离线重算四份评价与独立 revision summary，不创建 provider：

```powershell
bun ./results/skill-ir/skill-dsl-research/development/authorization-capability-v1/revision-evaluate.ts
```

revision 结果不覆盖或替代 X9 初轮；普通入口在自定义 `xty/*` route 下需把 `SKVM_CACHE` 指到仓库 `.skvm`，否则会在 provider 创建前返回 `provider-unavailable` 且没有 dispatch。此类无 dispatch 的 setup failure 可在修正 route location 后建立新 session；已有 dispatch 的未知完成仍禁止自动重发。

X12 使用当前 ordinary entry 离线 inspect X11 同实现生成的 Open WebUI B 与 FastAPI B session；两者均 completed、`source_refuted`、coverage valid，inspect 新增 provider/目标执行均为零。合成例子的省略-arm check 返回 B、六项默认要求和零诊断；作者 trace 的 stale sourceIdentity 与 stale source path 仍分别得到 `source-identity-mismatch`、`declaration-source-location-invalid`。机器记录为 `usage-verification-v1.json`。默认从 D 改为 B 只改变未显式选择时的组织方式：X9 的 B/D necessary semantics 与 coverage 都为 10/10，D 无额外收益且调用/token 更高；N/D 显式模式和旧产物读取继续保留。

历史比较 runner 仍使用以下五条开发命令；当前 W 配置可直接复查，V 路径仅用于历史 replay：

```powershell
bun ./src/benchmarks/authorization-dsl/run.ts check --config=./results/skill-ir/skill-dsl-research/development/authorization-transport-v1/comparison-config.json
bun ./src/benchmarks/authorization-dsl/run.ts run --config=./results/skill-ir/skill-dsl-research/development/authorization-transport-v1/comparison-config.json
bun ./src/benchmarks/authorization-dsl/run.ts evaluate --run-dir=./results/skill-ir/skill-dsl-research/development/authorization-transport-v1/runs/initial-wire-v1 --config=./results/skill-ir/skill-dsl-research/development/authorization-transport-v1/comparison-config.json
bun ./src/benchmarks/authorization-dsl/run.ts replay --run-dir=./results/skill-ir/skill-dsl-research/development/authorization-v0/runs/initial --output=./results/skill-ir/skill-dsl-research/development/authorization-transport-v1/v-replay-initial.json
bun ./src/benchmarks/authorization-dsl/run.ts status --run-dir=./results/skill-ir/skill-dsl-research/development/authorization-transport-v1/runs/initial-wire-v1
```

只有 `run` 初始化并调用模型；help、check、evaluate、status 和离线 replay 都不调用 provider。check 写 previews；run 按 attempt 写 run metadata、index 及逐单元 declaration/source/prompt/dispatch、`events.jsonl`、run；evaluate 从事件归并迟到调用事实，再写 hash-bound review template、evaluation 和 summary。V 原件仍在 `authorization-v0`；W 新产物归 `authorization-transport-v1`。

常见错误含：`unsafe-source-root`/`unsafe-input-path`/`duplicate-source-path`/`missing-input`；字段路径解析错误；`declaration-source-location-invalid`；`foreign-obligation-result`/`missing-obligation-result`；`unknown-source-id`/`citation-out-of-range`；`missing-relation-coverage`/`foreign-coverage-obligation`/`dangling-fact-pointer`；`semantic-review-missing`；`timeout-unknown`。按诊断修改输入、输出合同或本地结果；wire 归一化为 invalid 时只保留原 wire 和诊断，一次 repair 后仍 invalid 则终态为 `transport-failed`，不得退回该带错结果。canonical 正确但 coverage invalid 时可保留两者供诊断，但不得标 completed。review 缺失时必须在全部生成结束后依据 evaluator-only rubric 填写，不能交还被测模型；timeout 或本地 dispatch 后缺 run 表示已发请求的 completion/usage 可能未知，禁止自动重发。运行器在 provider 创建前设置 `SKVM_AUTO_PROBE=0`；历史比较 runner 另设置 cache。确需新 revision 时使用新 attempt、明确原因和独立 session，保留旧结果。`replay` 只读旧 run/review，`--output` 必须指向新的派生位置；其中 v1 分解是再分析而不是新 review。

9 月 21 日 W1–W9 工程与验证已完成：超时在 wrapped provider 边界关闭生命周期，迟到 response/error 只结算原 attempt，不生成实验答案；repair 失败保留 initial。六个 W 真实单元全部完成，证明窄 wire、宿主引用绑定和分层评价可运行；trusted-header 的共同漏项仍限制方法结论。无 abort 接口的底层请求可能迟到，进程终止后仍无法取得的 usage/cost 必须保持 unknown，禁止自动重发。

## 2. 当前端到端流程

### 2.1 收集真实 trace

普通使用从一次自然任务开始，由 bare-agent 自动收集本次运行记录：

```powershell
skvm run --prompt="<task>" --skill=./skill --workdir=./project --model=<id> --optimize
```

优化模型默认沿用 `--model`，需要区分时指定 `--optimizer-model`。已有日志时，保留原 skill、成功/失败记录、失败 sidecar、模型身份与任务上下文，使用高级日志入口。该入口不会重跑原任务：

```powershell
skvm jit-optimize `
  --skill=path/to/skill-dir `
  --task-source=log `
  --logs=path/to/log1.jsonl,path/to/log2.jsonl `
  --failures=path/to/log1-failure.json,path/to/log2-failure.json `
  --optimizer-model=<id> `
  --target-model=<id>
```

### 2.2 审阅 proposal

```powershell
skvm proposals list
skvm proposals show <id>
skvm proposals accept <id>
```

接受 proposal 会应用选定改动，但不是质量认证。检查 Evidence 中的未知项和剩余职责；研究效果仍需相应的比较证据。

### 2.3 生成并消费新包

自动入口会尝试导出新包；高级日志入口可用 `--package-out=<new-empty-directory>` 指定位置。API request/pytest、Env preset 和外部 skill import 按任务需要使用。查看包内 `OPTIMIZATION-USAGE.md` 了解入口和限制；新包应当：

- 可独立定位与加载；
- 记录 source、proposal、选中版本、已有接受决定和产物摘要；
- 保留未固化的说明与 agent 职责；
- 在新消费任务中记录真实 trace；
- 由与公开合同一致的 checker 或明确人工接受边界验证。

## 3. 组件归属

| 要改的内容 | 先读 |
|---|---|
| schema、parser、validator、pass、lowering | [ir-core.md](ir-core.md) |
| Evidence、proposal、artifact、产品 CLI | [optimization-and-artifacts.md](optimization-and-artifacts.md) |
| runner、checker、scorer、研究 gate | [evaluation-system.md](evaluation-system.md) |
| API TaskContract、请求与 pytest/checker | [api-task-engine.md](api-task-engine.md) |
| Q1/Q2 分类、能力图、发放边界 | [classification-and-routing.md](classification-and-routing.md) |
| 外部 skill closure | [external-skill-import.md](external-skill-import.md) |
| 代表案例与适用范围 | [real-skill-pilots.md](real-skill-pilots.md) |
| 授权任务 DSL 声明、义务、条件、普通入口、迁移与评价 | [研究开发合同 §7.22](skill-dsl-research.md#722-y-条件表达默认迁移与价值验证)及 [Y 任务书](../superpowers/plans/2026-09-22-authorization-dsl-transfer-and-value.md) |

## 4. 实现纪律

- 先写失败测试，再做最小实现，最后运行聚焦测试与必要的更广验证。
- 通用 core 不按 skill id、case id 或模型名分支。
- 研究 gate 只保护冻结输入、外部副作用、付费执行、held-out 和主张资格；本地可逆修改不重复加门。
- scorer/checker 必须与公开接口一致，不得私下要求未公开字段或答案。
- 保留完整分母、失败行、未知成本与 stop-loss；不得为了漂亮结果补跑或换样。
- 结果写到 `results/skill-ir/`，文档链接结果，不复制长流水。

## 5. 常用验证

```powershell
bun run typecheck
python -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py
```

组件测试按改动范围运行，例如：

```powershell
bun test ./src/skill-ir
bun test ./src/benchmarks/skill-ir/task-automation-annotation-package.test.ts
```

执行历史实验前先确认身份是否允许重放。冻结结果、paid run、held-out 和原摘要绑定默认不可因文档治理而重跑。

## 6. 常见失败处理

- 输入摘要不匹配：停止，确认拿到的是否为冻结版本，不覆盖原件。
- checker 拒绝但公开合同满足：按测量身份问题处理，不把它解释成模型失败。
- 基础设施失败：保留失败行与调用成本，按任务书 stop-loss 收口。
- 新包遗漏职责：退回固化边界，不能用说明文档删除原职责。
- 文档链接失败：迁移普通导航；若目标是运行时按摘要读取的版本化材料，保留原路径与原字节。

## 7. Git 与协作

- 在 `skill-ir-aot` 工作，只推送用户 `origin`。
- 精确暂存本任务文件，不夹带其他线程的代码、未跟踪实验或临时产物。
- 治理线程负责归并与导航；最新任务书/spec 的方法决定由开发线程维护。治理提交前读取最新字节并做局部合并，不整份覆盖。
- 有意义阶段只在根目录 conversation log 留一条短记录；长期决定才进入 communication，当前恢复信息才进入 handoff。

## 8. 历史与证据

### Authorization authoring and input applicability

AO exposes the separate opt-in `authorization inquiry` route. `inquiry.ts` owns strict inquiry/v1 questions and independent policy; `inquiry-program.ts` compiles stable pending entry/principal-binding/resource-binding/guard/effect/exception relations. It infers no source facts. `inquiry-result.ts` checks shown evidence IDs, question binding, duplicate/conflicting branches, precise unknowns and mode-specific policy assessment; semanticSupport remains unreviewed. `acceptAuthoredInquiry` in authoring-assist binds model declarations to the original user mode/policy and records field origins. Complete declarations compile with zero calls; natural D0/D1 authoring is charged.

`createInquiryTools` in `inquiry-tools.ts` indexes the canonical allowed source root, rejects escaping symlinks/junctions and evaluator/test/secret paths, and exposes bounded source_list/search/symbol/read. List/search/symbol are lexical aids; only returned original ranges count as shown source evidence. Every read reloads and verifies the indexed file digest. It stores original line ranges, bytes and stable evidence IDs. Indexing is bounded to 512 files/8 MiB, actions to 24, and cumulative target source display per actual provider request to 256 KiB; physical reread, tool display and resent source are separate counters. Missing/excluded/truncated dependencies remain source gaps.

`runAuthorizationInquiry` uses existing telemetry and structured provider transports for a same-session tool/observe/final loop. M gets the natural brief/common source tools, D0 adds a model declaration, and D1 adds the relation queue/feedback. Initial and final delivery plus initialValidation are retained independently; one diagnostic delivery repair is allowed. Lifecycle budgets are 12 actual dispatches, 300s per call and 1200s per session. No target execution is possible. `inquiry-local.ts` supplies input/check/run/inspect/compare/edit and `authorization-inquiry.ts` is the CLI router. New sessions retain raw input hash, check, requests, events, run and report. Inspect binds source identities and first/final/telemetry to the run archive; compare uses object-order-independent equality for the whole task and indexed sources, never answer reuse. Request edits replace the actual brief/question rather than adding unrelated text. Old v2 local-edit also supports `{kind:"request",statement}`.

`createNativeInquiryRuntime` installs the same source tools in the ordinary bare-agent loop with bounded original skill_reference_read. Optional domain tools compile once, validate observations and check at most initial/one repaired result. Full original SKILL injection and companion loading remain through the existing loader. `--authorization-scope`, `--authorization-domain-tools`, `--authorization-trace` are opt-in run flags. Incremental request/lifecycle/tool archives are written outside the source root before dispatch. Native continuation uses an explicit telemetry executable-tool whitelist, full shown-source history and an iteration-limit stop; default tools/history behavior stays compatible. Tests are inquiry*, telemetry-continuation, bare-authorization, authorization-ao and run CLI tests. The result-root study registers 56 planned rows, claims before dispatch, never resends claims, pauses after two consecutive infrastructure failures and requires every claim to settle before generation closes.

The native system context receives the current input declaration as data: either the complete inquiry, or the natural brief, mode and independently supplied policy. A policy present only in the scope file must reach the model before it compiles questions; it is never reconstructed from source. `inquiry-native.test.ts` covers both forms. This AO13 ordinary-path fix followed generation closure and affects none of the 56 retained paid rows, which had supplied mode/policy in their natural prompts.

AO evidence is in [authorization-inquiry-tools-v1](../../results/skill-ir/skill-dsl-research/development/authorization-inquiry-tools-v1/README.md). After generation closes, `study.ts replay`, `normalize-reviews.ts replay`, `evaluate.ts replay` and `portable-check.ts replay` verify retained data without provider access. The semantic archive preserves six independent reviewers' original messages and named main-agent adjudications; structure and semantic ratings are separate. The pre-run `check` writer and generation commands must not overwrite this sealed archive. The summary's `domainCalls` is a native runtime operation counter, distinct from D1's inquiry-loop relation queue. [skill-use-detail](../../results/skill-ir/skill-dsl-research/development/authorization-inquiry-tools-v1/skill-use-detail.json) separately records native named-tool attempts, successful dispatches, budget rejection and checked-result delivery.

`src/benchmarks/authorization-dsl/authoring-v2.ts` owns the strict named author schema, stable namespace/percent-encoded identities, and deterministic lowering into v1/canonical v0. `authoring.ts` dispatches explicit versions; v1 is unchanged. The author owns policy, acceptance, scenario relation/expectation and source locations. The versioned normalizer supplies fixed scope, read-only constraints, default questions/profile and explicit condition bindings. Unknown fields, unsafe names and dangling references return author-path diagnostics; no source inference or model call is involved. Facts omitted by the author are recorded as not declared.

`loadLocalAuthorizationInput` accepts normalized/v1/v2 in the same original-directory context and retains the exact raw bytes, normalized input and provenance. Portable source confinement and declaration-location checks still run before provider creation. `executeLocalAuthorizationRun` writes these separately with an execution dependency snapshot before dispatch. The existing host executes the selected method/wire; all methods receive public analysis and requested bounded-condition questions, while ledger/condition sidecars remain method-specific output duties.

`authoring-task.ts` provides the optional `authorization-task-authoring/v1` current snapshot and `authorization-task-change/v1` named update. `compileAuthorizationTaskAuthoring(context, task)` uses the existing context draft and v2 normalizer/lowerer. Each scoped case supplies its domain fields once; the host creates dictionary keys, `premise.atEntry`, branch condition references and canonical IDs. It records JSON Pointer field origins as `user-explicit`, `model-authored` when selected by the caller, or `host-derived`. No source behavior or missing normative policy is inferred. `init --context --task --out` publishes ordinary v2, entry seed and provenance together after output preflight. `authoring-draft-repair.ts` accepts only diagnosed existing `atEntry` and condition-reference leaves, merges a single explicit proposal, then reruns normalization; it cannot repair policy or expectation by changing the draft. Named domain changes remain separate and valid v2 changes continue through local edit/compose. Tests: `authoring-task.test.ts`, `authoring-draft-repair.test.ts`, `authorization-an.test.ts` and ordinary v2/CLI regressions.

`task-contract.ts` owns the opt-in current-v1 migration. `render.ts` resolves typed `requiredAnalysis` before generating the actual prompt, retains original/effective requirements and diagnostics, and rejects unrecognized imperative return-label requirements in public instruction fields. The local runner admits this mode only for plain/explicit-v1/v6, persists it in session/check/run/compare dependencies, and leaves the compatibility path unchanged. Direct renderer calls also reject current-v1 without wire v6. `outcome-result.ts` derives readable policy summaries from the authored allow/deny expectation and source-visible observed decision, while the original model explanation remains separate. An explicit contrary old label is a named normalization diagnostic and consumes only the existing single domain repair opportunity. This check does not classify arbitrary natural language; semantic review remains necessary. Tests: `task-contract.test.ts`, `outcome-result.test.ts`, `local-run.test.ts`.

AN development evidence lives in [authorization-task-contract-v1](../../results/skill-ir/skill-dsl-research/development/authorization-task-contract-v1/status.json). `study.ts replay`, `authors.ts replay`, `evaluate.ts replay`, and `portable-check.ts replay` are zero-provider integrity checks after generation closes; `study.ts check` is a pre-run writer and should not be reused on the sealed archive. `evaluate.ts` binds 28 first/final review packets to retained answers and the public oracle, and replay rehashes each archived raw report and run against its packet; raw invalid initial wires stay separate from repaired deliveries. The consumer-only runner revisions record the archived offline preparation recovery without changing the original quality or author freeze. See [evaluation-summary](../../results/skill-ir/skill-dsl-research/development/authorization-task-contract-v1/evaluation-summary.json) for denominators, outcome labels and full call accounting. The ordinary portable workflow is in the [task-semantics example](../../examples/authorization-assessment/task-semantics/README.md#start-from-a-scoped-current-task); source bytes, pending gaps and same task identity are checked before reuse, then the changed task still needs a new paid analysis.

`change-report.ts` exports `createExecutionDependencies` and asynchronous `compareAuthorizationInput(previousSessionPath, inputPath, {method?, wireVersion?})`. The snapshot binds the complete task, source contents/ranges, profile/questions/condition request, method, wire, arm, normalizer and rendered prompt. JSON object keys are canonicalized for comparisons; array order remains meaningful. Compare reads and validates the old session, inherits method/wire unless overridden, loads current input through the ordinary loader and returns added/removed/changed/affected scenarios, expanded obligations, reasons and missing dependencies. Every scenario shares the fixed model context, so changed context conservatively affects all of them. It never creates a provider, writes an old session, caches an answer or promotes semantic quality. Old snapshots lack full dependencies and remain needs-review. A current applicability report is possible even for an unsuccessful run; `previousRunStatus` stays explicit.

Use `authorization init --format=authoring-v2`, ordinary `check/run --input=...`, and `compare --previous=<inspect sessionPath> --input=...`. Examples and exact user fields are in [usage](../usage.md#bounded-authorization-assessment-opt-in-development-capability). Tests are `authoring-v2.test.ts`, `authoring-v2-local.test.ts`, `result.test.ts` and CLI regressions, plus the AA result root's offline multi-scenario `compare-demo.ts`. Changes to host defaults, render/output contracts or lowering must update their version when semantics change and retain dependency tests; the full task/prompt comparison also detects actual changed text. Historical replay explicitly projects to the historical validation shape without backfilling historical evidence.

- [evidence-index.md](evidence-index.md)：主张、范围与最窄结果路径。
- [history.md](history.md)：历史主题与退出路径恢复。
- Git：精确正文与演进过程。
- `results/skill-ir/`：机器证据与失败原件。

The Z development result root is `results/skill-ir/skill-dsl-research/development/authorization-protocol-usability-v1`. Reproduce its retained evaluations without provider access using `bun <root>/evaluate-panel.ts --replay`, `bun <root>/evaluate-panel.ts --config=revision-config.json --replay`, then `python <root>/summarize.py --replay`. Review decisions bind raw output hashes and fixed rubric source locations. The original eight units and the one assignee revision pair have separate frozen configs/summaries; do not regenerate into those directories. `run-panel.ts --check` verifies declared inputs and sources without reading evaluator criteria; existing claim files prevent automatic resend. Strict Zod objects now advertise `additionalProperties: false` in both tool and fallback schema; passthrough schemas stay open. This converter correction is not a promise of provider enforcement. Late usage reconciliation is accounting only and never changes a terminal timeout into a delivered result.
<!-- al-shared-revision-runtime -->
有界Python符号索引先平衡多行声明的括号，再按suite缩进判断body结束；声明闭合行不能提前截断函数。v3定位响应先检查每个JSON对象的重复属性，避免`reads`被后一个同名属性静默覆盖；原响应和用量先保留，复用既有一次diagnostics-only格式修订。该检查不合并冲突数组或猜测模型意图。
