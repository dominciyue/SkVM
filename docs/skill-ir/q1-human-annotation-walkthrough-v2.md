# Q1 v2 真人填表操作说明

本说明解释既有v2格式，不新增分类规则、样本、标签或授权。权威仍为[冻结手册](classification-handbook-v2.md)和[发放包指南](q1-development-annotation-package-v2.md)。

## 1. 人员和分发

找两位不同真人，分别作为A/B；每人独立完成全部24单元，不是各填12项。建议具备阅读代码、JSON及公开规范的能力。协调者负责同版本材料、独立收件和机械校验，不替标注者判断或让两人先讨论标签。

未见peer标签和运行结果必须是事实。已经看过相关运行结果的人不能把声明填成false来通过校验；可由其担任协调者，另找符合条件的标注者。不要把包含历史结果的项目对话、汇总报告或整套结果目录发给标注者。

分别提供：各自A/B空白表、v2手册、annotation package、包绑定的source list/capability snapshot以及sourceViews提供的源文件。固定能力快照是允许的判定依据；具体任务运行结果不是。A/B应使用同一固定版本，提交前不在彼此可见的共享目录或仓库分支中保存标签。

## 2. 先理解判定单位

打开[annotation package](../../benchmarks/skill-ir/classification/q1-development-annotation-package-v2.json)，按当前标签的unitId查找units中的记录，依次读：

1. description：本项具体要求；
2. sliceId以及sourceViews内includedResponsibilityIds/excludedResponsibilityIds：范围；
3. sourceLocators：应查阅的原文位置；
4. dependsOnUnitIds：需要先看哪些上游单元。

通过sourceViews.access.files里的workspacePath读取本地源文件；远端使用对应browseUrl的固定commit内容。定位文字以sourceLocators为准；不是所有`#`片段都能由GitHub自动跳转，应在指定原文内查找对应段落/符号。不能只看单位摘要，更不能改看浮动分支。

本轮仍用[q2-current-capabilities-v1.json](../../benchmarks/skill-ir/classification/q2-current-capabilities-v1.json)。后续API development完成不回写这个冻结能力快照，不据此更改本轮判定口径。

## 3. 每个单位填写四组依据

| 字段 | 真人需要作的判断 | 填写结构 |
|---|---|---|
| verificationBasis | 公开依据是否足以检查本要求是否满足？ | status为sufficient或insufficient；evidenceRefs列原文依据；gaps列具体缺口 |
| constructionBasis | 生成内容的规则是否明确，还是还需语义决策？ | status为rules-sufficient、semantic-choice-required或insufficient；evidenceRefs、requiredCapabilityIds、gaps |
| executionConditions | 工具、输入、依赖与副作用条件是否明确、能力是否具备？ | status为satisfied、capability-missing或insufficient；conditions、requiredCapabilityIds、gaps |
| remainingSemanticChoices | 仍是谁在何时决定什么，并影响哪些单位？ | 无已识别选择填[]；有则填choiceId、provider、timing、affectsRequirementIds、description |

证据引用形状：

```json
{
  "sourcePackageId": "复制本单位的sourcePackageId",
  "locator": "精确复制本单位sourceLocators中适用的locator",
  "kind": "specification-clause"
}
```

上面是字段说明，不是可直接提交的标签。kind按真实依据选择：specification-clause、public-input-field、transformation-rule、script-contract、tool-contract、checker-contract、user-parameter、environment-contract。引用必须属于当前单位允许的locator；不能自行添加外部网址。

填表规则：

- verification=sufficient时须有证据且gaps=[]；insufficient必须写至少一个明确缺口。
- construction为rules-sufficient/semantic-choice-required时须有证据且gaps=[]；insufficient必须命名缺口。已知但尚需人作出的语义选择写入remainingSemanticChoices，不伪装成构造规则。
- execution非insufficient时conditions至少一条、gaps=[]；信息不足时须命名缺口。没有实现与不知道需求是两回事。
- requiredCapabilityIds从冻结能力表选真实ID，列足必要能力；不要故意留空使状态变成supported。找不到对应能力或无法定位时先记录问题，不能自行扩展快照。
- provider只能为user/reviewer/domain-expert/external-oracle；timing只能为before-construction/during-review/runtime。
- affectsRequirementIds名称保留历史用词，但v2中填写实际unitId。目标需存在且与冻结依赖图一致；发现图不能表达实际影响时记录包问题，不修改依赖或隐藏选择来凑通过。
- 描述与缺口可用中文；不要添加schema未规定的新字段。需要长解释可保留独立原始笔记。

可以先用个人笔记逐项回答四个问题，再由工具机械转写为JSON。必须保留原始回答并由本人核对；不得让模型补证据、选能力或作语义判定后冒充真人独立标签。

## 4. 最后填写prediction

先填四组依据，再按手册派生，不先挑想要的结论：

- 任一关键依据不足：insufficient-information；
- 否则有剩余语义选择：partial-semantic-choice-required；
- 否则规则明确但所需能力不满足冻结要求：rules-sufficient-capability-missing；
- 否则：rules-sufficient-capability-supported。

还需沿dependsOnUnitIds继承上游更严格状态。应保留当前单位自己的依据，不把上游选择伪写为本地选择。程序能检查状态是否与这些依据及依赖一致；不能替人验证引用是否真正支持其语义判断。

不会判断时查指定原文并写具体信息缺口，允许得到unknown；不要为了提高一致率而猜测。若材料无法访问或单位/证据闭包有问题，报告协调者并保留原始问题，不能擅改冻结包。

## 5. 从空白form变为正式submission

保留仓库内A/B原始空白表不变，在各自私有工作副本中填写。完成后另存为不同的submission文件；不要覆盖原表。

| 顶层字段 | 正式提交要求 |
|---|---|
| schemaVersion | 改为skill-ir-task-automation-annotation-submission/v2 |
| formId | 删除该字段，改用submissionId，例如q1-development-a-001或q1-development-b-001 |
| annotationPackage | packageId/path/sha256原样保留 |
| slot | A仍为A，B仍为B |
| annotatorId | 每位真人一个不同的稳定标识，如annotator-a/annotator-b；协调者私下保留真人对应关系 |
| independenceAttested | 独立完成属实时填true |
| sawPeerLabelsBeforeSubmission | 确实未见才填false |
| resultEvidenceVisibleBeforeSubmission | 确实未见相关运行结果才填false |
| submittedAt | 本人实际提交时间，建议UTC的ISO8601格式，例如YYYY-MM-DDTHH:mm:ss.sssZ；不要复制示例时间 |
| labels | 原24个sourcePackageId/unitId不变，四组依据与prediction均按本人判断填完 |

annotatorId/submissionId建议使用小写英文、数字和连字符。除上述结构转换外不添加字段。正式schema是strict object，保留formId或原form版本会被拒绝。

## 6. 独立收件与验证

A/B分别把自己的原始文件交协调者，不先交换核对。协调者先保存原始文件及摘要，再分别运行verifyAnnotationSubmissionV2；现有入口是TypeScript函数，不是已实现的`skvm annotation`子命令。提交后可由项目维护者执行，不要求标注者自行安装运行环境。

语法、漏项或引用错误返回给本人修订，保留原稿与修订记录；只返回该人的错误，不泄露另一人的标签。不能为了与另一人一致而修改已提交预测。

两份都通过并分别冻结后，组成independent-complete批次，计算裁决前总体/分来源一致率、4×4混淆表和四证据维度差异，再处理prediction分歧。证据维度采用严格JSON差异，文字表达不同也可能计入，不能直接解释为语义意见不同。不要为提高该数字而事后统一两人的文字。

当前无需运行skill效果实验，不选择prospective，不进入Q3；本说明不产生任何真人submission或预填实际标签。
