# Skill IR 历史与恢复索引

本页不是当前状态。当前路线只看 [current-status.md](current-status.md)。历史精确正文用：

```powershell
git show <commit>:<old-path>
git log -- <old-path>
```

表中的 commit 是治理前最后包含该文件内容的提交。`—` 表示没有单一、明确的机器结果；正文仍可从 Git 恢复。

## 已退出说明文档

| 旧路径 | 最后 commit | 主题 / 合并去向 | 对应 results（若有） |
|---|---:|---|---|
| `docs/skill-ir/ai-assisted-development-routing-and-prospective-construction.md` | `d414410` | AI routing 与 prospective 构造；并入分类/API/证据索引 | `results/skill-ir/api-tester-constructor-prospective-001/` |
| `docs/skill-ir/answer-availability-taxonomy.md` | `9e93131` | 旧三档 taxonomy；并入分类与路由 | — |
| `docs/skill-ir/api-loopback-transport-verification.md` | `9521a68` | loopback transport；并入 API engine | — |
| `docs/skill-ir/api-pytest-request-development.md` | `553e428` | native pytest/httpx；并入 API engine | `results/skill-ir/skill-family-pytest-development-20260911/` |
| `docs/skill-ir/api-pytest-wire-loopback-development.md` | `5d405b9` | pytest wire loopback；并入 API engine | `results/skill-ir/skill-family-pytest-development-20260911/` |
| `docs/skill-ir/api-request-cases-development.md` | `2f7066a` | 请求 case 构造；并入 API engine | `results/skill-ir/skill-family-request-specimens-development-20260911/` |
| `docs/skill-ir/api-response-headers-development.md` | `c8180f4` | response headers；并入 API engine | — |
| `docs/skill-ir/api-response-schema-development.md` | `b003133` | response schema；并入 API engine | — |
| `docs/skill-ir/api-schema-branch-negative-development.md` | `3011413` | branch negative；并入 API engine | `results/skill-ir/skill-family-branch-negatives-development-20260911/` |
| `docs/skill-ir/api-schema-compile-cache-development.md` | `5f518da` | schema compile cache；并入 API engine | — |
| `docs/skill-ir/api-schema-composition-property-verification.md` | `e12c587` | composition property；并入 API engine | — |
| `docs/skill-ir/api-schema-decimal-development.md` | `2f7066a` | decimal multipleOf；并入 API engine | `results/skill-ir/skill-family-json-wire-development-20260911/` |
| `docs/skill-ir/api-tester-human-effort-successor.md` | `9e93131` | 人工投入 successor 合同；并入 API engine | — |
| `docs/skill-ir/api-tester-operation-admission.md` | `ad13e46` | operation admission；并入 API engine | — |
| `docs/skill-ir/api-tester-operation-delivery-freeze.md` | `47efb14` | operation delivery freeze；并入证据索引 | — |
| `docs/skill-ir/api-tester-operation-delivery-verification-retry.md` | `0c26490` | delivery verification retry 历史 | — |
| `docs/skill-ir/api-tester-operation-development-final-report.md` | `47efb14` | operation final report；结果保留 | — |
| `docs/skill-ir/api-tester-operation-development-status.md` | `47efb14` | operation 状态快照 | — |
| `docs/skill-ir/api-tester-operation-mechanism-ablation-results.md` | `a1727b9` | mechanism ablation 结果 | `results/skill-ir/api-tester-operation-mechanism-ablation-development-001/` |
| `docs/skill-ir/api-tester-operation-mechanism-ablation.md` | `a1727b9` | mechanism ablation 方法；并入评价 | 同上 |
| `docs/skill-ir/api-tester-operation-prospective-reproduction.md` | `5309bad` | prospective reproduction | — |
| `docs/skill-ir/api-tester-operation-prospective-research-results.md` | `bc88310` | prospective research 结果 | — |
| `docs/skill-ir/api-tester-operation-prospective-research-status.md` | `2a9bf76` | prospective 状态快照 | — |
| `docs/skill-ir/api-tester-operation-prospective-research-synthesis.md` | `a54a111` | prospective 综合结论 | — |
| `docs/skill-ir/api-tester-operation-prospective.md` | `6a37f54` | prospective 计划 | — |
| `docs/skill-ir/api-tester-production-binding.md` | `70a1d46` | production binding v1/v2；并入 API engine | `results/skill-ir/api-tester-production-binding-development-001/` |
| `docs/skill-ir/api-tester-successor-gap-analysis.md` | `2612fb7` | v2 gap；并入 API engine | `results/skill-ir/api-tester-production-binding-successor-development-001/` |
| `docs/skill-ir/api-tester-trace-public-answer-protocol.md` | `9e93131` | public-answer/trace claim 边界；并入 API engine | `results/skill-ir/api-tester-trace-public-answer-paid-development-001/` |
| `docs/skill-ir/api-tester-v2-feature-migration.md` | `70a1d46` | v2 migration；并入证据索引 | `results/skill-ir/api-tester-v2-feature-migration-002/` |
| `docs/skill-ir/claim-evidence-table.md` | `5309bad` | 主张表；由 evidence-index 取代 | — |
| `docs/skill-ir/clean-source-gold-path-reproduction.md` | `f6c057a` | clean source reproduction；并入证据索引 | `results/skill-ir/clean-source-gold-path-reproduction-2026-09-06/` |
| `docs/skill-ir/development-input-decoding.md` | `1e51d61` | UTF-8/input decoding；并入 IR/API | — |
| `docs/skill-ir/experiment-results.md` | `d140f20` | 旧汇总结果；由 results + evidence-index 取代 | `results/skill-ir/` |
| `docs/skill-ir/external-skill-import-plan.md` | `7d4f358` | importer 实施计划；并入 external-skill-import | — |
| `docs/skill-ir/multi-model-stage-m-panel.md` | `0e66539` | Stage M panel；并入证据索引 | — |
| `docs/skill-ir/project-reassessment-2026-09-06.md` | `f6c057a` | 9 月 6 日重评快照 | — |
| `docs/skill-ir/public-skill-responsibility-corpus.md` | `b3cb287` | public corpus 合同；并入分类与路由 | `results/skill-ir/public-skill-responsibility-corpus-selection-development-001/` |
| `docs/skill-ir/public-structure-offline-family-contract.md` | `d5249d7` | family contract；并入分类与路由 | `results/skill-ir/public-structure-offline-family-contract-revision-development-002/` |
| `docs/skill-ir/q1-development-annotation-package-v2.md` | `2f0b968` | Q1 v2 发放说明；并入分类与路由 | — |
| `docs/skill-ir/q1-human-annotation-walkthrough-v2.md` | `2f0b968` | Q1 walkthrough 历史 | — |
| `docs/skill-ir/sample-scale-and-automation-scope-analysis-2026-09-07.md` | `c380b55` | 样本规模分析快照 | — |
| `docs/skill-ir/skill-duty-extraction-development.md` | `afe657f` | source-grounded duty extraction；并入分类与路由 | `results/skill-ir/skill-duty-extraction-development-20260911/` |
| `docs/skill-ir/skill-family-clean-reproduction.md` | `df58faa` | family clean reproduction | — |
| `docs/skill-ir/skill-family-current-clean-reproduction.md` | `5d405b9` | current family clean reproduction | `results/skill-ir/skill-family-current-clean-20260911/` |
| `docs/skill-ir/skill-family-current-v2-source-repair.md` | `9a16dfa` | N15 source repair；结果保留 | `results/skill-ir/skill-family-current-v2-source-repair-001/` |
| `docs/skill-ir/skill-family-deepening.md` | `d088f4e` | family deepening 历史 | `results/skill-ir/skill-family-deepening-20260911/` |
| `docs/skill-ir/skill-family-heldout-evaluation.md` | `fcfcca5` | held-out evaluator；并入分类与路由 | — |
| `docs/skill-ir/skill-family-minimum-delivery.md` | `2c1c59a` | minimum delivery 合同；并入分类/证据 | `results/skill-ir/skill-family-minimum-delivery-20260911/` |
| `docs/skill-ir/skill-family-model-comparison.md` | `17b9633` | model comparison 历史 | — |
| `docs/skill-ir/skill-family-new-member-discovery-revision-2.md` | `2fff7ac` | discovery r2 记录 | `results/skill-ir/skill-family-new-members-20260911-r2/` |
| `docs/skill-ir/skill-family-new-member-discovery-revision-3.md` | `2fff7ac` | discovery r3 记录 | `results/skill-ir/skill-family-new-members-20260911-r3/` |
| `docs/skill-ir/skill-family-new-member-followup-discovery-2.md` | `844ba13` | follow-up discovery 记录 | `results/skill-ir/skill-family-new-members-20260911-r5/` |
| `docs/skill-ir/skill-family-new-member-followup-method.md` | `eecdbe7` | follow-up method；并入分类 | 同上 |
| `docs/skill-ir/skill-family-new-member-method.md` | `17b9633` | new-member method；并入分类 | `results/skill-ir/skill-family-new-members-20260911/` |
| `docs/skill-ir/skill-family-requirement-audit.md` | `1ffc199` | requirement audit；并入分类 | — |
| `docs/skill-ir/skill-family-source-relatedness.md` | `be89a50` | source relatedness；并入分类 | — |
| `docs/skill-ir/skill-family-supplement-resources.md` | `77c97b7` | supplement resources；并入分类 | — |
| `docs/skill-ir/stage-n-cross-model-aot-stability-panel.md` | `920a87e` | Stage N stability panel；并入证据索引 | — |
| `docs/skill-ir/work-stop-summary-2026-09-11.md` | `e6fa621` | 9 月 11 日停止点快照 | — |

## 仍保留但不是当前入口

被校验器、冻结 JSON 或脚本读取的 Markdown 原件继续留在原路径。它们由
[governance manifest](../../scripts/skill_ir_doc_governance.json)列出，不进入上表，也不能因“历史”标签而改字节。

日期化 taskbook/spec 保留在 `docs/superpowers/`，是决策与执行记录，不与当前状态页竞争。
