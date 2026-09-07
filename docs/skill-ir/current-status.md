# Skill IR 当前状态（2026-09-07）

当前定位：**以公开验证依据为组织原则，研究受限 skill 任务的确定性 AOT 转换与人工边界，并通过 SkVM 提供可复现的产物封装。** 三档答案可得性降级为回顾路由；当前 v2 方法按 requirement/workflow step 分别记录验证、构造、执行与剩余选择，再导出四状态。七案例仍是回顾性案例研究，不是前瞻预测证据。

当前已确认路线：**原 Q1 真人一致性实验保持未完成，但不再阻塞工程 development；AI revision-2 只作为带 provenance 的 24-unit development route。API Tester 4+4 唯一首轮冻结为 0/4 真实接纳、4/4 边界拒绝；successor v2 已按完整 blocker 清单增加有限 local component ref 与 primitive array，在已暴露 Open-Meteo 上完成 1/1 parse-to-checker，并由统一 CLI 按 binding 版本显式分发。v1 负结果不改写，v2 也不构成新 prospective。** 权威约束见 spec 第 14.15 节、plan 第 4.44 节、[缺口清单](api-tester-successor-gap-analysis.md)和[组件说明](api-tester-production-binding.md)。

## 三条主线

| 主线 | 已证实 | 尚未证实 | 当前下一动作 |
|---|---|---|---|
| A：分类与路由 | 七案例回顾表与 Q1 v2 发放包已冻结；新 AI development route 绑定 24 个 unit 的 revision-2 provenance/change/unknown | 两位真人独立标注、裁决前一致率、classification accuracy、原 Q1 completion | AI 表只服务工程 gap discovery；原 A/B 真人实验可另行完成，但不再作为当前构造开发前置 |
| B：人工边界 | 旧 original 首行已冻结负结果；successor 的两臂、平衡交叉分母、前瞻区间计时、质量门和成本单位已机器化 | 4 个新 public development tasks、2 位独立实际参与者、真实 session 和人工减少结果 | 旧 identity 永久停止；successor 保持 `design-only-not-authorized`，任何真实参与者或付费执行需再次授权 |
| C：工程交付 | Env/API 金路径可复现；API production v1 两份 development 输入 2/2；4+4 首轮 8/8 complete/exact rejection、真实 accepted=0/4；successor v2 的已暴露 Open-Meteo 1/1 parse-to-checker；统一 CLI 可按 binding schemaVersion 运行 v1/v2 | 外部/循环 ref、完整 JSON Schema、任意 OpenAPI、新 unseen/prospective、独立操作者、跨 profile、可靠性、独立安装/跨平台 | v1 identity 永久停止；v2 停在 development，不扩样；新 prospective 必须新 identity/新未见输入/单独授权 |

## Q1/Q2 当前冻结点

- Q1 分母固定为 24 个去重公开源包：12 development 已绑定，另 12 prospective 为 `reserved-unselected`。development 来自 5 个独立仓库，重复 package identity/lineage 均为 0；8 个本地包核验 34 个文件，4 个外部包绑定 23 个 git-tree manifest 文件和 4 个许可证 digest。
- development 标注分母另固定为 12 source / 24 unit，每项选中 responsibility 恰好一个单位。A/B 空白表绑定同一 package SHA-256，四组依据和 prediction 均为空；共同漏项、未知单位和版本漂移会被拒绝。
- 四个导出状态为：规则充分且能力支持、规则充分但能力缺失、需要部分语义选择、信息不足。dependency 会传播更严格状态；语义影响目标必须存在且有依赖路径，实际运行结果不能改写原 prediction。
- Q2 机器图含 21 项 capability 与 API Tester、Env Manager、Changelog 三个 profile。API/Env 仅为 `existing-slice-only`，Changelog 为 `unsupported`，`new-input-ready=0/3`。
- 原子 operation 存在不等于领域 composition 已验证；历史 fixture 通过也不等于支持新输入；verified-artifact runtime 不是语义构造器。
- API 通用生产 binding 已按[设计](../superpowers/specs/2026-09-07-api-tester-production-binding-design.md)与[实施计划](../superpowers/plans/2026-09-07-api-tester-production-binding.md)实现；[组件说明](api-tester-production-binding.md)和 `results/skill-ir/api-tester-production-binding-development-001/report.json` 冻结两份公开 development 新输入 2/2、0 model/API/paid。它是 snapshot 之后的 additive 候选，不回写 Q2 的 0/3 snapshot，也不是 prospective/Q3 结果。
- `ai-assisted-development-routing-v1.json` 将 A/B revision-2 AI 草稿合并为 24-unit development 路由；相同 AI 修复流程和跨草稿/结果可见性使它不具备 human agreement/accuracy 证据。原 Q1 仍 incomplete。
- `api-tester-constructor-candidate-v1.json` 与 `prospective-construction-001/experiment-lock.json` 冻结候选边界和 4+4 执行前预测；首轮报告绑定提交 `aa3a088`，8/8 rejected/exact，真实输入 accepted=0/4，边界 accepted=0/4，0 checker/infrastructure failure，不回写旧 Q2 或 readiness。
- successor v2 使用新 binding/public-contract/program/package/report 版本和身份 `skill-ir-api-tester-production-binding-successor-development-001`，支持实际消费位置的有限同文档 component ref、query/body primitive array 与两种 query form encoding。提交报告绑定已暴露 Open-Meteo 字节，1 operation/23 fields/5 arrays、checker pass、0 model/API/paid；`prospective=false`、`unseenInput=false`。
- v1 四份真实行全部在构造前拒绝，`checkerStatus=not-run`；v2 单输入通过不能写成 v1 checker 0/4 已修复，也不能把旧分母改成 1/4。DPP/OpenWrt/SignalK 仍超出 v2 边界。
- 权威入口：`classification-handbook-v2.md`、`q1-development-annotation-package-v2.md`、`ai-assisted-development-routing-and-prospective-construction.md`、`benchmarks/skill-ir/classification/` 与 `task-automation-classification.ts`。当前没有真人 A/B 一致率、classification accuracy、可靠性或人工节省结果。

## B 冻结结果的正确读法

- 权威报告：`results/skill-ir/api-tester-trace-public-answer-paid-development-001/report.json`，状态 `negative-smoke-frozen`，observed 1/4。
- `exact` 只表示从模型生成计划投影出的 operation method/path/顺序与 public answer 一致；它不覆盖 schema-derived cases、安全响应或独立性语义。
- 报告中的 `modelCalls=apiCalls=paidCalls=1` 都按“已分发 agent 任务行”计数。该行另观测到 10 个 provider responses 和 15 个 tool calls；旧字段不能证明底层模型请求数或计费往返数为 1，也不能单独证明底层请求数不超过 4。
- token usage 为 input 58060、output 7445、cache-read 137344、cache-write 0；explicit input+output 为 65505。供应商货币费用未记录。
- authoring/review 的 0/0 只表示自动运行窗口内没有人主动介入；它不是人工编写、独立审核或修复流程的测量，也不支持“人已从作者降为审核者”。
- 当前没有活动中的 B 付费任务；旧 identity 不重跑、不补行、不换 route。

## 成本与产品口径

- Env 的 `break-even=1` 只属于现有 production model-token 口径：one-time 9358 tokens，相对 original 50502.5 tokens/run，首次复用覆盖一次性模型 token。它不包含历史研发、人工、货币价格或全部失败尝试，不是总经济回本。
- API Tester 历史 4/4 是人工实现领域转换在冻结 development slice 上的质量正例。production v1 只在显式 OpenAPI 子集内以两个公开 development 输入 2/2 建立通用参数候选；successor v2 又在一个已暴露真实输入上建立有限 ref/array development 证据。三者都不是任意 OpenAPI、未知 skill 自动接入或前瞻泛化。
- CLI 的 API `--variant` 直接运行冻结 compiler/package/runtime；API `--binding` 从文件内 schemaVersion 显式选择 additive production v1/v2 contract/package/独立 checker，未知版本在输出创建前拒绝；Env preset 调用既有 product runner。它们共享部分底层能力，但完整编排、证据和支持范围不同。

## 当前顺序与边界

1. 已完成：零付费状态和口径同步。
2. 已完成：七案例回顾表校准，分开测量失效、实现失败、基线饱和与语义边界。
3. 已完成设计：B successor 固定 2 participants × 4 tasks = 8 rows 的平衡交叉对照，`taskSetStatus=not-authored`；
   尚无参与者或效果数据。
4. 已完成：提交 `3bd7618` 的同机 fresh detached worktree 通过 Env 与 API Tester JSON 两条金路径；
   机器报告与主张—证据表已落盘。独立操作者、独立安装和跨平台仍未测。
5. 已完成：`aa3a088` 先推送候选/lock/prediction/runner，随后唯一执行 8 行；每行一次、0 retry/replacement/fix，所有 outcome 留分母。
6. 已冻结：真实 0 accepted/4 rejected，boundary 0 accepted/4 rejected，8/8 exact rejection prediction；construction=122ms、run/check=0ms、human modification=0 observed minutes、model/API/paid=0、AI analysis 未测。
7. 已完成：完整审计四份已暴露 real input；successor v2 只扩有限 local ref/primitive array，并用 Open-Meteo 完成一份零调用开发路径。该阶段不创建新实验分母。
8. 已完成：routing builder tuple 类型修复且冻结 JSON/candidate digest 不变；统一 API binding CLI 已接入 v1/v2，production report 显式绑定实际 schema/support contract，历史 result v1 仍兼容。
9. 当前停止：若继续 API prospective，必须新 candidate identity、新未见输入和独立授权；第二 profile、新 skill/组合、Q4/Q5 均另立身份。

持续禁止：把 AI 草稿写成真人 Q1/一致率/准确率；复活 B 旧 identity；读取 held-out；启动 Stage M/N matrix；修改旧 lock/result/Q2；为正例改候选/scorer/artifact、换输入或补行；扩 DSL 或据此晋级 portfolio/readiness。
