# Skill IR AOT 优化研究契约

**最后更新：** 2026-07-24

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
