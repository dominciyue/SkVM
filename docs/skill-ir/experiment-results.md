# Skill IR 冻结实验结果

本文档是实验阅读入口。详细机器可读证据位于 `results/skill-ir/`。这里只保留实验
scope、核心数字、解释和 claim 边界，不复制 raw transcript。

## 1. 解释规则

1. Synthetic seed 结果为 `calibration-low`，不支撑任意真实 skill 泛化。
2. Infrastructure failure 从 semantic result 中排除并单独报告。
3. 跨批次独立生成只作诊断；正式差值使用同一冻结矩阵内 paired rows。
4. Development 结果不等于 held-out evidence。
5. Runtime validator 与 deterministic scorer 分开报告。
6. Gate 失败后不运行 held-out，不事后改 scorer、package、task 或 threshold。

## 2. Synthetic Task 11 校准阶段

这一阶段建立 multi-skill runner、scorer、context perturbation、paired analysis、route
health、Final IR 和 model-family diagnostic。六个 skill 为本地 seed。

### Discriminative clean run

| System | Mean success | Rule violations | Mean token cost | Paired delta |
|---|---:|---:|---:|---:|
| original | 0.9167 | 2 | 1266.17 | baseline |
| ir-profile | 1.0000 | 0 | 1470.33 | +0.0833，2/24 gains |

`ir-profile` 有受控正向样本，但 token 约高 16.1%。该结果用于证明 pipeline 有
区分度，不是 real-skill 主结果。

证据：

```text
results/skill-ir/discriminative-task11-results-2026-07-09.jsonl
results/skill-ir/discriminative-task11-table-2026-07-09.csv
```

### True noisy / long

| Context | Original | IR profile | 结论 |
|---|---:|---:|---|
| noisy | 1.0 | 1.0 | 无质量差，IR token/latency 更高。 |
| long | 1.0 | 1.0 | 无质量差，IR token 更高。 |

说明上下文链路可运行，但当前任务太容易，不能证明稳定性提升。

### Hard compressed and second model

- GPT-4.1-mini hard compressed：两个系统均 1.0，IR token 约高 89%。
- GPT-4.1-nano：original 0.8333，ir-profile 1.0，出现 1/6 paired gain。
- Hard-002 multi-model：GPT 两个系统全部通过；Gemini 有成对 OCI 400
  infrastructure failure，不能解释为 skill regression。

### Seed Final IR multi-model

| Model | Original | IR profile | IR PGO | 诊断 |
|---|---:|---:|---:|---|
| gpt-4.1-nano | 0.8333 | 0.8333 | 1.0000 | PGO 有 paired gain。 |
| gemini-2.5-flash | 0.6667 | 0.6667 | 0.6667 | 非 infra 行均通过。 |
| qwen3-8b | 0.3333 | 0.8333 | 0.5000 | Static 优于 PGO。 |

跨模型 aggregate：

```text
original   11/16 = 0.6875
ir-profile 14/16 = 0.8750
ir-pgo     13/16 = 0.8125
```

该结果证明 model-family 行为不一致，不能自动采用统一 Final IR。它基于 synthetic
seed、单 adapter 和 Windows host，只作为方法诊断。

## 3. 真实 Skill：Env-manager

固定环境：

```text
model: xty/gpt-4.1-mini
adapter: bare-agent
host/context: Windows / clean
tasks: Node + Vite development
repetitions: 2
```

### 3.1 Pre-IR calibration

| System | Success | Mean score | Hard-gate failed | Mean token | Mean latency ms |
|---|---:|---:|---:|---:|---:|
| no-skill | 0/4 | 0.5500 | 2 | 6279.25 | 40415.25 |
| original | 0/4 | 0.5125 | 2 | 11423.75 | 60104.50 |

Original 未优于 no-skill，token 高 81.93%，latency 高 48.72%。这证明 original
不是默认上界，base IR 应把它视为 repair target。

证据：

```text
results/skill-ir/env-manager-calibration-v1-2026-07-15/
```

### 3.2 Static IR

| System | Success | Mean score | Hard-gate failed | Mean token | Mean latency ms |
|---|---:|---:|---:|---:|---:|
| no-skill | 0/4 | 0.5875 | 1 | 6994.50 | 55509.25 |
| original | 0/4 | 0.4250 | 3 | 3316.00 | 13122.00 |
| ir-static | 0/4 | 0.7000 | 0 | 7821.75 | 31145.00 |

Static 相比同轮 original mean +0.275，并消除 hard-gate failure。Protected files、
secret safety、required artifacts 和 example safety 为 4/4；classification 和 schema
为 0/4。因此支持 partial correctness 改善，不支持 binary success 提升。

证据：

```text
results/skill-ir/env-manager-static-v1-2026-07-15/
```

### 3.3 Dual-source Final IR

| Candidate | Success | Mean score | Token cost | Gate |
|---|---:|---:|---:|---:|
| ir-static reference | 0/4 | 0.7000 | 31287 | fail |
| typed-output-repair/v1 | 0/4 | 0.7000 | 58023 | fail |
| typed-output-repair/v2 | 1/4 | 0.6375 | 36332 | fail |

V1 没有超过 static 且更贵。V2 出现单行成功，但整体均值和稳定性回归，并引入
artifact/example failure。两个 candidate 均未进入 held-out。

证据：

```text
results/skill-ir/env-manager-dual-overlay-v1-2026-07-16/
results/skill-ir/env-manager-dual-overlay-v1-2026-07-16-dev-replay/
results/skill-ir/env-manager-dual-overlay-v2-2026-07-16/
results/skill-ir/env-manager-dual-overlay-v2-2026-07-16-dev-replay/
```

### 3.4 Executable Artifact V1

| Arm | Success | Mean score | Hard-gate failed | Initial pass | Repair attempts |
|---|---:|---:|---:|---:|---:|
| check-only | 0/4 | 0.5500 | 1 | 3/4 | 0 |
| one-repair | 0/4 | 0.7000 | 0 | 4/4 | 0 |

Package/preflight/checker/runtime 链路可运行，但 one-repair 全部初检通过，repair
休眠。Offline scorer 仍在 classification 和 schema 上 4/4 失败，证明 structural
validator 存在 semantic false pass。

证据：

```text
results/skill-ir/env-manager-executable-artifact-v1-route-probe-2026-07-16/
results/skill-ir/env-manager-executable-artifact-v1-check-only-2026-07-16/
results/skill-ir/env-manager-executable-artifact-v1-one-repair-2026-07-16/
```

### 3.5 Semantic Artifact V2

冻结 gate：

```text
success >= 3/4
mean score >= 0.85
hard-gate regressions = 0
infrastructure failures = 0
repair activation requires >= 1 actual attempt
```

| Arm | Success | Mean score | Hard-gate failed | Initial pass | Repair | Repaired to pass | Infra |
|---|---:|---:|---:|---:|---:|---:|---:|
| check-only | 0/4 | 0.4375 | 3 | 0/4 | 0 | 0 | 0 |
| one-repair | 0/4 | 0.6250 | 0 | 2/4 | 2 | 0 | 0 |

两个 Node row 触发 repair：一个引入 `TYPE_MISMATCH`，一个仍缺
source-qualified finding。两个 Vite row runtime pass，但 scorer 仍拒绝
classification、schema 和 example safety。

Repair activation gate 通过，但 scorer gate 失败；两臂使用独立 initial generation，
且没有 pre-repair scorer snapshot，因此 0.1875 臂间差不是因果 repair estimate。
Held-out 未执行。

证据：

```text
results/skill-ir/env-manager-semantic-artifact-v2-route-probe-2026-07-16-r2/
results/skill-ir/env-manager-semantic-artifact-v2-check-only-run-2026-07-16/
results/skill-ir/env-manager-semantic-artifact-v2-one-repair-run-2026-07-16/
```

### 3.6 GPT-4.1 能力诊断

诊断固定使用冻结 v2 task、fixture、scorer、base IR、package、catalog、repair 上限和
development gate，只把模型从历史 `xty/gpt-4.1-mini` 替换为 `xty/gpt-4.1`。
20 行均正常执行，无 infrastructure failure。

| System | Success | Mean score | Hard-gate failed | Initial pass | Repair | Repaired to pass | Token count |
|---|---:|---:|---:|---:|---:|---:|---:|
| no-skill | 0/4 | 0.7000 | 0 | - | 0 | 0 | 20703 |
| original | 0/4 | 0.7000 | 0 | - | 0 | 0 | 24305 |
| ir-static | 0/4 | 0.7000 | 0 | - | 0 | 0 | 39645 |
| check-only | 0/4 | 0.7000 | 0 | 0/4 | 0 | 0 | 65609 |
| one-repair | 0/4 | 0.6625 | 0 | 0/4 | 4 | 0 | 49877 |

与历史 mini 按 system/task/run index 对齐的 120 个准则比较项中，61 个均通过、
41 个均失败、18 个仅在 GPT-4.1 批次通过，没有反向差异。18 个能力信号候选由 example safety 10 个、
required artifacts 7 个、secret leak 1 个组成；classification 与 schema rules
在全部系统中仍失败。强模型改善了基础产物完整性和安全性，但没有形成系统间区分，
也没有解决核心语义合同。one-repair 真实触发 4 次，4 次二验均失败。

冻结 gate 要求 success >= 3/4 且 mean >= 0.85；本轮失败，未运行 held-out。
两批模型运行存在时间/provider confound，两臂 generation 也相互独立，因此
`causalClaimAvailable=false`，token 只作观测量，不作效率结论。
Compact evidence 由 `provenance.json` 中的 12 文件 SHA-256 清单和 bundle digest
绑定；raw/workdir 不在提交范围。

证据：

```text
results/skill-ir/env-manager-gpt41-capability-diagnostic-2026-07-21/
```

### 3.7 V3 旗舰模型资格审计

使用同一 `env-manager-node-audit-dev-001`、`no-skill`、Windows/clean/bare-agent、
repetition=1 和现有确定性 scorer，验证 V3 候选模型 route 与 harness：

| Model | Route | Score | Success | Hard gate | Latency | Tokens | Failed criteria |
|---|---|---:|---:|---:|---:|---:|---|
| `xty/gpt-5.6-sol` | ok | 0.80 | 0/1 | pass | 36.5s | 8166 | classification |
| `xty/claude-opus-4-8` | ok | 0.70 | 0/1 | pass | 68.2s | 15917 | classification、schema |
| `xty/deepseek-v4-pro` | ok | 0.70 | 0/1 | pass | 141.5s | 10879 | classification、schema |

三条 route 均可执行，没有 infrastructure failure。GPT-5.6 在本轮得分、延迟和 token
上均优于另外两条资格 route，因此冻结为 V3 primary development model。三条运行都
未达到 0.85 成功阈值，并共同残留 classification 失败，说明仅提升模型能力仍不足以
稳定满足语义合同。本节 `methodEvidence=false`，不计入 Skill IR 增益，也不支持模型
总体能力排序。

证据：

```text
results/skill-ir/v3-model-qualification-gpt56-2026-07-21/scored-results.jsonl
results/skill-ir/v3-model-qualification-opus48-2026-07-21/scored-results.jsonl
results/skill-ir/v3-model-qualification-deepseekv4-2026-07-21/scored-results.jsonl
```

### 3.8 V3 共享生成 Development 实验

冻结 `xty/gpt-5.6-sol`、Windows/clean/bare-agent、两个 development task × 2
repetitions。Route probe 为 `ok`；4 个 generation 中 3 个形成完整 pre/post pair，
1 个在 generation 阶段 adapter crash。

| Arm | Complete pairs | Success | Mean | Input tokens | Output tokens |
|---|---:|---:|---:|---:|---:|
| check-only / pre | 3 | 0/3 | 0.70 | 40721 | 8330 |
| one-repair / post | 3 | 0/3 | 0.70 | 92258 | 12023 |

三次 repair 全部触发，0 次 repaired-to-pass，paired mean delta 为 0。三组 pre/post
目录摘要完全相同：模型在 repair 阶段判断“无需修改”。生成报告虽然包含五个公开数组，
非空元素是 object 而非 string；runtime report 持续产生 4 个
`INVALID_REPORT_FIELD_TYPE` 和 6 个 `MISSING_CLASSIFICATION_ENTRY`。离线 scorer 的
classification 与 schema criteria 也均失败。

冻结 gate 要求 ≥3 success、mean ≥0.85、0 infrastructure；实际为 0 success、完整
pair mean 0.70、1 infrastructure，因此 gate 失败，不运行 held-out。结果排除了“只因
mini 模型能力不足”的单一解释，并暴露两处方法缺口：repair contract 只表达 array，
没有充分表达 string item shape；runtime validator 与 scorer 的 schema 成功面仍未完全
对齐。Repair 增加了 token，但没有改变 workdir 或得分。

Compact evidence：

```text
results/skill-ir/env-manager-public-contract-v3-development-evidence-2026-07-21/summary.json
results/skill-ir/env-manager-public-contract-v3-development-evidence-2026-07-21/failure-audit.jsonl
```

Raw、snapshot 和完整 scored rows 留在本地，summary 以 SHA-256 绑定。

### 3.9 V4 Deterministic Repair 离线重放

本轮不调用模型，直接复制冻结 V3 的三个完整 pre-repair snapshots。每条先重新验证
原 snapshot digest，并用原 V3 validator 与既有 deterministic scorer 复现失败；随后
只消费 protected public runtime contract 和 V4 公开 output/repair contract，执行
canonical report 与 schema rule 的确定性修复，再用同一 validator/scorer 复判。

| Snapshot | Before | After | Runtime | Protected | Repair |
|---|---:|---:|---|---|---|
| Node run 1 | 0.70 | 1.00 | fail→pass | stable | report + example + schema |
| Node run 2 | 0.70 | 1.00 | fail→pass | stable | report + example + schema |
| Vite run 1 | 0.70 | 1.00 | fail→pass | stable | report + example + schema |

三条 scorer success 从 0/3 变为 3/3，mean 从 0.70 变为 1.00，classification/schema
residual 清空。Repair report 不保存重建值，只保存 operation、relative path、pointer、
policy/derivation ref 和 protected digest。Schema 从 runtime evidence + policy 全量重建，
`.env.example` 强制 canonical empty values；不借用模型原有的无证据字段。原 V3 的第 4
条 generation adapter crash 不可重放，因此 source-generation 结果是 3/4 success、
gate-compatible mean 0.75、1 infrastructure，development gate 仍失败。

这个 in-sample 结果证明 V4 output contract、development-learned candidate policy 与
deterministic repair semantics 能修复已观察到的 V3 development failures，并与当前
scorer success surface 对齐。此后已实现 V4 package/lock/Runner，并完成 4-generation
dry-run；后续真实 development 见下一节。离线 replay 本身仍不是 held-out 证据。

证据：

```text
results/skill-ir/env-manager-v4-deterministic-replay-evidence-2026-07-22/summary.json
results/skill-ir/env-manager-v4-deterministic-replay-evidence-2026-07-22/contract-coverage-audit.json
benchmarks/skill-ir/pilots/env-manager/env-manager-v4-deterministic-replay-freeze.json
benchmarks/skill-ir/pilots/env-manager/packages/executable-contract-repair-artifact-v4/
benchmarks/skill-ir/pilots/env-manager/env-manager-contract-repair-artifact-v4-lock.json
```

### 3.10 V4 Frozen Development

Development lock 固定 `xty/gpt-5.6-sol`、Windows/clean/bare-agent、两个 task × 2
repetitions。正式运行前 route probe 为 ok；4 个预注册 generation 均写入 raw，其中 3 个
形成完整 shared-generation pre/post pair，Node run 1 在 generation 阶段发生 Bun 1.3.14
internal assertion crash，作为 infrastructure 和 missing pair 保留，不补跑。

| 口径 | Pre/check-only | Post/deterministic | 说明 |
|---|---:|---:|---|
| 完整 pair success | 3/3 | 3/3 | Binary success 没有翻转。 |
| 完整 pair mean | 0.90 | 1.00 | 同一 generation 平均 +0.10。 |
| `env-schema-rules` | 0/3 pass | 3/3 pass | 其余 15 个 criterion 保持 pass。 |
| Model repair | 0 | 0 | 三次均由 deterministic repair 完成。 |

完整行 tokens 合计 46409，均值 15469.67；model repair tokens 为 0；deterministic repair
耗时合计 230 ms，validation 合计 457 ms。冻结 gate 按全部 4 generation 计算：success
3/4、mean 0.75、hard-gate regression 0、infrastructure 1。Minimum successes 与 regression
条件通过，minimum mean 与 zero-infrastructure 条件失败，因此 gate failed，未运行 held-out。

这支持 V4 可在三个完整 development generation 上稳定完成 contract-bound deterministic
后处理，并改善 schema criterion/score；不支持 held-out 泛化、success-rate 增益或跨模型
稳定。唯一失败归因为 Bun runtime crash，不归为 skill semantic regression，但仍按预注册
规则让正式 gate 失败。

冻结结果随后通过独立 `env-manager-v4-bun-stability-diagnostic-v1` 做脱敏审计。诊断 lock
绑定原 raw、summary 和 gate digest，禁止 source rerun、retry、held-out 和 method-evidence
标记。4 个 source row 中只有 Node run 1 是 infrastructure；封闭分类为
`bun-internal-assertion`，Bun 版本 1.3.14，失败阶段 generation。当前没有新执行样本，因此
reproducibility 保持 `inconclusive`，不能据此断言崩溃稳定复现或已经修复。

Compact evidence：

```text
results/skill-ir/env-manager-contract-repair-v4-route-probe-2026-07-22/probe-results.jsonl
results/skill-ir/env-manager-contract-repair-v4-development-results-2026-07-22.jsonl
results/skill-ir/env-manager-contract-repair-v4-development-evidence-2026-07-22/summary.json
results/skill-ir/env-manager-contract-repair-v4-development-evidence-2026-07-22/failure-audit.jsonl
results/skill-ir/env-manager-contract-repair-v4-development-run-2026-07-22/development-gate-report.json
results/skill-ir/env-manager-v4-infrastructure-diagnostic-2026-07-22/report.json
benchmarks/skill-ir/pilots/env-manager/env-manager-v4-infrastructure-diagnostic-lock.json
```

## 4. 真实 Skill：Law-to-markdown

2026-07-23 冻结 `law-to-markdown-pre-ir-calibration-v1`：GPT-5.6、
Windows/clean/bare-agent、`no-skill | original`、2 个 development task × 2 repetitions。
资源与 route probe 均为 ok，8/8 rows 和 4/4 pairs 完整，0 infrastructure，未运行 held-out。

| System | Success | Mean | Aggregate tokens | 主要失败 |
|---|---:|---:|---:|---|
| no-skill | 0/4 | 0.70 | 38285 | document-policy 3/4；review-outcome 4/4。 |
| original | 0/4 | 0.75 | 121574 | document-policy 2/4；review-outcome 4/4。 |

4 个 pair 中 3 个 score/criterion vector 相同；standard task run 2 中 original 将
`law-document-policy` 从 fail 改为 pass，score 0.60→0.80。没有 negative delta，但两臂
binary success 均为 0/4。Original token 总量约为 no-skill 的 3.18 倍；当前只能记录成本，
不能声称 token 优化。

预注册 gate 的完整性、零 infrastructure、no-skill 非饱和和 distinguishability 条件均
通过，因此允许进入 source-audited base IR 构造。它不表示 original skill 成功，也不构成
Skill IR 方法增益、held-out、跨模型或跨环境证据。冻结 task/scorer/lock 不根据本结果修改。

Compact evidence：

```text
benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-pre-ir-calibration-lock.json
results/skill-ir/law-to-markdown-pre-ir-calibration-2026-07-23/resource-probe.json
results/skill-ir/law-to-markdown-pre-ir-calibration-2026-07-23/route-probe.json
results/skill-ir/law-to-markdown-pre-ir-calibration-2026-07-23/gate-report.json
results/skill-ir/law-to-markdown-pre-ir-calibration-2026-07-23/summary.json
```

### 4.1 Source-audited Static Development

同日按付费前提交的 `law-to-markdown-static-development-v1` 运行 GPT-5.6、
Windows/clean/bare-agent、`no-skill | original | ir-static`，2 个 development task × 2
repetitions。12/12 raw/scored rows、4/4 triplets 完整，0 infrastructure、0 retry，未运行
held-out。

| System | Success | Mean | Aggregate tokens | 主要失败 |
|---|---:|---:|---:|---|
| no-skill | 0/4 | 0.7000 | 40716 | document-policy 3/4；review-outcome 4/4。 |
| original | 1/4 | 0.7875 | 110893 | document-policy 2/4；review-outcome 3/4。 |
| ir-static | 1/4 | 0.7875 | 154249 | document-policy 1/4；review-outcome 4/4。 |

Original→static 的 4 个 pair 为 1 positive、1 negative、2 equal，mean score delta=0、binary
success delta=0。Static 改善一次 document-policy，同时回归一次 review-outcome；无 hard-gate
regression。Static 比 original 多 43356 aggregate tokens（+39.1%），本批不支持 token 效率收益。

冻结 gate 要求 static 至少 3/4 success、mean≥0.85、0 infrastructure、0 hard-gate
regression 和至少一个 improved pair。实际只有后 3 项通过，gate failed；不得补跑、进入
held-out、PGO、artifact promotion 或主 claim。

Failure audit 显示，bundled script 的公开源码定义了规范审核标签与固定字段，但 base IR
lowering 只保留“写明结论”的自然语言语义。四份 static 报告使用语义相近的措辞或 Markdown
强调，4/4 未命中 canonical review-outcome surface；另有 2 份报告记录 Windows bare-agent
通过 shell 调 bundled script 时遇到 `sh`/`ENOENT` 后改用人工执行。下一候选应从公开 script
编译 canonical report template/schema 与 direct interpreter tool plan，不能读取 evaluator
payload 或 held-out。

Compact evidence：

```text
benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-static-development-lock.json
results/skill-ir/law-to-markdown-static-development-2026-07-23/resource-probe.json
results/skill-ir/law-to-markdown-static-development-2026-07-23/route-probe.json
results/skill-ir/law-to-markdown-static-development-2026-07-23/gate-report.json
results/skill-ir/law-to-markdown-static-development-2026-07-23/summary.json
```

### 4.2 Validated Artifact 本地机制基线

2026-07-24 使用新 `validated-skill-artifact/v1` 和 Law compiler adapter，在 workspace Python
resource probe 通过后执行两个 development fixture。该路径直接调用 package 中 digest-bound
Python script，不经过 shell，也不调用模型。

| Task | Runtime validation | Deterministic scorer | Hard gate | Model tokens |
|---|---|---:|---:|---:|
| law statute development | pass | 0.85 / success | 0 fail | 0 |
| non-law standard development | pass | 1.00 / success | 0 fail | 0 |

法律任务保留 `law-document-policy` 一项失败，其余五项通过；非法律任务五项全部通过。初始
空 workdir 两个任务都不成功，执行后 score 严格提高。Package validator 同时确认 11 个
artifact、2 个 execution node 和 89463 bytes；gold-isolation canary、reverse-evidence、
byte-for-byte reproducibility、protected input 和 Windows 中文 validation path 均有自动测试。

随后冻结 `law-to-markdown-validated-artifact-development-v1`。2026-07-24 dry-run 为
16 行、4 个完整四元组、12 条模型计划、4 条 direct 计划和 0 held-out。免费 direct 臂按两个
development task × 2 repetition 实际执行：

| Task | Repetitions | Success | Mean | Model tokens |
|---|---:|---:|---:|---:|
| law statute development | 2 | 2/2 | 0.85 | 0 |
| non-law standard development | 2 | 2/2 | 1.00 | 0 |

四条 runtime 均为 complete；累计 deterministic process 840 ms、validation 159 ms，package
为 89463 bytes。执行中发现 Python 会在直接脚本目录生成 `__pycache__`，runtime 已改为临时
package execution snapshot；修复后重复执行未在冻结 package 留下 pyc/undeclared file。

该结果没有模型生成噪声，适合验证“把公开确定性能力固化为 artifact”以及重复执行隔离机制，
但在完整模型对照前只作为 mechanism baseline，不单独进入主 claim。

本地证据：

```text
benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-validated-artifact-development-lock.json
results/skill-ir/law-to-markdown-validated-artifact-development-dry-run-2026-07-24/plan.json
results/skill-ir/law-to-markdown-validated-artifact-development-artifact-arm-2026-07-24/
```

### 4.3 Validated Artifact 冻结 Development

同日先提交从属 `execution-freeze/v1`，绑定父 development lock、model runner、scoring、
route/resource probe、bare-agent 和 orchestration digest，再执行唯一一次 GPT-5.6
development。Route probe 为 ok；正式批次为 16/16 raw/scored rows、4/4 complete quartets、
0 infrastructure、0 retry 和 0 held-out。

| System | Success | Mean | Input tokens | Output tokens | Total tokens |
|---|---:|---:|---:|---:|---:|
| no-skill | 1/4 | 0.6875 | 31426 | 4078 | 35504 |
| original | 0/4 | 0.7500 | 105884 | 4365 | 110249 |
| ir-static | 1/4 | 0.8000 | 150136 | 5309 | 155445 |
| validated-artifact | 4/4 | 0.9250 | 0 | 0 | 0 |

逐匹配样本比较 artifact 与 `max(original, ir-static)`：

| Task / repetition | Best baseline | Artifact | Delta |
|---|---:|---:|---:|
| statute / 1 | 0.70 | 0.85 | +0.15 |
| statute / 2 | 0.70 | 0.85 | +0.15 |
| non-law / 1 | 0.80 | 1.00 | +0.20 |
| non-law / 2 | 1.00 | 1.00 | 0.00 |

Artifact 为 3 positive、1 equal、0 negative；4/4 success、0 hard-gate failure、0 pairwise
regression。法律 task mean 为 0.85，仍保留 heading-structure residual；非法律 task mean
为 1.00。冻结 gate 的完整性、质量、逐 task、基础设施、hard gate 和 pairwise 条件全部通过。

成本方面，模型三臂合计 301198 tokens；artifact 四次调用为 0 model token，deterministic
process 合计 734 ms、validation 160 ms、package 89463 bytes。该批次证明的是“冻结 package
在 development 上相对同批强模型 baseline 更稳定，并消除运行时模型生成 token”，还不能
证明总生命周期节省：compile cost 本批标为 preexisting，复用次数与质量 held-out 尚未测量，
所以 break-even 继续保持 `not-computed-quality-gate-pending`。

该 development gate 通过只允许起草新的 held-out lock。当前结果仍是单 skill、单模型、
单 context、单 Windows host；不支持跨模型、跨 skill、跨 agent/OS 稳定或 held-out 泛化。

Compact evidence：

```text
benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-validated-artifact-development-lock.json
benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-validated-artifact-execution-freeze.json
results/skill-ir/law-to-markdown-validated-artifact-development-run-2026-07-24/resource-probe.json
results/skill-ir/law-to-markdown-validated-artifact-development-run-2026-07-24/route-probe.json
results/skill-ir/law-to-markdown-validated-artifact-development-run-2026-07-24/scored-results.jsonl
results/skill-ir/law-to-markdown-validated-artifact-development-run-2026-07-24/gate-report.json
results/skill-ir/law-to-markdown-validated-artifact-development-run-2026-07-24/summary.json
```

### 4.5 Experimental-design 第二 Phenotype 本地基线

2026-07-24 使用同一 `validated-skill-artifact/v1` core 编译第二个真实 skill。Package 为
9 artifacts、2 execution nodes、33878 bytes；通用 catalog/runtime 源码没有新增
`experimental-design` 分支。两个 development fixture 的结果如下：

| Task phenotype | Runtime | Scorer | Hard gate | Model tokens |
|---|---|---:|---:|---:|
| individual + strata | pass | 1.00 / success | 0 fail | 0 |
| cluster assignment | pass | 1.00 / success | 0 fail | 0 |

输入 digest 在 process/validate 前后保持不变。Gold-isolation canary、held-out/law failure
隔离、reverse-evidence、byte reproducibility 和 seed-semantic mutation 均有自动测试。
该批没有调用 API，也没有 `no-skill/original/ir-static` 对照，因此仅为 mechanism evidence。
现有付费 orchestration 仍是 Law-specific；抽象并冻结新的通用 development lock 前，不生成
真实优化结论，不运行两个 held-out task，不计算 break-even。

2026-07-25 已把该阻断拆成独立 runnable baseline calibration：新增 skill-neutral lock、
planner/runner、route evidence 和 gate，旧 pre-IR/Law 文件与摘要不变。Experimental-design
实例的付费前矩阵为：

| Axis | Frozen value |
|---|---|
| Systems | no-skill / original |
| Tasks | 2 development |
| Repetitions | 2 |
| Rows / pairs | 8 / 4 |
| Model | xty/gpt-5.6-sol |
| Host/context/adapter | Windows / clean / bare-agent |
| Retries / held-out | 0 / 0 |

Lock-bound dry-run 验证为 8 rows、4 complete pairs、0 held-out，独立 stdlib Python resource
probe 和 GPT-5.6 route 均为 `ok`。唯一 calibration 的结果为：

| System | Success | Mean | Aggregate tokens |
|---|---:|---:|---:|
| no-skill | 0/4 | 0.30 | 45265 |
| original | 0/4 | 0.30 | 81822 |

8/8 rows、4/4 pairs、0 infrastructure，但 `differingPairs=0`，所以 gate failed。八行都通过
输入保护和三项产物存在，且都在 plan contract、assignment safety、allocation consistency、
report completeness 失败。

冻结后的 contract audit 确认：original 使用的 `SKILL.md` digest 与上游完全一致，prompt 是
无 replacement character 的 UTF-8。Scorer 要求的 plan schema version、四值 method enum、
xorshift32 唯一分配序列和逐字英文 report labels 没有在用户可见 prompt 中声明；上游脚本也
使用不同 RNG。因此本批被解释为 benchmark contract/scorer misalignment，不是模型或 skill
能力失败，本地 artifact 的 1.00 也不能升级成真实增益证据。不得补跑或修改当前
task/scorer/package；四臂 development 和 held-out 保持阻断。

Compact evidence：

```text
results/skill-ir/experimental-design-baseline-calibration-2026-07-25/
  resource-probe.json
  route-probe.json
  scored-results.jsonl
  gate-report.json
  summary.json
  failure-audit.json
```

### 4.4 Validated Artifact Held-out

Held-out lock 和数值 gate 先以提交 `a1b864f` 推送，再执行 route probe 与唯一正式批次。
矩阵为两个 held-out task × 两次 repetition × 四系统，共 16 行/4 四元组；模型臂零重试。
Resource 与 GPT-5.6 route 均为 ok，正式批次无 infrastructure。

| System | Success | Mean | Total tokens |
|---|---:|---:|---:|
| no-skill | 1/4 | 0.7875 | 46558 |
| original | 0/4 | 0.7500 | 105692 |
| ir-static | 2/4 | 0.8375 | 127938 |
| validated-artifact | 2/4 | 0.7250 | 0 |

Artifact 法规 task 两次均为 0.85/success；manual task 两次均为 0.60/failure。逐样本相对
`max(no-skill, original, ir-static)` 为 1 strict improvement、1 equal、2 regressions。
Artifact 没有 hard-gate failure，但只达到 2/4，整体/逐 task 均分和零回归条件均未通过，
所以 held-out gate failed。

失败审计显示 manual 输入虽然不是法律文本，却含“第一章/第一条”结构；冻结脚本将其判作
法律文档并输出“审核通过”，对应 `law-document-policy` 与 `law-review-outcome` 两项失败。
这是当前 package 的 task-boundary 泛化失败，不是基础设施或模型能力问题。该结果不允许
补跑、重编 package、调整 scorer，或把 held-out 内容回流为新规则。

模型三臂合计 280188 tokens；artifact deterministic process 740 ms、validation 166 ms、
package 89463 bytes。质量 gate 未过，break-even 继续不计算。

Compact evidence：

```text
benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-validated-artifact-heldout-lock.json
results/skill-ir/law-to-markdown-validated-artifact-heldout-run-2026-07-24/resource-probe.json
results/skill-ir/law-to-markdown-validated-artifact-heldout-run-2026-07-24/route-probe.json
results/skill-ir/law-to-markdown-validated-artifact-heldout-run-2026-07-24/scored-results.jsonl
results/skill-ir/law-to-markdown-validated-artifact-heldout-run-2026-07-24/gate-report.json
results/skill-ir/law-to-markdown-validated-artifact-heldout-run-2026-07-24/summary.json
```

## 5. Env-manager 研究推进总表

| 阶段 | 最强/候选系统 | Success | Mean | 核心发现 |
|---|---|---:|---:|---|
| Calibration | original | 0/4 | 0.5125 | 不优于 no-skill。 |
| Static | ir-static | 0/4 | 0.7000 | Partial correctness 和 hard gate 改善。 |
| Dual-source | repair v2 | 1/4 | 0.6375 | 单行成功但整体回归。 |
| Artifact v1 | one-repair | 0/4 | 0.7000 | Semantic false pass，repair 休眠。 |
| Semantic v2 | one-repair | 0/4 | 0.6250 | Repair 激活但二验失败。 |
| GPT-4.1 诊断 | check-only | 0/4 | 0.7000 | 基础质量提升，核心语义残差与系统平台期仍存在。 |
| Public-contract V3 | pre/post | 0/3 paired | 0.7000 | 共享生成 delta=0；repair 未修改产物，另有 1 infra。 |
| V4 offline repair replay | deterministic post | 3/3 replay；3/4 source | 1.0000 replay；0.7500 source | 三个可重放 snapshot 修复；1 infra 使 gate 继续失败。 |
| V4 frozen development | deterministic post | 3/4 gate；3/3 complete | 0.7500 gate；1.0000 complete | 完整 pair 0.90→1.00；1 Bun infra，gate failed。 |

## 6. 当前结论

可以支持：

- 真实 source/provenance/no-skill/scorer 链路成立；
- 静态 IR 有 partial correctness 信号；
- dual-source provenance 和 executable runtime 可运行；
- semantic validator 能把部分 v1 false pass 变成 repair-eligible failure；
- 模型能力会影响产物完整性与安全性，但不是当前全部失败的解释；
- V4 在三个完整 shared-generation 上以零模型 repair 将 schema criterion 0/3 提升到 3/3；
- development gate 正确阻断不成熟 artifact。
- `law-to-markdown` 的真实 source/no-skill/original/scorer 链路可执行且未饱和；pre-IR
  gate 允许进入 base IR audit；static development 链路完整，但 static 与 original 同为
  1/4、mean 0.7875，当前文本 IR 没有形成净收益；新 direct artifact 在冻结完整
  development 中达到 4/4、mean 0.925、0 pairwise regression 和 0 model token，gate passed；
  同一 package 在 held-out 降为 2/4、mean 0.725，并在 manual task 上两次回归，gate failed。

不能支持：

- held-out optimization；
- cross-model/cross-agent/cross-OS stability；
- 摊销 token reduction 或 break-even；
- 当前 Final IR/package 已成熟；
- arm mean difference 是 repair 因果增益。

## 7. 结果维护规则

1. 新实验继续写 compact `scored-results.jsonl`、CSV、summary 和 provenance。
2. 本文档追加一行/一节，不再新增单次 run Markdown。
3. Frozen result 不原地重算门禁；scorer bug 需要新结果 identity 或明确 amendment。
4. Raw/workdir 留本地，paper-grade case 可提交匿名 audit note。
5. 所有表格必须能从 `results/` 反向验证。

## 8. Wave A Benchmark Contract Audit

2026-07-25 在不修改 task、scorer、package、lock 或历史结果的前提下，对三个 Wave A pilot
执行 `skill-ir-benchmark-contract-audit/v1`。审计绑定 tasks/scorer/source digest，逐项检查
development criterion、hard gate、scorer source anchor、公开证据和等价实现 canary。

| Pilot | Static | Canary | 失败点 | Claim weight |
|---|---|---:|---|---|
| env-manager | failed | 0 | 两个 development task 均缺精确 schema rule 与分类成员金标的公开合同。 | support-real |
| law-to-markdown | passed | 0/2 matched | 法律与非法律分支的等价结论措辞都被逐字 scorer 拒绝。 | support-real |
| experimental-design | failed | 2/8 matched | plan 合同 2/2 通过；assignment、allocation、中文 report 6/6 被拒，另有四类私有 plan 约束。 | support-real |

这次审计改变的是证据解释，不是历史分数。Law 的 development gate pass 仍说明 package 与旧
scorer 的组合可运行；audit failure 说明该分数不能直接支撑“对公开 task 合同更稳定”。同理，
env-manager 的 repair 机制和 experimental-design 的 runner/resource 链路仍是有效工程证据，
但旧 benchmark 不能进入稳定性主 claim。

该审计按 requirement × development task 分支判定，不再把一个 task 的公开文本替另一个 task
证明合同。Experimental-design 的隔离 canary 同时说明问题并非“整个 scorer 都不可用”：
公开 plan 字段与 study 映射可接受两种任务的合法实现；失败集中在英文 `independent` 词面、
私有 xorshift32 序列、英文报告标签和未公开 plan schema/enum/mapping/strictness。

Compact evidence：

```text
benchmarks/skill-ir/pilots/env-manager/benchmark-contract-audit.json
benchmarks/skill-ir/pilots/law-to-markdown/benchmark-contract-audit.json
benchmarks/skill-ir/pilots/experimental-design/benchmark-contract-audit.json
results/skill-ir/benchmark-contract-audit/env-manager.json
results/skill-ir/benchmark-contract-audit/law-to-markdown.json
results/skill-ir/benchmark-contract-audit/experimental-design.json
```

本阶段没有 API 调用、没有 held-out、没有 scorer 调参。Experimental-design v1 继续冻结；
下一步若推进，先建立 benchmark v2 的单一公开合同、从合同派生 scorer，并让 canonical、
alternative-valid 和 invalid-control differential fixtures 全部通过书面评审。

## 9. Experimental-design v2 本地合同审计

2026-07-27 建立独立 v2 身份，不修改 v1 task、scorer、lock、package 或历史结果。Task split
先冻结 2 development + 2 held-out 及公开 source closure；随后实现五项 public-semantic
scorer，并只对 development 运行确定性 differential audit。

| Evidence | Result |
|---|---:|
| Fixture directories | 30 |
| Canonical / alternative / invalid / partial canaries | 42/42 matched |
| Report partial scores | 0 / 0.25 / 0.5 / 0.75 matched |
| Static audit | passed |
| Runtime differential audit | passed |
| API / baseline / IR / artifact / held-out run | 0 |

Audit 覆盖两个 development task 分支、八种 assignment×strata×sequential 组合、自由 method、
中英文正文、不同合法 allocation，以及 protected input、artifact、unit/arm、cluster、strata、
sequential、plan properties 和 report evidence 的负向控制。通用 audit runner 新增
`partial-control.expectedScore`，避免把 `pass=true, score<1` 错写成 criterion 满分。

随后以 audit 提交 `826de3b0178d964028eb9428c8e6d924eb1a4c52` 创建 held-out identity
freeze。它绑定 task-split、held-out task、scorer/registry 和 passed audit 的 Git bytes，
并为 development lock、compiler、package、feedback 提供 held-out ID/path/digest/sentinel
泄漏拒绝。该阶段证明的是 v2 benchmark 合同和隔离机制已通过本地审计，不证明模型能力、
Skill IR 增益、artifact 稳定性、跨 skill 泛化或 token 节省。

Compact evidence：

```text
benchmarks/skill-ir/pilots/experimental-design/v2/task-split-freeze.json
benchmarks/skill-ir/pilots/experimental-design/v2/benchmark-contract-audit.json
benchmarks/skill-ir/pilots/experimental-design/v2/heldout-freeze.json
results/skill-ir/benchmark-contract-audit/experimental-design-v2.json
```

## 10. Experimental-design 物化污染历史与 v2 修订

2026-07-27 曾以 `experimental-design-v3` 独立身份修复 root extra output 漏检，完成 46/46
development-only canary、held-out freeze 和付费前 lock v2。强模型固定为
`xty/gpt-5.6-sol`，矩阵为 `no-skill | original` × 2 development task × 2 repetitions，
Windows/clean、bare-agent、0 retries。

| Gate evidence | Result |
|---|---:|
| Rows / pairs | 8/8；4/4 |
| Infrastructure failures | 0 |
| No-skill semantic failures | 2 |
| Differing pairs | 3 |
| Mechanical gate | passed |
| Held-out / IR / artifact run | 0 |

系统表面分数为 no-skill 2/4 success、mean 0.50、22,035 tokens；original 0/4 success、
mean 0.40、61,484 tokens。该差异不能解释成 skill 负增益：post-run workdir audit 发现
`src/run/index.ts` 在 original agent 启动前把 source closure 复制到 workdir，产生
`LICENSE.upstream.md`、`references/`、`scripts/`；v3 root whitelist 将它们误判为模型额外
输出。三个实际进入 evaluator 的 original 行全部失败 `design-artifact-contract`，no-skill
没有同类预置项。

结论冻结为：真实链路、模型路由、scoring 与 gate 可运行；该批次存在 arm-dependent
materialization contamination，人工有效性审计否决 `baseIrAuditAllowed`。不运行 held-out，
不据此构造 IR/PGO/artifact，也不把 0.40/0.50 写进优化主 claim。

后续没有继续复制 v4，而是把有效机制合并回唯一活跃的 `experimental-design-v2`，以
`contractRevision=materialized-delta/v1` 标记兼容修订。当前 v2 已完成 external initial-workdir
manifest、final delta scorer、独立 oracle、42/42 contract canary、36/36 无模型 materialization
audit、task/held-out freeze 和 8-row dry-run。

Compact evidence：

```text
results/skill-ir/history/experimental-design-v3-materialization-contamination-2026-07-27.json
results/skill-ir/benchmark-contract-audit/experimental-design-v2-materialization.json
benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-pre-ir-calibration-lock.json
```

## 11. Experimental-design v2 Materialized-delta 真实校准

2026-07-27 按冻结 lock 执行 `xty/gpt-5.6-sol`、Windows/clean/bare-agent、
`no-skill | original`、2 development tasks × 2 repetitions、0 retries。Resource probe 与
120.5 秒 route probe 均通过，8 行 raw 完整写出。

初次 gate 错把非零退出码 3 当作 agent failure。Raw 审计确认三行 stderr 均为 Bun
`1.3.14` 的 `panic(main thread): Internal assertion failure`。新增 tasks-authored pilot 专用的
`--normalize-pre-ir-runtime`，不重写 raw，并在通用 scoring 前投影 infrastructure 状态；gate
同时只从可比较 pair 推断方向。历史冻结 runner/scoring、v2 task/evaluator/public contract、
阈值和 lock 均未修改。权威重评分如下：

| 项 | 结果 |
|---|---:|
| Rows / complete pairs | 8 / 4 |
| Infrastructure failures | 3 |
| Comparable pairs | 1 / 4 |
| Differing comparable pairs | 0 |
| No-skill observed success / mean | 2/4 / 0.50 |
| Original observed success / mean | 3/4 / 0.75 |
| Development gate | failed |

五个正常完成的行均得到 1.0；唯一可比较 pair 中两臂也均为 1.0。其余三对至少一臂 crash，
所以 0.50/0.75 和 23,625/54,659 reported tokens 只描述被 infrastructure 污染的总分母，
不能解释为 original 增益、回归或 token 效率差异。当前 `baseIrAuditAllowed=false`，未运行
held-out，也未构造 v2 base IR/artifact。

本批次不补跑失败行。后续先用新 calibration identity/lock 资格化稳定 SkVM execution runtime，
保持模型、任务、scorer 和 benchmark contract 不变，再完整重跑 8 行。该运行时重试仍属于 v2，
不会建立 v3/v4 benchmark。

Compact evidence：

```text
results/skill-ir/experimental-design-v2-materialized-delta-calibration-2026-07-27/summary.json
results/skill-ir/experimental-design-v2-materialized-delta-calibration-2026-07-27/failure-audit.json
results/skill-ir/experimental-design-v2-materialized-delta-calibration-2026-07-27/gate.json
results/skill-ir/experimental-design-v2-materialized-delta-calibration-2026-07-27/resource-probe.json
results/skill-ir/experimental-design-v2-materialized-delta-calibration-2026-07-27/route-probe.json
```

## 12. Experimental-design v2 Compiled-runtime Preflight

本阶段没有修改 v2 task、public contract、scorer、threshold 或 model。先对提交
`b34c130a44acd3971921946960816aec72d61958` 构建的 `skvm.exe` 做 20 次顺序 `--help`
资格探测，结果 20/20 通过、0 timeout、0 Bun crash。随后按不同 failure 原因冻结三个新
calibration identity，不覆盖前一份证据：

| Identity | 结果 | 解释 |
|---|---|---|
| compiled runtime | 239 ms、exit 1 | 默认 cache 看不到项目 `xty/*` route；API 前阻断。 |
| config-bound | parent env 未传给 child | 证明 cache locator 仅在父进程设置不足。 |
| explicit-child-env | resource ok；route 56.79 s、exit 3、`agent` | 真实 route 启动但未成功完成。 |

最终 lock 绑定 qualified binary/report、`.skvm` cache root，以及 pre-IR planner、route probe、
agent executor 三份 orchestration digest。它生成了 8-row/4-pair dry-run，但 route 未过，故完整
矩阵、raw、scoring 与 gate 均未执行。任务产物创建数为 0；compact route 不保留 stderr/模型
正文，当前只能归因为 `unresolved-agent-or-runtime-exit`。该结果不支持 skill 效果、模型能力、
token 效率或 benchmark 优劣结论，`baseIrAuditAllowed=false`，held-out 继续禁止。

Compact evidence：

```text
results/skill-ir/experimental-design-v2-runtime-qualification-2026-07-27.json
results/skill-ir/experimental-design-v2-explicit-child-env-calibration-2026-07-27/resource-probe.json
results/skill-ir/experimental-design-v2-explicit-child-env-calibration-2026-07-27/route-probe.json
results/skill-ir/experimental-design-v2-explicit-child-env-calibration-2026-07-27/summary.json
results/skill-ir/experimental-design-v2-explicit-child-env-calibration-2026-07-27/failure-audit.json
```

## 13. Bun 1.3.14 Fetch-active Root-cause Probe

为区分 gateway、adapter 与 runtime，另复制同一公开 task、真实 skill closure 和初始 workdir，
使用同一 `skvm.exe`、`.skvm` route 和 `xty/gpt-5.6-sol` 做一次不进入 benchmark 分母的诊断。
进程运行 158.734 秒后 exit 3、未超时、0/3 目标产物；stderr 明确给出 Bun 1.3.14 Windows x64、
`fetch(11)`、`panic(main thread): Internal assertion failure` 和 `Bun has crashed`。

这将上一节的 `unresolved-agent-or-runtime-exit` 收敛为 Bun runtime crash family。它不能说明模型
能力不足、Skill 无效或 v2 scorer 失败。旧 20×`--help` 资格只能证明 startup 稳定，不能覆盖
真实 fetch/agent loop。后续候选必须再通过 fetch-active route qualification，才允许建立新的
8-row calibration identity。

Compact evidence：

```text
results/skill-ir/experimental-design-v2-root-cause-probe-2026-07-27.json
```

## 14. Bun 1.3.13 Fetch-qualified 真实校准

官方 canary 1.4.0 在含中文路径与 ASCII 映射盘下均无法完成 Windows standalone compile；这属于
构建候选失败，没有调用 API。随后将官方 Bun 1.3.13 pin 到纯 ASCII 本地目录，成功构建独立
`skvm.exe`，并通过 20/20 startup 与唯一一条 `xty/gpt-5.6-sol` fetch-active route（exit 0、
88.174 秒、3/3 outputs）。新 fetch-qualified lock 绑定了候选 lock/report 与当前 parent
orchestration，之后执行独立 8-row identity。

| 项 | 结果 |
|---|---:|
| Rows / complete pairs | 8 / 4 |
| Infrastructure failures | 2 |
| Comparable pairs | 2 / 4 |
| Differing comparable pairs | 2 |
| Comparable score deltas | +0.3 / -0.3 |
| No-skill observed success / mean | 2/4 / 0.675 |
| Original observed success / mean | 1/4 / 0.65 |
| Development gate | failed |

两条失败分别来自 stratified task 的 no-skill run 1 和 original run 2，均为 Bun 1.3.13 Windows
x64 `fetch` internal assertion、exit 3；不是 Skill/scorer/model semantic failure。两个可比较 pair
一正一负，因此 `originalDirection=mixed`，不能从聚合均值或 40,063/75,333 reported tokens 推断
Skill 效果或效率。`baseIrAuditAllowed=false`，held-out 未执行，同一 identity 不补跑。

下一阶段不继续筛选 Bun patch version，而开发摘要绑定的外部 Node HTTP helper，只替换
OpenAI-compatible 网络传输。它通过协议测试与单 route qualification 前，不建立新 8-row lock。

Compact evidence：

```text
results/skill-ir/experimental-design-v2-bun-1.3.13-startup-qualification-2026-07-27.json
results/skill-ir/experimental-design-v2-bun-1.3.13-fetch-active-qualification-2026-07-27.json
results/skill-ir/experimental-design-v2-bun-1.3.13-calibration-2026-07-27/resource-probe.json
results/skill-ir/experimental-design-v2-bun-1.3.13-calibration-2026-07-27/route-probe.json
results/skill-ir/experimental-design-v2-bun-1.3.13-calibration-2026-07-27/gate.json
results/skill-ir/experimental-design-v2-bun-1.3.13-calibration-2026-07-27/summary.json
```

## 15. Node HTTP Transport 真实校准

在不修改 v2 task、scorer、model、threshold 和 matrix 的前提下，新 provider seam 只把
OpenAI-compatible HTTP 请求移到 Node helper。API key 通过 stdin envelope 传递，不进入 argv；
helper、Node executable、compiled SkVM、startup/fetch qualification 与 parent orchestration 均由
新 lock 绑定。协议测试、20/20 startup、单条 fetch-active route 和最终 route preflight 全部通过。

| 项 | 结果 |
|---|---:|
| Rows / complete pairs | 8 / 4 |
| Infrastructure failures | 2 |
| Comparable pairs | 2 / 4 |
| Differing comparable pairs | 0 |
| Comparable score deltas | 0 / 0 |
| No-skill observed success / mean | 3/4 / 0.75 |
| Original observed success / mean | 2/4 / 0.675 |
| Development gate | failed |

两条 cluster-sequential 行仍触发 Bun 1.3.13 Windows x64 internal assertion，exit 3。与旧矩阵相比，
stderr 不再含 `fetch(n)` counter，转而记录 `spawn(9)` / `spawn(12)`，但 crash report signature
相同。这说明远端 HTTP 已成功隔离，却不足以让 compiled standalone agent loop 稳定；不能将其
解释为模型或 Skill 失败。两个可比较 pair 都在 stratified task 上饱和为 1.0，因此也没有提供
original/no-skill 区分度。Gate failed，base IR 与 held-out 继续禁止，同一 identity 不补跑。

Compact evidence：

```text
results/skill-ir/experimental-design-v2-node-http-bun-1.3.13-startup-qualification-2026-07-27.json
results/skill-ir/experimental-design-v2-node-http-fetch-active-qualification-2026-07-27.json
results/skill-ir/experimental-design-v2-node-http-calibration-2026-07-27/resource-probe.json
results/skill-ir/experimental-design-v2-node-http-calibration-2026-07-27/route-probe.json
results/skill-ir/experimental-design-v2-node-http-calibration-2026-07-27/gate.json
results/skill-ir/experimental-design-v2-node-http-calibration-2026-07-27/summary.json
```

### Source-runtime qualification（不进入实验分母）

保留同一 Node helper、模型、task 和 original skill，只把 compiled standalone 改为官方 Bun
1.3.13 直接运行 committed `src/index.ts`。从临时 ASCII 根执行后，20/20 startup 通过；唯一
fetch-active route 也通过，`failureCode=none`、公开输出完整。该结果支持“compiled standalone
是当前主要 runtime 风险”的诊断，但不是 Skill 效果或强模型能力结果。下一步必须建立独立
source fetch-qualified 8-row lock，重新走 preflight 和零 infrastructure gate。

```text
results/skill-ir/experimental-design-v2-source-runtime-qualification-2026-07-27.json
results/skill-ir/experimental-design-v2-node-http-source-fetch-active-qualification-2026-07-27.json
```

## 16. Source Runtime 最终 Preflight 与 v1/v2 定量判断

Source candidate 通过后建立了独立最终 lock，模型仍为 `xty/gpt-5.6-sol`。8-row plan 与 resource
probe 均通过；最终 route 在 88.083 秒后 exit 3、未超时。三个公开输出都已生成，但 route compact
evidence 没有 stream failure fingerprint，因此只冻结为“产物生成后的未解析 agent/runtime 非零
退出”。本轮没有执行 8-row matrix、raw/scoring/gate、base IR 或 held-out。

v1/v2 测量合同的量化差异为：

| 指标 | v1 | v2 | 变化 |
|---|---:|---:|---:|
| Contract canary matched | 2/8 (25%) | 42/42 (100%) | +75 pp |
| Canary 数量 | 8 | 42 | 5.25x |
| 私有 exact-contract issue | 8 | 0 | -8 |
| Hard gates / task | 3/6 | 5/5 | +2 个；全部语义面受保护 |
| Pass threshold | 0.85 | 0.95 | +0.10 |
| Materialization checks | 0 | 36/36 | +36 |

所以 v2 已能被称为“本地测量合同更可信”，还不能被称为“真实区分度更高”或“Skill 优化更好”。
v1 的 8 行可以无基础设施故障跑完，但 0.30/0.30 来自未公开 schema/enum/唯一 schedule/报告
字面量约束；运行顺利不等于测量有效。v2 移除这些私有金标后，已完成的正常行又多次饱和到
1.0，同时 Windows Bun agent loop 产生基础设施故障，两件事共同阻止了有效 baseline。

三次完整 v2 calibration 的 infrastructure failure 依次为 3/8、2/8、2/8；可比较 pair 为
1/4、2/4、2/4。第二批 pair delta 为 `+0.3/-0.3`，第三批为 `0/0`，都不能给出稳定 original
方向。最终 source identity 连矩阵前 route gate 都未通过。因此当前 v2 的 task/scorer/audit 可用，
真实优化评估尚不可用。

Compact evidence：

```text
results/skill-ir/experimental-design-v2-node-http-source-calibration-2026-07-27/summary.json
results/skill-ir/experimental-design-v2-node-http-source-calibration-2026-07-27/failure-audit.json
results/skill-ir/experimental-design-v2-benchmark-comparison-2026-07-27.json
```

## 17. Source Route Diagnostic Closure 与完整矩阵

2026-07-28 在不增加 Bun/transport/runtime 版本的前提下，把 fetch-active 的封闭诊断接入最终
source route。新 route 通过：67.358 秒、exit 0、`failureCode=none`、3/3 output；相较上一 identity
的 exit 3 unresolved，本轮可以按预注册规则执行一次完整矩阵。

| 项 | 结果 |
|---|---:|
| Rows / complete pairs | 8 / 4 |
| Infrastructure failures | 4 |
| Comparable pairs | 1 / 4 |
| Differing comparable pairs | 1 |
| Comparable score delta | -0.75 |
| No-skill observed success / mean | 2/4 / 0.525 |
| Original observed success / mean | 0/4 / 0.0625 |
| Development gate | failed |

四个 infrastructure 行全部由 compact audit 归为 Bun internal assertion，且跨 no-skill/original
出现；三行未生成公开输出，一行只生成 1/3。唯一可比较 pair 是 stratified task 的第二次重复，
no-skill=1.0、original=0.25，因此 direction=`worse`。样本只有一对，不能据此下 Skill 效果结论。

No-skill 记录的 58,342 token 来自能返回 usage 的行，original 的 20,208 token 只来自一个正常
退出行；基础设施失败行没有同口径 usage，不能比较 token 效率。本 identity 冻结，不补跑、不进入
base IR 或 held-out。下一步转向 v1-style source runner 边界审计，不再枚举 runtime 版本。

Compact evidence：

```text
results/skill-ir/experimental-design-v2-source-route-diagnostic-calibration-2026-07-28/resource-probe.json
results/skill-ir/experimental-design-v2-source-route-diagnostic-calibration-2026-07-28/route-probe.json
results/skill-ir/experimental-design-v2-source-route-diagnostic-calibration-2026-07-28/route-diagnostic.json
results/skill-ir/experimental-design-v2-source-route-diagnostic-calibration-2026-07-28/gate.json
results/skill-ir/experimental-design-v2-source-route-diagnostic-calibration-2026-07-28/summary.json
results/skill-ir/experimental-design-v2-source-route-diagnostic-calibration-2026-07-28/failure-audit.json
```

## 18. Wave A 当前量化总览

| Skill / 阶段 | 优化前 | 当前最好结果 | Gate / 解释 |
|---|---|---|---|
| env-manager V4 development | complete pair pre 3/3、mean 0.90 | post 3/3、mean 1.00；schema 0/3→3/3 | 固定分母 3/4、mean 0.75、1 infra，gate failed |
| law-to-markdown development | original 0/4、0.75；static 1/4、0.80 | artifact 4/4、0.925；3 positive / 1 equal / 0 negative | gate passed；artifact runtime 0 model token |
| law-to-markdown held-out | best model arm static 2/4、0.8375 | artifact 2/4、0.725 | 1 positive / 1 equal / 2 regressions，gate failed |
| experimental-design v1 | no-skill=original=0/4、0.30 | local artifact 曾为 1.00 | benchmark contract failed，分数不进主 claim |
| experimental-design v2 | contract 42/42、materialization 36/36 | 尚无有效 no-skill/original baseline | runtime/preflight 阻断，未开始 IR/artifact |

Wave A 因而只在 Law development 形成完整正向结果；Law held-out 暴露 task-boundary 回归，Env
只有 shared-generation complete-pair 改善但固定 gate 未过，Experimental-design 只有 benchmark
机制证据。Token 方面，Law artifact 的四次 development runtime 为 0 model token，模型三臂同批
合计 301198 token；但 compile/package/profile 成本未按 `N=1,2,5,10` 统一摊销，仍不能声称总
token 已降低或计算 break-even。

## 19. Benchmark v2 Dominance 与当前 Skill 优化状态

新增可复算分析器消费 v1/v2 contract audit、v2 materialization audit、两轮 calibration gate/plan/raw
以及 Env/Law compact summary，生成：

```text
results/skill-ir/benchmark-and-optimization-evidence-2026-07-29.json
```

| 测量合同指标 | v1 | v2 | 判定 |
|---|---:|---:|---|
| Canary matched | 2/8 (25%) | 42/42 (100%) | v2 严格改善 |
| Alternative-valid false rejection | 6 | 0 | v2 严格改善 |
| Private exact-contract issue | 8 | 0 | v2 严格改善 |
| Workdir materialization checks | 0 | 36/36 | v2 严格改善 |

所有测量维度无回归且至少一项严格改善，报告因此给出
`v2-measurement-contract-dominates`。这比原先手写 comparison 更强：结论由冻结源文件和 SHA-256
机械生成，证据漂移会 fail closed。

Operational 维度仍不可比。v1 真实轮 0 infrastructure / 4 comparable pairs，但 scorer contract
failed；v2 最新轮 4 infrastructure / 1 comparable pair。Runner 审计确认两者共享
`real-agent-run.ts` 和 `bare-agent`，差异集中在 command entry、initial manifest 与 Node helper；
当前只能冻结为 `runner-only-cause-not-established`，不进行付费补跑。

当前 Skill ledger 为：Env 有 3 个 complete pair 的 deterministic repair 正向机制信号但 gate failed；
Law development gate passed，held-out 相对 static 从 0.8375 降到 0.725 且 gate failed；Experimental
Design v2 的测量合同通过，真实 baseline 仍 blocked、尚未开始 base IR。项目总体状态为
`partial-mechanism-evidence`，完整跨 Skill 稳定性、held-out 泛化和 token break-even 仍未证明。

## 20. Source-process Replay 基础设施诊断

2026-07-29 使用 Bun 1.3.13 source entry、既有 Node HTTP helper、`bare-agent` 与本地固定
OpenAI-compatible responder 完成无 API replay。每行经过 5 次 provider request、并行读取、三个
并行 shell/Node command、三个并行输出写入、回读与正常结束；两臂各 10 次顺序执行。

| System | Rows | Exit 0 | Protocol complete | 3/3 outputs | Failure | Median |
|---|---:|---:|---:|---:|---:|---:|
| no-skill | 10 | 10 | 10 | 10 | 0 | 577.8 ms |
| original | 10 | 10 | 10 | 10 | 0 | 597.4 ms |
| total | 20 | 20 | 20 | 20 | 0 | 分臂报告 |

总计 0 timeout、0 nonzero exit、0 Bun internal assertion。Compact report 位于：

```text
results/skill-ir/experimental-design-v2-source-process-replay-2026-07-29.json
```

该结果否定“source runner、Node helper、bare-agent 或多轮 spawn 组合本身必然失败”的假设，但不
解释真实矩阵的四个 crash。固定 replay 每行约 0.6 秒，真实成功行约 60–220 秒且工具轨迹自由；
四个 crash session 没有 finalize conversation log。下一诊断应只从既有日志提取 tool/provider call
数量、类型、时延和完成边界，不保存正文，也不把 replay pass 当成付费重跑许可或 Skill 结果。

## 21. Trajectory Shape / Latency 审计

2026-07-29 对上一轮冻结 8-row source matrix 的 raw、plan、session index 和 finalized conversation
做隐私化投影。Route session 明确排除；8 行 session 映射全部通过，已完成行的映射时长差为
16--154 ms。结果如下：

| 指标 | 历史成功行 | Deterministic replay | 覆盖 |
|---|---:|---:|---:|
| 可观察行 | 4 | 20 | 仅比较 envelope |
| Response / row | 6--16 | 5 | 否 |
| Max tool calls / row | 23 | 11 | 否 |
| Max tool fan-out | 6 | 3 | 否 |
| Max end-to-end duration | 220.124 s | 0.674 s | 否 |
| Max single provider response | 26.783 s | loopback，不可同口径比较 | 否 |

四条 Bun assertion 行均只有 running session、没有 finalized conversation，报告明确保存为
`trajectoryAvailable=false` / `session-not-finalized`，没有把缺失轨迹写成零调用。成功行中最长一条
有 16 次 response、23 个 tool call；provider duration total 与 raw duration 接近，说明正常完成行
的大部分 wall time 位于 provider turns，但不能由此推断 crash 行卡在哪一轮。

Compact evidence：

```text
results/skill-ir/experimental-design-v2-trajectory-shape-audit-2026-07-29.json
```

结论为 `deterministic-replay-does-not-cover-observed-success-envelope`。上一 replay 仍是有效的短轨迹
基础设施证据，但不足以代表真实成功负载。下一步冻结一条 16-response、23-tool、fan-out 6、总时长
不少于 220.124 秒的无 API replay；本结果不放行付费 calibration，不改变 Skill evidence ledger。

## 22. Delayed / High-fan-out Source-process Replay

2026-07-29 使用相同 Bun 1.3.13 source entry、Node HTTP helper、`bare-agent` 和 tool executor，执行
两臂各一条、顺序运行的无 API replay。公开 schedule 为 16 response、23 tool、fan-out 6、provider
wait 221 秒；单行门槛为 wall-clock 不少于历史成功上界 220.124 秒。

| System | Duration | Responses | Tools | Fan-out | Outputs | Result |
|---|---:|---:|---:|---:|---:|---|
| no-skill | 222.625 s | 16 | 23 | 6 | 3/3 | exit 0 |
| original | 222.535 s | 16 | 23 | 6 | 3/3 | exit 0 |

两行均 protocol complete，0 timeout、0 Bun assertion、0 nonzero；response/tool/fan-out/configured
delay/wall-clock/successful envelope 六项 coverage 全 true。Compact evidence：

```text
results/skill-ir/experimental-design-v2-delayed-source-process-replay-2026-07-29.json
```

这说明已观察成功行的轮次数、工具总量、最大并发宽度和运行时长本身不会在确定性 replay 中触发
crash。它没有重建历史 crash 前的自由模型 response、工具参数或非确定时序，因而仍不是模型、Skill、
benchmark 或 token 证据，也不放行付费 matrix。下一阶段先实现逐事件同步落盘、无正文的 runtime
trace，再考虑一条新的真实 route diagnostic。

## 23. Durable Trace 单路由诊断

2026-07-29 先以 `delayScale=0` 完成本地 trace 接线验证：no-skill/original 两段各 80 个连续事件，
共 160 个；每段均有 16 request/response、15 tool batch、16 turn-end 和 completed finalize。该结果不
重复 delayed replay 的时长证据，只证明同步 writer 与 agent-loop 边界接线成立。

随后执行预注册的唯一真实 route：

```text
original × experimental-design-v2-cluster-sequential-dev-002
clean × Windows × xty/gpt-5.6-sol × bare-agent × run 1
retries 0, outer watchdog 180 s
```

| Duration | Requests | Responses | Closed tool batches | Turn ends | Last event | Outputs |
|---:|---:|---:|---:|---:|---|---:|
| 180.254 s | 10 | 9 | 9 | 9 | turn 10 provider-request-start | 0/3 |

Trace 有 47 个连续事件、无 finalize；stderr 为 0 bytes，没有观察到 Bun assertion。第 9 轮在
179.649 秒闭合，第 10 轮请求刚写入约 0.6 秒后被终止。Materialized task 的内部 timeout 为 300 秒、
max steps 30，外层 watchdog 只有 180 秒，因此本轮 infrastructure failure 明确归为
`outer-watchdog-shorter-than-task-budget`。它既不是 Skill/benchmark/model 结果，也不能证明 provider
卡死或历史 Bun crash 已解决。

Compact evidence：

```text
results/skill-ir/experimental-design-v2-durable-runtime-trace-validation-2026-07-29.json
results/skill-ir/experimental-design-v2-durable-runtime-trace-route-2026-07-29/route-report.json
```

该 lock 已冻结，不提高 timeout 后重跑；8-row matrix 仍未放行。后续稳定 harness 或新 route 合同
必须在付费前验证外层 watchdog 覆盖 task timeout 与 teardown grace，并停止继续增加 Bun/runtime 版本。

## 24. Stable Pi Harness 与强模型 Baseline

2026-07-29 使用项目本地 Pi 0.67.68、managed XTY route 和 `gpt-5.6-sol`。首次 qualification 前的
本地检查修复了 Windows version stream 与 Unix `which` 依赖。Qualification 通过后，首次 8-row
matrix 暴露 Pi inject 留下 `AGENTS.md`；四条 original 均因同一 `UNEXPECTED_ENTRY` 丢失
artifact-contract 0.1。该矩阵已标记 invalid，只作为 harness failure evidence。

Adapter 改为 subprocess 周期内注入并在结束后删除/恢复 `AGENTS.md`，新 lock 额外绑定 adapter 与
orchestration digest。修复后 qualification：Pi/version/resource 均通过，route exit 0、84.058 秒、
3/3 outputs、零 harness residue。随后固定 8 行结果为：

| System | Rows | Success | Mean score | Mean latency | Input tokens | Output tokens | Total tokens |
|---|---:|---:|---:|---:|---:|---:|---:|
| no-skill | 4 | 4 | 1.00 | 60.933 s | 44,943 | 8,669 | 53,612 |
| original | 4 | 4 | 1.00 | 83.734 s | 164,615 | 11,961 | 176,576 |

8/8 rows、4/4 pairs、0 infrastructure、4 comparable pairs，但 differing pairs 为 0；no-skill semantic
failure 也是 0。Gate 因 `noSkillNonSaturated=false` 与 `distinguishable=false` 失败。Original 相比
no-skill 使用 3.29x aggregate token、3.66x input token 和 1.37x latency，没有质量增益。

Compact evidence：

```text
results/skill-ir/experimental-design-v2-pi-calibration-2026-07-29/invalidation-audit.json
results/skill-ir/experimental-design-v2-pi-post-cleanup-2026-07-29/qualification.json
results/skill-ir/experimental-design-v2-pi-post-cleanup-2026-07-29/gate-report.json
results/skill-ir/experimental-design-v2-pi-post-cleanup-2026-07-29/calibration-analysis.json
```

结论：stable Pi harness 已经足以支撑本阶段的受控实验；当前阻塞不再是 Bun/runtime，而是这两个公开
development task 对强模型过易。该结果不放行 base IR、held-out 或 Skill optimization claim。下一步应
在不消费 held-out 的前提下，新增能区分 no-skill/original 且仍由公开合同确定性判分的 harder
development tasks，再重新预注册 calibration。

## 25. Strong-model Harder Development Calibration

2026-07-31 在旧 v2 2+2 split、held-out 和 scorer 保持字节不变的前提下，新增两个 development-only
任务：3-arm individual+strata+sequential 与 4-arm cluster+strata+sequential，均含 full/partial block
和 analysis-unit difference。付费前 saturation audit、12/12 differential cases、36/36 production
materialization checks、lock 与 8-row dry-run 全部通过。

Qualification 使用 original 的 4-arm cluster 任务，route 195.693 秒、exit 0、runStatus ok、3/3 outputs、
零 harness residue。随后唯一矩阵结果为：

| System | Rows | Success | Mean score | Mean latency | Input tokens | Output tokens | Total tokens |
|---|---:|---:|---:|---:|---:|---:|---:|
| no-skill | 4 | 4 | 1.00 | 94.106 s | 63,424 | 13,242 | 76,666 |
| original | 4 | 4 | 1.00 | 102.142 s | 153,185 | 14,373 | 167,558 |

8/8 rows、4/4 pairs、0 infrastructure、4 comparable pairs，但 0 differing pair；五项 criterion 在所有
行都通过。Gate 仍因 `noSkillNonSaturated=false` 与 `distinguishable=false` 失败。Original 相比 no-skill
为 2.1856x aggregate token、2.4153x input token 和 1.0854x latency，没有质量增益。

相对上一批较简单任务，no-skill 平均 latency 上升到 1.5444x、aggregate token 上升到 1.43x，
original 分别为 1.2198x 与 0.9489x，但语义区分度仍为 0。说明本轮增加了计算负担，没有增加可测
Skill 依赖。base IR、held-out 和 optimization claim 继续禁止。

Compact evidence：

```text
results/skill-ir/experimental-design-v2-harder-pi-calibration-2026-07-31/qualification.json
results/skill-ir/experimental-design-v2-harder-pi-calibration-2026-07-31/gate-report.json
results/skill-ir/experimental-design-v2-harder-pi-calibration-2026-07-31/calibration-analysis.json
```

下一步不是继续增加 arm 或 runtime 版本，而是先审计用户可见 `design-contract.json` 是否已经提供了
足以替代原 skill 的操作配方。该原因目前只是待验证假设，不从本轮满分结果直接推出。

## 26. Public Contract Task Sufficiency 结果

2026-07-31 的 Task 16.20 audit 只消费两批冻结 development compact analysis、development prompt、
公开合同、scorer public projection 和原 skill/source closure；没有读取 held-out 或 raw model text。

| 指标 | 结果 |
|---|---:|
| Bound inputs / source closure files | 15 / 8 |
| Saturated analyses / comparable pairs | 2 / 8 |
| Differing pairs | 0 |
| Instructions | 19 |
| Scorer-required publicly disclosed | 13/13 |
| Public rules duplicating skill guidance | 4 |
| Skill-incremental knowledge measured | 0/6 |
| No-skill operational coverage | 1.0 |
| Skill-incremental measurement coverage | 0.0 |

这给两轮满分提供了比“模型太强”更具体的解释：当前 scorer 要求的全部操作面都已经公开给
no-skill，原 skill 独有的设计知识又没有进入确定性成功定义。它仍不能证明模型因果，也不能说明
原 skill 或旧 IR 没有价值。结论只适用于当前 experimental-design v2 development surface。

Compact evidence：

```text
results/skill-ir/experimental-design-v2-public-contract-task-sufficiency-audit-2026-07-31.json
```

当前 decision 为 `move-to-skill-unique-deterministic-capability`。下一轮先书面定义 task-visible
interface 与 source-derived semantic oracle，再重新校准 no-skill/original。区分度 gate 通过后才
构造同版本 base IR、加入 ir-static，并用 original/static development residual 生成 Final IR/artifact。
Env/Law 的历史 IR 与 artifact 数值继续保留，但不能与新 benchmark 分数混算。

## 27. Skill-unique Semantic Surface 本地机制结果

2026-07-31 在 scorer 实现前先提交 2 development + 2 held-out split、public interface 与 source digest
freeze。新 capability slice 复用同一真实 experimental-design source，不计为新 pilot，不修改旧 v2
task/scorer/lock/result，也没有 `irPath`。

本轮只测两个旧 scorer 未覆盖的 source claim：independent replication/pseudoreplication 与
analysis-design alignment。Deterministic oracle 从 agent 可见的 study graph 推导 replicate、measurement、
risk 和 lineage；允许 aggregate-to-replicate 与 lower-level hierarchical 两族合法解，不比较方法名、
解释语言或字段顺序。

| Local audit | Result |
|---|---:|
| Development tasks / cases | 2 / 18 |
| Differential matched | 18/18 |
| Canonical + alternative-valid | 4/4 accepted |
| Semantic/file invalid controls | 14/14 rejected |
| Materialization arms / checks | 4 / 36 |
| Materialization passed | 36/36 |
| Reverse-evidence / leak checks | all passed |

Compact evidence：

```text
results/skill-ir/experimental-design-skill-unique-contract-audit-2026-07-31.json
results/skill-ir/experimental-design-skill-unique-materialization-audit-2026-07-31.json
```

这只证明新测量合同、本地 scorer 和 no-skill/original 物化边界可用。尚未调用模型，不能声称 original
有增益、base IR 可入场或新 surface 优于强模型。下一步先冻结同一 strong-model 8-row calibration；
若 no-skill 仍饱和或 0 differing pair，按停止规则转 Wave B，不再新增 harder experimental-design task。

## 28. Skill-unique Pi Qualification 基础设施失败

2026-07-31 在付费前冻结 `xty/gpt-5.6-sol`、Pi 0.67.68、Windows/clean、2 development tasks x
`no-skill | original` x 2 repetitions 的 8-row method lock。Dry-run 为 8 rows、4 complete pairs，
original 4/4 注入 exact source，no-skill 0/4 注入；未读取 held-out。

三次 qualification 都在 API 请求前结束：

| Attempt | Execution boundary | Result |
|---|---|---|
| package script | `bun run skvm` + Unicode repo path | 151ms，Pi path mojibake，0/2 outputs |
| source entrypoint | Bun 1.3.14 + `src/index.ts` | 139ms，child PATH 中 Pi path mojibake，0/2 outputs |
| source + ASCII junction | 正确 ASCII `node_modules/.bin/pi.exe` | 130ms，Bun `uv_spawn` ENOENT，0/2 outputs |

最终尝试的 local Pi version 与 resource probe 均通过，route exit 1，零 harness residue。正确 ASCII
路径已经进入 child command，但 Bun 仍无法 spawn 该 junction shim；因此本轮只能归类为
infrastructure qualification failure，不能归因于模型、skill、benchmark、scorer 或 token 成本。

Compact evidence：

```text
results/skill-ir/experimental-design-skill-unique-pi-calibration-ascii-2026-07-31/qualification.json
```

8-row matrix 没有启动，gate 没有计算，base IR/held-out 继续阻断。按预注册停止规则，当前 harness
冻结，不再追加第四个路径补丁。下一步先以无 API standalone probe 评审直接 Node/package CLI
execution boundary；失败则转用已经证明稳定的 harness/Wave B。

## 29. Direct Node Pi Package 无 API Probe

2026-07-31 使用 Bun parent 的真实 `runSubprocess`，在含中文的临时 cwd 中以系统 Node 直接启动已安装
Pi package 的 `dist/cli.js --version`。结果为 Node v23.8.0、Pi 0.67.68、exit 0、非 timeout、821ms，
command 不经过 `.bin` 或 junction。

```text
results/skill-ir/pi-package-execution-probe-2026-07-31.json
```

逆向测试覆盖缺 Node/CLI、版本漂移、timeout 和双流版本异常。报告不含绝对路径或 raw streams。它证明
新的 child-spawn 边界在当前 Windows/Unicode 环境可用，只允许构造新 execution lock；API、route、
8-row matrix、scorer 和 skill 效果仍未发生。

## 30. Direct CLI Qualification 与 Windows 路径根因

首个 direct-cli qualification 已正确选择系统 Node 和 Pi `dist/cli.js`：local Pi 0.67.68、resource probe
均通过，但 route 在 117ms 内 `uv_spawn ENOENT`，0/2 outputs。它仍发生在 API 请求前。

```text
results/skill-ir/experimental-design-skill-unique-pi-direct-cli-run-2026-07-31/qualification.json
```

最小对照使用相同 `Bun.spawn(node --version)`：真实 qualification cwd 存在且长度 265，稳定复现
ENOENT；短 cwd exit 0，旧 stable harness 对应路径约 192。根因从 Pi shim/命令解析进一步收敛为
Windows/Bun cwd length，不是模型、网关、skill 或 scorer。

新的 short-path identity 冻结 `results/skill-ir/su-pi-direct-v1` 和 220 字符上限，plan 阶段 fail closed。
8-row dry-run 最大 workdir 长度 201。该 identity 随后的最终结果见下一节。

## 31. Skill-unique Strong-model Baseline 最终结果

2026-07-31 使用冻结的 direct Node + short-path identity 运行唯一 qualification。Local Pi 0.67.68 与
resource probe 均通过，route 30.075 秒、exit 0、2/2 outputs、零 harness residue。随后执行预注册的
`gpt-5.6-sol` development matrix：

| System | Rows | Success | Mean score | Input tokens | Output tokens | Total tokens |
|---|---:|---:|---:|---:|---:|---:|
| no-skill | 4 | 4 | 1.00 | 25,173 | 2,888 | 28,061 |
| original | 4 | 4 | 1.00 | 84,691 | 4,526 | 89,217 |

结果为 8/8 observed rows、4/4 complete/comparable pairs、0 infrastructure、0 no-skill semantic failure、
0 differing pair。`completeRows`、`completePairs`、`zeroInfrastructure` 与 `eachTaskOriginalSuccess` 通过，
但 `noSkillNonSaturated=false`、`distinguishable=false`，因此 gate failed。Original aggregate token 为
no-skill 的 3.1794 倍，在本测量面没有质量增益。

这次结果应拆成两层理解：新 benchmark 的本地合同能接受等价合法解并拒绝伪重复、错误分析单位和
错误 lineage，18/18 differential 与 36/36 materialization 说明 scorer 机制比旧 v1 的私有枚举/唯一
措辞约束更稳健；真实强模型 baseline 仍没有经验区分度，因此不能据此声称 original、IR 或 artifact
得到优化。按预注册停止规则，不构造 base IR、不运行 held-out、不继续增加 experimental-design harder
task。下一阶段转向 Wave B 的 `api-tester` 候选，以不同 phenotype 检验通用流程是否可复用。

Compact evidence：

```text
results/skill-ir/su-pi-direct-v1/qualification.json
results/skill-ir/su-pi-direct-v1/gate-report.json
```
