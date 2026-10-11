# BE0–BE18：领域问题前端、相关依赖与机制价值验证

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan. Use test-driven development for production changes. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 修掉真实任务中错误的框架义务和重复上下文，让模型围绕源码中的授权问题提交含义，宿主承担定位、身份、连接、组合和失效；交付可独立运行的领域辅助 H 与声明检查 D，并用完整原 skill 的 N/H/D 同条件运行判断实际价值。

**Architecture:** 复用 SkVM 普通 inquiry、完整 skill 加载、官方账号 adapter、只读工具和 BB/v7 跨调用检查。共享源码解释按来源与实际调用上下文保存，逐题绑定与结论分别维护；H 不依赖 source-edit 才能推进，D 将领域声明编译到现有检查核心。禁止通过放宽对象/可达性/版本校验获得 checked。

**Tech Stack:** TypeScript、Bun、Zod、已有 structure index 和有限求值器；Python 仅用于现有文档检查。开发 `gpt-6.1-sol/max`，实验沿用用户已授权官方账号 `gpt-5.6-sol/high`。

状态：`completed-with-unmet-criteria / BE18已发布`，实质成果`96ed3472`与live远端一致，发布回执另行提交。规划基线 `6c8c79e31588503e6335c1c285ffe0817d7a5b3d`，接管 `be13cfc0bea4fa7be148a997670cd0819e04d97c`。六质量首位置、两具名D修订及六变化逻辑位置已交付：16归档/14模型运行/2推理前失败，原质量整题0/6 full、全部实际0/14。10D共35检查unknown、0合格跨源性质；三个previous实际材料使用0，变化tradeoff/negative/no-observed-difference。最终源码树`f3bce237`；225核心测试/1418断言、12研究测试/68断言及主/研究类型通过。finiteQueueComplete/publicationComplete true、researchGoalAchieved false；BE0–BE18执行关闭，条件未执行和未达责任保留，原件和epoch不回填。

BE13现场细化：D2反复提交自由文本`test.expression`被拒；实际归档和独立点验确认现有求值器支持truthy，发送的谓词指南却漏了它。只补通用truthy及语言/operand合同到D静态工具说明和当前指南，保留严格拒绝与旧求值语义。公共账号链先红绿，再固定源码做一次`quality-d-1/predicate-guide-1`具名复验；D独有说明改变，未变N/H只作明确引用control，不加样本/费用。六首件和第一份可恢复D变化基础不替换，不向模型提供当前案例含义或参考答案。

Identity：`authorization-question-workflow-v1`。结果统一进入 `results/skill-ir/skill-dsl-research/development/authorization-question-workflow-v1/`，临时会话统一进入 `D:/skill优化/project-maintenance/runs/authorization-question-workflow-v1/`。不得回填 BD 原件或续用其位置身份。

## 一、先读什么与已经确认的决定

按顺序阅读；基础设计由主开发者亲自读，巨型原件只提取所需字段：

1. 根目录与仓库 `AGENTS.md`、[当前状态](../../skill-ir/current-status.md)、本任务书全文。
2. [研究总文档](../../skill-ir/skill-dsl-research.md) §1、§7.63–§7.66、§11；[spec §14.44](../../skill-ir/skill-ir-aot-optimization-spec.md#1444-be-question-workflow-and-mechanism-value)。BB–BD 是机制形成过程，BE 是当前开发决定。
3. [BD 验收矩阵](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-completion-v1/verification/acceptance-matrix.json)、BD 两份 D `mechanism-evidence.json` 与四份 `source-review.json`。不要一次输出 25,000 行 summary 或整个 telemetry。
4. 即将修改的源码完整阅读；普通入口和账号说明按需读 [usage](../../usage.md) 与 [developer-guide](../../skill-ir/developer-guide.md)。跨线程决定读根 `project_handoff.md`、`project_communication.md` 的最新恢复节，不从历史暂停记录重建当前授权。

本轮承接两次只读复核：

- BB 已实现跨单元限定引用、调用实例和实参/形参关系。`property-query.ts` 有 `PropertyQueryContext` 和 `bindInterproceduralQueries`，不是仍只有单 skeleton 的旧实现；不重复造 resolver，也不把相同裸 anchor ID 当跨函数对象等价。
- BD 四质量首件均交付、格式拒绝为 0。N 逐题 6/8 full，D 4/8 full，四整题均 partial；两对为 tradeoff/negative。它们来自同一开发任务的两次重复，不能当 16 个独立任务。
- D 多出来的 input 不能全部归因于格式重试。实际存在重复 context、同入口跨题重复解释、语义编辑/连接拒绝和额外领域工作；要量实际送给模型的内容。
- 已复现共享错误：`operation-work.ts` 以 `mro.some(c => c.startsWith("rest_framework."))` 触发请求 dispatch 义务，连 Serializer/IntegerField 都被要求 dispatch。`inquiry-worklist.ts` 的 `$framework` 依赖又可能扩散到该 operation 的全部问题，进入性质阻断。
- 字段名、事务 ID、源码位置不构成答案泄漏；角色、条件、对象含义需要读源码。新前端减少模型处理机械字段的工作，不能给它塞入正确评阅、特定案例结论或人工金标准。

## 二、本轮交付与边界

交付五项：

1. 请求 receiver 与普通数据类分开；候选线索、真正相关义务和仍待判断的边界分开。
2. 源码含义可跨题复用、逐题性质仍独立；实际 context 去重/按需呈现，保留查询完整材料的办法。
3. 可独立运行的 H 领域辅助，以及 D 领域问题/语义声明前端。二者复用同一只读取证与覆盖辅助；D 额外连接现有有限检查器。
4. 两轮完整任务 N/H/D，共 6 个质量首位置，以及有条件的 3 种变化 fresh/previous 对照。质量位置不以 checked 为准入。
5. 普通入口、真实采用链、结果与成本分账、复盘及目的清楚的提交和发布。

保持单 repo/ref、源码可见的授权/信任边界评估。主任务仍是现有完整 Cloudflare security audit skill 下的 Paperless Download 四问；不是重新定义成一个已知容易问题。OWUI 本轮仅离线复核，旧未知处置保持。held-out、Q1、prospective、readiness、历史 `0/6` 和所有原件不变。

不扩 Python/Go 语义全集，不新增按 Paperless、Download、类名或 skill 名称命中的成功分支，不另造 CLI/平台/HTML。允许为当前公共反例修必要共享行为；若发现需要新的大方向，先记录证据和方案，不把连续授权解读为无限扩张。

开发精力约六成用于质量与机制、四成用于编写和复用。比例是安排精力，不是降低质量验收要求。连续推进所有可执行任务，常规检查点不等待用户；不靠等待、重复审计、增加无信息调用来凑时长。

## 三、方法与实验合同

### 3.1 领域前端与机械后端

模型面对的是“这段源码做了什么授权判断、约束哪个主体/对象、哪些分支到达什么效果、证据和未知在哪”。宿主负责源码位置、版本、身份、已知调用参数对应及依赖失效。前端至少承载：领域主张、原文定位、对象/条件/效果含义、调用关系候选、残余问题。不得只把原 `{slot,value}` 表单换一个名字。

编译器把这些主张解析为已有标注、条件、调用连接及性质候选。纯机械且唯一的引用由宿主填写；多义对象、未证调用、条件含义交给模型判断。未表达的调用作用保留 unresolved，不推断为纯函数或无效果。模型写的自然解释不得未经验证直接变成 checked。

同一来源 revision 的含义与“它回答哪一题”分开：源内局部事实可共用；实际 receiver、调用实例、输入假设或上下文改变会改变含义时，分开实例化。问题/政策/前提仍限定性质绑定和结论。不同题下的对象、守卫次序、权限不能借共享缓存混同。

保留现有四类性质、跨函数值流与可达性检查。一次 caller 调用可保留 call 关系和 effect 语义；守卫/效果跨源必须沿实际可达调用、对象传递及条件关系检查，不能仅靠两个 ref 都存在。允许已闭合局部性质交付，同时逐题保留其他缺口；完整任务仍按原四问评价。

### 3.2 N/H/D 的准确含义

| 臂 | 保留的共同输入 | 加入的机制 | 交付要求 |
|---|---|---|---|
| N | 完整原 skill、原四问、允许源码、独立政策/前提、共同只读工具 | 原普通分析路径，关闭领域机制 | 同一自然答案与引用要求 |
| H | 与 N 相同 | 领域问题定位、来源索引、相关覆盖/缺口辅助；不强制 source-edit/propertyBindings | 同一自然答案；辅助采用单列 |
| D | 与 H 相同 | 模型语义声明、宿主编译/组合、性质检查及依赖失效 | 同一自然答案；声明/检查结果单列 |

H 必须真的能独立前进，不能依赖隐藏的 D 提交、伪造全完成状态或关闭辅助调度后仍叫 H。H/D 的共同 helper、原文与回答指南一致，D 多出的声明/编译/检查及恢复全部收费。N 使用普通共同只读工具；如果 H/D 增加定位能力，N–H 测的是工具方案增量，H–D 测的是有检查声明的整体增量，均不单独宣称语法优势。

目标显式策略名为 `question-guided-v1`（H）、`question-checked-v1`（D），复用既有 `--strategy` 和账号入口。N 保持 `M/legacy/domain-tools=false`。H 使用 M 自然任务路径；D 使用 D1，但原任务输入相同，模型生成的结构化任务准备必须记录并计费。如果代码要求调整这些组合，应在 BE7 更新本合同及命令后实施，不另造研究私有入口。

三臂原问题、skill 字节、源码范围、模型/effort、工具/读取/显示/会话上限、自然终答要求相同。D 的机器产物不得成为自然答案能否保存的额外门槛；不完整声明照常记录，源码语义质量另评。评价器、历史答案、修复记录与本任务书不进入实验模型上下文。共有提示只表达题目要求，不注入某条真实路径的正确权限结论。

如D需要额外模型转换，其allowlist仅含共同原任务/skill/政策前提、允许源码内已实际读取的片段、当次模型自己提出的声明和相应校验反馈。它与主会话共用模型、范围、动作/读取/显示/时间预算，不继承开发线程上下文；显式转换派发及其工具分别登记且只计一次。已确认终态的转换失败影响机器产物，仍允许原预算内自然交付；转换unknown按通道规则核查，不另派请求绕过。

### 3.3 计量与结论

保留实际 tool-result、currentContext 和静态工具 Schema 的可计量投影，按源码、任务/skill、状态/缺口、Schema/协议四类记录 UTF-8 字节及重复发送。账号 input/cache/output 采用原 usage 口径，缓存只计一次；无精确分组件 token 时报告字节，不能换算成已知 token 或因果“协议税”。源读取、自动调度、语义提交、拒绝、最终检查、隐藏/额外模型调用分别计。

评价同时列：自然逐题 full/partial/incorrect/未交付；整题完整；相关材料实际采用；当前跨源 checked/violated/unknown；源码评阅；交付/通道/格式；总成本和变化采用。协议失败继续留在端到端分母，已交付答案的条件质量另列，不删除失败提高质量率。

比较保留 support/tradeoff/no-observed-difference/negative/inconclusive。两轮一任务仅支持 development 判断；没有统计显著性、跨项目或普适 DSL 胜负结论。不得用任意 40%/60% 开销阈值自动废弃整个架构，也不能因为全测试通过就保留一条真实无收益的默认路径。

### 3.4 复用的三层资格

| 层 | 可复用什么 | 必须核对什么 | 可以声称什么 |
|---|---|---|---|
| R0 来源准备 | 索引、读取过的原文/机械定位 | repo/ref、路径/字节、范围与运行版本 | 准备/读取开销变化 |
| R1 语义材料 | 模型已提出且当前有效的局部含义，包括带残余的 partial | 来源、receiver/调用上下文、含义依据与问题/政策依赖；逐条失效 | 材料保留与重复解释变化 |
| R2 性质结论 | 当前 checked/violated 及其依赖 | 独立源码支持、真实跨源 trace、当前政策/前提/源码、可恢复会话 | 合格性质的重算/失效/复用 |

没有 R2 不能复用旧 verdict，却不自动禁止 R0/R1 工程或变化实验。复用会话不携带旧自然终答、评价器或评语；从源材料重算当前题。R1 部分解释必须保留缺口和未审阅含义，不当作真值。实验首轮前锁定：变化选择第一份可恢复 D 主会话；按逐项资格选择 R1，只有 R1 也不合格才用 R0；R2 满足则另列，不因哪个结果好而事后选基础。

在首次变化派发前保存一次`reuse-baseline.json`：baseSessionId、baseAttemptId、codeEpoch及已有来源/政策/前提快照引用，沿用session身份，不新建平行哈希链。对变化输入逐项输出R0/R1/R2的adopted/rejected/recomputed/unknown及依据；缺少依赖信息为unknown，previous只装入经确认仍有效的材料。R1资格包括语义原提案的来源与当前receiver/调用上下文，不以parse成功代替依赖有效性。

## 四、逐项执行

### BE0 — 接管与责任固定

**Files:** 本任务书；新结果目录 `manifest.json`、`status.json`；只追加根 conversation log。

- [x] 确认分支、工作树和最新提交；记录其他改动并保留，不清理历史材料。
- [x] 记录本轮仅 6 主质量位置和 6 条件变化位置。requirements 与 outcomes 分开，未测结果用 pending/null，不能把验收目标写成已成功的 true。
- [x] 按本计划读取具体原件和修改代码；将“已实现跨源绑定”“BD无格式拒绝”“实际context和归档不同”登记为防重复开发约束。
- [x] 建立阶段状态和恢复命令，先进入 BE1，不启动额外账号健康探针。

### BE1 — 把错误 DRF 义务写成公共红测

**Modify:** `src/benchmarks/authorization-dsl/operation-work.test.ts`；按需补 `inquiry-worklist.test.ts`。

- [x] 加一个匿名来源 fixture：`rest_framework/serializers.py` 中 Serializer；`rest_framework/fields.py` 中 Field/IntegerField；应用里的 DataSerializer 和一个真正的 View/dispatch/permission 链。
- [x] 通过 `buildStructureIndex` → `operationWork(...,{sourceAssisted:true,questionDirected:true})` 调用现有公开路径；断言普通数据类不产生 `drf:<class>:dispatch`，真正 request receiver 仍有必需检查和缺失诊断。
- [x] 原谓词应使 Serializer/IntegerField 两项失败；先运行并保存这个实际红证据，不能只写过滤 helper 的镜像测试。
- [x] 追加“同包名但非请求对象”“应用改名/别名”“真实 view 的继承权限缺失”反例，避免靠名称白名单修好案例。

测试命令：`bun test ./src/benchmarks/authorization-dsl/operation-work.test.ts ./src/benchmarks/authorization-dsl/inquiry-worklist.test.ts`。

### BE2 — 修请求 receiver 的适用范围

**Modify:** `src/benchmarks/authorization-dsl/operation-work.ts`；仅必要时修改现有 receiver/frame context 类型。

- [x] 用现有 route/action/receiver/可见继承来源判定请求职责，替换任意 `rest_framework.*` 基类即强制 dispatch 的逻辑。
- [x] 区分“确认数据对象”“确认请求 receiver”“请求关联尚未证实”。真正请求入口的 dispatch、initial、GET模型权限、对象权限和未采用框架次序仍保留。
- [x] 未知 decorator 的影响不能通过“只是文档元数据”猜测消除；纯候选来源不直接升级为所有原题的必需授权义务。
- [x] BE1 红绿通过；保存一个 BD 当前提案派生比较：错误义务减少多少、真正义务是否保留。旧归档字节不改，派生件不算真实模型成功。

### BE3 — 限定真正相关的阻断依赖

**Modify:** `src/benchmarks/authorization-dsl/inquiry-worklist.ts`、`src/task-dsl/authorization/control-conclusion.ts`；相关测试。

- [x] 先测：另一个 action 的响应 Serializer 不阻断当前下载性质；注册在当前路由的权限 middleware 仍阻断；未知变换若可能影响当前 receiver 则具名保留。
- [x] 给依赖保留来源、具体 receiver/调用/路径及关联依据。候选发现、取证待办、决定性检查义务分开，避免把所有 `$framework` 缺口扇出到所有题。
- [x] 依赖不相关须有结构依据；未解决相关性不能默认当无关。日志能解释为何某缺口作用于哪项性质。
- [x] 通过普通 runtime/promptContext/validate 的公共链验证，而非只在 scorer 中过滤 diagnostics；确认错对象、未注册、guard后置等旧反例仍拒绝。

### BE4 — 测量实际上下文与反馈

**Modify:** `src/benchmarks/authorization-dsl/inquiry-native.ts`、`inquiry-domain-runtime.ts`、`src/adapters/codex-account.ts` 的现有计量/回执接点及测试。

- [x] 在实际 `runtime.definitions` 与 `{toolResult,currentContext}` 发送边界采样，不把 archive `report.domain`/完整 worklist 当模型收到的内容。
- [x] 记录每次上下文各部分字节、稳定部分重复次数、当前可选动作和源范围；正常日志不重复存放巨型全文或凭据。
- [x] 用 BD 的可恢复原轨迹做零调用派生；明确不可恢复的实际发送字段，缺少的量保持 unknown。
- [x] 公共 mock transport 断言计量与实际发送对象一致。当前渲染字节和历史 provider token 分列，不能声称测到历史精确协议 token。

### BE5 — 共享源码解释与按需上下文

**Modify:** `src/task-dsl/authorization/source-materials.ts`、`src/benchmarks/authorization-dsl/source-material-projection.ts`、`inquiry-focus.ts`、`inquiry-domain-runtime.ts` 及现有源材料测试；新增模块仅在现有职责无法容纳时使用。

- [x] 核验现有材料仓：同 source/revision/receiver 的入口被两题使用，只保存一份可共用含义；题目专属 propertyBindings 不串用；两个实际调用不同主体/资源仍隔离。现有去重与调用身份已实现，不重复修改核心；新增公共投影断言，新增行为仍先红测。
- [x] 复用现有材料仓和调用实例，不删除 questionId 验证后强行共享。用源材料到各题视图的确定性投影处理老合同。
- [x] 实际 currentContext 默认只含当前领域问题、有关原文/提案、变化和具名缺口；完整已读材料可以按需取回。不能重复发送全 worklist/全部草稿，也不能截断决定性分支而没有提示。
- [x] 源改变、receiver变化、政策/前提依赖变化、显式撤回分别测试；保持稳定身份，不把 prompt 渲染变成推进状态的动作。
- [x] 按同一可重放调用序列报告 before/after 发送字节与保留信息，真实 token 收益留给 BE12–BE13。

### BE6 — 领域问题与语义声明前端

**Create:** `src/task-dsl/authorization/question-workflow.ts`、`question-workflow.test.ts`，承载一个窄、可演进的领域前端。**Modify:** 既有 source-edit/任务性质准备的适配接点；不复制整个 lowering 核心。

- [x] 定义来源支持的 statement/condition/object/effect/dependency/residual 语义，复用已有有限谓词和引用。模型可以解释一段相关源码，宿主生成机械标识；无需按每题重填同一整段函数的全部 slot。
- [x] 前端反馈用当前领域问题与具体语义缺口表达，例如“所述守卫约束的对象尚不明确”，保留原文引用；不要只列十几个哈希字段让模型猜值。
- [x] 对存在多义的调用、对象和条件提供候选出处，不把其含义写死。可唯一推导的绑定来自当前真实模型材料和源码，不来自评价器。
- [x] 写匿名跨函数 positive 和错主体、错资源、guard不可达/后置、缺权限、失效版本 negative。正例必须从领域声明经公开适配器进入现有 v7 检查，不直接手造最终 checked 对象。
- [x] 同一调用兼有语义作用时保留真实 call 关系；支持已有合法表示，表达不了时给具名残余，不把未解释 call 当无作用。

### BE7 — H 独立取证与 D 编译接线

**Modify:** `control-slice.ts` 策略登记、`inquiry-domain-runtime.ts`、`inquiry-focus.ts`、`inquiry-wire.ts`、`inquiry-native.ts`。必要时新增单一 `question-workflow-wire.ts`，职责仅为前端工具合同。

- [x] 显式登记 `question-guided-v1`/`question-checked-v1`，保留旧默认和历史策略可读性。H 不自动继承会强制 source-edit 的 isFocused/isSemantic 链。
- [x] H：只读定位、有关领域问题、覆盖与缺口可运行；没有 D 草稿也能继续读源码和自然交付。工具和 context 均不暗含必填低层协议。
- [x] D：前端声明→既有角色/谓词/对象连接→性质候选→独立求值，状态/诊断可见；机械推导唯一候选，多义保持待判断。
- [x] D 同时保存自然回答和机器材料状态；机器 unknown 不吞掉自然答，答案也不能把 unknown 偷写成 confirmed safe。
- [x] 若转换需要额外模型调用，使用同次实验隔离上下文，完整计入请求、用量、时限和修复账；不得用开发代理在后台补正确语义。

### BE8 — 普通入口、账号静态 Schema 与可恢复会话

**Modify:** `src/cli/authorization-inquiry.ts`、`inquiry-local.ts`、`adapters/codex-account.test.ts`；新增 `question-workflow-entrypoints.test.ts`。

- [x] 验证 `check/run/inspect/compare` 的显式策略组合；完整 skill 继续用 loadRunSkill/materializeNaturalRunTask/buildRunSkillBundle，不在研究 runner 自造替代包。
- [x] 静态 thread/start tool Schema、实际模型反馈、参数 parser、阶段准入共同测试。官方账号不是只测 provider beforeDispatch 就算接通。
- [x] 一条 transport 测试走原文读取、H领域定位和自然交付；另一条走 D声明/编译/跨源求值/自然交付/会话存档；断言不存在 oracle、root开发文档或旧答案注入。
- [x] 普通 session 支持 R0/R1/R2 分层 inspect/compare/previous。含义复用仍带出处与缺口；没有 R2 时不能沿用旧结论。
- [x] 在 usage 补可运行命令前，先在真实 CLI 路由上执行零模型 check 和 mock consumer。不要发布尚不存在的选项。

### BE9 — 机制反例与当前派生诊断

**Modify:** BE结果 `verification/` 中的诊断脚本与测试；生产反例仍在对应模块测试。

- [x] 合并 BE1–BE8 的公共链红绿记录；零模型重放 BD D1/D2提案，报告错误框架义务、材料数、重复单元、实际context和性质状态变化。
- [x] 不为旧模型提案补新含义；不能兼容的新前端字段保留“没有原始提案”，用匿名 fixture 检查表达能力另列。
- [x] 核对核心跨源反例：实际相同调用/对象才能组合；未注册守卫、不同principal/resource、两次调用实例、源撤回和权限不符均不能 checked。
- [x] 若字段减少但公共链仍要求模型处理原全部 slot，回到 BE6–BE7修正，不能直接用更多真实调用试运气。

### BE10 — 有限研究入口与公平性测试

**Create:** 新 identity 下 `study.ts`、`runner.ts`、`summarize.ts`、对应测试和 `tsconfig.json`；适度复用 BD runner 支持函数，不修改旧 study/manifest/replay。

- [x] 六主位置：`quality-n-1`、`quality-h-1`、`quality-d-1`、`quality-d-2`、`quality-h-2`、`quality-n-2`，按此顺序执行。同一完整任务重复两轮，每轮三臂；四子题是相关观察。
- [x] 原 skill：`results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/SKILL.md`。
- [x] 原输入：`results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/model/packages/download/inquiry.json`。沿源快照确认四问、95允许源及22文件skill；复制或重定位仅改机械路径，不人工准备 D 独有答案声明。
- [x] 新 study 提供 `prepare <position>`、`run <position> [named-revision]`、`replay`、`summarize`。prepare 不调用模型，检查公共输入/工具边界；run在派发前核对位置及输出未占用。质量准入没有 qualified property 条件。
- [x] 变化登记 policy/premise/source 各 fresh/previous 六位置；沿 BC 同三变化事实与文件，先人工确认事实合同但不向模型写正确结论。按 §3.4 独立选择材料层级，不能因为 D0性质就统一封存所有变化。
- [x] 公平性红测覆盖旧答案泄漏、D 独有预加工、缺题、不同预算、隐藏模型转换、首件覆盖和同一费用重复计数。

### BE11 — 离线准备与实际失败后的现场修复

- [x] 先通过新入口匿名正反例、主/研究类型和受影响回归，再准备第一个实际主位置；不单独调用模型健康检查。
- [x] 每次真实响应立刻检查：通道/传输、回答逐题、源码材料/性质、实际context、预算。失败先保留原件并定位，不能等六位置跑完再改已知共享缺陷。
- [x] 可复现实现错误：红测→共享修复→绿测→具名复验；其他独立任务继续。语义遗漏：据当前原文检查是没有读、错误调度、表达缺口还是模型判断，作一次有依据的通用修复和具名复验，不向模型给参考答案。
- [x] 没有可证共享改动时保留自然失败，给可检查诊断；禁止为了“当场修一次”编造代码或幸运重抽。同因两次无保留进展转确定性定位，新根因可继续处理。
- [x] 每个修订有名称/理由/实际代码版本；首件永不替换。共同 helper/提示行为改变时重建受影响比较；仅 D 独有处理改变可引用未变 N/H 作明确的修订比较，引用不增加样本或重复记费用。
- [x] 质量position身份保持六个，首件各一次；复验归入同一position的独立revision/attemptId/codeEpoch。首件表与各epoch修订表分别汇总，不能把两者混成一轮。总成本按唯一attempt/request计一次，包含转换、修复和复验；引用旧control只引用证据，不再累加样本或费用。新修订必须写明与哪些control仍可比较及原因。

### BE12 — 完成首轮三臂并即时评阅

- [x] 执行 N1→H1→D1，保留完整四问，不把 Q3 已知容易改成唯一问题。原答评阅逐项回到允许源码，分支遗漏、事实到结论映射及错误陈述分别记录。
- [x] 评阅尽量在不知道臂名/成本时先裁定；独立只读意见仍由主线程核对具体出处，不能照搬旧 source-review 结论。
- [x] D 的失败同时定位前端、采用、调用组合、相关依赖、性质/终答，不以机器 partial 推导自然质量 partial。
- [x] 有合格当前性质则记录非空真实trace、跨源定位及独立源码支持；无则列第一个实质缺口，继续 H/N质量及 BE13，不能把此条件变成总闸门。

### BE13 — 第二轮与机制价值判断

现场修复续项（2026-10-11）：`quality-d-1/predicate-guide-1` 已完成；模型实际采用 `truthy/python`，但 history[47] 的有效部分声明触发 `annotation.condition` TypeError。当前绑定性质缩小需求集合后，仍可达的未声明文件名分支不在 `missingFields`，lowerer 却直接解引用其注解。先用保存的原声明做零模型复现，再用匿名的性质外分支/raise 红绿测试修复为显式未知，保持严格授权、对象及调用检查；同步汇总中的工具错误字段。该新根因允许一次独立具名 `partial-source-1` 复验，不能重抽同一 guide 原因或替换首件。随后继续六个变化位置；原件、失败及新增成本全部保留。

- [x] 同合同执行 D2→H2→N2；延续 BE11 现场修复。全部实际尝试、修订、未运行原因及源码epoch可追溯，不用成功修订挤掉首轮。
- [x] N–H 看定位/覆盖辅助；H–D 看声明/编译/检查增量。统计逐题准确/完整、整题、交付、token含缓存/非缓存、耗时、工具/自动单位和反馈字节，不仅报 full 总数。
- [x] 逐题解释收益和退化，尤其是否真正找到新决定性源码或避免错误对象，而非仅改变回答措辞。同等质量的开销变化可作为工程收益，但仍报告新增准备/编译成本。
- [x] 六首件D无优于H的自然质量；具名partial-source-1补齐root/self fallback，Q1/Q3改善、Q4退化为partial，对H为tradeoff，对N2为support，成本更高且仍无跨源性质。H作为普通取证低成本候选，D留显式研究；不把修订比较当原同epoch或因果修复收益，不改全项目默认。

### BE14 — 三种变化、分层复用与实际消费

**Modify:** 普通 previous/compare 的分层接点（如尚缺）；BE变化runner与验证。

2026-10-12本地恢复细化：`source-previous/original`因中断期间CLI自动升级为未验证`0.162.0-alpha.17.2`，在`turn/start`前停止（unavailable/not-started/inferenceDispatched:false）。13个已完成原归档实际版本均为`0.162.0-alpha.2`，不能据探子猜测写成0.160.0。从官方同版本release恢复独立工具目录，核release digest/本地版本，`cli-version-1`恢复版本后又在推理前遇到`where.exe`输出GBK路径被UTF-8解码的启动失败。原诊断确证中文路径变成replacement字符；同字节官方包放到独立ASCII工具目录，`cli-path-1`只恢复该未启动位置。不放松适配器版本/权限检查，不改已交付首件，不更新app安装。比较只允许同输入/源码epoch且所有前件确定未派发的登记恢复链，最多一个实际交付；原未启动位置及本地工具/准备耗时保留，不能按最好答案选修订。汇总将零推理未启动与未知完成分列，成本不掩盖。

- [x] 对 policy/premise/source 先跑零调用 compare，固定可用层级和失效集合，禁止复用旧自然答案。D1/original为第一可恢复基础；policy/premise保留1 partial R1，source按依赖撤回该R1并保留R0（25证据、重建索引）；三者R2均false。
- [x] 三变化六逻辑fresh/previous均由普通入口实际交付，同模型/预算/四问；source-previous唯一同epoch登记恢复填补未启动位置，原两件保留。政策/前提各恢复1 partial材料，source撤回R1、保留25证据R0；旧答案/结论排除。
- [x] adopted/rejected/recomputed、实际读取/声明/费用均记录。policy、premise、source的previous读取相对fresh分别+2、-25、+6，声明+1、-2、+2；三个materialsUsed均0，不能据restore/cache或较少请求宣称实际含义消费或因果收益。
- [x] 官方CLI自动升级及中文路径解码两项确定未派发配置失败已具名保存、确定性恢复；保留79,770ms本地开销、0模型/工具。不私造previous session或弱化生产准入，未重发完成/未知请求。
- [x] R2条件未成立：0合格性质，实际撤守卫/换对象后的旧合格verdict撤回实验未执行、未达，不以工程负例代替。六变化答案独立源码裁定全部partial；局部资格、整题及实际使用分别列验收矩阵。

### BE15 — 普通使用与维护成本

**Modify:** 现有 `docs/usage.md`、`docs/skill-ir/developer-guide.md`；必要时更新 `examples/authorization-assessment/` 中已有示例，而非复制真实答案。

- [x] usage/developer-guide给出完整skill加自然task的 N/H/D opt-in 命令、inspect/compare/previous操作和有限边界；用户不需要手写 anchor、正确 propertyBindings 或先整理 trace。
- [x] 本轮D1/original普通 session搬移后公开init/check/inspect/compare零调用通过；95源、声明及归档字节保持，R0+1 partial R1可用、R2false，见portable-current-session.json。
- [x] 使用说明分别显示“自然回答”“有证局部检查”“未分析/条件未知”“协议/通道失败”，保留原题分母，禁止 partial 一词包办所有情况。
- [x] 六首件同自然质量下H比D低成本，交付H候选工程与D显式研究限制；不声称一般H优于N、不改项目默认，不为凑DSL成功改标签。

### BE16 — 归纳、结果与统一文档

- [x] 研究§1/§7.66/§11、spec§14.44及current-status/plan同步最终根因、实现、实际采用和未达；只剩发布核对，不自动重抽。
- [x] summary/accounting/acceptance分别记录工程、自然任务、局部性质、三臂价值、复用及净收益；required/achieved分开，研究false、有限模型队列true。
- [x] 16唯一归档/14模型：input26,118,113含cache24,207,744，output141,637含reasoning57,166；模型运行5,716,127ms加未启动79,770ms，总本地5,795,897ms。769总工具含8自动；USD/隐藏请求/开发探子/真人未知。
- [x] 原件和派生件集中本identity；旧BD/保护证据不回填，不新增长期阅读文档。

### BE17 — 有针对性的最终验证

独立复核现场修复（2026-10-12）：`control-conclusion.test.ts`原有性质负例发现，无association且不是`$framework`的决定性依赖会因没有slice edge而被判无关。缺少关联和边不是无关的证据，须继续阻断；request/unconfirmed也保持决定性。已有显式source边仍按实际前缀判定，使效果之后的未知调用不反向阻断先前局部性质；公共U1/U2保留这一区别。主线程补普通path与跨题隔离红绿，保留对象/权限/次序检查；已派发原件/源码epoch不改，零模型核当前原快照性质并记录差异，不为这项确定性保守修复新增模型样本。

- [x] 最终15文件225pass/0fail/1418断言、研究12pass/0fail/68断言及主/研究类型通过；实际H/D工具、原skill/四问/范围/预算由独立机制复核点验。最后保守修复对10原D快照没有适用的改变分支输入，原35unknown/空trace保持；不是新模型采用或未来保证。
- [x] 零模型replay和普通搬移已一次通过；15文档单测、当前链接/导航errors0、`git diff --check` exit0。全历史扫描exit1仅返回已知八条原断链，软长度警告另列，冻结原件/治理inventory未改，见document-check.json。
- [x] 一次暂存核验：16尝试的80原件、14盲评副本等字节，16原gzip与7派生gzip全可读，外部run.json及native终答原字节一致。仅本identity盲评txt新增精确.gitattributes规则；未重复全仓历史/保护摘要审计，见staged-original-bytes.json。
- [x] 相关依赖和实际H/D/公平比较两项独立只读复核完成；依赖finding经红绿修复、后复核无新缺陷。主线程按原源码裁决盲评分歧，探子未修改代码或决定方法，AI复核不称真人评阅。

### BE18 — 发布与接手

- [x] 七目的提交至96ed3472仅推用户origin/skill-ir-aot，upstream/他人改动未触；源码、研究脚本、文档和本BE证据分责提交。
- [x] 96ed34722bea66137f1db632647f7a63e1397323与live远端一致、仓库干净同步；普通命令在usage，根三账本同步，回执最终提交SHA另记根账本/最终回复，避免自指SHA。
- [x] 逐轴标工程通过、研究未达及R2条件未执行；12逻辑队列完成/发布完成，研究false。无BE活动/未知完成；旧OWUI未知和费用保留，无自动重抽。

## 五、验证命令与实施注意

在 `D:/skill优化/SkVM` 执行。以下入口已实现；研究tsconfig包含主脚本及evaluation脚本，不把归档/模型材料作为源码：

```powershell
bun test ./src/benchmarks/authorization-dsl/operation-work.test.ts ./src/benchmarks/authorization-dsl/inquiry-worklist.test.ts
bun test ./src/task-dsl/authorization/property-query.test.ts ./src/benchmarks/authorization-dsl/interprocedural-property-entrypoints.test.ts
bun test ./src/task-dsl/authorization/question-workflow.test.ts ./src/benchmarks/authorization-dsl/question-workflow-entrypoints.test.ts
bun run typecheck
$be = './results/skill-ir/skill-dsl-research/development/authorization-question-workflow-v1'
bun test "$be/study.test.ts" "$be/summarize.test.ts" "$be/replay.test.ts"
bunx tsc --noEmit -p "$be/tsconfig.json"
bun "$be/study.ts" prepare quality-n-1
bun "$be/study.ts" replay
bun "$be/study.ts" summarize
python scripts/check_skill_ir_doc_links_test.py
git diff --check
```

生产接口目标：H/D继续使用 `authorization inquiry run --input=<原输入> --skill=<完整SKILL.md> --harness=codex-account --model=gpt-5.6-sol --strategy=<question-guided-v1|question-checked-v1> --out=<新会话目录>`，带实现后已验证的 method/domain-tools/account-boundary 参数；BE8必须补成可复制的实际命令。原 `legacy`、v7、`semantic-completion-v1` 保留原语义及兼容读取。确需改变共享语义的修复记录版本与历史重放差异，不改旧 scorer 或旧结果来对齐新实现。

## 六、预算、失败与授权

- 本轮沿用共同 64 总工具单位、768KiB 显示、32MiB 读取、45分钟会话上限；自动行为计入总单位，最多4个单位预留最终交付。恢复和额外转换不拥有隐藏预算。不可见官方内部请求保持 unknown，不能伪称被64严格限制。
- 共6质量首位置、最多6变化首位置；有证共享修复允许具名复验，首件与新增成本保留。同因两次无进展停该重抽，转确定性修复，不为凑时长加样本。
- 指定账号 `gpt-5.6-sol/high` 已授权。明确终态 routing failure 可以一次具名恢复；连续两次失败或本轮累计三次恢复仍失败则暂停外部派发。quota/auth立即暂停该通道。unknown只查原生命周期，不能当失败自动补跑、换模型或开旁路；旧OWUI两未知保持既有处置。
- 通道暂不可用时继续所有独立工程、反例、重放、示例和文档。无需用户批准常规修复；不能把外部不可用写成方法负结论，也不反复轮询/睡眠。
- 新线程为代码、共享方法文档和Git的唯一写者。按AGENTS使用default/fork none只读探子，多个探子派后等齐；不同时启动第二开发写者。

## 七、最终验收表

| 责任 | 实际通过需要的证据 |
|---|---|
| 错误义务修复 | Serializer/Field红绿、真实请求权限负例、公开runtime中的相关依赖解释 |
| 上下文与共享含义 | 同序列实际发送投影减少/去重且决定性信息可取回；不同题/实例/源变化不串用 |
| H独立可用 | 无低层D必填协议的真实普通运行、自然原题回答与辅助采用 |
| D领域执行 | 模型当次语义→采用→真实跨源trace→当前性质；独立源码核对，与自然答案分列 |
| 完整任务质量 | 保留四问与原skill，两轮三臂原答/修订/错误/未交付全部有位置 |
| 实际复用 | R0/R1/R2各自资格、变化失效、普通previous采用及fresh对照；没有旧答案输入 |
| 效果与交付 | 全成本/未知项、五分支结论、普通命令、目的提交和远端核对 |

没有真实合格性质时，D验收明确未达；H可用、质量比较和R0/R1成果仍分别交付。若D继续无质量/检查增量而更贵，停止把低层协议作为用户推荐路径，记录证据后交付经过验证的辅助模式与保留的研究能力。不得预先承诺本轮必有正向收益。
