# API Tester 操作级准入与验证

本文档描述 2026-09-09 开始的 additive development 流水线。它只处理 v2 migration 已暴露的六份真实 OpenAPI 文档，目标是把
whole-document 首拒绝展开为完整 operation universe、逐操作准入解释和可验证局部产物；随后验证表示变形、错误检出和 clean checkout
离线复现。它不修改或重新解释冻结 001/002。

## 身份与状态

- Task 1：`skill-ir-api-tester-operation-admission-development-001`；
- Task 2：`skill-ir-api-tester-operation-validation-development-001`；
- combined：`skill-ir-api-tester-operation-development-001`；
- 当前状态与恢复命令：[执行状态](api-tester-operation-development-status.md)。

设计合同见 [design](../superpowers/specs/2026-09-09-api-tester-operation-admission-validation-design.md)，逐文件步骤见
[implementation plan](../superpowers/plans/2026-09-09-api-tester-operation-admission-validation.md)。source、admission 与 coverage 层已经完成；本节会在每个 TDD 阶段同步
公共类型、运行时顺序、报告字段、命令、验证与已知失败。

## 组件边界

源枚举、准入、独立覆盖和 artifact correctness 是四条不同职责。覆盖 verifier 必须重新读取原始字节，不能接受 constructor 列表作为
全集。准入只在依赖保持投影上调用未修改的 v2 contract builder；accepted operation 按原文档聚合后复用未修改的 v2 generator/checker。
原始 OpenAPI 与许可证继续留在 external cache，仓库只保存来源摘要、派生合同/产物和 compact report。

## Source inventory 与 projection API

`src/skill-ir/api-tester-operation-source.ts` 提供：

- `parseApiTesterOperationSource(text, format)`：用 YAML 1.2 core schema 与 unique-key 检查解析 JSON/YAML，并返回 parsed document、
  operation universe 和 explicit unresolved；JSON 另经 `JSON.parse` 约束，不能把 YAML 当 JSON 接受。
- `projectApiTesterOperation(document, key)`：只保留一个 method/path，并把 path/operation parameters 按 `(in,name)` 的 OpenAPI override
  语义合成为 effective operation parameters；global security 显式落到 operation，operation override（包括 `[]`）保持。
- `aggregateApiTesterOperations(document, keys)`：用同一规则合并多个目标 operation；拒绝空或重复 key。

每个 source operation 包含稳定 `METHOD /path` key、JSON Pointer locator、operationId/summary、effective parameter origin 与 override
locator、request media types、response status、effective security source/schemes 及 reference locator/resolution/是否属于 construction
obligation。path-item `$ref` 因可能隐藏 operation 使 enumeration incomplete；无法解析 parameter identity 也显式 unresolved。

投影保留 `openapi`、`info`、top-level metadata、components、global security、path metadata，以及目标 operation 的完整 request/response；
删除其它 operation 与非目标 top-level webhooks/callbacks。dependency flags 分列 parameter inheritance、security、reference closure 和
request/response preservation。construction-obligation external/missing/invalid/cyclic/sibling ref 令 projection fail closed；仅 response
payload ref 按既有 v2 合同记录为非构造义务。

## Admission 与独立覆盖 API

`src/skill-ir/api-tester-operation-admission.ts` 提供 `analyzeApiTesterOperation`。每个 operation 先单独投影，再由完整审计器记录所有可定位
缺口，最后调用未修改的 `buildApiTesterProductionContractV2` 记录 v2 的首个拒绝。finding 分类为 `unsupported-syntax`、
`semantics-not-preserved`、`missing-public-construction-evidence` 或 `implementation-failure`；首拒绝始终标记
`completeGapSet: false`。只有投影完整、finding 为空、v2 返回恰好一个匹配 contract operation 时才是 accepted。非预期异常和无法闭合的
枚举/依赖均是 unresolved；`verifyApiTesterOperationAdmissionConsistency` 阻止带 finding、首拒绝或空 normalized contract 的假接纳。

`src/skill-ir/api-tester-operation-coverage.ts` 不导入 source/admission/constructor 清单。它用原始字节独立解析 operation universe，并由
`verifyApiTesterOperationCoverage` 比较 analyzer 的完整键集、重复、locator/operationId/summary 漂移，以及 accepted 集在 projection、contract、
artifact 四层的精确守恒。`verifyApiTesterProjectionDependencies` 独立比较 effective parameters、local reference targets、effective security、
requestBody 和 responses；因此 coverage completeness 与 artifact correctness 分开报告。

当前聚焦验证命令为：

```powershell
bun test ./src/skill-ir/api-tester-operation-admission.test.ts ./src/skill-ir/api-tester-operation-coverage.test.ts ./src/skill-ir/api-tester-operation-source.test.ts ./src/skill-ir/api-tester-production-contract-v2.test.ts
bun run typecheck
```

最新结果：17 tests、76 assertions、0 failure，typecheck 通过。测试包含遗漏、重复、摘要漂移、依赖/安全丢失、多缺口、首拒绝不完整、
unexpected implementation failure 与 false acceptance。

## 保护与失败方式

重复键、path-item ref 或无法可靠枚举的结构输出 explicit unresolved。无法证明参数继承、ref closure、安全、request/response 语义保持的
operation 拒绝；未知异常归为 implementation failure。首个 v2 rejection 单列且声明并非全部缺口。checker 失败不能通过删 obligation、放宽
checker 或 source-specific 代码修复。

本阶段 runtime 禁止 network/model/API/paid，保持 held-out/Q1 reserved/prospective/第二 profile/Q4/portfolio/readiness 关闭。真实局部通过
不等于整份文档成功、任意 OpenAPI 支持或真实 API 行为验证。
