# 授权任务 DSL：关系分析、普通输入与跨项目交付任务书

> **执行方式：** 使用 `superpowers:executing-plans` 连续执行 X0–X13，代码采用 `superpowers:test-driven-development`。主线程负责设计与实现，只读探索按项目规则委派。代码小步提交，整轮交付完整能力；常规检查点不等待确认，也不以重复验证或等待凑时长。

**Goal:** 让开发者能用自己的授权任务声明和源码运行分析，取得逐义务结论、条件关系、引用证据与未知项；同一实现覆盖原项目及第二项目，并通过对照解释质量与开销变化。

**Architecture:** 复用 W 的声明、编译、窄 wire、引用目录、生命周期和评价。增加领域分析要求及其覆盖记录，以可选关系和分支组织分析；普通输入入口负责自备源码装载，实验入口负责配对与 oracle。运行时不接触 evaluator 数据。

**Tech Stack:** TypeScript、Bun、现有 Zod、SkVM provider/telemetry；一个轻量本地脚本和公开函数，不另建 CLI 框架、Web 页面或通用工作流引擎。

- 制定日期：2026-09-21；状态：`active-X8`（X0–X7 已完成；离线接线与跨项目 dry-run 推进中）。
- 基线：W 发布 `fa6b064`；工程已完成，原始三例结论 6/6 正确、关键事实支持 4/6，D 有较低调用/token 的初步观察。
- 工作分支：`skill-ir-aot`；仅向用户 `origin` 推送。保留其他任务的源码改动与本地材料。
- 设计正文：[研究总文档 §7.21](../../skill-ir/skill-dsl-research.md#721-x-完整能力阶段设计)；持续合同：[spec 14.34](../../skill-ir/skill-ir-aot-optimization-spec.md#1434-按-skilltask-范围设计领域-dsl)。不另建一份 design 或逐阶段总结 Markdown。
- 机器结果根：`results/skill-ir/skill-dsl-research/development/authorization-capability-v1/`，X0 执行时创建。

## 一、这轮与 W 的区别

W 修复模型输出与计量，X 交付可供自备任务使用的领域分析能力。第二项目在设计早期进入，用于挑战共性；旧三例不必全部满分后才能继续。既有 W 的 `no-revision` 和原评价不回写。

本轮同时回答四个问题：任务与评分要求是否对齐；关系支持能否改善完整性；普通开发者是否能脱离历史案例 manifest 使用；这些对象和规则换项目是否仍成立。实际效果可以体现为质量、完整性、调用/token 或使用步骤改善，所有相关取舍同时报告。

范围继续限定单个任务所指定的 repository/ref 与显式源码集合。不同任务可来自不同项目/ref。本轮读取公开源码，不运行目标服务、不扫描部署、不生成修复补丁；fixed-context 范围不妨碍提前做第二项目 development。

## 二、已确认的设计

### 2.1 关系是分析要求，不预填案例答案

不固定 `control→authentication→provisioning→deployment→effect` 五节点顺序。资源授权可能没有 signup 或 proxy；登录任务可能有这些分支。首版用六类领域要求表达要检查什么：

```ts
type RequirementKind =
  | "entry-control" | "identity-binding" | "resource-binding"
  | "authorization-decision" | "effect-reachability" | "external-assumption";
interface AnalysisRequirement {
  id: string;
  kind: RequirementKind;
  obligationIds: string[]; // authored IDs；编译时关联 expanded IDs
  question: string;       // 公开任务要求，不写预期结论或 oracle 内容
  applicability: "required" | "when-present";
  prerequisiteIds: string[]; // 分析依赖，不是自动执行顺序
}
interface RelationCoverage {
  requirementId: string;
  obligationId: string;  // expanded ID
  status: "addressed" | "unknown" | "not-applicable";
  explanation: string;
  factPointers: string[]; // 同次答案的 /results/.../facts/... JSON pointer
}
```

编译器检查 ID、依赖、对象引用和适用义务，形成 ledger；不推断源码里的权限事实。模型说明控制成立/不成立时的路径、条件依赖和未知外部事实，以已有 fact+citation 支撑。`addressed` 只表示模型已作回应，语义是否支持仍由 review 判断；required 项不得用 not-applicable 消失，when-present 项需给适用性理由。分析依赖环报诊断，源码中的循环不因此被判非法。

X3 用原 file/text/header 与 FastAPI owner/role 两项义务走查后，六类保持不变：前五类为共同 profile 的 required，`external-assumption` 默认为 `when-present`；task 可把它提升为 required，也可用既有 kind 增加 task-specific `when-present` 分支（例如可选 provisioning），但不把 signup/proxy 写进共同 profile。默认依赖为 authorization-decision → identity/resource binding、effect-reachability → entry/authorization decision、external-assumption → effect；箭头表示同一 expanded obligation 内的分析前置，不是源码控制流顺序。编译只展开作者显式声明的 requirement-obligation 对，不对主体、资源或入口做笛卡尔积。不得根据 oracle 给每个案例填好分支真值、正确结论或专属提示。冻结合同与两个无答案示例见 `relation-contract-v1.json` 和 `relation-examples/`。

### 2.2 普通输入与兼容

新增 `authorization-assessment-input/v1` 输入文件，包含 `task: AuthorizationTaskV0`、`sourceRoot`、显式 `sources` 和可选 `analysisRequirements`。源码路径相对 sourceRoot，输入文件移动后的解析以输入文件所在目录为基准。没有 analysisRequirements 时可使用共同默认 profile；最终采用的 profile 必须写入 preview 和结果。

默认 profile 是公开的领域检查问题，必须对所有案例相同。任务作者可以增加领域要求；实验中两臂共享这些要求及其来源。现有 v0 task 与 wire/v1 原接口保留；新增 coverage 使用显式版本化的 wire 扩展，经独立 normalizer 产生 canonical v0 与 coverage sidecar。旧 strict schema 不静默接受新字段。

公开函数和新本地入口的目标合同：

```ts
interface AnalysisDiagnostic {
  code: string;
  message: string;
  requirementId?: string;
  obligationId?: string;
}
interface AnalysisPlan {
  status: "ready" | "partial" | "blocked";
  requirements: AnalysisRequirement[];
  entries: Array<{
    requirementId: string;
    obligationId: string;
    kind: RequirementKind;
    question: string;
    applicability: "required" | "when-present";
    prerequisiteIds: string[];
    status: "pending";
  }>;
  diagnostics: AnalysisDiagnostic[];
}
type LocalInputResult =
  | { status: "valid"; task: AuthorizationTaskV0; sourceBundle: SourceBundle; analysisRequirements: AnalysisRequirement[] }
  | { status: "invalid"; diagnostics: AnalysisDiagnostic[] };
interface CoverageValidation {
  status: "valid" | "invalid";
  declared: number;
  addressed: number;
  unknown: number;
  notApplicable: number;
  missing: Array<{ requirementId: string; obligationId: string }>;
  diagnostics: AnalysisDiagnostic[];
}
// local-input.ts：校验与装载，不初始化 provider。
loadLocalAuthorizationInput(inputFile: string): Promise<LocalInputResult>
// relations.ts：pure function，输出 requirements、展开 ledger 和 diagnostics。
compileAnalysisRequirements(task: AuthorizationTaskV0, requirements: AnalysisRequirement[]): AnalysisPlan
// relation-result.ts：验证 coverage 关联与 pointers，不评判语义正确。
validateRelationCoverage(plan: AnalysisPlan, canonical: AuthorizationResultV0, coverage: RelationCoverage[]): CoverageValidation
```

以上是待实现类型合同，`AuthorizationTaskV0`、`AuthorizationResultV0`、`SourceBundle` 复用现有类型。编译出的 prerequisiteIds 在同一 expanded obligation 内解析，不可悄悄跨义务借用结论。解析失败不初始化 provider。实现若需要调整字段，同步研究正文和后续调用。例子和入口使用同一接口；不要求用户准备研究 caseId、oracle、review 或成对实验配置。

X4 已实现 `AnalysisRequirementSchema`、`AnalysisRequirementsSchema` 与 `compileAnalysisRequirements`。编译逐 requirement 隔离 strict shape 错误，拒绝重复 requirement、陌生/歧义/不可运行 obligation、陌生或不同义务 prerequisite 及 dependency cycle；有局部错误时仍保留独立有效 ledger，输出按 expanded obligation 与 requirement ID 稳定排序。内部组合 key 使用结构化 tuple；既有 `author::entry` expanded ID 对 `%` 和 `:` 做 segment escaping，普通 ID 字节不变，避免合法特殊 ID 碰撞。ledger entry 只有 kind/question/applicability/prerequisite/pending 状态，不含源码或政策答案。

X5 新增 `source-authorization-assessment-wire/v2` 与 `authorization-wire-normalizer/v2`；v2 只在显式 analysis requirements 时使用，并在 v1 的窄结果上增加 `authorization-relation-coverage/v1` sidecar，canonical result 仍为 v0。`validateRelationCoverage` 对精确 requirement/expanded-obligation pair、重复/缺失/陌生项、同义务 fact pointer 和 required/when-present 状态做机械验证，始终把语义支持留为 `unreviewed`。host 保存 raw wire、canonical、coverage 及两类 diagnostics，coverage 错误复用一次既有 repair；持续错误保留 canonical 但只能 `completed-with-diagnostics`。未提供 requirements 的旧 wire/v1、runner 和 replay 不变。

X6 实现了 `authorization-assessment-input/v1` 与本地 check/run/inspect。为使 ref 一致性可实际检查，输入在既有 `task/sourceRoot/sources/analysisRequirements` 外显式携带 `sourceIdentity.repository/sourceRef`；两者必须与 task 相同。`sourceRoot` 从输入文件目录解析且 canonical 结果仍在该目录内，普通 `src/...` 路径用共享 exact-reader 核心读取，旧 `inputs/` 规则不变。缺 requirements 时实例化 `authorization-core-v1` 六项共同 profile。每次 run 在输出根下新建不可覆盖 session，保存 input/task/source bundle/profile/preview、JSONL events、run/result JSON 和文本摘要；append-only `sessions.jsonl` 定位最新 session。check/inspect 不初始化 provider，dispatch 后缺终态只显示 completion-unknown，不自动重发。

普通入口验收命令（X6 已可执行；X7 将补仓内自包含示例路径）：

```powershell
bun ./src/benchmarks/authorization-dsl/local-run.ts check --input=./examples/authorization-assessment/assessment.json
bun ./src/benchmarks/authorization-dsl/local-run.ts run --input=./examples/authorization-assessment/assessment.json --model=xty/gpt-5.6-sol --out=./.skvm/authorization-demo
bun ./src/benchmarks/authorization-dsl/local-run.ts inspect --out=./.skvm/authorization-demo
```

check 应输出字段、输入和分析要求检查结果且零模型调用；run 打印实际 session 路径与结果摘要；inspect 只读取已有 session。check/run 可显式增加 `--arm=N|B|D`，省略时使用 D。输出根下允许多个 session，最新一次路径由索引定位，不覆盖以前结果。

### 2.3 评价与比较

评价 v2 把要求分为：决定结论的必要语义、解释完整性、可选细节。允许逻辑等价表述；例如“该控制必须为 true 才能到达分支”可支持 false 阻断的逻辑，但精确 HTTP 状态码单独按任务是否要求评价。不能只引用一大段源码就把模型未作出的因果判断记为已解释。

答案细节来自源码/oracle，通用输出职责来自公开任务要求。X1 在新模型运行前完成对齐，版本化记录理由和判例；不为让已知答案通过而降低必要语义。W 原评分保留，重评作为单独附表。

主比较保持 B/D：B 为清晰组织的说明，D 使用领域依赖与 coverage ledger。两臂收到相同事实、公开要求、源码、输出形状、模型和修复预算；D 的方法组织差异单列。补充 N（自然语言任务说明）用于识别结构化组织的作用，N 也保留全部事实、公共输出要求及同一引用/计量底座。N 不是假称未经修改的原始 skill；只有有真实对应 skill 时另记录其来源与改编。

## 三、文件责任与执行依赖

| 文件 | 责任 |
|---|---|
| `src/task-dsl/authorization/relations.ts`、`relations.test.ts`（新增） | 领域要求 schema、依赖与适用义务编译 |
| 同目录 `relation-result.ts`、`relation-result.test.ts`（新增） | coverage 扩展、fact pointer 和状态一致性验证 |
| 同目录 `render.ts`、`render.test.ts`、`index.ts` | N/B/D 同事实渲染、公开接口；旧 B/D 模式继续可读 |
| 同目录 `transport.ts` 及测试 | 复用 W normalizer；新 wire 显式分发，错误不泄漏 canonical |
| `src/benchmarks/authorization-dsl/local-input.ts`、`local-run.ts` 及各自测试（新增） | 自备输入装载、薄调用入口、机器结果与简明文本结果 |
| 同目录 `inputs.ts`、`host.ts`、`run.ts`、`evaluate.ts` 及测试 | 精确读取复用、coverage 消费、新面板和评价；旧模式兼容 |
| `examples/authorization-assessment/`（新增） | 自包含 synthetic 例子、一个输入文件和最短使用说明 |
| `docs/usage.md`、`docs/skill-ir/developer-guide.md` | 实际可运行命令、适用范围与失败处理 |
| `docs/skill-ir/skill-dsl-research.md` | 设计、来源、解决过程和效果解释的持续正文 |

依赖：X0 后，X1 评价校准与 X2 第二项目获取互不依赖；X3 综合二者形成领域合同；X4–X5 实现关系链，X6 普通输入可与其独立推进；X7 接线，X8 离线演练，X9–X11 运行/评价/修订，X12–X13 使用复验与发布。单代理可交错推进独立工作，委派只读探索不委派代码修改。

## 四、X0–X13 执行清单

### X0：恢复现场，建立一份执行状态

- [x] 读取当前状态、本任务书、研究 §7.20–7.21、W summary，记录 HEAD 与现有修改，不重新执行 V/W 全量审计。
- [x] 建立本轮 `status.json`：X 阶段、归属文件、nextAction、运行 revision、未决问题；建立一份 acquisition/experiment journal，不叠加多层冻结材料。
- [x] 运行 `bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl` 取得基线；已有非本轮失败单列，不通过改历史数据消除。

### X1：对齐公开分析要求与评价 v2

- [x] 核对 trusted-header 的两份答案、公开 requiredAnalysis、源码和 rubric，逐项写明必要语义、解释完整性、可选细节及依据。
- [x] 建立新 `evaluation-v2.json` 与判例：等价否定条件、漏 signup、正确 unknown、仅贴代码、错因果、漏决定性控制。关键事实是否影响结论要解释，不能统一降格为文风。
- [x] 修改 `evaluate.ts` 的新版本路径并写失败测试：等价表达获支持；代码引用不代替未陈述因果；必要语义遗漏仍保留 partial；可选细节不改写结论正确性。
- [x] 原 W summary/review 不改字节；如生成 v2 重评，写本轮目录并明确 reuse/review 身份。把争议与处理规则更新研究正文。

### X2：提前获取第二项目，挑战领域共性

- [x] 先查已有研究来源索引，再用认证 GitHub CLI/官方源码选择非 Open WebUI fork 的公开项目；要求有明确权限政策、可定位入口和源码路径，固定合法公开 ref，记录许可证/来源。
- [x] 最多考察三个候选，保留逐一纳入/排除原因，不根据模型能否通过选择。首个满足条件者成为第二项目，准备两个不同授权义务；优先覆盖资源所有权/角色授权或 caller-control 等区别于 trusted-header 的结构。
- [x] 两项应有可核查的源码路径与评价依据；不强求凑齐漏洞/安全/unknown 三种标签。有公开修复历史可用于 evaluator，但不能将补丁答案塞进模型输入。
- [x] 获取任务/源码与评价资料分别归档；development 来源可以已公开、已阅读，如实记录暴露状态，不称 held-out。只读源码和公告，不执行目标项目。
- [x] 网络失败有缓存则恢复；GitHub quota/error 改用认证 contents/git/raw 或官方发布源，记录换路由，避免从头重复全部获取。三个候选都不适用时保留阻碍，继续普通输入与原项目工作，不冒充跨项目交付。

### X3：形成跨任务的关系合同

- [x] 用原 file/text/header 与第二项目两项走查六类要求。明确哪些是必需、可选、分支、外部未知；资源授权反例不能被迫填 signup/proxy。
- [x] 编写领域问题模板及两个不含答案的声明示例，标明字段来自任务、规范还是源码入口；模型应分析的关系留给模型。
- [x] 更新 §2 类型及研究 §7.21，说明编译器能检查的结构与模型负责的语义。若默认六类需调整，按实际反例修改后继续；不重新发起一轮纯调研。
- [x] X3 完成仅要求模型接口和反例可实现；不以旧案例达到满分为条件。

### X4：实现分析要求与义务 ledger

- [x] 在 `relations.test.ts` 先写重复 requirement、未知 obligation、未知依赖、依赖环、空可选项、when-present、跨多个 expanded obligation 和数组重排测试，再实现 `compileAnalysisRequirements`。
- [x] 验收例：两个 authored obligation 分别指向不同入口时，每条 requirement 只关联声明指定的义务，不对所有主体/资源做笛卡尔积。循环依赖返回诊断，其他独立义务仍可定位。
- [x] 运行 `bun test ./src/task-dsl/authorization/relations.test.ts`，先记录红灯，再实现、确认绿灯；无网络、无模型。
- [x] 输出 ledger 只列待分析问题与状态，不预填 allow/deny、源码控制或攻击路径真值。

### X5：接通模型 coverage 与宿主检查

- [x] 在新 wire 版本中附 coverage，保持原 canonical v0 作为结论/事实容器。为 missing/duplicate/foreign requirement、错误 expanded ID、悬空 fact pointer、required 被跳过、unknown 无理由写失败测试。
- [x] 实现 `validateRelationCoverage`，将规范化失败与语义 unreviewed 区分。`addressed` 必须指向本次相应义务的事实；有引用不自动表示因果正确。
- [x] `not-applicable` 仅用于 when-present，必须说明源码中为何无该路径；无法判断是否存在则为 unknown，不允许空对象消失。
- [x] host 保存 canonical result、coverage sidecar、两者诊断和 initial/repair 原件；复用 W 的一次可操作修复，禁止追加隐形语义 reviewer 调用。
- [x] 运行关系与 host 聚焦测试，覆盖错误 coverage 不被当成完整交付，同时旧 wire/v1 和历史 replay 仍可用。

### X6：实现自备输入入口

- [x] `local-input.ts` 解析单个输入 JSON，从输入文件目录解析 sourceRoot，读取显式 sources；验证路径在指定根内、ref/task 一致、缺文件诊断和同名路径冲突。调用前完成这些确定性检查。
- [x] 新读取接口允许用户的 `src/...` 等普通路径；复用安全的 exact-reader 核心。旧研究读取器的 `inputs/` 协议维持兼容，不靠拼历史 caseId 假装普通输入。
- [x] `local-run.ts` 实现 `check --input=...`、`run --input=... --model=... --out=...`、`inspect --out=...`，复用 host 和现有 provider。只有 run 初始化模型，未知完成状态不自动重发。
- [x] 空输出目录或新 session 自动建立；已有 session 不覆盖，返回实际输出位置。结果保存 JSON、逐次事件和一份简明文本说明，列结论、依据、覆盖及未知项，不生成 HTML。
- [x] mock 测试：任意合法 taskId/repository 可运行；不给 manifest/oracle 也能完成；坏输入在 provider factory 前失败；重新 inspect 为零调用；新增调用必须显式新 session。
- [x] 一次授权测试兼容检查即可，不借此搬迁整个 benchmark 目录或重构旧优化器。

### X7：同事实 N/B/D 渲染与任务作者体验

- [x] B/D 共用公开事实和要求；B 以清晰说明组织，D 用依赖与 ledger 组织。N 将同样事实写为自然任务说明，三臂使用同一新输出协议和底层支持。记录干预差异，检查不遗漏任一政策或作用范围。
- [x] 为 N/B/D 分发写失败测试，避免第三个 arm 被旧二分支默认为 D。保存 instruction/declaration/source/output-contract 字符分项；run 将 provider 实测 token 保存到 run/result telemetry，X7 mock 验证持久化但不冒充真实模型计量，实际值留待 X9。
- [x] 从已有 E/T 外部语料选两份独立来源的相关 skill，列出其授权职责如何映射到声明与 analysisRequirements，剩余职责如何保留。真实 skill 来源与目标代码项目分别计数，不把第二个源码项目自动算作第二个 skill；该映射人工/agent 辅助编写，如实记录，不声称自动转换整个 skill。
- [x] 在 `examples/authorization-assessment/` 写自包含 synthetic 例子及来源标记，以新普通入口对 N/B/D 分别执行 provider-free check；用户只需改输入、源码位置和模型配置。
- [x] 记录作者从一个任务改成另一个任务需要改哪些字段、获得哪些诊断；确定性 trace 共四次 check、两次 invalid 和两个精确诊断，零 provider/目标执行；未做真人计时，不称人工节省。

### X8：离线接线与跨项目 dry-run

- [ ] 五项任务通过同一 parser、ledger、引用装载、host mock、coverage 和评价入口；缺第二项目时保留明确分母，其他工作继续。
- [ ] 对要求删除、控制条件相反、无 provisioning、缺部署事实四种 synthetic 变化运行确定性测试，检查 ledger/诊断能反映变化；这些变体不算新增真实项目证据。
- [ ] 在一个临时普通目录使用例子完成 check/run(mock)/inspect，确认无研究目录绝对路径、无 oracle/历史 case manifest 依赖。已有工作树即可，不另建 clean archive 链。
- [ ] 一次运行授权回归与 typecheck；通过后记录实验配置与实现 revision，进入真实运行。无须等旧 header 满分。

### X9：真实主面板与重复观察

- [ ] 主面板为原三任务加第二项目两任务，各 B/D 两个 fresh-context 重复：正常共 20 个生成单元。第二重复反转每任务臂顺序；任务选择及顺序在调用前写配置。
- [ ] 使用可用的 `xty/gpt-5.6-sol` 同路由、temperature 0、auto-probe off；per-call 180 秒、unit 600 秒、max output 6000、至多四次派发及一次有诊断修复。X8 若证明配置不适合新输出，须在全部真实运行前统一调整并记录，不能事后只放宽失败臂。
- [ ] 补充 N 对照固定为原 file、原 trusted-header、第二项目首个任务，各一次，共三单元。正常总计 23 单元，最多 92 次 provider dispatch；这是实验结构上限，不是美元预算。N 只作机制观察，不与两重复臂混算稳定性。
- [ ] 缺第二项目时仍完成原三任务 B/D 两重复和两个既定 N 单元，记录跨项目阻碍；不得另挑容易成功的任务补足数量。
- [ ] 每次请求记录 initial/fallback/repair/timeout、usage 与实际费用。网络不稳定时完成未知请求不自动重发，继续独立单元；全部生成结束后才使用 evaluator。

### X10：逐义务评价与收益归因

- [ ] 用 X1 的 v2 rubric 评价必要语义、完整性、可选细节、coverage、unknown、引用与范围。保留 reviewer 身份、原文位置和争议；关键结论做一次只读独立核验。
- [ ] 分项目、任务、重复报告 first response、first valid、after repair、full/partial、各类漏项、调用/token/耗时及 unknown USD；失败留在总分母。
- [ ] 分开回答：新共同支持是否让使用/交付更好；D 相对 B 是否有额外帮助；N 差异说明了什么。N 仍共享底层引用/计量，不能把该比较写成整个 SkVM 对原始 agent 的全部增益。
- [ ] 对关系层记录实际覆盖与遗漏变化，而非只比较 JSON 更长或多了字段。若只因要求更明确而改善，将贡献写成领域要求与消费协议改进。

### X11：在本轮完成有依据的修订

- [ ] 将问题分到输入/映射、领域合同、实现、模型推理、评价和基础设施。有具体共享代码或合同缺陷时先加反例，再修复同一实现。
- [ ] 最多一轮有实质变更的追加验证，覆盖受影响任务的 B/D，各一次；最多三个任务、六单元，不按失败次数不断加样。无新诊断则停止该问题的重复调用，继续 X12–X13。
- [ ] 初轮与 revision 分开报告。若合同/评分变化，对原输出可离线再分析，但不给旧结果换身份，也不将修订后结果替代失败。
- [ ] 若 D 无额外收益或开销更差，保留有用的声明、引用和 ledger，普通入口采用表现更合适的方式并说明范围；不为了保住 D 名称继续复杂化。

### X12：普通使用复验与能力判定

- [ ] 原项目和第二项目分别通过 X6 普通入口运行或 inspect 已有同入口结果，所用实现版本与研究单元一致。优先复用同次执行产物，避免为截图/报告重复付费。
- [ ] 确认任务作者能从例子编辑任务并收到字段/路径/依赖诊断；运行不依赖 evaluator，结果带明确未知项。文档写出最终精确命令、文件内容和恢复方式。
- [ ] 工程验收：普通输入可用、来源与覆盖可追溯、旧接口兼容、错误不泄漏成功、无关工作树保留。迁移验收：同一实现处理两项目，差异通过声明/资料表达，无项目名成功分支。
- [ ] 效果验收：按观察报告质量、完整性、效率和使用步骤的改善与退化。旧任务 partial 不阻塞工程交付；必要语义错误仍明确记失败。第二项目未完成时整体为部分交付，列原因，不称全部完成。

### X13：统一复盘、验证与发布

- [ ] 运行 `bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl` 与 `bun run typecheck`；改 provider 才加相应 provider 回归。一次离线 replay 验证新摘要可重算。
- [ ] 更新研究 §7.21 的实际设计及 §12 短记录，状态页/plan/spec/usage 同步；机器结果保存 status、summary、单元、评价与费用，不另写大量分轮 Markdown。
- [ ] 运行文档单测、链接检查和本轮 JSON/JSONL 解析，检查暂存归属及敏感信息。修复后只复跑受影响检查，不重复历史全量审计。
- [ ] 提交并推送用户 `origin/skill-ir-aot`，确认远端一致；交付可运行入口、两个项目的实际结果、收益/退化和下一步决定。
- [ ] 所有承诺项按完成/有具体原因未完成记录，不用统计任务终态数量冒充目标达成。完成本任务后停止自动扩展，不靠重复执行拉长时间。

## 五、预算、故障与连续推进

网络、认证 GitHub 与有目的的付费调用沿用用户授权，不另设美元限额；实验单元和修复上限用于控制比较结构及重复试验。正常初轮 23 单元，最多追加六个受影响单元，全轮最多 29 单元、116 次 dispatch；不是必须用满的调用指标。实际/估计/unknown 费用、开发代理成本分别记录，费用未知不伪报为零。

来源获取失败可以换官方获取路径；保留已下载可用材料，不因最后一个请求失败废弃整批。部分任务未知/partial 时继续互不依赖的工程、第二项目和文档工作。只有缺少不可替代的输入或平台能力时标出具体阻碍；不把研究结论尚未正向当作全部开发的停止条件。

每阶段维护同一个研究正文，写清“问题→证据→修改→验证→影响”。常规实现细节可以据代码现实调整；若要更换任务类别、改成主动扫描/目标执行或放弃普通输入目标，先解释方向变化，不能悄悄转题。

## 六、持续目标启动语

> 将 `D:\skill优化\SkVM\docs\superpowers\plans\2026-09-21-authorization-dsl-capability-delivery.md` 的 X0–X13 设为持续目标并执行。以完整能力交付推进：完成评价要求校准、可选分支关系与覆盖、普通自备输入入口、第二项目 development 迁移和真实对照。第二项目提前用于检验设计，旧案例不必全满分后再继续；内部小步测试与提交，整轮连续推进。复用 W 的传输、引用和计量，不重建完整 CLI、不增加主动扫描或目标执行。按任务书选择来源与运行面板，保留失败、未知费用和一次有依据的修订；研究问题和解决过程统一更新研究总文档。直接在 skill-ir-aot 工作，完成后提交并推送用户 origin，交付可运行用法、实际收益及剩余问题。
