# AQ0–AQ16：授权领域取证调度、分支求值与结论核验

> **For agentic workers:** 使用 `superpowers:executing-plans` 连续执行。用户已授权本轮开发、必要联网、真实模型实验和向用户 origin 发布；常规检查点不等待确认。主开发者负责实现与最终判断，子代理仅作边界清楚的只读探索或独立评阅，遵守外层 AGENTS 的派发与等待规则。

**Goal:** 让授权领域声明实际驱动取证、条件处理和结论检查，交付能从自然任务与原始源码运行的可选领域执行策略，并检验它能否减少遗漏、错误分支和行为/政策混淆。

**Architecture:** 复用 SkVM 的 inquiry、源码工具、native skill loader、provider 和计量。在它们之间增加同一个领域运行状态：模型提取带出处的局部控制规则；宿主安排有界依赖读取、执行小型条件代数、核对结论与规则的一致性。提取正确性、形式一致性与最终回答质量分别评价。

**Tech Stack:** TypeScript、Bun、Zod、现有 authorization/inquiry/native 实现与源码位置索引。沿用现有 CLI，不建设新平台或统一 IR。

状态：`AQ0-AQ9-implemented / AQ10-registered / engineering-review`。规划基线为 `2c7dd07380999ca8df971a7cdc64d5e7ed1733c5`；实际干净启动头为 `c0cd32d2ff0a1824d84025bced4f1de5dfcbcabf`。目录 `D:\skill优化\SkVM`；分支 `skill-ir-aot`；唯一发布目标为用户 `origin/skill-ir-aot`。40输入及两原skill loader/reference零paid预检通过；真实调用尚为0。

开发任务请求 `gpt-6.1-sol / max / Flash`。派发工具支持 model/effort，当前没有速度参数；记录实际可确认设置，Flash 未确认时如实说明，不修改全局配置。被测模型继续使用已配置的 `xty/gpt-5.6-sol`，与开发模型分账。

## 1. 本轮为什么这样做

AP 的数组界限、fallback 诊断和 native 22+2 预算已复核通过。本轮所有实验臂都使用这些共享修复，不用旧 AO 失败直接充当新机制的基线。

当前代码的三个事实：

| 缺口 | 当前实现 | 本轮要发生的行为变化 |
|---|---|---|
| 取证队列只在提示中 | `inquiry-program.ts` 展开六个 pending 项；`inquiry-run.ts` 仍由模型自行选读 | 宿主根据实际发现的依赖与未决问题，选择并执行下一项合法补读，留下选择理由 |
| 条件主要作为文本和检查字段 | `conditions.ts`、`assessment-program.ts` 校验关联和覆盖；未求源码条件真值 | 对带出处的有限表达式执行部分求值，排除与当前前提冲突的分支，保留决定性未知 |
| 结论主要通过结构/引用检查 | `inquiry-result.ts` 检查已展示证据、问题、分支及政策字段 | 宿主发现对象错配、分支冲突、行为/政策混淆及未完成决定性依赖，并驱动既有修复机会 |

AO 中允许范围内的 helper 未读，属于取证策略缺口；owner/null-owner 的适用分支错误、实际行为与政策判断混淆，属于领域推理缺口。AP 只修复三项共享运行合同，不能把这些语义问题记成 AP 已解决。

比较过的路线：继续增加提示可快速试验，但缺少执行约束；直接建设全语言静态分析器投入过大；本轮采用“模型提取局部规则 + 宿主执行有限领域规则”，把可确定的工作落到程序，把提取错误暴露出来。

## 2. 必读上下文与责任

执行者亲自阅读以下设计与交接内容；不要求通读全部历史请求。

1. 外层和仓内 `AGENTS.md`、`docs/skill-ir/current-status.md`、本任务书。
2. `docs/skill-ir/skill-ir-aot-optimization-spec.md` §14.34 的总原则及 AO/AP/AQ 补充。
3. `docs/skill-ir/skill-dsl-research.md` §7.34、§7.35：前轮失败归因与本轮设计；开发问题继续追加同一研究正文。
4. `src/task-dsl/authorization/inquiry.ts`、`inquiry-program.ts`、`inquiry-result.ts`；条件/assessment 模块只读相关接口，不强行合并新旧语言。
5. `src/benchmarks/authorization-dsl/inquiry-run.ts`、`inquiry-tools.ts`、`inquiry-native.ts`、`inquiry-local.ts`；`src/cli/authorization-inquiry.ts` 与 `src/adapters/bare-authorization.ts`。
6. AO 结果根 `results/skill-ir/skill-dsl-research/development/authorization-inquiry-tools-v1/` 的 manifest、evaluation-summary、README 和相关评阅；AP 的 `results/skill-ir/authorization-runtime-contract-repair-20261001/verification.json`。
7. `examples/authorization-assessment/reusable-skill/` 与 `docs/usage.md` 的普通 inquiry/native 用法。

本轮一个开发线程是代码、共享文档和 Git 的唯一写者。只在主开发分支工作，不创建分支/worktree，不清理历史材料。父线程派发后不并行改这些文件。遇到其他线程的修改保留并从最新字节合并。

新证据统一放 `results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/`，简称 **AQ root**。在 AQ0 建立一个 status.json 和简短 journal.jsonl；只保存必要输入、实际请求/响应、事件、评价与可重放摘要，不增加多层冻结或逐阶段长报告。

实施位置校准：实际adapter为`src/adapters/bare-agent.ts`，相关测试为`bare-authorization.test.ts`，不另建adapter。AQ8 compare分别记录policy/premise/source/strategy变化及机械索引适用性；为保持当前任务来源明确，不自动复用旧语义slice，变化任务fresh分析，未主张政策单独重算带来成本节省。sourceBound/checked只证明引用与运行合同，语义提取仍独立评价。

AQ11实际协议发现：初始真实request把ControlRule key等ZodEffects字符串转换成object，unknown record值及null也误为object；已有fallback无法修复错误的模型Schema。字段捕获测试已确认红灯。为保留同一首轮实现，48原登记仍绑定`3d4ba681`，不在运行中混入补丁；一次共享修订仅在primary关闭后实施。语义评分前已固定四项目病例OWUI ingestion、Paperless notes、Gitea self-query、Memos remove的M-E/D-E各一对，共8行，记录在AQ root/shared-revision.json。修订不改任务、source、原失败或旧答案，不给缺陷面板建立机制语义收益主张；native使用手写opaque参数Schema不受这次转换缺陷直接影响，不额外重抽native。

## 3. 领域合同

### 3.1 用户输入与模型责任

用户仍提供自然任务、源码范围/revision，以及 conformance 模式所需的独立政策。当前实现行为、控制路径、决定性 helper 和期望实际答案由运行过程发现。原始 skill 正文仍通过现有 loader 加载。

区分四种来源：用户明确前提、原始源码观测、模型提出的语义解释、宿主确定性推导。规则必须携带原行号/证据 ID；引用有效仅标为 `sourceBound`，提取的语义支持仍须独立评价。policy 与 source 使用不同命名空间，源码实现不能反向生成规范要求。

完整 inquiry 可以直接编译；自然 brief 可沿用作者步骤。不要新增一套必填的人工中间表，也不要要求用户先写控制图。未知可选结构只影响相关问题；一个局部缺口不使全部任务作废。

### 3.2 小型授权控制表示

新增运行期版本化 sidecar `authorization-control-slice/v1`，不改写旧 inquiry/result/v1 的含义。只表达授权任务需要的内容：入口、主体绑定、资源绑定、guard、拒绝/继续/受保护效果、局部依赖和条件例外。稳定 ID 由宿主补齐，模型保留可读局部 key。禁止任意代码、eval、通用脚本或任意工具名进入表达式。

以下为纯函数的语义边界；实施可用 Zod 推导类型，但须保持行为：

```ts
type Truth = "true" | "false" | "unknown"
type Scalar = string | number | boolean | null
type Value = { literal: Scalar } | { binding: string }
type Predicate =
  | { op: "eq" | "neq"; left: Value; right: Value }
  | { op: "is-null"; value: Value }
  | { op: "all" | "any"; args: Predicate[] }
  | { op: "not"; arg: Predicate }
type PartialPredicate = { truth: Truth; residual: Predicate | null; missingBindings: string[] }
// binding 未提供与明确 null 不同；不能对字符串形式的自然语言直接执行求值。
// partialEvaluate(predicate, knownBindings) -> PartialPredicate
```

绑定类型区分 principal、resource、permission、configuration 和值；同名字符串不自动表示同一对象。guard 必须注明控制哪个主体/资源、在哪条路径及哪个 effect 之前适用。模型提议的调用/控制边要保存出处和核验级别；词法匹配只提供位置线索，不证明控制有效。

首版每问题最多 64 个局部节点、16 个活动分支；达到界限返回具体 residual/gap，不静默丢分支。规则内容可以逐轮修订；同一来源相矛盾时生成 conflict，禁止最后写入者默默覆盖。

### 3.3 真正的取证调度

状态至少包含 `pending / located / read / proposed / checked / inapplicable / external-unknown / blocked`。`checked` 表示运行合同与推导检查通过，另保留 semanticSupport。

调度器使用当前问题、已读代码、模型提议的局部依赖和明确前提：优先处理影响当前可达路径的主体/资源绑定与控制依赖，再处理决定性 effect 或例外。不得维护仓库名→正确 helper 的表。

每次选择产生 actionOrigin、questionId、dependencyId、选择理由和预算消耗。唯一可定位的范围内依赖可直接执行现有 source 工具；歧义交给模型在已有候选中消歧；缺失/范围外/外部部署事实明确分开。每轮至多自动执行两个 source 动作，先使用现有符号索引和读窗口；所有实际读取计入共同工具及字节预算。

只有活动路径需要的依赖进入队列。已证据绑定的无条件拒绝可结束对应路径；被当前明确前提排除的分支标为 inapplicable。搜索未命中不能自动证明“不存在权限检查”。动态分派、反射、未知外部中间件保留局部缺口，不尝试运行目标。

### 3.4 分支与结论

部分求值必须实现短路逻辑，例如 `true OR unknown = true`、`false AND unknown = false`；`NOT unknown = unknown`。明确 `owner=null` 后排除 owner 非空路径；未给 owner 时保留相关条件，不把未知替换成 false/null。

branch 的结果来自已接受局部规则及其上下文。不能凭一个 guard 或一个引用，就认定整个入口路径闭合。拒绝与 effect 的先后、对象绑定、适用前提及所有相关可行路径共同决定可以合成的结论；未分析部分继续带 gap。

结论检查至少覆盖：

- 控制对象与实际受保护对象的关联缺失或错配。
- 当前前提已排除的分支仍被当作当前问题答案。
- 同一可行路径出现冲突结果；已经短路拒绝后仍要求无关深层依赖。
- 提取模型写 allow，解释/规则却只有决定性 reject；行为与政策对照混写。
- 仍有范围内可补决定性依赖却声称完整，或把无需部署事实的问题过度写成 unknown。
- 用引用存在、helper 名称或 policy 文本本身替代源码推断。

宿主只对可形式化部分给一致性结论。自由文本与原始模型判断保留；发现矛盾将具体诊断交给既有一次修复，不静默删掉错误文字刷分。自然语言政策先由模型映射为带政策原文定位的候选规则；映射不完整时政策结论保留 undetermined，行为部分仍可交付。不得强制把任意政策解析成布尔表达式。

### 3.5 两种入口与兼容

普通入口使用 `authorization inquiry ... --strategy=domain-evidence-v1`，省略保持 `legacy`；method 仍为 M/D0/D1，表示与执行策略是两个轴。native 使用 `--authorization-strategy=domain-evidence-v1` 并保留现有显式 domain-tools 选择。非法组合在 provider 前具名诊断；不要新增一套顶层 CLI。

两入口共用同一状态机、求值器和检查器。可为 StepSchema/authorization_observe 增加策略专用的局部规则 delta，旧 observation 和旧输入继续有效。模型无需反复重写全部控制图；宿主返回紧凑 delta、活动缺口和剩余预算。

native 继续使用 AP 总24、探索22、最终check2，compile/observe/reference 均按已有语义计数。inquiry-run 的24源码动作与12真实 provider dispatch 分别计数，调度器补读计入前者，作者/提取/fallback/修复计入后者。纯函数计算记录次数与耗时，不伪装成模型调用。实验中各臂使用相同对应预算，不开隐藏评判模型或额外检查轮。

## 4. 研究依据及采用方式

- [RepoAudit](https://arxiv.org/html/2501.18160v1)：采用按需、局部函数分析与依赖记忆的组织方式。它研究的漏洞及验证方法与本项目不同，本轮只借鉴调度和分层核验思路。
- [IRIS](https://arxiv.org/html/2405.17238v3)：借鉴“模型补语义规格、程序负责可执行分析”的分工，并单独评价规格提取质量。本轮不安装整套 CodeQL 或搬用其效果数字。
- [OPA partial evaluation](https://www.openpolicyagent.org/docs/filtering/fragment)：借鉴已知值代入、未知值保留 residual 的语义。采用小型 TypeScript 条件代数，暂不增加 OPA 服务依赖。

上述资料支撑设计选择；本项目的实际效果由下面同预算实验判断。阅读与开发问题继续写入同一研究总文档 §7.35。

## 5. 实现队列 AQ0–AQ9

每个实现单元先写有业务含义的失败测试，再实现、跑相关测试和提交；完成一组行为再提交，无需为每个小函数创建提交。以下新文件均与现有 authorization 模块相邻，最终名字调整在本任务书记录。

### AQ0：恢复、范围与基线

**Files:** 本任务书、AQ root/status.json、journal.jsonl。

- [ ] 记录实际分支/HEAD/工作树；核对 AP 已包含，不再重跑全部历史审计。
- [ ] 按本任务书建立 AQ0–AQ16 状态；质量与工程分别有状态，不能用测试通过替代真实使用。
- [ ] 记录开发模型/effort 和可确认速度。检查已配置 provider 的本地路线，不发连通性付费探针、不输出密钥。

### AQ1：固定真实缺口与可执行语义

**Read:** AO manifest/evaluation-summary、相关源码与上述三个来源。
**Write:** 研究 §7.35 的方法细节；AQ root/mechanism-cases.json。

- [ ] 将 OWUI 输入/输出对象、Paperless owner/null-owner、Gitea 上游权限、Memos self/admin/政策变化各列一条因果链：旧遗漏→新机制→可观察变化。
- [ ] 区分可读未读、语义提取错误、分支适用性、政策对照错误、AP协议失败；不要把它们合成一个“失败率”。
- [ ] 所有实际分支答案只放 evaluator 材料。生成材料只留自然任务、独立政策、同一原始源码权限。

### AQ2：局部控制合同与来源

**Create:** `src/task-dsl/authorization/control-slice.ts`、`control-slice.test.ts`。
**Reuse:** inquiry types、evidence ID/context。

- [ ] 失败测试覆盖跨问题证据、未读引用、policy 冒充 source、null 与 missing、引用同名不同对象、冲突 delta、未知版本和超限节点。
- [ ] 实现 schema、稳定局部 ID、增量合并与 sourceBound/semanticSupport 分列。重复相同 delta 幂等，语义冲突返回诊断，不吞原提议。
- [ ] 领域合同只要求实际适用的关系；不存在角色/owner 字段的任务可以通过其余关系分析。

### AQ3：依赖状态与有界位置解析

**Create:** `src/benchmarks/authorization-dsl/inquiry-domain-scheduler.ts`、对应测试。
**Reuse/Modify:** `inquiry-tools.ts` 的既有定位与 execute 接口。

- [ ] 失败测试：helper 候选从已读调用处产生；唯一位置可读；同名两函数必须消歧；跨范围/循环/源码变化停止对应依赖；改仓库名/路径前缀不改变策略。
- [ ] 维护稳定优先队列、去重与路径条件，缓存以 source identity、文件版本、单元位置及当前任务依赖为键；不能用上轮模型答案作新任务事实。
- [ ] 使用现有 Python/Go 等符号定位能力；必要的语法支持放通用定位模块。位置不确定时保持候选，不为个别仓库写路径成功分支。

### AQ4：模型提取与实际调度接线

**Modify:** `inquiry-run.ts`、`inquiry-native.ts`；scheduler。
**Test:** 两入口对应测试与 scheduler 测试。

- [ ] 在一次既有分析响应内允许模型提议局部规则/依赖；宿主校验后选择真实补读，随后把新证据交回模型。不要为每个节点新开模型请求。
- [ ] mock 复现：模型只读入口并报告一个决定性 helper，宿主在同一会话实际读取该 helper；追踪记录有 scheduler origin 和明确因果理由。
- [ ] 测试自动读取占用同一个24动作预算、native保留2次check、无剩余额度不补发；失败读和拒绝分别留账。

### AQ5：有限条件代数与部分求值

**Create:** `src/task-dsl/authorization/control-evaluation.ts`、对应测试。

- [ ] 先测完整三值真值表与引用绑定：所有 all/any/not 组合、eq/neq、null/missing、不同 scalar 类型，嵌套表达式受深度/节点上限约束。
- [ ] 实现 `partialEvaluate`，返回 truth/residual/missingBindings；不借助模型、目标代码执行或 JavaScript eval。
- [ ] 具体业务反例：owner明确null时owner非空分支inapplicable；unknown grant在明确早拒绝之后无关；资源A检查不能移作资源B授权；政策改变不改变源码behavior。
- [ ] 保存原式和推导轨迹。未知表达式、不支持的谓词保留残余，不默认为 false。

### AQ6：路径处理与结论一致性

**Create:** `src/task-dsl/authorization/control-conclusion.ts`、对应测试。
**Modify:** `inquiry-result.ts` 的可选策略检查组合。

- [ ] 先写至少六个反例：错资源；allow/reject冲突；错误保留owner分支；早拒绝后虚构缺口；未读可补helper却完整；behavior=allow与独立deny policy比较混淆。
- [ ] 从控制slice和前提求活动路径及结果；使用显式顺序/边绑定，不按数组排列猜源码执行顺序。
- [ ] 分列 `structureValid / sourceBound / ruleConsistency / semanticSupport / taskResolution`。同一检查器不会把自生规则标为语义已证；原始模型结果和宿主诊断并存。
- [ ] 结论差异只进入一次既有修复；修复后仍不一致则部分交付并给局部缺口。保留首答和最终答案，不静默改写错误解释。

### AQ7：普通入口、native 和生命周期

**Modify:** `inquiry-local.ts`、`src/cli/authorization-inquiry.ts`、`src/adapters/bare-authorization.ts` 及其参数注册位置；对应测试。

- [ ] 增加显式 strategy 选项，check/inspect/compare 看得见实际策略、控制状态、来源与失败。零调用check可验证配置，无法预判真实源码答案。
- [ ] 同一输入经普通与native进入相同纯模块；测试 legacy 原输出兼容、新开关错误值、missing policy、规则修订后旧成功失效、会话关闭后无续发。
- [ ] 保存 scheduler、rule delta、partial evaluation 和 check 的紧凑轨迹。保留全部实际provider请求计量，不在context中重复附加整份旧ledger/原始失败响应。

### AQ8：任务修改、复用与可读包

**Modify:** `examples/authorization-assessment/reusable-skill/`、inquiry edit/compare 的策略依赖；相关测试。

- [ ] 同包支持自然brief；变更policy只重算政策相关解释，变更前提使分支/结论需复查，source变化使提取的控制规则失效。
- [ ] 可复用未变源的机械索引/字节缓存；语义解释复用要保留依赖与缺口并重新检查。新任务不偷用旧答案或evaluator。
- [ ] 包内说明简洁列用户输入、程序负责的步骤、仍由模型分析的部分。旧源skill正文和其余审查职责保留。
- [ ] 编写四种确定性变化用例：policy-only、owner-premise-only、源码早拒绝、符号/路径重命名；原任务可读、变化可追踪。

### AQ9：联合反例与零调用预检

**Tests:** 新纯模块、inquiry-run/native/local、adapter/CLI、structured provider。

- [ ] 用中性的synthetic源码跑完整“读入口→调度helper→提取规则→分支求值→结果检查→一次修复”，逐步断言真实执行，而非只检查工具注册。
- [ ] 用相同fixture证明关闭scheduler或分支检查时相应反例复现；这些是机制测试，不记作真实质量分。
- [ ] 两source skill的loader/reference/只读工具零调用接线预检；模型配置本地路由、相对路径搬移、源码/oracle隔离同时确认。
- [ ] 若本轮还停留在字段/提示，没有实际host补读与纯函数分支推导，继续修实现，不能提前进入大面板。

## 6. 真实验证 AQ10–AQ13

### AQ10：一次登记清楚分母与比较

**Create:** AQ root/manifest.json、study.ts、evaluate.ts，优先复用 AO 的生命周期/评价组件，不编辑 AO 原件。

主面板固定 AO 原8任务：`memos-share`、`paperless-download`、`owui-ingestion`、`gitea-self-query`、`memos-remove`、`paperless-notes`、`paperless-share-create`、`gitea-create-issue`。四个项目、原ref、原始allowed source范围及自然brief保持；它们都是已暴露development输入，按机制选取而非按新成绩筛选。

| 臂 | 用户任务组织 | 执行策略 | 用途 |
|---|---|---|---|
| M-L | 现有自然Markdown路线 | AP后legacy | 共同运行器基线 |
| D-L | 现有D1声明路线 | AP后legacy | 现有DSL基线 |
| M-E | 相同自然任务 | domain-evidence-v1 | 查看领域执行是否也帮助Markdown |
| D-E | 相同D1声明路线 | domain-evidence-v1 | 查看完整领域路线的收益与负担 |

M-E可接收运行期局部规则提议，但不先塞入预编完整目标DSL；D臂自然作者成本照常记录。四臂共同源权限、可见规范事实、模型、输出质量要求、最多一次交付修复与预算。比较的是路线/运行支持；如果 M-E 与 D-E 同获益，归因为领域执行，不能归为 JSON 语法优势。

- [ ] 8任务×4臂=32主session；预先指定 `owui-ingestion` 和 `paperless-notes` 各重复一次四臂=8，独立标记重复，共40质量session。
- [ ] 两机制病例 `owui-ingestion`、`paperless-notes` 各加D-E“关闭自动调度”和“关闭部分求值/结论一致性”两个消融session，共4。其余条件及可见通用领域指导保持，基础结构/引用检查不关闭。
- [ ] 两真实源skill的普通native使用共4session，见AQ13。正常总量48session，作者/提取/fallback均记录实际请求数；正常新增作者大面板为0。
- [ ] per-call300s、session1200s、最多12实际provider dispatch、24工具动作、256KiB累计target-source展示；索引512文件/8MiB。native继续22+2。所有字段与实际实现一致，未支持的参数先接通再运行。
- [ ] 轮换臂顺序，重复块反序；最多2个真实session并发，独立运行目录。所有提取/作者/fallback/修复计入总调用，模型设置及provider实际返回单列。
- [ ] 一份manifest记录实现commit与各输入身份即可；模型可读根不含旧答案、review/oracle、expected分支或手填helper清单。原manifest里的metadata与模型材料分开。
- [ ] rubric按任务决策、必要控制、分支适用性、对象绑定、合理未知、证据支持评价。不要用DSL字段数量、术语一致或路径全文穷举加分。

### AQ11：真实生成与恢复

- [ ] 从48个登记单元推进；四臂由当前同一实现执行，不用旧AO响应拼对照。原始首答、终答、提取图、宿主动作及失败全部保留。
- [ ] 已派发未知完成不自动重发；明确未派发的配置故障可以修配置后恢复同单元并保留尝试。连续两次基础设施失败时停止新增付费派发，继续离线实现/评价/文档，不重复探针。
- [ ] 首轮结果全部封存后才做语义评价；运行器不能读取evaluator-only材料。开发者已见旧案例的暴露状态如实标注。
- [ ] 如暴露共享实现缺陷，先用确定性测试证实，允许一次共享修订，最多预登记4对受影响session（8行），单列revision。低质量、模型遗漏或未赢本身不构成重抽理由。

### AQ12：独立评价与机制归因

- [ ] 用匿名packet分别评价原始提取与最终答案，隐藏arm/成本/目标成绩；评阅者读原源码和独立rubric。表示可能被猜出，如实说明。
- [ ] 错误按“未定位/未读、提取错误、规则表达不足、调度优先级、前提/分支、政策对照、结论检查漏检、协议/基础设施”归因，允许多因；逐项给出处，避免只给full总数。
- [ ] 报告40质量session首答/终答完整、决定性错误、过度unknown、false-complete；重复块、4消融、4native分列，不拼成一个成功率。
- [ ] 统计实际调度补读、决定性依赖命中、无效/重复读取、被排除/保留分支、checker检出及误拒，连同完整tokens/缓存/调用/墙钟/实际USD。未知不补0，不估算真人分钟。
- [ ] 用结果决定哪些机制保留、哪项仍缺提取能力。即使负向也完成工程说明和复盘，不扩大样本寻求positive。

### AQ13：原skill真实使用与变化

使用AO已归档的 Cloudflare `security-audit` 和 GitHub `security-review` 两来源正文与直接引用，固定ref，分别接 Paperless notes 与 Memos remove 的授权职责。完整原文保留，补充工具说明的改动单列。

- [ ] Cloudflare包：原任务与“owner明确null”的变化任务各1次；GitHub包：原规范与AO已登记policy/v2变化各1次，共4次普通native消费。
- [ ] 复用现有loader/普通run，实际出现compile/局部规则提议、scheduler源码补读、条件处理和check记录；某项因任务本就不适用时给出运行理由。
- [ ] 两包共用同一执行实现；不手改生成的控制规则或最终答案。记录原文加载、程序实际调用、保留职责和效果。
- [ ] 这些运行评价使用与变化响应，不声称真人作者时间节省。普通包必须从任务文本出发，不能依赖研究runner读取oracle或先写答案。

## 7. 收口 AQ14–AQ16

### AQ14：普通示例与唯一研究正文

- [ ] 更新 `docs/usage.md`、`docs/skill-ir/developer-guide.md` 与已有reusable-skill示例；给零调用check、真实run、inspect、edit/compare的实际可运行命令。
- [ ] 在 §7.35 记录“问题→原因→共享实现→确定性验证→真实结果→剩余缺口”，尤其说明规则提取错误是否被后续程序放大。
- [ ] 当前状态、spec §14.34、执行计划和任务书同步最终行为。没有真实数据时保持未测，不用设计文字替代运行证据。

### AQ15：有限验证与一次独立复核

执行以下确定性命令；PATH无Bun时用既有 `C:/Users/14182/AppData/Roaming/npm/node_modules/bun/bin/bun.exe`。新增模块测试位于同一目录，自动进入所选suite：

```powershell
bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl ./src/adapters/bare-authorization.test.ts ./src/cli/authorization-ao.test.ts ./src/providers/structured.test.ts ./test/providers/structured.test.ts ./test/providers/structured-error-propagation.test.ts
bun run typecheck
bun ./results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/study.ts replay
bun ./results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/evaluate.ts replay
python -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py
git diff --check
```

- [ ] 相关测试、typecheck、新证据零调用replay、文档检查各做一次。修复具体失败后只重跑受影响检查，不重复历史全量审计。
- [ ] 独立只读复核一次，重点看oracle泄漏、前提/源码来源、scheduler实际执行、规则求值错误和预算；主线程沿具体行号处理，不盲从概括性建议。
- [ ] 确认AO/AP历史结果未改，本轮暂存路径归属和凭据检查通过。无需再创建一套clean-archive哈希体系。

### AQ16：提交、发布和结束

- [ ] 精确提交本轮文件，推用户origin/skill-ir-aot并核对远端；不触碰upstream，不清理历史未跟踪文件。
- [ ] 追加外层 conversation_log、handoff、communication 的短交接；真实结果与恢复入口放仓内现有文档。
- [ ] 最终报告提供：三个程序机制是否在普通入口实际工作、四臂与消融效果、失败原因、调用/费用未知、SHA与工作区状态。
- [ ] 工程完成须有三个机制及普通使用的执行证据；质量主张依据实际实验单列positive/mixed/negative/not-established。外部故障导致研究未完时如实记partial，不把所有checkbox勾满。
- [ ] 所有本轮任务终结后停止；不等待、不重复模型调用凑时长，不自动追加新项目或研究identity。

## 8. 验收重点

1. 调度器至少在通用测试及真实任务中实际选择并执行源码补读，轨迹能解释为何读取。
2. 分支引擎对明确前提、unknown、短路与对象绑定产生可复算结果，错误提取与数学求值分账。
3. 结论检查能发现具体矛盾，且保留原始错误和修订记录；不把结构校验当作源码真实性证明。
4. 自然任务和原skill经现有SkVM入口工作，同类任务共用代码，无项目/skill名成功分支。
5. 新旧运行器对照均含AP修复；模型没有预先收到答案或按答案整理的控制路径。
6. 实际收益与代价逐项清楚，旧结果、默认、保护输入和readiness保持；一次有限验证后发布。
