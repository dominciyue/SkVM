# Skill IR AOT Optimization Spec

日期：2026-07-06；当前研究契约更新：2026-07-15

## 0. 当前研究契约（权威）

本节覆盖后文早期阶段中与之冲突的规模、主张、实验轴和成熟度描述。后文 Task 7.5-11I 保留为研究演进记录，不代表每项设想都已被实践验证。

### 0.1 当前主 Claim

> 对一组有明确来源的真实 skill，将自然语言 skill 编译为静态 Skill IR，并利用 development execution feedback 生成 task-local PGO IR；在多个模型和上下文条件下，相比 `no-skill` 与原始 skill，提高 held-out 任务的成功率或最差表现，同时控制负向回归。

稳定性是当前第一目标。完整主 claim 的报告列为：

```text
no-skill | original | ir-static | ir-pgo
```

`ir-only` 只用于显式消融；`ir-profile` 用于复现已有实验；`skvm-aot` 在真正接入上游 AOT 路径前不进入默认主表。

报告列不等于默认调度。冷启动只允许：

```text
no-skill | original | ir-static
```

**Current implementation status (2026-07-15):** `env-manager` has an exact
source snapshot, two development tasks, two held-out tasks, a deterministic
six-criterion evaluator, and a source-audited profile-empty base IR. It is the
only `runnable` pilot. Static lowering now renders inputs, outputs,
preconditions, tool requirements, and environment assumptions in addition to
steps, rules, checks, and recovery. The locked static development run completed
12/12 rows with no infrastructure failures. `ir-static` remained 0/4 on binary
success but improved mean deterministic score from original's 0.425 to 0.700
and eliminated hard-gate failures. Classification-location and JSON Schema
constraints remain missing; no Final IR or held-out optimization evidence exists.

Future pre-IR calibration may opt into `tasks-authored` only through the explicit,
fail-closed `--allow-tasks-authored` contract: one selected pilot skill,
explicit development tasks, `clean` context, and exactly `no-skill | original`.
The runner may synthesize an in-memory source envelope from pinned manifest
metadata solely to materialize the exact original source. This does not create
an `irPath`, make the skill generally runnable, or permit static/PGO systems.

此阶段不得把 base IR 标成 PGO。`original × development` 的结果通过 profile feedback 编译成带 provenance 的 Final IR；只有 provenance、corpus、source/base/final digest 与 development split 都通过校验后，`ir-pgo` 才能在显式选择的 held-out tasks 上运行。

### 0.2 当前证据边界

当前真实 runner 在 Windows 主机上使用一个全局 adapter。矩阵中的 `agent` 和 `environment` 字段可以用于计划、配对和结果切片，但当前不会自动切换真实 agent harness 或操作系统。因此：

- 已实际测试的轴是 model family × context × skill × system，在单一 adapter 和 Windows 主机下运行；
- 多 agent adapter、Linux、macOS 和真实跨 OS 行为属于计划轴；
- 合成 seed 结果只作为管线、scorer 和受控失败的低权重校准证据；
- 主结论必须来自有来源的真实 skill，并报告 provenance 和 evidence weight。

真实 skill 阶段硬限制为 6 个 pilot。Wave A 包含 `law-to-markdown`、`env-manager`、`experimental-design` 三个 deep pilot；Wave B 包含 `zh-code-reviewer`、`api-tester`、`zh-readme` 三个 replication pilot。Wave A 用于开发和修正方法，Wave B 是完整主 claim 的必要条件，且不得用于调优同一份待报告配置。每个 deep pilot 必须先具备精确 source baseline、可判分的 no-skill 任务、静态 base IR、development/held-out 划分、真实运行和结果解释，之后才能扩 corpus。

### 0.3 PGO 范围

当前采用 task-local dual-source residual repair：同一 skill/task family 的 `original × development` 只用于确认 failure lineage 是否在静态编译前存在，`ir-static × development` 用于提取静态编译后仍存在的 typed residual。original 失败而 static 通过的条目不生成 overlay；original 通过而 static 失败视为静态回归并阻断 Final IR。scorer expected、fixture 金标集合和 held-out 数据禁止进入 overlay 编译。静态 base IR 与通过门禁的 overlay 编译成 Final IR，先进行冻结的 development diagnostic replay，再由 held-out tasks 消费校验通过的 Final IR。Final IR 是带 provenance 的编译产物；`ir-pgo-dev` 是开发集诊断标签，`ir-pgo` 是 held-out 实验标签。当前不假设一个模型族生成的 overlay 能迁移到其他模型族，也不把已有小样本 promotion signal 当作成熟模型族结论。

2026-07-16 的首轮真实双源实验已经验证编译和 provenance 路径，但没有通过 development gate。`typed-output-repair/v1` 与 `ir-static` 同为 0/4、均分 0.70；契约优先的 v2 达到 1/4，但均分降为 0.6375，并出现产物缺失和 example safety 回归。因此当前 Final IR 仍是 development candidate，禁止进入 held-out。这个结果把下一步优先级从继续增加 Markdown 规则调整为固化可执行 validator/template，并在 runtime 中执行 preflight 与 post-generation check；新实现必须使用新 catalog/version 和 lock，不能覆盖 v1/v2 结果。

真实 pilot 分两步推进。第一步用一个预注册模型竖切 `env-manager`，跑通 fixture、持久 workdir、确定性 scorer、精确 original、base IR、`ir-static`、development feedback、Final IR 和 development gate；只有 gate 通过才运行 held-out `ir-pgo`。这一步属于 engineering calibration，不进入主表。第二步才在同一 skill 上使用固定、预注册、等重复次数的模型面板，将各模型的 development 证据按显式规则合成一份 **panel-conditioned shared Final IR**，再让同一产物在面板内各模型的 held-out tasks 上评测。

这个实验只支持“一份由固定面板构造的编译产物能否改善该面板内的 held-out 稳定性”，不支持“模型 A 的失败能迁移到未参与构造的模型 B”。后者需要 leave-one-model-out 或 unseen-model transfer 消融。pooled overlay 只能使用 development 数据；必须保留 per-model evidence vector，平衡各模型贡献，显式排除冲突 repair，并同时报告 aggregate、per-model、worst-model 和 negative delta。若任一模型超过预注册回归边界，即使均值提高，也只能报告 mixed trade-off，不能报告完整跨模型稳定性提升。

pooled 构造前，raw/scored rows、trace、overlay 和 Final IR provenance 必须端到端记录 model route、model family、adapter/version、run index 和 panel/config id。`ir-static` 与 `ir-pgo` 默认继承 original 的不可变非 `SKILL.md` 资源闭包，除非编译替换件具有独立 provenance 和 validation。详细设计见 `docs/skill-ir/env-manager-vertical-and-pooled-overlay-design.md`。

Task 11F promotion policy 与 Task 11G validation planner 保留为 advisory method-support tooling，当前冻结继续扩展，优先补齐真实 skill 研究内核。

### 0.4 工程终态（北向目标，不是当前主 Claim）

工程终态锁定为约 L3-L4 的 **Validated Skill Artifact Package**：

```text
optimized_skill/
  skill_ir.json              # 权威语义
  skill.md                   # 可由 IR 生成的人/agent 视图
  artifacts/
    checks/ | schemas/ | scripts/ | templates/ | tool-plans/
  provenance + validation notes
```

“优化成代码块/文件”是 artifact solidification：将重复推理、固定格式、环境探测和固定工具计划编译成可复用块。当前实现主要处于 L1/early-L2；lowering 产出的是 declarative/checkable specification，尚未形成独立 runtime enforcement。token/成本只作为次级诊断与未来目标，等可复用 package 和重复调用成本可测后再讨论 break-even 主张。

详细 package 契约见 `docs/skill-ir/validated-skill-artifact-package.md`。

## 1. 项目定位

本项目面向 SJTU-IPADS/SkVM 的 skill 编译与优化场景，研究一种结构化 Skill IR，并将其作为 SkVM AOT 编译链中的一个 pass。目标是把自然语言 skill 中隐含的流程、约束、工具需求、环境假设和失败恢复策略显式化，再结合运行轨迹做 profile-guided optimization，使 skill 在不同 agent、不同机器环境、不同上下文状态下执行得更稳定。

一句话概括：

> 设计并实现 Skill IR，将自然语言 skill 降到可验证、可优化、可执行的中间表示，并通过 AOT pass 提升跨 agent、跨环境、跨上下文执行稳定性。

## 2. 研究动机

自然语言 skill 的优势是灵活，问题是执行语义不稳定。同一个 skill 在不同 agent 或不同上下文中可能表现出明显差异：

- agent 可能遗漏 skill 中的 MUST / NEVER 约束。
- agent 可能跳过关键步骤，尤其在长上下文或压缩上下文中更明显。
- shell、路径、依赖和工具版本在 macOS、Linux、Windows 中不同，导致工具型 skill 行为分裂。
- 运行失败后，agent 的恢复策略常常依赖临场推理，结果不可复现。
- prompt-level 优化缺少结构化语义，难以系统评估和复用。

SkVM 已经把 skill 视为可 profile、可 AOT/JIT 优化的对象。本项目进一步把“skill 的语义表示”作为核心问题处理：先构造 Skill IR，再在 IR 层做规范化、验证、优化和 lowering。

## 3. 核心贡献

本项目以研究型报告为目标，预期贡献包括：

1. **Skill IR 设计**：提出一种能表达 skill 流程、规则、工具、环境、检查器和恢复策略的中间表示。
2. **AOT IR Pass**：将 Skill IR 接入 SkVM AOT 编译链，支持静态构造、验证、优化和 lowering。
3. **Profile-guided Skill Optimization**：将多 agent、多环境、多上下文下的 execution trace 汇入 IR，形成带 profile annotation 的 optimized IR。
4. **跨设置稳定性评估**：建立 Skill x Agent x Environment x Context x Task 的实验矩阵，重点评估平均成功率、最差成功率和跨设置方差。
5. **多类别 skill 泛化**：覆盖流程型、工具型、约束型、诊断型、生成型、环境敏感型 skill，证明 IR 和 pass 不是针对单一 skill 手调。

## 4. 非目标

六周内不追求以下目标：

- 完整支持所有公开 skill。
- 构建通用自然语言编译器。
- 完全替代 SkVM 现有 AOT/JIT 逻辑。
- 让所有 skill 自动生成复杂可执行程序。
- 做重型前端平台或可视化系统。

本项目优先追求研究闭环：清楚的 IR 抽象、可运行的 AOT pass、可复现实验、能说明问题的 case study。

## 5. 系统架构

整体流程如下：

```text
Natural Language Skill
  -> Static Skill Analyzer
  -> Initial Skill IR
  -> IR Validation
  -> original x development Execution + Trace Collection
  -> Profile Annotation
  -> AOT Optimization Passes
  -> Final IR + provenance
  -> Lowering
  -> Runtime Controller / Checker / Adapter
  -> ir-pgo held-out Evaluation
```

模块划分：

- `skill-ir/schema`：定义 Skill IR 的类型和 Zod schema。
- `skill-ir/parser`：从自然语言 skill 构造初始 IR。
- `skill-ir/validate`：检查 IR 完整性、一致性和可执行性。
- `skill-ir/passes`：实现 AOT optimization passes。
- `skill-ir/lowering`：将 IR 降到 controller、checker、adapter。
- `profiler`：收集 execution trace，并生成 profile annotation。
- `benchmarks`：维护 skill corpus、任务集、上下文扰动和实验矩阵。
- `analysis`：统计成功率、规则违反率、方差、token、latency。

## 6. Skill IR v1

Skill IR 采用 JSON 作为可持久化格式，TypeScript 类型和 Zod schema 作为实现层约束。选择 JSON 是为了方便人工检查、实验记录和后续分析；选择 Zod 是为了贴合 SkVM 当前 TypeScript/Bun 技术栈。

### 6.1 顶层结构

```ts
type SkillIR = {
  schemaVersion: "skill-ir/v1";
  id: string;
  name: string;
  category: SkillCategory[];
  intent: string;
  source: SkillSource;
  inputs: InputSpec[];
  outputs: OutputSpec[];
  preconditions: Condition[];
  steps: Step[];
  rules: Rule[];
  tools: ToolRequirement[];
  environment: EnvironmentAssumption[];
  checks: RuntimeCheck[];
  recovery: RecoveryPolicy[];
  profile: ProfileAnnotation[];
};
```

### 6.2 Skill 分类

```ts
type SkillCategory =
  | "workflow"
  | "tool-use"
  | "constraint-heavy"
  | "diagnostic"
  | "generative"
  | "environment-sensitive";
```

一个 skill 可以属于多个类别。比如 CI 修复 skill 既是 diagnostic，也是 tool-use 和 environment-sensitive。

### 6.3 Step

```ts
type Step = {
  id: string;
  title: string;
  description: string;
  kind:
    | "read"
    | "analyze"
    | "plan"
    | "execute"
    | "edit"
    | "verify"
    | "ask"
    | "report";
  required: boolean;
  dependsOn: string[];
  toolRefs: string[];
  produces: string[];
  successCheckRefs: string[];
  failureModes: string[];
};
```

Step 用来表达 skill 的控制流。v1 不做完整 CFG，只做 DAG 依赖，原因是大多数 skill 的核心流程可以先用步骤依赖表达。

### 6.4 Rule

```ts
type Rule = {
  id: string;
  sourceText: string;
  level: "must" | "never" | "should";
  scope:
    | "planning"
    | "tool-use"
    | "file-edit"
    | "git"
    | "output"
    | "safety"
    | "context";
  checkability: "static" | "runtime" | "human";
  severity: "low" | "medium" | "high";
  normalizedForm: string;
};
```

Rule 是本项目的重要部分。它把自然语言中的约束抽取出来，后续可以生成 checker 或 evaluation hook。

### 6.5 ToolRequirement

```ts
type ToolRequirement = {
  id: string;
  name: string;
  purpose: string;
  required: boolean;
  alternatives: string[];
  platformNotes: {
    linux?: string;
    macos?: string;
    windows?: string;
  };
  availabilityCheck: string;
};
```

工具需求用于跨机器环境稳定性优化。比如 shell 命令在 Windows/PowerShell 和 Linux/bash 下不同，IR 需要显式表示工具替代路径和 availability check。

### 6.6 RuntimeCheck

```ts
type RuntimeCheck = {
  id: string;
  name: string;
  kind: "preflight" | "step-success" | "rule-violation" | "output";
  targetRef: string;
  command?: string;
  assertion: string;
  onFailure: "retry" | "fallback" | "ask-user" | "abort" | "report";
};
```

RuntimeCheck 是 lowering 的主要目标之一。它让 skill 的关键约束从“希望 agent 记住”变成“执行过程中可以检查”。

### 6.7 RecoveryPolicy

```ts
type RecoveryPolicy = {
  id: string;
  trigger: string;
  action: "retry" | "use-alternative-tool" | "repair-environment" | "ask-user" | "stop";
  maxAttempts: number;
  explanation: string;
};
```

RecoveryPolicy 用于处理动态失败。它可以来自原 skill，也可以来自 profile-guided optimization。

### 6.8 ProfileAnnotation

```ts
type ProfileAnnotation = {
  id: string;
  sourceTrace: string;
  targetRef: string;
  observation:
    | "frequent-failure"
    | "frequent-skip"
    | "high-token-cost"
    | "environment-sensitive"
    | "agent-sensitive"
    | "context-sensitive";
  evidenceCount: number;
  suggestedPass: string;
};
```

ProfileAnnotation 连接动态运行轨迹和静态 IR。AOT pass 可以根据 annotation 增加检查器、环境 guard 或 fallback。

## 7. AOT Pass 设计

### 7.1 Pass 1：Skill Parsing

输入自然语言 skill，输出 Initial Skill IR。该 pass 分两种模式：

- LLM-assisted parsing：用模型抽取结构化 IR。
- Rule-based postprocess：用 deterministic parser 修正规则 id、step id、依赖和 schema 字段。

### 7.2 Pass 2：IR Validation

检查：

- 每个 step id 唯一。
- `dependsOn` 指向存在的 step。
- `toolRefs` 指向存在的 tool。
- required step 至少有一个 success check 或输出。
- high severity must/never rule 必须被标记为 static 或 runtime，不能默认落到 human。
- environment-sensitive skill 必须有至少一个 environment assumption 或 availability check。

### 7.3 Pass 3：Rule Normalization

将自然语言规则规范化：

- MUST 规则转为正向 obligation。
- NEVER 规则转为禁止条件。
- 输出格式规则转为 output check。
- 文件安全规则转为 file-edit check。
- git 安全规则转为 git check。

### 7.4 Pass 4：Environment Guard Insertion

根据工具和环境假设插入 preflight checks：

- shell 类型检测。
- OS 检测。
- 命令存在性检测。
- runtime 版本检测。
- 路径格式检查。

### 7.5 Pass 5：Profile-guided Repair

根据 trace 中观察到的失败模式修改 IR：

- frequent-skip：把 step 标为 required，并生成 step-success check。
- frequent-failure：添加 recovery policy。
- environment-sensitive：添加 platform-specific alternative。
- high-token-cost：压缩重复说明或把固定逻辑下沉到 checker。
- context-sensitive：增加 explicit execution contract。

### 7.6 Pass 6：Lowering

将 optimized IR 降到三类产物：

- `controller`：指导 agent 按 step 执行。
- `checker`：检查规则和步骤是否被满足。
- `adapter`：处理不同 OS、shell、工具路径差异。

v1 的 lowering 目标不是生成完整自主程序，而是生成 agent runtime 可以调用的结构化执行辅助模块。

## 8. Skill Corpus

为了证明泛化能力，skill 选择要覆盖多类机制。

以下规模是 2026-07-06 的长期扩展设想，不再作为当前成功标准或当前阶段交付要求：

- 40-60 个 skill 做分类和浅层 IR 构造。
- 18-24 个 skill 做完整 IR 和 validation。
- 12-16 个 skill 做深度 benchmark。

类别覆盖：

| 类别 | 数量目标 | 深度评估目标 |
|---|---:|---:|
| 流程型 | 8-10 | 2-3 |
| 工具型 | 8-10 | 2-3 |
| 约束型 | 8-10 | 2-3 |
| 诊断型 | 6-8 | 2-3 |
| 生成型 | 6-8 | 1-2 |
| 环境敏感型 | 6-8 | 2-3 |

当前阶段执行 3 个 deep real-skill pilot，并在证据门通过后增加最多 3 个 replication pilot。任务数量由可判分性和 development/held-out 分离决定，不以凑足旧规模为目标。

## 9. 实验设计

概念实验矩阵：

```text
Skill x Agent x Environment x Context x Task
```

早期目标轴（其中 agent 和真实 OS 目前仍是计划轴）：

- Agents：3 个，包括 SkVM 默认 agent 设置、Codex CLI/desktop 兼容设置、一个开源 agent 设置。
- Environments：Linux、macOS、Windows 或 Windows/WSL。如果机器资源不足，Windows 可降为 PowerShell compatibility tests。
- Contexts：clean、noisy、long、compressed。
- Deep skills：长期 12-16 个；当前 3 deep + 最多 3 replication。
- Tasks per deep skill：8-12 个。

当前主表：

```text
S0: No skill
S1: Original natural-language skill
S2: Skill IR + static AOT passes (`ir-static`)
S3: Task-local profile-guided final IR (`ir-pgo`)
```

`ir-only`、`ir-profile`、`skvm-aot` 只在显式消融、归档复现或真实上游接入后使用。矩阵标签不能替代真实 harness/OS 切换证据。

## 10. 评价指标

### 10.1 效果指标

- Mean Success Rate
- Pass@k
- Task Completion Score
- Held-out Success Rate

### 10.2 稳定性指标

- Worst-case Success Rate
- Variance across agents
- Variance across environments
- Variance across contexts
- Regression Count

核心观察不是单点最高分，而是优化后性能分布更稳定。

### 10.3 Skill 语义指标

- Rule Coverage
- Rule Violation Rate
- Step Coverage
- Required Step Skip Rate

### 10.4 成本指标

- Token cost
- LLM calls
- Tool calls
- Wall-clock latency

### 10.5 IR 质量指标

- Schema validation pass rate
- Human correction count per skill
- Checkable rule ratio
- Environment guard coverage

## 11. Ablation Study

计划做以下消融：

| 设置 | 移除内容 | 目的 |
|---|---|---|
| Full | 无 | 完整方法 |
| No Profile | 移除动态 trace annotation | 验证 profile-guided optimization 的贡献 |
| No Env Guard | 移除环境检查和工具替代 | 验证跨 OS 稳定性来源 |
| No Checker | 移除 runtime checker | 验证规则违反率下降来源 |
| No Rule Normalize | 移除规则规范化 | 验证自然语言约束结构化的必要性 |

## 12. Case Study

报告中建议包含 3 个 case study：

1. 约束型 skill：展示 MUST/NEVER 规则如何变成 runtime checker，并降低 violation。
2. 工具/环境型 skill：展示 macOS/Linux/Windows 差异如何通过 environment guard 和 adapter 处理。
3. 诊断型 skill：展示失败 trace 如何回流到 IR，生成 recovery policy。

## 13. 技术栈

主技术栈贴合 SkVM：

- TypeScript：核心实现。
- Bun：运行、测试和 CLI。
- Zod：IR schema validation。
- JSON / JSONL：IR、trace、result 存储。
- Python：实验统计、画图、表格生成。
- Markdown：报告、case study、实验说明。

## 14. 交付物

代码交付：

- Skill IR schema。
- Skill parser。
- IR validator。
- AOT optimization passes。
- Runtime checker generator。
- Environment adapter generator。
- Trace profiler。
- Benchmark matrix runner。
- Result analyzer。

早期远期实验交付设想（当前不作为阶段完成条件）：

- 40-60 个 skill 的 taxonomy。
- 18-24 个完整 Skill IR 样例。
- 12-16 个 deep benchmark skill。
- main results table。
- ablation table。
- 3 个 case studies。

文档交付：

- Skill IR 设计文档。
- 实验设置文档。
- 技术报告。
- 答辩 slides。
- Demo README。

## 15. 原六周节奏（历史计划）

本节保留最初排期，不再用于判断当前进度。当前进度以实现计划顶部的 `Current Execution Ledger` 为准。

### Week 1：SkVM 复现、IR 设计、skill corpus

完成 SkVM 复现，确定 Skill IR v1，建立 skill taxonomy，准备 corpus。

### Week 2：静态 IR 构造与验证

实现 schema、parser、validator，完成 18-24 个 skill 的 IR。

### Week 3：Profiling 与 benchmark harness

跑 original skill 和 SkVM baseline，收集 trace，建立 result schema。

### Week 4：AOT passes 与 lowering

实现 rule normalization、environment guard、profile-guided repair、checker/controller/adapter lowering。

### Week 5：系统实验与消融

跑完整对比实验，完成 main table、ablation、case study 初稿。

### Week 6：报告、展示和加固

整理技术报告、slides、demo，补齐实验重复性和失败案例分析。

## 16. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| SkVM 代码理解成本高 | 影响接入速度 | 第 1 周先做薄集成，IR 模块保持独立边界 |
| 跨 agent 实验成本高 | 实验矩阵膨胀 | 固定 3 个 agent，其中一个可用 SkVM provider 配置模拟 |
| macOS/Windows 资源不足 | 环境评估不完整 | 使用 Linux + WSL/PowerShell compatibility + 容器差异作为替代 |
| LLM 抽取 IR 不稳定 | IR 质量波动 | 用 Zod validation 和 deterministic postprocess 约束输出 |
| skill 数量过多导致标注压力大 | 影响实验质量 | 当前硬限制 3 个 deep pilot + 最多 3 个 replication pilot，证据门通过后再扩展 |

## 17. 成功标准

当前阶段成功的标准不是“所有 skill 都被完美编译”，也不是达到早期数量目标，而是：

- 3 个有精确来源和许可证记录的 deep real-skill pilot 可复现导入。
- 主表包含 `no-skill | original | ir-static | ir-pgo` 的配对 held-out 结果。
- development feedback 与 held-out evaluation 严格分离，task-local PGO 能解释至少一类真实失败及其修复或明确失败边界。
- 报告平均成功率、worst-case、paired delta、regression count 和规则失败；任何负向回归都不被平均值隐藏。
- 已测轴和计划轴明确分开，不把标签当作跨 agent 或跨 OS 证据。
- 至少一个 pilot 给出从 Skill IR 到可复用 artifact package 的具体固态化设计或原型。

## 18. Literature Calibration After Task 7.5

Task 7.5 adds a literature-driven calibration step. The implementation direction remains Skill IR as an AOT pass inside the SkVM skill compilation pipeline, but the research framing and later evaluation should be sharpened.

### 18.1 Positioning

The closest system-level neighbor is SkillRT / SkVM, which treats skills as compilable artifacts for heterogeneous model-harness pairs. This project should be positioned as a semantic IR layer inside that broader compilation story: it makes workflows, constraints, tools, environment assumptions, runtime checks, recovery policies, and profile feedback explicit before optimization and lowering.

This project should not claim to replace SkVM. It adds a focused semantic representation and a small set of AOT passes that make skills more checkable and stable across agents, environments, and contexts.

### 18.2 Benchmark Refinements

The benchmark design should use paired evaluation. Each system should be compared on the same `caseId`, where a case is a stable skill, task, agent, environment, and context tuple. This makes negative deltas visible instead of hiding them inside averages.

The compared systems should include:

```text
S0: No skill
S1: Original natural-language skill
S2: SkVM AOT baseline
S3: Initial Skill IR only
S4: Skill IR with static AOT passes
S5: Skill IR with static AOT passes and profile-guided optimization
```

The result analysis should report mean success, worst-case success, variance across settings, paired delta versus original, regression count, rule violation rate, step coverage, and required-step skip rate.

### 18.3 Runtime Enforcement Framing

Checker lowering should currently be described as a declarative, checkable lowering specification. The current runner renders checks into agent-facing material, but it does not independently execute or enforce them. True lightweight runtime enforcement requires a checker runtime that evaluates predicates and applies enforcement actions outside the model response path.

The "No Checker" ablation is important because it isolates whether explicit runtime checking adds value beyond clearer prompts and static IR.

### 18.4 Typed Trace Feedback

Profile-guided repair should be described as typed trace feedback. The trace does not merely become reflective text. Repeated failure patterns become `ProfileAnnotation` records, and those records can generate checks, guards, or recovery policies.

Case studies should show the full chain:

```text
execution trace
  -> profile annotation
  -> generated check or recovery policy
  -> changed behavior in a later run
```

### 18.5 Adapter As Agent-Computer Interface

Adapter lowering should be treated as an agent-computer interface layer. Tool availability, alternatives, platform notes, and environment assumptions shape what the agent can reliably do. Benchmark failures should be tagged when the root cause is a poor interface or missing environment adaptation rather than reasoning failure.

### 18.6 Non-Changes

The literature review does not justify a large redesign at this stage. The project should not add full probabilistic model checking, a separate runtime-rule DSL, JIT recompilation, or automatic concurrency extraction before the current end-to-end research loop exists. These ideas can be listed as future work after benchmark results and case studies are available.

## 19. Task 11C Calibration: Dynamic Result Feedback

The Task 11 experiments clarified an important distinction in the current implementation.

The existing `ir-profile` system is a static Skill IR materialization path unless the input IR already contains `profile` annotations. It applies rule normalization, environment guard insertion, and `applyProfileGuidedRepair`, but the current seed corpus IR files still have empty `profile` arrays. Therefore, the positive results observed so far should be described as evidence for structured IR materialization, not yet as evidence for a full dynamic profile-guided optimization loop.

Task 11C closes this gap by adding a deterministic feedback path:

```text
scored real-agent result rows
  -> execution traces
  -> profile annotations
  -> profile overlay
  -> final optimized IR
  -> profile-guided repair pass
  -> held-out evaluation
```

The project uses a three-layer IR architecture:

```text
Static Base IR
  + Profile Overlay
  + Optimization Passes
= Final Optimized IR
```

Static Base IR is the cold-start result of reading or parsing a skill. Profile Overlay is evidence from observed runs. Final Optimized IR is produced by deterministic passes over both. This path should keep base corpus IR unchanged. Profile feedback is written as a derived artifact so that later experiments can compare:

```text
original   : natural-language skill
ir-profile : static Skill IR materialization over the base IR
ir-pgo     : Skill IR materialization over final IR with result-driven profile annotations and static passes
```

For an arbitrary newly imported skill, this project should distinguish cold-start and warm-start optimization. The cold-start path can generate a strong static optimized IR without prior execution evidence. The warm-start path can improve that IR using real profile feedback. The project should not claim a globally optimal final IR without validation; instead, it should report whether held-out runs show the profile-guided final IR improves over the static baseline.

The key evaluation rule is train/evaluate separation. Development or calibration rows may be used to generate profile annotations. Held-out rows should be used to measure whether those annotations improve later behavior without overfitting to the same failed outputs.

Infrastructure failures must not become profile feedback. Rows marked with `failureType: "infrastructure"` should be ignored by the feedback generator because provider, gateway, credential, timeout, and tool-call-format failures do not represent skill semantics.

The long-term validation target is automated, sampled, and layered rather than fully manual for every imported skill:

```text
Layer 0: import-time static validation
  schema, references, check coverage, environment assumptions

Layer 1: sampled smoke validation
  a small representative task/context/model sample after static optimization

Layer 2: promotion validation
  held-out tasks and paired deltas before a final IR artifact is treated as broadly better

Layer 3: periodic regression validation
  rotating samples across skill categories, contexts, model families, and environments
```

This means a user should not need to manually run the full research matrix for every skill import. The system should eventually decide which validation tier is necessary based on risk signals: new skill category, weak static coverage, environment-sensitive tools, high-severity output rules, prior profile failures, or changed optimization passes.

The current multi-model evidence should be reported conservatively:

- GPT-family routes produced the cleanest behavior evidence.
- Gemini route failures in Task 11 hard-002 were provider/tool-call infrastructure failures and should not be interpreted as skill regressions.
- Additional cross-family claims require routes that can complete the same paired matrix without infrastructure failures.

Task 11C should also make skill selection stricter. The current seed corpus is useful for coding-agent workflows, but final generalization claims need more neutral skill shapes: strict schema generation, bilingual or Chinese tasks, non-coding workflow skills, stronger context-conflict tasks, and environment-sensitive tasks whose success depends on tool adaptation rather than GPT-friendly prose conventions.

## 20. Task 11E Calibration: Deeper Final IR Evaluation And Next Optimizations

**2026-07-15 status:** This section records the seed-stage diagnosis. Its model-family observations are hypotheses generated from small, synthetic-seed-heavy evidence. They must not drive automatic artifact selection or be generalized to the real-skill corpus without new paired runs.

After the first `ir-pgo` validation run, the final IR mechanism is proven to execute but its quality benefit is still unclear. The next experiment should therefore widen along two axes:

```text
skills: all current deep-benchmark skills, not only report synthesis
models: multiple stable routes, preferably including at least one non-GPT family
```

The comparison should keep the system axis fixed:

```text
original
ir-profile
ir-pgo
```

Interpretation rules:

- `ir-profile` measures static Skill IR materialization over the base corpus IR.
- `ir-pgo` measures final IR artifacts compiled from base IR plus profile overlay.
- Since the current profile overlay only contains one report-synthesis annotation, gains outside report synthesis are static/final-IR pass effects rather than dynamic-profile effects.
- Infrastructure and route/tool-call failures must be separated from semantic failures.
- Cost and latency are part of promotion: a final IR artifact should not be called better on quality parity if it introduces large latency variance.

The next optimization roadmap is:

1. **Output schema learning:** convert repeated output-format failures into structured output contracts, section schemas, and field-level checks instead of generic rule checks.
2. **Model-family behavior profiles:** track profile annotations by model family or route so GPT, Gemini, Claude, DeepSeek, Qwen, and other routes can receive different repair hints when evidence justifies it.
3. **Confidence and risk scoring:** attach confidence, support count, task split, model diversity, and regression risk to overlays and final IR promotion decisions.
4. **Validation planner:** automatically choose validation tiers and sample sizes based on risk signals, budget, skill category, profile changes, and model-route health.
5. **Final IR promotion policy:** keep experiment final IR artifacts separate from base corpus IR until held-out paired deltas, cost, latency, and regression checks justify promotion.

The first Task 11E run supports this roadmap. Across six hard-002 tasks and three route-probed models, static `ir-profile` had the best cross-model semantic success rate, while `ir-pgo` was best on the GPT-family route but weaker than `ir-profile` on Qwen. This shows that final IR should be promoted conditionally, not globally. Model-family behavior and confidence/risk scoring are now necessary rather than optional refinements.

## 21. Task 11F Calibration: Model-Family Promotion Policy

**2026-07-15 status:** Implemented as an advisory analysis utility and now frozen. It is a method demonstration, not a mature promotion mechanism. The current real-skill phase will not deepen this component until task-local development/held-out evidence exists for the pilot corpus.

Task 11F turns the Task 11E interpretation into a deterministic evidence-support layer. The project now treats final IR promotion as a model-family-specific research signal instead of a global artifact replacement or automatic deployment decision.

The promotion policy consumes scored result rows and produces a report with this shape:

```text
scored rows per model route
  -> model-family grouping
  -> ir-profile vs ir-pgo paired comparison
  -> confidence and risk summary
  -> promote / keep static / hold decision
```

The historical policy report compared static `ir-profile` with dynamic/final `ir-pgo`. Infrastructure rows were excluded from semantic paired deltas but counted as risk. In the current research contract, the main table instead uses `ir-static` and task-local `ir-pgo`; promotion output remains advisory and cannot modify the base corpus.

The first promotion report over the Task 11E result files produced:

```text
gpt    -> promote-ir-pgo
gemini -> hold-for-more-validation
qwen   -> keep-ir-profile
```

This matches the manual interpretation and gives the later validation planner a concrete target: it should not merely run more cases, but run enough cases to assess whether a model-family-specific artifact is mature enough for stronger claims.

This is still not a full model-family behavior profile. The current implementation groups evidence by family and scores promotion risk. A later version should attach model-family support directly to profile annotations, output-schema repairs, and final IR artifacts so the optimizer can choose different repairs for GPT, Gemini, Claude, DeepSeek, Qwen, or other families when evidence supports that split.

The current signals are not mature enough to claim that any IR choice is final. `promote-ir-pgo` means "candidate worth regression validation," not "rewrite the base corpus" or "deploy automatically."

## 22. Task 11G Calibration: Validation Planner And Evidence Maturity

**2026-07-15 status:** Implemented as a dry-run advisory utility and now frozen. Automatic validation depth remains a northbound capability; the current pilot stage uses an explicit evidence gate so research-core work is not displaced by governance automation.

Task 11G corrects the main risk discovered after Task 11F: promotion reports are useful, but they can look more decisive than the evidence really is. The project should therefore add a validation planner that consumes `skill-ir-promotion/v1` reports and emits validation/optimization plans rather than adopting an IR artifact automatically.

The planner should encode five principles:

1. **Promotion policy is advisory:** promotion report decisions are evidence signals for planning and reporting, not final adoption decisions.
2. **Final IR remains improvable:** current dynamic feedback mainly handles rule failures by generating checks and recovery policies; output-schema learning and model-family-specific repair are still missing.
3. **Model-family conclusions are provisional:** GPT, Gemini, and Qwen results are useful case evidence, but they are not mature cross-family claims until more routes, tasks, and skill shapes are evaluated.
4. **Planner starts as dry-run:** the first planner should emit a JSON plan of recommended next experiments and repairs without calling models or changing corpus IR.
5. **Corpus expansion is part of optimization:** stronger evidence needs non-GPT-friendly skills, schema-heavy outputs, bilingual or Chinese tasks, non-coding workflows, and environment-sensitive tasks whose success depends on tool adaptation.

The planner output should classify model families into planning states such as:

```text
candidate-regression-validation
static-baseline-preferred
needs-route-health-and-heldout-validation
```

It should also propose concrete next actions:

```text
route probe
paired held-out validation
periodic regression validation
final-IR regression audit
output schema learning
model-family profile learning
corpus expansion
```

This stage is deliberately conservative. Its goal is to make the next experiments more systematic, not to hide open research questions behind an automatic selector.

## 23. Task 11H Calibration: Skill Provenance, No-Skill Baseline, Stability, And Token Cost

Advisor discussion after Task 11G clarified four important evaluation requirements.

First, current deep-benchmark skills are local seed fixtures. They are useful for building a controlled end-to-end pipeline, but synthetic fixtures alone are not persuasive evidence for broad skill optimization. The corpus must distinguish provenance:

```text
synthetic-seed
adapted-public
real-public
upstream-skvm
user-provided
```

Generalization claims should rely on a meaningful number of `adapted-public`, `real-public`, `upstream-skvm`, or `user-provided` skills. Synthetic seed skills should be described as pipeline construction and case-study fixtures.

Second, `no-skill` is a required baseline. Some tasks may perform better without a skill because the skill adds irrelevant constraints, longer context, or GPT-shaped prose. The evaluation should report:

```text
no-skill -> original -> ir-profile -> ir-pgo
```

on paired cases whenever budget allows. If `no-skill` beats all skill systems on a task shape, the correct optimization may be skill routing or skill narrowing rather than stronger IR materialization.

Third, stability means more than average success. The current measured target is improvement or non-regression across model families and contexts under one adapter/host. Environments and agents become reportable axes only after the runner actually switches them. Reports should emphasize:

```text
mean success
worst-case success
variance across settings
paired delta
regression count
rule violation rate
token cost
latency
```

Fourth, token reduction is a secondary artifact-solidification hypothesis. The project should not claim efficiency from shorter prompts alone; it should first identify repeated work that can be compiled or cached:

```text
runtime checks
environment probes
tool adapters
output schemas
generated code/templates
fixed command plans
```

This is an engineering hypothesis, not the current primary research claim:

```text
Skill IR improves stability when it makes useful skill semantics explicit and reusable; it can reduce token/tool overhead when repeated reasoning, tool setup, schema generation, or code generation is solidified into reusable artifacts.
```

This does not change the overall route, but it changes the next experimental priority. The next benchmark phase should add real/public skill provenance and no-skill comparisons before making strong cross-model claims.

## 24. Task 11I Calibration: Evidence Weighting, Real-Skill Restart, Amortized Cost, And Artifact Maturity

The follow-up discussion after Task 11H further clarifies the current project state.

First, existing self-created seed skills should be explicitly downweighted. They remain useful for TDD, controlled failure design, scorer calibration, and explaining the pipeline, but they should not be the main basis for broad claims. The main evidence track should restart from real skills:

```text
upstream-skvm
real-public
adapted-public
user-provided
```

The result analyzer and report should eventually separate or weight evidence by provenance. A mixed aggregate without provenance accounting can overstate generality, especially because the current seed skills are coding-agent-heavy and may fit GPT-style instruction following better than a neutral public skill distribution.

The initial real-skill source priority is:

```text
primary:    anbeime/skill
supplement: laolaoshiren/claude-code-skills-zh
backup:     travisvn/awesome-claude-skills
```

`anbeime/skill` is the main pool because its README describes a skill store with official skills, local Chinese skills, category metadata, JSON/CSV export, and public-source synchronization. `laolaoshiren/claude-code-skills-zh` supplements Chinese developer workflow skills with directly installable original skills. `travisvn/awesome-claude-skills` should be treated mainly as a backup index and conceptual reference until the linked real skill repositories are fetched.

Candidate metadata and sampling rules are tracked in `docs/skill-ir/real-skill-intake.md`.

The 2026-07-15 checkout audit makes this source policy concrete. Corpus entries now carry `provenance`, `source`, `sourceUrl`, and `evidenceWeight`; provenance and evidence weight flow through the benchmark matrix, real-agent plan, raw/scored rows, and slice analyzer. The reproducible source snapshot is `benchmarks/skill-ir/corpus/real-skill-intake.json`.

The audit found 70 real `SKILL.md` artifacts in `anbeime/skill`, 20 in `laolaoshiren/claude-code-skills-zh`, and none in the awesome index itself. Because `anbeime/skill` has no repository-wide license, reuse is decided per nested artifact. The awesome index was followed to the MIT-licensed `K-Dense-AI/claude-scientific-skills` repository, which supplies non-coding scientific candidates. The first pilot is `law-to-markdown`, `zh-code-reviewer`, `api-tester`, `env-manager`, `zh-readme`, and `experimental-design`.

Before pilot IR conversion, the benchmark needs a source-backed import boundary. Licensed original `SKILL.md` files should be stored with attribution and referenced by the IR source. The `original` system must materialize the exact file contents; a path-only placeholder is not a valid baseline. Real-skill conversion therefore proceeds through source import and integrity checks before base IR construction, task authoring, or paid evaluation.

Second, token cost should be evaluated as amortized cost over repeated invocations. AOT optimization can pay more at import time because it parses the skill, validates the IR, collects profile evidence, generates checks/schemas/code, and verifies artifacts. That is acceptable only if repeated use becomes more stable or cheaper:

```text
total_original(N)  = original_runtime_cost * N
total_optimized(N) = compile_cost + profile_cost + optimized_runtime_cost * N
break_even_N       = smallest N where total_optimized(N) <= total_original(N)
```

Reports should therefore distinguish:

```text
upfront compile/profile cost
steady-state per-run cost
break-even invocation count
quality-preserving savings after break-even
```

Third, the current `final IR` and `ir-pgo` artifacts are not yet the final target. They are still close to structured workflow JSON: steps, rules, tool assumptions, runtime checks, and recovery policies. The long-term goal is to solidify repeated work into stable reusable artifacts, such as code blocks, file blocks, templates, schemas, checkers, adapters, and fixed tool plans that do not need to be regenerated each run.

The artifact maturity model is:

```text
L0 natural skill text
L1 structured workflow IR JSON
L2 lowered controller/checker/adapter/schema artifacts
L3 stable reusable code/file/template/tool-plan blocks
L4 validated artifact package with provenance, cache policy, and regression evidence
```

The current implementation is mainly between L1 and early L2. It has a connected research loop, not a finished optimization product. The engineering target is a `Validated Skill Artifact Package` containing authoritative `skill_ir.json`, a generated `skill.md` view, reusable `checks/`, `schemas/`, `scripts/`, `templates/`, and `tool-plans/`, plus provenance and validation notes. Future work should move step by step toward this package and report maturity honestly rather than describing the loop as complete.
