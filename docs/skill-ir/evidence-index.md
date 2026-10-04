# Skill IR 证据索引

本页只做“主张 → 最窄范围 → 结果位置 → 禁止外推”的索引。它不把 spec 章节号改造成 claim ID，也不复制
result 流水。状态为 `not-established` 时表示现有比较不能识别该主张。

当前实验的机器可读入口是 [`results/skill-ir/experiment-catalog.json`](../../results/skill-ir/experiment-catalog.json)。本页只保留能帮助判断主张的摘要；单元级输入、响应、引用和差异报告仍以结果根为准。

## 当前路线

| 主张 | 状态与最窄范围 | 权威结果 | 禁止外推 |
|---|---|---|---|
| 授权任务工具已进入程序实现 | supported-engineering；声明编译、只读取证、有限分支与结论检查已有实现；AR 仍在开发 | [AP 验证](../../results/skill-ir/authorization-runtime-contract-repair-20261001/verification.json)、[AQ 状态](../../results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/status.json)、[AR 状态](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/status.json) | 运行合同检查与源码语义正确性分别核验 |
| 领域执行已稳定改善真实任务质量 | not-established；AQ 四质量臂各 1/10 full，原 skill checked 交付 0/4；AR 主面板未完成 | [AQ 评价](../../results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/evaluation-summary.json)、[AR 评价](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/evaluation-summary.json) | 自动读取次数、局部测试或格式有效不能代替完整任务交付 |
| 真实 trace 已产生可复核闭环 | supported-as-selected-development-route；3 skill / 3 repo，2 package + 1 evidence-backed no-change | `results/skill-ir/trace-guided-skill-optimization-20260913/status.json` | 随机代表性、held-out、live API、任意 skill |
| 新包在匹配任务保持 checker 质量 | supported-on-four-selected-pairs；original 4/4、optimized 4/4 | `results/skill-ir/trace-guided-skill-optimization-20260913/u6/effect-report-all.json` | 跨模型、跨职责、真实 API 行为 |
| 新包减少总体成本 | not-established；duration/output 降，input/cache/observed total 升，USD unknown | 同上 | 不得声称成本或人工节省 |
| 通用生成已覆盖多种 skill 的局部流程 | supported-development；G 阶段 5 次优化、4 个 skill、9 次消费，8 次评价中 5 次通过；唯一严格配对仍 mixed | [G 总报告](../../results/skill-ir/general-skill-optimization-20260913/final-report.json) | 单项 input-token 改善不能代表总成本降低；无稳定多 skill 效果结论 |
| 外部项目可复用同一授权流程 | supported-bounded；2项目/4操作/8状态，16/16交付；MD 8 full、DSL 6 full/2标签错误，实际授权推理均正确 | [AB汇总](../../results/skill-ir/skill-dsl-research/development/authorization-external-reuse-v1/summary.json) | 工程复用不等于DSL收益；不得外推生产安全、纯语法因果、真人节省或一般泛化 |
| AI作者变化稿可经普通流程获得新答案 | supported-bounded；2包/8 session/16场景独立源码复核full；作者直接有效7/8，另1稿机械恢复后消费 | [AI真实消费](../../results/skill-ir/skill-dsl-research/development/authorization-task-semantics-v1/author-use-summary.json) | 不能把恢复稿计作者成功，或外推未见任务、人工省时与部署安全 |

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
| AI任务语义机制稳定提高回答质量 | not-established；54单元仅40完成、初轮配对没有稳定full增益 | [AI质量面板](../../results/skill-ir/skill-dsl-research/development/authorization-task-semantics-v1/panel-summary.json) | 16/16作者消费无旧机制配对，不能替代机制增益证据 |

## 使用规则

- 报告主张时同时引用结果路径、限定 scope 和“不得外推”列。
- 历史文档标题、spec 14.x 章节号和 task 编号保持原引用语义，不重新编号。
- result 不存在、字段 unknown 或分母不完整时保持 `not-established` / `unknown`，不填零。
- 新结果只新增或更新一行索引；执行细节留在 result 和 Git。

## 结果目录的存放与查询

`experiment-catalog.json` 按主题/阶段登记代表入口，并非 results 全目录清单。未登记目录可能是必要前驱、失败记录或绑定材料，不能据此删除。完整旧身份从相应报告、[历史索引](history.md)和 Git 查找。

| 材料 | 存放方式 | 整理原则 |
|---|---|---|
| compact 报告、输入身份、必要来源快照 | 对应实验结果根，按原身份保留 | 新结论追加或具名修订，不覆盖历史分母 |
| 原始请求/响应、stdout、trace、workdir | 默认本地；需要共享的内容按原实验合同脱敏归档 | 有引用或唯一证据时先保留；旧日志可透明压缩，原路径仍可读 |
| 实验 runner/evaluator/replay 脚本 | 已冻结的脚本留在原实验根 | 研究入口也是证据闭包的一部分；未来复用实现进入 src，通用辅助工具进入 scripts |
| 导出包及其验证材料 | 随对应实验/用户 session 保留 | 包闭包与行为结果分别查验，不能只留 SKILL.md |
| 可重建依赖、临时 checkout | 运行期间留在专属工作目录，结束后按锁文件/原 HEAD 收存或退出 | 先区别于原始数据；新临时目录统一用仓外 project-maintenance/runs |

离线导航可运行 `bun ./scripts/experiment-catalog/cli.ts show` 或 `check`；它们只查目录与元数据，不执行模型或研究。2026-10-04 的本地搬迁与透明压缩清单见 `project-maintenance/20261004-governance/README.md`，旧报告里的原路径不回写。
