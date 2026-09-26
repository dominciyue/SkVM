# AH0–AH14：授权 DSL 语义质量与真实编写复用

> 执行代理使用 `superpowers:executing-plans` 连续推进，功能修改使用 `superpowers:test-driven-development`。用户已确认本轮方向并要求写完派发；普通实现取舍、测试、认证来源获取和有目的付费调用无需再次确认。一个开发任务负责代码、研究、共享文档和 Git 发布；只读探子用于独立检索或核验，不并发修改核心文件。

**Goal:** 在同一授权任务类内，交付可实际使用的关系分析支架和场景变更反馈，并通过充分 Markdown 对照判断它们是否改善单次回答及编写复用。

**Architecture:** 沿用 authoring/v2、canonical v0、固定源码宿主、现有 wire、引用检查和计量。新增显式可选的 `control-binding-v1` 分析策略，把已声明的主体、资源、操作和条件组织为有范围的判断问题；源码关系和答案仍由模型分析。AF 工作区承担共同字段和场景变化，新增只读变更影响说明，不建立第二套运行器或自动答案缓存。

**Tech Stack:** TypeScript、Bun、Zod、现有 authorization/provider/measurement 模块、Python 文档检查。

- 日期：2026-09-27；状态：`authorized-for-execution`，AH0 启动时建立机器状态。
- 基线：`08ac8b939e849b9312a33df245b83db3a2eebdf0` 加本轮规划提交；仓库 `D:/skill优化/SkVM`，分支 `skill-ir-aot`。
- 开发模型：`gpt-6-sol / max`；该选择用于开发任务，不自动替换实验中登记的模型。
- 结果根：`results/skill-ir/skill-dsl-research/development/authorization-semantic-quality-v1/`。
- 研究与开发复盘唯一正文：[skill-dsl-research.md](../../skill-ir/skill-dsl-research.md)，本轮维护 §7.27 及相关主题。
- 回答质量约 60%、编写/修改/复用约 40%，用于安排工作投入；两个方向各自报告，不合成为总分。
- 完成 AH0–AH14 后提交、推送用户 origin 并结束；不靠等待、重复审计或追加成功样本延长任务。

## 1. 已确认事实与本轮要回答的问题

AE 四组 Markdown/DSL × v4/v5 最终各 6/6 full；Markdown 首答均 6/6，DSL 首答均 5/6。DSL 完整 prompt+output 高约 27%，v5 没有显示本轮质量增量。AF 已有共同 base、整字段替换、普通 v2 物化、三场景和 Windows 发布；AG 已解决缓存计量口径。已有工程直接复用。

源码核对：`relations.ts` 六类 requirement 表达 entry、identity、resource、decision、effect、external 问题；`prerequisiteIds` 是分析依赖。`relation-result.ts` 验证同义务 coverage/fact 引用。它们没有计算源码控制流、判断一个 ownership check 是否保护另一个目标资源，或证明角色例外正确。`render.ts` 已有因果链文字，不能仅再复制这段话作为新能力。

本轮回答三个具体问题：

1. 以主体—目标资源—控制适用范围为中心组织分析，是否减少控制对象混淆、遗漏例外、忽略上游 gate 或错误推断部署事实？
2. 相同分析支架给 Markdown 后，改进是否仍需要 DSL 表示，还是主要来自可共享的领域方法？
3. 共同政策或主体事实改变时，工作区是否准确暴露继承、显式覆盖和需要复查的场景，作者是否能完成修改而少遗漏？

质量改善可以伴随 token 增加，但必须列出代价。无观察增量时保留简单路线，删除未使用的实验包装或明确保留为研究选项；不把所有试验策略加入普通默认。

## 2. 新任务必读上下文

按下列顺序阅读，不重跑全部历史阶段：

1. `D:/skill优化/AGENTS.md`、仓库 `AGENTS.md`、[current-status](../../skill-ir/current-status.md)、本任务书、[当前计划](../../skill-ir/skill-ir-aot-optimization-plan.md)。AGENTS 中 C/F 的旧阶段指针是历史；实时路线由 current-status 与本书确定。
2. [spec §14.34](../../skill-ir/skill-ir-aot-optimization-spec.md#1434-按-skilltask-范围设计领域-dsl)。分类服务于范围，目标允许直接用 DSL 写该任务；既做质量也做复用。
3. 亲读研究总文档 §1–4、§7.9–7.15、§7.21、§7.24–7.27。需要解释历史时再查对应原件；不得把旧任务的停止句当作本轮停止指令。
4. [usage](../../usage.md) 的 authorization 部分、[developer-guide](../../skill-ir/developer-guide.md) 对应部分、[场景示例](../../../examples/authorization-assessment/scenario-workspace/README.md)、[计量说明](../../../scripts/token-accounting/README.md)。
5. AE `panel-summary.json`、AF `ready.json`、AG `ab-accounting-clarification.json`，位置见 current-status。只读取紧凑结论和当前修改所需原件。

恢复只需本书、AH `status.json`/`journal.jsonl`、最近 Git 提交和 §7.27。状态必须包含当前步骤、下一实际命令、已派发单元、终态/未知完成、已改文件、待提交内容和受阻原因；不要再建立另一份长交接正文。

## 3. 类、材料和评价设计

### 3.1 类边界与来源

研究对象继续是一个 repo/ref、显式源码范围、明确授权义务下的主体—资源操作判断。一个 security skill 的授权职责可以映射到本方法，其 dependency、secret、patch、full/diff audit 等剩余职责保留原归属。

AH1 回读已登记的 Cloudflare/GitHub 两个独立来源及必要依赖，再从现有外部来源索引和原始仓库查找最多四个额外来源，保留近似反例。每项记录正文/依赖读取深度、固定 ref、共同职责、不同职责、实际输入和对本轮方法的影响。合并 fork/转载谱系。skill 成员、来源家族、目标项目、任务状态、模型重复分别计数；不得用目标项目数充当 skill 数量。来源少也可继续工程，并明确范围。

### 3.2 困难关系与面板组成

优先补足以下机制的真实源码与政策依据：

| 机制 | 要核对的判断 | 需要保留的对照情况 |
|---|---|---|
| 控制对象与效果对象 | 源对象 ownership 是否真的授权目标对象写入；租户/资源选择是否一致 | 两对象相同或控制明确覆盖目标时不能误报 |
| 上游控制与路径 | middleware/helper/route gate 是否在被问路径生效 | 有效上游 gate 与局部缺 check 同时存在 |
| 角色或关系例外 | owner、grantee、staff/admin 的例外是否适用于该操作与对象 | 例外存在、例外不适用和普通拒绝 |
| 外部决定性事实 | 哪个缺失事实会改变结论 | 无关 unknown 不应迫使已决定的效果变 unknown |

保留 4 个已有锚点：Open WebUI file、controlled-text、trusted-header，以及 FastAPI foreign-item update。再登记最多 6 个此前未跑本面板的 task-state，优先从已有五项目的未覆盖路径取得，必要时检查最多 3 个额外公开项目。额外候选先登记顺序、许可、源码闭包和政策资格；按首合格材料纳入，不看模型得分换样。输入必须能支持一个有意义问题；取不到就保留原因和实际分母，不拿随意 synthetic 例子冒充真实任务。

新增材料全部是 external/development；不得读旧 Q1 reserve、protected held-out 或改旧 prospective/readiness。真实源码变化与人为 mutation 分开；synthetic 主要用于确定性反例，不补进真实面板成功数。源码使用固定 ref，保留许可证；分析模型只接收允许源码、政策和问题。修复提交、维护者测试、参考裁决等 evaluator 材料放独立目录，生成入口不读取。

### 3.3 四臂公平比较

| 臂 | 作者表示 | 分析策略 | 用途 |
|---|---|---|---|
| M0 | 独立整理的 Markdown | standard | 足够好的普通说明 |
| D0 | authoring/v2 | standard | 当前 DSL 路线 |
| M1 | 同一 Markdown | control-binding-v1 | 判断共享方法对普通说明的价值 |
| D1 | 同一 authoring/v2 | control-binding-v1 | 判断方法与结构化复用的组合 |

四臂固定 `method=plain`、`wire=v4`、同一模型、源码、政策、任务要求、输出合同和修复机会。M1/D1 的新增公共分析问题和源码完全一致；不得通过 DSL 独享提示、额外文件或调用制造优势。Markdown 来自中立任务 brief 的独立作者，不用 DSL renderer 充当作者。MD 共用的身份 manifest 仅用于现有宿主接线，不能把隐藏 DSL 方法注入 M0。

支持层的关系问题允许结构不同，但不得携带源代码结论。比较 M1–M0、D1–D0 检验共享方法；D1–M1 检验相同支持下的表示/流程，D0–M0 保留当前路线比较。禁止把四个差值混成“DSL 提升”。

M1的计划输入来自同一中立任务事实，不从D作者后来增加的私有字段或分析结论反推。AH7逐字段核对principal/resource/entry/operation/relation/conditions和政策一致；修正作者材料事实差异时保留原稿与理由，且须在模型面板前完成。新增支架的作用是组织分析，不能靠提前告诉其中一臂哪个helper有漏洞取胜。

首轮最多 10 状态 × 4 臂 = 40 单元。预先选定新增材料中四种机制各首个合格状态作第二次 fresh-context 重复，最多再 16 单元；选择在首轮答案出现前完成，不能挑首轮失败或成功题。合计通常最多 56 单元；若材料不足则缩小并记录，不无限补样。

沿用既有 `xty/gpt-5.6-sol` 实验配置，开发 GPT-6 Sol 与被测模型分账。auto-probe 关闭；temperature 0、单次 180 秒、单元 600 秒、6000 output tokens、至多 4 次实际 dispatch/1 次机械诊断修复。若已配置路由无法使用，先记录原因；切换模型须在未运行区块前记录，并将该区块四臂一起使用新模型，不能与旧模型混为同配对。美元无用户上限，调用由问题约束。不得用假 usage 或估计美元替代未报告费用。

只在有可复现共享实现错误时进行一轮受影响四臂修订，最多两个状态/8 单元；首轮与修订分列。单次输出质量差不是反复重跑的理由。结果全对则报告 ceiling/no-observed-difference，并继续作者复用任务；不临时加难题追求显著差异。

## 4. 方法实现合同与文件归属

主任务为唯一写者，可修改以下当前文件及相应测试，先读精确源码再动手：

| 职责 | 现存文件与拟新增文件 |
|---|---|
| 领域计划与呈现 | `src/task-dsl/authorization/{schema,semantics,relations,render}.ts`；新增 `reasoning-plan.ts` 与 `reasoning-plan.test.ts` |
| 实际运行、接线与依赖 | `src/benchmarks/authorization-dsl/{host,local-run,local-input,markdown-study,change-report}.ts` 及测试；`src/cli/authorization.ts` 及测试 |
| 场景修改反馈 | `src/benchmarks/authorization-dsl/authoring-workspace/{plan,materialize}.ts` 及测试；新增 `changes.ts`/`changes.test.ts`；`src/cli/authorization-compose.ts` 及测试 |
| 公平运行与评价 | 复用 `src/benchmarks/authorization-dsl/{evaluate,telemetry,inputs}.ts` 与 `src/measurement/token-accounting.ts`；本轮薄 driver 放 AH 结果根，不复制核心 host |
| 使用与文档 | `examples/authorization-assessment/` 的本轮例子、usage/guide/current-status/plan/spec、研究 §7.27、实验目录、本任务书和根 conversation_log |

不修改旧 AB/AE/AF/AG 原始结果，不全仓格式化，不触碰旧本地排除材料。9月27日七项旧脏源码已经处理，不能再机械写“七项原修改仍未提交”。旧远端分支不属于本轮合并范围。保持现有 authoring/schema/wire 兼容；不要因 `standard` 增加空 wrapper 或改变旧 prompt。

### 4.1 可选推理支架

`reasoning-plan.ts` 的建议公共接口如下；在 AH3 用具体反例确认后定稿，必要调整同步本书和研究正文即可，无需等待用户确认：

```ts
import type { CompiledAuthorizationTask } from "./semantics.ts";

export type AuthorizationReasoningStrategy = "standard" | "control-binding-v1";
export type ReasoningFocus =
  | "checked-object-versus-effect-target"
  | "control-applicability-and-bypass"
  | "role-and-relation-exceptions"
  | "decisive-external-facts";
export interface AuthorizationReasoningPlan {
  strategy: AuthorizationReasoningStrategy;
  entries: Array<{
    obligationId: string;
    principalId: string;
    resourceId: string;
    entryId: string;
    questions: Array<{ focus: ReasoningFocus; question: string }>;
  }>;
}
export function compileAuthorizationReasoningPlan(
  compiled: CompiledAuthorizationTask,
  strategy: AuthorizationReasoningStrategy,
): AuthorizationReasoningPlan;
export function renderAuthorizationReasoningPlan(plan: AuthorizationReasoningPlan): string;
```

程序只从 runnable obligations 和作者关系生成局部问题，不创建角色×资源×入口的笛卡尔积，不预填控制存在、可达性或正确裁决。`standard` 返回空计划/空新增段落。新策略要求模型简明说明：检查的主体与对象、最终效果的对象、控制适用条件/例外、支持依据和未解决事实；使用现有 facts/explanation/citations 回答，不要求公开冗长思维过程。

先与现有六类问题逐项对照：能由现有 profile 表达的直接复用，不叠加两份同义 checklist。允许用新策略替代旧泛化方法段，必须完整保留政策和公共问题。若确需机器关系字段，须有两个不同源码情形证明现有 facts 无法表达，先在 AH3 写出最小合同和两臂同等成本；本轮默认不新增 wire 版本、不建控制流分析器。宿主只验证已有引用/关联，语义正确性由独立评价确定。

新增策略从 `--reasoning=standard|control-binding-v1` 贯穿普通 check/run、host、preview、session、inspect 和 compare；缺省严格为 standard。method/arm/wire 仍是原有独立选择。策略与计划进入执行依赖，旧 session 缺策略按历史 standard 解释，有无法恢复的依赖才报告 needs-review，不伪造历史运行。MD研究入口收到完全相同的可选策略。条件模式继续兼容，本轮真实主面板不再引入 conditions 的第二个因素。

### 4.2 共同变化与显式覆盖

AF 已支持整字段替换，本轮不改成隐式深合并。新增只读比较必须分别显示：base 哪个字段变了、每个 variant 是继承还是显式替换、最终输入实际变化、旧结果是否需复查、哪些政策变动被 override 遮住。遮住是“请核对是否仍适用”的提示，不能直接判作者写错。

现有 `AuthorizationWorkspacePlan` 只保留 base hash，不包含可比较的 base 字段快照；实施时添加必要的非秘密声明快照或单独 snapshot 类型，不能从两个 hash 猜哪个字段变了。原文件不写回，输出搬移导致的 sourceRoot 文本变化与有效源码变化分开。模型看过的全部源码仍参与 run compare；不得用最终引用子集自动复用答案。

接口定为 `compareAuthorizationWorkspaces(before, after)`，输入为包含 base/有效 variant 声明和来源的已验证快照，输出按 variantId 的字段变化及 inherited/overridden/added/removed/review-needed 事实。CLI 复用 compose：`--check-only --compare-with=<old-workspace.json>`，只读两份工作区、退出码沿用现有约定；普通发布流程不新增审批步骤。

```ts
import type { AuthorizationAuthoringInputV2 } from "../authoring-v2.ts";
import type { AuthorizationWorkspacePlan } from "./plan.ts";
export interface AuthorizationWorkspaceSnapshot {
  base: AuthorizationAuthoringInputV2;
  plan: AuthorizationWorkspacePlan;
}
export interface AuthorizationWorkspaceChangeReport {
  status: "valid" | "invalid";
  commonChangedFields: string[];
  variants: Array<{
    id: string;
    membership: "retained" | "added" | "removed";
    effectiveChangedFields: string[];
    inheritedChangedFields: string[];
    overriddenChangedFields: string[];
    reviewReasons: string[];
  }>;
  diagnostics: string[];
}
export function compareAuthorizationWorkspaces(
  before: AuthorizationWorkspaceSnapshot,
  after: AuthorizationWorkspaceSnapshot,
): AuthorizationWorkspaceChangeReport;
```

快照必须来自同一次loader读取，不能读两次base再拼成表面一致的状态。`reviewReasons`区分“有效输入变了”与“共同语义修改被显式override遮住”；后者是作者适用性复查提示，不能冒充已变化执行字节。无效plan不产生可用变更判断。源码字节变化继续由现有run compare处理，这个workspace比较不缩减它的依赖集合。

## 5. 连续执行队列

### AH0 恢复、范围与实际基线
- [ ] 按必读顺序恢复，确认当前 Git 分支、origin、无其他活跃写者；保留任何新出现的他人修改。
- [ ] 建立 AH 单一 status/journal，记录当前基线、文件归属、研究与作者账户；现有维护归档只作恢复导航，不重审233项材料。
- [ ] 使用上轮352 pass/1 skip作为已知基线；先只运行要改模块的 focused 测试，有新失败再调查，不复制历史全量审计。

### AH1 外部 skill 职责与困难机制
- [ ] 按 §3.1 查原文及必要依赖，写 `skill-duty-map.json`；最多四个新增来源，失败和反例保留。
- [ ] 每条机制写“来源中的实际职责→当前代码能做什么→具体缺口/已有支持→可验证差别”。若已完整支持，标 existing，不包装成新发现。
- [ ] 主代理在研究 §4/§7.27更新类边界：新源码项目是输入，独立 skill 家族只按来源算。

### AH2 任务材料与评价依据
- [ ] 按 §3.2 固定任务 brief、源码闭包、政策来源、暴露状态和来源资格；保存首合格候选及排除理由。
- [ ] 评价标准分开实际 allow/deny/unknown、政策标签、必要对象/控制关系、必要解释、可选响应细节。决定性缺失事实必须解释如何改变答案。
- [ ] input/evaluator 分目录；新原型生成只读允许 input。关键政策/真值有争议的项保留 `unresolved-reference`，不硬造答案或删除困难项。

### AH3 机制设计与反例定稿
- [ ] 亲读上述核心代码；写 `mechanism-contract.json` 对照旧问题与新增组织，明确控制对象和作用路径的区别，记录哪些内容可复用。
- [ ] 从两个不同源码情形证明支架有实际问题可问；无类型缺口时采用 §4.1 轻计划，不建新 schema/关系图。
- [ ] 固定四臂干预与共同问题，使用一个普通通用记录任务解释设计，实例不得藏真实答案。将修改后的实际接口同步本书再实现。

### AH4 领域计划红绿实现
- [ ] 新增独立 synthetic fixture，先写失败测试：显式义务局部绑定、两个对象不合并、不同义务不串线、重排稳定、blocked义务不伪装runnable、无条件任务正常、standard空新增段。
- [ ] 使用现有 `compileAuthorizationTask` 生成 fixture 的 compiled 值，实现 §4.1 纯函数；禁止源码文件名或仓库名分支。
- [ ] 以下为应固定的断言形状，fixture 使用 `schema.test.ts`/`semantics.test.ts` 的完整合法任务复制后在本轮测试内显式修改：

```ts
const standard = compileAuthorizationReasoningPlan(compiled, "standard");
expect(standard.entries).toEqual([]);
expect(renderAuthorizationReasoningPlan(standard)).toBe("");
const focused = compileAuthorizationReasoningPlan(compiled, "control-binding-v1");
expect(focused.entries.map(e => e.obligationId)).toEqual(
  compiled.runnableObligations.map(e => e.id).sort(),
);
for (const entry of focused.entries) {
  const original = compiled.runnableObligations.find(e => e.id === entry.obligationId)!;
  expect(entry.principalId).toBe(original.obligation.principalId);
  expect(entry.resourceId).toBe(original.obligation.resourceId);
}
expect(JSON.stringify(focused)).not.toContain('"observedDecision"');
```

- [ ] 先运行 `bun test ./src/task-dsl/authorization/reasoning-plan.test.ts` 确认针对缺失行为失败；实现后跑该文件与 render/relations 测试，记录一次红绿结果。

### AH5 普通运行与两种表示接通
- [ ] 在 render/host/local-run/MD/CLI 增加可选策略，默认输出不变；采用 options 追加而不是破坏已有位置参数。
- [ ] 先测未知策略在 provider factory 前拒绝、有效策略确实进入实际 provider prompt、源码只出现一次、MD/DSL新问题一致、domain repair保留原策略。
- [ ] session/preview/inspect/compare 保存实际策略/计划来源；恢复身份包含策略；无新dispatch的离线replay不可称新模型成功。Mock覆盖一次正常、结构修复、超时未知和恢复不重发。
- [ ] 命令与用法同步，执行 `bun test ./src/task-dsl/authorization/render.test.ts ./src/benchmarks/authorization-dsl/host.test.ts ./src/benchmarks/authorization-dsl/local-run.test.ts ./src/benchmarks/authorization-dsl/markdown-study.test.ts ./src/cli/authorization.test.ts`。

### AH6 工作区变更反馈红绿实现
- [ ] 在 `authoring-workspace/changes.test.ts` 先固定：共同政策继承两场景、第三场景override遮蔽、无效引用、variant新增/删除、相同值整字段替换、搬移路径但有效源码相同。
- [ ] 实现 §4.2 的最小快照与只读比较，继续复用 composer和普通loader；无副作用、不创建provider、不修改旧生成目录。
- [ ] 更新 compose `--compare-with` 并加真实 CLI 测试；保留不带参数的旧行为和 Windows 发布边界。
- [ ] 完成 `bun test ./src/benchmarks/authorization-dsl/authoring-workspace ./src/cli/authorization-compose.test.ts`。把提示原因写清，勿把覆盖提示变成必须审核的日常 gate。

### AH7 公平材料、运行配置与离线检查
- [ ] 由未参与设计的干净上下文作者从中立 brief 生成 MD；只提供公开来源/政策/要求和必要用法，不提供DSL成稿、oracle或预期结论。原稿与诊断保存，事实对齐后进入四臂。
- [ ] 在任何真实面板调用前记录代码revision、case/state列表、四臂顺序、预定重复、模型/预算、rubric和停止规则。只用一个可复算config及现有来源绑定，不新增层层归档锁。
- [ ] 轮换四臂顺序；重复反序；fresh context。对照同源码、同公共问题、同wire、同预算，所有新增问题及字数差异可见。
- [ ] 薄 driver 直接调用 `executeLocalAuthorizationRun`/`executeMarkdownStudyRun`；一次离线mock验证当前config、resume不重发与oracle未进入prompt即可。driver提供 `check/run/evaluate/replay/status`，实际命令随实现回写本书。

### AH8 真实质量面板
- [ ] 执行全部已登记首轮与预定重复；每单元写dispatch/终态/原始回答及已知用量。timeout/unknown保留，不无限重发。
- [ ] 传输失败、模型判断、局部修复和基础设施分账。dispatch前可纠正配置继续；dispatch后的未知完成不冒充未调用。
- [ ] 可在已有runner支持时有限并发，但相同case的四臂不得因争抢资源获得不同timeout预算；不为提速改默认provider或创建新调度平台。

### AH9 语义评价与有限修订
- [ ] 全部本区块生成终结后，按既定rubric逐回答定位判断。用现有 `evaluateAuthorizationGenerationV3`，接受逻辑等价表达；不以关键词、字段存在或schema通过替代语义支持。
- [ ] 对所有改变方法结论的胜/负项和代表性unknown作匿名只读独立核验，保留review分歧与依据。复核者可读源码/政策/oracle/答案，但不看臂名和主代理拟定结论。
- [ ] 明确共享实现bug先加失败测试再修；付费修订仅在 §3.3 上限内且包括受影响各臂。纯离线可验证的计量/显示问题不重新跑模型。
- [ ] 首答、初轮最终、修订分别保存；method效果可为positive/mixed/no-observed-difference/negative/inconclusive。

### AH10 独立作者原任务与变化任务
- [ ] 从当前材料选择两个政策可判定的中立作者任务包，覆盖一次公共政策变化和一次主体/资源关系变化；选择规则在作者产出前记录。
- [ ] 每包有独立MD作者和workspace作者，均只获同brief、源码、用法与相同check/locate机会；初稿后给同一变化请求。共8个原/变作者交付，每作者最多一次带具体诊断修订；身份与可测成本完整保留。
- [ ] 作者可返回文本/JSON由主代理原样保存；主代理不得悄悄代修语义字段后算作者成功。无人参与时明确模型辅助作者，humanMinutes保持unknown。
- [ ] 记录真实遗漏/矛盾、check诊断、改动内容、公共修改遗漏与override发现；MD行数与JSON路径数不同单位，不直接做百分比节省。

### AH11 复用与普通使用闭环
- [ ] 将workspace和源码复制到普通临时目录，走compose/check；用已有面板输出或mock完成inspect/compare接线，网络重放与新语义观察分开。
- [ ] 给出带完整synthetic输入的 `--reasoning` 和 `--compare-with` 示例；重要的政策override提示能被用户定位并处理。
- [ ] 若作者实际输入与已运行单元事实一致，可复用其研究证据但明确不是新调用；若不一致，只作准备/离线验收，不补付费演示凑成功。
- [ ] 质量部分完成不妨碍独立工程交付，但不得把 mock 通过写成真实模型收益。

### AH12 方法取舍与研究归并
- [ ] 分层报告机制、项目、真实/合成、旧/新输入、重复、四臂及缺失分母；使用AG完整prompt/output计量，同时保留fresh/cache/actualUSD未知。
- [ ] 优先比较决定性错误和无依据判断，再看必要解释、首答、repair与完整开销；使用全部预定单元，不能只看成功答案。
- [ ] 解释四臂关系：M1/D1共同改善则优先共享领域方法；D1额外改善要指出具体结构或编译机制；仅作者复用有收益也单列；平局保留简单路线。
- [ ] 更新研究§7.27的问题→根因→解决→验证→取舍；改动确实影响当前结论的同步§1/分类/问题表，不只在末尾追加冲突结论。

### AH13 有限回归与复验
- [ ] 运行一次相关完整回归、主typecheck；新增薄driver纳入类型检查，不能只验证bundle能构建。
- [ ] 一次本轮离线replay；旧接口选代表性确定性兼容测试，不重跑全部历史研究。
- [ ] 文档12测试、一次链接扫描、新JSON/JSONL解析和定向凭据检查；敏感信息不进入提交，真实业务payload按既有规则处理。

```powershell
bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl ./src/cli/authorization.test.ts ./src/cli/authorization-compose.test.ts ./src/providers/structured.test.ts ./src/measurement/token-accounting.test.ts ./scripts/token-accounting
bun run typecheck
python ./scripts/check_skill_ir_doc_links_test.py
python ./scripts/check_skill_ir_doc_links.py --root .
git diff --check
```

### AH14 提交与交付
- [ ] 聚焦按“关系策略/使用反馈/研究证据/文档”提交，只纳入本轮清单。更新唯一current-status、当前plan/spec、usage/guide、实验目录及根conversation_log。
- [ ] 仅推 `origin/skill-ir-aot`；核对远端HEAD与ahead/behind，保留他人改动和历史本地排除项。无第三方写者时保证本轮无遗留未提交文件。
- [ ] 最终交付：实现了什么、可运行命令、四臂真实结果、作者变更事实、开销、未解决项和下一建议。工程完成与研究结果分列，完成后停止。

## 6. 失败、预算与持续推进

- 不在普通阶段停下来请求确认。读取当前代码后的小设计修订写入本书/研究正文并继续；只有要改变任务类别、扩大到目标执行/部署写入等明显边界时才暂停该分支说明。
- 网络失败可使用认证gh、固定ref下载和已有缓存，原失败保留；来源缺失不阻塞可独立完成的实现/作者工具。
- 研究无正向结果仍应完成评价和工程交付。不要靠删掉拒绝/未知、调松rubric或只统计适用成功项制造提升。
- 无美元cap不是无限调用指令；56个计划分析单元和至多8个共享修订单元是实验范围，作者账户单列。未测开发代理用量保持unmeasured。
- 不设8小时或16小时的最低运行时长，不等待用户叫停才算完成。任务未完成时持续推进；外部阻塞留下可恢复状态并完成其他不依赖项。
- 历史233路径本地排除清单位于 `D:/skill优化/project-maintenance/20260927-020008/`；不新增宽泛ignore来隐藏本轮文件，不移动/删除原始证据。
- 本轮由一个GPT-6 Sol max任务负责。需要探子时用default/fork-none、清楚界定只读范围，设计和修改由主任务负责。宿主若继承Fast则记录可观察事实；任务工具未暴露精确倍率，勿声称实测1.5倍。

## 7. 完成判据

工程交付必须覆盖：可选关系策略实际进入普通run、旧默认兼容、真实来源与反例、四臂材料公平、完整真实运行或明确受阻原因、独立语义点验、workspace变更反馈、作者原/变记录、可用示例、有限回归、研究归并及origin发布。不能只完成研究表格或只写新提示词后结束。

研究成功由数据判断：指出哪些实质错误/遗漏被减少、是否出现回退、是否能在另一个任务机制复现；把共享方法、DSL表示和复用工具的贡献分开。如果同支持的Markdown同样好且更轻，推荐它做单次任务，并保留DSL在批量声明/变更检查中的有用部分。当前阶段不预定positive，也不要求新语言赢得每项指标。
