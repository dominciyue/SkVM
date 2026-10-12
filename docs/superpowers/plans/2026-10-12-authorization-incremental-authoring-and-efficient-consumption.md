# BH0–BH17：DSL 渐进编写、有效草稿保留与高效消费

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan. Production changes use test-driven development. The main developer owns design, implementation, shared documents and Git. Read-only scouts follow AGENTS; continue across routine checkpoints without asking again.

**Goal:** 在已跑通的真实 Download DSL 上，使模型能够逐步补成有实质计算的程序、修错时保住有效部分，并让消费者直接利用当前执行结果；再以另一项已暴露任务检验共享算子。

**Architecture:** 沿用 SkVM 普通 inquiry、完整原 skill、source tools、executable-contract、resourceWorkflow、三值求值、会话归档和官方账号 adapter。将作者原稿、可采用步骤、活动程序和消费视图分开，逐项编译并按数据与控制依赖传播缺口；新增薄的增量编辑和紧凑消费投影，所有入口共用现有执行核心。研究记录继续维护同一正文。

**Tech Stack:** TypeScript、Bun、Zod、现有有限求值器与账号入口。开发 **gpt-6-astra/high**；真实实验沿用已授权的官方账号 **gpt-5.6-sol/high**。

状态：`planned-authorized`。规划基线 `4595339f201239e3dbba7c422d315f29df8de276`。用户已授权编写并派发新线程；本次登记未修改生产代码或启动实验。

Identity：`authorization-incremental-program-v1`。结果目录 `results/skill-ir/skill-dsl-research/development/authorization-incremental-program-v1/`；临时运行放在 `D:/skill优化/project-maintenance/runs/authorization-incremental-program-v1/`。继续 `skill-ir-aot`，只推用户 `origin`，不开分支/worktree。派发后的新线程是唯一代码、共享方法文档及 Git 写者。

## 一、起点与本轮重点

BG 已经交付可用的开发者程序：25 步 Download 主链从普通入口执行，得到请求文档 10 → 授权根 10 → 文件 11/archive；只改 version 为不缺省的空字符串，同程序得到文件 12/original。这个成果继续保留，不重新证明整条历史。

2026-10-12 发布后复核得到四个具体问题：

1. `compileExecutableContract` 的 progressive 目前只逐项处理 sourceDeclarations，resourceWorkflow 仍整体 parse。给成功程序追加一个无关 value 步骤、只漏 `because`，普通 check 就返回 `contract-shape / resourceWorkflow.steps.25.because / Required`，全部步骤和源码单元均为 0。复核原件在本地 `project-maintenance/reviews/bg-review-9d48e5aef6544d84aa32b01450d3c3e4/invalid-sibling/`；测试须可由仓内 fixture 重建，不依赖这个本地目录。
2. BG 自动作者第一稿实际提出了 7 个资源步骤，但缺少 source/because，guard.permission 也用了错误对象形状；后两稿删去了整段 resourceWorkflow，只留下三源合同。首稿还把可表达的查找/回退几乎全写成 external，并引用未定义的 archive_selection。只有格式宽容仍不足以补成主链。
3. 给定程序的 DSL 消费实际使用 43 次工具，其中 29 次 source_read、6 次 search、6 次 symbol；Markdown 为 46 次。部分读取是补上游和文件名语义，部分可能重复覆盖，需要按实际范围区分。full program、完整 report、历史和 current context 存在重复进入模型的接点。
4. 同期一对 DSL 比 Markdown 多 21,797 input、1,489 output，少 68,510ms；质量差异集中在 follow_formatting 的自然说明，并非有限程序已计算该问题。一对数据支持取舍，尚无净收益证据。

复核新鲜 36 tests/306 assertions 与五个普通零模型场景通过。旧 1918 pass 是 BG 的联合验证，不是本任务的效果指标。BG 最后补齐权限 helper 来源依赖，账号运行在该修复前；最终示例不能冒充已被账号重新消费。

本轮按「局部修错 → 同任务自动程序 → 实际消费减负 → 第二任务共用」推进，预计约 8 小时有用工作量；根据实际问题调整，不睡眠、不反复跑通过的检查凑时长。

## 二、启动上下文与现有资产

主开发者亲读以下基础文档及即将修改的确切代码；不通读全部旧日志。

1. `D:/skill优化/AGENTS.md`、仓内 AGENTS、[current-status](../../skill-ir/current-status.md)和本任务书全文。
2. [spec §14.47](../../skill-ir/skill-ir-aot-optimization-spec.md#1447-bh-incremental-program-authoring-and-consumption)；已实现基线 §14.46。
3. [研究正文](../../skill-ir/skill-dsl-research.md) §1、§2、§7.68、§7.69、§11；根 handoff 最新 BH 节。
4. BG 结果目录 `results/skill-ir/skill-dsl-research/development/authorization-practical-execution-v1/` 内 `summary.json`、`comparison.json`、`review.json`、`authoring/automatic-program.json`。原提案形状问题按 `runs/auto-author-cli-recovery/` 下普通会话的 raw/tools.jsonl 定点读取；`automatic-process.json`未必包含在工具入口被拒的第一次提案。
5. [Download 示例](../../../examples/authorization-assessment/download-workflow/README.md)、[usage](../../usage.md)和[developer-guide](../../skill-ir/developer-guide.md)的 executable contract / inquiry/account 接口。

主任务保持以下身份与输入：

- `examples/authorization-assessment/download-workflow/program.json`：给定程序 A，供回归、消费及公平比较；禁止送给隔离自动作者。
- `examples/authorization-assessment/download-workflow/inputs/root-default.json`：原四问、开发场景和 sourceRoot。场景是输入事实，不是生产数据库实测。
- 原源码：`results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/model/packages/download/source/`，ref `126ec414a8b65158368653a2604ae58415e43103`。
- 完整 skill：`results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/SKILL.md` 及原配套文件。
- 四问全部保留：requested-document-and-returned-file、authorization-and-selection-order、alternate-version-authorized-resource、missing-facts-and-conditional-conclusions。

第二任务仅作本轮离线开发迁移：`results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/model/inputs/paperless-share-create.json`，其 `../public-source/paperless` 源目录实际存在，同 ref。它分析创建共享时 endpoint/对象权限、继承权限和 serializer 的关系，区别于 Download 的资源回退、版本选择及文件表示。旧 AU ShareLink 存在 `blocked-sealed-unknown-completion`，本轮不重发其模型请求、不改名规避；可以读取现有源码、编写第二程序并零模型运行。OWUI 也保持仅离线。

## 三、设计与接口合同

### 3.1 原稿、候选与活动程序

- 保存提交原字节，先校验有界顶层 envelope，再逐项解析/归一化资源步骤。provider/tool 层不能用整份深层 schema 提前拒绝本应进入 progressive 的局部错误。
- 编译结果保留有序步骤身份和局部诊断。漏掉非语义说明不清空计算；缺 source 或不明表达式仍有具名 gap。`because`可作为作者说明可选，宿主不伪造源码理由。
- 坏 value/select 只撤回自己的值及使用它的后继；独立值继续。坏 guard/return 或无法识别的潜在控制步骤不能直接从列表删除：保留位置和控制屏障，受其影响的返回显示 conditional/unresolved。已经执行的有效 return 之后的无关稿件不倒流污染既定执行结果，但仍显示作者诊断。
- 重复 ID、错误 ref、循环/前向依赖、空/模糊 source 不选第一个或默认为成功。给出相关 ID/范围的诊断；未涉及的确定计算保留。
- 顶层不可解析、sourceRoot 越界、question/scope 身份不一致拒绝该候选。consume 中活动程序不变；edit 中候选的改动范围和仍旧活动的部分明确展示，不把旧成功冒充新稿成功。

### 3.2 薄增量编辑，复用同一编译器

保留 `authorization_program` 整份导入兼容；为当前草稿增加窄 `authorization_program_patch`。建议合同如下，若接线发现更小的等价实现可调整并同步 spec：

```ts
type ProgramStepPatch = {
  baseRevision: string
  upsertSteps: Array<Record<string, unknown>> // 有界 JSON；逐步校验，id 必须明确
  removeStepIds?: string[]                  // 省略不代表删除
  inputNames?: string[]                     // 显式整体替换输入声明，事实值仍来自任务输入
}
```

新增步骤按提案顺序追加，更新保留原位置；若改变控制顺序，使用已有整稿显式 edit，不隐式重排。baseRevision 必须对应当前草稿；过期返回差异提示，不拼接到另一个版本。原稿→候选→规范程序都能定位。一次提交即可给局部采用/诊断和预览，不添加强制额外确认调用。

patch 更新一个步骤不擦掉其它步骤，也不把 omitted resourceWorkflow 当删除。显式删除被引用节点会产生依赖 gap；无效更新保留旧活动程序，但候选中该节点必须标明未采用，不能用旧节点给新稿记分。consume 接受提案存稿，edit 按明确的提交意图采用有效部分。

步骤 source 复用已有 path/symbol 或精确 range 定位，唯一时宿主填机械字段；歧义要模型从原文中选。复合摘要沿用 sources[]，列出实际用到的每份源码。不给模型填写哈希，也不自动猜 guard、权限对象或返回值。

### 3.3 自动编写要解决语义，而非仅让 JSON 过关

提供简短通用算子说明及与 Download 无关的演示，说明：有限集合用 select、空值回退用 coalesce、条件用 choose/guard、返回用 record/return。真正外部操作才用 external；具体外部结果是单列前提。

模型自己从源码选表达式、对象和步骤。宿主反馈未定义引用、未提供的事实、仍为 external 的具体关系及其位置；只说需要回答哪个问题，不把已知正确 Download 程序、评阅答案或主线程语义修正直接喂给作者。

自动作者获得完整原 skill、原问题、允许源码、普通开发输入和工具。它可以小批提交、预览当前结果并继续补齐。首稿/每次修订、实际保留与执行步骤、source footprint、external/gap 均有记录。不得把「0 资源步骤但 sourceDeclarations 有效」登记为主链自动成功。

### 3.4 消费视图与保存原件分开

沿现有入口加可比较的 `program-context=full|compact`，旧默认兼容，本轮显式 compact。共用一个纯投影器，由普通/native 入口调用，不分叉执行语义。

compact 显示：程序及当前输入 revision、执行到哪里、关键计算值/返回、每个原问题的相关步骤、当前源码绑定、具名外部前提与缺口、按 ID 查详情的方法。声明含义的来源与 `semanticSupport` 保留；执行过不自动标成独立语义验证通过。原 skill/四问/用户政策不被删减。

完整程序、完整 trace、源码和诊断保留在宿主会话，模型可以按 step/question 查询详情或主动读取源码。不能只靠 archive 路径宣称模型可见详情，须测试工具能实际取到。初始上下文及重复 check 不再重复发送所有 inputs/outputs、整个程序与全部旧草稿；同 revision 返回摘要/变化，源码或输入变化后立即更新。

压缩不强行禁止 source_read。不相关重复、独立复核和未覆盖职责补读分开统计；不能为减少次数而隐藏上游认证、文件名、拒绝分支或 stale 来源。若同一系统同时发完整 tool output 和紧凑 prompt，必须修接点，不能仅比较没有实际发送的理想投影字节。

## 四、文件责任

以下路径相对仓库根，主开发者负责全部修改：

| 文件 | 责任 |
|---|---|
| `src/task-dsl/authorization/resource-relations.ts`及测试 | 逐步骤有效性、值/控制缺口传播、事件与有限算子；不加仓库名分支 |
| `src/task-dsl/authorization/executable-contract.ts`及测试 | 薄 source 归一化、渐进候选、读取/依赖完整性、同一编译结果 |
| 可新建 `src/task-dsl/authorization/resource-program-draft.ts`及测试 | 草稿 revision、增量合并、显式删除、有序坏步骤；若现有模块清楚可容纳则不新建 |
| `src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts` | 活动/草稿生命周期、patch、预览、消费不覆写 |
| `question-workflow-wire.ts`、`inquiry-native.ts`、`inquiry-run.ts` | 薄工具 envelope、精确反馈、通用示例、两入口同一消费投影 |
| 可新建 `src/task-dsl/authorization/program-consumption-context.ts`及测试 | 纯投影 compact/full、可追溯 coverage 和按需详情；无隐藏语义求解 |
| `inquiry-local.ts`、`inquiry-reuse.ts`、`src/cli/authorization-inquiry.ts` | 选项/归档/inspect/搬移/previous；保留现有命令 |
| `executable-contract-entrypoints.test.ts`及相关 workflow/reuse 测试 | 文件、tool、普通/native、变化和草稿端到端同核 |
| `examples/authorization-assessment/download-workflow/` | 原/变输入、紧凑过程、零模型/账号/编写命令 |
| 可新增 `examples/authorization-assessment/share-create-workflow/` | 第二真实任务的离线程序和变体，标明开发者编写/未做账号运行 |
| 本轮 results、usage/developer-guide、spec/plan/current-status/研究正文 | 实际结果、可复制方法及单一结论入口 |

不扩 structure-index 的 Python/Go 全集，不建立第二执行器、另一套 CLI 或 HTML。只有当前阻断需要时才碰 provider 适配；单纯 UI 美化和历史资料清理不进入本轮。

## 五、执行队列 BH0–BH17

### BH0 接管和保存基线

- [ ] 读取上述入口，确认分支、HEAD、脏文件和无其它写者；记录接管 SHA，不回退其它线程改动。
- [ ] 从现有五个运行场景选 root-default/empty-version/denied 各零模型运行一次，保存当前计算/缺口；不重跑 BG 全量历史。
- [ ] 创建本轮状态：工程、自动编写、实际消费、第二任务、质量、收益分别初始 pending；requirements 与 observations 字段分开。

### BH1 写能复现当前问题的失败测试

- [ ] 在 `executable-contract.test.ts` 使用现有 fixture/contract/cite 写以下红测，然后运行该文件。当前应因整合同丢失而失败：

```ts
test("progressive resource draft preserves valid work beside a bad value step", async () => {
  const f = await fixture(), raw: any = contract()
  raw.resourceWorkflow = { inputs: [], steps: [
    { id: "kept", op: "value", value: { literal: 7 }, source: cite(1, 2), because: "Finite source example" },
    { id: "broken", op: "value", value: { madeUp: true }, source: cite(1, 2) },
    { id: "result", op: "return", value: { ref: "kept" }, source: cite(8), because: "Return independent value" },
  ] }
  const result = await api.compileExecutableContract(raw, { ...f, executionPolicy: "progressive" })
  expect(result.units.length).toBeGreaterThan(0)
  expect(result.resourceExecution.values.kept).toBe(7)
  expect(result.resourceExecution.returned).toBe(7)
  expect(result.diagnostics.some((d: any) => d.path.includes("broken") || d.path.includes("steps.1"))).toBe(true)
})
```

- [ ] 分别补红测：只缺 because 的无关步骤、未知 guard 后 return、未识别 op、重复 ID、缺 source、未定义 ref。错误控制不得像错误 value 一样消失；有效 strict 调用结果保持。

### BH2 实现局部编译与控制缺口

- [ ] 将 progressive 顶层与资源逐项校验分离，使用现有 `invalidSteps`/三值结果表达已定位失效，保留有序坏步骤与诊断。
- [ ] 使独立值继续、坏依赖下游 unknown、坏 guard 后结果 conditional；对 return 前后及 when=false 的路径分别验证，避免用「所有步骤都依赖所有错误」退回全局阻断。
- [ ] 运行 `bun test ./src/task-dsl/authorization/resource-relations.test.ts ./src/task-dsl/authorization/executable-contract.test.ts`，修到红测与旧测试通过后提交。

### BH3 薄作者 source 与必要说明

- [ ] 将既有唯一 sourceInput 解析复用于 resourceWorkflow.steps 的 source/sources；具体含义不自动补。
- [ ] 非语义 because 可缺省但保留“作者未说明”；缺 source 只生成局部不可采用诊断；越界仍拒绝候选。
- [ ] 用唯一符号、同名歧义、helper sources 漏/补、旧 SHA 四类测试验证。普通文件与工具入口结果相同；不可把后续宿主读取伪称模型此前已读。

### BH4 持久草稿与增量步骤编辑

- [ ] 增加上述有界 patch 合同及草稿 revision，先写“新增一节点—坏更新—修该节点—删除被引用节点—过期 patch”的状态测试。
- [ ] 合并保留未触及的资源步骤；拒绝或缺字段不擦掉整段 workflow。显式整稿替换仍可用，作用域改变撤回相应旧结果。
- [ ] 验证 consume 不替换活动程序，edit 的候选/当前采用和旧活动结果显示清楚。保存/恢复后继续 patch，ID/顺序/缺口相同。

### BH5 工具接线与作者指导

- [ ] 在 `question-workflow-wire.ts` 及 native 参数处理接通薄 envelope；本应局部修复的稿件能够到达编译器，不被另一层深 schema 提前整体拒绝。
- [ ] 提供一份匿名资源查找/拒绝/返回的通用小例；不含 Paperless/Download 答案。工具反馈给原字段、当前值、引用或来源问题和支持语法，不替模型生成授权结论。
- [ ] 将 BG 三次实际提案按原顺序零模型重放：保留首次七步，指出 source、permission、archive_selection 与 external 语义缺口；后续省略 workflow 不消灭草稿。记录可保留多少、仍不能执行多少，不宣称重放取得新模型收益。

### BH6 第一条普通修稿闭环

- [ ] 在现有 entrypoints 测试增加如下真实次序：模型提案含一好一坏步骤 → 工具返回局部结果/诊断 → 只改坏步骤 → 当前输入实际执行 → inspect 重放。
- [ ] 文件 check、native tool、账号 mock 与 previous 使用同一编译/草稿核心；不在研究 runner 拼出有效程序代替生产入口。
- [ ] 将 review 的 invalid-sibling 反例在普通入口重现为“主链仍有结果、无关诊断可见”，把首次失败和修复证据放本轮 results；此时应能继续演示，不等后面实验成功。

### BH7 紧凑消费投影

- [ ] 基于 BG 43 工具原件量测实际发送的重复部分，按 program/report/trace/source/history 分类；不把所有源码读取算浪费。
- [ ] 实现纯 `full|compact` 投影及按 step/question 的详情读取，更新 `inquiry-run.ts` 与 `inquiry-native.ts` 的所有可达反馈接点。
- [ ] 测试相同输入时不重复发完整大对象、值/缺口/来源不变，changed/stale 时新状态可见；详情可从实际工具取回。保存原件完整，投影可复算。字节减少仅记工程减负。

### BH8 普通使用和可读轨迹

- [ ] 接通显式 `--program-context=compact` 与旧 full，默认保持兼容。导入程序后宿主执行一次，结果进入消费者上下文，不强迫模型重复 author/check 才能使用。
- [ ] execution.md 首屏给输入变化、关键 guard/对象/返回、外部前提和未解问题；详细事件留 execution.json 并可按步骤查看，不逐步反复打印整个对象集合。
- [ ] 更新 run.ps1/README 的实际接口，验证零模型运行、普通模型命令参数、inspect 和搬移；不为“更易用”建立新 CLI 系统。

### BH9 主程序与来源回归

- [ ] 用当前最终 program.json 核查 root-default/空 version/显式 version/denied/missing-owner/root-fallback，以及各调用独立 include_deleted；原四问全部保留。
- [ ] helper 来源删除或改变时只撤回依赖步骤；错误权限对象、错误 actor、unknown/null 分别测试。不得把附件 disposition 固定值误判为错误：Download 入口本来显式传 attachment。
- [ ] 给定程序的语义修订若确需发生，保存前后和源码理由；公平消费对照固定同一个修订后程序。程序覆盖不到文件名/请求全局门槛时保留模型责任。

### BH10 同任务自动编写

- [ ] 按第六节 A1 输入隔离运行普通官方账号；不提供开发者程序或源码答案。模型实际提出、修改并预览资源流程；源码/场景/工具/原稿/接受步骤均归档。
- [ ] 首个共享实现错误当场留件→红测→修共享核心→绿测→一次具名恢复，不继续跑已知坏下游。
- [ ] 若只是模型语义错误，让模型看到精确源问题和自己的局部诊断；不由主代理代写答案回填“自动稿”。最终没有可计算主链也照实报告，继续给定程序消费和工程工作。

### BH11 自动原稿消费与同程序变化

- [ ] 对 A1 最终有界程序原字节进行 C1 普通消费；partial 程序也可以消费，明确计算/模型补充/缺口各有多少。
- [ ] 对同一程序 C2 只改 version 输入重跑，记录当前计算变化与实际材料使用；不能为了通过重新生成程序。源码失效和拒绝变体先做零模型验证。
- [ ] 若 A1 没有任何资源程序，C1/C2 明确记录前置产物缺失，零调用；A 的开发者程序在 BH13 仍正常消费，不能替代后把本轨标成功。

### BH12 第二真实任务离线复用

- [ ] 读取已暴露 ShareLink create 源码及原用户政策，独立写出选择 exact document、endpoint/model 门槛、对象门槛、拒绝或 create 描述符的有限程序；结果只表示分析，不执行目标创建。
- [ ] 使用与 Download 相同公共入口和算子，验证允许、拒绝、主体缺失、资源换错等四种有限场景。缺外部事实保持条件；不要把预先设 true 的权限答案算作推导。
- [ ] 若现有算子缺一项真正共享操作，以匿名反例及两程序需要解释再补；不扩 Go/通用框架语义、不按 skill/仓库名称通过。旧未知调用保持，本任务零模型完成。
- [ ] 报告两任务哪些语义/算子共享、哪些仍不同。这是两个已暴露开发任务的工程可移植性，尚无新 skill 自动编写/跨仓库效果主张。

### BH13 同程序旧/新消费比较

- [ ] 按第六节 P-full/P-compact 各运行一次，配对用当前同代码、同程序 A、同 skill/四问/source/输入/预算/模型。两臂只有消费上下文形态不同。
- [ ] 从 provider 回执比较完整 input（cache 不重复相加）、output、工具分类、耗时及首答/最终逐题质量。查询详情新增开销计入 compact，不只比较初始 prompt。
- [ ] 若 compact 丢掉决定性信息导致退化，先修投影并独立保留一次具名确认；不反复重抽追胜。历史 BG Markdown 对照只作背景，不拼成同期公平样本。

### BH14 独立语义核对与现场修复

- [ ] 主线程或窄只读探子核程序实际来源、执行事件和四问原答，重点 root 回退、请求/返回对象、include_deleted、null/空字符串、follow_formatting 及 upstream。
- [ ] 每次不佳结果写出首个实际阻断及归属：作者语义、局部协议、source footprint、消费遗漏、通道或未知事实；共享 bug 当场修、相关反例当场测，不把整个队列留到末尾修。
- [ ] 同因两次无改善就读实际回调/源码，调整接口或记录能力边界；不要加相同提示重抽。研究轴未达不妨碍归档已运行的程序和可用命令。

### BH15 有限联合验证

- [ ] 开发过程运行相关红绿；最后一次受影响授权联合回归、主与研究类型检查、普通零模型 inspect/replay、文档测试与当前改动链接检查。
- [ ] 基础命令：

```powershell
bun test ./src/task-dsl/authorization/resource-relations.test.ts ./src/task-dsl/authorization/executable-contract.test.ts ./src/benchmarks/authorization-dsl/executable-contract-entrypoints.test.ts
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
git diff --check
```

- [ ] 新增模块测试纳入相应回归，研究 tsconfig 沿实际当前研究工具配置定位。旧 104 全 src 失败及保护锁不改；不为测试数好看重跑历史或更改 scorer。

### BH16 当前文档与实际结果

- [ ] 更新 spec14.47、研究 §1/§7.69/§11、current-status、当前 plan、usage/developer-guide；按触发→根因→修改→真实观察写一次复盘，根日志保留阶段记录。
- [ ] 结果以 `summary.json`、`accounting.json`、`acceptance-matrix.json` 及普通会话为主，不再增加每阶段结果 Markdown。验收字段只填观测值，预期写 requirements。
- [ ] 展示实际可运行程序/命令、首屏轨迹、原/变结果、自动作者原稿/修订和实际消费成本。分清源语义来源、宿主计算、独立核验与未实现职责。

### BH17 发布和交接

- [ ] 检查本轮 diff、敏感信息与明确暂存路径，分目的提交到 skill-ir-aot，只推用户 origin；核对 live remote 与本地。
- [ ] 在 current-status/handoff 写明已完成/未达/真实调用终态及下一最小技术责任。工程完成、自动化、质量、收益分别结论；有限队列收束不得自动标整体研究完成。
- [ ] 队列结束即交付；还有必要共享 bug 则处理到可用边界，无必要工作时不等待凑时长、不启动新实验 identity。

## 六、真实运行、预算与公平性

先以必要红绿和一个普通零模型例确认接点，再运行以下有限队列；不要求先全仓通过。每个位置首件和修订分列，允许在同一会话正常迭代编写。

| 位置 | 输入 | 检验目的 |
|---|---|---|
| A1 auto-author | 原 skill、四问、允许源码、开发场景、通用算子示例；无 A 程序/答案 | 自行编写并逐步修复当前主链 |
| C1 auto-consume | A1 原字节程序、原 skill/四问/原场景 | 独立普通消费者实际利用作者产物 |
| C2 auto-changed | C1 同程序，version 单事实变化 | 当前计算与材料复用 |
| P-full | 复核后的给定 A 程序，full 消费上下文 | 当前版本同程序基线 |
| P-compact | 同一 A 程序，compact 消费上下文 | 质量保持和实际减负 |

五个首位置，C1/C2 产物缺失时零调用明确结束；有材料但 partial 不作整体禁跑。首个共享缺陷修复后可作一次具名确认；出现不同、可证的共享根因可继续本地修复并记录新 epoch，但禁止同原因反复重试追好答案。普通质量失败自身不授权无限重抽。主开发者的语义修改只进入开发者轨道，不能回填自动作者。

默认继承 BG 的实际有效账号配置与45分钟会话/64工具上限；预算若确实截断有用工作，定位后可一次有理由调整，并使受影响同期比较一致。完整调用/恢复、输入/output/cache、工具、时间和 USD 回执唯一计量；作者成本与消费者成本分别列，不隐去失败。token 单次下降不自动宣称总成本下降；说明不同复用次数下的摊销假设。

官方账号已获授权；不另问例行许可。第三方API继续暂停。明确 routing 终态失败允许一次具名恢复，同因连续两次失败暂停该通道；quota/auth暂停，unknown先查原生命周期且不自动重发。不增加健康推理、购买额度或切换账号。通道不可用时完成所有独立工程、零模型普通链、第二任务、文档和交付，模型位置据实待运行。

原 skill、四问、独立政策、源码、模型和预算按轨道相同；A1 与消费者隔离，oracle/历史答案/主代理修复解释不进 A1。给定程序轨道承认程序已包含开发者理解，其比较只检验使用方式，不伪称自动生成或纯 DSL 表达优势。

## 七、验收与结果解释

| 轴 | 应交付的证据 | 判定方式 |
|---|---|---|
| 局部修复 | 坏 sibling、坏控制、过期来源、增量修改原件和公共入口结果 | 有效计算保留，受影响关系具名，旧成功不冒充新稿 |
| 自动编写 | A1 首稿/修订及实际执行 | 至少包含由源码支持的资源选择、检查对象与返回关系；全 external/0 步骤另记未达 |
| 实际消费 | C/P 普通会话的程序 revision、当前输入、host 事件、送给模型的结果与自然答案 | 计算真实发生且结果被消费；并非文件存在或模型声称调用 |
| 变化 | 同程序输入变化与 source 失效 | 重算当前值、相关旧含义撤回；不恢复旧答案 |
| 同类可用 | Download/ShareLink 两套程序、至少四种后者场景 | 同公共算子，无仓库成功分支；只作开发迁移结论 |
| 原任务质量 | 四问逐题源码评阅及整题 | 所有原职责保留，条件答案、错误和遗漏明列 |
| 消费效果 | P 配对真实发送/usage/时间/质量 | 支持 improvement/tradeoff/no-observed-difference/negative/inconclusive；不能预填正向 |

本轮首要可用成果是「用户给定或模型逐步编写的 DSL 能保住已做工作、实际执行、显示结果并在变化后继续用」。整体正向效果由运行数据决定；不靠放宽源码真实性、隐藏未知、缩掉原问题或增加重复样本来取得。
