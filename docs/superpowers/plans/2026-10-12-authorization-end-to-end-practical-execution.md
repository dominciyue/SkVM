# BG0–BG16：真实任务 DSL 全流程运行、渐进执行与可读结果

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan. Production changes use test-driven development. One main developer owns implementation, shared documents and Git; read-only scouts follow AGENTS. Continue across routine checkpoints without asking again.

**Goal:** 在同一个真实 Paperless Download 任务上交付可编写、可执行、可查看过程、可修改后重跑的 DSL；首先从普通入口完成一次有实质结果的全流程，再改进自动编写和使用效果。

**Architecture:** 复用 SkVM inquiry、完整原 skill、来源索引、现有可执行合同、有限求值与账号会话。将运行准入和结论可信程度分开：有效片段执行，相关缺口按依赖传播，模型解释未支持环节；活动程序与草稿分离，逐步轨迹由运行时生成。围绕资源选择、回退、权限对象和返回对象补领域能力，不扩通用 Python 解释器，不另造 CLI 平台。

**Tech Stack:** TypeScript、Bun、Zod、现有源码工具/有限求值器/官方账号 adapter。开发 **gpt-6-astra/high**，实验使用已授权官方账号 **gpt-5.6-sol/high**。

状态：`completed-with-unmet-criteria / BG0–BG15实质交付，BG16发布收尾`。规划基线 `ff37395b119dd85030c61ea38d4a6f98d1fd5be7`；实际从规划提交 `4a247638` 的干净skill-ir-aot接管。7归档/5模型交付/2推理前CLI版本拒绝，无活动或未知请求；各轴见本轮summary/status/accounting/review/comparison。勾选表示该项工作已处置，不表示自动编写或收益获胜。

实际验收：25步Download、10离线变体、普通完整skill消费和单事实变化成立，程序SHA保持且变化实际采用1份材料；源码副本曾暴露helper footprint遗漏，已补sources[]并红绿验证。同期DSL四问full，首件及Markdown为P/F/F/F；自动稿3源但0资源步骤/0采用，完整自动化未达。1918通过/1平台skip/12792断言及主/研究类型通过。可用入口为examples/authorization-assessment/download-workflow/run.ps1；过程在普通session/execution.md。来源依赖修复在账号运行后，只以零模型确认，旧账号原件不回填。重复上下文token优化和一般收益仍未达，不通过增加模型样本追求获胜。

Identity：`authorization-practical-execution-v1`。结果集中 `results/skill-ir/skill-dsl-research/development/authorization-practical-execution-v1/`；临时运行集中 `D:/skill优化/project-maintenance/runs/authorization-practical-execution-v1/`。继续 `skill-ir-aot`，只推用户 `origin`，不开分支/worktree。

## 一、用户这轮真正要看到什么

用户已明确授权放宽阻挡运行的完整性和交互限制，首要目标是跑通一次全流程。按以下优先级投入：

1. **真实任务跑起来。** 普通入口加载完整原 skill、原任务、允许源码和一份 DSL，实际执行有意义的对象/条件/调用关系，输出结果。
2. **过程看得清。** 用户能看到程序内容、当前输入、每一步取值/分支/采用依据、模型参与处和剩余问题。
3. **同程序能改输入再跑。** 原输入、拒绝场景、缺失事实及相关源码变化有可解释差异，消费不能悄悄换程序。
4. **自动编写和效果再补强。** 用同一个任务检验模型编写；工程可用不以自动编写成功、整题 full、R2 认证或对照获胜为启动条件。

这里执行的是授权分析 DSL。Paperless 源码作为只读分析对象，不启动真实服务器、不读用户业务数据库、不调用真实下载接口。场景事实为显式的开发输入，真实源码决定分析规则。要分别报告“场景下程序计算”“开放事实下的条件结论”和“实际部署事实未知”。

首次全流程的目标是有可检查的实际判断，例如请求对象、被检查对象与返回对象的关系、拒绝分支是否到达返回、条件变化后的对象选择。命令退出成功、文件被加载、纯自然回答或全部 unknown 只能说明各自走到了哪里，不能填作这个核心交付。

## 二、已经核实的起点

- BF 的 `visibility-program-v2.json` 确实运行了 `restrict_queryset_to_visible → user_is_unrestricted`：显式 null 下 10 节点、2 次实际采用、局部调用不可达。这个 helper 不承担原 Download 主链；不能继续用它替换本轮主任务。
- BF 的自动稿针对完整 Download，而成功的作者稿针对上述 helper，二者任务不一致。本轮 A/B/C 必须使用同一个 Download 任务和相同 DSL 目标范围。
- 自动首件没有声明；两修订各两份声明都形状无效。最终实际账号工具已展示正确合同，仍有双层 union、嵌套字段和宽 source owner 摩擦。`authorization_check_properties({})` 本来就是合法输入，不得误修它。
- BF change/fresh 把双函数 v2 换成 root-only v3；previous 保留 v2，另一个无效请求草稿设置全局 `$contract`，使已有合同显示 invalidated。新阶段须区分消费、提出草稿与替换活动程序。
- 自然回答的集中缺口是 root 查询失败后回到 request doc，以及不同调用的 `include_deleted` 参数混用。评阅也曾误判，必须逐次实参核查。
- 现有跨源 resolver、实际调用实例和三值检查已经存在。不要再次以“缺跨函数 resolver”为理由重造。

### 必读上下文

主开发者亲读基础文档与将修改的代码，不通读全部历史归档。

1. 根/仓库 `AGENTS.md`、[current-status](../../skill-ir/current-status.md)、本任务书全文。
2. [spec §14.46](../../skill-ir/skill-ir-aot-optimization-spec.md#1446-bg-practical-end-to-end-execution)；§14.45 只用于现有接口与 BF 边界。
3. [统一研究正文](../../skill-ir/skill-dsl-research.md) §1、§2、§7.67、§7.68、§11。
4. BF `summary.json`、`verification/acceptance-matrix.json`、`authoring/development-program-v4.json`、`authoring/boolean-formal-check.json`；visibility-v2 用作回归，不作本轮主验收。
5. [usage](../../usage.md) 的 inquiry/account 段、[developer-guide](../../skill-ir/developer-guide.md) 对应接点；根 handoff 最新 BG 节。

原任务和来源（均为仓库相对路径）：

- Inquiry：`results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/model/packages/download/inquiry.json`。
- 源码目录：同目录 `source/`，原 ref `126ec414a8b65158368653a2604ae58415e43103`，保留原允许来源范围。
- 完整 skill：`results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/SKILL.md` 及其原配套文件。
- 原四问保留：requested-document-and-returned-file、authorization-and-selection-order、alternate-version-authorized-resource、missing-facts-and-conditional-conclusions。
- 主源码先读 `source/src/documents/views.py` 的 `file_response`、`_resolve_request_and_root_doc`、`_get_effective_file_doc`、`_resolve_file_doc`、`serve_file`；版本与权限定义按实际引用跟进。

## 三、实现决定与放宽范围

### 3.1 一条主链，三个来源不同的程序轨道

| 轨道 | 程序含义的提供者 | 应完成的事情 |
|---|---|---|
| A：先做可用程序 | 开发者/开发代理阅读真实源码 | 写出并运行 Download 主链；允许人参与 DSL 设计和修订 |
| B：自动编写 | 隔离实验模型读取原 skill、原任务和原源码 | 通过薄前端生成同范围程序；不提供 A 的程序、含义表或标准答案 |
| C：普通消费 | 消费者获得注明来源的 A 或 B 程序 | 使用同一活动程序回答四问，变化后重算；可以读源码、提出草稿，但不暗中替换程序 |

A 的程序含有人或开发代理的源码理解，使用它是合法的产品用法。这个轨道的成功明确写“给定程序可运行”，自动编写和真人工时另计。B 失败时仍要完成 A/C。

### 3.2 从全局拒绝改成局部执行

实现显式的 `progressive` 运行策略，保留已有严格路径兼容性。局部规则缺失、尚未解释的 helper、额外非语义说明或未绑定的非关键片段，不清空整份程序。

具体处理：

- 可唯一确定的 source owner、引用范围、固定版本字段、默认空数组等由宿主补全；记录机械归一化，无须让用户填写 anchor/hash。
- JSON 形状或局部字段错，只返回相关片段诊断和可保留部分；不可恢复的顶层语法/来源范围错误明确拒绝该草稿。
- 无法解释的函数和动态框架保留具名缺口。与缺口无依赖的结论继续计算；受影响处交给模型作带引用解释，或输出条件分支/未知事实。
- 自然结果不再等待所有性质、完整框架、全部源码单元或 R2 通过。逐题输出程序结果、模型解释和未解内容。
- 调整节点、显示或工具预算若能解决已定位的运行截断，可在本轮直接做一次有理由的配置调整并记录前后值；不把增预算当共享语义缺陷的修复。

仍需保持的事实约束只有实质性的几类：允许来源边界；当前源码身份及失效；主体现身/对象对应不凭空等同；未解不能转为已授权；目标源码只读；旧证据和未知请求原样保留。检查应复用已有结果，不新增重复哈希链、人工批准仪式或全历史审计。

### 3.3 补领域关系，避开语言全集

优先用现有 v1 声明和求值器写主链。遇到数据库选择、结构返回值或回退不能表达时，允许增加薄的任务领域关系前端，并编译/连接现有 source material 与有限求值核心。

本轮允许的关系集中在：

- 资源来自请求、查找、关联字段或回退对象；
- 每次调用自己的参数、缺失/空值判断与选择条件；
- 检查的主体、权限和资源；失败返回与正常继续；
- 返回对象到下游文件表示/效果的关联；
- 具名外部前提和未解释的关系。

作者可为数据库/外部库调用给出带源码出处的有限摘要；未取得的运行时记录保持符号值。不要为此实现数据库、完整 Python 对象系统或更广语言语法。领域算子采用通用名称，生产逻辑不按 Paperless/函数名决定成功。第二个匿名改名/改条件例用于核对算子真的消费程序，不要求再启动新真实仓库。

场景输入可提供 URL/query、调用实参和明确标为开发样例的对象记录；不直接输入 `guardPassed`、最终 verdict、内部 call result 或“待证明关系成立”。权限具体值缺失时输出条件结果，不编造实际授权状态。若测试需要一个权限系统结果假设，必须把它作为具名外部前提显示，不能计成 DSL 推导的授权判断。

### 3.4 模型接手缺口的方式

运行时已有源码和缺口时，把“需要解释哪个原文关系、相关原文和当前上下文”交给同一会话的模型。它可以提交带引用的领域摘要或自然条件解释，宿主负责来源定位、可用部分编译和运行。

不得悄悄增加第二个模型调用通道；所有修复/转换在当前会话或明确的新尝试中计量。模型解释带来源与提供者身份，机械检查只检查已表达关系。模型散文不能被直接改成程序 checked；未编译部分仍可进入自然报告。

### 3.5 消费与编辑分开

在已有命令增加薄选项 `--program-mode=consume|edit`：导入持久程序时本轮默认 consume；无程序的自动编写走 author/edit 路径。另加 `--execution-policy=strict|progressive`，本轮显式 progressive，旧调用默认 strict。

- consume：活动程序保持，模型可以提出候选修改并查看其诊断，提案只入草稿区；不能删除 helper、改变 scope 或替换当前程序。
- edit：新草稿校验后以显式替换动作激活；旧程序保留版本，相关材料按现有所有权撤回。
- 拒绝新草稿：记录 draft diagnostics，不污染无关活动程序。若当前源码或输入已变，相关旧结论照常失效，不以“保留活动程序”沿用旧结论。

上述选项为**计划接口，当前尚未实现**。实际接口落地后同步 usage；不得在完成前标为现成命令。

## 四、文件责任与验收测试

以下路径相对 `D:/skill优化/SkVM`。新模块仅在现有模块容纳不清晰时创建；不得复制一套 study 专用成功解释器。

| 文件/组件 | 本轮责任 |
|---|---|
| `src/task-dsl/authorization/executable-contract.ts` 及测试 | 严格/渐进编译、独立可采用单元和带依赖缺口的返回；复用现有编译器 |
| `src/task-dsl/authorization/question-workflow.ts` 及测试 | 薄作者输入、机械定位归一化和清晰字段反馈 |
| `src/task-dsl/authorization/control-evaluation.ts`、`semantic-flow.ts`、`control-conclusion.ts` | 仅补主链所需有限关系/返回组合，复用既有三值求值和实际调用身份 |
| 如确需新增：`src/task-dsl/authorization/resource-relations.ts` 及测试 | 通用资源来源、选择、回退与关系声明；接入现有核心，不按仓库写分支 |
| `src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts` | 活动合同/草稿隔离、局部提交、当前输入重算及材料采用 |
| `question-workflow-wire.ts`、`inquiry-native.ts` | 单一清晰作者动作、缺口给模型、consume工具能力及实际发送记录 |
| `inquiry-local.ts`、`inquiry-reuse.ts`、`src/cli/authorization-inquiry.ts` | 薄选项、ordinary check/run/inspect/compare/previous、持久程序与重放 |
| 如确需新增：`src/task-dsl/authorization/execution-trace.ts` 及测试 | 从实际事件投影可读轨迹，不另算结论、不伪造执行 |
| `executable-contract-entrypoints.test.ts`、`question-workflow-entrypoints.test.ts`、`question-workflow-reuse.test.ts` | 文件/工具/账号mock同核，consume/edit、变化和局部失败公共链 |
| `examples/authorization-assessment/download-workflow/` | 主任务程序、相对路径输入、场景变体、可复制普通命令 |
| 本轮 results 目录 | 程序原稿/修订、实际输入和运行、独立评阅、简短状态与汇总；研究脚本仅包装公共入口 |

关键测试应测行为，不能只断言字段存在或固定答案文字：

| 红测 | 应有结果 |
|---|---|
| 合法根与 helper，加一个不相关无效声明 | progressive 保留可运行片段和精确缺口；strict 兼容原拒绝 |
| helper 决定返回资源却未解释 | 相关资源关系 unresolved；独立已计算分支仍输出 |
| 新草稿拒绝，活动程序和来源未变 | 活动程序仍可用，草稿诊断独立 |
| consume 中模型试图删 helper 或替换 scope | 活动程序不变，提案留档，继续消费 |
| 显式 edit 删除 helper | 相关材料退役，旧结论不再使用 |
| request lookup 带 true，另一个 selector 带 false | 两次实参不混同 |
| 根资源查找有值/空值 | 选择 root/request 对象不同，guard 和返回关系随实际选择重算 |
| 无 version / 空字符串 / 显式 version | 区分“存在”和“truthy”，分别走源码规定分支 |
| 同函数两调用点、错主体/对象、guard 后置 | 不因名字相同或附近存在 guard 得到错误关系 |
| 缺失运行事实 | 显示条件分支及所缺输入，不把它当 false/null |
| 程序/源码改变及单纯路径搬移 | 前两重算/失效，搬移保留同义身份；旧自然答案不恢复 |
| 自然说明与机器结果冲突 | 同时保留冲突及来源，不能拼成一个无条件成功 |

新增轨迹最小信息结构可采用以下契约；字段命名可以适配现有类型，但这些信息要可读取：

```ts
type ExecutionActor = "host" | "model" | "authored-program";
type StepOutcome = "computed" | "conditional" | "unresolved" | "rejected";
interface VisibleStep {
  sequence: number;
  operation: string;
  actor: ExecutionActor;
  source: Array<{ path: string; startLine: number; endLine: number }>;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  outcome: StepOutcome;
  gaps: string[];
}
```

`authored-program` 表示含义来源；实际执行者另在事件中体现。归档中不得将模型声明的句子当作 host 运行事件。已有 history/slice/materialUses/actualArguments 可映射时直接复用。

## 五、逐项工作

每项使用“红测 → 原因确认 → 共享实现 → 绿测 → 普通入口”的顺序。测试和类型错误当轮处理。预计约 8 小时有用工作量，首个普通全流程力争在前 2–3 小时取得；这是安排，不是等满时长或正向结果承诺。

### BG0 — 接管并锁定本轮实际范围

- [x] 检查当前分支、工作树和本计划提交；新线程独占本轮仓库写入，记录真实起点。
- [x] 在本轮 `status.json` 用 pending/null 登记运行、语义质量、自动编写、变化和收益，要求与结果分开。
- [x] 首先建立 A/B/C 同一任务的文件路径与 sourceRoot；保留原四问，不另选容易通过的 helper 充当主线。

### BG1 — 写真实主链程序初稿

- [x] 亲读 Download 入口、资源/版本选择与权限调用；在 `authoring/download-program-draft.json` 写第一份可读程序。
- [x] 从 file_response 主链描述请求对象 → root/回退 → 检查对象 → version/representation → 返回对象；摘要引用真实来源，未知值保持条件。
- [x] 通过现有普通 check 跑初稿，保存首个阻断及最小触发输入。每个不能表达的地方写为具体领域关系，不列成泛泛“补 Python”。
- [x] 将必要抽象细化记入 spec14.46；允许在本任务范围内直接调整，不回到用户处等待日常审批。

### BG2 — 先降低编写摩擦

- [x] 为 BF 的缺版本、合法多余说明、唯一函数引用以及含义错误分别写红测；机械可修与语义不可猜分开。
- [x] 基于当前索引给作者明确的 source 选择与最小语义模板；自动填固定 schema/身份/来源位置，不要求嵌套重复这些字段。
- [x] 模型一次面对一个明确动作形式，避免同一工具同时要求整程序/源声明的复杂 union；旧输入仍能读。具体工具形式与普通文件编译器共核。
- [x] 语义不合的字段给带位置的诊断，保留原稿与确定性归一化稿。泛化说明示例用不同语义的匿名例，不把本题答案写进工具提示。

### BG3 — 局部编译与缺口继续

- [x] 用不相关错声明和决定性 helper 缺失两个测试，复现当前 early-return 清空全合同。
- [x] progressive 按 question/source/实际依赖保留可用片段和对应诊断；相关未解关系保持条件/未知，不再以全局 diagnostics.length 阻断所有后续运行。
- [x] 必须区分无法启动的顶层错误与可继续的局部缺口；check/run 的结果和退出状态反映这个区别。
- [x] 给模型的当前上下文包含下一项必要含义、源码依据和已采用结果，不反复倾倒全部历史 Schema/图。

### BG4 — 补主链必需的领域关系执行

- [x] 用匿名资源选择/回退/授权/返回例写红测，支持空值、未知及两个独立调用实参。
- [x] 在现有 lowering/evaluator 能表达的部分直接复用；不能表达的有限关系用 §3.3 的领域摘要/算子接入同一普通核心。
- [x] 每个新增关系要回答“输入来自哪、此分支选了什么、检查哪一个对象、返回什么”；不能只增加一个解释文本字段。
- [x] 回到 BG1 的原程序修订并执行到主链结果。若仍遇到外部库语义，输出该点的带引用条件摘要并让其余步骤继续，不换成 visibility helper。

### BG5 — 固定消费程序并隔离草稿

- [x] 红测覆盖无效新合同污染已有 `$contract`、consume 中替换程序、显式 edit 删除 helper。
- [x] 接通 §3.5 两个薄选项；静态工具、宿主处理和会话恢复三处一致，消费模式不是仅加一句提示。
- [x] 按当前程序/问题保存草稿诊断；真正 source 变化仍使相关结果失效，旧 invalidated 记录不改写。
- [x] 普通 fresh/previous 均保存初始与最终程序身份、尝试编辑记录和实际材料使用。

### BG6 — 让过程直接可看

- [x] 从真实 runtime 事件生成 `execution.json` 和简短 `execution.md`，放普通 session 中；可读轨迹的节点必须对应实际事件。
- [x] 现有 inspect 返回程序、输入、步骤、条件、结论和缺口的位置；终端摘要只列关键步骤，不建 HTML。
- [x] 将作者源码摘要、host 组合计算、模型临时解释分开标注。trace 能定位到源行和当前程序语句。
- [x] 追加一个故意冲突/缺证的轨迹测试，确保可读 renderer 不把 partial 美化为已验证。

### BG7 — 零模型先走主链和变体

- [x] 同一程序从 ordinary check 运行普通开发场景、拒绝场景、缺失事实场景及 root 回退场景；场景只描述输入，不输入正确结论。
- [x] 核对真实主链分支、对象对应与声明来源；程序实际生成有内容的结论/条件式，局部未知可保留。
- [x] 相同输入重放应得到相同 host 结果；改名/改条件的匿名例证明不是生产特例。
- [x] 本项形成可随时交给用户运行的最早版本，后续自动编写失败不得删除这个成果。

### BG8 — 尽早完成第一次官方账号全流程

- [x] 使用 A 当前程序、完整原 skill、Download 四问和共同允许源码，经普通 inquiry run 执行 `authored-base`；consume + progressive。
- [x] 模型处理其余源码解释和原四问，宿主实际运行 DSL；不得等待整题/全部性质认证才允许这次运行。
- [x] 检查普通 session 的程序、actual uses、逐步执行、自然 answer、缺口和计量是否齐备；可读 walkthrough 从此原件生成。
- [x] 首次失败当场确定是源码含义、局部编译、工具接线、输出还是通道；可复现共享缺陷先红绿，再同位置具名修订。不要先跑完整面板。

### BG9 — 自动编写同一个主任务

- [x] 隔离 `auto-author`：只给原任务、完整 skill、原源码与通用语法；不提供 A 程序、评阅和开发者整理的本题含义。
- [x] 模型生成文件/声明进入同一 compiler，宿主可做机械归一化和逐项提示；语义修订仍由模型读源完成。
- [x] 首稿、机械修复、模型修订、可运行范围和实际采用分别保存。作者流程不需要先通过 whole-task/full 才能保存可用程序。
- [x] 若自动编写仍失败，保留精确阻断并继续 A 的 C 使用；主开发者代改稿可另做 assisted 版本，明确不计自动成功。

### BG10 — 同程序变化与部分复用

- [x] `authored-change` 只改一个明确场景事实，程序保持；优先选择影响资源选择/回退的输入，而非直接改最终权限答案。
- [x] 缺事实与拒绝情形已有零模型测试，再进行必要的一次真实变化消费；结论应指出选择或条件发生了什么变化。
- [x] 另在源码副本改一个真实 guard/对象关系，运行 ordinary compare/check；旧受影响语义失效，无关材料保留。需要模型新解释时做具名 `source-change`，不改保护原件。
- [x] 使用 previous 时不等待 R2。当前有效 R0/R1 可以使用，保留 partial；旧自然答案和 verdict 不进入新模型输入。此轮所有变化有处理记录，无需全旧矩阵。

### BG11 — 小规模、同信息的效果检查

- [x] 优先比较给定程序的消费：把 A 中相同的源码含义渲染成 Markdown，作为 `matched-markdown` 输入，与 DSL 共享 task/source/模型/预算；不要拿加工过的 DSL 与无加工原任务宣称表示优势。
- [x] 若实现/提示在 `authored-base` 后改变，只为有价值的同版比较重跑对应 DSL 一次，旧原件保留。不追求固定多臂数量。
- [x] 对自动编写另报过程成本和原稿成功率，不将 A 的编写过程排除后声称自动节省。
- [x] 对照按逐题事实、错误、条件完整性、实际 reads/工具、输入含缓存/非缓存/输出、耗时分列；无 USD 则保持 unknown。

### BG12 — 独立核实主链与最终答案

- [x] 至少定点复核一条真实执行轨迹和整份原四问答案，回到原源码确认，允许答案跨段提供同一事实。
- [x] 检查 root 缺失回退、无/空/显式 version、每次调用自己的 include_deleted、权限对象与最终 file_doc、original/follow_formatting/存储等缺失事实到结论的映射。
- [x] 评阅材料与运行模型隔离；只读探子可核引用，主开发者负责裁决。AI 复核不记为真人分钟。
- [x] 将“程序确实执行”“实际判断正确到哪里”“原四问质量”“自动编写”“效果”分别填入结果，不再用一个布尔值藏掉已有可用部分。

### BG13 — 受影响验证与紧要优化

- [x] 聚焦测试、主类型和本轮研究脚本类型通过后，合并跑一次当前授权相关集；明确执行路径，禁止误跑全 src 后为保护锁修改历史。
- [x] 当前源码/程序/输入改动后只重跑受影响部分。历史104失败保留，本轮未诊断的不称已修。
- [ ] 重复发送上下文的进一步token优化未完成；本轮已分离工具动作、按需省略空sourceContext，但没有压缩获胜证据。保留为未达项，不再追加推理追求数值。实际比较与全部成本已记录。
- [x] 剩余时间优先补主链决策错误和易用性；不靠测试数、等待、反复审计或新增仓库凑时长。

### BG14 — 可搬移的用户交付

- [x] `examples/authorization-assessment/download-workflow/` 提供可读程序、输入变体、源码定位/相对路径及明确原 ref；保持原允许源码，可引用已有归档，搬移时提供确定性准备命令。
- [x] 一段命令能完成零模型执行与查看，一段命令能完成账号全流程；可加薄 PowerShell 包装自动建本次输出目录，不重复实现 CLI。
- [x] 实际运行所刊命令一次，并核对文档中的结果描述来自本轮普通 session。没有实现的 flag 不写进使用说明。
- [x] 交付首页先展示一个实际输入 → 程序 → 运行步骤 → 结论 → 变化的例子，再链接诊断；不以测试统计作为主要演示。

### BG15 — 结果归纳与当前文档

- [x] 结果目录保留 `summary.json`、`status.json`、`accounting.json` 和关键原件；复用会话已有身份，不搭一套平行自哈希账本。
- [x] 更新研究 §1/§7.68/§11、spec14.46、current-status、当前计划以及已有 usage/developer-guide；不新增长期组件正文。
- [x] 根 conversation_log/handoff/communication 同步可恢复命令、实际版本、已解决/未解与后续责任。
- [x] 区分 `pipelineComplete`、`meaningfulDslExecution`、`sourceSupportedResults`、`wholeTaskQuality`、`automaticAuthoring`、`benefit`。每个都有实际依据，不给预期填 true。

### BG16 — 发布与交接

- [x] 少量目的提交，暂存仅本轮内容；一次必要的文档/diff/凭据检查及新归档读回，推用户 origin/skill-ir-aot 并核远端 SHA。
- [x] 最终回答先给“直接怎样运行、打开哪里看过程、这次具体算出了什么”，再给未解问题和收益。
- [x] 8小时只作工作安排；有可推进工程继续，完成后不凑时长。外部通道阻断时完成离线实物，真实模型全流程标为未运行，不冒充实现完成即研究成功。

## 六、实际模型运行与失败处理

必要位置按顺序：`authored-base`、`auto-author`、`authored-change`、`source-change`（仅当新的源码解释确需模型）、`matched-markdown`（比较有信息时）。自动程序可用后可追加一次 `auto-consume`，其位置与作者给定程序分开。优先取得第一条可读普通全流程，再投入对照；不给一整套未运行矩阵制造准入死锁。

用户未设美元上限；本轮不将任意样本数/修订总数用作工程停工条件。每次追加实际调用必须服务一个具名问题，保存首次失败，修复后确认一次。相同原因连续两次无进展，停止相同提示重抽，转本地根因和接口修复；有新的确定性修复可以登记后验证。不要重跑无变化的成功会话。

默认复用64工具、768KiB显示、32MiB读取、45分钟会话。若已确认是这些工程上限截断有效工作，可调整相关项、立即保存已得结果并说明原因；配对比较使用相同条件，旧轮不同预算的原件只作历史观察。模型额度拒绝/auth失败暂停该通道；明确终态routing失败一次具名恢复，连续两次仍失败暂停外部派发。unknown先查原生命周期，不重发未知活动请求。无需额外付费健康探针或等待额度。

实验使用官方账号 `gpt-5.6-sol/high`，开发者使用 `gpt-6-astra/high`，两者不混记。第三方API仍暂停，OWUI仅离线；旧OWUI未知、保护源码/原件、held-out/Q1/prospective/readiness及历史0/6保持。恢复规则针对实际外部重复与费用风险，不阻断独立本地工作。

## 七、验证命令与交付判定

现有最小接点（先红后绿，新测试加入对应文件）：

```powershell
Set-Location 'D:/skill优化/SkVM'
bun test ./src/task-dsl/authorization/executable-contract.test.ts ./src/task-dsl/authorization/question-workflow.test.ts ./src/benchmarks/authorization-dsl/executable-contract-entrypoints.test.ts ./src/benchmarks/authorization-dsl/question-workflow-entrypoints.test.ts ./src/benchmarks/authorization-dsl/question-workflow-reuse.test.ts
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
git diff --check
```

新增模块有对应测试；类型完成后最后一次必要相关集为 `bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl ./src/adapters`，日志记该命令实际范围，不换成全仓测试。文档只检查当前更改与导航，使用现有 checker 的 retired/governance 配置；历史断链不靠删历史解决。

| 交付问题 | 本轮应给用户的实物 | 仍未满足时的表达 |
|---|---|---|
| DSL到底做了什么 | 主任务程序、输入、非空实际轨迹和有依据的对象/分支结果 | 精确到哪个关系/步骤没有执行，不只写partial |
| 全流程能否用 | ordinary run 的完整skill、原四问、程序执行和最终自然答案 | 外部通道/软件错误/未解语义分开；保留已得结果 |
| 放宽后是否可信 | 已计算/模型解释/条件式/未分析清楚分开，反例不产生错误许可 | 可运行但哪些结论未确认，直接列出 |
| 变化后是否仍有用 | 同程序原/变、源码失效、相关材料重算的真实记录 | 不同程序或epoch另列，不强行成对 |
| 模型能否写及有无收益 | 同任务自动稿与当前消费者、必要公平对照、全量可见成本 | 自动失败或效果取舍如实报告，不阻断已有可用程序交付 |

首要目标是把一条真实、有实质计算和结果的全流程交到用户手中。自动编写、全部源语义覆盖、跨任务泛化和稳定正向收益是各自的后续判断，本轮不再将它们捆为运行前置条件。
