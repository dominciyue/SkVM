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

## 4. Env-manager 研究推进总表

| 阶段 | 最强/候选系统 | Success | Mean | 核心发现 |
|---|---|---:|---:|---|
| Calibration | original | 0/4 | 0.5125 | 不优于 no-skill。 |
| Static | ir-static | 0/4 | 0.7000 | Partial correctness 和 hard gate 改善。 |
| Dual-source | repair v2 | 1/4 | 0.6375 | 单行成功但整体回归。 |
| Artifact v1 | one-repair | 0/4 | 0.7000 | Semantic false pass，repair 休眠。 |
| Semantic v2 | one-repair | 0/4 | 0.6250 | Repair 激活但二验失败。 |

## 5. 当前结论

可以支持：

- 真实 source/provenance/no-skill/scorer 链路成立；
- 静态 IR 有 partial correctness 信号；
- dual-source provenance 和 executable runtime 可运行；
- semantic validator 能把部分 v1 false pass 变成 repair-eligible failure；
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
