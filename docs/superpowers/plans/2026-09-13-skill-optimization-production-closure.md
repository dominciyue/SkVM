# 单次 trace 驱动的 skill 优化生产链：持续开发任务书

> **For agentic workers:** 使用 superpowers:executing-plans 连续推进；实现遵循 TDD，步骤以复选框跟踪。主代理负责设计、代码与最终验证，子代理按有效 AGENTS 仅做窄范围只读探索。常规检查点不等待确认。

**Goal:** 把已有优化组件接成可实际使用的生产链：用户选择 skill、说明任务并正常运行一次，系统自动捕获和关联本次真实 trace 与必要资源，选择并实施有依据的程序复用、程序生成或文档改进，验证受影响步骤，处理失败，导出可由普通 agent 使用的新 skill 包。手工日志输入保留为高级兼容方式，不是默认用户职责。

**Architecture:** 延续 JIT-optimize 的 Evidence、workspace、optimizer、loop、proposal 和通用 package exporter；将现有 implementation selection、program validation、action resolution 接入真实选轮与导出路径。程序只接管可参数化的机械部分，其余职责继续交给 agent；API/Env 作为可选领域组件，不能成为通用输入合同。

**Tech Stack:** TypeScript/Bun、现有 Pi/headless-agent/provider、proposal storage、已有领域 checker；复用原 skill 所需的 Python/Node 等运行时。只在现有模块不能清晰承担职责时增加小模块。

**状态：** revision 3，2026-09-14 运行中审查修订。H0–H12 已完成，R1 active；机器恢复入口为 `results/skill-ir/skill-optimization-production-closure-20260913/status.json`，实际进度以该文件为准。本次只补充现有 R 队列的实现问题与验收，不重开阶段、不改历史尝试。G0–G14 历史效果维持 mixed。

**队列：** 保留 H0–H14 与必须执行的 R1–R7。当前从 R1 接续；总体顺序 H12 → R1–R7 → H13 → 适用 Y1–Y2 → H14，不回到 H0 重跑。revision 3 不新增大队列，先解决验证语义、输入来源和修复失效问题，再做原定使用与效果检查；约 6–10 小时只是 revision 2 的工程估计，不以等待、重复测试、审计或无限补样凑时长。

## 1. 本轮方向与适用范围

- 北向目标不变：把 skill 中可确定执行的部分移出 agent 的重复工作，通过优化后的 skill 包使用，并测量效果。本轮补生产线，不重建分类学、研究冻结链或展示产品。
- 初步适用范围是“包含可参数化机械步骤，或存在可改善信息组织的 agent skill”。这是工程范围；不声称任意 skill 均有明显收益，也不声称已经证明完整一类的所有成员。
- 共性体现在优化过程：发现证据、区分条件、选择实现、运行检查、处理失败、打包。不同 skill 可以产出不同程序，不能要求大家共用同一个 helper 或 JSON/OpenAPI 输入。
- 输入基于至少一次真实运行。默认由系统控制的运行入口自动记录本次 run、skill、任务及必要资源，不让普通用户找日志、选 locator、加工 trace 或提供评分协议。谁运行的真实记录都可通过明确适配接口兼容接入；不能因此声称可以读取所有外部 agent 的私有会话。一次成功运行也能优化，不要求重复次数、失败分数或最大热点。
- 模型负责优化，并可在工作区创建可执行程序。所有有依据的机会都可处理；不为了代码行数强制生成程序，不把观察到的答案变成常量。
- 本轮必须实际验证程序路线，不能再用“生成程序或改文档二选一”让纯 SKILL.md 修改替代程序生产链。若某 skill 已有等价程序就复用；新程序目标应来自另一个确有机械缺口的动作。
- 原 skill 的任务目的、关键规则、未接管职责保留，外观可以重组。一次任务的路径、联网权限、输出 ABI、示例值不能无条件变成所有未来任务的规则。
- 合法空对象、空集合、非字符串按对应任务语义处理；缺少某种可选结构不拒绝整个 skill。真正缺少某动作必需输入则只影响该动作，不能以放宽检查制造成功。
- 调研服务代码：优先已有 30 个阅读条目（其中 10 个深读），补充阅读围绕已命名的工程问题；不把阅读数、包数、单测数当作泛化或收益证明。

## 2. 启动基线与本轮真正要补的缺口

本节表格记录 revision 1 启动时基线 `d4eae119fc07276f5d427df2c67200143cabbc17`，不是当前未完成清单。revision 2 修订时已到 `a2cd41a`，H5–H7 已解决接线、局部修复和包状态，H8/H9 已有生成/复用程序实证。执行时读取最新 HEAD，不重置回任何基线提交。

| 现有事实 | 本轮处理 |
| --- | --- |
| 30 个 skill 阅读条目，10 个属于深读；8 项积压中 7 项有实现记录 | 使用原文和实际调用链区分组件完成与流程完成，不重复广读任务 |
| 5 次 optimizer 运行覆盖 4 个 skill；4 个包身份实际均只改 SKILL.md | 交付真实生成程序与复用程序的生产流程证据 |
| `validateOptimizationProgram`、`resolveActionValidation` 已实现和导出，但正常 loop/CLI 未调用 | 在真实优化轮次内接通验证、反馈、snapshot 与导出 |
| `resolveActionValidation` 传播 rejected，但不传播 not-run；下游自身 passed 可能被 retained | 传播待验证状态；不把未知改为失败，也不把依赖未知提升为通过 |
| package manifest 固定 `behaviorStatus=not-run` | 保存实际验证范围与结果；程序通过与整个任务通过分开 |
| I18n 新包将一次任务的禁联网/安装等条件写为通用规则 | 改进优化器对规则来源与适用范围的处理，不手改旧成品掩盖问题 |
| 208 条 acquisition missing-resource 诊断混入命令、占位符、JSON pointer 和示例 | 仅在实际影响资源发现时修共享分类；不将它们全部视为真实缺依赖 |
| I18n 输入 token 下降但其他指标上升；Experimental 变化输入不稳定；Env 仅闭包通过 | 保留历史 mixed；新效果只由新的可比运行得出 |

结果参考：`results/skill-ir/general-skill-optimization-20260913/` 下的 `corpus-review.json`、`implementation-backlog.json`、`final-report.json`。历史报告和包原件不改。

## 3. 文件职责与实现顺序

| 文件 | 本轮职责 |
| --- | --- |
| `src/jit-optimize/types.ts` | 向后兼容的条件来源、验证计划/结果和轮次字段 |
| `src/jit-optimize/evidence.ts`、`trace-adapters.ts`、`workspace.ts` | 可见任务上下文、资源与未知信息；保留按需读取 |
| `src/jit-optimize/optimizer.ts` | 动作实施、参数化程序、条件范围及有限修复反馈 |
| `src/jit-optimize/action-plan.ts`、`implementations.ts` | 动作与实现连接；路径/能力选择，不按 skill 名称分支 |
| `src/jit-optimize/package-validation.ts` | 原有程序运行与动作状态解析，补依赖传播 |
| 新增 `src/jit-optimize/validation-lifecycle.ts` | 单轮验证、一次反馈修复与待持久化结果的窄编排；不创建第二个优化 loop |
| `src/jit-optimize/loop.ts`、`index.ts` | 调用生命周期；覆盖 execution-log 的实际分支与正常选轮 |
| `src/jit-optimize/package.ts`、`src/proposals/storage.ts` | 导出实际最终 snapshot，并携带适用范围/真实验证；兼容旧 proposal |
| `src/cli/jit-optimize.ts` | 复用现有入口与 package-out，说明可用状态与具体缺项 |
| `src/jit-optimize/general-skill-development.ts`、`consumption.ts`、`effect.ts` | 自然使用、残余任务与按字段效果，只补实际缺口 |
| `scripts/skill-ir/skill-family-acquire.ts` | 有需求才处理 closure 诊断，不能变成主开发前置工程 |
| `docs/usage.md`、`docs/skill-ir/optimization-and-artifacts.md` | 已实现接口与用户使用说明，不新增一轮组件 Markdown |

新增测试限定为 `test/jit-optimize/validation-lifecycle.test.ts`、`production-closure.test.ts` 与必要的 `constraint-scope.test.ts`；其余扩展现有相同职责测试。H0 若发现已有同职责模块，原位扩展并更新此表。

### 状态合同：足够清楚，不建大型状态框架

下面是新增内部记录的目标形状，H3 与现有类型做适配，旧 proposal 没有字段时为未评估；它不是用户必须填写的格式：

```ts
export interface OptimizationActionAssessment {
  actionId: string
  applicability: "applicable" | "not-applicable" | "unknown"
  execution: "not-run" | "passed" | "failed" | "blocked"
  checks: "not-run" | "passed" | "failed" | "partial"
  reasonCode?: "missing-input" | "missing-runtime" | "dependency-pending"
    | "dependency-failed" | "unsupported" | "program-error"
    | "result-mismatch" | "unsafe-side-effect"
  evidencePaths: string[]
}
```

程序退出码正常只影响 execution；没有输出语义检查不能把 checks 写成 passed。包文件闭包、局部程序检查、自然任务质量和效果分别记录。未验证候选可保存为 draft，但不被推荐为已验证优化；无安全可用改动就保留原流程或 no-change。

条件来源使用轻量可选字段：`scope = skill | task | environment | unknown`，携带来源定位和适用描述。它不需要通用逻辑求解器：可检测条件由程序处理，不可检测条件由入口文档交代并保留 agent 判断。

## 4. 连续执行、失败和预算规则

- 直接在 `skill-ir-aot` 工作，只推用户 `origin`。不新建开发分支，不推 `upstream`；原有 tracked 修改、`docs/skill-ir/1.md`、历史 raw/cache/临时目录不夹带或清理。
- 开始 H0 才创建 `results/skill-ir/skill-optimization-production-closure-20260913/status.json`。阶段状态用 pending/active/completed/blocked/not-applicable，记录下一动作、当前命令、失败原因、变更归属、成本和恢复路径；可更新状态，不新建 write-once 协议。
- 常规开发连续推进，不在每阶段请求确认。小的实现调整直接更新任务书并继续；大方向改变才说明影响。用户询问进展不等于叫停，明确停止指令才停止。
- 网络、认证 GitHub CLI、远端 API 和有用途的付费模型调用按既有授权使用，无用户金额上限。分别记来源获取、优化/修复、自然消费、评价、开发代理成本；计费未知不记零。
- 不自动重放 trace 中的发信、部署、删除或其他真实业务副作用。验证用可重建任务目录及测试资源；原 skill 和输入保留。检查仅针对本次代码的具体风险，不加外部审计、签名层或重复授权。
- 正常动作一次生成、一次确定性验证，有明确错误时最多一次自动局部修复。持续工程修复可因新的根因继续，但必须改共享实现、说明新证据；不能将模型多次抽样伪装成一次成功。
- 环境失败不计程序语义失败。可根据报错安装必要依赖或调整运行时一次，再继续；同错误无新信息不无限尝试。外部来源失败用缓存或已知仓库直接入口，避免盲等 GitHub search 配额。
- 一个来源、动作或案例失败不停止独立任务。必要资源缺失时保留具体未完成项；不将所有阶段填终态等同工程成功。
- H0/H1 的现场与补读按约 60–90 分钟控制；尽早进入 H3–H7 的接线和 H8 的真实程序链。时间提示用于防止分析挤占开发，不为了到点放弃有明确修复路径的主线。
- 不启动 Q1、held-out、prospective，不改 readiness 或历史证据。开发修订不要求每次另立研究 identity；尝试按本轮目录分开保存。
- 最后保留约 45–60 分钟用于一次相关回归、文档和提交；未完成时如实交付，不进行多轮 clean/摘要归档审计。revision 2 的 R1–R7 属于主线，不可只完成 revision 1 就关闭目标。主线与适用 Y 完成即停止，不无限续作凑时长。

## H0 — 现场、调用链与最小基线

**文件：** current-status、本任务书、loop/index/CLI；本轮 status.json。

- [x] 检查分支、最近提交和 dirty 归属；读当前相关 spec 14.31、架构和将改动模块，不重查全部历史。
- [x] 从真实 log 分支定位 runOptimizer、snapshot、history、bestRound 和 package-out。记录验证应接入的实际位置，不能只接 real-task 分支。
- [x] 运行下列基线一次，将既有失败与本轮新故障分开；创建恢复状态，H1 标 active。

```powershell
bun test ./test/jit-optimize/package-validation.test.ts ./test/jit-optimize/package.test.ts ./test/cli/jit-optimize.test.ts
```

**验收：** 能指出现有入口到最终包的真实调用链与缺口；不以全仓测试全绿为启动条件。

## H1 — 把已有调研变成具体工程用例

**材料：** 上轮 corpus/backlog、已有 development source 与真实 trace。只创建本轮 `case-notes.json`，不新增大篇研究报告。

- [x] 核对已有 30 条阅读记录中的结构与原文，优先选择：I18n 的 locale key/占位符比较等确定步骤、Law 的现成转换程序、Experimental 的程序加 references；选择依据为机械缺口和真实资源，不为预定正例。
- [x] 每项写清 source 路径、真实 trace 定位、机械职责、判断职责、适用输入、独立质量依据、当前共享缺口、下一条代码测试。无需重复读完整 30 份。
- [x] 优先为“已有脚本复用”“确有新程序价值”“任务条件改变”“多资源路径”建立少量诊断案例；一个 skill 可以覆盖多个问题。
- [x] 若既有材料不足，从已知公开仓库补取对应正文/依赖或运行原 skill 获取一条真实 trace。现有材料已足够，因此本项不适用且未新增来源、未读取 reserve。
- [x] 失败/no-change 仍保留。I18n 是有公共合同和独立 evaluator 的非 API 新程序候选；Law/Experimental/Env 的历史 no-change、unstable 或 unassessed 状态不改写。

**验收：** 调研能直接指向 H2–H10 的代码和行为；不是“读了多少篇”完成。

## H2 — 区分 skill 规则、任务条件与环境事实

**修改：** types、workspace、optimizer；测试 workspace/optimizer-prompt，新增 constraint-scope 行为测试。

- [x] 写失败测试：某 trace 禁联网、路径固定、输出字段限定，但原 skill 没有这些永久规则；新动作只应附带本任务条件，不能缩减 skill 的一般用途。
- [x] 保留相反用例：原 skill 明确的永久限制不能因一次 trace 未触发而删除；workspace 的“未观察到不等于可删除”提示保留，它本身不是条件污染。
- [x] 为有依据的条件附来源与范围，未知范围不猜。兼容原 action/旧 proposal，无关字段缺失不拒绝整个 skill。
- [x] 在模型工作区明确固定规则、当前任务值、可变参数与环境事实；按需读相关原文，避免将整个历史和全部资源重复注入。
- [x] 写入输出入口时，有合同则遵合同，无合同按原 skill 流程；不能凭空要求每个用户提供闭合 JSON ABI 或额外确认。

```powershell
bun test ./test/jit-optimize/constraint-scope.test.ts ./test/jit-optimize/workspace.test.ts ./test/jit-optimize/optimizer-prompt.test.ts
```

**验收：** 一次任务的条件不会被默认提升为永久规则；测试验证结构化来源/转换行为，不能只断言提示词出现几个词。

## H3 — 修复局部状态与依赖传播

**修改：** package-validation、action-plan、必要 types；不改变历史报告。

- [x] 在现有 action 测试 helper 下加入以下红例；当前实现会错误保留 B，应先确认失败。

```ts
test("pending dependency prevents downstream validation promotion", () => {
  const result = resolveActionValidation({
    actions: [action("A", ["scripts/a.mjs"]), action("B", ["docs/b.md"], ["A"])],
    observations: [
      { actionId: "A", status: "not-run", diagnostics: ["missing input"] },
      { actionId: "B", status: "passed", diagnostics: [] },
    ],
  })
  expect(result.retainedActionIds).toEqual([])
  expect(result.unvalidatedActionIds).toEqual(["A", "B"])
  expect(result.rejected).toEqual([])
})
```

- [x] 实现 A→B→C 的 pending 传递；未知不变失败。独立已通过动作仍保留，真实失败继续按依赖闭包传播。
- [x] 同文件动作不能假装可独立回退。未验证共享改动使相关组未验证，失败共享改动需整组修复或恢复；复用现有分组，不做危险的行级逆补丁。
- [x] 把 missing-input/runtime、not-applicable、program-error、result-mismatch、not-run 分开；用本节轻量状态映射保持旧结果可读。
- [x] 检查“无适用检查”“仅 help 成功”“执行零项”都不能提升为行为通过；合法空数据按原任务规则独立测试。

```powershell
bun test ./test/jit-optimize/package-validation.test.ts ./test/jit-optimize/action-plan.test.ts
```

**验收：** 局部失败和未知传播准确，不扩大为整 skill 拒绝。

## H4 — 自动形成可执行的验证计划

**修改：** optimizer/types/implementations/package-validation；新增 validation-lifecycle 的计划转换部分。

- [x] 先写测试：选中程序的 entry、参数、工作目录和预期输出从动作与真实资源解析，改变输入路径后计划跟随变化；不要求用户人工编写内部验证 JSON。
- [x] 模型在已有 workspace 提交程序与可执行验证建议；框架校验路径、真实文件和必要参数，转换成已有 `ProgramValidationCase`，保留预期依据来源。
- [x] 复用原测试、真实输入输出、格式工具或明确任务规则进行检查。生成器自写的断言只能算自检，不能作为唯一任务正确性依据；没有外部依据时如实保留未评估。
- [x] 已有程序不强迫支持统一 `--help` 或统一 stdout JSON；记录其真实接口。新程序应有简洁参数说明、输出路径和成功/不适用/错误语义。
- [x] 不臆造输入文件、密钥或环境；缺某动作资源只标记该动作。非字符串和空对象是否有效由所选程序/任务决定。
- [x] 记录实际运行时与依赖，避免将 Bun 的 process.execPath 无条件称为 Node；仅在实际路径有误时修解析，不新建运行时探测平台。

```powershell
bun test ./test/jit-optimize/validation-lifecycle.test.ts ./test/jit-optimize/implementations.test.ts ./test/jit-optimize/package-validation.test.ts
```

**验收：** 程序的验证计划可从正常优化过程产生，独立测试代码或研究 runner 不再承担人工接线。

## H5 — 将验证接入真实优化循环

**修改：** validation-lifecycle、loop/index/types；测试新增 production-closure 与已有 loop。

- [x] 写集成红例：mock 仅替代付费 optimizer 响应，使用真实临时 skill、生成的 `.mjs`、实际程序运行、真实 proposal 与 package；一次 CLI/log 调用后，验证报告记录实际执行和产物检查。
- [x] 在实际修改产生后、该轮成为推荐 snapshot 前调用 implementation selection、program validator 和 action resolver；覆盖 log 的提前返回路径。
- [x] 旧 log 导入不重跑源 trace 的原任务；局部程序验证是显式的新执行，有独立记录，不能算成原 trace 的一部分。
- [x] no-change 不生成空包；仅文档动作可以正常处理，不能为它调用不存在的脚本。没有足够验证资源可导出明确 draft，不冒充已验证优化。
- [x] history/result 持久化实际验证。按 diff 选轮不叫效果最佳；有证据失败的轮次不能仅因最新或改动更多而成为推荐包。

```powershell
bun test ./test/jit-optimize/production-closure.test.ts ./test/jit-optimize/validation-lifecycle.test.ts ./test/jit-optimize/loop.test.ts ./test/jit-optimize/pick-best-round.test.ts ./test/cli/jit-optimize.test.ts
```

**验收：** 测试从普通入口进入并证明实际 verifier 调用；仅新增 export 或孤立验证单测不算完成。

## H6 — 一次局部修复、失败回退与正确 snapshot

**修改：** validation-lifecycle、optimizer、loop、workspace/storage 的必要接口。

- [x] 写红例：两个独立动作，程序 A 输出不符、B 通过；一次反馈只给相关错误与文件，修复后重新执行 A 及受影响检查，最终包来自修复后的实际文件。
- [x] 写第二红例：修复仍失败；保留原始与修复尝试，恢复失败组，保留真正独立成功组。若共改 SKILL.md 无法安全拆分，整组恢复，不假装成功动作仍独立。
- [x] 使用已有 runOptimizer 及记录路径承载修复，不开第二套循环；自动修复默认一次，费用和调用单独计数。
- [x] 修复不能修改独立评价期望以迎合产物；若发现 checker 本身有错，作为工程缺陷另行修复并注明，不能混作优化成功。
- [x] 变更后使旧验证失效，只复验受影响部分；导出不得引用旧 snapshot 的 passed。完全回退后恢复 no-change，不输出空的“优化成功”。

```powershell
bun test ./test/jit-optimize/validation-lifecycle.test.ts ./test/jit-optimize/production-closure.test.ts ./test/jit-optimize/workspace.test.ts ./test/proposals/storage.test.ts
```

**验收：** 故障注入驱动真实修复/回退，最终文件、动作状态和验证描述一致。

## H7 — 一个入口拿到状态明确的新包

**修改：** package、CLI、types、storage；更新现有 usage/component 段。

- [x] 红例覆盖旧 proposal 无验证字段、已通过局部程序、未运行、部分失败、no-change；旧包保持可读，旧 manifest 不回写。
- [x] 导出绑定最终 snapshot 的已有验证结果，避免再次执行等价检查。必要时升级新 manifest schema，向后兼容读取，不添加新签名/冻结协议。
- [x] CLI 展示实际修改类型、包路径、适用条件、已验证范围、残余职责和具体缺项；“program checks passed”不得写成整个 skill 正确。
- [x] 保留原 `--task-source=log`、`--logs`、`--log-records`、`--package-out`；只有无法从资源得到的必要参数才增加可选配置，不引入领域必填合同。
- [x] 未验证候选与推荐包区分；支持合理 no-change，不覆盖原 skill，不自动 accept。文档不应强迫 agent 每次读取完整 manifest、源码与原包。

```powershell
bun test ./test/jit-optimize/package.test.ts ./test/cli/jit-optimize.test.ts ./test/jit-optimize/production-closure.test.ts
```

**验收：** 普通命令直接得到真实新包和准确状态，无研究脚本手工补包环节。

## H8 — 完成第一个真实非 API 新程序链

**材料：** H1 已有机械缺口案例；优先 I18n 的 key/占位符比较或其他有明确输入输出规则的非 API 步骤。

- [x] 先确定原 skill 规则、真实输入、已完成的一次 trace 与评价依据，记录哪些信息进入优化器。若需要新 trace，先正常运行原 skill，不人为写“理想 trace”。
- [x] 从普通 CLI 让优化模型生成参数化程序并调用 H4–H7；主开发者不手写最终 helper/映射后冒充优化器输出。
- [x] 用原输入检查程序，再用重命名/内容变化的输入检查参数化；变化输入不先喂给优化器仍称单 trace。若因失败回灌，明确记录单 trace 初版与多证据修订版。
- [x] 让 agent 仅接收正常任务、资源和新包，实际调用新程序并完成剩余职责；检查来自 read/exec 与最终结果，不以口头声称调用为证。
- [x] 若生成失败或 no-change，定位是机会不足、证据缺失、提示偏置、接口错误还是实现问题。修共享代码后保留新尝试，不手工粉饰产物。

**验收：** 至少一个真实非 API 新程序由正常优化链产生、验证、打包并自然消费；改变输入后结果符合原规则。此项不能由 SKILL.md 修改、手写示范程序或 source 旧脚本自测替代。

**实际结果：** 第 8 次普通 CLI 优化生成 `scripts/check_json_locales.py`；修复通用 fixture 投影、workspace locator、外部 criterion 绑定与依赖文档状态后，未改动程序本身即通过 1 个原 trace 独立案例并导出 v2 `validated-recommendation`。未回灌的重命名/变化输入 4/4 通过，3/3 设计错误在预期层检出。普通 Pi agent 未获内部入口提示，实际 read/exec 程序并完成残余 `audit.json`；首份分析因未识别 `ok=true` 错判失败，保留原报告后由共享 analyzer 修复和同一原始事件确定性重分析为通过。完整尝试、费用未知和边界见 `results/skill-ir/skill-optimization-production-closure-20260913/h8/report.json`。

## H9 — 现成程序复用与另一种结构

**材料：** Law/Experimental 或 H1 对应多资源 skill；实现修改回到共享模块。

- [x] 从真实单 trace 识别现成程序的能力/参数，避免重复生成同类代码。自然调用依赖新包的清晰指引，不在外部任务提示中泄露入口。
- [x] 验证需要的 scripts/references/依赖能够随包工作，改变调用目录或输入路径不依赖研究结果路径。
- [x] 若现成程序已有良好指引且无改进空间，保留 no-change，并明确只是复用路径覆盖；不得把原技能本身的优秀表现算优化收益。
- [x] 检查原始规则、任务特例和残余判断；Experimental 的变更结果仍由独立规则检查，程序退出零不代表实验设计正确。

**验收：** 同一生产链支持不同资源结构的实际尝试，至少一条已有脚本动作完成真实执行与准确状态；是否有新增收益单列。

**实际结果：** 精确绑定 Law To Markdown development `line:3` 后确认源任务真实得分为 `0.7`、不是成功；外部 evaluator 要求整条法条作为五级标题，与源 skill “仅第 X 条为标题”的规则冲突，故不为追分改写程序。一次普通 CLI 优化选择已有 `scripts/law_to_markdown.py`，将 TXT 路径指引改为显式执行并把 PDF/DOCX 可选依赖改为按需导入；动作局部原输入 1/1 通过并导出 v2 包。首次包错误包含验证生成的 `__pycache__`，保留失败包后以红例修复共享 diff/export 缓存过滤及 Windows 路径归一化；修订包只含两项真实改动。未回灌的改名/变文/异 cwd 输入由独立规则 12/12 通过，普通 Pi agent 未获入口提示即实际 read/help/exec、复核两份产物并写残余审计，输入和包不变。该结果证明复用链和行为路由，不证明原 0.7 任务已修复或有配对质量/成本收益；完整证据见 `results/skill-ir/skill-optimization-production-closure-20260913/h9/report.json`。

## H10 — 变化条件、局部降级与资源诊断

**修改：** H2/H3/H7 对应共享模块；有实际影响才修改 acquisition 诊断。

- [x] 在一个已用 skill 上改变任务条件：原来的固定路径改为新目录，原来有显式合同改为无合同，或离线限制不存在；使用本地测试环境验证流程选择，无须为了证明允许联网发真实业务请求。
- [x] 合法空输入、缺可选字段、缺必需资源分别验证；只跳过不适用步骤或保留原 agent 路径，不吞掉程序错误。
- [x] 以 acquisition 已记录的命令、示例、JSON pointer 与真实本地路径做诊断测试；先定位 `skill-family-acquire.ts` 实际调用的解析器，再原位修复，历史扫描结果不改。
- [x] 部分自动化失败时，新包仍清楚告诉 agent 哪部分需要继续处理；不输出含断链调用的所谓 partial package。

```powershell
bun test ./test/jit-optimize/constraint-scope.test.ts ./test/jit-optimize/production-closure.test.ts ./test/jit-optimize/general-skill-development.test.ts
```

**验收：** 通用性通过变化条件和实际降级体现，不靠放宽语义检查或增加 skill 名称特判。

**实际结果：** 预登记的五项条件全部在修订核验器下通过：空 JSON/无合同与 Law 可选判定缺失继续成功；必需输入缺失及 DOCX 可选依赖缺失均在指定层非零退出且零产物；本地 helper 没有业务联网分支，因此“解除离线限制”如实记为不适用。首次外部核验器误读 H8 扁平摘要并错误枚举 H9 输出目录，失败报告保留后以新 identity 修订，两个选中包摘要前后一致。acquisition 的实际调用点确认在 `planPublicSkillResourceClosure`；六份历史 development 报告共 635 条 issue、580 条 missing-resource，只对其中 8 条可定位的整命令误分类建立修复依据。解析器现在从多 token 命令提取真实 Git-tree 文件、忽略 method+route 示例、保留外部/本机路径和单一缺失引用；历史报告不重写。完整报告见 `results/skill-ir/skill-optimization-production-closure-20260913/h10/report.json`。

## H11 — 改善实际使用开销

**修改：** optimizer/workspace、程序生成指引、consumption/effect；仅针对新的真实 trace 暴露问题。

- [x] 检查新链是否重复注入原文和新文、重复读取源码、反复找入口、输出过长或因缺摘要重做程序工作。
- [x] 在生成策略中改进按需引用、参数帮助、简洁结果和后续步骤交接；大产物写文件，stdout 保留结果摘要、路径与必要错误，不隐去诊断换低 token。
- [x] 保留有依据的小优化，不只看最大热点；但每次修改对应一个可解释的开销，不为文档越短越好而删规则。
- [x] 同任务/模型/环境做必要配对，使用现有统计口径，不把字符数代 token、不重复扣 cache、不把 agent runCount 当 API 请求数。
- [x] 在运行前登记目标指标（如减少反复生成脚本或重复工具步骤），运行后同时列全部已观测指标。质量下降不计优化收益；不能事后从众多指标挑一个下降就宣布总体成功。

```powershell
bun test ./test/jit-optimize/effect.test.ts ./test/jit-optimize/consumption.test.ts ./test/jit-optimize/optimizer-prompt.test.ts
```

**验收：** 至少一项共享使用问题进入生产策略并有行为证据；未测 USD、不稳定时延与 mixed 如实表达。

**实际结果：** 两份既有自然消费事件均在读取 `SKILL.md` 后枚举包，Law 还为已记录的常用途径执行完整 `--help`；没有重复文件读取或 helper 源码读取。生产提示现在要求常用途径就地给出可复制命令、必需/常用可选参数，以及简洁状态、输出路径、必要错误和 residual next step；`--help` 与源码诊断仍保留给非常用途径。首次普通 CLI 因 `skill-ir-general-skill-development/v1` 未被 trace adapter 识别而在模型前失败，原失败保留；TDD 修订以 gzip/raw 双摘要 fail closed 地接入该报告后，一次模型优化只改 Law `SKILL.md`。同任务/模型/Pi 配对均通过独立字符、层级、审核和残余审计检查；预登记 discovery `2→1`，完整 `--help` `1→0`，tool calls `11→9`，model responses `10→7`，tool output chars `8567→6496`，observed tokens `47487→30339`。package enumeration 仍为 `1→1`；时延单次 `48636→44728ms` 仅作噪声观察，实际 USD unknown。候选包因无独立 action-local variation 仍为 draft，只用于本阶段 development 行为配对。完整报告见 `results/skill-ir/skill-optimization-production-closure-20260913/h11/report.json`。

## H12 — 小规模过程复用检查

- [x] 从已有已读但未用于本轮代码修改的不同结构成员，或定向补充公开 development 成员，选择一个带明确结构问题的案例。
- [x] 不按名称增加分支，不预先给优化器答案程序，通过同一入口运行；记录原始结果、人工配置、额外上下文和是否需要修改核心。
- [x] 需要修复时只改共享机制，并回归受影响的前一案例；无需重跑所有付费配对。成员变化是 development 反馈，不标 prospective。
- [x] 汇总“代码复用”“程序生成/复用”“自然消费”“任务质量”“观察到的效果”五项，避免包闭包通过掩盖行为缺失。

**验收：** 有不同结构成员的真实复用边界与首跑记录；失败不能删除，无须用大规模采样证明才能交付工程。

**实际结果：** 使用已暴露 Env Manager development `line:3`，通过与 H8/H9 相同的普通 log optimizer 入口进行一次 `xty/gpt-5.6-sol` 尝试。源任务质量 3/3；优化器在读取实际 skill、trace 和环境约束后给出有依据的 no-change，未生成程序、提案包、自然消费或效果样本，也未修改核心代码。该负结果说明当前方法不会为不同结构强造程序，不构成优化收益；完整证据见 `results/skill-ir/skill-optimization-production-closure-20260913/h12/report.json`。运行消耗与开发代理分列，provider 实际 USD 因缺价格绑定保持 unknown。

## Revision 2/3 — 自动采集、固化语义与可用性深化（R1–R7）

### Revision 3 代码审查发现与优先级

本节基于 `84d0a4e` 及修订时工作树的只读检查，不替代执行线程的 R1 实现。已在临时目录真实运行 V1 反例；其余为带代码路径的待回归验证问题。补丁必须在现有 R 阶段落地，不需要新研究 identity 或整批历史审计。

| 项 | 实际问题与定位 | 纳入阶段与完成条件 |
| --- | --- | --- |
| V1 优先：来源引用冒充新输出验证 | `validation-lifecycle.ts` 的 `independentCriterionBindings`（约 277–294 行）只匹配旧 passed criterion，`deriveProgramValidationPlan`（约 512 行）即列 independent；`package-validation.ts` 的 `runValidation` 允许只检查 exit 0 | R3/R7：新输出必须执行与声称语义相应的断言。没有断言则只记执行/存在检查通过；空程序不能成为语义已验证推荐 |
| V2 优先：输入与 skill 文件同名覆盖 | `src/run/index.ts` 的 `prepareRunWorkspace` 先写 fixtures 后把 skill 资源复制进相同目录，初始 manifest 在两者复制之后生成 | R1：用户原输入、部署的 skill 资源、执行后产物来源分开；同名文件不静默覆盖。保护用户已有文件，不用清空 workdir 解决 |
| V3：修复观察复用过宽 | `runOptimizationValidationLifecycle`（约 558–585 行）按旧 retained action ID 复用 passed。`loop.ts` 虽有 allowedRepairPaths 检查，但未覆盖成功程序读取失败动作所改文件的隐式依赖 | R4：依据真实修改与已知程序依赖扩大受影响组；不能证明无影响时重验受影响程序或保持未验证，不能只认 action ID |
| V4：单个案例缺失阻止整个动作的案例执行 | `deriveProgramValidationPlan` 任一 diagnostic 即 unresolved，lifecycle（约 648 行）整动作跳过 | R3：不相依的 ready case 可继续，缺失必需 case 使对应范围保持 partial/unassessed，不能删掉缺失行提高通过率 |
| V5：固化选择与实际能力边界脱节 | `implementations.ts` 的 selected 只代表找到合法存在的程序，inputs/preconditions 原样复制，不代表全部声明参数已支持 | R4/R5：保持 selected 的选择语义；将实际验证参数范围与能力提示附到固化步骤，变化输入不适用时仍由 agent 承担残余职责 |
| V6：失败后的产物残留与半成品导出 | 验证使用独立 case 目录，但普通复用 workdir 只复制文件，旧输出可能仍在；package exporter 逐文件写入目标，失败后不保证不存在半成品 | R1/R5：失败恢复不读旧候选输出当输入；新包只有完整后才对外称可用，局部生成文件按本次所有权恢复/隔离 |

V1 的实际最小运行：`empty.mjs` 只有 `process.exit(0)`；一个 task-contract case 引用旧 `evidence:0#criteria/check-output`（passed=true），无任何输出断言或 expectedFiles。真实 lifecycle 返回：

```json
{"status":"passed","retained":["empty"],"independentCaseRuns":1,"programStatus":"passed","outputFiles":[]}
```

这证明通用验证存在误提升路径，不证明 H8/H9 的程序内容错误：它们另有变化输入和故障检出记录。保留原报告；新推荐使用修复后的验证语义，必要时仅重验相关局部程序，不重跑全部付费实验。引用旧 passed criterion 可以证明来源存在，不能证明新程序执行了该条件。

### 固化方法补充：以可调用步骤及其交接为单位

每个固化步骤应回答五件事：在什么输入/条件下适用、参数如何由当前任务得到、程序实际做什么、如何检查相应输出、未覆盖或失败后 agent 接着做什么。优先使用已有 action、程序参数和包指引表达，不新建通用 DSL、分类平台或强制要求用户填写合同。

参数可变、格式/运行时支持、输出语义与副作用是不同边界：扩展名正确或程序能启动，不等于支持任意数据。条件可低成本判断就由程序入口检查；不可确定就保留 agent 判断，不能把“不知道”伪装“不适用”。比较器按任务规则选择字节精确、文本表示或结构语义：例如 JSON 键顺序可忽略时才结构比较，数组顺序、类型、重复键等不得随意忽略。不能为通过而统一去空白/丢字段。

缺漏处理遵循局部性：缺使用量不挡优化；缺专业评分不挡有规则依据的机械改进；缺某必需输入不制造默认值；缺一个变化案例不抹掉已通过案例，也不将整个声明范围提升为通过。缺失范围、可用产物和下一动作一起保留，尽量不把恢复工作交给用户。

### 已有进展如何复用

H8 已有 I18n 生成程序，H9 已有 Law 脚本复用，H11 的一次 Law 同任务配对观察到 discovery 2→1、tool calls 11→9、observed tokens 47,487→30,339，质量检查均通过。它是局部 development 观察，USD unknown，不能作为稳定节省率。

追加任务不重做这些成功链，但也不能忽略过程摩擦：H8 第八次尝试才出现所需程序；普通 `skvm run` 当前仍要求 bench 形状 task.json；run session 与独立 conversation logger 缺少可靠的本次 skill/run 绑定；现有 task-contract 验证依赖已供应且 passed 的 criterion，普通用户通常没有这样的文件。主线需要解决自动采集、数据关联和可用验证依据，不再让用户承担工程接线。

### 默认用户流程与边界

1. 用户给 skill 路径、自然语言任务与工作目录，选择运行并优化。模型配置复用已有配置；确实缺少模型/凭据时只提示必要配置。
2. 原任务正常运行一次，框架在这次运行内记录实际 read/tool/result/usage 及终止状态，自动绑定 skill 与任务资源。捕获失败不应丢失原任务结果。
3. 完结后自动传入现有优化器，不要求用户提供 logs、locator、criteria、validation-manifest、内部 evidence id 或 task.json。
4. 框架验证能验证的部分，输出原任务成果、新包及适用说明；原 skill 保留。选择使用新包只改变后续显式调用路径，不悄悄覆盖原 skill。
5. 一次运行之后可凭本次 run 标识继续优化，不为恢复而重跑原任务。断线/进程中断只恢复已落盘阶段，不能重复发出已完成的业务动作。

这里“自动”指已支持、由项目接管的运行。外部 agent 已有日志只在具有明确接口和唯一关联时接入；不遍历全机聊天目录、不用最新时间戳猜任务、不把 stdout 摘要伪装成完整 trace。本轮先跑通默认 bare-agent 的 capture 路径；Pi 适配仅在已有事件接口足以复用时扩展，不以一次支持所有 agent 为前置条件。

### 新增实现位置

| 文件 | 职责 |
| --- | --- |
| `src/cli/run.ts`、`src/run/index.ts` | 自然任务输入；运行并优化的统一入口，旧 task.json 路径兼容 |
| `src/core/run-session.ts`、`run-record.ts` | 已有 run 标识与具体 skill、task、workspace、trace 关联 |
| `src/core/conversation-logger.ts`、`durable-runtime-trace.ts` | 复用本次实际事件记录与完结状态，避免全局 logger 串会话 |
| `src/adapters/bare-agent.ts`、必要的 `src/core/agent-loop.ts` | 默认 adapter 的 run-scoped capture；默认普通非优化调用保持兼容 |
| 新增 `src/run/optimization-session.ts` | 捕获完成后的自动交接及恢复索引；不再实现优化算法 |
| `src/jit-optimize/task-source.ts`、`trace-adapters.ts` | 消费明确 run 引用，不猜 logs/locator；未知字段保留 |
| `src/jit-optimize/validation-lifecycle.ts`、`optimizer.ts`、`types.ts` | 原技能规则、现成检查和缺评分时的验证路线；生成动作兑现 |
| `test/run/optimization-session.test.ts`、`test/cli/run-optimize.test.ts` | 新增捕获/交接/恢复与 CLI 集成测试，扩展已有 run/adapter 测试 |

新增模块是实施位置约定；有同职责实现时原位扩展。R 队列允许必要的小型抽取，避免把所有逻辑堆入 CLI。实际文件接口由执行者在读完代码后落实，不要求照搬未验证的伪接口。

## R1 — 本次运行自动记录并可靠关联

**修改：** run/index、run-session、run-record、默认 adapter 和现有事件记录器；新增 optimization-session 的持久化关联。

- [x] 先测试同一 task 连续两次运行及两个 skill 并行运行：分别拥有不同 run 标识，各自绑定实际加载 skill、task、workdir、adapter/model 和记录文件；不靠日志目录最新文件排序。
- [x] 在“运行并优化”路径启用实际 run-scoped 捕获，覆盖已发生的输入、工具调用/返回、结束状态和可见 usage。复用已有事件格式和现有必要摘要，不叠加第二套签名/归档验证器。
- [x] 捕获身份在运行前建立，记录完结后交接。正常结束、超时、中断、provider error 与日志写入失败分别保存；源任务成功但日志不可读时保留成果，只阻止依赖缺失记录的自动优化。
- [x] 仅绑定用户本次选择的 skill 和任务目录，不收集无关会话、全量环境变量或凭据；trace 本地保存，发给优化模型仅限相关信息并遮蔽可识别秘密。缺失工具事件要如实标部分记录。
- [x] 不修改所有其他命令的默认记录语义；`--optimize` 等新入口启用本轮需要的 capture。已有 durable trace 的默认无 IO 测试按旧调用保持有效。
- [x] source workdir 中被任务修改/删除的必要输入，在执行前按声明或实际读取机制保留可恢复副本；优先限定相关文件，不能为“自动”复制整个用户目录或把执行后文件误认为原输入。
- [x] **V2/V6 回归：** skill 与用户目录都有 `config.json` 时，不覆盖用户原文件；输入原地改写后，验证仍能定位执行前字节。使用明确资源命名空间/现有副本机制，并适配旧 skill 相对路径；不能改目录后破坏其脚本查找。第二次恢复不能将上次失败的候选输出当作原输入，也不清空用户目录。

```powershell
bun test ./test/run/optimization-session.test.ts ./test/run/index.test.ts ./src/core/durable-runtime-trace.test.ts
```

**验收：** 能从本次 run 直接获得唯一真实 trace，失败/不完整状态不伪造；无手工路径选择，无跨任务串样。

**实际结果：** 新增 run-scoped `OptimizationSession`，在运行前以抗碰撞 run id 绑定所选 skill、物化 task、workdir、adapter/model、skill/task snapshot、执行前输入 manifest、conversation、durable trace 与最终 `RunResult`。同 task 连续运行和两个 skill 并行运行互不串样；正常、provider failure、中断和 trace 缺失均持久化准确终态，源成果不因捕获失败丢失。用户输入先取执行前摘要，skill 资源部署到 `.skvm/skills/<skill-id>`，仅在无冲突时保留旧根目录别名，因此同名 `config.json` 不覆盖；执行后仍可由 manifest 与实际 read 事件定位原字节。每次恢复使用独立 session 目录，失败候选不会进入下一次输入且用户目录不被清空。聚焦回归 23/23、106 assertions 与 typecheck 通过；R2 将把该能力接入 `--optimize` 的普通 CLI。

## R2 — 自然任务入口与自动优化交接

**修改：** CLI run、run/index、optimization-session、task-source/trace-adapters；复用 jitOptimize。

- [x] 测试自然语言 `--prompt` 与旧 `--task` 两种任务来源互斥，接受现有 skill loader 支持的文件/目录。自然任务由框架物化最小内部 task，不要求用户写 JSON。
- [x] 新增明确的运行并优化选项，运行结束后自动使用 R1 的本次记录进入现有 log 优化。原任务只执行一次；后续局部验证/试用是独立执行，不回填到 source run。
- [x] 用户未显式指定输出目录时，在既有缓存/产物布局中分配独立目录并显示；配置可得时不追问 model，缺模型时给一条具体配置提示，不读出密钥。
- [x] 保存 run→proposal→package 引用，让同一次操作从已完成阶段恢复。未知调用是否完成时先查本次记录，不能无条件重新调用模型或重跑用户任务。
- [x] 不带新选项的旧 `skvm run` 仍仅运行；旧 `jit-optimize --logs` 保持专家兼容。缺 skill、空 prompt、错误目录在模型调用前给可理解的报错。
- [x] 最小交付命令形态如下；该接口已由 R2 实现并通过本地集成回归，R7 仍须保存一次真实路径/模型运行。`--workdir`/`--model`/`--skill` 为既有参数，`--prompt`/`--optimize` 为本阶段新增。

```powershell
skvm run --skill=./my-skill --prompt="检查本目录的语言文件并给出缺失项" --workdir=./my-project --model=provider/model --optimize
```

示例命令不代表已运行。R7 必须保存使用真实路径和已配置模型的实际命令；默认用户流程不再含 logs、locator、criteria 或研究 identity。

```powershell
bun test ./test/cli/run-optimize.test.ts ./test/cli/run.test.ts ./test/run/optimization-session.test.ts ./test/jit-optimize/trace-adapters.test.ts
```

**验收：** 从正常任务运行自动进入优化、导出和结果提示，无用户手工搬运 trace；不新建与现有优化器并行的算法链。

**实际结果：** `skvm run` 现支持互斥的 `--task`/`--prompt`；自然提示会在 run session 内物化最小 task。`--optimize` 要求已选 skill，首版明确限定 bare-agent capture，`--optimizer-model` 默认复用 source `--model`，`--package-out` 缺省为 session 内独立目录。源任务由 `executeRunAndOptimize` 只调用一次，成功后冻结 digest-bound `optimization-evidence.json`，以它作为现有 `jitOptimize` 的 execution-log 输入；主 session 另行记录 pending、optimizer-running、proposal-ready、package-exporting、completed/no-change/failed。completed 直接返回，proposal-ready 只恢复导出，外部调用完成未知时拒绝盲目重发。session adapter 核对 task/skill closure、conversation、durable trace、RunResult 和执行前 manifest；发送给优化模型的提示、对话、工具结果与最终文本会遮蔽可识别 secret，post-run workdir 不被误快照为 source input，非 bare-agent 的伪造 capture 也会在锁和模型调用前拒绝。源结果在优化失败时仍返回。R2 关联回归 73/73、310 assertions、typecheck 与 diff check 通过；实际付费自然链按 R6/R7 执行，本阶段没有把模拟调用计入项目运行。

## R3 — 没有人工评分协议也能进行有依据的优化

**修改：** validation-lifecycle、types、optimizer，复用当前检查执行框架；测试现有 production-closure/validation-lifecycle。

- [x] 写红例：普通 run 无 `criteria`，但原 skill 附带明确规则或可执行测试，系统可发现并执行相应检查；不能因为 baseline criterion 没有 `passed=true` 就永久拒绝改进路径。
- [x] 验证依据优先使用用户任务已有要求、source 自带测试/程序、格式规范与可实际执行的规则。由框架解析/执行后新增检查记录，不能由优化模型把旧 failed/null 改成 passed。
- [x] 原输出只证明一次观察或保真对照，不自动当正确答案。可比较确定性投影、键集合、格式或不变量；某案例的摘要相同不能证明变化输入正确。
- [x] 模型从原文派生的检查标为 source-derived，模型自写自检标为 self-check；另一个模型打分也仍是模型评价。它们可以指导改进，但不伪装成人工标准答案或确定性独立证明。
- [x] 无法判断的专业内容交给 agent，优化有依据的机械部分；有用文档改进不因没有可执行程序而算程序失败，也不通过虚假 dependsOn 提升状态。增加受影响规则/自然任务的检查说明，保持程序检查与文档行为范围分开。
- [x] 执行 source 自带命令前确认本次路径与副作用；不能把互联网 skill 中任意命令当可信 grader 执行。使用现有可重建目录，无需新安全平台或反复确认。
- [x] **V1 红例先行：** 按本节已复现的 empty.mjs 建立 lifecycle/正常入口回归；再增加“写出同名错误文件”和“只打印 ok”的反例。来源引用、exit 0、输出存在均不得冒充实际语义检查；只有任务原要求本来就是存在性时才按该窄范围通过。
- [x] 将可执行断言与被检查的新输出明确关联，实际调用既有 checker/规则比较器，记录检查了什么；模型只声明 sourceRef 不能提升级别。对 checker 型固化程序至少用一个有依据的错误输入确认可检出，而不是仅在正常输入上返回 ok。
- [x] **V4 局部检查：** 同动作两个独立案例中，一个资源可用、一个缺失，前者实际执行并记录，后者保留 missing/未评估。必要案例未完成时不推荐完整声明范围；若无法分离副作用或输入依赖才整组暂缓。测试包括独立其他动作继续运行，禁止删除缺失案例后变全绿。
- [x] 字节参照与语义参照分列，依据任务要求选现有比较器。增加 JSON 合法键顺序变化与内容/类型错误的区分回归；没有依据时保留精确比较，不能为修复行尾误报顺便放宽真实内容要求。

```powershell
bun test ./test/jit-optimize/validation-lifecycle.test.ts ./test/jit-optimize/production-closure.test.ts ./test/jit-optimize/package.test.ts
```

**验收：** 至少一个普通无评分文件的运行能自动取得有依据的局部检查并继续优化；无独立依据的剩余内容仍明确未评估，不让用户编制 criterion 或猜答案。

**实际结果：** lifecycle 不再用旧 `passed` 标签代替候选断言。`task-contract` 会从绑定 task 重新解析并执行 contained `file-check`；原 skill 可用只读 `.skvm-validation.json` 提供 exact/contains/regex/json-schema 文件规则，运行时只读取原始 source 根而非候选副本。每条实际断言记录 id、authority、sourceRef、score 与 details；script/glob/custom/LLM 等当前未纳入的来源保持 unresolved。空程序、同名错误文件和仅打印 `ok` 均被正确拒绝；无历史 criteria 的正确候选可由当前 task/source 规则通过，source JSON 类型错误也被检出。未评分的 observed bytes 只记保真参照，必须另有已通过的原 reference authority 或本次 task/source assertion 才能成为独立正确性。V4 同动作 ready case 实际执行、missing case 保留未评估，动作不提升完整范围，独立动作继续并可保留。JSON schema 比较忽略对象键序但检查递归属性类型以及 const/enum 内容。任务书规定三文件回归 21/21、124 assertions；prompt 23/23、JSON comparator 3/3、typecheck 通过。证据见 `results/skill-ir/skill-optimization-production-closure-20260913/r3/report.json`。

## R4 — 减少生成过程摩擦，避免多次尝试才偶然出程序

**修改：** optimizer/workspace、action-plan、implementations、validation-lifecycle；依据 H8 首跑记录与新增自动采集 trace。

- [x] 从已保存记录定位一次“有机械机会但只改文档”的具体原因：接口索引不清、输入映射困难、动作没落文件、判据过窄或确实无程序收益；不要把所有 no-change 都当错误。
- [x] 为生成/复用动作提供从本次运行自动整理的输入、参数、相关 source 接口和可用检查，让模型在既有 workspace 中实施。路径归一化由框架负责，用户与模型不必猜研究目录映射。
- [x] 增加动作兑现测试：声明 generate-script 但无新程序文件、声明 reuse-script 但入口无可执行来源，均记录该动作未兑现，不以文档修改替代；不强迫没有机械机会的 skill 生成无用程序。
- [x] 有可修错误时复用 H6 一次反馈。仅因效果不满意或没出程序不能无信息连抽多次；需要追加尝试时先改明确信息/共享实现并留首稿。
- [x] 用 R2 接管的自然任务检查首个候选行为，分别记录首次生成成功、一次修复后成功、no-change、仍失败及人工介入；不声称小样本已证明高成功率。
- [x] **V3 观察失效：** A/B 程序共读 `rules.json`，A 失败后修复在允许路径内改该文件，B 的旧 passed 必须失效并重验；B 入口/参数/任务资源/断言被改变也同理。按真实 diff 与已知读取/依赖决定受影响集合；不能证明无影响时有限扩大确定性复验，不用新哈希冻结层，也不假定 action 声明涵盖所有依赖。
- [x] **V5 参数边界：** 选中程序不等于其声明输入全部可用。用同一入口改变必需列、嵌套结构或实际格式条件，核对参数被读取且结果随值变化；合法不适用须在写产物前识别，未知条件继续由 agent 判断。不能只验证文件改名或把一次输出固化为常量。

**验收：** 至少一个有实际证据的生成摩擦落实到共享实现及入口行为测试。若未找到新根因，可通过定位说明关闭此诊断项，但 R7 的真实无手工链仍必须完成。

**实际结果：** H8 九次记录中 1–3、5、7、9 为文档-only，6 为合理 no-change，4 在响应保存前 403，8 在明确“一次有依据的成功可支持有界参数程序、程序无需替代整个 skill，并直接使用输入/输出/检查”后生成程序。共享 workspace 现生成 `IMPLEMENTATION_CONTEXT.json`，集中列出源码入口、参数、规范化输入、观察格式、输出和检查；generate/reuse 动作必须有实际可执行兑现。V3 以候选文件和 evidence binding 加真实修改传播：共读 `rules.json`、入口、参数、task 资源或断言变化均使旧观察失效，无法证明独立时保守复验。V5 报告 `entry-found-only` 选择语义、3 个支持与 3 个不适用案例、输入/参数变化以及写入前拒绝；部分写入反例被检出。一次修复成功、首次成功、no-change、修复后仍失败/回退均有确定性覆盖。机器证据见 `results/skill-ir/skill-optimization-production-closure-20260913/r4/report.json`；这些合成案例不计真实成功率或人工节省。

## R5 — 默认可使用、可理解、可恢复的新包

**修改：** package/CLI 结果和 optimizer 的入口指引；不建设 HTML、网站或桌面 UI。

- [x] 用户看到的是原任务结果、新包位置、如何使用、已优化步骤、仍由 agent 完成的步骤与必要限制；详细 manifest/trace 留供开发者，不要求每次读它们。
- [x] 新包给出常用程序命令与参数来源，避免重复扫描目录、读全源码、调用冗长 help；保留非常用情况的诊断能力。失败不能仅输出内部 evidence id。
- [x] 合法空数据与可选输入缺失继续走对应路径；缺必要输入、缺依赖、程序错误分别给具体下一动作。能修复的本地问题在独立环境内解决，不默默写入用户全局环境。
- [x] 脚本不适用时 agent 沿保留的原流程完成任务，不把跳过计为自动化成功。原 skill 和原任务产物仍能正常使用，恢复不依赖新包成功。
- [x] 优化阶段完成而验证/费用未知时仍可交付准确描述的候选，不能强制“全部已证明”才让人拿到产物；推荐级别保持真实。
- [x] **V6 半完成处理：** 注入“程序已写一半输出后失败”和“导出包中途写入失败”，不得公布可用包或自动重复执行原流程造成二次修改。局部计算/导出用本次独立目录，完成后再发布；只处理本次拥有的临时文件。真实外部副作用无法判断完成与否时保留具体不确定状态，不自动重放。

**验收：** 测试从用户输出及新包入口即可继续正常工作，不依赖研究脚本或开发者手工解释。

**实际结果：** exporter 在目标同级的唯一临时目录构造完整包并执行 closure/behavior binding 核验，最后一次 rename 发布；中途故障不会暴露目标包，临时目录清除，用户非空目标保持原字节。包内 `OPTIMIZATION-USAGE.md` 与 CLI 输出直接列出 ordinary `skvm run` 命令、delivery/behavior 状态、已选步骤、程序命令基线、输入/参数来源、输出、preconditions、残余 agent 职责、原结果位置和 fallback。参数缺失、依赖环境、入口、脚本执行和结果不匹配均有不同下一动作，依赖只建议在 package-local/独立环境准备。新增 `skvm run --resume-optimization=<session>`：已知且原子清理完成的 package 失败只重做导出，不重跑 source 或 optimizer；`optimizer-running`/`package-exporting` 等完成状态不明仍拒绝重放。程序部分写入反例与 package 中途失败均未公布可用包；draft 仍可准确交付。证据见 `results/skill-ir/skill-optimization-production-closure-20260913/r5/report.json`。

## R6 — 不同结构与变化任务上的小规模实用验证

- [x] 使用两个已有 development skill 的不同结构，至少覆盖生成程序与现成程序复用；通过同一 R2 入口运行，人工只提供普通任务、skill、目录和已有模型配置。
- [x] 每项先保留原 task 与自动捕获记录，再检查优化包在原任务及一个未回灌变化任务中的实际消费。可复用本轮已验证程序内容，但自动采集/交接必须真实发生，不能人工导入 H8/H9 的历史 report 冒充。
- [x] 无评分文件的用户输入至少覆盖一项；评价准备由系统依据 R3 完成。外部研究者人工写 checker 的情况必须单列，不能算用户零接线通过。
- [x] 变化任务检查语义与程序参数化，不只改文件名；专业判断的变化仍交 agent。测试失败回到共享代码修复，保留首跑，无 skill-name 特判。
- [x] 第一次可比运行前确定目标指标。优先观察重复程序生成/发现步骤、工具调用和实际 token；同时记录质量、全部 token/cache 字段、耗时与未知费用。旧 H11 可作参考，不跨模型/上下文相减声称新增效果。

**验收：** 两种结构均有自动捕获→优化→新包使用的真实尝试；至少一条完整通过且原/变化任务合格，另一条限制明确。若只有一条成功，交付明确适用范围，不能称两类都已成功。

**实际结果：** 两种结构均通过普通 `run` 完成新 source capture、digest-bound handoff 与 optimizer 调用；最终新尝试都准确返回 `no-change`，没有把历史包伪装成本次生成。按本节允许的复用规则，H8 的 generated checker 包和 H9 的 existing-program 包随后各由普通 agent 消费原输入与未回灌语义变化输入。I18n 原/变化均由系统隔离后的独立 evaluator 得到 5/5，checker 对 2-key 与带新插值的 3-key 输入均 exit 0；agent 在原输入自然调用 checker，变化输入改用通用检查，故该消费限制单列。Law 的无 task/score 自然输入与三条款变化输入均真实调用 bundled converter，source-owned Stage3 各 8/8、input byte-identical、minimal 两文件；Windows 命令语法重试作为摩擦保留。共享 TDD 修复了长路径、post-run output capture、task-local evaluator、framework-owned delta 污染、带锚点脚本引用和 Windows native shell/说明。首个无效 variation contract、文档-only 包、4/5 evaluator 与 law rollback 全部保留。provider 未给可绑定账单价格，实际 USD 为 unknown；不同上下文不做节省相减，效果结论 `unknown`。机器报告见 `results/skill-ir/skill-optimization-production-closure-20260913/r6/report.json`。

## R7 — 无手工接线的整体验收与交接

- [x] 从普通项目目录完成一条真实命令，过程中不手工构造 task.json、日志路径、locator、validation plan 或 criteria。保留实际命令、自动产生的 run/proposal/package 引用和用户输出。
- [x] 自动化测试覆盖：并发 run 不串记录、运行成功但采集失败、取消/未完成记录、缺模型配置、run 完成后恢复不重跑、优化失败保留原成果、未知 usage 不记零。大多数用本地 fixture/模拟 provider，避免为错误路径付费。
- [x] revision 3 的 V1/V2 优先反例必须修复，V3–V6 在对应 R 阶段完成有针对性的回归与处理；实际代码已修复的直接引用测试，不重复实现。最终说明区分已复现缺陷、已修复问题和未覆盖范围，不能用文档更新代替代码结果。
- [x] 明确捕获支持矩阵，先覆盖真实通过的默认 adapter；其他 adapter 未验证就标未验证，不假装适配器注册了就能自动捕获。
- [x] 将 R1–R7 实际状态合入现有 status，不新建总目标或研究 identity；更新实际 goal 的范围说明（若平台不支持改写目标文本，则在其执行记录中注明 revision 2 为当前用户要求）。
- [x] 完成后进入 H13/H14，相关测试合并跑一次，不为新文档/最后 SHA 重跑整个程序链。未达到新增条件时保留 partial 与具体下一动作，不仅依据旧 H 条件关闭目标。

```powershell
bun test ./test/run ./test/cli/run.test.ts ./test/cli/run-optimize.test.ts ./test/jit-optimize/production-closure.test.ts ./test/jit-optimize/trace-adapters.test.ts
```

**新增最低交付条件：** R2 默认入口无需用户提供 trace；本次运行唯一关联且能安全恢复；R3 无人工评分文件路径有实际覆盖；R6 至少一条完整原/变化任务通过、另一结构真实尝试；新增失败路径准确。工程覆盖不是未来成功率，不能把“八九不离十”写成没有测量支持的 80%–90%。

**实际结果：** 从新的普通 Law 项目目录仅以自然任务、已选 skill、workdir 和既有模型配置运行默认 `bare-agent`；未提供 task.json、日志、locator、validation plan、criteria、adapter、optimizer model 或 package-out。source run、capture、handoff 均完整，原产物 Stage3 A/B/overall PASS；系统自动生成唯一 proposal，优化器只改 `SKILL.md`，无程序 action，故最终包准确标为 `draft/behavior not-run`。真实命令先暴露两项共享缺陷：Windows 未设置 HOME 时 `~/.skvm` 误落入 cwd；有效 v2 优化包再次优化时旧 framework metadata 与新包冲突。前者由 `os.homedir()` 回退修复，后者在确认原包闭包有效后只剥离旧 manifest/report/guide 并生成新绑定元数据；两者均有 TDD。首次包导出失败保留，随后公开 `--resume-optimization` 只重做 package，source/optimizer 均未重放。缺模型路由的独立尝试在 provider 调用前给出具体配置错误。七项故障矩阵、V1–V6 代码证据与 adapter 支持矩阵已机器化；只有 bare-agent 自动 capture 经真实验证，其余六个注册 adapter 仍标 unverified。usage token/cache 字段保留，USD 仍以 `usage.costUsd` unknown/null 报告。平台 goal 文本与 revision 3 任务书已一致，无需新建 goal；机器报告见 `results/skill-ir/skill-optimization-production-closure-20260913/r7/report.json`。当前进入 H13/H14。

## H13 — 可安装使用的工程收尾

**修改：** 仅实际暴露的 CLI、依赖打包与现有使用文档。

- [ ] 从研究 runner 外使用正常项目入口优化或消费本轮包；程序工作目录变化后仍可运行，不依赖本机研究目录、旧 identity 或硬编码绝对路径。
- [ ] 默认用户只提供原 skill、自然任务和目录，由 R1/R2 自动捕获并读取 trace；手工日志是高级兼容方式。不要求手工完成动作映射/内部验证协议。如果仍需人工接线，记录具体步骤并优先消除。
- [ ] 检查导出包的最小安装要求和运行命令，一次复制到新的普通临时目录即可验证可搬运性；不新开分支、不重建完整历史 clean 归档。
- [ ] 在现有 usage/component 写出实际运行命令、包使用方式、支持格式和状态含义；真实路径/模型来自运行记录，不能以示例路径冒充已执行命令。

**验收：** 外人按文档能走已支持路径；缺配置给具体提示，产品内部研究术语不成为必填输入。

## Y1–Y2 — 有条件追加，不能替代主链

H0–H13 与 R1–R7 满足工程交付条件、尚未进入收尾窗口且用户未叫停时才执行。每项围绕一个已有失败或结构缺口，约 1–2 小时；没有问题就记不适用，不为凑时长强行执行。

- [ ] **Y1 多程序组合：** 已有 skill 确有两个机械步骤时，检验一个程序输出给下一程序再交 agent 的接力；修现有动作图和路径交接，不增加通用工作流语言。
- [ ] **Y2 缺信息的可用性：** 用真实缺 usage 或部分工具结果的已支持 trace 检查，仍可产生有依据的小改进、具体诊断或 no-change；不新增没有真实记录的适配器。

## H14 — 有限验证、提交与准确交付

- [ ] 一次合并执行本轮修改模块测试。默认相关回归如下；无新问题不重复历史大矩阵、全部归档或全仓模型测试。

```powershell
bun test ./test/jit-optimize ./test/cli/jit-optimize.test.ts ./test/proposals/storage.test.ts
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py
```

- [ ] 最终 `final-report.json` 分列 engineering、behavior、effect：例如工程 complete/partial，行为 passed/partial/unassessed，效果 positive/mixed/no-benefit/unknown。阶段终态不能代替这三项。
- [ ] 更新本任务书复选框、current-status、plan、spec/组件已实现段和 conversation log；不为每阶段新增 Markdown，不重写 G/U 原结果。
- [ ] 精确提交本轮代码、测试、必要文档和脱敏结果，推送 `origin/skill-ir-aot`，核对一次本地/远端对齐；保留其他线程修改。
- [ ] 交付最短真实使用命令、新包、实现改进、实际结果、限制、剩余动作。若未达到下面最低工程条件，明确 partial；可执行工作尚在时不得将持续目标标为完成。

## 5. 本轮交付判据

**最低工程交付必须全部满足：**

1. 普通 CLI 的真实日志路径完成动作实施→程序验证→有界修复/回退→最终 snapshot 导出；集成测试证明调用链，不能只测试孤立函数。
2. 至少一个非 API 参数化新程序由优化器产生，经过原输入和变化输入的独立规则检查，被普通 agent 自然使用并完成残余任务；不能用文档重组替代。
3. 现成程序复用路径经过实际执行，另一个结构成员通过同一流程尝试；无收益/no-change 可作为准确边界，不能算第二成功。
4. 条件来源、待验证依赖传播和最终 snapshot/验证一致性三个共性缺口落实到生产代码与行为测试。
5. 原包保留，失败和未知明确，用户无须研究 runner 手工接线即可使用已支持路径；相关测试和类型检查通过。
6. revision 2 新增：默认运行并优化入口自动捕获并关联本次真实 trace，无需用户提供 task.json/logs/locator/criteria；R7 新增最低交付条件必须满足。保留 H0–H11 历史成果，不因旧验收达标而遗漏 R 队列。

**效果目标：** 在质量不退化且可比条件下，争取目标开销或重复机械工作有明确下降，同时保留输入、输出、cache、耗时、工具和质量指标。不存在固定节省比例门槛；工程完成但效果 mixed 可以准确交付，不能宣称总体成本节省。若仍有明确可修根因和执行窗口，优先修复，不以写完报告提前结束。

**不能冒充成功的结果：** 所有任务表项终结、生成多个 SKILL.md、程序只执行 help、包闭包通过、原脚本本来就能工作、模型自写测试全绿、收集更多 skill，均不能单独满足本轮工程目标。

**持续目标与失败：** 实际未达到工程目标时不标“目标达成”；报告 partial 与可执行下一动作。用户叫停立即停止，目标状态按平台规则处理；预算/外部资源受限也不能把未完成改为完成。没有平台保证任务运行固定时长，任务书用于维持方向和恢复工作。

## 6. 可复制的持续目标指令

按 `D:\skill优化\SkVM\docs\superpowers\plans\2026-09-13-skill-optimization-production-closure.md` revision 3 继续当前持续任务。保留 H0–H12 已完成结果，从实际 R1 进度接续，完成 R1–R7，再完成 H13、适用 Y1–Y2 和 H14；不要只按旧 revision 1 关闭目标。默认用户只选择 skill、描述任务和工作目录，系统运行一次后自动捕获、关联并读取真实 trace，接入已有优化器，生成/复用程序、验证并交付新包；手工 logs/locator/criteria 仅为高级兼容入口，不是用户必需工作。优先修复任务书 V1–V6 的实际语义断言、同名资源/原输入保护、修复观察失效、局部缺案例、参数适用边界与半成品恢复；把这些测试纳入现有 R 阶段，不另开大队列。重点完善 run-scoped capture、自然任务入口、无人工评分文件的局部验证、候选生成可靠性、失败恢复和真实新包使用；不扫描无关会话或用原输出冒充正确答案。利用已有语料和 H 阶段成果，不为新队列重跑历史实验、不无限抽样找正例、不新增展示层或过度审计。按既有授权使用网络、认证 GitHub CLI、远端 API 和有用途付费调用，费用实际/未知分开；常规检查点继续工作，无需再次确认。直接在 skill-ir-aot 开发，保护原 skill、其他线程文件及受保护证据，只推用户 origin。按 revision 3 的工程、行为与效果判据交付，不承诺未测量的 80%–90% 成功率；明确叫停时停止，所有必需任务及适用追加工作完成后交付，不为凑时长无限扩展。
