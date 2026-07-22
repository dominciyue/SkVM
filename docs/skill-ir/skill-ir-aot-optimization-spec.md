# Skill IR AOT 优化研究契约

**最后更新：** 2026-07-23

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
