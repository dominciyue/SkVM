# 真实 trace 驱动的 skill 优化包：两日持续执行任务书

> For agentic workers：使用 superpowers:executing-plans 逐项推进；代码修改遵循 TDD，常规检查点不等待用户确认。复用当前工程，不另造优化器。

**Goal：** 输入用户已经运行过的 skill、真实 trace 及可获得的资源/环境，由模型发现可固化和可简化的部分，输出保留剩余职责的新 skill 包，让 agent 实际使用并测量效果。

**Architecture：** 以现有 JIT-optimize 的日志输入、Evidence、模型工作区和 proposal 为主链，接入已有 Skill IR 构造/checker 和适用的 JIT-boost 能力。多来源 trace 经适配层进入同一过程；局部程序返回结果后，agent 继续未接管的工作。

**Tech Stack：** TypeScript/Bun、现有 provider/headless-agent/adapters、JIT-optimize/proposals、Skill IR/API/Env 后端，按产物需要使用 Python。

**状态：** revision 2，active，2026-09-13。沿用本文件路径，替代未执行的 API-only U0–U5；当前主队列为 U0–U7。2026-09-13 已从仓库真实状态启动持续实现，恢复入口见 `results/skill-ir/trace-guided-skill-optimization-20260913/status.json`。旧版可从 Git 提交 4ae2518 恢复。

## 1. 用户已经确定的方向

- 优化发生在用户至少实际运行一次 skill 之后。输入包括 skill 文件夹、真实执行记录，以及记录中涉及且可取得的任务输入、资源和环境信息。
- 谁运行就接受谁的 trace，不限定 agent 品牌。实际格式支持和解析覆盖如实列出，不能承诺无须适配就理解所有私有格式。
- 优化阶段允许使用模型；发现所有有依据的优化机会，不要求必须是最大成本。排序用于安排实现，不作为小优化的拒绝门槛。
- 固化可复用方法和参数处理，不记住第一次答案。文档优化保留条件、限制、异常分支、恢复方法和未接管职责。
- 输出新 skill 包，原 skill 默认保留。agent 实际使用才构成产品链；脚本生成或包检查通过不等于已经省 token。
- 有适配部分就做，独立部分不受其他缺口牵连。不匹配的职责给出说明并保留原流程；没有可检验改变时允许 no-change。

## 2. 旧基础如何复用

| 已有模块 | 本轮用途 | 需要处理的边界 |
| --- | --- | --- |
| src/jit-optimize/index.ts、optimizer.ts、workspace.ts、src/proposals/ | Evidence→模型修改 skill 副本→proposal 与实际 diff | 主入口已经存在，不再新建优化器和包存储 |
| src/cli/jit-optimize.ts、evidence.ts、task-source.ts | 复用 --task-source=log 和 --logs 接入已有记录 | log 模式不重放，优化与效果验证分开 |
| src/core/conv-log-parser.ts、pi-runtime.ts、src/adapters/ | 解析工具事件、执行状态与可用 usage | 代码片段或摘要不等于完整 trace，未知数据不填零 |
| src/skill-ir/skill-duty-extraction.ts、IR/parser/lowering | 对应 skill 职责、步骤依赖和剩余工作 | 原文引用匹配不证明理解完整 |
| src/skill-ir/api-task-run.ts、api-task-artifact.ts、已有 checker | 请求/schema/form/负例/响应等确定性工作 | 只构造任务需要的内容，按真实缺口扩展 |
| Env artifact 编译器及原 skill 自带脚本 | 复用已支持的环境/配置操作 | 不为凑家族数量重写后端 |
| src/jit-boost/candidates.ts、solidifier.ts | trace→代码模式和参数化模板 | beforeLLM 的成功替换会结束整个 run，不能直接套到局部步骤 |
| src/benchmarks/skill-ir/real-agent.ts、bench/framework | 文档渲染、真实 agent 执行与比较 | 冻结 benchmark 身份不改，新运行另存 |

**审查纠正：** 主工程已有基于日志修改 skill 副本的 JIT-optimize。此前过于集中于 skill-ir 子目录，把“所需接线尚未验证”说成“没有统一入口”不准确。当前缺口是多来源 trace 可靠适配、现有优化器与确定性后端协作、局部替换后继续流程，以及完整 agent 收益。

原北向目标是产生可执行、可复用 skill 产物并减少重复成本；本轮将现有组件接回用户使用链。分类、来源闭包、构造器和 checker 继续复用；重复归档/审计投入不能代替效果，也不因已有沉没成本继续扩张。

## 3. 适配与部分处理

优先处理 trace 中有明确可程序化步骤的 skill：接口请求/测试样本、结构检查、格式转换、已知环境检查、已有脚本复用和重复操作。API 是目前能力最深的一组，不按 skill 名称限制入口。

其他 skill 可以获得有依据的文档整理，不能因此声称其专业判断被固化。不可取得的状态、资源和不可观察交互要提前说明；按职责返回支持范围，而不是整个 skill 一律失败。

能力匹配取“本任务需求与当前能力的交集”，同时保留必要依赖。没有响应检查需求就不创建该义务；合法空对象正常支持；数字、布尔和数组按明确编码规则接入。不能删必需字段后假称合法、把未覆盖职责改成不存在，或把模型生成错误算作低程度优化。

交付补充四项直观结论：packageUsable、solidificationApplied、documentChangesApplied、effect（positive/mixed/no-improvement/not-measured）。它们由实际结果说明，不建立新的层层 readiness gate。纯文档改进与固化分开，包生成不自动推出效果正向。

## 4. 多来源真实 trace 合同

- 保留原记录引用和顺序，只提取可见消息、工具参数/返回、文件和资源引用、状态、可用环境和 usage；不索要隐藏思维链。
- 区分原始真实日志、脱敏派生、用户摘要、合成 parser fixture 和模型推断。用户提供的记录按其来源声明使用，不靠 hash 宣称内容真实；有既有运行记录则交叉核对。
- 原始私有 trace 留在用户本地，提交材料必须脱敏；不能把一次摘要扩写成完整工具轨迹。
- 优先使用已有 parser/adapter。未知 JSON/JSONL/文本可由模型辅助对齐，但抽取事实须能指回原文位置；推断单列，缺项保留。
- metadata 表达 sourceAgent、format、原始定位、解析覆盖/诊断、usageAvailable。未知 token/时长/工具返回不能补成 0 或成功；旧 RunMeta 默认零值不能直接用于节省率。
- 一个坏事件不吞掉正常事件。无可靠事件时仍返回格式诊断或文档分析，不声称完成 trace-guided 固化；不能仅因文件是合法 JSON 就误识别为 SimpleReport。
- 不固化秘密、可变业务状态和机器专属路径。历史真实副作用不自动重放；普通可逆实现不添加批准仪式。

## 5. 连续执行与两日安排

- 直接在 skill-ir-aot 工作；尊重其他线程改动。文档治理线程管导航归并，本线程管任务书、方法与工程；共享文档只做必要同步，不覆盖并发编辑。
- 联网、认证 GitHub CLI、远端 API、有用途的付费调用已授权，无用户金额上限；按优化、目标 agent、评估、采集分账，未知保留。
- 前约 4 小时打通 U0/U1；前约 16 小时争取第一个完整优化/消费闭环，再做类内复用和效果修订。2026-09-14 18:00 后不新增能力方向，保留交付窗口；不按运行时长判成功。
- U0→U1→U2→U3→U4 得到一个闭环，再扩 U5/U6，最后 U7。单一问题 90 分钟无可检验进展时记录原因、转独立任务，不因一个来源或负例失败停止全部开发。
- 失败测试→实现→相关测试。允许依据新证据继续修复，不使用“一次失败永久关闭”的研究规则阻止工程；失败输出保留，不反复请求到只剩成功样本。
- 不新开分支，不重跑旧 prospective/Q1/held-out，不找 clean-002、不继续无关 Meilisearch 维护、不做 HTML。
- 新 development 结果仅用 results/skill-ir/trace-guided-skill-optimization-20260913/，复用 proposal 原件。一个真实 trace 驱动可消费包是最低产品闭环；目标三个匹配 skill、两个仓库，同一能力在两个成员复用。不足就交付实际范围，不能改分母补成功。
- 不为满足固定百分比拒绝小收益；也不把任何文件改动都称为优化。不等待、不重复审计或扩写报告凑时长。

## U0 — 接通已有日志优化入口与真实基线

**复用：** docs/architecture.md、docs/usage.md、docs/jit-boost.md；src/cli/jit-optimize.ts；src/jit-optimize/index.ts、task-source.ts、workspace.ts；src/core/headless-agent/。

- [x] 从用户已有运行或已归档 development 记录取得 skill/trace/任务资源。没有可用记录时，使用授权 agent 正常执行一个公开任务采集真实日志，注明开发者采集，不能称为用户实测。
- [x] 确认任务目标、skill 版本和已知环境，记录缺项；不读取账户密钥或批量扫描私人会话来凑样本。
- [x] 用现有 jitOptimize(config) 或 CLI 的 log 路线产生 proposal，核对实际编辑的 skill 副本。复用本机配置的 provider，不猜模型账户，不先新建命令。
- [x] 整理原流程、可观察事实、候选机会和剩余职责。成功或失败 trace 都可用；没有最大热点也继续，错误行为不能固化成正确答案。

运行：bun test ./test/cli/jit-optimize.test.ts ./test/jit-optimize/workspace.test.ts ./test/jit-optimize/task-source-criteria.test.ts。只修与本次接入直接相关的基础故障。

## U1 — 多来源 trace 适配

**修改：** src/jit-optimize/evidence.ts、types.ts、task-source.ts；必要时新增 trace-adapters.ts 与 test/jit-optimize/trace-adapters.test.ts，复用 src/adapters/ 的事件映射。

- [x] 先做测试：现有 conversation JSONL、新来源的实际导出结构、正常事件夹坏行、缺失 usage/返回、未知事件、摘要与工具 trace 区分。
- [x] 接入统一 Evidence，保留原始定位和可恢复事实。对旧 parser 的静默空结果、宽泛 type 判定与 SimpleReport 误识别增加诊断。
- [x] 首批争取两个真实 agent 来源格式；未取得第二种就明确限制，不能把同一次运行换两种编码算两个 agent。合成记录仅测试 parser。
- [x] 未知格式可模型辅助对齐，结果回源；无法可靠解析的部分返回诊断，不按 agent 品牌拒绝，也不伪造轨迹。
- [x] 缺 criterion/usage 允许生成候选，但不能自动给质量满分或用 0 计算收益。

最低行为：只有调用、没有返回和 usage 的日志，保留调用事实；结果和 usage 为 unknown。执行新增 adapter 测试及 U0 相关输入测试。

## U2 — 发现全部有依据的优化机会

**修改：** src/jit-optimize/optimizer.ts、workspace.ts、types.ts；test/jit-optimize/optimizer-prompt.test.ts。需要独立结构时新增小型 opportunities.ts，复用已有职责提取和 IR。

- [x] 扩展目前主要修复失败的优化目标：PASSING 任务同样可以减少重复步骤、成本和文档负担。保留质量要求，不使用“没有失败就没有优化机会”。
- [x] 候选至少区分复用已有脚本、固化步骤、整理说明、修复重复错误、保留原流程；记录对应 skill 要求、trace 事件、依赖、参数和预期改变。不强求每一步都有精确 token 归因。
- [x] 同时考虑多个独立机会；原 agent 已调用的脚本不能被重新计作新增固化。优先已有后端，再考虑规则明确的小型新程序。
- [x] 文档改进和程序固化分别记账；一次 trace 未经过的限制/异常分支仍从原 skill 保留。
- [x] 测试成功但重复的任务能提出候选，无依据业务判断保持原流程，缺字段不能通过修改必需要求/评分规则掩盖。

运行：bun test ./test/jit-optimize/optimizer-prompt.test.ts。补充候选行为/职责保留测试，不仅增加逐字提示词断言。

## U3 — 局部固化并继续剩余流程

**复用：** src/jit-boost/candidates.ts、Skill IR API/Env 公共函数、原 skill 自带脚本和 JIT-optimize 工作区。必要时新增薄的 src/jit-optimize/solidification.ts 与测试；不改冻结 benchmark runner。

- [x] 将可匹配职责接到已有函数/脚本。规则明确且现有后端不覆盖的简单步骤可以由模型生成小程序，必须验证输入输出；不现场发明完整领域编译器。
- [x] 将输入路径、业务参数和资源依赖参数化，不硬编码第一次答案或秘密，不无条件冻结动态环境。
- [x] 多步骤任务由新 SKILL.md 调用脚本并继续剩余工作。现有 boost 的全 run short-circuit 仅用于确实覆盖整个任务的情形，不能局部提速后提前结束。
- [x] 按需构造、局部检查。无关字段或响应缺口不牵连独立产物；错误产物隔离，未完成义务继续保留。
- [x] API 空 form、数字/布尔编码、负例/native 按实际需求修复并由共享能力承接；无响应依据不猜业务状态。旧默认兼容不禁止新开发能力。
- [x] 验证原输入、一个变化输入和一个不适用情形：方法能参数化，不适用时能回到原流程，而非制造假成功。

根据改动运行 API task/后端、Env 或新脚本测试；纯文档变更不重跑所有后端。

## U4 — 输出新 skill 包并由 agent 使用

**修改：** JIT-optimize optimizer/workspace 与现有 proposal 接线；相关测试 test/jit-optimize/workspace.test.ts、test/core/skill-bundle.test.ts。公共说明复用现有 JIT usage。

- [ ] proposal 中输出有效 SKILL.md、所需 scripts/references 和依赖说明；原 skill 保留，默认不 auto-apply，不新增包管理器。
- [ ] 新入口明确何时调用、参数/结果、剩余步骤和恢复方式；详细资源按需读取，避免每次同时注入完整新旧两份文档。
- [ ] 程序已承担的工作不要求 agent 无条件重做；全局限制留在有效入口，不藏进不会读取的 fallback 文档。
- [ ] 在研究目录外由真实 agent 加载包、执行至少一个固化程序并完成剩余工作；保存加载和调用证据，交付真实命令与产物。
- [ ] 包依赖和本机限制明确；不使用私有临时路径却声称可携带。trace 可输入与包能在哪些 agent 运行分别列出。

先完成一个 U4 闭环再扩样；仅生成 SKILL.md 不算主链完成。

## U5 — 在同类职责上复用

**位置：** 本轮 development 结果与现有 proposal；需要时新增单个 scripts/skill-ir/trace-guided-skill-development.ts 编排脚本，复用 framework/bench。

- [ ] 目标三个实际匹配 skill、至少两个仓库，按真实 trace 可获得性和明确职责选择，记录不匹配原因；不称为随机代表大多数 skill，不重启大规模语料搜索。
- [ ] 同一个固化能力用于至少两个成员，不写按仓库名称成功的分支。成员可分别获得文档改进、局部固化或 no-change，不强求同幅度。
- [ ] 核心成员至少原任务与一个变化输入；我们生成的输入注明构造来源，外部原任务和 fixture 分列。
- [ ] 提取不足保留剩余职责；工程手工修 mapping 必须注明辅助，不能记作全自动导入成功。

## U6 — 比较实际 agent 效果并修订

**复用：** 已有 agent adapters、framework/bench、pi-runtime usage observation 和 proposal；只有命令耗时的 raw-runs 不能提供模型 token 证据。

- [ ] 原 skill 与新包使用相同 agent/model、任务、权限和必要环境，从可比较初始工作目录运行。环境不可重建的旧 trace 不能直接作为公平耗时对照。
- [ ] 优化所用那次 trace 与后续验证分开。每个成员先做原输入和变化输入各一组配对，必要的重复用于确认争议，不凑时长。
- [ ] 检查最终产物/职责、实际程序调用、剩余流程和失败；无确定性 oracle 的部分可用明确 rubric 辅助，模型自评不能冒充独立证明。
- [ ] 分列目标 agent 的输入/输出/cache/reasoning（有则记录）token、调用、耗时和质量；优化模型、导入、评估及开发代理成本另计。未知费用/usage 不填零，不混不同模型/agent 算节省率。
- [ ] 从实际 diff/调用区分固化和文档作用；有明确归因疑问时只选一个任务补小型对照，不建大矩阵。
- [ ] 质量可比时报告逐任务及总体成本变化、重复使用摊销。所有可验证收益均可接受，不强制 30% 或最大热点；保留零提升和变差。
- [ ] 首次结果显示没用脚本、重复检查或适配条件错误时，修调用/交接/参数条件；保留首次失败，不通过删任务要求降低 token。

## U7 — 有限验证与交付

- [ ] 跑一次受影响模块合并测试、bun run typecheck、文档单测及本轮链接检查；必要时一次普通目录消费。复用 checker，不新增 write-once/多层摘要/clean 复验循环。
- [ ] 交付实际优化包、原/新运行记录、简短效果表、trace 格式范围、适配边界和未完成项；说明给什么、怎么用、省了什么。
- [ ] 原件使用已有 proposal 存储，Git 只提交脱敏且有必要的复现材料，不默认提交用户私有 trace 和工作文件。
- [ ] 本线程更新方法与任务状态；治理线程做导航归并，不重复复制历史。提交前确认暂存归属，不覆盖他人修改。
- [ ] 提交推送用户 origin 工作分支；若有其他线程未发布提交先协调归属，不 reset/rebase 丢弃，不为记录最后提交反复重建归档。
- [ ] 主链只有在真实 trace→优化包→agent 实际使用达成时才算完成；可用范围或效果不足如实写，不能用所有阶段都有终态报告代替成功。完成后交付，不自动开启其他研究目标。

## 可直接设置的持续目标

执行本任务书 revision 2 的 U0–U7。基于用户或真实 agent 已运行过的 skill 和 trace，复用 JIT-optimize、JIT-boost、Skill IR/后端和 proposal，完成多来源日志接入、所有有依据的优化机会分析、部分固化与文档改进、新 skill 包交付以及实际 agent 对照。不限定 trace 的 agent 品牌，不伪造缺失记录，不强求最大热点或固定收益比例；保留未接管部分和原流程。直接在 skill-ir-aot 连续开发，按任务书处理局部失败、成本和截止时间，常规检查点不等待确认。完成后提交推送 origin 工作分支，交付真实成果，不用重复审计或等待凑时长。
