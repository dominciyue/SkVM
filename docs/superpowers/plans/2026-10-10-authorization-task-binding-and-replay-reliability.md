# BC0–BC14：任务性质准备、跨调用语义修复与可重放交付

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans`，按任务推进。用户已经要求派发新开发线程，不在常规阶段停下等待确认。代码、设计取舍和提交由主开发线程负责；探子仅按 AGENTS 做独立只读探索。

**Goal:** 让普通原 skill 的自然任务形成可追溯的性质查询，让真实跨函数对象解释进入当前检查，并在同一包上检验局部变化复用；同时修复源码准备与离线重放的可诊断性和实际故障。

**Architecture:** 复用 v7 的调用实例、渐进源码编辑、有限求值、材料失效和普通 inquiry/native 入口。新增任务性质准备与跨调用定向修复，区分“问什么”“源码对象是什么”和“当前路径得出什么”；不另建执行器或通用语言分析系统。

**Tech Stack:** TypeScript / Bun、Zod、既有 tree-sitter 索引、SkVM CLI、官方账号 adapter、现有研究归档与源码评价器。

---

## 1. 执行身份、权限与完成含义

- 日期：2026-10-10。状态：`in-progress`。计划交付时没有 BC 生产改动或模型实验；实施基线`ee1a0522bb151977947dfcafa5906bee5002356a`。
- 开发基线：`b1aa7b4cc43a5468a873669735732f2c95e46d83`。计划提交后以启动时真实 HEAD 记录 BC implementation baseline。
- 开发线程：`gpt-6.1-sol`，reasoning `max`。工作目录 `D:\skill优化\SkVM`，分支 `skill-ir-aot`，只发布用户 `origin`，不新建分支/worktree。
- 新 identity：`authorization-task-binding-v1`。结果统一放 `results/skill-ir/skill-dsl-research/development/authorization-task-binding-v1/`。临时运行空间放 `D:\skill优化\project-maintenance\runs\authorization-task-binding-v1`。
- 继续使用用户授权的官方账号 `gpt-5.6-sol/high` 做下述新 Download 实验；第三方 API 继续暂停。新队列不是 BB 补行，旧分母、未知和原件全部保留。
- 两次 BB OWUI 的未知终态/最终费用继续保留。本轮 OWUI 只做离线迁移与归档复验，不重新派发 OWUI 消费，也不以新 identity 清除旧未知。
- 工程、真实性质检查、完整原任务质量、实际复用和净收益分别验收。完成有限工作且仍有未达项时用 `completed-with-unmet-criteria`，`researchGoalAchieved` 按实际证据填写。
- 质量/作者复用约六四分配开发精力；它不改变任何答案质量标准。不等待、重复审计或无依据重跑来填满时长。

## 2. 启动阅读：足够上下文，避免整库重读

按顺序亲自阅读：

1. `D:\skill优化\AGENTS.md`、仓库 `AGENTS.md`、[current-status](../../skill-ir/current-status.md)、本任务书、[当前计划](../../skill-ir/skill-ir-aot-optimization-plan.md)。
2. [spec §14.41/§14.42](../../skill-ir/skill-ir-aot-optimization-spec.md#1442-bc-task-binding-and-replay-reliability)、[研究总文档 §1/§7.63/§7.64/§11](../../skill-ir/skill-dsl-research.md#764-bc-任务性质准备与跨调用修复)。历史章节按具体失败追溯。
3. BB 的 `verification/acceptance-matrix.json`、`verification/authorized-execution-closeout.json`、`verification/resume-replay-profile.json`、`accounting.json`；再按问题读取 attempts 和 summary 中对应行。
4. 当前 `inquiry-focus.ts`、`source-edit.ts`、`source-interpretation.ts`、`property-query.ts`、`semantic-flow.ts` 对应实现；源码准备读 `inquiry-tools.ts` 及 `evidence-preparation` 中实际索引入口。
5. [usage](../../usage.md)和[developer-guide](../../skill-ir/developer-guide.md)中的普通 inquiry/native/账号入口。跨线程授权有疑问时才读根目录 handoff/communication 的相应记录。

BB 证据根目录为 `results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/`。旧 `study.ts`、runner、原报告不可修改；当前共享代码可按红绿修复，派生重放存 BC。

## 3. 本轮复核已确认什么

| 已核实事实 | 对下一轮的影响 |
|---|---|
| BB 16 个逻辑位置，13 已尝试、3 previous blocked；15 去重尝试、12 自然交付，真实跨源性质 trace 为 0 | 材料采用已进步，尚未进入真实有结论的性质执行；不能靠扩大位置数补齐 |
| Download 当前 N/D 自然 full、M partial；OWUI 三臂 partial；policy/source fresh 各 2 采用但性质 unknown | 自然答案、材料采用和机器性质分别分析，保留有效的自然回答 |
| `model/packages/download/inquiry.json` 的 4 题、`model/packages/owui/inquiry.json` 的 11 题均无 properties；两个 `model/inputs/*-common.json` 则各有 1 题/1 性质 | 原包确实没有自动形成任务性质；不要误把质量输入的手写性质当成作者包已携带字段 |
| `property-query.ts` 从问题 properties 或 binding.proposed 取得声明；v7 `sourcePhaseGuide` 描述 propertyBindings，却没有旧 v6 的“无声明时 proposed”说明，渲染分支明确不附加旧指南 | 先修可复现的指引接线，并把任务性质准备从 effect/guard 已定位这一前提中解开 |
| Download 入口 request/pk 为 value，helper 解释为 principal/resource；类型拒绝有依据 | 修解释和修复操作的可用性，不放宽实际对象/类型检查 |
| 完整离线重放未过；隔离计时 180.53 秒停在 createInquiryTools，尚未进入提案 | 先测 walk/加载/词法索引/AST/后处理；不能据 RSS 或超时猜定根因 |
| 源码工具使用允许路径、排除目录和 realpath 校验；当前构造 API 没有准备阶段进度/取消接口 | 保留范围控制，补准备生命周期。同步解析需真正可终止，Promise 超时壳不能结束 CPU 工作 |
| 当前源码阶段元数据可提供 caller/actual/callee/formal，但主要让模型跨 focus 自行修改，尚未展示完整的逐对类型与来源修复事务 | 用实际失败指导局部修复队列，避免重复全文解释 |

本次复核新鲜执行公共跨函数入口及 BB 研究轻量测试：**51 pass / 362 assertions**。没有重跑已知卡住的完整重放，没有新增模型请求。425/29 与类型检查是 BB 归档结果，不冒称本次重新全跑。

### 三个需要分开的原因

1. **确定的接线缺口：** 缺性质的原包进入 v7 时，没有完整的性质生成指引/独立准备路径。
2. **已观察的解释问题：** 参数类型和真实对象含义不一致；当前拒绝应保留，改进模型得到的局部上下文和修复入口。
3. **尚未定位的工程故障：** 源码准备长时间不返回。先取得分段和逐文件依据，再修改对应实现。

“增加一个提示”只是第一步；普通用户不应先手写 propertyBindings，或者知道哪个 helper 的参数该如何标注，才能使用已宣传的普通入口。

## 4. 方法与接口约束

### 4.1 任务性质先于源码绑定

性质准备只读原问题、任务模式、用户政策及前提；提出要检验的关系，不给出结论、源码守卫位置或正确答案。性质 `requirement` 保留当前问题的精确文本跨度；引用、ID 和去重由宿主生成。已显式声明的合法 properties 原样保留。

每个原问题必须保留一种准备结果：已准备、待澄清、范围残余。当前四种性质表达不了的问题继续由自然任务处理并保留完整分母。不得把部署/修复建议强制转换成 operation-completion，或通过删题提高通过率。`properties: []` 当前 schema 非法；不要以空数组静默表达成功或不适用。

新增一个窄的 `property-intent.ts`（仅当现有 authoring 职责无法清晰容纳），核心合同如下；实际实现与现有类型统一后在本任务书记录符号变更：

```ts
import type { z } from "zod"
import { PropertyRequirementSchema } from "./property-query.ts"

type TaskPropertyPreparation = {
  questionId: string
  state: "prepared" | "needs-clarification" | "residual"
  properties: Array<z.infer<typeof PropertyRequirementSchema>>
  originalRequest: string
  diagnostics: Array<{ code: string; message: string }>
}
```

此形状用于设计说明，复用 `PropertyRequirementSchema` 的四种枚举及可选requiredPermission，不丢掉已有声明字段；`prepared` 必须有非空有效性质，其余状态不能伪造成功声明。结果以 sidecar/派生运行输入绑定原包，不回写旧作者包。准备调用、修订和费用计入 D 的端到端成本。

### 4.2 跨调用修复证明什么

每条修复需求携带 current question/operation、caller source+revision+anchor、实际参数表达式/现有类型、callee source+revision+formal、预期类型、已有对象来源以及精确诊断。模型阅读相关原文后提出改变；宿主只提供机械定位与受限编辑，不自行赋予 principal/resource/permission。

- `request` 是载体，`request.user` 才可能是主体；`pk` 是标识符，查询所得 document 才可能是被操作对象。二者的关系须有源码依据。
- 参数传递、字段读取、lookup 返回和 receiver 关系使用已有语义。缺少表示时，先用真实关键路径的最小反例证明，再补有界关系；不顺势重写语言引擎。
- 同一 helper 的不同调用实例继续隔离；名字相同、角色相同不证明对象相同。
- 修复字段可精确清除/替换；修复失败不得恢复旧的有效 verdict。修复事务中的多个源版本都必须当前有效。
- 显示重复绑定的所有 owner，明确保留/撤回哪个绑定；不能静默取第一个，也不能删掉合法的多调用效果来去重。

### 4.3 准备阶段与生命周期

准备进度至少有 phase、elapsedMs、currentPath、completedFiles、totalFiles、bytes、terminal/error。先建立基线，优先修实测热点；不同时引入缓存、worker、惰性索引三套方案。

若同步解析阻断主循环，使用受控 worker/子进程使超时取消可结束本轮拥有的工作；保留错误阶段和文件，调用方不能在准备未完成时派发模型。若选择缓存，必须按源码字节、索引版本和范围失效；缓存不得带模型语义或上次答案。

普通入口和研究重放使用同一准备实现。工具外层计时与准备计时连续记录；本地停止、服务器确认终止、最终 usage 分开。

### 4.4 结果和复用

保留 prepared → bound → adopted → checked/violated/unknown → natural-review 的逐题关系，不拿不同问题的计数拼成闭合链。真实局部合格基础必须有当前跨源 trace 和独立源码复核，可用于**同一局部性质**的变化复用；不再要求它恰好来自名为 consumer 的位置。完整四题复用另外验收。

协议/路由/准备故障保留端到端分母，另列有效答案语义。所有变化都重算结论；政策/前提可复用独立源码材料，源码变化严格失效。未建立局部基础时，fresh 可用于具名诊断，previous 零调用写明缺哪一条基础。

## 5. 代码责任与有限新增文件

| 责任 | 现有文件/目录 | 允许新增 |
|---|---|---|
| 准备生命周期与性能 | `src/benchmarks/authorization-dsl/inquiry-tools.ts`、`inquiry-run.ts`、`inquiry-native.ts`、`evidence-preparation/structure-index.ts` 及实际词法索引入口 | 准备计时/取消帮助模块；只有实测证明必要才引入 worker |
| 任务性质准备与渲染 | `src/task-dsl/authorization/inquiry.ts`、`property-query.ts`、`source-edit.ts`；`src/benchmarks/authorization-dsl/inquiry-focus.ts`、`inquiry-local-extraction.ts` | `src/task-dsl/authorization/property-intent.ts`及对应测试；入口适配优先放已有模块 |
| 跨调用解释/修复 | `source-interpretation.ts`、`semantic-flow.ts`；`inquiry-focus.ts`、`source-material-projection.ts`、`inquiry-domain-runtime.ts` | 按实际职责拆一个小帮助模块，不按项目名分支 |
| 双入口/失效 | `inquiry-local.ts`、`inquiry-native.ts`、`inquiry-result.ts`、现有 account 生命周期 | 复用现有状态，公开合同确需变化才增加版本 |
| 研究执行/评价 | BC 结果根目录 | `study.ts`、`study.test.ts`、`tsconfig.json`、manifest/status/summary、attempts/verification |

保留 `operation-evidence-v7` 的内核合同；提示缺漏和机械诊断可直接修复。新任务准备/定向修复采用显式配置 `task-binding-v1`，开发时先确认现有配置承载位置；不自动升默认，不为这轮另建完整 CLI。确需新公开 schema 时只版本化被改变的合同。

## 6. BC0–BC14 实施队列

每个代码阶段：先写下面列出的失败测试并确认失败原因，再补实现、跑相关测试，更新研究§7.64，按阶段提交。测试应经过公开输入/工具路径；不得直接注入成功语义单元替代真实接线验收。

### BC0 接管与登记

- [x] 核对分支/远端/工作树/活跃线程，记录原有修改，不混入本轮提交。
- [x] 创建 BC 的 manifest/status/study 骨架，读取 BB 原件建立失败责任表；目标要求与 observed outcome 分字段。
- [x] 登记第七节有限运行位置、同模型/事实/预算、旧未知与本轮授权范围。BB 只读，旧空位置不补写。
- [x] 提交：`docs: register task binding and replay recovery work`。

### BC1 定位并修复准备阶段

- [x] 在 `inquiry-tools.test.ts` 写：准备 phase 顺序、失败阶段/文件、取消后不建 runtime/不派发、允许范围/排除目录不变的红测。若出现同步卡顿，补拥有的 worker 能退出的测试。
- [x] 单独准备一份 BB 原 scope，记录 walk、读字节、词法、AST、后处理的逐文件耗时；首先不做任何模型调用、source edit 或全部重放。复用 BB profile 提取方式，不重新下载源码。
- [x] 依据最慢阶段修复，并在相同源码/范围做一次前后对照；本次memo仅当前AST，无持久缓存，已测同字节revision与修改失效。异步等待壳不是取消实现。
- [x] `bun test ./src/benchmarks/authorization-dsl/inquiry-tools.test.ts` 通过；慢原例完整完成，取消等待拥有worker退出。对照在BC verification/preparation-comparison.json。完成真实准备才进入 BC7 全材料重放。
- [x] 提交：`fix: make authorization source preparation diagnosable and bounded`。

### BC2 修复 v7 无声明指引

- [x] 在 `interprocedural-property-entrypoints.test.ts` 加红测：v7 实际发给模型的任务视图遇到无 properties 时，明确提供未声明状态、当前问题、合法提出性质的办法；已声明时不重复建议。
- [x] 修 `sourcePhaseGuide` 与模板接线，避免只在不可达旧 v6 分支出现说明。用真正渲染结果检查，不只搜索某个常量含单词。
- [x] 旧局部/跨源 binding、可选字段清除和 duplicate 拒绝仍通过。此阶段不声称已完成普通任务自动准备。
- [x] 提交：`fix: expose property preparation in the v7 source workflow`。

### BC3 从自然问题准备性质

- [x] 建立 property-intent 的失败测试：无声明、已有声明、重复、跨题 requirement、附加 verdict/答案、非法 kind、空数组、范围残余、缺政策以及原问题丢失。
- [x] 实现模型提案到严格宿主准入的窄前端。机械字段从当前问题生成，语义 kind/requirement 来自可追溯提案。没有真实依据时返回 needs-clarification/residual，调用者展示原题而不是删掉它。
- [x] `inquiry` 和 `native` 共用它；普通用户继续提供原 skill/任务/源码范围，机械 sidecar 由系统生成。原 properties 与原包不改。
- [x] mock 断言示例（通过新公开准备入口构造 `prepared`，不直接拼成功结果）：

```ts
expect(prepared.questions.map(q => q.questionId)).toEqual(original.questions.map(q => q.id))
expect(prepared.questions.every(q => q.state !== "prepared" || q.properties.length > 0)).toBe(true)
expect(originalBytesAfter).toEqual(originalBytesBefore)
expect(providerRequests.every(r => !r.includes(evaluatorSentinel))).toBe(true)
```

- [x] 记录准备成本及来源，空/非法提案仅作一次针对性正常修订；反复失败归类为前端失败，不转交用户手填低层字段。
- [x] 提交：`feat: prepare task properties from original authorization questions`。

### BC4 形成跨调用修复需求

- [x] 在 `property-query.test.ts`、`source-material-projection.test.ts` 和 `source-edit-transaction.test.ts` 加红测：value→principal 冲突、value ID→resource 冲突、wrong receiver、同 helper 两次调用、过期源、重复 binding owner 的精确定位。
- [x] 从现有 call instance/参数映射生成结构化 mismatch，显示两侧原行、表达式、当前含义与待修字段；不在宿主写入权限语义。
- [x] 让 focused 下一动作回到正确源/草稿，不丢掉已完成解释；受影响 query 立即撤回旧结论。绑定撤回/替换语义测试包括“旧 binding 被清掉后不能从 previous map 自动复活”。
- [x] 提交：`feat: route call binding conflicts to targeted source edits`。

### BC5 补关键路径的对象联系

- [x] 从 Download 当前拒绝处抽出真实形状，保留原 `request → request.user`、`pk → lookup result → protected effect`。红测定位同一载体的两个显式typed field被分配不同身份而误报violated。
- [x] 复用既有字段/返回/alias，不扩schema。task-binding求值按实际receiver身份保留显式typed field，lookup返回已有实际对象；alias必须对应当前源RHS，不能替换为同类型对象。
- [x] 正例接受；请求载体冒充 user、另一个 document、查 ID 相等却返回不同对象、提前拒绝、guard-after-effect、未注册 middleware、未知调用改变对象均维持拒绝/unknown/violated。新对象矩阵与既有公共v7反例联合通过。
- [x] 不依据“让类型一致”自动升级 value，不从 oracle 提取正确角色，不增加无关 decorator/descriptor/Go/module 语义。
- [x] 提交：`fix: preserve source-backed objects across authorization call bindings`。

### BC6 普通入口完整接线与第二结构反例

- [x] 公开入口测试从“原自然问题、无 properties、读源码”开始，mock 模型经过 prepare → read → edit → call link → check → final；不向 runtime 注入预制成功 query/unit。
- [x] 覆盖 inquiry 和官方native static tools，两入口均有当前两文件trace、实际call采用与checked；同一trace的源码身份保留。
- [x] OWUI 已暴露源码做离线形状测试：输入文件权限与目标 collection 权限分开；role/context 不抹调用，未知 middleware 不产生授权。全部mock/手写含义只算工程证据，无OWUI模型派发。
- [ ] 计数断言示例：

```ts
expect(current.propertyChecks.some(p =>
  (p.state === "checked" || p.state === "violated") &&
  new Set(p.trace.map(t => t.sourceId)).size >= 2
)).toBe(true)
expect(afterInvalidUpdate.currentCheckedVerdicts).toHaveLength(0)
```

这里 `current`/`afterInvalidUpdate` 是测试适配器对现有公共结果的投影，字段不要求改动生产返回形状。适配器不得伪造缺失 trace。
- [x] 提交：`test: cover task-to-property closure through both public entrances`。

### BC7 原件派生重放

- [ ] 修复准备后，完整跑一次 BB 原提案的当前派生重放。原件 SHA/实际字段保留；只能机械迁移当前源身份，新增模型含义计数必须为 0。
- [ ] 对仍 unknown 的原提案，报告第一个实际阻断及其 owner/字段；不要求旧缺失含义在新代码下无中生有地变成 checked。
- [ ] 新性质准备、修复模型提案与原件重放放不同产物。历史完整 replay 若绑定旧实现不支持当前版，保留失败并在 BC 提供明确的当前派生入口；不改旧 runner 的断言来变绿。
- [ ] 源码准备完成、原 proposal 被消费及当前结果可重算分别验收。若准备仍卡住，回 BC1 的已定位阶段，不重复全量探测。

### BC8 真实运行准备、生命周期与计量

- [ ] runner 复用既有归档/账号/单写锁，新增准备失败零派发、取消确认与本地 timeout unknown、部分 usage 不入最终数、引用去重和修订新 attempt 的测试。
- [ ] 不新增健康探针。最近 BB source-fresh 已有 completed 终态，账号并非永久 unavailable；就绪 Download 任务直接走用户授权通道。
- [ ] 当前新 unknown 只核查原生命周期，不能自动重抽/清锁。两旧 OWUI disposition/字节保留且不传播为新 Download 的伪零成本。
- [ ] 实际 runtime 上限沿用现有受控配置，不用扩大预算绕过绑定缺口；输出部分进度和具名缺口应在正常退出路径保留。准备阶段耗时与模型阶段分账。
- [ ] 提交：`fix: retain preparation and terminal evidence in task binding runs`。

### BC9 Download 普通原包真实使用

- [ ] 使用 BB 原 Download skill、原四题、同允许源码和既有用户政策/前提，新 sidecar 由 BC3 自动生成。先记录任务性质准备，再记录解释/绑定/检查/自然交付。
- [ ] 首件不替换。每次坏表现立即定点区分准备、前端、源码解释、关系接线、检查或通道问题；共享缺陷先红绿修复，再做一件具名同题复验。
- [ ] 首个可信跨源 checked/violated 与原问题的映射、完整当前 trace、源码独立评阅和原四题质量均保存。单条性质成功可继续 BC11 的局部复用；四题全部充分另报 whole-task full。
- [ ] 同因两次实测无改善转确定性诊断；不得用更多同题抽样寻找幸运结果。新根因的修复允许继续，但须更新研究和实际实现 epoch。

### BC10 同条件小比较

- [ ] 只在 BC9 有当前真实性质检查后，执行第七节 N/D 两次配对；同源码、同四题、同用户事实、同模型、同总代码/工具权限和预算。
- [ ] D 的自动准备/修订成本完整计入；N 可以自然调用相同来源工具，不把评价答案或 D 独享的人写正确性质塞进上下文。区别是任务组织方式及其真实额外开销。
- [ ] 主要报告完整/正确/有据的原问题答案、端到端交付率、当前性质检查和总 token/耗时；不把 D 独有 checked 字段拿来定义 N 必然失败。
- [ ] 每件交付后评阅，发现共享缺陷暂停受影响配对，修后同 epoch 重建新配对且保留首轮。两次重复仅用于看不稳定性，不声称统计显著或一般优势。

### BC11 同包三种变化

- [ ] 原用户包保持同字节；沿 BB 已登记 policy/premise/source 的真实变更，各建立 BC fresh/previous 输入，不借此读新样本。
- [ ] 每种变化先核对同范围合格基础。资格按当前源码/策略/问题/性质/trace/独立评阅，不硬编码 consumer 位置 ID。
- [ ] policy/premise 从基础材料重算、source 撤回所有相关旧解释；每条 fresh/previous 原四题都保留，合格局部义务之外仍标残余。
- [ ] previous 被阻断时显示缺哪个输入/基线/性质，不自动改称 fresh；fresh 自然partial不可宣传成复用收益。
- [ ] 同组 token 包含准备、失败及修复；不假报未做的真人作者分钟或美元。

### BC12 原包、搬移与使用交付

- [ ] 给出使用既有顶层命令的原包→自动准备→分析→inspect→change 示例，命令以实际实现为准写进现有 usage。
- [ ] 原包 byte identity、当前 sidecar 来源、改变任务/源码后的重新准备与 stale check、搬移后相对路径，做一次确定性验证。
- [ ] OWUI 原包的 11 题在离线准备合同中全保留，缺独立任务性质时显示明确入口；只使用确定性检查/mock，不为此隐含派发 OWUI 模型。不能写成已验证第二项目真实成功。
- [ ] 没有 HTML 展示层、新大 CLI 或整库目录改造。

### BC13 联合验证、归因与研究复盘

- [ ] 跑受影响测试、主/研究类型、文档单测和本轮改动链接；新增当前 replay 通过后不反复全历史审计。
- [ ] summary 逐项列实际事实、义务和未达责任，分清声明/源语义/实例/采用/检查/自然质量/复用/收益。
- [ ] 记录准备性能前后、真实额外模型成本及有效行为；结果为无差异/权衡/负向时原样发布，不以调整指标宣布成功。
- [ ] 更新研究总文档§1/§7.64/§11、spec§14.42、current-status、当前计划、usage/developer-guide相关小节及根 conversation_log。

### BC14 发布与恢复交接

- [ ] 本轮文件白名单检查，保留其他线程材料，提交并推用户 origin/skill-ir-aot，读远端 SHA 核对。
- [ ] 最终 status 将工程、有限队列、真实使用、研究目标分开；每个未达责任给原件路径、准确代码责任、下一条可执行动作。
- [ ] 没有成功的真实性质链时，报告仍缺哪个语义/接线；不得将计划全部打勾当研究完成，不擅自追加下一身份。

## 7. 有限实验登记与现场修复规则

BC0 登记以下 **11 个逻辑位置**，引用同一 attempt 时样本/费用去重；机械离线测试不占位置。

| 位置 | 输入与目的 | 进入条件 |
|---|---|---|
| `native-download` | 原包四题，自然任务自动准备并实际检查 | 准备/公开链已通过 |
| `quality-n-1` / `quality-d-1` | 同四题第一对 | 当前真实局部链；native可仅在完全同输入/epoch/合同下引用为D1 |
| `quality-n-2` / `quality-d-2` | 第二对，顺序与第一对反转 | 第一对没有待修共享故障 |
| `policy-fresh` / `policy-previous` | 既有政策变化 | previous另需同性质当前合格基础 |
| `premise-fresh` / `premise-previous` | 既有前提变化 | 同上 |
| `source-fresh` / `source-previous` | 既有源码变化 | 同上，依赖解释先失效 |

每位置至多一次首轮派发；针对发现的具体缺陷允许具名修订。最多两次同因修订无改善即停止该位置的抽样，继续代码/原件诊断及独立任务。任何共享 Schema/接线错误发现后，禁止继续跑受其影响的位置再统一修。

继续继承官方通道有限恢复：明确终态 routing 失败可做一次同题具名恢复；连续两次终态 routing 失败或本轮累计三次恢复仍失败则暂停新外部派发。quota/auth 立即暂停；新 unknown 不重发，只收集原生命周期。成功只重置连续失败数，保留全部历史费用/失败。旧 BB attempt 永不被 BC 重开。

收益主口径保持端到端分母；另报“有有效答案时”的语义质量。总 input 包含 cache-read 时只计一次；材料采用按 question/property/call instance 区分独立事实与重复使用，不用聚合 use 数代替闭合。

## 8. 验证命令与预期

在 `D:\skill优化\SkVM` 执行，下面既有路径已核实。开发阶段按改动选择一次相关集合，不每阶段全跑。

```powershell
bun test ./src/benchmarks/authorization-dsl/inquiry-tools.test.ts
bun test ./src/task-dsl/authorization/source-interpretation.test.ts ./src/task-dsl/authorization/source-edit.test.ts ./src/task-dsl/authorization/property-query.test.ts ./src/task-dsl/authorization/semantic-flow.test.ts
bun test ./src/benchmarks/authorization-dsl/source-material-projection.test.ts ./src/benchmarks/authorization-dsl/source-edit-transaction.test.ts ./src/benchmarks/authorization-dsl/source-edit-counterexamples.test.ts ./src/benchmarks/authorization-dsl/interprocedural-property-entrypoints.test.ts
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
git diff --check
```

新增 `property-intent.test.ts` 和 BC `study.test.ts` 后分别运行其精确路径；BC `tsconfig.json` 继承现有研究配置并运行 `bunx tsc --noEmit -p ./results/skill-ir/skill-dsl-research/development/authorization-task-binding-v1/tsconfig.json`。正式派发前，新 runner 的 run/replay/summary 命令必须已经实现、help 和零调用输入验证通过，并将精确命令写回本页；不要把尚不存在的命令说成可运行。

准备故障的验证要求是原 scope 能完成且等价，或在尚未修复时以明确失败结束、可继续定位；只完成后者仍是部分工程验收。局部性质验收要求真实模型提案经公开入口、当前源采用、跨源非空 trace、checked/violated 和独立源码支持；`bound`、测试数、自然 full 单独出现均按其本来含义报告。

## 9. 交付要求

- 必备：当前实现、相关红绿/联合验证、准备性能归因、原包性质准备和逐题残余、真实首件/具名修订、当前完整或部分结果、费用及未知账本、可复现普通命令。
- 原 BB、BA、AZ、AY 的代码身份/原件/报告不回填；held-out、Q1、prospective、readiness、历史0/6保持。
- 全部研究解释追加现有研究总文档。单轮状态和日志留 BC results，不新增长期阅读文档。
- 不预设正向结论。若本轮能够把一条真实跨函数性质接住，就据此评估普通用户是否少做人工编码；若仍失败，准确交付缺口，停止通过扩大无关语言语义消耗下一轮。
