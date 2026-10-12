# Skill IR AOT 当前执行计划

更新于2026-10-13。唯一实时入口为[current-status](current-status.md)。

- 当前任务书：[BI0–BI23](../superpowers/plans/2026-10-13-authorization-authoring-closure-and-reliable-consumption.md)。八个有限账号位置已全部交付，无活动/未知请求；当前只剩BI23验证与发布收束。
- 方法合同：[spec§14.48](skill-ir-aot-optimization-spec.md#1448-bi-authoring-closure-and-reliable-consumption)；复盘统一在[研究§7.70](skill-dsl-research.md#770-bi-作者目标有序修稿与保真消费)。BH实际结果见§7.69及[summary](../../results/skill-ir/skill-dsl-research/development/authorization-incremental-program-v1/summary.json)。
- identity：`authorization-authoring-closure-v1`。继续`skill-ir-aot`，只推用户origin，不建分支/worktree；新线程独占代码、共享方法文档与Git写入。
- 开发`gpt-6.1-sol/max`，按用户指定；实验沿已授权官方账号`gpt-5.6-sol/high`。第三方暂停，OWUI/历史未知ShareLink仅离线，旧未知和保护证据保持。

## 已实现的责任

作者在partial活动程序后继续edit；原子stepOrder可以把guard/值排到return前，旧append兼容且不可达诊断可见。原稿、候选、活动与revision分别保存，详情拒绝过期引用，普通native/structured及归档共核。compact保留原四问、规则、剩余职责和源码索引；Download示例默认full，compact显式。

工程提交00053b32、c9749483。约12小时是工作量估算，记录实际时间，不凑等待、重复审计或新增面板。

## 方法调整

1. edit在活动程序出现后仍保持作者目标；current、computed、作者完成分开，允许带缺口交付。
2. patch增加显式stepOrder，精确排列合并后的全部ID；缺省保持旧行为，非法排列原子拒绝，新增不可达步骤给诊断，不自动移动guard/return。
3. 原稿、候选预览、活动程序与各自revision分开；恢复和source变化重算，不能使用旧结果掩盖新稿失败。
4. compact保留原问题、剩余任务、分支规则和可访问源码线索，只减少重复表达；普通CLI默认兼容，示例先回full。
5. A1无开发者程序/答案/评阅；A2只恢复其自己的稿。C1/C2固定自动原字节，P两组固定已有开发者程序，自动与给定材料效果分账。
6. 不用全局checked阻挡局部运行，也不通过删除问题、造来源或改unknown换成功。程序贡献与自然补答逐项说明。

实际作者形成12步并采用，但scope选择第二题、场景事实在第一题下，输入为空且执行未知；空version、非owner授权和root失查回退仍未闭合。C1/C2已按同一冻结原稿和同一源码epoch完成，不手工改稿。随后BI20只补通用的作者输入绑定提示：显示当前scope实际可用的输入名字及其他原题下已有输入名字，不复制值、不跨题注入、不替模型选择scope。这个确定性补强不追加第三次作者重抽，也不把已有原稿升级为成功。

## 未达责任与下一责任人

| 责任 | 实际缺口 | 下一责任 |
|---|---|---|
| 自动输入绑定 | A2/C1/C2当前inputs为空，原/变均conditional | 模型作者依据inputBindings选择原题scope或修声明；宿主不移用其他题的事实 |
| 版本与最终文件 | None/empty/explicit选择和latest排序未完整计算 | 作者从允许源码编写现有有限关系，保留原任务和原稿来源 |
| 授权与root关系 | 非owner权限仍外部结果、加载root/失查回退未完整表达 | 作者提供source-supported关系，外部grant/构造/部署仍分别条件化 |
| 完整任务 | A1 P/F/P/F、C1 F/P/F/F、P1 compact F/F/F/P | 后续范围须针对具体漏项；自然full与机器computed分开 |
| 稳定收益 | P0 tradeoff、P1 negative；两对开发者材料不能证明自动化或泛化 | 当前默认full，不自动加样本、升项目默认或算未知USD盈亏 |

普通自动稿命令及可读结果见[Download说明](../../examples/authorization-assessment/download-workflow/README.md)，实际分轴记录见[汇总](../../results/skill-ir/skill-dsl-research/development/authorization-authoring-closure-v1/summary.json)。开发者25步参考程序是另一路径，默认展示不能替换自动产物。

## 当前收束队列

1. 完成已有方法/研究/导航说明与results中的summary、acceptance、质量、配对和费用记录。
2. 对新增研究脚本、文档单测/当前链接锚点与diff做必要确认。生产代码已有1942授权联合通过/1平台skip/12930断言及主类型通过；没有新生产修改则不重复全套测试。
3. 聚焦提交，推用户origin并核对live HEAD；保存发布回执，同步本地handoff/communication/conversation_log。

上述收束完成后，有限BI队列为`completed-with-unmet-criteria`，研究目标仍false。这张未达责任表供后续明确范围使用，不授权自动追加模型运行。BH/BE及held-out/prospective/Q1/readiness、历史0-of-6和全src旧104失败保留。
