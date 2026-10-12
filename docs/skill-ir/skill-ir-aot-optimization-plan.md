# Skill IR AOT 当前执行计划

更新于2026-10-13。唯一实时入口为[current-status](current-status.md)。

- 当前任务书：[BJ0–BJ25](../superpowers/plans/2026-10-13-authorization-authoring-loop-and-program-completion.md)已授权、待派发实施，尚无BJ实现或实验结果。
- 方法合同：[spec§14.49](skill-ir-aot-optimization-spec.md#1449-bj-authoring-loop-and-program-completion)；复核和后续开发过程统一在[研究§7.71](skill-dsl-research.md#771-bj-输入接线与自动编写运行闭环)。BI实际结果保留在§7.70。
- identity：`authorization-authoring-loop-v1`，实施基线`ace945fa`。继续`skill-ir-aot`，只推用户origin，不建分支/worktree；派发后新线程独占代码、共享方法文档与Git写入。
- 开发`gpt-6.1-sol/max`，按用户指定；实验沿已授权官方账号`gpt-5.6-sol/high`。第三方暂停，OWUI/历史未知ShareLink仅离线，旧未知和保护证据保持。

约12小时有效开发量：输入/普通入口约2小时、实际反馈和修稿约2.5小时、自动主链约2.5小时、同稿变化/恢复约2.5小时、比较/计量约1.5小时、必要交付约1小时。尽早在2–3小时内让真实作者使用共享修复；不等全部离线工作结束才运行。10小时左右复查剩余优先级，12小时附近完成当前有界动作并交接；不等待、重复审计或盲目抽样凑时长。

## 当前开发责任

| 责任 | 实际缺口 | BJ动作 |
|---|---|---|
| 空草稿详情 | 无candidate与无currentRevision相等后访问undefined | 公共路径失败测试和局部修复 |
| 自动输入绑定 | A2/C1/C2按语义题目查不到事实 | 显式同operation数据绑定；resourceInputs/externalAssumptions共核，contractInputs保留语义scope |
| 作者运行闭环 | 首次提交太晚，最后薄反馈无实际确认 | 早期草稿、实际数据、执行/阻断反馈、当场修复并真实确认 |
| 版本、权限与root关系 | 有输入仍缺空version、拒绝与失查回退 | 模型从允许源码补规则，外部grant/构造与源码分支分开 |
| 编写与复用 | 恢复成功和从零成功易被混用 | R/F/C/S各自留账，固定自动原稿检验变化；第二结构离线验证 |
| 质量与成本 | BI P0取舍、P1负向 | full默认；同期原skill基线与自动稿消费反序配对，完整四问、作者成本和unknown费用分别报告 |

普通入口继续使用[Download说明](../../examples/authorization-assessment/download-workflow/README.md)。发现共享缺陷先修再确认，不继续派发受其影响的位置；修复前后版本及失败均保留。九个主用途之外可以运行有明确代码依据的具名确认，不以首位置已跑完替代工程责任完成。自动作者隔离评价器、参考程序和历史答案；恢复作者只能读自己的旧稿。

## 继承的真实结果

BI最终发布ace945fa，八位置全部交付、无BI活动/未知请求。A2恢复稿12步但原/变消费均无文件计算；自然整题5/8 full分属作者、自动稿消费者和开发者材料，P0 tradeoff/P1 negative。[汇总](../../results/skill-ir/skill-dsl-research/development/authorization-authoring-closure-v1/summary.json)及旧原件保持，开发者25步程序不替代自动成功。历史1942授权联合通过/1平台skip、类型和15文档测试是BI验证记录。

发布后定向复核68测试/502断言通过，公开运行仍conditional。诊断性补入输入仅用于定位剩余含义缺口，不回填BI或记为自动成功。BJ重新承接未达责任，不向BI补行；BH/BE及held-out/prospective/Q1/readiness、历史0-of-6、旧未知与全src旧104失败保持。
