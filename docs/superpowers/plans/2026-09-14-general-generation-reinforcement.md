# 通用生成流程补牢：持续开发任务书

> **For agentic workers:** 使用 superpowers:executing-plans 连续执行。主代理负责方案、代码和最终验证；按有效 AGENTS 使用窄范围只读子代理。每项实现先写能复现缺陷的测试、确认失败，再修改生产代码；常规检查点不等待确认。

**Goal:** 在已有 trace → optimizer → 局部程序 → validation/repair → package 链上，减少对模型一次性正确接线的依赖，使不同结构的 skill 都能通过普通入口获得有来源的优化机会、可参数化程序、实际局部验证和清楚的使用交接；用同一新包的自然消费判断实际改善。

**Architecture:** 保留现有 Evidence、IMPLEMENTATION_CONTEXT、actions、implementation selection、validation lifecycle、一次局部 repair、exporter 和 consumption/effect。引擎补可确定的索引、资源映射、验证骨架和执行观察；模型承担语义选择、程序生成及必要的缺口修复。不另建编译器、通用 DSL、评分平台或独立优化服务。

**Tech Stack:** TypeScript/Bun、现有 bare-agent/provider、Python/Node 本地程序、已有来源检查与程序验证器。

**状态：** revision 2，planned-not-started。初版形成基线 `15b5d51`，本次审查基线 `1fe064a`，分支 `skill-ir-aot`。新增语料到实现的追踪、执行型流程骨架和跨模型/环境比较。本任务书形成不代表启动执行，也不代表创建持续目标。旧 C0–C10 保持 completed-development；其成果是本轮基础。

**工作目录：** `D:\skill优化\SkVM`。结果目录为 `results/skill-ir/general-generation-reinforcement-20260914/`；仅在 F0 启动时建立 `status.json`。每次实际尝试单独保存，阶段日志不另建 Markdown。

## 1. 已经做过什么，本轮到底补什么

| 已有实现 | 当前具体薄弱点 | 本轮增量 |
| --- | --- | --- |
| `workspace.ts` 构建程序、输入、输出、参数与检查索引；`optimizer.ts` 盘点复用/参数化/转换机会 | 参数索引主要来自 `--xxx` 文本；真实执行命令、位置参数及输入/输出来源没有形成充分可用的操作记录 | 从已捕获工具事件组织可追溯的操作片段和参数来源，减少模型重复搜索；不自动把观察当规则 |
| `reuse-script`、`generate-script`、约束及残余职责已存在 | 路径/字段参数化主要靠模型遵守提示；声明支持不等于变化后可用 | 用来源支持的参数变化与路径迁移实际检查声明边界 |
| `deriveProgramValidationPlan` 和 `validateOptimizationProgram` 已接入默认优化循环 | 模型不提交 `action.validation` 就出现 `validation-suggestion-missing`，没有案例可运行 | 引擎从已有资源补可确定骨架；缺语义信息时触发一次局部补全；无依据仍局部未知 |
| rejected action 的一次 repair、元数据合并、相关动作复验已实现 | `not-run` 进入 unvalidated，不同于 rejected；可修接线缺口容易停留为 draft | 区分可修缺口与真实缺证据，复用同一个 repair 预算与合并器 |
| 包内已有常用命令、参数、fallback 和剩余职责 | 文档可读不代表少探索；消费分析默认 API helper 且依赖文本包含及特定 stdout | 依据实际入口和执行事件观察消费，兼容普通程序输出，不新增统一 stdout ABI |
| U/G/H/C 已有真实尝试及 mixed 效果 | 文件闭包、程序退出、局部质量、整个任务质量容易混成一个成功 | 分别报告生成、可执行、局部验证、自然消费和效果，缺失不冒充通过 |

命名失败只作回归入口：C8 Law batch 的 missing validation、I18n 的文档/no-change、CSV 首跑 timeout。不得为这些名称、仓库地址、字段表或文件名增加生产成功分支。

CSV 首跑约 117.5 秒耗在第二次 provider 请求，原任务 120 秒超时，优化器未进入；它不能用来证明优化器拒绝 CSV。`15b5d51` 已修退出码覆盖与错误提示，试用启动器另设 15 分钟任务预算，不重复把这两项列为待实现成果。

## 2. 范围、完成标准与运行规则

### 2.1 服务的共同职责

面向“正常运行时包含可复用本地操作”的 skill：读文件与结构检查、确定性统计/转换、已有脚本调用、批处理和结果整理。程序可接管部分职责，agent 继续承担语义解释、专业判断和适用性选择。

“类”按职责与可用证据定义，不按 API/CSV/Law 名称定义；不同输入格式可以接不同局部能力。不要求所有 skill 都有 JSON 输入、help 命令、固定输出字段或同一检查器。缺少某种结构只限制依赖它的动作。多读 skill 只用于补一个明确结构缺口，不能用阅读数量代替实现。

### 2.2 最低工程完成条件

1. 默认 `run --optimize` 会实际使用 F1–F6 的公共能力；不得只在研究 runner 中实现。
2. 有充分输入/入口/检查来源但缺 validation 元数据的动作，可以经引擎补齐或同一次局部 repair 后实际运行；缺少依据的动作说明原因，独立可用动作继续。
3. 参数化检查能检出观察路径写死、声明参数未生效等缺陷；不要求未知格式自动通过，不把可选结构缺失变成整包拒绝。
4. 至少覆盖两种不同结构的真实普通入口尝试；目标是两者均形成程序包并自然消费，其中至少一条本次由模型生成/修改程序、经过默认内部局部行为验证，再消费同一个新包。第二条若 no-change/失败，保留事实，不能称跨结构可靠。
5. 原任务与变化任务的关键质量不回退，记录程序是否被调用、重复探索/重复写代码是否减少。至少取得一项可解释的局部改善，或明确交付“工程已补牢，收益仍未证明”。不得保证预定节省比例。
6. 有可运行包、复现命令、实际限制和针对性回归；不以旧包、文档包、包闭包或测试总数替代程序链。

revision 2 加强第 4 项：目标中的程序必须包含一个实际生成/转换/整理产物的执行型流程，至少把两个来源明确且可连续执行的机械步骤接管到同一普通命令中。仅 checker、自检、空 wrapper 或文档导航不满足这项加强条件。若本轮只得到 checker，按实际可用成果交付，但明确“执行型流程尚未达成”，不能把检查能力等同流程自动化。

跨模型与环境的条件见 F9.1；跨模型收益不是预设成功条件，但必须执行有条件可做的比较并保留失败/不可用，不以理论上的确定性代替实测。

完成状态分开：`engineeringStatus`、`realUseStatus`、`effectStatus`。所有阶段进入终态不自动满足最低条件。若实际只完成组件，交付 partial 和明确后续动作；持续目标不得按完整目标标完成。所有明确可修主线已处理仍无收益时，允许诚实结束有限实验并交接，不能无限抽样直到得到正数。

### 2.3 执行纪律

- 用户只提供 skill、自然任务、workdir 和模型配置；trace、资源、验证接线由系统处理。高级日志接口继续兼容。
- 直接在 `skill-ir-aot` 开发，仅推用户 origin；不新建分支，不处理其他线程的 `src/skill-ir/skill-family-minimum-delivery-run.ts` 修改和历史未跟踪材料。
- 网络、认证 GitHub CLI 和有用途的付费调用沿用授权，无用户金额上限。费用、未知计费、优化成本和消费成本分列；不读或打印凭据。
- 先做确定性补全；同一候选所有可修缺口共用至多一次模型 repair，不给每层单独一轮。共享代码修复后可追加命名尝试，保留前次失败和理由；禁止无新信息反复生成。
- 捕获失败、原任务失败、优化失败、合理 no-change、程序不适用分别处理。原任务 timeout 不能靠包恢复命令续跑；未知完成状态的外部业务操作不自动重放。本轮默认用隔离本地任务。
- 不新建哈希链、额外审批层、全量审计或 HTML 展示层；复用已有来源和包绑定。保护原输入、源 skill、外部副作用及真实检查依据。
- 本轮仅 development，不使用 held-out/Q1 reserve，不改历史 readiness、prospective 或旧结果。公开新 skill 可以作为明确标记的开发案例，不冒称 untouched prospective。
- revision 2 工作量预计约 10–18 小时，依实际根因调整；不睡眠、重复验证或无目的联网凑时长。完成则交付；有明确可修根因则继续主线。用户新消息按最新指示处理，历史转述的“已停止”不是当前停止命令。

## 3. 文件职责与队列

下列路径均相对 `D:\skill优化\SkVM`。现有巨型文件只改职责入口；新增小模块仅用于可独立测试的能力，禁止重复原有验证器。

| 阶段 | 修改或新增位置 | 验证位置 |
| --- | --- | --- |
| F0 基线 | 命名 C8/CSV 记录、当前 status | `test/cli/run-failure-exit.test.ts`、`test/jit-optimize/production-closure.test.ts` |
| F1 操作来源 | `workspace.ts`、`types.ts`；新增 `operation-context.ts` | 新增 `test/jit-optimize/operation-context.test.ts`，沿用 workspace/trace tests |
| F2 参数来源 | `operation-context.ts`、`types.ts`、`optimizer.ts` | operation-context、implementations tests |
| F3 验证骨架 | `validation-lifecycle.ts`；新增 `validation-completion.ts` | 新增 `test/jit-optimize/validation-completion.test.ts` |
| F4 缺口修复 | `loop.ts`、`validation-lifecycle.ts`、`optimizer.ts` | production-closure、validation-lifecycle tests |
| F5 参数变化检查 | `validation-completion.ts`、`package-validation.ts` | validation-completion、package-validation tests |
| F6 生成与导出 | `optimizer.ts`、`implementations.ts`、`package.ts`；新增 `workflow-scaffold.ts` | optimizer-prompt、implementations、package；新增 workflow-scaffold tests |
| F7 消费观察 | `consumption.ts`、`general-skill-development.ts`、必要时 `core/pi-runtime.ts` | consumption、general-skill-development tests |
| F8 默认链集成 | `run/optimization-handoff.ts`、`cli/run.ts`、`loop.ts` | continuous-production-closure、optimization-handoff tests |
| F9 多结构实用 | 普通 CLI、development 输入与结果 | 实际 source → 新包 → 原/变化任务 |
| F10 反馈与效果 | `consumption.ts`、`effect.ts`、共享生成规则 | effect/consumption tests、少量真实配对 |
| F11 交付 | 现有组件、usage、current-status、任务书 | 一次相关回归、typecheck、文档检查 |

顺序 F0 → F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F9 → F10 → F11。真实案例暴露共享根因时回到相关实现阶段，不先换案例或单独手修产物。

## F0 — 建立实际基线，避免重做

- [ ] 核对 HEAD、工作树和模型配置来源，只登记路由名及运行时，不输出密钥。登记本轮归属文件和结果 status。
- [ ] 在 C8 命名记录中核实 missing-validation 的动作与现有 repair 结果；CSV 失败只读诊断与对应 session。生成短 `baseline.json`，记录每个问题是已修、当前可复现或尚待核实。
- [ ] 核实 `optimizer.ts` Method 中允许 passing-task 候选与后文 No-trade-off 的 yes/maybe stop 是否冲突；这是当前代码事实，不直接宣称造成某次历史 no-change。F6 修改应以行为试验判断，不能只增加正向提示字符串。
- [ ] 执行一次 `bun test ./test/cli/run-failure-exit.test.ts ./test/jit-optimize/production-closure.test.ts`。Bun 不在 PATH 时使用已安装可执行文件并为子进程补 PATH，不把环境找不到命令当逻辑失败。
- [ ] 输出 `status.json` 的 `currentStage/currentAction/attempts/nextAction/costs`。以实际完成条件推进，不维护第二套冻结锁。

**验收：** 本轮从已有默认验证链出发；没有把已实现的 C1–C7 再次列为从零建设。

## F1 — 从真实执行整理可复用操作线索

- [ ] 红例：trace 包含读输入、执行既有脚本、写结果；相邻自然语言提到另一个脚本。只记录实际工具操作，引用具体 tool-call ID，不能把文字当执行。
- [ ] 新模块 `operation-context.ts` 读取已有标准化 AgentStep/Evidence，不读取宿主任意目录，不复制 provider 解析。记录 operation 的真实入口、原始 argv/cwd、读写文件、退出状态、可用时耗时及其来源。
- [ ] 严格 argv 与 shell 字符串分开；只解析已支持且无歧义的命令结构。动态拼接、多重 shell、无法解析部分保留原文定位与 unknown，不猜参数。
- [ ] 接入现有 `IMPLEMENTATION_CONTEXT.json`，为模型提供少量相关操作摘要和完整记录 locator；不把整份长 trace 再注入一次。旧 trace 缺字段继续可优化。
- [ ] 相同脚本多次调用、临时脚本被写出后执行、已有程序未被调用分别记录为事实；“是否值得固化”仍由模型结合任务语义判断。一次出现也可成为候选，不增加重复次数门槛。
- [ ] 运行 `bun test ./test/jit-optimize/operation-context.test.ts ./test/jit-optimize/workspace.test.ts ./test/jit-optimize/trace-adapters.test.ts`，提交该独立增量。

**验收：** 引擎能指出做过什么以及证据在哪里；不会仅因 skill 名称推导机会，也不会自动认定临时代码可泛化。

### F1.1 — 把 skill 深读变成共享实现输入

- [ ] 从已有 30 个广读/10 个深读记录选 4–6 个结构差异明确的成员，覆盖已有脚本、没有脚本但有固定步骤、多文件条件分支、主要语义判断四种情况。10 是子集，不当作新增样本；已读不等于已运行。
- [ ] 每个选中成员读完与目标职责相关的 SKILL 正文、直接脚本/资源及可用真实 trace。形成一份 `pattern-to-code.json`：source/trace 定位、固定步骤、变量、环境依赖、必须由 agent 判断的分支、当前引擎支持、缺口、对应生产符号与回归测试。
- [ ] 区分“指令要求这么做”和“trace 实际这么做”。没有真实 trace 的成员可以帮助理解结构，不能计执行或效果证据。正文中的安装/联网要求不是自动执行授权。
- [ ] 从对比中提炼跨成员共用的机制；至少选一个两种结构共同暴露的问题进入 F2–F8 的实际代码与回归。已覆盖的模式只补关联，不重复开发。无可复用实现的语义职责明确保留。
- [ ] 若现有语料缺一个明确模式，再定向获取 2–4 个公开来源正文及直接依赖；使用认证 gh 和缓存，不恢复大规模搜索抓取队列。读取数量不是验收目标。

**验收：** 任何声称“通过调研补强项目”的条目都能追到源码事实、生产修改或明确不做的边界；不交一张与实现无关的分类表。

## F2 — 明确参数来自哪里

- [x] 红例包含：位置参数、`--input` 参数、配置文件字段、带空格中文路径、业务固定常量、可选值缺失。只知道一个观察值时，不推导其完整取值范围。
- [x] 在现有 action/input/constraint 结构上增加最少兼容字段或复用来源引用，区分 `observed-value`、`task-variable`、`source-fixed`、`unknown`；记录绑定方式是 argv token、配置字段还是环境依赖。
- [x] 入口与输入映射来自真实执行或来源声明；不能靠全局字符串替换修改脚本中的所有相同文本。配置字段迁移只改所声明字段，保留其他字段。
- [x] 生成提示用该索引解释应由用户任务给值的部分；来源明确固定的业务规则保留。格式/字段不在当前动作内的，回退给 agent，不把所有 skill 统一成 JSON/CSV。
- [x] 对声明参数化却仍读取旧固定路径的程序，已保留 F5 的可运行反例入口；无法确定参数对应关系的，仅生成待补信息，不提前拒绝整个包。
- [x] 运行 `bun test ./test/jit-optimize/operation-context.test.ts ./test/jit-optimize/implementations.test.ts ./test/jit-optimize/optimizer-prompt.test.ts`（46/46，176 assertions）及 `bun run typecheck`。

**验收：** 形成来源明确的参数候选和未知项，而非一个声称理解所有语言/配置的静态分析器。F2 已完成；机器证据为 `results/skill-ir/general-generation-reinforcement-20260914/f2/verification.json`。

## F3 — 引擎补齐可确定的验证骨架

- [x] 红例：可执行 action 无 `validation`，但原始输入、已声明入口/参数映射和来源检查齐全；最终必须调用现有程序验证器。对照例只有输入没有输出规则，则不能凭空产生语义通过。
- [x] 在 `deriveProgramValidationPlan` 前调用小型 `validation-completion.ts`，输出现有 validation suggestion 加补全 provenance/diagnostics。优先使用模型已提交且有效的计划，不重复生成第二份。
- [x] 引擎可填写 evidenceId、可物化 inputFiles、已确认 argv、sourceRefs，以及已有检查的资源引用；语义含糊的命令或断言不能自动填写。新入口参数不同于原 trace 时，不把旧 argv 硬套上去。
- [x] 来源依次使用：原 task/source 可执行断言、原包明确检查、原输出保真参考、程序自检。各自保留不同 authority；原输出不自动变成正确答案，模型新写的检查不自动获得“独立”身份。
- [x] 原输出只支持 fidelity 时，实际运行并记录 fidelity 结果；不因没有外部 oracle 把可做的验证全部取消，也不把 fidelity 升级为完整任务正确性。
- [x] 复用 `readPreRunInputSnapshotContents`、现有资源物化与校验，不增加新快照/摘要链。一个动作缺资源不影响独立动作。
- [x] 运行 `bun test ./test/jit-optimize/validation-completion.test.ts ./test/jit-optimize/validation-lifecycle.test.ts`（24/24，99 assertions）及 `bun run typecheck`。

**验收：** missing suggestion 不再一律等于没有案例；引擎补的是可确定接线，不是自动编造评价标准。F3 已完成；机器证据为 `results/skill-ir/general-generation-reinforcement-20260914/f3/verification.json`。

## F4 — 可修接线缺口进入既有一次 repair

- [x] 红例：首轮程序正确、缺 argv 或 validation；确定性补全不足，但有明确来源可请求模型局部补齐。首轮无源码 diff 的 metadata repair 必须实际被采用与验证。
- [x] 将诊断区分为可补接线、真实缺依据、未执行、程序失败；不要把所有 unvalidated 改成 rejected。只有具体且有来源的缺口加入 repair scope。
- [x] 与现有 rejected repair 合并为同一次请求。传入当前候选、相关操作记录、缺字段、允许修改范围和不可改检查依据；不再次要求全量机会分析。
- [x] 修复允许补 action 的实现/参数/验证元数据；不能删义务、改预期答案、吞独立动作或放宽来源。使用已有约束合并器、`executeActionIds/priorReport/validationBinding` 复验相关动作。
- [x] 真正没有检查依据时保留局部 draft/unknown，跳过无意义修复调用；确定性补全成功的动作也不调用模型修复。
- [x] 回归混合动作：一个补全成功、一个资源不足、一个程序错误；前者可用，中者未知，后者修复或回退，依赖/共享文件传播保持。
- [x] 运行 `bun test ./test/jit-optimize/production-closure.test.ts ./test/jit-optimize/validation-lifecycle.test.ts ./test/jit-optimize/continuous-production-closure.test.ts`（29/29，187 assertions）及 `bun run typecheck`；另行运行 validation-completion 单测（7/7，28 assertions）。

**验收：** “可修但未提交验证”不会无声停留 draft；无依据时不强制额外模型调用。F4 已完成；机器证据见 `results/skill-ir/general-generation-reinforcement-20260914/f4/verification.json`。

## F5 — 用变化检查参数化，不要求统一输入

- [x] 从 F2 已声明的参数绑定生成隔离案例：移动输入与输出目录、改变 cwd、改变一个来源允许的参数值。只选择对该动作语义合法的变化。路径/cwd 变化由 `deriveValidationVariations` 生成；参数值不猜测，只把同一 evidence 的已存在成对案例记为 covered。
- [x] 路径变化必须清理案例对旧绝对路径的依赖；在测试中让原观察位置不可访问，检出“新参数存在但程序仍读旧文件”。不移动或删除用户真实源文件。固定路径候选在 relocated case 上被拒绝。
- [x] 输入值变化只有在来源给出可检查关系时才生成期望；不能把旧输出原样当新输入的正确答案。例如顺序不影响集合校验必须有集合语义依据，顺序敏感转换不能套用。无独立关系时保持 skipped，并保留 sourceRefs。
- [ ] 红例包括：忽略声明参数、错用原 cwd、把缺失可选字段当致命错误、缺必要输入仍写成功结果、固定业务常量被错误替换。保留正确且来源要求的拒绝。当前已覆盖固定路径与不可用 cwd；其余红例留给后续真实结构回归，不能用未测项冒充完成。
- [x] 不适用时先解释/返回给 agent，支持动作继续；未声明统一退出码的原程序不被强改成退出码 2 才能使用。无依据参数变化明确 skipped。
- [x] 新案例通过 existing validation cases/args/cwd/expectedFiles 表达，不建立变形测试 DSL。检查来源与范围写入现有报告。
- [x] 运行 `bun test ./test/jit-optimize/validation-completion.test.ts ./test/jit-optimize/package-validation.test.ts ./test/jit-optimize/validation-lifecycle.test.ts`（44/44，171 assertions）。

**验收：** 已检出一条写死路径反例，并以同一输入的成对参数案例证明参数变化被记录而不重复生成；单值参数不猜测。参数“未生效”语义反例尚未由本阶段独立生成，故该边界保持 partial，不将 F5 误报为全项完成。机器证据见 `results/skill-ir/general-generation-reinforcement-20260914/f5/verification.json`。

## F6 — 新包让常规工作有明确入口

- [x] 消除 optimizer Method 的矛盾指令：可提出来源支持、范围明确的候选；已知会损害原职责的变更不得推荐，不确定但可测试的局部变更先验证。保留实际回归检查，不能以抽象的“也许回归”直接否决全部程序机会，也不把潜在风险全部忽略。
- [x] 复用已有 `reuse-script/generate-script/restructure-docs`。当源程序已经覆盖职责，优先复用；必要修改在同一动作注明。原程序已足够且无改进依据时合法 no-change。
- [x] 模型生成的常用命令从实际 action/参数绑定形成，文档给出任务参数如何填；不把捕获目录、研究路径和一月/某法律名称写进通用默认值。
- [x] 在现有 package 使用指南中展示实际验证范围、缺条件及 residual duties。普通程序可以输出文本、文件或 JSON；新增 helper 鼓励短摘要，但不以统一 stdout 格式为可用前提。
- [x] 防止“用一个新脚本包装原脚本却增加一步”“只改名字增加缓存和包体”被无依据称作优化。记录预计接管的操作，实际效果留 F10。
- [x] 测试带位置参数的旧程序、无 help 的程序、可选依赖、部分不适用及 docs-only 包。保留旧包读取兼容，不回写历史 manifest。
- [x] 运行 `bun test ./test/jit-optimize/implementations.test.ts ./test/jit-optimize/optimizer-prompt.test.ts ./test/jit-optimize/package.test.ts`（53/53，218 assertions）。

**验收：** 已由实际 validation 参数生成可复制命令模板，并在使用指南中保留参数来源、验证范围和 residual duties；实现选择仍由动作与可见文件决定，不按 skill 名称路由。机器证据见 `results/skill-ir/general-generation-reinforcement-20260914/f6/verification.json`。

### F6.1 — 用轻量流程骨架承接真正的执行工作

- [x] 先检查现有 source 程序能否直接复用；不为已有完备入口套额外一层。没有合适入口时，依据 F1.1 共有模式实现一个小型 `src/jit-optimize/workflow-scaffold.ts`，配套 `test/jit-optimize/workflow-scaffold.test.ts`。它负责普通脚本的参数入口、输入遍历、错误处理和产物交接，不实现所有领域算法。
- [x] 首版只支持两个可组合的机械骨架：单输入读入→调用来源支持的处理→写出产物；多输入逐项处理→汇总状态/产物。具体转换函数由原脚本复用或模型实现，使用普通 Python/Node 文件及现有 action；不增加自定义 workflow DSL、调度服务或第二运行时。
- [x] 骨架由引擎物化为候选资源，通过已有 workspace/optimizer 接口被选用。统计哪些文件来自框架、哪些由模型新增/修改、哪些来自 source；框架骨架不能计为模型独立生成业务算法。
- [x] 明确每步读什么、输出什么、依赖谁，以及需要语义判断的暂停/交接位置。未固化步骤由原 agent 流程接续；不能用“默认通过”跳过分类、翻译或专业判断，也不能默默增加新的模型/API调用。
- [x] 不强制事务、缓存、并发、配置系统或统一 stdout；只保留当前流程需要的参数、必要错误信息和输出定位。写入采用可验证的局部策略，避免先写一半再谎称成功；输入原件保护沿用已有规则。
- [x] 红例：只生成检查结果但未产出目标文件不能计执行型流程；两个相邻步骤之间传错路径必须检出；某输入不适用时其他独立输入仍可处理；相同输入不因原观察目录存在而侥幸通过。
- [x] 在两种结构的确定性集成案例上复用同一骨架选择/物化代码；真实模型在 F9 中决定和实现处理逻辑，不由开发者提前写好成品。测调用步骤和结果，不把生成代码行数当优化量。
- [x] 运行 `bun test ./test/jit-optimize/workflow-scaffold.test.ts ./test/jit-optimize/implementations.test.ts ./test/jit-optimize/continuous-production-closure.test.ts`（17/17，96 assertions）。

**验收：** 已交付单输入与多输入的共同物化器、步骤依赖/贡献清单、产物存在性检查和不适用隔离；它是来源处理器的执行 plumbing，不是领域算法或真实模型正例。机器证据见 `results/skill-ir/general-generation-reinforcement-20260914/f6.1/verification.json`。

## F7 — 真实消费观察摆脱 API 特例

- [ ] 红例：echo/cat 命令提到 helper 不算执行；普通脚本退出 0 但无 `ok=true`，仍应记录正常退出；调用失败后调用成功两者保留；同名不同目录不能混用。
- [ ] 从 package/action 获取入口集合；没有声明入口时不默认 `api-task-solidify.js`。复用 AgentStep 和已存在 Pi 事件归一化，支持 bare-agent 的同类事件。
- [ ] 对结构化 exec argv 使用解析后的程序/脚本路径匹配；shell 字符串只识别支持的明确调用，模糊情况标未知而不拿子串证明。保留实际 tool-call ID。
- [ ] 分开 invocation、exit status、output assertion、task quality 和 residual completion。退出 0 不必有固定 JSON，仍不等于质量通过；未知退出不能直接标失败。
- [ ] 基于现有事件统计实际读取、help、入口发现、程序重写/执行；仅“重复读取次数”是观测，是否多余需要相同任务语境判断，不把必要检查罚成浪费。
- [ ] 运行 `bun test ./test/jit-optimize/consumption.test.ts ./test/jit-optimize/general-skill-development.test.ts ./test/jit-optimize/effect.test.ts`。

**验收：** 非 API、普通文本输出程序能被准确观察；无法证明的调用不编造成功，也不阻止用户继续完成任务。

## F8 — 默认入口连续集成

- [ ] 扩展 `continuous-production-closure.test.ts`：自然任务与真实临时文件输入，只替换付费 provider，真实执行 capture、操作索引、候选程序、自动验证补全、一次 metadata repair、导出和消费分析。
- [ ] 案例一首轮不提供 validation，但有完整来源，F3 自动接线；案例二缺一项只能由模型决定的参数，F4 仅一次补全；案例三无规则，保持行为未知而不伪造 oracle。
- [ ] 同包放在新路径、换 cwd 与输入后执行，覆盖 F5；不使用 H8/H9/C8 旧包代替本次产物。
- [ ] CLI 分别表达 source timeout、capture 缺失、no-change、接线未完成、程序失败、已执行与局部验证范围。若普通非 optimize 路径仍把非 ok source 当成功退出，用实际子进程红例修复，不能只修显示颜色。
- [ ] 保留原任务结果与失败尝试；包恢复不得重放原任务；不为了本轮增加新的公共参数或 UI。
- [ ] 运行 `bun test ./test/run/optimization-handoff.test.ts ./test/cli/run-optimize.test.ts ./test/cli/run-failure-exit.test.ts ./test/jit-optimize/continuous-production-closure.test.ts`。

**验收：** 生产入口实际调用新增模块；组件单测或模拟 provider 不计真实模型优化成功。

## F9 — 不同结构的真实普通使用

- [ ] 从已公开 development 语料选择两种结构，依据是操作/参数/输入形态不同，例如已有程序的数据处理与多文件结构检查。先写选择理由与任务目标，不以运行结果挑成功样本。
- [ ] CSV 当前试用可作为一个案例，但不是必选成功对象；其原始分析程序不得先被开发者手改。另一个案例从已有语料选，确缺结构时才获取少量公开 skill 正文与直接依赖。
- [ ] 用户任务不提供 helper 名称、action、验证 JSON 或研究评分路径。研究用外部评价可以单独准备，不能偷偷回灌优化器并声称自动发现。
- [ ] 每个原始 skill 用普通 `run --prompt --skill --workdir --model --optimize` 完成一次 capture→生成。任务超时参数按真实工作量明确设置；预先检查已知本地依赖一次，不做付费 preflight。
- [ ] 由 `RUN_FLAGS` 实际参数和执行时模型配置生成 `commands.json`，保存精确命令参数数组；不要在报告留待手填命令。原/新目录由启动器或 runner 自动创建，用户不手接 trace。
- [ ] 使用同一新包在原任务和一个参数/语义变化任务自然消费。实例不能通过手写成品、换旧包或提示“必须调用某 helper”补成功。
- [ ] 失败归因到来源/原运行/机会识别/生成/接线/行为/消费/效果。共享代码根因修复后追加尝试；合理 no-change 保留，不为凑样本一直换模型。

**验收：** 每次结果有清楚来源与实际产物；至少一个本次程序经过默认内部行为验证且自然调用。只有一个结构成功就只报告该结构已走通。

### F9.1 — 同一包的跨模型与跨环境使用

- [ ] 分清优化模型、消费模型和程序运行环境三个变量。本轮先固定优化得到的同一最终包，改变消费模型/环境；不为每个模型重新生成专属包再称迁移稳定。
- [ ] 从现有可用配置选两个实际不同的消费模型并记录解析后的身份；仅换 provider 路由而实际模型相同不计跨模型。沿用已有获授权付费路由；不可用则记 unavailable，不无限换到通过。
- [ ] 对一个已完成执行型链的包，比较两个模型 × 原任务/变化任务 × source/optimized，最多八个消费单元，复用 F9/F10 已有且可比的单元，不重复运行凑矩阵。每个模型内部配对使用同任务、输入和环境，记录先后与缓存条件。
- [ ] 分别看程序调用率、参数使用、程序执行结果、残余职责、整体任务质量和成本。source 本来就通过的任务不凭一次优化包通过声称稳定性提高。初次小矩阵只给兼容性和配对观察，不推导总体故障概率下降。
- [ ] 环境比较先离线直接运行同一包：当前工作环境与新的隔离依赖环境，改变安装位置、cwd 和输入路径。按包声明准备实际依赖，禁用对源码仓库/宿主缓存的隐藏依赖；保存版本与命令，不制造庞大归档链。
- [ ] 缺可选依赖只影响相应步骤；缺必要运行时/依赖给清楚诊断与 fallback。只换 cwd 不叫跨操作系统；同宿主 venv/干净目录只证明相应隔离范围。已有另一 OS/runtime 可用时做一次相关检查，不为完整平台矩阵大规模安装环境。
- [ ] 迁移失败先分包可移植性、模型发现/传参、残余语义质量、基础设施。修共享机制后得到新包，旧矩阵保留；只复测受影响单元，新包未测部分不能继承旧包通过。

**验收：** 报告 `modelConsumption`、`environmentPortability` 和 `optimizerGeneration` 三个范围；实际未测或不稳定如实保留。跨环境的程序通过不替代跨模型自然消费，跨模型调用通过也不替代整个任务质量。

## F10 — 用效果反馈修共享机制

- [ ] 沿用 `analyzeMatchedConsumptionPairs` 和 F7 事件分析。原/新包对比使用相同输入、任务、模型与运行时；变化任务的原/新另成一对，不拿不同输入互相比。
- [ ] 首次比较前选一个直接机械指标：临时代码重复编写、重复文件读取、入口发现或工具调用。完整记录 input/output/cache、耗时、实际/未知美元、优化开销；避免 cache token 重复相加后称成本。
- [ ] 优先复用已完成的合格运行和观察。新增运行只用于缺失的一侧或明确变化检查；缓存条件、重试和服务耗时噪声写明。单次速度差不等于稳定提速。
- [ ] 新包没被调用：检查入口可发现性与参数说明；被调用仍重复写程序：检查接管职责是否错位；输出太大：检查结果摘要；检查变多：区分必要质量成本与重复检查。对应修共享模块/生成策略，模型重新产出修订包。
- [ ] 由消费者产生的文本不能直接改检查标准或全局规则；从实际事件形成来源明确的建议，下一候选才应用。避免自动改写正在使用的包。
- [ ] 没有重要质量回退且某项机械工作减少，可报告局部改善；其他指标上升时仍报告 mixed。修订后没有可比复测就不把旧效果转给新版本。
- [ ] 如果尚有明确共享缺陷，继续实施再验证；没有新根因则停止抽样并写 no-benefit/unknown，不用大规模实验掩盖生产问题。

**验收：** 交付能解释的真实变化，包含优化成本与剩余任务，不承诺大多数 skill 或稳定美元节省。

## F11 — 有限回归和交付

- [ ] 执行一次覆盖本次模块的合并回归：

```powershell
bun test ./test/run ./src/run/index.test.ts ./test/cli/run.test.ts ./test/cli/run-optimize.test.ts ./test/cli/run-failure-exit.test.ts ./test/jit-optimize ./test/proposals/storage.test.ts
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
```

- [ ] 若出现失败，针对具体根因修复并重跑受影响套件；没有新变更不反复跑全量。最终命令、退出码与实际计数记录到 verification，不预填通过数。
- [ ] 同一个最终包一次异目录复制运行即可验证当前可移植性；不重做历史 clean archive、旧 lock 或 Git 对象恢复。
- [ ] `final-report.json` 列工程改动、每次生成/验证/消费/效果、原失败、包路径、最短命令和限制。新状态采用本轮局部字段，不改研究 readiness。
- [ ] 同步当前 status、spec 14.33、plan、`optimization-and-artifacts.md` 与 usage 中本次新增职责；不另建每阶段组件文档，不累加历史样本当当前结果。
- [ ] 按明确文件名单提交并推 origin/skill-ir-aot，核对一次对齐；外部试用目录如有改动单独列出。保留其他线程文件和旧证据。
- [ ] 按第 2.2 节报告真实完成程度。未达最低条件不得只因为 F0–F11 均有终态就把完整目标标完成。

## 4. 可复制的持续执行指令

执行 `D:\skill优化\SkVM\docs\superpowers\plans\2026-09-14-general-generation-reinforcement.md` revision 2 的 F0–F11（含 F1.1、F6.1、F9.1），并设为持续目标。目标是补牢已有通用生成流程，不是继续压缩 SKILL.md 或手工打磨个别包。直接在 skill-ir-aot 连续开发，仅推用户 origin，不新开分支。以 skill 正文和真实 trace 的结构对照指导共享实现，补操作/参数来源、验证骨架、一次缺口修复、参数变化和普通程序消费观察；消除候选提示矛盾，交付真正处理产物的轻量流程骨架，不能只交 checker。不同结构真实 skill 通过默认入口生成和消费同一新包，并做有界的跨模型/环境比较。用户只给 skill、自然任务、工作目录与模型，系统处理 trace 和接线。遵循任务书的最小守护、付费授权、一次修复与失败处理规则；常规检查点继续，不读受保护输入，不新增冻结/哈希协议，不靠旧包、模拟成功或测试数量替代真实程序链。发现共享根因继续修生产代码，不针对 skill 名称加成功分支。按范围报告程序可移植性、模型消费、实际机械工作和完整成本；mixed/unknown 如实保留，没有新根因不反复抽样求正数。按第 2.2 节判断完成，未达标保留 partial 和恢复入口；不等待、重复测试或联网凑时长。最后有限验证、同步必要文档、提交推送并准确交付。
