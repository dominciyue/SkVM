# 单次真实运行到新程序包：持续开发任务书

> **For agentic workers:** 使用 superpowers:executing-plans 连续执行；主代理负责设计、实现和最终验证，窄范围只读核验按有效 AGENTS 使用子代理。实现遵循 TDD，按复选框记录进度。常规检查点不等待确认。

**Goal:** 用户只选择原始 skill、描述任务和目录，正常运行一次后，系统保留可供验证的真实输入，实施局部程序生成或现成脚本改进，完成验证与一次有依据的修复，导出新包，并让同一个新包在后续原任务和变化任务中实际承接 agent 的机械工作。

**Architecture:** 沿用 run/session → execution-log Evidence → workspace → optimizer → implementation selection → validation/repair → final snapshot → package 的现有主链。补原始输入内容和动作元数据两个断点，修正候选产生与推荐的分工，不建第二套优化器、通用 DSL、研究冻结链或展示层。

**Tech Stack:** TypeScript/Bun、现有 bare-agent/provider、Python/Node skill 程序、既有 task/source 检查与通用包导出。默认沿用本机已配置模型路由。

**状态：** revision 1，active。执行基线 `d619ee915e33fc1e93489a02e987f4d78222969e`；C0 已完成，C1 正在执行。审查基线 `282c35daf85fcb0a17a170b5fe9152004bb7f320` 只用于定位计划形成前的状态。

**执行目录：** `D:\skill优化\SkVM`。结果根为 `results/skill-ir/skill-optimization-end-to-end-repair-20260914/`，仅在 C0 启动时创建 `status.json`。阶段记录、尝试和失败均收进该目录，不新增每阶段 Markdown。

## 1. 为什么需要这一轮

上一轮 H/R 阶段的原始报告不改写；其基础组件和部分程序路径有效，但默认用户生产闭环尚未证明。当前审查确定以下具体断点：

| 事实与定位 | 本轮必须解决的行为 |
| --- | --- |
| `src/core/workdir-manifest.ts` 的初始清单只有路径/摘要；`src/run/optimization-session.ts:326` 只复制 task fixtures；`:247` 跳过未变化文件 | 自然任务目录内原始文件能在运行后供优化与验证读取，不能只证明文件曾存在 |
| Law R6 `IMPLEMENTATION_CONTEXT.json` 中 `inputs.files=[]`、`checks=[]`，只有两份输出 | 输入、输出、原检查分别成为可定位资源；没有评分文件不能使真实输入消失 |
| Law 首轮已经修改 Python 的可选依赖导入，但被带锚点引用及 `domain-backend` 动作拒绝，`programRuns=0` | 现成脚本修改走普通本地路径；锚点解析已修，不重复实现；动作声明错误不能冒充程序运行失败 |
| `src/jit-optimize/loop.ts:1204` 修复后仍验证首轮 `candidateSubmission.actions` | 对有依据的动作元数据修订重建验证计划，最终文件、动作、结果和导出保持一致 |
| I18n 全部原任务检查通过后，以局部 checker 覆盖不全和“可能回归”为由 no-change | 允许有明确职责边界的可验证候选；候选尝试与推荐结论分开，不能要求局部程序替代整个 skill |
| R6 新优化 no-change 后消费旧 H8/H9 包；R7 输入本身是 H9 包 | 新原始 skill → 新 capture → 新 proposal → 本次最终包 → 实际消费必须连续，旧包不能填补任一环节 |

失败原件在 `results/skill-ir/skill-optimization-production-closure-20260913/r6/`。Law proposal 的目录标识为 `20260913T193254660Z`，I18n 最终 no-change 为 `20260913T192735046Z`。只读这些命名材料及当前代码，不重审全部历史。

## 2. 范围、完成标准和停止语义

- 适用的是包含可参数化机械操作、确定检查或现成程序的 skill。固化可以只接管一个步骤；其余翻译、专业判断、任务选择继续由 agent 处理。不声称大多数 skill 已验证。
- 默认用户不提供 task.json、trace、locator、fixtures、action、validation JSON 或评分文件。高级结构化输入仍兼容。
- 同一个优化尝试只运行一次原任务；其后的局部程序验证、原/新包对比和变化任务是独立验证运行，分别计数，不冒充额外 source capture。
- 自动处理可恢复、本地、有依据的改变。原 skill、用户原始输入及无关文件不覆盖。程序运行失败后不自动重放未知完成状态的外部业务副作用。
- 网络、认证 GitHub CLI 和有用途的模型/远端 API/付费调用延续用户授权，无用户金额上限。只记录实际消耗；未知费用、失败请求计费与开发代理消耗分列。不是无目的反复生成的授权。
- 一次候选生成、一次确定性验证，有具体诊断时至多一次模型修复；确定性路径规范化不必额外问模型。工程代码出现新根因可以修共享实现后建立新尝试，旧尝试保留。无新信息不得反复抽样求成功。
- 不新开分支；在 `skill-ir-aot` 工作，仅推用户 `origin`。保留已存在的 `src/skill-ir/skill-family-minimum-delivery-run.ts` 修改及其他线程文件。提交采用明确文件名单。
- 不启动 prospective、held-out、Q1 reserve，不改变 readiness，不使用受保护输入填补案例。缺档、旧摘要和旧 `0/6` 不是本轮前置任务。
- 工程量预计可覆盖一次约 10–16 小时持续开发，属于估计而非运行时长承诺。完成就交付，不等待凑时长；未完成但还有明确可执行根因时继续修主线，不能用阶段终态关闭目标。

**最低产品交付条件必须同时成立：**

1. C1–C7 的真实输入、普通脚本修改、元数据修复及同包连续性反例全部由生产代码处理。
2. 至少一条从原始 skill 出发的普通入口，产生本次优化器生成的非 API 参数化新程序；同一个最终包被普通 agent 自然调用，在原任务及一个有语义差异的新任务中完成所声明的局部职责，关键残余任务没有退步。
3. 现成脚本修改/复用经真实普通入口尝试，明确记录实施、执行及限制；目标是也走通，失败或 no-change 不能算第二成功。
4. 至少一组成对比较可解释质量和实际机械工作变化；效果可以 positive/mixed/no-benefit，不要求预定节省比例，unknown 不能写成收益。
5. 真实包、最短使用命令、剩余职责和针对性测试可交付；未完成项明确，不用旧包、空 actions、文件闭包或测试数替代第 2 条。

若仅修好组件而未达第 2 条，产品闭环为 partial，目标尚未达成；若无新程序但文档改进有收益，可以交付该收益，但不能声称完成本任务书。若只有一个结构成功，结论限定该结构，不升格为整个 skill 家族。

## 3. 文件职责与执行队列

所有路径相对 `D:\skill优化\SkVM`；行号以审查基线为定位提示，执行时读最新函数。

| 阶段 | 主要文件 | 责任 |
| --- | --- | --- |
| C0 | 现有命名报告、相关测试、结果 status | 保留失败诊断，避免把历史错误当当前错误 |
| C1 | `src/run/index.ts`、`optimization-session.ts`；必要时新增 `src/run/input-snapshot.ts` | 运行前真实输入内容快照，使用现有目录隔离策略 |
| C2 | `src/jit-optimize/types.ts`、`trace-adapters.ts`、`workspace.ts`、`validation-lifecycle.ts` | 将输入内容传到模型和验证器，旧日志兼容 |
| C3 | `implementations.ts`、`action-plan.ts`、`optimizer.ts`、`types.ts` | 现成脚本的本地修改与可执行动作计划 |
| C4 | `loop.ts`、`optimizer.ts`、`validation-lifecycle.ts` | 修复动作元数据、原始基线与最终提交一致性 |
| C5 | `optimizer.ts`、`workspace.ts`、必要 action diagnostics | 候选机会、no-change 与推荐分工 |
| C6 | `validation-lifecycle.ts`、`workspace.ts`、run handoff | 无人工评分文件时复用来源检查并运行局部案例 |
| C7 | 现有 run/CLI/production-closure 测试 | 一条连续生产集成测试及替换旧包反例 |
| C8 | 普通 CLI、命名 source skill、本轮结果 | Law 与 I18n 新真实尝试；修复共享生产问题 |
| C9 | `consumption.ts`、`effect.ts`、现有自然消费入口 | 同新包的实际使用与少量配对效果 |
| C10 | 相关代码/组件文档、status、最终简报 | 一次相关回归、提交并推送 |

顺序为 C0 → C1 → C2 → C3 → C4 → C5 → C6 → C7 → C8 → C9 → C10。C3/C4 的纯本地红例可以提前建立，但不要在原始输入链未补足时启动新的付费抽样。

## C0 — 用已知失败建立开发检查点

- [x] 检查分支、最近提交、tracked/staged 与本轮归属，读 current-status、spec 14.32 和本任务书。记录实际 HEAD，不重置到审查基线。
- [x] 创建本轮 `status.json`，只记录阶段、当前动作、尝试目录、失败原因、下一动作和费用位置；不新增摘要冻结层。
- [x] 从命名 Law/I18n 提交与初始/修复报告生成一份精简 `diagnosis.json`：区分原始资源缺失、动作声明拒绝、程序失败、模型 abstain、包导出失败。
- [x] 复查当前 selector 已支持 `scripts/x.py#symbol`；记录为已修。确认 `domain-backend` 不匹配仍存在，以及 repair 仍读取首轮动作。不能把静态发现描述成已发生过的成功修复被吞掉。
- [x] 只跑一次基础套件：`bun test ./test/jit-optimize/production-closure.test.ts ./test/jit-optimize/implementations.test.ts`。审查时为 12/12、48 assertions，新增失败必须具体归因。

**验收：** 本轮回归和实现各有一个已证实根因，不重跑 H/R 真实任务。

## C1 — 自动保留原始任务内容

**修改与测试：** `src/run/index.ts`、`src/run/optimization-session.ts`，必要时把内容快照放入 `src/run/input-snapshot.ts`；扩展 `test/run/optimization-session.test.ts` 与 `src/run/index.test.ts`。

- [ ] 先写红例：自然 prompt、无 task fixtures，目录已有 `document.txt`；source 执行修改它并生成另一文件。原始版本必须仍能从本次 session 读取，且与后置输出分开。
- [ ] 增加原文件未变化、被删除、空文件、中文/空格路径、二进制文件的内容或明确未捕获状态测试；不能把 binary、过大文件或权限失败悄悄变成空字符串。
- [ ] 在 agent 第一次读取/写入任务前保存有界、可复用的内容快照。沿用 workdir 根边界和资源隔离，内容放 session 外于业务目录的位置；不要把 source skill、缓存、凭据目录和其他会话无差别打包。
- [ ] 首版可以有界快照用户指定任务根的普通文件，复用现有大小/排除机制；对超过限制或不支持项逐项记录原因，不能因此拒绝其余可用动作。不得在事后把已被改写的文件冒称原始输入。
- [ ] 初始摘要清单继续供 delta 检查，不要求修改旧 manifest schema。新增内容引用只服务优化输入；同一份副本供各下游复用，不重复拷贝多套。
- [ ] 红绿验证后提交本阶段；在现有组件文档记录输入捕获范围与遗漏语义。

**关键断言：** source 前字节 = session 原始内容；source 后字节只属于输出/变化；原用户目录不会因快照而增加文件。

**验证：** `bun test ./test/run/optimization-session.test.ts ./src/run/index.test.ts`。

## C2 — 输入真正进入 Evidence、模型与验证器

**修改与测试：** `types.ts`、`trace-adapters.ts`、`workspace.ts`、`validation-lifecycle.ts`；对应现有测试。

- [ ] 写穿透红例：C1 的自然目录输入经过 session adapter、Evidence、workspace 后，在 `IMPLEMENTATION_CONTEXT` 中显示为可物化输入；验证器能在独立目录运行参数化程序消费相同原始字节，不依赖仍存在的用户目录。
- [ ] 使用兼容的可选输入资源引用表示新增内容；task-fixtures、pre-run 内容、observed workdir 输出明确分源。解析入口集中在既有资源解析职责，不在模型提示、validator、exporter 各实现一次。
- [ ] 原始 task-fixtures 如与 pre-run 同名但内容不同，按真实运行前最终物化状态选择输入并保留来源；禁止静默优先采用过时 fixture。输入/输出同名也必须可区分。
- [ ] 模型得到明确的可用相对 locator、参数来源和格式；不能只是新增日志路径让模型猜，也不把二进制硬塞入字符串 JSON。旧 trace 无新字段继续可读，对依赖缺内容的动作保留 missing-input。
- [ ] 改变用户现场文件或删除原 workdir 后，独立验证仍使用保存的输入；必要遗漏只影响该动作。写局部未齐但其他案例执行的测试。
- [ ] 红绿通过后提交。不要自动为旧 session 回填无法恢复的原始内容。

**验证：** `bun test ./test/jit-optimize/trace-adapters.test.ts ./test/jit-optimize/workspace.test.ts ./test/jit-optimize/validation-lifecycle.test.ts`。

## C3 — 现成脚本修改走通用本地动作

**修改与测试：** `implementations.ts`、`action-plan.ts`、`optimizer.ts`、`workspace.ts`；`implementations.test.ts`、`action-plan.test.ts`、`optimizer-prompt.test.ts`。

- [ ] 写红例：已有 Python 脚本因可选包 eager import 无法处理不需要该包的 TXT；候选只延迟导入并调整命令，必须能选择当前候选的本地入口，不能要求注册领域后端。
- [ ] 优先沿用 `reuse-script` 表示复用及对既有程序的局部改进，`changedPaths` 包含实际修改；`generate-script` 保留真实新生成/重写定义，报告分清新增和修改。若现有类型无法表达，经代码证据再做最小扩展，不抢先增加大型类型层。
- [ ] 明确 `domain-backend` 仅供真实已注册后端；不把任意脚本 patch 自动路由到它。入口引用按真实文件及 sourceRef 解析，不按 Law/I18n 名称特判。
- [ ] 动作声明错但文件/意图存在时，输出可修的 action diagnostic，包括字段、原值、支持的本地路径；不能把它写成程序语义失败或整个 skill 不适用。
- [ ] 能从实际 entry、捕获输入和已声明参数形成案例时形成可执行计划。只有文字 `verification`、没有可执行参数/案例时，准确说明缺口并交 C4 修复，不能因模型说“我跑过”而判 passed。
- [ ] 测试真实程序执行、缺可选依赖不影响 TXT、实际 DOCX 路径仍报告所需依赖；不强求每个脚本统一 help/stdout ABI。提交共享修复。

**验证：** `bun test ./test/jit-optimize/implementations.test.ts ./test/jit-optimize/action-plan.test.ts ./test/jit-optimize/optimizer-prompt.test.ts`。

## C4 — 修复动作描述，而不只修文件

**修改与测试：** `loop.ts`、`optimizer.ts`、`validation-lifecycle.ts`、必要类型；扩展 `production-closure.test.ts`。

- [ ] 红例一：首轮脚本内容正确但动作 kind/entry/args 错；修复仅纠正动作描述，没有文件 diff。最终必须采用修复动作实际运行，不能因 `changedPaths=[]` 忽略它。
- [ ] 红例二：修复文件和动作都改变，最终 snapshot、history、validation、package 均指向同一修复版本；独立通过动作不能被空数组静默删除。
- [ ] 修复输入明确提供原始基线、当前候选的实际 diff、原动作意图和失败诊断。不能让模型把“候选已经改好”误认为“原 skill 本来就不需要改”。不用再让模型重复全量机会分析。
- [ ] 合并动作修订时，仅接受失败或确受影响动作的实现描述调整；完整原动作集合保留。允许改 kind、entry/sourceRefs、输入 locator、执行参数等有来源的接线信息，不允许把期望结果改为当前错误答案、删除必需案例或篡改 source authority。
- [ ] 先校验修订结构和依赖，再据修订后的动作重建计划。文件、参数或输入绑定变化使相关观察失效；独立无影响观察复用。保持一次模型修复，不堆额外审核调用。
- [ ] noChanges、repair-failed、明确撤销动作分别处理：没有文件 diff 不等于没有元数据修复；明确撤销应按依赖/共享文件组回退，不能删除 action 后把尚存程序包装为无动作成功。
- [ ] 修复仍失败时保留原报告、修复报告和回退理由；只恢复本次拥有的变更。测试保护判断依据、共享组和独立动作，红绿后提交。

**验证：** `bun test ./test/jit-optimize/production-closure.test.ts ./test/jit-optimize/validation-lifecycle.test.ts ./test/jit-optimize/package.test.ts`。

## C5 — 优化正确流程，分开候选尝试和推荐

**修改与测试：** `optimizer.ts`、`workspace.ts`、action diagnostics；沿用 opportunities 字段，不建第二模型规划回路。

- [ ] 用已归档 I18n no-change 推理建立方法回归案例：原任务全通过，locale key/placeholder 比较有明确局部边界。不能用“没 defect”“无法覆盖全部 skill”“也许回归”单独证明该机会不存在。
- [ ] 改写相冲突的方法说明：机会可来自减少重复读写、工具发现、已有脚本复用、参数化处理和确定检查；质量分不再是唯一优化目标，候选 confidence 也不等同提高评分的信心。
- [ ] 保留具体已知回归风险与原职责；用较窄适用条件、隔离试验和实际检查处理不确定性，不要求模型事先证明零可能风险。没有可验证依据的专业判断仍不能程序化冒充正确性。
- [ ] 机会记录至少说明：接管的步骤、可变参数、必要资源、检查来源、未接管职责、implemented/retained/not-applicable 及具体理由。复用现有字段或最少兼容扩展，避免巨量模板输出。
- [ ] 对“声称 implemented 却没有对应文件/动作”和格式无效 submission 给明确诊断，不能落成普通 no-change。对于合法但证据薄弱的 no-change 保留结果与原因，不自动无限重问；C8 以共享缺陷诊断决定是否需要新开发尝试。
- [ ] 测试缺评分仍调用优化器、metadata-only repair 生效、文档候选仍可交付而不冒充程序；提示字符串测试只证明合同修改，真实模型行为由 C8 单独验证。

**验证：** `bun test ./test/jit-optimize/optimizer-prompt.test.ts ./test/jit-optimize/infra-blocked-submission.test.ts ./test/jit-optimize/production-closure.test.ts`。

## C6 — 无人工评分文件时也能检查局部产物

**修改与测试：** `workspace.ts`、`validation-lifecycle.ts`、必要 handoff；对应现有测试，不引入通用评分服务。

- [ ] 写自然 prompt、`eval=[]`、原包已有本地检查程序的用例。系统能找到并在隔离目录复用该来源检查，不要求用户新建 `.skvm-validation.json`。
- [ ] 从原 skill 明确的检查入口、已有测试或可执行命令提取检查建议。原始程序/规则与候选程序分开；实际执行已选择任务范围内的检查，记录命令、输入、产物和作用范围。任意网页文字不能自动变成额外业务操作授权。
- [ ] 未预声明接口时允许模型根据 source 给出检查建议，但其新写的断言标 source-derived/self-check，并保留来源。独立 evaluator、源检查、自检、输出保真、模型评价分别记录；不因标签好看提升级别。
- [ ] 先做到一个原包内检查程序和一个来源不变量的局部检查。Law 可使用源 Stage3 内容/结构检查；I18n 可用源 locale parity/placeholder 规则。测试夹具可以构造，但不得把新断言写入原 skill 来制造权威。
- [ ] 给检查输入实际错结果，确认规则能检出；只跑 help、exit 0、输出“PASS”但文件错不能通过。缺检查只限制相应推荐/质量主张，不取消已可运行的其他局部步骤。
- [ ] 若用源 checker 无法覆盖整个任务，包明确保留其他职责；不用升级为整个 skill 的正确性证明。红绿后提交。

**验证：** `bun test ./test/jit-optimize/validation-lifecycle.test.ts ./test/run/optimization-handoff.test.ts ./test/jit-optimize/workspace.test.ts`。

## C7 — 一条连续的生产集成测试

**测试：** 扩展 `test/run/optimization-handoff.test.ts`、`test/cli/run-optimize.test.ts`、`test/jit-optimize/production-closure.test.ts`。

- [ ] 建立自然任务、原始文件和原始 skill；模拟 provider 仅代替付费生成，真实执行 capture、Evidence/workspace、程序、检查、动作修复、snapshot 和导出。不能为测试直接塞入完整研究 fixtures 绕开 C1/C2。
- [ ] 首轮候选故意含一个可修动作字段，修复后导出真实程序包；从改变 cwd 的目录消费本次包，改变输入值会改变程序结果，原文件和原包不变。
- [ ] 测试记录 `sourceRunId → proposalId → selected round/action → exportedPackage → consumedPackage`。复用已有标识及包闭包，不新增签名/多重哈希链。
- [ ] 注入三个反例：消费 H8/H9 旧包而非本次包；空 actions 的文档包冒充程序；agent 完成任务但未调用声明 helper。分别标连续性不成立、无程序、未消费，不能因任务结果正确而消失。
- [ ] 合并测试缺输入只影响关联动作、metadata 修复成功、保留基线、failed export 的既有恢复。无关失败用已存在测试引用，不重复搭建大矩阵。

**验收：** 同一新包的证据连续性由实际生产对象和执行记录证明。模拟 provider 的集成成功只计工程测试，不计真实优化成功。

**验证：** `bun test ./test/run/optimization-handoff.test.ts ./test/cli/run-optimize.test.ts ./test/jit-optimize/production-closure.test.ts`。

## C8 — 两种已有结构的真实默认入口

**原包：** `benchmarks/skill-ir/pilots/law-to-markdown/source/SKILL.md` 与 `benchmarks/skill-ir/pilots/i18n-helper/source/SKILL.md`。先确认它们是原始 source，不得替换为 H8/H9/R7 优化包。参考历史源规则和已暴露 development 输入，不读取 held-out。

- [ ] 先做 Law：把已暴露 TXT 内容放入新的普通任务目录，用户输入只包括自然任务、原 skill、workdir 和现有模型。系统自行采集原始输入，提出本地程序复用/改进并验证，保留实际命令和默认输出路径。
- [ ] 再做 I18n：使用已暴露 development React/locale 项目副本，任务写清实际业务目标及需要保留的文件，不向优化器指定新 helper 名称、源码实现或手工 action。目标观察参数化 key/placeholder 等局部程序能否自然产生，而非要求替代全部翻译。
- [ ] 实际调用沿用 `bun ./src/index.ts run` 的 `--prompt`、`--skill`、`--workdir`、`--model`、`--optimize`。执行前从本机既有配置解析可用模型并记录实际值；不要把未解析的占位符命令写成执行证据。默认不提供 `--task` 或 `--logs`。
- [ ] 每次 source 运行只对应一份真实 capture。优化不足先检查 C1–C6 的输入、动作、程序和规则数据，不先换 skill/换模型/写新研究协议；诊断指出共享代码错误就修该错误，再追加命名尝试。
- [ ] 真实程序首次失败、动作修复、no-change 和文档候选全部保留；no-change 细分没有机械机会、已被原程序覆盖、当前资源缺失、生成/接线问题、验证失败回退，不能用一条“证据不足”概括所有结果。
- [ ] 发现 no-change 合理且没有新可修根因时，保留该边界并继续另一独立结构。若两者都没有新程序连续成功，本轮产品仍 partial；只能基于已读语料中的明确机械机会选择下一开发案例并记理由，不按运行结果悄悄换样本。
- [ ] 禁止开发者手工完成候选程序来替代优化器。可以写生产代码、任务输入与独立评价，不能把预制 helper 塞给 source 再声称生成。

**验收：** 至少一条真实新生成程序全链，现成脚本路线也有真实实施尝试；若发生新的可修生产问题，先修主线，不提前进入报告收尾。

## C9 — 同一个新包的自然消费与效果

- [ ] C8 产出后先记录本次 source、proposal、最终包及所接管步骤；后续原/变化任务使用该包的精确副本。任何修订包有自己的关联，旧消费结果不能覆盖到新包。
- [ ] 普通 agent 只收到 task 和 skill，不泄露 helper 路径或“必须调用某脚本”的评价提示。包本身可以有清晰的常用命令；执行事件确认 agent 实际调用，并完成其余职责。
- [ ] 原任务和一个未反馈给优化器的语义变化任务各检查一次。Law 改内容/条款/参数，I18n 改 key、插值或 locale 内容，不仅改文件名；案例来源是 development，不冒称 prospective。
- [ ] 在首组比较前选定一个实际机械工作指标：重复脚本编写、例行文件读取/检查或无必要发现调用。相同模型、任务初始内容、runtime、工具配置和评价依据下比较原包与新包，使用全新会话和隔离目录；缓存状态和不能控制的因素如实记录。
- [ ] 记录质量、局部程序调用/退出、残余任务、input/output/cache 各 token、tool calls、耗时及实际/未知 USD。优化阶段的消耗单列。没有可靠单价不算美元 break-even，不用不一致上下文的 token 总量比较。
- [ ] 任务通过但未调用程序，属于正确完成但未证明程序收益；旧脚本本就能完成，必须指出新包实际减少了什么。任一关键质量回归不能被某项 token 下降抵消。
- [ ] 若新包使用指引导致重复探索或无谓检查，修共享优化/导出规则，再由优化器形成新版本，保留版本差异；不手工专修两份成品然后声称通用流程改进。

**验收：** 交付有边界的真实效果，即使 mixed/no-benefit 也准确。工程结果与收益分列，不承诺所有 skill、完整家族或固定百分比。

## C10 — 有限验证与交付

- [ ] 执行一次包含本轮修改模块的合并测试；先核对实际路径，新增模块测试纳入同一命令，不重复历史全量矩阵：

```powershell
bun test ./test/run ./src/run/index.test.ts ./test/cli/run-optimize.test.ts ./test/jit-optimize ./test/proposals/storage.test.ts
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
```

- [ ] 只做一次本轮文档链接/治理检查，结果与本轮代码状态对应；没有新问题不因最后一条文档或 SHA 变化重跑所有程序/付费案例。
- [ ] 生成精简 `final-report.json`：工程实现、产品闭环、行为范围、效果分别给实际结果；列实际包和使用命令、失败尝试、费用与未知。不以 C0–C10 全部终态推导成功。
- [ ] 更新 current-status、plan、spec 14.32 的已实现内容、usage 和现有组件段落；把未完成下一动作写具体。历史 H/R 报告和包保留原样。
- [ ] 按明确名单提交本轮代码、测试、必要文档和紧凑证据，推 `origin/skill-ir-aot` 并核对一次对齐；其他线程修改及缓存不夹带。原始 trace 是否进入版本库遵守已有脱敏/归档规则，不能为证据完整泄露凭据。
- [ ] 只有第 2 节最低条件实际成立才把用户持续目标标完成。若外部原因临时受阻，先完成独立任务并保留恢复点；目标状态遵守平台工具规则，不因收尾、时间到或阶段失败冒报完成/阻塞。

## 4. 可复制的持续目标指令

执行 `D:\skill优化\SkVM\docs\superpowers\plans\2026-09-14-skill-optimization-end-to-end-repair.md` revision 1 的 C0–C10，并设为持续目标。直接在 skill-ir-aot 连续开发，只推用户 origin，不新开分支。优先修复自然任务原始内容未进入验证链、普通脚本修改被误送领域后端、修复后动作元数据未采用以及候选生成过度依赖缺陷评分这四个具体问题；随后让原始 skill 经默认 run --optimize 产生的新程序包，在原任务和变化任务中被普通 agent 实际调用。用户不承担 trace、fixtures、action 或评分协议接线。旧 H8/H9/R7 包只作回归，不能替代本次包；合理 no-change、文档改进和局部失败保留，但不能计新程序闭环成功。保持局部职责和残余任务，不要求覆盖整个 skill。使用既有网络、认证 GitHub CLI、模型和付费授权，无用户金额上限，实际与未知成本分列；同候选一次生成和至多一次有依据的修复，有新根因可修共享代码后追加尝试，不无限抽样。常规检查点继续，不等待确认，不重做历史审计、不制作展示层、不启动 protected/prospective 输入。完成最低条件再标目标完成；未达标且存在可执行根因时继续修主线，用户明确叫停则停止。最后有限验证、提交推送和准确交付，不等待或重复测试凑时长。
