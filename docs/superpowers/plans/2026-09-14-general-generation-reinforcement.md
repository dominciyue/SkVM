# 通用生成流程补牢：持续开发任务书

> **For agentic workers:** 使用 superpowers:executing-plans 连续执行。主代理负责方案、代码和最终验证；按有效 AGENTS 使用窄范围只读子代理。每项实现先写能复现缺陷的测试、确认失败，再修改生产代码；常规检查点不等待确认。

**Goal:** 在已有 trace → optimizer → 局部程序 → validation/repair → package 链上，减少对模型一次性正确接线的依赖，使不同结构的 skill 都能通过普通入口获得有来源的优化机会、可参数化程序、实际局部验证和清楚的使用交接；用同一新包的自然消费判断实际改善。

**Architecture:** 保留现有 Evidence、IMPLEMENTATION_CONTEXT、actions、implementation selection、validation lifecycle、一次局部 repair、exporter 和 consumption/effect。引擎补可确定的索引、资源映射、验证骨架和执行观察；模型承担语义选择、程序生成及必要的缺口修复。不另建编译器、通用 DSL、评分平台或独立优化服务。

**Tech Stack:** TypeScript/Bun、现有 bare-agent/provider、Python/Node 本地程序、已有来源检查与程序验证器。

**状态：** revision 2，in-progress。2026-09-15 撤回过早的完整完成结论：F10 共享消费反馈已实施，但模型修订包尚未生成。恢复计划：模型产出后继包、验证受影响消费、逐项核对证据、更新 F11 交付并推送。旧八单元 effect=negative，只属于旧包。初版基线 `15b5d51`，审查基线 `1fe064a`，分支 `skill-ir-aot`；原技能、历史证据和其他线程改动保留。

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
- 2026-09-15 用户补充：门禁只保留基础安全和实质语义风险。无下游消费影响的字段顺序、排版、报告附加说明及空值表示不作为拒绝理由；不得把一次任务的严格 ABI 泛化为所有 skill 的要求。修改过严评价时同时检查原/新条件，单列新口径结果，保留旧记录，不重跑付费任务。哈希用于避免错用输入/旧验证和识别包，不新增逐层审批或业务字节等价要求。
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

- [x] 核对 HEAD、工作树和模型配置来源，只登记路由名及运行时，不输出密钥。登记本轮归属文件和结果 status。
- [x] 在 C8 命名记录中核实 missing-validation 的动作与现有 repair 结果；CSV 失败只读诊断与对应 session。生成短 `baseline.json`，记录每个问题是已修、当前可复现或尚待核实。
- [x] 核实 `optimizer.ts` Method 中允许 passing-task 候选与后文 No-trade-off 的 yes/maybe stop 是否冲突；这是当前代码事实，不直接宣称造成某次历史 no-change。F6 修改应以行为试验判断，不能只增加正向提示字符串。
- [x] 执行一次 `bun test ./test/cli/run-failure-exit.test.ts ./test/jit-optimize/production-closure.test.ts`。Bun 不在 PATH 时使用已安装可执行文件并为子进程补 PATH，不把环境找不到命令当逻辑失败。
- [x] 输出 `status.json` 的 `currentStage/currentAction/attempts/nextAction/costs`。以实际完成条件推进，不维护第二套冻结锁。

**验收：** 本轮从已有默认验证链出发；没有把已实现的 C1–C7 再次列为从零建设。

## F1 — 从真实执行整理可复用操作线索

- [x] 红例：trace 包含读输入、执行既有脚本、写结果；相邻自然语言提到另一个脚本。只记录实际工具操作，引用具体 tool-call ID，不能把文字当执行。
- [x] 新模块 `operation-context.ts` 读取已有标准化 AgentStep/Evidence，不读取宿主任意目录，不复制 provider 解析。记录 operation 的真实入口、原始 argv/cwd、读写文件、退出状态、可用时耗时及其来源。
- [x] 严格 argv 与 shell 字符串分开；只解析已支持且无歧义的命令结构。动态拼接、多重 shell、无法解析部分保留原文定位与 unknown，不猜参数。
- [x] 接入现有 `IMPLEMENTATION_CONTEXT.json`，为模型提供少量相关操作摘要和完整记录 locator；不把整份长 trace 再注入一次。旧 trace 缺字段继续可优化。
- [x] 相同脚本多次调用、临时脚本被写出后执行、已有程序未被调用分别记录为事实；“是否值得固化”仍由模型结合任务语义判断。一次出现也可成为候选，不增加重复次数门槛。
- [x] 运行 `bun test ./test/jit-optimize/operation-context.test.ts ./test/jit-optimize/workspace.test.ts ./test/jit-optimize/trace-adapters.test.ts`，提交该独立增量。

**验收：** 引擎能指出做过什么以及证据在哪里；不会仅因 skill 名称推导机会，也不会自动认定临时代码可泛化。

### F1.1 — 把 skill 深读变成共享实现输入

- [x] 从已有 30 个广读/10 个深读记录选 4–6 个结构差异明确的成员，覆盖已有脚本、没有脚本但有固定步骤、多文件条件分支、主要语义判断四种情况。10 是子集，不当作新增样本；已读不等于已运行。
- [x] 每个选中成员读完与目标职责相关的 SKILL 正文、直接脚本/资源及可用真实 trace。形成一份 `pattern-to-code.json`：source/trace 定位、固定步骤、变量、环境依赖、必须由 agent 判断的分支、当前引擎支持、缺口、对应生产符号与回归测试。
- [x] 区分“指令要求这么做”和“trace 实际这么做”。没有真实 trace 的成员可以帮助理解结构，不能计执行或效果证据。正文中的安装/联网要求不是自动执行授权。
- [x] 从对比中提炼跨成员共用的机制；至少选一个两种结构共同暴露的问题进入 F2–F8 的实际代码与回归。已覆盖的模式只补关联，不重复开发。无可复用实现的语义职责明确保留。
- [x] 若现有语料缺一个明确模式，再定向获取 2–4 个公开来源正文及直接依赖；使用认证 gh 和缓存，不恢复大规模搜索抓取队列。读取数量不是验收目标。

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
- [x] 红例包括：忽略声明参数、错用原 cwd、把缺失可选字段当致命错误、缺必要输入仍写成功结果、固定业务常量被错误替换。保留正确且来源要求的拒绝。F9 回查及 2026-09-15 补测完成余项，均沿用共享验证器和来源已有断言。
- [x] 不适用时先解释/返回给 agent，支持动作继续；未声明统一退出码的原程序不被强改成退出码 2 才能使用。无依据参数变化明确 skipped。
- [x] 新案例通过 existing validation cases/args/cwd/expectedFiles 表达，不建立变形测试 DSL。检查来源与范围写入现有报告。
- [x] 运行 `bun test ./test/jit-optimize/validation-completion.test.ts ./test/jit-optimize/package-validation.test.ts ./test/jit-optimize/validation-lifecycle.test.ts`（44/44，171 assertions）。

**验收：** 写死路径、cwd、参数未生效、可选字段、必要输入和固定常量均有可运行反例。只验证来源给出的关系，不从单值猜测任意新业务值。初期证据见 `f5/verification.json`，补测见 `f9/semantic-guardrails-verification.json`。

F9 回查补修：新程序的显式 validation argv 也可作为路径/cwd 变化绑定，不要求该新入口已在原 trace 中执行；来源记录为 `validation-case:<id>#args`，不伪造 tool call。业务参数仍只采用已有可检查案例，不猜新值。根目录输出迁移时保留其原本存在的父目录条件，不额外要求源程序创建目录。新增声明 `--field` 未生效反例通过既有 task assertions 检出；缺必要列/不支持格式/部分写出拒绝继续保留，未覆盖的可选值与固定常量边界不虚报完成。

2026-09-15 补齐 F5 剩余边界：同一个来源要求下，正确程序接受缺失可选 note 并保留固定 USD；错误地要求 note、把 USD 替换成任务 currency 的两个反例由共享 lifecycle 检出。该测试沿用 task assertion，不新增格式/字段门禁。只证明已提供关系的验证能力，不声称从单值自动推导任意关系。

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

F9 回查补修：此前仅从已执行脚本推导骨架，未覆盖 agent 直接读写文件。当前共享实现提供明确未实现的 model processor 候选，不因存在无关 source 脚本而抑制；候选按单份 evidence 推导，不能拼接不同运行的读写。优化提示要求模型选择有来源的机械职责、实现处理器、修正移出 `.optimize` 后的根路径并申报真实动作与验证；框架候选不计领域实现，文档或 checker 不计产物流。工作区 README 的旧 blanket veto 同步删除。恢复验证见 `f9/shared-generation-repair-verification.json`，后续复用 F9.3 原 capture 的命名尝试，不重放 source。

## F7 — 真实消费观察摆脱 API 特例

- [x] 红例：echo/cat 命令提到 helper 不算执行；普通脚本退出 0 但无 `ok=true`，仍应记录正常退出；调用失败后调用成功两者保留；同名不同目录不能混用。
- [x] 从 package/action 获取入口集合；没有声明入口时不默认 `api-task-solidify.js`。复用 AgentStep 和已存在 Pi 事件归一化，支持 bare-agent 的同类事件。
- [x] 对结构化 exec argv 使用解析后的程序/脚本路径匹配；shell 字符串只识别支持的明确调用，模糊情况标未知而不拿子串证明。保留实际 tool-call ID。
- [x] 分开 invocation、exit status、output assertion、task quality 和 residual completion。退出 0 不必有固定 JSON，仍不等于质量通过；未知退出不能直接标失败。
- [x] 基于现有事件统计实际读取、help、入口发现、程序重写/执行；仅“重复读取次数”是观测，是否多余需要相同任务语境判断，不把必要检查罚成浪费。
- [x] 运行 `bun test ./test/jit-optimize/consumption.test.ts ./test/jit-optimize/general-skill-development.test.ts ./test/jit-optimize/effect.test.ts`（22/22，70 assertions）。

**验收：** 消费分析现在只按声明入口和精确 argv/路径匹配普通程序；echo/cat、同名异目录和模糊 shell 保持未证实。调用、退出、输出断言、任务质量与 residual completion 分字段报告，unknown exit 不直接变成失败。机器证据见 `results/skill-ir/general-generation-reinforcement-20260914/f7/verification.json`。

## F8 — 默认入口连续集成

- [x] 扩展 `continuous-production-closure.test.ts`：自然任务与真实临时文件输入，只替换付费 provider，真实执行 capture、操作索引、候选程序、自动验证补全、一次 metadata repair、导出和消费分析。
- [x] 案例一首轮不提供 validation，但有完整来源，F3 自动接线；案例二缺一项只能由模型决定的参数，F4 仅一次补全；案例三无规则，保持行为未知而不伪造 oracle。
- [x] 同包放在新路径、换 cwd 与输入后执行，覆盖 F5；不使用 H8/H9/C8 旧包代替本次产物。
- [x] CLI 分别表达 source timeout、capture 缺失、no-change、接线未完成、程序失败、已执行与局部验证范围。若普通非 optimize 路径仍把非 ok source 当成功退出，用实际子进程红例修复，不能只修显示颜色。
- [x] 保留原任务结果与失败尝试；包恢复不得重放原任务；不为了本轮增加新的公共参数或 UI。
- [x] 运行 `bun test ./test/run/optimization-handoff.test.ts ./test/cli/run-optimize.test.ts ./test/cli/run-failure-exit.test.ts ./test/jit-optimize/continuous-production-closure.test.ts`（26/26，137 assertions）。

**验收：** 生产入口实际调用新增模块；组件单测或模拟 provider 不计真实模型优化成功。

## F9 — 不同结构的真实普通使用

恢复工作计划：核实并完成共享长 cwd 启动修复；先用失败测试补齐优化器超时事件/用量落盘，再复用 F9.3 原 capture 发起命名后继尝试。原任务不重放，失败包不手改；后继产物依次检查内部验证、产物流、同包自然消费及 F9.1/F10。F9.5 的运行时 ENOENT 已定位为 cwd 过长，旧“Node 缺失”解释不再作为根因。前次超时未保存的费用保持 unknown。

F9.7 返回文档包（actions=[]），保留为非程序结果。其“不存在现成程序/独立映射”理由促成共享提示修正：允许设计新接口且以来源保真先执行，不把接口设计当伪造观察，也不把保真升级成独立正确性。F9.8 据此复用原 capture；消费前回归另修绝对部署路径绑定和 plain exit-zero 消费判定，独立质量与残余职责条件保留。

F9.8 生成 checker，首轮因 baseline/output 混合来源报 `validation-input-source-mismatch`。共享物化器已支持全部显式的多来源 locator，保留命名空间，36/36 聚焦回归及类型检查通过；原提交离线复验 help/case 各 1 次通过但独立 case=0，不能计执行型流程完成。机会 schema 另增加 `artifact-production`，避免以检查器的 repeated-transformation implemented 掩盖产物职责。F9.9 在这两项共享修复后复用原 capture，仍不重放 source 或手改包；没有新根因不得继续抽样。

F9.9 已生成报告产出 finalizer，但 validation 的普通相对 argv 与强制 projection 布局冲突；自动一次 repair 错把问题修到业务程序的目录搜索，仍失败并回退，未导出包。共享物化现改为依据明确 argv 保留 projection，普通根接口仅在相对路径无冲突时合并；歧义同名合并拒绝。受影响回归 79/79、364 assertions，F9.10 据此复用 capture。F11 合并回归已运行一次 443/443、1506 assertions，后续只重测实际修改影响。

F9.10 为文档包，不追加抽样。F9.9 的首轮及完整模型 repair 从成功工具事件精确恢复并匹配当时候选摘要；修复后的共享验证器在完整 repair 版本上通过 help/case，独立 case=0，保留 draft。现有 exporter 导出 `f9/i18n-f9-recovered-package`，不能称为新一轮生成，也未手改程序。另补 optimizer candidate 快照保存防止回退清理丢字节，TDD 10/10。原技能 sol 原/变化消费已执行，严格检查为 4/5 与 5/5；原任务报告顺序失败，公开合同未要求排序，保留评价差异不改 oracle。同包消费及 gpt55 首次实际可用性检查进行中；同宿主最小环境隔离直接运行通过，不称跨 OS。

2026-09-15 后继：八个消费单元全部结束。按用户新确认的语义口径，报告 key 集合不要求排序，空缺口允许 null/空列表/空对象，不因附加说明拒绝；原始质量报告不改写。离线同口径复评 source/optimized 各 4/4，优化包四次任务调用均 exit-zero，代码未被消费者重写。共享 JSON 保真不再按排版/对象键序拒绝，执行过的保真/自检通过不再汇总为 not-run，独立案例数继续独立记录且导出仍为 draft。原包内容不改，当前共享离线验证见 `f9/i18n-f9-9-semantic-revalidated/verification.json`。

F9.1/F10 的有限比较已完成，见 `f9/consumption-effect.json`：总体 effect=negative，input +107645、output +2002、cache-read +73216、工具调用 90→99、耗时 +804701ms；美元未知。程序只接管 key 提取、缺口整理和报告生成，不接管翻译/源码转换。真实 trace 定位的重复入口搜索和清单审阅已反馈共享 prompt/usage：入口相对 SKILL.md，不写观察部署前缀，不要求例行 hash/manifest 审计，不强制统一退出码。该后继指引尚无付费复测，不能继承旧矩阵的效果结论。按第 2.2 节，本轮模型程序、共享内部验证、同包原/变化自然消费均有证据；恢复过程明确记录，不额外增加“必须首次无需恢复”的完成门槛。无需扩建恢复接口或追加抽样。

**收尾清单说明：** F0/F1/F1.1 依据各阶段已有记录完成核对，未重做历史实验；条件性公开语料获取、CSV 必选和另一 OS 均不适用。F9 的第二结构 Law 未形成完整产物流，按 2.2.4 保留失败，不称跨结构可靠。F11 单次合并回归 443/443，后继受影响套件 101/101，typecheck、文档 12/12 通过；总报告为结果根 `final-report.json`。

- [x] 从已公开 development 语料选择两种结构，依据是操作/参数/输入形态不同，例如已有程序的数据处理与多文件结构检查。先写选择理由与任务目标，不以运行结果挑成功样本。
- [x] CSV 当前试用可作为一个案例，但不是必选成功对象；其原始分析程序不得先被开发者手改。另一个案例从已有语料选，确缺结构时才获取少量公开 skill 正文与直接依赖。
- [x] 用户任务不提供 helper 名称、action、验证 JSON 或研究评分路径。研究用外部评价可以单独准备，不能偷偷回灌优化器并声称自动发现。
- [x] 每个原始 skill 用普通 `run --prompt --skill --workdir --model --optimize` 完成一次 capture→生成。任务超时参数按真实工作量明确设置；预先检查已知本地依赖一次，不做付费 preflight。
- [x] 由 `RUN_FLAGS` 实际参数和执行时模型配置生成 `commands.json`，保存精确命令参数数组；不要在报告留待手填命令。原/新目录由启动器或 runner 自动创建，用户不手接 trace。
- [x] 使用同一新包在原任务和一个参数/语义变化任务自然消费。实例不能通过手写成品、换旧包或提示“必须调用某 helper”补成功。
- [x] 失败归因到来源/原运行/机会识别/生成/接线/行为/消费/效果。共享代码根因修复后追加尝试；合理 no-change 保留，不为凑样本一直换模型。

**验收：** 每次结果有清楚来源与实际产物；至少一个本次程序经过默认内部行为验证且自然调用。只有一个结构成功就只报告该结构已走通。

### F9.1 — 同一包的跨模型与跨环境使用

- [x] 分清优化模型、消费模型和程序运行环境三个变量。本轮先固定优化得到的同一最终包，改变消费模型/环境；不为每个模型重新生成专属包再称迁移稳定。
- [x] 从现有可用配置选两个实际不同的消费模型并记录解析后的身份；仅换 provider 路由而实际模型相同不计跨模型。沿用已有获授权付费路由；不可用则记 unavailable，不无限换到通过。
- [x] 对一个已完成执行型链的包，比较两个模型 × 原任务/变化任务 × source/optimized，最多八个消费单元，复用 F9/F10 已有且可比的单元，不重复运行凑矩阵。每个模型内部配对使用同任务、输入和环境，记录先后与缓存条件。
- [x] 分别看程序调用率、参数使用、程序执行结果、残余职责、整体任务质量和成本。source 本来就通过的任务不凭一次优化包通过声称稳定性提高。初次小矩阵只给兼容性和配对观察，不推导总体故障概率下降。
- [x] 环境比较先离线直接运行同一包：当前工作环境与新的隔离依赖环境，改变安装位置、cwd 和输入路径。按包声明准备实际依赖，禁用对源码仓库/宿主缓存的隐藏依赖；保存版本与命令，不制造庞大归档链。
- [x] 缺可选依赖只影响相应步骤；缺必要运行时/依赖给清楚诊断与 fallback。只换 cwd 不叫跨操作系统；同宿主 venv/干净目录只证明相应隔离范围。已有另一 OS/runtime 可用时做一次相关检查，不为完整平台矩阵大规模安装环境。
- [x] 迁移失败先分包可移植性、模型发现/传参、残余语义质量、基础设施。修共享机制后得到新包，旧矩阵保留；只复测受影响单元，新包未测部分不能继承旧包通过。

**验收：** 报告 `modelConsumption`、`environmentPortability` 和 `optimizerGeneration` 三个范围；实际未测或不稳定如实保留。跨环境的程序通过不替代跨模型自然消费，跨模型调用通过也不替代整个任务质量。

## F10 — 用效果反馈修共享机制

恢复执行记录：`f10-successor` 从原始 capture 重生成仍为文档包，不能替代反馈修订；其费用和原结果保留。随后用已消费 F9.9 包及两个真实消费日志进入同一 `jit-optimize`，模型产出 `f10-feedback-successor-2/package`，修改入口说明并复用原程序。三个预选受影响消费单元全部实际调用、结构质量通过，同宿主隔离通过；新效果仍 negative，source/optimized 工具调用 62/64、input 58828/190516。旧矩阵不转移到新包，gpt-5.5 变化任务未重测。

反馈还暴露 F1/F3 共享缺陷：Pi 操作名称未索引、部署根未匹配，以及整段 trace 的读写被错误归给单个程序。失败测试后修复，缺局部 IO 归属进入既有一次 metadata repair，不把缺口变成整个包的业务失败。原包和模型程序不手改；修复及费用记录在 `f10-validation-repair`，完成以实际报告为准。

- [x] 沿用 `analyzeMatchedConsumptionPairs` 和 F7 事件分析。原/新包对比使用相同输入、任务、模型与运行时；变化任务的原/新另成一对，不拿不同输入互相比。
- [x] 首次比较前选一个直接机械指标：临时代码重复编写、重复文件读取、入口发现或工具调用。完整记录 input/output/cache、耗时、实际/未知美元、优化开销；避免 cache token 重复相加后称成本。
- [x] 优先复用已完成的合格运行和观察。新增运行只用于缺失的一侧或明确变化检查；缓存条件、重试和服务耗时噪声写明。单次速度差不等于稳定提速。
- [ ] 新包没被调用：检查入口可发现性与参数说明；被调用仍重复写程序：检查接管职责是否错位；输出太大：检查结果摘要；检查变多：区分必要质量成本与重复检查。对应修共享模块/生成策略，模型重新产出修订包。
- [x] 由消费者产生的文本不能直接改检查标准或全局规则；从实际事件形成来源明确的建议，下一候选才应用。避免自动改写正在使用的包。
- [x] 没有重要质量回退且某项机械工作减少，可报告局部改善；其他指标上升时仍报告 mixed。修订后没有可比复测就不把旧效果转给新版本。
- [x] 如果尚有明确共享缺陷，继续实施再验证；没有新根因则停止抽样并写 no-benefit/unknown，不用大规模实验掩盖生产问题。

**验收：** 交付能解释的真实变化，包含优化成本与剩余任务，不承诺大多数 skill 或稳定美元节省。

## F11 — 有限回归和交付

- [x] 执行一次覆盖本次模块的合并回归：

```powershell
bun test ./test/run ./src/run/index.test.ts ./test/cli/run.test.ts ./test/cli/run-optimize.test.ts ./test/cli/run-failure-exit.test.ts ./test/jit-optimize ./test/proposals/storage.test.ts
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
```

- [x] 若出现失败，针对具体根因修复并重跑受影响套件；没有新变更不反复跑全量。最终命令、退出码与实际计数记录到 verification，不预填通过数。
- [x] 同一个最终包一次异目录复制运行即可验证当前可移植性；不重做历史 clean archive、旧 lock 或 Git 对象恢复。
- [x] `final-report.json` 列工程改动、每次生成/验证/消费/效果、原失败、包路径、最短命令和限制。新状态采用本轮局部字段，不改研究 readiness。
- [x] 同步当前 status、spec 14.33、plan、`optimization-and-artifacts.md` 与 usage 中本次新增职责；不另建每阶段组件文档，不累加历史样本当当前结果。
- [x] 按明确文件名单提交并推 origin/skill-ir-aot，核对一次对齐；外部试用目录如有改动单独列出。保留其他线程文件和旧证据。
- [x] 按第 2.2 节报告真实完成程度。未达最低条件不得只因为 F0–F11 均有终态就把完整目标标完成。

## 4. 可复制的持续执行指令

执行 `D:\skill优化\SkVM\docs\superpowers\plans\2026-09-14-general-generation-reinforcement.md` revision 2 的 F0–F11（含 F1.1、F6.1、F9.1），并设为持续目标。目标是补牢已有通用生成流程，不是继续压缩 SKILL.md 或手工打磨个别包。直接在 skill-ir-aot 连续开发，仅推用户 origin，不新开分支。以 skill 正文和真实 trace 的结构对照指导共享实现，补操作/参数来源、验证骨架、一次缺口修复、参数变化和普通程序消费观察；消除候选提示矛盾，交付真正处理产物的轻量流程骨架，不能只交 checker。不同结构真实 skill 通过默认入口生成和消费同一新包，并做有界的跨模型/环境比较。用户只给 skill、自然任务、工作目录与模型，系统处理 trace 和接线。遵循任务书的最小守护、付费授权、一次修复与失败处理规则；常规检查点继续，不读受保护输入，不新增冻结/哈希协议，不靠旧包、模拟成功或测试数量替代真实程序链。发现共享根因继续修生产代码，不针对 skill 名称加成功分支。按范围报告程序可移植性、模型消费、实际机械工作和完整成本；mixed/unknown 如实保留，没有新根因不反复抽样求正数。按第 2.2 节判断完成，未达标保留 partial 和恢复入口；不等待、重复测试或联网凑时长。最后有限验证、同步必要文档、提交推送并准确交付。
