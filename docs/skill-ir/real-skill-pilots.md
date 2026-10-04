# 真实 Skill Corpus 与 Method Portfolio

**本文范围：** 以下 portfolio、intake 顺序和阶段结果是既有 IR/AOT pilot 的组件记录。当前 DSL 的外部 skill 来源、成员职责和类别依据统一见[研究 §4](skill-dsl-research.md#4-语料结构与分类已有发现)；活动开发从[当前状态](current-status.md)进入，不因这里保留旧 intake 而重新启动实验。


本文记录 IR/AOT 阶段的现实来源、证据角色、intake 和 pilot 生命周期。实验入口统一见 [evidence-index](evidence-index.md) 与 [experiment catalog](../../results/skill-ir/experiment-catalog.json)。下列历史选择顺序不构成当前开发队列。

## 1. 为什么使用真实 Skill

自制 synthetic seed 适合测试 schema、runner 和受控失败，不足以证明方法对公开 skill 有效。主研究对象
必须满足：可定位仓库/commit/path、许可证可判断、source closure 可冻结、任务可用公开证据判分，并覆盖
不同 phenotype。

Synthetic seed 的证据权重固定为 `calibration-low`。真实案例也只有通过 benchmark contract audit 后，
才能计入 contract-qualified 分母。

## 2. 来源

| 来源 | 角色 | 许可证边界 |
|---|---|---|
| `anbeime/skill` | 主要聚合来源 | 仓库级许可混合，逐 artifact 审计。 |
| `laolaoshiren/claude-code-skills-zh` | 中文开发类补充 | MIT。 |
| `travisvn/awesome-claude-skills` | 索引 | 不直接视为 source，跟随链接审计。 |
| `K-Dense-AI/claude-scientific-skills` | 非编码科学 workflow | MIT。 |

机器可读来源与候选在 `benchmarks/skill-ir/corpus/real-skill-intake.json`。

## 3. 角色模型

旧 `Wave A/Wave B` 只作为历史信息。当前角色：

- `studied`：已进入过设计或实验，可解释方法演进；
- `method-development`：允许用于提炼通用 core/catalog/adapter；
- `contract-qualified`：benchmark audit 通过，可进入研究分母；
- `untouched-replication-candidate`：尚未参与方法修改；
- `untouched-replication`：在方法 readiness 冻结后，用冻结 core 执行。

同一 upstream skill 的 v1/v2/skill-unique benchmark 只算一个 real-skill case。Benchmark 版本数不能冒充
跨 skill 广度。

## 4. 当前 Portfolio

| Skill | Phenotype | 当前角色 | 关键边界 |
|---|---|---|---|
| env-manager | environment/schema/repair | contract-qualified method-development | v3 artifact development 4/4、mean 1.0；held-out 关闭。 |
| law-to-markdown | document/script/template | contract-qualified method-development | v3 public ABI 0 false reject；baseline gate failed，v1 held-out regression 保留。 |
| experimental-design | scientific allocation/report | studied method-development | v2 measurement qualified，baseline saturated。 |
| api-tester | OpenAPI/schema/test-plan | method-development | 新 artifact development 4/4、mean 1.0；held-out 关闭。 |
| zh-code-reviewer | evidence/severity/report | contract-qualified method-development | 静态保真 12/12、0 infra、ir-static 4/4、0 regression；optimization/held-out 未开放。 |
| zh-readme | repository fact/documentation | contract-qualified method-development | benchmark audit 合格；v1/v2 付费 measurement 均 invalid，不开放 base IR。 |
| i18n-helper | React+i18next source transformation | contract-qualified method-development | v2 baseline/base IR passed；首个 static identity 12/12 但 4 infra，gate failed。 |

方法开发至少 6 个 contract-qualified case 起步，并在 readiness 未过时继续扩充。API Tester 进入方法开发后
不再是 untouched。Replication 需要另选 skill。

## 5. Source Closure

每个 pilot 必须冻结：

```text
repository URL
commit
upstream path
license file
SKILL.md
referenced scripts/references/assets
sha256 per file
resource/environment contract
```

`original` 必须物化完整 closure。缺失脚本、未解析许可证、网络依赖或平台假设都在 intake 标记，不能用
agent 失败替代资源审计。

## 6. Task 与 Benchmark 设计

每个深度 pilot 先写 2 development + 2 held-out。Task 必须：

- 对 no-skill 可执行，但不把 skill 的关键答案直接写入 prompt；
- 输出可由最终 workdir 确定性评分；
- 包含 alternative-valid 实现；
- development/held-out 在 scorer 前冻结；
- hidden evaluator payload 不进入模型、compiler 或 repair；
- 明确工具/脚本/依赖不可用时属于 infrastructure 还是 semantic。

先做 `no-skill | original` 区分度校准。两臂都满分说明任务饱和；两臂都崩且无可解释差异时，不应继续
构造 IR；出现公开、来源可解释的 partial benefit 时，只有 prospective policy 可重新入场。

## 7. Benchmark Contract Audit

Audit 必须证明 scorer：

1. 接受公开合同允许的多种合法实现；
2. 拒绝缺语义、污染输入、secret、nondeterministic 等失败；
3. 不依赖私有 enum、唯一算法、唯一措辞或 source quote；
4. 删除公开证据后相应 oracle 约束消失；
5. held-out/canary/gold 不进入 runtime；
6. 在真实 materialized workdir 上与初始 manifest 一致。
7. 完整公开所有 scorer-visible output 字段的 type、required、enum/nullability 与 object/array value semantics；
   只列字段名不构成完整 ABI。

历史三个 Wave A v1 audit 均失败，因此只算 `support-real`。Experimental Design v2 与 API Tester 的新合同
通过各自 audit，仍需单独过区分度与优化 gate。Law v3 已用完整公开 ABI 恢复 contract-qualified，但
baseline gate failed；i18n v3 恢复 contract-qualified 后仍两臂满分。i18n contribution-v2 进一步公开
placeholder/plural 语义并通过区分度 gate；现已用 exact source、development prompt、public contract 与公开
report semantics 完成 profile-empty base IR 和逐节点 source audit，corpus 晋升 `runnable`。上述案例都未
消费 held-out，这也不是优化成功证据。

## 8. API Tester Re-entry

冻结 Task 16.22：8/8 rows、0 infra、4 differing pairs；original mean 高于 no-skill，但两 task 的
original success 均为 false，旧 gate failed。该结果保持不变。

新的 `skill-ir-partial-benefit-reentry/v1` 验证 admission passed 后，API Tester 以新 identity 完成
source-audited base IR、YAML/JSON 声明式 adapter 和两个 `validated-skill-artifact/v1` package。冻结
development 矩阵 16/16、0 infra；artifact 4/4、mean 1.0、0 pairwise regression，模型三臂均 0/4。
该结果只将它记为 passed method-development phenotype；不能把旧 gate 改判，也不开放 held-out、
untouched replication 或跨模型 claim。

## 9. Portfolio Readiness

Registry 对每个案例记录：

```text
provenance + phenotype
role + benchmarkContract
baselineAdmission + staticFidelity
optimizedDevelopment + heldOutPromotion
optimizationEvidence class + evidence completeness
optimizationPath route + reason
adaptation measurementStatus + timestamps
humanMinutes + adapterLoc + coreBranchDelta
artifactKinds + reusedArtifactKinds + unautomatedSteps
```

`method-portfolio-readiness/v3` 的五条件按当时 spec 解释。历史 v3 的 7 案例中，API Tester 为 quality-positive、Env artifact 为 fidelity-preserving，readiness 未过；studied、audit/baseline/static pass 与 benchmark 版本数都不能充当优化正例。

Env 的演进分为以下独立身份：

| 身份 | 实际结论 | 原记录 |
|---|---|---|
| successor v2 | 真实 baseline 暴露 source-resource arm asymmetry 与标准 JSON Schema false reject；measurement-invalid | [评估中的合同演进](evaluation-system.md#9-gate-顺序) |
| successor v3 baseline/static | initial manifest 保护真实初始资源，wrapper/标准 JSON Schema 等价；baseline original 4/4 vs no-skill 3/4，static 三臂各 4/4 | [baseline v4](../../results/skill-ir/env-manager-v3-scorer-authority-baseline-v4/)、[static](../../results/skill-ir/env-manager-v3-static-fidelity-v1/) |
| v3 artifact + 历史成本审计 | artifact 4/4、0 regression；旧 automatic compiler cost 未测，保留 fidelity-preserving | [artifact](../../results/skill-ir/env-manager-v3-validated-artifact-development-v1/)、[cost](../../results/skill-ir/env-manager-v3-cost-accounting.json) |
| reviewed-AOT 新身份 | 四对质量等价、one-time 9358 model tokens、break-even=1；review 人工单列 | [readonly-serial cost](../../results/skill-ir/env-manager-reviewed-aot-efficiency-readonly-serial-001/cost-accounting.json) |

前后证据通过版本化 authority 与 supersededEvidence 区分。Reviewed-AOT 的效率结论不回填旧成本，也不替代 automatic qualification；完整 readiness 的各门仍从[自动化 authority 报告](../../results/skill-ir/method-portfolio-authoritative-automation-readiness.json)读取。当前授权 DSL 的研究状态独立见 [current-status](current-status.md)。

## 10. Intake 顺序

新案例按信息增量排序：

1. 许可证与 source closure 可冻结；
2. phenotype 填补 portfolio 空缺；
3. deterministic scorer 可行；
4. 依赖/网络/平台风险可隔离；
5. 复用已有 artifact kind 的同时能检验通用 core；
6. 预计人工适配可被声明式 contract 表达。

#### 历史案例选择与方法发现

| 案例/身份 | 观察与结论 | 恢复入口 |
|---|---|---|
| Statistical Power（18.11） | `K-Dense-AI/claude-scientific-skills` 固定来源，两个闭式设计任务；1 次资格+8 行 baseline 均正常完成，但 23 个 scorer pointer 未公开，measurement-invalid | [selection](../../results/skill-ir/prospective-dynamic-candidate.json)、[baseline](../../results/skill-ir/statistical-power-development-baseline-v1/) |
| BIDS v1（18.17–18.19） | 17-pointer audit 未覆盖值语义；12 模型行完成，11 行因合理路径表示被拒，artifact 4/4 仅为手写机制证据 | [development](../../results/skill-ir/bids-prospective-development-v1/)、[value-semantics preflight](../../results/skill-ir/bids-value-semantics-preflight-v1.json) |
| BIDS successor（18.20–18.25） | 公开 source-derived value semantics、21 scorer canary，先资格后唯一矩阵；no-skill/original/static 3/4、3/4、2/4，artifact 4/4。贡献未识别，static 有回归 | [contract audit](../../results/skill-ir/bids-successor-contract-audit-v1.json)、[development](../../results/skill-ir/bids-successor-development-v1/) |
| i18n contribution-v2 → static | placeholder/plural 公开后 baseline 有区分度；static 首轮含基础设施失败，v4 完整执行后仍为 0 improved、1 regression。token 减少没有覆盖质量回归 | [初轮](../../results/skill-ir/ihc-static-v1/)、[v4](../../results/skill-ir/ihc-static-v4/) |
| Zh Code Reviewer v2 | 公开 summary/精确输出/证据行合同修复后，baseline 通过；static 12 行、0 infra，1 positive/3 equal/0 negative，但多 4280 tokens，仅支持保真 | [baseline](../../results/skill-ir/zcr-pi-v2/)、[static](../../results/skill-ir/zcr-static-fidelity-v1/) |
| Zh README v1/v2 | 两轮均正常执行，但合法命令/许可证/路径等价与断链检查存在测量缺陷；都保留 measurement-invalid，不用于效果判断 | [v1](../../results/skill-ir/zrm-pi-v1/)、[v2](../../results/skill-ir/zrm-pi-v2/) |

共同经验进入共享合同：公开完整输出 ABI 与值语义；scorer 接受来源允许的多种合法表示；完整 materialization 后检查资源；基础设施失败与质量失败分开。贡献饱和、隐藏 schema 或路径表示 false reject 会阻止该身份的效果解释，原始行与分母继续保留。

上述 selection/lock 固定了各自的来源、development 任务、预注册顺序及调用数。它们不是新实验授权。修改旧组件时先读相应报告和测试；复现需回到对应提交及锁定依赖，不能对旧 freeze 目录重新运行 writer。通用 runner 与 envelope/selector 规则见 [evaluation-system](evaluation-system.md)，当前任务从 [current-status](current-status.md) 进入。

## 11. Phase E2 package-inventory 受控产品探针

`package-inventory` 是仓内新建、此前没有 taskSet、scorer、compiler 或 package 的受控 skill。公开输入只有
`package.json` 与 `package-inventory-interface.json`；薄声明描述一个 JSON output。自动构造得到 schema-valid contract/
IR/validation candidate，deterministic gate passed，但 semantic parity 仍 not-established、package 仍 non-executable。

要走完产品链，人工 review 仍补了 53 LOC restricted plan 与 58 LOC patch；缺少的通用能力是 JSON object-key 枚举、
字符串排序/去重与跨字段 count。两次 B-mode 完整链的 artifact/output digest 相同、protected input 未变，0 paid、0
held-out、0 evaluator/taskSet/scorer、core delta 0。由于没有 original recurring token baseline，产品报告诚实给出
token break-even not-computable；因此它是工程可运行性/适配鸿沟证据，不是 token-saving 正例或项目外泛化证据。原始两次记录为 [E2](../../results/skill-ir/verified-artifact-product-e2-package-inventory-2026-08-29/) 与 [E2 r2](../../results/skill-ir/verified-artifact-product-e2-package-inventory-2026-08-29-r2/)。

## 12. Task 18.41 项目外候选选择（未执行）

本节标题的“未执行”仅描述 Task 18.41 的选择阶段。后继 Step 2、003、P1 已执行，按下列身份查询；不再把各阶段的“下一步”当作当前待办。

来源为 `apache/magpie`，固定 commit `453dd9f20bdebe9d4458d84682bd707be1414f80` 的 `skills/release-audit-report/SKILL.md`，Apache-2.0。限定 public fixture 的 Step 0–2：公开 release 字段、MISSING/REDACTED 分账、JSON/Markdown/schema 检查；隐私、自然语言判断及 RM review 继续有独立边界。

### 12.1 Task 18.42 零执行 feasibility

固定 SKILL/schema/harness 足以复现 prompt，但上游只采集 stdout/stderr/exit code，没有 model-token baseline。领域 patch 与独立 checker 的工作量仅是当时估计，没有作为已测人工时间。原始依据见 [feasibility](../../results/skill-ir/magpie-release-audit-feasibility-v1/)；本阶段没有 clone/import/执行/付费。

### 12.2 Task 18.43 固定公开 Step 0--2 slice

导入 31 个原始 Git blob：19 public input、12 checker-only oracle，物理隔离。Reviewed artifact 在 9 个 workdir 通过，checker 接受 9 个 reference 并检出 6 类突变；适配 287 LOC、checker 351 LOC，人工 review 未实测。[Step 2 qualification](../../results/skill-ir/magpie-release-audit-public-step2-v1/qualification.json)保留这些证据。

两个 baseline 身份都在创建模型进程前失败：[001](../../results/skill-ir/magpie-release-audit-public-efficiency-001/) 为 row-path ABI，[002](../../results/skill-ir/magpie-release-audit-public-efficiency-002/) 为 Windows 字面 bun 解析。二者各为零 completed row、零模型调用；后继成功没有覆盖这两次失败。

### 12.3 Task 18.44 有界 executable 治理与条件式 003

共享 executable identity 使用当前 `process.execPath`，验证实际可执行文件版本与身份，最终 spawn 消费绝对路径；原 001/002 与被冻结的旧 runner 不改。零调用资格检查了真实 materialized tree 的并发只读观察。

[003 报告](../../results/skill-ir/magpie-release-audit-public-efficiency-003/report.json)完成固定 9 case×2 repetition 的 18 对：original 6/18、artifact 18/18、0 regression、0 infrastructure/retry。Original input/output/cache-read 为 73537/14038/40960，artifact runtime model token 0；明确的 production API construction token 为 0，条件式 break-even=0。结论限定这些公开 fixture；开发代理与真人投入未知，不能从本表补成总成本或 live-release 收益。

### 12.4 Stage P1 产品主链接入

九个案例通过同一 `compile → review-or-accept → package → run → cost` 产品链。77 行 task declaration、26 LOC patch adapter 和 75 LOC checker adapter 复用已绑定的领域 patch/checker，不复制通用 runtime。Original 003 行只导入，不重跑。[P1 报告](../../results/skill-ir/verified-artifact-product-magpie-machine-checked-2026-09-01/report.json)记录相同 artifact closure、固定切片 machine-check 与 0 项目模型调用；historical humanMinutes 仍为 null，只有新 task declaration 的 3 分钟单独记录。

### 12.5 Stage P2 与 Stage M 边界

P2 的 8-file bundle 依赖现有 SkVM runtime，用户 fixture 不打进包；shadow checker 仅检查固定输出摘要，静态 import audit 也不是通用模块图。

Stage M 只保留预注册合同，runner 在 key/dispatch 前拒绝真实 qualification/matrix。旧设计重复安排 27 次资格 original 与 27 次矩阵 original，且全家族通过条件会浪费已发生调用，因此没有执行该身份。将来跨模型工作需要新的明确设计；本节不构成恢复执行许可。实现合同见 [评估 §11.14](evaluation-system.md#1114-stage-m-qualification-与唯一矩阵-authority)。

## 13. 修改与验证

```powershell
bun test ./src/benchmarks/skill-ir/corpus-registry.test.ts
bun test ./src/benchmarks/skill-ir/benchmark-contract-audit-pilots.test.ts
bun test ./src/benchmarks/skill-ir
bun run typecheck
```

- 修改 corpus/intake 时同步更新 portfolio registry 和本文。
- 冻结 source/task/scorer/lock 不原地改；新工作使用新 version/identity。
- 不删除本地 source checkout 或 raw result，除非确认未被 provenance 引用且用户同意。
