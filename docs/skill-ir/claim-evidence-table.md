# Skill IR 主张—证据表（2026-09-08）

本表只列当前可用于报告或论文的最窄主张。`supported` 表示证据覆盖表中限定 scope，不表示更强外推；
`not-established` 不是失败洗白，而是缺少能识别该主张的比较或测量。

| 主张 | 状态 | 权威证据 | 已覆盖范围 | 不得外推 |
|---|---|---|---|---|
| 公开验证依据可以组织当前七个案例的开发决策 | `supported-as-retrospective-framework` | `answer-availability-taxonomy.md`；各案冻结 authority/gate | 7 个既有 skill 的已选 task slice、公开合同与环境 | 三路由互斥/完备、对新 skill 的预测力、完整领域难度 |
| API Tester 的确定性 artifact 在冻结 development slice 不回归 | `supported` | `results/skill-ir/api-tester-schema-derived-artifact-development-v1/gate-report.json`；当前 preset report | 2 task × 2 repetition 的既有分母；JSON/YAML 冻结 package | 任意 OpenAPI、自动发现映射、held-out、跨模型 |
| Env reviewed-AOT 在冻结 Windows development 条件下节省 production model tokens | `supported-with-cost-scope` | `results/skill-ir/env-manager-reviewed-aot-efficiency-readonly-serial-001/cost-accounting.json`；machine-checked product report | original 4 samples，50502.5 token/run；one-time 9358；artifact hot path 0；token break-even 1 | 总经济回本、历史研发/人工、货币成本、跨平台 |
| 两条冻结 preset 可从干净源码 checkout 复现 | `supported-on-one-host` | `results/skill-ir/clean-source-gold-path-reproduction-2026-09-06/report.json` | Windows x64、Bun 1.3.14、Node 23.8.0、新 detached worktree、locked dependencies、0 model/API/paid | 独立外部操作者、npm/standalone clean-install、跨平台、任意新 skill |
| AOT 已减少 API Tester 的真实人工 authoring/review 时间 | `not-established` | 旧 B smoke report；`api-tester-human-effort-successor.md` | successor 设计已机器化，但 task set 未创作、参与者未开始 | 把旧自动窗口 0/0 minutes 写成人工减少；回填历史时间 |
| 旧 B 的 `exact` 证明完整 API Tester 质量 | `contradicted-by-scorer` | `results/skill-ir/api-tester-trace-public-answer-paid-development-001/report.json` | 只证明 generated plan 的 operation-sequence projection 与 public answer exact | schema-derived cases、安全响应、独立性、真实 HTTP execution trace |
| AOT 使 LLM 跨模型族更稳定 | `not-established` | Stage N smoke qualification | GPT digest-bind；Claude/DeepSeek 的 API Tester smoke timeout，matrix 未创建 | 跨模型主表、“优化后的 LLM 更稳” |
| 当前系统已实现任意 skill 的全自动构造 | `not-established` | readiness v7；automation catalogs | 受限 deterministic preset、人工 adapter/review 与 packaging | arbitrary-skill optimizer、automation/adaptation convergence |
| 现有正例唯一归因于 Skill IR，而非等价确定性脚本/成熟工具 | `not-established` | 当前两臂和 artifact reports | 已证明产物与产品路径，不足以识别独特方法增益 | 独特算法贡献；下一比较应加入直接脚本或 Schemathesis 类基线 |
| 两份 AI revision-2 草稿可支持当前 development routing | `supported-as-development-routing` | `benchmarks/skill-ir/classification/ai-assisted-development-routing-v1.json`；`ai-assisted-development-routing-and-prospective-construction.md` | 同一 Q1 v2 package 的 24 个 selected responsibility units；逐行 provenance/change/unknown | 真人独立一致率、classification accuracy、original Q1 completion、prospective prediction validity |
| API Tester 4+4 首轮刻画了当前候选的拒绝边界 | `supported-as-bounded-negative-result` | `results/skill-ir/api-tester-constructor-prospective-001/first-run-report.json`；冻结提交 `aa3a088` | 4 real + 4 boundary 全部完成；8/8 exact rejection prediction；真实输入 0/4 accepted，0 checker/infra failure，0 model/API/paid | 不得把拒绝预测写成迁移成功；不证明可靠性、任意 OpenAPI、人工节省、跨 profile 或 readiness |
| API Tester successor v2 能在声明子集内处理有限 local ref/primitive array | `supported-as-exposed-development-case` | `results/skill-ir/api-tester-production-binding-successor-development-001/report.json`；`api-tester-successor-gap-analysis.md` | 已暴露 Open-Meteo 1/1 parse-to-checker；1 operation、23 fields、5 arrays、0 model/API/paid；独立 v2 checker | 不是 unseen/prospective；不改写 v1 0/4；不证明任意 OpenAPI、人工节省、可靠性、跨 profile、CLI readiness |
| API Tester v2 对特性定向新真实输入建立迁移正证据 | `contradicted-on-this-fixed-panel` | `results/skill-ir/api-tester-v2-feature-migration-002/first-run-report.json`；freeze `19af3e3` | 6 个独立真实输入全部在 normalized contract 构造期拒绝，accepted=0/6；4 个边界也全部拒绝；10/10 prediction exact，0 checker/infra failure | 定向样本不是生态接纳率；不能把拒绝预测准确写成迁移成功、任意 OpenAPI、人工节省、optimized LLM、新 skill onboarding 或 readiness |

## 报告口径

- 可以写：AOT 把两个冻结 artifact 热路径中的 runtime 模型调用降为 0，并保留各自 machine-checked 质量边界。
- 可以写：一台 Windows 主机从干净源码 worktree 复现了两条绑定 preset。
- 必须同时披露：API/Env 完整编排不同，依赖 checkout 中冻结资源；Env break-even 只属于 production model-token 口径。
- 可以写：AI routing 表是带 provenance 的 24-unit development 输入；API Tester 4+4 首轮完整保留了 0/4 真实接纳和 4/4 边界拒绝，8 个拒绝码与预测 exact。
- 可以写：successor v2 在一个已暴露 Open-Meteo development 输入上完成有限 ref/array 的 deterministic parse-to-checker。
- 可以写：同一 v2 candidate 对 6 个特性定向新真实文档的 whole-document admission 为 0/6；另 4 个边界也全部按预测拒绝，10/10 rejection prediction exact。
- 必须同时披露：原 Q1 仍未完成；AI 草稿不提供 human agreement/accuracy，4+4 首轮不是可靠性或扩样结论；v2 单输入不是新 prospective 分母，且 v1 行的 checker 从未运行。
- 不可以写：本轮实现了新输入迁移、优化后的 LLM 更稳定、人工已经减少、任意 skill 自动优化、独立安装或跨平台已验证。
