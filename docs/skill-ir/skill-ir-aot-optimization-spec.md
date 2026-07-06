# Skill IR AOT Optimization Spec

日期：2026-07-06

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
  -> Baseline Execution + Trace Collection
  -> Profile Annotation
  -> AOT Optimization Passes
  -> Optimized Skill IR
  -> Lowering
  -> Runtime Controller / Checker / Adapter
  -> Benchmark Evaluation
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

计划规模：

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

每个 deep skill 准备 8-12 个任务，其中 30%-40% 作为 development tasks，60%-70% 作为 held-out tasks。

## 9. 实验设计

实验矩阵：

```text
Skill x Agent x Environment x Context x Task
```

推荐规模：

- Agents：3 个，包括 SkVM 默认 agent 设置、Codex CLI/desktop 兼容设置、一个开源 agent 设置。
- Environments：Linux、macOS、Windows 或 Windows/WSL。如果机器资源不足，Windows 可降为 PowerShell compatibility tests。
- Contexts：clean、noisy、long、compressed。
- Deep skills：12-16 个。
- Tasks per deep skill：8-12 个。

对比设置：

```text
S0: Original natural-language skill
S1: SkVM AOT baseline
S2: Initial Skill IR only
S3: Skill IR + static AOT passes
S4: Skill IR + static AOT passes + profile-guided optimization
```

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

实验交付：

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

## 15. 六周节奏

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
| skill 数量过多导致标注压力大 | 影响实验质量 | 分层：40-60 taxonomy，18-24 full IR，12-16 deep benchmark |

## 17. 成功标准

项目成功的标准不是“所有 skill 都被完美编译”，而是：

- Skill IR 能覆盖多类 skill。
- AOT pass 能产生可检查、可优化的中间产物。
- profile feedback 能解释并修复一部分真实失败模式。
- 优化后在 deep benchmark 上平均成功率提升。
- 优化后 worst-case success rate 提升。
- 跨 agent、环境、上下文方差下降。
- rule violation 和 required step skip 明显减少。

