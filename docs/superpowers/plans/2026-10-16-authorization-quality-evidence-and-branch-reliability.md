# BP0–BP21：授权对象、分支可靠性与可执行 DSL 质量证据

> **For agentic workers:** 使用 `superpowers:executing-plans`，遇到真实缺陷使用 systematic-debugging 和 test-driven-development。用户已明确要求新线程直接执行；开发模型 `gpt-6-astra/high`。常规检查点不等待确认，按有限队列完成工程、真实使用、评价和发布。探子仅做窄范围只读核验，不另派写代码线程。

**状态：** in-progress（2026-10-17，从189a5924接管；工程14eea13f和精确CLI适配b33adeb4尚未推送）。三个作者已交付并完成离线和独立评阅，A0固定52步；A0/A1最终均18/18、7/8、6/7，A2字段17/18、5/8、5/7，局部轨迹18/18、7/8、6/7。普通五组入口与搬移失效检查通过。Q0原R0首件只读确认interrupted且未交付；原unknown和部分费用保留，具名cli-recovery另轨交付（1/6修复额度）。Q0首块已评阅；Q1三臂已交付并评阅，Q2-R2-0已交付、待盲评。前六主面板首位置保留原R0未交付，当前无重复质量优势结论。完整36首位置分母不变，跨epoch不作因果配对，尚无主面板效果结论。BO 的终态、原件和评分保持。

**Goal：** 让自动程序可靠表达外层激活、对象关系和有限分支，并用同条件实验查明规则整理与实际执行各自改善哪些回答质量；交付可运行、可解释、可维护的程序和明确的优势/退步边界。

**Architecture：** 沿用 SkVM inquiry/native、resource workflow、when/guard、patch/trial、来源失效和账号归档。补共享作者反馈、纯规则文档及可控的消费支持；固定同一份模型原稿，比较原 skill、同规则 Markdown、同规则加可执行 DSL。源码含义仍由模型判断，独立评价在生成边界外。

**BP6 实现细化（首次真实调用前）：** legacy 基线默认未公开 source_structure，与两组辅助模式不等价。新增独立的 sourceStructure opt-in，把相同有限源码结构能力提供给三组；不开启基线 domain 工具或求值。保留旧默认值，预检比较三组源码工具定义及文件绑定，回归测试比较实际结构输出。原预注册输入、量规与位置不变。

**Tech Stack：** TypeScript、Bun、Zod、既有只读源码工具和官方账号 adapter。使用现有 CLI 与示例，不新建平台或通用语言解释器。

- 仓库：`D:\skill优化\SkVM`；在 `skill-ir-aot` 开发，仅推用户 `origin`，不创建分支/worktree。
- 已核对基线：`af8321c313bcd3216620c1436802bacd8420fca8`，本地与 origin 一致，BO 线程 completed；tracked 干净，历史 `.tmp/` 保留。
- 新 identity：`authorization-quality-evidence-v1`；本轮研究代码/结果集中 `results/skill-ir/skill-dsl-research/development/authorization-quality-evidence-v1/`，下文简称 BP 目录。
- 开发 `gpt-6-astra/high`；真实实验沿已授权官方账号 `gpt-5.6-sol/high`。第三方付费 API 暂停，不迁移凭据、不改账号额度。
- 本轮以质量为主要效果轴。成本继续真实留账，不以 token 下降作为质量实验继续或质量进步成立的前提，也不把质量改善称为净节省。
- 连续推进实质工作，完成有限队列即收束，不通过等待、重复验证或增加抽样凑时长；本轮不自动创建 BQ。

## 一、已复核的起点和应当解决的原因

BO 已形成可执行的自动程序。A0 首稿局部轨迹 4/18、额外 2/8；公开工具契约修复后，同一作者具名修订的 45 步稿达到字段/局部轨迹 18/18、额外 7/8。原执行器已有 when，首轮实际 program/patch 工具说明没有公开它；修复还伴随额外预算和自己的前稿，因此只报告修订进步，不把进步全归因于说明。唯一额外轨迹反例是 anonymous-skip-checker：漏掉调用者的外层 `request.user is not None` 激活关系。

BO A1 从空稿能表达匿名激活、短路和完成，局部调用 17/18 加 8/8，但值只有 7/18；无 version 分支漏 deleted 过滤、非法转换没有形成明确拒绝。合法上游未知另列。A0/A1 的好片段不能由开发者拼成一份“自动成功”稿。

两对自然答的 8 个逐题位置为 3 改善、1 退步、4 持平，full 从基线 2/8 到辅助 4/8；Q3“请求对象、授权对象与返回文件之间的关系”两对均改善。Q1 的完整分支/精确排序仍不足，Q4 出现一次正常完成前提遗漏。8 个位置来自两个输入、四个相关问题，不是 8 个独立项目。

2026-10-16 父线程用当前 checkAuthorizationInquiry 零模型重放 root-default、denied、no-external、null-owner-shortcut、anonymous-skip-checker：前四项局部轨迹通过，匿名项在 ordered-exact-external-calls / required-conditions 失败，未写回 BO 原件。

代码定位说明本轮重点：

1. `program-obligations.ts::projectProgramCallRelations` 当前主要检查 `activation === conditional` 与 `!!step.when` 是否一致。存在 when 不代表包含调用者的全部激活条件；需要核对模型声明的外层依赖及实际 trial，而不是再发明短路语法。
2. `program-consumption-context.ts` 的 full/compact/directed 均会携带已求值内容，当前没有真正的 rules-only 对照。仅隐藏 returned 字段仍会从 outcome、candidate、details、final child 等路径泄漏执行结果。
3. 原始程序有 authored literal、computed value、external fact 和 upstream unknown。自然答应能区分其依据，不能把字面字段当作宿主已证明的框架行为。
4. 评价应同时保留逐题完整性、关键事实准确性、重要遗漏、错误肯定和整题结果。只有整题 full 一个指标，会遮蔽具体进展；只挑改善项又会遮蔽退步。

## 二、必读上下文与写入职责

按顺序读，旧历史只沿具体问题追溯：

1. `D:\skill优化\AGENTS.md`、仓库 `AGENTS.md`、`docs/skill-ir/current-status.md` 和本任务书全文。
2. `docs/skill-ir/skill-ir-aot-optimization-plan.md`、spec §14.55、研究总文档 §1/§7.77/§11；BO 方法/结果保留在 §14.54/§7.76。
3. BO 目录的 `execution.md`、`evaluation/program-summary.json`、`evaluation/quality.json`、`verification/acceptance-matrix.json`、`verification/actual-wire.json`；A0 首稿/固定稿/A1 原稿按需读取。不要重新运行会写回 BO 的 offline/verify-wire。
4. 下列文件中即将修改的代码亲自完整读。普通命令见 `examples/authorization-assessment/download-workflow/README.md`。真实源码按 input.sourceRoot 解析，固定 Paperless ref，不更新成当前上游。
5. 本地 `project_handoff.md` 的 BP 恢复点及 `project_communication.md` 最新 BP 记录；完整历史账本不作为每轮必读。

| 文件/目录 | 本轮责任 |
|---|---|
| `src/task-dsl/authorization/program-coverage.ts`、`program-obligations.ts` 及测试 | 可选、向后兼容的激活依赖声明与实际连接诊断；复用已有账本 |
| `program-authoring-context.ts`、`program-trial.ts`、`resource-program-draft.ts` 及测试 | 当前来源/草稿/trial 的修稿前沿，outer activation 与局部值错误分开 |
| `resource-relations.ts` 及测试 | 保留既有 when/guard/unknown 行为；仅真实匿名反例证明执行器错误才修改 |
| 新 `src/task-dsl/authorization/program-rule-document.ts` 及测试 | 从模型原稿确定性生成完整规则文本，不执行、不增补源码意义 |
| `program-consumption-context.ts`、`program-delivery.ts` 及测试 | 规则与执行信息隔离、依据种类和剩余责任的可取回投影 |
| `src/benchmarks/authorization-dsl/inquiry-native.ts`、`inquiry-local.ts`、`program-call-loop.test.ts` | actual tool table、规则/执行支持接线和完整 fake-account 消费链 |
| `src/adapters/codex-account.ts`、现有 CLI 薄接线 | 只有支持选项或生命周期确需传递时窄改；不重构通道 |
| BP `study.ts`、`study.test.ts`、`panel.ts`、`evaluation/`、`verification/`、`tsconfig.json` | 新队列、公共输入、独立评价、有限实验、可读结果；不得复写旧 runner |
| Download README、usage/developer-guide、current-status、spec/plan/研究 | 复用既有入口和研究正文；不新增一次性组件文档 |

主开发线程独占仓库和共享文档写入。历史原件、held-out/Q1 reserve/prospective/readiness、旧未知请求及其他线程材料保持；不执行目标业务下载、真实授权或外部写操作。所有测试只在有限事实或自己的副本中执行。

## 三、方法与评价合同

### 3.1 激活依赖帮助发现遗漏，不能替作者填答案

优先沿现有 `coverage[].call` 增加可选 `activationDependencyIds`：指向模型自己定义的布尔条件步骤。宿主只核对身份、顺序、when 的传递依赖和实际 trial；源码是否要求这些条件，仍由模型解释和独立源码评价。该字段不要求全部调用填写，未声明仍保留 unreviewed。

建议增量形状，合入现有 schema，不另建覆盖账本：

```ts
activationDependencyIds: z.array(z.string().min(1).max(256)).max(32).optional()
```

红测必须包含“有内层条件但漏外层条件”。使用匿名步骤 `present`、`needsCheck`、`invoke`：

```ts
const missingOuter = { op: "truthy", language: "python", value: { binding: "needsCheck" } }
const complete = { op: "all", args: [
  { op: "truthy", language: "python", value: { binding: "present" } },
  { op: "truthy", language: "python", value: { binding: "needsCheck" } },
] }
// 在 program-obligations.test.ts 复用现有 api/rawFor/call/out/at/relation：
test("an inner predicate does not satisfy the declared outer activation", () => {
  const prefix = [
    { id: "present", op: "value", value: { literal: false }, source: at },
    { id: "needsCheck", op: "value", value: { literal: true }, source: at },
  ]
  const declaration = { ...relation, activation: "conditional",
    activationDependencyIds: ["present", "needsCheck"] }
  const bad = rawFor([...prefix, { ...call, when: missingOuter }, out], declaration)
  expect(api.projectProgramCallRelations(bad)[0].diagnostics)
    .toContain("activation-dependency-unconnected")
  const good = rawFor([...prefix, { ...call, when: complete }, out], declaration)
  expect(api.projectProgramCallRelations(good)[0].diagnostics)
    .not.toContain("activation-dependency-unconnected")
})
```

上面的 predicate 使用当前 all/truthy/language 合同；再用 executeResourceWorkflow 检查 present=false 时跳过 invoke、unknown 不伪装为 false。该红测只针对激活依赖，完成 guard 的已有诊断不因这项修复消失。诊断采用 `activation-dependency-missing`、`activation-dependency-unconnected`、`activation-dependency-order` 等具名原因；原有诊断保持。引用图检查不宣称逻辑等价证明：若不同表达式在已测有限输入等价，分别记录 structural-review 与 finite-trace，不为了过机械检查强迫错误改写。

outer source 未被作者声明时，只能显示既有源码候选/上层调用位置需要复核，不能由宿主直接补 `user != None`。不按 Paperless、permission checker 名称或者旧答案生成条件。

### 3.2 三臂分开回答两种问题

| 臂 | 模型可获得的材料 | 能回答的比较 |
|---|---|---|
| R0 原始 | 原完整 skill、四问、相同源码工具和输入事实 | 原始使用基线 |
| R1 规则 | R0 全部 + 固定自动稿的完整规则 Markdown/可取回原字节；无已求值结果和执行工具 | 规则整理的整体帮助：R1 对 R0 |
| R2 执行 | 与 R1 相同规则和原字节 + 当前有限执行、轨迹/条件/来源失效工具 | 在同规则基础上增加可执行支持：R2 对 R1 |

R0 对 R2 是完整程序辅助流程比较；R1 对 R2 才定位执行支持增量。本轮不据此单独主张 JSON 语法优于 Markdown。

规则文档必须来自固定模型原稿，不能由开发者补对内容或由模型重新摘要。保留 step 顺序、when、表达式、选择/排序、guard/external、所有来源和未实现说明。可用逐步中文/英文标题配原始表达式的 Markdown，完整 raw 同时可取回。三臂共享自然答要求，不向 R2 强加额外形式答题义务。

建议纯接口：

```ts
export type ProgramRuleDocument = {
  schemaVersion: "authorization-program-rules/v1"
  programId: string
  markdown: string
  representedStepIds: string[]
  semanticSupport: "author-declared-unreviewed"
}
export function renderProgramRuleDocument(raw: unknown): ProgramRuleDocument
```

输入仅 raw，不接受 report/execution/oracle。用现有 schema 保留可解析局部稿；无法完整表达的操作必须显式具名并可取回原字节，不能静默略过。测试在 sibling report 中放置独特结果 sentinel，证明纯 renderer 不接触它；raw 本身的 literal 必须保留，因为那是作者规则，不是当前运行答案。

普通宿主增加显式 `programSupport: "rules" | "execute"` 消费选项或等价的现有 capability 接线，默认 execute，原 full/compact/directed 含义不变。rules 模式复用同 consumer host、源码工具、skill 和答题原则；只解析/校验/展示规则，不能用 details、trial、candidate、终答 child 或历史恢复绕回当前执行结果。规则材料可用既有 skill reference 取回；不得偷偷重写原 SKILL.md。新增 CLI 参数只做薄透传，并以 actual thread/start 和工具回执证明隔离，而非仅测试纯函数。

R1/R2 共享的输入、规则、source/read/display/tool/time budget、模型和修复机会一致；能力差异仅为声明的执行支持及对应工具。R2 的模型自主选择是否读取/采用轨迹，未采用也是结果，不通过私下提示强迫它引用正确答案。

### 3.3 质量主要指标与分母

主指标按四个预登记能力域报告：对象关系、分支/调用顺序、变化一致性、条件与证据忠实性。每个原问题的事实项在生成前按源码建立，分别标 essential/optional，并映射回原四问；不得事后拆更多有利的细项抬高分数。

每项使用 `correct / omitted / incorrect / appropriately-unknown / over-abstained / undelivered`；适当 unknown 只有准确指出缺少的决定性事实与影响范围才通过相应标准。另保留原题 full/partial/incorrect 和整题完整性。已执行但条件不足、纯字面声明和上游真实行为各自记录。

配对表输出每个能力的 win/tie/loss、正确/遗漏/错误肯定计数、交付率和所有样本的原回答指针。首答、修订答分别评分；无交付保留计划分母，同时单列传输问题，不将失败行排除后只报成功率。两个重复来自同一任务，不能当两个独立仓库；本轮只作有界 development 证据，不承诺显著性。

**局部优势的结论规则：** 某一能力域 R2 对 R1 在两个重复中都减少关键错误/遗漏，且该域不增加关键错误肯定，可以报告“该能力在本面板的重复局部优势”；仅一个重复改善为“探索性改善”；优势伴随该域退步为“取舍”；持平、负向和无法判断分别报告。其他能力域的退步必须与优势同表显示，不能据局部优势改写整题/完整自动化结论。

状态单列 `localQualityGoalAchieved` 和逐能力 `qualityEvidenceStatus`：达到上述至少一个能力域的重复局部优势时，本轮局部质量目标可为 true；整题/完整自动编写/长期研究目标仍按各自证据判断。上游范围未闭合或成本增加不抹去已确认的局部质量成果。

报告 schema 不允许只输出这个布尔值：同时要求四个能力域完整矩阵、每域 win/tie/loss、错误肯定/遗漏、首答/最终交付和整题结果及原件指针；研究测试验证缺域或删失败行会被报告校验拒绝。用户摘要也需同时列出主要退步，不能只展示局部成功标记。

这项设计参考 [CheckList 的行为测试思想](https://aclanthology.org/2020.acl-main.442/)：按能力和变化关系组织测试。引用支持评价方法，不替项目结果作背书。

### 3.4 输入、程序选择与防止评价答案流入

仅使用已暴露的 Download 及 ShareLink development 来源。新增组合输入属于已暴露源码上的 development variation，不宣称 unseen 或 held-out。

作者只能得到原 skill、自然任务、允许源码、公共输入事实、自己的程序和真实 trial/编译反馈。evaluator、任务书答案、源码裁定、开发者参考程序、BO 评阅和其他作者稿不进入实验边界。可以提供一般测试要求，例如“检查可空输入与显式拒绝”，不能给正确谓词、返回值或参考 patch。

固定稿选择在看消费表现前确定：A0 的最后一份已采用且当前的模型 raw，首稿和每次修订全部保留。A1/A2 从空稿独立生成，用于可靠性评价，不替换 A0；不得合并三稿优点。A0 若只有 partial 但可执行，仍可带准确范围进入辅助实验；若根本没有可采用 raw，相应 R1/R2 记缺稿，不能偷偷换成 BO/开发者稿。

历史 18+8 确定性场景全部保留，新增 trial 与独立评价分离。自然主面板六个 fact profile 固定在首次真实作者之前，输入从已有场景机械复制/组合，四问全部保留：

| ID | 情形 | 首要观察，具体期望仅放 evaluator |
|---|---|---|
| Q0 | root-default | 请求/授权/返回对象与完整分支说明 |
| Q1 | empty-version | 文件表示变化与授权对象不变的关系 |
| Q2 | root-fallback | 关联 root 缺失时的回退与查询解释 |
| Q3 | denied，固定非 owner | 显式拒绝、停止位置与剩余分支说明 |
| Q4 | anonymous-skip-checker | action/helper 局部激活与上游请求准入分开 |
| Q5 | no-external，固定非 owner | 正常完成、grant 和缺失事实的区别 |

Q4 是“在给定局部入口事实下分析分支”，不冒充真实匿名 HTTP 请求可通过 DRF。所有臂获得相同范围说明；Q3 的有限 false 和 Q5 的缺失是共同事实，不是 evaluator 给 R2 的特权信息。维持上游未知，不补 grant。

## 四、执行队列 BP0–BP21

### BP0 — 接管与登记

- [x] 读上述入口，核对 HEAD/origin、BO completed 和当前无重叠写入；只登记已有 `.tmp/`。
- [x] 新建 BP `status.json`、`manifest.json`、`attempts.json`、`accounting.json`。明确 planned criteria、observed results 分开，登记本节全部位置和共享预算。
- [x] 恢复时依据 ledger 和实际终态继续未完成位置，不能重新 prepare 覆盖已有输入或重发 active/unknown。

### BP1 — 固定能力域和独立评价

- [x] 从 BO 原四问与实际源码写 `evaluation/rubric.json`，固定 essential/optional 与能力域映射，避免把已有结论自动判为“已写进回答”。
- [x] 固定六个 fact profile、两次重复和三臂装配；记录 Q4 局部边界。expected 与模型输入分目录，common input 不含评分或目标返回。
- [x] 用匿名回答反例验证评分：返回对象正确但授权对象错、顺序遗漏、合理 unknown、过度弃答、协议失败分别得不同标签。

### BP2 — 外层激活的失败测试

- [x] 在 program-obligations 测试建立 outer=false/true/unknown × inner=true/false 的有限反例；仅有 inner when 不能被视为外层已连。
- [x] 验证 source 同名但不同调用点、缺 step、逆序依赖、stale revision、合法早停及后续 return 使用被跳过值的情况。
- [x] 运行新测试并保留预期失败；旧 executor 已能做到的行为是保持测试，不制造假失败。

### BP3 — 共享作者反馈

- [x] 在既有 coverage.call 和 projectProgramCallRelations 实现可选激活依赖；反馈提供 missing ID/source/current actual path，不填正确条件。
- [x] 将 inner/outer 条件、调用完成与取值责任分别显示到现有 authoring feedbackGroups；不新建全函数必填协议。
- [x] 用 BP2 全部正反例验证并检查旧声明兼容。确有更小方案时先记录本节设计修订再实现。

### BP4 — 实际工具广告与渐进修稿

- [x] 扩展 `program-call-loop.test.ts`，走账号 source→program→当前诊断→patch→trial→details→自然交付；直接检查 thread/start 广告字段和恢复 child。
- [x] 对 empty-version/deleted/filter/sort 只公开当前规则、操作支持与实际选择轨迹，作者从源码修值；不得内置 Paperless 正确过滤器。
- [x] 模型能看到本次修订确实修了哪些依赖、哪些原职责还在；正确局部稿保留，unknown 不堵住不依赖它的分析。

### BP5 — 完整规则文档 renderer

- [x] 创建 program-rule-document 及红测试：when、guard、排序/NULLS、external、嵌套表达式、source(s)、gaps、未知操作全部可追踪，无当前结果 sentinel。
- [x] 实现上述纯接口；用 representedStepIds 与 raw 步骤集合、关键属性映射证明无静默遗漏。render 不调用模型、不调用 evaluator、不执行程序。
- [x] 原 raw 可取回；原稿中的错误也原样保留，不由 renderer 修正确条件。

### BP6 — rules/execute 的薄接线

实现细节（2026-10-17）：现有 compileExecutableContract 同时执行 resource/property；rules 使用同一 native host 的草稿分支，复用 createProgramDraft/patchProgramDraft、normalizeExecutableContract、现有 schema 与来源工具，只做结构诊断，不调用执行编译器。所有模型可见 rules 投影由 raw 白名单构造，避免先求值再删字段；维护仍可编辑同样 raw。此调整不改变三臂材料、预算或评价分母。

- [x] 在现有 consumer host 增加显式支持选择，默认不变；R1/R2 使用同一规则渲染、同一 source tools 与 answer contract。
- [x] fake-account 捕获所有首包/续作/final-child/details，证明 R1 不收到 outcome、events、current returned、trial 结果或历史结果引用；R2 得到当前计算。
- [x] 禁用 R1 的执行/修改能力时返回准确的能力说明，不能给模型虚假的工具失败；记录公开差异。普通入口可明确选择该支持方式。

### BP7 — 返回依据与回答忠实性

- [x] 检查当前消费投影是否能定位 returned 字段来自 literal、计算依赖还是 external assumption；只为实际缺口补一个纯依赖投影，复用现有 event meaningOrigin。
- [x] 测试对象返回字段是计算值、框架描述是 authored literal、missing completion 影响相关结论。不要给所有 literal 加一层无意义“已证明”标签。
- [x] 终答保留原四问的要求和当前具体条件，模型可自行查规则/来源；不添加 evaluator 导出的答案提纲。

### BP8 — 离线接线和首个工程 epoch

- [x] 用 BO 原字节只读重放验证新诊断，不写回旧结果；匿名正反例走 rules/execute/native 普通路径。
- [x] 既有 ShareLink 开发者稿只作零模型接口兼容，不计自动作者。
- [x] 运行受影响测试、主/BP 类型及改动文档检查，提交工程 epoch。实际广告与传输隔离通过后开始真实作者。

### BP9 — A0 自动修订

- [x] 在新会话用 BO 固定原稿作为待修对象；只提供完整原 skill/四问、源码、公共事实、通用反馈与自己的 raw。
- [x] 当前作者在原总预算内读取、patch/trial并自然交付。立即归档首稿/每次修订/最终 raw；独立评价 18+8 的值、局部轨迹、上游条件和源码忠实性。首稿49步、最终52步均为18/18、7/8；预登记扰动6/7。匿名outer和version键缺失未修复。
- [x] 发现共享问题当场修复再继续相关工作。原件和原首分保留；开发者不得直接改 raw 代替模型。执行原件未改，字段名评价映射和评阅分歧独立留存。

### BP10 — A1/A2 从空稿确认

- [x] 同一实现与公共输入，从两个干净会话独立编写；不见 A0 或彼此答案。均有同样有限 trial 和修订机会。
- [x] 分别报告首稿、预算内最终稿和 18+8；不从三稿挑最好者进入面板。两份未完整也继续已固定 A0 的可解释辅助评价。A1首稿字段0/33，最终18/18、7/8、6/7；A2首稿0/33，最终字段17/18、5/8、5/7，局部轨迹18/18、7/8、6/7。见author-summary.json；原稿/自然答评分分离。
- [x] 若共享修复发生在 A1 后，明确 epoch，不把不同实现当重复稳定性；用全局具名修复额度一次确认受影响职责，不无穷重写。三作者均14eea13f；恢复时客户端适配b33adeb4另记，未重写作者稿。

### BP11 — 固定稿与普通使用

- [x] 固定 A0 最后当前采用 raw，生成相应规则文档；同 raw 贯穿主面板，不因某输入表现坏改稿。
- [x] 使用现有 run.ps1/check/inspect 跑默认、空版本、拒绝、匿名、缺完成；显示算了什么、跳过什么、所依赖条件及来源。五组入口和inspect通过，见BP verification/ordinary-entrypoints.json。
- [x] 搬移输入/程序/源码后做一次 fresh/previous 等价与失效检查。输出进入 BP/现有示例说明，保留 BL/BO 原命令及默认；不创建 HTML。五组等价、源码反转撤回旧返回，原源码未改。

### BP12 — 先完成一个三臂块

- [x] Q0 第一次重复按 R0→R1→R2 串行完成处置。原R0中断未交付，具名补跑另列；R1/R2交付。实际发送记录证明共同事实、规则相同、执行信息仅在R2。完整三臂首件交付目标未达，不替换原行。
- [x] 逐题和事实级独立评阅并主裁定，实际使用另行核验。R1为F/P/F/P，R2为F/F/F/P；R2补足outer None和分散陈述的变化条件，E2仍遗漏；跨epoch的原R0不作因果配对。见bp12-reviews.json和q0-actual-use-review.json。
- [x] 客户端升级已按具名修复和新epoch处理；首块无新增生产共享bug，答案遗漏保留，不补提示。

### BP13 — 完成固定质量面板

2026-10-17当前：repeat0共18首位置已处置并评阅，17份交付、原Q0-R0未交付保留；repeat1按反序串行进行。主裁定见evaluation/review-progress.json，首轮描述性表见repeat0-progress.json。R2对R1的对象关系/条件证据均六组持平；分支调用为2胜3平1负，变化一致性1胜5平。尚无重复优势结论，负向及原评阅分歧保留。研究验证器独立评阅后补全每包规则一致性、非空源码工具证据和完整配对身份，11测试63断言与BP类型通过；最新22份已关闭attempt实际发送记录一致。工程与初始证据至5b9e40a3尚未推送；首轮评阅不改变生产epoch或模型输入，不消费额外修复调用额度。

- [ ] 完成六 profile × 三臂 × 两重复，共 36 个首位置；BP12 已包含其中三个，不能另加。轮转顺序平衡：repeat0 的 Q0–Q5 使用 R0/R1/R2、R1/R2/R0、R2/R0/R1 循环，repeat1 反序。
- [ ] 每次首次错误立即诊断；共享原因修后再派相关位置。首件/具名修订/跨 epoch 配对分别保存；不继续已知坏协议，也不把失败单元移出分母。
- [ ] 不因 token 增加或单个质量负向取消预先固定的其他能力域；通道故障/缺稿则具名保留不可执行位置，不补行、不换输入。

### BP14 — 变化一致性与有限扰动

- [x] 复用同固定稿和既有 18+8；新增一组在首次作者前锁定的输入扰动：ID重命名、记录重排、无关记录、空/缺失区分、拒绝提前停止、缺完成不补真。固定稿结果18/18、7/8、6/7，失败保留。
- [ ] 机械执行不调用模型；自然一致性使用 BP13 已有 Q0/Q1/Q2/Q3/Q4/Q5 答案，核对相应关系的跨输入变化，不为每个指标重跑同问题。
- [x] 对反馈做有界故障注入：从程序副本移除一个 outer 依赖、改错 resource 参数、保留 stale 结果，验证能否暴露。变异测试只证明检测机制，不伪称用户任务质量收益。A0未声明outer，因此移除实验使用明确标注的开发者机制fixture；resource用A0副本，stale用搬移源码变化。见fault-injection.json。

### BP15 — 同任务源码变化维护对照

- [ ] 在自己的源码副本上使用既有 views.py 权限条件反转，原源码保持。旧执行结果先失效。
- [ ] 两个真实维护用途 S-R1/S-R2：均获得同一旧 raw/规则和新源码；前者可修改同样 raw 但看不到宿主 trial/执行结果，后者使用现有 patch/trial。两者语义修改都来自模型，评价者离线执行最终原稿。
- [ ] rules 维护允许提交 raw 编辑及 raw/schema/source-structure-only 诊断；不能带任何 execution-derived 字段，也不能从自动 preview、patch 回执、details 或 final child 取到执行结果。将维护模式加入 BP6 的 fake-account 全包泄漏测试；它的修改能力与 R2 相同，差别仅为是否提供有限执行支持。
- [ ] 同样事实、模型、预算、自然任务和修订机会，保留双方首稿、最终稿、三组局部结果及全文说明。不能只给 R2 旧材料、不给 R1，或把人工作者分钟伪造出来。

### BP16 — 第二结构的有限自动采用

- [ ] 固定已暴露 ShareLink 原输入/源码；BP manifest 在首次作者前登记此辅助组。先验证 shared implementation 无任务名成功分支。
- [ ] T-A0 从空稿自动写一个同类授权对象程序，不见 developer-assisted/sharelink-bound.json 或预期 grant；共同有限运行事实对所有臂一致。只读模拟，不创建真实分享。
- [ ] 如有实际可采用 raw，即使部分，也完成一个 ShareLink R0/R1/R2 三臂块；缺稿则三个相关消费位置具名处置，不用开发者稿补齐。此组仅检验第二任务结构，不称跨仓库泛化。

### BP17 — 盲化评阅和可解释归因

- [ ] 在不标臂名的回答副本上逐项评阅，给原答段落/源码依据；保留独立 reviewer 与主裁定不一致处。语义评分不能只搜索关键词。
- [ ] 输出 R1−R0、R2−R1、R2−R0 的能力域矩阵；首答/最终、当前固定稿/独立作者、主组六 profile/ShareLink辅助组分开。
- [ ] 单独审查所有错误肯定、泛泛 unknown 与好结果：正向项也必须有原文支持，不能将源码里存在的分支当成回答已经覆盖。

### BP18 — 普通工程交付

- [ ] 现有 README 展示如何运行 BP raw、看逐步输出、切换 rules/execute 和处理来源变化；示例显式给出该稿范围及剩余缺口。
- [ ] 公共路径不依赖 BP oracle/成功数量/实验身份。研究脚本保留 status/offline/verify/summarize，默认不发模型。
- [ ] 输出用户能读的质量优劣表：哪种错误减少、哪种仍存在、哪些好结果来自当前规则而非实际计算。

### BP19 — 联合验证

- [ ] 每个工程修复先失败测试再实现，阶段合并后做一次受影响联合测试、主/BP 类型检查；最终代码未变不重复全历史审计。
- [ ] 零模型 replay 复算当前分母、原件指针、实际工具采用和分层评分。新 evidence 不写回旧目录。
- [ ] 文档单测和本轮修改文件链接/锚点检查；既存全 src 104 失败/历史断链按原记录保留，不称全仓全绿。

### BP20 — 研究总结与同步

- [ ] 更新 current-status、spec §14.55、plan、研究 §1/§7.77/§11、usage/developer-guide/示例；写明每个能力域的支持、取舍、负向或未决。
- [ ] 工程、当前自动稿、重复自动编写、同规则执行增益、第二结构、维护分别验收；全局研究目标不由“有限队列完成”自动设置为 true。
- [ ] 所有已知费用/缓存/耗时保留账本，但用户主要结论先讲质量；未知 USD/真人时间不填零。

### BP21 — 发布和终止

- [ ] 只提交归属本轮的实现/测试/紧凑原件/文档，核对 origin 与 HEAD 同 SHA，保留旧 `.tmp/` 和其他材料。
- [ ] 本地 handoff/communication/conversation_log 更新当前入口和下一责任。给出一条可运行命令、当前实际结果、可信局部优势与剩余问题。
- [ ] 关闭有限队列，不自行创建 BQ、不再追加“最后一组”以追正向；存在 active/unknown 必须保留生命周期状态，不伪装已关闭。

## 五、真实位置、恢复与现场修复

2026-10-18恢复细化：Q2-R0-1已交付；Q2-R2-1以已知failed/quota拒绝关闭，未交付，所有运行宿主已退出。用户明确通知额度重置并要求继续。研究驱动增加本轮具名quota恢复记录，仅解除记录中精确position/attempt/session且已知终态、本地关闭的历史额度阻断，原ledger、答案及费用不改；新额度拒绝仍立即阻断，active/未隔离unknown仍禁止派发。先红绿测试，再继续余下九个主面板首位置；失败原件留在36分母，不为改善分数重抽。客户端路径变化但版本仍为已核验0.163.0-alpha.10.2，无生产epoch变化。

2026-10-17恢复工作计划：本机CLI从已验证版本升级为0.163.0-alpha.10.2，只读核查在推理前被版本边界拒绝，旧版本不可用。先按已有流程核验本地experimental schema、红绿测试后仅登记精确版本，再只读核对Q0旧终态。原未知/未交付结果不替换；旧epoch与新epoch不计同条件因果配对。后续独立位置可在显式隔离记录后继续，任何跨epoch数据必须在比较矩阵标为不可配对。A2原稿离线与盲评继续，固定A0不变。

恢复实况：b33adeb4已登记精确客户端版本；只读thread/read确认Q0原turn为interrupted且无答案。原completion-unknown、部分费用和未交付行保留。具名cli-recovery已交付，使用1/6修复额度，另轨评阅，不替换首件。A2离线和独立评阅已完成；Q0-R1-0正在运行。最终verify须对完整归档调用既有inspect，对persistence=partial核验原lifecycle摘要及相同thread/turn的只读终态证据，分列数量，不把缺run.json包装成完整归档。此项仅修研究验证器，不改变生产epoch、模型输入或评分。

- 正常位置最多 **45**：A0/A1/A2 三作者；Q0–Q5×R0/R1/R2×repeat0/1 共36；S-R1/S-R2 两维护；T-A0 与 ShareLink 三臂共4。每个用途和原件独立命名，普通离线检查不算模型位置。
- 作者从源码学习后的普通消费者属于“使用模型作者产物”的评价；作者准备和所有失败保留。A0 修稿/A1/A2 从零不混为同起点重复。
- 每位置继承 BO 实际上限：64工具单位、2,700,000ms、786,432显示字节、33,554,432读取字节。作者/维护至多两次已知终态续作，所有续作和无工具 final 共享原预算；不是每次续作重置额度。三臂相同预算。
- 每个表现不佳位置当场归因：输入事实、来源理解、程序表达、规则/执行通道、模型说明、传输、评价器。原答不可覆盖。共享缺陷用红测修复后再运行相关新位置；模型源码误读的修稿只能用当前源码及自己的机械反馈，不引用 evaluator 期望。
- 全轮额外最多 **6 个真实修复确认位置**，含需要同 epoch 配对的对侧。一个新 bug 只能消费具名额度，不改名绕过；同因两次无新增证据停止该责任重抽。首轮 panel 仍保留原36分母；新 epoch 重复只单列，不拼接成一组更好结果。
- 额度/认证拒绝暂停真实通道；路由失败仅一次有据恢复。unknown/active 不重发、不转第三方；只读核查后确认本地已关闭且独立用途隔离，可以继续其他既定工作。通道不可用继续工程、离线与归纳，不等待凑时长。
- 不设“必须赢”的终止条件。质量优势按 §3.3 预定范围陈述；持平或负向也推进普通交付和机制解释。成本是次要观察，不因单个超额结果不断压缩上下文影响主要质量任务。

## 六、验收和执行命令

| 轴 | 目标 | 有效证据 |
|---|---|---|
| 通用工程 | outer激活、规则隔离、当前依据可用 | 匿名红绿、actual tool广告、fake-account整链及普通CLI |
| 固定自动稿 | 一个真实模型稿完整通过局部18+8 | raw/patch/trial原件，字段和轨迹分别评分，上游条件保留 |
| 作者可靠性 | 两个空稿重复的缺口减少 | A1/A2首稿与最终稿分列，未达到也完整报告 |
| 局部质量优势 | 至少一个预定能力域呈重复改善 | 三臂同条件、全部win/tie/loss、关键错误肯定及原答依据 |
| 维护与迁移 | 同一机制处理源码变化及第二结构 | 实际模型编辑、源码失效、ShareLink自动采用；开发者稿另轨 |
| 整题完整性 | 原四问逐项有据且互相一致 | 独立全文评阅，与程序轨迹评分并存 |

从仓库根执行定向起点，新增测试加入相关集合：

```powershell
bun test ./src/task-dsl/authorization/program-obligations.test.ts ./src/task-dsl/authorization/program-authoring-context.test.ts ./src/task-dsl/authorization/program-trial.test.ts ./src/task-dsl/authorization/program-consumption-context.test.ts ./src/task-dsl/authorization/program-delivery.test.ts ./src/task-dsl/authorization/resource-relations.test.ts ./src/benchmarks/authorization-dsl/program-call-loop.test.ts
bun run typecheck
python -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py
```

BP 研究驱动必须提供以下命令及独立 tsconfig，`run` 的 purpose/attemptId 必须显式，其他命令零模型：

```powershell
$bp = './results/skill-ir/skill-dsl-research/development/authorization-quality-evidence-v1'
bun "$bp/study.ts" prepare
bun "$bp/study.ts" status
bun "$bp/study.ts" preflight
bun "$bp/study.ts" run A0 first
bun "$bp/study.ts" freeze A0 first
bun "$bp/study.ts" offline
bun "$bp/study.ts" verify
bun "$bp/study.ts" summarize
bun test "$bp/study.test.ts"
bun x tsc --noEmit -p "$bp/tsconfig.json"
```

freeze 参数指已存在且已关闭的实际 A0 attempt；若发生具名修复，应显式改用该 attempt，不让命令静默挑最好分。所有新文件位置在 BP0 登记；研究约束若因实际代码矛盾需调整，先记录理由/受影响分母，再继续，不以扩大语言支持替代真实采用。
