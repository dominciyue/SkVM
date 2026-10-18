# BQ0–BQ17：先修源码与程序的一致性，再完成一次真实任务使用

> **For agentic workers:** 使用 executing-plans；缺陷定位使用 systematic-debugging，生产修改使用 test-driven-development。用户已授权直接执行、有限真实实验和发布，开发模型为 `gpt-6-astra/high`。常规检查点不等待确认。探子仅做独立、窄范围只读核验，开发线程独占实现、共享文档和 Git 写入。

**状态：** in-progress（2026-10-18）。BQ0–BQ7 已完成共享红绿、普通接线和首次调用前登记，进入三项真实用途；尚无模型修稿结果。接管 HEAD 为 `a0e306cb`，BP 队列保持关闭。

**Goal：** 修复自动编写过程漏掉调用者条件、缺键语义以及“说明已修但程序未修”的共享缺陷；让同一份自动程序实际参与源码排障、修稿、回归和后续使用，给出可重放的过程与准确结果。

**Architecture：** 复用现有 source skeleton/flow、源码候选、resource workflow、when/field.default、draft/patch/trial、rules/execute 支持和普通 inquiry 入口。宿主指出当前源码结构、程序连接和运行现象，模型解释源码并修改原稿。保留不确定含义，避免用一轮新的语言解释器或大面板替代缺陷修复。

**Tech Stack：** TypeScript、Bun、Zod、既有只读源码工具及官方账号适配器。

- 仓库：`D:\skill优化\SkVM`，分支 `skill-ir-aot`；不创建分支或 worktree，只推用户 `origin`。
- 规划时 HEAD：`27d59677f8a3257d1a4e0ee687519ad518306aba`。tracked 干净，既有 `.tmp/` 保留。接管时重新检查实际 HEAD。
- identity：`authorization-source-program-consistency-v1`。研究代码、输入、原件和结果集中于 `results/skill-ir/skill-dsl-research/development/authorization-source-program-consistency-v1/`，下文简称 BQ 目录。
- 开发线程使用用户本轮指定的 `gpt-6-astra/high`；三个被测用途继续使用此前明确授权的官方账号 `gpt-5.6-sol/high`。两种模型分别配置、分别记账，派发开发线程不更换实验模型。第三方付费 API 暂停，开发代理不冒充被测作者。
- 队列为共享修复 → 一项真实源码任务的两臂使用 → 同一自动稿的普通消费。正常模型用途仅 **3 个**，最多 **3 个具名修复确认 attempt**；续作和上游调用全部留账，不把用途数量称作 provider 调用数量。
- 没有运行时长下限。完成实质责任后收束；不等待、不重复全量验证、不扩样凑时间，不自动创建 BR。

## 一、BP 已核实的基础与这轮应解决的问题

BP 有可运行的自动程序，且规则材料确实帮助了部分回答。主面板每臂计划 12 个位置，四问 full 数分别为 R0 `4/1/5/0`、R1 `11/9/12/0`、R2 `11/10/11/0`；交付数为 `11/12/11`。这些来自同一公开任务与相关输入，保留所有失败分母。原整题 `0/36 full` 不改。

执行支持的额外增量较弱：R2 主面板收到宿主执行上下文，但实际历史中没有主动 trial。Q0 两次重复在部分分支事实改善，另有退步和额度失败。规则组织收益与执行增量必须分开检验。

固定 A0 为 52 步自动稿，A1 空稿修订后与 A0 一样达到历史字段/局部轨迹 `18/18、7/8、6/7`；A2 的字段结果更弱。A0/A1 仍漏两处源码语义：

1. 调用者外层 `request.user is not None` 未控制 helper/constructor 的实际激活。只写 helper 内部 owner 短路，不能补齐这个调用者条件。
2. 源码 `.get("version")` 在完整请求映射里键不存在时返回 None；程序直接读取 `request.version` 却产生 `field-missing`。缺键、显式 null、空字符串和根本没有可靠输入是四种情况。

父线程用当前执行器零模型复现：默认得到文件 11/archive；actor 为 null 或完整 request 缺 version 键时，原稿仍出现不应有的局部缺口。没有改旧原件。

当前共享代码的具体责任：

| 位置 | 已有能力 | 实际缺口与 BQ 责任 |
|---|---|---|
| `program-obligations.ts::projectProgramCallRelations` | 核对作者声明的 activationDependencyIds、when 引用与完成关系 | 没声明外层依赖时只显示 dependencies-unreviewed；需要从实际已读源码提供相关外层结构线索，不能只核对作者自述 |
| `program-obligations.ts::projectProgramObligations` / `projectProgramCandidateFrontier` | 当前精确源位置、未映射候选及函数级路由 | 将调用及其真实包围分支、已确认 caller 位置一起展示；不把“同一函数”当完整授权证明 |
| `source-skeleton.ts::buildSourceSkeleton` | 嵌套 SourceFlow、true/false 边、sourceCallId、调用参数与源码文本 | 能提供词法结构；没有通用 `.get` 语义求值。复用结构，不从方法名猜返回值或授权意义 |
| `resource-relations.ts::executeResourceWorkflow` | when、field.default、unknown、外部调用正常返回 | 关键表达能力已存在；首先修作者接线和反馈，保持缺事实与默认值的区别 |
| `program-trial.ts::runProgramTrial` | 当前 revision、1–4 输入批次、逐案例轨迹、source freshness | 已可做多输入验证；需要在真实使用中被调用，并将修订后的 raw 与声称的修复对应 |
| `inquiry-native.ts` / rules 支持 | 明确 edit 交付职责、持久 draft、rules 无求值 | 两臂保持共同源码反馈、同等交付职责；新增反馈不得只在研究 runner 中生效 |

BP 的 E2 量规还暴露了评价层问题：34 份交付均未完整写出 false/None 与正常完成的区别；其中 R1 有 8 份、R2 有 10 份只缺这一项。BQ 保留 BP 原评分，分别评价源码决策、关键遗漏和执行抽象说明。不能靠补一个固定句式宣称质量成功，也不能用抽象说明遗漏遮蔽所有已正确的源码判断。

## 二、上下文与写入责任

顺序阅读以下文档，旧阶段只按具体问题追溯：

1. 父目录及仓库 `AGENTS.md`、`docs/skill-ir/current-status.md`、本任务书全文。
2. [当前计划](../../skill-ir/skill-ir-aot-optimization-plan.md)、[spec §14.56](../../skill-ir/skill-ir-aot-optimization-spec.md#1456-bq-source-program-consistency-and-real-task-use)、[研究 §7.78](../../skill-ir/skill-dsl-research.md#778-bp-复核与-bq-先修复后实际使用)及研究 §1/§11。
3. BP 目录的 `execution.md`、`evaluation/author-summary.json`、`evaluation/selected/summary.json`、`evaluation/quality-reviews.json`、`evaluation/rubric.json`、`verification/completion-semantic-review.json`、`verification/q0-actual-use-review.json`、`verification/maintenance.json`。按需查看原回答和 raw，不再重跑写回 BP 的研究命令。
4. [Download 入口](../../../examples/authorization-assessment/download-workflow/README.md)与 `run.ps1`；BP `study.ts`、`panel.ts`、`configuration.json` 只作复用参照，不复制整个 45 位置队列。
5. 本地 handoff/communication 只读最新恢复点及 BQ 决定；阶段记录追加 conversation_log。

主要代码责任：

- `src/task-dsl/authorization/program-obligations.ts`、`program-coverage.ts` 及对应测试：源码关联、缺口反馈。
- 同目录 `program-consumption-context.ts`、`program-trial.ts`、`resource-program-draft.ts` 及相应测试：按需详情、当前修稿及试跑记录。能复用的接口不另造一套。
- `src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts`、`inquiry-native.ts`、实际 rules runtime：接通普通入口和两个支持模式。先搜索现有符号再编辑，不按文件名猜实现。
- `source-skeleton.ts` 仅在现有结构无法输出所需词法关系时增加薄投影；不建设新的 Python/Go 语义。
- `resource-relations.ts` 只修已复现的通用执行错误；不得把所有缺字段默认为 null，或把 conditional 改名为通过。
- BQ 目录持有有限 runner、评价和证据；长期文档仍复用 current-status、spec、plan、research、developer-guide 和既有例子。

## 三、实现合同

### 3.1 源码关联反馈应提供什么

对已经关联到源码的程序调用，输出当前 source revision、调用 span、词法包围条件/分支、已由索引证实的 caller 位置，以及这些位置是否被当前程序引用/表达。沿现有调用边提供有界上下文；同名或多候选不能静默选第一个。

结构提取可以确定“调用位于这个条件分支里”，不能自行断言该条件是授权、把某个字段解释为 principal，或合成业务正确谓词。跨函数还需真实调用边；没有读到 caller 时明确缺读范围，不能说“无外层条件”。反馈覆盖所有已映射 external call，而非只有主动填 coverage.call 的条目。重复提示按源码/草稿 revision 去重，详情按需读取。

静态反馈供 rules/execute 两臂共同使用。已有未映射义务、当前 raw 引用和结构线索合并呈现；不要再叠一个必须全满足才能继续运行的全局门。缺口影响的是支持结论与局部执行范围，保留可运行部分。

### 3.2 缺键与输入边界

沿已有输入合同区分：完整映射缺键、显式 null、空串、父对象未知、外部结果未知。只对已知完整映射测试“键不存在”；不得把未知输入伪装成确定缺键。`field.default` 由模型依据实际源码编写；通用示例可说明操作语义，不得内置 `version -> null` 或 Paperless 名称判断。

对 `.get(...)` 提供当前源码文本/实参和相关输入读取路径，交给模型解释它在该类型上的含义。不能把所有名为 get 的方法当 Python dict。一个按键修改的 trial 应留下 case ID、输入来源、raw revision 和实际输出；已有 1–4 case 批次能力足够，不扩大预算绕过遗漏。

### 3.3 说明与实际原稿

持久原稿、编译 candidate、当前采用稿和模型终答是独立对象。输出清楚列出 draft revision、改过哪些步骤、哪些 trial 使用该 revision、哪些问题仍未改。模型声称“已补齐外层条件”时，评价必须检查相应 raw 和实际跳过事件。

只做可验证的关联和归档，不增设一个未经验证的“自然语言一致性证明器”。没有适用试跑时标记未验证；源码变化或修改 raw 后不能沿用旧 trial 作为当前通过。无错的局部结果可以保留，剩余 unknown 不自动消失。

### 3.4 质量与实验合同

本轮真实任务是：**维护当前 SkVM 自动生成的 Paperless Download 辅助程序，核对它与真实公开源码在不同请求输入下的差异，交付修订程序、可重放回归输入和有来源的解释，并由普通入口再次使用。** 这是实际项目产物的排障任务；数据为显式有限 fixture，源码只读，不执行真实 Paperless 服务或数据库，不冒充生产事故或 live API 测试。

两臂任务正文、完整 Cloudflare security-audit skill、原四问、允许源码、初始 BP 原稿、事实、源码工具、共同静态反馈、模型和总预算相同：

- **T-R：rules/edit**。阅读原稿/规则与源码，可 patch 持久原稿、检查结构。没有 trial/执行上下文。
- **T-E：execute/edit**。同一份原稿与任务，增加有限执行及 trial。需要用实际多输入试跑参与诊断、修稿或验收；仅收到默认执行上下文不计主动采用。

真实任务书正文只描述需要完成的工作与输入范围，不提供正确 guard、默认值、预期文件、oracle 分数或 BP 评阅。源码结构提示可原样展示公开源码，不携带 evaluator 的语义结论。被测模型可以看自己的失败输出与诊断。

初始原稿固定为 BP A0，所有步骤/claims 原字节保留；若因新接口确需机械迁移，保存原稿及迁移 diff，给两臂同一份迁移结果并单列成本，不能改业务语义。作者阅读材料只映射到明确 allowlist，禁止父目录任意读取研究答案。

输入范围覆盖现有正常输入、actor 为 None、完整 request 缺 version、显式 null、空串、明确拒绝和缺外部事实。这些是公开 development 范围，不包装为 unseen。允许模型自行设计 trial，独立完整用例和 expected 保持在模型边界外。

两臂均需交付可复现的回归输入。rules 可在回答中给结构化输入或无歧义参数表，由归档器机械保存；execute 的实际 trial 输入直接保存，并可补尚未运行的声明输入。归档不得替模型补条件或预期结果，也不为写回归文件新增一套必填协议。

T-R 与 T-E 按预先登记顺序串行执行。任何共享修复改变实验实现，原首件保留；若需重新比较，两臂都从同一原稿在新 epoch 各确认一次，占用修复名额，不能把旧臂与新臂作公平配对。

另一个用途 **U-E：execute/consume** 从 T-E 最终当前原字节继续，只提一个正常任务请求：解释一组尚未在该会话运行的、已登记 development 输入与正常输入之间的行为差异，并交付原四问及局部限制。禁止改稿。原件若仍有缺口照样以准确范围消费并计失败，不拿 T-R、历史好稿或开发者稿替换。这个用途检验交付物能被别人实际用起来，不增加效果比较样本。

## 四、逐项执行队列

### BQ0 接管与有限队列登记

- 读必读上下文；核查 Git、BP 终态和当前无写入线程/活动请求。保存接管 SHA 与 `.tmp/` 状态，不清理。
- 建立 BQ `status.json`、`manifest.json`，分开 requiredCriteria 与 actualResults，未做项用 pending，不用 true 表示目标。
- 记录 3 个用途 T-R、T-E、U-E、预先固定顺序、修复上限和未知恢复规则；配置检查采用零调用方式，不先发模型健康探针。

### BQ1 复现已知错误，建立最短失败路径

- 读 BP 固定自动稿和原事实；在 BQ 派生结果中运行正常、None、缺键、null、空串、拒绝、外部未知，保存字段/事件/条件，旧 BP 目录只读。
- 确认缺口源于程序遗漏、反馈缺失还是执行器错误。不要因看到 field-missing 就改执行器的全局默认。
- 为两个主要缺陷各写一个匿名跨函数小例，以及来源过期/调用歧义反例；测试不能只检查新字段存在。

### BQ2 源码条件关联的失败测试

- caller 外层条件控制 helper，helper 里再短路：即使模型只声明内部依赖，也必须显示外层结构未核对。
- 程序缺 coverage.call 时仍显示该真实调用的相关源码候选；不要求先填字段才能发现问题。
- 有调用关系和无调用关系的同名函数分开；不能把别处的 guard 贴到当前调用。
- caller 未读、源码变更、true/false 支路、外层未知分别给具名范围，不能直接认证安全。
- 先运行预期失败，再实现最小共享投影，并确认旧程序兼容。

### BQ3 接通源码反馈

- 复用 SourceFlow/edges/sourceCallId 和既有 source candidates，建立当前调用的有界结构上下文。
- 同时接入 rules 与 execute 的 details/编辑反馈；两者静态部分一致，rules 不触发执行编译器。
- 没有足够结构时用需读来源或歧义说明，不能通过函数名/手写行号表补“正确答案”。
- 针对 BP 源码重放反馈，证明它能指出此前隐藏的外层范围；反馈准确性与模型是否修好分开记录。

### BQ4 缺键/default 与局部值保持

- 红绿覆盖完整对象缺键、null、空串、父对象未知、外部未知；默认值仅在已知缺键时生效。
- 在现有工具说明/局部反馈中公开 field.default 的准确语义与输入完整性；避免全量重复 schema。
- 通用反例包括同名 get 的非字典调用；不能由拼写推断其结果。
- 顺带定位 BP A2 “一个未知字段使记录整体未知”的现象：若属于当前 record 合同，明确标注，不为提高分数直接改其语义。仅当它阻挡本轮真实任务且可安全局部投影时才加独立字段观测，返回原语义保持。

### BQ5 当前修稿与试跑结果接线

- 红绿验证 revision 改变使旧 trial 不再代表当前稿；无 raw 修改的自然纠错不得显示 program-repaired。
- 普通 program/patch/details/trial、归档、恢复和 final context 中同一 revision 一致。展示结果按实际事件，不把 authored literal 标作 computed proof。
- 让作者能直接定位“相关源码 → 当前步骤 → 输入变化 → 当前结果/缺口”，避免再增加必填协议或重复填同一事实。

### BQ6 普通入口联合验证

- 沿现有 CLI 验证 rules/edit、execute/edit、consume、inspect，校验明确交付职责和同一 reusable 目标保留。
- rules 模式的初始包、details、patch、恢复和 final-child 中不出现执行/期望结果；execute 真实 trial 可归档并重放。
- 使用 fake account/确定性测试检查完整接线。只有研究脚本收到新反馈而普通命令没有收到，视为工程未完成。

### BQ7 固定真实任务、用例与分层评价

- 将现有 18 历史、8 额外、7 扰动按原标签保留；追加必要的小型边界组合，列出来源及预期形成依据，所有组合不称独立新任务。
- evaluator 独立依据真实源码和调用顺序，不用待测程序自己的 output 充当 expected。None 用例区分局部函数路径与上游认证可达性；完成标记与授权 grant 分开。
- 记录任务正文和两个支持模式公共字段对账；作者/消费者模型不可读量规、旧答案、开发者修复草稿和 expected。
- 评价三轴：程序字段/局部事件/必要条件；源码决策与关键遗漏；说明中计算、外部前提及未审语义的忠实性。原四问和失败分母仍保留；BP 的 E2 原分数不重写。
- 具体判定条件在第一次真实调用前固定，之后若发现 scorer 错误，保留新旧结果及更正依据，不选择有利口径。

### BQ8 执行 T-R 真实排障任务

- 从固定 BP 原稿，以普通 inquiry rules/edit 跑同一任务。保存首个有效 raw、最终 raw、每次 patch、原回答和生命周期。
- 允许模型通过源码检查发现问题并自主修稿；不提示正确谓词/行号答案。最终“没有改稿”如实记录。
- 独立评阅后若发现共享实现问题，当场红绿修复，先处理再运行剩余受影响用途。语义错读不能简单追加同提示重抽。

### BQ9 执行 T-E 真实排障任务

- 从同一 BP 原稿和同一公共任务开始，不继承 T-R 的答案或修稿。
- 记录 active trial 的参数、case ID、revision、结果和后续采用；模型应在实际任务中选择多输入试跑，宿主不投喂 oracle。
- 首次错误立即定位。共享错误改共享代码；纯源码理解不足给当前工具实际诊断或具名缺读位置，允许一次有据修订，保留首件。不得由主代理直接编辑自动 raw。
- 最终原稿原字节固定；不选 T-R/首稿/历史稿中得分最高者代替 T-E。

### BQ10 零模型运行全部交付稿

- 通过公共执行器运行 T-R/T-E 首稿与最终稿的全部登记输入，报告字段、调用顺序、跳过、拒绝、条件和返回依据。
- 两个已知主要缺陷必须有修订前后对照；正常、拒绝、未知路径不得退化。保留 scope 限制与未审 source meaning。
- 还错时输出准确到源码/步骤/输入的责任。只在剩余具名修复额度内确认共享修复，不增加第三种方案或无限作者。

### BQ11 一次普通消费 U-E

- 使用 T-E 固定最终 raw、同一原 skill、源码和已登记输入，运行普通 execute/consume；保持程序不可编辑。
- 交付原四问及当前请求差异说明；能引用实际 trial/执行则关联到当前 revision，没有调用如实写没有。
- 当前稿 partial 仍可用于准确辅助，缺口计入使用结果。完全无稿时该用途为 not-run-no-program，不以开发者稿补位。

### BQ12 源码变更与可搬移验证

- 零模型复制会话/源材料到临时测试目录，验证普通 inspect/replay；不创建 Git worktree。
- 对测试副本仅修改相关 source span，确认旧依据撤回、无关值不被当成新源码证明；不再追加真实模型维护面板。
- 测试目录清理仅限确认解析在本轮绝对路径内的可复现副本；包含本地唯一原件的一律保留并列入口。

### BQ13 独立源码与任务评阅

- 评阅 T-R/T-E/U-E 原答案与 raw，不让“试跑通过”替代源码判断。核对 caller 激活、版本缺省、外部返回与完成、拒绝路径及上游限制。
- 好的结果逐项写出，并与错误、遗漏、未交付同表。对计算正确但说明缺编码细节的情况分别评分；错误授权结论不能归类为文风问题。
- 如有盲评探子，按 AGENTS 只读、给自包含材料，不参与作者修稿或最终设计。主代理裁定争议并记录原评阅，不需额外付费评审队列。

### BQ14 同条件比较与真实采用分析

- T-R 与 T-E 只做同任务有界比较，报告诊断命中、修订前后 raw 行为、残留缺口、自然任务交付和实际工具使用。
- `executionParticipated` 需要当前试跑结果实际参与诊断/修订/验收的事件链，自动附带 trace 或模型说“用了”不够。
- 一对有利结果可记局部支持证据；不称重复优势、泛化或因果稳定收益。持平、取舍、负向同样收束。若原稿本来已满足某项，不能把未发生的修复算改善。
- input（cache read只计一次）、output、工具/试跑、耗时、known/unknown 分账；没有provider价格不填美元0。质量结果与成本分轴。

### BQ15 普通使用交付

- 更新既有 Download README，给出本轮原稿明确路径、一次零模型运行、一次实际普通消费和检查结果位置；不要要求用户拼接研究内部参数。
- 只有本轮稿确实成为可推荐替代物才讨论默认切换；默认不变时提供显式 ProgramFile。不能把旧 BL 默认结果误称本轮自动成果。
- 在 BQ `execution.md` 展示完整任务链的简明步骤：输入/源码 → 模型修改 → 当前 raw → 多输入执行 → 结果与剩余条件 → 后续消费。避免增加 HTML 展示层。

### BQ16 定向验证与研究同步

- 先跑改动模块和实际调用链的相关测试、主/研究类型检查，再跑文档单测与本轮修改文档链接；不反复全历史审计。
- 可直接起步的测试命令：`bun test src/task-dsl/authorization/program-obligations.test.ts src/task-dsl/authorization/resource-relations.test.ts`；其余按实际改动补齐 trial、draft、native/rules、普通 CLI 测试。研究入口固定在 BQ `study.test.ts` / `tsconfig.json`，编写后运行。
- 主类型：`bun run typecheck`；研究类型：`bunx tsc --noEmit -p results/skill-ir/skill-dsl-research/development/authorization-source-program-consistency-v1/tsconfig.json`；文档：`python -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py`。
- 保存零调用重放与原件核验；有失败则记录归属和影响，旧全 src 104 失败不宣称消失。
- 同步 current-status、spec §14.56、plan、研究 §7.78/§1/§11、必要的组件说明和本地交接日志。工程、自动修复、实际任务、比较收益分别写。

### BQ17 发布与结束

- 检查本轮白名单 staged diff、敏感信息和 Git，提交并推用户 origin/skill-ir-aot，核对远端 SHA。
- 保留所有首轮/修订、未知费用和 `.tmp/`，不清理其它线程历史材料。
- 最终交付可直接运行的命令、真实任务输出、原稿来源、修复前后差异、验收表和剩余最短责任。队列可完成而研究未达；不要用测试数替代使用效果。
- 停止本有限队列，不自动生成 BR 或追加模型试验。

## 五、有限预算、当场修复与恢复

1. 正常用途 T-R、T-E、U-E 各一次；每用途总工具预算沿现有 64 单位，总时限 45 分钟，最多两次已知终态续作共享原预算，不新开满额会话。试跑每 case 计一单位。初始工具定义、显示/读取预算和 final child 继承同一合同。
2. 最多 3 个具名修复确认 attempt。共享修改需要重配对时 T-R/T-E 两次都计入；原首件始终保留。同因第二次仍失败后停止同位置重抽，继续独立工程、已允许的普通使用或准确失败交付。
   - attempt 指一个新登记、独立起点的账号用途尝试；同一 attempt 的续作只增加 turn/request，不重置其工具、时间或修订预算。未知原请求仍禁止续发。
   - 例如首对实现epoch为E0，修复为E1：T-R-confirm-1与T-E-confirm-1各占一个确认名额，共2个，剩1个。若只剩1个名额而再次修改了共享实现，不能跨epoch拼成配对；可作单臂故障确认，比较标记不可成立。离线测试修复不限于3次，这个上限约束额外账号attempt。
3. 错误出现就定位并修，不跑完一批已知坏实现再修。发现的是 shared schema/tool/context 缺陷，先红测再改；发现的是模型语义缺口，反馈实际来源/本次运行诊断，不把 evaluator 答案填给模型。
4. 未知或活动请求不重发。只读核对生命周期，沿 BK 隔离旧 unknown；不能因查不到旧 ephemeral 终态永久阻断所有独立工程。新 quota/auth 立即暂停账号调用；相同路由故障一次有据恢复仍失败就暂停该通道。无需反复问用户已授权事项。
5. 通道暂停时完成离线实现、复现、文档和可恢复命令，真实用途保持 not-run/unknown。不得切回暂停的第三方或拿主开发代理回答补实验样本。

## 六、验收与结论

| 轴 | 必须有的证据 | 未达到时如何交付 |
|---|---|---|
| 共享修复 | 匿名 caller/缺键正反例红绿；普通入口收到相关结构与当前反馈；无 skill/仓库名成功分支 | 具名仍缺接口及复现输入，不把提示扩写称完成 |
| 自动程序 | T-E 原字节由模型修订；None/缺键及原正常、拒绝、unknown路径的字段/事件/条件均核对 | 首稿/终稿和全部失败并列，不能手工拼成好稿 |
| 真实采用 | 真实任务中的 trial/patch/结果采用证据，随后普通 U-E 原字节使用 | 收到上下文、主动调用、影响结果分别报告 |
| 任务质量 | 源码决策正确、关键范围无遗漏、表达与实际 raw一致；原四问另列 | 遗漏语义、抽象说明、协议/通道分开但均保留端到端分母 |
| 比较 | 同 epoch T-R/T-E 公共信息一致，正负/成本全表 | 单对仅作有界观察；未知通道/实现变化时不强作公平因果比较 |

“问题解决”至少要求两个已知缺陷在自动交付稿中实际消失且保留输入无关键退步；工程诊断已显示但模型没有修对，必须明确仍未解决。源码局部正确与完整 HTTP 授权各自报告。一个任务成功不能推出全类 skill 完成，但它应当给用户一个确实可用、可再运行的具体交付物。
