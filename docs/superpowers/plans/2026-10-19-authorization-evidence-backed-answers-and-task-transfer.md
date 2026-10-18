# BR0–BR21：程序依据进入真实回答，并验证跨任务共享能力

> **For agentic workers:** 使用 executing-plans；定位缺陷使用 systematic-debugging，生产修改使用 test-driven-development。用户已授权直接执行、有限官方账号实验及发布。开发线程使用 `gpt-6-astra/high`，独占生产代码、当前方法文档和 Git 写入。常规检查点不等确认；探子仅做独立、窄范围只读检索或核验。

**状态：** completed-with-unmet-criteria，2026-10-19；BR0–BR21工作完成，实质成果e501c136已推用户origin并核对同SHA。从4216358f接管，9用途、10attempt、17观察turn全部交付关闭，1/4具名确认。Download原四问两答full，Memos六消费者27/36维full、整题0/6；E/R原输入持平，变化输入E漏R已说明的转换错误。A-M首件五raw和确认七raw保留，最后25步原稿固定；20已知结果案例匹配、2缺输入保留条件，完整源码顺序/转换未达。普通CLI、搬移及源码撤回通过。勾选表示工作完成，不表示研究指标均达成；分轴见BR目录summary.json、verification/acceptance-matrix.json、publication.json及execution.md。本轮停止，不自动BS。

**Goal：** 让已有 DSL 的计算、来源和缺口可靠地支持完整自然回答；用另一个真实仓库中的不同授权任务，从空稿检验同一套编写、执行和变化消费机制。交付实际程序、普通使用过程与可核对的正负结果。

**Architecture：** 复用 `projectProgramOutcome`、消费投影、当前交付 basis、draft/patch/trial、源码索引及既有 inquiry/native/账号入口。宿主管理可机械核对的运行事实、来源版本和失效；模型阅读源码、编写程序并解释任务。先诊断真实传输，再修共享接口；不新建答案填空协议，不另建通用语言解释器。

**Tech Stack：** TypeScript、Bun、Zod、既有有限资源求值器、只读源码工具、官方账号适配器。

- 仓库 `D:\skill优化\SkVM`，分支 `skill-ir-aot`，只推用户 `origin`，不创建分支/worktree。
- 规划基线 `3c3059a8867ff7bd666b4d014b3d909e74f13e21`。tracked 干净，历史 `.tmp/` 保留；接管时核对实际提交及并发状态。
- identity `authorization-answer-transfer-v1`；研究 runner、来源、输入、原件、评价集中在 `results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/`，下文简称 BR 目录。
- 被测作者/消费者使用已授权官方账号 `gpt-5.6-sol/high`；开发模型与实验模型分开配置。第三方付费 API 继续暂停。
- 正常模型用途 **9 个**，最多 **4 个具名修复确认 attempt**。用途、attempt、账号 turn、实际可观测上游请求分别计数。有限队列结束即收束，不自动创建 BS，不等待凑运行时长。
- 质量约六成、编写与复用约四成是工作投入方向，各项验收独立，不是加权及格分数。

## 一、已复核的基础和本轮取舍

BQ 两臂从既有 52 步稿修为 55 步，首有效及最终稿均在 35 个登记输入上字段和局部轨迹匹配。T-E 的 11 个主动案例中，4 个在修前、7 个在最终 revision；U-E 固定原稿普通消费返回文档 11 / `v1-original.pdf`。原四问 6/12 full、整题 0/3，源码决策 9/12 full。程序修复与实际使用成立；T-E 仍漏 root 回退、构造器顺序，并把已处理的非法版本误述为残余 unresolved。

父复核零模型运行发现：当前 55 个事件没有 execution gap，两个权限调用 skipped，`outcome.execution=computed`、`semanticSupport=unreviewed`；外层 conditional 保留作者概括性 coverage gap。不能把这个情况解释成“程序完全没算出”，也不能删除 coverage gap 后宣称完整授权正确。

共享实现已经存在以下能力，BR 不重复建设：

| 现有位置 | 已有职责 | 本轮要查清/修复的接缝 |
|---|---|---|
| `program-outcome.ts::projectProgramOutcome` | 当前计算、作者表达式、外部事实、执行及覆盖缺口分列 | 结构依赖与实际执行依赖是否混淆；这些事实是否被正确交接 |
| `program-consumption-context.ts::projectProgramConsumption` | full/compact/directed、规则、实际步骤、问题范围与当前 basis | 单条当前轨迹是否遮蔽其它原问题；规则/轨迹是否重复淹没重点 |
| `program-authoring-context.ts::projectProgramTaskContext` | 当前稿、来源、试跑及 remainingDuties | 作者和消费者是否拿到同一当前状态，旧 trial 是否仍被当作当前依据 |
| `program-delivery.ts` | 当前/过期答案 basis、原模型说明、有限 final-child | 交付时效检查只证明版本一致；自然语义是否忠实需独立评价 |
| `inquiry-native.ts`、`src/adapters/codex-account.ts` | 普通入口、实际 tool reply/currentContext、最终上下文 | 已有信息到底未发送、被挤掉、过期，还是已发送但模型未采用 |

本轮用 Download 做已知缺陷回归和小型回答对照，不继续追修一份程序的全部角落。主要迁移对象是 **Memos GetSharedMemo 的共享链接访问**：token、有效期、绑定对象和返回范围，与 Download 的根对象/版本选择有不同结构。BP ShareLink 只作既有接口兼容检查，不计作完整第二任务成功。

## 二、来源真实性及公平性合同

### 2.1 三层材料分别登记

1. **外部 skill**：Download 使用已归档完整 `cloudflare-security-audit/SKILL.md`；Memos 使用已归档完整 `github-security-review/SKILL.md`。均位于 `authorization-domain-execution-v1/model/source-skills/`，读取相邻 provenance 核对上游仓库/ref；不把本项目示例称为第三方 skill。
2. **真实源码**：Download 沿 BQ 固定来源；Memos 沿已有 `model/inputs/memos-share.json`，仓库 `usememos/memos`、ref `cb42e326ba9cc266a6a9570c53e0fe04c62793f4`、入口 `server/api/v1/memo_share_service.go::GetSharedMemo`。读取真实依赖，允许在同 ref 补必要公开源码并登记。它是已暴露 development 来源，不能写成 unseen 或独立 held-out。
3. **任务与输入**：现有 Memos brief 是研究者依据公开源码提出的授权分析任务。BR 将其落实为共享链接访问排障和变化核验，保留原始问题，不假称来自真实客户工单。数据库行、时钟和请求为标明来源的有限合成事实；原服务未启动，不能写成 live API 成功。若找到同 ref 的公开测试/需求，记录真实出处，不为包装真实性臆造需求。

登记 `provenance.json`：skill/ref、source/ref、task origin、input origin、oracle origin、已暴露情况、开发者改动与被测模型改动各自列出。不以 skill 数、fixture 数或文件数代替独立任务结构数。

### 2.2 先从源码推导案例，再看程序能否处理

- Memos 的必要问题至少涵盖：token 到目标 memo 的绑定；有效期和缺失/错误记录；无登录用户时的实际访问条件；对象状态/可见性与访问 helper；返回内容及剩余边界。具体必要事实在 BR5 读源码后定稿，不从当前 DSL 操作符反推题目。
- 输入只提供请求、记录、时钟和确实处于允许范围之外的事实。源码可见的 `buildMemoReadContext` / `access.CheckMemoReadContext` 及相关分支必须阅读或保留具名未知，不能用一个外部 `allowed=true` 把核心问题预先回答。
- 编写后逐项核对实际 external assumptions 的来源。模型若把源内判断改成假设，保留原稿和可运行的条件结果，但该职责记为未覆盖，不能记自动语义完成；不在核心增加按这两个 helper 名称硬编码的黑名单。
- 一个输入的 expected 值、正确路径、评阅结果、旧答案和开发任务书不得进入被测会话。作者可以自主 trial，接收当前程序实际运行现象，不能接收 evaluator 正确答案。
- 从源内分支选择一组有限开发案例，优先包含允许、拒绝、边界和未知；不为达到固定通过数量删掉不支持案例。先记录分母与独立源码依据，再运行模型。另留改 ID、重排无关数据、补无关字段的扰动，检验没有依赖例子常量。
- 模型输入只允许完整原 skill、自然任务、允许源码、公共事实、对应模式的工具和原稿。研究 runner 只负责派发和留账，禁止暗注入正确谓词、修好的程序或领域答案。

## 三、共享实现与交付合同

### 3.1 先检查实际包，再做最小的接线修复

零调用抽取 BQ T-E/U-E 的真实初始包、最后工具回复、final-child 包和答案，形成“事实存在于哪一层、是否发出、是否被引用”的对照。分别标记：未产生、未发送、被截断、旧版本、已发送但误解、原任务未计算。不要把所有答案遗漏都归因于提示。

只在有复现时修改共享投影/交接。优先复用已有 `outcome`、`remainingDuties`、trial revision 与 delivery basis；不要新增一套同义状态表、要求模型逐字段复抄、或每次调用加一轮 reviewer。工具应让用户和模型方便取得当前结果、真实依赖、未执行分支与对应源码。

区分五种内容：本次实际计算；当前源绑定但含义未审的作者表达式；用户给定外部前提；本次路径的未解依赖；原题尚未覆盖的范围。`returnBasis` 的静态表达式图可能包含未执行分支，不能将那里的未知误报为本次计算阻断，也不能把未执行分支写成已经验证。

自然答案保持普通语言。宿主可展示确定的返回值、实际调用/跳过顺序及来源位置；不能自动替模型写“授权完整成立”。模型必须能指出程序与源码的冲突，并保留不适用和未知。正确性评价不使用某个固定句子的匹配。

### 3.2 跨任务采用同一套工具

Memos 作者从空 draft 开始，用同一编写、patch、trial、投影、执行和恢复接口。可以有任务自己的声明、输入映射和自然说明；生产代码不得按仓库名、GetSharedMemo、Download、例子 ID 选择成功路径。

若遇真实执行表达缺口，先判断已有表达能否组合，再用匿名双任务反例修共享行为。只有对不同任务都有明确意义的有限算子/反馈才进入核心；不得启动 Go/Python 全语言语义扩张、另造完整 CLI 或把源内权限判断包装成假外部事实。确实无法表达时保留原任务和失败，不临时改选更易成功的任务。

BQ 固定程序仅用于 Download，不能移植它的成功语义填入 Memos。Memos 首稿、首有效稿、每次实际 patch 和终稿按原字节归档；开发者只改共享实现，语义修稿由被测模型完成。选稿规则为 **同一 A-M 用途按时间最后一次提交的原始 draft**，并同时记录活动版本；不能用更早较好版本替换终稿。若终稿无效，后续 rules/execute仍以原字节检查并记录不能消费的实际结果，N 独立运行。

### 3.3 源、输入、稿件变化要真实生效

同一固定 Memos 稿在原输入与只改时钟/请求/记录的变化输入上消费；case 选择在看到作者输出前固定。源码改变后，旧相关结论必须撤回；无关输入变化应重算，不静默沿用旧返回。搬移目录后应仍能从普通入口重放，不依赖研究 runner 的内存对象。

## 四、模型队列、评价和恢复

### 4.1 九个正常用途

| 顺序/ID | 用途 | 模型可见的程序与工具 | 主要回答 |
|---|---|---|---|
| 1 D-R | Download 固定稿消费 | BQ最终T-E原字节；rules、源码、无执行结果 | 原四问及给定输入解释 |
| 2 D-E | Download 固定稿消费 | 同原稿/源码/输入；execute，允许主动trial | 程序依据是否进入准确完整回答 |
| 3 A-M | Memos 从空稿编写 | 完整GitHub原skill、原任务、源码、事实，edit/execute | 自动稿及任务回答，允许同用途修稿 |
| 4 M0-N | Memos 原输入源码基线 | 同skill/任务/源码/事实，无原稿和程序执行 | 纯源码工作流 |
| 5 M0-R | Memos 原输入固定稿消费 | A-M固定原字节，rules | 声明组织与作者准备的整体作用 |
| 6 M0-E | Memos 原输入固定稿消费 | 同一原字节，execute | 同材料上的执行增量 |
| 7 M1-E | Memos 变化输入 | 同一原字节，execute，不允许改稿 | 变化重算与解释 |
| 8 M1-R | Memos 同变化输入 | 同一原字节，rules | 反序规则对照 |
| 9 M1-N | Memos 同变化输入 | 无原稿，源码基线 | 变化任务源码基线 |

两套 skill 的职责和自然问题保留。Download 两臂只改变程序支持方式；Memos N/R/E共用模型、源码范围、自然任务、事实和预算。R/E的原稿完全相同，rules禁止在后台预执行后泄漏结果。N与R的差异含作者准备和程序材料，因此只评价整体辅助方案，不能将差异单独归因 DSL 语法。作者成本与消费者成本分开，并另给合计。

沿用 BQ 可观测预算：每 attempt 64 个总工具单位、786432 bytes 源码显示、33554432 bytes 读取、2700000ms 会话时限；A-M最多两次已知终态续作，共享原总预算。消费者不自动进入作者修稿；沿现有有限无工具 final-child 合同收尾。所有真实 turn 均计账，不能称九次 provider request。

旧 BQ 答案只能用于离线诊断，不能作本轮模型输入或替代同期对照。这组小面板用于机制诊断和跨结构可行性，正向只表述为具名任务/分支的局部证据，不称稳定普适增益。

### 4.2 评价与修复

- 必须分列：传输交付、稿件结构有效、源内语义覆盖、字段结果、实际路径/调用顺序、必要源码判断、关键遗漏/错误、原题完整性、实际工具采用和成本。`current`/`computed`标签不替代源码评阅。
- 评价器预先从源码建立依据，不能只比较自己构造的字段。可对有限纯选择/时间谓词建立独立参考计算；完整HTTP/部署未运行处保持边界。假设“检查正常返回”与“明确授权允许”分开。
- 结果同时报告计划分母和实际交付分母，good/bad/unknown一起保留。protocol/额度失败另列但仍留在端到端计划分母。首答、修订答和固定原稿消费分别计分。
- 每次异常立即定点诊断。共享实现错误先保存原件、写红测、修核心、绿测，再执行依赖它的位置；不把已知坏实现跑满。模型语义错误由模型在自己用途内修稿，不能让开发者补正确业务字段。
- 最多四个具名确认 attempt。共享修改影响一组对照时，从同起点、同源码epoch补齐受影响的比较块，确认名明确，不替换首件。一个三臂块需三次额度，不可仅重跑较差臂后声称公平胜出。确认预算不足则保留不可比较，不扩大队列。
- 同因两次无改善后停止重抽，记录缺口并推进独立责任。Memos开发不以Download回答full为前置。自动稿不完整也要留下源码基线、诊断和普通运行失败；不靠改题完成目标。
- 活动/unknown原请求不重发。沿BK合同只读核查终态和本地宿主，旧不可恢复unknown隔离后可开展独立用途；quota/auth立即暂停同通道，重复路由故障一次有据恢复仍失败则暂停。无需额外付费健康探针。

## 五、BR0–BR21 连续工作队列

### BR0 接管与留底
- [x] 读父/仓 AGENTS、current-status、本任务书、spec§14.57和研究§1/§7.79/§11；BQ execution、actual-use、quality-reviews、最终raw按需读取。
- [x] 核对分支/HEAD/origin、BQ关闭与无并发写者；保护`.tmp/`和旧证据。创建 BR status/manifest，目标字段与实际通过字段分开。

### BR1 真实交接诊断
- [x] 零调用读BQ原件包；复核T-E/U-E当前结果、规则、trial、最后工具包及final-child的实际内容。
- [x] 在 `diagnosis.json` 记录每个已知误述/遗漏的首次信息断点、代码位置及反证，确认已有能力，删除没有实际依据的修复猜想。

### BR2 共享失败测试
- [x] 在既有 `program-outcome.test.ts`、`program-consumption-context.test.ts`、`program-delivery.test.ts`和普通入口测试中加入复现断点的最小红测，运行并保留预期失败。
- [x] 至少覆盖computed但coverage未完成、静态未走分支含unknown、执行中真实unknown、旧trial/旧source、规则不得见执行、当前稿更新后旧答案失效，以及原问题仍保留。使用匿名名称、不同ID和第二结构，不把55步原稿硬编码为核心测试。

### BR3 修结果到回答的共享接线
- [x] 修改 `program-outcome.ts`、`program-consumption-context.ts`、`program-authoring-context.ts`中已复现的最小位置；实现前完整阅读拟改函数。
- [x] 验证普通执行事实、来源/假设和未覆盖范围可以分别被读到；无确凿缺陷的模块不重写。绿测后更新开发指南的对应责任。

### BR4 普通/最终交付一致性
- [x] 在 `src/benchmarks/authorization-dsl/inquiry-native.ts`、`src/adapters/codex-account.ts`按需接通同一结果，沿既有delivery basis和final-child，不新增模型评审循环。
- [x] 用fake账号/普通入口测tool reply、断点恢复、最终上下文、引用还原及rules隔离；自然答案只要求忠实任务，不强制新字段合同。零调用验证既有BQ普通命令。

### BR5 Memos 源码与需求先行
- [x] 读既有 `memos-share.json`、完整GitHub原skill、同ref GetSharedMemo及真实依赖。建立provenance与一份自然任务，分别登记外部材料、研究者问题和合成输入。
- [x] 根据源码确定允许/拒绝/边界/未知案例、原输入与变化输入；独立核对时钟比较、目标对象、访问helper及返回裁剪。读取不到的材料明确缺失，不补正确答案。

### BR6 可表达性与隔离
- [x] 将必要关系映射到现有通用算子/输入/unknown，记录支持与缺口。研究者的设计推演仅放评价侧，不作为作者初稿或模型上下文。
- [x] 如有共享执行错误，先匿名红绿修复；若需要整套Go语义或仓库分支则保留unsupported，继续自然源码基线和可用部分。检查模型allowlist不含oracle、旧答案、任务书及开发稿。

### BR7 有限 runner 与评价
- [x] 新建 BR `study.ts`、`study.test.ts`、`tsconfig.json`，复用BP/BQ普通派发与恢复代码，只保留九用途和四确认，不复制旧大面板。
- [x] 注册表只接受本书九个用途ID；第五个具名确认必须被拒绝。写测试证明旧BP六确认上限及Q/S/T位置不会随代码复用进入BR。首包和每次工具回复都按宿主结构核验rules没有求值/trial/outcome结果，并用fake执行计数验证未调用求值器；不只对整包做字段名正则。
- [x] 支持零调用preflight、单用途run、status、离线verify；命令先写入BR execution.md。失败测试验证输入边界、原字节选稿、rules无执行、当前attempt不能重发及计量去重。
- [x] 注册每题必要事实及严重错误、全部计划case/用途/epoch、盲评方法。模型不能访问这一评价目录。

### BR8 第一次工程确认
- [x] 运行受影响测试和主/BR类型检查；查看实际序列化首包，不派额外模型探针。
- [x] 用改名/换ID匿名例验证同一共享实现，并对BQ固定稿35例及BP ShareLink已有有限输入做零模型兼容；不修改旧成绩或把兼容计为新增泛化成功。

BR2–BR4复用已有断点恢复、旧trial/source、原问题及交付失效测试；新增红测只针对已复现的静态依赖标签。未发现缺陷的交接模块未重写。扩展82测试初跑有6项5秒超时，6项在20秒测试时限下逐项通过；没有修改生产会话预算。

### BR9 Download 固定稿同期对照
- [x] 依次执行D-R、D-E，保留完整原skill/四问、同一BQ原稿和输入；只消费，不再次编辑Download。
- [x] 即时核对当前结果实际送达、主动工具与自然解释；问题按4.2处理，首答保留。无优势或退步同样进入结论。

BR10中已复现工具说明遗漏：执行器支持数值比较，而A-M实际首包没有该语法，作者明确因此留下expiry gap。共享修复仅复用现有完整谓词说明。按4.2登记`A-M/predicate-guide`一次确认，从同一空稿/输入/来源开始；首件及全部成本保留，未开始的六消费者统一用修后epoch。最终选择按时间最后一次A-M提交，不按分数；确认无效/更差也不回退。这是有据接口确认，不新增作者用途或改题。

### BR10 Memos 从空稿自动编写
- [x] 执行A-M，模型自行定位、编写、试跑和修稿。宿主不得预填source角色、正确谓词或业务程序。
- [x] 归档首次提交、首有效稿、每次patch、终稿、当前活动稿和自然答；依据预定选稿规则保存 `authoring/automatic-program.json` 原字节，失败稿也保留。

### BR11 当前稿的离线评价
- [x] 对每一原始版本运行预先登记的有限案例，字段与实际行为分列；值碰巧对但调用、条件或绑定错仍记录。
- [x] 若模型只提交partial/invalid，明示实际可运行范围和消费资格；不得把独立参考程序作为自动成果替上。诊断不自动泄漏给后续消费者。

### BR12 原输入三臂普通使用
- [x] 执行M0-N、M0-R、M0-E，完整原skill及原自然问题相同；固定稿不可编辑。
- [x] 记录真正调用、宿主自动计算、收到但未采用、根本未收到分别为何。R/E无可消费稿时具名处置，N继续；不增加另一作者抽奖。

### BR13 同稿变化使用
- [x] 按反序执行M1-E、M1-R、M1-N，使用BR5固定变化输入；同一原稿无需重写即可改变结果，是本轮直接复用证据候选。
- [x] 比较变化前后选择、拒绝、未知和解释；保留旧basis撤回、条件依赖及真实修复责任。不能把两份不同稿的各自成功写成同稿泛化。

### BR14 源码变化、搬移与失效
- [x] 仅在本轮副本改变一项已登记的决定性源码条件，零模型验证相关旧结论撤回、无关事实保留；不执行上游应用或修改冻结源码。
- [x] 搬移本轮程序及必要输入/源码引用，使用普通入口重放允许、拒绝或unknown；路径绑定错误当场红绿修复。不可递归清理未核实目录。

### BR15 独立源码评价
- [x] 对全部首答/终答、稿件、实际轨迹按同量规评阅；独立只读探子可以核验，主线程按源位置裁定分歧，不把探子文字当oracle。
- [x] 原题完整性、局部关键改善、退步、合理unknown及未交付同表；补齐答案的固定话术不作为领域质量贡献。

### BR16 具名修复确认
- [x] 只使用前述最多四attempt，有具体首次缺陷、共享修复和定向绿测才派发；预算未用不需要消耗。
- [x] 保持首件分母与epoch；因数据或程序版本不同不可配对时直接写明。通道故障按既有恢复规则处理，不追成功。

### BR17 能力、质量与成本归纳
- [x] 逐任务回答：是否自动写出、哪些源码关系进入程序、普通消费者是否真用、哪些输入变化有效、回答哪里改善/退步、哪些仍靠模型。
- [x] 分离N→R的准备/材料作用与R→E的执行作用。计量input含cache一次、output、工具、turn、elapsed、编写准备和消费；USD/不可观测隐藏调用/真人时间unknown。
- [x] 若执行答案仍差，按源缺口/程序错误/传输交接/模型忽略/评价混杂归因；明确是否有值得保留的局部成果，不能据小样本作整个类别结论。

### BR18 普通交付与使用说明
- [x] 复用现有CLI/适配器，为Memos提供薄示例目录及README，参数为scope/program/input；禁止另建任务专用执行器。实际命令须在当前环境跑过。
- [x] 入口清楚标示真实源码、合成事实、自动原稿、运行过程和边界；partial也提供诚实运行结果，不以HTML展示替代工程。

### BR19 联合验证
- [x] 运行受影响Bun测试、主/BR类型、15项文档测试、修改文档链接与diff检查。验证普通入口、规则隔离、搬移和源码失效，核对全部新attempt生命周期。
- [x] 不重复历史全量审计，不改旧保护锁解决旧全src失败。用相关fresh结果说明实际测试范围；大原件可无损压缩一次并读回核对，保留必要复现入口。

### BR20 同步唯一研究正文
- [x] 更新current-status、spec§14.57、当前plan、研究§1/§7.79/§11、开发指南和示例。研究只写一处主要复盘，逐次流水留BR结果目录。
- [x] 每个问题写触发→实际根因→共享修改→真实采用→效果或未达；本地handoff/communication/conversation_log同步恢复入口。保留BQ与更早历史结论。

### BR21 发布与停止
- [x] 白名单暂存本轮实现/证据/文档，凭据及差异检查，聚焦提交并推用户origin，核对远端SHA。原`.tmp/`和他人内容保持。
- [x] 交付可运行命令、逐步过程、源码与fixture出处、所有首件/修订结果、未达责任及成本未知项。有限队列、工程完成、真实采用、质量收益分别列出。
- [x] 停止本轮，不自动派发BS或重开旧实验。

## 六、文件责任与验证命令

生产责任优先顺序：`src/task-dsl/authorization/program-outcome.ts`、`program-consumption-context.ts`、`program-authoring-context.ts`、`program-delivery.ts`及相应测试；普通接线为 `src/benchmarks/authorization-dsl/inquiry-native.ts` 和 `src/adapters/codex-account.ts`。仅有明确复现时才涉及 `resource-relations.ts`、draft/trial/coverage。沿现有组件边界修改，不新建第二套状态机。

研究脚本独占 BR 目录；已有来源只读引用，必要副本有来源索引。新长期职责没有成立前，不在 `docs/skill-ir/` 创建独立本轮报告。新示例可位于 `examples/authorization-assessment/shared-link-workflow/`，只保存当前可用输入、原稿引用和普通命令。

以下为可直接运行的已有定向检查；新研究脚本先实现并测试，再运行其命令：

```powershell
Set-Location 'D:\skill优化\SkVM'
bun test src/task-dsl/authorization/program-outcome.test.ts src/task-dsl/authorization/program-consumption-context.test.ts src/task-dsl/authorization/program-delivery.test.ts src/task-dsl/authorization/program-authoring-context.test.ts src/task-dsl/authorization/program-trial.test.ts
bun test src/benchmarks/authorization-dsl/program-rules-local.test.ts src/benchmarks/authorization-dsl/inquiry-native.test.ts
bun run typecheck
python -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py
git diff --check
```

验收不要求所有研究指标变成正向。工程要求是共享修复可复现、普通入口一致、来源/原稿/变化/恢复可追溯；真实采用要求是模型原稿被同一运行机制实际消费；效果要求按预定任务逐项判断。若跨任务原稿仍无可用结果或执行使回答变差，直接保留负面结果和具体责任，不以更多协议或更多Download变体代替结论。
