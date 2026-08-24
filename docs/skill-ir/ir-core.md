# Skill IR 核心组件

本文档说明当前 Skill IR 的 schema、parser、validator、trace/profile、优化 passes
和 lowering。实验调度与评分见 `docs/skill-ir/evaluation-system.md`，动态回流和
artifact runtime 见 `docs/skill-ir/optimization-and-artifacts.md`。

## 1. 目录

```text
src/skill-ir/schema.ts
src/skill-ir/parser.ts
src/skill-ir/validate.ts
src/skill-ir/source-audit.ts
src/skill-ir/passes/
src/skill-ir/lowering/
src/profiler/trace-schema.ts
src/profiler/profile-annotation.ts
```

## 2. Skill IR v1

权威入口是 `SkillIRSchema`：

```ts
import { SkillIRSchema, type SkillIR } from "./src/skill-ir/schema";

const ir: SkillIR = SkillIRSchema.parse(candidate);
```

主要字段：

| 字段 | 作用 |
|---|---|
| `id`, `name`, `version`, `description` | Skill 身份。 |
| `category`, `source` | 分类与来源。 |
| `inputs`, `outputs` | 用户可见输入输出契约。 |
| `preconditions` | 执行前条件。 |
| `steps` | 有 id、kind、依赖和条件的流程节点。 |
| `rules` | MUST/SHOULD/NEVER 等约束。 |
| `tools` | 命令、provider 或 capability 需求。 |
| `environment` | OS、变量、路径和依赖假设。 |
| `checks` | 可执行或可观察检查。 |
| `recovery` | 失败触发与恢复动作。 |
| `profileAnnotations` | 与 step/rule/check 绑定的运行证据。 |

`SkillSourceSchema` 区分 inline 与 file source。File-backed real skill 的 exact
正文和 resource closure 在 benchmark materialization 阶段加载，IR 中不复制
整份外部仓库。

### Source Audit Sidecar

真实 skill 的 profile-empty base IR 使用独立 `SkillIRSourceAuditSchema`：

```ts
const audit = SkillIRSourceAuditSchema.parse(candidate);
const report = await verifySkillIRSourceAudit(ir, audit, rootDir);
```

Verifier 检查 source digest、IR source binding、证据 locator、逐节点覆盖和禁用 evidence。
Markdown 证据使用行号范围；JSON 证据使用显式 allowlist pointer。包含 `tasks` 的 JSON 只
允许 development `prompt`，不得引用 eval、fixture、threshold 或 held-out prompt。Base IR
必须保持空 `profile`。该 sidecar 是静态 provenance 门禁，不是 scorer，也不进入 agent
prompt。

`i18n-helper-contribution-v2` 是当前 source-transform 实例：base IR 绑定 exact `SKILL.md`、两个 development
prompt、public contract 与 `i18n-report-semantics.json`。逐节点 audit 覆盖扫描/排除、稳定 key、插值与
i18next v4 复数、已有翻译、protected inputs、声明输出集合及报告 ABI；不引用 held-out、evaluator、运行结果
或 profile feedback，也不把后验 `nul` 文件名写入 IR。Corpus 只有在 schema、validator、source audit、
controller/checker/adapter lowering 和 agent-facing render 全部通过后才标记为 `runnable`。

## 3. Parser

公开函数：

```ts
parseSkillIRFromJsonCandidate(candidate: unknown): SkillIR
buildSkillIRExtractionPrompt(skillText: string): string
```

Parser 只接受 JSON candidate，不自行执行模型调用。它先提取候选对象，再通过
`SkillIRSchema` 严格解析。Extraction prompt 是 agent/compiler 的输入模板，不能
替代 schema validation。

失败模式：

- 非对象或不可解析 JSON；
- 缺少必填字段；
- 未知 enum/step kind；
- 额外字段被 strict schema 拒绝。

## 4. Validator

```ts
validateSkillIR(ir: SkillIR): ValidationReport
```

Schema 负责字段形状，validator 负责跨字段一致性：

- step id 唯一；
- dependency 指向存在 step；
- rule/check/profile target 存在；
- recovery target 与 trigger 合法；
- 重复或矛盾引用被报告。

返回值：

```ts
type ValidationReport = {
  valid: boolean;
  issues: string[];
};
```

任何 parser、pass 或 package compiler 输出在消费前都应重新验证。

## 5. Trace 与 Profile Annotation

`src/profiler/trace-schema.ts` 定义严格的 `TraceEventSchema` 和
`ExecutionTraceSchema`。Trace 记录 model、agent、environment、context、task、
run identity、step/rule/check 事件和结果。

```ts
buildProfileAnnotations(traces, options): ProfileAnnotation[]
```

Annotation 必须绑定 IR target，记录 observation、failure 类型、次数和建议动作。
Raw stdout、secret 和 scorer expected 不应进入 annotation。

Profiler 原有 primitive/TCP 能力位于 `src/profiler/`，Skill IR 项目当前主要使用
trace schema 和 profile annotation，不把 primitive profile 自动等同于 skill
optimization evidence。

## 6. 静态 Passes

所有 pass 接收 `SkillIR` 并返回新对象，不修改输入。

### Rule normalization

```ts
normalizeRules(ir: SkillIR): SkillIR
```

规范规则文本、severity、scope 和重复项，使 lowering 和 checker 获得稳定输入。

### Environment guards

```ts
insertEnvironmentGuards(ir: SkillIR): SkillIR
```

根据明确的 environment/tool assumption 生成 preflight check 和 recovery。没有
静态证据时不猜测 OS、路径或依赖。

### Profile-guided repair

```ts
applyProfileGuidedRepair(ir: SkillIR): SkillIR
```

消费 typed profile annotation，为已存在 target 增加 check/recovery。当前主线更
严格的 dual-source repair 在 benchmark 子系统实现，见优化与 artifact 文档。

### Typed output repair

```ts
applyTypedOutputRepairs(ir, directives, catalog): SkillIR
```

v1/v2 支持固定模板 `json-schema-contract` 与 `source-qualified-finding`。v3 另支持
`source-audited-rule-enforcement`：target 必须是输入 base IR 中已经存在的 `rule-*`，typed pass 只绑定 target，
不接收新规则或 check/recovery 自由文本；repair mapping 还必须包含同一 `rule:<targetRef>` source-audit target。
后续 profile-guided repair 从已有 rule 的 `normalizedForm` 确定性派生 check/recovery。既有两个 kind 在 v3 中继承
v2 字节语义；v1/v2 catalog 和历史 provenance 仍拒绝新 kind。只有 semantic delta 才提升 catalog 版本，后续
parser、timeout、日志或确定性实现修复继续使用 v3，以 implementation digest/attempt 区分。

## 7. Lowering

### Controller

```ts
lowerToControllerPlan(ir: SkillIR): ControllerPlan
```

生成按依赖排序的执行步骤、条件、工具与恢复入口。

### Checker

```ts
lowerToCheckerSpec(ir: SkillIR): CheckerSpec
```

生成 rule/check 的声明式检查规格。它本身不是独立 runtime enforcement；只有被
artifact checker 编译并执行后才产生 runtime gate。

### Adapter

```ts
lowerToAdapterSpec(ir: SkillIR): AdapterSpec
```

生成模型/agent 注入所需的工具和环境要求。

Benchmark 的 `renderSkillMarkdown` 还会渲染 inputs、outputs、preconditions、tools、
environment、steps、rules、checks 和 recovery，形成 agent-facing `skill.md`。

## 8. 典型数据流

```text
SKILL.md
  -> extraction candidate
  -> SkillIRSchema.parse
  -> validateSkillIR
  -> verifySkillIRSourceAudit (real file-backed base IR)
  -> normalizeRules
  -> insertEnvironmentGuards
  -> optional typed/profile repair
  -> validateSkillIR
  -> controller/checker/adapter/skill.md lowering
```

### 8.1 Source-only automatic construction candidate

Task 18.26 新增 `automatic-construction.ts`，作为零模型、零付费的保守构造入口。输入 schema 只接受一个
digest-pinned 的公开 `SKILL.md` 及 upstream provenance；schema 为 strict，不能夹带 manual base IR、benchmark
contract、scorer、held-out 或模型输出路径。抽取器统一读取 frontmatter、workflow、output 和 rule-like 段落：编号
workflow 子标题优先于其实现 bullet，没有编号子标题时才使用有序列表。它不按 skill id 分支。

一次调用稳定产生四个 candidate：source contract、`skill-ir/v1` base IR、construction validation plan 和
non-executable package candidate。前三项通过 source digest、schema、cross-reference 和 source-trace 检查；validation
plan 把 task ABI/domain semantics 与 package runtime 明确标为 `requires-human`，package 的 execution plan 保持
`null`，并列出 domain compiler/checker/output contract blocker。这里的 “candidate” 不等于 source-audited、
benchmark-qualified 或 runtime validated。

`automatic-construction-shadow.ts` 强制先生成并持久化全部 candidate digest，之后才读取由 catalog path+sha256
预先冻结的手工 oracle；oracle 漂移直接 fail closed。7 个 method
case 均成功生成四类候选且 SkillIR reference error 为 0，公共 core 的 case-id branch delta 为 0；但 6 个有手工
base IR 的案例中，自动/手工 rule `sourceText` 精确重合均为 0。手工件融合了公开 benchmark task ABI、domain
entity/tool/check/recovery 语义，source-only 抽取不能诚实补齐，因此当前没有任何 candidate 达到 portfolio automation
资格，既有 flags 不变。

```powershell
bun test ./src/benchmarks/skill-ir/automatic-construction.test.ts `
  ./src/benchmarks/skill-ir/automatic-construction-shadow.test.ts
bun run ./src/benchmarks/skill-ir/automatic-construction-shadow-run.ts `
  --measurement-completed-at=<ISO-8601>
```

Task 18.18 的 BIDS base IR 是该链路的新真实案例：`profile=[]`，所有 intent/input/output/step/rule/tool/check 节点均
由固定 source closure 审计；领域执行差异进入 23 LOC 声明式 artifact adapter 和独立 compiler/runtime，不进入
通用 `src/skill-ir` 分支，因此相对 construction baseline 的 core branch delta 为 0。该 IR 的 deterministic
artifact 机制测试通过，但后续质量矩阵因 benchmark value-semantics disclosure 缺口 measurement-invalid；source
audit 通过不能替代 scorer 合同有效性。

## 9. 测试

```powershell
bun test ./src/skill-ir ./src/profiler/trace-schema.test.ts `
  ./src/profiler/profile-annotation.test.ts
bun run typecheck
```

重点回归：

- strict schema 和 enum；
- duplicate/missing target；
- pass immutability 与 idempotence；
- annotation target binding；
- lowering 不丢 inputs/outputs/environment；
- typed repair catalog 隔离。
- source audit digest、coverage、pointer allowlist 和 held-out/evaluator leakage。

## 10. 修改注意

1. Schema 字段变化必须同步 parser、validator、fixtures、lowering 和 package schema。
2. 新 pass 必须先写 RED，验证输入不变和重复执行行为。
3. 不把 benchmark gold、held-out 或模型族猜测写入通用 IR pass。
4. Runtime enforcement 应进入 artifact checker，不把声明式 lowering 描述成已执行。
5. 组件变化更新本文档，不再新增单功能 Markdown。
