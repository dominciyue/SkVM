# Skill IR 当前状态（2026-09-07）

当前定位：**以公开验证依据为组织原则，研究受限 skill 任务的确定性 AOT 转换与人工边界，并通过 SkVM 提供可复现的产物封装。** 三档答案可得性降级为回顾路由；当前 v2 方法按 requirement/workflow step 分别记录验证、构造、执行与剩余选择，再导出四状态。七案例仍是回顾性案例研究，不是前瞻预测证据。

当前已确认路线：**原 Q1 真人一致性实验保持未完成，但不再阻塞工程 development；AI revision-2 只作为带 provenance 的 24-unit development route。当前先冻结 API Tester 构造候选与 4+4 前瞻小样，推送冻结点后执行唯一首轮，再按实际缺口决定第二 profile。** 权威约束见 spec 第 14.13 节、plan 第 4.42 节和[组件协议](ai-assisted-development-routing-and-prospective-construction.md)。

## 三条主线

| 主线 | 已证实 | 尚未证实 | 当前下一动作 |
|---|---|---|---|
| A：分类与路由 | 七案例回顾表与 Q1 v2 发放包已冻结；新 AI development route 绑定 24 个 unit 的 revision-2 provenance/change/unknown | 两位真人独立标注、裁决前一致率、classification accuracy、原 Q1 completion | AI 表只服务工程 gap discovery；原 A/B 真人实验可另行完成，但不再作为当前构造开发前置 |
| B：人工边界 | 旧 original 首行已冻结负结果；successor 的两臂、平衡交叉分母、前瞻区间计时、质量门和成本单位已机器化 | 4 个新 public development tasks、2 位独立实际参与者、真实 session 和人工减少结果 | 旧 identity 永久停止；successor 保持 `design-only-not-authorized`，任何真实参与者或付费执行需再次授权 |
| C：工程交付 | Env/API 金路径可复现；API production binding 两份 development 输入 2/2；新 candidate snapshot 和 4 real + 4 boundary prediction lock 已生成 | 4+4 尚未执行；独立操作者、任意新 skill 自动构造、跨 profile 复用、独立安装/跨平台 | 先把 candidate/lock/runner 白名单提交并推送，再运行唯一首轮；失败留分母且不修候选 |

## Q1/Q2 当前冻结点

- Q1 分母固定为 24 个去重公开源包：12 development 已绑定，另 12 prospective 为 `reserved-unselected`。development 来自 5 个独立仓库，重复 package identity/lineage 均为 0；8 个本地包核验 34 个文件，4 个外部包绑定 23 个 git-tree manifest 文件和 4 个许可证 digest。
- development 标注分母另固定为 12 source / 24 unit，每项选中 responsibility 恰好一个单位。A/B 空白表绑定同一 package SHA-256，四组依据和 prediction 均为空；共同漏项、未知单位和版本漂移会被拒绝。
- 四个导出状态为：规则充分且能力支持、规则充分但能力缺失、需要部分语义选择、信息不足。dependency 会传播更严格状态；语义影响目标必须存在且有依赖路径，实际运行结果不能改写原 prediction。
- Q2 机器图含 21 项 capability 与 API Tester、Env Manager、Changelog 三个 profile。API/Env 仅为 `existing-slice-only`，Changelog 为 `unsupported`，`new-input-ready=0/3`。
- 原子 operation 存在不等于领域 composition 已验证；历史 fixture 通过也不等于支持新输入；verified-artifact runtime 不是语义构造器。
- API 通用生产 binding 已按[设计](../superpowers/specs/2026-09-07-api-tester-production-binding-design.md)与[实施计划](../superpowers/plans/2026-09-07-api-tester-production-binding.md)实现；[组件说明](api-tester-production-binding.md)和 `results/skill-ir/api-tester-production-binding-development-001/report.json` 冻结两份公开 development 新输入 2/2、0 model/API/paid。它是 snapshot 之后的 additive 候选，不回写 Q2 的 0/3 snapshot，也不是 prospective/Q3 结果。
- `ai-assisted-development-routing-v1.json` 将 A/B revision-2 AI 草稿合并为 24-unit development 路由；相同 AI 修复流程和跨草稿/结果可见性使它不具备 human agreement/accuracy 证据。原 Q1 仍 incomplete。
- `api-tester-constructor-candidate-v1.json` 与 `prospective-construction-001/experiment-lock.json` 已冻结候选边界和 4+4 执行前预测，当前 `resultState=not-run`；不回写旧 Q2 或 readiness。
- 权威入口：`classification-handbook-v2.md`、`q1-development-annotation-package-v2.md`、`ai-assisted-development-routing-and-prospective-construction.md`、`benchmarks/skill-ir/classification/` 与 `task-automation-classification.ts`。当前没有真人 A/B 一致率、classification accuracy 或 4+4 实际结果。

## B 冻结结果的正确读法

- 权威报告：`results/skill-ir/api-tester-trace-public-answer-paid-development-001/report.json`，状态 `negative-smoke-frozen`，observed 1/4。
- `exact` 只表示从模型生成计划投影出的 operation method/path/顺序与 public answer 一致；它不覆盖 schema-derived cases、安全响应或独立性语义。
- 报告中的 `modelCalls=apiCalls=paidCalls=1` 都按“已分发 agent 任务行”计数。该行另观测到 10 个 provider responses 和 15 个 tool calls；旧字段不能证明底层模型请求数或计费往返数为 1，也不能单独证明底层请求数不超过 4。
- token usage 为 input 58060、output 7445、cache-read 137344、cache-write 0；explicit input+output 为 65505。供应商货币费用未记录。
- authoring/review 的 0/0 只表示自动运行窗口内没有人主动介入；它不是人工编写、独立审核或修复流程的测量，也不支持“人已从作者降为审核者”。
- 当前没有活动中的 B 付费任务；旧 identity 不重跑、不补行、不换 route。

## 成本与产品口径

- Env 的 `break-even=1` 只属于现有 production model-token 口径：one-time 9358 tokens，相对 original 50502.5 tokens/run，首次复用覆盖一次性模型 token。它不包含历史研发、人工、货币价格或全部失败尝试，不是总经济回本。
- API Tester 历史 4/4 是人工实现领域转换在冻结 development slice 上的质量正例。新增 production binding 只在显式 OpenAPI 子集内以两个公开 development 输入 2/2 建立通用参数候选；两者都不是任意 OpenAPI、未知 skill 自动接入或前瞻泛化。
- CLI 的 API `--variant` 直接运行冻结 compiler/package/runtime；API `--binding` 运行 additive production contract/package/独立 checker；Env preset 调用既有 product runner。三者共享部分底层能力，但完整编排、证据和支持范围不同。

## 当前顺序与边界

1. 已完成：零付费状态和口径同步。
2. 已完成：七案例回顾表校准，分开测量失效、实现失败、基线饱和与语义边界。
3. 已完成设计：B successor 固定 2 participants × 4 tasks = 8 rows 的平衡交叉对照，`taskSetStatus=not-authored`；
   尚无参与者或效果数据。
4. 已完成：提交 `3bd7618` 的同机 fresh detached worktree 通过 Env 与 API Tester JSON 两条金路径；
   机器报告与主张—证据表已落盘。独立操作者、独立安装和跨平台仍未测。
5. 当前工程接力：AI 24-unit development route、API candidate snapshot、4+4 selection/prediction lock 和 immutable runner 已生成；冻结提交推送前保持 `not-run`。
6. 推送后唯一执行 8 行：每行一次、0 retry/replacement/fix，所有 outcome 留分母，真实输入与 boundary 分报；结果可为全拒绝或失败。
7. 首轮只回答当前候选的接纳/拒绝/checker 行为。原 12+12 Q1 来源、3×4 迁移初检和更大资源建议不回写；第二 profile、新 skill/组合、Q4/Q5 均按实际缺口另立身份。

持续禁止：把 AI 草稿写成真人 Q1/一致率/准确率；复活 B 旧 identity；读取 held-out；启动 Stage M/N matrix；修改旧 lock/result/Q2；为正例改候选/scorer/artifact、换输入或补行；扩 DSL 或据此晋级 portfolio/readiness。
