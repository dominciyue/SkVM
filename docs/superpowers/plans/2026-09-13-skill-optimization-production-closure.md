# 单次 trace 驱动的 skill 优化生产链：持续开发任务书

> **For agentic workers:** 使用 superpowers:executing-plans 连续推进；实现遵循 TDD，步骤以复选框跟踪。主代理负责设计、代码与最终验证，子代理按有效 AGENTS 仅做窄范围只读探索。常规检查点不等待确认。

**Goal:** 把已有优化组件接成可实际使用的生产链：用户给出 skill、一次真实 trace 与可取得资源，系统自动选择并实施有依据的程序复用、程序生成或文档改进，验证受影响步骤，处理失败，导出可由普通 agent 使用的新 skill 包。

**Architecture:** 延续 JIT-optimize 的 Evidence、workspace、optimizer、loop、proposal 和通用 package exporter；将现有 implementation selection、program validation、action resolution 接入真实选轮与导出路径。程序只接管可参数化的机械部分，其余职责继续交给 agent；API/Env 作为可选领域组件，不能成为通用输入合同。

**Tech Stack:** TypeScript/Bun、现有 Pi/headless-agent/provider、proposal storage、已有领域 checker；复用原 skill 所需的 Python/Node 等运行时。只在现有模块不能清晰承担职责时增加小模块。

**状态：** revision 1，`active-H11`，2026-09-13。H0–H10 已完成；机器恢复入口为 `results/skill-ir/skill-optimization-production-closure-20260913/status.json`。G0–G14 历史效果维持 mixed。

**队列：** H0–H14 主队列；Y1–Y2 为主链达标后有条件执行的有限深化。按约 12–20 小时开发范围组织，不保证固定时长，不以等待、重复测试、审计或无限补样填满夜间。

## 1. 本轮方向与适用范围

- 北向目标不变：把 skill 中可确定执行的部分移出 agent 的重复工作，通过优化后的 skill 包使用，并测量效果。本轮补生产线，不重建分类学、研究冻结链或展示产品。
- 初步适用范围是“包含可参数化机械步骤，或存在可改善信息组织的 agent skill”。这是工程范围；不声称任意 skill 均有明显收益，也不声称已经证明完整一类的所有成员。
- 共性体现在优化过程：发现证据、区分条件、选择实现、运行检查、处理失败、打包。不同 skill 可以产出不同程序，不能要求大家共用同一个 helper 或 JSON/OpenAPI 输入。
- 输入基于至少一次真实运行，谁运行就接受谁的真实记录。适配器实际能解析的字段、摘要与完整会话、缺失资源分别说明。一次成功运行也能优化，不要求重复次数、失败分数或最大热点。
- 模型负责优化，并可在工作区创建可执行程序。所有有依据的机会都可处理；不为了代码行数强制生成程序，不把观察到的答案变成常量。
- 本轮必须实际验证程序路线，不能再用“生成程序或改文档二选一”让纯 SKILL.md 修改替代程序生产链。若某 skill 已有等价程序就复用；新程序目标应来自另一个确有机械缺口的动作。
- 原 skill 的任务目的、关键规则、未接管职责保留，外观可以重组。一次任务的路径、联网权限、输出 ABI、示例值不能无条件变成所有未来任务的规则。
- 合法空对象、空集合、非字符串按对应任务语义处理；缺少某种可选结构不拒绝整个 skill。真正缺少某动作必需输入则只影响该动作，不能以放宽检查制造成功。
- 调研服务代码：优先已有 30 个阅读条目（其中 10 个深读），补充阅读围绕已命名的工程问题；不把阅读数、包数、单测数当作泛化或收益证明。

## 2. 启动基线与本轮真正要补的缺口

已复核基线为 `d4eae119fc07276f5d427df2c67200143cabbc17`，分支 `skill-ir-aot`。执行时读取最新 HEAD，不重置回该提交。

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
- 最后保留约 45–60 分钟用于一次相关回归、文档和提交；未完成时如实交付，不进行多轮 clean/摘要归档审计。主线与适用 Y 完成即停止，不无限续作凑时长。

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

- [ ] 从已有已读但未用于本轮代码修改的不同结构成员，或定向补充公开 development 成员，选择一个带明确结构问题的案例。
- [ ] 不按名称增加分支，不预先给优化器答案程序，通过同一入口运行；记录原始结果、人工配置、额外上下文和是否需要修改核心。
- [ ] 需要修复时只改共享机制，并回归受影响的前一案例；无需重跑所有付费配对。成员变化是 development 反馈，不标 prospective。
- [ ] 汇总“代码复用”“程序生成/复用”“自然消费”“任务质量”“观察到的效果”五项，避免包闭包通过掩盖行为缺失。

**验收：** 有不同结构成员的真实复用边界与首跑记录；失败不能删除，无须用大规模采样证明才能交付工程。

## H13 — 可安装使用的工程收尾

**修改：** 仅实际暴露的 CLI、依赖打包与现有使用文档。

- [ ] 从研究 runner 外使用正常项目入口优化或消费本轮包；程序工作目录变化后仍可运行，不依赖本机研究目录、旧 identity 或硬编码绝对路径。
- [ ] 用户提供的是原 skill、trace 和可取资源；不要求手工完成动作映射/内部验证协议。如果仍需人工接线，记录具体步骤并优先消除。
- [ ] 检查导出包的最小安装要求和运行命令，一次复制到新的普通临时目录即可验证可搬运性；不新开分支、不重建完整历史 clean 归档。
- [ ] 在现有 usage/component 写出实际运行命令、包使用方式、支持格式和状态含义；真实路径/模型来自运行记录，不能以示例路径冒充已执行命令。

**验收：** 外人按文档能走已支持路径；缺配置给具体提示，产品内部研究术语不成为必填输入。

## Y1–Y2 — 有条件追加，不能替代主链

H0–H13 满足工程交付条件、尚未进入收尾窗口且用户未叫停时才执行。每项围绕一个已有失败或结构缺口，约 1–2 小时；没有问题就记不适用，不为凑时长强行执行。

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

**效果目标：** 在质量不退化且可比条件下，争取目标开销或重复机械工作有明确下降，同时保留输入、输出、cache、耗时、工具和质量指标。不存在固定节省比例门槛；工程完成但效果 mixed 可以准确交付，不能宣称总体成本节省。若仍有明确可修根因和执行窗口，优先修复，不以写完报告提前结束。

**不能冒充成功的结果：** 所有任务表项终结、生成多个 SKILL.md、程序只执行 help、包闭包通过、原脚本本来就能工作、模型自写测试全绿、收集更多 skill，均不能单独满足本轮工程目标。

**持续目标与失败：** 实际未达到工程目标时不标“目标达成”；报告 partial 与可执行下一动作。用户叫停立即停止，目标状态按平台规则处理；预算/外部资源受限也不能把未完成改为完成。没有平台保证任务运行固定时长，任务书用于维持方向和恢复工作。

## 6. 可复制的持续目标指令

执行 `D:\skill优化\SkVM\docs\superpowers\plans\2026-09-13-skill-optimization-production-closure.md` revision 1 的 H0–H14，主链达标且窗口允许时执行适用的 Y1–Y2。把现有 JIT-optimize 完善为真实 skill + 一次真实 trace 驱动的优化生产链，优先接通程序复用/生成、真实验证、一次局部修复或回退、最终新包导出和自然 agent 使用。API/Env 只是可选组件；不把纯 SKILL.md 修改、孤立单测、阅读数量或报告完成当作程序链完成。使用已有多样化语料，按具体实现问题定向补充 skill 与真实 trace；修复条件范围、依赖未知传播、资源识别及实际开销等共性问题。所有有依据的小优化都可做，模型优化和有用途的联网/认证 GitHub CLI/远端 API/付费调用按既有授权使用，无用户金额上限，实际及未知费用分列。连续推进，不在常规检查点等待确认；失败保留并依新证据修共享实现，不重试刷成功，不用重复审计、测试、等待或扩样凑时长。直接在 skill-ir-aot 开发，不新开分支、不覆盖原 skill、不夹带他人文件、不碰保护样本与历史结果。以本任务书的工程交付判据判断完成，行为和效果单独如实报告；完成后提交推送用户 origin，并给出实际命令、新包和明确剩余问题。用户明确叫停时停止；全部主任务及适用追加任务完成后交付，不无限扩展目标。
