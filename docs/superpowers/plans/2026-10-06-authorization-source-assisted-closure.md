# AV0–AV20：源码辅助解释与授权任务真实闭合实施任务书

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans, systematic-debugging, test-driven-development and verification-before-completion. 用户已授权连续开发、必要联网/付费调用和用户 origin 发布；常规检查点不等待确认。主开发线程负责设计、实现与最终验证，只读探子按最新 AGENTS 使用 default、fork_turns=none，不改文件、不代替主线程作设计决定。

**Goal:** 修复 AU 三项可复现共享缺陷，让宿主从真实源码提供位置、调用和有限分支骨架，模型集中解释授权含义，贯通两份完整原 skill 的实际交付、作者消费与变化复用，并测量质量和代价。

**Architecture:** 沿用 inquiry/native、现有 CLI、结构索引、focus、semantic-flow、求值器与 trace。新增显式 `operation-evidence-v2`，在同一运行核心内使用来源选择器、源码骨架和较小的解释提案；旧默认、旧协议及历史结果保留。只读请求采用有界恢复，源码缺失、内部解释缺口、用户条件未知和政策缺省分别交付。

**Tech Stack:** TypeScript、Bun、Zod、现有 `@vscode/tree-sitter-wasm` Python/Go 解析器、现有 provider/telemetry 和确定性测试。按实际依赖版本查官方实现，不另建 CLI、统一 IR 或整仓安全平台。

日期：2026-10-06。状态：`in-progress`，AV0–AV9完成工程验证，继续AV10。开发模型：`gpt-6.1-sol / max`；用户另要求 Flash，当前派发接口没有该设置字段，不能写成已经启用。工作目录 `D:/skill优化/SkVM`，分支 `skill-ir-aot`，仅推用户 `origin`。设计基线 `9d7db8e87c1484e119e7b8d1adece2fc6ba5079f`，启动时保留本任务书后续发布提交。

本轮约 8–12 小时是主动工作安排，约六成精力用于质量、四成用于编写与复用。完成适用工作即收口；不等待、重复全量验证或增加无目的调用凑时间。实验模型沿用 `xty/gpt-5.6-sol`，与开发线程模型分账；可用路由改变时记录并统一同一比较块。

## 一、接管与必须阅读的上下文

主开发者本人按以下顺序阅读，不让探子转述基础设计：

1. `D:/skill优化/AGENTS.md` 与仓库 `AGENTS.md`。
2. [current-status](../../skill-ir/current-status.md)、本任务书、[当前计划](../../skill-ir/skill-ir-aot-optimization-plan.md)。检查 Git 分支、工作区和最新提交。
3. [研究 §7.54](../../skill-ir/skill-dsl-research.md#754-au-收束后复核入口来源连接和身份稳定性)、本轮 §7.55，以及 [spec §14.35](../../skill-ir/skill-ir-aot-optimization-spec.md#1435-av-source-assisted-closure-contract)。AU 合同用于兼容，AV 合同用于新执行。
4. [开发指南](../../skill-ir/developer-guide.md)中的 structure/operation/focus/reuse/native 部分及 [usage](../../usage.md)的现有两入口。
5. AU [复核机器证据](../../../results/skill-ir/skill-dsl-research/development/authorization-operation-evidence-v1/verification/post-au-review-20261006.json)、[探针](../../../results/skill-ir/skill-dsl-research/development/authorization-operation-evidence-v1/verification/post-au-review-20261006.ts)、[summary](../../../results/skill-ir/skill-dsl-research/development/authorization-operation-evidence-v1/summary.json)。按当前问题点验原答、源码和 raw，不重读所有历史阶段。

AU 已结束，本轮开发线程取得共享方法文档与 Git 的唯一写入责任。派发线程此后只读观察。根目录 handoff/communication 只在恢复有歧义时阅读；阶段记录追加 `D:/skill优化/conversation_log.md`。其他线程编辑、历史原件、Q1、held-out、readiness 和旧 `0/6` 保留。

## 二、本轮必须解决的原因

| 具体断点 | 已有证据及责任 | 验收现象 |
|---|---|---|
| OWUI 的 `/process/file` 无 route 候选，任务中 write 恰好命中 AuditLogger.write 并自动选择 | `inquiry-worklist.ts` entry fallback/singleton；`inquiry-tools.ts` symbolHints；`structure-index.ts` 缺 Python decorator route | 普通词只是线索；源码确认的 route/限定符号才能自动定位。正确入口实际进入工作队列 |
| Download 已有 helper 被 `pathHint=file:1429-1448` 排除 | `operation-links.ts` 路径字符串过滤；scheduler 已有部分行号归一化 | 同一来源选择器供 scheduler/link/focus 使用，合法范围可连接，错误范围精确诊断 |
| 同源码只换 sourceRoot/maxToolCalls，source ID 与 index revision 都变 | 整个 options 对象传入 `buildStructureIndex` 并参与哈希 | 身份只含源码身份；搬移与预算变化可恢复材料，真实源码/解析变化正确失效 |
| 模型仍须手写 blocks、typed bind、参数、分支和阶段容器 | `inquiry-focus.ts`、`semantic-flow.ts`、AU 真实解释草稿 | 宿主生成机械骨架，模型标注语义；真实请求中的重复结构输入与修复次数可量化 |
| 内部未连起来被说成源码不可得；behavior 又被缺独立 policy 拖累 | AU Download D 终答与同源 N 充分答案 | 四类缺口分列，完整条件答案与机械检查各自可读且一致 |
| 两个只读请求超时封住 19 个首位置 | 旧 `assertNoUnknownTask` 与 telemetry timeout | 新合同按请求/执行能力恢复，不把未知计费扩大成逻辑任务永久暂停 |

前三区别已由零模型复现证明，不能再仅归为“模型没有选对”。AU 的自然 Download N full 是有用的开发对照；它的答案留在 evaluator，不能成为新模型上下文。AU 三个旧探针断言的是当时缺陷，原脚本和报告不回写成新实现通过；新回归单独验证修复后的预期。

## 三、核心设计与兼容合同

### 3.1 稳定来源、入口选择和统一定位

来源身份显式构造 `{repository, sourceRef}`，再组合相对路径、源码内容和语法位置；预算、绝对目录、计时、遍历输入顺序不进入来源 ID。解析器/框架版本属于结构依赖修订。修改来源、候选集合、override、import 或路由后重新判定相应依赖。旧材料仅在来源路径、内容、范围、限定符号及 receiver 可唯一核实时重绑定；有歧义则重取证，保留原件。

统一来源选择器放在 `evidence-preparation/source-selector.ts`，由旧字符串适配进入。至少表达 path、startLine/endLine、candidateId；返回成功或具体诊断，不静默截断。复用 `inquiry-domain-scheduler.ts` 已有范围核验，避免另建互不一致的两份逻辑。合法旧 `path:line-line` 无损归一化；行号须匹配实际候选，范围冲突、跨根路径、未知候选分别拒绝。原始值与归一化值进入 trace。

入口候选携带 `basis`：显式限定符号、源码 route binding、用户明确选择、词法线索。只在关系唯一且来源成立时自动选择；一个普通词碰巧只有一个命中不满足此条件。保留模型从已显示候选中选择、撤回错误入口的能力。Python decorator 路由识别从实际 import/alias、router 构造及 decorator 关系出发，覆盖 FastAPI/APIRouter 常量路径、可解析 prefix/include；动态 prefix、未知包装器和多候选保持缺口。DRF 与 Go 旧关系继续工作，不按仓库名写例外。

### 3.2 来源骨架与模型的分工

新增 `source-skeleton.ts` 只保存从当前已读函数体取得的语法事实：参数、赋值/字段表达式、调用及实参、return/raise、有限 if/else/短路条件、原始范围、receiver 和候选关系。复用现有解析树；不再次靠正则猜控制流。只为当前操作/依赖按需生成，不扫描完全部源码才开始解释。

源码骨架可以知道“这个调用传了 request 和 pk”“某个 return 在 if 的真分支”。它不自行认定 actor 是管理员、这个 helper 是授权检查、某对象就是被保护资源或一次调用一定成功。框架入口、继承、middleware 继续由有版本依据的结构适配器给出待核验关系。

模型面对较小的 `source-interpretation/v1` 提案：引用当前显示的语法锚点，标注主体/资源/权限角色、条件的授权含义、相关效果及具体未解项。宿主管理来源 ID、范围、机械参数位置、分支连接和更新版本。模型无需重抄 blocks/start、call path/行号和完整参数列表。兼容旧低层单元，仅作为显式 fallback，记录使用次数与原因；新机制不得偷偷全量回退后宣称减负。

以下是内部责任接口，不要求用户手写。实现前把实际类型与编译调用同步到 spec，字段小调整直接记录后继续：

```ts
import type { ControlRule } from "./control-slice.ts";

export interface SourceSelector {
  path: string;
  startLine?: number;
  endLine?: number;
  candidateId?: string;
}
export interface SourceAnchor {
  id: string;
  selector: SourceSelector;
  sourceSha256: string;
  kind: "parameter" | "assignment" | "condition" | "call" | "return" | "raise";
  text: string;
}
export interface SourceSkeleton {
  sourceId: string;
  revision: string;
  anchors: SourceAnchor[];
  edges: Array<{ from: string; to: string; branch: "next" | "true" | "false" }>;
  gaps: Array<{ code: string; selector: SourceSelector; reason: string }>;
}
export interface SourceInterpretation {
  schemaVersion: "source-interpretation/v1";
  revision: string;
  fallthroughOutcome?: ControlRule["outcome"];
  annotations: Array<{
    anchorId: string;
    role: "principal" | "resource" | "permission" | "condition" | "effect" | "context";
    explanation: string;
    principalAnchorId?: string;
    resourceAnchorId?: string;
    aliasAnchorId?: string;
    guardBranch?: "true" | "false";
    authorizedByAnchorIds?: string[];
    condition?: ControlRule["condition"];
    failureKind?: ControlRule["failureKind"];
    returnOutcome?: ControlRule["outcome"];
  }>;
  unresolved: Array<{ anchorId: string; reason: string }>;
}
```

这个窄接口首先提供身份和语法减负。条件/关系仍使用已有有限表达式类型及 predicateDiagnostics 检查，principal/resource 引用当前显示的来源锚点；explanation 只作说明，不编译成结论。缺少必要 condition/对象绑定时返回对应锚点的结构化问题，由模型局部补充。最终协议应让模型补少量当前缺失字段，而非重新生成整个单元。新增结构必须解决实际跨案例缺口，不再叠一层重复完整 DSL。

骨架支持范围以 fixture 和实际节点覆盖决定。循环、异常、动态分派或不可判定别名不能删去；若影响目标义务，保留局部缺口和条件答案。参数位置/关键字/默认值可由已知源码签名机械匹配，`*args/**kwargs`、动态 receiver 或对象别名含义未知时不强绑。空/假值/缺键、guard 资源 A 与 effect 资源 B、提前拒绝、正常返回和操作失败分别保留。

### 3.3 调度、结论与缺口

将“已找到、已读、已生成骨架、已解释、已关联、已核查”作为现有 worklist 中的实际进度；不要为每个阶段再建新循环。优先修当前决定性来源/对象/分支缺口，已展示未解释时不再次读取同一文件。自动读取仍计共享工具与展示预算。

对外缺口明确区分：

1. `source-gap`：原文未读、范围外或确实不可得；分别保存状态。
2. `interpretation-gap`：原文已有，语法/对象/控制关系尚未表达或连接。
3. `premise-unknown`：用户未指定的运行条件，允许交付覆盖充分的条件答案。
4. `policy-unspecified`：没有独立规范政策；行为任务照常分析，请求合规比较才影响对应义务。

自然说明和结构检查基于同一当前解释快照。可交付有据的部分自然答案，保留完整原义务与具体未解原因；机械检查失败不得吞掉全部可用说明。反过来，文字流畅不能提升 sourceBound/checked。末次检查无效要撤销旧 valid，重定位入口要撤销错误来源投影。最终统计自然质量、实际交付、机械 checked/bounded、条件覆盖与成本五项，避免一项状态代替全部。

### 3.4 请求超时与局部恢复：本轮显式替换的新规则

旧 AU/AT/AS 的请求、封存与分母保持；不修改其 `assertNoUnknownTask` 来重开旧位置。AV 新 runner 使用以下能力与生命周期合同，而非按历史 task 名永久拒绝新工作：

- 模型请求为只读取证/解释，目标执行为零。超时后关闭该本地执行尝试，隔离其晚到答复；晚答只能补充原请求计量，不能执行工具、接受语义或覆盖新终答。
- provider 支持取消时传递取消信号；不支持时如实记录远端完成未知。该未知费用始终留账，本地消费者停止与远端是否完成分别记录。
- 确认本地工具执行器已停止、晚答隔离和只读工具白名单成立后，允许从最后已知状态恢复。每个超时请求至多一次传输恢复，每个运行位置至多两次；全部派发计入该位置的 24 次总预算。
- 新恢复请求保存 parentAttempt/request、理由和原 unknown。不能把晚答与恢复答两份都接受；不能把一次后续成功覆盖首次超时。
- 含外部写入/目标执行或仍活动的执行器，暂停受影响动作；授权分析不添加这类工具。只有费用未知不暂停开发。凭据/服务故障暂停该服务，确定性开发和其他不受影响工作继续。
- 作者阶段允许写本地交付文件，不因此自动获得只读恢复资格；若写动作状态未确认，先检查该动作和工作目录的已知状态，不能盲目重放。已经落盘的原稿继续保存。
- Share/Gitea 旧请求保持历史封存；AV 可在上述恢复合同的测试及本地状态核验之后执行新的 development 位置，关联旧风险与新恢复政策。这是已授权的政策变更，不借新名称原样绕过旧规则。Notes/Memos 等不在本轮输入范围，不自动恢复。

现有 telemetry 已记录 late settlement，但未取消 delegate；ordinary agent-loop 的 deadline 也只在循环边界检查。必须测试 late tool_calls 不会执行以及关闭后无状态回写，不能只改研究 runner 的判断。新行为显式用于 AV 策略，旧实验的离线解释继续按旧合同。

## 四、代码与记录责任

| 责任 | 修改/新增位置 |
|---|---|
| 身份、路由、语法事实 | `src/benchmarks/authorization-dsl/evidence-preparation/structure-index.ts` 及测试；新增同目录 `source-selector.ts`、`source-skeleton.ts` 及测试 |
| 入口与来源连接 | `inquiry-tools.ts`、`inquiry-worklist.ts`、`operation-work.ts`、`operation-links.ts`、`inquiry-domain-scheduler.ts` 及测试 |
| 模型窄提案与宿主降低 | `src/task-dsl/authorization/source-interpretation.ts` 及测试；复用 `semantic-flow.ts`、`procedure-summary.ts`、`control-conclusion.ts`，策略枚举统一扩展 `control-slice.ts` |
| 同一 focus/双入口 | `src/benchmarks/authorization-dsl/inquiry-focus.ts`、`inquiry-domain-runtime.ts`、`inquiry-wire.ts`、`inquiry-run.ts`、`inquiry-native.ts`、`inquiry-local.ts`、`inquiry-reuse.ts` 及测试 |
| 请求生命周期 | `src/benchmarks/authorization-dsl/telemetry.ts` 及测试、`src/core/agent-loop.ts`；需要时在其相邻位置补测试及向现有 provider 类型传递取消信息 |
| CLI兼容接线 | `src/cli/authorization-inquiry.ts`、`src/cli/run.ts` 及对应测试，仅扩展现有显式策略 |
| 本轮薄记录与恢复政策 | `results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/`，薄 runner 不复制生产求值/恢复循环 |

新文件只承载表中职责，若现有模块已适合承载则复用并登记实际路径。结果根保持 `status.json`、`manifest.json`、`study.ts`、类型/测试、`runs/`、`evaluations/`、`repairs/`、`verification/`、`summary.json`、`accounting.json`。不要再建每阶段一份 Markdown。临时副本集中在 `D:/skill优化/project-maintenance/runs/authorization-source-assisted-closure-v1/`。

## 五、AV0–AV20 开发队列

每个代码阶段按“指定反例 → 预期失败 → 共享实现 → 同例通过 → 有关回归 → 记录/提交”推进。测试命令中的 `./` 保留。失败测试须验证行为，不能只验证新增字段存在。

### AV0 接管、原件定位与恢复入口

- [x] 保存当前分支/提交/已有修改，核对 AU 已停止；建立本轮 status 和研究输入清单，状态区分工程、真实使用、研究效果。
- [x] 点验三个零调用复现、Download N/D 和 OWUI D 终答、Gitea native/作者/超时消费者；把责任关联到本轮任务，原件只读。
- [x] model 目录只含原任务、独立政策/前提、完整 skill 和允许源码；evaluator 保存历史答案/正确性判定，runner 不读取它构造 prompt。
- [x] 记录恢复命令、当前阶段、最后已知请求、下一未派发动作。中断后接续该位置，不重新做所有审计。

### AV1 来源身份稳定与材料兼容

- [x] 在 structure-index 测试中加入预算/目录/输入排序不变、内容/ref/override变化失效反例；production createInquiryTools 再覆盖一次真实搬移和预算变化。
- [x] 显式选择 source identity 字段并稳定排序，检查 legacy 与新索引两处透传；解析器修订保留独立版本。
- [x] 旧 source ID 只按确切来源唯一匹配在内存重绑定，候选歧义/字节变化拒绝复用；不更新 AU 原文件。
- [x] 验证 operation identity、candidateRevision 与实际恢复入口，保存零调用旧/新对照。

### AV2 来源选择器归一化与 helper 连接

- [x] 给现有 operation-links fixture 添加合法 `app.py:3-4` 定位，旧实现应无法绑定；加错误范围、错误候选、不同 receiver 和越界路径反例。
- [x] 提取 scheduler 已有无损范围核验为共享 source-selector；operation links、focus 展示和 scheduler 统一使用。
- [x] 合法定位绑定正确 helper，保持原参数/条件原样；非法范围返回 interpretation/location 诊断，不能伪报文件不存在。
- [x] 零模型重放 AU Download 的三单元副本，只验证连接变化；保留其他语义失败，不宣称整题 full。

### AV3 来源确认的入口与框架路由

- [x] 增加匿名 FastAPI/APIRouter import alias、prefix、重复 route、动态 prefix、伪 router 对象、无关 write singleton 反例。
- [x] structure-index 建真实 decorator/registration 关系；worklist 用候选依据选择入口，词法线索保持可探索但不自动绑定。
- [x] 测试显式候选重选能撤销错误事实，Go/DRF 原 route 兼容；不强迫用户给正确函数名。
- [x] 对已暴露 OWUI 原输入零模型走生产工具核对 route 候选和 entry 工作；结果记录候选而非授权结论。

### AV4 从源码生成有界骨架

- [x] source-skeleton 测试覆盖 if/else、提前 return/raise、嵌套条件、位置/关键字参数、字段值、空值与短路、动态调用、循环及异常缺口。
- [x] 复用解析树生成原文锚点与有限边，不执行目标代码；两个调用同名但 receiver 不同要保留区别。
- [x] 只为当前已读窗口/完整函数生成骨架；未展示内容不能被标成模型已解释。索引看过与模型看过分账。
- [x] 在 Python、Go 各输出一个匿名骨架，验证所有 anchor 回指实际字节、所有 unsupported 节点有位置，完整分支没有被截断后自动宣称完成。

### AV5 模型解释接口减负与语义降低

- [x] 定义实际 source-interpretation 严格 schema；反例包含未显示锚点、旧 revision、错角色、缺分支、同对象混淆、自由 explanation 尚无谓词。
- [x] focus 只广告当前阶段需要的提案；宿主填来源、调用位置、可确定参数与分支骨架，模型补领域角色/谓词/对象关系，降低到原 semantic-flow。
- [x] 局部诊断返回缺失锚点与可提交字段；保持同一来源事务，修一个条件不用重交所有调用。
- [x] 对相同匿名源码比较旧低层表示与新来源辅助表示的求值：允许、拒绝、未知和错误路径相同；故意交换 guard/effect 对象应被检出。

### AV6 骨架驱动义务调度与上下文

- [x] 测试“模型未报告 helper，但实际调用/授权义务可触发补读”“已读未解释只要求解释”“日志/注释同名不抢入口”。
- [x] 接入现有 operation/worklist/focus，关键调用/返回关系优先于外围文件；完整框架 dispatch 义务仍保留。
- [x] 上下文保留原任务、当前源码、接受摘要和本轮缺口，历史原件存 trace。源码文本和巨大 schema 不在同次 prompt 多处重复。
- [x] 记录实际原文展示、重复字节、解释重做、fallback 次数与控制步骤；不能删决定性条件换 token 下降。

### AV7 四类缺口与同源回答

- [x] 写“已读但 callee 未连”“用户条件未知”“behavior 无 policy”“conformance 缺 policy”“检查失败后已有可靠部分说明”五类测试。
- [x] 把原始义务逐项映射到当前来源/条件/缺口；源代码未读和映射失败不得共用原因。
- [x] 自然终答、机器答案、检查状态使用同一 revision；旧结果失效时撤销，独立充分的条件说明保留。
- [x] 保持语义质量独立评价，不用 current check 的 valid 自动生成 full 等级。

### AV8 只读超时恢复与晚答隔离

实现细节：telemetry显式`readonlyRecovery`携政策版本、只读工具白名单及本地执行器/状态核验回调；原尝试localConsumer关闭，恢复请求关联parentAttemptId并计共享预算。独立`isolateLateResponses`可仅开启关闭/取消隔离，不赋恢复能力。普通agent-loop显式启用相同晚答隔离，在provider/continuation及回调和工具边界检查本地生命周期；OpenAI-compatible的fetch/Node helper传递signal，取消后不继续内部重试。AV9把这些能力接到新策略，旧默认保持。

- [x] 在 telemetry/mock loop 写 timeout 后晚 tool_calls、晚答先于/后于恢复、关闭后写状态、重复计量及未知USD反例；使用可控 promise，不用真实等待五分钟测试。
- [x] 实现本地请求终态与执行消费隔离；支持取消时透传 signal，不支持时保留 remote-unknown。修复后旧 native 普通任务默认行为兼容。
- [x] AV 恢复只允许记录的只读能力与预算内一次同请求恢复/每位置至多两次；所有 request/continuation 计数，失败仍保存。
- [x] 新 runner 独立记录恢复政策版本，不改旧研究 guard；在 AV0 旧风险映射上记录哪些旧任务仅作为新 development 可执行，哪些仍不适用。

独立AI复核后的两项反例先失败再修复：晚到error写入lateSettlement.error，不覆盖原timeout；domain关闭时保存已知report/delivery快照，后续只读IO结算不会改动交付。联合113项/619断言通过；AV8政策及旧风险映射见verification/av8.json，AV9负责公共策略和runner实际接线。

### AV9 双入口和可运行薄 runner

工作顺序：先用匿名Python原文在inquiry/native的M/D1四条路径写真实定位、读取、来源标注、当前检查和交付反例；扩展统一strategy判别、窄source envelope和两入口phase渲染，保持v1。随后接native telemetry只读白名单/空闲核验和公开request/session时限；最后以现有production API构造26个严格ID的薄runner、原件保存及零调用check/replay，不复制求值或恢复循环。

- [x] 将 `operation-evidence-v2` 接到现有 inquiry/native 和 M/D1 前端，同一个核心、相同来源工具与预算，不复制另一套 agent。
- [x] 两入口 mock 测试必须实际走定位→读取→解释→检查→自然交付；覆盖旧 v1/默认、错误策略组合、完整作者声明不重复 author 调用。
- [x] 创建 `study.ts init|check|run <position-id>|replay`。run 只接受 manifest 中的完整唯一 ID；具名修订显式关联 parent，不复写初次目录。
- [x] 运行零调用 check，核 manifest、真实 full skill 清单、input/evaluator 隔离、恢复政策及脚本类型；保存实际 CLI 恢复命令。

139项联合测试/1029断言与主/AV严格类型通过，check/replay零provider/目标执行。26位置、5ready输入、3待AV14输入登记；实际请求300000ms/session7500000ms，各比较臂输出6000，作者12派发与一次字段修订。作者仅沿现有agent-loop/source runtime写两个根artifact，不自动恢复写阶段。独立复核发现路径/作者报告绑定缺口，失败测试后修复；完整skill/source/实际request证据将随native原件核对。AV9的工程完成不代表真实充分交付，下一命令为 `bun ./results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/study.ts run debug-paperless-download-D1`。

### AV10 Download 第一条真实纵向链

首次登记在provider派发前失败：runner误用`SKVM_CACHE_PATH`，未载入项目route；随后误读不存在的run.json。原始provider-unavailable报告证明0派发，已完整归档，不算模型质量失败或unknown completion。两项真实失败测试后改为`SKVM_CACHE`并失效配置缓存、按零派发报告归档；8项/66断言及runner类型通过，配置provider可创建且未调用。下一次为`--revision=runtime-config --parent=first`，保留原首次记录。证据见results的verification/av10-pre-dispatch.json。

- [x] 从 AU 原始 Download 请求和 locked-framework 源码开始一次 D1 新策略运行；未给答案或正确 helper 清单。

runtime-config具名首次真实尝试为18派发/18响应，4次来源解释提案、2个来源单元、0低层图fallback；0次check、无终答，因解释根载荷多余complete/unit在transport被拒而结束。usage完整、所有实际USD未知。独立AI核验后主代理点验来源终态校验/全程读取两种physicalReadBytes基准，并纠正“源码读即图fallback”的复核错误；计数裁定的初始过度纠正保留在history；不以轨迹补终答。修复工作顺序：先复现两个公共入口的额外根字段失败→保留原载荷、局部严格诊断→核相同focus修订和原件→78项/547断言及类型→具名local-envelope真实复验。ID和角色提示仅澄清结构合同，未提供业务答案；try/except、helper和框架语义缺口保留。出处与裁定在evaluations/av10-runtime-config.json。

local-envelope实际21派发/20响应，1原timeout与1只读恢复、14提案/11局修/2单元、0fallback/check，终答未交付。独立源码核验判两份草稿partial，不能把已可见根授权/文件选择关系泛化为部署未知。终答严格拒绝的真实字段是paths[].disposition=conditional，旧root归一化误报result缺失；先失败后无损包装并保留严格nested校验，53项/420断言及主类型通过。具名`--revision=final-diagnostics --parent=revision-local-envelope`同输入/预算复验后推进原OWUI；两Python若同因停滞，再按AV11做一次共享来源接口修复，不增加容器或预算。评阅与分账在evaluations/av10-local-envelope.json。

final-diagnostics已22响应/22派发，实际nested路径诊断触发一次修订并接受partial终答；15提案/11局修/2单元、2次check仍ruleConsistency=false/taskResolution=partial。AI复核的“check-valid/bounded”误判由当前原件纠正；原任务的owner/grant分支和requested-version默认分支仍不充分。下一小阶段先红绿修已定位宿主重复绑定：匿名同变量分支赋值及顺序覆盖→bind的唯一step name与实际bindingName分离→保持当前分支对象/值→有关回归及一次真实使用。补齐解释阶段遗漏的基础有限谓词写法，非法算子仍由原validator拒绝并指出可用合同。随后原OWUI；这两项是已证机械/说明缺陷，不推断能解决异常、复合return或全部质量。
- [ ] 逐项检查正确入口、框架前置约束、helper 实参/对象、条件分支和最终自然说明是否经过共享机制；首次结果完整保留。
- [ ] 每个可定位缺陷立即走第七节修复循环。若仍反复要求模型生成整张低层图，回到 AV5 修接口，不继续堆提示或扩预算。
- [ ] evaluator 以完整原任务核对终答；已读到但未进入终答的内容仍记遗漏，不能借轨迹补答。得到真实完整链后保存可用于后续变化的基线。

### AV11 OWUI 第二结构与 Go 使用准备

只读Go复核发现multiline链式Post未入route；匿名反例先失败，末段verb仅trim空白后真实POST /repos/{username}/{reponame}/issues及middleware绑定。主代理点验又发现if initializer中的真实NewIssue未入skeleton；匿名前置调用/else分支反例先失败，initializer保持在其条件前且仍受外层分支约束。真实CreateIssue现141 anchors、NewIssue实参/result保留，loop/short-circuit/动态表达式六个有位置gap保持。33项相关测试/147断言、实际零调用probe通过，证据在verification/av11-go-probe.json；尚未派发Go模型。

- [x] 原始 OWUI ingestion 请求首跑新策略，检验 decorator 入口和跨对象检查/效果，保留全部原义务及真实前提。
- [ ] 同样即时修复；只在生产机制能解释改进时计为修复有效，不修改模型输入到直接给出正确分支。
- [x] 用已暴露 Gitea 做零调用路由/receiver/骨架兼容核对，为完整 GitHub skill 使用准备；不预填授权语义。
- [ ] 如 Python 两任务仍同因失败，优先做一次共享接口重构及真实验证，再处置受影响比较；不把“已写单测”当成真实闭合。

OWUI首次在8872acd9完成21响应/21派发，18来源提案/15局修、0接受单元/0fallback，2次check仍sourceBound=false/ruleConsistency=false；部分终答保留正确入口与输入/输出资源区别，却没有交付source-visible admin/owner分支及默认目的地。独立AI与主代理源码点验见evaluations/av11-owui-first.json。当前需要一次共享修复：source lowering对opaque控制gap内根本不执行的子调用也强制逐一role，阻止外层已支持flow的局部解释；缩小机械解释要求到当前实际flow，opaque块仍完整有位置gap，不默默展平或宣称full。先匿名try/loop及外层早退反例，再同一OWUI具名真实验证。

### AV12 两份完整原 skill 的原/变实际使用

- [ ] Cloudflare security audit 对应 Download，GitHub security review 对应 Gitea CreateIssue；保留完整 SKILL.md 和 companions，普通 native 原任务/政策变化各一次，共四位置。
- [ ] 使用原始公开请求与独立政策。Gitea 新位置须已满足 AV8 新恢复合同；旧消费者未知及旧封存不删除。
- [ ] 检查 remaining skill duties、自然交付、结构检查和真实源码解释，参考文件未读如实记录，不凭包里存在就声称消费。
- [ ] 检验声明辅助的新策略实际被调用；每个失败做针对性共享修复/复验，原/变主位置与修订分别留账。

### AV13 作者稿与原字节消费者

- [ ] 上述两完整 skill 各原/变两稿，共四稿；只从原任务、源码范围、政策和 skill 开始，作者无需手写正确控制图。
- [ ] 作者阶段与消费者阶段职责分开；根目录 inquiry.json/USAGE.md 约定明确。正常字段修订至多一次，原稿与修订分别保留。
- [ ] 独立核对任务忠实性和原字节后消费四稿；无效稿记具体阻塞，不能主代理代写字段后计作者成功。
- [ ] 消费者复用同一核心和真实完整 skill，费用包含准备/声明/解释/修复。作者效度、下游完整质量和真人工时分别报告。

### AV14 政策、前提和源码变化复用

准备阶段的零调用普通init暴露保留声明/program严格比较失败。只读逐字段核验确认唯一差异为v2无entryHint时编译注入own undefined，JSON原件省略后与重编译对象不等；不是声明丢失。当前工作顺序：匿名JSON往返/普通init+compare反例先失败→编译仅在hint存在时加入该字段→保留严格身份检查并对真实保留声明零调用导出。另确认v2 source-update缺少旧focused values通路：加入同形可选values，沿同一用户原文/finite value校验，不从源码填用户事实；匿名已知/未知、源值冒充及跨题映射反例验证。当前OWUI真实run完成前不改共享实现，随后记录新修订与实际变化使用。

原Download基线是behavior；加入独立政策后为conformance。材料兼容目前把这个分析mode变化与源码/原问题变化混同，阻止恢复同一源码解释。小设计修订仅对operation材料层忽略mode与独立policy，仍严格保持完整原operation/questions/source scope及模型/方法/来源依赖；旧答案、check和policy映射继续丢弃。先以匿名已关闭v2基线验证behavior→conformance恢复来源、重算当前政策，另断言修改原问题或来源身份仍拒绝；不修改legacy的完整checked复用准入。

独立代码复核未发现边界问题，但主代理点验shared premise validator发现native把各题文字汇总后可借另一题的已知span绑定未知题；新增行为反例实际失败。共享校验排除仅属于另一题的完整request/premise条目，保留该题文字和实际全局自然brief；相同声明中共享显式文字仍可逐题指定，映射语义保持unreviewed。该补充与普通原件导出一并验证，不把初始复核的“跨题通过”当最终结论。

上述修复已通过73项/547断言和主类型；真实普通init+compare零provider通过，原final-diagnostics基线保留严格身份并恢复两份unreviewed材料，答案/check未复用。v1相同own-undefined问题也先失败后同形修正。verification/av14-retained-baseline-export.json保留实际命令结果；三种输入登记和六个付费变化位置仍待执行。

- [ ] 在 Download 同一包上各登记政策、前提、源码变化，每种 fresh/materials-previous 各一位置，共六位置，完整原任务保持。
- [ ] 政策/前提变化只修改独立输入；源码变化只改开发副本的一个真实相关控制或对象绑定，变化代码对两臂相同。
- [ ] previous 恢复有效材料、重算全部答案；失效依赖具体可查。partial 基础可测材料级恢复，完整任务收益须原/变真实完整。
- [ ] 对比实际新读取/解释/调用/终答/总成本，失败不能自动换 fresh 冒充 previous 成功；环境搬移与预算不再造成伪失效。

### AV15 稳定版本的小型质量比较

- [ ] 选择 Download、OWUI 两个既定任务，普通 native 完整 skill 三臂：N 普通源码工具；M-S 自然任务+新共享核心；D-S 模型声明+同核心，共六初次位置。
- [ ] 固定同一实现版本、原任务/源码/政策、模型、总预算与修复机会；declaration 成本包含在 D-S。自然答案评分不要求 N 有形式输出。
- [ ] 开始前两条纵向链已完成定位/共享机制的真实验证；若仍存在已知共因故障，先修再派。确实不可解时受影响位置写明未执行，仍推进独立作者/复用或其他代码工作。
- [ ] 面板中发现新共享缺陷，暂停受影响行、修复并另列修订版本，已跑首件不替换；比较只在真实同版本/同条件块内进行。

### AV16 机制归因与实际浪费修复

- [ ] 仅当来源骨架/自动参数/局部上下文在真实链被采用，选两种结构做最多两个诊断对照：分别关闭来源辅助提案，保留同一来源工具、模型、预算。
- [ ] 未形成可比较链则零调用记原因，把开发时间用于已定位瓶颈，不强跑消融数量。
- [ ] 找出最高频的无效结构回合与重复展示，做共享渲染/局部更新修复；实际采用、语义质量、调用、token 和耗时并列。
- [ ] 无稳定 DSL 表示优势时明确报告；执行工具的作用和声明方式的作用分别归因，保留有价值的工程交付。

### AV17 独立源码复核与错误归因

- [ ] 每份实际终答按原任务逐条查正确、遗漏、错误、条件覆盖、未交付；保留原终答摘录与源码出处，不用指标替代内容。
- [ ] 独立只读 AI 探子可作 source/raw 核验，主代理沿精确出处抽查裁定；不要称作真人评阅。
- [ ] 区分共享实现、模型领域解释、预算/传输、输入条件和评价争议。纠正评价误判时保存原判和理由，不把它计作模型改善。
- [ ] 汇总每个失败关联的修复、同题复验、是否实际改变及残留原因；明确哪些为不可得来源或当前方法边界。

### AV18 必要回归与零调用重放

- [ ] 跑改动涉及的结构/领域/focus/provider/native/CLI 集合、主类型及本轮 runner 严格类型；与原策略兼容测试一起核验。
- [ ] 从 raw 重算派发/响应/未知/恢复/晚答/首答/修订，确保一个实际请求只计一次，完整 prompt 的 cache-read 只计一次。
- [ ] 新结果和旧 AU 点验原件保持可读且字节未改；新 binary 归档通过现有 Git 属性，无需新建一套冻结链或 clean worktree。
- [ ] 文档单测、链接/目录检查和 diff 一次通过；只有实际修改或失败才重跑对应集合。

### AV19 文档整合、可使用例子与发布

- [ ] 研究统一追加 §7.55 的设计、实际采用、修复效果、未达及下一步；同步 spec、developer-guide、usage 和一个既有 reusable-skill 例子。
- [ ] current-status/current plan 更新为真实当前状态，提供从普通输入开始、查看具体缺口、改条件、恢复执行的已验证命令。
- [ ] 按模块提交并推用户 origin，保留他人变更与历史材料；记录实际远端 SHA 和工作区状态。
- [ ] conversation_log 保存阶段结论及恢复入口，开发成本和项目 provider 成本分列。

### AV20 完成判定与交接

- [ ] 逐项清点工程、真实使用、作者消费、变化和比较；未运行/失败/修订不混算成功。
- [ ] 三项共享缺陷修复、源码辅助实际采用、两种不同结构真实充分交付、两完整 skill 使用及变化复用分别给结论。
- [ ] 所有适用工作终结可记 `finiteQueueComplete:true`；存在完整质量/实际使用等未达时用 `completed-with-unmet-criteria`，不得将研究目标标为达成。
- [ ] 提供仍失败的精确问题、最后一次修复及结果、下一具体代码责任。队列完成后停止，不无限重抽或无目的扩任务类。

## 六、可直接落地的首批失败测试

AV1 在 `structure-index.test.ts` 增加以下测试。生产修复要同时覆盖 createInquiryTools 透传；不能只在测试中删 extra 字段：

```ts
test("runtime settings do not change source identities", async () => {
  const files = [{ path: "app.py", content: "def inner(x):\n    return x\ndef outer(x):\n    return inner(x)\n" }];
  const first = { repository: "fixture", sourceRef: "r", sourceRoot: "D:/a", maxToolCalls: 24 };
  const second = { ...first, sourceRoot: "D:/b", maxToolCalls: 64 };
  const a = await buildStructureIndex(files, first);
  const b = await buildStructureIndex(files, second);
  expect(a.symbols.map(s => s.id)).toEqual(b.symbols.map(s => s.id));
  expect(a.calls.map(c => c.id)).toEqual(b.calls.map(c => c.id));
  expect(a.revision).toBe(b.revision);
});
```

AV2 在 `operation-links.test.ts` 使用已有 fixture；合法范围来自真实索引，不从模型答案手造：

```ts
test("an exact candidate range in pathHint preserves the source link", async () => {
  const { index, units } = await fixture();
  const caller = units[0]!, helper = units[1]!.source!;
  caller.blocks[0]!.steps = [{
    kind: "call", name: "gate", symbol: "a.check", claim: "Actual source call",
    pathHint: `${helper.path}:${helper.startLine}-${helper.endLine}`,
    arguments: [{ parameter: "actor", object: "actor" }],
  }];
  const linked = bindOperationCalls(index, units);
  expect((linked.units[0]!.blocks[0]!.steps[0] as { callee?: string }).callee).toBe("a");
  expect((caller.blocks[0]!.steps[0] as { callee?: string }).callee).toBeUndefined();
});
```

AV3 在 structure-index 测试增加实际 import/decorator fixture；配套 worklist 反例须断言 selected 不是 AuditLogger.write，而非只检查候选数组：

```ts
test("a source-bound decorator route identifies its function", async () => {
  const index = await buildStructureIndex([{
    path: "app.py",
    content: 'from fastapi import APIRouter as Router\nrouter = Router()\n@router.post("/items")\ndef create_item(request):\n    return request\nclass AuditLogger:\n    def write(self, message):\n        return message\n',
  }], { repository: "fixture", sourceRef: "r" });
  const handler = index.symbols.find(s => s.qualifiedName === "app.create_item")!;
  expect(index.routes).toContainEqual(expect.objectContaining({
    method: "POST", path: "/items", candidateIds: [handler.id],
  }));
});
```

后续阶段的反例先按现有类型构造，不把“新函数尚不存在”当唯一失败证明。AV4–AV8 的最低行为矩阵：

| 反例 | 必须观察的断言 |
|---|---|
| if 真分支 return，假分支到 effect | 真分支求值不经过 effect，假分支保留 |
| 同源码两个对象上的同名 helper | 两条 source call/receiver 分开，模型标错对象不能通过 |
| 调用关键字交换顺序 | 按形参名机械绑定而非文本顺序；动态 kwargs 保留 gap |
| 原文已有但模型没给条件角色 | interpretation-gap，保留原文，下一动作为解释而非再读 |
| policy 未给但任务是 behavior | 行为结果可交付，未请求 conformance 不增加失败义务 |
| 超时旧请求后来返回 tool_calls | 旧请求计量可补记，工具执行计数为零，新状态不变 |
| 同请求一次恢复也超时 | 终止该位置恢复，不新增第三次；两个请求/未知均留账 |
| 源文件未变但新增 override | candidate 依赖失效，旧调用解释不继续 current |

每阶段跑对应命令，预期新反例先失败、实现后通过。最终再跑有关联合集合，避免每个小改动都扫历史全库：

```powershell
Set-Location 'D:\skill优化\SkVM'
bun test ./src/benchmarks/authorization-dsl/evidence-preparation/structure-index.test.ts ./src/benchmarks/authorization-dsl/operation-links.test.ts
bun test ./src/benchmarks/authorization-dsl/inquiry-domain-scheduler.test.ts ./src/benchmarks/authorization-dsl/inquiry-focus.test.ts
bun test ./src/benchmarks/authorization-dsl/telemetry.test.ts ./src/benchmarks/authorization-dsl/inquiry-native.test.ts
bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl
bun run typecheck
python -B -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py
python -B scripts/check_skill_ir_doc_links.py
bun ./scripts/experiment-catalog/cli.ts check --root=. --catalog=results/skill-ir/experiment-catalog.json
git diff --check
```

新增 source-selector/source-skeleton/source-interpretation 文件后各跑相邻 `.test.ts`；agent-loop 有修改就补其实际测试并纳入联合集合。本轮 runner 创建严格 tsconfig，命令固定为 `bun ./node_modules/typescript/bin/tsc --noEmit -p ./results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/tsconfig.json`。AV9 的 `study.ts check` 和 `replay` 都为零 provider/目标执行。

## 七、真实执行、成本与即时修复

输入沿用 AU `model/inputs/paperless-download.json`、`owui-ingestion.json`、`gitea-create-issue.json`，来源保留锁定框架版本；只机械重定位 sourceRoot 到当前副本。完整 skill 位于 `results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/` 与 `github-security-review/`。不得把 AU 答案、评阅行号清单、正确控制图或模型误答的答案式纠正写进 model 目录。

初始工作位置：纵向调试2、native4、作者4、消费者4、变化6、质量6，共26位置；机制诊断最多2位置。位置是防止隐藏失败的目录，不是必须消耗的调用配额。通过一项实际运行同时验证多个工程性质时引用同一原件，不重复派发、不在实验样本数中重复计数。受依赖影响未执行的内容明确处置，独立工作继续。

运行默认24次 provider 派发、64次来源工具动作、768KiB累计源码展示、32MiB读取/索引、6000输出tokens、300秒单请求时限；恢复计入总预算。作者12次派发及一次正常字段修订，原/变一致。不要在30分钟 session timeout 与24×300秒之间形成未说明的隐含截断：AV9 明确生产实际 session cap 并对比较各臂一致。需要调整限额必须先登记理由；旧失败不换预算后覆盖。

每个不良表现当场执行以下过程：

1. 保存首件、当前实现版本、最后终答、阶段与确定性诊断。先判断是共享 bug、模型语义、来源/输入、传输或评价错误。
2. 可定位共享 bug：暂停受影响派发，匿名失败测试，修生产核心，同一触发任务具名复验；不把修复仅做在研究 runner 或单个生成包。
3. 模型漏读/漏分支：检查结构覆盖、调度、上下文和提案负担，至少做一次有证据的通用修复/诊断。反馈只用模型当次可见材料与工具诊断，不告诉正确业务结论。
4. 相同原因两轮没有新进展，改接口或缩小局部解释单元，原任务完整义务继续保留；不要 AU 那样不断添加一个新容器容错再烧整次会话。
5. 一次修复可覆盖多处同因失败；逐项关联其适用性。真实已知闭合原件可零调用重放机械缺陷，但语义收益需要真实消费验证。
6. 来源不可得、独立条件未给或方法暂不支持时，保留具体未达并继续独立工作。旧未知费用始终保留；新只读超时按3.4处理，无需整任务无限封存。

报告必须含终答内容与缺项，而非只有 full/partial 数字。成本按每真实请求保存 fresh/cache/output、完整 prompt（cache一次）、耗时、超时/晚答、准备与修复成本。USD 未报告就 unknown；真人未参与计时则 human time unknown；开发主/探子消耗单列，不估造净节省。

## 八、验收、约束与恢复

| 层次 | 本轮期望成果 | 未达到时如何交付 |
|---|---|---|
| 共享工程 | 三项实证缺陷修复；两个入口共用源码辅助核心；晚答不会执行工具 | 精确失败反例与责任模块，旧接口继续可用 |
| 真实任务 | Download/OWUI 完整原问题有据回答，内部检查与自然说明一致 | 逐义务 partial，区分源码/解释/条件/政策原因 |
| 原 skill 使用 | 两完整 skill 原/变实际使用，作者合格原字节被消费 | 首稿、修订、无效与下游阻塞完整保留 |
| 变化复用 | 政策/前提重算、源码失效与普通恢复可运行 | 材料级实际采用单列，不提升完整任务收益 |
| 方法效果 | 同条件比较结构支持与声明表示的质量/开销 | mixed/negative/未建立照实写，不为了正向更换任务 |

不执行目标应用，不做 whole-skill 自动转换或新任务类迁移；不引入新的人工审批仪式、冻结层和哈希链。必要原件绑定继续使用现有工具。代码修复、来源结构事实与评价真值分开。不得用“测试全绿”“有限队列完成”替代真实质量结果。

执行中遇到小设计变化，先在本任务书/spec 同步实际接口后继续；大方向变化要说明原因，但不要因日常 schema/路径/只读恢复问题再次等待用户批准。研究目标没有达到时诚实收束，持续目标工具不能写成研究已成功。新线程完成本任务书全部适用工作后结束；后续再按真实结果选择方向。

## 九、交接记录

- 2026-10-06：根据 AU 收束复核和两项只读代码定位形成 AV0–AV20。当前仅任务书、spec、研究决定与导航更新；未修生产代码，未启动本轮模型实验。用户指定 GPT‑6.1 Sol / max / Flash；模型和推理强度可派发，Flash 状态未由工具核实。
- 2026-10-06 AV0–AV2：接管时工作区干净，HEAD `531bc80d`。来源身份及统一选择器已实现；AV1四项、AV2三项行为反例先失败后通过。相关58项测试/267断言、主类型通过；旧Download副本连接1项，仍有1项语义失败。原件SHA保持、provider/目标执行均0。继续AV3，恢复入口为AV `status.json` 和 `verification/av1-av2.json`。
