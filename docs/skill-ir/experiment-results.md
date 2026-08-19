# Skill IR 冻结实验结果

本文是研究结果的唯一人工可读 ledger。只保留冻结结论、关键数值和权威路径；运行过程见 Git history，
组件行为见其他权威文档。

## 1. 解释规则

- `passed=false` 的 gate 不因后续讨论改判。
- Development、held-out、capability diagnosis 和 infrastructure diagnosis 不互相替代。
- Runtime validator pass 不等于 scorer success。
- 只比较同一冻结 identity 下的 paired rows。
- Raw workdir 默认本地保存；论文可引用的 compact report、freeze、scored rows 和 provenance 提交到 Git。
- 当前总判断：**测量合同和若干机制成立，通用优化主 claim 尚未完成。**

## 2. 当前总表

| Skill/阶段 | 系统与分母 | 结果 | Gate/解释 |
|---|---|---|---|
| Env static | original vs ir-static，各 4 | mean 0.425 -> 0.700；success 均 0/4 | 静态 IR 降低 hard failures，分类/schema 未解决。 |
| Env dual Final IR | repair v1/v2，各 4 | v1 0/4, 0.700；v2 1/4, 0.6375 | 均未过 development。 |
| Env semantic v2 | check-only/one-repair，各 4 | 0/4, 0.4375；0/4, 0.625 | repair 2 次，0 repaired-to-pass。 |
| Env GPT-4.1 diagnosis | 5 systems x 4 = 20 | 0 infra；五系统均 0/4 | 强模型改善低层准则，classification/schema 残差不变。 |
| Env V4 | 4 generations | 3 pairs 0.90 -> 1.00；1 infra | full denominator success 3/4, mean 0.75，gate failed。 |
| Law development | 4 systems x 4 = 16 | artifact 4/4, 0.925；original 0/4, 0.75；static 1/4, 0.80 | Development gate passed。 |
| Law held-out | 4 systems x 4 = 16 | artifact 2/4, 0.725；2 regressions | Held-out gate failed，package 不晋升。 |
| Experimental Design v2 | 2 arms x 4，普通与 harder | no-skill/original 均 4/4, 1.0 | 饱和，0 differing；不构造 base IR。 |
| Experimental Design skill-unique | 2 arms x 4 | 均 4/4, 1.0；original token 3.1794x | 原 skill 增量仍未形成区分度，停止。 |
| Experimental Design v2 artifact local | 2 development fixtures | scorer 2/2, mean 1.0；protected 2/2；runtime model tokens 0 | 本地机制 qualification；无付费质量 claim。 |
| API Tester baseline | 2 arms x 4 = 8 | no-skill 0/4, 0.2375；original 0/4, 0.4000；4 differing | Partial benefit；旧 original-success gate failed。 |
| API Tester artifact development | 4 systems x 4 = 16 | artifact 4/4, 1.0；static 0/4, 0.3875；original 0/4, 0.225；no-skill 0/4, 0.15 | Development gate passed；只计 method evidence。 |
| Zh Code Reviewer calibration v1 | 2 systems x 4 = 8 | original 4/4, 1.0；no-skill 3/4, 0.75；数值 gate passed | Measurement invalid：唯一差异来自私有 summary 类型 false reject；不开放 base IR。 |
| Zh Code Reviewer calibration v2 | 2 systems x 4 = 8 | original 4/4, 1.0；no-skill 3/4, 0.75 | Measurement valid；开放 base IR/source audit。 |
| Zh Code Reviewer static fidelity | 3 systems x 4 = 12 | no-skill 4/4；original 3/4, 0.8375；static 4/4, 1.0 | Gate passed；1 positive/3 equal/0 negative，只开放 residual audit。 |
| Law v2 contract audit | 2 development tasks x 5 checks x 3 roles | 30/30 matched | 预运行 canary 全绿，但真实输出暴露未声明字段类型，不能单独证明 measurement-valid。 |
| Law v2 calibration | 2 systems x 4 = 8 | 两臂均 2/4、mean 0.90；0 differing；0 infra | 数值 gate failed；4 个 `deliverable` false reject，measurement-invalid。 |
| i18n-helper contract audit | 2 development tasks x 5 checks x 3 roles | 30/30 matched | 预运行 canary 全绿，但未覆盖 `missingKeys` alternative shape。 |
| i18n-helper calibration | 2 systems x 4 = 8 | no-skill 1/4、0.70；original 1/4、0.925；1 positive；0 infra | 数值 gate passed，但 5 个报告 false reject，measurement-invalid。 |
| Law v3 public ABI | 2 systems x 4 = 8 | no-skill 3/4、0.90；original 2/4、0.85；1 positive/2 negative；0 infra | 6 报告 ABI pass、0 false reject；measurement-valid 但 baseline gate failed。 |
| i18n v2 public ABI | 2 systems x 4 = 8 | no-skill 1/4、0.70；original 2/4、0.725；1 positive/1 negative；0 infra | 3 个 source-order key array 被私有 lexical order 误拒；measurement-invalid。 |
| i18n v3 array semantics | 2 systems x 4 = 8 | no-skill 3/4、0.75；original 2/4、0.50；1 positive/2 negative | 5/5 报告 ABI pass；2 条 original 为零 token/无输出，execution-observability blocked。 |
| i18n v3 execution-bound successor | 2 systems x 4 = 8 | no-skill/original 均 4/4、1.0；0 differing；0 infra | 8/8 observable、8/8 ABI pass；baseline saturation。 |
| i18n contribution-v1 | 2 systems x 4 = 8 | 冻结分数 no-skill 0/4、0.40；original 0/4、0.425 | 5/8 placeholder/plural false reject；`measurement-invalid`，不判断 skill。 |
| i18n contribution-v2 | 2 systems x 4 = 8 | no-skill 1/4、0.525；original 2/4、0.925；3 positive/1 negative | 8/8 observable、0 infra、4 differing；baseline gate passed，只开放 base IR audit。 |

## 3. Experimental Design Benchmark v1 与 v2

权威比较：`results/skill-ir/benchmark-and-optimization-evidence-2026-07-29.json`。

| 指标 | v1 | v2 |
|---|---:|---:|
| Canary/audit accepted | 2/8 | 42/42 |
| Alternative-valid false reject | 6/8 | 0/42 |
| Private-contract issues | 8 | 0 |
| Production materialization | 0 | 36/36 |

结论：Experimental Design v2 在**该案例的测量合同**上明确支配 v1，修复了私有 enum、唯一算法、唯一措辞
和未真实物化等问题。共享的是 audit/runner 方法，不是跨 skill 的统一答案或 scorer。
这不能推出 v2 的模型运行一定有区分度。Experimental Design 后续饱和正说明“scorer 合法”和“task 有用”
是两道不同门。

## 4. Env-manager

### 4.1 静态与 Final IR

静态 IR 将 mean 从 0.425 提到 0.700，hard-gate failed rows 从 3 降为 0；binary success 仍为 0/4。
Dual-source overlay v1/v2 均未过 development，说明自然语言 check/recovery 还不足以稳定执行。

### 4.2 Executable/Semantic Artifact

Executable v1 的 one-repair 初检 4/4 pass，repair 0 次，但离线 scorer 仍失败，暴露 semantic false pass。
Semantic v2 能本地触发 repair，但 2 次真实 repair 均未通过 revalidation。

### 4.3 模型与 V4

GPT-4.1 20-row 诊断无 infra；相对 mini 有 18 个 criterion 由 fail 转 pass，但分类/schema 在所有系统中
持续失败。模型能力影响基础执行，不是唯一根因。

V4 将公开 schema residual 固化为 deterministic repair：3 个完整 pair 均 0.90 -> 1.00，模型 repair
tokens 为 0；另 1 个生成在 Bun assertion crash，完整预注册 gate 仍失败。该结果是机制证据，不是 held-out
或跨模型成功。

关键路径：

- `results/skill-ir/env-manager-contract-repair-v4-development-gate-2026-07-22.json`
- `results/skill-ir/env-manager-contract-repair-v4-development-results-2026-07-22.jsonl`
- `results/skill-ir/env-manager-gpt41-capability-diagnostic-2026-07-21/`

## 5. Law-to-markdown

Development 16/16 rows、4/4 quartets、0 infra。Validated artifact 为 4/4、mean 0.925、runtime model tokens
0；相对 original/static 较优者 3 positive、1 equal、0 negative。Development gate 通过。

随后唯一 held-out 仍为 16/16、0 infra，但 artifact 只有 2/4、mean 0.725：法规 task 两次成功，非法律
manual task 两次失败；相对三条 baseline 最佳值有 2 regressions。Held-out gate 失败并冻结，说明法规
转换 code path 可复用，但 task-boundary 判断未泛化。

关键路径：

- `results/skill-ir/law-to-markdown-validated-artifact-development-gate-2026-07-24.json`
- `results/skill-ir/law-to-markdown-validated-artifact-development-results-2026-07-24.jsonl`
- `results/skill-ir/law-to-markdown-validated-artifact-heldout-gate-2026-07-24.json`
- `results/skill-ir/law-to-markdown-validated-artifact-heldout-results-2026-07-24.jsonl`

不能从 development 的 0 runtime model tokens 直接声称 Token 节省；compile/profile/package 成本尚未按同一
合同重测，且 held-out 质量门槛失败。

2026-08-09 新建独立 Law v2 benchmark，不覆盖 v1。公开合同 scorer 不再依赖固定中文审核句子，直接从
`document.txt` 与 `law-contract.json` 推导分类、产物策略、字符流、标题层级和 review evidence。两个
development 分支的 30 个 canonical/alternative/invalid canary 全部 matched。

冻结强模型校准随后完成 8/8 rows、4/4 pairs、0 infra；no-skill 与 original 均为 2/4、mean 0.90，
0 differing/positive pair。执行后审计发现 4 个 statute 报告把公开 deliverable 路径写入 evidence，私有 scorer
却要求 boolean，导致四个 false reject。因此该结果按 `measurement-validity.json` 冻结为 invalid，不开放
base IR；30/30 只能记作不充分的预运行 audit，不能继续写成完整 measurement contract passed。

Law v3 用 `deliverablePath: string|null` 和共享 public ABI 重建独立身份。30/30 audit、qualification
与 8-row matrix 均完整，0 infrastructure。六份真实报告的 string/null shape 全部通过 ABI；两行失败是
没有生成报告，不是表示层误拒。但 original 为 2/4、0.85，低于 no-skill 3/4、0.90；预注册
non-regression gate 失败，所以冻结为 `measurement-valid-baseline-blocked`，不构造 base IR。

i18n v2 同样完成 30/30 audit、qualification 和 8/8 matrix，数值 gate 通过。Post-run authority audit
发现 6 份报告均通过字段类型 ABI，但 basic task 三行按源码发现顺序输出同一 key set，仅因 scorer 私有
字典序要求被拒绝。该身份冻结 measurement-invalid，不重算数值门禁。权威路径：

- `results/skill-ir/law-to-markdown-v3-public-output-abi-calibration-v1/measurement-validity.json`
- `results/skill-ir/i18n-helper-v2-public-output-abi-calibration-v1/measurement-validity.json`
- 各目录中的 `authority-audit.json`、`gate-report.json` 与 `scored-runs.jsonl`

i18n v3 保持 v2 结果不变，以 `public-output-abi/v2` 显式区分 ordered/set-like array，并在付费前冻结 scorer
及直接依赖闭包。新 identity 的 30/30 audit、qualification 和 8-row matrix 均完成；5 份可解析报告全部
ABI pass，0 representation false reject，故 benchmark contract-qualified。冻结 gate 数值为 no-skill
3/4、mean 0.75，original 2/4、mean 0.50。

后验 execution audit 发现两个 original 失败行同时为 exit 0、旧 `runStatus=ok`、0 token、无 final output、
无 task output。这两行不能作为 semantic failure，因此整批 numeric direction 不用于 skill 归因。冻结文件不
重写；compact `execution-audit.json` 将状态记为 `execution-observability-blocked`。Prospective Pi parser 已
改为把同类空终止事件标记 `parse-failed`，下一次验证使用新 calibration identity。

Execution-bound successor 保持 i18n v3 task/contract/scorer/gate 不变，并冻结 Pi parser 到 gate 的 7 个关键
执行依赖。第一份 lock 的 qualification 因未知 Pi content block 触发本地 TypeError，冻结失败且未进入矩阵；
回归测试修复后使用新 lock。最终唯一矩阵 8/8、4/4 pairs、0 infrastructure，8 行全部 observable，8 份
report 全部 ABI pass。No-skill 与 original 均 4/4、mean 1.0，0 differing/positive pair，故 baseline gate
因 saturation 失败；不构造 base IR，也不把 original 额外 129787 tokens 解释为优化成本结论。

## 6. Experimental Design

V1 audit 冻结为失败：8 个 alternative-valid 只有 2 个接受，包含私有 schema/method enum、唯一 allocation
和报告字面量。其历史结果权重降低。

V2 合同完成 42/42 differential 与 36/36 materialization。Stable Pi 后普通两任务和 harder 四任务的
no-skill/original 都是 4/4、mean 1.0、0 differing。Task-sufficiency audit 发现 scorer-required 操作 13/13
已写入 no-skill prompt，原 skill 的 6 类增量知识 0/6 被测量。

Skill-unique surface 完成 18/18 differential、36/36 materialization，direct Node/short-path qualification
通过，但唯一 8-row baseline 仍两臂满分；original token 为 no-skill 3.1794 倍。按停止规则关闭，不再堆
harder task 或 runtime 版本。

Task 17.11 后续没有改写 v1 package，而是新增只消费公开 v2 contract 的 artifact compiler。新 package
通过 2 个 development fixture 的 runtime、protected-input 和 deterministic scorer，2/2 success、mean
1.0、runtime model tokens 0。由于其对应的 no-skill/original 分母已经饱和，本轮按停止规则只记本地机制
资格，不创建付费四臂 lock，不形成 optimized quality 或 Token break-even 证据。

关键路径：

- `results/skill-ir/benchmark-contract-audit/experimental-design.json`
- `results/skill-ir/experimental-design-v2-contract-audit.json`
- `results/skill-ir/experimental-design-v2-materialization-audit.json`
- `results/skill-ir/su-pi-direct-v1/gate-report.json`
- `results/skill-ir/experimental-design-v2-artifact-local-qualification.json`

## 7. API Tester

公开 OpenAPI oracle、五项 deterministic evaluator、2+2 split 与 source closure 在 scorer 前冻结。
Development contract audit 18/18，production materialization 36/36。

唯一强模型 baseline：8/8 rows、4/4 pairs、0 infra、4 differing。No-skill 为 0/4、mean 0.2375、70432
tokens；original 为 0/4、mean 0.4000、167526 tokens。Pair delta 为 -0.20、+0.15、+0.15、+0.55。
Original 改善了 operation coverage，但每个 task 的 full success 都为 false，所以旧 gate 按预注册规则失败。

关键路径：

- `benchmarks/skill-ir/pilots/api-tester/pi-direct-cli-short-path-calibration-lock.json`
- `results/skill-ir/at-pi-v1/gate-report.json`
- `results/skill-ir/api-tester-contract-audit.json`
- `results/skill-ir/api-tester-materialization-audit.json`

新的 `skill-ir-partial-benefit-reentry/v1` 对旧结果做 prospective admission 后，新身份完成了
source-audited base IR、双输入变体 package 与冻结四系统 development：16/16 rows、4/4 quartets、0 infra。
No-skill/original/ir-static 的 success 均为 0/4，mean 分别为 0.15、0.225、0.3875；validated artifact
为 4/4、mean 1.0、0 hard-gate failure、0 pairwise regression。模型三臂合计 382605 tokens；artifact
四次调用 runtime model tokens 为 0，deterministic process/validation 合计 257/260 ms，package 362715
bytes。Compile 人工与一次性 token 成本未测，因此不计算 break-even。

关键路径：

- `benchmarks/skill-ir/pilots/api-tester/api-tester-artifact-development-lock.json`
- `results/skill-ir/api-tester-schema-derived-artifact-development-v1/gate-report.json`
- `results/skill-ir/api-tester-schema-derived-artifact-development-v1/scored-runs.jsonl`

这批结果证明公开 OpenAPI 语义可被固化为稳定 artifact，并排除了本轮强模型/Pi route 基础设施失败。
它仍是 development task、单模型、clean/Windows 证据；旧 baseline `passed=false` 不变，held-out、跨模型、
untouched replication 和 Token break-even 均未证明。

## 8. 当前 Portfolio 证据

| Case | Contract | Baseline | Static fidelity | Optimized development | Promotion |
|---|---:|---:|---:|---:|---:|
| env-manager | passed（v3 scorer authority） | passed | passed | passed，artifact 4/4；fidelity-preserving | not-run |
| law-to-markdown | passed（v3 public ABI） | failed（regression） | blocked | old result invalidated | old result invalidated |
| experimental-design | passed | blocked（saturation） | blocked | blocked | blocked |
| api-tester | passed | passed | not-run | passed，artifact 4/4；quality-positive | not-run |
| zh-code-reviewer | passed，v2 audit 20/20 | passed | passed | not-run | not-run |
| zh-readme | passed | invalidated（scorer authority） | blocked | blocked | blocked |
| i18n-helper | passed（contribution-v2） | passed | failed（quality regression） | blocked | blocked |

机器报告 `results/skill-ir/method-portfolio-readiness.json` 已升级为 v3 且仍 failed：7 registered、7 studied、
7 contract-qualified、2 static-fidelity passed、0 untouched replication；1 quality-positive、1
fidelity-preserving、0 efficiency-positive，readiness-eligible optimized phenotype 只有 1 个。API Tester 从未有
独立 static-fidelity gate，旧 registry 用 artifact gate 同时填充 static/optimized；v3 将 static 修正为 not-run。
Law 的 baseline regression、zh-readme 的 scorer-authority invalidation 与 i18n v4 的 paired quality regression 分属
不同 lifecycle stage，不再被单一 development gate 混写。自动化仍不完整；历史人工时间标记
`historical-unavailable`，Env Manager successor 从 2026-08-12 起前瞻记录。
该失败是诚实状态，不应调整阈值。

`results/skill-ir/method-successor-selection.json` 在 successor 合同开发前冻结全部 7 个方法案例。Env Manager
因补齐唯一缺失的 environment-schema-repair phenotype、已有 deterministic repair/package 机制且对 API Tester
正例提供更高信息互补性而入选。旧 Env v1 audit 的 4 个 `EXACT_CONTRACT_NOT_PUBLIC` 与旧 V4 3 个完整 pair
0.90 -> 1.00 的信号均只作诊断；新身份必须从公开 workspace 证据动态推导合同，并重新经过 contract、baseline、
static 与 optimized development。

Env Manager successor v2 的本地 contract audit 曾以 2 development tasks、3 criteria、3 requirements、8/8
semantic/safety canaries matched。随后首个 resilient baseline qualification 在 88200ms semantic-complete，正式
矩阵 8/8 selected/attempted、4/4 pair、0 replacement/transient/active/parser/runtime blocker，证明通用执行基础设施
在该 phenotype 上有效；但真实运行暴露 canary 未覆盖的 scorer-authority 缺口。Original arm 合法 materialize
`LICENSE.upstream`，却因 payload `protectedPaths` 未列出而被系统性误判；全部 8 行还都生成标准 JSON Schema
`properties + required`，被未公开的 `{variables: ...}` 私有表示要求拒绝。冻结数值 no-skill mean 0.60、original
0.45、0 positive/3 regression 不可解释，整批标记 measurement-invalid，禁止重评分或同 identity 重跑。

Env Manager successor v3 随后只修复测量合同，不复写 v2：公开标准 JSON Schema 与 wrapper 的语义等价，将
frozen initial manifest 作为 arm-neutral protected-input authority，并用包含 `LICENSE.upstream` 初始资源的 Node
样例、Vite wrapper、标准 JSON Schema 与 secret invalid controls 完成 8/8 local contract canary。该结果恢复
portfolio 的 contract-qualified 状态。Development-only freeze 随后绑定公开合同、两条 task 与 source closure；
held-out 保持未创作、未执行。前三次 qualification 因操作层错误设置 1/1/10 秒 shell hard timeout 而终止，分别
冻结为无语义解释的 operator failure；它们不算 execution infrastructure failure，也不重跑同 identity。

v4 使用 720 秒调用层预算后，qualification 在 87613ms `semantic-complete`、确定性 scorer 与语义结果均通过。
唯一 paired baseline 完成 8/8 selected/attempted、4/4 pairs、0 replacement/transient/active/parser/runtime blocker：
no-skill 3/4、mean 0.9125、64147 tokens；original 4/4、mean 1.0、655117 tokens；1 positive、0 regression。
唯一 no-skill failure 将未命中任何公开类型模式的 `UNUSED_FLAG` 声明为 boolean，而公开合同要求默认 string，
属于真实语义错误，不是 v2 式 false reject。Gate passed、`baseIrAuditAllowed=true`；该证据只开放 profile-empty
base IR/static，仍不证明 optimized、held-out、跨模型或 Token 收益。
随后创建的 profile-empty base IR 逐节点绑定 exact source、两条 development prompt 与 public interface，并在
source audit 中排除 evaluator payload、held-out、runtime output 与 profile feedback；验证 0 errors，corpus 晋升
`runnable`。随后 static-fidelity qualification 在 114853ms `semantic-complete`。唯一矩阵完成 12/12 selected/
attempted rows、4/4 triplets、0 replacement/transient/active/parser/runtime blocker；no-skill、original、ir-static
均 4/4、mean 1.0，0 improved、0 regressed、0 hard-gate regression，gate passed。Ir-static 为 94324 非缓存
tokens、394865ms，original 为 133090 tokens、476211ms，分别低 29.13% 与 17.08%；这些只作 development
成本诊断，不单独构成 optimized phenotype 或跨模型/held-out 证据。Static 通过后开放 artifact development。

随后 Env-specific 声明式 adapter 通过既有 `validated-skill-artifact/v1` assembly/catalog/runtime 编译 Node/Vite
两个 package，公共 core 无分支改动；compiler 只消费 exact source closure、profile-empty base IR/source audit、
公开 interface、development prompt projection 和 resource contract。Package determinism、禁止证据 canary、
两种 fixture runtime/scorer activation 全部通过。冻结四臂资格行为 original，自然完成并输出 3/3 artifacts。

唯一 artifact development 矩阵完成 16/16 rows、4/4 quartets、0 infrastructure failure。No-skill 与 original
均 4/4、mean 1.0；ir-static 为 3/4、mean 0.9125，其中一次 Node run 的 artifact consistency 为真实语义失败；
validated artifact 为 4/4、mean 1.0、0 hard-gate failure、0 pairwise regression。模型三臂共 367332 tokens；
artifact 四次调用 runtime model tokens 为 0，deterministic process/validation 合计 243/255ms，package 最大
29652 bytes。一次性编译 token/自动 optimizer 成本尚未测，故不计算 break-even；证据只支持单模型、Windows/
clean development 下的 artifact fidelity，不是第二个 readiness 优化正例，也不支持 held-out 或跨模型泛化。

### 8.1 `i18n-helper` 首轮校准

React+i18next v1 的 qualification 通过，唯一矩阵完成 8/8 rows、4/4 pairs、0 infra。No-skill 为 1/4、
mean 0.70、26969 tokens；original 为 1/4、mean 0.925、124267 tokens，出现 1 个 positive pair。该 pair 中
original 确实改善了 delta、源码替换、双语 locale 与插值四项公开准则，但报告使用 locale-keyed empty arrays
表达无缺失 key，私有 scorer 只接受 `missingKeys: []`；5 行因此被误拒。

数值 gate passed 不覆盖测量有效性审计。该批已冻结为 measurement-invalid，正 pair 仅作诊断，不进入
contract-qualified、base IR 或优化结论。两臂 token 只描述原始 skill 冷运行成本，既没有 optimized arm，也
没有计入编译摊销，不能解释为 Token 优化证据。

### 8.2 `i18n-helper` contribution-identifiable successor

旧 i18n v3 的 execution-bound 基线两臂均满分，不能识别 skill 贡献。新的 contribution task 移除 exact key
和完整 rewrite recipe，改测多文件扫描、部分迁移、重复文本、插值/复数、技术术语排除和已有翻译保持。
contribution-v1 虽通过静态审计，真实 8 行却暴露未公开的报告占位符 normalization 与 plural-family 假拒；
冻结分数 no-skill 0/4、mean 0.40，original 0/4、mean 0.425。反事实公开语义复算有 5/8 行转为 pass，
因此 v1 标记 measurement-invalid，不用于 skill 判断。

contribution-v2 以新 task/scorer/lock 身份公开 `{name}` 报告语法、`{{name}}` locale 插值和 i18next v4
`_one/_other` family。Qualification 为 success、score 1.0；唯一矩阵 8/8、4/4 pairs、0 infra。No-skill
1/4、mean 0.525、63225 tokens；original 2/4、mean 0.925、193607 tokens。4 个 pair 全部有差异，3 positive、
1 negative，预注册 gate passed。两次 partial original 都额外生成 Windows `nul` 文件，因此只在 delta hard
gate 回归，语义项通过。随后 profile-empty base IR 与逐节点 source audit 已通过 schema、validator、lowering
和 leak canary；它不包含后验 `nul` 文件名。

首个 static development identity 冻结 12 rows/4 triplets、`retries=0`，resource 与 route qualification 均
通过。正式分母 12/12 raw、12/12 scored、4/4 triplets，但 4 个 infrastructure failure：multifile 的一个
ir-static 行达到 300 秒 timeout；partial-plural 的 run-index 2 在 no-skill/original/ir-static 三臂均
`parse-failed`、0 tokens。后者跨三臂同位，不能归因给 skill 或 static IR。有效可比 pair 中有 1 positive、
1 equal、0 regression；aggregate 仍因 infra 被计零，ir-static 2/4、mean 0.50，gate failed。禁止同锁补跑、
artifact eligibility、held-out 与优化/Token claim。

execution resilience successor 先后冻结两个 qualification failure：v2 把 180 秒 probe budget 误用于完整任务，
在仍有活动时被外层截断；v3 放宽完整任务 watchdog 后自然完成，但 value-free parser 未识别 Pi 0.67.68 的标准
`thinking` content。两个问题均先通过确定性测试修复，再创建新 identity，不覆盖旧结果。v4 qualification
在 153150ms 自然完成；唯一矩阵为 12/12 attempted/selected、4/4 triplets、0 replacement、0 transient、
0 active timeout、0 parser/runtime blocker，故 `infrastructureSensitive=false`。

v4 仍冻结 gate failed：no-skill 2/4、mean 0.65、64069 非缓存 tokens；original 3/4、mean 0.9625、
213935 tokens；ir-static 3/4、mean 0.875、161220 tokens。Static 相对 original 为 0 improved、1 regressed，
违反至少 1 improvement、0 regression 的预注册门槛。24.64% 的非缓存 token 降幅只能作诊断，不能抵消质量
回归，也不开放 residual audit、artifact、held-out 或 efficiency/optimization claim。该批把 v1 的执行权威问题
与方法质量问题分开，给出了可信的 development 负结果。

关键路径：

- `benchmarks/skill-ir/pilots/i18n-helper/contribution-v2/development-calibration-lock.json`
- `results/skill-ir/i18n-helper-contribution-development-v1/measurement-audit.json`
- `results/skill-ir/i18n-helper-contribution-development-v2/gate-report.json`
- `results/skill-ir/i18n-helper-contribution-development-v2/scored-runs.jsonl`
- `benchmarks/skill-ir/pilots/i18n-helper/contribution-v2/static-development-lock.json`
- `results/skill-ir/ihc-static-v1/gate-report.json`
- `results/skill-ir/ihc-static-v1/infrastructure-audit.json`
- `benchmarks/skill-ir/pilots/i18n-helper/contribution-v2/static-development-lock-v4.json`
- `results/skill-ir/ihc-static-v4/gate-report.json`
- `results/skill-ir/ihc-static-v4/run/execution-envelopes.jsonl`

### 8.3 `zh-code-reviewer` measurement contract

真实 MIT source closure、公开 evidence/severity interface 和 2 development + 2 held-out 已冻结。Development
v2 audit 对 2 个 task 运行 20 个 workdir fixture：包含结构化 summary 在内的合法报告变化、漏 finding、
错锚点、severity 弱化、不可操作建议、双报告矛盾、输入污染和多余文件，共 20/20 matched；
reverse-evidence 与 leak checks 全绿。

该结果把 portfolio 的 review/evidence/severity phenotype 提升为 contract-qualified，但尚无模型行、
no-skill/original 区分度、IR 或优化效果。首个 direct Node Pi v1 已执行 8/8、0 infra：original 4/4、mean
1.0、83700 tokens；no-skill 3/4、mean 0.75、38814 tokens。数值 gate 显示 1 positive/1 differing pair，
但失败行的完整合法报告仅因 `summary` 是对象而被私有 string schema 五项误拒；公开 interface 没有限制
该类型。因此 `results/skill-ir/zcr-pi-v1/measurement-validity.json` 将本批标为 invalidated，不能当作 skill
贡献或 base IR admission。v1 不重评分、不补跑；修复 scorer/audit 后使用新 identity。

v2 已用新 scorer/audit/lock 和独立结果目录完成唯一一次强模型校准：8/8、4/4 pairs、0 infra；original
4/4、mean 1.0、85390 tokens，no-skill 3/4、mean 0.75、38062 tokens，1 differing/positive pair。失败审计
确认两个报告本身合法，失败来自额外 `NUL` 文件违反公开 exact-output contract，因此本批 measurement-valid，
允许开始 base IR/source audit。这里的 token 只说明 original 冷运行更贵，不能作为摊销收益；当前也没有
ir-static/artifact 臂，不能把本批写成优化效果。

随后 profile-empty base IR 与逐节点 source audit 将 exact skill、development 用户可见 prompt、公开 review
interface 和 resource contract 绑定，未读取 held-out、evaluator expected、oracle 或 runtime residual。冻结
static fidelity 矩阵为 12/12、4/4 triplets、0 infra：no-skill 4/4、mean 1.0、35909 tokens；original
3/4、mean 0.8375、93722 tokens；ir-static 4/4、mean 1.0、98002 tokens。Static 相对 original 有 1
positive、3 equal、0 negative、0 hard-gate regression，门禁通过。

唯一 original failure 内容结论正确，但将循环内 `await` 锚在第 3 行而非第 4 行、两个 return-expression
问题锚在第 5 行而非第 6 行，违反公开 primary observable line 定义；ir-static 按第 4/6 行定位并通过。
该机制已由 base IR 的 grounding rule/check 解决，按双源规则属于 `original fail + static pass`，不生成动态
overlay。由于 prior original 为 4/4、本轮 no-skill 也为 4/4，单个正向 pair 仍可能受随机性与局部饱和
影响；且 static 比 original 多 4280 tokens（1.0457x），不能声称稳定优化或 Token 节省。

关键路径：

- `benchmarks/skill-ir/pilots/zh-code-reviewer/static-fidelity-lock.json`
- `results/skill-ir/zcr-static-fidelity-v1/gate-report.json`
- `results/skill-ir/zcr-static-fidelity-v1/residual-audit.json`
- `results/skill-ir/zcr-static-fidelity-v1/scored-runs.jsonl`

## 9. `zh-readme` v1 区分度校准失效

`zh-readme` 首轮使用通用 `method-case-calibration` 和冻结 direct Pi/`xty/gpt-5.6-sol` 身份。Dry-run
为 8 rows/4 pairs，qualification 的 Pi 0.67.68、resource、route、唯一 `README.zh-CN.md` 与 residue
均通过。唯一正式矩阵 8/8、4/4 pairs、0 infrastructure；no-skill 0/4、mean 0.8、35962 tokens，
original 1/4、mean 0.7、98429 tokens。3 个 differing pair 中 1 positive、2 negative，预注册门禁只在
original mean non-regression 上失败。

该数值随后被 measurement audit 判为无效：v1 oracle 在没有公开安装证据时仍生成并强制要求
`npm install`；scorer 对 `npm start`/`npm run start`、`Apache License 2.0`/`Apache-2.0` 等公开等价形式
使用字面匹配；local-reference 检查又未覆盖指向 skill package `LICENSE.upstream` 的 task-repository 断链。
至少四条 no-skill 输出包含可公开验证的 alternative-valid 语义却被扣分，因而两臂均分和 pair 方向都不能
解释为 skill 效果。v1 不重评分、不补跑、不覆盖；base IR 与 held-out 保持关闭。

关键路径：

- `benchmarks/skill-ir/pilots/zh-readme/pi-direct-cli-short-path-calibration-lock-v1.json`
- `results/skill-ir/zrm-pi-v1/gate-report.json`
- `results/skill-ir/zrm-pi-v1/scored-runs.jsonl`
- `results/skill-ir/zrm-pi-v1/measurement-validity.json`

## 10. `zh-readme` v2 仍被真实等价输入击穿

v2 保持原任务、模型、Pi 与 gate 不变，以新 scorer/oracle/audit 修复 v1 已知问题；24/24 synthetic audit
通过，qualification 通过，唯一矩阵完成 8/8、4/4 pairs、0 infrastructure。冻结数值为：no-skill 3/4、
mean 0.95、40204 tokens；original 2/4、mean 0.90、120021 tokens；0 positive pair，数值 gate 失败。

两个 original 失败都引用了 task repository 不存在、仅 skill source closure 存在的 `LICENSE.upstream`，属于
真实 skill contamination。与此同时，一个 no-skill 输出将公开命令的目录参数替换成真实存在的 `.`，v2
却只接受字面参数或 `<placeholder>`，形成新的 false reject。故 v2 也冻结 measurement-invalid，不重评分、
不补跑、不构造 base IR。敏感性审计显示修复该误判只会抬高 no-skill，不会产生 original-positive pair；
这只是方向诊断，不能作为正式替代分数。

关键路径：

- `benchmarks/skill-ir/pilots/zh-readme/pi-direct-cli-short-path-calibration-lock-v2.json`
- `results/skill-ir/zrm-pi-v2/gate-report.json`
- `results/skill-ir/zrm-pi-v2/scored-runs.jsonl`
- `results/skill-ir/zrm-pi-v2/measurement-validity.json`

## 11. Namespaced 四臂与 deterministic artifact re-entry

Namespaced resource quality development r2 使用 Law 与 Experimental Design 的四个 development task，固定
`no-skill | original | ir-static | optimized`，完成 16/16、0 infrastructure failure。Optimized 只有 1/4
success、mean 0.5625，并产生 2 个 pairwise regression，quality gate failed。后续 source-bound failure
audit 确认 4/4 optimized 行都实际加载 namespace resources 并生成公开输出；3/4 失败行受既有 v1 benchmark
contract sensitivity 影响，Experimental Design optimized view 仍只是 source rewrite。该结果证明 namespace
机制和 runner 接入可用，不证明质量或 Token 正收益。

随后 Task 17.11 先复用现有 Law 与 Experimental Design deterministic artifact compiler完成 20/20 本地
focused qualification，再抽取技能无关的公共 assembly。API Tester 与 Experimental Design v1 两种
phenotype 的 shadow rebuild 共覆盖 23 个 production files，2/2 package byte parity、2/2 catalog valid，
`coreBranchDelta=0`。新的 Experimental Design v2 compiler 通过公共 assembly 生成独立 package，并在两个
公开 development fixture 上 2/2 scorer success、mean 1.0、0 runtime model tokens。旧 compiler/package/
lock/result 未修改；由于基线饱和，没有新付费四臂结果，也不能把该本地通过写成优化增益。

关键路径：

- `results/skill-ir/namespaced-resource-quality-development-v1-r2/gate-report.json`
- `results/skill-ir/namespaced-resource-quality-development-v1-r2/semantic-failure-audit.json`
- `src/benchmarks/skill-ir/experimental-design-artifact-compiler.ts`
- `src/benchmarks/skill-ir/law-artifact-compiler.ts`
- `src/benchmarks/skill-ir/validated-artifact-assembly.ts`
- `results/skill-ir/validated-artifact-assembly-parity.json`
- `results/skill-ir/experimental-design-v2-artifact-local-qualification.json`

## 12. 本地与提交结果

2026-08-10 审计时，Git 中有 344 个跟踪 `results/skill-ir` 文件，并有大量本地
raw workdir/qualification/artifact 文件。治理规则：

- Compact gate/audit/scored/summary/provenance 继续提交；
- 可再生成的 raw run、workdir、qualification、debug probe 默认 ignore；
- 已经被 lock digest 或 committed report 引用的文件保持原位；
- 不通过“文档治理”删除用户实验原始数据。

2026-08-12 只读复核发现 56 个未跟踪 result 入口，其中 13 个文件名属于 `scored`/`gate-report` compact
候选。它们多为 7 月历史实验的评分行，尚未逐项完成绝对路径、敏感字段、重复 summary 和 provenance 审计；
当前不批量提交或删除。该 backlog 不改变已冻结 gate 结论，但属于可复现性与仓库治理风险。

## 13. 后续实验

1. 保持 API Tester development package/lock/result 不可变，不立即运行 held-out。
2. 保持 `zh-code-reviewer` base IR/static lock/result 不可变；本轮 residual 已由 static 解决，不创建 overlay，
   后续只有在更多 development context/model 重复出现公开 residual 时才设计 artifact candidate。
3. `zh-readme` v2 已完成 24/24 audit 与唯一 8-row development，但 existing local path command argument
   仍被 false reject；v1/v2 均冻结 invalidated，不进入 base IR。下一步先形成 skill-neutral command
   semantic contract，不立即堆新 calibration 版本。
4. 保持已完成的公共 artifact assembly 与 shadow parity 不变；后续新 compiler 默认接入它，旧冻结实现暂不
   删除。领域语义仍通过公开 contract/compiler 生成，不把差异硬塞进 core。
5. Experimental Design v2 已完成本地 artifact qualification；同一任务基线饱和，停止创建付费 optimized
   identity。下一次付费 comparison 必须选择公开合同合格且基线有区分度的新任务/skill；单独研究质量等价下
   的效率时，另行预注册 efficiency ablation。
6. Env Manager 已补齐第二 phenotype 的 fidelity、前瞻人工分钟、adapter LOC、artifact reuse 与
   `coreBranchDelta=0`；继续补 compile/profile/package 全成本与 break-even，或取得第二个 quality-positive，
   不能把本次领域 compiler 误写成完全自动 optimizer。
7. 工程覆盖粗估约 65%--68%，readiness 证据未到 70%：三模型族 development 小面板已冻结为 blocked/mixed，
   不是跨模型主实验。下一步取得第二个 readiness-eligible phenotype，并完成可复用 dynamic/solidification 竖切。
   Untouched replication、context、held-out 和 Token amortization 主表仍须等待完整 readiness。
8. 保持 Law v3、i18n v2/v3、execution-bound successor、contribution-v1 及 static v1--v4 冻结。
   contribution-v2 已通过 baseline admission 与 source-audited base IR；v4 已排除 execution blocker，但
   static paired quality gate failed。停止该案例的 artifact 纵切，转向另一个 contract-qualified 方法案例；
   不回到旧饱和分母，也不消费 held-out。
9. 通用 dual-source residual admission 与 Final IR v3 development path 已完成 synthetic eligible 端到端验证。
   对 Env Manager v3 冻结 static-fidelity 输入的真实重算得到 `no-reproducible-residual`、0 records、0 repairs；
   compact 证据为 `results/skill-ir/env-manager-v3-static-fidelity-v1/residual-admission.json`。该结果不计
   dynamic-profile 或优化正例；下一付费实验应选择新的 prospective candidate，而不是为 Env v3 制造残差。

## 14. 三模型族 development 小面板 v4

`three-family-development-v4` 在 infrastructure-only qualification 首次通过后执行唯一矩阵：36 个首块 model
attempts 与 4 个 shared deterministic artifact rows。最终 selection 为 11/12 triplets、33/36 model rows，
因此状态冻结为 `blocked`，没有补跑或覆盖同 identity。

- GPT：12/12 semantic-complete，execution-compatible；original/no-skill 2 gain、1 equal、1 regression，
  ir-static/original 0/3/1；all-attempt input+output 414889、duration 1597427ms。
- Claude：12/12 semantic-complete，execution-compatible；对应方向 1/3/0 与 2/1/1；all-attempt
  input+output 325639、duration 1001389ms。
- DeepSeek：12 attempted、9 selected、8 semantic-complete；2 pre-semantic idle timeout、1 active absolute
  timeout，以及 1 个 Pi 标准 compaction event 被旧 allowlist 误判的 parser blocker。旧 report 的 304506 只含
  selected-scored rows；all-attempt input+output 为 2348966、duration 3330245ms。
- Shared artifact：4/4 success、mean 1.0、0 hard-gate failure；缺失 DeepSeek API Tester triplet 按固定分母
  下界计 1 次 regression，artifact gate false。

公共 Pi parser 已将 `compaction_start | compaction_end` 纳入标准事件，compact scored writer 也已去除绝对
manifest path、保留 digest。两项修复不改变冻结 v4：parser blocker 发生时 reserve 尚未执行，不能事后构造
选中 block。该结果支持 GPT/Claude 当前 execution compatibility 和 DeepSeek 长任务稳定性风险，质量方向为
mixed；不支持跨模型泛化、模型排名、held-out、promotion 或 Token break-even claim。权威 compact evidence：

`supplemental-audit.json` 绑定原 report/envelope digest，只补充固定 4-cell 方向分母和 all-attempt 成本：
DeepSeek 两个方向都是 3 observed + 1 missing；它不覆盖原分数、分类、selection 或 promotion 状态。未来
report v2 原生输出 `missing` 和分层 cost；原冻结 report/v1 保持不变。

- `results/skill-ir/three-family-development-panel-v4/qualification.json`
- `results/skill-ir/three-family-development-panel-v4/execution-envelopes.jsonl`
- `results/skill-ir/three-family-development-panel-v4/selected-scored-runs.jsonl`
- `results/skill-ir/three-family-development-panel-v4/panel-report.json`
- `results/skill-ir/three-family-development-panel-v4/supplemental-audit.json`

## 15. Statistical Power development baseline

2026-08-15 的首个 Statistical Power qualification 调用在 148425ms 后形成可观测、可确定性评分的完整行；随后
唯一 `no-skill | original` matrix 完成 8/8 selected rows、4/4 pairs、0 replacement、0 transient、0 active
timeout、0 parser/runtime blocker。八行均自然结束，单行耗时为 100--159 秒；all-attempt duration 为
1008585ms，input+output+cache aggregate 为 547034 tokens。该 execution 证据支持当前 600 秒 absolute / 120 秒
idle / 660 秒 outer 配置，并说明旧短 timeout 确实可能误判正常长任务，但不能外推为所有历史故障的唯一原因。

冻结 numeric gate 为 no-skill/original mean 0.1/0.1、0 differing、0 positive、0 success，`passed=false`。逐产物
authority audit 发现这不是可解释的 skill 质量负结果：8/8 JSON 均可解析且具备公开 interface 声明的全部顶层
字段，但 0/8 通过 scorer 私有的 strict nested schema。公开合同只声明 `analysis`、`sampleSize`、
`reproducibility` 等父对象，没有声明 scorer 实际读取的 23 个嵌套 JSON pointer；canary 又直接用同一隐藏 Zod
schema 生成 canonical fixture，形成了自证循环。Original 产物中关键样本量多与公开 oracle 一致，仍因
`comparisonAlpha`/`adjustedAlpha`、`analyzableGroup1`/`analyzed.group1` 等字段命名差异被整份拒绝。

因此 `measurement-validity.json` 将本 identity 冻结为 `measurement-invalid`，blocker 为
`public-scorer-schema-underdetermined`。它绑定 lock、public interface、scorer、qualification report、selected scored
rows、execution envelopes 与 gate digest；记录真实付费口径为 1 次 qualification + 8 次 matrix = 9 次。该批
既不能证明 original 有益，也不能证明 original 无益；base IR、static residual、dynamic、held-out 与 portfolio
promotion 全部关闭。后续若要修 contract，必须是新的可观察 measurement identity；旧结果不重评分、不补跑。

- `results/skill-ir/statistical-power-development-baseline-v1/qualification.json`
- `results/skill-ir/statistical-power-development-baseline-v1/run/execution-envelopes.jsonl`
- `results/skill-ir/statistical-power-development-baseline-v1/run/selected-scored-runs.jsonl`
- `results/skill-ir/statistical-power-development-baseline-v1/gate-report.json`
- `results/skill-ir/statistical-power-development-baseline-v1/measurement-validity.json`

## 16. Pilot lifecycle shadow parity

2026-08-19 的 Task 18.13 使用 `PilotAdapter/v1` 和同一公共 wrapper 只读重放 3 个已冻结案例，不调用付费模型。
API Tester 与 Env Manager v3 各重建 16 行逻辑 plan、4 个 quartet，并从冻结 tasks/raw/scored evidence 通过
公共 gate 复算完整 report；2/2 plan parity、2/2 report parity。公共 assembly 共重建 4 个 package，4/4
production file sets 逐字节一致，`coreBranchDelta=0`。原证据分类保持为 API Tester `quality-positive`、Env
Manager `fidelity-preserving`，因此该 shadow 结果不是新的质量正例或 Token 节省证据。

两个正例各加载 1 次 adapter builder export、调用 0 次历史领域 builder、执行 1 次 lock-derived logical plan
build。Statistical Power 读取既有 disclosure audit 后冻结为
`measurement-invalid / public-scorer-schema-underdetermined`，在 builder load/call、logical plan、qualification
和付费阶段之前停止；对应计数全部为 0。Compact 结果位于：

- `results/skill-ir/pilot-lifecycle-shadow-parity.json`
