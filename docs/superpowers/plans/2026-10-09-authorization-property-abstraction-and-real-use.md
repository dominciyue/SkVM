# AZ0–AZ18：授权性质抽象、真实检查与变化复用

> **For agentic workers:** 使用 `superpowers:executing-plans`、`systematic-debugging`、`test-driven-development` 与 `verification-before-completion`，按任务连续实施。用户已批准上一轮讨论的方向，并要求派发新开发线程。常规检查点不等待确认；不创建新分支或 worktree。代码由主开发者修改，只读探子用于独立定位和核验。

**Goal:** 使同一授权 DSL 实现围绕真实问题选择证据、采用局部语义摘要并形成可核对结论，在 Download 和 OWUI 的完整原 skill 任务中验证实际可用性，再检验质量、开销及变化复用效果。

**Architecture:** 在现有 `property-demand/dependencies`、`procedure-summary`、`source-materials/projection`、`operation-work` 与 inquiry/native 共同核心内增加性质相关性和摘要适用合同。保留结构索引、MRO、对象绑定、官方账号和普通 CLI；新行为显式启用为 `operation-evidence-v6`。宿主校验出处、连接、有限条件和失效，模型解释源码；语义正确性单独复核。

**Tech Stack:** TypeScript、Bun、Zod、既有 Python/Go 结构索引、官方 Codex CLI/App Server、现有只读源码工具。开发 `gpt-6.1-sol / max`；实验沿用当前账号 `gpt-5.6-sol / high`。

日期：2026-10-09。状态：`in-progress`。复核基线：`10bc06f0a8147e14b4e0276e41f92df9ecea952a`；实际接管 HEAD `501b8e12f4b10a17237f5b0d7b86c73fcce45bc0`，启动工作树干净。AZ0 已登记新 identity 和21个逻辑位置（12质量、1单性质、2消费、6变化），两个native首件以质量D首位置别名复用。

## 一、执行边界、读取顺序和继承事实

### 1.1 本轮责任

- 仓库 `D:/skill优化/SkVM`，继续 `skill-ir-aot`，仅推用户 `origin`。新开发线程接管后是本轮代码、共享方法文档和 Git 的唯一写者。
- identity：`authorization-property-abstraction-v1`。新增实验材料集中在 `results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/`；临时运行集中在 `D:/skill优化/project-maintenance/runs/authorization-property-abstraction-v1/`。
- 本轮不承诺必然得到正向收益；必须完成可独立推进的实现、实际验证、修复和评价。可用性与研究效果分别验收，不把队列结束写成研究达标。
- 约六成质量、四成编写复用是投入安排。持续推进，不等待、重复审计或反复模型抽样凑时长。
- 原 skill 的所有问题及其它职责保留；单问题是开发里程碑，不缩小原完整任务的验收分母。源码范围、源码版本、任务措辞及独立政策均记录。
- held-out、Q1、prospective、readiness、历史 `0/6` 和旧实验原件保持。开发已看过的源码和反例明确标 development，不宣称 unseen。
- 不建立新 CLI、独立 agent 平台或第二套通用 IR；不按仓库/skill 名称添加成功分支。不扩展无真实关键路径依据的 descriptor、module initialization、Go 或其它外围语言功能。

### 1.2 主开发者亲自阅读

1. `D:/skill优化/AGENTS.md`、仓库 AGENTS、[当前状态](../../skill-ir/current-status.md)、本任务书全文及 [spec §14.39](../../skill-ir/skill-ir-aot-optimization-spec.md#1439-az-property-abstraction-and-real-use)。
2. [研究总文档](../../skill-ir/skill-dsl-research.md) §1、§7.61、§11；按需回读 §7.60 和 spec §14.38 的兼容合同。无需重读所有历史任务。
3. AY 的 [最终收束](../../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/final-closure-v35.json)、[manifest](../../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/manifest.json)、[公平性说明](../../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/quality-fairness-v35.json)。
4. AY `attempts/native-download/full-flow-v35-cli-0-162/`、`attempts/native-owui/full-flow-v35-cli-0-162/` 的任务、原答、压缩运行件和对应 `reviews/`。这些评价仅供开发和独立评价，禁止进入被测模型输入。
5. [使用说明](../../usage.md)、[开发指南](../../skill-ir/developer-guide.md) 中 account、inquiry/native、source materials、previous/change 的相关段落。跨线程决定需要时再读根目录 handoff/communication，勿输出凭据。
6. 即将修改的确切实现和测试完整读原文。已有阶段已采用的摘要、局部保留和检查机制必须先复用。

### 1.3 已核实事实与纠偏

- AY 是 14 次尝试、10 delivered、2 unavailable、2 failed；12 质量位置未运行。不能写成 14 次完整成功。
- OWUI v35 为 0 accepted units、0 control steps、0 material uses，保留 8 条角色缺失及 1 条结论冲突诊断；Download v35 为 3 accepted units、30 control steps、2 material uses，尚有未解释 callee 和 class-decorator 依赖。
- 两次 native 自然终答的独立评阅均为 partial。OWUI 有空字符串 collection/提前返回遗漏；Download 有全局 GET 权限及 owner 条件遗漏。这些开发诊断不得写成给模型的答案提示。
- `inquiry-result.ts` 已校验原始整体 Schema、缺题及局部结果；过滤坏候选不会使整体变为有效。2026-10-09 定向复核 8 tests / 40 assertions 通过。保持这些保护，不重复修一个不存在的漏洞。
- `control-conclusion.ts` 已有逐题/逐路径状态和条件答案。改进状态呈现与局部采用，不新造一套平行结果系统。
- `property-dependencies.ts` 当前把所有可达调用和退出作为种子；`property-demand.ts` 要求所有可达调用角色、条件等，问题解释主要改变优先级。此处是本轮核心设计缺口。
- `procedure-summary.ts` 已有有限参数化摘要，但主要依赖完整单元和精确展开；本轮扩展其性质适用范围与具名残余，避免重复造摘要模块。
- `manifest.acceptance=true` 是历史要求声明，非实测通过；新记录用 `requirements` 与 `outcomes` 分开，不改历史原件。
- AH 为 Markdown 8/11→8/11、DSL 5/11→7/11；固定材料有 mixed/negative 证据，自主取证的新比较尚未完成。不能把未建立稳定增益写成所有阶段均无任何证据。
- 文档基线：2026-10-09整仓链接扫描有4条历史断链，均来自 `authorization-property-execution-v1/verification/document-links.txt` 对已退役文档的旧扫描记录；治理错误为0。该冻结日志保持原件，验收报告区分当前修改与旧记录，不为全绿重写它。

### 1.4 账号与执行权限

用户已允许使用当前 ChatGPT 账号实验，无需再次征求批准；第三方付费 API 与 AV 旧位置继续暂停。开发模型设置不代表实验可换模型。

AY 记录官方额度拒绝，恢复提示为 2026-10-14 16:47；该时间仅为旧记录。先读已有终态和当前可用的零推理额度元数据；若明确尚未恢复，不请求推理试探、不轮询等待、不换账号/模型/端点、不购买额度。没有明确可用性信息时，首个已就绪的真实开发位置可作一次有目的尝试，拒绝后停止无效派发。恢复以当前证据为准，不用旧时间推定成功。

额度不可用时继续 AZ0–AZ8、AZ12 的离线部分、AZ15 的离线部分及 AZ16–AZ18 的可完成工作；真实位置标 `not-run-account-blocked`，保留执行命令和恢复点。没有真实运行就没有真实质量、采用或收益结论。未知完成先查该本地会话生命周期，不能自动重复发送。

## 二、本轮设计合同

### 2.1 性质决定证据需求

把原问题组织为有限的待验证性质，至少区分：

- `authorization-before-effect`：到达指定效果前有哪些权限或主体/对象约束。
- `authorized-object-matches-effect`：检查的对象与实际使用的对象是否相同或有可说明的关系。
- `effect-reachability`：给定前提下，效果可达、被阻止或仍有条件。
- `operation-completion`：操作成功完成还依赖哪些返回、异常和外部事实。

这些是性质类别，不是预填 allow/deny、漏洞标签或答案。查询记录原 questionId、问题来源、参数、目标效果/对象的来源绑定、用户前提、残余缺口及原题映射。模型可从原任务提议绑定；绑定必须指向已展示的原源码，未定位时保持待定位，不能把“没有找到”解释成“不存在”。

拟在既有类型旁增加窄类型；如下字段属于本轮新合同，不是已存在 API：

```ts
type AuthorizationPropertyKind =
  | "authorization-before-effect"
  | "authorized-object-matches-effect"
  | "effect-reachability"
  | "operation-completion"

interface PropertyQueryContract {
  questionId: string
  kind: AuthorizationPropertyKind
  request: string
  targetAnchorIds: string[]
  premiseIds: string[]
  bindingStatus: "unbound" | "proposed" | "source-bound"
}
```

沿被选性质的目标追数据、控制、调用/返回与会影响该性质的异常；原始完整图保留。`model says irrelevant` 不作为排除依据。未知调用可能改变主体、资源、权限状态、控制顺序或相关异常时，留下具体影响；不能为了减少 required 数量删除 unknown。仅凭问题字符串或正则不能证明相关性。

关键差异测试：同一源码的“权限先于效果”与“操作一定成功”应产生有解释的不同需求；一个无关问题改标题不应改变源材料身份。没有安全摘要时继续保守；有可靠适用摘要后应实质改变范围，而不只是排序。

### 2.2 有范围的摘要与可核对依据

在 `procedure-summary.ts`、source interpretation/materials 中表达参数/对象关系、条件、返回关系、授权拒绝、可能副作用、相关异常及未解决影响。摘要标明适用性质、来源位置/版本、实际 receiver/override、依赖与撤回条件。

分开记录：模型提议、出处/结构检查通过、独立源码语义复核。运行时的结构有效不能自动取得独立语义已证实标签；评价器及人工/AI裁定不注入运行材料。共享库模型可事先按公开实现建立、绑定版本和适用条件，必须各臂可得并计准备成本；禁止把当前应用正确答案包装成模型摘要喂入实验。

摘要只对明确输入/前提和支持性质生效；残余影响属于哪个问题/对象必须可追溯。类型未知、实参不同、override、源码变化、异常顺序或反向对象绑定，均应撤回相关采用。不能把 unsupported 翻译成纯函数；不得假定装饰器无副作用。框架摘要可说明请求/权限调用合同，而无需模拟整个模块初始化，前提是这份摘要本身有可检查依据并显式标注信任范围。

### 2.3 接纳与诊断

显示一条实际流水：提交解释 → 字段/出处有效 → 材料可用 → 当前问题采用 → callee/对象连接 → 当前性质检查。每次拒绝/跳过给出稳定 code、questionId、sourceId、候选/门槛、受影响性质及下一步可执行动作。

重点修复 projection 的 root 未匹配、sourceCallId 缺失、候选不唯一、实参不可绑定，以及前置材料筛除原因。无关问题的已有效局部材料不因邻题失败丢失；不得把局部保留升级为整题完成。旧低层 generic gap 仍可保留，但不丢具体原因、不重复塞满上下文。

### 2.4 检查、协议和计量

保留原整体 Schema 拒绝、逐题有效性、来源失效和最后有效结果撤回。新 v6 的格式拒绝计入真实工具总量和成本，但独立于有效语义检查计数：默认最多 2 次格式纠正、2 次实际语义检查，全部仍受同一个 maxToolCalls 和时限限制。重试只修诊断字段，不把答案从旧结果偷偷补齐；旧策略沿用原预算合同。

对外映射已有状态：交付/协议、源码覆盖、源码语义、机械检查、适用前提和剩余缺口。`checked` 的性质、材料依赖与语义复核级别必须同时显示。未知结论可以诚实交付，但不能计为已证明允许或安全。有效邻题可以展示；原问题完整性单独汇总。

最终评价同时报告端到端原分母、已交付答案的语义正确性、机械检查及实际采用。协议失败留在端到端分母，不能删掉后抬高正确率。美元缺报不妨碍比较真实 token/时间/调用；缺报字段保持 null/unknown，缓存不重复计入完整输入。

### 2.5 现场修复规则

1. 每次较差表现或错误当场归类并记录：宿主/协议、定位读取、语义解释、范围过宽、摘要不适用、检查、通道或评价问题；允许多标签，不强行单因。
2. 对有行动依据的共享缺陷，暂停受影响后续位置；从原件写红测，修共享代码，绿测后具名复验该例，再继续队列。禁止先跑满已知坏实现。
3. 一次失败不自动触发全模块重写。修复必须改变有依据的机制或接口；纯换措辞/原样重抽不能冒充修复。同因一次针对性修订仍无改善，转离线定位或明确残余，停止无信息增益的重复调用。
4. 缺源码时按同一 ref/允许范围补准确来源并记录；超范围或部署事实用条件/缺口处理。不得把评价器揭示的答案放进实验 prompt。
5. 原尝试、修订、代码/合同版本、成本分开保存。发现缺陷可更新后续任务书，不等待再次确认；改变研究问题或原分母需明确说明，旧口径保留。
6. 每项新语言能力必须有当前关键路径反例、现有摘要为何不足的理由及实际采用验证。不能以新增测试数替代采用；同一缺口向第二层外围语言扩展时，先重评性质范围与摘要方案。

## 三、实施队列

所有代码任务按“失败测试→确认预期失败→共享实现→相关绿测→阶段提交”完成。下面列出准确落点和必需反例；命令从仓库根运行，Bun 文件路径带 `./`。不要求为了文档改动运行全仓代码测试。

执行顺序允许按垂直链穿插：AZ9在AZ3–AZ8已有一个可用性质路径后立即开始，无需等待这些阶段所有扩展用例完成。其真实诊断反向驱动尚未完成的实现。账号明确不可用时采用冻结原件离线回放，不把离线结果标为真实使用。

### AZ0：接管、登记与一次离线归因

**落点：** 新 identity 的 `manifest.json`、`status.json`、`study.ts`、`study.test.ts`、`failure-attribution.json`；复用 AY `study.ts` 和 AX `consumer.ts` / `changes.ts` 的实际入口，不调用旧 bootstrap/run 写旧目录。

- [x] 记录 HEAD、工作树、账号已知状态、旧运行是否已结束；读取本任务必需原件，避免全历史审计。
- [x] 建立新状态，`requirements` 是目标、`outcomes` 初始为 `not-measured`，`researchGoalAchieved:false`。不预填 true 验收。
- [x] 对 AY 14 次原件追加离线多标签归因；每条区分“原记录事实”“当前代码重放诊断”“尚待假设验证”，不重写分数。
- [x] 建立新 runner 的 dry-run：所有输出必须落在新 identity/runRoot；误指旧 AY/AX 目录须失败。注册原问题、来源及后续位置，不从旧报告推定新成功。
- [x] 记录原件事实与新判断对应关系，阶段提交。

AZ0验证：新study红测为缺失runner；实现后3 tests/19 assertions通过。零推理账号元数据ordinaryUsageAllowed=true/usedPercent=5，不证明指定实验通道可用；无同identity运行进程。14条归因只映射原终态/检查诊断，currentReplay=null、hypotheses=[]；新源码重放另记。policy-previous的官方错误发生在host tools=0之前，本地代码没有该错误字面量，当前不能宣称本地路径bug已经重现。

### AZ1：补齐材料未采用的具体原因

**修改：** `src/benchmarks/authorization-dsl/source-material-projection.ts`、`inquiry-domain-runtime.ts`、对应测试；按需 `src/task-dsl/authorization/source-materials.ts`。

- [x] 红测覆盖 root 不存在、entry role 不匹配、材料版本/SHA 不符、sourceCallId 缺失、多个 target、实参绑定失败；每例必须有具体诊断及 question/source 身份。
- [x] 返回诊断的同时保留原拒绝行为和局部有效项；不创建“默认 root”或猜测 callee。
- [x] 用 OWUI/Download 原始提案做零调用重放，输出每一接纳阶段的数量及首个阻断原因。旧原件仍为原结果。
- [x] 运行 `bun test ./src/benchmarks/authorization-dsl/source-material-projection.test.ts ./src/benchmarks/authorization-dsl/property-runtime.test.ts`，提交共享修复。

AZ1验证：9个新增反例先9失败，修复后9通过/60断言；两套件215通过/3228断言，主类型检查通过。`study.ts replay-materials`零模型重放保留原件SHA：Download saved/current/available=3/3/3、entry/call采用=1/1、首阻断material-target-unavailable；OWUI=0/0/0、采用0、首阻断material-root-missing。原检查与独立评阅不升级。

### AZ2：恢复预算、真实计量与工作区路由

**修改：** `inquiry-native.ts`、`inquiry-run.ts`、`inquiry-local.ts` 及其测试；必要时 `src/adapters/codex-account.ts` / `codex-account-session.ts`，复用既有遥测。

- [ ] 红测：2 次格式失败后仍可进行剩余有效语义检查；第三次格式失败不能无限重试；总工具预算不增加；旧策略计数不变；无效最新检查撤回旧结果。
- [ ] 重现 AY policy-previous 的 workspace routing 失败，修宿主路径而非改任务；路径有空格、搬移目录及原工作区隔离均覆盖。
- [ ] 报告引用官方 account usage 原值，区分 input 含缓存与分项口径；缺报不显示 cost=0 作为实测。native/inquiry 的同一会话不能重复累计。
- [ ] 运行 `bun test ./src/benchmarks/authorization-dsl/inquiry-native.test.ts ./src/adapters/codex-account-session.test.ts ./src/adapters/codex-account.test.ts`，提交。

### AZ3：性质查询合同与原题映射

**修改：** `src/task-dsl/authorization/inquiry.ts`、`property-demand.ts`、对应测试；仅在职责独立时新增 `property-query.ts` / `property-query.test.ts`。

- [ ] 红测：不同性质类别有独立语义；缺绑定为 unbound；问题标题变化不继承旧结论；未知/重复/缺失原 questionId 被拒绝；拆成子性质后原分母仍完整。
- [ ] 从自然任务/作者声明生成性质候选，只含任务要求，源角色需由真实取证绑定。不得静态硬填 Download/OWUI 的守卫结论。
- [ ] 给 v6 增加显式入口选择和新性质合同身份；旧 v5、旧包与默认行为兼容。
- [ ] 新测试固定两问题同源码样例：`audit(actor); if not check(actor, item): raise Forbidden(); send(item)`；验证性质、目标与缺口变化，不以 call 名称直接判纯/安全。
- [ ] 定向运行新测试及 `./src/task-dsl/authorization/property-demand.test.ts`，提交。

### AZ4：扩展现有有限摘要与残余影响

**修改：** `src/task-dsl/authorization/procedure-summary.ts`、`source-interpretation.ts`、`source-materials.ts`、对应测试。

- [ ] 红测覆盖参数/返回对象、条件拒绝、对象替换、异常与副作用；同 helper 对授权前置关系可用、对完成性仍有缺口的情况明确分开。
- [ ] 保留已实现有限摘要，增加性质适用范围和未解决影响；每个 residual 关联当前问题及对象，摘要不能抹掉未知路径。
- [ ] 模型提议和来源/结构核验状态分开；错源码、错 receiver、错参数或过期条件禁止采用。独立评价结果不进入运行缓存。
- [ ] 测试摘要内顺序变化、拒绝后效果、错对象、异常被吞与重新抛出；至少一个非授权小反例验证未知影响不会被 context 标签隐藏。
- [ ] 运行 `bun test ./src/task-dsl/authorization/procedure-summary.test.ts ./src/task-dsl/authorization/source-materials.test.ts ./src/task-dsl/authorization/property-demand.test.ts`，提交。

### AZ5：真正改变依赖范围

**修改：** `property-dependencies.ts`、`property-demand.ts`、`operation-work.ts`、对应测试。

- [ ] 红测直接暴露现状：同源码、不同已绑定性质仍要求全体可达调用；预期是有依据的不同 required/residual 集合，而不是只改变 revision。
- [ ] 从目标 effect/object/guard 及已适用摘要反向追依赖；纯局部、经验证无相关影响的摘要可停止展开，其余未知保持具名边界。
- [ ] unknown setter、资源替换、别名污染、异常绕过、finally 改写及不同 receiver 全部保持反例；检查器不能靠删边得到通过。
- [ ] 没有绑定或摘要不足时返回具体缺口，不把永久展开所有调用作为“问题驱动已完成”。完整语法图继续保存，供检查和追溯。
- [ ] 运行 `bun test ./src/task-dsl/authorization/property-dependencies.test.ts ./src/task-dsl/authorization/property-demand.test.ts ./src/benchmarks/authorization-dsl/operation-work.test.ts`，记录实际需求变化并提交。

### AZ6：关键框架关系的有界摘要

**修改：** `operation-work.ts`、`operation-links.ts`、`source-material-projection.ts`，复用已有结构候选；仅必要时新增一个 `framework-summary.ts` 及同名测试，避免散建插件系统。

- [ ] 对当前允许源码中的请求分派/继承权限/对象权限/效果关联建立版本化适用合同。来源限定真实 qualified symbol、源码版本、receiver/override，不能按应用名判定。
- [ ] DRF 原 dispatch→permission→handler 的必要关系与装饰器可能影响分别处理。只有查明的性质影响才能被摘要覆盖；动态变换未知时保留该性质残余。
- [ ] 红测检查 override 替换、无关 schema 装饰器与会替换 handler 的装饰器、权限作用于错误对象、实际未调用 object check；不得把候选存在视为已执行。
- [ ] 通过相同摘要机制处理既有 FastAPI dependency 的授权关系，不另造 OWUI 成功入口。未覆盖的新框架边界保留，暂不扩更多框架。
- [ ] 定向测试和真实冻结源离线 replay 后提交；不要为了这一阶段引入完整模块求值。

### AZ7：调度、局部采用和最小修复上下文

**修改：** `inquiry-worklist.ts`、`inquiry-focus.ts`、`inquiry-domain-runtime.ts`、`inquiry-context.ts`、相邻测试。

- [ ] 按未闭合性质的影响安排 read/interpret/link/check；既有有效材料不因别题格式失败全部重解释。
- [ ] 红测“有效子部分+未完成邻题”的状态：源解释事务保留、可采用部分有身份，未满足 root 必须明确解释，不能产生假完整路径。
- [ ] 上下文只发送当前相关片段、差异与修复字段，同时保留原源码可取回；记录实际重复字节、重解释次数、摘要采用次数。
- [ ] 同因没有新证据时停止机械重读，给出所缺证据或适用边界；不增加无限自动动作、静默提高所有上限。
- [ ] 运行 `bun test ./src/benchmarks/authorization-dsl/inquiry-progress.test.ts ./src/benchmarks/authorization-dsl/inquiry-focus.test.ts ./src/benchmarks/authorization-dsl/property-runtime.test.ts`，提交。

### AZ8：普通双入口、逐题交付与集成反例

**修改：** `src/cli/authorization-inquiry.ts`、`inquiry-local.ts`、`inquiry-native.ts`、`control-conclusion.ts`、`inquiry-result.ts` 及已有测试；不新增命令族。

- [ ] 显式 v6 由 inquiry 与完整原 skill/native 共用相同核心。完整 skill 加载、剩余职责、自然输出和结构输出同源。
- [ ] 将材料采用诊断、性质范围、残余和 source/semantic/check 状态呈现在现有 inspect/report；保留逐题有效结果及原任务总状态。
- [ ] 红测错枚举、漏题、额外题、邻题失败、最新无效检查、源码变化、摘要不适用、零规则不成立等情况；`inquiry-result` 的既有拒绝测试保持。
- [ ] 用冻结真实源和已归档提案做新版本离线接线演练，只计机械证据。补上普通命令示例后尽早进入 AZ9，不等外围语法补齐。
- [ ] 运行相关 inquiry/native/control/result 测试及 `bun run typecheck`；提交可运行实现。

### AZ9：Download 单性质真实闭合里程碑

**材料：** 沿 AY `inputPlan("download")` 定位完整 Cloudflare skill、原问题和允许源码；新建明确标 development 的一个原问题子性质，不改原完整任务。

- [ ] 登记所选性质及从原问题拆出的理由、来源范围、模型/预算，不预写答案。
- [ ] 通过普通入口真实运行一次。需要看到实际来源材料采用、检查记录、引用以及当前性质的结论；独立源码评阅不读取实验臂标签。
- [ ] 失败按现场修复规则立即处理并具名复验。语义正确但机器未闭合、机器自洽但源码漏项分别修复，不能互相替代。
- [ ] 同一性质的删除检查、检查错对象、提前返回及合法允许/拒绝反例进入离线回归；不能通过只改变终态标签达标。
- [ ] 记录里程碑是否达到。失败也推进独立可做部分及小规模基线诊断，不能以“没有完美底层”为由永远跳过基线。

### AZ10：完整 Download 与 OWUI 实际使用

- [ ] 冻结一个可比较的代码/摘要/合同快照后，把两份完整原 skill 与全部原问题分别送入普通 native 入口；这两次可登记为 AZ13 的 D 第一重复，满足全部同条件绑定时不重复运行。
- [ ] 逐原问题评阅原行出处、条件、对象关系和实际效果；检查 v6 的程序采用及残余。原任务中的部署未知允许准确条件回答，漏掉允许源码中的决定性控制仍为 partial。
- [ ] OWUI 使用同一性质/摘要实现检验不同结构。禁止手工补成只适配该仓库的图或给模型旧正确答。
- [ ] 每次不佳结果立即处理；若生产合同改变，相关比较记录新的 epoch，首件保留，不把不同代码版本混成同版本重复。

### AZ11：两份作者包的普通消费

**参考：** AX `consumer.ts:prepareConsumerInput` 和 AY `model/packages/{download,owui}/`。仅新目录写入，禁止调用旧 bootstrap 修改旧包。

- [ ] 先检验现有有效作者稿和包在新实现中的兼容性，以原字节消费，记录实际读了什么。
- [ ] 若新性质字段必需，由共用迁移器做机械迁移，或独立作者按同一自然任务生成新稿；新旧身份、准备调用及成本分开，不把主开发者修答案算自动作者成功。
- [ ] 两包各一次真实普通消费，原问题完整度、摘要实际调用/采用、外部路径搬移和依赖可取回分别验证。
- [ ] 作者稿结构有效不代表下游任务成功；若原任务已在 AZ10 跑过，此处评价包使用和准备成本，不伪装新增独立任务。

### AZ12：变化、撤回和局部复用

**修改：** 既有 source materials / reuse / compare 及相应测试；新 study 的变化登记复用 AX `changes.ts` 思路，所有写入为新路径。

- [ ] 先离线验证政策、前提、源码三种变化：分别重算哪些关系、保留哪些材料、撤回哪些检查。原问题标题与目录搬移不应造成无意义失效。
- [ ] 已有完整合格基础后，Download 三类变化各跑 fresh/previous；两臂相同变化与代码，前次会话恢复成本完整计入。
- [ ] 基础未完整时仍可测试局部材料复用和 fresh 变化诊断，但不可声称完整任务复用收益；无效 previous 位置保留原因，不能偷用历史合格包。
- [ ] summary依赖源码、receiver、参数、前提或版本变化，相关结论必须撤回；未分析部分与已确认安全明确区分。

### AZ13：公平的有限比较

主面板为 **2 个原完整任务 × N/M/D 三臂 × 2 次重复 = 12 个位置**。已有 AZ10 的两次 D 可作为对应首位置，前提是相同快照/合同及预登记输入。不得因 D 失败跳过 N；协议有效但质量差本身是结果。

- N：完整原 skill、同一原自然任务、共同只读源码工具，无领域运行工具。
- M：同一任务的自然描述，通过共用领域执行机制。
- D：同一事实和问题的声明表达，通过相同领域机制。

M/D 含相同任务事实、源码、政策、允许前提、公共摘要和修复机会。共享 task-facts 中不得有源码衍生答案；D 的作者加工若不能公平机械映射，单列 author preparation 并记限制，不能免费注入只有 D 才有的守卫答案。N/D 测整体方法，M/D 测表达形式；无需为凑臂数自动加第四臂。

主质量面板三臂使用同一个普通native入口、宿主传输、完整原skill加载和自然交付要求；领域工具/表达是显式处理差异。不要继续把N的native入口与D的inquiry入口差异混入主比较。独立inquiry及作者包消费另行检验，可复用共同核心但不充当同入口质量样本。

- [ ] 写入输入等价检查和隔离测试；模型只访问完整原 skill/允许源码/当前任务与运行产生的材料，不可读研究、历史答、oracle、repair-events。
- [ ] 固定共同资源上限、模型、effort、源码范围、会话时限和可比恢复政策；领域工具开销计入实际总量。输出比较使用共同自然答案要求，机器交付另列。
- [ ] 建议沿用 AY 的 64 总工具、786432 显示字节、33554432 读取字节、2700000ms 会话上限作为初始值，先记录实际环境。改变上限须有具体诊断和所有相关臂一致的新版条件，不中途只给某臂加量。
- [ ] 顺序：重复1 Download N/M/D、OWUI D/M/N；重复2 Download D/N/M、OWUI M/D/N。修复位置另列。若 AZ10 先行D，其真实顺序记录且不能声称完全平衡。
- [ ] 首答、修订、未交付、协议失败、语义错误、源码缺失、通道失败分别统计；端到端分母始终为12。已交付语义率另列，不能删除坏协议行。
- [ ] 发现共享故障即时修复；旧 epoch 保留，新稳定 epoch 的配对才用于效果比较。若连续修订仍无法稳定比较，交付诊断与负/不足证据，不再整板重跑碰运气。

### AZ14：独立源码评价与反证

- [ ] 对每个真实答案按同一原问题与源码标准独立评阅；尽量隐藏臂名，主开发者对争议回到原代码裁定。
- [ ] 同时报告 source-supported、必要条件覆盖、错误允许/拒绝、合理条件/unknown、原任务完整度、程序检查和实际材料采用。
- [ ] 不以 checker 的 partial 直接判源码 partial，也不以自然答流畅判 full。协议失败保留端到端失败，并记录仍可评价的自然答语义。
- [ ] 保留 OWUI 空字符串/提前返回、Download 全局权限/owner、错对象、失效摘要等反例；这些只进入评价/开发回归，不能污染运行输入。
- [ ] 汇总质量/开销/复用结论为 positive、tradeoff、no-observed-difference、negative 或 inconclusive，并给出对应原件。两重复仅为 development 描述，不声称统计稳健或广泛泛化。

### AZ15：定向外部借鉴和一项外部能力校准

设计借鉴可在 AZ3–AZ6 所需时前置完成，控制在相关机制/小段代码，不进行新一轮宽泛调研。首要参考：

- [CodeQL Python 库模型](https://codeql.github.com/docs/codeql-language-guides/customizing-library-models-for-python/)：输入/输出/副作用摘要及适用条件。
- [Absentia](https://arxiv.org/html/2610.00977v1) 与 [官方仓库](https://github.com/avduarte333/Absentia)：入口/不变量/反证/跨入口关系。2026-10-09核对时仅基准数据公开，完整实现未发布；不得写成已运行其工具。
- [Paralegal](https://www.usenix.org/conference/osdi25/presentation/adam)：领域政策与依赖图；Rust隐私分析不作为Python直接替代品。
- [Semgrep Multimodal](https://semgrep.dev/blog/2026/idor-detection-benchmark-semgrep-multimodal/)：检查对象与效果对象对齐，商业多模态系统与OSS静态规则分别说明。

- [ ] 在既有 research §7.61 中记录真正借入的机制、所读源码/版本及对应本地反例，不以外部数字证明本项目有效。
- [ ] 如果本机已有适用 CodeQL/Semgrep 工具或能合理安装，在一个已暴露 development 的明确漏洞/修复/正常对照上记录其规则范围与实际输出；不跑目标应用、不自动花费商业服务费用。
- [ ] 不具备匹配规则或工具不可用时，给出明确能力映射和复现命令，标 `not-executed`。不把一次0发现称为本项目优于基线，不为外部工具搭建另一个长期平台。

### AZ16：回归与可恢复证据

- [ ] 运行所有本轮受影响的有限测试、主类型检查和新 study 严格类型检查；只在新修改/失败需要时重复。
- [ ] 零调用重放本轮汇总，从原件计算位置、调用、token、采用和质量，校验原件未改。无需重扫全部冻结历史。
- [ ] 模型请求只记录可见次数；工具回调/预算单位不能充当模型请求数。计入格式修复、摘要准备、作者、实验及失败；开发/探子成本单列，USD/真人分钟缺报仍unknown。
- [ ] 公共 check/inspect 和一份可搬移包做命令核验；真实自然消费已有证据时复用它，不重复复制多份清洁环境凑证明。
- [ ] 文档检查：`python scripts/check_skill_ir_doc_links_test.py`、`python scripts/check_skill_ir_doc_links.py --root .`；目录工具只核验新 identity 必需登记，不重复全历史审计。

### AZ17：交付、研究收束与文档同步

- [ ] 结果集中于新 identity 的 `summary.json`、`status.json`、`accounting.json`、`verification.json`、简短 `README.md`；已有原件/尝试/修订各保留，避免再造多份互相矛盾的总报告。
- [ ] 更新研究 §1/§7.61/§11、spec §14.39、current-status、当前计划，以及实际变化涉及的 usage/developer-guide。current-status替换过期状态，不粘贴每一小步测试日志。
- [ ] 更新根 `conversation_log.md`；跨线程恢复必要时同步 handoff/communication，不复制密钥、原始令牌或巨大日志。
- [ ] 明确分开工程完成、真实原任务使用、作者消费、质量比较、变化复用和成本可观测性。有限队列结束与研究达标分别记录。

### AZ18：提交、发布与下一决定

- [ ] 仅暂存本轮代码、测试、文档和新 identity 证据，复核无凭据、无其它线程修改；按功能提交。
- [ ] 推送用户 `origin/skill-ir-aot`，核对远端提交、差异和工作区；不触碰 upstream，不删除历史材料。
- [ ] 若真实完整链和同条件改善成立，给出可用命令、收益范围和下一扩展依据；质量持平但复用更好则如实报告 tradeoff。
- [ ] 若只有局部链成立，交付真实可用部分和明确剩余问题；若摘要/性质选择仍不能形成可用链，停止外围语义扩张，给出可证伪失败原因及有限结论。
- [ ] 账号阻断时完成所有可独立推进工作，保留未运行位置与恢复命令，不能宣称研究完成。不要等待日期或反复调用维持线程运行。

## 四、位置、指标与停止条件

### 4.1 有限实测分母

- 单性质开发位置：Download 1 个；必要修订单列，不算跨任务样本。
- 完整质量：2任务×3臂×2重复，共12；AZ10两次原skill D首位置满足同条件时复用，不重复计数。
- 两包普通消费：2个；如需新作者稿，作者过程另列成本和有效率。
- 三变化 fresh/previous：6个；完整复用基础不足时逐位置保留阻断/局部诊断属性。
- 外部基线与合成反例为独立面板，不能充作额外真实skill泛化样本。

先取得关键链再扩大成本；但真实D失败不能自动取消同任务N基线。不可执行位置保留原因和原分母。每次针对修订使用具名 attempt，不覆盖首件，不无限增加位置。

### 4.2 最终判断

| 维度 | 达成依据 |
|---|---|
| 工程 | 性质/摘要/相关性/诊断/预算/双入口/失效实现与反例验证 |
| 真实可用 | 完整原skill实际使用；每个原问题有来源和必要条件；机械检查范围明确，独立源码复核完整 |
| 质量收益 | 同条件任务的完整度/错误率改善，首修与版本分开；不能只比形式通过率 |
| 效率收益 | 相同必要质量下的完整token、调用、耗时及摘要准备总成本；缓存仅计一次 |
| 复用收益 | 合格基础的fresh/previous保留正确性，实际少读/少解释/少调用，准备成本单列 |
| 尚未证明 | 未交付、协议失败、语义遗漏、未运行和成本未知均按原件保留 |

不设置“必须赢”的结论，不把测试数、源码图节点数或生成包数当研究收益。若D质量更差且开销更高，明确negative；若运行被外部通道阻断，明确inconclusive。允许质量提升伴随开销上升并报告取舍。新增默认行为须有单独证据，本轮新策略保持显式启用。

## 五、开发恢复命令

以下是现存零调用验证入口；本轮runner完成后把AZ实际命令追加在本节和新identity README中，未经实现的命令不宣称可运行。

```powershell
Set-Location 'D:\skill优化\SkVM'
git status --short --branch
bun test ./src/task-dsl/authorization/inquiry-result.test.ts ./src/task-dsl/authorization/control-conclusion.test.ts
bun test ./src/task-dsl/authorization/property-demand.test.ts ./src/task-dsl/authorization/property-dependencies.test.ts ./src/task-dsl/authorization/procedure-summary.test.ts
bun test ./src/benchmarks/authorization-dsl/source-material-projection.test.ts ./src/benchmarks/authorization-dsl/operation-work.test.ts ./src/benchmarks/authorization-dsl/inquiry-native.test.ts
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
```

实验必须经现有 `executeRun + CodexAccountAdapter` 或 `executeLocalInquiryRun`，沿用当前账号只读工具边界；不可为逃避合同另建裸模型旁路。新 study 只复用已确认的运行函数和源材料，不直接调用历史 study 的写入型主程序。
