# Skill IR 当前状态

- 更新日期：2026-09-13
- 工作分支：`skill-ir-aot`
- 当前路线：U0–U7，“真实 trace → 模型优化 → 新 skill 包 → agent 消费”
- 执行状态：`completed`（U0–U7 已完成；待用户复核 development 交付）

本页是 Skill IR 唯一实时状态入口。日期化任务书、历史计划和结果报告都不是“当前状态”。

## 1. 现在能做什么

- 从 Pi run-summary、bare-agent runtime-event 和既有 conversation log 读取 trace，保留来源摘要、定位、表示层级、诊断和未知 usage，并生成 Evidence、优化 workspace 和 proposal；日志源不会重跑原任务。
- 从本轮 `skill-ir-trace-guided-agent-consumption/v1` 报告及其摘要绑定 Pi 事件恢复完整 conversation trace、checker criterion 与 cache usage；缺失费用仍保持 unknown。
- 查看、接受或拒绝 proposal，并把已接受修改落到新的 skill 包。
- 从 JIT proposal 构造带精确文件闭包的新 API Tester skill 包；包内普通输入入口接收 v2 binding、工作目录和输出目录，并复用未放宽的 `api-tester-openapi-subset-v2` generator/checker。
- 在普通任务目录运行真实 Pi agent，依据实际 read/exec tool call 而非最终文字核验 skill 加载与 helper 消费，并对相同 model、input、binding 和 runtime 的原/新结果做成对比较。
- 使用 Skill IR 的 parser、validator、静态 pass、lowering、runner、checker/scorer 和 paired analyzer。
- 构造并验证受限 API TaskContract；既有 API Tester 与 Env Manager 产品路径继续可用。
- 用 `skvm artifact`、standalone verified-artifact 工具和 external-skill import 处理已支持产物。

SkVM 整体能力和 JIT 路径见[架构](../architecture.md)、[使用说明](../usage.md)与[JIT Boost](../jit-boost.md)。

## 2. 当前基线

开发线程已启动 U0–U7。U0 已确认既有 JIT optimize 基线测试 45 pass / 0 fail，并绑定两份仓库内真实运行材料；
U1 已完成多格式 adapter，U2 已用 16 条真实 run-summary 生成有效 proposal，U3 已构造并核验独立 skill 包。第二次优化中出现的
未声明 `NUL` 文件已作为失败证据保留；包构造器明确记录并排除它，优化器提示合同也已增加可移植性回归。新包已在仓库内真实
development OpenAPI 输入上通过独立 v2 checker。U4 已保留首次输出目录约束错误，并由修订包完成真实 agent 加载、helper 调用和独立 checker；
U5 在三个已暴露 development skill、三个仓库上完成职责匹配，其中两个成员共享同一 helper，第三个成员在单条 trace 下得到有依据的
no-change。U6 对两个可打包成员各做原输入与变化输入，4/4 原包和 4/4 新包均通过相同 checker，新包 4/4 有实际 helper tool-call
证据。最新机器恢复入口为 `results/skill-ir/trace-guided-skill-optimization-20260913/status.json`，其状态优先于日期化文档中的旧快照。

四组成对结果为 `mixed`：累计耗时下降 56.79%，输出 token 下降 75.66%；输入 token 上升 62.86%，cache-read 上升 73.75%，
总 observed token 上升 60.59%。provider 定价不可用，实际 USD 成本保持 unknown；这些结果不能写成总体或人工节省。

既有 API TaskContract 基线保留为可复用后端：6 个输入、3 个 provider、47 个 operation、9 个 task；当前结果为
4/9 task、8/18 run 通过，10 个失败待归因；native runner 4 pass / 5 skip。它不是当前路线本身，也不代表
trace 优化闭环已完成。最窄证据入口见[证据索引](evidence-index.md)。

## 3. 当前计划

目标是验证一个端到端产品闭环：

1. U0 冻结真实 trace、原 skill 与消费任务（基线已完成）。
2. U1 把 trace 转为可审计 Evidence（已完成）。
3. U2 由模型提出覆盖全部证据支持机会的优化（已完成）。
4. U3 固化确定部分，同时保留未自动化职责（已完成）。
5. U4 生成新包并让 agent 在普通目录真实消费（已完成，保留首次失败）。
6. U5 在同类职责上验证复用范围（已完成：3 skill / 3 repo，2 package + 1 no-change）。
7. U6 做成对质量与成本比较（已完成：4 对，质量持平，效果 mixed，USD unknown）。
8. U7 汇总结论、限制和下一轮入口（已完成：81 tests、typecheck、2 package、文档与证据绑定均通过）。

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

构造、核验并使用新的局部固化包：

```powershell
bun scripts/skill-ir/trace-guided-api-tester-package.ts build `
  --proposal <jit-proposal-directory> `
  --out-dir <new-empty-package-directory>
bun scripts/skill-ir/trace-guided-api-tester-package.ts verify `
  --package <package-directory>
bun <package-directory>/scripts/api-task-solidify.js `
  --binding <binding.json> `
  --workdir <task-workdir> `
  --out-dir <new-empty-output-directory> `
  --node node
```

真实 agent 消费与成对效果分析：

```powershell
bun scripts/skill-ir/trace-guided-api-tester-agent-run.ts `
  --skill-dir <skill-or-package-directory> `
  --binding <binding.json> `
  --input <openapi-file> `
  --run-dir <new-empty-run-directory> `
  --evidence-dir <new-empty-evidence-directory> `
  --model <provider/model> `
  --condition <identity> `
  --require-helper true
bun scripts/skill-ir/trace-guided-effect-analysis.ts `
  --pairs <pair-manifest.json> `
  --out <new-effect-report.json>
```

开发前检查：

```powershell
bun run typecheck
python scripts/check_skill_ir_doc_links.py
```

## 5. 当前限制

- U0–U7 已完成并形成机器 closure；当前闭环只支持本轮 development 范围。
- 模型 proposal 不自动获得正确性；必须由明确 checker 或人工接受边界约束。
- 固化只能覆盖证据支持的稳定部分，未自动化职责必须随新 skill 包保留。
- 第三个 skill 只有一条合格 trace，no-change 是正确结果，不能为凑包数强制固化；三份 skill 不是随机总体样本。
- 四组成对结果同时含下降和上升指标，且 provider USD 定价未知，不声称成本或人工节省。
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
