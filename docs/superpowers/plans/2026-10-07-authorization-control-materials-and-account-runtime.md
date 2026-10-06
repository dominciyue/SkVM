# AW0–AW22：授权 DSL 控制语义、局部材料复用与账号实验实施任务书

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans, systematic-debugging, test-driven-development and verification-before-completion. 本任务书承接用户已确认的复核方向，用户要求派发新线程连续开发。日常源码、schema 和测试修复不等待常规确认。主线程亲自设计、实现和验收；default 只读探子按当前 AGENTS 的 fork_turns=none 和等待规则使用。

**Goal:** 让真实授权源码中的决定性控制与 helper 解释可以累积、连接、求值和恢复，形成完整原任务的可用交付；接入当前 ChatGPT/Codex 账号的 GPT-5.6 Sol，检验真实质量和材料复用效果。

**Architecture:** 复用 SkVM 的 source index、source skeleton、focus、semantic-flow、operation facts、inquiry/native、trace 和现有 CLI。增加有限控制语义、与操作绑定分离的源码材料，以及局部修复状态；账号通道复用同一领域工具核心。开发模型与被测模型、Codex harness 与 SkVM harness 分开记录。

**Tech Stack:** TypeScript、Bun、Zod、现有 tree-sitter WASM Python/Go 解析器；本机官方 Codex CLI/app-server。沿用已有运行入口，不另造网页、通用 IR、完整安全平台或第二套领域执行器。

日期：2026-10-07。状态：completed-with-unmet-criteria，适用离线队列已收束，finiteQueueComplete=true、researchGoalAchieved=false。开发模型gpt-6.1-sol/max；不声称Flash。继续D:/skill优化/SkVM的skill-ir-aot，只推用户origin，不新建分支/worktree。生产基线853795491c78ccf24a2387bb4ea5b65ea0ebf44a，接管HEAD486b5969864e34cf82d770435b58f024e76771ca。有限控制、独立材料/调用投影/选择性恢复、局部修复进度及账号mock双入口已验证；当前官方排他工具清单未验证，24逻辑真实位置未派发。最终结果见[AW summary](../../../results/skill-ir/skill-dsl-research/development/authorization-control-materials-v1/summary.json)。已勾选项表示当前证据支持的工程/核验动作，未派发的实际验收保留未勾选和下述处置，不以位置状态代替研究达标。

本轮是连续开发队列，预留约 8–12 小时主动工作；完成适用工作就交付，不用等待、重复全量验证或增加无目的调用凑时间。约六成投入质量、四成投入编写和复用，这只是开发精力安排。

## 一、接管上下文和授权范围

主开发者本人阅读：

1. D:/skill优化/AGENTS.md、仓库 AGENTS.md、[current-status](../../skill-ir/current-status.md)、本任务书和[当前计划](../../skill-ir/skill-ir-aot-optimization-plan.md)。
2. [研究总文档](../../skill-ir/skill-dsl-research.md) §7.55–§7.56；[spec](../../skill-ir/skill-ir-aot-optimization-spec.md) §14.35–§14.36。其他历史只在当前责任需要时点验。
3. [开发指南](../../skill-ir/developer-guide.md)的 source-assisted、operation/reuse、native、telemetry 部分，以及[使用说明](../../usage.md)。
4. AV [summary](../../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/summary.json)、[Download 当前评价](../../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/evaluations/av10-module-instances-final.json)、[OWUI 当前评价](../../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/evaluations/av11-module-instances-wire-final.json)、[材料变化准备](../../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/verification/av14-v4-input-registration.json)。
5. 原 skill/源码/输入的精确位置由 AV manifest 和实际报告取得；原答案、评价和本任务书中的诊断仅供开发者/evaluator 使用，不进入被测模型上下文。

付费接口延续上轮暂停：不使用 xty 或新保存的第三方端点，不切回 API key 付费通道。用户已明确回复“允许使用当前账号做实验”。账号实验按第六节准备；官方通道核验通过后可连续执行，不再重复请求授权。不要把模型目录出现某模型当作已完成推理验收。登录/额度/工具接口不可用时，保留原因并继续独立工程；不切账号、换模型、购买额度或反复请求。

AV 的 12 个旧位置继续保持原暂停记录；AW 使用新实验身份，旧位置不能改写为 AW 成功。不读取 held-out/Q1 reserve，不执行目标应用或业务 patch，不修改旧答案与失败件。

AW 开发线程启动后取得本轮共享代码、方法文档和 Git 的唯一写入责任；派发线程只读观察。保留其他线程修改。阶段记录写 D:/skill优化/conversation_log.md；研究问题、修复和结果继续追加唯一研究正文，不另建研究长文。

## 二、已定位的责任与本轮验收现象

| 现象 | 当前责任 | 本轮需要观察到的改变 |
|---|---|---|
| try/with/loop 内调用能定位却无法进入有限执行 | source-skeleton.ts:95；source-interpretation.ts:69/77；semantic-flow.ts 的 terminal/complete | 必要正常、异常、短路路径进入有来源的有限表示；不支持的局部结构只影响其依赖路径 |
| Download 接受 helper 但 facts 为零 | inquiry-domain-runtime.ts:80–92 先要求 accepted entry；operation-facts.ts:39 只投影 facts | helper 可先留存；绑定真实入口/调用后采用；入口未完成时也能准确报告现有材料 |
| previous 显示 reusable 但恢复零份 | inquiry-reuse.ts:95–124 | 分开 eligible、available、restored、used；空材料有明确原因，不静默回退 fresh |
| 22 次调用只接受一个单元，局修反复 | inquiry-focus、runtime.modelContext、native.beforeDispatch、agent history | 有效标注留存，只修当前缺项；跨轮实际 payload 的冗余减少，原文仍可按需读取 |
| 自然终答遗漏已有代码分支 | 任务义务、当前语义快照与原 skill 输出的连接 | 回答版本缺省/异常、对象绑定、owner/grant、实际效果；未知前提以条件分支交付 |
| 空 final/重复空观察曾误记完成 | AV 已修 generic loop 和归档分类 | 在生产过程及时转向诊断/最终交付，保持已修好的未完成分类 |
| 当前账号已登录但项目无 Codex 通道 | adapter registry、provider types、app-server bridge 缺失 | 官方账号入口能够真实调用同一领域工具，终态和费用计量不伪装为旧 API 请求 |

2026-10-07 派发前核验：本机 codex-cli 0.159.0-alpha.12.1；codex login status 为 Logged in using ChatGPT；app-server model/list 含 gpt-5.6-sol 和 gpt-6.1-sol。只查询元数据，推理调用为零。SkVM adapter registry 当前无 Codex；LLMProvider 不能凭改 model 名称取得账号登录能力。

## 三、设计合同

### 3.1 有限控制：按任务必要关系扩展，避免变成整门语言解释器

新行为显式使用 operation-evidence-v3；旧默认和 v2 入口保持兼容。复用现有核心，通过版本化能力选项启用，不复制整个 runtime。新增来源/材料格式只在确有数据形状变化时升级，旧证据用旧 schema 读取。

解析器负责实际执行顺序、条件跳转、try/handler/else/finally 的区域、调用实参及返回；模型负责授权含义、条件解释、主体/资源和效果关系。不得按仓库名、skill 名或函数名猜授权结论。

有限控制至少覆盖：

- try 正常路径、匹配异常路径、未匹配异常传播；else 仅在 try 正常结束时进入；finally 保留正常/return/raise 的先后关系及显式覆盖行为。
- raise 的异常类型和 authorization/operation failure 分开；异常类型未知时保留有范围的替代路径，不能把异常当普通返回或凭名字推断拒绝。
- and/or 的短路求值及实际返回值；RHS 仅在满足条件时发生，不能无条件补读/执行为语义效果。保留 Python 与 Go 语义区别。
- with 的 enter/body/exit 关系；未知 exit 的异常抑制行为明确留缺口。普通上下文管理器不能默认当成授权控制，也不能直接删掉。
- 对决定性 loop 先支持有明确有限集合或可核验局部摘要的形式；动态迭代保持循环条件、0 次/后续迭代/提前退出等实际相关分支，不伪造固定迭代数。纯上下文循环是否影响当前义务须有来源依赖依据。
- 不让一个函数中的无关 gap 把所有独立路径全局标成不完整；也不能只因模型说“不相关”就删掉影响授权结果的路径。

现有 SemanticStepSchema、Cursor、lowerSemanticFlow 和 source interpretation 需要共同调整。先用当前真实源码证明所需语法，再添加匿名相反例。保持路径数和递归上限，超限应定位为覆盖缺口，不加大上限隐藏指数展开。

### 3.2 材料与操作分离

保留三层：

1. **源码材料**：特定源码函数、receiver、解析语义版本和依赖下的结构/解释；可以在 operation entry 尚未接受时保存。
2. **操作绑定**：某材料经真实入口和调用关系用于当前操作；候选变化会撤销连接，材料本身是否失效另判。
3. **当前分析**：当前问题、前提、政策、计算和终答；每次重新计算，不能从材料缓存带入旧许可结论。

优先在相邻 source-materials.ts 承载材料存储，operation-facts.ts 保留操作关系职责。材料身份不得使用单次 focusId/绝对工作目录/运行预算作为语义键。依赖继续复用 source-span、symbol-resolution、candidate-set、framework-model；新增结构版本是必要失效依据。

拟定内部接口如下，实施时按实际类型细化并同步 spec：

~~~ts
import type { BoundSemanticBlock } from "./semantic-flow.ts";
import type { SourceFactDependency } from "./operation-facts.ts";

export interface SourceMaterial {
  id: string;
  source: NonNullable<BoundSemanticBlock["source"]>;
  receiverClass?: string;
  unit: BoundSemanticBlock;
  dependencies: SourceFactDependency[];
  current: boolean;
  semanticSupport: "unreviewed";
}
export interface MaterialUse {
  materialId: string;
  operationId: string;
  questionId: string;
  entrySymbolId: string;
  callerHandle?: string;
  callStep?: string;
}
~~~

SourceMaterial.unit 仍是受验证的局部来源解释；origin question 可作 provenance，但不得因此共享该题前提。只有 MaterialUse 经真实调用/receiver/实参校验，才能投影到该操作的求值。入口更换撤销原连接，仍有效的函数材料可以保留。保存、恢复、实际进入计算三种数量分别记录。

旧 report 若只有 accepted unit 而无依赖足迹，保留缺失诊断；可经当前源码重新核验产生一条**新的**材料记录，并计准备成本，绝不回写旧 footprint。

### 3.3 局部修复和任务交付

复用当前 focus/state，新增的是可见进度而非第二个 agent 循环。每次反馈明确：

- 已接受哪些标注和材料；
- 当前错误/缺项的精确锚点和字段；
- 本轮允许修改的最小局部载荷；
- 新增连接、消除缺口、材料采用、终答状态是否发生变化。

拒绝一个字段不会丢掉其它已接受标注；修订关键前提/源码则按依赖失效。工具历史中冗余状态可以用宿主当前快照替代，原始完整 trace 继续归档。不能截掉决定性源码、工具报错或尚未消化的工具结果来制造 token 下降。

状态至少区分 source located/read、interpreted、material stored、operation linked、checked、natural delivered。比较为零材料时明确 no-materials-restored，不继续显示用户容易误读的“已复用”。

自然交付保留原 skill 职责，由当前解释和具体缺项支撑。用户未给角色/owner 等运行事实时应枚举源代码条件；不要把可见源分支统一推给“部署未知”。既有空 final/terminal 检查继续生效。

### 3.4 账号通道与实验宿主

首选官方 Codex app-server stdio、由 CLI 管理已登录会话；不要提取浏览器 cookie、复制 auth.json/access token 到项目、调用未公开 ChatGPT 网页接口或更改全局账号配置。

app-server 本身管理 agent loop；不能草率套成一次普通 LLMProvider.complete，从而漏掉内部推理/工具调用。采用**明确标识的 Codex account adapter**，将 SkVM 当前领域工具定义和执行器桥接过去。两种宿主共用领域核心；不同宿主的数据单列。

拟定公开入口为现有 run 的 adapter=codex-account；inquiry 复用相同 session driver，确需参数时在现有命令增加 runtime=codex-account。参数名以实现前 CLI 类型核对结果为准，并在同一提交同步 usage/测试，不另建顶层产品 CLI。已有 bare-agent/provider 默认不变。

账户通道必须核对实际 RPC schema、dynamicTools/item/tool/call、turn/completed、usage 和 interrupt/进程退出。内置 shell/网络/任意文件工具不能绕过 SkVM 的源码范围。按官方能力关闭或约束无关工具；若当前版本无法落实，账号对照暂不执行，继续离线核心并报告具体缺项。prompt 中写“不要读 oracle”不算访问隔离。

实验的 Codex 工作目录只含允许的 source/skill/input，不含研究正文、评价/正确答案、开发 AGENTS 或其他尝试结果。不要把桌面开发线程直接当被测模型，避免继承开发答案和历史。

官方依据（执行时核对当前版本）：

- [ChatGPT/Codex 认证](https://learn.chatgpt.com/docs/auth)
- [App Server 及 dynamic tools](https://learn.chatgpt.com/docs/app-server)
- [GPT-5.6 Sol 模型](https://developers.openai.com/api/docs/models/gpt-5.6-sol)

本轮采用 Codex 自己管理的现有登录会话。另行注册 Sign in with ChatGPT OAuth 客户端不在本轮范围。

## 四、代码职责

| 职责 | 主要文件 |
|---|---|
| 语法区域、控制与锚点 | src/benchmarks/authorization-dsl/evidence-preparation/source-skeleton.ts 及相邻测试 |
| 有限控制、局部解释、函数摘要 | src/task-dsl/authorization/source-interpretation.ts、semantic-flow.ts、procedure-summary.ts、control-conclusion.ts |
| 源码材料和操作连接 | 新增 src/task-dsl/authorization/source-materials.ts 及测试；operation-facts.ts；operation-links.ts |
| 调度、当前状态、材料恢复 | inquiry-domain-runtime.ts、inquiry-focus.ts、inquiry-worklist.ts、inquiry-reuse.ts、operation-runtime/reuse 测试 |
| 双入口与交付、上下文 | inquiry-run.ts、inquiry-native.ts、inquiry-wire.ts、src/core/agent-loop.ts 及相关测试 |
| 账号驱动与适配器 | 新增 src/adapters/codex-account.ts、src/adapters/codex-account-session.ts 及测试；src/adapters/registry.ts、src/cli/run.ts、src/cli/authorization-inquiry.ts |
| 通道事件与用量 | 复用 src/benchmarks/authorization-dsl/telemetry.ts；实际需要的 Codex 事件解析放适配器相邻文件，不复制领域求值器 |
| 研究记录 | results/skill-ir/skill-dsl-research/development/authorization-control-materials-v1/ |
| 持续正文 | 既有 spec、研究总文档、developer-guide、usage、current-status/current plan |

新结果目录只保存一个 status、manifest、summary、accounting，以及 attempts/evaluations/repairs/verification。薄 study 调用生产入口，不在 results 实现新的执行核心。临时目录集中到 D:/skill优化/project-maintenance/runs/authorization-control-materials-v1/。不复制旧六轮结果树或清理其他线程材料。

## 五、AW0–AW22 队列

每项代码工作使用“行为失败测试 → 共享实现 → 聚焦回归 → 一次真实或原件重放验证 → 阶段记录”。以下阶段顺序可以按独立性调整，但依赖明确；账号不可用不阻止 AW2–AW10、AW13 的离线部分。

### AW0 接管与当前断点

- [x] 核对当前分支、HEAD、工作区和 AV 已无活动实验；记录实际基线，不复查全部历史。
- [x] 按第二节点验 Download helper-only、OWUI 已读未连、空 final 三种真实原件；保存少量索引而非复制整套结果。
- [x] 建立 AW status/manifest，工程、实际使用、研究效果分别初始化；AV 12 旧位置保持暂停。

### AW1 账号路径确认与已授权实验

- [x] 读取官方文档并核对本机 CLI 版本、登录类型、model/list；不读取凭据正文，不触发推理。
- [x] 检查 app-server 本地生成 schema 中的 dynamicTools、turn 生命周期、usage、tool restrictions；给出 adapter 接入决定和不支持字段。
- [x] 记录用户2026-10-07明确授权“允许使用当前账号做实验”；接通后执行第六节队列，不再重复确认。此前第三方API暂停继续有效。
- [x] 将账号可用性分成 logged-in、catalog-listed、inference-verified、tools-verified；当前只已核实前两项。

### AW2 建立真实失败的确定性复现

- [x] 在现有 source-skeleton/source-interpretation 测试 fixture 加 try/handler、短路、with、helper-only、局部错字段保留的行为反例。
- [x] 用 AV 同版本原始提案只读重放，记录在哪个阶段丢失入口/连接/材料，区分已接受提案与模型草稿。
- [x] 为 Download/OWUI 选择实际相关源码切片进入开发测试，答案仅在测试断言/evaluator，不放 model 输入。
- [x] 运行新测试确认失败是现有行为，不只因尚无新函数。

### AW3 正常与异常控制结构

- [x] 先实现 try 正常/except 与异常继续的窄路径，再补 else/finally；每个新增控制节点有对应降低器和求值测试。
- [x] 验证 return 前后、异常被捕获/传播、finally 覆盖 return、正常路径不得进入 handler、handler 的效果不得进入正常路径。
- [x] 显式 raise 与未知调用抛错的证据分开；未知异常来源保留可定位依赖，不假定一切调用均不抛错。
- [x] 使用真实 Download wrapper/helper 离线接线，保留当前尚未解释的业务条件。

### AW4 短路、上下文与循环

- [x] and/or 的 RHS 到达条件及返回值写失败测试；保留 0/false/空值语义，不能改成普通布尔真值猜测。
- [x] with 按真实 enter/body/exit 控制建模，未知异常抑制能力保留在该路径。
- [x] 实现当前真实决定性 loop 所需的有限形式或来源摘要，并测试 0 次、一次、提前退出、未知后续迭代。
- [x] Go 现有分支/initializer/receiver 通过兼容测试；本轮不要求实现所有 Go 控制结构，真实影响任务的未支持项必须说明。

### AW5 helper 摘要和局部覆盖

- [x] 复用 procedure-summary 与 source interpretation，保持参数/返回对象、正常/异常退出、guard/effect 对象关系。
- [x] 将“整函数含 gap”与“某项义务仍依赖 gap”分开；独立路径保留正确结果，决定性未知路径仍阻止相应完整结论。
- [x] 相同 helper 在不同 caller/receiver/实参下分别实例化，不跨调用共享具体用户值。
- [x] 故意调换检查对象与返回对象、删掉 guard、增加异常效果，必须改变对应结果而非继续通过。

### AW6 源码材料独立保存

- [x] 新增 source-materials 类型和存储：接受有来源/依赖的 helper 无需 accepted entry；记录解释来源与 unreviewed 等级。
- [x] inquiry-domain-runtime 每次接受来源单元即存材料；被拒提案不覆盖有效材料，尚无绑定时不生成任务结论。
- [x] 材料身份随源码/receiver/语义版本变化，保持与工作目录、预算、focusId 分离。
- [x] 同一有效 helper 在无入口、入口随后接受、入口撤回三阶段都可正确观察保存状态。

### AW7 入口、调用和投影连接

- [x] operation facts 改为经验证的材料使用关系；沿实际调用、receiver、参数和版本连接，禁止按相同名称自动采用。
- [x] 补入口后采用已有 helper，不要求再次模型解释；入口选错撤销绑定，未变化材料仍留存。
- [x] 多问题共用来源模板时，各问题的政策/前提/当前值独立；同名资源和同名调用负例不串线。
- [x] Download helper-only 原件在当前源码下重新核验成新材料，再接当前入口；历史原件保持。

### AW8 变化恢复与准确状态

- [x] policy-only 恢复材料并清旧政策/结论；premise-only 清对应值并重新计算；source/candidate/receiver 变化按依赖失效。
- [x] compare 输出 eligible/materialsAvailable/materialsRestored/materialsUsed；零恢复明确说明原因，不能显示已经获得复用收益。
- [x] 旧材料无足迹保持缺失；若重新核验，记录 fresh validation 成本，不能补旧报告当成此前已保存。
- [x] 搬移相同目录、改变运行预算、修改不相关源码，不应无故让全部材料失效；新增 override/权限 helper 变化应使真正依赖者失效。

### AW9 局部修复和上下文减负

- [x] 分别检查模型实际 request 的重复来源：domain current context、ordinary history、tool results、schema 广告；不能只比较 renderer 字符长度。
- [x] 保留当前原任务、独立政策、正在解释的完整必要窗口、已接受材料摘要和当前诊断；同一错误只提供所需局部修订字段。
- [x] 使用可控多轮 mock 验证一个错误字段修改不要求重交整个函数，未修字段/异步旧答不能覆盖已接受内容。
- [x] 用相同 AV 原始工具/提案序列比较实际发送字节、重复源码和义务保留，先验证工程减负；真实 token 效果留给新实验。

### AW10 进度调度与最终交付

- [x] 检测空 observe、相同诊断/相同状态的无效反复；根据已有状态选择解释、连接、检查或最终说明，避免重复读文件。
- [x] 达到预算前保留检查与自然终答机会；同一单元连续两次无进展做一次明确局部修复/说明后继续独立义务，不开启隐形第二预算。
- [x] 有意义的新输入可继续工作；不要把所有重复工具名都判为无进展。
- [x] inquiry/native 使用同一当前 revision 和缺项，空 final/无 terminal 仍记未交付；作者纯 artifact 合同继续独立。

### AW11 官方账号 session driver

- [x] 用 mock JSON-RPC 编写 initialize、thread/start、dynamic tool request/response、turn/completed、interrupt、child-exit、usage 去重测试。
- [x] 实现 stdio session driver，由官方 CLI 自行读取登录状态；仅保留必要元数据，日志过滤凭据与账户标识。
- [x] 当前能力无法落实工具限制、终态或模型选择时返回具体 unavailable，不尝试网页 cookie、私有端点或外部 token 代理。
- [x] 取消/超时后晚事件只能补账，不能执行工具或覆盖新会话；退出时回收自身子进程，不影响桌面开发进程。

### AW12 账号适配与同一领域工具核心

- [x] 将现有 native definitions/execute/domain snapshot 接入 codex-account adapter；新 inquiry 入口复用该 driver，不复制求值器或材料存储。
- [x] 两入口均记录实际 raw event、工具调用、源码展示、终态、模型/effort、CLI 版本、可见用量和未知项。
- [x] 用 mock 走完整的读取→局部解释→材料→连接→检查→自然终答，同时测试不允许工具、越界路径、空终答和报错。
- [ ] 已授权的账号通道工程可用后，进行一次匿名最小真实工具会话验证 gpt-5.6-sol；这是本轮调用，计量并保留失败。失败不切回付费 API。

### AW13 两条真实链的离线集成

- [x] 用当前生产入口、原始 Download/OWUI 来源及现有提案重放，验证新控制、材料和状态层实际被调用。
- [x] 两条真实路径必须显示原来被 opaque 包住的决定性步骤如何进入有限表示，或留下具体未达关系。
- [x] 原提案语义不足时可以另写开发测试标注验证宿主机制，明确 test-authored；它不得作为模型成功或放入真实模型输入。
- [x] Gitea 原定位与语义兼容跑零调用测试，避免修 Python 后破坏现有 Go 路径。

### AW14 真实纵向调试与现场修复

处置：账号工具隔离条件未满足，以下真实动作未派发；不将原件重放或test-authored接线充当新debug。

- [ ] 账号条件满足后，Download、OWUI 各运行一个新 D-S debug，输入仍为原始完整自然任务/来源/skill，无正确 helper 或控制图提示。
- [ ] 每份坏表现立即归因：实现、语义、上下文、接口、预算、服务或评价。共享问题先修，受影响后续位置暂停派发，独立开发继续。
- [ ] 每个明确根因做一次针对性修复和同题具名复验；相同原因两次无进展就改局部接口/模型负担，不原样重跑整题。
- [ ] 将实际终答与原任务逐项核对，特别检查版本缺省/异常、owner/grant、admin/非 admin、输入/输出对象和实际效果；这些核对只在 evaluator。

### AW15 完整原 skill 与作者消费

处置：账号通道不可用，完整native/作者/原字节消费者均登记undispatched；没有新的作者准入或完整自然交付。

- [ ] Cloudflare security audit 用 Download，GitHub security review 用 Gitea；保留完整正文和 companions，各原/变 native 一次，共四位置。
- [ ] 两个原任务各做一份模型作者稿，共两位置；只写任务声明/使用说明，不要求作者先提供正确图或答案。
- [ ] 首稿和一次正常字段修订分列，合格原字节消费者各一次，共两位置；无效稿仍占计划分母。
- [ ] native 原任务可与质量面板 D-S 引用同一次原件，但统计只算一次。保留原 skill 的其它职责，不用局部 checked 代替整份交付。

### AW16 政策、前提、源码变化复用

处置：只有确定性材料恢复测试，本轮真实基线未派发，六个fresh/previous位置均不满足账号和当前基线前提。

- [ ] 从本轮真实 Download 基线导出完整当前任务声明。三类变化的 fresh/materials-previous 各一位置，共六位置。
- [ ] 部分基线可以测材料保存与实际采用；明确材料收益范围。完整任务收益同时评价原/变终答。
- [ ] 源码变化只改开发副本中的一个相关 guard 对象或条件，原件不动；两臂输入/源码相同。政策/前提只改对应输入。
- [ ] previous 零恢复如实记录，不能换 fresh 冒充成功；若其直接原因已知且可修，先修共享材料机制并另立修订，再运行该配对。

### AW17 小型同条件质量比较

处置：六个同账号首位置均未派发，质量/真实token/净收益未测；原native与D-S可共用一次原件的关系保留在manifest，未双计。

- [ ] Download、OWUI 两任务各 N/M-S/D-S 三臂，共六首位置，全部使用同一 Codex 账号通道、gpt-5.6-sol、high effort、同版本/输入/总时限。
- [ ] N 为完整原 skill+普通只读来源工具；M-S 为自然前端+共享新核心；D-S 为声明前端+同一核心。N 不被要求提交形式 DSL；三臂自然终答按相同原任务评价。
- [ ] D-S 包含声明准备成本；helper、来源范围、修订机会等共同部分保持一致。不同 harness 的旧 API 结果只作历史背景。
- [ ] 发现已知共享缺陷立即修复受影响部分，原首件保留，修订不合并为首轮提升。无需强跑所有数量才能回到开发。

### AW18 机制贡献与总开销

- [x] 先做确定性对照：旧入口绑定耦合 vs 新材料保存、旧 opaque 控制 vs 新有限控制、旧上下文 vs 新局部反馈，输入和语义标注保持一致。
- [ ] 真实采用且具有可比较输出时，最多追加两项有明确问题的机制诊断，不做完整排列组合。
- [x] 同时报告自然质量、控制/材料实际采用、解释/修订次数、完整输入/output/cache、elapsed、恢复与准备成本；用量不可得保持 unknown。
- [x] 账号额度不写成免费/零成本；开发 GPT-6.1、被测 GPT-5.6、独立 AI 评阅分别计量，真人未参与计时则保持未知。

### AW19 独立复核与最终针对性修复

- [x] 只读核验实际终答、精确源码版本、当前报告，防止混用旧 attempt、原版与变化副本。
- [x] 每项错误归到具体终答段落和来源，不从 trace 替模型补答；合法的条件答案可充分，笼统 unknown 不自动合格。
- [x] 发现共享缺陷当场先失败后修复、同例验证；语义评价不同意见保留原判和主代理出处裁定。
- [x] 不因测试通过宣布方法成功；工程、真实交付、比较与复用各给实质结果。

### AW20 必要回归与零调用重放

- [x] 跑实际修改模块的联合测试、主类型、本轮 study 类型、文档/目录检查；已通过的历史全量不重复审计。
- [x] 从本轮 raw 重算终态、调用/turn、工具、usage、恢复/晚答，验证 unknown 不被补零，缓存不重复计数。
- [x] 原 AV 证据不改，仅检查 Git diff 未触及保护路径；不得为新二进制重放通过而更新旧冻结哈希。
- [ ] 自己的临时目录先解析绝对路径及归属再清理；失败则说明并保留，不跨 shell 递归删除。

### AW21 文档与用户 origin 发布

- [x] 在研究 §7.56 持续记录设计变化、真实失败、当场修复、复验及未达；开发指南/usage 只写实际存在且验证过的入口。
- [x] current-status/current plan 只保持当前结论和恢复入口，AV 暂停状态留在历史段。
- [x] 按功能提交，推用户 origin/skill-ir-aot，核对远端 SHA；保留无关改动，严禁推 upstream。实现19ee007a已核对，证据收束独立提交；最终SHA记录在conversation_log和交付消息。
- [x] 日志记录变更、验证、模型通道和实际消耗；不新增一套每阶段 Markdown。

### AW22 收束与恢复责任

- [x] 给出“核心工程、真实完整链、材料级复用、整任务收益、账号通道”五项结果；适用队列是否结束与研究目标是否实现分开。
- [x] 尚有可独立完成的适用工程就继续，不因账号暂停、部分实验失败或到某个钟点结束开发。
- [x] 所有适用工作终结后交付，失败/暂缓各写具体下一入口；目标不以“全部位置有状态”冒充达成。
- [x] 剩余问题落到代码责任和真实失败，而非再笼统安排一轮加字段/扩样。无目的追加工作不在本轮范围。

## 六、真实运行合同

初始新位置最多 24 个：账号工具 smoke 1、debug 2、完整 skill native 4、作者 2、消费者 2、变化 6、质量 6、通道相同的恢复诊断 1。能共用原件的阶段只计一次；机制诊断最多 2 个另列。位置数是完整保留失败的工作清单，不是必须消耗的额度。

账号实际模型固定 gpt-5.6-sol / high。开发线程 gpt-6.1-sol / max 不参与被测答案。CLI 模型实际不可用时报告，不改成 gpt-6 或改走旧 xty。默认实验顺序执行，先获得两个真实 debug 的诊断和修复，不批量把同一缺陷扩散到所有位置。

沿用 64 次领域工具动作、768KiB 累计源码展示、32MiB 读取/索引、7500 秒实际会话上限的可观察限额。当前公开账号协议不能兑现逐 provider 请求的 300 秒等待上限，账号入口明确拒绝该请求级 override，不把它写成已执行保证；provider 请求数若不暴露，如实记录 unknown，不能拿一次 turn 当一次 provider request。宿主可控 turn/工具/会话时间上限必须实际生效。作者上限 12 个可控生成 turn 和一次正常字段修订。所有修复/恢复消耗归入实际总账，不发明不可观测的 24-provider-call 保证。

普通实验反馈仅使用该次允许源码、工具诊断、当前模型提案。开发者或 evaluator 的正确分支清单、旧 full 答案、oracle 不进入被测输入。非完整答案当场找原因，机械问题先离线修；模型语义改进使用具名真实复验，首件永远保留。

账号配额用尽/权限失败暂停账号调用，完成离线工程与归档；不自动购买额度、切换用户身份或等待到额度恢复反复重试。旧付费接口保持暂停。本轮账号实验已获用户明确回复；仅登录、模型或工具通道的实际不可用会阻止对应实验，工程照常执行。

## 七、首批可执行反例与检查命令

AW2/AW3 可先追加到现有 source-skeleton.test.ts，复用已经存在的 fixture。此反例先证明 try 把真实写调用挡在 flow 之外；后续再验证正常/异常的准确求值，不以移除 gap 作为全部验收：

~~~ts
test("source try retains its body and handler as separate control regions", async () => {
  const f = await fixture(
    "def entry(actor, item):\n" +
    "    try:\n" +
    "        item.write(actor)\n" +
    "    except Denied:\n" +
    "        return False\n" +
    "    return True\n"
  );
  await f.read();
  const skeleton = (await f.tools.execute(
    "source_structure", { symbolId: f.source.id }
  )).structure as any;
  expect(skeleton.skeleton.flow.some((n: any) => n.kind === "try")).toBe(true);
  expect(skeleton.skeleton.anchors.some(
    (a: any) => a.kind === "call" && a.call.expression === "item.write"
  )).toBe(true);
});
~~~

新 source-materials 测试使用真实 fixture 生成已展示来源、accepted unit 和现有 dependencies；不得只传任意假 SHA 然后断言保存。最小行为顺序固定：

~~~text
read helper -> accept helper annotation -> material stored=1, operation links=0
read/accept entry -> validate its actual helper call -> material stored=2, links>=1
change independent policy -> source materials retained, prior answer/check absent
change helper source -> that material and dependent uses invalidated
switch entry -> old uses removed; unchanged unrelated helper material retained
~~~

控制测试必须至少有以下相反例：

| 输入变化 | 预期行为 |
|---|---|
| flag=false and check() | 不采用 RHS 调用为必经检查 |
| flag=true or check() | RHS 不被算作必经效果 |
| except 处理失败但 try 正常 | 不进入 handler |
| finally 内覆盖 return | 反映最后的返回/异常，不能沿旧 return 结束 |
| 未知 loop 内可能更换资源 | 对象依赖保持未解，不能用循环外 guard 冒充覆盖 |
| 非决定性独立日志 gap | 保留缺口但不抹去已充分的独立授权分支 |
| 只改局部一个 condition 字段 | 保留其它有效标注和已读来源 |
| Codex turn/completed 但 final 空 | 无交付，计量和原事件保留 |
| Codex 动态工具请求越界路径 | 原执行器拒绝，不能走原生 shell 绕过 |
| 三次相同工具名但不同有效进度 | 不误作死循环 |

从 SkVM 根执行下列已存在命令；新增测试文件后纳入对应集合：

~~~powershell
bun test ./src/benchmarks/authorization-dsl/evidence-preparation/source-skeleton.test.ts ./src/task-dsl/authorization/source-interpretation.test.ts ./src/task-dsl/authorization/semantic-flow.test.ts
bun test ./src/task-dsl/authorization/operation-facts.test.ts ./src/benchmarks/authorization-dsl/operation-runtime.test.ts ./src/benchmarks/authorization-dsl/operation-reuse.test.ts
bun test ./src/benchmarks/authorization-dsl/source-assisted-entrypoints.test.ts ./test/core/agent-loop.test.ts
bun run typecheck
python -X utf8 -B -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py
python -X utf8 -B scripts/check_skill_ir_doc_links.py
bun ./scripts/experiment-catalog/cli.ts check --root=. --catalog=results/skill-ir/experiment-catalog.json
git diff --check
~~~

实际薄study提供`offline`、`offline --revision=compact-source-metadata`、`account-check`、`replay`，分别用于原件生产入口重放/具名元数据修订、官方零推理能力检查和归档重算；没有为未验证通道发布新的真实run包装器。已有两个公共CLI保留，未来落实工具排他性后才进入真实队列。当前study不把evaluator变成prompt；AW自己的tsconfig严格类型检查通过，不引用旧AV类型配置冒充覆盖。

## 八、交接记录

- 2026-10-07：根据 AV 暂缓后代码/终答复核建立本计划。已有 109 项针对性测试/538 断言、主类型检查通过；最新两条 debug 各 22/22 响应但仅接受一个单元，终答仍 partial。helper 保存与入口绑定耦合的直接责任已点验。仅建立任务书和当前导航/方法合同，未实施 AW 代码、未推理。
- 本机账号已登录、目录列出所需模型，真实模型访问及完整领域工具接入仍待本轮确认；付费 API 不自动恢复。用户随后明确回复“允许使用当前账号做实验”，该授权已同步到本任务书；派发时给开发线程本任务书、精确上下文和当前 Git SHA。
- 2026-10-07收束：Download原helper当前重新核验保存1份，test-authored wrapper连接2份材料/6条question使用关系，仍3条callee缺口；OWUI保留55项具体缺项。24逻辑真实位置因公开排他工具能力未验证而undispatched。两个原入口保留完整源码/锚点/flow，元数据合并让同v3实际请求字节下降7.7%/18.3%；OWUI仍高于v2，不声称真实token/质量改善。937pass/1平台skip/5909断言、主/AW类型通过；replay核对8个本轮raw和11个旧原件哈希。AW12真实smoke、AW14–17及AW18真实机制诊断不满足前提；AW20本轮schema/临时核验材料保留作能力依据，未删除其他目录。按功能提交/用户origin发布记录在conversation_log，研究§7.56/指南/usage/spec与导航同步；未新增阶段Markdown。五项结果、未达与恢复责任均见summary/status。
