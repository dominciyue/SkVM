# AC0–AC7：授权 DSL 编辑支持实施任务书

> 使用`superpowers:executing-plans`与`superpowers:test-driven-development`连续实施。开发模型`gpt-6-astra / ultra`，用户请求Fast速度，继承已配置priority并核实实际tier。用户已授权作为独立任务并行开发，不承担AB0–AB13的任何收尾项。

**Goal:** 使开发者编写authoring/v2时能看到字段说明、合法选项和结构错误，并明确哪些问题须交给现有语义check。

**Architecture:** 在现有strict Zod合同之外提供JSON Schema编辑资产与独立的schema检查脚本。运行时parser/lowering仍是权威，不改authoring/v2、普通CLI、核心语义或AB输入。用确定性差分用例监测编辑schema与真实parser的结构漂移。

**Tech Stack:** TypeScript、Bun、已安装Ajv/Zod、JSON Schema draft-07、编辑器json.schemas配置示例。复用已有依赖，不安装包，不更改lock/package.json。

- 状态：ready-for-integration（2026-09-27）；起点`c51e9b8b`及本任务书提交；工作目录`D:/skill优化/SkVM`、分支`skill-ir-aot`。统一发布由AB负责。
- 独立结果根：`results/skill-ir/authorization-editor-support-20260926/`。
- 设计依据：AB作者初稿8/8 DSL因未知字段不通过。改善字段发现与编辑反馈具有具体需求；本任务只验证工具行为，不追加作者/模型试验来宣称省时。

## 1. 先读与所有权

主代理亲读AGENTS、current-status、研究§1–4/§7.25与本书，再读`src/benchmarks/authorization-dsl/authoring-v2.ts`全文及`authoring-v2.test.ts`、`authoring.ts`的normalize接口、`examples/authorization-assessment/authoring-v2.json`。若需要标准细节只查JSON Schema/编辑器官方文档，不扩到新领域调研。

允许新增/修改：
- `schemas/authorization/authoring-v2.schema.json`（新）。
- `src/benchmarks/authorization-dsl/editor-support/schema.ts`、`schema.test.ts`、`verify.ts`（新）。
- `examples/authorization-assessment/editor-support/README.md`、`authoring.json`、`project/src/records.ts`、`.vscode/settings.json`（新）。
- 本任务书与独立结果根的status/verification/integration-notes/ready。

禁止修改：`authoring-v2.ts`等既有核心文件、AB的reusable-skill和results、仓库根`.vscode/settings.json`、共享docs、catalog、package/lock、七项旧脏源码。其他任务在同一工作区，不得重置、删除或覆盖他们的工作。只读Git允许，stage/commit/push全部由AB发布者做。

## 2. 具体合同

编辑schema覆盖v2全部公开字段、required/optional、enum、array数量、整数边界、strict对象unknown-key诊断、具名dictionary。描述说明政策与expectation由作者给定，运行时不从源码猜政策；sourceRoot相对输入文件，locations使用所提供文件的行号。

采用draft-07给现有Ajv与主流编辑器消费。复杂Zod refinement（跨字段endLine顺序、引用存在、policy acceptance就绪、Unicode键细节、实际路径/文件）允许留给运行时，但必须列入明确`runtimeOnlyChecks`清单并在测试中证明现有check可检出；不能声称编辑schema等价完整语义校验。能准确表达的格式不能无故放宽。

不把`$schema`写进authoring.json：当前strict parser会拒绝未知顶层字段。通过工作区json.schemas关联外置schema。独立示例包含可解析的synthetic源码及真实位置，不能写D盘绝对路径或依赖AB证据。给出从当前checkout与单独目录使用的两种合法关联说明，不假称已发布在线schema地址。

接口先按以下形状写测试，再实现：

```ts
export function loadAuthoringEditorSchema(): Record<string, unknown>;
export function checkEditorStructure(value: unknown): {
  valid: boolean;
  diagnostics: Array<{ path: string; message: string }>;
};
```

`schema.ts`加载仓内静态JSON并用Ajv检查，不引入provider。`verify.ts`只做schema与fixtures差分检查，退出0表示当前资产合同通过，退出1表示失配。它不覆盖用户声明、在线获取schema或生成模型输入。

## 3. 执行队列

### AC0 记录基线与边界
- [x] 建自己status，记录核心schema位置、当前示例以及写白名单。核当前Zod/Ajv版本，不重跑全仓历史测试。
- [x] 列结构约束与runtimeOnlyChecks表；不要改DSL版本。

### AC1 编辑schema失败测试
- [x] 先写测试加载缺失schema失败，然后实现最低完整schema，不用空`additionalProperties`吞掉未知字段。
- [x] 正例至少覆盖最小声明、多个具名对象、optional省略、条件分支、非ASCII合法名。
- [x] 反例覆盖未知顶层/嵌套字段、enum错、sources空、required缺失、line为0或小数、maxBranches越界、错误字段类型。测试实际parser和编辑schema对这些结构输入判断一致。

```ts
const bad = { ...validFixture, guessedTopLevel: true };
expect(checkEditorStructure(bad).valid).toBe(false);
expect(AuthorizationAuthoringInputV2Schema.safeParse(bad).success).toBe(false);
```

### AC2 编译与剩余检查说明
- [x] 实现`loadAuthoringEditorSchema`、`checkEditorStructure`及零调用verify。
- [x] 缺引用与endLine倒序等例子展示运行时语义诊断，防止“编辑无红线即可运行”的误解。拒绝自动改写或自动剥离未知业务字段。
- [x] 用字段覆盖测试发现运行时公开键新增而schema未覆盖，避免维护两份合同悄悄漂移。可用已安装Zod转换能力时先核真实兼容性；不为转换增加依赖或改核心。

### AC3 独立编写样例
- [x] 写完整synthetic原任务，主体/资源/政策与源码明确。给同文件内如何改owner/role场景的说明，不需要重复大份JSON。
- [x] 提供本示例私有`.vscode/settings.json`关联；保持根配置不动。验证文件匹配规则、schema路径从示例目录实际可解析。
- [x] 说明schema字段提示、`authorization check`语义反馈、`locate`找本地行号的分工。

### AC4 确定性差分与普通目录验证
- [x] 在独立临时目录复制样例并调用现有check，记录0 provider、实际源码位置通过、原文件未被改写。
- [x] 使用有限结构变异用例，保留能解释的schema/runtime差异；不做随机海量fuzz或模型效果面板。
- [x] 若发现核心bug，在integration-notes记录最小复现，不能越界修AB文件；编辑支持本身可继续完成。

### AC5 文档与测试
- [x] README写真实命令、安装前提、限制与失败示例。共享developer-guide增补稿只放integration-notes供发布者合并。
- [x] 执行：

```powershell
bun test ./src/benchmarks/authorization-dsl/editor-support
bun ./src/benchmarks/authorization-dsl/editor-support/verify.ts
bun ./src/index.ts authorization check --input=./examples/authorization-assessment/editor-support/authoring.json
```

预期自身测试全绿、verify退出0、普通check valid且无provider。全仓typecheck由发布者在所有侧任务稳定后集中运行。

### AC6 归属交接
- [x] 准备verification、ownedFiles及文档建议，状态`ready-for-integration`或具体partial，最后原子写结果根ready.json。此后停止改文件。
- [x] 将完成摘要与ready路径发给协调表中的AB发布任务，不执行Git写操作。没有协调ID时可从当前任务列表定位AB恢复任务，不通知外部第三人。

### AC7 发布后确认
- [x] 若AB提出本范围内具体修订，按原白名单处理并更新ready版本；否则完成结束，无需保持空转。

## 4. 完成标准

交付是可直接消费的编辑资产、差分检查与完整例子。无需AB语义评价先完成即可使用。不给schema正确性、真实授权正确性或真人效率添加未经测量的结论。无业务模型调用、新来源选样、保护集读取或HTML层。

## 5. AC执行记录（2026-09-26至27）

- AC0：确认Bun 1.3.14、Zod 3.25.76、Ajv 8.20.0；当前Zod无`toJSONSchema`，使用静态draft-07资产。宿主配置`service_tier="priority"`可见，实际请求tier及1.5倍速度未观测，未改配置。
- AC1–AC2：先记录缺失schema的预期失败，再实现完整schema、只读检查API和差分器。公开键/required/strict/dictionary/array/number/enum/literal从实际Zod树比对；105个有限结构用例与parser一致。整数`>0`与`>=1`在差分器中按等价边界处理，不改核心。
- runtimeOnlyChecks：行号先后、引用存在、引用重复、policy readiness、Unicode名称良构、实际路径/文件、实际源码范围。12个parser/normalize反例保留预期差异；普通check另测路径越界、缺文件和行号越界。结构测试不声称完整语义等价。
- AC3–AC4：完整synthetic示例含实际`src/records.ts:6-12`、原场景及两项条件；私有配置从示例workspace解析仓内schema。独立目录复制测试使用AC结果根内临时目录，零provider factory，源与输入不被改写，完成后清理。README给checkout和独立目录两种关联、owner/role同步修改及失败说明。
- AC5：新鲜验证为本范围9测试/517断言、既有v2 parser回归4测试/41断言；verify退出0，普通check valid/0 diagnostics，locate唯一命中第6行。两个只读独立复核无阻断项。VS Code UI未实测，全仓typecheck交AB集中执行。
- AC6–AC7：精确文件清单、验证及共享文档增补稿位于独立结果根的`ready.json`、`verification.json`、`integration-notes.md`。原子写ready后停止写文件，并通知AB任务`01a0de62-39d6-7883-89da-4123cb8327f0`。没有共享核心bug需要越界修复；若发布者提出具体修订，再在白名单内更新ready版本。
