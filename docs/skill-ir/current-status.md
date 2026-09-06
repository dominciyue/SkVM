# Skill IR 当前状态（2026-09-06）

当前定位：**以公开验证依据为组织原则，研究受限 skill 任务的确定性 AOT 转换与人工边界，并通过 SkVM 提供可复现的产物封装。** 三档答案可得性降级为回顾路由；新的 v1 方法按 requirement/workflow step 分别记录验证、构造、执行与剩余选择，再导出四状态。七案例仍是回顾性案例研究，不是前瞻预测证据。

## 三条主线

| 主线 | 已证实 | 尚未证实 | 当前下一动作 |
|---|---|---|---|
| A：分类与路由 | 七案例回顾表已绑定公开合同、冻结结果和停止原因；Q1 strict schema、四状态派生、12 个 development 来源清单已完成 | 两位独立标注、裁决前一致率、12 个 prospective 源包上的预测力 | 先冻结独立标注；prospective 保持未选择、未查看，Q3 另立阶段 |
| B：人工边界 | 旧 original 首行已冻结负结果；successor 的两臂、平衡交叉分母、前瞻区间计时、质量门和成本单位已机器化 | 4 个新 public development tasks、2 位独立实际参与者、真实 session 和人工减少结果 | 旧 identity 永久停止；successor 保持 `design-only-not-authorized`，任何真实参与者或付费执行需再次授权 |
| C：工程交付 | Env 与 API Tester JSON 可从 fresh detached worktree 复现，两路 passed、0 model/API/paid、`coreBranchDelta=0`；两者共享底层 artifact 能力 | 独立外部操作者、任意新 skill 自动构造、两条 preset 完全相同的编排合同、独立安装/跨平台端到端可用性 | 冻结同机 clean-source 证据；只有为独立安装/迁移主张服务时才另开验收 |

## Q1/Q2 当前冻结点

- Q1 分母固定为 24 个去重公开源包：12 development 已绑定，另 12 prospective 为 `reserved-unselected`。development 来自 5 个独立仓库，重复 package identity/lineage 均为 0；8 个本地包核验 34 个文件，4 个外部包绑定 23 个 git-tree manifest 文件和 4 个许可证 digest。
- 四个导出状态为：规则充分且能力支持、规则充分但能力缺失、需要部分语义选择、信息不足。dependency 会传播更严格状态；实际运行结果不能改写原 prediction。
- Q2 机器图含 21 项 capability 与 API Tester、Env Manager、Changelog 三个 profile。API/Env 仅为 `existing-slice-only`，Changelog 为 `unsupported`，`new-input-ready=0/3`。
- 原子 operation 存在不等于领域 composition 已验证；历史 fixture 通过也不等于支持新输入；verified-artifact runtime 不是语义构造器。
- 权威入口：`classification-handbook-v1.md`、`benchmarks/skill-ir/classification/` 与 `task-automation-classification.ts`。当前没有 A/B 独立标注、一致率、Q3 迁移或付费结果。

## B 冻结结果的正确读法

- 权威报告：`results/skill-ir/api-tester-trace-public-answer-paid-development-001/report.json`，状态 `negative-smoke-frozen`，observed 1/4。
- `exact` 只表示从模型生成计划投影出的 operation method/path/顺序与 public answer 一致；它不覆盖 schema-derived cases、安全响应或独立性语义。
- 报告中的 `modelCalls=apiCalls=paidCalls=1` 都按“已分发 agent 任务行”计数。该行另观测到 10 个 provider responses 和 15 个 tool calls；旧字段不能证明底层模型请求数或计费往返数为 1，也不能单独证明底层请求数不超过 4。
- token usage 为 input 58060、output 7445、cache-read 137344、cache-write 0；explicit input+output 为 65505。供应商货币费用未记录。
- authoring/review 的 0/0 只表示自动运行窗口内没有人主动介入；它不是人工编写、独立审核或修复流程的测量，也不支持“人已从作者降为审核者”。
- 当前没有活动中的 B 付费任务；旧 identity 不重跑、不补行、不换 route。

## 成本与产品口径

- Env 的 `break-even=1` 只属于现有 production model-token 口径：one-time 9358 tokens，相对 original 50502.5 tokens/run，首次复用覆盖一次性模型 token。它不包含历史研发、人工、货币价格或全部失败尝试，不是总经济回本。
- API Tester 的 4/4 是人工实现领域转换在冻结 development slice 上的质量正例，不是任意 OpenAPI 自动编译或类内泛化。
- CLI 的 API preset 直接运行冻结 compiler/package/runtime；Env preset 调用既有 product runner。两者共享底层能力，但完整编排、review/cost/report 合同不同，并依赖 checkout 中的冻结资源。

## 当前顺序与边界

1. 已完成：零付费状态和口径同步。
2. 已完成：七案例回顾表校准，分开测量失效、实现失败、基线饱和与语义边界。
3. 已完成设计：B successor 固定 2 participants × 4 tasks = 8 rows 的平衡交叉对照，`taskSetStatus=not-authored`；
   尚无参与者或效果数据。
4. 已完成：提交 `3bd7618` 的同机 fresh detached worktree 通过 Env 与 API Tester JSON 两条金路径；
   机器报告与主张—证据表已落盘。独立操作者、独立安装和跨平台仍未测。
5. 已完成合同：Q1 分类手册/来源清单与 Q2 当前能力图；下一可审阅点是两位独立标注完成后的裁决前一致率，不是 Q3 执行。

持续禁止：复活 B 旧 identity、读取 held-out、启动 Stage M/N matrix、修改旧 lock/result、为正例改 scorer/artifact、扩 DSL 或据此晋级 portfolio/readiness。
