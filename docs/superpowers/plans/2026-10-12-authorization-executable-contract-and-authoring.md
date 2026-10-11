# BF0–BF17：真实可执行授权 DSL、自动编写接线与变化消费

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan. Use test-driven development for production changes. Track work with `- [ ]` checkboxes. One main developer owns implementation and Git; read-only scouts follow AGENTS.

**Goal:** 让一份依据真实源码编写的授权 DSL 程序通过普通入口产生有范围、有条件、有实际调用轨迹的检查结果，再让实验模型独立编写并消费同一合同，验证材料实际使用及变化后的重算。交付可用程序与共享实现，分别回答“语言能否表达”“模型能否编写”“使用后有何效果”。

**Architecture:** 复用现有 inquiry CLI、完整 skill 加载、来源索引、BB/v7 跨调用绑定、有限求值器、会话与 R0/R1/R2 失效。增加薄的持久程序输入与显式检查范围，解开声明提交对隐式当前焦点的依赖；同一个编译/执行核心服务作者文件、模型工具和 previous。局部函数合同与整个请求的授权结论分别交付。

**Tech Stack:** TypeScript、Bun、Zod、现有源码索引与有限控制求值器、官方账号 adapter。开发 `gpt-6.1-sol/max`；研究模型沿用已授权的官方账号 `gpt-5.6-sol/high`。

状态：`in-progress / BF0已接管`。规划基线 `74bf7befa80f8b0d73187d07d1b08e8a27875bdf`，实际接管 `34e5e302b9d725ee09937ddc651e77f7a1d7159e`（2026-10-12 03:10 Asia/Shanghai，工作树干净、live origin一致）。用户已授权书写、派发并连续开发约 8 小时工作量；常规阶段无需再确认。本文件是新队列，不继续向 BE 已关闭位置补行。

Identity：`authorization-executable-contract-v1`。结果集中 `results/skill-ir/skill-dsl-research/development/authorization-executable-contract-v1/`；临时运行集中 `D:/skill优化/project-maintenance/runs/authorization-executable-contract-v1/`。继续 `skill-ir-aot`，只推用户 `origin`，不开分支或 worktree。

## 一、接管背景与必读范围

主开发者亲自阅读设计与准备修改的代码。不要通读所有历史结果或重跑历史大审计。

1. `D:/skill优化/AGENTS.md`、仓库 `AGENTS.md`、[当前状态](../../skill-ir/current-status.md)、本任务书全文。
2. [研究总文档](../../skill-ir/skill-dsl-research.md) §1、§2、§7.66（含发布后复核）、§7.67、§11；[spec §14.45](../../skill-ir/skill-ir-aot-optimization-spec.md#1445-bf-executable-contract-and-authoring)。§14.41/§14.44 按需核旧接口。
3. BE `verification/acceptance-matrix.json`，以及 `attempts/quality-d-1/original/`、`attempts/quality-d-1/partial-source-1/` 的原声明/诊断/材料投影；实际子目录以 BE manifest 为准。压缩原件只提取对应字段，不整份打印。
4. [usage](../../usage.md) 的 inquiry / account / question workflow 段和 [developer-guide](../../skill-ir/developer-guide.md) 的相应组件。跨线程恢复只读根 handoff/communication 的最新 BF 节。

承接已经核实的事实：

- BB 已有跨源限定引用、调用实例、参数和对象关系。`property-query.ts` 已有 `PropertyQueryContext`、`bindInterproceduralQueries`，不要重新做裸 anchor resolver。
- BE 六首件逐题 full 为 N 3/8、H 4/8、D 4/8，来自同一四问任务两次重复。D 对 H 的累计 input 约 3.50 倍、非缓存约 1.59 倍、耗时约 1.49 倍；D 额外工作未带来首件质量增量。
- D1 首件只保存 `serve_file` helper；具名修订只保存 `file_response` helper。各自 saved/current/available=1，但 projectedUnits/uses=0，首阻断是 `material-entry-role-mismatch`。有材料和实际采用分开。
- D1 七次声明六次拒绝，D2 五次全拒绝。`prepareQuestion` 要求当前 focus 为 interpret 且来源窗口完全匹配，已读来源仍会因焦点错位被拒。
- BE 的两个源码变化评阅把请求查找的 `include_deleted=True` 传到了另一调用的版本选择。研究 §7.66 已勘误；原 P/F/F/P 与整题计数保留。新 evaluator 必须按各次实参分别判断。
- 目前主要缺口在表达范围、来源路由和实际消费。原自然答案、开发者编写的诊断程序、自动生成结果必须分别计数。

## 二、约 8 小时的执行安排

下列是估计工作量，不是成功保证或等待时钟。阶段之间直接推进；较早完成时执行 BF16 的有用余量工作，不用睡眠、轮询、重复审计或无信息模型请求凑时间。约 8 小时处形成可恢复交付；有明确未完成工程时写清责任，不能因时间到就标研究成功。

| 工作段 | 预计投入 | 应留下的实物 |
|---|---:|---|
| BF0–BF1：接管、评价勘误与失败定位 | 0.5h | 最小失败输入、范围/评价合同 |
| BF2–BF3：真实作者程序与有界表达 | 1.0h | 源码有据的程序、局部范围类型、红绿测试 |
| BF4–BF5：来源路由与材料执行接线 | 1.25h | 公共工具/编译/投影修复、非空实际轨迹 |
| BF6–BF7：普通输入、存档与变化检查 | 1.25h | 可复制命令、同包搬移和失效反例 |
| BF8–BF9：另一结构压力检查、账号消费准备 | 1.0h | 共享边界测试、隔离的实际输入 |
| BF10–BF12：有限自动编写及真实消费 | 1.5h | 首件、现场修复、H/D与作者使用记录 |
| BF13–BF14：变化复用、收益归因 | 0.75h | 当前材料真实采用、独立评价与全成本 |
| BF15–BF17：验证、维护与发布（含余量） | 0.75h | 可用示例、当前文档、目的提交和远端核对 |

开发精力约六成用于质量与执行核心、四成用于编写和复用。不要把这个比例写成项目质量门槛。主线工程优先，研究通道不可用时继续独立开发。预计时长失准时调整阶段投入并记录，不增加新的宏大目标。

## 三、方法合同

### 3.1 三条轨道分别交付

| 轨道 | 谁提供源码含义 | 要回答的问题 | 证据口径 |
|---|---|---|---|
| A：开发者编写的可执行程序 | 主开发者/开发代理读真实原文后编写 | 当前语言和执行核心能否表达实际关系？ | 开发诊断与作者程序，不计自动生成成功或真人工时 |
| B：模型自动编写 | 隔离的实验模型读取共同原文 | 修复后的接口能否接住模型自己的解释？ | 原稿/拒绝/修订/采用分别保存；禁止提供 A 的参考实现 |
| C：实际使用与变化 | 普通消费者读取注明来源的当前程序/会话 | 程序是否参与结论、变化是否正确重算、重复工作是否减少？ | 区分人工辅助程序和自动程序；恢复、使用、收益分别计量 |

主任务保留完整 Cloudflare security audit skill 与 Paperless Download 原四问。A 允许另声明一个明确的局部子性质，用于解释能力诊断；B/C 的自然回答仍保留原四问，局部成功不会缩小整题评价分母。

### 3.2 第一份真实程序与检查范围

源依据仍用已暴露的 Download 原快照。优先检查 `file_response` → `_resolve_request_and_root_doc` → 后续选文档/`serve_file` 的对象、拒绝返回和效果关系。BF2 先写清“从哪里进入、检查哪个效果、需要哪些条件、哪些调用仍未解释”，再编写程序；根据原文允许得到 checked、violated 或具名 unknown，不能预填正确 verdict。

新增范围必须有明确区别：

- `request-operation`：实际请求入口到受保护效果；相关框架/注册/认证义务继续参与。
- `function-contract`：从明确函数入口检查局部调用链，列出外部输入前提。上游身份认证或框架权限未证时显示在范围外责任中，不能把 helper 的 `role` 改成请求 entry 来通过旧检查。
- 来源语义、用户前提、独立政策与开发诊断假设分别标注。函数合同以假设为条件得到的结论只能显示“在这些条件下”；不能把待证明的 guard 成立或目标性质本身写成假设。
- 某个 helper 摘要包含什么参数/返回对象/正常与拒绝分支，由作者或模型读原文声明。宿主验证定位、实际调用与对象对应；摘要的语义支持另经原文复核，不伪称程序证明了全部 Python 语义。
- 组合时须证明 caller 满足 callee 前置条件，保留正常/拒绝/异常/未知分支；缺少连接时保留局部结果和具名组合缺口，不能沿用旧完整结论。

可以在现有类型旁增加窄的 `authorization-executable-contract/v1` 输入；先复用已有 source declaration、predicate、property 和 evidence，不重新定义通用 IR。预期最小字段为 `schemaVersion/id/scope/sourceDeclarations/queries/assumptions`，实际设计在 BF3 与 spec 同步。`scope` 的入口只使用可校验来源定位，机械 ID/revision 由宿主生成。模型或用户输入不得携带 trusted checked、materialUses、最终答案或 evaluator 分数。

### 3.3 共同核心与输入接线

作者文件与模型 `authorization_declare` 必须进入同一来源解析、声明编译、材料保存和性质检查路径，不能另建一个研究 runner 专用“成功解释器”。保留现有默认及旧会话可读性；新语义显式启用。

声明归属由显式来源、当前字节、读取覆盖、operation/question 与 receiver 唯一确定。当前 focus 用于建议下一步，不再作为已读合法来源唯一提交渠道。来源多义、越界、未读、过期和跨题身份错误继续给具名反馈，绝不静默选第一个。独立有效片段可以保留，依赖未成立的关系不得提前采用。

普通 CLI 的目标是给现有 inquiry `check/run` 增加薄的 `--domain-program=<file>`（这是待实现接口），`inspect/compare/previous` 随现有 session 保存和检查。`check` 可零模型编译并执行有限机械检查，明确 semanticSupport 未由机器证明；`run` 把程序的实际结果和具名缺口交给普通消费者。若现有输入字段能完整承载同样职责，BF3 可选择兼容字段方案并统一文档，不同时留下两套重复入口。

### 3.4 首次失败就在本轮处理

每次不良结果先保留原件，定位“来源/调度、含义表达、组合、检查、自然答案、通道”中的实际责任。可重放实现错误立即写红测、修公共实现、绿测，再具名复验；受同一缺陷影响的位置先停，独立工作继续。纯模型遗漏先核原文和它实际看到的内容，只有通用且有证修改才复验，不向提示写本题参考答案。

同因两次无保留进展时停止同因重抽，转确定性定位。新的实质根因可以继续修，但不得靠换名无限追加相同实验。A 程序若也无法执行，必须在当轮定位到具体不可表达关系并做一次有界抽象修订；不要直接封存全部后续工程，也不要连续扩 Python/Go 语言全集。

## 四、逐项开发

### BF0 — 接管与恢复

**Files:** 本任务书；新 identity 的 `manifest.json/status.json`；根阶段日志。

- [x] 确认分支、工作树、最新 plan 提交；保留其他线程内容。实际接管34e5e302，live origin一致。
- [x] 登记 A/B/C 三轨、8 小时安排、必需工程与条件实验；manifest/status分开requirements与outcomes，未测值pending/null。
- [x] 读取 BE 验收与定位字段：两件helper saved/current/available=1、projected/used=0，首阻断material-entry-role-mismatch；声明首阻断question-source-unoffered。旧原件保持。

### BF1 — 修正评价前提并保留原题

**Files:** BF 研究测试/评价合同；必要时调用现有 evidence preparation 接点，不修改 BE scorer 或原评阅。

- [x] 用匿名双调用 fixture 复现 `lookup(include_deleted=True)` 与独立 `select(include_deleted=version_present)`，覆盖无参数、空字符串、显式值、root 缺失回退。测试必须发现跨调用误传参数，不能只断言一段固定答案文字。
- [x] 新评价器根据实际参数流核定事实；把 BE 勘误作为开发回归依据，隔离于实验模型输入。source-call-review以实际sourceCallId/签名绑定；缺场景值保持unresolved。
- [ ] 四问答案整体阅读全文后评价：相同事实已在别段说清楚可以交叉引用，不强制重复特定措辞。保留必要分支、对象、事实到结论映射，不降低正确性要求。

### BF2 — 先亲自写一份真实可执行程序

**Files:** BF `authoring/developer/`；生产 `question-workflow.test.ts`、`interprocedural-property-entrypoints.test.ts` 的必要公共链红测。

- [ ] 亲读真实 `views.py`、直接 helper 和所需权限/版本定义，写一份小而完整的函数范围合同；每项含义定位原文，保留外部前提和剩余框架职责。
- [ ] 第一性质覆盖真正的授权行为，例如拒绝分支能否阻止指定效果、guard 所约束对象如何传到下游。不要只验证“两个 ID 相同”或采用恒真性质获得成功。
- [x] 从公开声明编译/工具接点执行原字节程序，记录第一个失败。禁止直接手造 semanticUnits、modelCovered、最终 graph、checked 标志绕过生产入口。authoring/first-public-failure.json保存旧工具question-source-unoffered和新核心局部根首个unknown；真实A尚未闭合。
- [ ] 如旧合同无法表达局部范围，保存最小反例交 BF3；如能够表达，优先复用并缩减 BF3，不重复造语言。开发者程序可带源码语义，但不能进入 B 自动编写模型上下文。

### BF3 — 有界程序与条件范围

**Modify:** `src/task-dsl/authorization/question-workflow.ts`、`property-query.ts`、`control-conclusion.ts`、`source-materials.ts`；新职责确需单独模块时创建 `executable-contract.ts` 及对应测试。

- [ ] 定义并验证程序来源、两种 scope、假设来源、查询与残余；同一条件可以在不同赋值下重新计算，未知前提保留 unknown。
- [ ] 用公共核心测试局部 helper 可作为函数合同的根，但不能因此成为请求 entry；缺上游授权时局部结论可交付，whole-request 状态仍保留缺口。
- [ ] 覆盖真/假/未知前提、guard 后置、错主体/错对象/错权限、未注册调用、不同调用实例和假设循环；缺失不能当无影响，假设不能自证待检查性质。
- [ ] 保持源码含义由作者/模型负责，宿主从实际调用绑定对象。基于问题范围裁剪必须给关联依据，不靠放宽步数/路径上限或忽略所有 unknown 获得结论。
- [ ] 在 BF 设计记录和 spec14.45 写清选择；这个已授权范围内的细化不等待额外审批。若需要整体架构改向，记录方案并交付可独立完成部分，不偷偷扩大目标。

### BF4 — 修已读来源提交与渐进声明

**Modify:** `inquiry-focus.ts`、`question-workflow.ts`、`question-workflow-wire.ts`、`inquiry-domain-runtime.ts` 及相应测试。

- [ ] 红测：读 source A、焦点移至 B、提交 A 的合法声明；A 应路由到它自己的当前唯一 owner，不因当前 stage/source 不同丢弃。
- [ ] 测试未读/过期/范围外/重复 owner/跨题/receiver 不匹配；明确诊断，不用固定函数名成功分支。
- [ ] 编译合法的独立片段，保留有位置的残余；依赖缺失的对象/条件/性质不提前编译为成功。拒绝某字段不清空其他已接受含义，无效更新须撤回受影响旧结论。
- [ ] 用 BE 已保存原提案零调用派生一次，区分仅修路由即可接受与仍缺源码含义。不给旧提案补答案，不回填真实采用统计。

### BF5 — 程序到材料、调用及检查的真实接线

**Modify:** `source-material-projection.ts`、`inquiry-domain-runtime.ts`、`inquiry-reuse.ts`、`source-material-reuse.test.ts`、`interprocedural-property-entrypoints.test.ts`。

- [ ] A 程序走共同核心产生当前材料、实际 call/argument 绑定和非空性质 trace；局部根使用独立 scope，不改 helper 的原始角色。
- [ ] 将来源声明→保存→范围选择→调用采用→性质检查串成一条可读轨迹，记录实际使用的 handle 与当前依赖，不把 loaded/restored 计成 used。
- [ ] 证明两个函数中的关系沿真正调用实例组合；未被调用的 guard、同名异对象、前后顺序与权限不符仍给正确反例结果。
- [ ] BF2 程序若仍无结果，查看首阻断并修一次共同接口或摘要表达。仅以“模型还没写好”为由继续跑研究不合格；A 程序也失败时先完成这个可诊断工程责任。

### BF6 — 普通入口、文件导入与持久会话

**Modify:** `src/cli/authorization-inquiry.ts`、`inquiry-local.ts`、`inquiry-native.ts`；按需新增 `executable-contract-entrypoints.test.ts`。

- [ ] 实现 §3.3 选定的单一薄入口；check/run/tool 提交共用一个 compiler/evaluator，持久程序相对路径可搬移，拒绝越出允许源码范围。
- [ ] `check` 明确区分结构有效、执行结果与来源语义复核；`run` 保留完整 skill 和自然任务，机器 unknown 不吞自然回答。
- [ ] session 存输入程序、实际来源和消费轨迹；inspect 可指出范围/条件/剩余任务，compare 能解释源码、政策、前提及程序修改的影响。
- [ ] 作者输入拒绝预置 verdict、trusted 身份和伪造已读状态；由宿主实际读取授权原文建立编译覆盖。这类读取与模型已读覆盖分别记账。
- [ ] 同一程序搬到新目录，通过普通入口执行；不要求用户手填内部 anchor/hash 或构造研究 session。目标源码不执行。

### BF7 — 同一个程序的变化行为

**Modify:** 普通 `compare/previous` 接点和 BF `verification/`；`inquiry-reuse.test.ts`、`question-workflow-reuse.test.ts`。

- [ ] 先用 A 同一程序零模型检查政策、前提、源码三种已暴露变化：只重算相关责任，改变源码使相关声明过期，保留无关材料。
- [ ] 若有条件前提改变，重新求值而非复制旧结果；若 guard/对象源码改变，旧 checked/violated 撤回直至新解释，不能仅把 input hash 更新后继续用旧语义。
- [ ] 检查旧自然答案、评价与结论不会进入 previous 模型输入。材料恢复资格与实际 use 事件均能被普通 inspect 看到。
- [ ] 这是确定性程序/失效证据；源语义未重新解释时不得声称真实变化任务已完成或节省模型成本。

### BF8 — 第二种结构与抽象边界压力测试

**Files:** 已有公共反例测试；BF `verification/secondary-structure.json`。

- [ ] 加一个与 Download 不同结构的已暴露调用形状：优先旧 OWUI 的离线原文或已有 middleware/handler fixture。OWUI 不派模型，不打开未见/held-out来源。
- [ ] 验证框架入口缺证时不会借函数合同洗成请求安全；同 helper 两个调用点/不同资源仍隔离。
- [ ] 选一个“局部已有结论、请求组合尚缺”的例子，让普通输出清楚表达这两个状态。不得通过新增Python语法全集来追求全支持。
- [ ] 有具体抽象难题时至多定向复读 Paralegal/CodeQL 官方方法的一项接点，并记录采用/不采用理由。研究为当前实现服务，不开启新语料大调研或外部扫描面板。

### BF9 — 实际运行准备与共同条件

**Create:** BF 的薄 `study.ts`/研究测试/`tsconfig.json`；复用已有 runner 与归档函数，不复制整套平台。

- [ ] 原输入仍为 `results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/model/packages/download/inquiry.json`；完整 skill 仍为 `results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/SKILL.md`。两者均相对仓库根，核对允许来源与完整四问。
- [ ] 注册六个首位置：`auto-h-1`、`auto-d-1`、`authored-use-base`、`authored-use-change`、`reuse-fresh`、`reuse-previous`。前两同条件完整四问；作者两次为同包真实使用；复用两次为明确同材料基础的变化比较，三种分母分开。
- [ ] B 自动输入只含完整原任务、skill、共同源码/政策/前提及通用语法说明；不含 A 程序、真实案例专用语义模板、旧回答、评语、本任务书或开发日志。示例仅可用语义不同的匿名小例。
- [ ] 用真实账号 thread/start 静态工具合同和 mock transport 走一次读取→声明→编译→检查→自然交付；测试作者文件入口与模型工具入口调用同一核心。
- [ ] 保存本 epoch 输入与提示差异清单；H/D共同定位辅助、模型、高阶前提、自然回答要求及预算一致，D多出的编译/检查/恢复完整计入。

### BF10 — 自动编写首对及立即定位

- [ ] 实际执行 `auto-h-1` → `auto-d-1`，使用指定官方账号；不先做另一个付费健康探针。每件终态后马上读原答、材料、trace和预算。
- [ ] D 按自己读到的源码生成程序，主开发者不代补含义；保存原稿、所有诊断、合法片段、实际采用。能否编写与自然四问质量分别评价。
- [ ] 若路由/Schema/编译/组合缺陷已复现，立即交 BF11处理，停止继续受同因影响的消费；H正常答案无需等D机器通过才保存。
- [ ] 如果D接口正确而模型含义不完整，核它所读源码与通用反馈，最多做一次有据的通用改进；不能靠反复重抽产生一份成功稿。

### BF11 — 本轮现场修复与一次有效确认

- [ ] 每个实际共享缺陷依次原件→红测→公共修复→绿测→具名复验；同一问题首件、修订独立，成本不覆盖。模型纯语义误解不自动要求改代码。
- [ ] 正常预留最多3个具名修订会话用于不同已定位原因。若其中改变H/D共同机制，复验需成对且计入余量；D独有修订可以引用未变H，但必须标明修订比较。
- [ ] 仅当首对已有可采用程序且需要确认质量/费用方向、并仍有有效时间时，登记第二对 `auto-d-2` → `auto-h-2`。第二对有意反转先后顺序，以减少固定顺序影响；两臂条件及预算仍一致。它是可选确认，不为达到固定数量而运行。
- [ ] 没有可用自动程序时继续 A 程序和普通作者使用责任；自动失败按实报告，不通过修改其原字节伪装模型成功。

### BF12 — 同包普通消费者与作者边界

- [ ] 使用 BF6 的 A 程序或第一份实际合格自动程序，先固定来源类型和基线，不事后挑最好结果。两次作者使用均用同一包，第二次只改变预先指定政策/前提。
- [ ] 运行 `authored-use-base/change`，完整原 skill 和四问保留。检查普通消费者实际取用了程序结果/缺口，不能只统计文件被加载。
- [ ] 作者程序可含作者读源码得到的含义；其使用结果单列为“给定程序的消费”。不得与未获这些含义的 H 主对照直接宣称自动优化优势。
- [ ] 报告程序编写/修订步骤和开发代理用量可见部分；无计时真人参与就保持真人分钟未知。程序被使用也不自动证明回答更好。

### BF13 — 实际 previous 与变化比较

- [ ] 从 BF10 首个可恢复 D 会话固定 R0/R1/R2资格；若无可用自动R1，则固定 BF12 作者会话，并明确切换为作者程序复用轨，不混成自动成功。
- [ ] 固定一项已暴露变化（优先政策，其次来源可恢复条件），运行同输入 `reuse-fresh/previous`；无合格R1时仍可做R0准备诊断，但标明实际含义复用未达，不伪造材料基础。
- [ ] policy/premise 的可用含义应被真实重新求值；source变化须撤回相关材料。逐项列 loaded/eligible/used/recomputed/withdrawn，旧自然答和旧 verdict不输入。
- [ ] 比较自然逐题/整题、实际材料/性质、阅读/解释次数、输入含缓存及非缓存、输出、耗时。更少read或cached bytes不直接归因净收益。

### BF14 — 评价、机制价值与当前责任

- [ ] 对模型答案按原四问和原文复核；适用时只读独立复核一份自然答和一条实际程序轨迹，主开发者点验引用并裁决。AI复核不称真人盲评。
- [ ] 一张表分别列 A可表达/执行、B自动编写、C实际使用/变化、自然质量和同条件收益。局部程序结论同时列 scope/assumptions/semanticSupport，不藏 whole-request缺口。
- [ ] 宿主校验的是声明和已绑定源码关系的组合；独立源码评阅负责确认声明含义。自动稿valid、bound、checked、语义支持及整体full各自记录。
- [ ] 保留support/tradeoff/no-observed-difference/negative/inconclusive；没有同条件收益就交付工程成果和具体未达责任，不写“本轮保证正向”。

### BF15 — 相关验证与普通文档

**Files:** `docs/usage.md`、`docs/skill-ir/developer-guide.md`、既有 `examples/authorization-assessment/` 下一个小型可搬移示例；研究§1/§7.67/§11、spec14.45、current-status、plan。

- [ ] 运行受影响公共链/类型/研究测试；源码修复后才重跑对应集，最后合并一次必要验证。不重复全历史归档核验、全仓实验或全量依赖安装。
- [ ] 例子给出真实可复制的check/run/inspect/compare命令，明确待提供的源码目录与真实前提；不得在说明中发布未实现选项。示例不包含评阅答案。
- [ ] 状态/summary/acceptance/accounting共用已有原件身份，记录原稿、修订、未运行原因、unknown费用与旧暂停。input已含cache则不再相加。
- [ ] 更新统一研究正文，不另建日期化组件正文；根日志和handoff/communication本地同步。当前导航只保留必要指针。

### BF16 — 提前完成后的有用余量

按剩余时间顺序实施，全部仍用同一核心和当前已暴露材料。不得用额外付费面板凑时长。

- [ ] 先补任意顺序读源/提交、同callee两调用实例、搬移根路径后的稳定性，定位并修实际缺陷；已有覆盖则记录引用而不重复测试。
- [ ] 再检查真实发送边界的重复声明/完整源码是否可按需取回，做不丢决定性信息的确定性减负；只报告实际字节差，token效果另测。
- [ ] 最后删掉本轮新引入的重复适配、补一条开发者排障说明，减少后续作者需要知道的内部细节。不要趁余量清理历史证据或扩新语言/任务类。

### BF17 — 发布与接手

- [ ] 按责任做少量目的提交，只暂存本轮修改；检查新原件可读/未被行尾转换和敏感信息一次，推用户origin/skill-ir-aot，核对远端SHA。
- [ ] 最终说明“现在能实际运行什么”“哪条程序真的执行”“自动生成走到哪”“哪些收益已测”“哪些责任仍缺”，附普通入口与准确恢复命令。
- [ ] 工程、有限队列处置、研究目标分别收束；条件未满足/时间未运行的实验写未运行，不冒充已执行或已满足验收。未知活动请求不重发。

## 五、验证接点与有限调用安排

先用当前已有命令核对相关接口；新增程序/研究测试落地后补进本节，禁止把下面的旧测试通过当作BF新行为完成：

```powershell
Set-Location 'D:/skill优化/SkVM'
bun test ./src/task-dsl/authorization/question-workflow.test.ts ./src/task-dsl/authorization/property-query.test.ts ./src/task-dsl/authorization/control-conclusion.test.ts
bun test ./src/benchmarks/authorization-dsl/inquiry-focus.test.ts ./src/benchmarks/authorization-dsl/source-material-projection.test.ts ./src/benchmarks/authorization-dsl/interprocedural-property-entrypoints.test.ts
bun test ./src/benchmarks/authorization-dsl/question-workflow-entrypoints.test.ts ./src/benchmarks/authorization-dsl/question-workflow-reuse.test.ts ./src/benchmarks/authorization-dsl/inquiry-reuse-local.test.ts
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
git diff --check
```

真实会话沿既有64总工具单位、768KiB显示、32MiB读取、45分钟会话上限；自动动作计入同预算。六首位置+至多第二H/D对+最多3具名修订是研究工作上限，不是必须耗尽的额度。预计最后45分钟不启动新的长会话，先保存交付；实际可完成时间按前件观察调整。连续运行不靠账号等待维持。

官方账号gpt-5.6-sol/high已授权，第三方仍暂停。确定终态routing失败只允许一次登记恢复，连续两次或本轮累计三次恢复仍失败则暂停外部派发；quota/auth立即暂停该通道。unknown只核原生命周期，不自动补跑，不换模型或旁路。旧OWUI两未知与费用保留，本轮OWUI仅离线。

保留目标源码只读、评价器隔离、来源身份与失效、原件和失败记录这几项实质约束；不增加重复摘要链、无目的审计、日常确认或隐藏模型调用。held-out/Q1/prospective/readiness/历史0/6不变。

## 六、验收与转向依据

| 责任 | 达成所需事实 | 未达时继续做什么 |
|---|---|---|
| 真实DSL可表达、可执行 | A从普通入口得到至少一个有原文支持的局部checked/violated及非空跨函数trace，前提/范围清楚，关键反例正确 | 首阻断定位到具体语义/接口；有界修订，不以造更多模型稿代替 |
| 自动编写接线 | B原稿或具名修订经同一核心产生实际采用，不靠开发者代填 | 分开未读、路由、含义和组合缺口；保留A工程与自动未达 |
| 实际程序使用 | C普通消费者调用同包，输出引用当前结果/残余，搬移有效 | 修公共入口和消费触发，不把加载计作采用 |
| 变化与复用 | 对当前scope正确重算/失效，R1实际used；R2若存在则核依赖后重算 | 只交付已经实测的R0/R1，不声称旧verdict收益 |
| 真实效果 | 同条件答案不靠预给含义占优；质量/成本各列原件和差异 | 负向/取舍如实保留，D继续显式，H候选/项目默认不变 |

局部程序执行成功是本轮明确工程目标；完整原skill自动优化、所有问题full、DSL稳定优势和人力节省仍需各自实证。若A也始终无实际链，最后结论必须给出不可表达的最小真实关系和已尝试修订；若A成功而B失败，下一责任聚焦编写；若A/B成功而C无收益，下一责任聚焦任务组织与消费成本。不要再把三种情况合写成“继续补语言语义”。
