# API Tester 操作级机制消融设计

## 1. 身份与目的

本阶段使用 `skill-ir-api-tester-operation-mechanism-ablation-development-001`，只解释既有 development 方法中操作切分、独立依赖核验和完整责任分母各自改变了什么。它不是新的 prospective、不是支持面开发，也不修改冻结候选、v2 合同、操作级算法或历史报告。

机器预登记位于 `benchmarks/skill-ir/pilots/api-tester/operation-mechanism-ablation-development-001/protocol.json`。预登记输入固定为 Task 1 操作报告、Task 2 变形/错误检出报告、Task 7 家族责任报告和 Task 2 prospective failure audit 的精确 SHA-256。最后一项只证明 Task 3 证据不可用，不进入任何效果分母。

## 2. 共同分母

三个 panel 不合并分母：

1. `operation-segmentation`：Task 1 六份已暴露文档的同一 562-operation universe；文档数另列为 6，不能与 operation rate 混比。
2. `independent-dependency-verification`：Task 2 预登记的 9 个 deterministic synthetic fault；其中 3 个预指定 detector layer 为 `dependency-verifier`。检出率只描述这 9 个设计故障。
3. `complete-responsibility-denominator`：分别报告 Task 1 的 562 个 operation responsibilities 和 Task 7 的 7 个 family responsibilities，不跨 identity 求一个总比例。

## 3. 对照与预期关系

### 3.1 Whole-document vs operation-level

适用条件：同一文档已完整枚举，所有 operation status 均来自同一 Task 1 报告。whole-document control 仅当一份文档 `rejected=0`、`unresolved=0` 且 `accepted=operationCount` 时接纳；它不运行或生成未验证产物。operation-level treatment 使用报告中的 accepted 与 checker-passed operation 数。

比较字段：documents、operations、fully-admitted documents、operations in fully-admitted documents、accepted operations、checker-passed operations、rejected、unresolved。预期 `operation-level accepted >= whole-document covered operations`，差值只表示切分规则在这个固定 universe 中暴露的局部机会，不是随机化因果效应或生态接纳率。

### 3.2 No dependency verifier vs full verifier

适用条件：故障 case 的 `detectorLayer` 已在 Task 2 预登记。full treatment 使用实际 detected；control 只禁用 `dependency-verifier` 层，不允许其他层替代“正确层检出”。因此三个 parameter/reference/security dependency-loss fault 预期由 detected 变为 missed；其余六项保持原实际结果。

比较字段：injected、correct-layer detected、missed、dependency-targeted injected/detected/missed、逐 fault 层与 code。Meilisearch missing local ref 和 Bangumi external response advisory 只作为真实边界说明，不并入 9-fault 检出率，也不把 source advisory 写成 construction obligation。

### 3.3 Complete responsibilities vs accepted-only

适用条件：完整分母直接取 Task 1 所有 operation status 或 Task 7 全部 assessments；accepted-only/control 分别只保留 accepted operation 或 `currentSupport=supported` responsibility。不得把两个 panel 相加。

比较字段：complete、visible-in-control、hidden、hidden rejected、hidden unresolved、skills/documents with hidden responsibilities，以及 family membership/verifiability/constructibility/current-support 分布。预期 complete 恰等于 visible + hidden；accepted-only 会隐藏所有 unsupported/unresolved 项，但这不是对人工工作量的测量。

## 4. 验证与停止线

分析器必须重新解析权威 schema、核对四份输入摘要，从逐文档/逐 fault/逐 responsibility 项重算所有总数，拒绝报告内总计漂移。机器报告 write-once，并由独立 verifier 重算 portable semantics 与精确输入绑定。无需重跑历史 unique runner；不读取 held-out、Q1 reserve、新 skill body 或新的 prospective source。

若 Task 1 操作守恒、Task 2 fault mapping、Task 7 responsibility closure 或输入摘要任一失败，则停止并记录 implementation/evidence blocker，不生成效果结论。Task 3 与 Task 8/9 缺失不会被填补；报告明确标为相应 evidence unavailable。

## 5. 允许与禁止的结论

允许说明：在这六份已暴露文档中，操作切分保留了多少经 checker 验证的局部操作；在九个设计故障中，移除指定依赖层会漏掉哪三项；accepted-only 分母隐藏了多少已知拒绝、unresolved 和当前不支持责任。

禁止说明：总体因果效应、独立 operation 样本推断、skill 生态覆盖率、真实 API 行为、人工节省、readiness 改变，或把缺失 prospective/40-skill/3-skill 结果写成成功。
