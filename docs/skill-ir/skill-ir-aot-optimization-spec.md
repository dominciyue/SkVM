# Skill IR AOT 优化研究契约

**最后更新：** 2026-07-21

## 1. 项目定位

本项目把 Skill IR 作为 SkVM AOT 编译链中的语义表示和优化 pass。目标是将
自然语言 skill 中的流程、规则、工具需求、环境假设、检查和恢复策略显式化，
再利用静态分析与 development execution feedback 生成可验证、可执行、可复用
的 skill artifact。

北向研究问题是：同一 skill 在不同模型、agent、机器环境和上下文中表现不稳时，
能否通过一份 provenance-bound 编译产物提高成功率或最差表现，并控制回归。

## 2. 当前主 Claim

> 对一组有明确来源的真实 skill，将自然语言 skill 编译为静态 Skill IR，
> 再使用 development execution feedback 生成 task-local PGO/Final IR；在
> disjoint held-out tasks 上比较 `no-skill`、`original`、`ir-static` 和
> `ir-pgo`，评估成功率、最差表现、回归和成本。

完整主表固定为：

```text
no-skill | original | ir-static | ir-pgo
```

冷启动只允许：

```text
no-skill | original | ir-static
```

`ir-pgo` 从不默认调度。只有 Final IR provenance 和冻结 development gate 均
通过后，才能在显式选择的 held-out tasks 上执行。

## 3. 当前证据范围

### 已真实测试

```text
skill: env-manager
models: xty/gpt-4.1-mini, xty/gpt-4.1
adapter: bare-agent
host: Windows
context: clean
tasks: 2 development tasks, each repeated twice
```

### 已执行的模型能力诊断

已使用 `xty/gpt-4.1` 对冻结 semantic artifact v2 做单变量诊断，目的仅是判断
当前失败中是否存在 `gpt-4.1-mini` 的能力上限，不以换模型追求更高结果。

```text
diagnosticId: env-manager-v2-gpt41-capability-diagnostic-v1
skill: env-manager
model: xty/gpt-4.1
adapter/host/context: bare-agent / Windows / clean
tasks: Node + Vite development
repetitions: 2
systems: no-skill | original | ir-static | check-only | one-repair
total rows: 20
```

除 model、run identity、lock 和结果目录外，task、fixture、scorer、base IR、v2
package/catalog、一次 repair 上限和 development gate 全部保持冻结。实验不读取 held-out，
也不修改 v2 package、lock、catalog、scorer 或历史结果。

该实验是 capability attribution diagnosis，不是新的主表。只有当公开证据充分、mini
稳定失败且强模型在同一 criterion 上成功时，才记录为“支持模型能力瓶颈”；单个强模型
成功不能证明跨模型稳定或方法增益。跨时间独立运行仍保留 provider/time confound。

实际 20 行无 infrastructure failure。`no-skill`、`original`、`ir-static` 和
`check-only` 均为 0/4、mean 0.7000；`one-repair` 为 0/4、mean 0.6625。强模型
相对 mini 出现 18 个 `mini-fail-strong-pass` 准则转移，但 `env-classification` 与
`env-schema-rules` 在所有系统中持续失败。该结果只支持模型能力影响低层产物质量，
不支持方法增益、跨模型稳定或任务已饱和。

### 已实现但证据有限

- Synthetic seed 的多 skill、多 context 和多模型 runner/scorer 工具。
- Model-family promotion policy 与 validation planner，仅作 advisory tooling。
- Environment/agent 字段的计划与切片，不等于真实切换 OS 或 harness。

### 计划轴

- 固定多模型 panel 与 panel-conditioned shared artifact。
- 第二个和第三个 Wave A 真实 skill。
- Wave B 冻结 replication。
- 真实 Linux/macOS host 与多个 agent adapter。

## 4. 真实 Skill 范围

Wave A：

```text
law-to-markdown
env-manager
experimental-design
```

Wave B：

```text
zh-code-reviewer
api-tester
zh-readme
```

Wave A 用于方法开发。完整主 claim 必须包含 Wave B，并且 Wave B 不得用于调优
同一份待报告配置。Synthetic seed 只作为 `calibration-low` 证据。

## 5. 静态与动态结合契约

### 静态阶段

真实 `SKILL.md` 经过 source audit 后生成 profile-empty base IR。静态 passes
可以规范规则、插入环境 guard、补全 agent-facing contract 和生成 lowering 视图，
但不能读取 evaluator expected 或 held-out 数据。

### 动态阶段

当前采用 task-local dual-source residual repair：

```text
original x development -> 确认失败 lineage
ir-static x development -> 提取静态编译后的 typed residual
```

判定规则：

```text
original fail + static pass -> 已解决，不生成 repair
original fail + static fail -> reproduced residual
original pass + static fail -> static regression，阻断 Final IR
```

Scorer expected、secret 值、held-out prompt/fixture 和结果禁止进入 overlay、runtime
contract、repair prompt 或 package。

## 6. Final IR 与 Artifact 定义

Final IR 是 base IR 与通过门禁的 typed overlay 编译得到的候选产物，必须包含：

- source/base/overlay/final digest；
- development result digest；
- model、adapter、run、panel construction identity；
- task split 和 repair catalog；
- validation notes。

Final IR 不因成功编译就自动晋升。`ir-pgo-dev` 是 development diagnostic label，
`ir-pgo` 才是 held-out consumption label。

工程终态是 Validated Skill Artifact Package：

```text
optimized_skill/
  skill_ir.json
  skill.md
  artifacts/
    checks/ | schemas/ | scripts/ | templates/ | tool-plans/
  package-manifest.json
  package-provenance.json
  validation notes
```

成熟度：

| Level | 含义 |
|---|---|
| L0 | 原始自然语言 skill。 |
| L1 | 结构化 workflow IR。 |
| L2 | Lowered controller/checker/schema 等辅助产物。 |
| L3 | 可重复调用的稳定文件、代码、模板和 tool plan。 |
| L4 | 有版本、provenance、cache policy 和 regression evidence 的验证 package。 |

当前 semantic v2 是 L3-oriented development prototype，不是 validated L3/L4。

## 7. Runtime 契约

Artifact runtime 固定为：

```text
preflight
  -> materialize template/runtime contract
  -> generation
  -> validate
  -> at most one sanitized repair
  -> revalidate
  -> stop
  -> offline deterministic scorer
```

Runtime validator 与 scorer 职责分离。Validator 只能使用公开 skill/task contract
和 agent 可见 workdir；scorer 是任务成功的唯一权威。Provider、evidence、digest、
path containment 或 protected mutation 失败不能触发 semantic repair。

Semantic v2 中 A 层低争议证据生效；B 层 classification 只有类型和泄漏测试，
不得进入 package、runtime、repair、raw/scored row 或 gate。

## 8. 评估指标

主要指标：

- success rate / pass count；
- worst-case success；
- paired delta 与 regression count；
- hard-gate failure；
- criterion-level failure；
- model/context slice 和 infrastructure exclusion。

诊断指标：

- input/output/aggregate tokens；
- repair-only token cost；
- latency 与 validation duration。

Token 节省是次级、未来主张。正确形式是：

```text
total_original(N)  = original_runtime_cost * N
total_optimized(N) = compile_cost + profile_cost + optimized_runtime_cost * N
```

只有质量不回归且存在可复用 package 时才报告 break-even。

## 9. 当前冻结结果

`env-manager` 静态 run：

- original 0/4，mean 0.425；
- ir-static 0/4，mean 0.700；
- hard-gate failed rows 从 3 降到 0；
- classification 和 schema 仍为 0/4。

Dual-source Final IR：

- repair v1 0/4，mean 0.700；
- repair v2 1/4，mean 0.6375；
- 两者均未过 development gate。

Executable artifact v1：

- check-only 0/4，mean 0.55；
- one-repair 0/4，mean 0.70；
- one-repair 初检全部通过，repair attempts 为 0，暴露 semantic false pass。

Semantic artifact v2：

- check-only 0/4，mean 0.4375；
- one-repair 0/4，mean 0.625；
- 两次真实 repair，0 次 repaired-to-pass；
- 冻结 3/4、0.85 gate 失败；
- held-out 未执行。

GPT-4.1 capability diagnostic：

- 20/20 行正常执行，五个系统均 0/4 success；
- no-skill/original/ir-static/check-only mean 均为 0.7000；
- one-repair mean 0.6625，4 次 repair，0 次 repaired-to-pass；
- 相对 mini 改善 18 个低层准则结果，classification/schema 残差不变；
- 冻结 gate 失败，held-out 未执行，结果不进入主 claim。

详细证据见 `docs/skill-ir/experiment-results.md` 和 `results/skill-ir/`。

## 10. 当前不支持的主张

- 不声称已提高 held-out success。
- 不声称跨模型、跨 agent 或跨 OS 稳定。
- 不声称当前 package 节省 token。
- 不把 runtime validation pass 等同于任务成功。
- 不把单个成功样本或跨批次均值差写成因果增益。
- 不把 environment label 当作真实 host evidence。

## 11. 成功条件

完整成果至少需要：

1. Wave A 多个真实 skill 通过冻结 development gate。
2. 同一 provenance-bound artifact 在 disjoint held-out 上超过或不回归
   `no-skill/original/ir-static`。
3. 固定模型 panel 中报告 aggregate、per-model、worst-model 和 negative delta。
4. Wave B 使用冻结方法完成 replication。
5. Scorer、runtime validator、infrastructure failure 和 token cost 分列报告。

## 12. V3 Public-Contract Artifact

### 12.1 身份与目标

下一 catalog 固定为：

```text
package catalog: executable-public-contract-artifact/v3
runtime contract: skill-ir-public-runtime-contract/v3
validation report: runtime-validation-report/v3
error catalog: public-contract-error-codes/v2
primary development model: xty/gpt-5.6-sol
```

V1/V2 package、lock、catalog 和结果保持不可变。V3 目标是把公开 skill/task 规则和
agent 可见 workdir evidence 编译成机器可执行 contract，直接处理当前稳定失败的
classification 与 schema rules，同时建立同一 initial generation 的 repair 归因。

### 12.2 编译产物

```text
package/
  skill-ir.json
  skill.md
  package-manifest.json
  package-provenance.json
  artifacts/
    contracts/output-contract.json
    contracts/public-policy.json
    schemas/public-runtime-contract.schema.json
    scripts/evidence-program.mjs
    checks/public-contract-checker.mjs
    templates/.env.example
    templates/.env.schema.json
    templates/env-report.json
```

Preflight 从公开 contract 与 workdir 生成并保护：

```text
.skvm-artifact/public-runtime-contract.json
```

Runtime contract 保存变量名、definition/reference/source refs、公开框架前缀、
literal shape、confirmed type/constraint/sensitivity evidence、source-qualified
finding 和 limitation。不得保存 secret value、scorer expected、held-out 数据或
最终 gold classification arrays。

### 12.3 B 层启用边界

V3 启用可审计的 classification derivation，但只消费以下规则：

```text
defined + referenced       -> definedAndUsed
defined + not referenced   -> definedUnconfirmedUnused
referenced + not defined   -> usedUndefined
confirmed sensitive literal -> hardcodedSecrets
public prefix + sensitive + client-visible reference -> exposureRisks
```

推导在 checker 内从 evidence graph 重新计算，不把最终数组写进 runtime contract。
动态访问、未支持语法、扫描上限、编码问题或冲突 evidence 一律保守降级为
`unconfirmed`/limitation。每条推导必须有 canary、reverse-evidence 和冲突测试。

Schema 只强制 confirmed rules：

- 显式数值转换或安全 literal shape 才推导 integer/boolean；
- URI scheme、公开 suffix/policy 才推导 format；
- 静态 reference 支持 required=true，只有 definition 支持 required=false；
- 敏感名称/公开 skill policy 支持 sensitive 和受限 minLength；
- 不支持的字段必须被拒绝，advisory inference 不进入 repair gate。

### 12.4 生成与一次修复

```text
preflight
  -> derive/protect public runtime contract
  -> materialize deterministic skeleton
  -> model generation
  -> capture pre-repair snapshot
  -> validate
  -> at most one contract-bound repair
  -> revalidate
  -> capture post-repair snapshot
  -> offline score pre/post snapshots
```

V3 repair report 仍禁止 actual/expected value 和 free-form message。除既有安全字段外，
只允许 `contractRef` 与封闭 `operation` enum；repair agent 必须读取 protected
contract ref，自行重建目标字段。第三次调用、修改 protected input、修改 contract、
路径逃逸或 validator infrastructure failure 都必须停止。

### 12.5 共享生成归因

V3 不再为 check-only 和 one-repair 分别调用模型。同一 one-repair raw run 保存：

- generation identity；
- pre-repair workdir snapshot path/digest；
- post-repair workdir snapshot path/digest；
- generation、repair、validation 分项 token/latency。

Scorer 从同一 raw run 生成两个逻辑 scored row：

```text
check-only  = pre-repair snapshot
one-repair = post-repair snapshot
```

二者共享 model/task/runIndex/generation identity。只有 pre fail、post pass 且 runtime
repair 实际发生时，才记录 repaired-to-pass；独立 generation 不进入 repair 增益表。

### 12.6 模型资格与实验边界

网关 2026-07-21 返回 448 个模型。低成本兼容性 probe：

| Model | 结果 |
|---|---|
| gpt-5.6-sol | 可用，严格格式通过 |
| claude-opus-4-8 | 可用 |
| deepseek-v4-pro | 可用 |
| gemini-3.1-pro-preview-thinking | 可调用，但返回 route/格式有偏差 |
| gpt-5.5-pro | HTTP 503 |

V3 主开发模型固定为 `xty/gpt-5.6-sol`。在 V3 lock 前，用 no-skill Node development
case 对 GPT-5.6、Opus、DeepSeek 各做一次资格评分；该结果只用于排除 route/harness
异常，不进入方法主张。Opus/DeepSeek 后续只作跨模型诊断，不参与 V3 调参。

正式实验仍限定 env-manager development、Windows、clean、bare-agent。新 package、
model、task、repetitions、snapshot scorer、repair 上限和数值 gate 必须在付费运行前
冻结；gate 未过不执行 held-out。
