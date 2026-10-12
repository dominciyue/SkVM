# BJ0–BJ25：自动编写运行闭环、源码分支补齐与同稿复用

> **For agentic workers:** 使用 `superpowers:executing-plans`，逐项连续实施。用户已授权新线程使用 `gpt-6.1-sol / max` 开发并提交、推送用户 origin。设计依据是 BI 发布后复核及用户本次“书写下一步任务书并派发，12h任务量”的要求；普通开发、定向验证和下述账号实验无需再问。按根/仓 AGENTS 使用只读探子，主开发线程独占实现、共享文档与 Git。

**Goal:** 从完整原 skill、自然任务、允许源码和明示场景事实，自动编写一份能计算 Download 对象、授权分支、版本和文件选择的程序；实际形成“提交—执行—看到缺口—修稿—变化验证—保存消费”的闭环，并保留原四问质量评价和真实成本。

**Architecture:** 继续使用现有 inquiry、官方账号入口、resourceWorkflow、渐进编译、patch、previous 与执行归档。把执行输入绑定与语义问题职责显式分开；在已有作者循环中加入机械进度反馈和及时试算。模型从源码决定关系，宿主负责输入接线、求值、版本、诊断和归档。现有开发者程序只用于独立对照和离线能力核验，不送进隔离作者。

**Tech Stack:** TypeScript、Bun、Zod、现有 SkVM CLI、PowerShell 示例；开发 `gpt-6.1-sol/max`，实验沿用已授权官方账号 `gpt-5.6-sol/high`。

**状态：** authorized-ready-for-dispatch。规划基线 `ace945fa6cb20662a416c45d70777fdf945e95ec`，分支 `skill-ir-aot`。本文件尚无实现/效果结果。新 identity 为 `authorization-authoring-loop-v1`；所有新实验、派生复核和状态进入 `results/skill-ir/skill-dsl-research/development/authorization-authoring-loop-v1/`。BI 原稿、原件和结果保持原样。

## 一、已核实的起点与这次的改变

BI 已有有序 patch、三版本保存、渐进执行和八次完整账号交付。自动稿仍未完成。此次不把关闭若干实验位置作为完成开发的充分理由。

1. **机械输入没有接入。** BI 自动稿 `scope.questionId=authorization-and-selection-order`，事实只挂在 `requested-document-and-returned-file`。当前 runtime 按前者取数据，执行输入为 `{}`。这是宿主/作者接口责任，不能只留一句“模型下次选对 ID”。
2. **接上输入后暴露真正的逻辑缺口。** 复核保持自动稿字节不变，仅在纯执行器显式传入既有 Q1 数据：默认选择得到文档11/archive；空 version 仍错误选择11，源码关系要求12/original；拒绝场景未算出拒绝；root失查仍无值。这是诊断干预，不能登记自动成功。
3. **可计算含义被藏进 external。** 源码 `permissions.py:634–635` 先构造检查器，再执行 unowned/owner/object-grant 三分支。自动稿将整个 `has_perms_owner_aware` 外部化，导致已有 owner 事实也不能使用。检查器构造与权限后端未知必须保留，各源码可见分支由作者表达。
4. **作者先读到预算尾部才试写。** A1 前59个工具单位用于发现/读取/详情，最后提交结构错误的六步稿。A2采用十二步，但部分关系只在自然答案中解释。BI后补输入反馈没有真实作者确认。
5. **仍有确定性共享缺陷。** `programConsumptionDetails({}, {view:'draft'})` 在 `program-consumption-context.ts:30` 抛 TypeError：两个缺失revision相等后访问不存在的candidate。先修这个早期操作，不让作者一开始就受工具错误干扰。
6. **压缩暂时让位。** BI P0 tradeoff、P1 negative。BJ所有主作者/消费者使用full，不重复那四个compact位置。优先得到可信的自动产物，再评价实际使用成本。

归档依据：BI `summary.json`、`authoring/a1-assessment.json`、`authoring/automatic-program.json`、`quality.json`、`comparison.json`；本地追加复核在 `D:/skill优化/project-maintenance/bi-review-20261012T204356172/review.json`。仓库研究§7.71保留可搬移的关键事实，不要求另一台机器存在本地复核目录。

## 二、必读上下文与文件责任

执行者亲自读基础文档和即将修改的源码；大原件按工具名/会话阶段定点读，不重复全历史审计。

1. `D:/skill优化/AGENTS.md`、`D:/skill优化/SkVM/AGENTS.md`。
2. `docs/skill-ir/current-status.md`、本任务书全文、spec§14.49、研究§1/§7.70/§7.71/§11。
3. 根 `project_handoff.md` 当前BJ段、`project_communication.md` 最新BJ决定；旧队列不是待执行清单。
4. BI上述摘要、原稿和A1/A2实际program/patch/details工具回合；确认原始失败与后补接口的时间顺序。
5. 下表实际代码/测试与已有Download/ShareLink示例。无需通读未涉及的语言语义层。

| 责任 | 现有或新增文件（相对 SkVM） |
|---|---|
| 空草稿详情、当前结果投影 | `src/task-dsl/authorization/program-consumption-context.ts`、对应 `.test.ts` |
| 程序合同与编译 | `src/task-dsl/authorization/executable-contract.ts`、对应 `.test.ts` |
| 显式输入接线 | 新增 `src/task-dsl/authorization/program-input-binding.ts`、对应 `.test.ts`；调用方复用同一解析函数 |
| 原子修稿 | `src/task-dsl/authorization/resource-program-draft.ts`、对应 `.test.ts` |
| 作者进度与机械反馈 | `src/task-dsl/authorization/program-authoring-context.ts`；新增 `program-authoring-context.test.ts`，必要时将反馈纯函数放在相邻小模块 |
| 真实输入与求值轨迹 | `src/task-dsl/authorization/resource-relations.ts`、对应 `.test.ts` |
| 当前候选、活动、恢复 | `src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts` |
| native/structured共同循环 | `src/benchmarks/authorization-dsl/inquiry-native.ts`、`inquiry-run.ts`、`question-workflow-wire.ts`，相关现有测试 |
| 普通入口、归档与迁移 | `src/benchmarks/authorization-dsl/inquiry-local.ts`、`inquiry-reuse.ts`、`executable-contract-entrypoints.test.ts` |
| 普通使用 | `examples/authorization-assessment/download-workflow/run.ps1`、`README.md`；`share-create-workflow/`仅离线共享检验 |
| BJ研究脚本 | 新目录中的 `study.ts`、`offline-cases.ts`、`summarize.ts`、`study.test.ts`、`tsconfig.json`；参考BI公共入口接法，不复制其八位置即关闭的安排 |
| 当前方法与复盘 | spec§14.49、研究§7.71、当前计划/current-status、既有usage/developer-guide；不增加新的长期阅读文档 |

继续 `skill-ir-aot`，不新建分支/worktree，只推用户origin。派发父线程停止仓库写入。历史原件、冻结锁、旧未知、其它用户修改不清理。

## 三、实现决定

### 3.1 执行输入与问题职责分开，但不偷换前提

选择一个薄的兼容扩展：程序顶层可选 `inputBinding: { questionId: string }`，引用原输入中一个已存在的数据集合键。语义职责仍由 `scope.questionId` 表示；缺省沿用旧的精确同题绑定，不擅自合并全任务的数据。

```ts
// 加入 ExecutableContractSchema；InputSchema继承同一字段。
inputBinding: z.object({ questionId: InquiryText }).strict().optional()
```

示例使用匿名任务：

```json
{
  "scope": {"questionId": "permission-order"},
  "inputBinding": {"questionId": "resource-selection"}
}
```

这只是字段片段，完整程序仍由既有合同校验。宿主负责：

- 两个ID必须是当前原任务的真实问题；显式跨题引用必须属于同一operation，operation关系缺失/矛盾时具名诊断，不猜测。
- 只引用resourceInputs/externalAssumptions数据集；原问题、自然前提和政策不随之复制。返回值明确为该场景下的试算，不能提升为所有题的普遍事实。
- 只有外部假设或数据集为空也应能表示，不按非空值猜测是否存在。多个候选不自动选第一份。
- 缺省同题无输入时维持可见unknown，同时列出可选择数据集、字段结构和当前缺失名字，不能沉默地显示十二条级联unknown。
- 绑定纳入程序revision、patch、恢复和输入重算。`ProgramStepPatchSchema`增加同名可选字段：省略保留，显式对象替换，`null`明确撤销覆盖并回到旧同题规则。不可同时修改问题职责来掩盖绑定错误。
- resolved resourceInputs与externalAssumptions从同一个共享resolver产生；native、structured、普通check/run和previous使用同一路径。
- `program.operationQuestions`是两题operation归属的来源，不凭ID命名推断。旧 `contractInputs` 是性质层的逐题参数，仍按语义 `scope.questionId` 取值；本次绑定只选择resourceInputs/externalAssumptions，不顺带迁移性质参数。
- `ExecutableContractInputSchema`继承canonical schema中的字段；normalize、报告与digest不得丢字段。共享 `ProgramInputBindingSchema` 放入新模块；patch使用 `ProgramInputBindingSchema.nullable().optional()`，通过 `Object.hasOwn`区分省略与撤销。

不采用“把Q1数据复制给所有题”的捷径，也不建设新的完整数据配置语言。若实际类型证据要求调整字段位置，先更新本节/spec再实现，保持一个入口。

### 3.2 作者必须得到可行动的试算反馈

在现有作者循环上工作，不另造agent。每次program/patch以后已有编译器立即试算，反馈至少包含：

```ts
type AuthorLoopFeedback = {
  draftRevision?: string
  inputQuestionId?: string
  phase: "discover" | "draft" | "repair" | "review"
  firstDraftToolUnit?: number
  adoptedStepIds: string[]
  firstBlocker?: { stepId?: string; code: string; dependencies: string[] }
  remainingActions?: number
}
```

- 进度取实际提案/编译/事件，不由模型自报完成。首个原因与下游传播分开，例如缺documents只报一个根因并列受影响步骤，详情仍保留全部原始诊断。
- 暴露已给的输入值/字段形状、外部假设的精确调用形状。大数组按已有显示预算提供结构/有界样例和可读回位置；不得隐藏可用值后要求模型猜字段。
- 初始帮助给完整匿名包络和现有算子例子。旧程序、答案、具体正确分支不进入隔离作者上下文。
- 记录首次有效草稿发生在哪个工具单位、修稿次数、产生的新计算值和未解决语义。仅提示“继续”不算接通反馈。
- 编辑模式在预算前段安排试写提示；建议在12个纯探索单位后且已有可引用函数时触发一次宿主checkpoint，继续保留必要source工具。检查末段是否为写稿/修稿保留空间，不能让全部预算继续被重复读取耗尽。
- checkpoint基于机械进展发在既有工具回复中，不新发健康探针/评价调用，不硬封死尚需读取的决定性源码。真实作者若仍到末尾才提交，应回到共享调度分析，不能把增加同义提示当作已解决。

### 3.3 源码含义进入程序，外部未知留在精确边界

本轮优先使用既有select/order/coalesce/choose/integer/guard/external/return算子。由模型依据源码编写：请求查找、owner/unowned/非owner、检查器构造、对象grant、root加载/查询/回退、version absent/empty/explicit/invalid/wrong-root、版本排序、original/archive选择。

上述清单是开发与评价范围。隔离作者接收原四问、源码与通用“覆盖相关分支/异常/返回”的要求，不接收清单中的具体正确实现、期望ID或参考程序。

- `external`用于允许源码之外的实际依赖。源码可读但未解释的helper应标为未完成编写，不能与真正外部系统混成一种缺口。
- 默认owner场景已有构造完成假设时，owner分支应可算；没有构造前提则保留它，即使owner相同也不掩盖源码先构造检查器的顺序。
- 选择出路径与允许返回分别展示。未知guard后可以计算有条件候选值，但普通输出不得将其描述成已授权下载；真实文件不由此执行器读取或下载。
- 不以顶层 `status=computed` 验收。完整参考程序也可因明确范围外条件保持conditional；检查的是本轮承诺的局部计算、guard、返回及具名剩余边界。

### 3.4 真实失败当场处理

每个失败/不佳位置读原件后归到：工具或协议、接线、作者源码含义、预算/调度、消费遗漏、通道。共享缺陷先红测→修复→绿测→同责任具名实际确认，再启动仍受影响的位置。修复确认没有产生时，状态必须写“离线已修、真实未确认”。

语义缺口也在本进程处理：定位模型已读/未读、程序已写/未写的关系，改善通用反馈或source可见性，再恢复其自身稿件。开发者不得手写正确步骤塞回自动稿。若为了定位表达能力手写派生程序，明确标记developer-assisted，只进入离线诊断。

每个具体修复有一次具名真实确认；发现不同根因可继续修复并登记。相同代码/输入/提示的失败不盲重抽，同根因两次无进展转本地机制诊断。此规则停止无效调用，不停止仍有明确代码责任的开发。

每次共享修复附短的影响表：改动的绑定/执行/反馈责任、涉及的已跑位置、是否仍适用于当前版本。旧epoch结果与原分母保留，不追改为新结果；当前验收受影响项以具名确认或当前重算补证。不受影响的证据复用，不能一改提示就把所有历史结果作废重跑；无法补确认的项标为当前版本未确认。

## 四、约12小时工作安排

| 工作段 | 预计投入 | 实质交付 |
|---|---:|---|
| BJ0–BJ4 | 2h | 空草稿修复、显式输入绑定、公共入口/恢复 |
| BJ5–BJ9 | 2.5h | 可行动反馈、早期真实作者、当场修复确认 |
| BJ10–BJ14 | 2.5h | 源码分支补齐、变化检验、独立自动作者 |
| BJ15–BJ19 | 2.5h | 同稿实际消费、变化失效、搬移与第二结构 |
| BJ20–BJ23 | 1.5h | 同条件消费比较、根因驱动补强、使用收敛 |
| BJ24–BJ25 | 1h | 必要联合验证、研究归纳与发布 |

这是任务量，不保证模型执行恰好12小时。进入约2–3小时应已有一次真实作者反馈；不要等所有离线工程完成才第一次试用。主链失败时仍执行下述可独立工程；主链提前成功时继续完成变化与共享验证。所有适用责任实际处理完才收束，不用睡眠、空轮询、重复全量测试凑时间。

约第10小时复核剩余责任，之后优先自动稿修复确认、已有消费和交付，不新开独立方向。达到约12小时工作窗口时完成当前有界动作并保存检查点；若仍未达，将未完项标deferred/具体原因并收束本轮，不能无限增加修复调用。提前完成全部适用责任则直接交付。已派未知请求保持生命周期记录，不因时间窗口重新派发。

## 五、执行任务

### BJ0 — 接管并建立有结果区别的状态

- [x] 核对本分支、HEAD、工作区、用户origin及其他活动写者；基线为BI终态，规划提交另记录。
- [x] 新建BJ `status.json`、`attempts.json`。阶段行动、工程验收、自动主链、原四问和收益分开，未测值为null/not-run。
- [x] 精读本任务书/spec§14.49；把第一个动作设为BJ1反例，不重复旧全仓审计。

### BJ1 — 空草稿工具可用

修改 `program-consumption-context.ts` 与既有测试。先运行下面红测，确认原TypeError，再修复：

```ts
test("draft details without a candidate stays readable", () => {
  expect(() => programConsumptionDetails({}, { view: "draft" })).not.toThrow()
  expect(programConsumptionDetails({}, { view: "draft" }).steps).toEqual([])
})
```

- [x] 将候选存在性加入执行选择条件，避免undefined revision相等：

```ts
const candidate = report.candidate
const execution = args.view === "draft"
  ? candidate && currentRevision !== undefined && candidate.revision === currentRevision
    ? candidate.resourceExecution : undefined
  : report.resourceExecution
```

- [x] 无report、空report、只有raw、只有旧active、candidate与draft错版五种状态各自反馈正确；旧有效详情不回归。
- [x] 在native/structured mock回合先details后首次program实际走通。提交聚焦修复。

### BJ2 — 统一输入绑定解析

- [x] 按§3.1增加程序可选inputBinding和共享resolver；接口直接接收当前问题/operation映射及已有两个输入map，不读文件或模型。
- [x] 红测覆盖：缺省同题兼容；显式同operation跨题；不存在ID；跨operation；空数据集；只有external假设；缺省无输入不自动挑候选。
- [x] 结果带原scope、选择的数据键、绑定来源和诊断；相关失败只使试算数据不可用，原问题/草稿保留。
- [x] 用匿名两题fixture证明同样actor/object数据不再因程序回答另一题而消失；不能把两题前提合并。

### BJ3 — 修改、采用与恢复使用同一绑定

- [x] `ProgramStepPatchSchema`接inputBinding；省略/对象/null和步骤修改一起原子应用，过期revision拒绝且不改原稿。
- [x] `inquiry-domain-runtime.ts:231`及 `inquiry-local.ts:90`两条直接编译路径均替换resourceInputs/externalAssumptions接线；program/patch/import/recompute与普通check共用resolver，contractInputs仍取语义题。不能只修真实run留下零调用check使用旧路由。
- [x] 在恢复中切换绑定后必须重算；旧input/外部假设/候选结果不得沿用；撤销覆盖回到旧行为。
- [x] 更新shared wire帮助和实际公开工具schema，并用真实mock参数验证，不只检查字符串。

### BJ4 — 普通入口呈现与小范围验证

- [x] `check/run/inspect/previous`均显示“回答哪道题、用哪份场景数据、哪些值仍未知”；使用者无需打开巨大原件查接线。
- [x] 在BJ派生目录对BI原稿只加显式绑定做零调用诊断，标developer-assisted；原BI原稿不变。
- [x] 运行相关确定性测试和主类型检查，通过后即可进入真实作者准备，不等待其它离线工程全完。

### BJ5 — 作者看到数据结构和第一阻断点

- [x] 在 `program-authoring-context.ts`中使用共享绑定结果。字段名、记录结构、外部调用名字/参数/已提供前提均可查看，实际值来自用户场景，不来自expected。
- [x] 从resourceExecution形成去重的根因反馈：缺输入、缺对象字段、选择歧义、未提供external、无效表达式、未知guard分别给出step与依赖；保留详情原件。
- [x] 匿名测试中一个缺失输入导致五个下游unknown，应显示一个根因和五个受影响项；修输入后反馈立即消失，原执行记录不擦除。

### BJ6 — 将试写、试算、修稿接入真实循环

- [x] 记录首次program工具单位与实际草稿状态，在探索前段触发一次机械checkpoint；草稿存在时引导修首个阻断而非重新全文浏览。
- [x] 每个program/patch用当前输入自动试算并返回变化摘要；新候选无效时仍可读原稿和诊断，旧active明确标旧版本。
- [x] native与structured共用反馈。mock完整执行“读源→草稿→数据缺口→绑定patch→值计算→guard变化→拒绝→自然交付”。
- [x] 不能因自然答案已写完便丢掉草稿职责；因真实边界无法完成时可交付partial并保存原因，不能无限循环。

### BJ7 — 独立评价和真实运行准备

- [ ] 复用BI公共入口脚本结构创建BJ研究脚本，模型允许输入与评价文件分目录；所有真实参数/epoch在首次派发前写清。
- [ ] 用包含独特评价标记的匿名mock，验证author context只取skill/任务/允许源码/场景/自身稿与实际诊断；评价与参考目录不在工具allowlist。首个真实发送上下文及共享投影修复后定点核对，不给每次工具回复新增hash门或审批步骤。
- [ ] 程序评价从原源码导出，先保留默认、空version、拒绝、root回退四项必要诊断；另见BJ12变化矩阵。期望只在评价侧。
- [ ] 建立一次运行的时间线输出：读源、首次草稿、首次执行、修订、活动程序、最终答案；将“程序求出/自然补答/仍未知”分开。
- [ ] 公开零调用入口和mock通过后立即执行BJ8，不先花时间压缩上下文或搭展示层。

### BJ8 — R0：恢复作者自身稿，验证共享修复

- [ ] 用新BJ identity，从BI A2自身保存稿/允许材料恢复edit/full，实验模型看不到评价器、主线程诊断干预或开发者程序。
- [ ] 只通过普通工具的当前绑定/执行诊断继续修稿；确切session、原稿revision、首个修复和真实计算分开留档。
- [ ] R0为恢复/反馈确认，不计独立自动编写成功。即使失败，也进入BJ9处理原因，不直接转去消费凑队列。

### BJ9 — 当场修复并确认

- [ ] 按§3.4对R0实际失败分类。共享接口错误先针对性红绿修复，在继续受影响位置前运行一次具名确认。
- [ ] 确认仍失败时读新回合：同原因无进展转离线诊断，不复制提示重抽；出现不同共享缺陷继续解决。
- [ ] 记录“修前失败→代码差异→确定性验证→修后实测”，缺最后一项就不能写修复已被真实采用。

### BJ10 — 自动补齐源码可计算关系

- [ ] 优先查自动稿的external边界、version分支、排序、root回退；根据实际source读取与稿件差异改善通用source/运行反馈。
- [ ] 作者自己补规则，主线程不将正确ID、正确条件或参考代码交给作者。源码可见但未解释/真正外部未知分别显示。
- [ ] 用匿名同结构反例核验现有算子表达能力；确有算子缺陷才修共享执行器，不增加仓库/skill名分支。
- [ ] 有条件返回与授权成立分别展示；去掉真实guard、假设外部成功或删原题不能用来达标。

### BJ11 — F0：从零开始独立编写

- [ ] 在当时稳定epoch以完整原skill、四问、同允许源码、root-default事实启动新的edit/full会话，无previous、无原程序。
- [ ] 验证首次草稿发生时间、程序调用是否真实、输入是否接入、是否从执行反馈继续修稿。
- [ ] 失败按BJ9当场处理；首件与每次修后件分开。只有无开发者语义补写的稿件可以进入自动产物轨。

### BJ12 — 同一自动稿的变化矩阵

- [ ] 先保存选中的最新作者原字节，再运行：默认、empty-version、显式本root版本、非法版本、别的root版本、两个可用版本的排序、非owner拒绝、非owner许可、root失查、缺外部前提。
- [ ] 在BJ新输入目录构造这些已暴露development形状，期望逐条依据原源码；不读取held-out/Q1 reserve，不改旧inputs。
- [ ] 对每项记录实际对象/路径、guard/终止、条件和第一缺口；程序未算出的部分不能以自然解释补算成功。
- [ ] 条件相同但无关记录顺序/额外无关文档改变，不应改变结果。这个检验检查数据选择依赖，不能把参考程序自身当唯一oracle。

### BJ13 — 变化发现的问题回到同一作者流程

- [ ] 变化失败先判宿主接线/算子还是作者含义；前者改共享实现，后者通过自身稿、输入、实际轨迹和通用源码核对问题继续编写。
- [ ] 不发送期望文件ID/正确表达式。若发送了评价诊断，记录为反馈辅助修订，和F0首次独立结果分轨；开发者直接补语义的稿另标developer-assisted。
- [ ] 语义修订后保存新revision并重算受影响场景；保留首稿和失败，不重新跑无关旧大面板。

### BJ14 — F1：另一个起始输入的独立作者确认

- [ ] 主链已有实质改进后，在相同稳定epoch从empty-version任务事实独立启动一次作者；不带F0/R0稿、评阅或历史答案。
- [ ] 使用相同原四问与通用接口，检查起始场景变化是否仍能写出分支，而非把当前文件路径写死。
- [ ] 若前面仍有未修共享缺陷，先修；若同因两次无进展，F1具名推迟并做BJ19/BJ21独立工程。不能把尚未可用的已知接口继续跑满。

### BJ15 — C0/C1/C2：冻结自动原稿，普通消费

- [ ] 选择规则为F0的最新有实质修复稿，若F0无资源程序则用R0最新稿并明确恢复来源；选择在消费者运行前记录，不按消费答案挑稿。
- [ ] R0替代时C必须标记recovered-author-program-consumption，只支持恢复链可用；`automaticMainChainComplete`的fresh部分仍须F0/F1证据，不能用R0补成独立自动成功。自动链未达也可以观察其局部实际消费。
- [ ] 用同一原字节在root-default、empty-version和denied三种输入下consume/full；允许partial程序先运行，保留实际局部结果。
- [ ] 原skill/四问均在；消费者只能解释和读取源码，不能修改程序。C1可恢复C0的程序材料，绝不恢复旧答案。
- [ ] 检查终答是否使用当前执行值，是否把conditional候选说成已许可；原四问独立源码评阅。

### BJ16 — 输入变化与真正的材料复用

- [ ] 在零调用层比较同稿fresh/previous的当前输入、步骤、输出与缺口；输入变化不沿用上次值。
- [ ] 对C1实际归档确认恢复了什么、用了什么、重新算了什么，明确修稿收益与消费复用收益。
- [ ] 缺局部可用程序时记录缺口，其他工程继续；不为了复用标签换回开发者25步程序。

### BJ17 — 源码变化后的失效与修稿

- [ ] 在明确的新普通目录复制允许源码，单点改变决定性helper的版本选择或授权对象；原源文件不动。
- [ ] 旧程序相关来源失效，结果不沿用；无关材料可以保留，来源覆盖不足则保守失效并解释。
- [ ] 先零调用检查。自动稿主链已成立时执行一次S0真实edit/previous，使模型从改变的源码更新自己的程序；自然原四问继续评价。
- [ ] 可用链仍未成立则S0标not-run，不为旧unknown另开身份；继续完成确定性失效及恢复工程。

### BJ18 — 保存和搬移后的真实可用性

- [ ] 将当前自动稿、输入绑定、允许来源说明和会话复制到一个新普通目录，执行check/inspect/变化重算；不建worktree、不重跑模型。
- [ ] 模型中断前后currentDraft/candidate/adopted不串版；无稿/无候选/部分稿都可读并可继续编辑。
- [ ] 给出自动稿的具体公开命令与execution.md位置，示例默认不偷偷回落到开发者参考程序。

### BJ19 — 第二结构的共享能力检验

- [ ] 用既有ShareLink离线例检验同一输入绑定、早期稿件、patch、拒绝分支、恢复和结果呈现；保持历史模型unknown封存，本阶段不发ShareLink账号调用。
- [ ] 同时用匿名两operation fixture检查跨operation误绑定被诊断、同operation多题显式绑定可执行。
- [ ] 若代码需要Download名称才能通过，移除特殊分支并修共享实现。记录开发者离线验证与自动作者结果的区别。

### BJ20 — B0/B1：实际消费收益的有限比较

- [ ] 自动产物可运行后，在与C0/C1相同稳定epoch各运行一次原skill自然基线，无给定程序；同源码、任务、输入、模型、预算与可读source工具。
- [ ] BJ15与本阶段共同派发，预先采用C0→B0、B1→C1的反序两对，C2另列。不能等两次C都结束才想到补反序。原始请求顺序/时间记录，provider随机性不可控时保留单次开发观察，不宣称稳定因果。
- [ ] C提供自动稿属于预处理条件差异：结论是有自动程序的工作流/重复消费效果，不解释成纯DSL语法优势。作者/修订成本必须计入总账。
- [ ] 若C运行后核心又修改，旧C保留；只在修复确有影响时登记新epoch完整配对，不能拿跨epoch件凑结论。
- [ ] 没有值得评价的自动产物则不浪费两次基线调用，转BJ21明确工程；不再拿开发者参考消费代替自动效果。

### BJ21 — 对剩余失败继续做实质开发

- [ ] 按§七补充队列处理尚未覆盖的共同缺陷；首轮作者/消费者结束不是自动收工条件。
- [ ] 若只剩模型语义缺口，定位具体已读源码与缺少的可执行关系，检验反馈是否传到模型、可否用现有算子表达；至少完成可复用的诊断或接线改进再确认，不能只追加一页未达清单。
- [ ] 同因无改善且没有新可行动证据时停止该种调用，继续独立工程。不能为了“正向”删除失败或降低语义判据。

### BJ22 — 成本、质量与进度一起归纳

- [ ] 分开R恢复、F独立编写、修复确认、C自动稿消费、B无程序基线、S变化。记录input含cache一次/output/工具/耗时/发送字节和可用的实际费用。
- [ ] 每个程序结果列：当前输入、计算值、permission/return条件、范围外边界、独立源码评价；每个自然答仍评原四问。
- [ ] 首稿、修后、developer-assisted、零调用诊断不混在同一自动成功率。费用unknown保留，不能用token直接伪报美元。
- [ ] 可列作者成本加实际消费成本的合计；有限两对只报开发观察，不把外推次数当已发生的摊销收益。

### BJ23 — 使用入口和实现收敛

- [ ] 普通README先给当前自动产物命令和实际结果；说明选择已算出、许可仍有条件等可操作信息，保持full默认。
- [ ] 同一绑定/反馈只保留一个共享实现，清除本轮临时双路径；工具schema、帮助和CLI实际行为一致。
- [ ] docs不新增一轮一个组件说明；使用既有usage、developer-guide、研究正文和taskbook，临时原件按现有catalog/忽略规则保存。

### BJ24 — 必要联合验证与文档同步

- [ ] 运行受影响核心测试、主类型、BJ脚本类型和一次受影响授权联合回归；新改动才增加后续定向验证，不重跑全src旧104失败。
- [ ] 更新研究§1/§7.71/§11、spec§14.49、current-status/当前计划、本任务书实际状态及根日志；原失败和修复过程具名。
- [ ] 文档测试、改动文档链接/锚点与git diff检查；既有完整闭包方法足够时不再造一层锁/哈希审计。

### BJ25 — 提交发布和清楚交付

- [ ] 分目的提交生产实现/测试与研究证据/文档，只推用户origin，核对远端同SHA；不纳入他人文件。
- [ ] 最终第一项交付自动稿运行命令、实际逐步输出、返回/拒绝/条件结果；随后报告自动编写、变化行为、自然四问、复用和成本。
- [ ] 每个未达项有当前模块、具体错误、已试修复及剩余下一动作；“工程完成”与“研究目标完成”分别写。
- [ ] 所有适用任务和具名修复已处置后才能关闭队列；用户叫停则立即保存恢复点并停，不以研究未达无限循环。

## 六、真实运行队列、输入隔离与恢复

### 6.1 主位置

| 位置 | 数据/模式 | 要回答的问题 |
|---|---|---|
| R0 | BI A2自己的稿与材料，edit/full | 最新接线和反馈是否真正帮助修稿 |
| F0 | root-default，独立edit/full，无previous/program | 从零能否生成可执行完整局部关系 |
| F1 | empty-version，独立edit/full，无其它作者稿 | 起始事实变化是否仍能自动编写规则 |
| C0 | 固定自动稿+root-default，consume/full | 自动程序原任务真实使用 |
| C1 | 同稿+empty-version，consume/full，可previous | 同一程序对输入变化重算 |
| C2 | 同稿+denied，consume/full | 拒绝路径与自然说明是否一致 |
| B0 | root-default，无程序自然基线 | 对应C0的实际工作流比较 |
| B1 | empty-version，无程序自然基线 | 对应C1的变化任务比较 |
| S0 | 当前自动稿+源码副本变化，edit/full/previous | 来源失效后能否真实修稿 |

这些是九个有目的的首位置，不是全局模型调用上限。每个具体工程修复的一次真实确认和有新依据的语义修订已在本次授权内，执行前追加identity/原因/代码epoch/输入，不需再问用户。无新依据、只求幸运结果的重抽不在队列中。旧BI不补行，不给修稿改名冒充fresh。

共同初始预算：64工具单位、读取33554432字节、显示786432字节、会话45分钟。确有预算截断时可记录理由调整相关位置，并保持配对同预算；不把加预算作为跳过根因分析的替代。作者调度是否有效按首次草稿与实际修稿轨迹判断，不以工具总量越少越好。

### 6.2 可用输入与隔离

- 原skill：`results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/SKILL.md`及伴随资源，完整加载。
- 原来源：`results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/model/packages/download/source/`，ref `126ec414a8b65158368653a2604ae58415e43103`，沿原allowedPaths。
- 输入：`examples/authorization-assessment/download-workflow/inputs/`；BJ派生事实单存，不修改旧场景。事实是development示例，不能称生产数据库或真实部署。
- BI自动稿/原会话仅进入R0恢复；F0/F1不读它，也不读本任务书、研究诊断、评阅、reference program和expected。
- 原四问ID保持：`requested-document-and-returned-file`、`authorization-and-selection-order`、`alternate-version-authorized-resource`、`missing-facts-and-conditional-conclusions`。
- 正确实现和期望留评价侧；作者能看当前输入、自己程序的实际轨迹和原始源码。机械错误的字段路径可以展示，源码结论不得由宿主填上。
- 账号边界沿 `authorization-executable-contract-v1/account-boundary.json`；只读非凭据合同。账号用量已授权，不读取或回显密钥，不自行换模型/第三方通道。

### 6.3 通道与时间中断

明确routing终态失败允许一次具名恢复；连续两次或累计三次恢复失败暂停本轮外部派发。quota/auth立即暂停；未知完成只查原生命周期，不自动重发。旧OWUI/ShareLink未知及第三方暂停保持。模型暂停时继续BJ1–7、12、16–19、21–24中尚有价值的确定性工作，不等待恢复凑时间。

阶段结束保存下一条具体命令/源稿/诊断和未完任务。平台中断后从该点继续，勿重读全历史或重发已完成请求。

## 七、主线提前结束时的实质补充工作

这些是授权开发责任，按尚存缺口选择；已被主线实际证明的项写明依据，不重复造测试。

1. **绑定与前提边界矩阵：** 同operation不同问题、不同operation同名输入、空数据集、多候选、覆盖/撤销、恢复后原前提保持；修误用事实而非扩大默认合并。
2. **渐进执行的污染隔离：** 无关坏value保留可用结果，未知guard后的值有条件，false guard不返回，return后节点不误算；实际输出不能隐藏条件。
3. **反馈根因定位：** 字段缺失、非唯一select、未提供external、过期来源分别指出首原因，不把下游重复unknown当多个新的作者任务。
4. **原稿/候选/活动恢复：** 两轮patch后中断、失败patch后恢复、输入绑定变化、source变化、空candidate；修真实revision错配。
5. **程序外职责：** 文件选择算出后，框架GET权限、FileResponse与外部后端问题仍可继续查；用mock和实际已归档消费者确认没有过早收尾。
6. **重复传输的有据减负：** 优先去掉完全重复且有当前详情可取的机械状态，保留full的原职责/源码。先用已归档载荷零调用量测；只有明确共享缺陷才修，BJ不加compact面板。
7. **共享示例可移植性：** Download/ShareLink同一绑定和恢复接口，在新普通目录读取，不依赖开发者机器路径；保留失败目录的归属，禁止全盘清理。

不要新增语言语义全谱、HTML、另一个CLI、无关安全扫描或大规模新skill采集。主要工程解决后且所有适用补充项均有依据，可提前完成并如实报告时间；没有固定位置可跑但还有共享缺陷时继续开发。

## 八、验证与最终验收

初始定向集合（新增测试写出后并入）：

```powershell
Set-Location 'D:/skill优化/SkVM'
bun test ./src/task-dsl/authorization/program-consumption-context.test.ts ./src/task-dsl/authorization/resource-program-draft.test.ts ./src/task-dsl/authorization/resource-relations.test.ts ./src/task-dsl/authorization/executable-contract.test.ts ./src/benchmarks/authorization-dsl/executable-contract-entrypoints.test.ts
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
git diff --check
```

新增文件后运行：

```powershell
bun test ./src/task-dsl/authorization/program-input-binding.test.ts ./src/task-dsl/authorization/program-authoring-context.test.ts
bun test ./results/skill-ir/skill-dsl-research/development/authorization-authoring-loop-v1/study.test.ts
bunx tsc --noEmit -p ./results/skill-ir/skill-dsl-research/development/authorization-authoring-loop-v1/tsconfig.json
```

研究脚本提供 `status`、`offline`、`run <position> <attempt>`、`summarize`、`verify` 五个可恢复动作，真实调用统一走普通CLI；离线重放不产生provider请求。具体自动稿命令在首次产物保存后写入现有README，并验证路径可用。

| 验收轴 | 需要实际看到的结果 |
|---|---|
| 共享工程 | 无稿可读；绑定可选择/撤销/恢复；两工具入口真实试算与修稿共核 |
| 自动编写 | 隔离fresh作者原稿被采用，源码可计算的局部授权/选择/返回关系由程序执行；恢复与开发者帮助单列 |
| 变化行为 | 同稿原输入、空version、拒绝、显式版本/排序/root回退等产生源码支持的当前值或正确具名条件 |
| 原任务质量 | 全部四问独立源码评阅；程序事实与自然补充对应，遗漏不靠减少题目消除 |
| 复用 | 恢复的是合格材料/程序，当前事实重算；源码变化撤回有关结果，有实际使用事件 |
| 实际成本 | 作者、修复和消费分账；同期配对保留质量/费用各方向，允许tradeoff/negative/inconclusive |
| 可用交付 | 普通命令、自动产物、execution.md、剩余条件、相关验证和origin同步 |

`actionsCompleted`、`engineeringComplete`、`automaticMainChainComplete`、`researchGoalAchieved`分别维护；执行完任务动作不自动把研究目标填true。追求本轮主链可用，结果依实际证据判断。允许局部运行与条件交付，保留真实不确定性及未执行分支。
