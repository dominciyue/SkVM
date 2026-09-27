# AI0–AI16：授权 DSL 任务语义、答案合成与变化后复用

> **执行方式：** 使用 `superpowers:executing-plans` 连续推进；功能修改使用 `superpowers:test-driven-development`，异常先定位共享根因。用户已确认上一轮复核方向，并要求派发 `gpt-6-sol / max` 执行。普通实现、必要联网、认证 GitHub 获取和有目的付费调用已授权，不在常规阶段等待确认。一个开发任务负责代码、共享文档和 Git；只读探子仅承担独立探索或核验。

**Goal:** 让授权任务明确区分场景前提、待证明事实和真正未知的外部条件，由程序承担显式分支覆盖与可确定的政策对照，并完成作者修改后的真实运行和语义评价。

**Architecture:** 复用 authoring/v2、固定源码宿主、现有条件/引用校验、普通 CLI、workspace 和计量。增加可选、带版本的任务语义 sidecar，编译为有界分析程序；模型判断源码行为，宿主做确定的对应、覆盖和答案合成。新旧路径及同等支持的独立 Markdown 分开比较，不改变历史默认或研究原件。

**Tech Stack:** TypeScript、Bun、Zod、现有 authorization/provider/measurement 模块、Python 文档检查。

- 日期：2026-09-27；状态：已规划并授权执行，实际执行从 AI0 开始。
- 基线：`d1b82005fa873170120f41030494d22b189570d1` 加本规划提交。
- 仓库：`D:/skill优化/SkVM`；直接使用 `skill-ir-aot`，仅推用户 `origin`，不创建分支/worktree。
- 开发任务模型：`gpt-6-sol / max`；研究模型沿用 `xty/gpt-5.6-sol`，两种账户分开。
- 新结果根：`results/skill-ir/skill-dsl-research/development/authorization-task-semantics-v1/`。AI0 才建立运行状态。
- 唯一研究正文：[研究总文档](../../skill-ir/skill-dsl-research.md) §7.28 及相关主题；不另建本轮设计/总结长文档。
- 投入：质量约60%、编写/修改/复用约40%，分开验收，不形成加权总分。
- 完成本书后提交、推送并结束；不等待、重复审计或追加成功样本凑时长。

## 1. 已确认的依据和取舍

AH 的44单元来自8状态、3预定重复。M0/M1各8/11 full，D0为5/11，D1为7/11；必要语义支持分别10/10/11/10（各11）。D1修正D0三次标签方向错误，但新增superuser过度弃答；header/assignee的条件解释仍有漏项。完整tokens为M0 34,264、M1 41,402、D0 45,237、D1 50,905。美元未知。2026-09-27父任务新鲜复核338 pass/1平台skip、2372断言、typecheck和AH零模型replay通过，Git与origin同步。

源码定位：

- `authoring-v2.ts` 的主体/资源 facts 为字符串，lowering后为 `Author facts`。场景给定的superuser身份与需要源码证明的绑定关系没有显式分析边界。AH D1因此把函数入口问题扩展为证明裁剪外的认证依赖。
- `reasoning-plan.ts` 为每个runnable obligation生成四类问题；它没有计算源码关系或检查自由解释中的实际语义。继续堆同义问题没有可靠增量。
- 普通plain路径已经使用自然语言声明，见 `local-run.ts` 的 `selectMethodExecution` 和 `render.ts` 的 `renderNaturalDeclaration`。本轮不得把“把JSON转成自然语言”包装成尚未实现的新能力。
- `render.ts` 的独立Markdown路径会删除 `publicAnalysis`，改由作者正文承载要求。下一实验必须显式对齐公共前提、分支请求与响应细节；不再仅写一个 `factsAligned=true` 作为全部依据。
- `conditions.ts` 已能检查条件ID、矛盾赋值、分支重复、同义务fact引用、unknown缺失事实和遗漏条件。它检查的是已声明的条件覆盖，尚不要求每个显式请求的反事实分支都被回答；复用已有检查，不再复制一套条件系统。
- AH作者变化稿只做compose/check/compare，没有重新生成答案；两次被排除的作者尝试不能被抹掉。Gitea旧taskId来源说明是元数据遗漏，不能据此推断整个任务语义错误。

取舍：保留当前任务类和基础设施，新增明确语义与机械合成。只继续调提示词难以保证漏项可见；完整控制流分析器/全仓发现成本过大，本轮不建设。采用小型领域程序并配同支持Markdown对照，研究结果允许mixed或negative。

## 2. 新任务必须亲读的上下文

按顺序读取；长历史只按定位查阅：

1. 根和仓库 `AGENTS.md`、[current-status](../../skill-ir/current-status.md)、本书、[当前计划](../../skill-ir/skill-ir-aot-optimization-plan.md)、[spec §14.34](../../skill-ir/skill-ir-aot-optimization-spec.md#1434-按-skilltask-范围设计领域-dsl)。AGENTS中的C/F旧队列以实时入口为准。
2. 研究正文§1–2、§7.10–7.15、§7.24、§7.26–7.28；亲读任务边界和政策责任，不把历史停止语句当成本轮指令。
3. AH `panel-summary.json`、`evaluator/adjudications.json`、`author-study/changed-checks.json`、`author-study/protocol-deviations.json`；它们在同级 `authorization-semantic-quality-v1/`。只抽查决定性原答，勿重读44份全部日志。
4. [使用说明](../../usage.md)、[开发指南](../../skill-ir/developer-guide.md)的authorization部分、[场景工作区](../../../examples/authorization-assessment/scenario-workspace/README.md)、[计量说明](../../../scripts/token-accounting/README.md)。
5. 下述文件图中的实际代码。模型接口和路由沿用仓库配置，日志不得输出凭据。

恢复使用本书、当前结果根 `status.json`/`journal.jsonl`、Git和研究§7.28。status记录步骤、下一实际命令、已派发/未知完成单元、修改文件和待提交项，不另建平行交接正文。根 `conversation_log.md` 每个有意义阶段追加简短记录。

## 3. 任务语义和实现合同

### 3.1 任务类与前提

仍研究单repository/ref、显式入口和源码、明确政策下的主体—资源操作判断。Cloudflare/GitHub的授权职责映射继续适用；不扩大到full/diff audit、仓库主动发现、部署执行或patch。

增加可选 `analysisContract`，自身版本为 `authorization-analysis-contract/v1`，由authoring/v2和normalized input承载sidecar，canonical task/result v0保持兼容。普通旧输入缺省时保持旧路径；新输入显式填写后即可使用，不要求额外研究manifest。不要自动把所有旧facts升格为已验证事实。

建议的作者字段如下；在AI2核对现存类型后可调整命名，语义必须保留并同步本书：

```ts
export interface AuthorizationAnalysisContractV1 {
  schemaVersion: "authorization-analysis-contract/v1"
  scenarios: Record<string, {
    boundary: "declared-entry" | "supplied-path" | "deployment"
    premises: Array<{
      id: string
      statement: string
      atEntry: string
      provenance: "task-assumption"
    }>
    requestedBranches: Array<{
      id: string
      kind: "counterfactual"
      assumptions: Array<{ condition: string; value: boolean | "unknown" }>
    }>
    requiredResponseDetails: string[]
  }>
}
```

- scenario/entry/condition使用作者已声明的名称；lowering显式映射到canonical IDs，再展开到对应入口。多入口任务不得串用前提或分支。
- `declared-entry`表示在声明入口条件下作判断；例如作者明确说入口参数current_user代表指定superuser。它是问题假设，不是认证链或部署事实的证明。源代码若与假设冲突，报告冲突，不能覆盖源码。
- `supplied-path`要求沿提供路径证明必要绑定；未提供的决定性依赖可unknown。`deployment`继续保留外部部署未知。边界只规定所问性质，不扩大工具权限或读取范围。
- premises不含预期模型答案；policy expectation独立。未填写premise时不能根据taskId/项目名或oracle补出它。
- requestedBranches是用户明确要求的反事实，假设引用已声明condition，不带预期effect。它们只覆盖显式组合，不产生指数级真值表。反事实可改变原场景中该条件的取值，但必须在答案中明确标识，不回写当前场景事实。
- requiredResponseDetails只承载公开交付要求，例如要求写状态码时才列入；空数组正常。完整性评价不得偷偷增加未公开的反事实或格式细节。
- 名称错误、跨义务引用、同分支冲突、重复ID等用已有诊断风格返回具体字段；缺可选结构正常处理。不新增日常人工审批。

### 3.2 编译与回答程序

新建纯模块 `assessment-contract.ts` 和 `assessment-program.ts`，复用semantics/conditions。公共接口在AI2定稿，后续任务统一使用：

```ts
export interface AuthorizationAssessmentProgram {
  schemaVersion: "authorization-assessment-program/v1"
  entries: Array<{
    obligationId: string
    boundary: "declared-entry" | "supplied-path" | "deployment"
    premises: Array<{ id: string; statement: string; atEntryId: string }>
    requestedBranches: Array<{
      id: string
      assumptions: Array<{ conditionId: string; value: boolean | "unknown" }>
    }>
    requiredResponseDetails: string[]
  }>
}
```

编译器做引用解析、显式义务展开、稳定ID及回答位置生成；不扫描源码猜branch、不预填allow/deny。renderer把“当前问题”“接受的场景假设”“需要证实的路径”“额外反事实”分开，删掉等义重复，源码只出现一次。旧自然语言renderer、AH策略和旧结果继续可读；新主面板固定reasoning=standard，不叠加AH四问题造成第二个干预。

运行增加明确的 `assessmentMode: "legacy" | "explicit-v1"`，普通CLI可用 `--assessment` 覆盖；省略时按输入是否显式提供analysisContract选择，旧输入仍legacy。研究M0/D0与outcome-only显式选择legacy：公共要求和事实全部保留，仅不启用新程序；M1/D1选择explicit-v1。explicit-v1缺sidecar时返回指向analysisContract的needs-input，不能悄悄猜前提。选择和程序内容必须进入session、恢复身份和compare，避免消融臂误走相同路径。

新程序需要v6的分支回答合同：explicit-v1且未指定wire时选择v6；显式指定旧wire时在provider前说明应使用v6或legacy assessment，不能丢弃branch请求。legacy assessment继续按原规则选择默认wire，同时允许显式v6以运行outcome-only。method保持既有选择逻辑，不因sidecar自动添加六类ledger；本轮示例和主面板明确用plain。所有实际选择记录在check/session中，旧输入的默认prompt与wire不变。

模型返回每个显式分支的effect、支持事实或决定性缺口。宿主复用现有conditional outcome校验，并增加requested branch闭集覆盖：少一支应显式显示missing/incomplete，不凭一句“已考虑条件”获得完整状态。分支表只检验对应、覆盖、内部确定矛盾；引用存在不自动认定语义正确。同义务fact绑定继续沿用现有normalizer。

### 3.3 实际行为与政策结论分工

新增显式wire/v6，复用v4的事实/引用传输，将无条件任务的模型判断改为实际 `allow / deny / unknown`，由宿主对照已声明的 `allow / deny` expectation。该变化的目的在于转移确定的比较工作，不能仅替换enum文字。

```ts
export function conclusionFromObservedDecision(
  expectation: "allow" | "deny",
  observed: "allow" | "deny" | "unknown",
): "source_refuted" | "source_supported_failure" | "unknown" {
  return observed === "unknown" ? "unknown"
    : expectation === observed ? "source_refuted" : "source_supported_failure"
}
```

- 模型实际decision仍须源码支持；禁止从期望值或自由解释关键词推断observed decision。引用和raw response按旧路径保留。
- `conditional` expectation保留模型的条件政策判断。v6可采用显式区分的 `{kind:"conditional-policy", policyStatus:...}` 分支并复用v5映射；宿主不得用上面的二值函数计算conditional。实际使用哪个分支须由声明校验，不能让模型随意逃到另一个模式。
- 输出schema使用互斥decision对象，模型不再同时填写同一层的旧conclusion；宿主保存observed decision、派生policy conclusion、映射版本与根据。其他事实和分支仍由模型提供。
- strict schema、provider路径、fallback、一次诊断repair、inspect、compare及replay全部接通v6；旧wire和默认不改。
- required branch结果可复用现有condition侧车；如plain需要薄的branch回答字段，仅提供必要字段，不强制输出六类coverage ledger。实现位置和结果版本写清，不让method=plain静默变成旧conditions模式。
- 旧session缺新依赖按历史路径解释；声明语义/前提/分支/输出策略变化须进入完整执行依赖。恢复不对已经dispatch但未知完成的请求自动重发。

## 4. 文件图与责任

所有路径相对仓库；执行前读取精确原文，一次只修改当前阶段相关模块：

| 职责 | 文件 |
|---|---|
| 合同/编译 | 新 `src/task-dsl/authorization/assessment-contract.ts`、`assessment-program.ts` 及各自 `.test.ts`；复用 `semantics.ts`、`conditions.ts`、`relations.ts` |
| 行为合成 | 新 `src/task-dsl/authorization/outcome-result.ts`/`.test.ts`；复用 `compact-transport.ts`、`policy-result.ts`、`transport.ts`、`result.ts` |
| 作者/输入 | `src/benchmarks/authorization-dsl/authoring-v2.ts`、`authoring.ts`、`local-input.ts` 及测试；实际AC编辑schema及其测试同步 |
| 呈现/运行 | `src/task-dsl/authorization/render.ts`；`src/benchmarks/authorization-dsl/{host,local-run,markdown-study,change-report}.ts`及测试；`src/cli/authorization.ts` |
| 修改复用 | `src/benchmarks/authorization-dsl/authoring-workspace/{schema,plan,changes,materialize}.ts`、整字段composer及测试；`src/cli/authorization-compose.ts` |
| 评价/计量 | 复用 `src/benchmarks/authorization-dsl/evaluate.ts`、`telemetry.ts`、`src/measurement/token-accounting.ts`；新薄driver只放本轮结果根 |
| 示例/文档 | `examples/authorization-assessment/`、usage/developer-guide/current-status/plan/spec/研究§7.28、实验目录和本任务书 |

不重写host、不复制provider、不改历史AH/AE原始数据，不全仓格式化。只在确需支持新schema/字段的邻接文件扩展归属，记入status。不要把约束发现、语义评审或完整源码分析器混入普通结构validator。

## 5. 实验与作者使用设计

### 5.1 对齐任务要求

每题建立一份公开要求清单，含：所问当前场景、分析边界、作者前提、所请求分支、必需响应细节。清单无源码答案；四臂模型实际prompt中这段文字逐字相同且仅出现一次。不同表示承担各自正文，不能从DSL成稿生成“独立作者Markdown”。

Markdown新机制从同一公开语义清单编译有界程序，不能从DSL作者私有补充中获取答案。旧机制收到同一公开信息但不运行新增branch/outcome合成，差异就是本轮支持机制。保留逐项输入对应与实际prompt节区检查，不重复建立多个锁。

评价在生成前分开：当前问题decision、必要控制与证据、显式分支覆盖及语义、公开要求的响应细节、未要求的附加解释、合理unknown/过度弃答、label一致性。主质量由当前问题和实际请求决定；未请求细节独立报告，不影响主任务full。旧AH评分保持原版。

### 5.2 四臂及有限机制观察

| 臂 | 输入表示 | 运行支持 |
|---|---|---|
| M0 | 独立Markdown + 相同公共要求 | 原plain/v4、standard |
| D0 | DSL + 相同公共要求 | 原plain/v4、standard |
| M1 | 同一Markdown + 相同公共要求 | 新assessment program与v6 |
| D1 | 同一DSL + 相同公共要求 | 新assessment program与v6 |

比较新/旧共享方法，再比较相同支持下的表示。M/D均相同源码、模型、输出机会及公开信息，运行结果按整套干预解释。不单独归因为语言语法。

- 主面板8个状态：优先6个AH已暴露机制（file、controlled-text、header、superuser-read、assignee、lock），再加2个源码依据充分的场景变化，分别检验角色/关系和假设边界。新变化不改源码时标 `declared-scenario-variation`，不写成新外部项目或真实部署观测。
- 新变化按公开规则选首合格项，选择在输出前记录。缺合格项保留原因并缩小实际分母，不拿合成成功补数。
- 8×4=32首次单元；预先指定text、header、superuser、assignee四种机制各重复一次，最多16重复。顺序轮换，重复反序，fresh context。重复不是新增独立案例。
- 三种机制（标签映射、边界、条件漏项）各预先指定首个适用状态，M/D各一条 `outcome-only` 单元：使用v6但不启用新增程序，公开事实和要求相同。最多6条，与主面板已有臂比较，帮助区分输出合成与领域程序；有变化分母的解释不得藏进汇总。
- 初轮答案生成完才读取evaluator作评分。盲评所有单元，改变方法结论的胜负与unknown进行一次独立点验。旧答案可用于设计缺陷回归，不能充当本轮新基线。
- 仅确有共享实现bug时做一次受影响各臂修订，最多两状态/8单元；新旧结果分开。纯质量不佳不触发“重跑到通过”。

开发与实验账户分开。实验继续 `xty/gpt-5.6-sol`、temperature 0、auto-probe关闭、单次180秒/单元600秒、6000输出tokens、最多4次实际dispatch和一次机械诊断repair；底层fallback全部记账。模型路由失效可按同一区块整体换可用配置，先记录，再开始区块，不混作原同模型结果。

### 5.3 作者变化后的真实闭环

使用两个中立包：FastAPI公共政策变化、Gitea other-user→self；各保留两个场景。独立Markdown/workspace作者各自完成原稿和变化稿，不看另一臂成稿或oracle。可复用AH草稿作为已知开发输入检查工程，但本轮独立作者应从同一中立brief开始，写清二者身份。

两包×两个场景×原/变×两种表示，最多16个真实分析单元，采用同一新支持。编写后走compose/check/run/inspect/compare；原/变答案都评价。FastAPI政策改变但代码不变，应允许出现policy violation；Gitea关系变后预期控制路径可变。政策规范来自任务作者，不能按代码倒推期望以制造正确。

作者最多一次有具体诊断的修订。首次不完整返回计入first-delivery failure；越界读取等protocol-invalid尝试留在全尝试表，替换者另计，不能只报告最后8份交付。主代理可原样物化作者返回内容，不能代修语义后算作者成功。实际模型用量可取则记录，宿主不暴露则unknown；没有真人则不声称真人时间节省。

workspace补 `analysisContract` 的整字段替换、来源和依赖比较。旧taskId可保持稳定身份；生成当前场景摘要帮助识别过期说明，保留历史origin说明且不自动判其为事实。变化影响只是复查范围，新答案须真实运行。

全部常规分析最多70单元（48主面板、6机制观察、16作者使用），共享bug修订另最多8；作者起草调用单列。这是可解释实验规模，美元没有用户上限。工程、离线测试和普通修复持续推进，不为付费数量扩写任务。

## 6. 连续执行队列

### AI0 恢复和基线

- [ ] 按§2读取，确认分支、Git和origin，无其他活跃写者；不清理历史本地排除材料。
- [ ] 创建本轮 `status.json`/`journal.jsonl`，记录规划/实际基线与归属，明确下一实际命令。
- [ ] 使用父任务338 pass/1 skip及AH replay作为已知基线；先跑将修改模块的focused测试，不重复历史全量审计。

### AI1 失败语义与公开要求

- [ ] 点验AH text/lock、superuser、header/assignee的原答及裁定，写紧凑 `failure-map.json`，区分标签、边界、漏答和源事实判断。
- [ ] 为8个候选状态建立公开要求清单与分层rubric；核对当前任务和反事实要求，接受逻辑等价回答。
- [ ] 原始来源/许可/暴露状态沿用已有归档；追加来源只为补具体缺口，按首合格规则保留失败，不扩大skill分类普查。

### AI2 合同与接口定稿

- [ ] 亲读authoring/local-input/conditions/render/host/compare，按§3落定sidecar、program、v6 decision联合类型与文件归属，更新研究§7.28。
- [ ] 写两个synthetic相反例：入口已给定caller→确定判断；同样代码而部署绑定未知→保留unknown。另有固定场景与显式反事实分支各一例。
- [ ] 核对所有公开字段和ID映射；普通旧输入无新增字段、空前提/分支正常、conditional不走二值映射。将实际设计修订写回本书后继续，无需再等确认。

### AI3 合同与程序红绿实现

- [ ] 在新增 `assessment-contract.test.ts` 固定缺失可选字段、非法引用、重复/矛盾分支和跨入口前提反例；运行确认预期失败。
- [ ] 实现schema与lowering sidecar、`compileAuthorizationAssessmentProgram`，保持稳定命名、重排等价、blocked义务不伪装可运行。
- [ ] 新增程序测试使用完整synthetic canonical fixture，不通过类型断言绕过真实parser。至少断言分支不生成effect/expectedOutcome、前提不变成源码citation、同一义务只收到自己的前提。
- [ ] 跑 `bun test ./src/task-dsl/authorization/assessment-contract.test.ts ./src/task-dsl/authorization/assessment-program.test.ts`，确认通过后聚焦提交。

### AI4 政策对照纯函数

- [ ] 在 `outcome-result.test.ts` 先写下列完整真值表红测：

```ts
import { expect, test } from "bun:test"
import { conclusionFromObservedDecision } from "./outcome-result.ts"
test("compares an observed effect with the authored expectation", () => {
  expect(conclusionFromObservedDecision("allow", "allow")).toBe("source_refuted")
  expect(conclusionFromObservedDecision("deny", "deny")).toBe("source_refuted")
  expect(conclusionFromObservedDecision("allow", "deny")).toBe("source_supported_failure")
  expect(conclusionFromObservedDecision("deny", "allow")).toBe("source_supported_failure")
  expect(conclusionFromObservedDecision("allow", "unknown")).toBe("unknown")
  expect(conclusionFromObservedDecision("deny", "unknown")).toBe("unknown")
})
```

- [ ] 实现§3.3纯函数；strict解析另外拒绝伪造mode/重复conclusion，conditional明确走已有政策判断映射。
- [ ] 补v6 normalizer测试：fact归属、无效citation、分支缺失、unknown缺口、conditional处理、错误时无canonical成功泄漏；复用旧normalizer，不重新手写引用校验。
- [ ] 运行 `bun test ./src/task-dsl/authorization/outcome-result.test.ts ./src/task-dsl/authorization/compact-transport.test.ts ./src/task-dsl/authorization/policy-result.test.ts`，确认通过并提交。

### AI5 模型呈现与可检查的分支

- [ ] 先写renderer红测：相同公共要求一次出现、已给定前提与待证明事实分区、反事实显式标记、源文本一次出现、旧默认逐字兼容。
- [ ] 新增程序替代相同含义的泛化问题，不同时重复旧六问题、AH四问题和新program。旧显式AH策略保持可用，冲突组合给清晰说明。
- [ ] 复用条件校验实现requested branch精确覆盖；允许模型如实返回unknown/incomplete。只有缺失/矛盾等机械诊断进入一次修复，不能将oracle答案塞给修复。
- [ ] 运行render、conditions、assessment-program相关测试；核对prompt分节字符和可测token账户分开。

### AI6 普通运行与恢复接通

- [ ] 更新普通check/run、host、schema抽取、fallback、repair、session、inspect和完整依赖compare。输入sidecar自包含；默认不需研究配置。
- [ ] 接入 `assessmentMode` 与 `--assessment`，测试显式legacy仍接收共同公开要求但不附加program，explicit-v1确实使用program；wire/v6可用于outcome-only，不能因v6自动启用新程序。
- [ ] Mock验证一次成功、一次结构修复、未知完成不重发、边界/前提/分支变化触发needs-review。策略和schema选择都进入实际provider prompt与持久身份。
- [ ] Markdown新支持接同一program；公共要求不得在独立Markdown分支消失。旧Markdown study恢复仍核对原身份，新语义研究使用新显式版本/选项记录。
- [ ] 运行 `bun test ./src/benchmarks/authorization-dsl/host.test.ts ./src/benchmarks/authorization-dsl/local-run.test.ts ./src/benchmarks/authorization-dsl/markdown-study.test.ts ./src/cli/authorization.test.ts`，再typecheck，提交共享接线。

### AI7 编写、编辑与workspace集成

- [ ] 把新增sidecar加入authoring字段来源、编辑schema、composer整字段替换和workspace compare；缺省不让旧输入变成invalid。
- [ ] 确定性测试覆盖共同前提变化、被override遮蔽、分支增删、source不变而policy变化、同字节搬移。更新生成的场景摘要，稳定ID和原作者说明分开。
- [ ] 复用现有CLI定位与诊断，避免新增无必要命令。运行workspace/compose/authoring与编辑支持focused测试，提交。

### AI8 中立材料和运行配置

- [ ] 独立Markdown作者从中立brief准备材料，保存原稿与有理由的机械修正；新旧公共要求固定，不从oracle派生输入。
- [ ] 逐项对齐双方的前提、政策、请求分支和响应要求；校验实际prompt公共段相同。新旧支持的差异记录成一张表。
- [ ] 在生成前记录8状态、四臂/重复/6机制观察、顺序、代码revision、模型、预算、rubric和停止规则；真实变化与synthetic分别计数。
- [ ] 复用AH薄driver模式调用现有runner；新driver提供check/run/status/evaluate/replay，纳入脚本typecheck。一次离线生命周期验证即可。

### AI9 真实质量运行

- [ ] 执行已登记首轮、预定重复和机制观察，逐dispatch保存回答/状态/usage；超时和未知完成保留。
- [ ] 各臂保持相同预算；有限并发可用，但不要新建调度平台或因资源争抢改变配对预算。
- [ ] 全部本区块生成关闭后才开始评价。不因某臂效果差换题，不为零token或成功率好看删除fallback/repair。

### AI10 分层语义评价

- [ ] 用已有v3 evaluator建立适配，独立记录模型observed decision、宿主派生政策标签、必要证据、请求分支、附加细节、首答/最终和成本。
- [ ] 评分实际语义而非字段存在；所有改变方法结论的胜负和代表性unknown做一次匿名独立点验，保留分歧与裁定。
- [ ] 若有共享实现bug，按§5一次修订并分列；无bug则0修订。至少回答：标签问题是否由宿主消除、边界是否减少过度弃答、分支是否真实补齐、相同机制下DSL与MD各有何取舍。

### AI11 独立作者原稿与变化稿

- [ ] 按§5.3准备两包中立任务和变化请求，安排独立MD/workspace作者；起草权限与输入范围明确，保存所有尝试和诊断。
- [ ] 原/变稿用当前普通check/compose/compare；有可修诊断交回作者一次，主代理不代填语义。
- [ ] 分别记录首次交付、修订交付、越界尝试、未更新说明、继承/override和实际编辑内容，不用文件数推算人工时间。

### AI12 修改后的真实消费

- [ ] 使用作者实际产物在普通目录运行原/变两场景，最多16单元，走现有run/inspect/compare，不用mock充当新答案。
- [ ] 按预先准备的独立标准评价政策变化、角色关系变化和未改场景。作者输入有语义缺陷时保留失败并指出是编写还是分析问题。
- [ ] 汇总端到端准备与消费的所有可测调用/token/耗时；无法获得的作者账户或真人分钟为unknown。

### AI13 普通交付与例子

- [ ] 在 `examples/authorization-assessment/` 增加完整synthetic例子与可直接运行的现有CLI命令，展示入口假设、显式反事实、unknown和workspace修改。
- [ ] 搬到一个普通临时目录验证compose/check/inspect/compare和依赖定位；真实模型证据复用本轮session，离线搬移另标，不补付费演示数量。
- [ ] 更新usage/developer-guide说明新选项、旧默认、可解释的诊断与实际输出。让用户只准备任务和源码，不提供oracle或研究manifest。

### AI14 方法结论与文档归并

- [ ] 更新研究§7.28、当前主题和问题表；保留问题→根因→解决→验证→取舍，旧AH评分和文件不改。
- [ ] 当前问题正确性、请求完成度、表示效果、编写复用和全部开销分开；必要时推荐简单路径，未测收益保持未知。
- [ ] 把仍未完成的工程要求与没有正向研究收益分开：不能用mixed替代缺失接线，也不把完成工程写成方法正向。

### AI15 有限验证

- [ ] 一次相关完整回归、主typecheck和本轮driver typecheck；新模块自动包含在相应目录测试。只在新失败/新改动时追加针对性验证。
- [ ] 一次零provider离线replay、文档测试及链接检查、本轮JSON/JSONL解析和定向凭据检查，不重做历史全量冻结审计。

```powershell
bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl ./src/cli/authorization.test.ts ./src/cli/authorization-compose.test.ts ./src/providers/structured.test.ts ./src/measurement/token-accounting.test.ts ./scripts/token-accounting
bun run typecheck
python ./scripts/check_skill_ir_doc_links_test.py
python ./scripts/check_skill_ir_doc_links.py --root .
git diff --check
```

- [ ] status记录实际命令、退出码和结果；实验脚本自己的tsconfig及replay命令在实现后写入status和本书，不能只用bundle成功替代类型检查。

### AI16 提交和发布

- [ ] 按合同/合成/接线/作者复用/证据提交，只暂存本轮归属路径；原始大日志沿用必要归档，避免相同review包复制多份。
- [ ] 更新current-status、plan/spec、研究、实验目录、任务书和根conversation_log；数据与当前建议一致。
- [ ] 推 `origin/skill-ir-aot`，核对远端HEAD、ahead/behind和工作区。其他新出现的无关改动保留并说明归属。
- [ ] 最终提供实际命令、工程产物、分层效果、成本、失败与剩余问题。完成后停止，不创建自选追加目标。

## 7. 失败与自主执行

- 局部设计、版本和schema接线出现更好方案，可根据代码修订本书与研究后继续；不为日常取舍增加确认。改变任务类别、执行目标或访问保护集才超出本书。
- 网络/依赖失败定位后一次有依据修复，其他独立阶段继续。旧历史stop只描述过去，当前执行指令覆盖旧队列的“尚未授权”。
- 技术失败、作者首次失败、协议越界、模型质量不足、缺材料分别记录。未知完成保留既有runner恢复规则，不通过重发掩盖成本。
- 历史233项本地排除路径、Q1、旧held-out/prospective/readiness、旧source blockers、原raw和其他任务改动保持原样。
- 不作最低小时承诺；任务未完成时持续推进，确实完成则交付。若一条实验线受外部条件阻塞，完成其他可做工程并留下准确恢复点。

## 8. 完成标准

需要交付：可选任务语义sidecar、义务局部编译、实际行为到政策结论的确定对照、显式请求分支的缺失检查、普通运行和完整依赖接线、同要求Markdown对照、真实原/变作者消费、可运行例子及同步origin。

质量研究需说明哪些具体错误被减少、哪些仍在、哪些由新机制引入；实际答案的源码支持由独立评价确认。若新增支持未改善答案，仍保留可靠工程和明确负结果，并提出有根据的下一取舍，不能宣称“全部适用任务完成”来跳过本书已具备输入的真实消费。
