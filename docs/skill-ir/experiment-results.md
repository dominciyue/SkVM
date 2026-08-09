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
| Law v2 contract audit | 2 development tasks x 5 checks x 3 roles | 30/30 matched | Measurement contract passed；基线未运行。 |
| i18n-helper contract audit | 2 development tasks x 5 checks x 3 roles | 30/30 matched | React+i18next measurement contract passed；基线未运行。 |

## 3. Benchmark v1 与 v2

权威比较：`results/skill-ir/benchmark-and-optimization-evidence-2026-07-29.json`。

| 指标 | v1 | v2 |
|---|---:|---:|
| Canary/audit accepted | 2/8 | 42/42 |
| Alternative-valid false reject | 6/8 | 0/42 |
| Private-contract issues | 8 | 0 |
| Production materialization | 0 | 36/36 |

结论：v2 在**测量合同**上明确支配 v1，修复了私有 enum、唯一算法、唯一措辞和未真实物化等问题。
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
development 分支的 30 个 canonical/alternative/invalid canary 全部 matched；该结果只修复测量合同，
`no-skill | original` 强模型区分度尚未运行。

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

| Case | Studied | Benchmark contract-qualified | Development optimized gate | Untouched |
|---|---:|---:|---:|---:|
| env-manager | yes | no (v1 audit) | no | no |
| law-to-markdown | yes | yes (v2 audit 30/30) | v2 未运行；v1 held-out failed | no |
| experimental-design | yes | yes (v2) | blocked by saturation | no |
| api-tester | yes | yes | yes, artifact 4/4 | no |
| zh-code-reviewer | yes | yes, v2 audit 20/20 | static fidelity passed；optimized gate 未运行 | no |
| zh-readme | yes | yes（audit），付费 measurement invalid | no | no |
| i18n-helper | yes | yes（React+i18next audit 30/30） | 未运行 | no |

机器报告 `results/skill-ir/method-portfolio-readiness.json` 为 failed：7 registered、7 studied、6
contract-qualified、0 untouched replication、1 passed qualified phenotype；数量门槛刚达到，但 Law v2 与
i18n-helper 尚未做区分度校准，Env 仍有 benchmark-contract blocker，zh-readme 仍有 scorer-authority
blocker，自动化指标也不完整。
该失败是诚实状态，不应调整阈值。

### 8.1 `zh-code-reviewer` measurement contract

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

当前 Git 中有约 252 个跟踪 result files，并有大量本地 raw workdir/qualification/artifact 文件。治理规则：

- Compact gate/audit/scored/summary/provenance 继续提交；
- 可再生成的 raw run、workdir、qualification、debug probe 默认 ignore；
- 已经被 lock digest 或 committed report 引用的文件保持原位；
- 不通过“文档治理”删除用户实验原始数据。

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
6. 补齐自动生成 IR/contract、人工分钟、adapter LOC 与 `coreBranchDelta` 趋势，并让至少第二个合同合格
   phenotype 通过 development。
7. Portfolio readiness 通过后才用 untouched skill replication，再扩三模型族、context 和 Token amortization。
