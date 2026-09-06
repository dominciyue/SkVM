# 任务自动化分类手册 v2

日期：2026-09-06。方法身份：`skill-ir-task-automation-classification/v2`。本版替代 v1 用于正式 development 标注；v1 保留为历史设计，不得用 v1 批次冒充 v2 数据。

## 1. 目标与边界

本手册在任何任务运行结果出现之前，逐项判断公开 skill 的硬要求或工作流步骤是否具备可验证的构造规则，以及当前冻结的 SkVM 能力是否支持这些规则。它不按一次运行的成败给整个 skill 贴标签，也不把“存在脚本”“输入是结构化文件”或“历史 fixture 通过”直接当作新输入自动化证据。

首个家族仍是“公开结构驱动的离线转换与报告生成”。允许读取公开 JSON、YAML、键值文本或语法明确的文本，执行公开的抽取、筛选、集合、确定性派生和模板输出规则，并由独立 checker 验证。依赖自由业务判断、动态外部状态、营销写作、隐含领域政策或未声明副作用的步骤不能自动接纳。

本版只准备 12 个 development 来源的独立标注。12 个 prospective 名额继续保持未选择、未查看；held-out、Q3、Q4、portfolio 和 readiness 不在本版范围。

## 2. v2 修订点

v2 只补强正式标注所需合同，不改写 v1 已冻结事实：

1. 标注者不再仅互相比较键集合。每份提交必须绑定同一个 annotation package 的精确 SHA-256，并精确覆盖其中完整单位分母；共同漏项、未知来源、未知单位、重复项和包版本漂移全部 fail closed。
2. 每个标签保存 `verificationBasis`、`constructionBasis`、`executionConditions`、`remainingSemanticChoices` 四组原始依据。`prediction` 必须由同一派生器复算一致，不能只提交一个结论枚举。
3. `affectsRequirementIds` 的每个目标必须存在。除本单位自身外，目标必须通过 `dependsOnUnitIds` 直接或间接依赖声明该选择的单位；否则说明影响声明与依赖图矛盾，整份提交拒绝。
4. 裁决前除总体一致率外，还固定输出分来源一致率、四状态混淆表和四个证据维度的分歧计数。统计方法在真实标注前冻结。

## 3. 自动化层次

| 层次 | 问题 | 本阶段含义 |
|---|---|---|
| 运行自动化 | 人已写好 package/plan 后能否无模型重放？ | 多个历史切片已有证据，不是本次新增主张 |
| 类内任务自动构造 | 新任务是否只替换公开数据与普通参数，且任务专用规则、模板和候选修改为 0？ | 三个 Q2 profile 当前均未达到 `new-input-ready` |
| 新 skill 自动接入 | 新 skill 是否无需人工编写语义映射即可进入同一流程？ | 未建立，不能由通用 CLI 或原语存在推断 |

普通路径、格式和已冻结模板的选择可以是参数；携带答案、领域映射、政策或逐任务转换规则的配置仍计为人工构造。

## 4. 冻结标注单位

annotation package 采用 `one-unit-per-selected-responsibility`：每个 development source 的选中切片中，每项 included responsibility 恰好对应一个单位；excluded responsibility 不进入分母。当前分母为 12 source、24 unit。

每个单位包含：

- 全局唯一 `unitId`、`sourcePackageId`、`sliceId` 和唯一对应的 `responsibilityId`；
- 固定 `unitKind` 与描述；
- 至少一个位于冻结 source view 内的来源定位；
- 同一 source 内的 `dependsOnUnitIds`。

机器校验 source list 的切片边界与单位覆盖。不能由标注者新增、删除、重命名、合并或拆分单位；若单位化规则需要改变，必须创建新 package identity 和新一轮数据。

## 5. 四组分类依据

| 字段 | 必答问题 | 充分证据 | 常见错误 |
|---|---|---|---|
| `verificationBasis` | 能否仅凭公开输入、公开规则和 checker 合同判断产物满足要求？ | 规范、公开字段、独立 checker 对应关系 | “看起来合理”、隐藏 gold、已知运行结果 |
| `constructionBasis` | 输出内容与关键决策如何产生？ | 明确转换规则、脚本/工具合同、模板和用户显式参数 | 让模型自行补政策、把验证规则当生成规则 |
| `executionConditions` | 工具、状态、依赖、输入范围和副作用是否明确且当前能力具备？ | 锁定工具、本地资源、可检查前置条件和允许副作用 | 环境来源不明、把缺 backend 写成语义未知 |
| `remainingSemanticChoices` | 是否仍需用户、审核者、领域专家或外部 oracle 选择业务语义？ | 逐项写提供者、时机、影响单位与说明 | 用默认值隐藏选择、影响目标不进依赖图 |

每个 `evidenceRef` 必须引用当前单位 annotation package 中列出的来源定位，且 `sourcePackageId` 与单位相同。需要新来源定位时先修订 annotation package，不能在提交中自行扩展证据闭包。

## 6. 四个派生状态

| 状态 | 机器值 | 条件 |
|---|---|---|
| 规则充分且能力支持 | `rules-sufficient-capability-supported` | 三组依据充分、无语义选择，且全部 capability 是 `implemented + current-tested + supportsNewInputs=true` |
| 规则充分但能力缺失 | `rules-sufficient-capability-missing` | 规则和条件明确，但 parser、binding、composition、backend 或 checker 缺失/未验证新输入 |
| 部分需要语义选择 | `partial-semantic-choice-required` | 构造仍需明确的人、用户、专家或 oracle 决策 |
| 信息不足 | `insufficient-information` | 验证、构造或执行条件至少一项存在已命名的信息缺口 |

从严到宽的优先级是：`insufficient-information > partial-semantic-choice-required > rules-sufficient-capability-missing > rules-sufficient-capability-supported`。上游状态沿冻结依赖图传播到下游。

### 6.1 语义影响与依赖必须一致

若单位 `choose-policy` 中的选择声明影响 `render-report`，则 `render-report.dependsOnUnitIds` 必须直接包含 `choose-policy`，或通过中间单位形成传递依赖。声明本单位受自身选择影响是合法的。以下情况均拒绝：

- 影响目标不存在；
- 影响目标属于另一个没有依赖关系的 source；
- 声明影响下游，但下游依赖链漏掉选择单位；
- 影响目标重复、依赖循环、自依赖或未知依赖。

`dependsOnUnitIds` 是状态传播的唯一图；`affectsRequirementIds` 是对语义影响的审计声明。二者必须一致，不能各说各话。

## 7. annotation package 与来源视图

权威包是 `q1-development-annotation-package-v2.json`。它绑定：

- 本手册的 method identity、路径和 SHA-256；
- v1 development source list 的 list identity、路径和 SHA-256；
- v1 Q2 capability profile 的 profile identity、路径和 SHA-256；
- 远端来源 Git 对象核验报告的 identity、路径和 SHA-256；
- 12 个 source view、24 个单位和完整依赖图。

8 个本地来源以 workspace 相对路径、文件字节数和 SHA-256 发放。4 个远端来源不复制进仓库，而提供仓库、固定 commit、package root、每文件 Git blob/字节数及 commit-pinned GitHub 只读 URL。冻结前已从两个上游仓库 fetch 固定 commit，并对 23 个包文件及 4 个许可证逐项重算；Anthropic PDF 的专有条款继续禁止把其实现当作可再分发资产。

只读 URL 必须精确包含 repository、commit、package root 和 source path。若标注者无法访问远端固定内容，停止该 session；不得改看浮动分支、镜像、摘要或后续版本。

## 8. 空白表、独立提交与批次

发放 A/B 两份内容相同、slot 不同的空白表。空白表只含 package binding 和 24 个单位键；以下字段全部为 `null`，不预填 prediction 或证据：

- annotator identity 与提交时间；
- 独立性、未见 peer 标签、未见运行结果三项声明；
- 四组分类依据与 prediction。

标注者完成后各自保存一份 `annotation-submission/v2`，机器必须先验证 package digest、完整分母、来源定位、capability identity、语义影响图和派生 prediction。两份原始提交都通过且冻结后，才能组成 `annotation-batch/v2`。A/B 必须是不同真实身份、不同 slot，提交前互不可见且不看运行结果。

`independent-complete` 批次禁止 adjudication。只有原始批次冻结后才可创建 `adjudicated` 版本；裁决项必须覆盖全部且仅有 prediction 分歧单位，并保留裁决者、时间和理由。规则若改变，不回写原始提交，另开手册/package 版本。

## 9. 固定统计

裁决前固定报告：

1. overall：`agreed / compared`；
2. by-source：12 个来源各自的 compared、agreed 和 rate；
3. 4×4 confusion matrix：行是 A、列是 B，保留方向；
4. evidence-dimension disagreements：四组依据逐单位严格 JSON 差异计数。

总体一致率不能单独解释方法质量；必须连同分来源结果、混淆表和证据维度分歧阅读，尤其检查大量 `insufficient-information` 是否掩盖问题。本阶段不预注册事后阈值，也不报告任何尚未产生的一致率。

## 10. 发放前检查

```powershell
cd D:\skill优化\SkVM
bun test ./src/benchmarks/skill-ir/task-automation-annotation-package.test.ts
bun test ./src/benchmarks/skill-ir/task-automation-classification.test.ts
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py --root .
git diff --check
```

发放前还要运行 package verifier，确认本手册、source list、capability profile、远端核验报告和 8 个本地 source view 的摘要均未漂移，并确认 A/B 空白表精确覆盖 24 个单位。

## 11. 当前停止点

v2 包与空白表通过机器校验后，本阶段即停止。下一检查点才是两位真实标注者是否能在相同材料上完成独立提交；当前没有标注、裁决、一致率或分类效度结论。

Q3 必须等 development 方法及构造器另行稳定和冻结后再授权。Q2 当前仍为 21 capability、3 profile、`new-input-ready=0/3`；补强标注合同不改变能力状态，也不支持“Skill IR 已自动接纳新 skill”或“优化后的 LLM 更稳”等主张。
