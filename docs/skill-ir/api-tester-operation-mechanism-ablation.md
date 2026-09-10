# API Tester 操作级机制消融组件

## 目的

本组件实现 `skill-ir-api-tester-operation-mechanism-ablation-development-001` 的固定离线分析。它从已经归档且有摘要绑定的 Task 1、Task 2、Task 7 报告重算三组预注册对照：

1. whole-document 与 operation-level；
2. no-independent-dependency-verifier 与 full verifier；
3. complete-responsibilities 与 accepted/current-supported-only。

组件不执行历史 unique runner，不读取新来源、held-out 或 Q1 reserve，也不修改 API Tester v2 支持合同、候选、旧报告或 readiness。

## 实现与运行

机器协议位于 `benchmarks/skill-ir/pilots/api-tester/operation-mechanism-ablation-development-001/protocol.json`。分析器 `src/benchmarks/skill-ir/api-tester-operation-mechanism-ablation.ts` 会：

- 校验协议和四份输入的固定 SHA-256；
- 用权威 Zod schema 解析输入；
- 从逐文档、逐故障和逐责任记录重算总数；
- 将 Task 2 prospective failure audit 仅作为证据不可用门，不纳入任何效果分母；
- 以 write-once 方式写入固定报告路径；
- 在 verify 模式中重新推导完整报告，拒绝只修改报告并重新签署 portable 摘要的协调篡改。

公开入口：

- `buildApiTesterOperationMechanismAblationReport`：生成固定机器报告；
- `verifyApiTesterOperationMechanismAblationReport`：核对输入摘要并重算结果；
- `parseApiTesterOperationMechanismAblationCommand`：拒绝替换协议、输出路径或额外运行参数；
- `ApiTesterOperationMechanismAblationProtocolSchema` 与 `ApiTesterOperationMechanismAblationReportSchema`：协议和报告合同。

## 命令

在仓库根目录运行：

```powershell
bun ./src/benchmarks/skill-ir/api-tester-operation-mechanism-ablation.ts --mode=create --root=. --protocol=benchmarks/skill-ir/pilots/api-tester/operation-mechanism-ablation-development-001/protocol.json --out=results/skill-ir/api-tester-operation-mechanism-ablation-development-001/report.json --completed-at=<ISO-8601 UTC>
```

已有 write-once 报告应使用 verify，而不是覆盖：

```powershell
bun ./src/benchmarks/skill-ir/api-tester-operation-mechanism-ablation.ts --mode=verify --root=. --protocol=benchmarks/skill-ir/pilots/api-tester/operation-mechanism-ablation-development-001/protocol.json --out=results/skill-ir/api-tester-operation-mechanism-ablation-development-001/report.json
```

测试：

```powershell
bun test ./src/benchmarks/skill-ir/api-tester-operation-mechanism-ablation.test.ts
bun run typecheck
```

## 假设与失败模式

- operation panel 的 562 个 operation 来自同一组六份已暴露文档，operation 不是独立抽样单位。
- dependency panel 的检出率只适用于 Task 2 预先设计的九个合成故障；control 不允许其他层替代指定的正确检出层。
- family panel 的七项责任是 retrospective development examples，不是生态样本。
- Task 3、Task 8 和 Task 9 的目标证据不可用且不插补；缺失不会被解释为 0 效果或成功。
- Meilisearch 缺失本地参数引用仍是 source blocker；Bangumi 外部响应引用仍是 source-validity advisory。
- portable 摘要只排除运行时间和摘要自身；最终权威性来自固定输入摘要与逐项重算，而不是报告自签名。

## 修改注意事项

改变 panel、分母、比较字段、输入或允许结论时，必须先创建新的预注册 identity。不得通过修改本组件来重试已经冻结失败的 prospective 或 public-skill source identity。
