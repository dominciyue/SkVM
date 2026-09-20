# 授权任务 DSL 第一版开发与真实消费任务书

> **执行方式：** 使用 `superpowers:executing-plans` 按 V0–V10 连续推进，代码使用 `superpowers:test-driven-development`。主线程负责设计、修改和验证；只读独立核验按项目规则委派。常规检查点不等待确认，有证据的局部问题在本轮修复并记录。

**Goal:** 把已有授权领域研究实现为一条可运行的“JSON 领域声明 → 检查任务展开 → 模型源码分析 → 结果检查 → 配对评价”链路，交付可修改的真实声明、可复用代码和实际运行结果。

**Architecture:** 领域模块负责声明、义务、指令和结果合同；实验宿主负责精确输入、模型调用与计量；评价模块在生成结束后使用独立答案逐项复核。首版使用已有 SkVM provider，不经过旧统一 IR，不重建 CLI。

**Tech Stack:** TypeScript、Bun test、现有 Zod 3、`LLMProvider` / `extractStructured` / provider registry，固定版本源码与 JSON/JSONL 运行记录。

- 制定日期：2026-09-20；状态：`planned-not-started`。本文件完成开发准备，V0 启动后才创建执行状态和运行目录。
- 工作分支：`skill-ir-aot`；仅推送用户 `origin`，保留所有无关修改与历史材料。
- 设计正文：[研究总文档 §7.19](../../skill-ir/skill-dsl-research.md#719-v-开发合同与持续复盘)；方法边界：[spec 14.34](../../skill-ir/skill-ir-aot-optimization-spec.md#1434-按-skilltask-范围设计领域-dsl)。本轮不另建 design、开发总结或交接 Markdown。
- 研究依据：[T 原型决定](../../../results/skill-ir/skill-dsl-research/prototype-readiness-decision.json)、[对照设计](../../../results/skill-ir/skill-dsl-research/next-prototype-evaluation.json)、[真实案例](../../../results/skill-ir/skill-dsl-research/cases/authorization/manifest.json)。T 原件保留研究时含义；本任务书落实实现细节。

## 一、这轮要交付什么

1. 一个 `source-authorization-assessment/v0` JSON 领域表达，能描述主体、操作、资源关系、条件、权限依据与源码范围。
2. 三份真实案例声明，用同一领域实现处理；同一事实对象可生成整理 Markdown 基线 B 与领域方法 D。
3. 可执行的义务展开、引用检查、任务状态与源码/政策变更失效判断；模型承担控制路径理解与授权判断。
4. 一个开发脚本，支持无网络检查、固定上下文运行、已有输出评价和状态恢复。公开函数也能被其他代码调用，案例选择器只属于实验层。
5. 三个案例各一组 B/D、共六个计划生成单元；保留每次初始输出、回退、修复、质量判定与成本。模型质量和实际费用由记录给出。
6. 研究总文档中的开发复盘：问题、根因、解决办法、对应测试、效果和仍需处理的部分。

首轮完成后，开发者可以编辑一份声明、运行源码分析、查看逐义务结果和费用，并复现已有输出的确定性检查。自然语言自动起草声明、主动搜索整个仓库、第二项目迁移和现有 `skvm run` 的产品接入留给下一项具体问题；这轮优先把领域方法本身做实。

## 二、设计与文件责任

### 2.1 模块安排

以下路径相对仓库根；标为新增的文件在对应任务开始时创建。相邻模块保持小而清楚，实际命名若因现有代码约定微调，同步本表和研究正文。

| 文件 | 责任 |
|---|---|
| 新增 `src/task-dsl/authorization/schema.ts`、`schema.test.ts` | Zod 声明/结果类型、版本、结构诊断 |
| 新增 `src/task-dsl/authorization/semantics.ts`、`semantics.test.ts` | 引用解析、明确 tuple 展开、稳定义务 ID、政策适用性与冲突 |
| 新增 `src/task-dsl/authorization/render.ts`、`render.test.ts` | 从同一事实对象渲染 B/D；限制重复上下文 |
| 新增 `src/task-dsl/authorization/result.ts`、`result.test.ts` | 输出核对、引用存在性、覆盖与变更影响 |
| 新增 `src/task-dsl/authorization/index.ts` | 导出 parse/compile/render/validate 等公开函数，无 case 分支 |
| 新增 `src/benchmarks/authorization-dsl/inputs.ts`、`inputs.test.ts` | 从精确清单读取源码与定位表；模型输入边界 |
| 新增 `src/benchmarks/authorization-dsl/telemetry.ts`、`telemetry.test.ts` | 包装 provider，每次调用先记录后解析，已知和未知费用分别处理 |
| 新增 `src/benchmarks/authorization-dsl/host.ts`、`host.test.ts` | 固定上下文、不可执行的结构化输出通道、统一调用与修复策略 |
| 新增 `src/benchmarks/authorization-dsl/evaluate.ts`、`evaluate.test.ts` | 确定性检查加逐事实 review 记录，生成配对比较 |
| 新增 `src/benchmarks/authorization-dsl/run.ts`、`run.test.ts` | `check/run/evaluate/status` 开发命令与可恢复阶段；无独立产品 CLI |
| 新增 `src/benchmarks/authorization-dsl/fixtures/` | 只放小型合成测试数据，真实输入复用 T 案例 |
| 复用 `src/providers/structured.ts`、`registry.ts`、`types.ts` | `extractStructured`、`createProviderForModel` 和现有路由配置 |
| 新建于 V0 的 `results/skill-ir/skill-dsl-research/development/authorization-v0/` | 声明、修订 oracle、运行、逐项评价、status 与汇总 JSON |
| 更新研究总文档、current-status、plan、spec、developer-guide | 分别维护设计/复盘、状态、队列、方法合同、运行与测试入口 |

领域模块不依赖 `results/`、oracle、Open WebUI 或某个 skill 名称；实验层允许按照案例 ID 读取对应数据和答案。复用已有 Zod/Bun，首版无需增加依赖。

### 2.2 声明与解释合同

首版公开符号建议为 `AuthorizationTaskV0`、`AuthorizationResultV0`、`CompiledAuthorizationTask`、`Diagnostic`；函数为 `parseAuthorizationTask`、`compileAuthorizationTask`、`renderAuthorizationTask`、`validateAuthorizationResult`。这些是待实现接口，V1–V4 负责落地。

- 声明包括 `schemaVersion`、`taskId`、`request`、`repository`、`sourceRef`、`sourceMode: "fixed-context"`、`policySources`、`principals`、`resources`、`entries`、`obligations`，以及从原 task 输入保留的 `scopeAssurance`、`requiredAnalysis`、`constraints`。
- `policySources` 记录 ID、规则文本、来源位置、`accepted/conflicted/unresolved` 及接受者角色/理由。接受记录由作者或宿主提供；代码观察留在分析结果。
- 主体记录身份和起始能力；资源记录对象；入口记录命名入口和允许源码定位。字段名、函数名等项目细节放在这些实例及证据里。
- 每条 obligation 明确一个 `principalId/resourceId/relation/operation/expectation/conditions/policySourceId` 及非空 `entryIds`；`expectation` 为 `allow/deny/conditional`，把规范预期与实现观察分开。只展开这一条中的 entry 列表，逐项去重，不做所有主体×资源×条件的笛卡尔积。
- `conditions` 记录具名条件及依据，允许空数组；关系使用有意义的领域标签，例如 `no-write-grant`。核心结构采用 closed schema，领域实体名称保留可扩展字符串；没有可选备注、部署资料或条件时正常处理。
- 语法错误给字段路径与诊断；政策未决/冲突保留为不可裁决的义务，其他已明确义务继续。空 obligations 返回 `needs-input` 和零可运行任务，不发布“全部检查完成”。
- 稳定义务 ID 基于作者 obligation ID 与 entry ID，数组重排保持身份。sourceRef/policy/相关输入变化用 revision/依赖比较标记需复查，ID 本身不承担内容有效性证明。
- 结果结论统一使用 `source_supported_failure/source_refuted/unknown`。每项附 explanation、按 entry/binding/control/effect/condition 分组的事实与 citation、决定性缺失事实、建议补充观察。
- 输出中分开 declared obligations 的处理状态、宿主写入的 discovery 状态和逐项 evidence 检查状态。首轮 discovery 固定 `not-tested`；合理 unknown 可以是已处置任务，事实缺口仍保留。

从三个 `task.json` 到声明的首版映射由开发者根据允许输入编写，并记录字段来源为 JSON pointer 或源码位置；按输入中的任务要求声明目标，不提前填写控制有效性或正确结论。声明生成过程标为 authored，后续模型起草属于独立功能。

### 2.3 模型与比较合同

- 两臂使用完全相同的政策、源码、任务事实、输出 schema、模型/路由、温度、输出上限和修复机会。B 得到清楚完整的 Markdown；D 增加领域编译、义务展开与状态支持。运行前保存 rendered inputs 并检查事实逐项对应。
- 共用结构与引用有效性检查；D 的义务展开/状态诊断作为方法干预单独记录。B 的最终评分仍检查同一任务要求。任何两臂诊断差异都列在 `comparison-config.json`。
- 使用 `createProviderForModel(modelId)`，在实验子进程启动前设置 `SKVM_AUTO_PROBE=0`，避免自动探测、切换协议和写入用户配置。结束后不改变用户全局设置。
- `extractStructured` 的 schema tool 仅用于返回 JSON，无执行器。禁止提供或执行文件、命令、网页工具；不调用 `completeWithToolResults`。未知 tool 名返回协议错误。
- 首版 `maxRetries: 1`，即一次 schema 通道请求失败后最多一次 prompt/parse 回退；每个生成单元最多一次由可操作诊断触发的领域修复，修复再次使用同样的有界结构化策略。由 runner 记录最初结果与修复结果。
- 格式/领域修复仅使用模型可见输入和确定性诊断。oracle、语义评分和参考答案只在该单元全部生成结束后读取，不进入 repair prompt。
- 运行层使用相同有限 timeout 和 context/output 上限，在 V7 按现有模型路由能力写入配置；超限返回具体状态，完整输入装不下时不静默裁剪。
- 每次 provider 调用记录阶段、开始/结束、response/error、usage 和费用可得性。收到响应后先留记录，再做 schema 校验；无响应仍记尝试，token/费用为 unknown。SDK 内部 HTTP 重试不可见时单列 `transportAttempts=unknown`，provider 调用数和 HTTP 请求数不混用。
- telemetry wrapper 的记录作为实验计量依据，不再累加 `extractStructured` 返回的汇总以免重复。若包装已解决实验计量，本轮无需修改通用 provider；若确有共用缺陷需要修改，先补 provider 聚焦回归，保持公共接口兼容。

## 三、V0–V10 执行队列

### V0 — 恢复与建立开发现场

**读取：** current-status、本任务书、研究 §7.9–7.19、spec 14.34、T case manifest。按需读取相关模块，不重跑历史研究。

- [ ] 记录分支、提交、tracked 修改及本轮归属文件；保留其他线程内容，不清理历史目录。
- [ ] 创建 `development/authorization-v0/status.json`：stage、taskStatus、nextAction、implementationRevision、comparisonStatus、unresolvedIssues。所有任务初始 `pending`。
- [ ] 确认 Bun、项目依赖、Python 文档检查入口可用；读取路由只输出非敏感的模型标识和能力，不打印密钥/完整配置。
- [ ] 在研究 §7.19 更新开发入口和接口草案；本轮以同一任务语义实现，不重新选类。

**完成：** 执行者知道接下来改哪些文件、如何验证及恢复；此时模型运行数为零。

### V1 — 领域声明 schema 与语义解析

**文件：** `schema.ts`、`semantics.ts` 及相邻测试；实际实现前先阅读准备修改的完整文件。

- [ ] 首先用小型 synthetic declaration 写失败测试：合法非 Open-WebUI 名称、缺版本、错类型、悬空引用、重复 ID、空可选数组、政策 conflict 和空义务。
- [ ] 运行 `bun test ./src/task-dsl/authorization/schema.test.ts src/task-dsl/authorization/semantics.test.ts`，确认失败指向未实现的解析/诊断行为。
- [ ] 用 Zod `.strict()` 实现结构解析；语义层解析引用并返回 `{ task, runnableObligations, blockedObligations, diagnostics }`，结构错误保留字段路径。不要把 task/ref 字符串硬编码成某个案例。
- [ ] 绿灯后补充关系/条件来源检查；未决政策只影响相关义务。记录可选缺项和真正缺输入的处理差异。
- [ ] 更新研究正文的最终字段表与公开符号；完成该独立实现后可提交 `feat: add authorization task declaration`。

核心断言形状（测试 fixture 在本任务中构造）：

```ts
const parsed = parseAuthorizationTask({ ...validTask, conditionsNote: "extra" })
expect(parsed.success).toBe(false)
const compiled = compileAuthorizationTask(taskWithOneConflictedPolicy)
expect(compiled.runnableObligations).toHaveLength(1)
expect(compiled.blockedObligations).toHaveLength(1)
```

**完成：** 可以从一份合法领域声明得到可运行与待补充的任务；错误能定位并指导修改。

### V2 — 义务展开、稳定身份与 B/D 渲染

**文件：** `semantics.ts`、`render.ts`、相邻测试及 `index.ts`。

- [ ] 红测试覆盖 entry 去重、数组重排 ID 稳定、增加 explicit write grantee 只增加对应义务、缺角色信息诊断。
- [ ] 定义 `CompiledAuthorizationTask`：接受的事实、展开义务、待解决项、source/policy 依赖；同一 obligation 的多个 entry 各生成一项。
- [ ] 实现 B/D renderer，共用事实收集函数；B 使用明确 Markdown 段落，D 使用领域计划和义务列表。源码由宿主在统一位置插入，避免每个义务重复附整个源码。
- [ ] 对两个 renderer 检查 repository/ref、原 request、政策原文、scopeAssurance、主体/资源/条件、所有分析要求和结论规则；自由文本不丢失。不用字符串长度或出现某个关键词验证信息等价。
- [ ] 运行 `bun test ./src/task-dsl/authorization`；抽读三个任务的 B/D preview，说明差异落在方法组织的哪一层。

关键测试：

```ts
const before = compileAuthorizationTask(task)
const reordered = compileAuthorizationTask(reorderEntries(task))
expect(reordered.obligations.map(x => x.id).sort())
  .toEqual(before.obligations.map(x => x.id).sort())
expect(renderAuthorizationTask(before, "B").facts)
  .toEqual(renderAuthorizationTask(before, "D").facts)
```

`facts` 相等之外，测试逐项事实确实进入发送给模型的文本；避免两臂返回同一 sidecar 却漏渲染。`reorderEntries` 是该测试文件内的纯 fixture 变换。

**完成：** 同一声明可以组织两个公平的任务输入，任何任务名称都走同一逻辑。

### V3 — 精确输入与参考答案的局部修订

**文件：** `inputs.ts`、测试；新增 `development/authorization-v0/declarations/`、`evaluation/`。

- [ ] 写失败测试：只读取允许文件；拒绝 parent/absolute/symlink escape；缺文件返回诊断；额外 oracle 文件不进入 prompt；crop 行号与原始位置保持可区分。
- [ ] 实现输入读取器。领域运行函数只接受准备好的 `SourceBundle`，不传 oracle 路径；manifest 和评价材料只由实验外层持有。不存在“递归复制整个案例目录”的默认行为。
- [ ] 根据每个 task 的允许输入编写三份声明和 `authoring-map.json`，保留字段来源。模型输入保留原自然任务与规范文本。映射过程不从修复提交或 oracle 添加答案暗示。
- [ ] 在本轮 `evaluation/` 保存修订的 trusted-header oracle 与 protocol，写出 old/new/原因和原材料路径；T 原文件保留。补齐 `ENABLE_PASSWORD_AUTH` 先行拒绝、trusted-header 条件、认证成功与 session 关系。
- [ ] 给修订 rubric 加控制关闭/认证失败反例；最终 deployment `unknown` 及 env/proxy/ingress 的事实要求保留。
- [ ] 运行 `bun test ./src/benchmarks/authorization-dsl/inputs.test.ts`，无网络；研究正文记录这次发现如何影响条件建模与评分。

**完成：** 三个案例有可运行声明、精确输入、可解释字段来源和修订后的评价依据。

### V4 — 结果、覆盖与变更状态

**文件：** `schema.ts`、`result.ts`、测试。

- [ ] 红测试包括：遗漏/重复/陌生 obligation、错 ref、越界行号、引用文本不符、sink-only 引用、已填表却声明全仓检查完成。
- [ ] 实现结果结构和引用定位；缺失项保留 `pending`，其他有效任务结果继续返回。引用存在性输出为机械检查，语义支持状态初始 `unreviewed`。
- [ ] 主机生成 declared/discovery/evidence 三组统计。`unknown` 需 explanation、决定性缺失事实和建议观察；结构层检查是否提供，语义层判断是否合理。
- [ ] 实现相关依赖变更检查：政策变更或相关 source 变化标 `needs-review`；新的 ref 先保留旧结果所属版本，确认相关输入与政策未变后可记录复用依据。无需引入新哈希冻结链。
- [ ] 测试漏入口只影响全范围完成表述、已检查 entry 的有效结论可保留；空清单不会产生 100% 完成。

关键断言：

```ts
const checked = validateAuthorizationResult(compiled, answer, sourceBundle)
expect(checked.evidencePresence[0].status).toBe("present")
expect(checked.evidenceSupport[0].status).toBe("unreviewed")
expect(checked.discovery.status).toBe("not-tested")
```

**完成：** 程序能指出具体遗漏、失效和引用问题，部分正确结果能单独保留。

### V5 — 固定上下文宿主与完整尝试计量

**文件：** `telemetry.ts`、`host.ts` 及测试；条件性修改通用 provider 只限必要兼容修复。

- [ ] 写 mock provider 红测试：首次 schema response 无 tool call、fallback 成功，usage 应计两次；无响应异常标 unknown；一次缺 USD 则 total actual USD 未知，同时保留已知小计。
- [ ] 包装 `LLMProvider.complete`，调用前记 attempt，返回后保存 response，再交给结构化解析；异常写入记录再原样传播。拒绝包装器中的 `completeWithToolResults`。
- [ ] 实现宿主 `runAuthorizationTask`：传入 task/sourceBundle/provider/arm/options，构造统一上下文、调用 `extractStructured`、运行检查并返回结果和 attempts。provider 原始响应存盘须遮蔽凭据，生成内容和必要引用完整保留。
- [ ] 验证只存在指定 schema 输出工具，无外部工具定义和 executor；遇到其他 tool 名返回 transport failure。先确认该路径能做到，再投入真实模型调用。
- [ ] 禁用实验子进程的 auto-probe，测试不发生隐藏路由切换与配置写入。超时先记录，在请求状态不明时不同时重发；若 provider 没有取消接口，记录 pending/unknown 并结束该 worker。
- [ ] 按本书 2.3 实现至多一次 actionable domain repair；初始/修复前后结果分别保留。只有机械诊断可进入修复请求，oracle 不加载进 host。
- [ ] 运行 `bun test ./src/benchmarks/authorization-dsl/telemetry.test.ts src/benchmarks/authorization-dsl/host.test.ts`；涉及共享代码时补 `bun test test/providers/structured.test.ts test/providers/structured-error-propagation.test.ts test/providers/registry.test.ts`。

**完成：** mock 下端到端执行与恢复可用，调用记录覆盖失败、fallback 和修复。

### V6 — 可审阅的语义评价与配对统计

**文件：** `evaluate.ts`、测试、本轮 evaluation 数据；研究总文档同步评分职责。

- [ ] 先以手写候选答案测试评价接口：正确改述、正确关键词但因果反转、漏上游控制、忽略入口开关、无内容 unknown、全部 unknown。
- [ ] 实现机械评分与语义 review 分离：程序判断 schema/引用/任务覆盖，语义 review 对每项关键事实给 `supported/contradicted/missing/uncertain`、理由、回答位置、源码位置和适用 oracle rule。
- [ ] 首六份输出由执行代理依据原始输入与修订 rubric 逐项填写 review，记录 `reviewerKind=development-agent` 和身份；这是开发阶段代理复核，不另建 reviewer 模型服务，不登记为真人审核或六次被测模型调用之一。宿主代理开销无计量时记 unmeasured。
- [ ] review 文件绑定具体 attempt、原始输出和 rubric 版本；有争议项目保留 `uncertain`。程序验证 review 完整性与引用，按明确规则生成 `taskDecisionCorrect`、criticalFacts、scopeHonesty 和错误类型。
- [ ] 质量通过要求该 case 的正确结论和全部关键事实受支持；裁决必要项 uncertain 时记待复核。不能靠词匹配或预期标签自动填 supported。
- [ ] 成对汇总报告初始质量、修复后质量、引用/覆盖诊断、耗时、各类 token、providerAttempts、已知费用与未知请求。`source_refuted` 是正常任务成功，合理 unknown 按对应 oracle 计分。
- [ ] 运行 `bun test ./src/benchmarks/authorization-dsl/evaluate.test.ts`；修改任一 review 关键事实应按规则改变结果。

**完成：** 每个分数可以追到具体判断和源码；程序与 reviewer 的贡献清晰。

### V7 — 开发入口、离线演练与运行配置

**文件：** `run.ts`、测试、本轮 `comparison-config.json`；developer-guide 指向研究 §7.19 的使用说明。

- [ ] 提供 `check/run/evaluate/status` 子命令，所有参数有诊断，`--help` 不初始化 provider。可注入 sourceBundle 的公开函数保持独立于案例目录。
- [ ] `check` 输出三份声明、B/D preview、文件清单和诊断，无模型调用；mock 演练一次 `run` 到 `evaluate` 全链。
- [ ] 写 `comparison-config.json`：实际可用 modelId、同一路由和设置、timeout/maxTokens/context limit、case 次序、每 case 的 B/D 顺序、相同修复上限、源码与 rubric 版本、诊断差异。案例顺序为 file→text→header，臂顺序为 B/D、D/B、B/D。
- [ ] 选择已配置可用模型；不另行强制某个供应商。配置不存在时说明缺项，继续完成无网络任务；不展示凭据。配置值在首轮调用前记录，结果不能反向决定设置。
- [ ] 运行 `bun test ./src/task-dsl/authorization src/benchmarks/authorization-dsl` 和 `bun run typecheck`。若已有无关失败，定位并单列，不改无关线程文件。

计划开发命令（仅 V7 实现后可用；在仓库根执行）：

```powershell
bun ./src/benchmarks/authorization-dsl/run.ts check
bun ./src/benchmarks/authorization-dsl/run.ts run --config=./results/skill-ir/skill-dsl-research/development/authorization-v0/comparison-config.json
bun ./src/benchmarks/authorization-dsl/run.ts evaluate --run-dir=./results/skill-ir/skill-dsl-research/development/authorization-v0/runs/initial
bun ./src/benchmarks/authorization-dsl/run.ts status
```

`run` 默认写 `runs/initial`；已存在的单元不重发，恢复只执行 pending。失败保留为终态；明确需要重试时指定新 attempt 并登记原因。不要把 `evaluate` 或 `status` 接成隐式付费调用。

**完成：** 无网络检查可复现，实际运行参数和逐单元恢复规则齐全。

### V8 — 三组真实 B/D 配对

- [x] 执行预定六个生成单元，每个 fresh context；失败单元也保留，不换案例。第一组同样进入正式分母，不额外跑有答案反馈的 warmup。
- [x] 每个单元保留声明、实际发出的 prompt、原始回答、结构化结果、机器诊断、attempts 与成本可得性；不记录密钥或完整请求头。
- [x] 完成所有生成后按 V6 逐项评价。被测运行看到的资料不含 oracle、既有回答或评分。
- [x] 比较 task correctness、关键控制 trace、false positive/negative、范围表述与开销，报告具体改善/退化位置。
- [x] 若 provider 不可用，不反复烧调用；记录未运行单元及原因，继续 V10 的代码交付和恢复说明。若已发请求结果未知，保留未知成本。

**完成：** 有完整六单元的结果或明确未执行原因；三个条件样本来自一个真实项目/ref，分别统计，不扩写为多个独立项目。

### V9 — 根据真实失败做一次有依据的开发修订

**2026-09-21 revision 1（运行前记录）：** 首轮四个 completed initial outputs 中三个把 authored obligation ID 写入 `obligationId`，机械验证均报 `foreign-obligation-result` 与 `missing-obligation-result`；B/D 都出现，且 domain repair 能在三个案例中纠正 ID，故定位为共享输出合同不够显式，而不是案例语义或 arm 专属优势。V9 只把 exact runnable expanded IDs 作为 closed list 放入两臂共同 result contract，不加入 oracle、结论或案例分支。以 `comparison-config-v9-expanded-id.json` 仅重跑受影响且首轮双臂均完成的 file pair，保留首轮结果，不重发两个 timeout-unknown 单元。

**Revision 1 结果：** 两臂的首个 schema response 都使用了正确 expanded ID，目标缺陷已消除。B 的 schema response 另有缺字段/混入字符串，fallback 于 180 秒仍 pending，故保持 `timeout-unknown`；D initial 只剩八项 citation-text mismatch，一次 repair 后 full-success。修订 pair 因 B 超时仍不完整，不与首轮拼接为成功 pair。下一步选择“先简化领域支持”：优先收窄/增强 result 与 citation transport，再考虑入口发现或第二项目。

- [x] 逐个失败归因到声明、renderer、输入、结构化传输、领域状态、模型推理或评价依据，在研究正文记录最小反例和根因。
- [x] 若存在可定位共享实现缺陷，先加失败测试再修复；工程调试可正常迭代。不得按 case 名输出正确答案，或把 oracle 事实塞进模型任务。
- [x] 如果修订会影响效果，记录新的代码/配置 revision，最多追加一轮受影响案例的 B/D 成对运行；初轮与修订后结果各自汇总，不拼接成全成功。
- [x] 若两臂均正确、差异很小，保留该观察，完成可用性、代码和文档工作；不为制造优势临时扩样。若无可定位修复，就交付具体模型/方法问题和证据。
- [x] 输出下一步选择：继续相同语义的第二项目、增加入口发现，或先简化领域支持。选择要引用实际错误和开销，不只给状态标签。

**完成：** 首轮运行产生的工程问题得到处理或解释，后续研究问题来自真实使用。

### V10 — 工程交付、复盘与发布

- [x] 复跑受修改影响的测试和主 typecheck；新增 benchmark 必须在现有 tsconfig 检查范围内。真实付费调用不作为每次回归的默认动作。
- [x] 一次离线复验：用已归档输入和回答重跑 parse/compile/validate/汇总，与已记录结果比较；语义 review 复用并注明，没有把离线重算算成新判断。无需创建历史 clean archive 或重做全量审计。
- [x] 补齐公开函数、字段说明、错误示例和四条实际命令，明确运行哪一步会调用模型、输出在哪里、如何恢复；研究正文保留简明当前设计和开发复盘。
- [x] `status.json` 标明 engineeringStatus、comparisonStatus、nextAction；`summary.json` 列实际交付、初轮/修订结果、已知/未知成本、未解决项与具体下一动作。不以获得正向效果作为代码完成的唯一标准。
- [x] 文档单测、变更文件链接检查和 `git diff --check` 各做一次；涉及共享逻辑时做相应回归，不扩大成历史材料复核。
- [x] 只提交本轮归属代码、数据与文档块，推送 `origin/skill-ir-aot`。混有他人内容的文档按修改块处理；无法可靠归属的内容保留并明确未发布。
- [x] 更新 conversation log、当前状态与计划；完成后交付，不自动换类别或扩成长时间新队列。

**完成：** V0–V10 的八个归属提交已通过 `ff5a98a` 推送到 `origin/skill-ir-aot`；工程状态为 `completed-development`，比较仍不完整、效果仍为 `not-established`。现有工作树的其他修改和未跟踪材料未清理、回退或纳入提交。

## 四、研究总文档怎样记录开发历程

正文 §7.19 是当前开发合同；§12 的日期记录保存演变。每个真正改变设计或行为的问题写一条短记录：

```text
日期 / V 阶段 / 问题 ID
触发：哪个声明、输入或响应出现了什么现象。
根因：对应代码/接口/领域假设，给最窄位置。
处理：修改了什么，选择这一办法的原因。
验证：新增反例、测试与实际运行结果路径。
方法变化：是否影响分类、字段语义、消费方式或评分。
剩余问题：已解决范围与下一项可验证问题。
```

不逐条抄终端日志。原始响应、失败、JSON review 和机器结果放同一研究目录下的 development 子目录；正文链接到最窄证据。修订当前语义时同步主题段落，并保留旧决定的日期与原因。每个有意义阶段也在 `D:\skill优化\conversation_log.md` 追加一条简短记录。

## 五、执行与失败处理

- 网络、配置好的远端模型和 purposeful paid 调用沿用用户授权，无用户设定费用上限；模型、回退、修复和开发代理成本分别记录。请求次数由具体问题驱动。
- 本轮的真实模型计划为六个生成单元及 V9 一轮受影响配对；fallback/repair 另计。网络错误修复后只补对应失败单元，保留初次失败。两次相同基础设施失败无新诊断时先完成其他代码与文档，不反复重发。
- 开发过程允许修改 schema、renderer 和评价实现；语义或对照改变先更新本任务书与研究正文，再以新 revision 运行受影响比较，不要求另立多层冻结身份。
- 常规代码修复、聚焦测试和文档更新连续完成。只有领域方向大改、需要用户独有信息，或触及未授权外部副作用时提出具体问题。
- 不执行外部目标项目、不探测真实部署、不读取受保护 held-out/Q1；普通公开源码和本轮 development 输入可按任务使用。历史 readiness 与旧结果保持原状。
- 以可运行代码、清楚诊断和真实比较为交付；不以固定小时数、文档数量、全部绿灯的研究效果或所有 skill 覆盖为验收。

## 六、启动语句

> 将执行 `D:\skill优化\SkVM\docs\superpowers\plans\2026-09-20-authorization-dsl-prototype-development.md` 的 V0–V10 设为持续目标。正式实现授权任务 DSL 第一版：完成 canonical JSON、领域语义与义务展开、信息相当的 B/D 渲染、精确源码输入、结果与覆盖检查、固定上下文模型宿主、完整调用计量及逐事实评价。先用失败测试落实共享规则，再完成三组真实 B/D 配对；按 V9 修复有依据的共享问题并保留首轮与修订结果。复用已有 SkVM，不新建产品 CLI、不按案例名写成功分支。开发中解决的问题、方法调整和验证直接更新研究总文档，机器证据放其 development 子目录。连续推进常规检查点，按任务书处理失败与费用，完成后只提交本轮归属改动并推送 origin/skill-ir-aot，交付可运行实现、真实结果和具体下一步。
