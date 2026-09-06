# 任务自动化分类手册 v1

日期：2026-09-06。方法身份：`skill-ir-task-automation-classification/v1`。当前阶段：Q1 方法与开发来源冻结、Q2 当前能力盘点；独立标注尚未开始，Q3 前瞻来源尚未选择或查看。

## 1. 这份手册回答什么

本手册用于在运行结果出现之前判断：公开 skill 中的某项硬要求或工作流步骤，是否具备可验证的构造规则，以及当前 SkVM 能力是否足以在新输入上执行这些规则。它不按一次运行的成败给整个 skill 贴标签，也不把“有脚本”“输入是 JSON”或“曾在一个 fixture 上通过”直接当成自动化证据。

首版只研究“公开结构驱动的离线转换与报告生成”：输入是 JSON、YAML、键值文本或语法明确的文本；转换政策公开；执行只包含读取、抽取、筛选、集合运算、确定性派生与模板输出；质量要求可由独立检查器验证。依赖在线服务正确性、自由业务判断、营销写作、动态环境状态或隐含领域政策的部分不在首版自动接纳范围内。

## 2. 三种自动化必须分开

| 层次 | 判定问题 | 本阶段状态 |
|---|---|---|
| 运行自动化 | 人已经写好 adapter/plan 后，运行时是否无需模型即可重复执行？ | 已有多个冻结切片；不是 Q1/Q2 要新增的主张 |
| 类内任务自动构造 | 类别规则、工具和 profile 冻结后，新任务是否只替换公开数据与普通参数，且任务专用代码、规则、模板和候选改动均为 0？ | 目标能力；三个 profile 当前均未达到 `new-input-ready` |
| 新 skill 自动接入 | 新 skill 资源与声明进入同一流程时，是否无需人工编写该 skill 的语义映射？ | 未建立；不能从类内构造或通用 CLI 推断 |

普通路径、文件格式和已冻结模板的选择可以是参数；包含完整答案、领域映射或任务专用转换规则的“配置”仍计为人工构造。一次性平台成本、每 profile 成本、每 skill 成本和每 task 成本必须分列。

## 3. 分类单位与四个独立问题

分类单位只能是完整 skill 中的一项 `hard-requirement` 或 `workflow-step`。先列出完整职责，再定义研究切片，并显式列出该切片排除的职责；不能持续缩小切片直到必然成功。

每个单位独立填写四组信息：

| 字段 | 必答问题 | 充分证据 | 不充分或错误做法 |
|---|---|---|---|
| `verificationBasis` | 产物是否满足该要求，能否仅从公开输入、公开规则和 checker 合同判断？ | 规范条款、公开字段、checker 对应关系；证据定位可复核 | “结果看起来合理”、运行已通过、隐藏 gold |
| `constructionBasis` | 输出内容和关键决策如何产生？ | 明确转换规则、脚本/工具合同、模板绑定、用户显式参数 | 只有“应正确/合理”；让模型自行补政策 |
| `executionConditions` | 工具、依赖、状态、输入范围和副作用是否明确，当前能力是否具备？ | 锁定工具、本地资源、可检查前置条件、允许的输出与副作用 | 环境来源不明、依赖隐含、把缺 backend 写成语义未知 |
| `remainingSemanticChoices` | 是否仍需人、领域专家、外部 oracle 或用户选择业务语义？ | 逐项记录提供者、时机、影响的 requirement | 用默认值掩盖选择；把 reviewer 决策记成自动规则 |

`verificationBasis` 与 `constructionBasis` 必须分开：知道怎样检查，不等于知道怎样生成；规则充分与当前实现支持也必须分开。

## 4. 四个导出状态

| 状态 | 机器值 | 何时使用 |
|---|---|---|
| 规则充分且当前能力支持 | `rules-sufficient-capability-supported` | 验证、构造和执行信息充分；没有剩余语义选择；所有所需 capability 均为 `implemented + current-tested + supportsNewInputs=true` |
| 规则充分但当前能力不支持 | `rules-sufficient-capability-missing` | 规则与前置条件清楚，但 parser、operation、binding、backend、checker 或经新输入验证的 composition 缺失 |
| 部分步骤需要语义选择 | `partial-semantic-choice-required` | 构造仍需要明确的人/专家/用户/oracle 决策；其余步骤可以继续固化 |
| 信息不足 | `insufficient-information` | 验证依据、构造依据或执行条件至少一项缺失，当前不能作自动化预测 |

优先级从严到宽为：`insufficient-information` > `partial-semantic-choice-required` > `rules-sufficient-capability-missing` > `rules-sufficient-capability-supported`。依赖图中的上游状态按同一优先级传播到下游；未知依赖、循环、自依赖和声明状态与派生状态不一致均 fail closed。

这里的 `prediction` 是执行前记录。实际运行失败时保留原 prediction，把失败另记为判据、实现、基础设施或输入问题；严禁看到结果后把原标签改成 `capability-missing` 或 `insufficient-information`。当前 schema 以 strict object 拒绝把 `observedResult` 混入分类记录。

## 5. 正例、反例与 unknown

### 5.1 规则充分且能力支持

公开 JSON 对象中的键需要排序去重并写入声明路径；字段位置、排序政策和输出 schema 均公开，输入路径受 containment 约束。现有 `read-json`、`enumerate-json-object-keys`、`sort-and-deduplicate-strings`、`write-json` 与 verified-artifact runtime 都有当前测试且声明支持新输入。该 requirement 可预测为 `rules-sufficient-capability-supported`。

这只说明这些原语及其已声明组合所覆盖的 requirement；不自动把整个 skill 或任意 JSON 任务归入同一状态。

### 5.2 规则充分但能力缺失

输入是冻结 commit snapshot，Conventional Commits 类型、范围、breaking-change 标记、分组和输出模板都已公开，因此构造规则可充分；但当前仓库没有经验证的 snapshot-to-changelog composition 和独立 checker。此时应标 `rules-sufficient-capability-missing`，不能标成“必须依赖专家”。

### 5.3 需要语义选择

可填充 PDF 已公开 field id、合法值与填充脚本，但“用户自然语言中的姓名应映射到哪一个 field id”未由公开输入或参数给出。字段提取可自动，映射步骤标 `partial-semantic-choice-required`；依赖该映射的填写步骤继承这一状态。

### 5.4 信息不足

OpenAPI design-first 任务要求选择业务资源、鉴权策略和错误响应，却没有领域政策、现有实现或用户参数。即使存在 OpenAPI validator，也只有验证语法的依据，没有生成这些业务决策的依据，应标 `insufficient-information`。

unknown 不是失败，也不是永久类别。必须命名缺口和需要的公开证据；新证据只进入下一个版本的手册或数据，不回写已冻结预测。

## 6. Q1 取样、去重与来源冻结

总目标固定为 24 个去重的公开 skill 源包：12 个 development 源包用于形成规则，另保留 12 个 prospective 名额，在规则冻结后才选择。两组是分类样本，不是 Q3 的 12 个新输入构造矩阵；两种分母不得混用。

抽样按三个结构轴记录：是否含可执行资源、规范是明确/部分/缺失、执行依赖是本地/外部/混合。fork、翻译、复制和内容同谱系版本共用一个 `lineageId`，不能独立计数。每项绑定仓库、commit、package root、许可证 authority 和包级来源 manifest；本地来源还逐文件核对 SHA-256。

当前 development 样本覆盖 5 个独立仓库，包身份和谱系重复均为 0：

| 槽位 | 源包 | 结构（脚本 / 规范 / 状态） | 研究切片 | Q2 角色 |
|---|---|---|---|---|
| d01 | Env Manager | 无 / 部分 / 混合 | public static Env report | core profile |
| d02 | Law to Markdown | 有 / 明确 / 混合 | public txt structure subset | development case |
| d03 | Experimental Design | 有 / 部分 / 本地 | public allocation graph | development case |
| d04 | API Tester | 无 / 明确 / 混合 | OpenAPI offline plan | core profile |
| d05 | zh-code-reviewer | 无 / 部分 / 本地 | supported pattern evidence | boundary |
| d06 | zh-readme | 无 / 部分 / 本地 | source-bound repository facts | boundary |
| d07 | i18n-helper | 无 / 部分 / 本地 | React i18next public subset | development case |
| d08 | BIDS | 有 / 部分 / 混合 | public schema repair | boundary |
| d09 | changelog-automation | 无 / 明确 / 本地 | conventional commit snapshot | core profile |
| d10 | openapi-spec-generation | 无 / 部分 / 混合 | existing spec validation | boundary |
| d11 | Anthropic PDF | 有 / 部分 / 本地 | fillable form structure | boundary |
| d12 | Anthropic webapp-testing | 有 / 部分 / 外部 | local server lifecycle | boundary |

机器清单是 [q1-development-sources-v1.json](../../benchmarks/skill-ir/classification/q1-development-sources-v1.json)。8 个本地源包通过已有 corpus registry 绑定 34 个文件；4 个外部源包通过固定 commit 的 git tree manifest 绑定 23 个文件，并记录 4 个许可证 digest。外部条目只保存 provenance、blob/字节清单与许可证摘要，不把上游代码复制进本仓；其中 Anthropic PDF 的专有条款只允许作为分类边界材料，不能据此再分发其实现。

prospective 当前必须保持 `reserved-unselected`、`selectedCount=0`、`entries=[]`。已经阅读过的外部例子只能算 development；不能在 Q3 冒充未见样本。仓库已有 held-out 永远不用于这套公开分类取样。

## 7. 两位独立标注者与裁决

1. 为每个源包冻结完整职责、研究切片、requirement/step 分母、手册版本、来源清单版本与 capability profile。
2. 标注者 A、B 使用不同身份独立填写同一分母；两人均声明未在提交前查看对方标签，也不能查看运行结果。
3. 两份原始提交冻结后，先计算裁决前一致率：`agreed / compared`。不以讨论后的共识替代独立一致性。
4. 只对分歧项裁决，保存最终标签、理由、裁决者与时间。AI 可以定位公开证据，但两个模型一致不构成独立专家真值。
5. 分类冻结后才允许运行已接纳切片；运行结果另表保存，绝不改写原 prediction。

当前仅实现并测试了 annotation batch 合同和一致率计算，没有创建虚构的 A/B 标注数据，也没有报告一致率。

## 8. Q2 当前能力图

机器能力表是 [q2-current-capabilities-v1.json](../../benchmarks/skill-ir/classification/q2-current-capabilities-v1.json)。它把“操作存在”“历史切片组合通过”和“可用于新输入”分开记录；只有 `implemented + current-tested + supportsNewInputs=true` 才能支持状态 1。

| 能力层 | 当前事实 | 对新输入的含义 |
|---|---|---|
| Restricted plan operations（15） | text/JSON 读取、JSON Pointer、键值解析、文件正则抽取、正则判断、pluck/filter/project、集合、boolean/choose、JSON/模板/文本写入均为 current-tested | 原子操作可复用；不证明自然语言到操作序列或领域组合正确 |
| Collection operations（2） | 枚举 JSON object keys、字符串排序去重为 current-tested | 可作为已声明计划中的局部能力 |
| API composition | 冻结 OpenAPI development slice 已实现、历史测试通过 | `supportsNewInputs=false`；生产 binding 和前瞻新输入验证缺失 |
| Env reviewed composition | 冻结 reviewed-AOT slice 已实现、历史测试通过 | `supportsNewInputs=false`；领域政策仍嵌在历史 package |
| Verified-artifact runtime | 当前测试、支持新输入 | 只执行和验证已声明 closure，不提供领域语义构造 |
| Changelog composition | 缺失 | 规则候选存在，但 backend、checker 和 comparator 尚未实现 |

当前共有 21 项 capability、3 个 family profile、0 个 `new-input-ready` profile。能力表的 21 个源码引用分布在 6 个文件；测试会检查文件与精确文本定位存在，防止重命名后能力表静默陈旧。这是轻量 source-ref 完整性检查，不是 TypeScript AST 或通用模块图审计。

## 9. 三个 profile 的最小构造路径

### API Tester：`existing-slice-only`

支持边界是冻结 OpenAPI JSON/YAML 子集到离线计划/报告。最短路径是：新建不修改旧研究 wrapper 的生产 binding；构造前拒绝未支持结构；复用已有 compiler/package；用独立 public-contract checker 经 verified-artifact runtime 验证新公开输入。阻塞项是 generic production binding 与前瞻 composition 证据，不是 operation 缺失。

### Env Manager：`existing-slice-only`

支持边界是显式 Env 声明与可识别静态引用的差异报告。最短路径是：把公开 Env policy 与普通路径/schema 参数从历史 reviewed patch 分离；复用键值解析、静态引用抽取、集合运算和 JSON 输出；最后在新公开输入上运行独立 checker。动态变量名、类型猜测、未使用证明和生产删除仍排除。

### Changelog：`unsupported`

现有原语可以读取结构化 snapshot、筛选/投影记录并渲染模板，但没有经验证的领域 composition。最短路径是：冻结 commit range、Conventional Commits 分组、breaking-change 与输出格式政策；实现 source-grounded binding，且不扩共享 operation library；增加独立 checker 与同信息 git-cliff comparator；最后做本地 development 验证。当前只有来源/许可证审计，backend、checker、comparator 和前瞻证据都缺失。

Q2 因此是一张能力与缺口图，不是构造器完成证明。`operation exists != validated composition`，`validated historical slice != new-input-ready`，`generic runtime != semantic constructor`。

## 10. 机器合同与验证

实现入口：

- [task-automation-classification.ts](../../src/benchmarks/skill-ir/task-automation-classification.ts)：strict schema、四状态派生、依赖传播、A/B 标注合同、一致率、来源与能力引用校验。
- [task-automation-classification.test.ts](../../src/benchmarks/skill-ir/task-automation-classification.test.ts)：四状态、结果字段拒绝、依赖传播、独立性、来源 digest、源码符号与 fail-closed canary。
- [q1-development-sources-v1.json](../../benchmarks/skill-ir/classification/q1-development-sources-v1.json)：Q1 开发来源与未选择的 prospective 配额。
- [q2-current-capabilities-v1.json](../../benchmarks/skill-ir/classification/q2-current-capabilities-v1.json)：Q2 当前能力、profile 边界、最小构造路径和 blocker。

验证命令：

```powershell
cd D:\skill优化\SkVM
bun test ./src/benchmarks/skill-ir/task-automation-classification.test.ts
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py --root .
git diff --check
```

## 11. 当前停止点与禁止外推

本阶段只完成 Q1/Q2 的可执行合同、12 个 development 来源清单和现状能力图。它没有执行标注、没有选择 12 个 prospective 源包、没有运行 Q3 的 3 profile × 4 new input 矩阵，也没有形成分类覆盖率、接纳成功率、误接纳率或跨 skill 泛化结论。

本阶段 `modelCalls=0`、`apiCalls=0`、`paidCalls=0`、`heldOutAccesses=0`、`coreBranchDelta=0`。不修改旧 lock/result、core、DSL、artifact、scorer、Stage M/N、portfolio 或 readiness；B successor 仍为 `design-only-not-authorized`。后续若 Q2 改变生成器或公开合同，Q4 必须使用新 identity 和新 lock。
