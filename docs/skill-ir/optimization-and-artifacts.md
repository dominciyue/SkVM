# Skill 优化、Final IR 与 Artifact Runtime

本文说明当前通用优化机制。历史 v1-v4 实验数值只在 `experiment-results.md` 保留。

## 1. 优化分层

```text
L0 raw skill
-> L1 source-audited Skill IR
-> L2 static lowering/controller/checker/adapter
-> L3 executable script/schema/template/tool-plan
-> L4 validated package + provenance + regression evidence
```

项目当前具备 L1/L2 通用能力，API Tester 与 Env Manager 两种 phenotype 均有 L4-oriented development
package；但只有 API Tester 是 `quality-positive`，Env Manager 目前只是 `fidelity-preserving`。尚未证明第二个
readiness 优化正例、held-out、untouched replication 或跨模型 L4。

## 2. 静态优化

静态阶段只使用 source closure、公开 task contract 与环境声明：

- rule normalization；
- environment guard；
- output/check/recovery lowering；
- controller、checker、adapter、skill view；
- declarative artifact catalog selection。

Profile-empty base IR 必须通过 source audit。静态阶段禁止使用 scorer expected、held-out、secret、raw model
output 或后验结果。

## 3. Typed Dynamic Feedback

Dynamic feedback 不是自由文本反思，而是版本化 `RepairEvidence`：

```text
targetRef
failureCode
sourceSystem
taskSplit
publicEvidenceRef
observations
proposedCheck / recovery / schema / template
confidence
```

### 3.0 单次外部 trace 的通用加载边界

G 路线允许把一条已暴露的真实非 API 执行记录作为 development 优化输入，但不会把 `runStatus=ok` 当作质量
通过。`execution-log` 输入可用 `recordLocators` 从多记录文件精确选择一条；记录身份由原文件 SHA-256 与适配器
记录定位共同确定，字节相同的文件副本不会被计成第二次独立运行，同一文件的不同定位仍保持独立。

优化工作区新增 `.optimize/SKILL_RESOURCE_INDEX.md`，列出显式配置 skill 副本的完整文件、字节数和摘要，并把
trace 声明的 `skillPath` 与本次配置路径并列。这样单次运行没有触发的脚本和规则仍可按需读取；“trace 未出现”
不等于可删除。缺少完整会话、工具调用、usage 或 quality 时继续标 unknown/unassessed，不从摘要补猜。

首条实际证据是 Law To Markdown 的一条历史 development `original` 成功运行，精确选择 `line:3`，只恢复 2 条
摘要级会话和 9 个 workdir 文件；完整会话与费用仍未知，也没有绑定独立评分。因此它只证明通用优化入口能分析
一条真实非 API 记录，不证明优化效果。机器绑定见
`results/skill-ir/general-skill-optimization-20260913/g2-trace-evidence.json`。

### 3.0.1 可实施动作合同

`OptimizeSubmission.actions` 是可选的依赖图，不替代 `opportunities` 或真实文件 diff。每个动作声明 kind、证据、
source refs、依赖、可变输入、输出、前置条件、实际涉及路径、残余职责和验证；当前支持复用已有脚本、可选领域
后端、生成脚本和纯文档重组四种意图。具体任务值应留在 evidence，动作输入只说明参数来源，避免把一次答案写死。

`validateOptimizationActions` 逐项解析，再检查重复 id、未知依赖和循环。出错动作及依赖它的动作被拒绝，互不依赖
的可靠动作、机会和诊断继续保留；缺字段不会因为整个 actions 字段可选而自动补空。`HistoryEntry`、工作区 history
和 proposal analysis 都保存有效动作与拒绝定位。动作的 `changedPaths` 仍是声明，是否实施只由真实工作区 diff 证明。
机器验证见 `results/skill-ir/general-skill-optimization-20260913/g3-action-plan-verification.json`。

### 3.0.2 通用实现选择与程序验证

G4 的 optimizer 合同允许从一次成功但未评分的运行中提出有依据的规则转换，同时要求把专业判断保留为
`residualDuties`，不得把 unknown score 改写成失败。缺陷、跨运行重复和约 50 行新增不再是普遍准入门；模型仍须说明
证据、适用范围、质量目标和真实文件集合。本轮唯一真实 Law To Markdown proposal 读取了完整资源索引和所需脚本，
但因为记录没有独立质量失败证据而返回 no-change。该结果证明 no-change 路径诚实，不构成优化效果正例。完整原始模型
事件以单成员 tar+gzip 归档，provider 实际费用仍为 unknown。

`selectOptimizationImplementation` 只按动作 kind、声明路径和可选领域后端选择实现，不读取 skill/repository 名称。
复用脚本和生成程序必须指向包内真实可执行文件；纯文档动作不要求 API binding；领域后端的 not-applicable 与执行失败
分开。输入、输出、前置条件、验证和残余职责从动作原样保留，未知参数不自动填充。

`validateOptimizationProgram` 在包路径边界内运行选中程序的帮助和显式案例，记录命令、退出码、stdout/stderr、输出文件
摘要和逐项诊断。它只执行调用方声明的领域断言，不承担领域正确性自证。本轮 G6 因原 skill 已含等价程序而复用
`scripts/law_to_markdown.py`；初次系统 Python 缺 `python-docx` 的环境失败被保留，随后在 Python 3.10.11 与固定直接依赖
环境中验证帮助、原/变化输入、任务合法的空输入拒绝和缺资源错误。独立检查另行比较输入/Markdown 字符流及变化标记，
避免由转换器自证。机器报告位于
`results/skill-ir/general-skill-optimization-20260913/g6-program-validation/report.json`。

### 3.0.3 C7 连续生产闭环（development）

本轮 C7 的确定性集成测试以普通自然任务目录和原始 skill 临时副本为输入，调用现有 run/session、Evidence/workspace、优化候选、独立验证、metadata-only repair、最终 snapshot 与包导出路径；同一导出包随后在原输入和语义变化输入中消费。测试还独立注入历史包替换、空 actions 文档包和未调用声明 helper 的反例，分别保持连续性、可执行程序存在性和 helper 消费结论的边界。

该测试使用进程内 provider/optimizer 替身，只证明生产对象之间的接线和失败隔离，不计真实模型成功、自然语言质量、效果、readiness 或人工节省。机器证据见 `results/skill-ir/skill-optimization-end-to-end-repair-20260914/c7/verification.json`；C8/C9 随后通过普通 `run --prompt --skill --workdir --model --optimize` 入口验证了真实源 skill 与同一新包的自然消费。

### 3.0.4 C8/C9 真实默认入口与同包消费（development）

C8 对 Law To Markdown 与 I18n Helper 的原始 source skill 各执行已暴露 development 输入的普通入口尝试，共 5 次 source capture/proposal。Law single 保留现成脚本复用候选；两个 I18n 贡献任务为 no-change，I18n basic 为文档候选；Law batch proposal `20260914T011753250Z` 由本轮优化器实际生成非 API `scripts/contract_checker.py`。该程序只接管公开契约的机械边界（受保护输入存在、审核证据结构、产物一致性、字符流、列举项换行和 exact output set），分类、输入前后摘要和语义质量仍由 agent 承担。包闭包通过但内部行为状态诚实保持 `not-run`/`draft`，不以包清单替代独立行为证据。C8 机器报告为 `results/skill-ir/skill-optimization-end-to-end-repair-20260914/c8/report.json`。

C9 使用精确同一 Law batch package，在固定 Python 3.12.13 与归档依赖锁的 clean 环境中运行原任务和修改条款/新增条款的语义变化任务。普通 agent 的 prompt 没有泄露 helper 路径；execution log 显示 optimized 两组各实际调用 `contract_checker.py` 两次并以 exit 0 返回。独立 checker 对四个 primary roots 的 16 次检查为 15 pass、1 fail；唯一失败是 source variation 报告把 deliverable 写成了错误的带目录前缀路径，属于被检出的 baseline 绑定缺陷，optimized variation 通过并保留语义变更。早期无 `python-docx` 的 clean 缺依赖尝试原样保留，不能被手工补写产物冒充程序成功。耗时、token 和 tool-call 成对指标为 mixed，provider USD unknown；结果不构成总体优化收益、人工节省或 readiness。C9 机器报告为 `results/skill-ir/skill-optimization-end-to-end-repair-20260914/c9/verification.json`。

无人工评分文件时，`runOptimizationValidationLifecycle` 仍可在隔离候选根执行有界检查：它从绑定 task source 重读 contained `file-check`，并从原始 source skill 的 `skvm-skill-validation/v1` `.skvm-validation.json` 派生 `source-derived` 断言。source manifest 只从 `sourceSkillDir` 读取，候选副本不能把自写规则提升为权威；source/task assertion、self-check、保真引用和模型评价在报告中分开。空程序、仅 help/exit 0/stdout “PASS” 或错误文件会被当前断言拒绝，缺输入只使关联动作 unresolved/unassessed，独立动作仍可运行。该来源检查只覆盖声明的局部文件不变量，不能代表整个 skill 或专业质量。C6 机器证据为 `results/skill-ir/skill-optimization-end-to-end-repair-20260914/c6/verification.json`。

### 3.0.5 F1 实际操作来源索引（development）

revision-2 F1 新增 `src/jit-optimize/operation-context.ts`，从标准化 `AgentStep[]` 或 `Evidence.conversationLog` 中整理实际 tool-call。它只保留真实的 `toolCallId`、调用定位、原始命令/路径、可无歧义解析的 argv、cwd、读写文件、退出状态和工具报告耗时；正文提及的脚本不会成为操作。嵌套 shell、管道、重定向、动态命令和缺少必要入口保留为 `unknown`，并携带完整 source locator。可选的 source-entry 集合只用于报告未调用事实，不用于访问宿主文件或推导成功。

`serializeContext` 将每条 evidence 的 `operations` 与 `operationSummary` 写入 `IMPLEMENTATION_CONTEXT.json`，同时声明操作记录仅来自实际调用。summary 分开记录观察数、未知数、重复入口、先写后执行和 source entry 未调用；`existing-entry`、`written-entry` 与 `unknown` 关系不等同于可泛化机会，仍由 optimizer 结合语义判断。验证入口为 `bun test ./test/jit-optimize/operation-context.test.ts ./test/jit-optimize/workspace.test.ts ./test/jit-optimize/trace-adapters.test.ts` 与 `bun run typecheck`。

F2 在同一操作记录上补充参数来源索引。`OperationParameter` 区分 `observed-value`、`task-variable`、`source-fixed` 和 `unknown`，同时保留 `argv`、`config-field`、`env`、`path` 绑定、`present` 状态、提示偏移、配置路径/字段及必要的 redaction。位置参数和无歧义 flag 来自实际 argv；配置字段只从 evidence 已绑定的 snapshot 或显式输入对象展开，环境变量只记名称而不复制值。显式来源规则优先于保守的字面 source-fixed 推断；未知或缺失可选值不被猜测为默认值。优化提示要求把替换绑定到精确 token/字段/路径，禁止把一次观察字符串全局替换到源文件的所有副本。F2 回归为 `bun test ./test/jit-optimize/operation-context.test.ts ./test/jit-optimize/implementations.test.ts ./test/jit-optimize/optimizer-prompt.test.ts`（46/46，176 assertions），机器证据为 `results/skill-ir/general-generation-reinforcement-20260914/f2/verification.json`。

F3 新增 `validation-completion.ts`，在 `deriveProgramValidationPlan` 前从实际操作、可读的 digest-bound 资源和已存在的 source/task checks 确定性补齐 validation suggestion。它只使用已确认的 executable entry、argv 尾部参数、观察到且实际快照存在的输入/输出路径，并在 provenance 中记录每个字段来源；输入资源按 workdir snapshot、pre-run snapshot、bound task fixtures 的顺序选择。缺输出、缺资源、未观察入口和歧义 shell 命令返回 unresolved，不生成语义 oracle；已有模型 suggestion 原样保留。补全后的 case 继续经过既有 `deriveProgramValidationPlan` 与 `validateOptimizationProgram`，reference-output、task/source assertion 和 self-check authority 不混淆。机器验证为 `results/skill-ir/general-generation-reinforcement-20260914/f3/verification.json`，聚焦套件 24/24、99 assertions。

F4 将这条 completion 结果接入既有的一次 repair budget：已有但为空的 `validation.cases` 只有在观察到明确 executable、输入/输出资源和来源检查时才标为 `repairable`，原 action 不被静默改写。反馈同时携带确定性候选 validation、缺字段、实际候选差异、原始意图和局部文件范围，并与真实程序失败合并；无资源、歧义操作、未执行和程序失败仍分别记录，不能把 `unvalidated` 统称为 rejected。修复后的 action 通过 `mergeRepairSubmission`、`executeActionIds`、`priorReport` 和 validation binding 重验；metadata-only 增量也会实际执行。若一次修复仍无依据，结果保留 draft/unvalidated，不伪造 rollback 或通过。机器验证为 `results/skill-ir/general-generation-reinforcement-20260914/f4/verification.json`；该阶段只使用确定性本地替身，不建立真实模型、整 skill、readiness 或 prospective 结论。

F5 在同一 validation case 接口上增加保守的变化审计。`deriveValidationVariations` 从 F2 的实际操作/参数绑定和来源约束派生普通 `path` 与 `cwd` cases：显式 argv 输入/输出路径被搬到 contained 的隔离目录，cwd 变化只进入新的嵌套执行根；源/task assertion、expected files 和依赖绑定随目标路径重写，原始 action schema 不被改写。参数值不由引擎猜测；只有同一 evidence 中已存在的不同 argv 值成对案例被记为 `covered`，单值或无可检查语义关系的参数记录 `skipped` 与 sourceRefs。`package-validation` 在 variation cwd 不可用时给稳定的环境诊断，固定路径程序在 relocated case 上会因缺少目标产物而失败。机器验证为 `results/skill-ir/general-generation-reinforcement-20260914/f5/verification.json`，所用命令通过 44/44 tests、171 assertions 与 typecheck；参数未生效的领域语义红例仍未被猜测为通过，保留为后续 F9/F10 的开放边界。

### 3.0.5 F6/F6.1 普通程序入口与执行骨架（development）

F6 将 optimizer Method 的 no-trade-off 语言与实际逐任务回归门对齐：通过任务不是无条件否决，候选仍必须有来源、精确接口、明确范围和可验证的非回退行为；真实回归由选择门最终拒绝。实现选择继续按 action kind、声明路径和可见文件路由，保留 `reuse-script`、`generate-script`、`restructure-docs` 与注册 `domain-backend` 的边界。对带 validation case 的可执行动作，`selectOptimizationImplementation` 从实际 argv 生成可复制的 `commandTemplate`，把输入、输出和其他 flag 转成占位符，并在 package user summary/guide 中列出参数来源；没有明确 case 时不猜任务值，只保留入口命令。旧 v1/v2 manifest reader 仍兼容且不回写历史文件。

F6.1 新增 `src/jit-optimize/workflow-scaffold.ts`，只提供普通 Node/Python 脚本的机械 plumbing：单输入读取→调用已声明 source processor→检查产物，或多输入逐项调用→汇总每项状态与输出 manifest。处理器通过 argv 直接启动，不经过 shell；输入原件不覆盖，已有输出/manifest 不覆盖，exit 2 表示该项不适用，缺产物或非零失败保持可定位诊断。`buildWorkflowScaffoldManifest` 明确步骤、依赖、framework/source/model 贡献和 residual duties；`serializeContext` 将从真实 observed operations 推导的候选物化到 `.optimize/workflow-scaffolds/`，但不读取或执行 source 来制造候选，也不把框架代码计为模型生成的领域算法。当前测试覆盖单/多输入、部分不适用、checker-only 无产物、共享物化器和 workspace 接线；真实模型决定的处理逻辑与跨结构自然消费仍留在 F9。机器证据分别见 `results/skill-ir/general-generation-reinforcement-20260914/f6/verification.json` 与 `f6.1/verification.json`。

### 3.0.5.1 F7 普通消费观察（development）

`analyzeSkillConsumption` 现在从 `AgentStep` 的结构化 `argv`、`program + args` 或保守解析的单一 shell 命令中识别入口。它只剥离已知 skill 根前缀并比较规范化完整路径；echo/cat 提及、同名异目录和带管道/重定向/嵌套 shell 的模糊字符串不会成为已执行证据，而会保留未知 tool-call ID。入口集合来自优化 package 的 selected implementations；未声明入口时集合为空，不隐含 `api-task-solidify.js`。

报告把 helper invocation、exit status（zero/non-zero/unknown）、output assertion（passed/failed/not-applicable/unknown）、task quality 和 residual completion 分开。exit 0 但没有结构化成功断言的普通脚本记录为正常退出/未断言，不冒充失败或质量通过；未知退出保留 unknown。另行统计 skill read、help、entrypoint discovery、program rewrite 和 program execution 的实际 tool-call ID，便于解释机械工作与残余职责。普通 source/optimized runner 继续只把独立任务检查传给 `taskOutcome`，不从最终文字自证。机器验证见 `results/skill-ir/general-generation-reinforcement-20260914/f7/verification.json`。

### 3.0.6 F1.1 语料到代码模式索引（development）

F1.1 将五个已暴露的深读成员映射为可审计的 `pattern-to-code.json`：zh-readme、i18n-helper、law-to-markdown、experimental-design 和 env-manager。每个成员分别记录源 `SKILL.md` 摘要与行定位、固定机械步骤、变量来源、环境依赖、分支判断、当前动作类型候选、生产符号/测试及仍不支持的缺口；不会把 skill 名、特定仓库路径或历史成功数量写成实现条件。

该索引把指令依据与实际 trace 分栏。Law、i18n、Experimental 和 Env 绑定了已有 development run 的摘要/事件定位；zh-readme 没有可绑定的执行 trace，因此明确标为 source-only。Experimental 的 `runStatus=ok` 与 `exitCode=3` 也保留为非通过边界。该文件只用于 F2–F9 的共享模式设计，不改变旧结果、readiness 或任何 prospective/held-out 输入。机器验证入口为 `results/skill-ir/general-generation-reinforcement-20260914/f1.1/verification.json`。

### 3.0.2.1 生产链接线边界（H0–H14 + R1–R7，completed-development）

普通 execution-log loop 已调用 program validator 和 action resolver，在选轮前完成局部验证、最多一次定向修复与依赖/共享文件回退。
本轮依据[生产链任务书](../superpowers/plans/2026-09-13-skill-optimization-production-closure.md)继续在真实日志路径核验程序生成、复用、条件变化及自然消费。
四个 G 包身份实际只改 SKILL.md；生成非 API 新程序、自然消费与变化输入检查是新任务，不能当作既有能力。
H0 已确认正常 CLI 的 execution-log 分支在 `runLoop` 中提前进入 `runLogOnly`：它调用一次 `runOptimizer`、保存
round-0/1。H2–H6 已把约束来源、pending 传播、真实验证计划、执行及一次 repair/rollback 接到 round-1 选择之前；
H7 exporter 从 final history 读取存活 action，归档选中轮报告，避免旧 submission 或旧 snapshot 的 passed 漂移进包。
H8 用同一普通入口从一条已暴露 I18n trace 生成参数化 nested-JSON key/placeholder checker。通用 lifecycle
把 optimizer workspace locator 映射回声明的 snapshot 路径，只有实际通过的外部 criterion 才能把 task-contract case
提升为 independent；文档路由仅随其声明依赖的验证闭包保留。原 trace 1/1、未回灌变化输入 4/4 与自然 Pi agent
read/exec 均有摘要绑定证据。消费分析器接受 exit-zero `ok=true`，但明确拒绝 `ok=false`；原错判报告保留，未重跑模型。
该结果只覆盖检查器的键和常见占位符规则，不覆盖翻译质量或整个 i18n 工作流。

R1–R6 已把普通 `run --prompt|--task --skill --model --optimize` 接到同一优化器。每次 source run 使用唯一 session，保存完整 run id 但把磁盘目录段限制为摘要化长度，避免 Windows 最长路径破坏 conversation finalization。source 完成后保存相对初始 manifest 的 added/modified/deleted snapshot；`.skvm` 与字节相同的 skill root alias 不作为用户输出。trace adapter 逐文件核对摘要并把冻结 snapshot 交给 optimizer，不能用已变动 live workdir 替代。

task 自带的 local non-LLM criterion 会在 source run 后自动重算；有 skill bundle 时，系统在临时 user-only 视图执行 evaluator，使 task 输入、agent 输出与 framework-owned skill 文件分离，结束后删除临时视图。LLM judge 仍跳过，未知专业判断不自动变绿。`reuse-script` 的 `sourceRefs` 可用 `scripts/tool.py#symbol` 定位，选择器在 containment/extension 检查前只移除 symbol anchor。共享 command tool 在 Windows 优先使用 PATH 中的 `pwsh`，缺失时退到 `powershell.exe`，并向模型明确输入语言为 PowerShell；POSIX 保持 `sh -c`。它仍禁止宽进程终止命令并设 30 秒单命令上限。

R6 的两结构 fresh optimizer 尝试均为 no-change，随后按任务书复用已验证 H8/H9 包做实际消费。I18n 原/变化由系统 evaluator 各 5/5，generated checker 对 2-key/3-key 输入均 exit 0；Law 两个无评分自然输入真实复用 converter，source-owned Stage3 各 8/8。agent 在 I18n 变化输入未调用 checker、Law 在旧 tool 描述下出现命令重试，因此效果为 unknown，不声称省时或总体成本下降。机器报告为 `results/skill-ir/skill-optimization-production-closure-20260913/r6/report.json`。

R7 从普通项目目录实际运行同一入口，用户侧没有 task/log/locator/validation/criteria/package-out 接线。Windows 没有 HOME 时，cache 根现在使用 `os.homedir()`，不再随 cwd 落入被观测项目。实际 source/capture/handoff/proposal 完整，首次 package 阶段因输入本身是旧 v2 优化包而失败；exporter 经 TDD 后支持重新优化已核验的 v1/v2 包：先验证原包闭包，从 diff/copy 输入中移除旧的 framework-owned manifest、validation report 和 user guide，再写当前元数据。普通未验证 source 若自行引入这些保留路径仍拒绝。公开 resume 随后只重做 package，未重跑 source/optimizer。新包为文档-only draft/behavior not-run，不新增程序正例。机器报告为 `results/skill-ir/skill-optimization-production-closure-20260913/r7/report.json`。

H13 将该包一次复制到全新的普通系统临时目录，在复制处用生产 verifier 重算闭包，再从新的 cwd 运行复制包内 TXT converter。直接调用使用 Python `-B`，Stage3 A/B/overall 通过、两份最小产物生成，输入与包的运行前后摘要分别相同，包内无研究根路径。首次复制因此前帮助命令产生的两个未跟踪 `__pycache__` 被 verifier 正确拒绝；失败保留，缓存仅移入系统临时隔离位置，没有修改 R7 提交字节。该结果只证明一份已暴露 TXT 的可搬运局部路径；包自身仍为 draft/behavior not-run，PDF/DOCX、其他 adapter 自动 capture 与优化效果未建立。机器报告为 `results/skill-ir/skill-optimization-production-closure-20260913/h13/report.json`。

H14 首次合并测试保留 4 个失败，随后只修复一个生产 portable-key 问题与三个跨平台/调度测试假设。`readEvidenceRecord` 对 recursive Dirent 的 Bun/Node parent 字段兼容，并把嵌套 workdir snapshot key 统一为 `/`；这使 Windows 写入的 `sub/answer.json` 按原键往返。detach 测试比较解析后的绝对根，共享 pool 测试不再假定 train/test 的入池顺序但继续检查全局并发上限。针对性 18/18、最终合并 347/347、typecheck 和文档治理通过。机器验证为 `results/skill-ir/skill-optimization-production-closure-20260913/h14/verification.json`，总报告为同 identity 的 `final-report.json`；最终工程 complete、行为 partial、效果 unknown。

C 路线 C1 补上自然任务的运行前内容层。`prepareRunWorkspace` 在 task fixture 物化后、skill namespace 与 adapter setup 前调用 `writePreRunInputSnapshot`；快照位于 session 所有、workdir 外的 `source-inputs/`，而旧 `skvm-initial-workdir-manifest/v1` 继续只负责 delta。`skvm-pre-run-input-snapshot/v1` 对普通文件保存摘要、字节数、text/binary 表示类别和原始字节路径；单文件 64 KiB、总计 512 KiB，并把超限、总量耗尽、不可读和不支持项逐项记为 omission。空文件是合法的零字节 capture，omission 不伪装为空内容也不阻止其他文件。session 完成和 evidence freeze 都绑定同一 manifest/内容副本。

C2 将这份引用接入 Evidence 的 `inputResources.preRun`，由 adapter 校验 manifest/内容绑定，workspace 独立投影到 `.optimize/tasks/<safeTaskId>/run-N-pre-run-inputs/`，并在 `IMPLEMENTATION_CONTEXT.json` 中列出相对 locator、摘要、media type、格式和 omission。validation 新增 `pre-run-input-snapshot` 来源，以原始 `Uint8Array` 物化独立 case；task-fixture 与 pre-run 同名且字节漂移时 fail closed，要求显式选择真实运行前来源。旧 trace 没有该字段仍可读，不会事后回填不可恢复的输入。

C3 将现成脚本动作接入通用本地实现选择：可解析的既有可执行入口优先归类为 `reuse-script`，真正新增或重写入口才归类为 `generate-script`，`changedPaths` 只表示候选实际改动，不把预先存在的脚本包装成新程序。`domain-backend` 仍仅对明确注册后端开放；如果动作声明与可定位的本地文件冲突，选择器保留局部可执行路线并附带 `action-kind-mismatch` 诊断（字段、原值、支持路径和建议值），而不是把声明错误升级为程序失败或整份 skill 不适用。开发回归覆盖可选 Python 依赖的惰性导入：TXT 路径可运行，DOCX 路径仍如实报告缺少依赖；证据为 `results/skill-ir/skill-optimization-end-to-end-repair-20260914/c3/verification.json`。

C4 修正一次约束修复只改文件、不改动作描述的问题。验证失败反馈现在同时绑定初始 action、当前 candidate action、引擎重算的候选差异路径、原动作意图、失败诊断和局部文件范围；范围允许失败动作的真实未归属候选路径，但不开放独立动作的路径。修复 submission 先按 action 结构/依赖校验，再只把失败 action 的有效元数据合并回完整原动作集合；metadata-only repair 即使增量 `changedPaths=[]` 也会强制重跑该 action，未受影响 action 复用 binding 相符的观察。最终 validation report、history 和 package 使用同一合并动作集；红绿证据与回归统计见 `results/skill-ir/skill-optimization-end-to-end-repair-20260914/c4/verification.json`。

C5 将候选尝试与推荐结论分开。passing 或无评分证据仍可支持有界的重复 I/O、工具发现、已有脚本复用、参数化和确定检查机会，但不把分数当作唯一目标，也不把 `confidence` 解读为提高分数的概率。机会摘要必须说明接管步骤、可变参数、必要资源、检查来源、残余职责和 `implemented`/`retained`/`not-applicable` 的具体理由；passing localization 只在来源规则、locale 文件和独立检查确立局部 key/placeholder 边界时提出候选，不覆盖翻译质量。提交声明 `implemented` 却没有文件、change 或有效 action，或提交隐式空 edit 时，optimizer 保留候选声明并写入 `invalid-submission` / `implemented-opportunity-without-artifact` engine diagnostics，不把它折叠成合法 no-change。合法 no-change 仍需保留机会审计和原因。机器证据见 `results/skill-ir/skill-optimization-end-to-end-repair-20260914/c5/verification.json`。

### 3.0.3 通用包导出、自然消费与效果边界

`buildOptimizedSkillPackage` 从 proposal 的 original 与 selected round 重新计算文件差异，复制完整选中闭包并写
`optimization-manifest.json`。清单绑定 proposal meta/submission 摘要、原/新 closure、真实 added/modified/deleted/moved、
动作实现、runtime/dependency files 与 package/behavior validation；声明的 `changedPaths` 不替代文件系统事实。输出目录必须
为空且不与 source/proposal 重叠，路径逃逸、symlink、缺失 license/resource 或 no-change 都 fail closed/no package。
普通技能不会被注入 API binding/helper；原 API Tester solidifier 保留为独立兼容入口。若 original snapshot 是通过现有 verifier 的优化包，旧的三个框架元数据文件不参与新 source closure/diff，也不会复制到新包；它们由当前 proposal 重新生成并重新绑定。无法验证的旧 metadata 不获得这一例外。

新 writer 使用 `skvm-optimized-skill-package/v2`，并把最终选中轮的既有 `optimization-validation-report.json` 复制、摘要绑定和内容重验；不为导出重跑等价检查。无报告或带未验证/拒绝动作的包是 `draft`。只有 action-local 状态 passed、至少一个 independent case 且无缺口时才是 `validated-recommendation`，仍不代表整 skill、真实 agent 消费或效果通过。reader 继续接受 v1 且不回写旧 manifest。

CLI 的 `--package-out` 在正常 proposal 结束后调用上述导出器；`--log-records` 为每个日志传入一组 `+` 分隔的精确 adapter
locator，使一份多行真实日志无需复制即可只选择一条记录。包导出不等于行为通过：action-local 验证分别记录 execution-error、
missing-argument、ambiguous-entry、result-mismatch、environment-unavailable 与 not-run；独立动作可保留，失败动作的 dependants
被拒，共享文件无法安全拆分时按整组处理。

`runGeneralSkillDevelopment` 接受优化包或普通 source skill，复制到新 workdir，给 agent 的正常任务只暴露 `./skill/SKILL.md`、
任务资源和预期输出，不指定内部 helper。它从实际 read/exec/result 判断 skill/helper 消费，并分别核验最终任务、残余职责、
protected resources 和整个 skill 副本不变；Python 指引使用 `-B` 防止 bytecode cache 修改包。Pi 原始事件保存为摘要绑定的
`agent-events.json.gz`，报告同时保留压缩和解压字节摘要。

`observePiExecution` 从终态事件区分 run、model response、turn、tool call、retry 与 tool-output characters，流式 update 不重复计。
`analyzeMatchedConsumptionPairs` 只接受相同 input/binding/model/driver/Bun/Node 的配对；input/output/cacheRead/cacheWrite 分字段比较，
缺失字段和 provider 价格保持 unknown。I18n 的一组当前运行时严格配对质量均为 5/5：input -32.32%，但 output、cache、总
observed token、工具调用和耗时上升，因此结论为 mixed 而非整体收益。Experimental Design 的变化输入在多次修订仍不稳定；
Env Manager 只证明第三类文档包可导出。机器证据位于
`results/skill-ir/general-skill-optimization-20260913/`；这些均为 development，不建立 held-out、跨模型、人工节省或稳定因果效果。

当前使用双源：original 证明失败 lineage 是否持续，ir-static 提供 schema/location 等静态残差。只在
original 与 static 均失败、证据公开且可复现时生成 repair；static regression 直接阻断。

同 `targetRef` 的证据可池化，但必须预注册模型面板、合并计数和冲突裁决。Development-only，held-out
永不参与 overlay。Per-model overlay 只作诊断 ablation。

### 3.1 为什么当前动态实验很少

动态阶段是 residual-driven，不是每个 skill 的固定打卡步骤。Portfolio v3 当前机器分流为：0 个
`dynamic-profile`、2 个 `direct-deterministic-artifact`（API Tester、Env Manager）、1 个
`static-sufficient`（Zh Code Reviewer）和 4 个 `stopped-before-dynamic`（baseline regression、baseline
saturation、measurement invalid、static quality regression）。因此“多数实验停在 static 前后”主要是门禁和
证据结构的结果，而不是 dynamic 代码不存在：无可靠 residual 时运行 profile 会把随机失败或 scorer 私有期望
固化进 overlay。

这里仍有真实工程缺口：profiler、`RepairEvidence`、Final IR provenance 和 artifact compiler 各自存在，但尚未
形成一条通用的 `select residual -> profile -> conflict adjudication -> overlay -> compile -> validate ->
solidify` 产品路径。后续应选择一个在 original 与 ir-static 上跨重复稳定出现、能绑定公开 source/contract 的
residual，先完成单模型 development 竖切；若找不到这种案例，宁可继续记录停止原因，也不为提高 dynamic 覆盖率
制造 residual。固化完成后仍须比较 profile/compile/package/all-attempt 成本，质量不回归才有资格讨论效率。

### 3.2 通用双源残差准入

历史 `repair-evidence/v1` 只能处理 Env Manager v1：criterion mapping 与 `lineageCatalog` 固定在代码中，而且可
直接消费任意 paired scored rows，没有强制核对 static gate、execution envelope、source audit 或固定分母。它
保留用于冻结 package 兼容，不再作为新案例入口。

新的准入合同采用声明式 catalog，并执行以下顺序：

1. 解析 v2 static lock、gate、execution envelopes 与 selected scored rows，使用当前同版本 gate builder 重算
   compact gate；任何身份或分母不一致都 fail closed；
2. 验证 profile-empty base IR 与 source audit，并检查 catalog 的每个 evidence target 已存在于 audit mappings；
3. 对每个 matched `original | ir-static` pair 计算 criterion transition；regression 立即阻断，resolved 只记录；
4. 对 reproduced/newly-observable residual 先按 criterion 判断任务内重复，再判断跨任务数；只有稳定 criterion 才
   可按显式 directive id 合并；
5. 输出互斥状态：`eligible`、`no-reproducible-residual`、`blocked-catalog-scope`、`blocked-static-gate`、
   `blocked-infrastructure`、`blocked-incomplete-denominator`、`blocked-static-regression` 或
   `blocked-unmapped-residual`；只有第一种可生成 overlay/Final IR。

Evidence 只持久化 value-free identity、criterion transition、计数和 digest ref，不复制 evaluator details、模型
原文、task expected、secret 或绝对路径。若 catalog 或输入对象出现这些 sink，schema/runner 必须拒绝。Final IR
provenance 通过 repair evidence digest 传递绑定 static gate、catalog、source audit 和 scored results。该链路只
收敛动态候选的准入与构造；artifact compiler 仍需按公开领域合同 solidify 并通过独立 development/cost gate。

权威 runner 是 `dual-source-residual-admission-run.ts`。它按同一 execution-envelope 选择器重算 gate，只将实际
selected block 的 `original | ir-static` 行送入 residual admission；reserve/replacement scored rows 仍绑定在
输入 digest 与 all-attempt 证据中，但不得混入 residual 分母。JSON 对象键顺序不影响 gate 等价性，任一字段值、
分母或 digest 漂移仍阻断。Static-only criterion 只有在声明式 mapping 的 prerequisite 在 original 中明确失败时
才可标记 `newly-observable`，无法解释的 criterion-set drift 按分母不完整停止。

`dual-source-feedback-run.ts --repair-evidence=<eligible.json> --out-dir=<dir>` 消费 v2 admitted evidence，生成 typed
overlay、Final IR、summary 与 `skill-ir-final-provenance/v3`。v3 provenance 显式携带 lock/gate/envelope/results/
base IR/source audit/catalog 的传递 path+digest，并在读取端交叉核对 evidence、skill、experiment、catalog 与
repair catalog。它只授权 `ir-pgo-dev` development validation；在独立 promotion 合同出现前，`ir-pgo` held-out
consumption fail closed。`no-reproducible-residual` 与任何 blocked status 都不会生成 overlay/Final IR。

Catalog 的 `scope` 分开历史诊断与前瞻授权。`prospective-development` 必须通过 current-HEAD implementation
closure 的完整 lock digest 校验；`analysis-only` 仅可在冻结实现已因后续公共修复漂移时重验 lock schema、全部
frozen semantic inputs、source audit、固定分母和 gate 重算，输出只能是诊断/停止报告。即使历史 residual 看似
稳定，`analysis-only` 也返回 `blocked-catalog-scope`，不得生成 overlay、Final IR 或补写旧 claim。

Env Manager v3 的冻结 static-fidelity 证据已用 `analysis-only` catalog 复核：12/12 selected rows、4/4 triplets、
0 infrastructure/0 regression，original 与 ir-static 的三个公开 criterion 均通过，因此报告为
`no-reproducible-residual`、0 records、0 repairs。权威 compact 结果是
`results/skill-ir/env-manager-v3-static-fidelity-v1/residual-admission.json`。这证明“合法无残差”可被持久化并
停止，不是 dynamic-profile 成功，也不改变 Env v3 的 fidelity-preserving 分类。

### 3.3 Source-audited Rule Enforcement

`typed-output-repair/v1` 与 v2 的 `json-schema-contract`、`source-qualified-finding` 是固定领域模板；它们继续
保持原字节语义。v3 新增的 `source-audited-rule-enforcement` 不是第三份自由文本模板，而是把通用 residual
绑定回 profile-empty base IR 中已经存在、已经通过 source audit 的规则：

1. `targetRef` 必须是输入 base IR 中已有的 `rule-*`；同一 pass 新建规则后再引用不合法；
2. mapping 使用 repair catalog v3，并包含与 target 完全相同的 `rule:<targetRef>` evidence ref；准入 runner
   继续验证该 target 实际存在于绑定的 source audit；
3. typed pass 只生成 target binding，不接收 rule/check/recovery 自由文本。后续 profile-guided repair 从该
   rule 的 `normalizedForm` 确定性生成 check 和单次 retry recovery；
4. 既有两个 kind 在 v3 中继承 v2 模板；v1/v2 catalog 与历史 provenance 仍拒绝新 kind，只有 Final IR
   provenance v3 可以传递 repair catalog v3。

因此该扩展只证明新领域残差可以沿同一通用、可审计路径进入 Final IR candidate。它没有绕过 artifact runtime：
声明式 check/recovery 只有在后续 compiler 固化并由 validator 执行时才成为 enforcement，也不产生历史或当前的
quality、efficiency、held-out、跨模型 claim。

Task 18.10 同时在 benchmark contract 之前冻结 `statistical-power` 为下一 prospective candidate。选择报告绑定
MIT、exact upstream repository/commit/path、checked-in source closure digest 和完整候选比较；初始预算只允许
`original | ir-static`、2 development tasks x 2 repetitions、`retries=0`，即最多 8 次付费调用。只有未来
dual-source admission 返回 `eligible` 才可追加最多 4 次 dynamic development；当前
`paidExecution=false`、`dynamicProfile=false`、`heldOut=false`，且该候选不进入 7 个既有 method case 的 readiness
分母。权威输入与报告分别为 `benchmarks/skill-ir/corpus/prospective-dynamic-candidate.json` 和
`results/skill-ir/prospective-dynamic-candidate.json`。

## 4. Final IR Provenance

Final IR candidate 至少绑定：

- source/base/overlay/final digest；
- development scored result digest；
- model、family、adapter/version、panel、run identity；
- task split、repair catalog 和 compiler version；
- validation notes、regression blockers。

编译完成不等于 promotion。`ir-pgo-dev` 仅用于 development；`ir-pgo` 只有在冻结 gate 通过后消费同一
Final IR 的 held-out。

## 5. Validated Artifact Package

```text
optimized_skill/
  skill_ir.json
  skill.md
  artifacts/
    checks/
    schemas/
    scripts/
    templates/
    tool-plans/
  package-manifest.json
  package-provenance.json
  validation-report.json
  cost-report.json
```

`skill_ir.json` 是权威语义；`skill.md` 是可再生成的人/agent 视图；`artifacts/` 固化重复推理、环境探测、
格式、固定工具计划和可执行检查。Manifest 按相对路径和 sha256 绑定所有 production file。

## 6. Catalog 与 Adapter 边界

通用 `validated-skill-artifact/v1` 定义 manifest、execution plan、runtime、protected input、result report 与
scorer handoff。Skill 差异只能进入 declarative adapter 和编译产物：

- Law：converter/checker/report template；
- Experimental Design：allocation script/design schema/report evidence；
- Env Manager：inventory/schema/check/repair；
- API Tester：声明式 YAML/JSON OpenAPI 变体、bundled schema walker、test-plan generator 和 checker。

通用 core 不得 `if (skillId === ...)`。新增案例必须记录 `coreBranchDelta`、adapter LOC、人工时间、artifact
kind 复用率和未自动化步骤。

公共 adapter 只负责 package assembly envelope：catalog/skill/compiler identity、protected/generated paths、
execution plan、artifact layout 和 provenance 输入投影。领域 compiler 仍负责生成 artifact bytes，并对公开
source/task/resource evidence 的语义负责。这样统一的是重复的目录清理、写文件、digest、manifest、
provenance 和最终 catalog validation，不把 Law、Experimental Design、API Tester 等不同语义压成一个
checker 或模板。

收敛使用 shadow-first：先从至少两个已冻结 package 重建到临时目录并要求 production files 逐字节一致，
再允许新的未冻结 compiler 默认使用公共 assembly。任何已被 lock digest 绑定的 compiler/package 不原地
重构；旧路径只有在新路径通过 development gate 后才讨论删除。缺失/多余 payload、重复 id/path、路径
逃逸和 execution-plan 悬空引用必须 fail closed。该 parity 只证明工程收敛没有改变既有行为，不是新的
优化效果证据。

2026-08-15 全过程复盘确认，项目已经有公共 assembly、runner、execution envelope、paired gate、source audit
和 residual admission，但入口仍明显碎片化：`src/benchmarks/skill-ir` 下有 78 个 `*-run.ts`，大量只是为不同
历史 identity 拼装相同阶段；多模型 planner 仍显式按 API Tester/Env Manager 选择 package。Registry 中只有 Env
Manager 前瞻记录了完整人工时间（214 分钟）与 25 行 adapter，API Tester 只有 38 行 adapter、无时间；其余
5/7 method cases 是 `historical-unavailable` 或零占位，不能据此声称适配成本已收敛。Statistical Power 又证明
contract canary 可以在公开/隐藏 schema 不一致时自证通过。因此现在的首要工程缺口是 lifecycle orchestration
和 adapter evidence，不是增加新的领域 compiler 或 runtime 版本。

统一封装采用一个公共 `PilotAdapter`，只允许声明：

```text
source closure + license/provenance
development task builder + public input/output contract
public/evaluator JSON pointer disclosure
domain oracle/scorer entry + source anchors
base-IR mapping + artifact compiler capability（可选）
runtime/resource requirements
phase budgets + stop policy
```

公共 wrapper 固定执行 `import -> contract -> disclosure/canary audit -> freeze -> qualification -> calibrate ->
base IR/static -> residual admission -> optional dynamic/artifact -> report`，并统一 task/lock digest、execution sidecar、
selected/all-attempt 分母、付费调用分解、状态机和 compact evidence。领域 oracle、semantic normalization 与 artifact
generator 仍是 adapter/plugin；统一它们会把统计功效、OpenAPI、AST rewrite 和文档转换错误地压成同一 scorer。

实现必须 shadow-first：先让 wrapper 对 API Tester 和 Env Manager 读取既有冻结输入，在临时目录重建 plan/
package/report，并要求 identity、行数、production bytes 与 gate 逐项 parity；不改旧 lock/result。Statistical Power
作为 `public-scorer-schema-underdetermined` 负 canary，必须在任何付费 qualification 前被 disclosure 阻断。完成
两正一负 shadow parity 后才允许新 skill 或 untouched replication 使用 wrapper 默认路径。

Task 18.13 已把上述合同实现为 `pilot-lifecycle.ts`、声明式
`benchmarks/skill-ir/corpus/pilot-adapters.json` 和无模型 shadow runner。API Tester 与 Env Manager 各从冻结
lock 重建 16 行逻辑 plan、4 个 quartet，并用公共 development gate 从冻结 tasks/raw/scored evidence 逐字段
重算 report；两者分别保持 `quality-positive` 与 `fidelity-preserving`。公共 assembly 同时重建两者共 4 个
package，4/4 production file sets 逐字节一致，公共 core 不含 skill id 分支。

API Tester 的历史 lock 绑定了共享 `pilot.json` 的旧 digest，而该聚合 corpus 后续有合法的 append-only 扩展。
因此 wrapper 会加载并验证领域 task-builder export，但不调用会重新读取当前聚合 corpus 的历史 builder；逻辑
plan 直接从不可变 lock matrix 构造，完整 gate 则从该 identity 的冻结 raw/scored/tasks 重放。这样既验证公共
生命周期，又不通过修改旧 lock 或回滚共享 corpus 换取表面 parity。Statistical Power 在 disclosure stage
停止，adapter builder load/call、logical plan build、qualification 和 paid call 均为 0。

## 7. Compiler

Compiler 输入只允许：

- exact source closure + provenance；
- source-audited base IR；
- 公开 user task contract；
- resource/environment contract；
- 版本化 catalog/adapter；
- 通过门禁的 typed development evidence。

Compiler 输出必须 deterministic；相同输入 digest 得到相同 manifest/package digest。Evaluator、held-out、
secret、raw model text、绝对路径和未声明本地资源均为非法输入。

## 8. Preflight

Preflight 在生成或执行前验证：

1. catalog/schema/version；
2. manifest path containment 与 digest；
3. provenance 与 source/base IR 绑定；
4. required tool/resource/environment；
5. protected inputs、runtime contract 和 output root；
6. repair provider/credential 仅以环境变量可用性检查，不读取值。

Preflight 失败属于 package/infrastructure，不能触发 semantic repair。

## 9. Runtime State Machine

```text
preflight
-> materialize protected runtime contract/template
-> generate
-> validate
-> if semantic failure: at most one sanitized repair
-> revalidate
-> stop
-> deterministic offline scorer
```

状态必须保存 initial validation、repair attempted/provider/tokens、final validation、protected digest 和
stop reason。`check-only` 与 `check+one-repair` 共享同一 package，可用于修复归因。

## 10. Validator 与 Repair 白名单

Runtime validator 只检查 agent 可见、公开可推导的结构和低争议语义。ValidationReport 使用封闭字段：

```text
code
relativePath
jsonPointer
missingField
expectedType
```

不得包含 raw source/model output、secret、absolute path、scorer expected 或 held-out。Repair prompt 只接收
该投影。修复一次后无论通过与否都停止。

Runtime validator 不等于 scorer。最终 workdir 仍由离线确定性 evaluator 判断任务成功。Validator pass、
repair success 与 scorer success 分列。

## 11. Evidence 分层

Semantic artifact 的 A 层允许进入 production：公开 schema、类型形状、文件路径/符号、必填报告字段、
敏感值形态等。无强证据时降级为 `unconfirmed`。

B 层高争议分类只允许存在于类型和 leak/reverse-evidence 单元测试，不得序列化到 package、ValidationReport、
repair prompt、raw/scored row 或 gate。未来启用必须新 catalog/lock，不原地修改旧 package。

## 12. Development 与 Held-out

Artifact development 必须绑定 package digest、execution freeze、model/harness、task split、repetitions、
scorer、gate 和 output root。只有完整 development matrix 通过，才创建新的 held-out lock。

方案 3 当前先使用独立的
`benchmarks/skill-ir/pilots/namespaced-resource-development-lock.json`。它是
`compatibility-canary` lock：只绑定真实 source closure、namespace compiler/loader/canary digest 和
canary report，禁止 paid/held-out/PGO/scorer 调参，不能替代 optimized quality development lock。运行：

```powershell
cd D:\skill优化\SkVM
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' ./src/skill-ir/resource-namespace-lock-run.ts
```

输出只证明 package identity 可复现；必须先将 compiled skill view 接入 optimized runner，再冻结含
`no-skill | original | ir-static | optimized` 的完整 development matrix。

当前 materialization-only runner 也可单独复核：

```powershell
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' ./src/benchmarks/skill-ir/namespaced-resource-runner-run.ts
```

它只在临时 workdir 写入 compiled `SKILL.md` 和 `.skvm` namespace，随后删除临时目录；结果不代表 agent
执行或 scorer 成功。

完整 development 执行使用独立 quality lock 和执行桥：

```powershell
$env:Path = "C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin;" + $env:Path
$env:SKVM_PYTHON = (Resolve-Path '.skvm\law-runtime\Scripts\python.exe').Path
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' ./src/benchmarks/skill-ir/namespaced-resource-development-execution.ts --execute --out-dir=results/skill-ir/namespaced-resource-quality-development-v1-r2 --model=xty/gpt-5.6-sol --adapter=pi --adapter-version=0.67.68 --panel-config-id=namespaced-resource-quality-development-v1
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' ./src/benchmarks/skill-ir/score-real-agent-runs.ts --raw=results/skill-ir/namespaced-resource-quality-development-v1-r2/raw-runs.jsonl --manifest=benchmarks/skill-ir/corpus/corpora/pilot.json --out=results/skill-ir/namespaced-resource-quality-development-v1-r2/scored.jsonl
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' ./src/benchmarks/skill-ir/namespaced-resource-development-gate.ts --scored=results/skill-ir/namespaced-resource-quality-development-v1-r2/scored.jsonl --out=results/skill-ir/namespaced-resource-quality-development-v1-r2/gate-report.json
```

执行桥在普通 runner 的 workspace preflight 之后重新物化 optimized namespace resources；这是必要的，因为
每行开始会清空 workdir。`quality-development-lock/v1` 的四臂和 `retries=0` 是唯一允许的付费 development
身份。2026-08-03 实验完成 16/16、0 infrastructure failure，但 optimized 仅 1/4 success、mean score
0.5625、2 个相对 `max(original, ir-static)` 的 pairwise regression，gate failed。失败证据冻结在
`results/skill-ir/namespaced-resource-quality-development-v1-r2/`，不进入 held-out/PGO，也不改 scorer。

门禁失败后先运行 source-bound semantic failure audit，而不是直接补跑：

```powershell
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' ./src/benchmarks/skill-ir/namespaced-resource-semantic-failure-audit.ts `
  --raw=results/skill-ir/namespaced-resource-quality-development-v1-r2/raw-runs.jsonl `
  --scored=results/skill-ir/namespaced-resource-quality-development-v1-r2/scored.jsonl `
  --out=results/skill-ir/namespaced-resource-quality-development-v1-r2/semantic-failure-audit.json
```

当前审计结果为 4/4 optimized namespace active、4/4 public outputs present、0 infrastructure，且 3/4
failure rows 与已知 v1 benchmark contract sensitivity 对齐；Experimental Design optimized view 仍是
source-rewrite-only。报告只用于归因，不替代 scorer，也不得进入 compiler/package、held-out 或 gate。

随后对已有 deterministic artifact compiler 做本地 re-entry qualification：Law 与 Experimental Design 的
compiler、通用 catalog/runtime、protected-input 与 deterministic scorer activation 共 20/20 focused tests
通过（显式 `SKVM_PYTHON`）。这证明 L3 artifact 候选可以在不调用模型的情况下生成并改善 fixture workdir。

Task 17.11 已进一步提取 `validated-artifact-assembly.ts`：它只统一 manifest、provenance、execution plan 与
artifact layout 组装，不统一领域 generator/checker/scorer。API Tester 与 Experimental Design v1 的 shadow
rebuild 共覆盖 23 个 production files，2/2 package 逐字节一致、2/2 catalog valid、`coreBranchDelta=0`；
compact report 在 `results/skill-ir/validated-artifact-assembly-parity.json`。旧 compiler/package/lock/result
保持不变。

新的 `experimental-design-v2-artifact-compiler.ts` 绑定公开 v2 contract，并默认通过公共 assembly 生成新
package。2 个 development fixture 的本地 qualification 为 2/2 runtime complete、2/2 scorer success、
mean 1.0、2/2 protected input pass，runtime model tokens 为 0；报告在
`results/skill-ir/experimental-design-v2-artifact-local-qualification.json`。这仍是本地机制证据。相同任务的
`no-skill | original` 基线已经饱和，因此不创建付费四臂 lock，也不把本地通过解释成质量改进。

可重复的无模型命令：

```powershell
cd D:\skill优化\SkVM
bun ./src/benchmarks/skill-ir/validated-artifact-assembly-parity-run.ts
bun ./src/benchmarks/skill-ir/pilot-lifecycle-shadow-run.ts
bun ./src/benchmarks/skill-ir/experimental-design-v2-artifact-compile-run.ts --out=<empty-directory>
$env:SKVM_PYTHON = (Resolve-Path '.skvm\law-runtime\Scripts\python.exe').Path
bun ./src/benchmarks/skill-ir/experimental-design-v2-artifact-qualification-run.ts
```

已提交的 v2 package 不应被原地覆盖；重新编译时必须把 `--out` 指向新的空目录。领域 compiler 仍负责
生成约束和脚本，因此当前收敛的是 package assembly，不代表任意 skill 已能完全自动编译。

完整四臂接入先使用独立 dry-run planner，不改变默认 `real-agent-run` matrix：

```powershell
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' ./src/benchmarks/skill-ir/namespaced-resource-development-plan-run.ts
```

它读取 compatibility lock 和 pilot development tasks，显式生成
`no-skill | original | ir-static | optimized` 四臂身份；optimized 行调用 namespaced materializer，其他三
臂复用现有 source runner。plan 是可审计的 16 行 dry-run 产物，不包含模型调用、scorer 结果或质量 claim。

在创建付费 development lock 前必须再执行 qualification：

```powershell
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' ./src/benchmarks/skill-ir/namespaced-resource-development-qualification.ts
```

qualification 把资源合同 probe、workdir namespace 隔离和 mutation fail-closed 分开报告。任何 probe 失败都
是 preflight/infrastructure blocker；它不会触发 semantic repair，也不会被计入 skill 优化分数。当前使用显式
`SKVM_PYTHON=.skvm/law-runtime/Scripts/python.exe` 的结果为 2/2 mutation regression、2/2 resource probe
通过。未提供该环境时，Law 的 `docx`/`pdfplumber` 缺失会使 qualification blocked，不能绕过 probe 创建付费
lock。

Held-out 使用冻结 package，不调 compiler、adapter、validator、scorer 或阈值。失败结果冻结；若要修正方法，
回到新的 development identity，不能消费旧 held-out 反馈后重跑同一分母。

## 13. 当前机制结论

- Env v3 证明公开 workspace-derived environment/schema 语义可经公共 assembly 编译为 Node/Vite package；冻结
  development 为 4/4、mean 1.0、0 regression，四次 runtime model tokens 为 0；但缺 compile cost 与
  break-even，因此分类为 fidelity-preserving。后续全成本审计没有重写该结果：它精确恢复了已追踪的
  production/research 成本，但自动 optimizer/compiler token 仍为 missing，break-even 仍不可计算。
- Law 证明 code/template/checker artifact 可在 development 显著优于文本 skill，随后 held-out 边界回归。
- Experimental Design 证明 catalog/runtime 可复用到第二 phenotype，但 benchmark 饱和阻断优化归因。
- API Tester 已把 source-attributable schema residual 固化为 profile-empty base IR、38 行声明式 adapter 和
  两个同 catalog package 变体。冻结 development 为 4/4、mean 1.0、0 regression；模型三臂均 0/4。
  这证明公开 OpenAPI 约束可以编译成稳定的 0-runtime-model-token artifact，不证明 held-out 或跨模型泛化。

因此下一工作不是新增 runtime 版本。i18n contribution-v2 已提供有区分度的 source-transformation baseline，
其 source-audited profile-empty base IR 也已通过；但首个 static development identity 因 1 timeout 和 3 个
跨三臂同位 `parse-failed` 冻结失败，不能进入 artifact candidate。下一步先把 current regression、
frozen-history compatibility 与 provider/execution observability 分层，再决定新预注册身份或替代方法案例；
不得在同一 lock 下补跑筛正例。

API Tester 的本地编译与冻结实验命令：

```powershell
cd D:\skill优化\SkVM
bun ./src/benchmarks/skill-ir/api-tester-artifact-compile-run.ts
bun test ./src/benchmarks/skill-ir/api-tester-artifact-compiler.test.ts `
  ./src/benchmarks/skill-ir/api-tester-artifact-activation.test.ts `
  ./src/benchmarks/skill-ir/api-tester-artifact-development.test.ts
bun ./src/benchmarks/skill-ir/api-tester-artifact-development-run.ts `
  --phase=plan `
  --lock=benchmarks/skill-ir/pilots/api-tester/api-tester-artifact-development-lock.json `
  --out-dir=results/skill-ir/api-tester-schema-derived-artifact-development-v1
```

`qualification` 与 `execute` 使用相同参数，只替换 `--phase`；真实执行前必须通过 lock validation，且
`SKVM_XTY_API_KEY` 只能存在于环境变量。

## 14. 成本

记录 compile/profile/package/model repair/runtime validation/scorer 成本。Artifact 的模型 runtime 为 0 也必须
保留预编译成本。只在质量 gate 通过后报告：

```text
N = 1, 2, 5, 10
original cumulative tokens
optimized cumulative tokens
break-even N*
```

缓存命中必须绑定 source/compiler/catalog/environment digest；任何输入变化都使缓存失效或重新验证。

通用 `optimization-cost-accounting.ts` 将成本分成两本账：production 账用于 N 次摊销，research 账披露
qualification、selected/all-attempt、scorer、repair 与失败尝试。`measured(0)` 与 `missing` 是不同状态；只有
compile/profile/package 的 model-token 字段齐全时才计算 Token break-even，只有 production、research
all-attempt 与质量证据都完整时才允许 `efficiency-positive`。Env Manager 薄适配只读取已追踪 compact evidence：

```powershell
bun ./src/benchmarks/skill-ir/env-manager-v3-cost-accounting-run.ts
bun test ./src/benchmarks/skill-ir/optimization-cost-accounting.test.ts `
  ./src/benchmarks/skill-ir/env-manager-v3-cost-accounting-run.test.ts
```

当前报告为 `results/skill-ir/env-manager-v3-cost-accounting.json`：original 4 次共 197606 model tokens、每次
49401.5；artifact 4 次为 0、平均 135.25ms；profile 与 deterministic package assembly model tokens 为 0，
package 最大 29652 bytes。但自动 compiler token、compile duration、package duration，以及部分历史
qualification/cache/scorer duration 不可恢复，故 N=1/2/5/10 的 optimized 总量保持 null，分类不晋级。

Task 18.15 新增独立首版 `prospective-compiler-cost.ts`，用于新候选从 construction 开始保存成本，而不是修改
上述历史审计。Identity 绑定 source closure、task/public/resource contract、base IR/source audit、adapter、
compiler、cost capture/runner、catalog/runtime 和 runtime environment digest；执行前逐项重算 sha256。每个
`optimizer | compiler | package | compiler-package` stage 记录实际 duration、model call 与 input/output/cache
usage，正模型调用配全零 usage、证据漂移、callback failure、输出越界、package validation/skill 不一致都 fail
closed。输出只含仓库相对路径；临时 package 在验证后删除。

```powershell
bun ./src/benchmarks/skill-ir/prospective-compiler-cost-run.ts
bun test ./src/benchmarks/skill-ir/prospective-compiler-cost.test.ts `
  ./src/benchmarks/skill-ir/prospective-compiler-cost-run.test.ts
```

Canary 报告位于 `results/skill-ir/prospective-compiler-cost-canary.json`。Bun 1.3.14 / Windows x64 下，API
Tester 两包实测 133.46ms、725430 bytes，Env Manager v3 两包实测 63.16ms、59296 bytes；4/4 manifest
与冻结 package 一致，0 model calls、0 aggregate model tokens。两案例都是 `manual-existing` 且明确列出四项
未自动化步骤，所以 0/2 eligible、2/2 `mechanism-only`。只有未来 `automatic-prospective` identity 同时具备
零未自动化步骤、完整 optimizer/compiler/package stages、非矛盾 usage 与有效 package，才可提供 automatic
production compile cost。本结果不反事实闭合 Env Manager 的历史 break-even。

Task 18.18 将该 capture 用到 BIDS 新候选：10 human minutes、23 adapter LOC、0 core branch delta；一次 package
construction 为 0 calls/tokens、217697 bytes、catalog validation passed。由于 base IR、adapter、compiler 和 tests
仍由人手写，automatic eligible 保持 false。确定性 artifact 在两任务两重复上为 4/4、mean 1.0，但同期 12-call
模型矩阵的 residual audit 发现公开 issue-path value semantics 不完整，故 artifact 只证明 source-derived compiler/
runtime 机制，不是 automatic optimized 或 quality-positive 正例。Dynamic 未授权；必须先修复通用 disclosure
preflight 对 canonical value/representation equivalence 的覆盖。

Task 18.26 第一次把公开 source 到四类 candidate 的公共路径实际串起。`automatic-construction-shadow-v1` 对
method portfolio 7 个案例先冻结候选、后读取人工 oracle；7/7 contract、7/7 schema-valid base IR、7/7
construction validation plan、7/7 non-executable package candidate 均生成，0 API/model call、0 held-out、0
evaluator payload。公共 core 不含 7 个 case id，case-specific transformation adapter LOC 与激活人工分钟均为 0；
共享核心从前瞻起点到最终实跑记录 28 human minutes，二者分账，不能把共享开发成本说成 0。

Shadow gap 是实质结果而不是失败美化：6 个存在 manual base IR 的案例全部为 schema-valid oracle，但自动/手工规则
精确重合为 0；Zh README 没有冻结 manual base IR，Reviewer/README/i18n 没有 validated package oracle。自动
contract 仍缺 benchmark task ABI/value semantics，自动 IR 缺领域实体、tool binding、runtime invariant，validation
plan 没有独立 domain scorer/runtime oracle，package 刻意保持 non-executable。因此四类 portfolio eligibility 均
为 0/7，`automationAndAdaptationConverging` 与 readiness 保持 failed。权威差距报告为
`results/skill-ir/automatic-construction-shadow-v1/report.json`；下一刀应自动融合公开 task contract 与 source audit，
而不是继续优化 Markdown 结构抽取或把 candidate skeleton 记作已自动化。

Task 18.27 完成了这层输入桥，但没有把它夸成 runtime 自动化。`skill-ir-task-description/v1` 的 7 个声明只写
input/output path、artifact shape 和封闭 pass predicate，均为 20--27 LOC、13--20 semantic entries；总前瞻
authoring 15 human minutes，case adapter LOC 与 core branch delta 都为 0。生成器把这些声明和 source-only 结果编成
domain contract、task-ABI IR、cross-artifact validation plan 与 package candidate，并由独立 verifier 重验绑定。
Shadow 共记录 19 个可进入通用确定性 plan 的结构 predicate，以及 21 个仍需领域 runtime 的 source/content/cross-
artifact/behavior predicate；后者逐案形成不同 gap，另有对应 output compiler gap。因为本阶段没有执行 task output、
没有 qualified domain runtime，7/7 semantic parity 均为 `not-established`，package 仍 non-executable，eligibility
仍为 0/7。下一阶段应实现封闭 predicate 到公共 checker/runtime 的 lowering 和至少一个 0-paid execution parity，
而不是扩充声明去模拟手工 scorer。

Task 18.28 完成结构 execution bridge。`automatic-structural-execution.ts` 将四类封闭 predicate 编成 strict
`skill-ir-structural-execution-plan/v1`，并在真实 workdir 上使用 initial manifest 检查输入完整性、输出存在/
精确集合和 JSON object shape。`automatic-structural-execution-runtime.ts` 把 source、base IR、construction audit、
domain contract、plan、initial manifest 与 bundled checker 组装为真实 `validated-skill-artifact/v1` package，再交给
既有 `runValidatedArtifactPlan`；没有修改共享/冻结 runtime，也没有 skill-id 分支。

7-case shadow 先重建全部 18.27 candidate 并核验 digest，再加载 development task 和手工 evaluator。33 个隔离场景
得到 7/7 structural baseline pass，所有 input tamper、missing/extra output 与 5 个 JSON shape drift 均命中预期
错误；7 份声明内共 19 个实际结构 predicate。`output-presence` 虽由 focused test 与 runtime package test 覆盖，
但 7 份冻结声明没有该实例，不能计入 19 条 case evidence。Parity catalog 为 297 physical LOC，其中多数是
path binding 与 manual projection 评估配置；前瞻 authoring 3 human minutes、13 个 binding paths、9 个 manual
oracle mappings，core branch delta 0。每个手工 evaluator 模块的 path+sha256 也由 catalog 声明，通用 checker
在候选 freeze 之后校验并隔离加载，不包含任何 skill-id/module-name 分支。

手工 checker 通常把结构条件与领域条件绑在一个 criterion 内，所以 runner 不以总 checker pass/fail 冒充同一
predicate。手工 evaluator 按案例在隔离 Bun 子进程中批量执行，避免其注册副作用或模块缓存污染公共测试进程；
临时 evaluator input 随 shadow workdir 删除，不进入 compact evidence。9 个 projection 被分为 `exact`、
`manual-stricter`、`domain-bundled`；只有两条 exact projection 的
全部观察一致并建立 execution parity。其余观察保留 agreement/difference 计数，但固定 `not-claimable`。
`cross-artifact-consistency` 只完成一条 i18n 探针：通用 JSON pointer relation 接声明参数后 baseline pass、mismatch
fail，额外声明 1 human minute，仍是 `productionGeneralization=not-established`、`semanticParity=not-established`。
再往下需要 pointer/normalization/runtime-command/source-oracle 参数；若只能靠 skill 特判，不应进入 core。

本阶段 package 是 validation-only checker，不会生成 task artifacts。因此它证明 structure enforcement 已从 plan
落到 execution，没有证明 optimizer/compiler 自动产物路径收敛，7/7 automation eligibility 与 readiness 保持不变。
权威报告为 `results/skill-ir/automatic-structural-execution-shadow-v1/report.json`。

Task 18.29 增加真实 process node，但刻意限制能力而不伪造成功。公共 compiler 只为 JSON-object required field 寻找
唯一同名的 public read-only JSON 顶层字段；匹配时生成带 source/target JSON pointer 的
`source-field-projection`，否则把具体原因留在 unresolved。Runner 真正在 workdir 写文件，checker 复用 structural
validation 并增加 relation validation；未知 operation 和任何 skill-specific branch 都 fail closed。

Experimental Design 生成 replication/analysis 两个 partial plan，i18n 生成 partial report，共 3 files/3 fields；两案
relation 均 baseline pass、人工注入 mismatch fail，protected inputs preserved。Reuse gate 因同一 primitive 在两个
不同案例成立且 core branch delta 0 而 passed，但 15 unresolved、2/2 package validation-failure、manual checker
各 1/5，故 complete construction、semantic parity、automatic eligibility 都是 0。报告还明确将 catalog freeze 后
8 human minutes/30 LOC 与 pre-measurement core work `not-measured` 分开。权威报告为
`results/skill-ir/automatic-output-construction-shadow-v1/report.json`。

Task 18.30 以 additive package 增加 `copy-json-value`，不改 18.29 冻结件。声明只保存 source/target
targetRef、path、JSON Pointer 和 operation 名；literal、gold、scorer、held-out 与运行时值都不进入声明或 package。
Process 先执行旧 base projection，再从 workdir 读取 source pointer 并覆盖 target pointer；checker 依次执行 structural、
base source-field relation 和 pointer relation。Experimental Design 两条、i18n 一条 operation 在两个真实 workdir 均
baseline pass，注入 target mismatch 后均 fail，protected inputs preserved，reuse gate 以双案例/core branch 0 通过。

该局部成功没有伪装成完整构造：unresolved 15 -> 12，两个 package 继续 validation-failure、manual checker 各 1/5、
automatic eligibility 0/2。全部剩余项的冻结分类为 pointer 1、selector/lookup 1、domain runtime 10，因此即使纯
projection/query 未来全部实现，理论 unresolved floor 仍为 10；本阶段没有实现 selector/lookup。合并 task + pointer
声明在两案分别为 53 LOC/22 semantic entries 与 46/19，均小于 80/40；pointer declaration 3 human minutes，core
绿灯后的声明/shadow 20 human minutes，pre-measurement core work 不追溯。权威报告为
`results/skill-ir/automatic-json-pointer-construction-shadow-v1/report.json`。

Task 18.31 不再扩 projection/query，而是让强模型把公开 source、薄声明和一个 development construction task 编译为
strict Restricted Domain Plan，再由确定性解释器执行。模型只有每案一次 forced-tool completion、0 retry、无工具；
request 显式剥离 evaluator/gold/held-out。计划只能使用有界通用数据流原语，不能携带 task1-only secret、变量名、
文档标题或长原文，也不能通过 case/skill 分支进入 core。

执行前 freeze 已绑定 Env Manager/Law 的 2 个 request、7 个实现文件、父证据、route/backend 和 2-call 上限，摘要为
0 paid/held-out/evaluator payload/retry、`coreBranchDelta=0`。Execute 先复核所有 digest 与 provider identity；随后先
持久化全部成功 plan，再执行 4 个真实 workdir，最后才加载 manual evaluator。Focused 的注入计划只证明编排与
runtime 链可执行，不是模型自动化结果；package/manual parity、跨任务 transfer 和 automatic eligibility 在付费结果
冻结前继续 `not-established`。

真实 Task 18.31 execute 没有到达 artifact runtime：Env/Law 各一次逻辑 paid attempt 均在 strict plan 形成前进入
`provider-or-parse`，因此 0/2 synthesis、0/4 workdir、0 manual evaluator load、0/2 transfer/eligibility。零重试、
held-out/evaluator payload 隔离与 core branch 0 保持，但 token/duration 在失败路径不可用。该分类粒度不足以判断
是 provider transport 还是模型生成的 arguments/plan 不合 schema；两案不同 failure digest 也不能弥补这个缺口。
历史请求冻结且不得重跑，artifact 层的自动化主张仍为未建立。

独立 transport qualification 不运行 artifact/task。它只要求同 route/backend 把显式 canonical plan 作为 forced-tool
arguments 返回并通过同一 strict parser；六段 typed failure 和 duration/digest 用来区分持续 transport contract
blocker。0-paid freeze 固定 1 authorized call、0 retry/task/held-out/evaluator payload 及 4-file implementation closure。
即使 qualification 通过，也只排除当前持续工具合同不兼容，不会把历史 18.31 的 0/2 追溯改成 plan-schema failure。

唯一 qualification 实际为 canonical exact-match pass：632 input、134 output tokens、5,023.5 ms、0 retry，因而当前
没有持续 forced-tool transport blocker。Artifact 自动构造仍没有改善：18.31 没有 plan，四个预注册 workdir 均未
执行，full package/manual parity 与 eligibility 仍为 0。产品阶段在此收口为“自动候选/结构/局部投影 + 人工
domain-runtime 审核”，不把 transport 正例冒充 optimizer 正例。

Task 18.33 不新增 artifact primitive，而是在实际 artifact execution 前定位 plan synthesis 边界。三个阶段逐级加入
真实 context、完整 strict tool schema 和 task binding；只有 task-bound 阶段产生安全计划时，后续才允许评审计划
是否值得进入现有 deterministic runtime/package。预模型 freeze 为 3 authorized calls、0 retry/held-out/evaluator
payload；在执行前没有 package、workdir、manual parity 或 semantic parity 新证据，因此冻结本身不改变 18.31。

真实 attribution 后确有一个通过 leakage/binding 的计划，但 Task 18.34 的两个临时真实 workdir 执行均在
`.env.example` 写入前发生 `template-binding-type`：解释器已先写 `env-report.json`，其余两个声明输出不存在，
protected inputs 均保持摘要一致。计划还读取但未消费 3 个 public-interface 派生值，并漏掉 2 个 Vite 引用，因此
18.34 没有建立 full package/semantic parity；这不意味着 partial workdir 不能进入 manual evaluator。Additive static
dataflow type gate 已能在 runtime 前识别该必错流；它没有修改冻结 artifact/runtime，也不构成 automatic package
正例。

Task 18.35 的独立 parity runner 已在同两个 partial workdir 上实际调用冻结 Env evaluator：baseline 0/6、post-plan
1/6、distance-to-full=5，只有 Node 的 environment-analysis 一项通过，hard gate 与 threshold 均未过。新的 Law
single-generation freeze 只授权一次 strict task-bound call；只有 leakage、双 task binding 与 static type audit 全过
才持久化计划并进入相同 parity。唯一调用的 tool arguments 在 strict plan schema 被拒，因此没有 Law 计划、
workdir 或 package；跨 skill 聚合明确 failed。Go/no-go 已触发停止：不为该失败增加 DSL primitive 或 skill 分支，
自动化产物路径继续以人工 domain-runtime 审核/补齐为产品边界，也不开放 held-out 或 eligibility。

Task 18.36 纠正上述收口的归因边界：Env 旧 parity 来自 0/2 runtime complete、每案 1/3 output 的同一静态类型错，
Law 又没有 schema-valid plan，因此尚未得到“可完整执行但 domain semantic 失败”的干净证据。新的 additive attempt
不扩 artifact/DSL，也不修改旧 freeze；它用 typed tool schema、local namespace/static audit 和 declared-output
完整性 gate 清除这两类通用工程污染。

只有安全 plan 能在两个真实 Env workdir 均 runtime complete、生成全部三项 required output 并保持 protected input，
结果才标记 `engineeringContaminationRemoved=true`；之后冻结 evaluator 的 6 项总分母才用于解释 domain semantic gap。
即使执行完整但 parity 失败，也只是一个干净的 Env 单案例负结果，不开放跨 skill reuse、eligibility 或 held-out。

唯一执行正好落在该分支：2/2 runtime complete、每案 3/3 required output、2/2 protected input preserved，且两层
类型 issue 均为 0，所以旧 partial-output/static-type 污染已经排除。Artifact integrity 两案都通过，但一致性两案都
失败：`.env.example` 只包含数组注释而没有逐变量 `NAME=` 行，`.env.schema.json` 的 `variables` 是字符串数组而不是
逐变量 rule object。该差距不能通过“文件存在”门抹平，也不能事后改 evaluator；它是当前自动 package 的真实
domain artifact gap。

下一步只允许一个半天、零付费、非阻塞的 `review-required` 竖切来固定人工边界。它不得修改自动生成 plan；独立的
case-local patch 只读取公开 source/workdir/task/contract，写已声明 outputs，不读取 scorer/gold/held-out。Runner
必须记录 patch path+digest、LOC、起止时间、humanMinutes、`coreBranchDelta=0`，并在新的 pristine Node/Vite
workdir 上先执行原计划、再执行 patch、最后调用同一冻结 evaluator。报告同时保留 auto-only 3/6 与 reviewed
结果；即使 reviewed 未达 6/6 也冻结，不扩 DSL、不补模型调用、不改变 portfolio/readiness。

这种 reviewed artifact 明确不是 automatic construction，但若从 synthesis 开始前瞻记录完整 review、compile、
profile、package、runtime、repair 与 research all-attempt 成本，它可以进入单独的 reviewed-AOT efficiency 评估。
这条产品化证据与“全自动 optimizer 是否收敛”是两个轴，不能用人工 patch 的成功把
`automationAndAdaptationConverging` 写成 true。

Reviewed-AOT 的付费矩阵还有一道更早的硬前置：零付费 construction-source audit 必须先证明 synthesis、人工
review/patch、实际 compile、profile 适用性与 package assembly 都有新 identity 下的 path/digest 和完整计量，且
三个 one-time model-token bucket 无 `missing`。历史 `manual-existing` Env compiler 即使重跑为 0 token，也不能
补写当时未观测的构造成本。审计只回答“是否值得冻结 recurring 实验”；quality、research all-attempt 与 runtime
成本仍须由后续固定分母产生，humanMinutes/LOC 单列且不进入 token break-even 分母。

Task 18.37 已把该边界做成真实运行薄层：自动 plan 在两个 fresh workdir 重现 3/6，独立 125 LOC patch 后为
6/6；两阶段都经过 protected/exact-delta 与冻结 evaluator，且自动 plan digest 未变化。构造成本 authority 随后
重算 synthesis/review/compile/profile/package，得到公共 builder 的 one-time token mapping `9358/0/0`、无 missing；
8 humanMinutes 单列。Task 18.38 freeze 又重新编译并核对 patch bundle digest，在两个 fresh workdir dry-run 2/2
full pass，固定 8-row exact-prefix identity。本阶段均为 0 paid；quality/recurring/all-attempt/efficiency 仍待唯一
4-call original matrix，不能从 dry-run 推断。

该唯一矩阵后来只形成 6/8 原子 prefix。第 7 行 original 在目标 workdir 写出产物后，外部任务终止 runner；由于
execution observation、usage、score 与 envelope 尚未落盘，且 provider 采用无 session 模式，成本权威不可恢复。
同一 identity 重跑会成为冻结预算外的额外 paid attempt，忽略该行则会伪造 all-attempt 完整性，因此两者都禁止。
v1 状态固定为 `interrupted-invalid-for-efficiency`，不生成 cost report、不更新 portfolio/readiness。

用户选择的 successor 不复用 v1 row，而以新 0/8 identity 重跑完整分母。新的耐中断薄层只改变执行所有权和
attempt authority：detached worker 独占 8 行；controller 退出后只允许观察同一 worker，不得重发。每行在副作用前
原子写 `prepared/dispatched`，完成后先写 terminal usage/score/envelope，再推进 prefix；已 dispatched 且 terminal
缺失时整个 identity fail closed。该机制须先用 fake executor 在真实 Windows detached process 上零付费验证，随后
才绑定原有 reviewed package 与 `9358/0/0` production construction authority 冻结新实验身份。

该 qualification 已在真实 Windows detached process 上完成：foreground controller 被强制终止后，同一 worker pid
完成 2 个 fake rows；重复 start 未增加 dispatch。Journal 的 terminal-before-prefix 窗口可确定性 reconcile，
dispatched-without-terminal 则 fail closed；并发首次创建使用 O_EXCL。新 policy/freeze 从 0/8 开始并显式禁止 v1
row reuse/orphan backfill；当前 plan 为 8 rows、0 paid、matrix 未执行。

真实 v2 唯一执行没有形成 recurring 分母。Row 1 original process 正常结束且 usage 完整，但并发 `status` 为验证
identity 在生产目录重新 materialize 全部 original rows，删除了 active row 的 task/skill/initial manifest。Row 1
因此无法得到可用质量 score；紧随其后的 deterministic row 又因 task 缺失失败，prefix 固定 1/8。该事故不否定
reviewed artifact 机制，也不允许从单行 usage 计算 break-even。未来 identity 的 control plane 必须只读 frozen bytes、
journal/state 和已冻结 plan；任何 plan builder/materializer 只能在 worker 启动前的隔离 staging directory 运行。

Task 18.38C 采用 additive read-only/serial successor，而不修改上述冻结文件。`prepare` 是唯一允许调用 original
plan builder 和 materializer 的阶段；它在 key 检查与付费执行前一次性生成新 active root 的 plan/case artifacts 和
deterministic bundle。随后 `status/collect` 只读取并核对冻结字节，且资格测试须在独立进程持有真实 case 文件时证明
重复并发读取前后全树 byte-identical。Production 不再启动 observer 或 detached controller，而由单一 foreground
runner 串行执行 `dispatched -> row -> atomic prefix`。该简化保留 0 retry/fail-closed：只有 prefix 已完整提交的窗口
可以确定恢复，dispatched 但无完整证据不得重发。若资格通过后的新 0/8 身份仍发生基础设施失败，efficiency 修复
立即止损并进入 Phase 2。

正式命令分权如下。Qualification/freeze 全程 0 paid；`prepare` 只物化 plan/bundle/state/prefix，不检查或消费
credential；只有 pre-model closure 推送后才允许运行 `execute`：

```powershell
bun run ./src/benchmarks/skill-ir/reviewed-aot-efficiency-readonly-serial-run.ts --phase=qualify
bun run ./src/benchmarks/skill-ir/reviewed-aot-efficiency-readonly-serial-run.ts `
  --phase=freeze --frozen-at=<ISO-8601>
bun run ./src/benchmarks/skill-ir/reviewed-aot-efficiency-readonly-serial-run.ts --phase=prepare
bun run ./src/benchmarks/skill-ir/reviewed-aot-efficiency-readonly-control-run.ts --phase=status
bun run ./src/benchmarks/skill-ir/reviewed-aot-efficiency-readonly-control-run.ts --phase=collect
bun run ./src/benchmarks/skill-ir/reviewed-aot-efficiency-readonly-serial-run.ts --phase=execute
```

生产期间禁止调用 status/collect，虽然这两个入口已被证明只读；它们只用于付费前 0/8 复核或异常后的取证。
`execute` 消费 prepare 落盘的 4-row original plan 与 digest-bound bundle，顺序执行 8 行并直接落完整 raw/scored/
envelope、paired quality 与 cost report。Plan builder 不在 execute 或 observer 的 import/call path。恢复只允许
prefix 已提交而 state 未推进的确定窗口；in-flight 但无完整 prefix 时不会再次调用 executor。

正式执行从 fresh 0/8 一次完成 8/8，生产期间没有启动 status/collect 或任何 observer。四个 original 和四个
reviewed-AOT 全部 scorer success=1，四组 paired regression 均 false；reviewed runtime 合计 276.9631ms、0 model
tokens，original 合计 814603ms、202010 model tokens。Production AOT one-time 是 compile/profile/package
`9358/0/0` tokens，package 13131 bytes；human review 8 minutes/125 LOC 与 research attempts 单列。

公共 cost builder 对 N=1/2/5/10 均可计算，break-even=1 call、production/all-attempt/break-even completeness 全 true，
因此本切片为 `efficiency-positive`。这个结论只支持 reviewed-AOT 产品轴；case-local review patch 仍是明确的
unautomated step，不能用于提升 automatic-construction gate。

### 14.5 Automation reachability 决策薄层

Phase 2 不新建生成 primitive，而是用 `automation-reachability-v1.json` 固定 loader implementation、当前 portfolio authority、source-only、
薄声明、结构 execution、partial output、JSON Pointer、cross-skill domain plan、generic repair 与 review-required
八份证据。公共 loader 只 import 各报告 schema 和 evidence authority；它不读取 candidate package、raw model body、
held-out 或 evaluator payload，也不执行任何 compiler/runtime。

报告中的 7 条 case row 保存当前四类 flag、缺失产物、adaptation measurement/humanMinutes/adapterLoc 和 authoritative
optimization classification。它还显式拆开：gate 的直接字段、现行政策的间接语义资格、每个 flag 的证据充分性、
成本 closure 与产品边界上下文。当前 schema 对 automation/cost 只信任自报字段；报告通过无引用 canary 证明，仅改
字段即可令 gate `false -> true`，所以不会从当前 positive phenotype 反推 Phase 3 候选或 flag 晋升。

四类产物均有 7/7 candidate，但当前政策下 authority-qualified 均为 0。薄声明的 15 humanMinutes/159 declaration
LOC 是可复用的独立 segment；其它阶段的人时/LOC 测量口径重叠或不同，不能相加。声明人时的首末三例趋势通过，
声明 LOC 趋势失败，完整 qualification trend 未建立。投影/查询 ceiling 与 domain-runtime floor 只作为产品边界上下文，
不是当前 gate 的直接输入。

运行与验证：

```powershell
bun test ./src/benchmarks/skill-ir/automation-reachability.test.ts
bun run ./src/benchmarks/skill-ir/automation-reachability-run.ts
```

输出为 `results/skill-ir/automation-reachability-v1/report.json`。若任一输入 digest 漂移、schema 不符、readiness 不再是
two-evidence true/automation false，或组件 flag/cost 的当前语义边界改变，loader fail closed；应建立新的版本化研究
决策，不能静默覆盖报告。当前只允许用户在 evidence-bound readiness attack（conditional-go）与 closeout（go）间选择。

### 14.6 Evidence-bound automation closeout authority

Task 18.39 没有新增 compiler、runtime、primitive 或 skill adapter。它把 Phase 2 找到的 self-report 漏洞改成一个
digest-bound component authority：`method-portfolio-automation-authority.ts` 只 import 已冻结 report schema 和既有
optimization authority，逐例计算四种候选是否具有 source/reference/domain/runtime/package 资格。Catalog 不保存计算
结果，compact readiness v7 才保存派生 criteria、blocker 与证据引用。

“package candidate 已生成”仍不等于“complete executable package qualified”，review-required 6/6 也不等于 automatic。
当前 source/thin/structural/partial construction 足以证明四类 candidate 7/7，却不足以证明 exact source-rule match、
domain semantic sufficiency、full manual parity 与完整 executable package，因此四类 authority qualification 都是 0/7。
这正是当前产品边界的机器表达，不是用更严格 schema 抹掉已经完成的候选工作。

成本 authority 同样不复用 portfolio 中的 null/自报值。它只承认薄声明 15 分钟/159 physical LOC，并要求未来每例
qualification 的非重叠 humanMinutes、adapterLoc 和 coreBranchDelta；当前 full cost 0/7、trend 未建立。旧 Phase 2
canary 继续作为历史漏洞发现证据，但 v7 的研究结论来自 component reports + loader，而不是 canary 或 base fields。

### 14.7 Phase E0 artifact/runtime/cost 工程就绪度

现有 restricted plan interpreter、validated artifact assembly/catalog/runtime 已经证明可以在真实 workdir 上执行，
并具有路径约束、catalog digest 与确定性错误边界；它们适合复用，但当前位于 `src/benchmarks/skill-ir/`，不是稳定的
产品库接口。E1 若获授权，应移动或包装通用逻辑并公开最小输入/输出类型，保留现有 benchmark adapter 作为兼容层，
不能复制第二套 runtime。

Automatic construction 只能输出 candidate/scaffold。Source/thin-declaration 路径的 7/7 candidate 与 0/7 authority
qualification 必须同时保留；任何公共 `compile` 返回值默认标记 `review-required`。Review closure 需要把以下职责从
Env-specific runner 中解耦：review delta 的应用、source/package provenance、protected-input 检查、package assembly、
revalidation 与人工时间记录。Evaluator/task-set 加载只能是可选插件，不能出现在通用 patch/package API 的必需参数中。

成本层应复用 `buildOptimizationCostAccountingReport` 的 one-time/recurring/amortization 数学，但不改宽研究 v1 的
`quality.equivalent` 语义。产品层需要一个正交 view：

| 维度 | 值 | 可支持的结论 |
|---|---|---|
| token economics | measured / incomplete | one-time、recurring、N=1/2/5/10、token break-even |
| quality assurance | machine-checked | 可在既有 authority 的其它条件满足时进入研究分类 |
| quality assurance | user-accepted | 产品可执行与用户接受成立；strict equality/research promotion 不成立 |
| quality assurance | not-established | 只保存候选、成本诊断，不声称交付质量 |

无 evaluator 的 acceptance receipt 必须不可变地绑定 source/package/input/output 的实际字节 digest、精确 delta、
acceptedAt、humanMinutes、decision/note，并由最终 product manifest 绑定 receipt digest；任一闭包字节漂移都必须
fail closed。它同时声明无 gold/held-out/scorer。产品总成本视图要显示人工投入；现有 research token
break-even 仍保持 production AOT model-token 口径，二者不得静默合并。若要声称“包含人工成本的产品 break-even”，
必须预先声明 token/调用节省与人工时间的估值或换算政策；否则报告两个独立阈值，并把总成本结论保持
`not-computable`。

Phase E1 已确认采用 B-default + A-optional。两种模式共用一个 candidate/package/runtime/cost 实现：B 在 preview
output/delta 后生成 `user-accepted` 票据；A 在同一位置运行 digest-pinned deterministic checker，生成
`machine-checked` 证据。验收人工分钟是 per-artifact one-time production 成本，不能进入 recurring runtime。
产品报告必须使用 `qualityEvidence` 明示等级；B 的 claim 固定为“under user-accepted quality”，只有 A 可进入后续
research authority review。现有 `skill-ir-optimization-cost-accounting/v1` 与研究分类不原地改宽。

E1 实现落在新的 standalone product wrapper，不改历史冻结 runtime/cost schema，也不改被 lock digest 绑定的
`src/index.ts`。Artifact 同时携带 source、task declaration、automatic construction candidate、reviewed plan/patch、
执行 runner 与 `source-audit.json`；后者只证明 pinned bytes，明确写出 `semanticSourceAudit=not-established`。Package、
quality evidence、run evidence 和 cost report 形成互相绑定的 digest closure。

E2 的 package-inventory 探针两次全链都得到 artifact closure
`2edc635b80638a68e720bad36e782f4eb06e9ed7b90dfdcbaf8dcb932eb99035` 与 output closure
`16eb0509c900c917116272193ad726d2694bb8f88f0f4264c7d91e8dd9bbd113`。薄声明为 79 parser LOC/14 semantic entries，
human review 为 53 LOC plan + 58 LOC patch；实际需要对象键枚举、排序/去重和跨字段计数。现有旧 plan ABI 仍把
`audit.paidCalls` 固定为 1，不能字面表达本次实际 0 paid 的手写 plan；compact report 将两者并列而不改冻结 DSL。

Task 18.41 在同一 product v1 上补齐了 Env A-optional 的持久化证据，没有新建 artifact/runtime/cost 版本。产品 core
在 preview 执行前写 initial-workdir manifest，并把 digest-bound reference 传给可选 checker；machine checker 再核对
`env-manager-grade-v3.ts` source digest，并复用其三项公开 criterion。Historical original runtime evidence 现在也由产品
core 主动读取并验 digest，而不是只信配置中的 token 数值。
`skill.md` 是 source 的派生展示文件。Task 18.42 将该规则提取为显式产品合同：以 fatal UTF-8 解码，只把 CRLF 规范化为
LF，保留既有 LF、lone CR、BOM、终止换行和其它 UTF-8 内容；source authority 始终绑定原始 `SKILL.md` 字节。这样 Git
索引或跨平台 checkout 不会静默改写产品 closure，且 invalid UTF-8 会 fail closed。它属于 product v1 的字节稳定性修复，
不改变 source/quality/cost 语义。

持久化报告为 `results/skill-ir/verified-artifact-product-env-machine-checked-2026-08-29/report.json`：当前产品执行
0 model/API/paid，checker 3/3，导入的冻结分母为 original `50502.5` token/run、artifact `0`、one-time `9358`、
break-even `1`。导入的四对质量等价和 original rows 没有在本阶段重跑；A 只取得 authority-review 资格，不自动晋级。

E2 gap 的原语判断按多案例收窄：`enumerate-json-object-keys`（package-inventory/API Tester）和
`sort-and-deduplicate-strings`（package-inventory/Env/API Tester）已有复用证据；宽泛 cross-field count 把 length、distinct
union、nested count 与 selector-after-count 混在一起，尚无可冻结的共同窄 ABI。它不得在没有 selector/collection 合同前
实现成任意表达式求值器。

Task 18.42 以独立 `skill-ir-verified-artifact-collection-plan/v1` 实现前两项，wrapper 内嵌旧 Restricted Domain Plan v1，
旧 plan、runner、E2 identity 与冻结结果均不改。解释器只接受 `enumerate-json-object-keys` 与
`sort-and-deduplicate-strings`，限制声明过的输入/输出、安全相对路径和 JSON Pointer，不提供表达式、selector、lookup、count
或 skill-id 分支。package-inventory 与 API Tester 两个真实 workdir 均通过，protected inputs 不变、coreBranchDelta=0。
package-inventory 的人工 patch 从 58 LOC 降至 44 LOC，但 plan+patch 总量从 111 LOC 增至 119 LOC；因此证据只支持可复用
原语和 patch 缩小，不支持“总适配成本下降”。

Task 18.43 的 Magpie reviewed artifact 继续复用旧 Restricted Domain Plan v1，再加 skill-local bounded patch；generic core
没有 skill-id 分支，coreBranchDelta=0。固定 9 案执行 27 个 plan steps，独立 checker 9/9，protected input 9/9。适配量按非空
physical LOC 分账为 46 plan + 170 patch + 71 orchestration = 287；checker 351 LOC。旧 plan 的 `audit.paidCalls=1` 字面量与本次
观察到的 construction paidCalls=0 并列记录，未为计数美化而改旧 ABI；human review 实际未发生，不能回填估计值。

这仍不是 external token-saving 结果。两个新 measurement identity 都在模型进程 spawn 前 fail closed：先是 prepared row path
不满足共享 `run-N/workdir`，修复并冻结 r2 后又是 Windows `uv_spawn` 无法解析字面 `bun`。两个 prefix 都为空且 0 model/API/paid；
因此 artifact runtime 的 0 token 不能与不存在的 original 分母相减，也不能计算 break-even。按止损停止第三 identity。
产品 cost v1 还区分三类 token 结论：正 recurring savings 才输出 `token-saving-under-*`；original recurring 为 0 时
输出 `token-savings-not-reached`；缺 production 分母时输出 `token-economics-not-computable`。后二者的 claim boundary
都明确禁止 token-saving 措辞。

Task 18.44 只治理上述 process-start 基础设施，不改变 reviewed artifact、checker、task 或 cost 口径。共享 runtime executable
identity 对 `process.execPath` 做 regular/non-symlink/byte-digest/version smoke，Magpie 的最终 spawn command 使用其绝对路径；
compact 不保存机器路径。完整 36 行真实 materialization 与 12 次并发 status 的 byte-identical 资格已通过，新的 003 policy
从 0/36 冻结并 `reusedRows=0`。随后唯一分母完整完成：artifact 18/18、original 6/18、18 对 0 regression；artifact
recurring model token 0，相对 original 平均节省 4865.2778 input+output token/run。显式 production API construction
token 为 0，所以条件式 break-even=0 calls；但开发代理 token 与实际人工 review 仍不可观测，research all-attempt 与
efficiency-positive 继续为 false，不能把固定 fixture 结果外推到 live source。

### 14.8 Stage P1 Magpie 产品主链

P1 没有新建产品版本。Product v1 做了四项向后兼容修正：0 one-time model token 的数学 break-even 不再被强制为 1；
review humanMinutes 与 historical duration 可携带 missing reason；machine checker 可显式选择 `not-eligible`；review patch
可用 `digest-bound-bundle` 绑定本地依赖后构建为单一可移植 payload。旧 `source` 模式、Env 默认
`eligible-for-authority-review` 和 Env break-even=1 均由回归测试保持不变。Bundle audit 只允许静态声明依赖与窄 external
allowlist，禁止 network/process/env/dynamic-import/evidence sinks；artifact provenance 与 quality sourceInputs 同时绑定入口和
冻结 Magpie domain patch digest，最终 bundle 字节再由 artifact closure 绑定。

Magpie 配方对 9 个 public case 分别真实调用 `runVerifiedArtifactCli`，每份 manifest 都记录同一
`compile -> review-or-accept -> package -> run -> cost` stage order；九份产品经 `validateVerifiedArtifactProduct` 通过，artifact
closure 相同，protected inputs 与 preview/production outputs 一致。Checker adapter 只复用并验 digest 的 Task 18.43 checker/
qualification，不把 checker-only oracle 放进 artifact。当前 P1 为 0 model/API/paid；original 18 行只从 digest-bound 003
compact report 导入，没有重跑或从 raw workdir 补字段。

产品 cost v1 输出 machine-checked、research not-eligible、explicit production API token break-even=0，并保留
review humanMinutes=null、historical duration missing、total human cost not-computable。Compact report 位于
`results/skill-ir/verified-artifact-product-magpie-machine-checked-2026-09-01/report.json`；它把 cache-read 40960 单列，且把
machine-checked 限定为固定公开切片 non-regression，不声称上游 judge 语义等价或“original skill 33%”。

### 14.9 P2 bundle 与 Stage M artifact anchor

P2 bundle 不是独立 runtime；它只携带 skill/review closure，执行仍依赖现有 SkVM product CLI，`report.md` 等用户输入由
workdir 提供。P2 Magpie checker 只验证 P1 output digest regression，不携带 P1 semantic checker；静态 import audit 也只是
patch/checker 的按行正则检查，不是通用 JS dependency graph。

Stage M 将该冻结 artifact 作为每 case 一个共享 deterministic anchor，不按模型族复制。Lock 绑定 P1 config/report/checker、统一
artifact closure 与九个预期 output digest；matrix report 将 output digest mismatch 写为 artifact failed row，并保留 9-row 分母，
不得修改 package 后补跑。评审后该 identity 只保留为预注册合同，runner 禁止付费 qualification/matrix；原设计的 27+27 original
重复分母不再执行。该 artifact 比较只服务于固定 development panel，不改变 product researchEligibility。

## 15. 测试

```powershell
bun test ./src/benchmarks/skill-ir/repair-evidence.test.ts
bun test ./src/benchmarks/skill-ir/final-ir-provenance.test.ts
bun test ./src/benchmarks/skill-ir/validated-artifact-catalog.test.ts
bun test ./src/benchmarks/skill-ir/validated-artifact-runtime.test.ts
bun test ./src/benchmarks/skill-ir/automatic-structural-execution.test.ts `
  ./src/benchmarks/skill-ir/automatic-structural-execution-runtime.test.ts `
  ./src/benchmarks/skill-ir/automatic-structural-execution-shadow.test.ts
bun run ./src/benchmarks/skill-ir/automatic-structural-execution-shadow-run.ts `
  --measurement-completed-at=<ISO-8601>
bun test ./src/benchmarks/skill-ir/automatic-output-construction.test.ts `
  ./src/benchmarks/skill-ir/automatic-output-construction-runtime.test.ts `
  ./src/benchmarks/skill-ir/automatic-output-construction-shadow.test.ts
bun run ./src/benchmarks/skill-ir/automatic-output-construction-shadow-run.ts `
  --measurement-completed-at=<ISO-8601> --metered-human-minutes=<minutes>
bun test ./src/benchmarks/skill-ir/automatic-json-pointer-construction.test.ts `
  ./src/benchmarks/skill-ir/automatic-json-pointer-construction-runtime.test.ts `
  ./src/benchmarks/skill-ir/automatic-json-pointer-construction-shadow.test.ts
bun run ./src/benchmarks/skill-ir/automatic-json-pointer-construction-shadow-run.ts `
  --measurement-completed-at=<ISO-8601> --metered-human-minutes=<minutes>
bun test ./src/benchmarks/skill-ir/automatic-restricted-domain-plan.test.ts `
  ./src/benchmarks/skill-ir/automatic-domain-plan-synthesis.test.ts `
  ./src/benchmarks/skill-ir/automatic-restricted-domain-plan-runtime.test.ts `
  ./src/benchmarks/skill-ir/automatic-domain-plan-shadow.test.ts
bun run ./src/benchmarks/skill-ir/automatic-domain-plan-shadow-run.ts --phase=freeze
bun run ./src/benchmarks/skill-ir/automatic-domain-plan-shadow-run.ts --phase=execute `
  --measurement-completed-at=<ISO-8601> --metered-human-minutes=<minutes>
bun test ./src/benchmarks/skill-ir/automatic-domain-plan-transport-qualification.test.ts
bun run ./src/benchmarks/skill-ir/automatic-domain-plan-transport-qualification-run.ts --phase=freeze
bun run ./src/benchmarks/skill-ir/automatic-domain-plan-transport-qualification-run.ts --phase=execute `
  --measurement-completed-at=<ISO-8601>
bun test ./src/benchmarks/skill-ir/automatic-domain-plan-attribution.test.ts
bun run ./src/benchmarks/skill-ir/automatic-domain-plan-attribution-run.ts --phase=freeze
bun run ./src/benchmarks/skill-ir/automatic-domain-plan-attribution-run.ts --phase=execute
bun test ./src/benchmarks/skill-ir/automatic-restricted-domain-plan-static-types.test.ts `
  ./src/benchmarks/skill-ir/automatic-domain-plan-semantic-inspection.test.ts
bun run ./src/benchmarks/skill-ir/automatic-domain-plan-semantic-inspection-run.ts
bun test ./src/benchmarks/skill-ir/method-portfolio-automation-authority.test.ts
bun run ./src/benchmarks/skill-ir/method-portfolio-automation-authority-run.ts
bun test ./src/benchmarks/skill-ir
bun run typecheck
```

修改规则：冻结 package/lock/result 不原地改；新增 catalog identity 前先证明现有通用 core 无法表达，并在
spec/plan 记录原因。
