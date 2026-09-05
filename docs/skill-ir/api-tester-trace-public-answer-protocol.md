# API Tester Trace + Public Answer 协议

**状态：** development-only、零付费 dry-run 已实现；首个 paid original identity 已在第 1 行 smoke 失败后冻结为负结果。
**identity：** dry-run `skill-ir-api-tester-trace-public-answer-development-001`；paid `skill-ir-api-tester-trace-public-answer-paid-development-001`
**最后更新：** 2026-09-05

## 目的

API Tester 属于“公开产物可得”档位。这个协议把一次合法 API 操作过程压缩为可审计的决策账，
再从同一 development task 的公开 OpenAPI fixture 独立重建 canonical public answer，检查两者是否一致。

它不是 token 成本账、模型质量报告或独立 runtime。trace 不携带模型正文，也不把 evaluator/gold 搬进
compiler 或 artifact。

## 权威实现

```text
src/benchmarks/skill-ir/api-tester-trace-public-answer.ts
src/benchmarks/skill-ir/api-tester-trace-public-answer.test.ts
benchmarks/skill-ir/pilots/api-tester/development/tasks.json
```

公共 task declaration 仍由 API Tester `skill-ir-tasks/v1` 合同验证；只读取两份 development fixture，
不读取 `heldout/tasks.json`。

## Public answer

`buildPublicAnswerFromTask()` 要求 task 是 development split，并且恰好包含一份
`api/openapi.json` 或 `api/openapi.yaml` fixture。它调用公开 source-derived oracle，生成：

- OpenAPI fixture 的相对路径和 SHA-256；
- 按 `path:method` 排序的 operation sequence；
- 成功/错误 status class（如 `2xx`、`4xx`）；
- 公开 security header 名称；
- 公开约束的 `location:name` 标识。

答案不包含请求值、响应值、gold、evaluator payload、模型文本、绝对路径或 secret。

固定 normalization 只有两条：

1. HTTP method 转大写；
2. 非根路径去掉末尾 `/`。

## Trace

`skill-ir-api-tester-trace/v1` 的每个 `orderedDecisionSteps` 至少包含：

```json
{
  "stepIndex": 0,
  "kind": "operation",
  "toolName": "http-client",
  "operation": "GET /users",
  "method": "GET",
  "path": "/users",
  "inputShapeDigest": "<sha256>",
  "outputShapeDigest": "<sha256>",
  "selectedNextStep": "1",
  "expectedAnswerRef": "operation:GET:/users",
  "status": "accepted"
}
```

`inputShapeDigest`/`outputShapeDigest` 只承诺结构摘要，不保存真实参数或响应。`selectedNextStep` 必须与
trace 内的顺序自洽；`expectedAnswerRef` 必须是归一化后的公开 operation ref。

禁止写入：raw reasoning、完整模型文本、prompt、API key/secret、绝对路径、workdir、gold/evaluator
payload、held-out 内容。schema 为 strict，比较器也会对递归字段做 fail-closed sink audit。

## Parity 分类

`compareTraceToPublicAnswer()` 返回固定枚举：

| parity | 含义 | pass |
|---|---|---:|
| `exact` | 操作顺序、method/path 表示和 public ref 完全一致 | 是 |
| `equivalent` | 仅发生预注册 normalization，归一化后完全一致 | 是 |
| `missing` | trace 是公开答案的真子集 | 否 |
| `extra` | 出现未在公开答案中的 operation | 否 |
| `invalid` | schema、字段一致性、next-step、ref 或禁止 sink 失败 | 否 |
| `ambiguous` | 重复 operation 或顺序无法唯一映射 | 否 |

遇到未知公开结构、trace 不完整、identity/task 不匹配或 digest 漂移时必须 fail closed；不能猜测或调用
模型补齐答案。

## 零付费 dry-run

```powershell
cd D:\skill优化\SkVM
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' test ./src/benchmarks/skill-ir/api-tester-trace-public-answer.test.ts
```

代码 API：

```typescript
await runApiTesterTracePublicAnswerDryRun({
  rootDir: process.cwd(),
  outDir: "<new-empty-directory>",
})
```

dry-run 会写入：

```text
<out>/
  dry-run-report.json
  public-answers/<task-id>.json
  traces/<task-id>-baseline.json
  traces/<task-id>-mutation.json
```

每份 development task 产生两行：

- `baseline-pass`：由 public answer 生成的完整 trace，预期 `exact/pass=true`；
- `mutation-fail`：删除一个合法步骤后的 trace，预期 `missing/pass=false`。

报告固定为 4 rows，`modelCalls=0`、`apiCalls=0`、`paidCalls=0`。`authoringMinutes` 与 `reviewMinutes`
在这个 dry-run 中为 `null/not-measured`，不能把历史 adapter LOC 或模型运行时间后验填入。

## Paid original 边界（已预注册）

首个 paid identity 只允许档 1 的 API Tester，固定 2 task × 2 repetition = 4 original rows；
这 4 行同时就是付费上限（`paidCalls <= 4`、`modelCalls <= 4`、`apiCalls <= 4`），首行包含在分母内并先作
smoke，不另加资格调用。`retries=0`、无 reserve、无 replacement。smoke 失败立即停止，失败行留在分母中，
不换 route、不补行、不修改 public answer/checker/artifact。held-out、portfolio/readiness 和“优化后的 LLM
更稳”均不由本协议授权。

新 lock 位于 `benchmarks/skill-ir/pilots/api-tester/trace-public-answer-paid-development-001-lock.json`；执行器为
`src/benchmarks/skill-ir/api-tester-trace-paid-run.ts`。lock 固定 GPT route、task 顺序、预算、stop-loss，以及 task、
skill、checker、oracle、runner 和两份 public answer 的 SHA-256。`preflight` 只确认 API key 非空和这些 digest 未漂移，
不保存 key 值、不 dispatch。

人工分钟从 lock 的 `measurementStartedAt` 前瞻计量。只计入该窗口内真实发生的主动人工编写/审核分钟；模型等待、
controller 和 scorer 时间不得冒充人工时间。本次由自动执行器完成、没有人介入逐行编写或审核时，合法观测为
`authoringMinutes=0`、`reviewMinutes=0`，状态必须明确为 `prospective-measured-no-human-intervention`，不能填历史 LOC
或后验估时。

## 首个 paid 结果

权威报告为 `results/skill-ir/api-tester-trace-public-answer-paid-development-001/report.json`，lock SHA-256 为
`63d03f56d32f410f360374c2f4316e84bf3e403db102c70f6a4da3527604a130`。第 1 行
`api-tester-openapi-users-dev-001 / repetition 1` 自然结束，parser 与 usage 可用，trace 对 public answer 为
`exact`；但 deterministic API Tester scorer 未通过 `api-schema-derived-cases`、`api-security-response` 和
`api-independence-verification`，因此执行分类为 `quality-failure`，触发 `smoke-failed`。

结果只实际 dispatch 1 次：input/output/cache-read 为 `58060 / 7445 / 137344`，explicit input+output 总计
`65505`；`modelCalls=apiCalls=paidCalls=1`。第 2--4 行没有执行，`retries=reserve=replacements=0`。失败行保留在
固定四行分母中，整份 identity 状态为 `negative-smoke-frozen`；不得以同 identity 重跑、补齐或修改 route、
public answer、checker、artifact。前瞻窗口内没有人介入逐行编写或审核，因此 authoring/review 均实测为 0，而非
历史回填。该结果不改变 held-out、Stage M/N、portfolio 或 readiness。
