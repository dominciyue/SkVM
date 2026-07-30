# Skill IR AOT 优化研究契约

**最后更新：** 2026-07-27

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

这段文字是研究方向的完整目标，不代表当前证据已经足以支撑全部主张。当前
benchmark v2 设计阶段必须把三类问题分开报告：

1. **测量合同是否有效**：任务和 scorer 是否只检查 agent 可见、公开且可追溯的
   语义要求；
2. **优化是否有效**：在合同通过后，IR 或 artifact 是否改善最终 workdir 的
   任务结果；
3. **是否可以泛化**：同一套通用 catalog/runtime 和冻结方法能否在未参与设计的
   另一种真实 skill 上复现，而不是只在一个 skill 的专用 benchmark 上成立。

因此，单个 pilot 的 v2 audit 通过，只能解除“该 benchmark 可用于测量”的阻塞，
不能直接推出跨 skill 泛化、跨模型稳定或 token 摊销。

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
models: xty/gpt-4.1-mini, xty/gpt-4.1, xty/gpt-5.6-sol
adapter: bare-agent
host: Windows
context: clean
tasks: 2 development tasks, each repeated twice
```

另有一次不调用模型的 V4 deterministic repair 离线重放：复用冻结 V3 的三个完整
pre-repair snapshots，三个 workdir 均由 scorer 0.70 提升到 1.00，runtime validation
由 fail 变为 pass，protected digest 保持不变。它是 development mechanism evidence，
不进入 held-out 或跨模型主 claim。计入原批次的
1 条 generation infrastructure 后，source-generation 口径为 3/4、mean 0.75，冻结
development gate 仍失败。

2026-07-22 又使用冻结 V4 package/lock 完成一次真实 4-generation development。Route
probe 为 ok；3 个完整 shared-generation pair 的 deterministic scorer 均由 pre 0.90
提升到 post 1.00，`env-schema-rules` 3/3 从 fail 变为 pass，binary success 保持 3/3，
确定性修复 3/3 执行并通过，模型 repair 为 0。另 1 个 generation 在模型生成阶段因
Bun 1.3.14 internal assertion crash 形成 infrastructure。冻结分母口径为 success 3/4、
mean 0.75、1 infrastructure，因此 gate 失败，held-out 未执行。

2026-07-23 使用冻结 pre-IR lock 完成 `law-to-markdown` 的 GPT-5.6 calibration：
`no-skill | original`、2 个 development tasks × 2 repetitions，共 8 行，全部正常评分，
0 infrastructure。No-skill 与 original 均为 0/4 success，mean 分别为 0.70 和 0.75；
4 个 pair 中 1 个由 original 改善 `law-document-policy`，其余 3 个 outcome 相同，
`law-review-outcome` 在 8 行中持续失败。校准 gate 通过，只允许进入 source-audited
base IR 构造；不构成方法增益或 held-out 证据。

2026-07-24 使用冻结 development lock 与从属 execution freeze 完成 Law validated artifact
对照：`no-skill | original | ir-static | validated-artifact`、2 tasks × 2 repetitions，
16/16 raw/scored、4/4 quartets、0 infrastructure。Artifact 为 4/4 success、mean 0.925、
0 model tokens；original 为 0/4、0.75、110249 tokens，ir-static 为 1/4、0.80、
155445 tokens。Artifact 逐样本相对 original/static 较优者为 3 positive、1 equal、
0 negative，冻结 development gate 通过。该结果只允许起草新的 held-out lock，不构成
held-out、跨模型、跨 skill、跨环境或摊销 token 主张。

2026-07-24 随后按新 lock 执行唯一一次 Law held-out：16/16 raw/scored、4/4 quartets、
0 infrastructure。Artifact 为 2/4、mean 0.725、0 model tokens；法规 task 两次均为
0.85/success，非法律 manual task 两次均为 0.60/failure。相对三条 baseline 的逐样本
最佳值为 1 strict improvement、1 equal、2 regressions，冻结 gate 失败。结果说明当前
package 的法规转换路径可复用，但非法律边界判断未跨 task 泛化；不得用该 held-out 反馈
原地修改 package、scorer 或 IR。

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

Source audit 使用独立 `skill-ir-source-audit/v1` sidecar，不把 provenance 字段塞入核心
IR schema。Sidecar 固定 source/task/resource digest，并要求 category、intent 以及每个
input/output/precondition/step/rule/tool/environment/check/recovery 节点都有公开证据映射。
Task JSON 只允许引用 development task 的 `prompt`；`eval`、fixture、threshold、held-out
prompt、runtime output 和 profile feedback 均不得作为 base IR 静态证据。

### 新 Skill 的分层验证

工程终态不要求每个新 skill 都人工、付费地重复完整研究流程。所有新 skill 必须经过
低成本层：provenance/license/resource closure、source digest、schema/static validation、
source audit 和确定性 lowering。后续预算按风险和证据自适应：

1. 新任务/scorer 或饱和度未知时，做小规模 `no-skill | original` calibration。
2. 静态 IR 有可观察改进空间时，进入 `ir-static x development`。
3. 只有稳定残差且公开证据可修复时，才生成 dynamic overlay/Final IR candidate。
4. 只有候选通过冻结 development gate，才运行 held-out、多模型 panel 或 artifact promotion。

Source、task contract、compiler 和 artifact digest 未变化时可复用已验证产物，不重复付费。
当前 Wave A deep pilots 为论文方法验证，需走完整链路；Wave B 使用冻结方法做 replication；
其余 intake candidate 不因“被收录”自动获得完整实验预算。Validation planner 将来负责自动
分配层级，当前仍只是 advisory tooling，不能替代预注册实验门禁。

### 第二 Phenotype：Experimental Design

第二个 catalog reuse pilot 固定为真实公开 skill `experimental-design`。它与 Law 的直接文档
转换不同：输入是结构化研究方案，输出是实验设计决策、随机分配表和可审计报告。第一阶段只
覆盖随机分配 phenotype，不把依赖 `numpy/pandas/pyDOE3` 的 DOE 矩阵并入同一轮，以免把
catalog 泛化与第三方依赖可用性混为一个变量。

用户可见任务契约固定为：

```text
protected input: study.json
outputs:
  design/design-plan.json
  design/allocation.csv
  design/design-report.md
```

`study.json` 显式给出研究问题、arms、assignment level、analysis unit、response、seed、
nuisance factors、strata/cluster/sequential enrollment 等公开字段。编译产物只从公开
source closure、source-audited base IR、resource contract 和 development prompt 投影推导：

```text
cluster assignment                -> cluster-randomized
individual + strata               -> stratified-block
individual + sequentialEnrollment -> permuted-block
otherwise                         -> simple-randomized
```

同一 `validated-skill-artifact/v1` manifest、execution-plan 和 runtime API 必须原样复用；
通用 core 不得按 skill id 分支。Experimental-design 专用逻辑只能位于 compiler adapter、
编译出的 script/template/schema/check/tool-plan 和独立 deterministic scorer 中。若该边界
无法维持，必须记录为 catalog 抽象失败并版本化 core，不能静默把专用规则塞入 v1。

Runtime checker 与离线 scorer 保持独立。Checker 只验证公开输入可推导的 schema、方法选择、
随机化单位、seed、行数、arm/stratum/cluster 一致性和报告字段；scorer 仍以最终 workdir 为
唯一成功权威。Evaluator expected、held-out prompt、运行输出、Law held-out failure 和 secret
不得进入 compiler/package。删除公开证据后，相应约束必须消失；canary 不得出现在 package。

任务先冻结为 2 development + 2 held-out。四个任务用于验证 split 与 scorer，但本阶段只允许
development fixture 的本地 activation 和显式 `no-skill | original` calibration。Held-out
不得进入 package construction、calibration、repair 或付费执行。只有 scorer、base IR、
source audit、resource contract、package digest 和新的 development lock 全部冻结，并且
development gate 通过后，才可另立 held-out lock。

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

V4 contract-repair artifact development：

- 4 个预注册 generation 中 3 个形成完整 pre/post pair，1 个 generation infrastructure；
- 完整 pair 的 success 保持 3/3，mean 由 0.90 提升到 1.00，0 hard-gate regression；
- 三次均由 deterministic repair 完成，模型 repair attempts/tokens 均为 0；
- 冻结 gate 为 3/4、mean 0.75、1 infrastructure，未通过，held-out 未执行。

Law validated artifact development：

- 16/16 rows、4/4 quartets、0 infrastructure、0 hard-gate failure；
- no-skill 1/4、mean 0.6875；original 0/4、mean 0.7500；ir-static 1/4、mean 0.8000；
- validated-artifact 4/4、mean 0.9250，法律 task mean 0.85，非法律 task mean 1.00；
- artifact 相对 original/static 较优者为 3 positive、1 equal、0 regression；
- artifact model tokens 为 0，模型三臂合计 301198 tokens；compile cost 未重测，
  break-even 仍为 `not-computed-quality-gate-pending`；
- development gate 通过，只允许建立新的 held-out lock，held-out 尚未执行。

详细证据见 `docs/skill-ir/experiment-results.md` 和 `results/skill-ir/`。

## 10. 当前不支持的主张

- 不声称已提高 held-out success。
- 不声称跨模型、跨 agent 或跨 OS 稳定。
- 不声称当前 package 已证明摊销 token 节省或 break-even。
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

资格审计已于 2026-07-21 完成：

| Model | Route | Score | Hard gate | Latency | Tokens | 残留失败 |
|---|---|---:|---|---:|---:|---|
| `xty/gpt-5.6-sol` | ok | 0.80 | pass | 36.5s | 8166 | classification |
| `xty/claude-opus-4-8` | ok | 0.70 | pass | 68.2s | 15917 | classification、schema |
| `xty/deepseek-v4-pro` | ok | 0.70 | pass | 141.5s | 10879 | classification、schema |

三条记录均为同一个 `no-skill` development case 的单次资格运行，
`methodEvidence=false`。它们支持 route/harness 可用和 primary-model 选择，不支持
Skill IR 增益、模型优劣的统计结论或跨模型稳定性结论。

正式实验仍限定 env-manager development、Windows、clean、bare-agent。新 package、
model、task、repetitions、snapshot scorer、repair 上限和数值 gate 必须在付费运行前
冻结；gate 未过不执行 held-out。

## 13. V4 Contract-Repair Artifact 候选设计

### 13.1 身份与阶段边界

候选身份固定为：

```text
package catalog: executable-contract-repair-artifact/v4
output/repair contract: skill-ir-executable-repair-contract/v4
repair report: deterministic-repair-report/v1
```

该身份已经落实为独立 package schema、compiler、checker、preflight、deterministic-first
runtime、Runner system 和预注册 development lock，但不代表优化成功。V1/V2/V3 package、
lock、checker、scorer 和结果保持不可变。V4 的 coverage audit 与冻结 V3 pre-repair
snapshot 离线重放已完成；新 lock 已在付费前绑定 package、tasks、scorer、model、矩阵和
数值 gate。4-generation 真实 development 已按同一冻结身份执行，gate 因 1 条 Bun runtime
infrastructure 和包含 infrastructure 的 mean 0.75 失败；package/lock/scorer/tasks/gate 不作
事后修改，held-out 未运行。

### 13.2 Failure-to-contract coverage

每个 deterministic scorer criterion 必须有显式记录：

```text
criterion
  -> scorer success surface
  -> runtime validator coverage (equivalent | partial | none)
  -> public evidence source
  -> deterministic repair capability
  -> residual gap / claim boundary
```

Coverage audit 只允许读取 criterion identity、公开 task contract、runtime code catalog
和已脱敏的 observed failure code。它不得读取或输出 evaluator `expected`、secret value、
held-out fixture 或 scorer payload。Runtime validator 仍不等于 scorer；只有最终 workdir
的 deterministic scorer 能判定任务成功。

### 13.3 可执行输出契约

V4 不再用 `expectedType=array` 表示整个 report field。输出契约至少表达：

- container type 与 `array.items.type=string`；
- object properties、required fields 和 additional-properties policy；
- set semantics、唯一性和稳定字典序；
- source-qualified finding 的 canonical `relativePath:symbol` 形式；
- schema rule 的值类型、允许字段和 evidence/provenance ref；
- closed deterministic repair operation。

最终 classification 数组仍不得写入 package、repair report 或 prompt。它们只能由
repairer/checker 在运行时从 protected public runtime evidence 重建。

### 13.4 确定性优先修复

V4 状态机目标为：

```text
preflight
  -> generation
  -> validate
  -> deterministic contract repair
  -> validate
  -> optional one sanitized model repair for residual only
  -> validate
  -> stop
```

确定性 repairer 只写 generated outputs，必须在写入前后验证 protected inputs 与
runtime contract digest。Repair report 只含 operation、relativePath、jsonPointer、
contractRef 和状态，不含 expected/actual value、文件正文、secret 或自由文本。

Schema lowering 区分两类规则。环境访问默认字符串语义、URI suffix 等有公开语义
来源的规则属于 base policy；仅服务端引用的 DSN 敏感性与 `_SIGNING_KEY` 最小长度
属于 `development-learned-candidate`，必须绑定冻结 V3 development evidence digest，
不能表述为真实 skill 已明确给出的通用规则。每条规则都需要正向、reverse-evidence、
冲突和 canary 测试；候选规则只有在未参与构造的任务上验证后才可 promotion。禁止把
development scorer 的 literal 集合或 evaluator payload 写入 contract。

### 13.5 Promotion 条件

V4 只有同时满足以下条件才可进入付费 development：

1. 六个 env-manager criterion 的 coverage audit 完整且无未知 runtime code；
2. 冻结 V3 的三个完整 pre-repair snapshots 均完成可复现离线重放；
3. deterministic repair 后 runtime validator 通过，scorer residual 被逐项解释；
4. protected input、secret isolation、reverse-evidence 和 package leak canary 通过；
5. missing generation/pair 被计为 infrastructure failure，不从 gate 静默排除。

Offline replay 还必须由 method freeze 绑定 tasks、deterministic scorer source、V3
raw/lock/source evidence/output contract、task/criterion registry 和每条 learned rule 的
`ruleId + sourceCriterion + evidenceDigest + candidate status`。摘要漂移时不得重算结果。

若本地 replay 仍有 scorer residual，应先修复公开 contract/evidence 缺口或收缩 claim，
不得通过读取 evaluator expected、修改冻结 scorer 或运行 held-out 来补齐。

## 14. V4 后续：基础设施隔离与第二真实 Skill 纵切

V4 的冻结 development 结果保持不变。Bun generation crash 不补跑、不从分母排除，
也不通过修改 V4 package、lock、task、scorer 或 gate 消除。后续基础设施诊断必须使用
新的 diagnostic identity，只回答 crash 的来源、可复现性和运行时处置，不进入 Skill IR
方法增益或 held-out 证据。

当前只读诊断已将唯一失败封闭分类为 Bun 1.3.14 `bun-internal-assertion` / generation，
但没有新执行样本，reproducibility 仍为 `inconclusive`。该记录不改变 V4 gate。

研究主线并行进入第二个 Wave A skill：`law-to-markdown`。第一阶段只完成
`source-imported -> tasks-authored`，固定四个 `.txt` 任务、资源契约和确定性 scorer；
不创建临时 base IR，不把该 skill 标记为 runnable，也不执行付费模型。

任务切分固定为两个 development 和两个 held-out case，并覆盖两类公开行为：

```text
law document     -> 保真转换、法律层级 Markdown、审核报告与最终成果
non-law document -> 明确拒绝、只生成审核报告、不生成最终成果
```

资源契约固定为：原始 skill、静态 IR 和后续 package 获得相同 source closure；运行时禁止
联网和安装依赖；Python 解释器由 `SKVM_PYTHON` 显式选择，`python-docx` 与
`pdfplumber` 必须在付费前 probe。
当前 `.txt` 路径仍受上游脚本 eager import 影响，因此缺依赖属于预检基础设施阻断，不能
在结果中伪装成 skill 语义失败。Agent 被允许调用 bundled script，但 scorer 只读取最终
workdir，不以“是否调用脚本”判定成功。

确定性 scorer 至少覆盖：输入保护、产物集合、字符流保真、法律标题层级、非法律拒绝
策略和审核报告结论。Evaluator payload、期望标题和 held-out 结果不得进入 prompt、IR、
package、runtime repair 或 compact failure audit。

本纵切完成 `tasks-authored` 后，先运行资源 probe，再做显式
`no-skill | original` development calibration。只有链路可执行、scorer 有区分度且无资源
歧义时，才审计 base IR 并进入 `ir-static`；held-out 在 development method 冻结前不运行。

## 15. Law-to-markdown Pre-IR Calibration

本阶段使用独立 `skill-ir-pre-ir-calibration-lock/v1`，不复用 env-manager lock，也不把
校准写成 Skill IR 方法证据。冻结身份为：

```text
calibrationId: law-to-markdown-pre-ir-calibration-v1
model: xty/gpt-5.6-sol
model family: gpt
adapter: bare-agent / workspace-law-pre-ir-v1
host/context: windows / clean
systems: no-skill | original
tasks: 2 development
repetitions: 2
expected generations: 8
retries: 0
```

Lock 必须绑定原始 `SKILL.md`、`tasks.json`、`resource-contract.json` 和确定性 scorer
源码摘要。Runner 只能从 lock 编译计划；执行前必须重新通过资源 probe，并已有同一
lock/model/task 的 route probe。Route probe、resource probe 和校准 gate 都标记
`methodEvidence=false`。

校准 gate 固定检查：8 个预注册 row 完整、4 个 `no-skill/original` pair 完整、零
infrastructure、至少一个 no-skill row 未达到任务成功条件，以及至少一个 pair 的
success/score/criterion vector 不同。Gate 不要求 original 一定优于 no-skill；若 original
更差，按原 skill 不稳定或有害信号报告。若两臂都满分，记为任务饱和；若两臂完全相同，
记为缺少区分度。两种情况都停止 base IR，不通过事后修改 scorer 或 held-out 补证据。

Gate 通过后也只允许进入 source-audited base IR 构造与 `ir-static` development；它不
允许 held-out、PGO、artifact promotion 或主 claim。Raw/workdir/route tail 保留本地，
仓库只提交不含模型正文、绝对路径、secret 或 evaluator payload 的 compact evidence。

## 16. Law-to-markdown Source-audited Base IR

Pre-IR gate 通过后，已从固定 `SKILL.md`、两个 development prompt 和 resource contract
构造 profile-empty 中文 base IR。IR 覆盖 txt/docx/pdf 分支、mineru-ocr 优先级、用户授权
后的本地回退、法律层级格式、字符流保真、Stage3 双检查、最多两次重试和条件产物策略。

`base-ir-source-audit.json` 逐节点绑定公开证据并由通用 verifier 检查 digest、line range、
JSON pointer、完整覆盖和禁用 evidence class。Corpus 已从 `tasks-authored` 晋级
`runnable`。该晋级只说明静态输入可审计、可调度，不说明 `ir-static` 已优化成功。
下一实验必须新建 static-development lock，只跑 development 的
`no-skill | original | ir-static`；held-out、PGO 和 artifact catalog 继续阻断。

## 17. Law-to-markdown Static Development Contract

Static development 使用 `skill-ir-static-development-lock/v1`，固定 GPT-5.6、
Windows/clean/bare-agent、两个 development task、两次 repetition、零重试和 180 秒 route
probe timeout。矩阵只能包含 `no-skill | original | ir-static`，共 12 rows / 4 triplets。

Runner 采用 `plan -> route-probe -> execute`：`plan` 不调用模型；后两阶段都重新验证 lock、
source audit 和 fresh resource probe；route probe 只执行第一条 original generation 并保存
脱敏状态；execute 只接受同输出目录中 experiment/model/case/system 完全一致的成功 probe。
Route probe 同时绑定 lock 文件 SHA-256，同名 lock 内容变化后旧 probe 自动失效。

Static gate 在付费前固定为：`ir-static` 至少 3/4 success、包含缺失和 infrastructure 的均分
至少 0.85、零 infrastructure、零 original→ir-static hard-gate regression、至少一个严格改善
pair。Raw/scored 缺行均保留在冻结分母并按 infrastructure/0 分处理；raw 已失败时不得使用
scored 行携带的分数。Compact report 只保留计数、分数、criterion id transition 和五类输入
SHA-256，不保留模型正文或 evaluator details。

Gate 通过只允许书面评审并规划新的 held-out lock；当前 lock 的
`heldOutExecutionAllowed=false`、`entersMainClaim=false` 不变。Gate 失败则停止，不补跑、
不调 scorer/base IR、不进入 PGO 或 artifact promotion。

2026-07-23 实际 static development 为 12/12 rows、4/4 triplets、0 infrastructure；
`no-skill=0/4, 0.70`，`original=1/4, 0.7875`，`ir-static=1/4, 0.7875`。Original→static
一正一负两平，mean delta=0；static token 比 original 高 39.1%。Gate 因 success 与 mean
未达标而失败，held-out 保持阻断。

失败审计把下一编译边界收紧为：允许从固定 source closure 中的 bundled script 提取公开、
可审计的 canonical review label、report field 和直接解释器调用计划，固化为新 catalog 的
template/schema/tool-plan；禁止从 evaluator payload、held-out 或本批模型输出提取规则。新
catalog 必须使用新的 package/lock 身份并只在 development 验证，不原地修改 base IR 或本 lock。

## 18. 通用 Validated Skill Artifact Catalog 与 Law 首次实例化

下一阶段新建独立 catalog：

```text
catalog: validated-skill-artifact/v1
manifest: validated-skill-artifact-manifest/v1
provenance: validated-skill-artifact-provenance/v1
execution plan: skill-artifact-execution-plan/v1
execution result: skill-artifact-execution-result/v1
```

这里的“通用”只指 package 容器、artifact 类型、provenance、执行节点、路径保护、结果记账
和 validation 接口对 skill 无关。每个 skill 仍由独立 compiler adapter 从批准的公开证据
生成具体 assets 和 execution plan。Catalog core 不得包含 `env-manager`、`law-to-markdown`
等 skill id 分支，也不得按 catalog 版本硬编码特定 skill 的修复逻辑。

V1 支持以下 artifact kind：

```text
skill-ir | skill-view | script | template | schema | check | tool-plan | validation-policy |
validation-notes
```

V1 execution plan 先实现封闭节点：

```text
process  -> 使用声明的 interpreter env/fallback 和 argv 直接执行 package script
validate -> 调用声明的 checker，输出闭合 validation report
```

节点只能引用 manifest 已声明且 digest 已验证的 artifact；工作目录参数使用命名 placeholder，
运行时在参数级替换，不经过 shell。禁止绝对路径、`..`、任意环境变量继承、网络安装命令和
未声明 executable。Process stdout/stderr 只用于本地诊断，compact result 只保存 exit class、
duration 和使用的节点 id，不保存模型正文、secret 或绝对路径。

Package provenance 必须绑定：

- source closure 中每个编译输入的 path 与 SHA-256；
- base IR、source audit、resource contract 和 development task prompt digest；
- compiler adapter id/version/config digest；
- construction split=`development`；
- 明确的 forbidden evidence classes。

Compiler API 只能接受已经投影的公开 task contract，不接受完整 `tasks.json` evaluator、
held-out prompt、runtime output 或 profile feedback。Gold-isolation canary 与
reverse-evidence test 必须递归扫描 package；删除公开 source evidence 后，对应 artifact
或约束必须消失或编译失败，不能由 evaluator 补齐。

`law-to-markdown` 是 catalog 的第一个 adapter，不是 catalog 通用性结论。Law v1 从已冻结
source closure 编译：

```text
scripts/cn_law_normalizer.py
scripts/law_to_markdown.py
scripts/stage3_checker.py
templates/review-report-contract.md
schemas/review-report-contract.json
tool-plans/law-to-markdown.json
checks/law-artifact-check.py
```

第一种执行模式固定为 direct deterministic process：

```text
SKVM_PYTHON/fallback python
  law_to_markdown.py
  document.txt
  --out-dir markdown
  --law-decision auto
  --artifact-level minimal
```

上游脚本会在 `--out-dir` 下自行创建 `<input_stem>/`；因此 `document.txt` 的最终目录是
`markdown/document/`。Compiler 不得把最终目录再次作为 `--out-dir`，否则会形成重复的
`markdown/document/document/`。

Runner 不通过 `sh`、PowerShell 或拼接命令字符串执行。模型分类节点暂不进入 Law v1 主路径；
以后若加入，必须作为新 execution plan mode 和单独消融，不改变本轮 digest。直接工具执行仍需
经过资源 probe、输入保护、package digest 验证、runtime validation 和既有离线 deterministic
scorer；validator 不是 scorer。

冻结 package 不直接作为解释器的可写脚本目录。Runtime 在每次调用前复制一份临时执行快照，
所有 script/import cache 只允许写入快照，结束后删除；原 package 在重复调用后仍必须通过
digest 与 undeclared-file 校验。该护栏用于阻止 Python `__pycache__` 等解释器副作用破坏
冻结产物，不改变 workdir 输出或 package 语义。

本阶段验收顺序：

1. catalog schema、digest、undeclared-file、path containment 和 skill-neutral canary 通过；
2. Law compiler byte-for-byte 可重复，且 evaluator/held-out/runtime canary 不进入 package；
3. 本地 development fixture 上 direct process 能在 Windows 无 shell 执行；
4. 既有 Law scorer 对本地产物评分，记录成功面与 runtime/scorer 差异；
5. 上述机制通过后才书面冻结新的 development lock，再决定是否付费运行模型对照。

Law 单个 adapter 通过只证明首次实例化可行。Catalog 的复用性至少需要第二个不同 phenotype
skill 使用同一 manifest、execution plan 和 runtime API，且无需修改 catalog core。若第二个
skill 迫使 core 引入 skill-specific 分支，应修改 catalog 抽象并重新版本化，而不是把例外继续
堆入 runner。

Token/成本按节点分列：

```text
compileCost
profileCost
modelGenerationTokens
modelRepairTokens
deterministicProcessDuration
validationDuration
packageBytes
```

Law direct-only 本地运行的模型 token 为 0，但不能据此直接声称总体节省；只有质量不回归、
package 可复用且计入前置编译/验证成本后，才计算相对 original 的多次调用 break-even。

## 19. Law Validated Artifact Development Contract

Task 8.5 使用新的、不可与 static development 混用的实验身份：

```text
lock: skill-ir-validated-artifact-development-lock/v1
plan: skill-ir-validated-artifact-development-plan/v1
gate: skill-ir-validated-artifact-development-gate-report/v1
experiment: law-to-markdown-validated-artifact-development-v1
```

该实验继续只使用两个冻结的 development task、Windows、clean context、bare-agent 和两次
repetition。每个 `task × repetition` 形成一个四元组：

```text
no-skill | original | ir-static | validated-artifact
```

总分母固定为 16 个逻辑样本和 4 个四元组。其中前三个系统共 12 行，经冻结的
`xty/gpt-5.6-sol` 与 `bare-agent` 生成；`validated-artifact` 共 4 行，由已验证 package
直接执行，不调用模型。四元组表示相同 task/repetition 下的质量与成本比较，不表示四个系统
共享同一次随机生成，也不作为 repair 因果消融。

新 lock 必须绑定原始 source、tasks、resource contract、deterministic scorer、base IR、
source audit、package manifest/provenance/execution plan，以及 compiler adapter、catalog core、
runtime、planner、direct runner 和 gate implementation 的 digest。Package validator 继续递归
验证其余 artifact digest；任何输入、实现或 package 漂移都要求新建 lock，不能修改本 lock。

执行边界固定为：

1. `plan` 不要求 API key，不执行模型或 package；
2. `artifact-execute` 只运行 4 个直接执行样本，要求 resource probe，不要求 model route；
3. 完整 `execute` 必须另有同一 lock 的成功 resource/route probe，模型臂重试次数为 0；
4. 所有系统复用同一任务 fixture、最终 workdir 和既有 deterministic scorer；
5. held-out、PGO、scorer retuning 和 package 重编译均被本 lock 禁止。

付费前数值 gate 冻结为：

- 16/16 raw 与 scored 行、4/4 完整四元组；
- `validated-artifact` 成功至少 4/4；
- `validated-artifact` 总均分至少 0.85，每个 task 的均分至少 0.85；
- `validated-artifact` 基础设施失败为 0，hard gate failure 为 0；
- 对每个匹配样本，artifact 不得低于 `original` 或 `ir-static` 中较好的结果，也不得在任一
  baseline 成功时失败；
- gate 通过只允许起草 held-out lock，不自动执行 held-out，也不进入完整主 claim。

成本报告使用固定字段：

```text
compileCost
profileCost
researchDiagnosticCost
modelGenerationTokens
modelRepairTokens
deterministicProcessDuration
validationDuration
packageBytes
```

Law v1 compiler 不消费 profile feedback，因此 production `profileCost=0`；此前 static failure
audit 对研究路线有影响，单列为 `researchDiagnosticCost`，不伪装成 compiler 输入，也不并入
生产摊销。Artifact 的 generation/repair token 均为 0；前三臂按真实 usage 统计。Development
gate 未通过前，break-even 字段必须保持 `not-computed-quality-gate-pending`。

## 20. Law Validated Artifact Execution Freeze

第 19 节的 development lock 已冻结实验输入、16 行矩阵、direct artifact runner 和数值 gate，
但其已绑定 runner 只实现 `plan | artifact-execute`，没有实现模型 route probe 与 12 条模型臂
编排。不能通过原地修改该 runner 补齐功能，否则 development lock 会因自身绑定的实现 digest
漂移而失效。完整 development 执行因此使用一个从属、不可替代父 lock 的冻结身份：

```text
execution freeze: skill-ir-validated-artifact-development-execution-freeze/v1
route result: skill-ir-validated-artifact-development-route-probe-result/v1
parent lock: skill-ir-validated-artifact-development-lock/v1
experiment: law-to-markdown-validated-artifact-development-v1
```

Execution freeze 必须绑定父 lock 的路径与 digest，并额外绑定实际执行所需的通用 model runner、
deterministic scoring、route probe、resource probe、bare-agent adapter 和本阶段 orchestration
实现 digest。父 lock 继续权威定义 source、task、package、系统、模型、adapter identity、分母和
gate；execution freeze 只补充“这些模型行怎样被执行、评分和与 direct 行合并”的 provenance，
不得覆盖父 lock 的任何字段。

执行阶段固定为：

1. `route-probe` 重新验证父 lock、execution freeze 和全部绑定实现，运行 resource probe，
   再执行冻结矩阵中 `original × 第一个 development task × repetition 1` 的单条模型探针；
2. route 结果只持久化身份、状态、退出码、超时和耗时，不保存命令、stdout、stderr 或模型正文；
3. `execute` 再次验证全部 digest 和 resource contract，只接受同一输出目录内、同时匹配父 lock
   digest、execution freeze digest、experiment、model、case 和 system 的成功 route probe；
4. 模型臂只执行冻结的 12 行，`retries=0`；direct 臂在同一批次重新执行冻结的 4 行，不复用
   历史 direct 结果；
5. 合并后必须恰好得到 16 条 raw 与 16 条 scored row，再运行父 lock 已冻结的 gate；
6. raw transcript、workdir 和 provider log 留在本地；提交 compact route/resource、scored、
   cost、summary 和 gate evidence；
7. gate 失败是有效实验结果，必须原样冻结；不得补跑、调 scorer、重编 package 或执行 held-out。

该从属 freeze 是对实施 provenance 缺口的保守修复，不改变第 19 节已预注册的实验假设、数值
阈值或主张边界。以后若通用 runner、adapter 或 orchestration 实现改变，必须建立新 execution
freeze，不能覆盖 v1。

## 21. Law Validated Artifact Held-out Contract

Law development gate 通过后，held-out 使用全新的、只消费冻结产物的实验身份：

```text
lock: skill-ir-validated-artifact-heldout-lock/v1
plan: skill-ir-validated-artifact-heldout-plan/v1
route: skill-ir-validated-artifact-heldout-route-probe-result/v1
gate: skill-ir-validated-artifact-heldout-gate-report/v1
experiment: law-to-markdown-validated-artifact-heldout-v1
```

Held-out lock 必须绑定并递归验证：

- 已通过的 development lock 与 execution freeze；
- development `gate-report.json` 和 `summary.json` 的 digest，且 gate 必须为 passed、16/16 rows、
  4/4 quartets、0 infrastructure；
- 同一 source/tasks/resource/scorer/base IR/source audit 与冻结 package；
- held-out planner、runner 和 gate implementation digest；
- execution freeze 已绑定的 model runner、scoring、route/resource 与 bare-agent 实现。

Package provenance 的 `constructionSplit=development` 和 development `taskContract.taskIds` 是
构造来源记录，不是 held-out 运行授权列表。Held-out validator 必须反向确认两个 held-out task
不在该构造列表中，且 provenance 保留 `held-out` forbidden evidence class；不得重编 package、
追加 held-out task ID 或修改 provenance 来“授权”评测。

矩阵固定为：

```text
tasks:
  law-to-markdown-regulation-heldout-001
  law-to-markdown-manual-heldout-002
systems:
  no-skill | original | ir-static | validated-artifact
model/adapter/host/context:
  xty/gpt-5.6-sol / bare-agent / Windows / clean
repetitions:
  2
rows:
  16 rows / 4 quartets
```

前三个系统共 12 行使用冻结模型和 adapter；artifact 4 行继续直接执行同一 package，不调用模型。
`plan` 无 API；`route-probe` 运行 resource probe 和首个 held-out original 样本；`execute`
重新验证全部 digest，只接受同输出目录中绑定 held-out lock digest 的成功 route，模型臂
`retries=0`，direct 臂在本批次重新执行。Development raw/scored/workdir 不得作为 held-out
runtime、scorer 或 compiler 输入。

付费前数值 gate 固定为：

- 16/16 raw 与 scored、4/4 完整四元组；
- artifact 4/4 success，总均分与两个 task 均分均不低于 0.85；
- 0 infrastructure、0 artifact hard-gate failure；
- 每个 `task × repetition` 的 artifact score 不低于
  `max(no-skill, original, ir-static)`，且任一 baseline success 时 artifact 也必须 success；
- 至少 1 个四元组中 artifact score 严格高于三条 baseline 的最高分；
- 缺行按固定分母中的 0 分/infrastructure 处理，重复或身份漂移直接拒绝。

Gate 成败都必须原样持久化。通过可形成 Law 单 skill held-out 证据，但仍不能证明 catalog
跨 skill 通用、跨模型/agent/OS 稳定或摊销 break-even；失败不得补跑、调 scorer、重编 package
或把 held-out 反馈写回 IR/artifact。

实际冻结结果为 16/16 rows、4/4 quartets、0 infrastructure；artifact 2/4、mean 0.725，
法规 task mean 0.85，manual task mean 0.60，2 pairwise regressions，gate failed。
Current Law package 不晋升，break-even 不计算。下一阶段通过第二 phenotype 的独立
development evidence 检验 catalog core 复用，不把本次 held-out failure 当作 compiler 输入。

2026-07-24 已完成 `experimental-design` 的本地第二 phenotype 机制验证：同一 catalog、
manifest、execution-plan、package validator 和 runtime 未修改，新增 adapter 编译 seeded
randomization process/check/schema/template/tool-plan。Stratified 与 cluster 两个 development
fixture 均为 runtime/scorer pass、score 1.00、model token 0。该证据只解除“catalog core
是否只能服务 Law”的工程单例问题；真实模型对照、冻结 development gate、held-out 和
break-even 仍未发生。

现有 `pre-ir-calibration-lock/v1` 绑定 `tasks-authored`，现有 validated artifact development
orchestration 又冻结 Law literal。下一步必须在不改旧 lock/digest 的前提下建立 skill-neutral
baseline/development lock，再执行 experimental-design calibration。任何无 lock 的直接付费
runner 输出都不进入研究证据。

## 22. Skill-neutral Runnable Baseline Calibration

第二 phenotype 不复用或修改 `skill-ir-pre-ir-calibration-lock/v1`。该旧合同只描述
`tasks-authored`、无 base IR 的 pre-IR 生命周期；把 `runnable` 加入其 execution guard 会改变
Law 历史实验语义。新的通用身份固定为：

```text
lock: skill-ir-baseline-calibration-lock/v1
plan: skill-ir-baseline-calibration-plan/v1
route: skill-ir-baseline-calibration-route-probe-result/v1
gate: skill-ir-baseline-calibration-gate-report/v1
```

Lock 中的 `skillId`、两个 development task、model route/family 和 adapter version 是数据字段，
不得在 schema 或 runner 中写成 Law/Experimental-design literal。生命周期固定为
`corpus=pilot`、`status=runnable`，并要求 manifest 中 source/tasks/resource/base IR/source
audit 路径与 lock 完全相同。验证器必须递归检查：

- source、tasks、resource contract、deterministic scorer、base IR 与 source audit 的 digest；
- base IR schema 与逐节点 source audit；
- planner、runner、gate、real-agent model runner、scoring、route/resource probe 和 bare-agent
  adapter 的 implementation digest；
- 两个 task 均为 development，且系统恰为 `no-skill | original`。

Calibration 矩阵固定为 clean/Windows/skvm、2 tasks × 2 repetitions × 2 systems，共 8 rows /
4 pairs，模型重试为 0。`plan` 不需要 API key；`route-probe` 先做 resource probe，再执行第一个
development task 的 original repetition 1，只保存脱敏身份和状态；`execute` 必须重新验证所有
digest，只接受同一输出目录内匹配 lock、model、case 和 system 的成功 route evidence。

Gate 使用预注册逻辑分母，拒绝重复或 model/adapter/task/split/panel 身份漂移，并要求：

- 8/8 scored rows、4/4 complete pairs；
- infrastructure failure 为 0；
- no-skill 至少有一个 semantic failure，避免基线饱和；
- 至少一个 pair 的 success/score/criterion outcome 不同，证明 skill arm 可观察；
- `requireOriginalNonRegression=false` 仅表示 calibration 不以方向作硬门，不隐藏 per-pair
  regression；总表和逐 pair 仍必须完整报告。

Gate 通过只设置 `fullDevelopmentPlanningAllowed=true`，允许另行起草
`no-skill | original | ir-static | validated-artifact` development lock；不允许 held-out、
scorer/task/package 调优、PGO、主 claim 或直接复用本次输出作为 Final artifact。Gate 失败同样
是冻结的任务/基线诊断证据，不得通过补跑或事后改阈值修复。

首个实例固定为 `experimental-design-baseline-calibration-v1`：

```text
model: xty/gpt-5.6-sol / gpt
adapter: bare-agent / workspace-experimental-design-baseline-v1
tasks:
  experimental-design-stratified-dev-001
  experimental-design-cluster-dev-002
```

付费前必须依次完成并提交：通用实现、数值 gate、experimental-design lock、lock-bound dry-run、
resource probe 与 route probe。Held-out task 不得进入 plan、route、execute、scorer 输入或
结果目录。

2026-07-25 唯一 calibration 已执行：resource/route 均为 `ok`，8/8 rows、4/4 pairs、
0 infrastructure。No-skill 与 original 都是 0/4 success、mean 0.30，token 分别为 45265 与
81822，四个 pair 的 criterion outcome 完全相同，`differingPairs=0`，因此 gate failed。

后验 failure audit 只用于解释冻结结果，不修改输入：四个 original 行注入的 `SKILL.md` digest
与上游 source 完全一致，task prompt 也为合法 UTF-8；两臂均保护输入并生成三项文件。Scorer
却额外要求 task prompt 未声明的 `experimental-design-plan/v1`、四个精确 method enum、
xorshift32 唯一 allocation schedule 和逐字英文 report label。上游随机化脚本使用
`numpy.default_rng`，不存在同一唯一序列。故本批只证明当前 benchmark contract/scorer
不对齐，不能证明模型能力、original skill 质量或 artifact 增益。

该 gate failure 永久阻断当前 lock 的四臂 development 与 held-out。当前 task/scorer/package/
IR 不从输出回改，也不得补跑。下一阶段必须先建立付费前 benchmark contract coverage audit：
每个硬约束和确定性期望都要映射到用户可见 task 或合法 public source；多种语义有效实现必须
能通过。任何修正版必须使用新 task/scorer/lock 身份，且不得消费本批模型正文作为 expected。

## 23. Pre-paid Benchmark Contract Audit

### 23.1 目的与边界

任何新的付费 calibration、development 或 held-out lock，必须先通过
`skill-ir-benchmark-contract-audit/v1`。该审计回答两个问题：

1. scorer 实际强制的每项要求是否在 agent 可见的 task、公开 skill source 或 task fixture
   中有可追溯依据；
2. scorer 是否接受公开合同允许的等价实现，而非只接受 evaluator 私有的 enum、算法、顺序或
   逐字模板。

审计不是 scorer，也不是自动证明 scorer 完整正确的程序。Scorer requirement inventory 仍需
书面评审；工具只负责验证清单与源码锚点、公开证据、development criterion 和可执行 canary
之间不存在漂移。Audit manifest、report 和 canary 不能被 lowering、package compiler、
runtime validator、repair prompt 或模型上下文读取。

### 23.2 双证据链

每条 requirement 必须同时具有：

- `scorerAnchors`：绑定 scorer path/digest 和实际强制该要求的源码片段，只用于证明“确实在判”；
- `publicEvidence`：只能来自 `task-prompt`、`skill-source` 或 agent 可见的
  `workdir-fixture`，用于证明“事先可知”。

Evaluator payload、base/final IR、artifact package、历史 result、held-out task、模型输出和
人工事后解释都不是合法 public evidence。`closed-enum`、`deterministic-algorithm` 和
`literal` 若要求精确相等，必须能在公开证据中找到相同合同；否则 fail closed。

### 23.3 Requirement 与等价策略

v1 的 requirement class 固定为：

```text
presence | schema | closed-enum | deterministic-algorithm | literal | semantic-invariant
```

每项同时声明：

```text
exact-public-contract | semantic-equivalence | safety-invariant
```

- `exact-public-contract` 只适用于确实公开的文件名、字段名、枚举、算法或固定文本；
- `exact-public-contract` 必须在每个适用 development task 分支独立成立；
- `semantic-equivalence` 必须为每个适用 task 分支提供 `alternative-valid` canary；
- `safety-invariant` 可拒绝危险实现，但每个适用分支都要给出 canonical-valid 与
  invalid-control；
- requirement 默认覆盖其 criterion 的全部 task；只适用于部分分支时必须显式声明
  `requirement.taskIds`。

Canary 通过真实 custom evaluator 读取隔离 workdir。`alternative-valid` 表示其满足 task/source
公开合同，因此 scorer 必须通过；若被拒绝，audit 失败。Canary fixture 只用于本地审计，不得
复制进 task prompt、package 或 repair。

### 23.4 完整性与输出

Manifest 只审计 development task，并必须：

- 精确绑定 tasks、scorer 和 source digest；
- 覆盖 scope 内全部 criterion，且 hard-gate 身份与 tasks 一致；
- 每个 criterion 至少映射一个 requirement；
- 每个 requirement 的源码锚点和公开证据都可定位且 digest 未漂移；
- 高风险等价策略具有所需 canary，且 canary task/criterion 均在 development scope；
- canary fixture 目录树 digest 已绑定，且不含 symlink、junction 或 special file；
- bound file 与 canary 根的真实路径留在仓库根内，执行快照复制后重新验 digest；
- custom evaluator 的 registry path、冻结 source digest 与加载后对象身份一致；
- report 绑定 manifest digest，且不序列化 evaluator gold、secret、模型正文或 held-out 内容。

输出状态只有 `passed` 或 `failed`。未通过 audit 的 skill 仍可保留为真实来源和工程诊断样本，
但其 benchmark 结果从主 claim 降为 `support-real`；历史 raw/scored row 不改写。重新设计
benchmark 必须使用新 task/scorer/audit/lock 版本和新 development fixtures，通过本地
differential tests 与书面评审后才允许申请新的 API 运行。

### 23.5 Wave A 应用顺序

先对 `env-manager`、`law-to-markdown`、`experimental-design` 三个 Wave A pilot 运行同一
审计。当前 experimental-design v1 已知失败，现有 task/scorer/package/lock/result 永冻；
本阶段不得重跑 API、不得进入四臂 development 或 held-out。三个审计结果完成后，再决定是否
单独设计 experimental-design benchmark v2。

2026-07-25 首次 Wave A 审计已完成，三个 v1 benchmark 均为 `failed`：

- `env-manager`：两个 development task 的精确 schema rule 与分类成员金标均没有完整公开合同；
- `law-to-markdown`：静态映射通过，但法律与非法律两个分支的 alternative-valid 审核措辞
  都被 scorer 拒绝；
- `experimental-design`：plan 字段合同的两个 canary 均通过；assignment、allocation 与中文
  report 的六个 task-isolated canary 均被拒，同时 schema version、method enum、method
  mapping 与 strict-object policy 未公开。

因此 corpus 中三个 pilot 的未来 `evidenceWeight` 统一降为 `support-real`。该结论只降低
benchmark 结果对主 claim 的权重，不否定真实 source、runner、artifact 和 failure mechanism
的工程证据。下一阶段若继续 experimental-design，必须从 benchmark v2 的公开合同与
differential fixtures 开始，不能直接修改 v1 scorer。

## 24. Benchmark v2 修正设计：语义主指标与确定性 Profile 分离

### 24.1 设计动机与身份

Task 8.10 暴露了一个比“模型不够强”更基础的问题：当前
`experimental-design` v1 的 scorer 把若干未在公开 task/source 中声明的 schema、
method enum、唯一 schedule 和逐字报告内容当成了成功条件。此类 benchmark 即使
能稳定地产生分数，也不能可靠地区分 `no-skill`、`original` 和优化产物。

因此 v2 是全新的 benchmark 身份：

```text
skill: experimental-design
benchmark: experimental-design-v2
catalog/package: 与 v1 分离
construction split: 2 development tasks
evaluation split: 2 held-out tasks
```

v1 的 task、scorer、audit、lock、package 和结果永久冻结，不覆盖、不迁移、不回写。
v2 的第一目标是修复测量合同；它不是对 v1 结果的补跑，也不是直接修改 IR
算法的理由。

### 24.2 主成功标准：公开语义合同

v2 的主 scorer 只判定最终 workdir 中可以由 agent 观察到、由公开合同推出的
语义属性。初版主指标固定覆盖以下五个方面：

1. **输入保持**：受保护的 `study.json` 内容和相对路径未被篡改；
2. **产物完整**：公开要求的设计计划、allocation 和报告均存在，能被解析，
   且没有路径逃逸或额外写入受保护区域；
3. **方法适用性**：方法选择满足公开输入中的 cluster、strata、sequential
   enrollment 等条件，接受语义等价的实现；
4. **分配安全性**：assignment unit、analysis unit、allocation unit 的关系
   一致；分配覆盖完整、无重复或越界，cluster/stratum 约束不被破坏；
5. **报告一致性**：报告能说明实际生成的设计、seed、单位和关键限制，内容
   允许语言和排版变化，不要求 evaluator 私有的逐字模板。

每个 criterion 返回 `[0, 1]` 的确定性分数。`primarySemanticScore` 固定为：

```text
0.10 * inputIntegrity
+ 0.10 * artifactContract
+ 0.25 * designSemantics
+ 0.35 * allocationSafety
+ 0.20 * reportConsistency
```

一次运行的 `primarySuccess=true` 必须同时满足：

```text
infrastructureFailure = false
inputIntegrity = 1
artifactContract = 1
designSemantics = 1
allocationSafety = 1
reportContradiction = false
primarySemanticScore >= 0.95
```

前四项和 `reportContradiction=false` 是 hard gate。报告允许缺少至多一个非关键
说明项，但不能出现与 `study.json`、plan 或 allocation 相冲突的值。为使阈值可执行，
`reportConsistency` 由四个等权原子检查组成：

1. 结构化 evidence block 可解析；
2. study、assignment/analysis unit、response 和 seed 与公开输入一致；
3. allocation path、行数和 arm counts 与实际 allocation 一致；
4. design properties 与 warnings/limitations 和 plan 一致。

每个原子通过得 `0.25`，否则得 `0`；任何已出现但与可观察事实冲突的值同时设置
`reportContradiction=true`。因此其余四项全通过时，报告四项中至少三项通过才能达到
`0.95`。Task-level development gate 在付费前另行冻结，但不得低于：全部预注册运行
无 infrastructure、`primarySuccess >= 3/4`、mean `primarySemanticScore >= 0.95`、
每个 development task 至少一次成功、相对 baseline 无 hard-gate regression。

主 scorer 不得要求没有公开来源的版本号、封闭 method enum、特定 PRNG、
唯一行顺序、唯一中文措辞或隐藏字段。除输入保持、路径安全等硬约束外，
每项语义规则都必须有 canonical-valid、alternative-valid 和 invalid-control
三类本地 differential fixture。

### 24.2.1 方法等价的公开判定

`method` 可作为自由文本写入 plan，但不参与相等比较。主 scorer 只检查可由
`study.json + allocation` 复算的公开 `designProperties`，初版字段固定为：

```json
{
  "preservesAssignmentUnits": true,
  "balancesGlobally": true,
  "balancesWithinStrata": false,
  "supportsSequentialEnrollment": false
}
```

这些字段是公开 schema，允许额外字段，不要求 schema version，也不形成 method enum。
Plan 中的 `designProperties` 必填。四个公开布尔字段必须与 scorer 的派生值逐项相等；
缺字段、类型错误或值不一致时 `designSemantics=0`。Scorer 从 `study.json` 和最终
allocation 推导属性：

- `assignmentLevel=cluster` 时，`preservesAssignmentUnits` 必须为 true，且同一 cluster
  不能被拆到多个 arm；
- 无 strata 时，全局各 arm 计数最大差不超过 1，`balancesGlobally=true`；有 strata
  时仍报告实际全局平衡值，但主成功只强制每个 stratum 内的平衡；
- units 含非空 `stratum` 时，`balancesWithinStrata` 必须为 true，每个 stratum 内
  各 arm 计数的最大差不超过 1；
- `sequentialEnrollment=true` 时，`supportsSequentialEnrollment` 必须为 true；
  每个长度为 arm 数量的完整 enrollment block 内，每个 arm 恰出现一次，block 内
  顺序任意，最后不足一个 block 的尾部只要求 arm 计数最大差不超过 1；
- allocation 的 `order` 必须等于对应 unit 在公开 `study.units` 中的 1-based 位置；
  CSV 物理行顺序可以变化，但 `order` 重复、断档或与 unit 身份不一致时 coverage 失败；
- 所有任务都要求全部 assignment units 恰好出现一次且 arm 合法；无 strata 时强制
  全局 arm 计数最大差不超过 1，有 strata 时只强制每个 stratum 内的该不变量；无
  strata 的全局失衡必须使 allocation safety 失败，不能只作为 diagnostic property。

Seed 在主 scorer 中只检查 plan/report 与公开输入一致，不据 seed 推导唯一 schedule。
同 seed 重放是否 byte-for-byte 一致只进入 deterministic profile 次指标。

#### 组合矩阵与判定顺序

v2 初版支持 assignment level、strata 和 sequential enrollment 的全部八种组合。
所有组合都先把 `units[]` 解释为不可拆的 assignment units，再按以下固定顺序组合：

```text
1. validate assignment units
2. if strata: partition units by stratum
3. within each partition:
     if sequential: preserve that partition's input order and check arm-sized blocks
     else: check final arm-count balance
4. if no strata: apply step 3 once to the full unit list
5. compute global diagnostics and the four designProperties
```

| Assignment | Strata | Sequential | 主语义规则 |
|---|---:|---:|---|
| individual | no | no | 全局计数最大差不超过 1 |
| individual | yes | no | 每个 stratum 内计数最大差不超过 1 |
| individual | no | yes | 全局按 arm-sized enrollment blocks 平衡 |
| individual | yes | yes | 每个 stratum 维护独立 block stream；顺序是全局输入投影到该 stratum 后的稳定顺序 |
| cluster | no | no | cluster 不拆分；cluster 计数全局平衡 |
| cluster | yes | no | cluster 不拆分；每个 stratum 内 cluster 计数平衡 |
| cluster | no | yes | cluster 不拆分；按 cluster enrollment 顺序做全局 blocks |
| cluster | yes | yes | cluster 不拆分；每个 stratum 对 cluster 顺序维护独立 block stream |

`assignmentLevel=cluster` 时，每个 `units[]` 元素就是一个不可拆分的 cluster
assignment unit，stratum 也必须位于这一层。`assignmentUnit` 保持非空自由文本，
schema 不按 `participant`、`clinic` 或其翻译做词法分类；“声称使用成员级 assignment”
仅指 unit 内出现 `members`、`memberAssignments` 等显式结构化嵌套。以下输入在
public task schema 层直接拒绝，不交给 scorer 临场解释：

- assignment level 不是 `individual | cluster`；
- arms 少于 2 个、arm 重复、unit ID 重复或 unit ID 为空；
- 只有部分 units 声明 stratum，或 stratum 为空字符串；
- sequential enrollment 不是布尔值；
- cluster task 在 unit 下再嵌套显式成员级 allocation/assignment 结构。

### 24.2.2 报告一致性的结构化证据

`design-report.md` 的自然语言正文不做关键词或逐字匹配。公开 task contract 要求报告
包含且只包含一个结构化 evidence block。语法固定为：

````text
```json design-evidence
{ ...one strict JSON object... }
```
````

- opening line 去掉行尾 ASCII 空格后必须恰为 `````json design-evidence``；
- closing line 去掉行尾 ASCII 空格后必须恰为 `````；
- JSON 使用 UTF-8、不得有注释、尾随逗号或重复 key；
- 缺失、多个 block、非法 JSON、非 object 顶层或重复 key 时，
  `reportConsistency=0`，但不计 infrastructure；
- key 顺序、缩进、自然语言正文、method 自由文本和未冲突的额外字段不受限。

该 block 至少包含：

```json
{
  "studyId": "public-study-id",
  "assignmentUnit": "public-assignment-unit",
  "analysisUnit": "public-analysis-unit",
  "response": "public-response",
  "seed": 0,
  "allocationPath": "design/allocation.csv",
  "allocationRows": 0,
  "armCounts": {},
  "designProperties": {},
  "limitationFlags": []
}
```

Report 中的 `designProperties` 也必填，四个公开布尔字段必须与 plan 中的值以及 scorer
派生值逐项相等。Plan 缺失或不一致使 `designSemantics=0`；report block 中缺失只损失对应
report atom，出现与 plan/派生值不同的布尔值则固定设置 `reportContradiction=true`。

`limitationFlags` 是顺序无关、无重复的公开字符串集合，必须与 source-derived 集合相等：

```text
cluster-assignment                    assignmentLevel = cluster
stratified-assignment                 所有 units 都有非空 stratum
sequential-enrollment                 sequentialEnrollment = true
analysis-unit-differs                 analysisUnit != assignmentUnit
randomness-not-statistically-audited  始终存在；主 scorer 不检验随机数质量
```

额外自然语言 `warnings` 可以存在且不参与计分；scorer 不比较 warning 措辞。结构化
`limitationFlags` 缺失会损失第 4 个 report atom，值与派生集合不一致则设置
`reportContradiction=true`。

Scorer 只将 evidence block 与 `study.json`、plan 和实际 allocation 交叉校验；自然语言
正文只供人阅读。Alternative-valid fixtures 必须覆盖中英文正文、不同 key/row 顺序、
自由 method 名称、自由 warnings 和不同但满足同一不变量的 allocation。Invalid-control
必须分别覆盖 cluster 拆分、重复/缺失 unit、非法 arm、stratum 失衡、sequential block
失衡、重复/多个 evidence block、错误 limitation flags 以及报告证据与实际文件冲突。

### 24.3 次级指标：确定性 Profile

确定性 profile 仍然有工程价值：它可以把固定的 schema、模板、工具计划、seed
处理和可复现的 allocation 过程固化进 artifact，从而研究重复调用时的稳定性与
成本。但它不是 v2 的主成功条件，必须独立记账：

```text
primarySemanticScore
deterministicProfileScore
profileReproducibility
artifactBytes
processCost
validationCost
modelGenerationTokens
modelRepairTokens
```

只有当某个确定性行为本身被公开 task/source 明确要求时，profile 才能作为
对应的硬门禁。否则 profile 不得覆盖语义 scorer，也不得因为模型选择了另一种
合法的 allocation 顺序而判定任务失败。报告中必须同时给出“语义通过但 profile
不同”的情况，避免把 benchmark-specific overfitting 写成优化成功。

### 24.4 v2 的公开证据与 audit

v2 必须在付费运行前通过新的 audit。audit 只验证 benchmark 合同，不参与
runtime/package/repair，也不进入模型上下文。合法证据仅限：

```text
task-prompt
skill-source
agent-visible workdir fixture
public resource contract
```

以下内容一律禁止作为 scorer 或 artifact 的证据：

```text
evaluator expected / private rubric
held-out prompt or result
model output copied into expected
历史 raw/scored result
package-generated answer
secret、绝对路径和未公开解释
```

v2 audit 的最小通过条件是：每个 development criterion 都有公开证据锚点；
alternative-valid fixture 不因表面格式差异被拒；invalid-control 能触发对应的
安全或语义失败；删除公开证据后，约束会降级为 `unconfirmed` 或明确失败，而
不会猜测隐藏金标。

Audit 的 differential role 还包含通用 `partial-control`：当 evaluator 按合同返回
`pass=true` 但 criterion 仅得部分分时，manifest 必须显式冻结 `expectedScore`。审计同时
比较 `pass` 与 score，不能把“未触发 hard gate”误写成“满分通过”。该角色只接受
`expectedPass=true`、`0 <= expectedScore < 1`，不允许按 skill ID 增加解释分支。

### 24.5 数据流与实验顺序

```text
2 development + 2 held-out task creation
    -> task-split freeze
    -> public task/source + source audit + public contract
    -> v2 scorer + development-only audit
    -> held-out freeze (before every API run)
    -> no-skill | original calibration
    -> source-audited base IR
    -> ir-static / artifact development
    -> development gate
    -> held-out consumption
```

development 只允许发现合同、IR、artifact 或 runtime 的问题；held-out 在 lock
冻结后只用于评估，永不进入 scorer、package、repair 或 profile 调参。audit 未通过
时不付费、不建立四臂 development lock、不运行 held-out。

### 24.5.1 Held-out 冻结与非消费式隔离

v2 的四个 task 在 Task 8.11.1 中一次性创作并冻结，但物理上分为：

```text
v2/development/tasks.json
v2/heldout/tasks.json
v2/task-split-freeze.json
v2/heldout-freeze.json
```

`task-split-freeze.json` 在 scorer 实现前提交，绑定 2+2 task IDs、两份 task file
digest 和 fixture tree digest。Scorer 和 differential audit 只允许读取 development
侧。`heldout-freeze.json` 在 scorer/audit 完成后、任何 development API run 前提交，
绑定 task-split freeze、held-out task IDs、fixture tree digest、scorer source digest
和创建提交。此后 held-out 内容与 scorer 均不得修改；若确有 scorer infrastructure bug，
只能废弃整个 v2 身份并建立 v3，不能原地更新 lock。

冻结文件的 SHA-256 以 `taskCommit` 中的 Git blob 原始 bytes 为权威。对受 Git text
normalization 管理的公开 Markdown/source 文件，工作区复核只容忍 CRLF 与 LF 的检出差异；
删除、替换、编码变化或任何非换行内容漂移仍必须拒绝。`public-contract-source-audit.json`
同样锁定 Git 规范化的 LF bytes，避免同一 provenance 在 Windows 与 Linux 得出不同摘要。

该隔离是**非消费式隔离**，不是实验者盲法：文件在仓库中可被人读取，但 development
代码路径不得消费其内容。边界固定为：

- benchmark audit manifest 和 differential fixture 只允许 development task IDs；
- scorer 接口只接收当前 criterion payload 和隔离 workdir，不得读取 corpus registry、
  package、lock 或其他 task 文件；
- base IR/source audit/compiler/package 只接收 source、resource contract、development
  public contract 和 development task projection；
- package manifest 必须保持 `constructionSplit=development`，并声明
  `held-out` 为 forbidden evidence class；
- PGO/repair 只接收 development raw/scored evidence；
- held-out runner 只有在 development gate report 通过后才能创建执行 plan，并只消费
  冻结 package，不得调用 compiler 或写回 IR。

文件不可见面通过输入类型、digest-bound allowlist 和测试约束，而不是依赖目录命名。
v2 实施必须包含以下负向测试：

1. audit manifest 引用 held-out task/path/digest 时拒绝；
2. development lock 含 held-out task 或 held-out fixture 时拒绝；
3. compiler/package input 出现 held-out ID、path、digest 或 canary token 时拒绝；
4. package 递归扫描不得出现 held-out task ID、fixture digest 或 sentinel；
5. scorer import/运行输入不得访问 task registry 或 held-out 根，序列化结果也不得包含
   held-out payload；
6. held-out task/fixture/scorer digest 在 freeze 后漂移时拒绝；
7. development gate 未通过、parent package digest 漂移或 execution plan 包含
   compiler/repair 节点时，held-out plan 创建失败；
8. held-out raw/scored output 传给 compiler、repair 或 profile feedback API 时拒绝。

只有以上隔离测试、本地 differential tests 和 v2 audit 全部通过，才能冻结 baseline
calibration lock。Held-out task 不参与 development audit 的 canary 设计，也不用于调整
`0.95` 阈值、criterion 权重或 hard gate。

### 24.6 泛化判定：Wave B 才是证据

v2 通过只能说明 `experimental-design-v2` 的测量方法可用，不能说明它自动适配
任意 skill。跨 skill 泛化必须在冻结 Wave A 方法后，使用未参与 v2 设计的 Wave B
skill（优先 `api-tester`）进行 replication：

- 使用同一通用 catalog、runtime、lock 生命周期和主 scorer 约束；
- 允许新增 skill adapter，但通用 core 不得按 skill id 增加分支；
- 记录 adapter 新增代码量、artifact kind 复用率、需要新增的 runtime/catalog
  分支数和 failure taxonomy；
- Wave B 不得反向修改 Wave A 的 task、scorer、package 或 gate；
- 若需要大量 skill-specific 特例，应将结论降级为“方法可迁移但 catalog 尚未
  泛化”，不能宣称任意 skill 自动优化。

### 24.7 成本与重复调用

token 节省只在包含编译成本的摊销实验中讨论。对重复调用次数 `N`，统一报告：

```text
totalOptimized(N) =
  compileCost
  + profileCost
  + packageGenerationCost
  + N * optimizedRuntimeCost

totalBaseline(N) =
  N * baselineRuntimeCost
```

至少需要 `N=1, 2, 5, 10` 的重复调用或等价的预注册 workload，分别列出模型、
确定性 process、validation 和 package 成本。没有同口径的 `compileCost` 和
`baselineRuntimeCost`，只能说 artifact 减少了运行期模型调用，不能说已经节省
总 token 或达到 break-even。

### 24.8 当前阶段的不可声称项

截至 2026-07-27，v2 task split、本地语义 scorer 和 development-only differential audit
已实现：五个 custom checks 只读取
payload 指向的隔离 workdir，严格 JSON 同时经 `JSON.parse` 与 duplicate-key 检查，
allocation 复用公开不变量 API，report 缺失/非法 block 返回 `pass=true, score=0`，只有
与可观察事实冲突时返回 `pass=false`。Development audit 的 42 个 canonical、alternative、
invalid 与 partial-score canary 全部匹配，compact report 为 `passed`；它只证明 v2 测量
合同通过本地审计。Held-out identity 随后以 audit 提交 `826de3b` 为 `inputsCommit` 冻结，
绑定 task-split、held-out tasks、scorer、audit manifest/report 与原 sentinel；production
verifier 会重算 commit/工作区字节、registry identity、passed report provenance 和 held-out
泄漏边界。该 freeze 只解除起草 baseline calibration lock 的前置阻塞，仍不构成 baseline、
IR/artifact 或优化证据。

在 v2 audit、development gate、Wave B replication 和摊销实验完成前，不得声称：

- v2 benchmark 一定比 v1 更准确，只能说它通过了预先定义的合同审计；
- 一个 skill 的 public profile 能自动适配其他 skill；
- artifact 在所有模型、context、agent 或 OS 上都更稳定；
- artifact 已经降低总 token 或已经达到 break-even；
- 当前 Final IR 已经是任意 skill 的最终最优表示。

本节优先级高于早期将 deterministic profile 与主成功率合并叙述的文字。后续
实现和结果文档必须沿用本节的指标分层。

### 24.9 v2 合并修订：真实物化增量合同

早期 v2 只枚举 `design/`，遗漏 workdir 根目录新增输出。随后建立的 v3 增加了根目录精确
白名单和独立 oracle，但真实 calibration 又发现该白名单把 runner 在 agent 启动前复制的 skill
resources 当成模型输出。该失败属于 benchmark/harness 物化污染，不是模型或 original skill
的语义失败。

由于 v2 尚无 API 结果，v3 也没有形成可用的研究结果，当前项目不再维护两个并行的下一代
benchmark。自本节起：

```text
唯一活跃 benchmark: experimental-design-v2
当前合同修订: materialized-delta/v1
历史 v1: 保持冻结
历史 v3 calibration: 仅保留失效诊断摘要，不参与 corpus、registry、freeze 或主 claim
```

旧 v2 task/freeze/audit 的 Git 历史继续提供演进 provenance；当前树中的 v2 文件允许按新的
`contractRevision` 和 `freezeId` 重建。该选择是研究实现收敛，不改写旧 compact report，也不
把 v3 模型输出用于 expected、task、scorer 或 artifact。

#### 24.9.1 Initial-workdir manifest

通用 runner 必须在 task fixtures 和可选 skill resource closure 全部复制完成后、agent setup/run
之前，为每条 run 生成：

```text
schema: skvm-initial-workdir-manifest/v1
location: run directory / initial-workdir-manifest.json
workdir relation: manifest 必须位于 workdir 外
entries: 按 POSIX 相对路径排序的 directory/file 记录
file evidence: type + SHA-256
forbidden: absolute path、文件正文、secret、symlink/junction/reparse/special entry
```

Manifest path 与 SHA-256 进入 plan/raw/scoring `RunResult` provenance。Agent 只能访问 workdir，
不能修改该 manifest。Manifest 缺失、digest 漂移、位于 workdir 内或包含不安全 entry 时，
scorer 记为 infrastructure failure。

#### 24.9.2 Final delta

Artifact contract 不再使用对所有系统相同的根目录名单。它比较 final workdir 与该 run 自己的
initial manifest：

1. 所有 initial entry 必须保留原类型；初始文件摘要不得变化。
2. 三个公开输出必须作为新增普通文件出现并保持可解析。
3. 除输出目录和三个公开输出外，不得新增其他文件、目录或特殊 entry。
4. 删除或修改 fixture/skill resource、路径逃逸、reparse/special entry 均 fail closed。
5. `no-skill` 和 `original` 可以有不同的 initial entries；scorer 只能接受各自 manifest 中实际
   记录的资源，不能按 source 名称为所有 arm 放宽 allowlist。

这保留了“只生成三个输出”的公开合同，也不会把 original 合法的 source closure 误判为模型
额外输出。

#### 24.9.3 付费前 materialization audit

Benchmark contract audit 之后、route probe 之前增加无模型 materialization audit。Audit 必须
调用与真实 `executeRun` 相同的 workspace preparation 函数，至少验证：

- no-skill 初始树只有 task fixtures，original 额外包含摘要正确的 source resources；
- 两臂 protected input 摘要均正确，manifest 均在 workdir 外且 agent 不可写；
- `final=initial` 时只报告三个 required output 缺失，不报告 initial resource 为额外输出；
- 合法添加三个输出后 delta 通过；额外文件、初始文件修改/删除和 reparse entry 分别失败；
- materialization audit 的 compact report 不保存绝对路径、文件正文、secret 或 held-out 内容。

Audit 未通过时不允许 route/API。它是通用文件型 skill benchmark 的测量门槛，不是 Skill IR
优化 pass。

#### 24.9.4 v3 退役与 oracle 合并

v3 的 hard-coded reference vectors、metamorphic row reorder、arm label 双射、自由 method 和
invalid controls 合入 v2 oracle tests。当前树删除 v3 evaluator 注册、v3 corpus 条目、v3
task/freeze/audit/lock 及重复实现，防止后续误调度。2026-07-27 的已付费 v3 calibration 压缩为
单份历史失效诊断，明确 `methodEvidence=false`、`promotionAllowed=false`。

只有本节修订后的 v2 完成 task/freeze/audit/materialization audit、书面冻结 baseline lock，
才允许执行一次新的 `no-skill | original` calibration。不存在自动创建 v4；以后只有在 v2
形成有效 development/held-out 证据后出现不兼容的研究合同，才讨论新主版本。

#### 24.9.5 Runtime crash 与校准有效性

修订后的 v2 首个 8-row 真实 calibration 在 `xty/gpt-5.6-sol`、Windows、bare-agent、
0 retries 下出现 3 个 Bun `1.3.14` internal assertion crash。原始 raw 作为付费证据不重写；
tasks-authored pilot 专用的 pre-IR normalization 必须从非零退出与冻结 stderr crash signature
推导 `runStatus=adapter-crashed`，再交给通用 scoring 生成 `failureType=infrastructure`。该开关
只能与 `--corpus=pilot --allow-tasks-authored` 同时使用，不能改变普通 corpus 或历史 artifact 评分。

Pre-IR pair 只有两臂均非 infrastructure 时才可比较。Report 必须显式输出
`comparable` 和 `comparablePairs`；没有可比较 pair 时 `originalDirection=inconclusive`，不得用
crash 行的零分推断 skill 方向。Infrastructure 行仍保留在冻结总分母和 token 缺失口径中，
但不能构成 semantic failure、paired delta 或 model/skill 效果。

本轮 gate 因 3 infrastructure failure 失败，只有 1/4 pair 可比较且两臂均为 1.0；因此不允许
base IR audit、held-out、scorer 调参或优化 claim。Failure classification 收敛为新增 pre-IR
normalization 与 gate reporting，不改动历史冻结的通用 runner/scoring bytes，也不改变 v2 task、
public contract、evaluator、threshold、freeze 或 lock。原批次保持冻结，不补跑失败行。若继续，
必须先用独立 calibration identity
和新 lock 预注册稳定 SkVM execution runtime，再完整运行新矩阵；这不是 v3/v4 benchmark。

#### 24.9.6 Stable execution runtime qualification

后续 calibration 保持 `experimental-design-v2` 与 `materialized-delta/v1` 不变，只替换并冻结
执行载体。运行时资格使用独立身份 `skill-ir-execution-runtime-qualification/v1`，首个目标载体为
由当前源码编译的 Windows `skvm.exe`。资格报告只属于 infrastructure evidence，固定
`methodEvidence=false`，不得进入 scorer、IR、artifact、PGO、模型比较或主 claim。

资格流程固定为：

```text
build compiled executable from a committed source tree
-> bind executable SHA-256, source commit, Bun version, platform and architecture
-> run 20 sequential local --help probes
-> require 20/20 exit code 0, zero timeout and zero Bun crash signature
-> freeze compact qualification report
-> bind report + executable in a new calibration lock
```

探测次数和零失败阈值不得从探测结果反推。报告不保存绝对路径、环境变量值、secret 或命令
stderr 正文，只保存失败分类和计数。可执行文件本身是本机实验载体，不提交仓库；新 lock 必须
绑定其仓库相对 locator、SHA-256、qualification report digest、构建源码提交和 direct command
mode。Compiled runtime 还必须在 lock 中显式绑定仓库相对 `cacheRoot`；pre-IR runner 只在
route/execute 子进程作用域内将其解析为 `SKVM_CACHE`，完成后恢复父进程原值。缺文件、
digest/commit/platform/cache-root 漂移或资格报告非 `passed` 均 fail closed。不得依赖调用者
预先设置的隐式 cache 环境。

最终执行锁还必须逐文件绑定创建 plan、运行 route probe 和 spawn agent 的 orchestration
源码摘要。当前最小集合是 `pre-ir-calibration-run.ts`、`route-probe.ts` 与
`real-agent-run.ts`；任一摘要漂移都阻止 route/execute。该绑定避免只冻结 child binary、却让
parent spawn 语义在实验之间悄然变化。

为避免改变普通 corpus 和历史 execution freeze，direct executable 投影只允许在
`pre-ir-calibration-run` 读取上述 runtime-qualified lock 后发生：原计划命令必须以
`bun run skvm run` 开头，投影结果固定为 `<qualified executable> run ...`，其余参数逐项保持。
旧 `skill-ir-pre-ir-calibration-lock/v1|v2` 继续使用原命令，不允许隐式读取环境变量覆盖运行时。

本地资格通过只解除 route probe 前的 infrastructure 阻塞，不证明真实 agent loop 稳定。必须
使用新的 calibration identity 完整运行 8 行、`retries=0`；只有零 infrastructure 才允许解释
paired semantic result。新批次若仍出现任一 infrastructure failure，整批冻结并停止，不补跑
失败行、不修改 benchmark，也不把失败归因于 skill 或模型能力。

首个 compiled lock 的 route probe 在 API 调用前以 exit 1 失败：binary 默认解析到
`~/.skvm`，看不到仓库 `.skvm/skvm.config.json` 中的 `xty/*` provider route。无 API 的
`config show` 对照确认，同一 binary 绑定仓库 `.skvm` 后可观察到 route 和 gateway。该结果冻结
为 config-locator preflight failure；修复使用新 calibration identity/lock，不回写首个 lock，
不重建 benchmark，也不将其计作模型或 skill failure。

第二个 config-bound identity 暴露 Bun.spawn 没有可靠继承父进程运行中修改的环境；修复后
第三个 identity 显式向 child 传入 lock-bound env，并冻结 parent orchestration 摘要。其 resource
probe 通过，route probe 运行 56.79 秒后以 exit 3、`status=agent` 结束，未超时且未创建任务
产物。由于 compact route contract 不保存 stderr/模型正文，归因只能冻结为
`unresolved-agent-or-runtime-exit`，不得推断为 benchmark 语义、skill、模型能力或 token 结果。
该 identity 不补跑，完整 8 行、评分和 gate 均不执行，base IR audit 与 held-out 继续禁止。

#### 24.9.7 Fetch-active runtime qualification

独立 root-cause probe 使用同一 qualified binary、模型、task、skill、cache route 和新复制的初始
workdir，在 158.69 秒后再次 exit 3。该次 stderr 明确包含 Bun `1.3.14`、Windows x64、
`fetch(11)`、`panic(main thread): Internal assertion failure` 和 `Bun has crashed`；三个目标产物
仍未创建。该 probe 是 infrastructure diagnosis，`methodEvidence=false`，不进入 benchmark 分母、
模型能力比较、skill 效果或 token 指标。

因此既有 20 次 `--help` 只保留为 startup qualification，不能再单独支持“stable execution
runtime”。下一 runtime identity 必须同时满足：

```text
startup qualification
-> compact route diagnostic with closed failure codes and no stdout/stderr body
-> one preregistered fetch-active real-agent route
-> route exit 0, no timeout, no Bun crash, required outputs materialized
-> only then freeze and run the 8-row development matrix
```

Diagnostic code 初版封闭为 `none | timeout | bun-internal-assertion | bun-crash |
provider-auth | provider-rate-limit | provider-5xx | provider-network | adapter-error |
nonzero-unclassified`。结果只允许保存 exit/status、runtime version、byte counts、SHA-256 和封闭
code；禁止保存命令、绝对路径、环境值、API key、stdout/stderr 正文、模型文本或 task output。
旧 route/preflight/result 保持不可变。候选 Bun runtime 必须作为本地 pin 下载、记录版本/revision
和二进制 SHA-256，不得原地升级用户全局 Bun；失败候选冻结后停止，不靠重复运行筛成功样本。

#### 24.9.8 Fetch-qualified matrix 与 transport 隔离

Bun 1.3.13 候选通过 20/20 startup 和单条 fetch-active route 后，必须由新的
`skill-ir-fetch-qualified-pre-ir-calibration-lock/v1` 同时绑定候选 lock、fetch-active report、
compiled executable、startup report 和当前 parent orchestration。资格样本不进入 8-row 分母；
最终 calibration identity 仍要独立通过 resource/route preflight，再按 0 retries 完整执行。

2026-07-27 的 8-row 矩阵完整落盘，但其中两行再次触发 Bun 1.3.13 Windows x64
`fetch` internal assertion。Gate 因 `infrastructureFailures=2` 失败，只有 2/4 pair 可比较，两个
score delta 分别为 `+0.3` 和 `-0.3`，所以 `originalDirection=mixed`。该结果只说明 Bun 小版本
替换没有消除 Windows fetch crash，不允许 base IR audit、held-out、模型能力判断或 Skill 效果
claim；同一 identity 不补跑。

下一 execution candidate 不再继续筛 Bun 小版本，而使用显式、摘要绑定的外部 HTTP transport。
首选 Node helper：agent loop、prompt、tool、task、scorer 和模型保持不变，只把
OpenAI-compatible request/response 的网络 I/O 移出 Bun `fetch`。默认 provider 行为不隐式改变；
helper 只能由新 runtime lock 显式启用，node executable、helper source、父编排和 compact
qualification report 都必须绑定摘要。它先通过本地协议测试和单条 fetch-active qualification，
未过时不得建立新的 8-row identity。

#### 24.9.9 Node HTTP matrix 结果与 source-runtime 假设

`executable-semantic-artifact/v2` benchmark、任务、scorer、模型和阈值保持冻结后，Node HTTP
候选通过本地协议测试、20/20 startup、单条 fetch-active qualification 和最终 route preflight。
独立 8-row matrix 也完整写出，但其中两行仍以 Bun 1.3.13 Windows x64 internal assertion、
exit 3 结束。两份 stderr 与旧 transport 失败具有相同 Bun crash report signature；新失败不再
出现 `fetch(n)` counter，而分别记录 `spawn(9)`、`spawn(12)`。因此只能得出：外移远端 HTTP
请求不足以使 compiled standalone agent runtime 稳定，不能把剩余失败归为模型或 skill 语义。

Gate 因 `infrastructureFailures=2`、`noSkillNonSaturated=false`、`differingPairs=0` 失败。仅有的
两个可比较 pair 均为 no-skill=original=1.0；其余 pair 含 infrastructure，不参与方向推断。
同一 identity 不补跑，不允许 base IR audit 或 held-out。

下一项受控诊断保留 Node helper、模型、task、scorer 和矩阵不变，只将 execution runtime 从
compiled standalone 改为摘要绑定的 ASCII 路径 Bun + committed `src/index.ts` source entry。
新 runtime schema/report/lock 必须与 compiled v1 分离，绑定 Bun executable、entrypoint、lock
orchestration 和 startup/fetch-active evidence。该候选仍须先通过 20 次 startup 与唯一单 route；
任一失败即冻结，不直接重跑 8-row。

2026-07-27 source candidate 从 ASCII 根运行官方 Bun 1.3.13 与 committed `src/index.ts`：startup
20/20、0 timeout、0 crash；唯一 Node HTTP fetch-active route 也为 exit 0、failureCode=`none`、
公开输出完整。该结果只允许建立新的 source fetch-qualified 8-row identity，不进入 calibration
分母，也不允许 base IR/held-out。最终 identity 仍需重新绑定当前 orchestration 并独立通过
resource/route preflight。

#### 24.9.10 Source final preflight 与下一运行边界

最终 source fetch-qualified identity 已绑定 Bun/source entry、Node helper、candidate qualification、
benchmark guards 和当前 parent orchestration，并生成 8-row/4-pair plan。Resource probe 为 `ok`；
独立 route probe 在 88.083 秒后 exit 3、`status=agent`、未超时。与旧 compiled route 不同，本次
三个公开输出均已物化，但冻结的 pre-IR route result 没有 compact stream fingerprint，无法区分
生成完成后的 Bun assertion、adapter teardown 或其他 nonzero exit。

因此该 identity 冻结为 `unresolved-agent-or-runtime-exit-after-output-materialization`：完整矩阵、
scoring 和 gate 均不执行，不能借 candidate route 的成功替代最终 preflight。下一次付费前必须先在
新的 identity 中让 pre-IR route 同样输出封闭 failure code、stream byte count/digest 和 output
materialization count；不得保存 stderr/stdout 正文、模型输出、绝对路径或 secret。只有新 route
exit 0、无 runtime failure 且三个输出完整，才允许执行 8-row。该改动属于 execution diagnostics，
不修改 v2 task、public contract、scorer、threshold 或 held-out freeze。

#### 24.9.11 Source route diagnostic closure

Task 16.11 不再派生新的 Bun、transport 或 source runner 版本，而是在既有 v1 简洁 source-runner
编排内增加一份独立的 `route-diagnostic.json`。旧 `route-probe.json` 继续使用
`skill-ir-pre-ir-route-probe-result/v1`，历史 lock、result 与 compact evidence 均不就地修改。

新 diagnostic 复用 fetch-active 的封闭 failure taxonomy，只保存 status、failure code、exit/timeout、
可识别的 runtime identity、stdout/stderr 字节数与 SHA-256，以及从公开
`design-contract.json.outputs` 检查得到的 declared/present/missing。它不得保存 stream 正文、命令、
绝对路径、环境值、secret 或模型文本。公开输出只接受 workdir 内的普通非符号链接文件。

对于 `skill-ir-node-http-source-fetch-qualified-pre-ir-calibration-lock/v1`，route phase 必须先写
diagnostic，再根据闭合状态抛错；execute phase 必须重新读取并严格验证其 calibration/model/case、
`failureCode=none`、exit 0、非 timeout 和 declared=present、missing 为空。文件缺失、schema 漂移、
identity 漂移或 output 不完整都 fail closed。该证据层只决定是否允许校准矩阵执行，不进入 scorer，
也不构成 benchmark 或 skill 优化结果。

#### 24.9.12 Closed route matrix result

新的 source route-diagnostic identity 沿用同一 Bun 1.3.13、`src/index.ts`、Node HTTP helper、模型、
task、scorer 和 gate。独立 route 在 67.358 秒后 exit 0、`failureCode=none`，公开输出 3/3；因此按
冻结规则放行唯一一次 8-row/4-pair development matrix。

矩阵完整写出 8 行，但 4 行在 no-skill/original 两个 system 上触发相同 Bun internal assertion。
Gate 的 `completeRows`、`completePairs`、`noSkillNonSaturated` 与 `distinguishable` 为 true，
`zeroInfrastructure` 为 false；只有 1 个 comparable pair，delta=-0.75，original direction 为
`worse`。该方向只描述这一个未被 infrastructure 污染的 pair，不能推广为 Skill 效果。

本 identity 冻结，不补跑、不进入 base IR/held-out。No-skill 与 original 的 aggregate token 只覆盖
成功返回 token usage 的行，分母不一致，不能比较 token 效率。下一阶段只审计 v1-style source
runner 的进程/adapter/teardown 边界，不增加 Bun 小版本、transport 或 runtime catalog。

#### 24.9.13 Benchmark dominance 与当前优化证据台账

“v2 比 v1 更好”只允许解释为 **measurement-contract dominance**，不能由版本号、threshold 更高或
单轮模型分数直接推出。`benchmark-evidence.ts` 对冻结 audit 做 fail-closed Pareto 判定：v2 的 canary
匹配率、canary 覆盖、alternative-valid false rejection、private exact-contract issue 与 workdir
materialization protection 必须全部无回归且至少一项严格改善；v2 audit/materialization 还必须完整
通过。Operational evidence 单列，不参与该 dominance 规则。

2026-07-29 的机械报告得到：v1 canary `2/8`、alternative-valid 误拒绝 6、private issue 8；v2
canary `42/42`、误拒绝 0、private issue 0，并有 `36/36` materialization checks。五个维度均无回归
且严格改善，因此 `v2-measurement-contract-dominates` 成立。与此同时，v1 real calibration 为
0 infrastructure / 4 comparable pairs，但 scorer contract failed；v2 最新 real calibration 为 4
infrastructure / 1 comparable pair。两轮 operational result 不可直接比较，v2 real discrimination、
完整 Skill 优化 claim 与 token reduction 仍为 false。

Runner boundary 审计确认两轮都复用 `real-agent-run.ts` 与 `bare-agent`；差异是 command entry、v2
initial-workdir manifest 和 Node HTTP helper。既有无 API process tests 覆盖显式 child env、manifest、
non-ok status 和收尾，但未复现真实 internal assertion，所以结论冻结为
`runner-only-cause-not-established`，不允许付费补跑。

同一报告维护逐 Skill ledger：env-manager 只有 3 个 complete pair 从 0.90 到 1.00 的 deterministic
repair 机制证据，development gate 因 1 infrastructure 未过；law-to-markdown development artifact
0.925 高于 static 0.80 且 gate passed，但 held-out artifact 0.725 低于 static 0.8375、2 regressions，
held-out gate failed；experimental-design v2 只完成 measurement contract，baseline gate 未过且未进入
base IR。总项目状态因此是 `partial-mechanism-evidence`，不是完整 Skill 优化成功。

#### 24.9.14 无 API Source-process Replay

下一步不再增加 runtime/transport 版本，也不直接付费重跑。使用本地 loopback
OpenAI-compatible responder 驱动既有 Bun 1.3.13 source entry、`bare-agent`、Node HTTP helper 和
真实 tool executor，隔离“固定多轮 agent trajectory 能否稳定完成并正常退出”。该 replay 是
infrastructure diagnostic，`methodEvidence=false`；不得进入 benchmark 分母、scorer、IR、artifact、
PGO、模型能力、Skill 效果或 token 指标。

每条 replay 固定五次 provider 响应：并行读取两个公开输入；并行执行三个无副作用 shell/Node
命令；并行写入三个公开输出；并行回读输出；最终 `end_turn`。这覆盖真实 child source process、
五次 Node helper spawn、bare-agent tool fan-out、shell 子进程、文件物化和 teardown/exit，同时不读取
任何模型结果。Responder 只接受 `replay/*` route、测试 API key、OpenAI Chat Completions schema 和
预期 phase；不保存 prompt、skill、tool result 或响应正文。

本地诊断在运行前固定为：

```text
systems: no-skill | original
repetitions: 10 per system, sequential
rows: 20
responses per row: 5
required outputs: 3/3
pass: 20/20 exit 0, 20/20 protocol complete, 20/20 outputs complete,
      zero timeout, zero Bun crash signature, zero nonzero exit
```

Compact report 只允许 runtime/source/helper digest、按 system 的计数、逐行 exit/timeout/failure code、
duration、stream byte count/SHA-256、request count/phase count和输出计数；禁止绝对路径、环境值、
API key、stdout/stderr 正文、task/skill 内容与工具输出。若 replay 失败，先根据首个稳定复现的 phase
定位本地进程根因；若通过，只能说明确定性低延迟 trajectory 未复现崩溃，不能排除远端延迟、响应
形状、模型工具行为或 Windows/Bun 的非确定性影响。两种结果都不自动放行付费 calibration。

2026-07-29 的正式 replay 使用冻结 Bun 1.3.13 与同一 Node helper：`no-skill` 10/10、`original`
10/10，合计 20/20 exit 0、20/20 protocol complete、20/20 为 3/3 outputs，0 timeout、0 nonzero、
0 Bun crash。两臂 median duration 分别为 577.8 ms 与 597.4 ms。该结果排除了“source entry +
bare-agent + Node helper + 多轮工具/spawn 本身必然触发 crash”，但与真实成功行约 60–220 秒的
provider latency 和自由 trajectory 不同；四个历史 crash 行也没有 finalize conversation log。因此
下一诊断变量应是脱敏 trajectory shape/latency，而不是新的 runtime 或 transport 版本。

#### 24.9.15 Trajectory shape 与 latency 审计

下一阶段只消费 2026-07-28 已冻结的 source route-diagnostic matrix，不调用 API、不补跑、不修改
task、scorer、model、runtime 或 transport。输入固定为 8 行 raw、对应 plan、`.skvm/log/sessions.jsonl`
以及已完成 session 的 conversation JSONL。Route probe 的 session 明确排除；matrix 的 8 行按 raw
顺序与从首条 matrix session 开始的 8 个唯一 session 配对，并用 task identity、system 顺序、
run index、completed/running 状态和 duration tolerance 做 fail-closed 复核。

Compact report 只允许保存：row/case/system/run index、session 的相对标识、raw exit/timeout/failure
分类、conversation 是否可用、request/response 数、封闭 tool type 计数、单响应最大 tool fan-out、
stop-reason 计数、provider duration 的 count/sum/median/max、final end-turn 状态，以及各输入相对路径与
SHA-256。禁止保存 prompt、skill、model text、message、system prompt、tool argument、tool result、
stdout/stderr 正文、token/secret/env value 或绝对路径。工具名投影到封闭枚举；未知名称只记为
`other`。

Conversation 只存在于正常 finalize 的 session。若 raw 为 infrastructure failure 且 session 只有
`running` 记录、没有 conversation，必须输出 `trajectoryAvailable=false` 和封闭 unavailable reason；
不得把缺失解释为 0 request、0 tool call 或 crash 前真实轨迹。完成行若缺 conversation、最后不是
`end_turn`、request/response 不配对，或 session/raw 映射不唯一，则 audit fail closed。

审计只回答 replay 是否覆盖了**已观察成功行**的 response count、tool count/fan-out 与 provider
latency envelope。它不能观察 crash 前轨迹，不能建立 crash 因果，不能证明模型、benchmark、Skill
优化或 token 效率，也不能自动放行付费实验。若成功行的任一 envelope 超出 replay，则下一步应先
做同 runtime/transport 的 delayed/high-fan-out 本地 replay；只有覆盖成功 envelope 后仍无法复现，
才讨论一条新的预注册、带 runtime trace flush 的真实 route diagnostic。

2026-07-29 的正式审计把 route session 排除后，8/8 raw row 与 session 在 task/order/state/duration
边界上一致；7 个可观察 duration delta 为 16--154 ms，最后一个 running-only session 因没有后继或
terminal record 保持 null。4 条 exit-zero 行有 finalized conversation，4 条 Bun assertion 行只有
`running` 记录并统一为 `session-not-finalized`，没有被伪装成零调用。

成功行的 observed envelope 为 6--16 次 response、最多 23 个 tool call、最大 fan-out 6、单次
provider response 最长 26.783 秒、整行最长 220.124 秒；deterministic replay 只有 5 次 response、
11 个 tool call、fan-out 3、整行最长 0.674 秒。四个 coverage predicate 全为 false，结论冻结为
`deterministic-replay-does-not-cover-observed-success-envelope`。这支持先做 delayed/high-fan-out
本地 replay，不支持直接付费，也不能解释四个 crash 的未落盘轨迹。

#### 24.9.16 Delayed / high-fan-out source replay

Task 16.14 的实现与正式 report 已由 digest 绑定，不允许为新诊断就地参数化或改写。新 replay 使用
独立 schema/CLI，但继续运行同一 Bun 1.3.13 source entry、Node HTTP helper、`bare-agent` 和 tool
executor；它不是新的 runtime、transport、benchmark 或 model identity。

正式 shape 固定为两臂各一行、顺序执行。每行有 16 次 provider response，前 15 次合计 23 个 tool
call，fan-out 分布为 `6,3,2,1×12`，最后一次为无 tool call 的 `end_turn`。公开 delay schedule 为
`27s,13s×14,12s`，总 provider wait 221 秒，覆盖 audit 的 response 16、tool 23、fan-out 6、单次
26.783 秒和整行 220.124 秒上界。工具只读取公开 fixture、运行无副作用 Node command、写入/回读
三个公开输出；不消费历史模型正文或 tool argument。

Task/CLI 的 max steps 固定为 20，总 timeout 为 300 秒，父进程 watchdog 为 360 秒。Formal CLI 不
接受 delay、shape、repetition、timeout 或 system 参数。测试可以通过内部 `delayScale=0` 验证同一
协议和 source child 路径，但该行必须显示 duration coverage=false，不能进入正式 report。

通过条件是两行均 16 response、23 tool、fan-out 6、configured delay 221 秒、真实 wall-clock 不少于
220.124 秒、exit 0、protocol complete、3/3 output，且零 timeout、Bun assertion、nonzero 或额外
request。Compact report 沿用正文/secret/绝对路径禁令，并绑定 Task 16.15 audit、runtime/helper/source
与本轮实现摘要。无论通过或失败，`methodEvidence=false`、`paidRerunAllowed=false`；通过只说明已
观察成功行 envelope 可以在确定性本地响应下稳定 replay，仍看不到历史 crash 的中间轨迹。

2026-07-29 的正式 replay 在 Windows x64、Bun 1.3.13 上通过。No-skill 与 original 分别运行
222.625 秒和 222.535 秒，两行均为 16/16 response、23 tool call、fan-out 6、3/3 output、exit 0，
零 timeout、Bun assertion、nonzero 或 protocol failure；六个 coverage predicate 全为 true。

该结果只把“确定性成功 trajectory 的计数、并发宽度和 wall-clock envelope”从未覆盖变为已覆盖，
不把历史 crash 变成可观察，也不证明自由模型响应或内容相关工具参数稳定。下一诊断不得继续扩大
replay 时长或 runtime catalog，而应在真实 source route 中增加 opt-in、逐事件同步落盘的 compact
runtime trace。Trace 只记录 provider request/response、tool-batch start/end、turn/finalize 状态、
封闭 tool type/count/fan-out 与 duration；禁止正文、argument/result、token、secret 和绝对路径。

#### 24.9.17 Durable compact runtime trace

Trace 是 opt-in diagnostic seam，不替换 conversation log，也不改变默认 agent 行为。环境变量
`SKVM_DURABLE_RUNTIME_TRACE` 缺失时不创建文件、不执行同步 I/O；存在时指向本地 JSONL。Writer 在
构造时创建文件并写 `trace-start`，随后每个事件使用同步 append + `fsync`。写入或 flush 失败必须
fail closed，不能继续生成一份看似完整的诊断。

事件 schema 固定为 `skill-ir-durable-runtime-trace-event/v1`，共同字段只有 sequence、event、turn 和
elapsedMs。事件集合为 `trace-start`、`provider-request-start`、`provider-response-received`、
`tool-batch-start`、`tool-batch-end`、`turn-end`、`finalize`。Response/tool 事件可增加 durationMs、
stopReason、toolCount、maximumToolFanOut 和封闭 tool type count；不得保存 timestamp、model、prompt、
message、text、tool id、argument/result、command、token/cost、stdout/stderr、env value 或路径。

Agent loop 在调用 provider 前写 request-start，返回后写 response-received；执行工具批次前后分别写
batch-start/end；完成当前轮写 turn-end；正常/handled-error/timeout/max-iterations 退出写 finalize。
Provider 抛错或进程 crash 时不得补写 finalize，raw trace 只说明“最后一个 durable event”，不能推断
尚未落盘的操作。Unknown tool 统一投影为 `other`。

本地 validation 复用 Task 16.16 的 delayed responder/真实 source child，但使用内部 `delayScale=0`，
只验证 16-turn 事件接线，不重复 7.5 分钟 latency 结论。两臂共享一个 raw trace 文件，必须解析为两个
独立 segment；每段 16 provider request/response、15 tool-batch start/end、16 turn-end、1 finalize，
共 80 个连续 sequence event。Raw trace 本地保留，提交报告只保存每段计数、顺序 gate 与输入 digest。

Task 16.16 report 继续绑定 pre-trace 提交 `6ce33e7`；修改 `agent-loop.ts` 后建立新的 trace diagnostic
source identity，不回写旧 report。下一条真实 route 必须在本地 validation 通过后单独预注册，固定
`original × experimental-design-v2-cluster-sequential-dev-002 × clean × Windows × gpt-5.6-sol`、
retries 0、单行。它不进 benchmark 分母；无论成功或 crash 都只冻结 compact trace prefix。

2026-07-29 的本地 validation 使用两条 `delayScale=0` source child，共生成 160 个事件；每段均为
80 个连续事件，16 次 request/response、15 次 tool-batch start/end、16 次 turn-end 和 1 次
completed finalize。该结果只证明 trace 接线与同步持久化机制可用，不重复 Task 16.16 的时延结论。

随后按独立 lock 执行的唯一真实 route 在 180.254 秒被外层 watchdog 终止。Compact prefix 有 47 个
连续事件：前 9 轮 request/response、tool-batch start/end 和 turn-end 全部闭合，第 10 轮最后事件为
`provider-request-start`，无 finalize、无 stderr、0/3 output。第 9 轮在 elapsed 179.649 秒闭合，
第 10 轮请求同一时刻发出；外层只在约 0.6 秒后终止进程。Materialized task 的内部 timeout 为
300 秒、max steps 30，而 diagnostic lock 的外层 timeout 为 180 秒，因此本轮失败冻结为
`outer-watchdog-shorter-than-task-budget`，不是 provider 长尾或 Bun crash 的证据。

该 lock 不得事后增加 timeout 或重跑。后续任一新 harness/route contract 必须在付费前验证
`outer watchdog >= task timeout + teardown grace`。Task 16.17 至此结束，不再增加 Bun/runtime 版本；
历史 Bun assertion 的根因仍未由本轮定位，当前结果也不放行 8-row matrix。

#### 24.9.18 Stable Pi harness qualification and baseline

Task 16.17 后不再增加 Bun/runtime/transport 版本。下一执行路径复用仓库已有 `PiAdapter` 和已固定依赖
`@mariozechner/pi-coding-agent@0.67.68`，不创建新 adapter。SkVM 继续负责同一 v2 task、source closure、
workdir materialization、raw row 和 deterministic scorer；Pi 子进程负责 agent loop、provider interaction
和 read/bash/edit/write 工具。该结果是新的 harness 轴，不能与 `bare-agent` 行直接配对或混算。

本轮独立 lock 固定 Windows、clean、`xty/gpt-5.6-sol`、managed Pi、retries 0、development-only，
并绑定 v2 source/tasks/resource/scorer/benchmark guards、项目 `package.json`/lockfile、Pi package version、
`pi.ts` adapter source 和 stable/real-agent runner source digest。
执行前必须从项目本地 `node_modules/.bin` 解析 Pi，`pi --version` 必须精确返回 `0.67.68`；禁止回退到
unversioned `npx`、全局未知版本或用户 native config。API key 仍只通过 `SKVM_XTY_API_KEY` 进入子进程。

Timeout budget 是付费前 hard gate。Materialized task 必须为 300000 ms、30 steps；teardown grace 固定
60000 ms；每条命令的外层 watchdog 固定 360000 ms，并满足
`outerWatchdogMs >= taskTimeoutMs + teardownGraceMs`。Runner 必须逐行执行外层 watchdog；不能只校验
route 后让 matrix 回到无界 `Bun.spawn`。Timeout、nonzero、`adapter-crashed`、缺输出均为 infrastructure，
不进入 semantic denominator。

执行分两阶段：先只运行
`original × experimental-design-v2-cluster-sequential-dev-002 × run 1`。Qualification 需要 Pi 版本、
resource contract、exit 0、`runStatus=ok`、未超时、3/3 output，且 Pi 注入使用的 `AGENTS.md`/
`.pi-skills` 不得残留；失败立即冻结并停止，不切换 harness、
不重试、不运行 matrix。通过后才运行固定 8 行：
`no-skill|original × 2 development tasks × 2 repetitions`。Matrix 仍使用现有 v2 scorer 和 gate：
0 infrastructure、no-skill non-saturation、至少 1 个 differing pair；不要求 original 必然非回归。

Route 和 matrix raw 保持本地，提交 compact qualification/gate/scored summary 与输入 digest。该阶段最多
证明 Pi harness 内 v2 baseline 可运行且 no-skill/original 可比较；不证明 Bun 已修复、跨 harness 等价、
Skill 已优化、held-out 泛化或 token break-even。若 matrix 可用，下一步必须回到 base IR/ir-static，
不得继续基础设施开发。

Windows 首次 qualification 在调用模型前暴露两个本地问题：Pi version 写入 stderr，以及 resolver
硬依赖 Unix `which`。前者改为只接受 stdout/stderr 中唯一的精确版本值，后者改用 `Bun.which`；
二者均以本地 TDD 修复。首次完整 8-row matrix 随后被判定无效：Pi inject 在 workdir 留下
`AGENTS.md`，四条 original 都触发 `UNEXPECTED_ENTRY`，固定损失 artifact-contract 0.1。该结果保留为
harness failure，不作 Skill/benchmark 证据。Adapter 现于 subprocess 周期内注入，结束后删除；若原文件
存在则逐字节恢复。修复后的 lock 使用独立 calibration identity，并冻结 adapter/orchestration digest。

修复后 qualification 通过（exit 0、3/3 output、零 residue），8-row matrix 也达到 8/8 observed、
4/4 complete pairs、0 infrastructure。但 no-skill 与 original 均为 4/4 success、mean score 1.0，
四个 pair 均无差异；no-skill non-saturation 与 distinguishable 两门失败。Original aggregate token
176576，对比 no-skill 53612（3.29x），平均 latency 83733.75 ms 对比 60932.75 ms（1.37x）。因此
stable Pi harness 已具备受控实验资格，但当前两个 development task 对该强模型没有区分度；不得进入
base IR/held-out。下一步应设计新的 development-only 难任务来暴露原 skill 可修复的失败，不再做
Bun/transport 基础设施扩展。

#### 24.9.19 Strong-model harder development contract

Task 16.18 的 8 行有效结果只证明现有两个 development task 饱和，不允许据此修改冻结的
`development/tasks.json`、task-split freeze、held-out、public contract 或 scorer。下一轮沿用
`experimental-design-v2` 身份，新增独立 supplemental task-set：

```text
benchmarks/skill-ir/pilots/experimental-design/v2/harder-development/tasks.json
```

它不是新 benchmark 版本、不是新 skill，也不进入默认 corpus manifest。Runner 直接消费该 task-set，
复用 `materializeCaseArtifacts`、`executePlan`、Pi 0.67.68、现有 v2 evaluator 和 pre-IR gate；旧
2+2 split 继续由 task-split/held-out freeze 保护。新 lock 必须同时绑定旧 freeze、public contract、
supplemental tasks、saturation audit、differential audit、materialization audit、source closure、Pi 和
orchestration digest。

两项任务固定为：

```text
experimental-design-v2-three-arm-strata-sequential-dev-003
  individual assignment; 3 arms; >=3 strata; sequential enrollment;
  at least one full and one partial block; analysis unit differs

experimental-design-v2-four-arm-cluster-strata-sequential-dev-004
  cluster assignment; 4 arms; >=3 strata; sequential enrollment;
  at least one full and one partial block; analysis unit differs
```

每项仍只提供公开 `study.json` 和逐字节相同的 `design-contract.json`，输出和五项 criterion 保持不变。
难度只能来自公开约束组合、unit 数量、partial block 和跨产物一致性；不得增加唯一分配序列、私有
method enum、固定报告措辞、evaluator expected、held-out 内容或 scorer-only 字段。任意满足公开合同的
arm assignment 与 CSV row order 都必须通过。

付费前门禁顺序固定为：

```text
old-matrix saturation audit
-> supplemental task-set validation and leak scan
-> canonical + alternative-valid + invalid-control differential audit
-> no-model no-skill/original materialization audit
-> new lock and 8-row dry-run
-> one original qualification row
-> one frozen 8-row no-skill|original matrix
```

Saturation audit 只消费 Task 16.18 compact gate/analysis、旧 development tasks 与 public contract；
不得读取 held-out 或 raw model text。Differential audit 至少覆盖每项任务的 canonical pass、不同合法
allocation pass、sequential violation、stratum violation、report contradiction 和 extra-output rejection。
Materialization audit 必须在两臂上证明 protected input、source resource、initial/final delta 与 residue
边界一致。

新 calibration 仍固定 Windows/clean、`xty/gpt-5.6-sol`、Pi managed、2 tasks x 2 repetitions、
retries 0、task timeout 300 秒、teardown grace 60 秒、outer watchdog 360 秒。Gate 要求 8/8 rows、
4/4 pairs、0 infrastructure、no-skill 非饱和和至少一个 differing pair。失败即冻结，不调整 task、
scorer、threshold 或 repetitions；通过只允许开始 supplemental task-set 的 source-audited base IR，
不直接允许 held-out 或产生优化主 claim。

#### 24.9.20 Harder development result and next audit boundary

Task 16.19 的 qualification 通过：Pi 0.67.68、resource probe、route exit/runStatus、3/3 outputs 与零
harness residue 均满足冻结条件。唯一 8-row matrix 达到 8/8 rows、4/4 pairs、0 infrastructure，但
no-skill/original 仍均为 4/4、mean 1.0，differing pairs 为 0。Gate 再次因 no-skill saturation 与无
区分度失败，不允许 base IR 或 held-out。

组合难度增加只提升了执行成本：相对旧两任务，no-skill 平均 latency 为 1.5444x、aggregate token 为
1.43x，语义区分度没有变化；本轮 original 相对 no-skill 为 2.1856x aggregate token、1.0854x
latency，仍无质量增益。因此不能继续把“增加 arm/unit/constraint 数量”当作默认修复。下一步先做
`public-contract-task-sufficiency` audit，区分以下两个尚未证实的解释：

1. 强模型本身足以从用户可见 task 推导合法设计；
2. 当前 `design-contract.json` 已向 no-skill 提供了近似完整的操作配方，使原 skill 语义冗余。

该 audit 只允许分析 development task prompt、public contract、原 skill/source closure、scorer 的公开
约束投影与已冻结 compact result；不得读取 held-out task 内容，不得删除 deterministic scorer 所需的
合法多解/安全边界，也不得据此直接创建新任务。先形成可审计的 instruction-overlap 与 task-sufficiency
报告，再决定是收紧用户可见合同、改变任务能力面，还是承认该 skill 在强模型面板中没有可测增益。
