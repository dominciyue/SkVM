# AJ0–AJ16：授权任务证据准备与局部修改

> **For agentic workers:** 使用 `superpowers:executing-plans` 连续执行；实现使用 `superpowers:test-driven-development`，异常使用 `superpowers:systematic-debugging` 定位。用户已批准上一轮复核方向，并明确要求派发 `gpt-6-sol / max`。一个任务负责实现、共享文档和 Git；只读探子可探索或独立核验，不承担代码修改。不在常规阶段等待确认。

**Goal:** 在现有授权 DSL 上交付“指定入口的证据准备 → 普通运行 → 按场景局部修改 → 变化后真实运行”，减少决定性源码缺口和无关声明改写，并用公平对照检验回答质量与修改负担。

**Architecture:** 保留 authoring/v2、analysisContract/v1、wire/v6、现有 fixed-context host、workspace/compose 和计量。新增模型运行前的有界源码准备与纯局部编辑模块；准备产物仍进入同一个零工具分析宿主。源码定位和政策判断各有来源，不从实验答案补输入。Markdown 与 DSL 都能使用同一准备能力。

**Tech Stack:** TypeScript、Bun、Zod、既有源码目录/引用校验、普通 SkVM CLI、Git 只读源码获取、Python 文档检查。

- 日期：2026-09-27；状态：2026-09-28 AJ0已启动，恢复状态在本轮结果根。
- 开发基线：`47c08965eab4d750d950d827291384e3b04e7564` 加本规划提交；直接在 `D:/skill优化/SkVM` 的 `skill-ir-aot` 工作，仅推用户 `origin`。
- 开发模型：`gpt-6-sol / max`。被测分析模型默认沿用 `xty/gpt-5.6-sol`；开发代理、作者生成、材料准备、分析、评价分别记账。
- 结果根：`results/skill-ir/skill-dsl-research/development/authorization-evidence-editing-v1/`；AJ0 开始后才建立 status/journal。
- 唯一研究正文：[研究总文档](../../skill-ir/skill-dsl-research.md) §7.29。小设计调整在本书和该节同步后继续，不另建逐轮长篇设计/总结。
- 投入：回答质量约60%，编写/修改/复用约40%；分开评价，不合并成一个成功分数。
- 连续做到 AJ16，完成后交付。不要用等待、重复审计、重复生成或自选追加任务延长运行。

## 1. 为什么做这一轮

父任务已新鲜核对 AI：359 pass/1平台skip、2494 assertions、typecheck及两份零调用评价重放通过；基线与origin一致，工作区干净。

AI 首轮 M0/D0/M1/D1 最终完整分别8/6/7/8；D0缺少两条响应。双方完成的D0/D1六对均完整。54总单元中40完成、14传输缺失；唯一语义争议来自OWUI file裁剪遗漏helper前缀。作者8份首稿中5有效、2传输失败、1JSON无效，修订后7有效，另1经单字符机械恢复。消费16场景全部完整，Markdown/DSL各8，但尚无稳定新增质量优势。

实际代码还显示两处可改善的机制：

1. `inputs.ts` 能绑定精确源码与引用，但输入选择是否覆盖决定性检查，仍主要由作者负责。补齐一个helper的内容和发现整个仓库的所有入口是不同规模的任务；本轮实施前者。
2. AI 的 `author-use-generate.ts` 要求变化稿重新输出完整v2对象；`author-use-select.ts` 再通过顶层字段diff生成workspace replacements。局部修改发生在整包重写之后，容易多改taskId、场景名或产生JSON语法错误。本轮让小改动直接进入程序化编辑流程。

取舍：稳定使用v6，不启动v7、通用控制流分析器、新UI或另一套CLI。保留简明Markdown作为合理基线，研究允许positive/mixed/negative；工程缺项不得由“研究mixed”代替。

## 2. 必读上下文与恢复入口

执行者按顺序亲读：

1. 根/仓库 `AGENTS.md`、[current-status](../../skill-ir/current-status.md)、本书、[当前计划](../../skill-ir/skill-ir-aot-optimization-plan.md)、[spec §14.34](../../skill-ir/skill-ir-aot-optimization-spec.md#1434-按-skilltask-范围设计领域-dsl)。AGENTS里历史C/F队列以当前入口为准。
2. 研究§1–2、§7.10–7.15、§7.27–7.29、§11。理解政策由谁提供、入口假设和源码事实的区别。
3. AI结果根中的 `panel-summary.json`、`evaluator/review-decisions.json`、`author-use-summary.json`；抽查争议file原答和Gitea作者修复，不重读全部raw。
4. AI `author-use-generate.ts`、`author-use-select.ts`；[使用说明](../../usage.md)、[任务语义示例](../../../examples/authorization-assessment/task-semantics/README.md)、[场景工作区示例](../../../examples/authorization-assessment/scenario-workspace/README.md)。
5. 下述代码图及实际将修改的文件。根handoff/communication只在恢复缺上下文时读取；每个有意义阶段在仓库外 `D:/skill优化/conversation_log.md` 追加简短记录。

中断后从本书、结果根status/journal、Git未提交差异恢复。status写明已完成阶段、下一命令、未结算请求、已修改文件、待提交项。旧任务的停止指令是历史记录，当前AJ执行授权有效。

## 3. 设计合同

### 3.1 同一任务类

仍是单repository/ref、明确政策和指定入口的source-visible授权/信任边界分析。准备阶段允许只读定位该入口的直接源码依赖；分析模型仍只消费准备好的fixed context，无shell/网络执行能力。允许公开GitHub/认证gh获取和有目的付费，禁止执行目标项目或使用真实部署作为试验对象。

### 3.2 有界证据准备

作者给定任务、入口、源码根和允许的文件范围。准备器负责保存原始位置、读取指定源码、合并重叠范围、纳入显式依赖、列出缺失/歧义/预算截断；不凭函数名推断guard有效，不宣称已证明路径或全仓完整。

首版必须支持语言无关的显式文件/行范围。完整文件在预算内优先直接保留；超预算使用明确的源坐标，禁止按字符截断半个片段再隐藏截断事实。符号定位复用现有 `source-location.ts`，唯一命中且范围可验证才采纳；无法可靠识别时返回定位诊断并允许补显式范围，不为了泛化临时手写各语言完整解析器。

准备边界建议类型如下，在AJ1核对现有类型后定稿；变更必须同步所有调用处和本书：

```ts
export interface AuthorizationEvidenceRequest {
  schemaVersion: "authorization-evidence-request/v1"
  sourceRoot: string
  allowedFiles: string[]
  entries: Array<{ entryKey: string; path: string; startLine: number; endLine: number }>
  dependencies: Array<{
    id: string; from: string; path: string
    startLine?: number; endLine?: number; match?: string
    reason: "identity" | "resource-binding" | "control" | "effect" | "other"
    basis: "author" | "locator" | "model-proposal"
  }>
  limits: { maxFiles: number; maxBytes: number; maxDepth: number }
}
export interface AuthorizationEvidenceReport {
  status: "ready" | "partial" | "invalid"
  included: Array<{ path: string; originalPath: string; startLine: number; endLine: number; origins: string[] }>
  gaps: Array<{ id: string; entryKey: string; reason: string; attemptedPath?: string }>
  closureClaim: "declared-dependencies-only"
}
```

- 默认上限12文件、64KiB UTF-8正文、2层已指名依赖。按入口优先、声明依赖顺序、路径/行号稳定去重；不依据oracle或模型答案排序。具体上限可在首次研究调用前按真实材料调整并记账。
- 不要求用户手工知道每个helper：普通使用允许一次模型辅助提出依赖路径/范围，也允许已有定位器提议。提议经宿主检验路径、坐标和预算后读取；来源标为proposal，不能把建议的“这是授权检查”写成已证明事实。准备调用单列，MD/DSL共用同一准备结果，不各生成一遍。
- 动态dispatch、外部中间件、缺文件、同名符号和超预算都有明确gap；有效部分可以继续分析。越出允许根/读取保护材料/无法绑定来源属于invalid。缺少可选声明正常通过。
- `ready`只表示声明的材料准备完成。`partial`不能自动改政策expectation，也不替模型填写unknown。将来源范围及缺口作为相同公共上下文给两种表示，最终答案由源码和任务决定。
- 可用范围扩充必须从该固定ref的权威源码生成新输入身份，不覆盖AI裁剪或旧报告。原始行号、文件身份和引用映射全程可复核。
- 新输出为普通可消费输入、源码快照和紧凑准备报告；必要sidecar通过现有loader显式接线并进入session/compare依赖。不得只在研究driver里拼特殊prompt，或要求普通用户提供evaluator。
- AJ1接口核对：`dependencies.from`引用已声明entry key或另一依赖id，因而`maxDepth`实际约束依赖链；`match`只用现有literal locator验证唯一命中且处在显式闭区间，不能从命中自行推函数边界。准备器输出normalized普通input，内含可选`evidencePreparation`报告；每个快照文件最多一段连续原行范围，完整文件在预算内优先。loader用报告范围标注source catalog，并机械核对行数、来源文件与缺口状态；同一source bundle的渲染把报告作为公共上下文供plain/DSL及真实run共享。作者v2原件与源码根保持只读。若入口本身无法纳入快照，拒绝产生可运行input；非入口依赖缺口可partial并运行。

### 3.3 局部编辑

用作者已有的policy/scenario/entry key定位。模型或用户提出小补丁，程序应用并序列化完整输入；普通JSON全量输入和旧workspace仍兼容。

```ts
export type AuthorizationEditOperation =
  | { kind: "policy"; key: string; set: { text?: string; location?: string; revision?: string; reason?: string } }
  | { kind: "scenario"; key: string; set: { relation?: string; expectation?: "allow" | "deny" | "conditional"; operation?: string } }
  | { kind: "premise"; scenarioKey: string; premiseId: string; statement: string }
export interface AuthorizationEditRequest {
  schemaVersion: "authorization-local-edit/v1"
  operations: AuthorizationEditOperation[]
  reason: string
}
```

- 只允许已声明key；同一属性重复赋值拒绝，不默默按最后一次生效。taskId、repository/ref、源码路径和其他场景默认保持。首版不支持rename/delete或任意JSON Pointer写入。
- 政策变化可能影响多个expectation，不能从政策自然语言自动猜新标签。列出引用该policy的场景及所需复查；patch须为每个引用场景显式提供scenario.expectation，即便值保持原样也表示作者已给出本次对照。未提供的产物可保存草稿，但不可静默当作ready运行；这属于编辑请求的完整性检查，不是额外用户审批。
- 关系变化需要检查同场景前提、公开说明是否冲突；确定性检查负责结构，残余自然语言一致性由作者/独立评价确认，不做无依据自动改写。
- 纯函数不修改传入对象，输出完整v2值、修改字段路径、受影响场景、诊断；复用现有lowering和check。无关字段的结构值必须逐项相同。
- 用现有workspace/compose承载变体，不把“先让模型重写全文再求diff”算作局部编辑。模型辅助仅产生patch；诊断修订仍修patch。删除多余括号等恢复另记，不能计首次成功。
- compare继续报告共享context下的完整依赖影响。禁止只根据引用过的几行复用旧答案；本轮变化任务重新运行并评价。

### 3.4 接线与责任

沿用普通 `authorization` 路由。计划新增薄子命令 `prepare` 和 `edit`，分别调用可直接测试的模块；沿用check/run/inspect/compare，不开发新产品壳。输出到新目录/文件，源任务和源码只读；`--check-only=true`不创建provider/输出。路径移动后的相对引用由现有sourceRoot/compose机制处理。

新增组件保持小文件职责：

| 文件 | 工作 |
|---|---|
| `src/benchmarks/authorization-dsl/evidence-preparation/schema.ts`、`prepare.ts`、`prepare.test.ts` | 请求、范围/依赖/预算、准备报告与普通产物 |
| `src/benchmarks/authorization-dsl/inputs.ts`、`source-location.ts` | 复用source catalog、原位置及定位；必要共享缺陷修复 |
| `src/benchmarks/authorization-dsl/authoring-workspace/local-edit.ts`、`local-edit.test.ts` | 纯补丁验证/应用/影响说明 |
| `src/benchmarks/authorization-dsl/authoring-workspace/schema.ts`、`plan.ts`、`materialize.ts` | 接受局部变体并复用现有物化，不复制composer |
| `src/cli/authorization-prepare.ts`、`authorization-edit.ts`及对应test | 薄文件IO和命令接口 |
| `src/cli/authorization.ts`、`src/index.ts`的既有路由 | 只加实际必需的分流/help，保持旧命令行为 |
| `local-input.ts`、`local-run.ts`、`change-report.ts`、`render.ts` | 准备上下文/身份的普通运行与复查；仅按实际新增字段修改 |
| `examples/authorization-assessment/evidence-editing/` | 一个可搬移例子，含可用材料、缺口、局部编辑及运行命令 |
| 本轮结果根的研究脚本 | 薄面板/作者/evaluator/replay，核心能力不得只存在这里 |

## 4. 真实评价设计与调用纪律

### 4.1 材料和质量面板

计划8个公开development任务：2个AI回归（helper缺口与明确入口前提），6个此前未进入本项目效果面板的同类任务；整体至少3个源码项目，其中至少1个项目此前没有进入授权效果面板。优先使用已登记外部skill中的授权职责映射；新源码不自动算作新skill成员。把选样规则、许可/ref、暴露状态和不适用候选先登记，再获取正文。旧保护集、Q1 reserve与历史held-out不读取。

覆盖：调用helper中有检查、上游检查、控制对象与实际操作对象不同、角色/所有权例外、确实缺外部事实、普通简单对照。任务必须有公开政策依据，输入不包含预期答案。缺可靠oracle的任务如实保留为材料不足，可按预登记候选顺序在分析调用前补位；生成开始后不按表现换题。获取失败不阻塞编辑工程；若材料不足，报告实际分母，不无限搜索。

四臂固定plain/v6、explicit-v1、standard reasoning及共同任务语义：

| 臂 | 表示 | 源码准备 |
|---|---|---|
| M0 | 独立作者Markdown | 当前普通作者选择的材料 |
| D0 | DSL | 与M0同字节材料 |
| M1 | 同一Markdown任务 | 新prepare结果 |
| D1 | 同一DSL任务 | 与M1同字节prepare结果 |

同任务四臂共用repository/ref、候选源码宇宙、政策、问题、输出合同、模型与分析预算。两种材料之间的范围增加是显式干预，分别报告字节/token和准备成本；禁止把增加证据的收益归为DSL语法。原材料按普通入口的客观选择规则产生，不人为删掉已知关键guard制造弱基线。准备产物和公开要求冻结后才运行；oracle只用于评价，不传给准备器或作者。

初轮8×4=32分析session；另在生成前固定2个任务×4臂=8次重复，共40。轮换每个任务内四臂次序，避免把网关时段与某一臂混在一起。初轮与重复分别汇总，不把不同任务数当独立项目数。

### 4.2 作者修改与消费

两个真实任务包、每包两场景。每包给同一中立brief的独立Markdown作者和局部DSL编辑作者，原稿只消费各自所有的材料；选取一个政策变更和一个主体/资源关系变更。先验证已有base，作者仅编辑指定变化，不能接触另一臂产物/答案。

共4个原稿+4个变化交付。DSL变化交付必须是小patch，程序输出完整输入；Markdown允许正常局部编辑，不强迫全文重写以制造对手负担。结构无效给一次具体诊断机会，首次和最终有效率分别记。模型辅助原稿、编辑和机械恢复分账。

原/变8个session、最多16场景经普通run真实消费，再独立检查政策、实际行为、所用证据、受影响/无关场景。统计修改字段、非请求变化、有效交付、作者/分析调用和完整token；有真实计时才报告人工分钟。

### 4.3 基础设施与失败

- 先读取AI失败日志区分连接/服务错误、客户端deadline、响应结构错误；不凭超时就断定模型弱。只修有证据的共享缺陷，避免重做provider平台。
- 所有生成派发默认串行；一次完整四臂区块正常结束后才考虑并发2。连续两次连接/服务失败时暂停后续研究派发，继续独立工程，避免批量耗尽分母。恢复前最多一次明确记录的连通性检查。
- 分析预算原拟每调用180s、每session600s；AI历史日志证实180秒客户端deadline产生9个完成未知，故在首个AJ分析调用前统一修订为每调用300s、每session900s、最多6000输出token，所有臂相同；沿用一次diagnostics-only repair与完整fallback计量，禁止只给失败臂加时。
- 未知完成先记录、不盲重发；尚未派发单元可正常恢复。确需传输恢复观测时在单独recovery区块按完整配对登记，原失败仍计入原分母。
- 计划40质量+8消费session；一个经确定性测试定位的共享实现bug允许另8个修订单元。连通性检查最多2次，纯材料准备/独立作者调用按真实步骤单列。该额度用于控制实验漂移，不是用户美元上限；用户网络/付费授权继续有效。
- 当前路线不可用时先完成零调用工程和归档。可另起完整模型/endpoint区块，但必须统一整组配置、解释预算调整，不能混合路由拼成成功率；未恢复的实验标blocked/not-run，继续其他阶段，不伪报全部完成。

### 4.4 评价和取舍

首要指标：实际行为判断、决定性控制与对象绑定、合理unknown/过度弃答、要求分支及解释完整度、最终可用交付；其次是首答/修复、调用、完整输入/输出/cache、耗时与已知费用。

生成前独立核验任务材料和oracle能支持所问范围。存在crop歧义时先明确问题或补材料，再冻结；不在看到某臂答案后改变主评分。回答盲评须核对具体源码和政策，程序仅校验评分身份/一致性并复算；有分歧保留理由和敏感性。

报告全部计划单元的交付率，也单列双方完成的配对语义，不把传输缺失都算成语义错误或删去。区分：共同prepare的质量增益、同证据下DSL表示效果、局部编辑的准确性/负担。若准备收益两种表示共有，结论归共同能力；若简单任务更适合Markdown，明确保留简单路径。旧默认不因一个高分区块自动迁移。

## 5. 顺序任务与具体验收

### AJ0 恢复、基线和执行状态

- [x] 核对分支/HEAD/工作区，读必需上下文；不要再全量审计旧档案。
- [x] 建立本轮status/journal、唯一写者和结果目录，记录当前阶段与下一命令；修正当前文档的AI已完成措辞。
- [ ] 原始工作区若出现其他任务修改，记录归属并保留，不执行清理。

### AJ1 共享根因、接口和失败测试表

- [x] 核对AI crop争议原始源码和作者重写链；提出可复现的小反例，禁止凭结论重写旧数据。
- [x] 确认上面两个模块接口、sidecar接线和普通命令；把必要调整写入本书及研究§7.29后继续。
- [x] 明确新增字段只有来源/请求/变化，不含oracle truth；为跨入口串用、丢helper、无关字段改写建立失败测试。

AJ1失败测试表：不同`sourceRef`/root的request拒绝；未纳入helper时partial保留明确gap且预览显示gap；超预算不可用半截字符串冒充完整文件；prepare快照搬移后保持原行号和引用；patch仅改所列路径，政策修改未列全部引用场景expectation不可ready；check/run使用相同准备上下文而compare复查整个共享上下文。AI14个无响应的证据是180秒客户端截止及网关socket断开，尚未证实provider代码缺陷；本轮不因旧失败修改共享provider。

### AJ2 证据准备schema和范围读取

- [x] 新增schema/prepare模块测试：重叠范围合并、原始行号不偏移、整文件优先、重复依赖、循环去重、预算不足partial、缺文件partial、路径逃逸invalid。
- [x] 运行 `bun test ./src/benchmarks/authorization-dsl/evidence-preparation` 确认因缺实现失败，再实现并转绿。
- [x] 复用portable source bundle/source catalog，保持CRLF及Unicode可追踪；不能用标为完整的半截函数蒙混过关。

### AJ3 依赖定位与准备产物

- [x] 将显式依赖、现有locator和可选一次模型proposal接入同一个validator；未解析符号给具体路径/范围诊断。一次可选提案只作位置建议，`proposal.json`记录真实usage/费用，越界仍由prepare拒绝。
- [x] 生成普通输入和快照、准备报告、缺口说明；精确来源绑定用已有机制，不建立重复哈希层。
- [x] 测试无模型显式路径、proposal越界拒绝、动态调用gap、入口局部来源、同字节移动；AJ13将合成示例搬入临时目录后两份源码SHA仍相同，partial/ready/edit/普通check通过；核心逻辑不按仓库名分支。

### AJ4 普通prepare与分析接线

- [x] 新增薄 `authorization prepare --input=... --request=... --out=...`；旧check/run继续正常。
- [x] check-only零provider、partial能带缺口进入分析、invalid不产出可运行输入；命令不修改源文件。
- [x] 将实际准备身份和公共缺口接入render/session/inspect/compare；两种表示同源码/同缺口，analysis host继续零执行工具。

### AJ5 局部编辑纯函数

- [x] 新增 `applyAuthorizationLocalEdit`，输入现有v2和edit请求；输出value/changedPaths/affectedScenarios/diagnostics，输入不变。
- [x] 先写并运行失败测试，再实现：关系变更保留taskId和另一场景；修改policy列出引用场景；遗漏必要政策对照确认不可ready；重复写同属性/未知key/非法字段拒绝。
- [x] 对用户明确提供的变更自动应用确定步骤，不增加日常审批。

```ts
// local-edit.test.ts 的最小语义示例；base从现有完整v2测试fixture构造。
const before = structuredClone(base)
const edited = applyAuthorizationLocalEdit(base, {
  schemaVersion: "authorization-local-edit/v1",
  reason: "Change only the requested relation",
  operations: [{ kind: "scenario", key: "member", set: { relation: "self", expectation: "allow" } }],
})
expect(edited.value.taskId).toBe(base.taskId)
expect(edited.value.scenarios.admin).toEqual(base.scenarios.admin)
expect(base).toEqual(before)
```

### AJ6 workspace与普通edit

- [x] 复用composer的声明校验和materialize的同级暂存发布模式，新增薄 `authorization edit --input=... --edit=... --out=...`，schema/help/错误定位同步。
- [x] 原/变文件可独立check/run；搬移不破坏sourceRoot，发布输出前完成校验，不覆盖原件。
- [x] 测试patch直接物化，而非先生成完整变稿后diff；compare标出变化且保留共享context全体影响，旧答案不自动升格。

AJ6局部实现调整：现有`materializeAuthorizationWorkspace`只接收workspace文件和整字段replacements，无法直接发表单一局部patch的`draft`诊断。edit复用其同级暂存加拒绝覆盖的发布模式，而非调用该函数；先以纯patch结果调用composer核对顶层结构，再在暂存坐标做普通loader检查。无新审批或模型调用。

### AJ7 基础设施诊断与有限修复

- [ ] 归纳AI14个无响应单元的错误/时段/请求生命周期，明确能证实的根因与未知部分。
- [ ] 若发现共享计量/deadline/晚到fallback缺陷，补确定性失败测试并修；否则只采用上述串行区块策略，不无故改provider。
- [ ] 记录本轮最终分析配置和恢复规则，准备成本与分析成本共用计量模块。

### AJ8 真实材料、范围和评价准备

- [x] 按4.1登记候选并获取固定ref公开源码；新任务标development及与真实skill职责关系，不访问旧保护集。实际顺序为先获取/只读可行性核对，再在任何AJ模型答案之前冻结`case-selection.json`；此顺序偏离原先“先登记再获取”，已在登记中明记，生成后不换题。
- [x] 组织8任务的政策、当前问题、源码候选范围、必要判断和独立oracle；不足的Paperless share-create保留64KiB具名gap，Memos GetShared保留token有效性外部未知。
- [x] 在模型生成前消除可解决的crop歧义：OWUI换成无编辑性断言的原始完整handler，Memos读上下文locator去歧义，Paperless统一深度3；真正外部未知保留unknown标准。

### AJ9 四臂接线与冻结

- [x] 从普通prepare/check路径产生8组同任务基线/准备材料；独立Markdown作者仅见中立brief，8次首稿已逐份对照核验，公共要求在四臂逐字共享。
- [x] 首次AJ分析调用前固定40单元顺序、输入/实现哈希、重复位置、统一300/900秒预算与评价；冻结配置SHA-256为`ed5fb8546282dca20aabacfa8cf9a0cc6a9bd7944ff599965eb2348bc7ff2821`。
- [x] 普通check验证16份输入与公开要求；6个离线mock覆盖四臂、conditional及双场景，重复check全部preserve-no-resend；runner无oracle导入，研究脚本单独typecheck通过。实际usage未知须由AJ10记录，零模型replay待真实输出。

### AJ10 真实质量面板

- [x] 按区块串行运行40单元：40 completed、43次provider调用（3次诊断修订）、0 fallback/unknown；费用未报告，保留null。
- [x] 全部生成关闭后才物化40份匿名review packet并交独立盲评；冻结prompt/材料未按答案修改。
- [x] 未定位需修订的共享生成bug，故不触发可选同条件修订；保留全部初答与修订，不为低分重抽。

### AJ11 分层评价与机制解释

- [x] 对40份实际回答逐项检查行为、控制对象、效果对象、决定性缺口及政策；Memos GetShared标签争议另行复核。
- [x] 离线复算四臂初轮和预定重复，完整交付40/40、最终full 26/40；无共享修订，零模型replay一致；准备、作者、分析成本分账。
- [x] 两表示均从更多决定性source/helper字节中改善；同材料M/D初轮各4/8、准备后各7/8，未出现稳定额外表示收益。

### AJ12 独立作者局部修改与真实消费

- [x] 两包的4原/4变交付，DSL变稿为patch、Markdown可正常局部编辑；8首稿中6份语义有效，两处各一次诊断修订后8份有效，原稿与修订均保留。
- [x] 8个真实fresh session全部completed，独立复核16/16声明场景full；4组compare均`needs-review`且各有独立新运行。
- [x] 修改路径、修订次数、10次作者调用、8次消费调用和token分账；Paperless DSL多声明helper使28个expanded义务；humanMinutes与实际USD未知。

### AJ13 普通可用示例

- [x] 在 `examples/authorization-assessment/evidence-editing/` 放入可移动小例子，展示prepare partial/ready、局部修改、check/run/inspect/compare。
- [x] 临时目录零provider演练得到`range-required` partial与两个ready，搬移后源码SHA不变；AJ12的8个真实session经普通CLI inspect、4个compare复核，未重复调用。
- [x] 示例只依赖公开CLI和随例源码/输入，不依赖study脚本或oracle；README给完整参数、预期缺口和语义限制。

### AJ14 研究和当前文档归并

- [x] 更新研究§7.29及§11问题表、usage、developer-guide、current-status、plan/spec和实验目录AJ条目。
- [x] 按问题→根因→实现→验证→取舍归纳；原始逐单元机器细节留在results，正文只链接汇总。
- [x] 默认保持兼容；有明确入口/依赖时推荐显式prepare，小范围政策/场景变更时推荐edit及fresh run。无稳定表示收益、Paperless partial缺口、未知实际USD/人时各自列清。

### AJ15 一次必要验证

- [x] 相关回归376 pass/1平台skip、2597断言、主typecheck和AJ脚本typecheck通过；AJ四项零模型replay、文档12测试/链接检查、catalog与定向凭据检查通过。
- [x] 新增示例已搬移并核对两份源码SHA、partial/ready/edit普通check；stage diff与公开来源独立复核无可行动问题。旧AI面板runner因冻结`local-run.ts`哈希随AJ共享实现变化而拒绝重放，保留历史身份；旧AI面板/作者消费评价及作者消费runner零模型重放通过。详见AJ `verification.json`。

```powershell
bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl ./src/cli/authorization.test.ts ./src/cli/authorization-compose.test.ts ./src/cli/authorization-prepare.test.ts ./src/cli/authorization-edit.test.ts ./src/providers/structured.test.ts ./src/measurement/token-accounting.test.ts ./scripts/token-accounting
bun run typecheck
python ./scripts/check_skill_ir_doc_links_test.py
python ./scripts/check_skill_ir_doc_links.py --root .
git diff --check
```

研究脚本的零模型重放与类型检查：

```powershell
$aj = './results/skill-ir/skill-dsl-research/development/authorization-evidence-editing-v1'
bun "$aj/run-panel.ts" replay
bun "$aj/evaluate-panel.ts" replay
bun "$aj/run-author-use.ts" replay
bun "$aj/evaluate-author-use.ts" replay
$ajScripts = @(Get-ChildItem -LiteralPath $aj -Filter '*.ts' -File | ForEach-Object { $_.FullName })
bunx tsc --noEmit --strict --target esnext --module esnext --moduleResolution bundler --allowImportingTsExtensions --types bun @ajScripts
```

旧AI replay只在兼容代码变化确实需要时运行一次。

### AJ16 提交、推送和完整交付

- [x] 实现/示例、实际结果、研究文档分别提交为`3ba9a98d`、`2e112db5`、`096fb7cf`（加早先`40d7426b`工程提交）；只暂存本任务归属修改，凭据扫描零命中，旧本地排除材料未上传。
- [x] 首次推送`origin/skill-ir-aot`后远端SHA与本地`096fb7cf2b2f0325f97f9bed6e83ebbfc0ac7b7d`一致、ahead/behind为0且工作区干净；收尾状态提交再推送并核对。不推upstream，不新建分支/worktree。
- [x] 普通命令、质量/复用分账、实际调用/token与未知费用、人时、partial来源缺口及历史哈希限制已写入当前文档和最终交付；不把未执行的目标或准备提案写成已验证成功。

## 6. 完成与继续规则

完整工程交付要求：有界证据准备、来源/缺口解释、局部编辑及影响说明、现有普通运行接线、两类真实任务的原/变消费和独立评价、可移动示例及用户origin发布。质量正向是研究问题，不预定答案。若网络长期不可用，保留准确未完成项与恢复命令，完成其他工程，不能用“所有适用任务完成”省略有明确要求的真实消费。

常规实现错误、依赖安装和可逆文档修改由执行任务自主处理；不添加逐阶段用户批准、clean checkout循环或强制耗时。小方法调整有代码证据即可同步设计后继续。任务类别、目标执行、保护集访问、毁损历史属于超出本书的变更，不自行推进。

历史Q1、旧held-out/prospective/readiness、旧0/6、source blocker、原始失败及本地历史排除文件保持原样。完成后停止，不启动未请求的追加目标。
