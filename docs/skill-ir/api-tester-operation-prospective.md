# API Tester 操作级未见输入 prospective 组件

## 作用与边界

本组件为 `skill-ir-api-tester-operation-prospective-001` 提供预注册、输入锁、一次性 `12 real + 6 synthetic` 串行执行、严格结果核验和独立复现比较。它复用普通输入入口 `api-tester-operation-input-run.ts` 与候选绑定 `skill-ir-api-tester-operation-candidate-binding-002`，不修改 `api-tester-openapi-subset-v2`、操作枚举/准入/投影/构造/checker 算法或候选 001。

公开来源检索和下载只发生在 pre-source freeze 已提交并推送之后，并与离线候选运行分账。项目运行时的模型、被测业务 API 和付费调用均为 0。合成输入不计入真实文档结果；局部操作通过不代表整份文档或真实 API 行为通过。

## 预注册合同

`API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL` 固定以下内容：

- GitHub public repository search 的两条查询、单页范围和 `query index → API rank → repository full name → document path` 排序；
- OpenAPI 3.0/3.1、JSON/YAML、100 B–2 MiB、1–2000 operations、许可证 allowlist；
- 已暴露仓库、fork/archive、source digest、repository/lineage 重复的排除规则；
- 12 个真实文档（原则上 12 个独立仓库）和 6 个合成边界；
- 每行一次、0 retry、0 replacement、0 candidate fix；已 dispatch 无 terminal 时 fail closed 且禁止重发；
- 每文档 120 秒、整个 18 行最大 2160 秒的资源上界；
- source shortfall 不放宽规则，报告实际数量与缺口，不能据此创建 18 行执行锁。

真实选择只能使用来源、许可、格式、大小、重复和操作数资格。`qualifyApiTesterOperationSourceCandidate` 不导入或运行候选。选择报告保存搜索响应摘要、所有纳入/排除决定、上游 commit/path、原始 source/license 字节摘要和获取成本。prediction 报告必须在 candidate trial 前覆盖全部选定真实行，允许写 `unknown` 及原因。

## 六个合成边界

`benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/` 中的 6 个输入分别覆盖：内联 path 参数正例、本地 ref + query array + inherited API key 正例、cookie 拒绝与独立合格操作共存、OAuth2 拒绝、path-item ref 导致枚举不完整，以及缺失本地参数依赖。每份输入有普通 manifest；其 source bytes、manifest bytes、预期关系和实际严格核验都进入 synthetic validation 报告。

`synthetic-unresolved-path-item-ref` 的期望严格结果是 `source-coverage-fail`。这是遗漏检测器的预期正向证据，不可改写为候选成功或基础设施失败。

正式 pre-source synthetic validation 归档位于
`results/skill-ir/api-tester-operation-prospective-001/pre-source-synthetic-validation/`。其 `report.json` SHA-256 为
`8fd612c8ff9c5fcd149f31b89ba35686e0c2a74dd99f3a59d146106d5009b8df`；6/6 rows 达到各自预期，strict verifier 返回
`verified`，并明确记录 `prospectiveRuns=0`、`realDocumentsRead=0`。

## 运行与证据

实现入口：

- `src/benchmarks/skill-ir/api-tester-operation-prospective.ts`：schema、资格判断、lock/state/report 构造、runner、strict verifier、Git freeze 与复现语义比较；
- `src/benchmarks/skill-ir/api-tester-operation-prospective-run.ts`：命令行入口；
- `src/benchmarks/skill-ir/api-tester-operation-prospective-freeze.test.ts`：协议、shortfall、单次 dispatch、18 行、tamper 与 synthetic TDD。

runner 在第 0 行前核验候选闭包、pre-source freeze、selection/prediction/lock、18 份 source/manifest、12 份 license、Git 远端祖先、运行时和 tracked-clean 状态。每行先持久化 `prepared` 与 `dispatched`，再通过独立 Bun 子进程调用普通入口，并归档 invocation、stdout、stderr、exit、candidate output 和 terminal；子进程预算取 120 秒与剩余 2160 秒累计预算的较小值。单行超时/非零退出形成对应 terminal；累计预算在下一行 dispatch 前耗尽则把现场标为 fail-closed，剩余行不执行且禁止重发。state 与 prefix 只在 terminal 已写入后推进。

最终 `output-manifest.json` 绑定除自身外的完整输出闭包。strict verifier 独立读取 lock bytes、state、prefix、journal、candidate report/output manifest，重建 prepared/dispatched/invocation/exit/stdout 的预期语义，并在隔离目录重放普通 output verifier；即使同时重签外层 manifest，journal 语义篡改也失败。任何额外、缺失、摘要漂移、行顺序变化、lock 替换或候选摘要漂移都失败。

## CLI

以下命令中的路径均相对 `--root`，输出为 write-once：

```powershell
bun ./src/benchmarks/skill-ir/api-tester-operation-prospective-run.ts --mode=validate-synthetic --root=. --out=results/skill-ir/api-tester-operation-prospective-001/pre-source-synthetic-validation --completed-at=<ISO> --node=<node>
bun ./src/benchmarks/skill-ir/api-tester-operation-prospective-run.ts --mode=verify-synthetic --root=. --out=results/skill-ir/api-tester-operation-prospective-001/pre-source-synthetic-validation --node=<node>
bun ./src/benchmarks/skill-ir/api-tester-operation-prospective-run.ts --mode=create-pre-source-freeze --root=. --out=benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/pre-source-freeze.json --execution-commit=<commit> --frozen-at=<ISO> --synthetic-validation=results/skill-ir/api-tester-operation-prospective-001/pre-source-synthetic-validation/report.json --node=<node> --git=git
bun ./src/benchmarks/skill-ir/api-tester-operation-prospective-run.ts --mode=verify-pre-source-freeze --root=. --freeze=<freeze.json> --freeze-commit=<remote-commit> --node=<node> --git=git
bun ./src/benchmarks/skill-ir/api-tester-operation-prospective-run.ts --mode=create-lock --root=. --freeze=<freeze.json> --freeze-commit=<commit> --selection=<selection.json> --predictions=<predictions.json> --selection-commit=<commit> --out=<lock.json> --frozen-at=<ISO>
bun ./src/benchmarks/skill-ir/api-tester-operation-prospective-run.ts --mode=verify-lock --root=. --freeze=<freeze.json> --freeze-commit=<commit> --lock=<lock.json> --execution-commit=<remote-commit> --node=<node> --git=git
bun ./src/benchmarks/skill-ir/api-tester-operation-prospective-run.ts --mode=execute --root=. --freeze=<freeze.json> --freeze-commit=<commit> --lock=<lock.json> --execution-commit=<remote-commit> --out=<first-run-output> --started-at=<ISO> --node=<node> --git=git
bun ./src/benchmarks/skill-ir/api-tester-operation-prospective-run.ts --mode=verify-first-run --root=. --freeze=<freeze.json> --freeze-commit=<commit> --lock=<lock.json> --execution-commit=<remote-commit> --out=<first-run-output> --node=<node> --git=git
bun ./src/benchmarks/skill-ir/api-tester-operation-prospective-run.ts --mode=reproduce --root=. --freeze=<freeze.json> --freeze-commit=<commit> --lock=<lock.json> --execution-commit=<remote-commit> --first-run-report=<report.json> --out=<reproduction-output> --started-at=<ISO> --node=<node> --git=git
```

## 验证

```powershell
bun test ./src/benchmarks/skill-ir/api-tester-operation-prospective-freeze.test.ts
bun run typecheck
```

focused 测试包括缺失模块 RED、协议/去重/shortfall、重复 dispatch、累计运行时限、report 分母漂移、完整 18 行子进程运行、lock/output/journal 协同重签篡改、六 synthetic 普通入口和 source-coverage 预期失败。

## 失败模式与修改注意事项

- pre-source freeze 未在指定 origin 分支上、工作字节与冻结提交不一致或运行时漂移：第 0 行前停止；
- selection 不足 12：保存 shortfall，不放宽规则、不补行、不创建可执行 lock；
- prediction、source、license、manifest 或 lock 摘要不闭合：第 0 行前停止；
- 行在候选层拒绝、unresolved、source advisory/blocking 或 checker fail：记录 terminal，保留分母并继续；
- 进程超时/非零退出：记录 infrastructure terminal，不重试；
- dispatch 后因宿主崩溃没有 terminal：保留现场，禁止同 identity 重发；
- 修改 protocol、runner、synthetic 或依赖必须使用新 identity/freeze；不得覆盖首轮或复现证据。

历史 Meilisearch 缺失引用、Bangumi external-response advisories、原文档级 `0/6`、缺失 clean-002、readiness=false 均不由本组件改变。
