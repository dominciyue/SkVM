# Skill IR 当前状态

- 更新日期：2026-09-13
- 工作分支：`skill-ir-aot`
- 当前路线：U0–U7，“真实 trace → 模型优化 → 新 skill 包 → agent 消费”
- 执行状态：`active`（U0 已完成基线冻结，U1 trace adapter TDD 进行中）

本页是 Skill IR 唯一实时状态入口。日期化任务书、历史计划和结果报告都不是“当前状态”。

## 1. 现在能做什么

- 从真实 agent 日志读取 trace，生成 Evidence、优化 workspace 和 proposal；日志源不会重跑原任务。
- 查看、接受或拒绝 proposal，并把已接受修改落到新的 skill 包。
- 使用 Skill IR 的 parser、validator、静态 pass、lowering、runner、checker/scorer 和 paired analyzer。
- 构造并验证受限 API TaskContract；既有 API Tester 与 Env Manager 产品路径继续可用。
- 用 `skvm artifact`、standalone verified-artifact 工具和 external-skill import 处理已支持产物。

SkVM 整体能力和 JIT 路径见[架构](../architecture.md)、[使用说明](../usage.md)与[JIT Boost](../jit-boost.md)。

## 2. 当前基线

开发线程已启动 U0–U7。U0 已确认既有 JIT optimize 基线测试 45 pass / 0 fail，并绑定两份仓库内真实运行材料；
U1 正在为 Pi run-summary 与 bare-agent runtime-event trace 编写 adapter。最新机器恢复入口为
`results/skill-ir/trace-guided-skill-optimization-20260913/status.json`，其状态优先于日期化文档中的旧快照。

既有 API TaskContract 基线保留为可复用后端：6 个输入、3 个 provider、47 个 operation、9 个 task；当前结果为
4/9 task、8/18 run 通过，10 个失败待归因；native runner 4 pass / 5 skip。它不是当前路线本身，也不代表
trace 优化闭环已完成。最窄证据入口见[证据索引](evidence-index.md)。

## 3. 当前计划

目标是验证一个端到端产品闭环：

1. U0 冻结真实 trace、原 skill 与消费任务（基线已完成）。
2. U1 把 trace 转为可审计 Evidence（进行中）。
3. U2 由模型提出覆盖全部证据支持机会的优化。
4. U3 固化确定部分，同时保留未自动化职责。
5. U4 生成新的独立 skill 包。
6. U5 让 agent 在新任务中真实消费该包。
7. U6 做成对质量与成本比较。
8. U7 汇总结论、限制和下一轮入口。

任务级细节见[当前计划](skill-ir-aot-optimization-plan.md)与[日期化任务书](../superpowers/plans/2026-09-13-api-task-usable-delivery.md)。

## 4. 直接运行

真实日志优化：

```powershell
skvm jit-optimize `
  --skill=path/to/skill-dir `
  --task-source=log `
  --logs=path/to/log1.jsonl,path/to/log2.jsonl `
  --failures=path/to/log1-failure.json,path/to/log2-failure.json `
  --optimizer-model=<id> `
  --target-model=<id>
```

审阅与落地 proposal：

```powershell
skvm proposals list
skvm proposals show <id>
skvm proposals accept <id>
```

开发前检查：

```powershell
bun run typecheck
python scripts/check_skill_ir_doc_links.py
```

## 5. 当前限制

- 当前只有 U0 基线证据；U1–U7 尚未完成，不能写成闭环已交付。
- 模型 proposal 不自动获得正确性；必须由明确 checker 或人工接受边界约束。
- 固化只能覆盖证据支持的稳定部分，未自动化职责必须随新 skill 包保留。
- development 结果不能外推到 held-out、跨模型、任意 skill 或人工节省。
- 被校验器按摘要绑定的版本化材料不得重写、移动或删除。

## 6. 证据与历史

- 当前主张到最窄结果路径：[evidence-index.md](evidence-index.md)
- 历史阶段与删除路径恢复：[history.md](history.md)
- 机器结果：`results/skill-ir/`
- 完整变更过程：Git 历史

## 7. 文档职责

- 方法与边界：[spec](skill-ir-aot-optimization-spec.md)
- 当前任务：[plan](skill-ir-aot-optimization-plan.md)
- 开发和测试：[developer guide](developer-guide.md)
- 组件接口：[IR](ir-core.md)、[优化与产物](optimization-and-artifacts.md)、[评价](evaluation-system.md)、
  [API 引擎](api-task-engine.md)、[分类与路由](classification-and-routing.md)
