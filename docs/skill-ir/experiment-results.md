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
probe 为 `ok`。该记录只说明实验身份和本地前置条件已冻结；API route、真实 baseline 结果和
gate 尚未产生，因此不能改变本节的 mechanism-only 结论。

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
