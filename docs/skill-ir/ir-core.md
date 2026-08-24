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

### 8.2 Thin task description domain construction

Task 18.27 新增 additive `automatic-domain-construction.ts`，不修改 18.26 source-only v1。输入由同一 digest-pinned
`SKILL.md` 加 `skill-ir-task-description/v1` 组成；声明 strict 限定 `inputs`、`outputs.structure` 与封闭
`passCriteria.predicate`，所有层拒绝 scorer/evaluator、gold/answer、held-out、模型输出和未知字段。物理 LOC 上限
为 80，`inputs + outputs + criteria + required fields/semantic roles` 上限为 40；超限仍保留 shadow evidence，但
标记 `declaration-heavy`，deterministic construction gate 失败。

Domain core 先复用 source-only extractor，再确定性替换 IR task ABI、生成 `check-*` binding、domain contract、
validation-plan predicate 和 non-executable package candidate。`verifyDomainConstructionBindings` 可独立重验声明、
contract、IR 与 plan 的 input/output/check/predicate 闭包；篡改任一层会失败。`input-integrity`、
`output-presence`、`exact-output-set`、`json-shape` 当前只表示可由通用确定性 plan 下沉，Task 18.27 没有执行
workdir runtime；`source-grounding`、`content-fidelity`、`cross-artifact-consistency` 与 `runtime-behavior` 明确标记
`domain-runtime-required`。因此 semantic parity 固定为 `not-established`，不能从结构对齐推断任务成功。

7-case shadow 先写完全部 candidate digest，之后才读取手工冻结件。7 份声明均在薄度预算内（总 159 LOC、120
semantic entries、15 human minutes），生成 144 个 source units、75 个 declaration units 和 150 个自动 binding；
19 个结构 predicate 与 21 个 domain-runtime predicate 分账。每案 gap 由其实际未下沉 predicate 和 output path
推导，不再使用模板 reason。7/7 仍需 runtime/compiler，四类 portfolio eligibility 均为 0/7。

### 8.3 Structural predicate execution bridge

Task 18.28 新增 additive `automatic-structural-execution.ts`。它只接受 18.27 candidate 加声明式 path binding，将
`input-integrity`、`output-presence`、`exact-output-set`、`json-shape` lowering 为 strict structural execution
plan；通用 target/predicate 循环中没有 case id 或 skill id 分支。Symbolic ABI target 必须由评估 catalog 绑定到
具体路径，literal directory 则保留 prefix 语义；adapter 路径数和人工分钟与声明/core 分账。

执行不是内存占位：runner 为每个场景写 initial workdir manifest，以
`automatic-structural-execution-runtime.ts` 构建 catalog-valid validated artifact package，再复用既有 runtime
执行 bundled checker。Checker 比较真实 workdir snapshot 与初始 manifest，并返回 strict
`skill-artifact-validation-report/v1`。Task 18.28 的 7 个 frozen case 共执行 33 个 baseline/negative 场景，19 个
实际声明 predicate 均进入 runtime；`output-presence` 没有出现在该 7-case 分母中，只由 focused/runtime tests 覆盖。

与手工 checker 的 shadow projection 先按 exact/manual-stricter/domain-bundled 分类，只有 exact projection 可建立
execution parity；完整 semantic parity 始终不由结构结果派生。Domain 探针使用一个 skill-neutral JSON pointer
relation primitive 加声明参数，i18n 单案例 baseline/mismatch 行为成立，但泛化与 semantic parity 未建立。下一层
若需要 case-id 分支，应停在 adapter/declaration 边界，不能污染 core。

### 8.4 Minimal output construction

Task 18.29 的 `automatic-output-construction.ts` 将结构 plan 中 public、read-only JSON inputs 与 JSON-object outputs
编译为 strict `skill-ir-automatic-output-construction-plan/v1`。首版只有一个无 skill 分支的
`source-field-projection`：若某 required output field 在恰好一个输入 JSON 的顶层出现，就记录 source path/pointer 与
target pointer；缺失或歧义字段、非 JSON、opaque structure 和非具体 output 均进入 typed unresolved。Compiler 不写
常量、占位符或 gold，也不读取 evaluator payload。

Process runner 在真实 workdir 创建目标目录并写 JSON 文件；随后同一 package 的 checker 先执行 18.28 structural
plan，再校验 projection relation。Experimental Design 与 i18n 共生成 3 个新文件/3 个字段，同一原语跨两案
baseline pass/mismatch fail，但仍有 15 个 unresolved，两个 package 都因真实必需字段/文件缺失而 validation-failure。
跨案 reuse 不是完整 domain predicate parity；semantic parity 与 automatic eligibility 均未建立。

### 8.5 Declarative JSON Pointer successor

Task 18.30 的 additive `automatic-json-pointer-construction.ts` 只接受 value-free
`copy-json-value(source endpoint, target endpoint)`。Compiler 校验 source 是 structural plan 中的 public read-only
JSON input，target 是 base plan 已生成的 JSON-object required field，并且精确对应现存 `source-field-missing`
unresolved；运行时值只在 workdir 执行期读取，不序列化到 plan/package/report。Runner 先执行 18.29 base plan，再
覆盖 pointer target；checker 组合 structural、source-field projection 与 pointer-copy relation。

Experimental Design 两次复制、i18n 一次复制均在真实 workdir baseline pass、值突变 fail，3 个 protected-input
集合保持不变；unresolved 15 -> 12，但 package 仍 2/2 validation-failure。报告把剩余项完整分类为 pointer 1、
selector/lookup 1、domain-runtime 10；这是查询路线理论 floor=10 的 ceiling 审计，不是 selector 实现或 semantic
parity 证据。Core source 不含两个 case id，reuse gate 只对同一 primitive 的双案例执行证据通过。

### 8.6 Restricted Domain Plan

Task 18.31 的 `automatic-restricted-domain-plan.ts` 是 additive、skill-neutral 的受限数据流解释器。Strict v1 计划最多
64 个前向引用步骤，只允许有界 text/JSON read、JSON pointer、key-value/regex fact extraction、pluck/filter/project、
set/boolean/choose 和声明输出 write/copy；路径必须落在公开 read binding 或声明 write binding 内。Shell、network、
动态 import、任意 JavaScript、未知 operation、前向/循环引用、路径逃逸及未声明输出均 fail closed。

`automatic-domain-plan-synthesis.ts` 从 exact `SKILL.md`、薄 task description、一个公开 development task 的
`id/split/prompt/fixtures` 投影和 DSL 合同构造单次 forced-tool request；`eval`、gold、threshold、held-out 与 evaluator
payload 不进入请求。生成后先执行 construction-task-only literal leakage audit，再对两个 development task 的真实
binding 做静态校验。`automatic-restricted-domain-plan-runtime.ts` 将同一计划装入 catalog-valid artifact，process 在
真实 workdir 执行，checker 复用 18.28 structural plan；protected initial manifest 始终独立核验。

Shadow runner 先冻结两个案例的全部成功计划，才执行 Env Manager 与 Law 各两个真实 workdir，最后在隔离子进程中
加载 digest-pinned manual evaluator。Pre-model freeze 另绑定实现 closure、请求 digest 和 provider route/backend；
执行前任何漂移都会阻断。0-paid freeze 只授权唯一两次生成调用，不能从 focused integration fixture 推导
execution/manual parity 或 eligibility。

唯一双案例 execute 后，两案均未产生 strict plan，故解释器/package 的 focused 正例没有转化为 model-generated
workdir evidence。首版合并分类为 `provider-or-parse`，failure digest 不同，但没有足够字段区分 HTTP/tool-call/
arguments JSON/Zod；plan LOC/steps、execution 与 manual load 均为 0。Automatic eligibility 与 reuse gate 明确失败，
而 precise failure attribution 保持 `not-established`。原请求不重跑；后续只允许无 task 的同工具合同 qualification。

Task 18.32 的 transport qualification 复用同一 `completeRestrictedDomainPlanOnce`、tool schema 与 strict plan parser，
但 request 只包含一个显式 canonical two-step plan，task/source/evaluator/held-out payload 均为 0。Synthesis error 在
`transport/http/response-json/tool-call/arguments-json/plan-schema` 六个边界分型；失败仅持久化 stage、duration、HTTP
status 与 detail digest，不保存 body/reasoning。Pre-model freeze 绑定 4-file closure、request/expected-plan、route/
backend 和唯一 1-call/0-retry authorization；它是独立诊断，不会重分类 Task 18.31。

真实 qualification 返回 canonical exact match，632/134 input/output tokens、5,023.5 ms、failure null。这证明当前
provider 能承载该 tool schema 且 strict parser 可接受返回值；不证明复杂 domain request 会稳定生成合法计划。历史
18.31 仍为 0/2 且归因未知。Restricted Domain Plan 保留为受限候选机制，暂不接 7-case production path；domain
runtime 需要人工审核/补齐，直到新的双案例前瞻设计建立可靠性。

Task 18.33 为同一 Restricted Domain Plan v1 增加的是 observability 与独立 attribution identity，不滚动 DSL/schema
版本。`buildRestrictedDomainPlanCompletionPayload` 显式选择历史 `shape-minimal` 或完整
`domain-plan-strict` provider schema；后者用 provider 可接受的结构约束表达 15 种 step，本地 Zod 继续执行 safe
path、JSON Pointer、regex flag、引用顺序与计划不变量的严格验证。Completion 返回脱敏 response metadata，错误被归入
HTTP/network、缺 tool call/content、JSON parse 或 strict local schema reject，不暴露 raw body/content。

归因 runner 的 `context-minimal -> context-strict -> task-bound-strict` 三阶段只改变一个变量层级。真实执行 3/3
成功，最后阶段的 26-step 安全计划经过 task1 literal leakage 与两个 development task binding 后写入
`generated-plan.json`；任何 raw provider response 都未持久化。这证明当前生成/结构绑定路径可用，不证明计划可执行。

Task 18.34 的真实 workdir 执行揭示原 v1 结构 validator 缺少 register 数据流类型关系：`parse-key-value-lines` 的
string-array 可通过 schema/binding，却在 `write-text-template encoding=text` 处必然失败。为保留 Task 18.33 冻结
closure，修复采用 additive `automatic-restricted-domain-plan-static-types.ts`，不滚动 Domain Plan schema 版本，也不
修改旧解释器；successor 入口可在 runtime 前调用该通用审计。它只修复已证实的类型门缺口，不把未使用公开规则或
Vite 引用漏检伪装为已解决语义。

Task 18.35 不改写 18.34，而是新增 `automatic-domain-plan-manual-parity.ts`。它把同一 task 的 pristine baseline 与
post-plan partial workdir 同时交给 digest-pinned development evaluator，按任务自身 criterion/weight/hard gate/
threshold 汇总；runtime failure 不再成为“不运行 evaluator”的理由。Full task parity 仍严格要求 runtime complete、
protected inputs preserved 与所有 criterion pass。Env 的真实口径为每任务 3 项，结果合计 0/6 -> 1/6，两个 task
均未 full pass。

同阶段的 `automatic-domain-plan-single-generation.ts` 是 case-driven 单请求 successor：case/source/declaration/
task binding 只来自 catalog，core 不含 case id 分支。它在计划落盘前依次执行 task-only literal leakage、两个
development binding 与通用 static type audit；pre-model freeze 绑定 exact strict request/provider payload、route、
candidate 与 9-file implementation closure，授权 1 call、0 retry。该首版 identity 不扩 DSL，也不提升旧 component
版本。

```powershell
bun test ./src/benchmarks/skill-ir/automatic-construction.test.ts `
  ./src/benchmarks/skill-ir/automatic-construction-shadow.test.ts `
  ./src/benchmarks/skill-ir/automatic-domain-construction.test.ts `
  ./src/benchmarks/skill-ir/automatic-domain-construction-shadow.test.ts
bun run ./src/benchmarks/skill-ir/automatic-construction-shadow-run.ts `
  --measurement-completed-at=<ISO-8601>
bun run ./src/benchmarks/skill-ir/automatic-domain-construction-shadow-run.ts `
  --measurement-completed-at=<ISO-8601>
bun test ./src/benchmarks/skill-ir/automatic-structural-execution.test.ts `
  ./src/benchmarks/skill-ir/automatic-structural-execution-runtime.test.ts `
  ./src/benchmarks/skill-ir/automatic-structural-execution-shadow.test.ts
bun run ./src/benchmarks/skill-ir/automatic-structural-execution-shadow-run.ts `
  --measurement-completed-at=<ISO-8601>
bun test ./src/benchmarks/skill-ir/automatic-output-construction.test.ts `
  ./src/benchmarks/skill-ir/automatic-output-construction-runtime.test.ts `
  ./src/benchmarks/skill-ir/automatic-output-construction-shadow.test.ts
bun run ./src/benchmarks/skill-ir/automatic-output-construction-shadow-run.ts `
  --measurement-completed-at=<ISO-8601> --metered-human-minutes=<minutes>
bun test ./src/benchmarks/skill-ir/automatic-json-pointer-construction.test.ts `
  ./src/benchmarks/skill-ir/automatic-json-pointer-construction-runtime.test.ts `
  ./src/benchmarks/skill-ir/automatic-json-pointer-construction-shadow.test.ts
bun run ./src/benchmarks/skill-ir/automatic-json-pointer-construction-shadow-run.ts `
  --measurement-completed-at=<ISO-8601> --metered-human-minutes=<minutes>
bun test ./src/benchmarks/skill-ir/automatic-restricted-domain-plan.test.ts `
  ./src/benchmarks/skill-ir/automatic-domain-plan-synthesis.test.ts `
  ./src/benchmarks/skill-ir/automatic-restricted-domain-plan-runtime.test.ts `
  ./src/benchmarks/skill-ir/automatic-domain-plan-shadow.test.ts
bun run ./src/benchmarks/skill-ir/automatic-domain-plan-shadow-run.ts --phase=freeze
bun run ./src/benchmarks/skill-ir/automatic-domain-plan-shadow-run.ts --phase=execute `
  --measurement-completed-at=<ISO-8601> --metered-human-minutes=<minutes>
bun test ./src/benchmarks/skill-ir/automatic-domain-plan-transport-qualification.test.ts
bun run ./src/benchmarks/skill-ir/automatic-domain-plan-transport-qualification-run.ts --phase=freeze
bun run ./src/benchmarks/skill-ir/automatic-domain-plan-transport-qualification-run.ts --phase=execute `
  --measurement-completed-at=<ISO-8601>
bun test ./src/benchmarks/skill-ir/automatic-domain-plan-attribution.test.ts
bun run ./src/benchmarks/skill-ir/automatic-domain-plan-attribution-run.ts --phase=freeze
bun run ./src/benchmarks/skill-ir/automatic-domain-plan-attribution-run.ts --phase=execute
bun test ./src/benchmarks/skill-ir/automatic-restricted-domain-plan-static-types.test.ts `
  ./src/benchmarks/skill-ir/automatic-domain-plan-semantic-inspection.test.ts
bun run ./src/benchmarks/skill-ir/automatic-domain-plan-semantic-inspection-run.ts
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
