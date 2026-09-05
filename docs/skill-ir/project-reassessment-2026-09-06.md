# 项目整体复核与规划建议（2026-09-06）

本文是针对当前文档、代码和冻结证据的独立复核。核验基准为 `skill-ir-aot` 分支 `572c88b`；复核本身未执行付费实验、未读取 held-out 内容、未修改实现或旧结果。其 P0 状态口径与 P1 七案例校准随后已被采纳进正式 spec/plan；P2/P3 仍是后续计划，不由本报告授予模型/API、held-out 或新实验权限。

## 1. 总体判断

项目已经有两条有证据支持的确定性产物路径，以及较完整的证据绑定、失败保留和成本分账机制。将当前形态称为“需人工审核的、可验证 skill 产物封装”基本准确。

但“分类学已经完成，只差 B 的四行就能闭环”不成立：B 已在首行质量失败后永久冻结；其实现也没有测量从人工编写到人工审核的完整工作流。分类轴有价值，但现有三档存在交叉，若干第三档结论与实际任务切片不一致。因此当前更准确的定位是：**以公开验证依据为组织原则，研究受限 skill 任务的确定性 AOT 转换及人工边界的系统原型与探索性案例研究。**

## 2. 三条主线的实际状态

| 主线 | 已成立的部分 | 尚未成立的部分 |
|---|---|---|
| A 分类证据 | 七案例表已编制；成功、回归、饱和和测量失效均有记录 | 三档判据的互斥性、对实际任务切片的正确归类、对新任务的预测力 |
| C 工程 | 顶层 CLI 接入 Env 和 API Tester JSON/YAML；本轮本地金路径测试通过 | 任意新 skill 自动构造；两条路径统一的完整产品合同；独立安装后的端到端可用性 |
| B 人工实证 | 一条 original 开发任务运行完毕；操作序列 parity=exact；质量失败并按规则停止 | 合格的自动构造结果、独立人工审核、authoring/review 对照、人工减少结论 |

最新 [B 报告](../../results/skill-ir/api-tester-trace-public-answer-paid-development-001/report.json) 为 `negative-smoke-frozen`：计划四行，执行一行，余下三行未执行。该行自然结束，parser 正常且 usage 可得；失败项为 schema-derived cases、security response、independence verification。保留这条失败是正确做法，不能在旧身份下补齐剩余行。

## 3. 需要优先纠正的六个问题

### 3.1 B 的 trace 是计划投影，exact 只是操作序列一致

[paid runner](../../src/benchmarks/skill-ir/api-tester-trace-paid-run.ts) 第 205–214 行读取 `generated/api-test-plan.json`，交给 `buildPaidTraceFromGeneratedPlan`。该函数在 [api-tester-trace-paid.ts](../../src/benchmarks/skill-ir/api-tester-trace-paid.ts) 第 204–241 行从 endpoints 重建序列，固定填入 `toolName=http-client`、`status=accepted` 和相邻 next-step。

这不是从实际 HTTP 工具事件中提取的执行轨迹，也不是已观察到的 agent 决策链。它来自模型实际生成的计划，因此不能说付费 trace 完全由答案伪造；但名称和研究解释必须缩窄为“生成计划的操作序列投影”。

[比较器](../../src/benchmarks/skill-ir/api-tester-trace-public-answer.ts) 第 283–337 行检查 method/path、操作集合、顺序和引用等结构，不比较完整 schema 约束、鉴权语义或独立执行条件。输入/输出 shape digest 被保存，却未参与语义 parity 判定。故 `exact` 与质量失败同时出现完全符合当前实现。

建议保留旧结果的字段和值，在解释层明确 `operation-sequence parity`。新协议若只需要计划投影，就直接命名；若研究主张依赖 trace 提炼，才增加真实事件来源与可追溯映射。质量检查继续复用独立 scorer，避免另造一套等价 gate。

### 3.2 人工分钟数不是一个可推广的测量器

[paid runner](../../src/benchmarks/skill-ir/api-tester-trace-paid-run.ts) 第 244、276、331 行将 authoring/review 固定设为 0；[schema](../../src/benchmarks/skill-ir/api-tester-trace-paid.ts) 第 24–28 行将状态限定为 `prospective-measured-no-human-intervention`。该程序没有人工活动事件、独立审核结果或审核后修复记录。

“这段运行窗口无人介入”可以是真实陈述；它不能证明成功交付所需人工为零，更不能证明人已从作者转为审核者。当前矩阵只有 original，没有作者流程与审核流程的同质量对照。即使四行全部通过，该设计也不能直接回答降人工问题。

还要修正“最低人工的已测下界”：只记录部分工作的分钟数，至多是该次实际总投入的部分计数。若一个合格流程实际用时 h，只能说明最优人工投入不大于这个可行值；没有排除更省人工方案，就没有证明最低值。建议改为“限定范围的实测人工投入与未测项”，历史 LOC 不作为分钟代理，未测不填 0。

### 3.3 paidCalls/modelCalls/API calls 的单位混在一起

[计数代码](../../src/benchmarks/skill-ir/api-tester-trace-paid.ts) 第 272–296 行将 `requestDispatched=true` 的行数同时写入三种 calls。它计数的是已分发的 agent 任务行。

而 [该行执行观测](../../results/skill-ir/api-tester-trace-public-answer-paid-development-001/evidence/row-1-execution-observation.json) 明确记录 `providerResponses=10`、`assistantMessages=10`、`toolCalls=15`。因此报告的 calls=1 不能解释为只发生了一次模型 API 往返。这里不能仅凭响应数还原供应商最终计费请求数，也不能直接宣布违反了以任务行为单位的旧预算；应先纠正单位。

后续预算分别记 agentRuns、provider/modelRequests、tokens（含缓存分项）和货币成本。旧报告不改值，新增解释或 successor schema。现有止损限制控制了任务行数，不足以单独证明底层请求数≤4。

### 3.4 分类对象与三档判据需要重新校准

[分类表](answer-availability-taxonomy.md) 第 8–19 行已经承认对象是任务而非主题、单调性只是研究假设。这是正确的克制，但第 44–46 行又将第三档三例表述为已经证明公开输入不足以给出领域判断，证据并不足。

具体反例是 [代码审查 oracle](../../src/benchmarks/skill-ir/zh-code-reviewer-oracle.ts) 第 67–125 行：有限源码模式直接生成 finding，严重度在规则中固定为 critical/major。这个冻结切片的评分依据可以机械重建；不能因为完整代码审查需要专家，就把该切片当作“专家不可替代”的实证。

[spec](skill-ir-aot-optimization-spec.md) 第 432–437 行也明确 Law v2 只取公开规则可确定的保守分类，排除不确定输入；第 473–476 行规定 i18n 的翻译质量只作诊断、hard gate 主要验证结构。这里均须区分完整 skill 的语义范围与实际评测切片。Law 的旧 measurement-invalid 数值不能充当有效的自动化失败证据；Experimental Design 的 baseline saturation 只能说明当时对照没有增益空间，不能证明专家判断不可机械化。

另外，OpenAPI 同时是公开产物和用户输入结构，因此档 1/2 目前并不互斥。唯一标准答案也不是可验证性的必要条件：多个输出可能同样满足公开约束。

建议以 `(skill, task slice, public contract, environment)` 为分类单位，并记录三个问题：验证依据是否覆盖当前质量要求；是否有明确、可执行的构造映射；剩余语义由谁判断。若保留三档，可将其暂定为“显式规范可直接执行”“公开结构可推导但需领域映射”“当前合同仍有外部语义判断”，提供优先级规则与混合任务处理规则。这是待验证的路由框架，不应称为已证明的普适定律。

七个历史案例适合回顾性组织证据；它们不是七次独立的前瞻分类预测。正例、实现回归、scorer 无效和基线饱和需要分栏，不能合并成支持单调性的正负标签。

### 3.5 CLI 的研究复现能力与通用产品能力需要分开

[presets](../../src/skill-ir/verified-artifact-presets.ts) 第 206–258 行的 API 路径调用冻结领域编译器、检查 package parity、物化固定 development task，再运行 artifact。第 261–351 行的 Env 路径通过子进程调用现有 product runner，并检查 product manifest。

两条路径共享底层 artifact 能力，不能说另造了两套 runtime；但完整编排、review、cost 和产品报告合同并不相同。`coreBranchDelta=0` 是报告常量和既定口径，不是自动构造能力或零领域工程量的独立证明。

API artifact 的 [生成与校验](../../src/benchmarks/skill-ir/api-tester-artifact-compiler.ts) 第 320–368 行主要完成离线计划生成、重算和文件检查。当前结果不能扩大为真实 API 的业务或安全行为已经验证。生成器与包内 validator 共享 `planFor`，所以包内自洽检查还需和独立 benchmark scorer 的质量证据明确区分。

目前顶层路径仍依赖 checkout 中的冻结材料；Env 还依赖 Bun 源码 runner。`package.json` 不发布这些完整源码和案例资源；[postinstall](../../install/postinstall.js) 第 14、40–58 行明确本轮二进制安装不支持 Windows。这是交付范围限制，不应误写成这次新引入的缺陷。

建议先承诺“从干净源码 checkout 可复现的两条金路径”，明确 Node/Bun、平台、输入合同与输出含义。若要声称独立安装产品可用，再做 clean-install 验收并统一两条完整产品链；不需要现在扩 DSL。

### 3.6 证据权威解决了追溯问题，但没有自动解决研究构念问题

digest、固定分母、无重试、冻结负结果、成本分账都有实质价值。它们能证明证据来自哪个版本、是否完整、是否被改写；不能单独证明 scorer 覆盖完整 skill 语义、分类标签正确、人工计时对应真实人，或新方法有独立增益。

当前 [readiness](../../results/skill-ir/method-portfolio-authoritative-automation-readiness.json) 仍为 false，`automationAndAdaptationConverging=false`。这与“review-required 原型”一致，并不需要通过新增门禁去修饰。下一步应补研究问题与测量之间的对应，而不是继续叠加 provenance 包装。

## 4. 可以保留的正面结论

| 证据 | 可以写 | 不可以外推 |
|---|---|---|
| API Tester artifact 4/4 | 在冻结开发切片上，人工实现的领域转换可产出满足独立公开检查的确定性产物 | 任意 API、完整 API 测试、自动 skill 编译、类内泛化 |
| Env 4/4 质量等价 | 已审核 AOT 在该冻结对照下移除运行时模型成本 | 全项目经济成本或人工成本已回本 |
| Env break-even=1 | 在该 production model-token 口径下，一次性 9358 tokens，相对 original 每次 50502.5 tokens，首次复用即覆盖 | 包含历史研发、人工、货币价格的总回本次数 |
| B exact + quality-failure | 操作序列完整不保证测试计划语义合格；该 original 尝试在零窗口介入下失败 | trace 提炼成功、最低人工为零 |
| Stage N smoke 未合格 | 当时路由/执行资格不足，未形成跨模型主表 | 其余模型能力必然较差、优化后 LLM 更稳定 |

Env 数字见 [cost-accounting](../../results/skill-ir/env-manager-reviewed-aot-efficiency-readonly-serial-001/cost-accounting.json)。每项 all-attempt 完整性只覆盖声明的 identity/scope，不代表整个项目历史研发已全部计入。

Magpie 等扩展应保留独立分母与人工构造成本披露；固定公开切片、自建 checker 和人工 adapter 不能包装成 untouched 外部复现。七案例之外的尝试保留选择和排除理由，不应为凑齐三档而重新选择结果。

## 5. 文献和已有项目对定位的约束

- [Barr 等，The Oracle Problem in Software Testing，2015](https://discovery.ucl.ac.uk/id/eprint/1471263/) 系统讨论如何判断输出正确、从规范/模型/变形关系获得 oracle，以及人工仍承担的部分。项目应将“标准答案可得性”放进 oracle 文献脉络，区分答案、约束与验证能力；不能将这条思想本身作为首次提出的贡献。
- [Jones、Gomard、Sestoft，Partial Evaluation and Automatic Program Generation，1993](https://studwww.itu.dk/people/sestoft/pebook/) 讨论利用已知输入生成专门化程序。AOT 叙事应说明静态信息、动态输入、转换规则与语义保持的范围；现有手写转换不等于通用自动 partial evaluator。
- [Schemathesis 论文，2021](https://arxiv.org/abs/2112.10328v1) 和 [官方项目](https://github.com/schemathesis/schemathesis) 已从 OpenAPI/GraphQL schema 派生测试与 fuzzers。API Tester 的贡献不能仅为“根据 OpenAPI 生成测试且不用 LLM”。应定位到 skill 到受限产物的转换边界、公共封装和可审计测量，并解释与成熟 schema 工具的能力差异。
- [SkVM v3，2026-04-11](https://arxiv.org/abs/2604.03088v3) 已包括能力编译、环境绑定、并发提取、JIT code solidification。当前工作需明确复用的底座与新增的 AOT 合同/证据机制，避免重新声称整个 SkVM 的贡献；不能借用上游跨模型结果作为本分支结果。
- [SkillsBench v4，2026-06-14](https://arxiv.org/abs/2602.12670v4) 采用匹配的 no-Skills/curated-Skills 条件与确定性验证器。这支持保留配对对照，也提示有 deterministic verifier 不等于完整任务可被确定性合成。论文版本要固定；旧版本实验不得静默替换成最新版本分母。

基于上述对照，最重要的新基线是“同一公开合同下直接手写的确定性脚本或已有 schema 工具”，而不仅是更多 LLM。若不做该对照，就把贡献限定为工程封装与边界研究，不单独宣称 Skill IR 导致了质量提升。

## 6. 建议的后续计划

### P0：先修正当前状态和研究用语，零付费

更新 taxonomy 第 47–50 行的 B 未来态与“最低人工下界”；同步 handoff、README、spec/plan 中仍指向旧下一步的段落。保留历史，但将其明确归档，不让多个“当前唯一主线”并存。AGENTS 的跨代理稳定性方向与当前研究 scope 也需要区分长期目标和本阶段交付。

验收：一页当前状态只包含每条主线的已证实结论、证据路径、未决问题和下一动作；B 是 frozen negative，无活动付费任务声明；分钟与 calls 单位明确。

### P1：先校准七案例，再决定论文主张

逐例核对真实 task/scorer 的语义范围，分别记录 oracle 来源、覆盖范围、构造规则、剩余人工。重点核对 Law、代码审查和实验设计。分类时先看合同，后看性能结果，避免用成败倒推档位。可做窄范围独立复核，但不能把另一个模型的判断时间算成人工审核实证。

验收：每个标签均有公开要求与实现出处；无法支持的类别标为 provisional/mixed；measurement-invalid 与语义负结果分开。把论文 RQ 改成可被数据回答的三个问题：哪些任务合同允许转换、转换在同质量下的成本变化、哪些构造/审核步骤仍需人。

### P2：重写 B 的问题和测量方式，再考虑新实验

先用现有公开计划零付费检验报告和计时记录格式，不制造新的效果证据。若目标是审核替代作者，应比较匹配任务上的人工编写流程与候选生成后审核/修复流程；两边使用相同质量标准，记录 active human time、失败尝试、修改 LOC、最终通过与否，以及一次性平台工程和每任务适配的分账。

人工活动应由实际参与者前瞻记录；模型或 Codex 的工作时间另列。控制熟悉度/学习效应，例如匹配任务与平衡顺序。只有审核通过的结果才能进入“同质量降低人工”的主比较；失败也保留，并设明确的处理时间预算。

公开 schema 已能直接生成候选时，先使用确定性构造，不把获取 LLM trace 设为必须步骤。若坚持 trace 为方法核心，就加入“无 trace 的公开规范构造”对照，说明 trace 具体减少了什么人工工作。

新 B 是 successor identity，不能复活旧四行；本报告不自动沿用旧付费授权。成功可报告“该任务与参与者条件下观察到的人工作业量下降”，失败则报告边界，不追求最低人工定理。

### P3：完成小而真实的交付与论文证据表

保留 Env 和 API 两条源码金路径，补齐输入范围、依赖、检查能力说明及统一产品报告语义。使用干净目录验证输入、产物、错误提示和零模型运行；正式 release/跨平台安装是另一项验收。

论文主张逐项绑定证据：回顾性分类框架、受限确定性转换原型、两类开发切片正例、负结果及人工未测项。包内自洽 checker 与独立质量 scorer 分开解释。测试通过、源代码已 push、独立用户可安装三个状态分开报告。

第二个档 1 案例是否可选取决于主张：若只做探索性案例研究，可以后置；若要宣称分类预测力或类内可迁移性，它就是必要证据。跨模型大面板和继续扩 DSL 的优先级更低。

## 7. 本轮核验范围

主线程完整阅读入口、交接、通信 ledger、spec、plan 与当前入口说明；两个只读独立核验用于定位 CLI 和 trace 证据，关键结论回到具体代码抽查。未通读全部实现，未复跑历史付费矩阵，未重新评分旧结果。

新鲜本地验证：Bun 1.3.14，以下四文件合计 **19 pass / 0 fail / 59 assertions**：

```powershell
& 'C:/Users/14182/AppData/Roaming/npm/node_modules/bun/bin/bun.exe' test ./src/benchmarks/skill-ir/api-tester-trace-public-answer.test.ts ./src/benchmarks/skill-ir/api-tester-trace-paid.test.ts ./src/skill-ir/verified-artifact-cli.test.ts ./src/skill-ir/verified-artifact-presets.test.ts
```

这些测试覆盖本地 trace 合同、停止规则、CLI 参数和三个 preset 变体；不证明整仓测试、所有平台发布或研究假设已通过。初次无 `./` 路径未匹配测试，修正显式路径后通过。执行前 tracked 工作区无变化；本轮仅新增此报告并在工作区 conversation_log 追加复核记录。

## 8. 采纳状态

- P0 已落实：新增 `current-status.md`，并在 README、spec、plan、developer guide、protocol 与结果 ledger 中明确 B frozen negative、operation-sequence parity、calls 单位、0/0 minutes 和 production model-token break-even 边界。
- P1 已落实：`answer-availability-taxonomy.md` 已改为 provisional/mixed 路由框架与七案例回顾表；Law v3、Experimental Design skill-unique、Zh Code Reviewer 均按实际公开 slice 重标。
- P2 已完成零付费设计：两臂平衡交叉、前瞻活动区间、同一质量门和拆分成本单位已机器化；task set
  仍为 `not-authored`，参与者与真实 session 未开始，新付费仍需再次授权。
- P3 未执行：近期目标是从干净源码 checkout 复现 Env 与 API Tester 两条金路径，并整理 claim-to-evidence。
