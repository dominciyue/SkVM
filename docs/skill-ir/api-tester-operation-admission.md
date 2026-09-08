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
[implementation plan](../superpowers/plans/2026-09-09-api-tester-operation-admission-validation.md)。实现尚未开始；本节会在每个 TDD 阶段同步
公共类型、运行时顺序、报告字段、命令、验证与已知失败。

## 组件边界

源枚举、准入、独立覆盖和 artifact correctness 是四条不同职责。覆盖 verifier 必须重新读取原始字节，不能接受 constructor 列表作为
全集。准入只在依赖保持投影上调用未修改的 v2 contract builder；accepted operation 按原文档聚合后复用未修改的 v2 generator/checker。
原始 OpenAPI 与许可证继续留在 external cache，仓库只保存来源摘要、派生合同/产物和 compact report。

## 保护与失败方式

重复键、path-item ref 或无法可靠枚举的结构输出 explicit unresolved。无法证明参数继承、ref closure、安全、request/response 语义保持的
operation 拒绝；未知异常归为 implementation failure。首个 v2 rejection 单列且声明并非全部缺口。checker 失败不能通过删 obligation、放宽
checker 或 source-specific 代码修复。

本阶段 runtime 禁止 network/model/API/paid，保持 held-out/Q1 reserved/prospective/第二 profile/Q4/portfolio/readiness 关闭。真实局部通过
不等于整份文档成功、任意 OpenAPI 支持或真实 API 行为验证。
