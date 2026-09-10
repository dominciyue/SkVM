# API Tester 操作级机制消融结果

## 结论

`skill-ir-api-tester-operation-mechanism-ablation-development-001` 的三组预注册关系均按预期成立，但证据只支持固定 development 数据上的机制说明，不支持生态、因果、真实 API 或人工效果结论。

### 操作切分

六份已暴露文档共 562 个 operation。whole-document 规则要求一份文档完整枚举且所有 operation 均 accepted；实际仍为 0/6，因此覆盖 0 个 operation。operation-level 流程保留 112 个 accepted 且 checker-passed operation，另有 449 rejected 和 1 unresolved；五份文档至少有一个 accepted operation，但没有任何整份文档完全 accepted。

观察到的差值为 112 个 checker-passed operation。这个差值说明操作切分能在整文档失败内部保留可验证局部产物，不是随机化因果效应，也不改变历史文档级 `0/6`。

### 独立依赖核验

Task 2 的九个预先设计故障在 full verifier 下均由预指定层检出。只移除 `dependency-verifier` 且不允许其他层替代后，parameter、reference 和 security dependency loss 三项变为漏检；其余六项保持由各自的 source coverage、admission consistency 或 independent checker 检出。

因此本设计故障集上的结果为 full `9/9`、control `6/9`，三个 dependency-targeted fault 从 `3/3` 降为 `0/3`。它只说明这九个合成故障，不能声称整体错误检出率。

### 完整责任分母

在 operation universe 中，只看 accepted 会显示 112 项并隐藏 450 项，其中 449 rejected、1 unresolved；六份文档均有隐藏责任。在 Task 7 family universe 中，只看 `currentSupport=supported` 会显示 2/7 项并隐藏 5/7 项，六个 skill 中四个含隐藏责任。

这些隐藏量证明 accepted/current-supported-only 不是完整责任分母；它们不等于人工工作量或节省。

## 真实边界与缺失证据

- Meilisearch 缺失本地 parameter reference：`sourceValidity=blocked`、`dependencyClosure=open`，继续阻塞相应构造。
- Bangumi 外部 response reference：`sourceValidity=advisory`、`dependencyClosure=closed`，不改写为源有效性已经验证。
- Task 3 prospective first run 因固定来源获取在 HTTP 403 终止而不可用。
- Task 8 的 40-skill corpus 因预注册 GitHub search 配额终止而不可用；Task 9 因没有 Task 8 selection 而不可用。
- 三项缺失均未进入效果分母，也未被插补。

## 证据与复现

- 预注册协议：`benchmarks/skill-ir/pilots/api-tester/operation-mechanism-ablation-development-001/protocol.json`
- 机器报告：`results/skill-ir/api-tester-operation-mechanism-ablation-development-001/report.json`
- 报告文件 SHA-256：`6cd63f4e265f66b7272ace596f8f680e6852d29593721b324a305c49ed4489fb`
- portable semantic SHA-256：`5180a1c7a823c926e97a1ae858fb3c535678b227fa1ce345a16aaefef0064fd0`
- 预注册提交：`d20adf41156b6e949c8f55436a6188e1c57496ee`

严格复核命令见[组件文档](api-tester-operation-mechanism-ablation.md)。实际 verify 返回 `verified-development-mechanism-ablation`、`operations=562`、`faults=9`、`responsibilities=7`。本次分析新增 prospective/model/business API/paid/held-out/Q1 使用均为 0；development agent 使用仍由宿主分账，不记入项目 runner 成本。

## 判断

机制消融本身已闭合，支持继续做总证据汇总；它没有弥补 Task 3、Task 8 或 Task 9 的缺失，因此目前不具备以本目标现有冻结 identity 宣称未见输入验证、40-skill 家族覆盖或跨仓库复用的条件。任何新 prospective 或新的公开 skill 获取策略都应使用单独预注册 identity，不能覆盖本次失败证据。
