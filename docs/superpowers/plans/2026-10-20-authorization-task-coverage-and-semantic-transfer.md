# BS：原任务覆盖、源码执行顺序与跨结构语义使用

> **执行方式：** 在新开发线程使用 `superpowers:executing-plans` 连续执行 BS0–BS22。开发模型为 `gpt-6-astra`、reasoning `high`。用户已授权本任务书的有限工程、官方账号实验及发布；常规检查点不等待确认。完成队列后停止，不自动追加 BT。

**Goal：** 让现有领域程序在真实原任务中提供可用的计算和源码依据，补齐 BR 暴露的原题遗漏、调用/错误顺序与消费说明缺口，并在一个创建写入任务上检验共享方法。交付包括普通入口可运行的自动原稿、原/变输入执行过程、完整原问题的自然回答及可解释的 N/R/E 对照；如未达，精确保留失败和剩余责任。

**Architecture：** 复用现有 `program-obligations`、call relations、trial、consumption context、delivery 和普通 inquiry/native 入口。宿主组织当前原题、来源位置、已执行路径与未覆盖的调查责任；模型仍从源码判断授权含义、编写业务程序并回答问题。优先改已有投影和共享反馈，不新增必填答案协议、平行账本或另一套 CLI。

**Tech Stack：** TypeScript、Bun、现有授权 DSL/账号适配器、PowerShell 普通示例、Python 文档检查。实验沿用官方账号 `gpt-5.6-sol/high`；第三方付费 API 暂停。不得执行目标服务、真实写接口或数据库写入。

**身份与基线：** `authorization-task-coverage-v1`；规划基线 `2100085ba37e1f01ef9fc7002905feeeb78e7042`，BR 已发布。结果集中于 `results/skill-ir/skill-dsl-research/development/authorization-task-coverage-v1/`；研究脚本集中于 `scripts/research/authorization-task-coverage-v1/`。这两个目录在实施时创建。工作分支 `skill-ir-aot`，只推用户 `origin`，不创建分支/worktree；保留现有未跟踪 `.tmp/`。

## 1. 接管时必须读什么

按顺序阅读父目录及仓库 `AGENTS.md`、[current-status](../../skill-ir/current-status.md)、本任务书、[spec §14.58](../../skill-ir/skill-ir-aot-optimization-spec.md#1458-bs-task-coverage-and-semantic-transfer)、[研究 §7.80](../../skill-ir/skill-dsl-research.md#780-br-复核与-bs-原题覆盖和跨结构语义使用)。实际开发按需读[开发指南](../../skill-ir/developer-guide.md)、[普通使用](../../usage.md)及两个既有示例；不要从头重读历史全量结果。

BR 交接依据为 `authorization-answer-transfer-v1` 的 `summary.json`、`verification/acceptance-matrix.json`、`execution.md`、`evaluation/confirmation-source-review.json`、`evaluation/author-phase-adjudication.json` 和逐消费者评阅。若某文件在压缩原件内，先用 BR 已有恢复说明取回，不重新运行模型。父复核记录位于 `D:\skill优化\project-maintenance\br-review-20261019-152904\review.json`，仅作定位辅助，以仓库原件为准。

接管后先核对当前分支、实际 HEAD、origin、其他写入线程和请求账本。计划提交会位于 BR 基线之后；不要把这些计划变更误认为实验代码。若发现并行写入，明确文件归属后继续独立工作，不覆盖对方文件。

## 2. 已确认的问题与本轮边界

| BR 事实 | 本轮处理 |
|---|---|
| 最后 25 步 Memos 原稿在 20 个已知结果/选定标量上匹配；两个缺输入案例保留条件 | 保留首/终稿，补独立的调用顺序、错误传播及安全相关响应检查；不把标量相等称为源语义完整 |
| recognized audience 与 creator 拒绝被提前，源码实际还可能先读取 context、space/member | 用共同失败条件检验真实先后顺序；先修共享反馈，再由模型修原稿 |
| conversion 只被缩成单一错误前提和摘要，第二次 creator lookup 等未展开 | 对原题必要的返回/错误语义提供实际源码依据；无需重建完整 protobuf 或 Go 解释器 |
| Download 两答完整；Memos 六答全部 partial，常漏匿名入口/bootstrap、转换错误 | 全部原问题保留，区分计算结果与仍需调查的源码问题；独立评价自然回答 |
| E 在变化输入下遗漏了 R 已说明的转换错误 | 检查实际发给模型的当前材料，判断是组织、容量、未读还是未采用；不先假定截断 |
| 义务投影、call relations、details、trial、delivery 已存在 | 修改这些共享接口，不再增加相同职责的状态层或要求模型填一张验收表 |

Memos 的 exact-share 路径可绕过普通 membership 授权。缺少 membership 的 Role/IsActiveMember 不能直接判成额外放行；应按真实 access helper 和 placement 路径分别核验。`unexecuted-external-branch` 修复只纠正静态标签，BR 已确认它不是 BQ 自然遗漏的原因。

本轮把“源码程序忠实性”和“自然回答质量”分开测量。读过、映射过、执行过、格式有效均只说明对应事实，不自动得到语义完整标签。完整原问题是主分母；局部改善、退步、未知与未交付同时报告。

## 3. 真实任务、输入及公平性

### 3.1 固定任务

**M：Memos GetSharedMemo。** 沿用 BR 的完整原 skill、原自然任务、`usememos/memos@cb42e326ba9cc266a6a9570c53e0fe04c62793f4` 和来源范围。自动作者从 BR 最后原稿原字节修订。六类原题职责全部保留；先根据源码登记当前输入和变化输入，不能把任务改成只求 memo ID。

**G：Gitea CreateIssue。** 使用已经暴露的 `go-gitea/gitea@fc28937a8d772fe9e4025c9b5f24d5db4d86610b`。来源入口为 `results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/model/inputs/gitea-create-issue.json`，只复用其自然 brief、政策、repo/ref 和允许源码，禁止复制旧解释、裁定或答案。核心源码定位：`routers/api/v1/api.go` 的 CreateIssue 路由、`routers/api/v1/repo/issue.go` 的 CreateIssue、`services/issue/issue.go` 的 NewIssue；必要 helper 在同 ref/已有允许范围内读取。

G 继续使用已归档完整 GitHub security-review 原 skill；精确路径、版本和正文身份在 BS1 登记。M/G 可以使用同一原 skill 执行不同真实任务，不据此声称增加了独立 skill 家族。Download 的完整 Cloudflare skill 只保留兼容证据。不要为凑 skill 数另行获取未经授权的 reserve。

G 的独立实验政策为“创建 issue 需要 repository issues unit 的写权限，单独 repository read 不够”，来源为旧输入的 `experimental-user-brief:gitea-issue-policy/v1`。必须标为研究中提供的用户政策，不能称 Gitea 上游的预期安全政策或把政策不一致自动称为漏洞。模型要分别回答源码行为与该政策的符合程度。

G 的问题保留路由入口、主体与 issues-unit 权限、字段处理、创建 effect、创建后失败/响应和源码范围限制。作者从空稿开始；有限程序至少尝试表示这些问题中可以执行的分支，并具名保留其他责任。不要事先写入正确 guard、permission、effect 判断或开发者参考程序。

### 3.2 来源和评价隔离

外部真实 skill、固定真实代码、研究者提出的任务/政策、合成运行事实及独立源码 oracle 分列。Memos 不是 live API；Gitea 不创建真实 issue。合成事实可以包含数据库返回和外部错误，但源码可见的核心授权不能被一个虚构 `allowed:true` 替代。

在第一次作者调用前，从源码先定问题和案例。M 案例保留 BR 22 个输入，并补到达/错误顺序、conversion creator missing/其他错误等反例；G 覆盖 read/write 主体、输入处理、创建前失败、事务失败、创建后失败、成功和必要事实缺失。预期提交/回滚等含义必须读实际实现；没读到就保留 unknown，不能根据函数名猜测。每例注明它检验标量、顺序、局部 effect 还是完整答案，不以案例数作为成果。

自然消费者只有两个源先行的输入/任务状态 M0/M1、G0/G1；变化选取会改变授权/结果或暴露错误边界的事实，正文问题完整保留。预先登记，不按自动稿得分挑最容易的输入。案例 oracle、历史答案、本文的源码裁定和评阅文件不得进入模型可读目录；全 skill、原 brief、政策和实际源码共同事实可进入。

同一块 N/R/E：同模型、完整 skill、原任务、事实、允许源码和总预算。N 使用现有源码工具，无程序；R 阅读固定自动原稿及公共源码材料，禁止执行/trial/预计算结果泄漏；E 拿同一稿和源码并可实际运行。N→R包含作者准备/材料作用，R→E才分析同稿执行增量。报告实际工具调用，不把 E 标签当采用证据。

## 4. 开发责任与失败测试

主开发线程负责代码、方法取舍、最后验证及 Git 写入；探子只做界限清楚的只读检索/独立评价，按 AGENTS 使用默认角色、干净上下文并等待结束。父线程只负责本任务书与派发。以下为责任范围，实施前读实际代码；已有等价函数就扩展它，不额外复制。

| 模块 | 责任和红测 |
|---|---|
| `src/task-dsl/authorization/program-obligations.ts` 及测试 | 同源码范围内把已有 branch/error/return/call 义务组织为原题相关调查线索；多题同源、无映射题、跨 helper、未读/未映射分开；现有候选分页不能静默遮蔽剩余项 |
| `program-consumption-context.ts` 及测试 | 当前值、已走/未走分支、来源范围、仍需调查的原题在有界上下文中可见；错误与当前条件不被静态候选淹没；raw/details 可恢复，旧 revision/basis 被拒 |
| `program-outcome.ts`、`program-trial.ts`、`program-delivery.ts` 及测试 | false/null 正常完成、抛错短路、先调用后拒绝、先 effect 后响应错误分别保留；相同终值不同执行顺序可见；最终自然交付保留全部原问题，但不以关键词计语义分 |
| `src/benchmarks/authorization-dsl/inquiry-run.ts`、`inquiry-native.ts`、`inquiry-local.ts` 及相关测试 | 普通/原 skill 入口实际使用同一共享投影；执行 Markdown 提供可读摘要与原始 JSON 入口，避免嵌入全结构目录；不把本地报告大小当模型 prompt 大小 |
| `src/benchmarks/authorization-dsl/question-workflow-wire.ts`、`program-call-loop.test.ts`、`executable-contract-entrypoints.test.ts` | 作者公开合同与当前执行器一致；诊断→源码阅读→patch→trial→当前自然交付可通过真实工具路径；不把正确业务答案编进系统提示 |
| `scripts/research/authorization-task-coverage-v1/` | 版本化输入、独立 oracle、有限运行账本、答案评价和重放；不用改旧 BR scorer/原件来使新结果更好看 |

新匿名机制反例至少包括两个不同结构：共享链接读取和创建写入。不得以 Memos/Gitea 名字分派成功逻辑。若需要 effect/错误可见性增强，先判断现有 expressions/events/conditions 能否表达；新增共享字段只有被两个匿名结构实际需要时才实现。

一个必要的匿名序列测试：先读取上下文再检查 owner，context 失败与 owner 无效同时发生；调换步骤必须暴露首个错误差异。另一个：写入已完成，随后响应转换失败；返回错误不能把已发生的局部写入记录抹掉，也不能把 source-level 模拟标成真实数据库提交。用现有执行模型写失败测试；若现有代码已正确，保留通过证据并修作者指导/采用链，不重复改执行器。

上下文测试应断言语义类别/来源/可恢复性，而非锁定整段提示字符串。未映射的问题仍在，未执行错误分支不当成本次错误，缺事实不变成安全结论，细节分页不足显式显示 remaining。

## 5. 连续队列 BS0–BS22

- [x] **BS0 接管。** 记录实际 HEAD、origin、文件归属和请求终态。BR/历史未知保持；不清理 `.tmp/`。建 status/manifest，首次 provider 派发前登记用途、输入和评价边界。
- [x] **BS1 重建真实遗漏。** 只点验 BR 六份 Memos 原答、模型实际收到的片段和对应源码，建立“问题→需要的源码→实际发送/读取→原答遗漏”表。确认 G 的真实来源、完整 skill、原 brief 和独立政策；若归档需要恢复，仅恢复相同字节/同 ref。
- [x] **BS2 源码先行定题。** 冻结 M0/M1、G0/G1、完整原题与独立 oracle。G 的创建前/后失败边界按源核验，不先照 DSL 能力缩题。任务确定后不因坏结果换项目。
- [x] **BS3 失败测试。** 为任务覆盖投影、局部顺序/错误、当前交付接线各写能定位缺陷的红测；先运行确认。已有行为已满足则记录无需改动，转到真正缺陷。
- [x] **BS4 原题调查投影。** 在现有 obligations/frontier/details 上显示原题及相关源码/未完成调查。可以先使用已有显式 provenance 和读过的 caller/callee；语义相关性仍由模型读源码确认。不得按关键词把“已读”升级为“已解决”。
- [x] **BS5 调用和错误反馈。** 修复共享投影/执行里由红测证实的顺序、短路、正常 false/null、写入后错误问题。源码调用事实与作者声明不一致需可见；宿主无法确认的顺序具名保留，不发明完整语言验证器。
- [x] **BS6 回答接线。** 将原题相关结果、当次轨迹、必要未读来源和剩余职责接入已有消费/交付接口。减少无关结构展开，保留按需 details 和原始依据；不新增强制 JSON 最终答案或额外 reviewer 模型调用。
- [x] **BS7 普通报告。** 让 `execution.md` 能直接看懂输入、实际步骤、返回/拒绝/条件、执行未覆盖的原题和证据入口。完整对象仍在 JSON；不创建 HTML、独立 CLI 或第二套状态来源。
- [x] **BS8 集成红绿。** 使用 mock 真实工具通路检验读取→修稿→试跑→当前回答；N/R/E 权限差异、rules 无计算泄漏、当前 basis 和工具预算保持。跑受影响测试及主类型检查一次。
- [ ] **BS9 A-M 自动修稿。** 首个实际账号用途：原 skill + M 原任务/源码 + BR 最后原稿，由模型自行读、patch、trial。保存所有版本，诊断允许给源位置和实际矛盾，禁止告诉模型完整正确业务程序。固定最后提交稿；无效也不倒选最好稿。
- [ ] **BS10 M 程序复验。** 零模型运行登记案例，分别评估值、到达顺序、首个错误、返回义务与缺事实。源码可见语义独立复核；发现共享故障立即修复并按第6节处理，单个作者语义缺陷允许既定续作，不能由开发者代写。
- [ ] **BS11 M0 三臂。** 顺序 N→R→E，消费者使用同一固定稿与源码 epoch。保存实际材料和工具轨迹，逐题评阅自然终答，不将未调用 trial 误判为没有宿主执行。
- [ ] **BS12 M1 三臂。** 顺序 E→R→N，仅改变登记事实；固定稿不改。失败首件、首答/终答和修复确认分列。
- [ ] **BS13 A-G 空稿自动编写。** 沿同一共享工具和已登记 CreateIssue 原题，从空稿构造有限程序。不得携带开发者参考程序、旧源码解读或 evaluator；每个源码相关授权判断要回到真实代码。
- [ ] **BS14 G 程序复验。** 同稿检查读/写权限、字段处理、创建前错误、创建后错误及未知前提。区分独立政策不符合、实现的分支语义、模拟 effect 和真实服务行为；没有可采用稿时照实保留普通失败，不换另一份人工稿。
- [ ] **BS15 G0 三臂。** 顺序 N→R→E，完整原题保留。R/E 若最终稿不可运行，仍可实际消费其未达状态与共同源码，评价自然答案；执行增量标不可比较，不能冒充运行成功。
- [ ] **BS16 G1 三臂。** 顺序 E→R→N，使用固定稿和源先行变化事实。不得在两块之间偷偷补业务程序；必要共享修订登记新 epoch 与确认用途。
- [ ] **BS17 真实采用归因。** 对每答核对实际收到什么、读了什么、执行了什么、引用什么、遗漏什么。模型纠正程序但未 patch 时，分别记录自然正确和程序仍错；没有使用程序的 E 答案不能算执行带来的改善。
- [ ] **BS18 普通复用。** 从普通入口运行两个固定原稿的原/变输入；做一次可搬移副本及一次决定性源码变化撤回。Download 只做原固定稿零模型兼容。研究 runner 可用但普通命令失败必须当场修共享接线。
- [ ] **BS19 独立评价。** 输出逐问题和整题结果、关键错误/遗漏、当前证据充分性；对好坏与分歧按同一来源裁定。按下表分轴总结，报告用途/attempt/turn及成本，不用通过测试数替代质量结果。
- [ ] **BS20 最终验证与回放。** 跑受影响测试集合、主及本轮研究类型、文档测试和修改文档链接；零调用复算固定案例/汇总。原件压缩沿现有工具，必要读回一次；不重跑全历史模型/全仓审计。
- [ ] **BS21 文档与普通交付。** 同步 current-status、本计划执行状态、spec§14.58、研究§7.80、当前执行计划、必要使用示例和本地交接日志。若 G 形成可复用普通示例，放现有 examples/authorization-assessment 下；不在 docs/skill-ir 新建一运行一文档。写明具体运行结果及未达范围。
- [ ] **BS22 发布并停止。** 白名单提交本轮文件到 `origin/skill-ir-aot`，核对远端，记录 active/unknown 请求和是否仍有他人改动。有限队列完成、工程完成、质量与研究目标各自给终态；不得自动 BT。

## 6. 有限调用、当场修复与恢复

正常用途固定 **14** 个：A-M、A-G 两作者；M0/M1/G0/G1 × N/R/E 共十二消费者。追加具名确认全轮合计最多 **4** 个，各错误类别共用此上限，未用不消耗。首次真实作者即为模型/通道检查，不另加付费 smoke。不得为达到时长凑运行、重复完整面板或增加无问题依据的探针。

每用途总工具预算采用现有统一 64 单位，展示源码总量 786432 字节、读取总量 33554432 字节、累计可观测会话时限 2700000ms；先核对配置实际语义，若参数单位不同按意图等价转换并留账，不静默提高。作者可用现有正常续作机制最多两次，只在终态已知且预算有余时继续同一用途，工具/展示/读取预算不重置。最终自然交付沿已有有限 final-child，不把重连 turn 称为独立实验。不能仅因为质量 partial 自动再请求一次。

出现错误，立刻分类并处理：

1. **共享实现/公开 schema/实际工具包错误：** 暂停受影响位置，保存原件，写红测修共享代码，定向验证后继续；不得把已知坏版本跑完整面板。检查其余臂是否受影响；受影响配对不能跨 epoch 作因果比较。
2. **作者业务语义遗漏：** 在当前用途的剩余预算里给出可核实的缺口/矛盾和原源码位置，要求模型自行解释和修稿；不回填答案、不得改自动 raw。正常续作不足则使用一次具名确认或保留未达。
3. **自然消费者遗漏：** 检查实际输入和证据，若是共享材料缺失修接线；如果已收到但未采用，保留主结果，可用具名确认检查具体改动，不能仅换提示重抽到成功。整块对照修订不足以装入确认预算时，保留主块，后续只称诊断。
4. **通道/额度/未知：** 认证/额度失败暂停该通道。unknown/活动请求只读检查，禁止重复派发；已知中断可在同身份和剩余预算恢复。连续同因恢复一次仍失败，关闭该通道本轮待运行位置并继续独立离线工作。保持旧 unknown、原费用与 partial 原件。

同一根因两次有针对性修改仍无改善时，不继续同提示重抽。记录实际堵点并推进独立责任；研究负结果允许任务有限收束。确认次数不足时不延长上限。该队列面向一轮夜间连续工作，不承诺固定小时数或正向结果。

## 7. 验收与评价口径

| 轴 | 合格证据 | 未达时如何记 |
|---|---|---|
| 共享工程 | 原题/来源/当前计算/未知在普通工具链可见，匿名顺序反例和真实入口测试通过 | 具名模块/输入/错误，不用测试总数掩盖 |
| 自动程序 | M 修订、G 空稿均由模型实际提交；固定最后原稿，独立源码核验登记行为 | 标量、顺序、effect、响应/错误分别报告；不手工补稿或挑最佳版本 |
| 自然质量 | 12 消费者按全部原问题评分，逐项正确且充分才计完整 | 同表列有帮助/无变化/退步/未交付；纯条件结论可充分，泛泛 unknown 不加分 |
| 实际采用 | 当次模型收到正确 revision 的程序/结果，并在答案或后续推理中使用 | R 只有阅读，E 无采用明确标出；本地执行成功不代替消费者采用 |
| 比较 | 同块 N/R/E 的共同信息/预算明确；源码准备、规则阅读、实际执行作用分开 | 输入变化是不同状态，不冒充独立重复；小块只作具名观察 |
| 普通可用 | 现有 CLI/示例能运行固定稿、改输入重用、搬移和识别源码变化 | 具体限制出现在命令说明和结果中 |
| 成本 | 完整 input、output、cache read/write、可观测时长及作者准备分别计账 | 缓存读取若已含 input 不再加一次；USD/真人时间未知保持 unknown |

本轮不预设 DSL 一定优于基线。优先检查：是否减少了原题必要遗漏；执行相对同稿阅读带来哪一项可重现纠错；创建写入与共享链接读取能否共用同一机制。若同材料 N/R/E 持平或 E 更差，记录证据并停止该比较，不扩面板寻找好看案例。形成局部正向证据时同时给出该块全部问题的退步与成本。

## 8. 验证与恢复命令

在 `D:\skill优化\SkVM` 运行定向集合，先 red 后 green。新增测试采用同目录命名，并加到最终本轮集合中：

```powershell
bun test ./src/task-dsl/authorization/program-obligations.test.ts ./src/task-dsl/authorization/program-outcome.test.ts ./src/task-dsl/authorization/program-consumption-context.test.ts ./src/task-dsl/authorization/program-trial.test.ts ./src/task-dsl/authorization/program-delivery.test.ts
bun test ./src/benchmarks/authorization-dsl/program-call-loop.test.ts ./src/benchmarks/authorization-dsl/executable-contract-entrypoints.test.ts ./src/benchmarks/authorization-dsl/program-predicate-contract.test.ts
bun run typecheck
python -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py
git diff --check
```

不要把已有全 src 历史 104 失败称为已修复，也不必重复跑它们。研究类型与 replay 复用 BR 的窄脚本架构，在本轮目录记录无占位符命令；不要只生成可解析 JSON 就宣称复验通过。文档校验优先本轮改动，10 处已知历史失效链接独立保留。

中断恢复从本轮 `status.json`、`accounting.json` 和最后已知 request/turn 开始；先只读核对，不重复 author/consumer 请求。结束至少交付 `summary.json`、`verification/acceptance-matrix.json`、`accounting.json`、`execution.md` 以及可恢复的首/修订原件。状态页和研究正文只链接一套当前结果，不另开平行研究报告。

## 9. 执行记录

2026-10-20：父线程依据 BR 原件、源码和共享实现完成复核，登记本任务书；尚未执行 BS 工程或模型实验。BR 结果及原件保持。后续开发在本节按阶段追加决策，最终同步研究§7.80。

2026-10-20：新线程从实际HEAD b21b077d接管，BS0–BS8完成。BS1/2源码调查与BS3–7工程交错推进，但首次provider前全部登记冻结。BR原包核对区分R/E未读匿名入口与M1-E已收到转换错误源码却遗漏。M0/M1分别为原场景/仅后续conversionUsers消失；G0/G1分别为issues reader正常/改为writer且refetch失败。保留22个BR案例及原事实，补充后续转换观察；共29个M、16个G案例。G的db.WithTx实现不在允许源码内，提交/回滚unknown。

共享修改复用现有接口：有界原题候选引用及remaining分页，实际event顺序/停止与此前模拟调用，rules/execute消费更新目录，execution.md摘要不再吞全目录。旧v2 JSON投影未变，BR旧会话inspect通过。独立审查确认的失效报告候选回退已红绿修复；另一个旧档案疑点经实际复算否定。102项主定向测试/815断言、5项runner及rules测试/61断言，失效修复后29项/174断言通过；主/研究类型通过。初次5项测试超时用20秒测试运行时限核验通过，模型会话限额未改。登记输入初版枚举/嵌套数组格式由零模型预检发现并修正，保留初版登记与纠正记录；预检A-M/A-G/M0-N/M0-R通过。证据位于本轮verification/engineering.json、evaluation/br-original-materials.json及registration.json。尚未作程序质量或效果判断；下一步A-M。
