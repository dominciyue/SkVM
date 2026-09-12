# Skill IR 文档入口

本目录维护 SkVM 的 Skill IR、AOT 优化、验证与产物交付文档。它是 Skill IR 子系统的入口，不代替 SkVM 整体项目文档。

## 从这里开始

1. [当前状态](current-status.md)：唯一的实时状态入口，回答现在能做什么、当前路线和直接运行命令。
2. [SkVM 架构](../architecture.md)：项目模块、运行时与数据流。
3. [使用说明](../usage.md)：SkVM CLI 和常用工作流。
4. [JIT Boost](../jit-boost.md)：运行时优化与日志采集。
5. [开发指南](developer-guide.md)：当前开发、测试和文档规则。

## 当前阅读集

| 文档 | 职责 |
|---|---|
| [current-status.md](current-status.md) | 唯一当前状态 |
| [developer-guide.md](developer-guide.md) | 上手与开发 |
| [skill-ir-aot-optimization-spec.md](skill-ir-aot-optimization-spec.md) | 方法边界与成功条件 |
| [skill-ir-aot-optimization-plan.md](skill-ir-aot-optimization-plan.md) | 当前未完成任务 |
| [ir-core.md](ir-core.md) | IR、解析、验证与 lowering |
| [optimization-and-artifacts.md](optimization-and-artifacts.md) | 优化、提案、封装与产品链 |
| [evaluation-system.md](evaluation-system.md) | runner、checker、scorer 与证据资格 |
| [real-skill-pilots.md](real-skill-pilots.md) | 代表性 skill 和可交付边界 |
| [api-task-engine.md](api-task-engine.md) | API TaskContract、请求执行与 checker |
| [classification-and-routing.md](classification-and-routing.md) | 能力分类、路由与发放边界 |
| [external-skill-import.md](external-skill-import.md) | 外部 skill 导入 |
| [evidence-index.md](evidence-index.md) | 主张、适用范围和结果位置 |
| [history.md](history.md) | 历史阶段和已退出路径恢复表 |

## 版本化验证材料

少量 Markdown 由校验器、冻结 JSON 或脚本按原路径读取并校验摘要。它们不是当前阅读入口，但在依赖退出前必须保留原路径和原字节。清单由
[`scripts/skill_ir_doc_governance.json`](../../scripts/skill_ir_doc_governance.json)维护。不要为了缩减文件数合并、重命名或改写这些文件。

## 文档写入规则

- `spec` 只维护方法、边界和长期验收条件。
- `plan` 只维护当前未完成任务；实时状态只写入 `current-status.md`。
- 运行证据写入 `results/skill-ir/`，文档只链接最窄结果，不复制执行流水。
- 历史过程依靠 Git 与 `history.md` 恢复，不建立第二棵 archive 目录。
- 默认更新当前阅读集中的现有文档；新增长期文档必须承担现有文档无法容纳的新职责。

## 文档检查

```powershell
python scripts/check_skill_ir_doc_links.py
python -m unittest scripts/check_skill_ir_doc_links_test.py
```

文件数与行数只作维护提醒；缺失入口、当前/版本化清单冲突、错误迁移引用才会失败。
