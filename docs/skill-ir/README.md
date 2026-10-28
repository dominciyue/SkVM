# Skill 优化研究入口

当前课题是 **基于 Skill 分类的分层代码固化 Agent 运行时优化机制**。先读[当前状态](current-status.md)，再读[方法与相关研究](tiered-solidification.md)。本目录沿用 `skill-ir` 路径，方便历史链接和代码继续使用。

## 当前阅读集

日常入口收敛为以下七份，包括本页；不用通读旧队列才能开始工作。

| 文档 | 职责 |
|---|---|
| 本页 | 导航与写入规则 |
| [current-status](current-status.md) | 唯一实时状态，正在做什么 |
| [tiered-solidification](tiered-solidification.md) | 新课题目标、方法、文献、资产与缺口 |
| [当前计划](skill-ir-aot-optimization-plan.md) | 实施顺序、测试责任和下一步 |
| [分类与路由](classification-and-routing.md) | 分类单元、运行特征及旧分类资料 |
| [证据索引](evidence-index.md) | 哪些结果支持哪些结论 |
| [历史索引](history.md) | 旧阶段、旧路径和恢复位置 |

原项目的[架构](../architecture.md)、[使用说明](../usage.md)和[JIT Boost](../jit-boost.md)按开发需要查阅，本轮未改写这些文档。

## 按需组件与历史参考

| 要处理的部分 | 参考 |
|---|---|
| IR 解析与校验 | [ir-core](ir-core.md) |
| 提案、程序与包导出 | [optimization-and-artifacts](optimization-and-artifacts.md) |
| runner/checker/scorer | [evaluation-system](evaluation-system.md) |
| API 确定性实现 | [api-task-engine](api-task-engine.md) |
| 外部 skill、既有 pilot | [external-skill-import](external-skill-import.md)、[real-skill-pilots](real-skill-pilots.md) |
| 旧授权实现和历史方法 | [旧开发指南](developer-guide.md)、[旧 spec](skill-ir-aot-optimization-spec.md)、[DSL 研究过程](skill-dsl-research.md) |

最后三份长文退出日常必读，原章节和路径保留；其中“当前”“下一轮”按原阶段日期解释。新课题的决定只更新新主文档，避免多份长文同时增长。

## 实验结果

[results 入口](../../results/skill-ir/README.md)按用途区分旧证据、开发材料和未来实验。[机器目录](../../results/skill-ir/experiment-catalog.json)提供代表性入口，不是全部目录的删除白名单。[目录工具](../../scripts/experiment-catalog/README.md)只读导航，不改原始结果。

## 写入与保留规则

- 治理范围是我们开发新增/扩写的文档；clone 前已有且未改的内容保持原样。
- 当前状态替换更新，当前计划只保留下一阶段；方法与研究发现统一写入新主文档的对应章节。
- 原始调用、失败、逐步过程和费用留在结果目录，不把日志复制进每份说明。
- 历史由 Git 和 history 索引承接，不另建一套重复 archive。旧报告不因课题变化重评或改写。
- 按需组件说明继续就地维护，已结束队列不自动转成新队列；新增长期文档必须有独立职责。
- [文档清单](../../scripts/skill_ir_doc_governance.json)区分当前、按需和版本化材料；按原字节绑定的 Markdown 在依赖退出前保留原路径和内容。
- 保留源码与 AI 辅助贡献记录，文字精简不改变作者归属。文件数减少也不代表研究效果改善。

## 必要检查

```powershell
python scripts/check_skill_ir_doc_links.py
python -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py
bun ./scripts/experiment-catalog/cli.ts check
```

本轮目录体量与保留决定见[治理盘点](../../results/skill-ir/governance-inventory-20261028.json)。日常阅读集的行数只是维护提醒；真实错误以缺路径、断链、冲突或过时结论为准。
