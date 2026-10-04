# Skill 优化、Final IR 与 Artifact Runtime

**按需阅读：** 本文对应 trace 优化与 IR/AOT 产物路线。普通生成先读 §3.0 的动作、程序验证、导出与自然消费；修改旧 artifact runtime 再读 §4–§14。当前授权 DSL 的宿主取证与控制图由[开发指南](developer-guide.md)、[研究 §7.36](skill-dsl-research.md#736-ar-宿主引导运行与现场修复)及 spec §14.34 说明，不要求经过本文全部层级。阶段名称表示当时实现/证据，实时状态只看 [current-status](current-status.md)。


本文说明优化动作、局部验证和产物封装的实现。当前进度见[状态页](current-status.md)，实验结果及其适用范围见[证据索引](evidence-index.md)。

## 1. 优化分层

```text
L0 raw skill
-> L1 source-audited Skill IR
-> L2 static lowering/controller/checker/adapter
-> L3 executable script/schema/template/tool-plan
-> L4 validated package + provenance + regression evidence
```

这五层描述产物需要经过哪些处理，不是所有 skill 都已达到的完成度。早期 API Tester 与 Env Manager 后端都有面向 L4 的 development 包：当时 API Tester 为 `quality-positive`，Env 为 `fidelity-preserving`。这些历史后端结果不代表当前通用包优化的收益，也未建立第二个 readiness 优化正例、held-out、untouched replication 或跨模型 L4 结论。

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

动态反馈通过版本化 `RepairEvidence` 记录问题位置、来源、观察和拟议修复：

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

日志入口可以使用一条已暴露的真实非 API 执行记录；`runStatus=ok` 只说明运行状态，不等于质量通过。
`execution-log` 输入可用 `recordLocators` 从多记录文件精确选择一条；记录身份由原文件 SHA-256 与适配器
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

F10 真实消费回流另补齐 Pi 的 `read/write/edit/bash` 操作名称，并从绑定的事件 locator 保留实际 call ID。操作索引和验证补全复用消费层的已知技能根路径匹配，支持相对 `skill/` 与报告声明工作目录下的部署路径，不用任意文件名后缀匹配。原始 argv 和工具名称保持可追踪。

自动验证的输入/输出归属以该次程序调用的明确绑定为先，不能把整段 trace 中 agent 编写的源码、配置、翻译都算作 finalizer 的输出，也不能因为其他步骤读取了无关参考文件而拒绝该程序。已有资源但局部输出映射未知时，只生成不执行的 metadata repair 候选，明确缺 `inputFiles/expectedFiles`；由现有一次 repair 补全。`buildRepairFeedback` 与 `mergeRepairSubmission` 可复用同一局部约束，不另增修复服务或 CLI。回归见 operation-context、validation-completion 和 production-closure tests。

revision-2 F1 新增 `src/jit-optimize/operation-context.ts`，从标准化 `AgentStep[]` 或 `Evidence.conversationLog` 中整理实际 tool-call。它只保留真实的 `toolCallId`、调用定位、原始命令/路径、可无歧义解析的 argv、cwd、读写文件、退出状态和工具报告耗时；正文提及的脚本不会成为操作。嵌套 shell、管道、重定向、动态命令和缺少必要入口保留为 `unknown`，并携带完整 source locator。可选的 source-entry 集合只用于报告未调用事实，不用于访问宿主文件或推导成功。

`serializeContext` 将每条 evidence 的 `operations` 与 `operationSummary` 写入 `IMPLEMENTATION_CONTEXT.json`，同时声明操作记录仅来自实际调用。summary 分开记录观察数、未知数、重复入口、先写后执行和 source entry 未调用；`existing-entry`、`written-entry` 与 `unknown` 关系不等同于可泛化机会，仍由 optimizer 结合语义判断。验证入口为 `bun test ./test/jit-optimize/operation-context.test.ts ./test/jit-optimize/workspace.test.ts ./test/jit-optimize/trace-adapters.test.ts` 与 `bun run typecheck`。

F2 在同一操作记录上补充参数来源索引。`OperationParameter` 区分 `observed-value`、`task-variable`、`source-fixed` 和 `unknown`，同时保留 `argv`、`config-field`、`env`、`path` 绑定、`present` 状态、提示偏移、配置路径/字段及必要的 redaction。位置参数和无歧义 flag 来自实际 argv；配置字段只从 evidence 已绑定的 snapshot 或显式输入对象展开，环境变量只记名称而不复制值。显式来源规则优先于保守的字面 source-fixed 推断；未知或缺失可选值不被猜测为默认值。优化提示要求把替换绑定到精确 token/字段/路径，禁止把一次观察字符串全局替换到源文件的所有副本。F2 回归为 `bun test ./test/jit-optimize/operation-context.test.ts ./test/jit-optimize/implementations.test.ts ./test/jit-optimize/optimizer-prompt.test.ts`（46/46，176 assertions），机器证据为 `results/skill-ir/general-generation-reinforcement-20260914/f2/verification.json`。

F3 新增 `validation-completion.ts`，在 `deriveProgramValidationPlan` 前从实际操作、可读的 digest-bound 资源和已存在的 source/task checks 确定性补齐 validation suggestion。它只使用已确认的 executable entry、argv 尾部参数、观察到且实际快照存在的输入/输出路径，并在 provenance 中记录每个字段来源；输入资源按 workdir snapshot、pre-run snapshot、bound task fixtures 的顺序选择。缺输出、缺资源、未观察入口和歧义 shell 命令返回 unresolved，不生成语义 oracle；已有模型 suggestion 原样保留。补全后的 case 继续经过既有 `deriveProgramValidationPlan` 与 `validateOptimizationProgram`，reference-output、task/source assertion 和 self-check authority 不混淆。机器验证为 `results/skill-ir/general-generation-reinforcement-20260914/f3/verification.json`，聚焦套件 24/24、99 assertions。

F4 将这条 completion 结果接入既有的一次 repair budget：已有但为空的 `validation.cases` 只有在观察到明确 executable、输入/输出资源和来源检查时才标为 `repairable`，原 action 不被静默改写。反馈同时携带确定性候选 validation、缺字段、实际候选差异、原始意图和局部文件范围，并与真实程序失败合并；无资源、歧义操作、未执行和程序失败仍分别记录，不能把 `unvalidated` 统称为 rejected。修复后的 action 通过 `mergeRepairSubmission`、`executeActionIds`、`priorReport` 和 validation binding 重验；metadata-only 增量也会实际执行。若一次修复仍无依据，结果保留 draft/unvalidated，不伪造 rollback 或通过。机器验证为 `results/skill-ir/general-generation-reinforcement-20260914/f4/verification.json`；该阶段只使用确定性本地替身，不建立真实模型、整 skill、readiness 或 prospective 结论。

F5 在同一 validation case 接口上增加保守的变化审计。`deriveValidationVariations` 从 F2 的实际操作/参数绑定和来源约束派生普通 `path` 与 `cwd` cases：显式 argv 输入/输出路径被搬到 contained 的隔离目录，cwd 变化只进入新的嵌套执行根；源/task assertion、expected files 和依赖绑定随目标路径重写，原始 action schema 不被改写。参数值不由引擎猜测；只有同一 evidence 中已存在的不同 argv 值成对案例被记为 `covered`，单值或无可检查语义关系的参数记录 `skipped` 与 sourceRefs。`package-validation` 在 variation cwd 不可用时给稳定的环境诊断，固定路径程序在 relocated case 上会因缺少目标产物而失败。机器验证为 `results/skill-ir/general-generation-reinforcement-20260914/f5/verification.json`，所用命令通过 44/44 tests、171 assertions 与 typecheck；参数未生效的领域语义红例仍未被猜测为通过，保留为后续 F9/F10 的开放边界。

### 3.0.5 F6/F6.1 普通程序入口与执行骨架（development）

F9 修正 F5 对新生成入口的限制：有来源输出关系和明确 validation argv 的新程序也接受 path/cwd 变化；不存在 observed invocation 时使用 `validation-case:<id>#args` 定位，不伪造执行记录或参数来源。迁移根目录输出保留原 cwd 已存在的父目录条件；真实检查仍由同一程序验证器执行。声明业务参数不生效由独立成对案例检出，无来源新参数继续跳过。

F6 将 optimizer Method 的 no-trade-off 语言与实际逐任务回归门对齐：通过任务不是无条件否决，候选仍必须有来源、精确接口、明确范围和可验证的非回退行为；真实回归由选择门最终拒绝。实现选择继续按 action kind、声明路径和可见文件路由，保留 `reuse-script`、`generate-script`、`restructure-docs` 与注册 `domain-backend` 的边界。对带 validation case 的可执行动作，`selectOptimizationImplementation` 从实际 argv 生成可复制的 `commandTemplate`，把输入、输出和其他 flag 转成占位符，并在 package user summary/guide 中列出参数来源；没有明确 case 时不猜任务值，只保留入口命令。旧 v1/v2 manifest reader 仍兼容且不回写历史文件。

F6.1 新增 `src/jit-optimize/workflow-scaffold.ts`，只提供普通 Node/Python 脚本的机械 plumbing：单输入读取→调用已声明 source processor→检查产物，或多输入逐项调用→汇总每项状态与输出 manifest。处理器通过 argv 直接启动，不经过 shell；输入原件不覆盖，已有输出/manifest 不覆盖，exit 2 表示该项不适用，缺产物或非零失败保持可定位诊断。`buildWorkflowScaffoldManifest` 明确步骤、依赖、framework/source/model 贡献和 residual duties；`serializeContext` 将从真实 observed operations 推导的候选物化到 `.optimize/workflow-scaffolds/`，但不读取或执行 source 来制造候选，也不把框架代码计为模型生成的领域算法。当前测试覆盖单/多输入、部分不适用、checker-only 无产物、共享物化器和 workspace 接线；真实模型决定的处理逻辑与跨结构自然消费仍留在 F9。机器证据分别见 `results/skill-ir/general-generation-reinforcement-20260914/f6/verification.json` 与 `f6.1/verification.json`。

### 3.0.5.1 F7 普通消费观察（development）

F9 回查修正了 F6.1 的已执行脚本限制：实际 read/write 操作也可提供 `requires-model-processor` 骨架，处理器缺失时直接执行失败，不预填领域算法或伪造 source 贡献。无关 source executable 不抑制该候选；每份 evidence 独立推导并附 `evidenceIndex`，不把不同运行拼成一个流程。模型须按来源选择边界、生成处理器，并把采用的普通脚本移出只读 `.optimize/` 后修正 package-root 绑定，再提交动作和验证。新入口未观察到 argv、但输入及输出有捕获来源时，validation completion 只提供待修 args 的保真候选，通过既有一次 repair 补接口；空 args 不自动执行。缺省 `validation.cases` 按空列表保留待修元数据，不吞掉整个动作。证据见 `results/skill-ir/general-generation-reinforcement-20260914/f9/shared-generation-repair-verification.json`；这些局部回归仍不能替代真实程序生成或自然消费。

`analyzeSkillConsumption` 现在从 `AgentStep` 的结构化 `argv`、`program + args` 或保守解析的单一 shell 命令中识别入口。它只剥离已知 skill 根前缀并比较规范化完整路径；echo/cat 提及、同名异目录和带管道/重定向/嵌套 shell 的模糊字符串不会成为已执行证据，而会保留未知 tool-call ID。入口集合来自优化 package 的 selected implementations；未声明入口时集合为空，不隐含 `api-task-solidify.js`。

F9 消费前复核补修：development runner 同时传入实际部署包的绝对 SKILL 路径与相对路径，避免绝对 argv 被漏判，其他目录的同名程序仍不匹配。普通非 help 的 exit-zero 调用可以在独立任务检查与 residual completion 通过时满足消费条件，不再强制 stdout 成功 JSON；`helperSucceeded` 仍专指显式输出断言通过，unknown assertion 不被伪装成 passed。help 即便打印成功 JSON 也不能代替任务执行。

F9.7 暴露的新接口提示冲突已局部修正：模型可以设计并声明普通程序 argv/依赖，不能伪称它们在源 trace 出现；有来源的无评分保真案例足以实际执行候选，但不足以独立任务正确性推荐。缺现成脚本不等于缺运行时。仍不得制造输入、译文或标准答案。

F9.8 的 before/after 案例暴露单来源物化限制。`materializeCase` 对全部输入均为显式 workspace locator、且确实含不同来源的案例，从同一已声明 evidence 分别读 task/pre-run/workdir 字节，保留各 projection 目录及目录 argv，避免同名文件覆盖；单来源仍沿用旧相对路径重写，task fixture 漂移检查不放宽。原 F9.8 提交无需修改即通过一次 help 和一次程序自检；没有独立 assertion，仍为 draft，且 checker 不计产物流。回归入口为 validation-lifecycle 的 mixed projections 案例。

机会 schema 兼容增加 `artifact-production`，要求与 `verification` 独立给出 disposition、连续机械步骤、实际产物和 agent 提供的语义值。生成指令允许消费方确认语义值后由普通程序读入、结构检查和序列化；并不授权生成器伪造验证输入或把自检当 oracle。实际生成能力仍由后续命名尝试判断，不能由提示字符串测试宣称成功。

F9.9 修正上述布局边界：只有 argv 明确使用 projection 路径时才保留命名空间；普通相对 argv 且各来源相对路径不冲突时物化共同根，保持原程序接口。同名冲突又无显式 before/after argv 时 unresolved，不能猜测覆盖顺序。此次首轮生成报告 finalizer，但错误布局导致 repair 去给业务程序增加研究目录搜索，最终回退；该失败说明验证接线问题必须在共享实现修复，不能要求程序适配研究路径。新增 ordinary-root 红例和受影响 79/79 回归已验证，真实后继结果另存。

优化器在清除 `.optimize/` 后把当前完整候选保存到该轮 `recordDir/candidate/`，使后续 repair/rollback 不会丢失模型实际产物字节；超时仍不提升为候选。旧 F9.9 仅能从已成功的 write/edit 事件精确恢复，每份恢复文件均匹配当时 validation binding 的摘要，不能插入开发者编写内容。其首轮报告仅格式保真失败，完整模型 repair 版本经共享布局修复后 help/case 通过，并由现有 exporter 导出 draft。该恢复不回写原 proposal，也不计新增模型生成成功。

报告把 helper invocation、exit status（zero/non-zero/unknown）、output assertion（passed/failed/not-applicable/unknown）、task quality 和 residual completion 分开。exit 0 但没有结构化成功断言的普通脚本记录为正常退出/未断言，不冒充失败或质量通过；未知退出保留 unknown。另行统计 skill read、help、entrypoint discovery、program rewrite 和 program execution 的实际 tool-call ID，便于解释机械工作与残余职责。普通 source/optimized runner 继续只把独立任务检查传给 `taskOutcome`，不从最终文字自证。机器验证见 `results/skill-ir/general-generation-reinforcement-20260914/f7/verification.json`。

### 3.0.5.2 F8 默认入口连续集成（development）

**最小语义验证（2026-09-15）：** 引擎在 `materializeCase` 从观察输出解析 `.json`，通过内部 `expectedFileJson` 交给既有程序验证器，比较 JSON 值而非排版或对象键序；旧仅摘要调用及非 JSON 仍兼容。未授权猜测数组顺序或任意值/类型等价。完整案例执行通过即记录 passed，无独立断言时仍为 draft；未运行和不完整案例继续单列。前运行输入引用与可用性进入已有缓存绑定，防止变化输入复用旧结论。测试入口是 package-validation、validation-lifecycle、production-closure。

消费反馈中发现错误部署前缀与例行清单审阅；共享 prompt 和新导出 usage 明确脚本相对 SKILL.md 所在目录，不要求正常消费者读取 manifest/validation report 或重复 hash 审计，不再假定每个程序 exit 2 都是不适用。旧包不回写。F9 同一报告 finalizer 四次任务调用成功，八个单元语义复评通过，但总体开销增加，效果为 negative；该结论不外推为生成能力或普遍优化收益。

F9 恢复修复：Windows 超长 validation cwd 可导致 `uv_spawn` 对实际存在的 Node 报 ENOENT；同一运行的 help/短 cwd 成功不能被解释为运行时缺失。验证器仅在长 cwd 启动时使用临时 junction，证据路径、输入字节和断言仍绑定原目录，结束后移除链接而不移动证据。优化器以 `throwOnError=false` 接收已结束的失败结果，先保存 stdout/stderr、prompt 和 `run-result.json`（退出状态、耗时、observed token、reported cost），再抛失败，绝不采纳超时的候选。Pi 会话抛异常时也保留已观察事件；未返回调用的费用仍 unknown，reported zero 不等于实际免费。历史丢失事件无法由此追补。

F8 将上述操作索引、validation completion、单次 metadata repair、程序检查、包导出和消费观察保持在同一默认
`run --prompt --skill --workdir --model --optimize` 链路中。自然任务闭环测试使用真实临时文件和临时工作目录；确定性
测试覆盖无 validation 时只从完整观察补接线、模型才能决定的参数留在一次 repair、以及缺少输出/语义依据时保持
`unresolved`。同一导出包在不同消费目录、cwd 和输入值中运行，旧包和历史结果不替代本轮产物。

CLI 现在共同打印 source 状态（含 timeout/adapter failure）、capture 状态、optimization phase；已导出包还打印
action-local program validation scope 与 program/case/independent-case 计数。`no-change`、接线不完整和程序检查失败
不再折叠成同一“完成”。普通非 optimize 路径遇到 source timeout 或 adapter crash 会持久化失败 session 并返回非零退出码，
即使适配器留下了部分输出。机器证据见 `results/skill-ir/general-generation-reinforcement-20260914/f8/verification.json`。
这些测试的 provider 是本地替身，不计真实模型优化成功；仍不建立整 skill/API 正确性、效果、readiness、prospective、
held-out 或人工节省主张。

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

本节是早期 artifact development 的机制快照。i18n 首轮 static identity 的 timeout/parse-failed 与后继 v4 的质量回归分开保留，演进见 [pilot 结果](real-skill-pilots.md#10-intake-顺序)。Env 后续 reviewed-AOT 的效率结果见 §14；当前开发任务仍以 [current-status](current-status.md) 为准。

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

### 14.1 构造实现与证据层次

以下是旧 AOT 构造链的组件演进。版本化报告保留全部分母、失败、人工字段和未观测项；本文只保留职责、结果边界及恢复入口。

| 组件/阶段 | 已实现的职责 | 该阶段的结果入口 |
|---|---|---|
| BIDS construction（18.18） | 手写 compiler + 声明式 adapter 进入相同成本 capture；10 human minutes、23 adapter LOC、core delta 0 | [construction](../../results/skill-ir/bids-prospective-construction-v1/)；后续 measurement-invalid 见 [pilot](real-skill-pilots.md#10-intake-顺序) |
| source-only candidate（18.26） | 从 source 生成 contract、IR、validation plan 和 non-executable package | [shadow](../../results/skill-ir/automatic-construction-shadow-v1/report.json)：7/7 candidate，0/7 eligibility，缺 task ABI 与领域执行语义 |
| 薄 task declaration（18.27） | 输入/输出路径、形状及封闭 pass predicate 接入构造；source audit 与独立 verifier 验绑定 | [domain construction](../../results/skill-ir/automatic-domain-construction-shadow-v1/report.json)：19 条结构 predicate、21 条领域 predicate，7/7 semantic parity 未建立 |
| structural execution（18.28） | initial manifest、精确输出集合、JSON shape 和 bundled checker 经公共 runtime 执行 | [structural shadow](../../results/skill-ir/automatic-structural-execution-shadow-v1/report.json)：33 隔离场景；仅 2 个 exact projection 建立局部 parity，包只检查、不生成任务产物 |
| source-field projection（18.29） | 唯一同名 public JSON 字段 → 声明输出 pointer；其它项留 unresolved | [output shadow](../../results/skill-ir/automatic-output-construction-shadow-v1/report.json)：3 files/3 fields，15 unresolved，2/2 package validation-failure |
| copy-json-value（18.30） | additive pointer operation 读取真实 workdir；继续检查结构与 relation | [pointer shadow](../../results/skill-ir/automatic-json-pointer-construction-shadow-v1/report.json)：unresolved 15→12；领域 runtime floor 仍为 10，eligibility 0/2 |
| Restricted Domain Plan（18.31–18.36） | 模型写有界数据流 plan，静态类型/namespace/output 检查后交确定性解释器 | 诊断演进见下表；结构正确与完整领域产物分别记录 |

这些模块遵守同一边界：声明与 package 不包含 evaluator/gold/held-out 或逐例答案；源文件值在运行时读取；通用 core 不按 skill/case 名特判。手工 evaluator 的 `exact`、`manual-stricter`、`domain-bundled` projection 分开，只有 exact 的同一 predicate 可用于局部 parity。人工分钟和 LOC 按各阶段口径分列，不能把重叠片段相加成完整自动化成本。

### 14.2 Plan 生成的故障与修复

| 阶段 | 原始发现与后继验证 | 结果 |
|---|---|---|
| 18.31 | Env/Law 均在 strict plan 形成前 provider-or-parse；0/2 synthesis、0/4 workdir，失败 usage 不可用 | [原失败](../../results/skill-ir/automatic-domain-plan-shadow-v1/) |
| transport qualification | 单次 canonical forced-tool exact-match，632 input/134 output tokens；只排除持续 transport blocker | [transport](../../results/skill-ir/automatic-domain-plan-transport-qualification-v1/) |
| 18.33–18.35 | task-bound Env plan 触发 template-binding-type，仅部分输出；旧 evaluator 从 0/6 到 1/6。Law 单次新生成仍无合法 plan | [attribution](../../results/skill-ir/automatic-domain-plan-attribution-v1/)、[inspection](../../results/skill-ir/automatic-domain-plan-semantic-inspection-v1/)、[parity](../../results/skill-ir/automatic-domain-plan-manual-parity-v1/)、[Law](../../results/skill-ir/automatic-domain-plan-single-generation-v1/) |
| 18.36 | typed tool/static/namespace 修复后，两 workdir 均完整执行且各有 3/3 输出；领域检查仍只有 3/6，schema 与 .env.example 内容不完整 | [generic repair](../../results/skill-ir/automatic-domain-plan-generic-repair-env-2026-08-25/report.json) |
| 18.37 | 保留原 plan，独立 125 LOC review patch 将 auto-only 3/6 补至 6/6；8 human minutes 单列 | [reviewed closure](../../results/skill-ir/review-required-env-2026-08-26/) |

Generic repair 解决的是必错类型流与缺输出；review patch 解决的是领域内容。二者分别计量。Review patch 只读公开 source/workdir/task/contract，写已声明输出并保留 protected inputs；review 成功没有改变自动构造的资格。

### 14.3 Reviewed-AOT 成本与中断恢复

效率实验沿用同一 reviewed artifact，production 与 research 两账独立。新 construction authority 实测 one-time `compile/profile/package=9358/0/0` tokens；人工 review 的 8 分钟/125 LOC 另列，旧 `manual-existing` 的 missing 不回填。

| 身份 | 实际终态 | 保留的工程要求 |
|---|---|---|
| [v1](../../results/skill-ir/env-manager-reviewed-aot-efficiency-v1/) | 6/8 prefix；第 7 行外部中断，usage 不可恢复，invalid-for-efficiency | 在副作用前记录 dispatch；未知完成保留，不能重发补齐成本 |
| [v2](../../results/skill-ir/env-manager-reviewed-aot-efficiency-v2/) | detached worker 的 qualification 通过，但 status 调 materializer 删除活动输入，prefix 1/8 | 观察必须只读；身份校验与 materialization 分离 |
| [readonly-serial-001](../../results/skill-ir/env-manager-reviewed-aot-efficiency-readonly-serial-001/) | 8/8 records、4/4 pairs，quality equivalent，0 regression；original 202010 tokens、reviewed runtime 0 | 单一 foreground writer；prepared/dispatched/terminal/prefix 顺序保留；仅恢复已确定完成的窗口 |

Read-only control 由 `reviewed-aot-efficiency-readonly-control*.ts` 暴露 status/collect；生产 materialization 与写入由 `reviewed-aot-efficiency-readonly-serial-run.ts` 管理。Prepare 在派发前物化，execute 只消费冻结计划，观察入口不调用 plan builder。资格使用真实 materialized case 和并发读核对，单纯静态 import 检查不足以证明只读。

Readonly-serial 的公共 cost builder 得到 break-even=1 call、production/all-attempt 完整，支持该切片的 `efficiency-positive`。其中的 case-local review 仍是明确人工步骤，automation gate 不因效率正例提升。各身份的资格和执行命令保留在当时 Git/报告中；日常检查不向旧目录再次运行 freeze/prepare/execute。只读恢复规则与质量 authority 见 [评估 §11.4](evaluation-system.md#114-只读-control-plane-资格)。

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
