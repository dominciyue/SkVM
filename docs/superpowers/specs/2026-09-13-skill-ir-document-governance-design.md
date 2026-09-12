# Skill IR 文档治理设计

**日期：** 2026-09-13

**状态：** review revision 2，待书面设计复核
**范围：** `docs/skill-ir/` 的权威文档、历史恢复入口和文档检查合同

## 1. 目标

把当前 84 份已跟踪的 `docs/skill-ir/*.md` 收敛为约 14 份当前阅读入口，并仅额外保留仍被程序按路径或摘要读取的
版本化材料。当前路线是 revision 2 的 U0–U7：真实 trace → 模型优化 → 新 skill 包 → agent 实际消费。
治理同时解决三个问题：

1. `current-status.md` 成为唯一当前入口，准确反映 2026-09-13 的 U0–U7 路线；治理开始后的开发线程已启动该路线，
   因而当前快照更新为 U0 completed、U1 active，而不是保留过期的 `planned-not-started`；
2. 上手、当前计划、研究方法、组件说明、历史与机器证据各归其位；
3. 停止把同一执行流水复制进 README、spec、plan、developer guide、status、handoff 和 conversation log。

治理允许修改文档检查器及必要的普通导航引用；不改变构造算法、评价语义、冻结绑定或产品行为，也不实施 U0–U7。
历史正文由 Git 保存，机器事实由 `results/skill-ir/` 保存；删除普通说明 Markdown 不等于删除证据，仍被程序读取的
版本化原件则保持原路径和原字节。

## 2. 当前问题

截至治理前：

- `current-status.md` 与 `developer-guide.md` 最后实质更新停在 2026-09-09；
- spec、plan、taskbook、handoff 和 conversation log 已切到 2026-09-13 U0–U7；
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
      -> plan（当前 U0–U7 任务）
      -> spec（方法、边界、成功条件）
      -> component docs（当前接口与运行方式）
      -> evidence-index（claim 到 results 的索引）
      -> history（历史路线与 Git 恢复）
```

Skill IR 不是整个 SkVM 的项目介绍。`README.md`、`current-status.md` 和 `developer-guide.md` 必须同时导航到仓库级
`docs/architecture.md`、`docs/usage.md`、`docs/jit-boost.md`：前两者分别是总体架构和 CLI 权威，后者解释 trace 驱动的
运行时固化。Skill IR 文档只说明自己的 AOT/验证后端及与 JIT-optimize/JIT-boost 的协作，不复制三份仓库级说明。

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
| `current-status.md` | 唯一当前入口 | 当前能力、限制、U0–U7、命令、权威链接 | 200 行 |
| `developer-guide.md` | 稳定上手与开发手册 | trace→optimize→package→agent、测试、Git、故障处理 | 350 行 |
| `skill-ir-aot-optimization-spec.md` | 当前研究契约 | 方法、边界、兼容章节锚点、成功条件 | 900 行 |
| `skill-ir-aot-optimization-plan.md` | 当前执行计划 | 仅未完成任务、验收与停止条件 | 250 行 |
| `history.md` | 决策级历史和恢复索引 | 日期、路线结论、旧路径、commit/result 路径 | 500 行 |
| `ir-core.md` | IR schema/parser/validator/pass/lowering | 当前接口与验证 | 500 行 |
| `optimization-and-artifacts.md` | Skill IR 产物后端 | Final IR、artifact/preset 与 JIT 优化协作边界 | 600 行 |
| `evaluation-system.md` | corpus、runner、scorer、gate | 当前评估合同、B 协议与隔离规则 | 700 行 |
| `real-skill-pilots.md` | 真实来源、portfolio 与 pilot 生命周期 | 当前选择和来源规则 | 350 行 |
| `api-task-engine.md` | API 合同任务引擎 | TaskContract/request/pytest/checker 当前公共接口 | 500 行 |
| `classification-and-routing.md` | requirement/step 分类与路由 | v2 handbook、职责家族、Q1 发放边界 | 450 行 |
| `external-skill-import.md` | 外部 skill staging bundle | 当前导入接口与边界 | 250 行 |
| `evidence-index.md` | 主张到机器证据的索引 | 精简替代结果长文与 claim 表 | 350 行 |

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

Spec 的 14.x 不是统一 claim ID 体系：它混合阶段、方法合同、历史结果和当前路线。本次不顺便重建研究编号。治理保留 tracked
文档、handoff、论文或 evidence 仍引用的章节号与必要锚点，压缩其执行叙事时给出兼容定位。`evidence-index.md` 分别记录
“主张、最窄范围、权威 result 路径、状态、禁止外推、相关 spec 锚点”；锚点只作定位，不冒充新的 claim 主键。

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

## 6. 说明文档、版本化材料与恢复策略

治理先把文件分成三类，不能用同一删除规则处理：

1. **当前阅读入口：** 第 4 节约 14 份，可重写并更新普通导航；
2. **版本化材料：** 被校验器、合同 JSON、freeze 或可重复运行脚本按路径/摘要读取，退出当前导航但保留原路径和原字节；
3. **普通历史说明：** 当前接口已被合并且无程序字节依赖，进入 legacy 清单并删除，正文由 Git 恢复。

已确认的版本化材料至少包括 Q1 v1/v2 handbook、三个 API specimen development 原件、class-proof 四份 required docs、
current-v2 plan review/archive/clean/final 三份 evidence docs，以及 Q2 sourceRefs 使用的分类提案。实施前必须从 tracked
TS/Python/JSON 重新生成精确清单，不能只依赖本设计的人工枚举。

执行顺序：

1. 先生成新/重写后的当前阅读入口和版本化材料清单；
2. 普通导航引用迁到当前阅读入口，程序字节依赖保持指向版本化原件；
3. 把仅普通历史说明的退出路径加入 `scripts/skill_ir_legacy_doc_paths.txt`；
4. 不改写冻结 JSON 或版本化原件；必要时只为精确不可变 source-target pair 扩充 retired-reference manifest；
5. 使用 `history.md` 列出旧主题、旧路径和推荐的 `git log`/`git show` 恢复方式；
6. 当前入口、方法合同、版本化原件和引用检查全绿后，才删除普通历史说明；不触碰未跟踪的 `docs/skill-ir/1.md`。

截至 review revision 3 的 Git 核验，用户点名的七份活方法文档均已跟踪；`docs/skill-ir/` 下唯一未跟踪 Markdown 是
`1.md`。若实施前状态发生变化，先重新分类新增未跟踪 Markdown；不覆盖、不删除、不顺带提交任何用户文件或未完成工程说明。

`history.md` 的恢复表是删除前硬门。每个退出路径必须记录：旧路径、最后包含该文件的 commit、一句话主题、合并目标、
权威 `results/` 路径（存在时）。没有机器结果的设计/计划明确写 `none; recover via Git`，不能虚构 result。

不建立 `docs/skill-ir/archive/`，因为那会保留第二套可被误认为当前权威的文档树，并继续增加链接维护成本。保留少量原路径
版本化材料不是 archive；它们不进入 README/上手阅读路径，只由合同、检查器和 history 的“版本化输入”表解释。

## 7. 唯一当前入口合同

`current-status.md` 固定包含以下章节：

1. `更新时间`、分支和状态来源说明；
2. `现在能做什么`：现有 JIT-optimize/log/proposal、JIT-boost、Skill IR/API/Env 后端与 artifact 产品链；
3. `当前基线`：U0–U7 尚未启动，当前只有既有 trace/优化/后端能力与历史机器证据；
4. `当前计划`：真实 trace → 模型优化 → 部分固化/文档改进 → 新 skill 包 → agent 消费/效果，链接 active taskbook；
5. `直接运行`：仓库级 `jit-optimize`/proposal/agent 使用入口，以及 Skill IR focused tests、typecheck、文档检查；
6. `现在不能声称什么`：prospective、held-out、full automation、跨模型/平台、未测人工节省；
7. `按职责继续阅读`：spec、plan、developer guide、component、evidence、history。

只有该文件可以使用“唯一当前入口”“当前下一步”这一项目级语义。其他带日期的状态、final report 或 taskbook 都必须说明
它们是历史快照、证据或任务书，不自称项目当前状态。日期、路线名和 `planned/running/completed` 都是可替换快照，不是测试常量；
路线切换时整页替换当前段，并与 plan/taskbook 同一变更同步。

## 8. 开发指南合同

`developer-guide.md` 前部只保留：

- 当前项目定位和 U0–U7 的 trace→optimize→package→agent 主流程；
- 环境与依赖；
- 目录地图；
- 最小真实 trace/log 优化、proposal 检查、新包消费工作流；
- 修改 JIT 接线、API engine、IR、artifact、evaluator 的职责边界；
- focused test、typecheck、doc check 与 Git 边界。

API request/pytest 是 U3 可复用后端，不再充当整个项目的上手主线。指南优先链接 `../architecture.md`、`../usage.md` 和
`../jit-boost.md`；只在进入确定性 API 后端时再链接 `api-task-engine.md`。

Stage M/N、P0–P3、Q1/Q2 历史接力、paid identity、事故恢复和已完成 task checklist 不再留在指南正文。需要时由
`history.md`、`evidence-index.md` 和对应 result 提供链接。

## 9. 防止再次膨胀

根目录 `D:\skill优化\AGENTS.md` 与仓内 `SkVM/AGENTS.md` 必须在写 14 份权威文档前先改。新启动合同如下：

| 位置 | 旧规则 | 新规则 |
| --- | --- | --- |
| Startup 入口 | 先全文读 handoff、communication、spec、plan | 先读 AGENTS、`current-status.md` 和实时 Git；按 current status 只读活跃 plan/taskbook 与本次涉及的 spec claim/组件段 |
| Spec/plan 阅读 | 每次完整读取 | 只有方法、claim 或任务边界受影响时读相关章节；不把历史长文重新塞入上下文 |
| Component 文档 | 组件缺文档就新建 | 默认更新当前职责匹配的现有文档；只有现有职责无法承载时才新增，并说明边界及对建议数量的影响 |
| Stage logging | 多份总文档同步执行摘要 | conversation log 只写日期、文件、决定、验证、风险；handoff/communication 只写当前恢复信息或长期决定，不复制流水 |
| 当前语义 | plan、status、handoff 可各自声明当前入口 | `current-status.md` 是唯一项目当前入口；plan 管当前任务，dated taskbook 管步骤，handoff 只指向 current status |

README 与两份 AGENTS 再加入以下维护规则：

- 新功能默认更新已有 component doc；不为单轮 plan、status、failure、review、replay 或 result 新建 Markdown；
- 新长期组件文档必须同时说明为什么现有当前入口无法承载，并记录对建议数量的影响；
- plan 完成后只把决策摘要写入 history，完整计划留在 Git；
- result 的数字与分母只写机器结果，文档使用链接和最窄摘要；
- current status 每次路线切换时替换更新，不追加旧状态；
- handoff/communication/log 不复制 spec、plan 或结果正文。

当前阅读入口预算建议为 12–18 份，不设机械硬失败；版本化材料单列，不计作当前阅读入口。超出建议值时给出提醒并说明
新的长期职责边界，不得为了过数字门而删除仍在使用的合同原件。

## 10. 验证

治理完成必须满足：

```powershell
python -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py --root .
git diff --check
```

并增加/执行治理检查。下列是硬失败：

- manifest 中的当前入口、版本化材料和普通历史说明三类不重叠，所列现存文件均存在；
- README 的首要 Skill IR 状态链接指向 `current-status.md`，current status 再指向 active plan/taskbook；
- `current-status.md` 具有规定的七段结构，且所链活跃 plan/taskbook 存在；不把日期、路线名或阶段状态写死为测试常量；
- developer guide 不再含旧“当前接力点”、Stage M/N 执行流水；
- plan 不再含 N0–N15 的逐步执行日志；
- spec 只在开发线程没有并发方法修改时压缩逐提交/逐 attempt 流水；并发期间先停止新增复制、迁移导航并输出软行数提醒，
  不用治理线程的旧副本覆盖最新方法；
- spec 保留 tracked 内容仍引用的必要章节号/锚点；evidence index 不把章节号重定义为 claim ID；
- 所有删除的普通历史说明已列入 legacy 清单，所有程序读取的版本化材料仍在原路径；日期化历史 taskbook/spec
  作为 `historicalSources` 跳过导航检查，但仍可被运行源码读取；
- 未跟踪 `docs/skill-ir/1.md` 未修改、未暂存。

下列只输出提醒，不导致失败：当前阅读入口是否超过 12–18 份、单篇是否超过软上限、历史正文是否引用或引用了
“唯一当前入口”这句话。提醒用于发现再次膨胀，不得覆盖真实状态或版本化依赖。

另加 tracked source 引用硬门：对 Git 已跟踪的 TypeScript/Python/JSON 扫描 `docs/skill-ir/*.md` 字面路径。普通导航引用
迁到当前入口；运行时读取必须指向 manifest 中的当前入口或版本化材料。仍可运行的脚本、测试和库代码不得指向已删除的
legacy/retired 文档，不能用 retired-reference manifest 掩盖。当前已核实的审计点至少包括：

- `scripts/skill-ir/api-request-specimens-development.ts`；
- `scripts/skill-ir/skill-family-class-proof.ts`；
- `scripts/skill-ir/skill-family-current-v2-prospective.ts`；
- `src/skill-ir/skill-family-current-v2-n10-revision.ts`；
- `src/skill-ir/skill-family-current-v2-readiness.ts`；
- `src/benchmarks/skill-ir/task-automation-annotation-package.test.ts`。

这些路径必须保持其 evidence/digest 语义：若 verifier 或 JSON 合同按路径/摘要读取旧文档，就把文档列为版本化材料并保持
常量与原字节，不为缩减数量宣布 verifier 不再运行。只有普通导航常量才迁移；变更文档检查器或导航引用时增加针对性测试。

本次会修改可执行源码中的文档路径，因此必须先为治理检查和受影响路径写失败测试，再改引用；运行受影响的 TypeScript 测试、
完整 typecheck 和文档检查。仍不重跑历史实验、付费调用或冻结结果。

## 11. 提交边界

实施使用一个聚焦 SkVM 提交；若“先建 14 份、后删旧文档”的中间状态需要 checkpoint，可使用两个连续聚焦提交，
但最终必须作为同一治理阶段验证。显式暂存：

- 14 份保留文档及新名称；
- 保持原字节的版本化材料清单与退出的普通历史 Markdown；
- legacy/retired reference 清单；
- 文档检查器、manifest、测试及确有必要的普通导航引用源码；
- root handoff、communication、conversation log 的简短同步不在 SkVM Git 提交内。

允许进入提交的代码只限上述检查/导航范围。构造器、optimizer、评价器、freeze verifier 的算法和版本化输入绑定不得因治理
改变；若引用审计证明某路径是运行依赖，就保留材料而不是修改算法绕过。

提交前检查 staged path，不纳入 `docs/skill-ir/1.md`、raw/model-run/workdir、cache 或其它历史未跟踪材料。提交后推送
`origin/skill-ir-aot`，不推 `upstream`。

`docs/superpowers/` 不计入 14 份预算，也不迁入 `docs/skill-ir/`。保留的 dated taskbook 是 plan 链接的步骤文档，不是
项目状态页；active U0–U7 taskbook 回链 current status 与 current plan。历史 taskbook/design 通过日期和 legacy source
policy 保持历史语义，必要时列为 legacy source，不能因其中旧目标制造活动链接。本设计实施后也转为 dated design record，
不能声明当前路线。`skill-ir-aot-optimization-plan.md` 不再链接 `deadline-execution-status.md` 作为唯一入口。

仓库外 `D:\skill优化\AGENTS.md`、`project_handoff.md`、`project_communication.md` 和 `conversation_log.md` 与治理同阶段
更新，但不进入 SkVM commit：AGENTS 采用第 9 节启动合同；handoff 只记录 current-status 路径、HEAD 和恢复动作；
communication 只记长期职责决定；conversation log 只记本次文件、验证与风险。

协作边界：治理线程只负责归并、导航、检查合同和必要的状态指针；最新 taskbook/spec 中的方法决定由开发线程维护。治理提交
前以工作树和最新提交中的 U0–U7 内容为准做局部合并，不整份覆盖共享文档，不改动另一线程的未提交代码。

## 12. 现有 84 份文档逐项处置表

“合并后退出”表示先把仍有效合同写入目标文档、验证引用，再删除旧路径；“历史退出”表示当前接口不再依赖正文，
只写 history/evidence 恢复行；“版本化保留”表示退出当前阅读导航但保持路径和字节，不进入 legacy 清单。

| 现有路径（`docs/skill-ir/` 下） | 处置 | 目标 | 保留内容 |
| --- | --- | --- | --- |
| `README.md` | 保留重写 | `README.md` | 导航、阅读路径、维护规则 |
| `ai-assisted-development-routing-and-prospective-construction.md` | 合并后退出 | `classification-and-routing.md` | AI route provenance 与非人工证据边界 |
| `answer-availability-taxonomy.md` | 合并后退出 | `classification-and-routing.md` | 回顾路由及结果类型边界 |
| `api-loopback-transport-verification.md` | 合并后退出 | `api-task-engine.md` | loopback 适用风险和验收 |
| `api-pytest-request-development.md` | 合并后退出 | `api-task-engine.md` | pytest backend/runtime 当前合同 |
| `api-pytest-wire-loopback-development.md` | 合并后退出 | `api-task-engine.md` | wire 保真与 unsupported 控制 |
| `api-request-body-negatives-development.md` | 版本化保留并提炼 | `api-task-engine.md` | 原件供 N10/candidate 读取；当前支持面进引擎文档 |
| `api-request-cases-development.md` | 合并后退出 | `api-task-engine.md` | 共享 request case/oracle 合同 |
| `api-request-form-specimens-development.md` | 版本化保留并提炼 | `api-task-engine.md` | 原件供 N10/candidate 读取；form 支持面进引擎文档 |
| `api-request-specimens-development.md` | 版本化保留并提炼 | `api-task-engine.md` | 原件供 candidate 读取；当前接口进引擎文档 |
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
| `claim-evidence-table.md` | 合并后退出 | `evidence-index.md` | 主张、范围、证据与禁止外推 |
| `classification-and-automation-next-stage-proposal.md` | 版本化保留并提炼 | `classification-and-routing.md` | Q2 sourceRefs 原件；三层自动化定义进当前文档 |
| `classification-handbook-v1.md` | 版本化保留 | `history.md` | family contract 仍引用；不进当前导航 |
| `classification-handbook-v2.md` | 版本化保留并提炼 | `classification-and-routing.md` | Q1 按路径/摘要读取；四状态进当前文档 |
| `clean-source-gold-path-reproduction.md` | 历史退出 | `history.md`、`evidence-index.md` | clean checkout 结论与证据入口 |
| `current-status.md` | 保留重写 | `current-status.md` | 唯一当前入口七段合同 |
| `deadline-execution-status.md` | 版本化保留 | `history.md` | class-proof required file；不再作为当前入口 |
| `developer-guide.md` | 保留重写 | `developer-guide.md` | 当前上手、开发、验证和故障处理 |
| `development-input-decoding.md` | 合并后退出 | `api-task-engine.md` | UTF-8/input byte fail-closed 合同 |
| `evaluation-system.md` | 保留重写 | `evaluation-system.md` | runner/scorer/gate/B/held-out 方法合同 |
| `experiment-results.md` | 合并后退出 | `evidence-index.md` | 主张证据索引；数字留 results |
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
| `skill-family-class-proof-002.md` | 版本化保留并提炼 | `evaluation-system.md` | class-proof required file；状态机接口进 evaluation |
| `skill-family-class-proof-recovery.md` | 版本化保留 | `history.md` | class-proof required/recovery file |
| `skill-family-clean-reproduction.md` | 历史退出 | `history.md` | request capability clean 复现索引 |
| `skill-family-current-clean-reproduction.md` | 历史退出 | `history.md` | development clean 计划/结果索引 |
| `skill-family-current-results.md` | 版本化保留并索引 | `evidence-index.md`、`history.md` | class-proof required file；当前导航退出 |
| `skill-family-current-v2-archive-recovery.md` | 版本化保留 | `history.md` | current-v2 verifier evidence file |
| `skill-family-current-v2-clean-replay.md` | 版本化保留并索引 | `history.md`、`evidence-index.md` | current-v2 verifier evidence file |
| `skill-family-current-v2-final-delivery.md` | 版本化保留并索引 | `evidence-index.md`、`history.md` | current-v2 verifier evidence file |
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
| `skill-family-plan-review-20260912.md` | 版本化保留 | `history.md` | current-v2 stage manifest/reviewPath 读取 |
| `skill-family-requirement-audit.md` | 历史退出 | `evidence-index.md`、`history.md` | D1–D9 audit 结论和 result |
| `skill-family-source-relatedness.md` | 合并后退出 | `classification-and-routing.md` | source-body relatedness 判定边界 |
| `skill-family-supplement-resources.md` | 合并后退出 | `real-skill-pilots.md` | pinned supplement/source closure 规则 |
| `skill-ir-aot-optimization-plan.md` | 保留重写 | `skill-ir-aot-optimization-plan.md` | 仅当前未完成任务 |
| `skill-ir-aot-optimization-spec.md` | 保留重写 | `skill-ir-aot-optimization-spec.md` | 方法、边界、兼容章节锚点 |
| `stage-n-cross-model-aot-stability-panel.md` | 历史退出 | `evaluation-system.md`、`history.md` | 跨模型设计边界和失败 smoke |
| `work-stop-summary-2026-09-11.md` | 历史退出 | `history.md` | 停止现场与未获得结果 |

实施前用 Git 生成集合差：表中现有路径必须与 `git ls-files docs/skill-ir/*.md` 完全一致；多一项或少一项都先修表，
不能继续写 14 份或删除文件。
