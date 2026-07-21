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

## 4. Env-manager 研究推进总表

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

## 5. 当前结论

可以支持：

- 真实 source/provenance/no-skill/scorer 链路成立；
- 静态 IR 有 partial correctness 信号；
- dual-source provenance 和 executable runtime 可运行；
- semantic validator 能把部分 v1 false pass 变成 repair-eligible failure；
- 模型能力会影响产物完整性与安全性，但不是当前全部失败的解释；
- V4 在三个完整 shared-generation 上以零模型 repair 将 schema criterion 0/3 提升到 3/3；
- development gate 正确阻断不成熟 artifact。

不能支持：

- held-out optimization；
- cross-model/cross-agent/cross-OS stability；
- token reduction 或 break-even；
- 当前 Final IR/package 已成熟；
- arm mean difference 是 repair 因果增益。

## 6. 结果维护规则

1. 新实验继续写 compact `scored-results.jsonl`、CSV、summary 和 provenance。
2. 本文档追加一行/一节，不再新增单次 run Markdown。
3. Frozen result 不原地重算门禁；scorer bug 需要新结果 identity 或明确 amendment。
4. Raw/workdir 留本地，paper-grade case 可提交匿名 audit note。
5. 所有表格必须能从 `results/` 反向验证。
