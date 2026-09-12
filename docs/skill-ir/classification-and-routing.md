# 分类与路由

本页维护 responsibility/step 级分类、能力路由、发放与 held-out 边界。分类是开发工具，不是当前 U0–U7 路线的
状态页，也不能用候选运行结果倒推标签。

## 1. 分类单位与四种状态

先从完整 skill/source closure 提取职责和 obligation，再对每个 requirement/workflow step 分别记录：

- verification evidence：公开、独立且足以判断结果的依据；
- construction evidence：公开且足以构造候选的依据；
- execution conditions：依赖、环境、副作用和输入闭包；
- remaining semantic choice：仍需 agent、人或外部系统判断的内容。

由此导出 `deterministic-transformable`、`bounded-tool-executable`、`agent-required` 和 `blocked-or-unknown`
四种可检验状态。whole-skill 聚合必须保留所有职责；部分支持不能改写为完全自动化。

## 2. Family contract

`public-structure-offline` family 的七个必要条件是：公开输入结构、显式输出职责、离线确定性转换、公开验证合同、
声明式依赖闭包、有界副作用、无未绑定语义决定。`current-capability-readiness` 只是工程状态，
`cross-repository-generalization` 仍是假设，二者都不定义 family membership。

membership、verifiability、constructibility、source validity、dependency closure 和 current support 必须分开。
失败可同时归因于规则不足、缺证据、缺能力、source defect、开放依赖、外部语义选择、环境限制与实现失败。

当前 retrospective 合同报告含 7 个 example：5 in-family、1 out-of-family、1 unknown；4 constructible、2 currently
supported。只描述已选 development example，不是生态占比或 prospective 成功率。

## 3. Duty extraction

职责提取输入是完整编号 source/resource 文本及逐文件摘要，不能包含现有 responsibility 答案或 support 表。
draft 的每个 responsibility/obligation 都必须引用 file、1-based line span 和 exact quote。结构验证只能得到
`grounded-draft` 或 `invalid-draft`；quote 对齐不证明语义完整，因此永远需要独立 semantic review，
不能自动批准 mapping。

未映射 obligation 保留为 `unresolved`。模型失败时允许显式标注的 agent-authored fallback inventory，但不能伪装成
模型结果或人工 agreement。历史三成员首次测量只有 Jeremy 返回有效 draft，另外两次无响应；不得为补齐结果重跑。

## 4. Capability routing 与 Q1/Q2

Q1 v2 的 handbook、12-source/24-unit annotation package、A/B blank form 和 capability graph 是版本化输入。
两位独立真人标注尚未完成，因此没有 agreement/accuracy。AI revision-2 只能用于 development gap discovery，
不能替代真人 submission。

Q2 路由只能在 classification 与 capability requirement 都有公开依据时发放。当前四个稳定结果状态是：
`accepted`、`rejected-with-reason`、`unresolved`、`outside-class/source-blocked`。`accepted` 只用于独立 checker
通过的 artifact outcome，不用于预先分类。Q1/Q2 暂停期间，walkthrough 可保留在 Git，但不成为当前入口。

## 5. Corpus 与 held-out

- public corpus discovery 是固定查询、固定页序、固定 inspected prefix 的 metadata-only identity。
- 首次 identity 因 GitHub search remaining=0 在第八页前终止；失败原件不可重试、补页或当作 selection universe。
- held-out 先冻结 method、source role 和选择，再读 body。development、primary-heldout、revision 和 reserve 不混用。
- 输入资格要求 public API contract 与两个绑定 OpenAPI 3.0.x 输入；out-of-class member 仍留在分母。

minimum-delivery 的历史结论是 `insufficient-evidence`：3 个 held-out member、98 obligation，0 applicable input、
0 accepted artifact；这是一份完整负/不足证据，不是应被修补为正例的失败。

## 6. 版本化材料

以下材料仍被 JSON、脚本或校验器按原路径/摘要读取，因此退出当前导航但保留原字节：

- `classification-handbook-v1.md`、`classification-handbook-v2.md`；
- `classification-and-automation-next-stage-proposal.md`；
- `skill-family-class-proof-002.md`、`skill-family-class-proof-recovery.md`；
- `skill-family-current-results.md` 及 current-v2 archive/clean/final 材料；
- `deadline-execution-status.md` 与 `skill-family-plan-review-20260912.md`。

完整机器清单见 `scripts/skill_ir_doc_governance.json`。普通说明可以迁移；版本化原件在消费者退出前不得改写、
重命名或删除。

## 7. 实现与测试

主要实现位于 `src/benchmarks/skill-ir/task-automation-classification.ts`、
`public-structure-offline-family-contract.ts`、`public-skill-responsibility-corpus*.ts`、
`src/skill-ir/skill-duty-extraction.ts` 与 `skill-family-heldout-evaluation.ts`。

```powershell
bun test ./src/benchmarks/skill-ir/task-automation-annotation-package.test.ts
bun test ./src/benchmarks/skill-ir/public-structure-offline-family-contract.test.ts
bun test ./src/benchmarks/skill-ir/public-skill-responsibility-corpus.test.ts
bun test ./src/skill-ir/skill-duty-extraction.test.ts
bun test ./src/skill-ir/skill-family-heldout-evaluation.test.ts
bun run typecheck
```

修改分类 schema、criterion role 或冻结 input 必须新建 identity；修改实现前先保留完整分母、dependency graph 与
source/evidence binding。
