# Skill IR 证据索引

本页只做“主张 → 最窄范围 → 结果位置 → 禁止外推”的索引。它不把 spec 章节号改造成 claim ID，也不复制
result 流水。状态为 `not-established` 时表示现有比较不能识别该主张。

## 当前路线

| 主张 | 状态与最窄范围 | 权威结果 | 禁止外推 |
|---|---|---|---|
| 真实 trace 已产生可复核闭环 | supported-as-selected-development-route；3 skill / 3 repo，2 package + 1 evidence-backed no-change | `results/skill-ir/trace-guided-skill-optimization-20260913/status.json` | 随机代表性、held-out、live API、任意 skill |
| 新包在匹配任务保持 checker 质量 | supported-on-four-selected-pairs；original 4/4、optimized 4/4 | `results/skill-ir/trace-guided-skill-optimization-20260913/u6/effect-report-all.json` | 跨模型、跨职责、真实 API 行为 |
| 新包减少总体成本 | not-established；duration/output 降，input/cache/observed total 升，USD unknown | 同上 | 不得声称成本或人工节省 |

## 已支持的窄主张

| 主张 | 状态与最窄范围 | 权威结果 | 禁止外推 |
|---|---|---|---|
| API Tester 确定性 artifact 在冻结 development slice 不回归 | supported；2 task × 2 repetition | `results/skill-ir/api-tester-schema-derived-artifact-development-v1/gate-report.json` | 任意 OpenAPI、held-out、跨模型 |
| API production binding v1 | supported；两份公开 development 输入 2/2 | `results/skill-ir/api-tester-production-binding-development-001/report.json` | 任意输入、live API、人工节省 |
| API production binding v2 | supported-as-exposed-development-case；Open-Meteo 1/1 | `results/skill-ir/api-tester-production-binding-successor-development-001/report.json` | unseen/prospective、改写 v1 0/4 |
| API v2 feature migration | contradicted-on-fixed-panel；6 real + 4 boundary 全拒绝，10/10 prediction exact | `results/skill-ir/api-tester-v2-feature-migration-002/first-run-report.json` | 生态接纳率、迁移成功 |
| Env reviewed-AOT 节省 production model token | supported-with-cost-scope；4 original samples，break-even 1 | `results/skill-ir/env-manager-reviewed-aot-efficiency-readonly-serial-001/cost-accounting.json` | 总经济回本、人工成本、跨平台 |
| 两条冻结 preset 可从干净源码复现 | supported-on-one-host | `results/skill-ir/clean-source-gold-path-reproduction-2026-09-06/report.json` | 独立操作者、clean install、跨平台 |
| Magpie 固定 9-case product | supported；36/36 rows，original 6/18、artifact 18/18 | `results/skill-ir/magpie-release-audit-public-efficiency-003/report.json` | research readiness、live source、未测人工 |
| public-structure family retrospective contract | supported-as-retrospective-framework；7 examples | `results/skill-ir/public-structure-offline-family-contract-revision-development-002/report.json` | prevalence、prospective generalization |

## 负结果与未建立主张

| 主张 | 状态与最窄范围 | 权威结果 | 禁止外推 |
|---|---|---|---|
| operation parity 证明完整 API Tester 质量 | contradicted-by-scorer；paid smoke 第 1 行 | `results/skill-ir/api-tester-trace-public-answer-paid-development-001/report.json` | schema cases、安全、真实 tool trace |
| AOT 已减少真实人工 author/review | not-established；successor 仅 design | `benchmarks/skill-ir/pilots/api-tester/human-effort-successor-design-001.json` | 旧自动窗口 0/0 minutes 不是人工节省 |
| held-out family minimum delivery 成功 | insufficient-evidence；3 member、98 obligation、0 applicable input | `results/skill-ir/skill-family-minimum-delivery-20260911/report.json` | 不能删掉 unresolved 或制造正例 |
| 40-skill corpus 建立生态分布 | not-established；7 search responses、0 body、0 selection | `results/skill-ir/public-skill-responsibility-corpus-selection-development-001/failure-audit.json` | prefix 不是 corpus，不重试同 identity |
| AOT 使 LLM 跨模型更稳定 | not-established；Stage N matrix 未创建 | 对应 Stage N qualification result | 不得写跨模型主表 |
| 任意 skill 全自动构造 | not-established；受限 preset 与人工边界 | readiness/automation reports | 不得写 arbitrary-skill optimizer |
| 独特增益来自 Skill IR 而非直接脚本/成熟工具 | not-established；缺对照 | 现有 artifact reports | 不得声明独特算法贡献 |

## 使用规则

- 报告主张时同时引用结果路径、限定 scope 和“不得外推”列。
- 历史文档标题、spec 14.x 章节号和 task 编号保持原引用语义，不重新编号。
- result 不存在、字段 unknown 或分母不完整时保持 `not-established` / `unknown`，不填零。
- 新结果只新增或更新一行索引；执行细节留在 result 和 Git。
