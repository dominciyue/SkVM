# Skill IR 文档治理设计

**日期：** 2026-09-13

**状态：** review revision 2，待书面设计复核
**范围：** `docs/skill-ir/` 的权威文档、历史恢复入口和文档检查合同

## 1. 目标

把当前 84 份已跟踪的 `docs/skill-ir/*.md` 收敛到约 14 份长期维护文档，并同时解决三个问题：

1. `current-status.md` 成为唯一当前入口，准确反映 2026-09-13 的 U0–U5 路线；
2. 上手、当前计划、研究方法、组件说明、历史与机器证据各归其位；
3. 停止把同一执行流水复制进 README、spec、plan、developer guide、status、handoff 和 conversation log。

治理不改代码、冻结结果、实验身份、research claim 或 U0–U5 的工程状态。历史正文由 Git 保存，机器事实由
`results/skill-ir/` 保存；删除旧 Markdown 不等于删除证据。

## 2. 当前问题

截至治理前：

- `current-status.md` 与 `developer-guide.md` 最后实质更新停在 2026-09-09；
- spec、plan、`deadline-execution-status.md` 和 conversation log 已切到 2026-09-13 U0–U5；
- plan 又把 `deadline-execution-status.md` 称为唯一执行入口，形成两个“唯一入口”；
- README 的当前结论与下一步仍以 2026-09-09/10 的 operation research 路线为主；
- 84 份文档中大量文件是一次性 development plan、status、failure record、结果复述或历史接力点；
- spec 与 plan 分别达到约 2300 行，developer guide 约 2000 行，已再次兼任历史日志；
- `experiment-results.md` 复述机器结果，和 `results/skill-ir/` 的权威职责重叠。

## 3. 权威职责

治理后的信息流固定为：

```text
README（导航）
  -> current-status（唯一当前事实与命令）
      -> plan（当前 U0–U5 任务）
      -> spec（方法、边界、成功条件）
      -> component docs（当前接口与运行方式）
      -> evidence-index（claim 到 results 的索引）
      -> history（历史路线与 Git 恢复）
```

职责规则：

- spec 管研究问题、方法、术语、不可跨越的边界、成功条件和 claim contract；
- plan 只管当前未完成任务、顺序、验收和停止条件；
- current status 管“现在能做什么、正在做什么、运行什么”；
- developer guide 管稳定的安装、开发、测试和故障处理方法；
- component docs 管当前公共接口，不记录逐次提交过程；
- results 目录管运行证据、分母、成本、失败和 digest；
- evidence index 只把可辩护 claim 映射到机器证据，不复制结果表；
- history 只保存决策级时间线和旧路径/提交恢复方法；
- handoff、communication、conversation log 只记录本阶段一句话状态、决定和验证，不再复制任务全文。

## 4. 保留的 14 份文档

| 文档 | 唯一职责 | 目标形态 | 软上限 |
| --- | --- | --- | ---: |
| `README.md` | 文档地图与最短阅读路径 | 简短导航，不含状态长文 | 120 行 |
| `current-status.md` | 唯一当前入口 | 当前能力、限制、活跃任务、命令、权威链接 | 200 行 |
| `developer-guide.md` | 稳定上手与开发手册 | 安装、目录、命令、测试、Git、故障处理 | 350 行 |
| `skill-ir-aot-optimization-spec.md` | 当前研究契约 | 方法、边界、稳定 claim ID、成功条件 | 900 行 |
| `skill-ir-aot-optimization-plan.md` | 当前执行计划 | 仅未完成任务、验收与停止条件 | 250 行 |
| `history.md` | 决策级历史和恢复索引 | 日期、路线结论、旧路径、commit/result 路径 | 500 行 |
| `ir-core.md` | IR schema/parser/validator/pass/lowering | 当前接口与验证 | 500 行 |
| `optimization-and-artifacts.md` | Final IR、artifact 与 runtime | `skvm artifact`、preset 产品链和失败边界 | 600 行 |
| `evaluation-system.md` | corpus、runner、scorer、gate | 当前评估合同、B 协议与隔离规则 | 700 行 |
| `real-skill-pilots.md` | 真实来源、portfolio 与 pilot 生命周期 | 当前选择和来源规则 | 350 行 |
| `api-task-engine.md` | API 合同任务引擎 | TaskContract/request/pytest/checker 当前公共接口 | 500 行 |
| `classification-and-routing.md` | requirement/step 分类与路由 | v2 handbook、职责家族、Q1 发放边界 | 450 行 |
| `external-skill-import.md` | 外部 skill staging bundle | 当前导入接口与边界 | 250 行 |
| `evidence-index.md` | claim ID 到机器证据的索引 | 精简替代结果长文与 claim 表 | 350 行 |

这些文档不按原文拼接。每份保留文档重新按当前职责编写，只吸收仍有效且无法从代码、结果或 Git 直接恢复的内容。
软上限不是通过删掉必要合同来达标；超过时先拆掉执行流水、重复结果和历史状态。确有不可压缩的公共合同可在变更说明中
解释，但不得以“后续再清理”为由持续追加。

## 5. 合并映射

### 5.1 API 合同任务引擎

下列当前仍有用的接口、限制和验证方法提炼到 `api-task-engine.md`：

- `skill-family-current-v2-source-repair.md`；
- `api-tester-production-binding.md`；
- `api-tester-operation-admission.md`；
- `api-tester-operation-delivery-freeze.md`；
- `api-request-specimens-development.md`；
- `api-request-form-specimens-development.md`；
- `api-request-body-negatives-development.md`；
- `api-request-cases-development.md`；
- `api-response-schema-development.md`；
- `api-response-headers-development.md`；
- `api-pytest-request-development.md`；
- `api-pytest-wire-loopback-development.md`；
- `api-loopback-transport-verification.md`；
- schema branch/composition/decimal/cache 与 input decoding 小文档。

保留内容仅包括当前命令、TaskContract、source closure、request-json/pytest backend、checker、loopback、支持面、
已知 U1/U2 缺口和测试入口。每次 development 的选择、提交、失败修复和数字转到 history/evidence 链接。

### 5.2 分类与路由

下列内容合并为 `classification-and-routing.md`：

- `classification-handbook-v2.md`；
- `q1-development-annotation-package-v2.md`；
- `q1-human-annotation-walkthrough-v2.md`；
- `answer-availability-taxonomy.md`；
- `classification-and-automation-next-stage-proposal.md`；
- `sample-scale-and-automation-scope-analysis-2026-09-07.md`；
- `ai-assisted-development-routing-and-prospective-construction.md` 中仍有效的 provenance 和用途边界。

v1 handbook 只保留 Git 历史。新文档明确 Q1 未完成人工标注、AI revision-2 仅是 development route、四状态与
三层自动化边界，不把旧提案继续写成当前计划。

### 5.2.1 仍有效方法合同的明确去向

| 现有方法合同 | 保留文档 | 必须保留的当前接口/边界 |
| --- | --- | --- |
| `public-skill-responsibility-corpus.md` | `classification-and-routing.md` | source/body exposure、去重、职责单位、选择边界和机器入口 |
| `public-structure-offline-family-contract.md` | `classification-and-routing.md` | family membership、constructibility/current support、dependency propagation 和反例 |
| `skill-duty-extraction-development.md` | `classification-and-routing.md` | source-grounded duty extraction 输入、输出、适用范围和未建立的语义自动化 |
| `skill-family-heldout-evaluation.md` | `evaluation-system.md` | held-out 选择/冻结/执行隔离、公开函数、失败条件 |
| `skill-family-minimum-delivery.md` | `evaluation-system.md` | minimum-delivery method gate、分母、freeze/held-out 顺序和历史负结果边界 |
| `api-tester-human-effort-successor.md` | `evaluation-system.md` | B successor 的平衡对照、计时单位、质量门和未执行状态 |
| `api-tester-trace-public-answer-protocol.md` | `evaluation-system.md` | public answer/trace/parity schema、calls 口径、smoke stop 和旧 identity 冻结边界 |
| `skill-family-class-proof-002.md` | `evaluation-system.md` | class-proof stage contract、状态机、evidence roles 和恢复所需公共入口 |
| `skill-family-new-member-method.md` | `classification-and-routing.md` | 固定方法的新成员选择与 source exposure 边界 |

表中接口必须从现有文档和实现核对后重写，不能只把文件名列进 history。一次运行的数值、提交和事故不进入当前接口段。

### 5.3 证据与历史

`experiment-results.md` 与 `claim-evidence-table.md` 压缩为 `evidence-index.md`。索引只记录：

- claim 名称；
- 最窄适用范围；
- 权威 `results/skill-ir/...` 路径；
- 不允许的外推。

API operation research、class proof、minimum delivery、new-member、model comparison、clean replay、source repair、
recovery、status、final report 等一次性 Markdown 的决策级结论进入 `history.md`；细节从冻结 result 和 Git commit 恢复。

Spec 第 14.x 节中的稳定 claim 编号保留。治理可以压缩每个 claim 的执行叙事，但不能重排、复用或删除仍被论文、handoff、
plan 或 evidence 引用的 claim ID。`evidence-index.md` 的主键固定为 `claimId`，每行只包含最窄范围、权威 result 路径、
状态和禁止外推；解释 claim 本身仍由 spec 负责。

### 5.4 稳定架构文档

`ir-core.md`、`optimization-and-artifacts.md`、`evaluation-system.md` 和 `real-skill-pilots.md` 保留，但删除其中的
逐任务追加段，改成当前结构、公共类型、运行流、测试、假设和失败模式。跨文档重复的 claim、stage status 与结果数字
改为链接 `current-status.md` 或 `evidence-index.md`。

`api-task-engine.md` 固定只有七个主体章节：CLI/TaskContract、source closure、request-json/pytest backend、独立 checker、
支持面、已知缺口、测试入口。`skvm artifact` 的通用产品链以及 Magpie/Env preset 只在
`optimization-and-artifacts.md` 说明，API 引擎只链接，不复制产品链。

### 5.5 外部导入

保留 `external-skill-import.md` 的当前合同和使用方式。已完成的 `external-skill-import-plan.md` 删除；计划原文由 Git
恢复，不进入当前 plan。

## 6. 删除与恢复策略

除第 4 节列出的 14 份外，当前已跟踪的 `docs/skill-ir/*.md` 均退出现行文档集。执行时：

1. 先生成新/重写后的 14 份文档；
2. 把退出路径加入 `scripts/skill_ir_legacy_doc_paths.txt`；
3. 修正所有仍保留的源码、脚本、计划、结果摘要和文档中的活动引用；
4. 不改写冻结 JSON 中嵌入的历史输出；必要时只为精确不可变 source-target pair 扩充 retired-reference manifest；
5. 使用 `history.md` 列出旧主题、旧路径和推荐的 `git log`/`git show` 恢复方式；
6. 删除已跟踪旧 Markdown；不触碰未跟踪的 `docs/skill-ir/1.md`。

删除顺序固定为“14 份新权威文档与引用迁移全部通过检查，再删除旧文件”。截至 review revision 2 的 Git 核验，
用户点名的七份活方法文档均已跟踪；`docs/skill-ir/` 下唯一未跟踪 Markdown 是 `1.md`。若实施前状态发生变化，先重新分类
新增未跟踪 Markdown；不覆盖、不删除、不顺带提交任何用户文件或未完成工程说明。

`history.md` 的恢复表是删除前硬门。每个退出路径必须记录：旧路径、最后包含该文件的 commit、一句话主题、合并目标、
权威 `results/` 路径（存在时）。没有机器结果的设计/计划明确写 `none; recover via Git`，不能虚构 result。

不建立 `docs/skill-ir/archive/`，因为那会保留第二套可被误认为当前权威的文档树，并继续增加链接维护成本。

## 7. 唯一当前入口合同

`current-status.md` 固定包含以下章节：

1. `更新时间`、分支和状态来源说明；
2. `现在能做什么`：仅列当前已实现、可运行的入口；
3. `当前基线`：列活跃任务实际消费的 before/当前机器基线，并链接权威结果；
4. `当前计划`：从当前 plan 链接活跃 taskbook，并写与 taskbook 一致的实时状态；
5. `直接运行`：普通 artifact task、focused tests、typecheck、文档检查；
6. `现在不能声称什么`：prospective、held-out、full automation、跨模型/平台、未测人工节省；
7. `按职责继续阅读`：spec、plan、developer guide、component、evidence、history。

只有该文件可以使用“唯一当前入口”“当前下一步”这一项目级语义。其他带日期的状态、final report 或 taskbook 都必须说明
它们是历史快照、证据或任务书，不自称项目当前状态。日期、路线名和 `planned/running/completed` 都是可替换快照，不是测试常量；
路线切换时整页替换当前段，并与 plan/taskbook 同一变更同步。

## 8. 开发指南合同

`developer-guide.md` 前部只保留：

- 当前项目定位和能运行的普通入口；
- 环境与依赖；
- 目录地图；
- 最小 request-json/pytest 工作流；
- 修改 API engine、IR、artifact、evaluator 的入口；
- focused test、typecheck、doc check 与 Git 边界。

Stage M/N、P0–P3、Q1/Q2 历史接力、paid identity、事故恢复和已完成 task checklist 不再留在指南正文。需要时由
`history.md`、`evidence-index.md` 和对应 result 提供链接。

## 9. 防止再次膨胀

根目录 `D:\skill优化\AGENTS.md` 与仓内 `SkVM/AGENTS.md` 必须在写 14 份权威文档前先改。新启动合同如下：

| 位置 | 旧规则 | 新规则 |
| --- | --- | --- |
| Startup 入口 | 先全文读 handoff、communication、spec、plan | 先读 AGENTS、`current-status.md` 和实时 Git；按 current status 只读活跃 plan/taskbook 与本次涉及的 spec claim/组件段 |
| Spec/plan 阅读 | 每次完整读取 | 只有方法、claim 或任务边界受影响时读相关章节；不把历史长文重新塞入上下文 |
| Component 文档 | 组件缺文档就新建 | 默认更新 14 份中职责匹配的现有文档；只有现有职责无法承载时才新增，并在同一变更中说明边界及维持 12–18 预算 |
| Stage logging | 多份总文档同步执行摘要 | conversation log 只写日期、文件、决定、验证、风险；handoff/communication 只写当前恢复信息或长期决定，不复制流水 |
| 当前语义 | plan、status、handoff 可各自声明当前入口 | `current-status.md` 是唯一项目当前入口；plan 管当前任务，dated taskbook 管步骤，handoff 只指向 current status |

README 与两份 AGENTS 再加入以下维护规则：

- 新功能默认更新已有 component doc；不为单轮 plan、status、failure、review、replay 或 result 新建 Markdown；
- 新长期组件文档必须同时说明为什么现有 14 份无法承载，并保持总数预算；
- plan 完成后只把决策摘要写入 history，完整计划留在 Git；
- result 的数字与分母只写机器结果，文档使用链接和最窄摘要；
- current status 每次路线切换时替换更新，不追加旧状态；
- handoff/communication/log 不复制 spec、plan 或结果正文。

文档预算为 12–18 份，不设机械硬失败；超出时必须在同一变更中合并或说明新的长期职责边界。

## 10. 验证

治理完成必须满足：

```powershell
python -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py --root .
git diff --check
```

并增加/执行治理不变量检查，至少证明：

- `git ls-files docs/skill-ir/*.md` 为 12–18 份；
- 只有 `current-status.md` 含项目级“唯一当前入口”；
- `current-status.md` 具有规定的七段结构，且所链活跃 plan/taskbook 存在；不把日期、路线名或阶段状态写死为测试常量；
- developer guide 不再含旧“当前接力点”、Stage M/N 执行流水；
- plan 不再含 N0–N15 的逐步执行日志；
- spec 不再含逐提交/逐 attempt 流水；
- spec 仍保留所有被 tracked 文件引用的稳定 claim ID，evidence index 的 claimId 可解析到 spec；
- 所有退出路径已列入 legacy 清单；
- 未跟踪 `docs/skill-ir/1.md` 未修改、未暂存。

另加 tracked source 引用硬门：对 Git 已跟踪的 TypeScript/Python 扫描 `docs/skill-ir/*.md` 字面路径；除链接检查自身的
测试 fixture 外，每个命中必须指向 14 份保留文档，或属于精确列名、明确不再运行的历史 fixture。仍可运行的脚本、测试和
库代码不得依赖 legacy/retired 文档路径，不能用 retired-reference manifest 掩盖。当前已核实的迁移点至少包括：

- `scripts/skill-ir/api-request-specimens-development.ts`；
- `scripts/skill-ir/skill-family-class-proof.ts`；
- `scripts/skill-ir/skill-family-current-v2-prospective.ts`；
- `src/skill-ir/skill-family-current-v2-n10-revision.ts`；
- `src/skill-ir/skill-family-current-v2-readiness.ts`；
- `src/benchmarks/skill-ir/task-automation-annotation-package.test.ts`。

这些路径修改必须保持其 evidence/digest 语义：若某个历史 verifier 有意核验旧提交中的文档 closure，不把常量直接改成新路径；
应将该 verifier 明确归为历史入口、让当前运行路径改用结果或新权威文档，并增加针对性测试。

本次会修改可执行源码中的文档路径，因此必须先为治理检查和受影响路径写失败测试，再改引用；运行受影响的 TypeScript 测试、
完整 typecheck 和文档检查。仍不重跑历史实验、付费调用或冻结结果。

## 11. 提交边界

实施使用一个聚焦 SkVM 提交；若“先建 14 份、后删旧文档”的中间状态需要 checkpoint，可使用两个连续聚焦提交，
但最终必须作为同一治理阶段验证。显式暂存：

- 14 份保留文档及新名称；
- 退出的旧 Markdown；
- legacy/retired reference 清单；
- 文档检查测试或治理不变量脚本；
- root handoff、communication、conversation log 的简短同步不在 SkVM Git 提交内。

提交前检查 staged path，不纳入 `docs/skill-ir/1.md`、raw/model-run/workdir、cache 或其它历史未跟踪材料。提交后推送
`origin/skill-ir-aot`，不推 `upstream`。

`docs/superpowers/` 不计入 14 份预算，也不迁入 `docs/skill-ir/`。保留的 dated taskbook 是 plan 链接的步骤文档，不是
项目状态页；active U0–U5 taskbook 回链 current status 与 current plan。历史 taskbook/design 通过日期和 legacy source
policy 保持历史语义，必要时列为 legacy source，不能因其中旧目标制造活动链接。本设计实施后也转为 dated design record，
不能声明当前路线。`skill-ir-aot-optimization-plan.md` 不再链接 `deadline-execution-status.md` 作为唯一入口。

仓库外 `D:\skill优化\AGENTS.md`、`project_handoff.md`、`project_communication.md` 和 `conversation_log.md` 与治理同阶段
更新，但不进入 SkVM commit：AGENTS 采用第 9 节启动合同；handoff 只记录 current-status 路径、HEAD 和恢复动作；
communication 只记长期职责决定；conversation log 只记本次文件、验证与风险。

## 12. 现有 84 份文档逐项处置表

“合并后退出”表示先把仍有效合同写入目标文档、验证引用，再删除旧路径；“历史退出”表示当前接口不再依赖正文，
只写 history/evidence 恢复行。每个退出文件都必须进入 legacy 路径清单。

| 现有路径（`docs/skill-ir/` 下） | 处置 | 目标 | 保留内容 |
| --- | --- | --- | --- |
| `README.md` | 保留重写 | `README.md` | 导航、阅读路径、维护规则 |
| `ai-assisted-development-routing-and-prospective-construction.md` | 合并后退出 | `classification-and-routing.md` | AI route provenance 与非人工证据边界 |
| `answer-availability-taxonomy.md` | 合并后退出 | `classification-and-routing.md` | 回顾路由及结果类型边界 |
| `api-loopback-transport-verification.md` | 合并后退出 | `api-task-engine.md` | loopback 适用风险和验收 |
| `api-pytest-request-development.md` | 合并后退出 | `api-task-engine.md` | pytest backend/runtime 当前合同 |
| `api-pytest-wire-loopback-development.md` | 合并后退出 | `api-task-engine.md` | wire 保真与 unsupported 控制 |
| `api-request-body-negatives-development.md` | 合并后退出 | `api-task-engine.md` | body negative 支持面和缺口 |
| `api-request-cases-development.md` | 合并后退出 | `api-task-engine.md` | 共享 request case/oracle 合同 |
| `api-request-form-specimens-development.md` | 合并后退出 | `api-task-engine.md` | form 编码支持面和空 form 缺口 |
| `api-request-specimens-development.md` | 合并后退出 | `api-task-engine.md` | offline request specimen 接口 |
| `api-response-headers-development.md` | 合并后退出 | `api-task-engine.md` | response header observation 合同 |
| `api-response-schema-development.md` | 合并后退出 | `api-task-engine.md` | response schema checker 合同 |
| `api-schema-branch-negative-development.md` | 合并后退出 | `api-task-engine.md` | branch-sensitive negative 边界 |
| `api-schema-compile-cache-development.md` | 合并后退出 | `api-task-engine.md` | compile reuse 当前行为 |
| `api-schema-composition-property-verification.md` | 合并后退出 | `api-task-engine.md` | finite composition oracle |
| `api-schema-decimal-development.md` | 合并后退出 | `api-task-engine.md` | decimal multipleOf 正确性边界 |
| `api-tester-human-effort-successor.md` | 合并后退出 | `evaluation-system.md` | B successor 设计和未执行状态 |
| `api-tester-operation-admission.md` | 合并后退出 | `api-task-engine.md` | operation universe/admission/source closure |
| `api-tester-operation-delivery-freeze.md` | 合并后退出 | `api-task-engine.md`、`history.md` | ordinary input 当前接口；freeze 过程进历史 |
| `api-tester-operation-delivery-verification-retry.md` | 历史退出 | `history.md` | CRLF retry 结论和 Git/result 恢复 |
| `api-tester-operation-development-final-report.md` | 历史退出 | `evidence-index.md`、`history.md` | 最窄结论和机器报告入口 |
| `api-tester-operation-development-status.md` | 历史退出 | `history.md` | 最后状态快照 |
| `api-tester-operation-mechanism-ablation-results.md` | 历史退出 | `evidence-index.md` | 消融结论与结果路径 |
| `api-tester-operation-mechanism-ablation.md` | 合并后退出 | `evaluation-system.md` | 消融方法合同；执行过程进历史 |
| `api-tester-operation-prospective-reproduction.md` | 历史退出 | `history.md` | 旧 clean reproduction 命令索引 |
| `api-tester-operation-prospective-research-results.md` | 历史退出 | `evidence-index.md`、`history.md` | 终态研究结论和 result 路径 |
| `api-tester-operation-prospective-research-status.md` | 历史退出 | `history.md` | 终态快照与停止原因 |
| `api-tester-operation-prospective-research-synthesis.md` | 合并后退出 | `evaluation-system.md` | synthesis authority 接口；结果进 evidence |
| `api-tester-operation-prospective.md` | 合并后退出 | `evaluation-system.md` | prospective 隔离/停止合同 |
| `api-tester-production-binding.md` | 合并后退出 | `api-task-engine.md` | binding v1/v2、CLI、checker、支持范围 |
| `api-tester-successor-gap-analysis.md` | 合并后退出 | `api-task-engine.md` | 当前支持面和仍有效缺口 |
| `api-tester-trace-public-answer-protocol.md` | 合并后退出 | `evaluation-system.md` | B trace/public-answer/parity 合同 |
| `api-tester-v2-feature-migration.md` | 合并后退出 | `api-task-engine.md`、`history.md` | 兼容边界；迁移首跑进历史 |
| `claim-evidence-table.md` | 合并后退出 | `evidence-index.md` | claimId 到证据与禁止外推 |
| `classification-and-automation-next-stage-proposal.md` | 合并后退出 | `classification-and-routing.md` | 三层自动化定义；旧提案进历史 |
| `classification-handbook-v1.md` | 历史退出 | `history.md` | v1 被 v2 取代的决定 |
| `classification-handbook-v2.md` | 合并后退出 | `classification-and-routing.md` | 四状态、单位、依赖和标注合同 |
| `clean-source-gold-path-reproduction.md` | 历史退出 | `history.md`、`evidence-index.md` | clean checkout 结论与证据入口 |
| `current-status.md` | 保留重写 | `current-status.md` | 唯一当前入口七段合同 |
| `deadline-execution-status.md` | 历史退出 | `history.md` | N/D/E 历史恢复记录 |
| `developer-guide.md` | 保留重写 | `developer-guide.md` | 当前上手、开发、验证和故障处理 |
| `development-input-decoding.md` | 合并后退出 | `api-task-engine.md` | UTF-8/input byte fail-closed 合同 |
| `evaluation-system.md` | 保留重写 | `evaluation-system.md` | runner/scorer/gate/B/held-out 方法合同 |
| `experiment-results.md` | 合并后退出 | `evidence-index.md` | claimId 证据索引；数字留 results |
| `external-skill-import-plan.md` | 历史退出 | `history.md` | 已完成计划的 Git 恢复入口 |
| `external-skill-import.md` | 保留重写 | `external-skill-import.md` | staging bundle 当前公共接口 |
| `history.md` | 保留重写 | `history.md` | 决策时间线与逐路径恢复表 |
| `ir-core.md` | 保留重写 | `ir-core.md` | IR 当前公共接口 |
| `multi-model-stage-m-panel.md` | 历史退出 | `evaluation-system.md`、`history.md` | 跨模型方法边界；旧 identity 不执行 |
| `optimization-and-artifacts.md` | 保留重写 | `optimization-and-artifacts.md` | artifact 产品链与 preset |
| `project-reassessment-2026-09-06.md` | 历史退出 | `history.md` | 治理/路线转向决定 |
| `public-skill-responsibility-corpus.md` | 合并后退出 | `classification-and-routing.md` | 公开职责语料合同 |
| `public-structure-offline-family-contract.md` | 合并后退出 | `classification-and-routing.md` | 责任家族成员与支持合同 |
| `q1-development-annotation-package-v2.md` | 合并后退出 | `classification-and-routing.md` | 24-unit 分母和 A/B 发放边界 |
| `q1-human-annotation-walkthrough-v2.md` | 合并后退出 | `classification-and-routing.md` | 四状态填写与独立标注边界 |
| `real-skill-pilots.md` | 保留重写 | `real-skill-pilots.md` | 来源、portfolio、pilot 生命周期 |
| `sample-scale-and-automation-scope-analysis-2026-09-07.md` | 合并后退出 | `classification-and-routing.md` | 类内自动化和扩样边界 |
| `skill-duty-extraction-development.md` | 合并后退出 | `classification-and-routing.md` | source-grounded duty extraction 合同 |
| `skill-family-class-proof-002.md` | 合并后退出 | `evaluation-system.md` | class-proof 状态机和 evidence roles |
| `skill-family-class-proof-recovery.md` | 历史退出 | `history.md` | 恢复命令和终态边界 |
| `skill-family-clean-reproduction.md` | 历史退出 | `history.md` | request capability clean 复现索引 |
| `skill-family-current-clean-reproduction.md` | 历史退出 | `history.md` | development clean 计划/结果索引 |
| `skill-family-current-results.md` | 历史退出 | `evidence-index.md`、`history.md` | development evidence 导航终态 |
| `skill-family-current-v2-archive-recovery.md` | 历史退出 | `history.md` | clean-002 有界搜索结论 |
| `skill-family-current-v2-clean-replay.md` | 历史退出 | `history.md`、`evidence-index.md` | detached replay 结论和 result |
| `skill-family-current-v2-final-delivery.md` | 历史退出 | `evidence-index.md`、`history.md` | N15 最终结果和入口 |
| `skill-family-current-v2-source-repair.md` | 合并后退出 | `api-task-engine.md` | 当前 TaskContract/API engine 接口 |
| `skill-family-deepening.md` | 合并后退出 | `api-task-engine.md`、`history.md` | 仍有效 API primitives；D 流水进历史 |
| `skill-family-heldout-evaluation.md` | 合并后退出 | `evaluation-system.md` | held-out method contract |
| `skill-family-minimum-delivery.md` | 合并后退出 | `evaluation-system.md`、`history.md` | minimum-delivery gate；运行结果进历史 |
| `skill-family-model-comparison.md` | 合并后退出 | `evaluation-system.md` | matched comparison 当前方法边界 |
| `skill-family-new-member-discovery-revision-2.md` | 历史退出 | `history.md` | discovery revision 2 决定 |
| `skill-family-new-member-discovery-revision-3.md` | 历史退出 | `history.md` | discovery revision 3 决定 |
| `skill-family-new-member-followup-discovery-2.md` | 历史退出 | `history.md` | follow-up discovery 决定 |
| `skill-family-new-member-followup-method.md` | 合并后退出 | `classification-and-routing.md` | correctness 后固定方法边界 |
| `skill-family-new-member-method.md` | 合并后退出 | `classification-and-routing.md` | 新成员选择/暴露/判定方法 |
| `skill-family-plan-review-20260912.md` | 历史退出 | `history.md` | 任务书 revision 2 的设计决定 |
| `skill-family-requirement-audit.md` | 历史退出 | `evidence-index.md`、`history.md` | D1–D9 audit 结论和 result |
| `skill-family-source-relatedness.md` | 合并后退出 | `classification-and-routing.md` | source-body relatedness 判定边界 |
| `skill-family-supplement-resources.md` | 合并后退出 | `real-skill-pilots.md` | pinned supplement/source closure 规则 |
| `skill-ir-aot-optimization-plan.md` | 保留重写 | `skill-ir-aot-optimization-plan.md` | 仅当前未完成任务 |
| `skill-ir-aot-optimization-spec.md` | 保留重写 | `skill-ir-aot-optimization-spec.md` | 方法、边界、稳定 claim ID |
| `stage-n-cross-model-aot-stability-panel.md` | 历史退出 | `evaluation-system.md`、`history.md` | 跨模型设计边界和失败 smoke |
| `work-stop-summary-2026-09-11.md` | 历史退出 | `history.md` | 停止现场与未获得结果 |

实施前用 Git 生成集合差：表中现有路径必须与 `git ls-files docs/skill-ir/*.md` 完全一致；多一项或少一项都先修表，
不能继续写 14 份或删除文件。
