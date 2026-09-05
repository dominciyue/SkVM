# 答案可得性路由框架与七案例回顾性证据表

**最后更新：** 2026-09-06
**证据范围：** 现有 7 个 method-portfolio pilot 的冻结 registry、authority report、公开 task/contract 和已提交结果。本表不创建新实验、不重评分、不修改 portfolio/readiness，也不补写历史人工成本。

## 1. 分类对象与三个独立问题

分类对象固定为一个 `(skill, task slice, public contract, environment)` 四元组，不再给完整 skill 主题贴一个永久档位。每个对象分别回答：

1. **验证覆盖：** 公开合同和 checker 覆盖了当前切片的哪些质量要求，哪些要求仍未覆盖；
2. **构造映射：** 能否从公开输入确定性构造候选，映射是通用机制、领域规则还是人工 patch；
3. **剩余判断：** 哪些硬要求仍需要人、外部语义来源或未公开 evaluator 判断。

原来的三档保留为待验证的路由框架，而不是已经完成的分类学：

| 路由 | 暂定含义 | 使用规则 |
|---|---|---|
| R1：显式规范可执行 | 公开 fixture/contract 足以让独立 checker 重算当前切片的全部 hard gates | 只说明“可验证”；不自动说明候选已经自动构造，也不要求唯一 canonical 文本 |
| R2：公开结构需领域映射 | 输入结构公开，但从结构到合格候选仍需要领域 mapping、review 或 case adapter | 映射和人工必须单列，不能因 runtime 为 0 token 就写成 full automatic |
| R3：当前合同仍有外部语义判断 | 至少一个 hard quality requirement 无法从当前公开合同执行，需要实际 reviewer、专家或新的外部 oracle | 只对未覆盖 requirement 使用；不得把完整领域的难度反投影到已收窄的机械切片 |

R1/R2/R3 不是互斥主题标签。同一切片可以是“R1 验证 + R2 构造”，也可以因部分 requirement 落入 R3 而标为 mixed。先按公开合同逐项分类，再看实验结果；禁止用成功、回归、饱和或测量失效倒推路由。

## 2. 结果类型必须与路由分开

七案例结果使用以下互斥解释标签：

- `positive-evidence`：固定合同与分母内的质量或成本正向证据；
- `implementation-failure`：当前转换实现发生质量回归，不代表同类任务不可确定性构造；
- `measurement-invalid`：scorer/public contract 不足，不能据此判断方法或路由；
- `baseline-saturation`：对照无增益空间，不能据此证明专家不可替代；
- `contract-scope-boundary`：当前切片机械可判，但完整 skill 的更宽语义未进入 hard gate。

`未测`、`历史不可得` 和 `0` 不等价。一次合格流程的实测分钟只能说明该投入量可实现；它不是“最低人工下界”。

## 3. 七案例回顾表

| Skill 与冻结切片 | 暂定路由 | 公开验证覆盖 | 构造与剩余人工 | 冻结结果类型与可写结论 | 权威证据 |
|---|---|---|---|---|---|
| `api-tester` / OpenAPI development / Pi-Windows-clean | R1 验证 + R2 构造 | OpenAPI、公开 test-plan contract 与独立 deterministic scorer 覆盖当前 hard gates | 已有 38 LOC 人工 adapter；human minutes 未测；自动构造未成立 | `positive-evidence`：人工实现 artifact 为 4/4、runtime model token 0。另一个 B original smoke 是 `implementation-failure`：operation-sequence parity exact 但三个质量 gate 失败。两者不是同一构造路径 | `results/skill-ir/api-tester-schema-derived-artifact-development-v1/gate-report.json`；`results/skill-ir/api-tester-trace-public-answer-paid-development-001/report.json` |
| `env-manager` / readonly-serial development / Pi-Windows-clean | R1 验证 + R2 reviewed 构造 | 用户可见配置、schema、输入/输出关系与独立质量证据覆盖冻结切片 | reviewed-AOT patch 125 LOC / 8 active human min；历史 adaptation 214 min / 25 LOC 是另一 scope，不能相加或替换 | `positive-evidence`：4/4 quality-equivalent；production model-token 口径 one-time 9358、original 50502.5/run、break-even=1。不是总经济回本或零人工 | `results/skill-ir/env-manager-reviewed-aot-efficiency-readonly-serial-001/paired-quality-evidence.json`；`results/skill-ir/env-manager-reviewed-aot-efficiency-readonly-serial-001/cost-accounting.json` |
| `zh-readme` / development v2 / Pi-Windows-clean | provisional R2；验证状态未决 | repository facts 公开，但 scorer 曾误拒合法 local-path command argument | 构造与人工时间均未建立；registry 的 0 LOC 只表示未记录 case adapter | `measurement-invalid`：只能说明 measurement authority 失败，不能判断该切片是否可自动构造 | `results/skill-ir/zrm-pi-v2/measurement-validity.json`；`benchmarks/skill-ir/corpus/method-portfolio.json` |
| `i18n-helper` / contribution-v2 + static v4 / Pi-Windows-clean | R1 结构验证 + R2 构造；更宽翻译质量在 slice 外 | hard gates 主要覆盖 locale key、placeholder/plural、ABI 与结构；自然语言翻译质量不是完整 hard gate | source mapping 可确定，但当前 static 实现仍有一个 paired regression；人工时间历史不可得 | `implementation-failure`：当前 static 转换失败，不是“这一类不可优化”；更宽翻译语义属于 `contract-scope-boundary` | `results/skill-ir/i18n-helper-contribution-development-v2/gate-report.json`；`results/skill-ir/ihc-static-v4/gate-report.json` |
| `law-to-markdown` / v3 public subset / Pi-Windows-clean | R1 验证 + R2 构造；完整法律判断为 slice 外 R3 | v3 明确规定 law/non-law 规则、heading/content fidelity、output ABI；ambiguous 输入被排除 | 当前切片可机械分类与校验；完整法律文件审核仍未被该合同覆盖；人工时间历史不可得 | baseline 是 `implementation-failure`/regression；旧 artifact evidence 被 contract invalidated。不能把这些结果写成“专家判断不可替代”的实证 | `benchmarks/skill-ir/pilots/law-to-markdown/v3/development/tasks.json`；`results/skill-ir/law-to-markdown-v3-public-output-abi-calibration-v1/measurement-validity.json` |
| `experimental-design` / skill-unique graph slice / Pi-Windows-clean | R1 图结构验证 + mixed R2/R3 | 公开 study graph 可机械导出 independent replicate、count、measurement lineage 与 required grouping factors；free-text method/rationale 只做非空检查 | 图映射已实现；更宽科学设计适切性没有被当前 hard gate 完整覆盖 | `baseline-saturation`：两臂 4/4、0 differing，只说明当前对照无增益空间；不证明完整科学判断不可机械化，也不证明当前构造有独立增益 | `src/benchmarks/skill-ir/experimental-design-skill-unique-oracle.ts`；`results/skill-ir/experimental-design-skill-unique-contract-audit-2026-07-31.json` |
| `zh-code-reviewer` / two supported source-pattern tasks / Pi-Windows-clean | R1 有限规则验证 + R2 构造；完整代码审查为 slice 外 R3 | oracle 从六类源码模式机械生成 finding、line/symbol/category 和固定 severity；报告一致性/actionability 也由公开 interface 检查 | 当前有限模式可机械重建；未支持语言、复杂数据流、真实业务影响仍需 reviewer 或新 oracle；人工时间历史不可得 | `positive-evidence` 仅限 static fidelity；optimized development 未运行。该切片不能充当“专家不可替代”的实证 | `src/benchmarks/skill-ir/zh-code-reviewer-oracle.ts`；`results/skill-ir/zcr-static-fidelity-v1/gate-report.json` |

## 4. 当前可辩护结论

1. 七案例已经形成回顾性证据表，但没有证明三档互斥、对新任务有预测力或构成普适分类学。
2. API Tester 与 Env Manager 证明了两个受限 development 切片可以形成确定性 artifact 路径；构造 mapping 与人工边界仍是方法的一部分。
3. Law v3、Experimental Design skill-unique 和 Zh Code Reviewer 的当前切片含可执行公开规则；完整领域需要专家，不等于这些切片已经提供 R3 的正面实证。
4. `measurement-invalid`、`implementation-failure`、`baseline-saturation` 和 `contract-scope-boundary` 必须分栏，不能合并成“该类不可优化”。
5. 若未来要声称路由预测力或类内迁移性，必须在方法冻结后以前瞻新案例验证；当前七例不能承担该 claim。

## 5. 维护规则

- 新分类先冻结四元组和 hard requirements，再记录 checker 覆盖、构造 mapping 与剩余判断；结果发生在分类之后。
- 人工成本只报告限定 scope 的真实 active minutes、LOC、失败尝试与未测项；不再使用“最低人工下界”。
- 直接确定性脚本或成熟 schema 工具是未来方法增益的必要对照；没有该对照时，只主张工程封装与边界研究。
- 若新增案例或重分类，使用新 identity/版本化文档，保留旧结果；不得为填满某一路由修改 scorer、lock、artifact 或历史人工成本。
- 机器 portfolio/readiness 本阶段不随这份解释性校准自动改变。
