# Skill IR 开发指南

本指南说明开发入口、组件分工和常用检查。项目进度见 [current-status.md](current-status.md)，历史阶段见 [history.md](history.md)。

## 1. 先建立项目视图

1. 阅读 [current-status.md](current-status.md)。
2. 按任务阅读 [当前 plan](skill-ir-aot-optimization-plan.md)及相关 spec/组件章节。
3. 需要整体背景时阅读 [架构](../architecture.md)、[使用说明](../usage.md)和[JIT Boost](../jit-boost.md)。
4. 检查工作树，保留其他线程的未提交修改。

已实现的通用流程是“真实 trace → 模型优化 → 新 skill 包 → agent 消费”。授权方向另有一个窄域开发能力，用 canonical declaration、义务展开、固定上下文零工具宿主和逐事实评价比较 organized instruction 与领域支持；它已有 opt-in 顶层命令，但不是通用安全 DSL、目标执行器或生产默认安全决策。下文说明可复用的现有工程流程，当前领域工作见[当前计划](skill-ir-aot-optimization-plan.md)与 spec 14.34。

### 1.1 授权 DSL 开发原型

[V0–V10 任务书](../superpowers/plans/2026-09-20-authorization-dsl-prototype-development.md)、[W0–W9 任务书](../superpowers/plans/2026-09-21-authorization-dsl-transport-and-evaluation.md)、[X0–X13 任务书](../superpowers/plans/2026-09-21-authorization-dsl-capability-delivery.md)、[Y0–Y14 任务书](../superpowers/plans/2026-09-22-authorization-dsl-transfer-and-value.md)和[研究 §7.19–7.22](skill-dsl-research.md#719-v-开发合同与持续复盘)描述已实现接口及当前扩展。它处理单 repository/ref、fixed-context、source-visible authorization obligation。领域代码位于 `src/task-dsl/authorization/`，实验代码位于 `src/benchmarks/authorization-dsl/`。

公开边界如下：

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
- `loadLocalAuthorizationInput(inputFile)`：strict 解析 `authorization-assessment-input/v1`，校验 task 与 `sourceIdentity` 的 repository/ref、相对 sourceRoot、普通 portable source 路径、junction/symlink 边界、声明行范围及 ready analysis/condition plan；无显式 requirements 时实例化 `authorization-core-v1`。authoring规范化产物带`analysisProfile.origin=derived`和物化requirements，loader会拒绝伪称默认profile但内容漂移的输入。
- `checkLocalAuthorizationInput(...)` / `executeLocalAuthorizationRun(...)` / `inspectLocalAuthorizationOutput(...)`：普通自备输入的 provider-free 检查、每次新 session 运行和离线读取。check/run 接受 N/B/D，默认 B；arm、字符分项和 provider-reported token 随 session 保存。session 不覆盖，dispatch 后缺终态标 `completion-unknown`，不会自动重发；inspect 交叉检查 session/result/dispatch/run 的身份与状态，不直接信任单个结果文件。
- `runAuthorizationCli(argv, dependencies)`：顶层`skvm authorization init/check/run/inspect`的薄路由。init可写synthetic完整例子，或用同目录`--from`规范化authoring；目标存在时拒绝覆盖。check/inspect不创建provider，run默认B并创建新session；输入带condition request时preview、host、session和inspect共同保存wire/v3 sidecar，否则旧ledger/v2不变。source checkout的Node shim会在Windows PATH中解析npm Bun背后的真实`bun.exe`。
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

条件请求顶层为 `schemaVersion/requests`；每项包含 authored `obligationId`、`conditionBindings[{id,name}]` 和 `maxBranches`（默认8，范围1–12）。同义务条件名必须唯一，绑定 ID 在sidecar内唯一；compiler 返回 `authorObligationId/obligationId/conditions[{id,name,basis}]/maxBranches`。条件结果顶层为 `schemaVersion/analyses`；每项含 expanded obligation、带 assumptions/effect/explanation/factPointers/missingFacts 的 branches、`unexaminedConditionIds`、`bounded|incomplete` 与 limitations。reachable/blocked 至少引用一个同义务 canonical fact；unknown effect 或 unknown-valued assumption 至少给一个决定性缺失事实。Y4 已把 ready condition plan 接到 renderer、wire/v3 和 host；initial/repair 分别保留 sidecar 与 `semanticSupport: unreviewed` validation，跨义务 condition ID 或 fact pointer 可触发同一次 diagnostics-only repair。修改此组件先运行 conditions/render/transport/host 聚焦测试，再运行授权全套与 typecheck。

自备输入入口在仓库根使用以下命令；只有 `run` 初始化 provider：

Z公共选择由`resolveAuthorizationMethod`统一解析：`plain|ledger|conditions`映射既有执行输入，显式选择固定B；省略按condition request/default保留兼容。`checkLocalAuthorizationInput(input, arm, method, wireVersion)`与`executeLocalAuthorizationRun({method, wireVersion, ...})`共享选择；CLI为`--method=... --wire=legacy|v4`。session/check/dispatch/report保存并交叉核对methodSelection与wireVersion，旧缺省字段仍可inspect。

`compactAuthorizationSchema(method)`是wire/v4唯一模型schema：顶层results，fact为`id/kind/statement/citations`，item-local coverage/condition以factIds引用同义务事实。`normalizeCompactAuthorizationResult`排序分组并构造canonical pointer，复用v1 citation绑定、relation/condition validator；宿主补固定身份、版本和declared-only scope，不补语义答案。未知ID、重复ID、非法source/range和条件遗漏均保留定位诊断。host对复用的validation不重复检查；schema/fallback使用相同schema和同一生命周期，schema错误记录在attempt.schemaValidation，首答指标与protocolMetrics保存在run。compact只在显式选择时启用，旧wire不重解释。

`evaluateAuthorizationGenerationV3`在原hash-bound v2语义review上接受显式responseDetails校准，单列响应细节，不从关键词推断任务义务；公开明确要求的响应项仍影响完整性。Z冻结配置、原始运行、评价、重放和作者步骤位于`results/skill-ir/skill-dsl-research/development/authorization-protocol-usability-v1/`。先用`run-panel.ts --check`零provider检查；已有冻结run不得为复查重发，`evaluate-panel.ts --replay`从保留答案与review离线重算。修改组件先运行compact-transport/CLI/evaluate聚焦测试，再运行授权聚合和typecheck。

```powershell
bun ./src/index.ts authorization check --input=./examples/authorization-assessment/assessment.json
bun ./src/index.ts authorization run --input=./examples/authorization-assessment/assessment.json --model=<provider/model> --out=./.skvm/authorization-demo
bun ./src/index.ts authorization inspect --out=./.skvm/authorization-demo
```

输入顶层为 `schemaVersion/task/sourceIdentity/sourceRoot/sources` 及可选 `analysisProfile/analysisRequirements/conditionAnalysisRequest`。`sourceIdentity` 必须与 task repository/ref 相同；sourceRoot 相对输入文件目录且解析后不得越出该目录；sources 是相对 sourceRoot 的显式普通路径，不需要 case manifest、oracle、evaluator 或 review。可复制 `examples/authorization-assessment/` 后修改 task 身份、政策/主体/资源/入口/义务、sourceIdentity、源码位置、sources 和模型配置；也可编辑同目录authoring.json后用`authorization init --from=... --out=...`产生独立normalized input。先运行 check；字段、路径、声明位置或依赖错误均在 provider 前给出结构诊断。省略 `--arm` 使用 B；需要历史研究对照时才显式加 `--arm=N` 或 `--arm=D`。run 在 `<output-root>/sessions/<id>/` 保存 input、task、source bundle、profile、preview、dispatch、events、host run、result 与文本摘要，根目录的 append-only `sessions.jsonl` 只用于定位；再次 run 总是新 session。每个结果都显式带 `decisiveMissingFacts` 与 `suggestedObservations`，unknown 不得以空泛结论代替决定性缺失事实。

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

- [evidence-index.md](evidence-index.md)：主张、范围与最窄结果路径。
- [history.md](history.md)：历史主题与退出路径恢复。
- Git：精确正文与演进过程。
- `results/skill-ir/`：机器证据与失败原件。

The Z development result root is `results/skill-ir/skill-dsl-research/development/authorization-protocol-usability-v1`. Reproduce its retained evaluations without provider access using `bun <root>/evaluate-panel.ts --replay`, `bun <root>/evaluate-panel.ts --config=revision-config.json --replay`, then `python <root>/summarize.py --replay`. Review decisions bind raw output hashes and fixed rubric source locations. The original eight units and the one assignee revision pair have separate frozen configs/summaries; do not regenerate into those directories. `run-panel.ts --check` verifies declared inputs and sources without reading evaluator criteria; existing claim files prevent automatic resend. Strict Zod objects now advertise `additionalProperties: false` in both tool and fallback schema; passthrough schemas stay open. This converter correction is not a promise of provider enforcement. Late usage reconciliation is accounting only and never changes a terminal timeout into a delivered result.
