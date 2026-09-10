# API Tester 操作级研究总收口组件

## 作用

`skill-ir-api-tester-operation-prospective-research-synthesis-development-001` 将本阶段可用的机器证据汇总为一份可重算总报告。它不把任务的终止失败或依赖阻塞写成完成，也不从聊天记录手填实验结果。

固定证据包括：候选运行依赖闭包、六文档 operation development、六项 synthetic pre-source 验证、revision freeze、prospective 来源失败审计、责任家族报告、public-skill metadata 失败审计、机制消融报告和权威 readiness 报告。每项路径、SHA-256 和来源提交均在代码中固定。

## 实现

实现位于 `src/benchmarks/skill-ir/api-tester-operation-prospective-research-synthesis.ts`。运行时会：

- 从仓库内安全相对路径读取九份证据并核对固定 SHA-256；
- 对每项 evidence 的固定 `commit:path` 读取 Git blob 并再次核对同一摘要，同时核实 baseline anchor 和 synthesis implementation commit 的两个源码 blob；
- 使用各组件的权威 schema 解析证据；
- 从记录重算 candidate closure、operation totals、prospective terminal 状态、family totals、public-skill terminal 状态、机制结果和 readiness；
- 将十个任务分类为 `completed`、`closed-terminal-failure` 或 `not-run-blocked`；
- 生成 claims–evidence–limitations、成本可观测范围、复现入口和下一阶段条件；
- write-once 写入固定输出，verify 模式再次推导完整报告并拒绝自签名篡改。

公开接口：

- `API_TESTER_OPERATION_RESEARCH_SYNTHESIS_EVIDENCE`：固定九证据清单；
- `ApiTesterOperationResearchSynthesisReportSchema`：严格总报告合同；
- `buildApiTesterOperationResearchSynthesis`：生成报告；
- `verifyApiTesterOperationResearchSynthesis`：从证据重算并比较；
- `parseApiTesterOperationResearchSynthesisCommand`：固定 CLI 参数面。

## 命令

生成报告前，先将本组件实现提交，并把该提交传给 `--implementation-commit`：

```powershell
bun ./src/benchmarks/skill-ir/api-tester-operation-prospective-research-synthesis.ts --mode=create --root=. --out=results/skill-ir/api-tester-operation-prospective-research-synthesis-development-001/report.json --completed-at=<ISO-8601 UTC> --implementation-commit=<40-hex implementation commit> --git=git
```

对已归档报告只运行复核：

```powershell
bun ./src/benchmarks/skill-ir/api-tester-operation-prospective-research-synthesis.ts --mode=verify --root=. --out=results/skill-ir/api-tester-operation-prospective-research-synthesis-development-001/report.json --git=git
```

开发检查：

```powershell
bun test ./src/benchmarks/skill-ir/api-tester-operation-prospective-research-synthesis.test.ts
bun run typecheck
```

## 失败模式与边界

- 任一输入缺失、工作树/Git blob 摘要漂移、声明提交无对应 path 或 schema 无效时停止，不生成部分总报告。
- Task 2/8 的失败审计证明终止现场完整，但不等于 selection 或实验成功。
- Task 3/4/5/9 没有权威输入时保持 `not-run-blocked`，不得填 0 结果冒充实际运行。
- `eligibleToPrepareNewProspectiveProtocol=true` 只表示可以写新的预注册方案；`eligibleToExecuteNewProspective=false` 要求在真实选择、预测和 lock 完成前停止。
- 用户扩大的远端 API/付费授权不追溯改变冻结 identity、配额、重试规则或本阶段实际 `paid=0`。
- 总报告只总结现有 development 证据，不改变旧 `0/6`、readiness、Meilisearch blocker、Bangumi advisory 或缺失 clean-002 原件。

## 后续修改

新增任务证据或新的 prospective identity 时应新增报告版本或 identity，并先固定新的证据清单。不得改写当前固定摘要来吸收后来的运行。
