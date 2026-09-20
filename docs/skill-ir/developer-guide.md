# Skill IR 开发指南

本指南说明开发入口、组件分工和常用检查。项目进度见 [current-status.md](current-status.md)，历史阶段见 [history.md](history.md)。

## 1. 先建立项目视图

1. 阅读 [current-status.md](current-status.md)。
2. 按任务阅读 [当前 plan](skill-ir-aot-optimization-plan.md)及相关 spec/组件章节。
3. 需要整体背景时阅读 [架构](../architecture.md)、[使用说明](../usage.md)和[JIT Boost](../jit-boost.md)。
4. 检查工作树，保留其他线程的未提交修改。

已实现的通用流程是“真实 trace → 模型优化 → 新 skill 包 → agent 消费”。授权方向另有一个窄域开发原型，用 canonical declaration、义务展开、固定上下文零工具宿主和逐事实评价比较 organized instruction 与领域支持；它不是产品 CLI、通用安全 DSL 或生产默认路径。下文说明可复用的现有工程流程，当前领域工作见[当前计划](skill-ir-aot-optimization-plan.md)与 spec 14.34。

### 1.1 授权 DSL 开发原型

[V0–V10 任务书](../superpowers/plans/2026-09-20-authorization-dsl-prototype-development.md)和[研究 §7.19](skill-dsl-research.md#719-v-开发合同与持续复盘)描述已实现接口。它处理单 repository/ref、fixed-context、source-visible authorization obligation。领域代码位于 `src/task-dsl/authorization/`，实验代码位于 `src/benchmarks/authorization-dsl/`；下一轮变更见 [W 任务书](../superpowers/plans/2026-09-21-authorization-dsl-transport-and-evaluation.md)。

公开边界如下：

- `parseAuthorizationTask(input)`：strict 解析 canonical declaration，错误带字段路径。
- `compileAuthorizationTask(task)`：解析引用与政策状态，只把显式 obligation × entry 展开为稳定 `author::entry` ID。
- `renderAuthorizationTask(compiled, "B" | "D")`：从同一事实对象渲染 organized baseline 或 canonical domain plan；两臂共同列出 exact runnable output-ID 闭集。
- `validateAuthorizationResult(compiled, answer, sourceBundle)`：分别检查结构、声明义务、引用存在、范围声明和依赖快照；语义支持仍为 `unreviewed`。
- `runAuthorizationTask(...)`：在注入 provider、精确源码束和固定预算下生成，记录每次 schema/fallback/repair attempt；没有可执行工具。
- `evaluateAuthorizationGeneration`、`summarizeAuthorizationRun` 与 `summarizeAuthorizationPair`：消费哈希绑定的 development-agent review，不能从关键词或 citation 存在性推断正确性。

声明顶层字段为 `schemaVersion/taskId/request/repository/sourceRef/sourceMode/policySources/principals/resources/entries/obligations/scopeAssurance/requiredAnalysis/constraints`。每条 obligation 明确 `principalId/resourceId/relation/operation/expectation/conditions/policySourceId/entryIds`；`expectation` 是规范方向，不是源码观察。结果按 exact expanded ID 返回 `source_supported_failure | source_refuted | unknown`，并给出 entry、binding、control、effect、condition 事实、引用、缺失事实/最小观察和 bounded scope claim。

在仓库根使用四条开发命令：

```powershell
bun ./src/benchmarks/authorization-dsl/run.ts check
bun ./src/benchmarks/authorization-dsl/run.ts run --config=./results/skill-ir/skill-dsl-research/development/authorization-v0/comparison-config.json
bun ./src/benchmarks/authorization-dsl/run.ts evaluate --run-dir=./results/skill-ir/skill-dsl-research/development/authorization-v0/runs/initial
bun ./src/benchmarks/authorization-dsl/run.ts status
```

只有 `run` 初始化并调用模型；help、check、evaluate、status 和离线 replay 都不调用 provider。check 写 `development/authorization-v0/check.json` 与 previews；run 按 attempt 写 `runs/<attempt>/run-metadata.json`、index 及逐单元 declaration/source/prompt/dispatch/run；evaluate 写 hash-bound review template、evaluation 和 summary。开发状态、总结果与离线复验分别在 `status.json`、`summary.json`、`offline-replay.json`。

常见错误含：字段路径解析错误；`declaration-source-location-invalid`；`foreign-obligation-result`/`missing-obligation-result`；`citation-text-mismatch`；`semantic-review-missing`；`timeout-unknown`。前四类按诊断修改输入、输出合同或本地结果；review 缺失时必须在全部生成结束后依据 evaluator-only rubric 填写，不能交还被测模型；timeout 表示已发请求的 completion/usage 可能未知，禁止自动重发。运行器在 provider 创建前设置 `SKVM_AUTO_PROBE=0` 和指定 cache；有 `run.json` 的终态及只有 dispatch 的 completion-unknown 单元都不会自动发送。确需新 revision 时使用新 attempt、明确原因和独立目录，保留旧结果。

9 月 21 日复核确认：上述恢复规则已存在，但宿主超时后的底层 fallback 尚未关闭，repair 超时也可能丢失返回对象中的 initial。W 将以迟到响应测试、事件落盘和关闭状态修复；执行新的模型比较前先完成该项。

## 2. 当前端到端流程

### 2.1 收集真实 trace

普通使用从一次自然任务开始，由 bare-agent 自动收集本次运行记录：

```powershell
skvm run --prompt="<task>" --skill=./skill --workdir=./project --model=<id> --optimize
```

优化模型默认沿用 `--model`，需要区分时指定 `--optimizer-model`。已有日志时，保留原 skill、成功/失败记录、失败 sidecar、模型身份与任务上下文，使用高级日志入口。该入口不会重跑原任务：

```powershell
skvm jit-optimize `
  --skill=path/to/skill-dir `
  --task-source=log `
  --logs=path/to/log1.jsonl,path/to/log2.jsonl `
  --failures=path/to/log1-failure.json,path/to/log2-failure.json `
  --optimizer-model=<id> `
  --target-model=<id>
```

### 2.2 审阅 proposal

```powershell
skvm proposals list
skvm proposals show <id>
skvm proposals accept <id>
```

接受 proposal 会应用选定改动，但不是质量认证。检查 Evidence 中的未知项和剩余职责；研究效果仍需相应的比较证据。

### 2.3 生成并消费新包

自动入口会尝试导出新包；高级日志入口可用 `--package-out=<new-empty-directory>` 指定位置。API request/pytest、Env preset 和外部 skill import 按任务需要使用。查看包内 `OPTIMIZATION-USAGE.md` 了解入口和限制；新包应当：

- 可独立定位与加载；
- 记录 source、proposal、选中版本、已有接受决定和产物摘要；
- 保留未固化的说明与 agent 职责；
- 在新消费任务中记录真实 trace；
- 由与公开合同一致的 checker 或明确人工接受边界验证。

## 3. 组件归属

| 要改的内容 | 先读 |
|---|---|
| schema、parser、validator、pass、lowering | [ir-core.md](ir-core.md) |
| Evidence、proposal、artifact、产品 CLI | [optimization-and-artifacts.md](optimization-and-artifacts.md) |
| runner、checker、scorer、研究 gate | [evaluation-system.md](evaluation-system.md) |
| API TaskContract、请求与 pytest/checker | [api-task-engine.md](api-task-engine.md) |
| Q1/Q2 分类、能力图、发放边界 | [classification-and-routing.md](classification-and-routing.md) |
| 外部 skill closure | [external-skill-import.md](external-skill-import.md) |
| 代表案例与适用范围 | [real-skill-pilots.md](real-skill-pilots.md) |
| 授权任务 DSL 声明、义务、渲染、消费与评价 | [研究开发合同](skill-dsl-research.md#719-v-开发合同与持续复盘)及 [W 任务书](../superpowers/plans/2026-09-21-authorization-dsl-transport-and-evaluation.md) |

## 4. 实现纪律

- 先写失败测试，再做最小实现，最后运行聚焦测试与必要的更广验证。
- 通用 core 不按 skill id、case id 或模型名分支。
- 研究 gate 只保护冻结输入、外部副作用、付费执行、held-out 和主张资格；本地可逆修改不重复加门。
- scorer/checker 必须与公开接口一致，不得私下要求未公开字段或答案。
- 保留完整分母、失败行、未知成本与 stop-loss；不得为了漂亮结果补跑或换样。
- 结果写到 `results/skill-ir/`，文档链接结果，不复制长流水。

## 5. 常用验证

```powershell
bun run typecheck
python -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py
```

组件测试按改动范围运行，例如：

```powershell
bun test ./src/skill-ir
bun test ./src/benchmarks/skill-ir/task-automation-annotation-package.test.ts
```

执行历史实验前先确认身份是否允许重放。冻结结果、paid run、held-out 和原摘要绑定默认不可因文档治理而重跑。

## 6. 常见失败处理

- 输入摘要不匹配：停止，确认拿到的是否为冻结版本，不覆盖原件。
- checker 拒绝但公开合同满足：按测量身份问题处理，不把它解释成模型失败。
- 基础设施失败：保留失败行与调用成本，按任务书 stop-loss 收口。
- 新包遗漏职责：退回固化边界，不能用说明文档删除原职责。
- 文档链接失败：迁移普通导航；若目标是运行时按摘要读取的版本化材料，保留原路径与原字节。

## 7. Git 与协作

- 在 `skill-ir-aot` 工作，只推送用户 `origin`。
- 精确暂存本任务文件，不夹带其他线程的代码、未跟踪实验或临时产物。
- 治理线程负责归并与导航；最新任务书/spec 的方法决定由开发线程维护。治理提交前读取最新字节并做局部合并，不整份覆盖。
- 有意义阶段只在根目录 conversation log 留一条短记录；长期决定才进入 communication，当前恢复信息才进入 handoff。

## 8. 历史与证据

- [evidence-index.md](evidence-index.md)：主张、范围与最窄结果路径。
- [history.md](history.md)：历史主题与退出路径恢复。
- Git：精确正文与演进过程。
- `results/skill-ir/`：机器证据与失败原件。
