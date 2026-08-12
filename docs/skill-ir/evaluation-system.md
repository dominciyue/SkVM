# Skill IR 评估系统

本文只说明当前通用评估组件。单个 skill 的 task、lock、命令和结果放在 pilot 或 evidence ledger 中。

## 1. 评估原则

1. 先验证 benchmark 合同，再判断 skill/IR/artifact 效果。
2. 主比较使用相同 skill/task/context/model/runIndex 的 paired cells。
3. No-skill、exact original、ir-static 与 optimized 分开；original 必须读取完整 source closure。
4. Deterministic scorer 是成功权威，LLM judge 只作辅助诊断。
5. Runtime validator、semantic failure 与 infrastructure failure 分列。
6. 预注册分母不因失败丢行；`retries=0`。
7. Development 与 held-out 在文件、digest、runner identity 和可见性上隔离。

## 2. 目录与职责

```text
benchmarks/skill-ir/corpus/                 corpus registry、intake、portfolio
benchmarks/skill-ir/contexts/               context definitions
benchmarks/skill-ir/pilots/<skill>/         source、tasks、contract、IR、package、lock
src/benchmarks/skill-ir/matrix.ts            systems/cells
src/benchmarks/skill-ir/real-agent*.ts       materialization 与 execution
src/benchmarks/skill-ir/scoring.ts           scored row 与 pairing
src/bench/evaluators/                        task-specific deterministic scorer
src/benchmarks/skill-ir/*gate*.ts            preregistered gates
results/skill-ir/                            compact evidence 与本地 raw runs
```

## 3. Corpus 生命周期

Corpus registry 要求显式 `--corpus=calibration|pilot`。Synthetic calibration 与真实 pilot 不混用。

真实 skill 常见状态：

```text
selected
-> source-frozen
-> tasks-authored
-> benchmark-audited
-> runnable (有 source-audited base IR)
-> development-gated
-> heldout-eligible
```

`tasks-authored-calibration` 只允许一个显式 skill，并只调度 `no-skill | original` 的 development tasks。
它不会伪造 `irPath` 或 runnable 状态。

当前证据角色由 `method-portfolio.json` 管理；旧 Wave 标签不作为研究分母。

## 4. Experiment Systems

| System | 含义 | 调度条件 |
|---|---|---|
| `no-skill` | 只给用户可见任务。 | baseline |
| `original` | 完整、精确 source closure。 | baseline |
| `ir-static` | profile-empty base IR 经静态 passes/lowering。 | source audit 后 |
| `ir-pgo-dev` | development-only dynamic candidate。 | typed residual 后 |
| `ir-pgo` | Final IR held-out consumption。 | development gate 后 |
| `validated-artifact` | package compiler/runtime 产物。 | package+execution freeze 后 |

默认 cold-start 为前三项；`ir-pgo` 从不默认出现。其他历史 system label 仅显式 ablation 使用。

## 5. Matrix Identity

最小 run identity：

```text
caseId, skill, task, taskSplit, system,
model, modelFamily, agent, adapter, adapterVersion,
environment, context, panelConfigId, runIndex,
sourceDigest, irDigest, packageDigest, lockDigest
```

Pairing 只在除 system 外身份一致时成立。跨时间、跨 provider、跨 harness 的均值不能冒充 paired delta。

## 6. Materialization

Runner 为每行建立隔离 workdir，并保存初始 manifest。Exact original 从 `sourcePath/sourceFiles` 读取正文和
资源，不能只显示 `Source file: <path>`。Protected input 和 source closure 必须在执行后重新验 digest。

当前生产 materializer 会先复制 task fixture，再把 skill bundle 复制到同一 workdir 根目录。Bundle 中的
脚本、模板和 reference 是 original skill 能力的一部分，不能从基线静默删除；同时必须区分三类 provenance
结果：仅可见的 `exposure`、相对路径同名的 `collision`、以及 task output 引用未授权 skill-only resource 的
`output-reference`。只有 digest 不同的覆盖 collision 和未授权 output-reference 是确认污染；单纯 exposure
只作诊断。

Source loader 会排除生成性缓存（`.git`、`node_modules`、`__pycache__`、`.pytest_cache`、`.mypy_cache`、
`.ruff_cache`、`.pyc`、`.pyo`），避免本地工具运行改变 source closure digest。该排除只作用于非 authored
缓存，不改变许可证、脚本、模板或 references 等公开 bundle resource。

Task-specific scorer 只查看最终 workdir 与初始 manifest，判断：

- required outputs 是否存在、路径是否合法；
- protected inputs 是否被改写；
- schema/semantic contract 是否满足；
- 多余文件、secret、absolute path、nondeterminism 是否出现；
- infrastructure 是否阻止了可判分执行。

## 7. Runner CLI

通用 dry-run：

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts `
  '--corpus=pilot' `
  '--systems=no-skill,original,ir-static' `
  '--contexts=clean' `
  '--agents=skvm' `
  '--environments=windows' `
  '--model=xty/gpt-5.6-sol' `
  '--adapter=pi' `
  '--out-dir=results/skill-ir/<run-id>'
```

真实执行必须由对应 lock-specific runner 或显式 `--execute` 命令生成，先完成 lock validation、resource
probe、route probe 和 qualification。API key 只从环境变量读取，禁止写入 config、plan、raw row 或文档。

评分与通用分析：

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts `
  '--raw=results/skill-ir/<run-id>/raw-runs.jsonl' `
  '--corpus=pilot' `
  '--out=results/skill-ir/<run-id>/scored-runs.jsonl'

python scripts/analyze_skill_ir_results.py `
  results/skill-ir/<run-id>/scored-runs.jsonl `
  results/skill-ir/<run-id>/summary.csv
```

具体冻结实验优先运行其专用 `*-run.ts`，不要从此示例猜测参数。

Source package portfolio 的无模型审计：

```powershell
cd D:\skill优化\SkVM
bun ./src/benchmarks/skill-ir/source-package-portfolio-audit-run.ts
```

该命令读取 method portfolio、pilot source registry、development fixture 路径和显式传入的既有
measurement-validity evidence，写入 `results/skill-ir/source-package-portfolio-audit.json`。它不修改 runtime、
不消费 held-out 内容，不产生 skill 优化或 Token claim。来源约束命令 matcher 只接受声明式 exact variant、
alias/script body 与显式参数槽；repository-path 槽必须解析到 task repository 内真实路径。

API Tester schema-derived artifact 的四系统 development runner：

```powershell
cd D:\skill优化\SkVM
$env:SKVM_AUTO_PROBE = "0"
bun ./src/benchmarks/skill-ir/api-tester-artifact-development-run.ts `
  --phase=qualification `
  --lock=benchmarks/skill-ir/pilots/api-tester/api-tester-artifact-development-lock.json `
  --out-dir=results/skill-ir/api-tester-schema-derived-artifact-development-v1

bun ./src/benchmarks/skill-ir/api-tester-artifact-development-run.ts `
  --phase=execute `
  --lock=benchmarks/skill-ir/pilots/api-tester/api-tester-artifact-development-lock.json `
  --out-dir=results/skill-ir/api-tester-schema-derived-artifact-development-v1
```

该 runner 从两个 `no-skill` identity 派生 direct artifact 行，按公开 fixture 路径选择 YAML/JSON package，
最终形成 4 个完整 quartet。Qualification 与 lock digest 绑定，过期或失败时禁止 execute。

公共 artifact assembly 与 Experimental Design v2 的无模型资格检查：

```powershell
cd D:\skill优化\SkVM
bun ./src/benchmarks/skill-ir/validated-artifact-assembly-parity-run.ts
bun ./src/benchmarks/skill-ir/experimental-design-v2-artifact-qualification-run.ts
```

前者对两个冻结 phenotype 做 shadow rebuild，不覆盖旧 package；后者运行两个公开 v2 development fixture，
最终成功仍由现有 deterministic scorer 判定。当前结果仅为本地 mechanism qualification。相同任务的
`no-skill | original` 已饱和，因此没有对应付费四臂 lock；不能从这两个命令推导质量改进或 Token 收益。

Law v2 与 `i18n-helper` 共用 public-contract calibration runner。先将 `LOCK` 和 `OUT` 分别设置为对应案例：

```powershell
cd D:\skill优化\SkVM
$env:SKVM_AUTO_PROBE = "0"
$LOCK = "benchmarks/skill-ir/pilots/law-to-markdown/v2/development-calibration-lock.json"
$OUT = "results/skill-ir/law-to-markdown-v2-public-contract-calibration-v1"

bun ./src/benchmarks/skill-ir/public-contract-calibration-run.ts `
  "--lock=$LOCK" "--out-dir=$OUT" "--phase=plan"
bun ./src/benchmarks/skill-ir/public-contract-calibration-run.ts `
  "--lock=$LOCK" "--out-dir=$OUT" "--phase=qualification"
bun ./src/benchmarks/skill-ir/public-contract-calibration-run.ts `
  "--lock=$LOCK" "--out-dir=$OUT" "--phase=execute"
```

`i18n-helper` 使用 `benchmarks/skill-ir/pilots/i18n-helper/development-calibration-lock.json` 与输出目录
`results/skill-ir/i18n-helper-public-contract-calibration-v1`。`qualification` 固定只运行 lock 中的一条 original
row，并显式加载 scorer；它允许语义失败，只要求 route 非基础设施失败、确定性评分完成且没有 harness residue。
`execute` 必须读取同 identity 的 passed qualification，随后一次性运行 8 rows、评分并写出 gate。两个阶段都
只读取环境变量 `SKVM_XTY_API_KEY`，禁止把 key 写入命令、plan 或结果。

两组唯一执行均为 8/8 rows、4/4 pairs、0 infrastructure。Law 两臂均 2/4、mean 0.90、0 differing，数值
gate failed；i18n 为 no-skill 1/4、mean 0.70，original 1/4、mean 0.925、1 positive，数值 gate passed。
执行后 authority audit 分别发现公开 `deliverable` 与 `missingKeys` 没有声明类型，导致 4/5 行合法表示被
私有 scorer shape 拒绝。因此两组 `measurement-validity.json` 都是 invalid；数值 gate 不开放 base IR，
原输出不重评分，同 identity 不补跑。

`zh-code-reviewer` 的开发期 benchmark audit：

```powershell
cd D:\skill优化\SkVM
bun ./src/benchmarks/skill-ir/zh-code-reviewer-contract-run.ts
bun ./src/benchmarks/skill-ir/zh-code-reviewer-contract-audit-run.ts
```

当前 v2 结果为 2 task、20 cases、20 matched；新增 structured-summary alternative-valid 正例与对应
反向/泄漏约束。该命令不调用模型，写入
`results/skill-ir/benchmark-contract-audit/zh-code-reviewer-v2.json`；旧 v1 audit 保留为历史证据。

首个 direct Pi v1 校准虽数值 gate passed，但执行后 audit 发现 `summary` 的隐藏 string 类型约束误拒合法
结构化对象；权威 `measurement-validity.json` 将其标为 invalidated。修复必须新增 alternative-valid canary 并
使用新 calibration identity，不能修改或重评分 v1。

v2 校准使用以下冻结入口：

```powershell
cd D:\skill优化\SkVM
$env:SKVM_AUTO_PROBE = "0"
bun ./src/benchmarks/skill-ir/zh-code-reviewer-calibration-run.ts `
  --phase=plan `
  --lock=benchmarks/skill-ir/pilots/zh-code-reviewer/pi-direct-cli-short-path-calibration-lock-v2.json `
  --out-dir=results/skill-ir/zcr-pi-v2
```

Qualification 与 execute 使用同一命令，只把 `--phase` 分别改为 `qualification`、`execute`；execute 前必须
已有通过的 `qualification.json`。本轮结果 8/8、0 infra，original 4/4、no-skill 3/4，gate passed；唯一
失败为多出的 `NUL` 文件违反公开 exact-output contract。`measurement-validity.json` 只开放 base IR audit，
held-out 与优化 claim 仍关闭。

Reviewer 的静态阶段复用通用 static-development runner，lock 将 adapter 声明为 Pi managed short-path，
并使用 `evaluationMode=static-fidelity`。冻结门禁为 ir-static 4/4、mean 1.0、0 infra、0 hard-gate/score
regression，允许 0 improved pair。唯一执行为 12/12、4/4 triplets、0 infra；ir-static 4/4，original
3/4，形成 1 positive、3 equal、0 negative。通过只开放 typed residual audit，不开放 held-out 或
optimization claim；命令与锁路径见 `real-skill-pilots.md`。

i18n contribution-v2 同样复用 `static-development-lock/v1` 与现有 runner，不增加 runtime/catalog。预注册身份为
2 development tasks x 2 repetitions x `no-skill | original | ir-static` = 12 rows/4 triplets，Pi 0.67.68、
Windows/clean、`retries=0`。Gate 要求完整分母、0 infrastructure、至少 3 个 static success、static mean
至少 0.85、相对 original 0 score/hard-gate regression 且至少 1 个 improved pair。通过只开放 typed residual
audit/artifact eligibility，不开放 held-out planning/execution；锁路径见 `real-skill-pilots.md`。

唯一执行的 resource/route qualification 均通过，正式分母也完整，但 gate 因 4 个 infrastructure failure
冻结失败：1 个 static timeout，另 3 个是同一 task/run-index 横跨三臂的 zero-usage `parse-failed`。Gate
报告仍把缺失可观测执行计入分母并禁止 residual audit/artifact/held-out；不因两个有效 static success 或一个
positive pair 事后改判，也不在同锁下补跑。

## 8. Benchmark Contract Audit

付费前 audit 至少覆盖：

1. source provenance 与公开 task contract；
2. alternative-valid positive fixtures；
3. semantic/structural negative fixtures；
4. reverse-evidence：删除公开证据后约束消失；
5. gold/expected/sourceQuote/heldout/secret canary；
6. production materialization：真实 fixture、initial manifest、最终 delta；
7. scorer authority：runtime report 不能覆盖最终 scorer。
8. public output ABI：每个 scorer-visible 字段公开声明 type、required、enum/nullability、object/array semantics；
   至少包含 alternative-shape positive 与 type-negative canary。

Experimental Design Benchmark v2 当前审计结果为 42/42 differential 与 36/36 materialization。该结论
只说明该案例的测量合同可用，并为其他 skill 提供 audit 协议参考；不同 skill 仍需自己的公开语义合同与
deterministic scorer，也不保证模型条件下有区分度。

Law v2 与 i18n 的 30/30 人工 audit 说明仅靠预制 fixture 仍可能漏掉真实表示层。付费后必须把 raw workdir
中出现的、与公开合同一致的 alternative value 纳入 authority audit；若 scorer 私有收窄表示，当前 identity
直接标记 measurement-invalid，并用新合同/校准身份修复，不能原地调整 scorer 或重算结果。

`public-output-abi-authority-audit.ts` 从冻结 lock、compact scored rows 和本地 workdir 生成不含模型原文的
shape 摘要，区分 missing/unparseable、ABI failure、semantic failure 与 representation false reject。用法：

```powershell
bun ./src/benchmarks/skill-ir/public-output-abi-authority-audit.ts `
  --kind=i18n `
  --lock=benchmarks/skill-ir/pilots/i18n-helper/v2/development-calibration-lock.json `
  --results=results/skill-ir/i18n-helper-v2-public-output-abi-calibration-v1 `
  --out=results/skill-ir/i18n-helper-v2-public-output-abi-calibration-v1/authority-audit.json
```

当前 analyzer 记录共享 ABI module digest，但本轮 v1 lock 没有预注册该 dependency。下一 lock schema
必须显式绑定 scorer dependency closure，不能用 post-run digest 替代付费前冻结。

`public-output-abi/v2` 对数组增加显式 `order` 和 `duplicates`：`ordered` 按位置比较，`set-like` 忽略顺序，
`duplicates=allow` 时保留元素计数。`public-contract-calibration-lock/v2` 在顶层 scorer 之外冻结全部静态直接
相对 import/export 的 path+digest，并在 lock validation 时用 TypeScript AST 重建和精确比对。旧 ABI/lock
不原地迁移；只有新的 calibration identity 使用这两项 successor contract。

i18n v3 是首个使用该组合的 measurement identity：2+2 task 在 scorer 前冻结，scorer unit test 接受
`extractedKeys` 的 source-discovery order，development-only differential audit 为 30/30。新的 v2 lock 在
付费前绑定 scorer、ABI validator、workdir manifest 与 evaluator registry 的 digest，并复用 v2 已预注册的
数值 gate。唯一真实矩阵完成 8/8；authority audit 的 5 份可解析报告全部 ABI pass、0 representation false
reject，因此 v3 measurement contract 合格。

该批另有两条 original 行被旧执行路径记录为 exit 0 / `runStatus=ok`，但 token 为 0、没有 final output 和
task output。运行下列后验审计可复建紧凑结论；它不改写冻结 raw/scored/gate：

```powershell
bun ./src/benchmarks/skill-ir/public-contract-calibration-execution-audit.ts `
  --results=results/skill-ir/i18n-helper-v3-array-semantics-calibration-v1 `
  --out=results/skill-ir/i18n-helper-v3-array-semantics-calibration-v1/execution-audit.json
```

审计结论为 `execution-observability-blocked`，所以数值 gate 的 0.75 vs 0.50 不能归因为 skill 语义。未来 Pi
parser 将“零 usage + 无 assistant/tool activity”的终止事件标记为 `parse-failed`；已经冻结的旧结果不重分。

同一 benchmark 的 execution-bound successor 另行冻结 7 个关键执行依赖。首个 qualification 因未知 Pi
content block 触发 parser TypeError 而停止；修复使用新 calibration identity。最终 successor 为 8/8
observable、0 infrastructure、8/8 report ABI pass，但 no-skill/original 均 4/4、mean 1.0，0 differing pair。
因此执行合同已恢复，当前结论是 baseline saturation，不是 skill 优化或回归。

### 8.1 贡献可识别性审计

Contract audit 证明 scorer 没有私有收窄；贡献可识别性审计进一步证明 scorer 确实测到了 skill 的独有方法或
风险处理。两者必须分开，后者不能用“no-skill 实际得分较低”倒推通过。

通用 `skill-contribution-identifiability/v1` manifest 绑定 development task/prompt、public contract、scorer、
source closure 和 criterion 定义。每条 claim 使用 quote+path+digest anchor，并区分 `task-outcome`、
`fixture-derived`、`skill-derived`、`overlap`。报告至少输出：

- skill-derived claim 总数、逐 task coverage 和 criterion weight；
- answer-bearing procedure duplication；
- canonical、alternative-valid、prompt-only omission 与 reverse-evidence 结果；
- forbidden evidence sink、held-out/gold/secret/path safety；
- 静态 `eligible-for-baseline | benchmark-underidentified | measurement-invalid` 状态；完成冻结 paired baseline 后，
  工作流再输出 `benchmark-underidentified | distinguishable | model-capability-saturated | measurement-invalid` 最终诊断。

该审计通过不保证 no-skill 低于满分。它保证饱和时可以把结果归为模型能力覆盖，而不是任务没有测到 skill。
审计失败时不得付费；应新建 task-set identity 修复任务贡献面，不能调低通过阈值或给 scorer 加隐藏答案。

实现入口：

```powershell
bun ./src/benchmarks/skill-ir/skill-contribution-identifiability-run.ts `
  --manifest=benchmarks/skill-ir/pilots/<pilot>/contribution-identifiability.json `
  --out=results/skill-ir/<pilot>-contribution-identifiability-v1/report.json
```

manifest 中的 evidence 同时声明语义来源和物理 `kind`；例如 `skill-derived` 只能绑定 `skill-source`，一个
可计入 coverage 的 claim 必须同时有 source、task/public fixture 和 scorer 三类锚点。Canary observation 可声明
预期布尔值；因此“prompt-only omission 应被拒绝”使用 `expected=false`，拒绝本身视为 canary 通过。

首批冻结审计的实测结论为：

- i18n v3：`benchmark-underidentified`，4 条 answer-bearing duplication，skill-derived weight 为 0；
- Experimental Design v2：`benchmark-underidentified`，复现 13 条 operational、4 条 overlap、6 条未测
  skill-derived claim；
- Experimental Design skill-unique：`eligible-for-baseline`，3 条独立 claim，逐 task skill-derived weight
  均为 `0.80`，5 类 canary 全通过。其历史 paired baseline 仍单独报告为强模型饱和，不能由静态审计改判。
- i18n contribution-v1：静态审计曾为 `eligible-for-baseline`，真实运行后发现报告占位符与 plural family 的
  公开语义未完整声明，5/8 false rejection，冻结为 `measurement-invalid`；静态资格不能覆盖真实测量缺陷。
- i18n contribution-v2：公开 `{name}` / `{{name}}` 与 i18next v4 plural family，重新通过 canonical、
  alternative、plural、omission、reverse-evidence、forbidden-sink 和 identifiability audit。真实 8-row paired
  gate passed：0 infra、4 differing、3 positive，original/no-skill mean 0.925/0.525。随后 profile-empty base IR
  与逐节点 source audit 通过，registry 晋升 `runnable`；首个 static development identity 随后因 4 个
  infrastructure failure 冻结失败，artifact 与 held-out 继续关闭。

`public-contract-calibration-lock/v2` 保持同一 schema：历史 lock 继续消费并要求 30-canary benchmark contract
audit；新的 contribution case 可以消费 `skill-contribution-identifiability/v1` manifest + frozen compact report。
后者必须重新计算得到逐字一致的 `eligible-for-baseline` 报告，并绑定同一 tasks/scorer digest，不能用静态资格
绕开 runner、execution observability 或真实 paired gate。

## 9. Gate 顺序

```text
task/source freeze
-> benchmark contract audit
-> materialization audit
-> skill contribution identifiability audit
-> no-skill/original distinguishability calibration
-> source-audited base IR
-> static development
-> typed residual / artifact development
-> development gate
-> held-out freeze + execution
-> promotion or frozen failure
```

Calibration 常见门禁：完整 rows/pairs、0 infra、no-skill 不饱和、至少一个 differing pair。是否要求每个
task 的 original success 由预注册 lock 决定。Partial-benefit re-entry 是新的 prospective admission，
不能改写旧 gate。

当前 re-entry、portfolio readiness 与预注册 successor selection report 可无成本重建：

```powershell
bun ./src/benchmarks/skill-ir/partial-benefit-reentry-run.ts
bun ./src/benchmarks/skill-ir/method-portfolio-run.ts
bun ./src/benchmarks/skill-ir/method-successor-selection-run.ts
```

Portfolio v2 不再用单一 `developmentGate` 混写进度，而是分别记录 `benchmarkContract`、
`baselineAdmission`、`staticFidelity`、`optimizedDevelopment` 和 `heldOutPromotion`。`contractQualified`
只是与首阶段一致性受 schema 校验的兼容摘要；readiness 的 optimized phenotype 只从
`baselineAdmission=passed && optimizedDevelopment=passed` 派生。适配证据另有 provenance：历史未前瞻记录的
案例标记 `historical-unavailable`，不得把空值解释为零成本；`prospective-measured` 必须同时提供起止时间、
人工分钟、adapter LOC 和 core branch delta。

Successor selection policy 必须在新合同开发前冻结，并为 registry 中每个 method-development case 提供一条
assessment。Compact report 公开 phenotype coverage、合同/基线状态、artifact mechanism、信息互补性、下一阶段
和排除原因；这防止运行后删除失败候选或只挑最容易产生正例的案例。

Env Manager v2 是首个按这一路径启动的 successor。它不再把逐 fixture 预期集合放进 evaluator payload；
`env-audit-interface/v2` 公开分类语义、变量名推导政策和输出路径，scorer 从初始 workspace 动态重建 oracle。
Benchmark contract 用 alternative-valid、canonical-valid 与 invalid-control 共 8 个 canary 验证等价表达和安全
边界；通过只开放 baseline，不能复用旧 V4 的 0.90 -> 1.00 作为新身份结果。

## 10. Scored Rows 与分析

Scored row 至少包含：`success`、`evaluatorScore`、`failedCriteria`、`runStatus`、`failureType`、tokens、
latency 和完整 identity。分析器输出：

- per-system success/mean/worst；
- paired positive/equal/negative；
- per-task/model/context slices；
- hard-gate 与 criterion failure counts；
- infrastructure counts 和固定分母；
- compile/profile/runtime/repair token 分解。

Token 在质量 gate 通过前只作诊断。Artifact 的 0 model token 不能忽略预编译成本。

## 11. Stable Pi 与基础设施

当前 Windows 主执行面使用 direct Node Pi package + short-path workdir。资格检查绑定 Pi/Bun/Node 版本、
CLI digest、adapter source、maximum path length 和 output root。历史 Bun crash、fetch-active、transport 与
source-process replay 是基础设施诊断，不进入 skill 效果分母。

新增 runtime 版本必须解决新的可复现 blocker；不能为单个实验继续堆 transport/harness 变体。

### 11.1 Execution resilience successor

未来付费 identity 可以容忍确认的偶发执行前故障，但不能改写、补跑或重评分任何冻结 `v1` 结果。Successor
使用 `skill-ir-static-development-lock/v2`、`skill-ir-static-development-gate-report/v2` 和
`skill-ir-execution-envelope/v1`；旧 schema、lock 和 result 保持原义。

每个 attempted row 生成 value-free execution envelope。它只记录 identity、进程起止/退出、provider request/
response、assistant/tool activity 数、首末活动时间、terminal/stop reason、usage availability/aggregate、parser
outcome、未知 event/content-block 类型名、输出文件计数和 timeout/step-limit；禁止写入 key、模型正文、tool
参数/结果或 evaluator score。分类在 scoring 前完成，未知类型 fail closed：

| 分类 | 含义 | 可 replacement |
|---|---|---:|
| `qualification-failure` | route、credential、resource、版本或 materialization 预检失败 | 否，矩阵不得开始 |
| `transport-transient` | 语义活动前发生已识别的瞬时 provider/network 故障 | 是 |
| `empty-terminal` | terminal 存在，但零 usage 且无 assistant/tool activity | 是 |
| `pre-semantic-idle-timeout` | request 已发出，但 idle 窗口内没有语义活动 | 是 |
| `parser-incompatible` | 收到有效但不支持的 event/content block | 否，停止 identity 并修 parser |
| `runtime-crash` | Node、Pi 或本地 runtime 崩溃 | 否；可复现时停止 identity |
| `active-idle-timeout` | 已开始活动，随后超过 idle 窗口 | 否 |
| `active-absolute-timeout` | 已有活动后达到 absolute 上限 | 否 |
| `step-limit` | 达到冻结 agent step 上限 | 否 |
| `semantic-complete` | 可观测完成，可以交给 scorer | 无需替换 |
| `measurement-invalid` | scorer authority 或 public ABI 无效 | 否，冻结 identity |

首个 successor Pi identity 冻结 `absoluteTimeoutMs=600000`、`idleTimeoutMs=120000`、`maxSteps=30`、
`outerWatchdogMs=660000`。Adapter 必须增量消费 Pi NDJSON；provider response、非空 assistant、tool call/result
或 usage update 重置 idle timer，setup banner 不算活动，absolute timer 永不重置。Active timeout 是 arm 的实测
行为，不能因为后续尝试成功而改成 transient。

Replacement 以 matched block 为单位。Static development 的一个 block 是同一 task/repetition 的完整
`no-skill | original | ir-static` triplet。Lock 在执行前冻结 target 和 reserve block 数及顺序；selector 只
读取 envelope，不接收 scored row。任一 arm 为 eligible transient 时，完整 block 留在 all-attempt evidence、
不进入 selected paired analysis，并启用下一 reserve。非 replaceable execution/semantic failure 的 block 必须
进入主分母；reserve 耗尽仍不足 target 时 gate failed。

Gate 同时输出 selected blocks 和 all attempts。前者应用预注册质量、均值、hard-gate 与 regression 门槛；后者
披露每次 transient、active timeout、step-limit、latency、tokens 和 arm asymmetry。使用 replacement、各 arm
transient 不对称或两个口径方向不一致时标记 `infrastructureSensitive=true`；这会禁止无条件稳定性 claim，
但有界、对称、预注册的 transient replacement 不自动使 development method evidence 无效。

Qualification failure、parser incompatibility、可复现 runtime crash、digest drift、reserve exhaustion、protected/
held-out/credential boundary violation 都会停止 identity。验证分成 current regression、frozen-history
compatibility 和 provider/execution observability；不得修改旧 lock 或回滚当前 corpus 来换取全量数字全绿。

实现必须使用确定性 TDD 覆盖 idle/absolute timer、setup banner、empty terminal、transport、unknown block、
active timeout、step-limit、整组选择、reserve exhaustion、双口径守恒、v1 compatibility 和 compact envelope
无 secret/model/tool text。机制验证不需要付费调用；通过后才冻结新的 i18n static identity。

截至 2026-08-12，该 successor 已实现。`runSubprocess` 增量消费 stdout，Pi adapter 将标准 `thinking` 识别为
已知但非交付内容，真正未知 event/content 仍 fail closed；idle、absolute 与按 `turn_end` 计数的 step limit
均实际生效。`skvm run --execution-observation=<path>` 写出 value-free sidecar；v2 runner 在每行前删除旧
sidecar，按 task/block 顺序执行完整 triplet，选择固定后才评分所有 semantic attempt，并分别计算 selected
gate 与 all-attempt 方向/成本。旧 v1 schema、lock、runner 输出保持兼容。

i18n successor 保留两份不可覆盖的 qualification failure：v2 把 180 秒 route-probe budget 错用于完整任务，
在 `180310ms` 截断仍活跃行；v3 使用完整 660 秒 watchdog 后自然完成，但 envelope allowlist 漏识别 Pi 0.67.68
标准 `content:thinking`。修复均先 TDD、再创建新 identity。v4 qualification 在 `153150ms` 以
`semantic-complete` 通过；唯一矩阵完成 12/12 attempted/selected rows、4/4 triplets、0 replacement、0 transient、
0 active timeout、0 parser/runtime blocker，因此 `infrastructureSensitive=false`。

v4 数值 gate failed，但不是基础设施失败：no-skill 2/4、mean 0.65；original 3/4、mean 0.9625；ir-static
3/4、mean 0.875。Static 达到预注册绝对成功/均值门槛，却相对 original 为 0 improved、1 regressed pair，
违反 `minimumImprovedPairs=1` 与 `maximumRegressedPairs=0`。Static 非缓存 aggregate tokens 为 161220，低于
original 的 213935，但质量回归阻止 efficiency/optimized promotion。Residual audit、artifact、held-out 与
main claim 继续关闭；该结果是可信的 development 方法负结果。

## 12. 结果持久化

提交到 Git：

- task/source/heldout freeze；
- lock、audit、gate report；
- compact scored rows/summary；
- 被 provenance 直接绑定的必要 snapshot。

默认仅本地：

- raw run workdir、qualification-work、临时 artifacts；
- route/debug probe；
- 可由 lock+runner 重新生成的 plan。

治理时不得删除仍被 digest 或结果引用的文件。原始本地数据先通过 inventory 判断，再由用户决定清理。

## 13. 验证与修改注意

```powershell
bun test ./src/benchmarks/skill-ir
bun run typecheck
python scripts/check_skill_ir_doc_links.py --root .
git diff --check
```

- 修改 task/scorer/audit 后必须使用新 identity；冻结文件不原地改。
- 不把 evaluator payload 放进 prompt、package、repair 或 raw model input。
- 不把环境 label 当作真实 OS 证据。
- 不因 API 预算充足而绕过 audit、qualification 或停止规则。
