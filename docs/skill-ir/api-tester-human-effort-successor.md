# API Tester 人工投入 successor 设计

**状态：** `design-only-not-authorized`
**protocol：** `skill-ir-api-tester-human-effort-successor-design-001`
**活动边界：** 0 模型/API/付费调用；task set 未创作，参与者未开始，尚无人工效果证据。

## 1. 要回答的问题

在同一 deterministic quality standard 下，比较：

- A：人只拿公开 task 与 OpenAPI，从空白编写测试计划；
- B：程序从同一公开输入确定性生成候选，人审核并在需要时修复。

主结果是每个实际参与者在匹配 development tasks 上的 active human minutes、最终质量、失败尝试和修改量。
它不寻找“最低人工”，也不把 Codex/model/controller 时间当成人工。

旧 `skill-ir-api-tester-trace-public-answer-paid-development-001` 不能回答这个问题：其 paid trace 是模型生成
计划的 operation-sequence projection，没有实际人工 author/reviewer 流程；首行质量失败后已永久冻结。

## 2. 为什么不再把 LLM trace 设为前置

OpenAPI 已足以驱动现有确定性候选生成器。successor 因此固定
`usesLlmTrace=false`、`modelRequired=false`，两臂的 agent/model/token/货币活动均为 0。这样测量的是
“候选是否减少实际人工工作”，而不是模型采样、prompt 或 provider 路由的混合效果。

候选生成器绑定：

```text
src/benchmarks/skill-ir/api-tester-artifact-compiler.ts
sha256=f748a8394929101516a07c164f4bcdf08360801952fc63944616163f340fc098
```

独立质量 scorer 绑定：

```text
src/bench/evaluators/api-tester-grade.ts
sha256=8c32311030502fccdf8d56e70bb946d070ffee47c560604ad846b974272bba22
```

两者的 digest 由测试直接复核。候选 generator/package 的自洽校验不能代替该独立 scorer。

## 3. 平衡交叉设计

设计需要 2 个实际参与者、2 个 matched task pairs、共 4 个新的 public development tasks。参与者不得是
task/scorer 作者。每人完成 4 行，每个 task 跨参与者分别进入两臂一次：

| participant slot | order 1 | order 2 | order 3 | order 4 |
|---|---|---|---|---|
| `participant-01` | A | B | B | A |
| `participant-02` | B | A | A | B |

总分母为 8 rows。每行最多 30 active minutes、最多 2 次 scorer submission；失败、超时和第一次失败尝试均留在
分母，不 replacement、不后验换 task。现有两份 API Tester development task 不直接复用，以减少参与者已见旧
结果和旧 B 输出造成的学习污染。

当前 machine-readable protocol 把 `taskSetStatus` 固定为 `not-authored`，所以任何带 row 的 report 都会被
拒绝。只有新 task 经 public contract audit、匹配难度检查和冻结后，successor lock 才能改用新的 identity；
本设计文件自身不是执行授权。

## 4. 前瞻计时和失败记录

每行只接受带 ISO 时间的 `authoring | review | repair` 活动区间。validator 要求：

- 区间为正时长、按时间排序且不重叠；
- active duration 由区间推导，不能手填汇总分钟；
- candidate arm 必须绑定 generator 和 initial candidate digest，并记录 modified LOC；
- manual arm 不接收 candidate，也不伪造 candidate modified LOC；
- 每次 submission 绑定 output/scorer-report digest；失败必须保存 failed criteria；
- final status 与最后一次 scorer attempt 一致。

参与者身份只保留 pseudonymous slot。正式执行前还需要明确知情同意、暂停/退出方式和不保存个人身份信息的规则；
这些要求不能用 schema 自动代替。

## 5. 质量和分析规则

两臂使用同一 scorer、同一 hard gates。只有完整 8 行且所有最终输出通过质量门时，report 才计算两臂 active
minutes 的描述性差值；任一行缺失或未通过，状态为 `blocked-incomplete-or-quality`，时间比较为 null，
失败行仍保留。

即使得到 `completed-descriptive`，结论也只能写成：

> 在这两个参与者与四个 development tasks 条件下，观察到候选审核/修复与人工从空白编写的 active effort 差异。

不得写成最低人工、总体人群效应或普遍 API 任务结论。若要单独声称 Skill IR 的方法增益，还必须在同一公开合同下
加入直接确定性脚本或 Schemathesis 等成熟工具对照；本两臂设计不提供该归因。

## 6. 成本单位

successor 分开记录：

- `agentRuns`；
- `providerModelRequests`；
- input/output/cache token；
- `currencyCost`；
- `activeHumanMinutes`；
- `modifiedLoc`；
- `failedAttempts`。

未知值必须为 null，不把 dispatched row 同时冒充 model/API/paid calls。本设计两臂均禁止模型，因此机器活动字段
严格为 0；一次性平台工程与每任务人工适配另账。

## 7. 权威文件与验证

```text
benchmarks/skill-ir/pilots/api-tester/human-effort-successor-design-001.json
src/benchmarks/skill-ir/api-tester-human-effort-successor.ts
src/benchmarks/skill-ir/api-tester-human-effort-successor.test.ts
```

本地验证：

```powershell
bun test ./src/benchmarks/skill-ir/api-tester-human-effort-successor.test.ts
```

测试只验证 schema、digest、平衡分母、时间区间、失败保留和描述性分析规则；测试数据是构造 fixture，不是参与者
结果，不产生人工减少证据。

## 8. 进入真实执行前仍缺什么

1. 创作并审计 4 个新的 public development tasks，确认两个 matched pairs；
2. 冻结 task/scorer/generator/validator digest 和 8-row assignment；
3. 找到 2 位未参与 task/scorer 创作的实际参与者并完成同意流程；
4. 先验证计时器/记录器不接受回填和重叠区间；
5. 用户单独授权实际参与者 session；如果引入任何模型或付费组件，再单独授权对应预算。

在这五项完成前，`status=design-only-not-authorized` 不得改变。
