# Skill Family Source Repair And Prospective Transfer Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to execute this plan. Main agent owns design, edits and final checks; narrowly scoped read-only probes follow AGENTS.md. Track the checkboxes and actual evidence, not elapsed hours.

**Revision:** 2 — 2026-09-12，替代 3c37f7f 中的 revision 1；旧版在 Git 中保留。
**Status:** active。N0–N3、N5、N8 已于 2026-09-12 完成；当前主线可运行任务为 N10。后续状态以 `results/skill-ir/skill-family-current-v2-source-repair-001/execution-status.json` 为准。
**Goal:** 在 2026-09-14 00:00（Asia/Shanghai）前优先交付一个有实际消费闭环的 API 合同任务自动化引擎：明确需求 + 普通 OpenAPI 输入 → 可检查请求/测试包 → 原生执行与故障检出，并分别评价新需求与新输入迁移。
**Architecture:** 保留旧 production v2；优先连接现有 api-skill-mapping、schema witness、request/form/negative、response checker 与 pytest 模块。新增薄的任务合同/计划层和统一调用接口；历史来源修复独立限时处理。标准化任务输入与输出，不重造 OpenAPI，不把自然语言提取自动视为可信。
**Tech Stack:** Bun、TypeScript、Zod/AJV、现有 Python/pytest runtime、JSON/YAML、Git/gh；Schemathesis 为首选外部对照，Dredd 非必选。

## 1. 审查结论与选择

### 1.1 保留什么、改变什么

保留职责切片、完整分母、独立 checker 和历史证据。改变“先清历史问题再堆新成员”的依赖关系：

1. 第一交付是任务合同驱动的实际产物；旧 source blocker 只影响依赖它的任务。
2. skill 成员数、需求差异、独立 API 输入数分别报告。不同成员重复两份同提供方输入，不能算六份独立输入。
3. 生成、检查、消费三个层次各有结果；原生测试全部 skip 不能通过工程验收。
4. 先锁抽样与方法，读取允许的新输入后再登记具体预测，最后执行；不能要求未读正文时知道 responsibilityId。
5. prospective 首跑完成后修订属于 development follow-up，不能并入未见首跑成功率。
6. N6 找档不阻塞 N7–N15。元数据/报告提交不触发重复 clean replay，更不追逐自引用的“最终 HEAD”。

审查依据见 [本轮代码与外部资料分析](../../skill-ir/skill-family-plan-review-20260912.md)。

### 1.2 这一类是否足够多

当前只能断言“多个真实项目存在相关职责”，不能断言生态规模大或占比高。
已有 acquisition=31、deep-read=7 不等于 31 个合格 API 成员。LambdaTest、Jeremy、Pactflow 提供已暴露职责案例，但任务也包含 live 状态、原生框架或复杂 response 等尚未完成部分。

N1 目标取证 12–20 份正文、至少 6 个 repository origins；成员资格按正文与资源判断，保留不属于类及类内不支持者。便利搜索样本不能用于估计生态比例。去重记录 owner、fork、相同内容和复制线索；repository-distinct 不写成已证明完整谱系独立。

API 类仍是截止日前主路线。Env/config、静态审查各取少量对照，解释 oracle 与状态依赖差别，不用主观 0–3 分选举临时切换整个工程后端。可得性不足时缩小主张，继续完成可用引擎。

### 1.3 统一类与实现 profile

上位类：**结构化合同驱动的离线验证任务**。本轮实现 profile：**OpenAPI 3.0.x 合同驱动的请求/测试任务**，沿用研究切片名 openapi-contract-to-offline-request-specimen。

类成员资格与当前支持独立。成员须有明确合同输入槽、离线产物责任和可定位要求；只要求“审核 API”“检查安全”不能自动升级为完整构造责任。复合 skill 按职责归类。

OpenAPI 3.1/3.2、独立 JSON Schema、Postman、GraphQL 是未来适配口，不在本轮默认支持面。必须保留 dialect，拒绝静默当作 OAS3.0。JSON Schema 本身不提供 HTTP method/path/status；扩展输入适配器必须补足 task contract，不能改文件后缀冒充兼容。

“标准”是 SkVM 的版本化任务/产物互操作合同，不声称行业标准或完整 skill 分类学。

## 2. 方法合同：需求必须进入生成计划

### 2.1 三个不同角色

- SKILL.md + 直接资源：说明需要做什么；可由人或模型提出映射，保留原文定位与不确定项。
- OpenAPI + 本地依赖包 + 可选 observations：提供待处理数据与可执行约束。
- TaskContract → ConstructionPlan → ArtifactBundle：定义实际选择、覆盖、输出、校验和消费方式。

固定 backend 允许缓存同一输入的候选池，但必须按 task contract 选取、检查并导出产物。只改变成员名称/最终计数不算需求适配。

最小公共接口设计（N2/N8 实现；以下不是已经存在的 API）：

~~~ts
type ObligationKind =
  | "valid-minimal" | "valid-full" | "required-omission"
  | "constraint-negative" | "response-conformance";
type TaskContract = {
  schemaVersion: "skvm-api-task/v1";
  taskId: string;
  profile: "oas30-offline-test/v1";
  input: { path: string; format: "json" | "yaml"; dialect: "oas3.0" };
  dependencyManifest: string | null;
  operationKeys: string[] | "all";
  requirements: Array<{
    id: string;
    kind: ObligationKind;
    required: boolean;
    scope: "each-selected-operation";
    sourceLocator: string;
  }>;
  output: "request-json" | "pytest";
  observations: { path: string; provenance: "supplied" | "fixture" } | null;
  execution:
    | { mode: "offline-validation" }
    | { mode: "loopback"; oraclePath: string };
  mapping: {
    origin: "user-declared" | "agent-reviewed" | "human-reviewed";
    sourceSkill: string | null;
    unresolvedRequirementIds: string[];
  };
};
~~~

path 相对于 task 文件；参数/HTTP 值保持数据，不拼进可执行 Python 源码。
公共 JSON Schema 严格校验，不能静默丢弃未知 requirement、输出格式或必需字段。每个 requirementId → operationKey → caseId → source pointer → checker → exported row 可追踪。既有 mapping/v1 作为只读适配输入，不改历史格式。

execution.mode 默认为不发 HTTP 的 offline-validation，必须显式写入合同；loopback 必须绑定独立 oraclePath。复用已有 api-pytest-oracle 语义，缺失 oracle 不能伪造 expected status。packageComplete 与 executionComplete 分开，导出成功并不意味着实际运行。全部未执行不能满足第 3 节 E 的消费验收。

通用输入模式接受用户明确 TaskContract，不要求提供研究 identity、分析 ledger 或历史结果目录。skill 模式额外提供需求映射，模型参与只属于导入阶段；结构检查通过不能证明自然语言解释正确。证据不足保留 review-needed，不能默认选 easy profile。

### 2.2 需求作用测试与完整性

至少三种有源码依据的不同任务：只要 minimal、要求 full + omission/negative、要求原生 pytest 或响应观测。相同 API 输入必须产生可解释的计划/导出差异，修改 output 不能只修改报告标签。

关键测试：
- 重命名 skillId/repository，任务内容相同时计划语义不变。
- 同一 source，把 minimal 改为 full + required omission，新增义务与对应 case 可追踪。
- 删除一个必需 requirement/case、替换 operation/ref target、改变 wire 值，独立 validator/checker 必须报错。
- 请求未实现的 native 格式，返回 unsupported-output；不能用 JSON 当完成。
- 单个操作有一个 case 成功而其他必需义务缺失，taskComplete=false。
- required 约束没有实际输入实例，不计成功；保留 non-applicable/insufficient-input，选择规则决定是否允许 reserve，不能凭空生造实例。

每个 task 必需义务全集在构造前枚举。只有该 task 的全部适用必需义务经 checker 通过并按要求导出，才能 taskComplete=true。任何未解决的必需要求使其不完整。类内但当前不支持的要求保留在全量分母中。

### 2.3 分开四层 oracle

1. 来源：版本/引用能够解析，不等于源文档符合真实服务。
2. 请求：值与 wire 符合声明约束；负例违反指定约束，不自动推出服务必然返回 400/401/422。
3. 响应：已提供 observation 是否符合声明的 status/media/body/header。没有 observation 时可导出条件校验器，但 observedExecution=not-run。
4. 行为：状态转换、权限、业务语义和 status trigger 需要额外明确 oracle；本轮只在独立 loopback fixture 有该依据时测试。

response ref 在 request-only 任务中可以是 advisory；在 response-conformance 任务中就是必需依赖。相同 ref 的严重性依任务义务派生，不能永久写 constructionObligation=false。

### 2.4 引用和 schema 语义

N3 图节点用 document URI + JSON pointer，边记录依赖任务/操作/角色。
解析循环不等于缺失、不等于源无效：允许记录 recursive-resolved；构造无法在预算内找到有限 witness 时记 unresolved-budget，不声称无解。外部目标获取失败、pointer 缺失、dialect 不支持分别计数。

OAS3.0 Reference Object、OAS3.1 Schema $ref sibling/$id/$anchor 语义不能混用。采用版本分发与明确不支持结果；禁止全量展开循环图。网络获取在 acquisition 阶段缓存，离线编译/重放只用显式依赖清单，限制文件根目录、URL scheme、redirect、字节数与遍历预算。

现有 api-schema-witness/api-schema-checker 已有受限 object/array/allOf/anyOf/oneOf/nullable 和有限搜索；先用实际 fixture 点验，不能因为旧 production v2 只支持 primitive，就重造全部能力或给新接口贴“完整 JSON Schema”标签。

## 3. 截止日交付、排期和失败路线

### 3.1 两项交付分别判定

**工程最小交付 E（必须争取）：**

- 一个普通 TaskContract 输入入口，至少 request-json 和现有 pytest 后端可消费；无需研究目录才能工作。
- 至少 3 个已核读、repository-distinct skill 职责能映射到同一合同；至少两种真实需求差异实际改变计划与产物。
- 固定批次至少 6 份不同原始 API 合同、至少 3 个实际 API 提供方。聚合仓库不是提供方；复制、格式转换和同源修订不增加输入数。
- 批次至少来自三个提供方的任务各产生非空完整产物；全量 operation/requirement 拒绝、未支持、未解决同时输出。另报受支持子集完成率，不伪装全类完成率。
- 至少两个语义不同的独立 loopback fixture 真正运行 native tests；8 类预先设计的错误由指定层检出，正常对照通过。具体数量由 N5 计划锁定，不能都 skip。
- 打包后的产物在干净目录由 Python/pytest 直接消费并输出 JUnit；仅 CLI 能输出“pass”不够。纯离线场景同时提供不需要网络/服务的请求与 observation 校验。
- 构造/重放路径无模型调用；导入映射、下载、代理开发和原生 HTTP 调用分开计量。没有实际真人测量则人效不作结论。

**研究交付 R（独立，可失败）：**

- 新输入验证与新 skill 需求迁移分开锁定、执行、计数。
- 新成员目标 3 个 repository-distinct、每成员两个适用任务，且主批次合计至少 6 份独立原始合同、3 个提供方；两份相同文档复制给三人只算 2 unique inputs。
- bounded-positive 最低要求：3 个有据可判定成员、至少 2/3 成员的两个任务均 taskComplete；全部 accepted artifact 的 checker 通过；固定全量必需义务 coverage ≥90%。未支持/未解决留分母。5 成员样本仍然只叫有界验证，不用 strong-positive 暗示普适性。
- 来源不足为 insufficient-evidence；有适用任务但未达标为 bounded-negative；未运行另记 not-executed。原始 first-run 与后续修订永不合并。

E 与 R 不捆绑。R 失败不阻塞工程、对照和交付；E 未达标不能只凭归档完整宣称“最小交付完成”。

### 3.2 工作顺序与时间盒

建议净执行量约 18–26 小时，按实际进展调整，不等待凑时长。

| 优先级 | 任务 | 预算与落点 |
|---|---|---|
| P0 | N0 → N1 → N2 | 2–3 小时；确认需求与合同，不扩写分类大全 |
| P0 | N3 → N5 → N8 → N10 | 9–12 小时；最先得到普通输入 → 包 → 原生执行 |
| P0 | N7 → N9 → N11 → N12 | 4–6 小时；锁定方法，再取新输入/成员首跑 |
| P1 | N13 | 1–2 小时；同 fixture/约束外部对照，与 R 是否成功无关 |
| P0 | N14 → N15 | 1–2 小时；一次代码候选 clean replay 和交付 |
| 支线 | N4 与 N6 | 合计最多 75 分钟；记录结果即可，不阻塞主线 |

N 编号保留但 resume 按依赖图调度，不是严格数值顺序。N5 不依赖 N4；N7 不依赖 N4/N6；N13 可在 N10 后运行。
依赖图固定为 N0→N1→N2；N3/N7←N2；N4←N3、N6←N2；N5←N2/N3；N8←N2/N3/N5；N10←N8；N9←N7/N10；N11←N9；N12←N11；N13←N10；N14←N9 与 N11/N12 的完成或明确未执行记录；N15←主任务终态及 N4/N6 的限时结论。N10 未达方法门时 N9/N11/N12 明确 not-executed，N14 用单列 engineeringCodeCommit 复现已有 E 产物，不能因此伪造 research candidate。
2026-09-13 18:00 检查 E 的闭环；22:00 后不再启动新特性/新来源批次，只修当前破坏性问题并运行 N14/N15，力争 14 日零点前交付。
若实际启动太晚，跳过扩样和可选能力，记录 deferred；不能用缩减分母假装已达 E/R。

## 4. 文件职责与兼容策略

优先复用实际已有文件：
- src/skill-ir/api-skill-mapping.ts：loader、来源映射、多个真实 profile 分发。
- src/skill-ir/skill-family-class-construction.ts：历史 class-proof 构造和 outcome，保持旧入口/历史行为。
- src/skill-ir/api-schema-witness.ts、api-schema-checker.ts：已有组合 schema 与独立约束检查。
- src/skill-ir/api-request-specimens.ts、api-request-body-negatives.ts 及各 checker；api-parameter-wire.ts、api-form-wire.ts。
- src/skill-ir/api-response-observation.ts、api-response-headers.ts：响应 observation 和 header 检查。
- src/skill-ir/api-pytest-suite.ts、api-pytest-suite-checker.ts、api-pytest-runtime.py、api-pytest-oracle.ts。
- scripts/skill-ir/api-pytest-loopback.ts、api-pytest-wire-loopback.ts：已有独立 native loopback 验证。
- src/skill-ir/api-tester-operation-source.ts、api-tester-operation-coverage.ts：枚举和投影依赖。
- src/cli/artifact.ts：已有用户入口，增薄分发，不做 UI。

计划新建（不存在时才创建，不复制已满足职责的模块）：
- src/skill-ir/api-task-contract.ts 与 .test.ts：严格任务 schema、源定位及 mapping/v1 适配。
- src/skill-ir/api-task-plan.ts 与 .test.ts：按任务产生义务/操作/case 计划。
- src/skill-ir/api-task-run.ts 与 .test.ts：普通输入编排、包与结构化错误。
- src/skill-ir/api-tester-source-closure.ts 与 .test.ts：任务相关引用图，带缓存注入。
- src/skill-ir/skill-family-readiness.ts 与 .test.ts：新报告状态派生；不改旧布尔值。
- scripts/skill-ir/skill-family-current-v2-prospective.ts 与 .test.ts：小型可恢复编排，禁止再复制巨大 class-proof 脚本。
- docs/skill-ir/skill-family-current-v2-source-repair.md：实现后组件说明与实际复现命令。
- results/skill-ir/skill-family-current-v2-source-repair-001/：本轮证据根，以下路径均相对这里。

新 TaskContract/version 与历史 production v2 分开。v2 只是兼容 backend，不强迫 rich schema 通过旧 primitive binding。
新 profile 用 oas30-offline-test/v1；不要修改旧锁来换通过。直接在 skill-ir-aot 开发/提交/推送 origin，不新开 feature branch。

## 5. 主队列 N0–N15

### N0：恢复与最小基线（P0，约 20 分钟）

- [x] 读取当前规则、计划/状态和 Git 状态；记录实际 baseCommit、环境。运行一次既有 class-proof status。
- [x] 创建 execution-status.json、stage-manifest.json；新结果根为 skill-family-current-v2-source-repair-001。身份仅隔离证据，不等于新分支。
- [x] 创建最小 status/resume 编排入口及状态恢复测试；后续任务逐项接入，不在 N0 预先实现全部研究流程。
- [x] 状态分开工程/研究，记录每任务 dependencies、status、evidence、nextAction；维护任务可 completed-with-limitation，不能阻止 ready 的主任务。
- [x] 历史 0/6、Q1、held-out reserve、旧 candidate 和报告只读；不做全盘扫描或全量 benchmark。
- [x] 记录本审查公开网页曝光（见分析文档），正文或关键内容已可见者进入 development-exposed，不能进 body-unseen 主样本。

验收：恢复入口可定位首项未完成的可运行任务。缺少旧 clean-002 是已知事实，不是 N0 新失败。

**N0 实际结果：** baseCommit=`edd5a94198ee8b66d30f823de30895b72b97e920`，实现/首份证据提交=`de92e7ef3c8693ea40147f67f94c576b61d252e2`，Bun=`1.3.14`，Node=`v23.8.0`；既有 class-proof status 入口 exit 0。新 `status`/`resume` 均从持久 JSON 只读恢复并定位 N1；聚焦测试 `5/5`、18 assertions，脚本定向 typecheck 通过。未读取 held-out/Q1 reserve，未启动 prospective，外部 source/business/model/paid 调用均为 0。

### N1：需求语料与独立输入来源（P0，最多 2 小时）

文件：corpus/source-ledger.json、corpus/duty-matrix.json、corpus/exposure-ledger.json。

- [x] 优先复用已归档完整正文，再补 authenticated gh tree/contents/raw 获取；目标 12–20 正文、6 origins，完整记录实际 acquisition failures、缺依赖与许可证限制。许可证未知标 redistribution-review-needed，不自动等同技术输入不适用。
- [x] 每条职责记录原文、direct resource、输入槽、输出格式、覆盖要求、外部状态、类内不支持项；至少一个正例、一个反例、一个“属于类但当前不支持”。
- [x] 给 API 输入登记实际 provider、原始上游 URL、版本、是否 aggregator 镜像、是否已暴露。广泛接收用户给定合同的职责可绑定外部公共合同，显式写 shared-public-input，不冒充 skill 随附样例。
- [x] 目标另保留 5 个 metadata-only 候选，最低有 3 个可进入新成员面板；两个 reserve 是便利条件，不是人工增设执行门。不能为数量把搜索片段当完整正文。
- [x] Env/config 与静态审查仅作小型职责对照；公开文献说明需求存在，便利语料不估总体比例。

验收：3 个已核实职责可用于 N2；若不足，工程仍可用 user-declared task 开发，但 skill-family 结论为 insufficient-evidence。

**N1 实际结果：** 实现/证据提交=`bfbc4c885efaa11ae27aaddd380dbb75cf59fe50`。从已提交 development 归档逐字节复核并固定 12 份完整正文、6 个 repository origins、42 个 direct resources；保留 498 项完整职责分母，其中 constructible=`38`、in-class unsupported=`79`、outside-class=`46`、unmapped/unresolved=`335`，4 个来自不同仓库的 N2 映射候选均绑定原 obligationId，未把窄 slice 写成 whole-skill。另保留 5 个 repository-distinct metadata-only 候选且 `bodyRead=false`。API 账本复核 12 份已暴露合同、6 个实际 provider；它们均来自同一 aggregator mirror，旧账本没有原始上游 URL，因此显式记为 `not-recorded-in-prior-ledger`，不猜测补齐。未发起 acquisition、held-out/Q1/prospective 或外部 source/business/model/paid 调用。RED/GREEN 后 N0+N1 聚焦回归 `10/10`、34 assertions，完整 `bun run typecheck` exit 0。

### N2：任务合同与完整义务计划（P0）

文件：api-task-contract、api-task-plan 及测试；baseline/gap-matrix.json。

- [x] 按第 2 节写 schema 与 api-skill-mapping/v1 只读适配；每项 requirement 有 locator、scope、required 和输出要求，未知语义保留 unresolved。
- [x] 原 skill 不认识的必需要求仍在 source duty ledger 中保留原文和 unresolved 原因；提取出一个窄 slice 必须标注 parentScope/residualDuties，不能把 Drift/pytest 等原生输出要求静默改为 JSON。合同不合法与有效但当前不支持分开。
- [x] 加入第 2.2 节的六类 RED 测试，然后实现最小计划层并转绿。
- [x] 任务完成判定使用每个选定操作上的全部必需要求，不能沿用历史 deriveObligationOutcomes 的“有一个 constructed 就 accepted”作为新任务完成标准。
- [x] gap matrix 区分已实现未接入、正确性 bug、新增能力、外部 oracle 缺失；检查 api-schema-witness 和 pytest 模块，优先接通已有功能。

验收：同一 API 的两个不同 TaskContract 产生不同且可解释的计划；成员名称变化不改变计划。固定完整分母在构造前可列出。

**N2 实际结果：** 实现/证据提交=`9ae5f59f4003daea5d32fd09e6701bf084eb8e35`；`baseline/gap-matrix.json` SHA-256=`f8d6b4ca9d92ce6b836bc49b2d8c63124cf177897e7bdf536809a4e48f30cafe`。新增严格 `skvm-api-task/v1` parser/JSON Schema、只读 legacy mapping adapter、构造前 plan、独立 source/task-backed checker 与完整 completion evaluator。使用同一已暴露 `onepassword-connect` 操作生成三个不同来源职责计划：event4u minimal+wrong-type=`3` 个必需义务、LambdaTest full+omission+boundary=`4`、fishzjp pytest+fuzzing=`2`；第三项宽泛 fuzzing 映射保持 `unresolved-mapping`，未当作正例。需求改变与 output 改变均改变 semantic plan digest；只改 skill/repository provenance 不改变语义。独立 checker 三项全通过，所有计划仍为 `constructionStatus=not-run`/`taskComplete=false`。gap 为 implemented-not-connected=`6`、correctness-bug=`0`、new-capability=`4`、external-oracle-missing=`2`。N2 聚焦集合 `17/17`、69 assertions，项目 `bun run typecheck` exit 0；外部与保护计数仍为 0。

### N3：任务相关 source closure（P0，最小够用实现）

文件：api-tester-source-closure 及测试；复用 operation-source/coverage。

- [x] RED fixtures：missing local、有效外部 request/response、相对 URI、重复共享依赖、合法递归、非法循环展开、错误 pointer、OAS dialect/sibling 差异。
- [x] 返回 per-reference resolution、dependentRequirements、affectedOperations、acquisitionStatus、witnessStatus；source validity 与 witness constructibility 分离。
- [x] 外部依赖先取入 pinned manifest，再本地解析；被引用数据永不作为执行指令。资源限制固定并返回 resource-limit 原因。
- [x] request-only 下 unresolved response 可 advisory；response-conformance 下相同 ref 阻塞相应义务。未受影响操作继续。
- [x] 保留 origin URI 与 pointer；打包时不要因 flatten 丢失相对基址。复用 dependency fault 测试，不造第二套同义 checksum 管线。

验收：删掉真实依赖能报对应 requirement，合法递归可记录解析成功但构造 unresolved；不会全局通过或全局拒绝。

**N3 实际结果：** 实现/证据提交=`70f36b796d0afe2c0348a014a5439b1184100c61`；`source-closure/report.json` SHA-256=`c5d6eb08a24393653129c6a2b4cac7afcf964f710ae27125c2798fc384a1feb6`，81,655 bytes。新增严格 digest-bound dependency manifest 和 task-scoped URI/pointer 图；只接受明示 http/https identity，限制 64 resources、单件 8 MiB、总 32 MiB、10,000 traversal nodes、4,096 reference occurrences、depth 128。三份 N2 真实计划均 source closure passed，合计 12 个本地引用 occurrence。8 个合成 case/13 条预注册关系全部通过：外部 request/response、包含文档相对基址、共享依赖单次装载、结构递归 source resolved 但 witness unresolved、纯 ref 环阻塞、错误 pointer 与 OAS3.0 sibling 分因、OAS3.1 profile 拒绝、response severity 随 task 改变；混合输入中 broken operation 被阻塞而 healthy operation 保持 source-ready。相关聚焦集合 `26/26`、90 assertions，完整 typecheck 通过；未联网获取或执行引用内容。

### N4：历史 source 修复（支线，最多 45 分钟）

文件：source-repair/meilisearch-resolution.json、bangumi-external-closure.json。

- [ ] Meilisearch 只查旧记录对应上游版本/发布/维护者修订。明确权威新版本则新 source identity；找不到写 source-blocked-unresolved。
- [ ] Bangumi 32 个 ref 记录获取/解析/依赖角色；最多一个缓存获取批次和一次合理重试，19 operation 的源状态可 partial。成功解析不等于 live API 正确。
- [ ] 不改旧报告，不建立专用生产 patcher。若有原始权威文档直接使用它，人工拼接仅可标 derived development source。
- [ ] 已知未修 source 只阻塞依赖任务，不阻止独立输入、N5/N7 或 prospective 锁定。

验收：两项各有可解释终态与未完成范围；无需“全部历史问题解决”。

### N5：真实产物消费与独立故障闭环（P0）

文件：复用 api-pytest-suite/runtime/oracle、response-observation/header；integration/consumer-report.json。

- [x] 先跑已有 native loopback 与 wire 测试确认能用；错误才修，不再从零做 exporter。
- [x] 把 N2 的计划连到 request-json 和 pytest 后端；输出完整 suite data、Python runtime、依赖说明、任务与来源绑定。需要 response profile 时使用现有 observation checker。
- [x] 以两份独立编写且有明确语义的 loopback fixture 消费导出包。fixture 不调用 generator 的 witness 函数生成“期望答案”；fixture 身份和验证范围标明 synthetic。
- [x] 锁定 8 类 fault：遗漏必需 case、错误 operation、错误 ref 目标、query/form wire 破坏、请求约束破坏、response body 错误、response header 错误、无依据伪造 status assertion。前五由计划/静态/序列化检查，后面由 observation/runtime 或 oracle 边界检查检出。
- [x] 对照正常 fixture 通过；证明至少一个实际收到的 HTTP request 和 response 被 native runtime 验证，JUnit 中 executed/pass/fail/skip 分列。业务缺 oracle 可 skip，但不能计 completed。
- [x] 对普通 API 只给条件 response 检查，不猜 expected status。缺行为 oracle 必须以 observation/fixture 输入补足，不能为了避免 skip 写猜测。

验收：已满足。`integration/consumer-report.json` 记录 JSON/reference 与 form/query/header 两种 fixture 各执行 2 个 native case 并通过，JUnit 分列为 4 passed、0 failed、0 errors、5 skipped；4 次 loopback HTTP 均由手写 predicate 验证。8/8 预登记 fault 在指定层检出，0 漏检。该结果只适用于合成 fixture，不代表真实 API 或 whole-skill 可靠性。

### N6：历史归档缺口判定（支线，最多 30 分钟）

文件：archive-recovery/clean-002-search.json。

- [ ] 限定搜索旧精确路径、已知 worktree、Git 路径历史及已知归档；有线索才查相应 unreachable object。禁止整盘/所有远端无限枚举。
- [ ] 找到 expected digest 原件记 recovered-exact；否则记 not-recovered-within-search-scope，并列搜索范围。有限搜索不能证明永远不可恢复，删除原版 historically-unrecoverable 绝对断言。
- [ ] 新 current clean 是独立证据，历史缺档继续显示；不为这条旧记录修改历史 verifier。

验收：一次结果即可关闭该维护任务，后续除有新线索不再搜索。

### N7：非循环 readiness（P0，可在 N2 后实现）

文件：skill-family-readiness 及测试。

- [ ] 每个维度使用 ready/not-ready/not-assessed 加 reasons/evidence，避免未测试等同失败。
- [ ] method：合同、计划、映射不确定性处理、checker 和错误路径可运行；capability：N10 实际 development evidence。
- [ ] source/input 按 task/report scope 派生；无关历史 Meilisearch 不能使所有任务 false。
- [ ] protocolReady：代码候选、抽样规则、评测与失败政策已锁；允许开始授权的正文/输入发现。
- [ ] prospectiveReady：protocolReady + 选定任务 input/source 足够 + post-acquisition/pre-run 预测已锁；不要求 transfer 成功或结果报告已存在。
- [ ] transfer 只在首跑后派生；reproducible 只依据当前代码/包的 replay。authorized-unseen-read 与 protected-read-violation 分开，合法读取不要求计数为零。

验收：测试“未读正文可 protocolReady”“有读取无运行可 prospectiveReady”“一个 blocked task 不拖垮其他任务”“尚未 transfer 为 not-assessed”；旧 readiness 只读。

### N8：共享引擎整合与必要修复（P0）

文件：api-task-run 及测试；薄接 src/cli/artifact.ts；必要时新 api-task-plan helpers。

- [x] 实现 TaskContract → plan → source closure → construct → independent check → bundle → consumer 的统一调用；不依赖旧 selection/identity/成功数量。
- [x] 接已有 form、组合 schema、负例、response 和 pytest profile。正确性 bug、计数漏项、输出误标即使一个实例也必须修。
- [x] “两个成员出现”只用于新特性优先级，不是 bug 修复许可。新增特性优先有两个独立需求实例且预计两小时内完成者；超时保留明确 unsupported。
- [x] 新增能力用新 support profile 记录，不静默改旧 production v2。保持旧函数签名/默认行为；新任务从新入口调度。
- [x] AOT 合同只保证编译后的核验/重放无模型；自然语言导入成本与审核来源单列。
- [x] 提供拟定用户命令（本轮实施后必须实测）：bun ./bin/skvm.js artifact task --task=task.json --out=out。已有 CLI 分发不适合时先提供等价 api-task-run.ts --task --out，并在 N15 记录唯一可用入口，不新造 UI。

验收：已满足。`integration/engine-report.json` 在仓库外 OS 临时目录运行四个 task，requirement、operation、output 三类变化均改变实际 plan/package/backend；输出自带可重放 digest binding。文档命令与 binding 命令均实测，旧 production v2 回归 10/10；通用入口无已知来源名成功分支，模型/remote/paid 调用均为 0。另修复 required security 误报完成和 oracle 未覆盖 task-selected row 仍运行的问题。

### N9：代码候选锁（P0，必须在 N10 修订结束后）

文件：candidate/code-lock.json、candidate/support-matrix.json。

- [ ] N10 calibration 通过后锁当前 codeCommit，包含入口、runtime.py、checker、依赖和任务 schema；revision 1 “先冻结再 calibration 改方法”顺序作废。
- [ ] 用一次清单绑定必要文件。Git blob bytes 作为源码归档依据，下载源保留 raw bytes；运行时若必须按 EOL 物化，应在 candidate 自带重建步骤中声明并测试。
- [ ] 候选不包含引用自身提交 SHA 的可变文件。记录 codeCommit 与之后 evidenceCommit；验证谓词/依赖/运行文件改变才需要新候选或重放。
- [ ] v2 legacy 与 rich-task backend 的支持分别列明，不用单个 v2 标签混称。

验收：候选提交确有执行/验证入口，依赖 closure 完整；冻结后到首跑结束核心方法不变。

### N10：固定 development 面板与改进（P0，在 N9 前）

文件：development/input-lock.json、task-contracts/、first-run.json、revision-001.json。

- [ ] 在看输出前固定 6 份真实原始 API 合同、3 个 provider；至少 3 个成员需求映射，允许一份 API 比较不同需求，但 unique input 只计一次。
- [ ] 为每份 source × task 构造前登记 operation/requirement 分母、预期支持与剩余 oracle；不能删去 unsupported 行。
- [ ] 先 baseline 再当前任务引擎：分别测 taskComplete、必需义务覆盖、checker、native consumption、时间、重复构建时间/缓存和修改量。
- [ ] 单次有据共享修订允许正常 TDD 多步开发；保留第一批运行结果。修订后同分母重算，不用修订次数限制拒绝修复明确 bug。
- [ ] 至少两个真实需求变化测试通过，以及三个 provider 有 taskComplete 的非空任务，才准备 R；不满足先修工程或标 method-not-ready。

验收：按第 3.1 E 条件报告可用程度，不靠“生成一个 case”通过。N10 完成后才进入 N9 冻结。

**N10 锁定检查点：** `development/input-lock.json` 已在构造前固定 1Password、Visier、Zapier 各两份已暴露原始合同，共 47 个完整枚举操作、9 份 task 合同和 4 个 repository-distinct 映射来源。六项预期完整任务跨三个 provider；两项凭据阻塞及一项更广义 pytest fuzzing 未决任务保留在分母。两组同输入/同操作 requirement 变化已预登记。锁生成/独立核验聚焦测试 `2/2`、11 assertions，通过完整 typecheck；baseline/current 尚未运行，不能据此勾选 N10 或声称门已通过。

**N10 baseline 检查点：** 锁提交 `26b4566f575b886f8104d7c209b7f03a7cdbeed6` 推送后，source-only baseline 已独占写入并通过结构核验。固定 18 个必需 obligation 中 13 个存在未绑定 construction potential；因为基线无 TaskContract dispatch、requirement binding、package checker 与 task-selected native consumer，checked-bound/taskComplete/package-check/native 均为 0。首次/重复构建语义相同且无 cache。baseline 原件须先提交推送；current first-run 仍未运行，N10 继续 running。

### N11：两阶段 prospective 预登记（P0，信息顺序修正）

文件：prospective/protocol.json、selection-lock.json、discovery.json、predictions.json。

- [ ] T0：N9 后先锁代码、资格定义、候选顺序、来源查找顺序、最大筛选数量（默认 12）、替补理由、固定评测指标。metadata-only 信息只能给先验预测，不写虚构 requirementId。
- [ ] 候选使用稳定顺序；新成员 repository 与 API provider 分别去重。被本次公开审查看到正文/关键内容的条目只作 development；uncertain exposure 不称 body-unseen。
- [ ] T1：在已锁 protocol 下读取 primary 正文/依赖与 API 文档，记录 exposure，按冻结映射方法产生任务。只因无类职责/无声明输入/获取失败按规则替补，所有 screened 分母保留；不能因 constructor 拒绝/预计低通过率换人。
- [ ] T2：解析并冻结具体 taskId/requirementId/inputId、完整原始输入、适用性与预测；此时可知道正文，但未运行 generator/checker outcome。模型辅助提取需保留 prompt/result 和 agent-reviewed 来源，不称完全自动语义编译。
- [ ] T3：prospectiveReady 由 N7 在 T2 后决定。3 成员×2任务与输入多样性不足时新成员 R 可 insufficient-evidence；独立的新 API 输入面板仍可执行，称 new-input validation，不假冒 skill transfer。
- [ ] 若方法或映射因 T1 新正文而修订，整批记录 development-exposed；不能继续称原冻结方法的未见验证。

验收：T0 < 首次允许读取，T2 < 首次 construction。没有“读不到正文→无法预测→不能读正文”的循环。

### N12：首跑与完整失败分母（P0）

文件：prospective/first-run/、first-run-report.json、follow-up-development/。

- [ ] 使用 N9 方法和 T2 锁按顺序跑一次；分别报告 new-requirement、new-input、两者皆新，不把相同 API 重复运行算独立输入。
- [ ] 按 operation/requirement/case 保存构造、静态检查、消费结果；成员完成要求两个适用 task 的必需项都完成。
- [ ] 网络恢复不改变样本身份。基础设施失败最多一次原身份重试并保留首试；算法/检查失败保留为首跑失败，不 reroll。
- [ ] 首跑全部关闭后可开发一次共享修订，在 follow-up-development 中跑原失败案例作回归。它不提高 first-run 分数；需要再次称 prospective 时另锁后续新批次。
- [ ] 报告第一性结果：完整/不完整任务、每类失败数及成本。结果不足也继续 N13/N14/N15，不能让报表缺档代替实测。

验收：按第 3.1 R 判定 bounded-positive/bounded-negative/insufficient-evidence；not-executed 有具体原因，且不冒充 E 已交付。

### N13：外部方法与额外价值（P1，在 N10 后即可）

文件：comparison/tool-baseline.json、comparison/added-value.md。

- [ ] 首选 Schemathesis，固定实际安装版本、相同合同、同 loopback fixture、请求预算和 timeout；从实际 --help 确认选项，不套用旧文档命令。
- [ ] 比较生成时间、唯一有效 case、操作/约束覆盖、指定 fault 检出、可复现产物和失败定位。随机 fuzz 与确定性 witness 不做未经控制的总量速度比较。
- [ ] 最小有用差异：source duty → selected obligation → artifact → checker 的可追溯性、同 source 不同 task 输出差异、无需模型的重放和可解释 partial output；这些须实测，不能仅列功能名。
- [ ] 不把“从 OpenAPI 生成测试”声称为新发明。Dredd OAS3 文档为 experimental；安装失败 30 分钟内落 not-runnable，不把它设门。
- [ ] 若没有额外效果，写工程整合贡献；工具通过不替代本项目 checker，也不宣称优于所有测试工具。

验收：至少一个可运行外部对照或明确失败记录；依研究进展不影响工程交付。

### N14：一次代码候选 clean replay（P0）

文件：clean-replay/report.json、复现命令（组件文档）。

- [ ] 从 N9 实际 codeCommit 建短路径 detached 检出，固定依赖，重放一组完整包与当前批次；结果与失败语义保持。
- [ ] 外部消费从包目录直接跑 Python/pytest；不允许仅调研究 verifier 返回汇总 pass。对账 attempted/executed/failed/skipped。
- [ ] 首次失败留原件，针对实际归档/运行缺口修复一次并按变更说明是否新 code candidate；禁止放宽 oracle。
- [ ] 后续 evidence/文档提交只核对 diff 和必要文件，不再为新 HEAD 新建 checkout。源码入口、运行依赖或 checker 变化才触发重放。
- [ ] 若 R 未执行，仍重放 E 的真实产物，不能只重放零运行状态文件充当交付。

验收：E 的产物可实际重建/消费，记录 codeCommit、包与依赖；不恢复或覆盖旧 clean-002。

### N15：可用成果与恢复交付（P0）

- [ ] 用一页结果说明回答：输入是什么、哪类任务完整实现、普通调用命令、真实 task/unique source/provider 分母、执行/skip、失败与改进、成本和人工边界。
- [ ] engineeringDelivery 与 researchOutcome 分字段；阶段记录完整但 E 未达标时只能 completed-with-engineering-shortfall。
- [ ] 更新组件、状态页、spec/plan 当前入口及根交接/通信/日志，保留历史链接不复制多套逐行报告。
- [ ] 一次 relevant focused tests + typecheck + docs links + diff review，按白名单提交并推送 origin/skill-ir-aot；不清历史未跟踪材料。
- [ ] 完成后按剩余时间做高价值 follow-up：修一个阻碍普通使用的 bug、补一个跨 provider 回归、明确错误消息。不无限增加候选/冻结/审计轮次。到用户叫停或截止交付窗口立即保留状态。

验收：用户可拿一个 task.json 和 OpenAPI 文件得到有用产物；研究结论如实报告，执行目标完成与否依据 E/R 实际结果，不依据勾选数或墙钟时长。

## 6. 保留的历史限制与新阶段终态

| 历史项 | 本轮处置 | 是否全局阻塞 |
|---|---|---|
| Meilisearch missing total ref | 新源有权威证据才采用，否则对应任务 blocked | 否 |
| Bangumi response refs | request-only advisory；response task 为按需依赖 | 否 |
| clean-002 缺档 | 精确找回或限定搜索范围未找回 | 否 |
| 旧文档 0/6 | 原文档级 baseline；不能与新 operation 分母混算 | 否 |
| 旧 readiness/Q1 | 只读；新状态按任务与证据派生 | 否 |
| 旧候选 CRLF/入口晚引入 | 新 code candidate 自包含；Git blob/物化规则明确 | 否 |
| protected held-out/prospective | 历史 reserve 继续隔离，新批次按 T0–T3 合同读取 | 是，仅对应受保护操作 |

## 7. 成本、验证与恢复

网络与付费已获用户授权，无人为金额上限；请求必须有目的并留实际 usage，未知计费写 unknown。认证、缓存、Retry-After 和原身份有界重试可用；无响应保留，禁止只留成功。source requests、模型请求、付费请求、native loopback HTTP、真实业务 API、开发代理成本分别记录。

普通 bug 修复用 RED → 最小改动 → GREEN → 相关回归。不得为了让日期达标掩盖 checksum/source/checker failure；也不把等价校验叠加为新门。新 compile/runtime 若不访问模型，方可报告该阶段 0 model calls；source 获取不叫“0 API”。

运行时下一步：
~~~powershell
Set-Location 'D:\skill优化\SkVM'
git switch skill-ir-aot
git status --short --branch
bun ./scripts/skill-ir/skill-family-class-proof.ts --step=status
~~~

N0 创建的新编排器应支持下列命令；创建前不得宣称它们可运行：
~~~powershell
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=status
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=resume
~~~

resume 按第 3.2 节依赖与截止时间执行，复用已完成获取和验证，失败局限于依赖任务。N0–N15 的授权执行应由后续明确执行/持续目标承接，本次文档审查没有启动它们。
