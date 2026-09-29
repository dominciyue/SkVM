# AL0–AL16：源码定位恢复、条件前提与普通作者闭环

> **For agentic workers:** 使用 `superpowers:executing-plans` 连续执行，实现采用 `superpowers:test-driven-development`，异常采用 `superpowers:systematic-debugging`。用户已确认 AK 复核后的方向并要求派发 `gpt-6-sol / max`。一个执行任务负责实现、共享文档、研究调用和 Git 发布；只读探子可核验独立问题。常规检查点不等待确认，历史停止记录不构成本轮停止指令。

**Goal:** 让普通作者通过现有入口可靠地选择和补读源码、保留有效部分、写清条件前提，并在真实原任务与变化任务中提高问题解决率和减少无效修订。

**Architecture:** 在已有有界发现与多片段准备链上分离位置选择、精确原文和解释，宿主管理来源标识、逐项读取诊断及补读上下文。复用现有 authoring/v2、analysisContract/v1、wire/v6、编辑 schema、prepare/edit/check/run/inspect/compare；分析仍消费固定材料。领域事实与政策由作者给出，程序检查位置与表达，模型完成语义判断。

**Tech Stack:** TypeScript、Bun、Zod、Ajv、既有 portable source reader、provider 生命周期与 token-accounting、SkVM CLI、Python 文档检查。

- 日期：2026-09-29；状态：`completed-development`，AL0–AL16完成，真实生成、评价、有限验证与独立复核关闭；完整发布头`bc591200`已核对用户origin且工作区干净，最终状态再同步。执行状态与实际结果见新结果根status/summary，不再追加付费调用。
- 基线：`c0604c5c5dcd55bd323af5f3a20a237e4c15cf60` 加本轮规划提交。
- 工作目录：`D:/skill优化/SkVM`；直接使用 `skill-ir-aot`，仅推用户 origin，不建分支或 worktree，不推 upstream。
- 开发任务：`gpt-6-sol / max`。被测 provider 沿用 `xty/gpt-5.6-sol`；开发代理、准备、作者、分析和评审开销分别记录。
- 新结果根：`results/skill-ir/skill-dsl-research/development/authorization-location-recovery-v3/`。
- 唯一研究正文：[研究总文档](../../skill-ir/skill-dsl-research.md) §7.31；不另建研究总结或交接正文。
- 工作倾向：质量约60%、作者使用和变化复用约40%，分别验收。
- 网络、认证 gh 和有目的付费调用沿用用户授权，无用户美元上限。下面的实验规模和恢复规则用于防止无意义重复；合理的小调整先记录理由和新配置，再继续执行。
- 连续完成 AL0–AL16后交付；不通过等待、重复审计或无关扩展凑时长。

## 1. 已核实的起点与本轮选择

AK父任务复核确认 Git 与 origin 同步且干净；新鲜回归402 pass/1平台skip/0 fail、2735断言，typecheck及三个零调用重放通过。同请求八项v2准备全部ready，源码字节216,952→47,701，减少78.01%。初轮每一种表示中，显式材料为7项确定完整、1项合理unknown；自动材料为4项确定完整、3项合理unknown、1项准备阻塞。全轮36/40 full包含12项合理unknown。

对七份已发布自动提议的34个可选match做只读诊断：25个没有源码字面命中，3个在声明范围内唯一但文件其他位置重复，6个正常全文件唯一。它们是定位字段，部分与已有入口重叠，不能按34个必要控制来统计。

主要根因已定位：

1. `proposal.ts`把行范围、可选match和reason放在同一松散合同，模型把概括或省略号写进match；`prepare.ts`先做全文件唯一性判断，丢弃已有范围的消歧作用。
2. `discovery.ts`补读将可恢复的未命中、歧义和预算不足作为异常抛出；`proposal.ts`因此丢弃整个准备job。GetShared的一条解释式match即可阻止发布。
3. 第二次位置调用是fresh request，却只显示新增窗口和旧ID，没有必要的先前源码与依赖关系上下文。
4. AK作者改进中的完整schema和结构诊断主要落在研究driver；普通作者入口仍需获得一致支持。
5. Paperless作者brief“not owner”未排除owner为空，消费评价因此出现真实条件遗漏。要明确前提和分支，而非事后替用户补非空假设。

路线比较：仅修提示词投入小但保留接口歧义；立即重建全仓语义索引成本大且偏离现有证据；本轮选择宿主绑定位置、逐项恢复和有界上下文，再用已有普通入口验证。保留当前任务类、既有wire与分析默认，不为修定位引入新的分析表示。

## 2. 执行者上下文与恢复

亲读以下内容，顺序从当前到历史：

1. 根与仓库 `AGENTS.md`、[current-status](../../skill-ir/current-status.md)、本书、[执行计划](../../skill-ir/skill-ir-aot-optimization-plan.md)、[spec §14.34](../../skill-ir/skill-ir-aot-optimization-spec.md#1434-按-skilltask-范围设计领域-dsl)。AGENTS内早期C/F路线按当前入口解释为历史。
2. 研究§1–2、§7.28–7.31、§11；沿用单repo/ref、源码可见授权/信任边界分类。领域声明表达principal、resource relation、operation、conditions、policy和entry。
3. AK结果根的 `summary.json`、`preparation-summary.json`、`packing-summary.json`、`panel-summary.json`、`author-use-summary.json`、`panel-config.json`；抽查GetShared补读账户、FastAPI自动proposal和Paperless前提裁定。
4. 下列代码职责表中实际待改文件，以及 [usage](../../usage.md)、[evidence-editing示例](../../../examples/authorization-assessment/evidence-editing/README.md)、[task-semantics示例](../../../examples/authorization-assessment/task-semantics/README.md)。
5. 根handoff/communication仅在恢复缺上下文时查。每个有意义阶段追加 `D:/skill优化/conversation_log.md`。

AL状态记录阶段、下一命令、变更文件、未派发单元及已派发未知请求。终态session不覆盖；完成未知不自动重发。研究不理想时照实完成评价和交付，缺工程项仍明确写未完成，不以“适用项完成”跳过。

## 3. 接口与方法合同

### 3.1 分开位置、原文和理由

内部新位置提议使用显式版本，推荐 `authorization-dependency-proposal/v3`。作者已有v1/v2请求继续可读；只升级真正变化的内部合同。建议在 `evidence-preparation/location-selection.ts` 实现独立纯函数，外层路径与来源验证沿用现有reader。

```ts
export type EvidenceLocationSelector =
  | { kind: "shown-range"; windowId: string; startLine: number; endLine: number; exactLiteral?: string }
  | { kind: "indexed-symbol"; symbolId: string }
  | { kind: "literal-search"; path: string; literal: string; startLine?: number; endLine?: number };

export type EvidenceLocationOutcome =
  | { status: "resolved"; path: string; startLine: number; endLine: number }
  | { status: "unresolved"; code: "not-found" | "ambiguous" | "range-conflict" | "not-shown"; candidates: Array<{ path: string; startLine: number; endLine: number }> };
```

这里是AL1要落实的接口设计，不是已经存在的API。位置ID绑定当前source/ref和host展示窗口；不额外建立多层摘要系统。`indexed-symbol`只能提出补读，函数体未展示时不能接受为最终证据。范围选择只能落在实际展示片段内；多片段缺口不因包络范围而有效。

- `reason`继续使用identity/resource-binding/control/effect/other；自然解释放独立description字段，不参与字面匹配。
- 有范围且有exactLiteral时，先在范围内验证；范围外重复不造成歧义，范围内冲突返回明确诊断。
- 没有范围的literal搜索可以返回候选列表；模型/作者选择宿主候选后才接受。不能默认取第一个。
- 解释、概括和省略号不做模糊原文匹配。旧响应中的错误match可离线诊断，不能在新研究输入中静默删掉后算作自动成功。
- 错误path/ref、越界/junction/symlink继续走现有拒绝逻辑。引用仍按真实原行绑定。
- 旧v1既有匹配语义保持；v2已有范围的校验修复应有兼容测试，新模型采用v3内部合同。AL1若找到更小的兼容接线，记录具体选择，不新增无关模式。

### 3.2 补读逐项恢复

每项read返回resolved/unresolved及诊断，保存请求身份、来源和预算；安全的未命中、多个候选、范围错误、文件不可读或读取预算耗尽不抹掉其他已验证部分。无合法入口仍不能发布可运行assessment；入口可用但辅助缺失发布partial并携带gap。

路径越界、来源身份冲突、快照篡改等安全/完整性错误终止当前job。provider超时、取消和未知完成沿用生命周期，不自动继续派发；此前有效部分可以归档为明确partial候选，其使用须经过同一最终发布校验，不能冒充正常完成提议。

读取列表的次序不能决定有效项是否消失；某项失败后其他安全项仍按预算处理。只保留已实际校验的依赖，AK里在shown-range层accepted的16项不能全部预认定为有效。依赖父节点失效时，相关子节点逐项带原因处理，禁止悬空from。

### 3.3 跨轮上下文与计量

第二轮给出同一任务/政策、入口、已验证依赖的有界摘要、与当前补读相关的旧窗口以及新窗口。不要只给旧ID，也不要附上全部旧对话。

复用既有两轮位置调用与一次纯格式修订；没有可读新信息时不为凑轮数再次调用。候选12文件、1MiB索引读取、累计64KiB源码展示、最终64KiB、深度3沿用AK起点。重发的旧源码按每轮实际展示重复计入64KiB，另报uniqueSourceBytes与resentSourceBytes；metadata、完整prompt及provider token单列。AL1可在真实调用前作一次有依据的共同预算调整，不以隐藏重发绕过预算。语义策略调整不能只给某一表示更大预算。

### 3.4 普通作者与条件前提

复用 `editor-support/schema.ts` 的 `loadAuthoringEditorSchema`、`checkEditorStructure`，给普通init/check及相关prepare诊断一致的字段路径、实际版本、修复提示。明确或可提示为v2的草稿，缺schemaVersion时仍提供v2结构建议，但不能静默转版本或补政策；完全未知输入保持版本诊断，避免硬套v2。结构未通过时不级联几十条下游语义噪声，也不创建provider。

领域条件首先复用现有scenario/assumptions/requested branches、conditions与local-edit。示例明确区分owner=self、other-present、absent与unspecified所代表的前提；这组状态是本轮案例需求，不强制每个授权任务增加owner字段。`unknown/unspecified`不等同于源码的null。仅在现有表达无法无歧义承载真实案例时增加最小可选字段，并同步schema/lowering/renderer/editor/compare。

程序可以检测有明确字段的冲突和缺失提示，不从任意自然语言猜用户的领域意图，不替用户决定政策。MD/DSL收到相同前提；不让某臂独享null-owner答案提示。辅助源码依旧不增加entry/obligation。

## 4. 文件职责

以下均相对仓库根；新增文件列为本轮交付，编辑前亲读相邻实现。

| 文件/目录 | 职责 |
|---|---|
| `src/benchmarks/authorization-dsl/evidence-preparation/location-selection.ts`、`.test.ts`（新增） | 窗口/符号选择、范围内精确匹配、候选消歧的纯函数 |
| 同目录 `discovery.ts`、`discovery.test.ts` | 稳定窗口标识、逐read结果、预算和安全异常分类 |
| 同目录 `proposal.ts`、`proposal.test.ts` | 新内部提议合同、逐项诊断、有界第二轮上下文、原账户复用 |
| 同目录 `prepare.ts`、`prepare.test.ts`、`schema.ts` | 旧请求兼容、范围校验、有效partial与gap最终发布 |
| `src/cli/authorization-prepare.ts`及测试 | 普通准备、失败/partial说明与账户路径，不把恢复藏在driver |
| `src/benchmarks/authorization-dsl/editor-support/schema.ts`及测试 | 复用schema与结构诊断；必要时在同目录新增`diagnostics.ts`/测试承接组合 |
| `src/benchmarks/authorization-dsl/authoring.ts`、`authoring-v2.ts`、`local-input.ts`、`local-run.ts`及相关测试 | 普通结构/语义诊断顺序、场景前提消费；只改必要接线 |
| `src/cli/authorization.ts`及测试、`schemas/authorization/authoring-v2.schema.json` | init/check可见说明；已有schema足够时不更改合同 |
| `src/benchmarks/authorization-dsl/authoring-workspace/local-edit.ts`及测试 | 条件变化、无关字段保留、compare要求 |
| `examples/authorization-assessment/evidence-editing/`、`task-semantics/` | 扩充现有例子，不另建CLI或展示层 |
| AL结果根 | 归档响应诊断、manifest、独立评价、完整成本和恢复脚本；可复用核心放src |

## 5. 实验与真实使用

### 5.1 先确定性复现，再实际提议

在新结果根对AK归档响应做零调用诊断，重现34字段分类以及GetShared补读错误，保留AK原件。用重命名符号、同文件重复literal、空白/行移动和多片段缺口的synthetic测试验证共享机制；不作为新独立skill结果。

从AK同八任务的entry seeds重新准备一次，沿用固定ref、allowedFiles和任务事实，不把专家dependency表或oracle传给新定位器。八个job保留全部分母，不只重跑旧失败。主结果同时列发布率、partial/gap、可确定必要源码覆盖和运行成本。引用范围覆盖与领域控制覆盖分开。

### 5.2 集中质量对照：20个计划session

四个主任务固定为 `owui-file`、`memos-get-shared`、`paperless-download`、`paperless-share-create`。各比较AK归档自动准备材料与AL新自动材料，MD/DSL两表示，共16计划session。AK GetShared没有发布材料，对应两行记preparation-blocked，不虚构旧assessment。其他旧材料由当前同一分析实现fresh消费，旧AK答案不混入新配对。

另固定 `fastapi-superuser-read` 与 `memos-create-share` 两个sentinel，只消费新材料MD/DSL各一次，共4session。全体20计划行保留；展示可执行配对与完整计划分母。新材料一次生成，各表示共用；分析全部 `plain`、`explicit-v1`、`wire=v6`、`reasoning=standard`，同模型、设置和修复机会，按任务交错顺序。

该对照检验准备所得材料对当前分析的影响，旧材料由历史提议产生，新旧准备总成本分账；不声称隔离了模型随机性或代表原生完整skill的净收益。没有预定重复；先解决机制问题再考虑后续迁移。

### 5.3 评价要分清的状态

生成前为每任务登记：决定性控制、所需材料、公开场景前提、允许的外部未知和答案完整性规则。评价材料单独保存，定位/作者/分析输入不包含它。所有生成终结后再匿名语义复核。

至少报告：

- 正确且确定的任务解决数；实际源码足够时的过度弃答；错误确定结论。
- 合理外部unknown、作者前提缺失、允许范围内可补源码缺口、候选范围外缺口、预算缺口分别统计；允许多原因，不强行单标签。
- 完整条件回答与不完整unknown区分；条件任务不能为追求确定率被强制二值化。
- 首答/最终、传输/准备/语义分别统计；blocked保留分母。
- 逐阶段完整prompt、fresh input、cache、output、调用、时间和actualUSD。共享准备只计一次；无费用报告保持unknown。

### 5.4 作者与变化使用：两包8份稿、8次消费

沿用Memos与Paperless两个公开development包，本轮分别验证政策变化与前提变化。MD/DSL作者各做原稿和一次变稿，共8首稿；只通过普通schema/init/check/edit指南工作，不给研究driver专用字段提示。每稿最多一次明确diagnostics-only修订，首稿与修订分别保留，不额外纠正后并入主口径。

Paperless共同brief在生成前明确原任务owner状态是未指定，需要覆盖有影响的分支；变稿只显式指定other-present，保持源码、操作和政策不变。Memos只改变已声明政策及关联期待，源码和角色前提不变。本轮不再添加真实消费用源码变体；源码变化失效由已有compare与确定性测试覆盖。作者需要的入口/来源信息平等提供，不能让DSL凭空补领域事实。

8个fresh普通消费session，目标16项原声明场景义务，实际展开数另记。作者未能交付有效输入则对应消费blocked；主代理不代修领域字段。四组compare、source复用与重新准备原因保存。费用与作者模型调用单列，human minutes保持unknown。

### 5.5 调用、失败和修订

正常20质量+8消费session；8首稿各最多一次诊断修订；准备八个主job，作者原/变最多另四个按需job，每job两轮位置加一次格式修订。分析沿用300秒单调用、900秒session、6000输出token及既有最多一次机械诊断repair；实际fallback逐请求记账。

每项真实运行前确认provider/model配置，不输出key。dispatch后未知不自动重发；provider连续两次基础设施失败先推进离线工程，阶段最多两次有理由的连通性检查。换模型/endpoint单列配置区块，不只替换低分或失败行。

发现共享实现bug，先用确定性反例修复，旧结果保留；允许一次最多8个预登记配对分析session，修订行按受影响任务选择规则在调用前记录。普通低分、过度unknown或评价争议不触发重抽。预算小改由执行者记录原因和影响后自主继续，不为常规事项等待用户。

## 6. AL0–AL16 执行队列

2026-09-29执行调整：20行原质量生成与8稿作者流关闭后，逐原文定位证实两个共享缺陷：Python多行声明的同缩进闭合括号提前终止symbol范围；JSON重复`reads`属性被last-wins解析静默覆盖。先用三个确定性红例修复，再登记唯一修订区块：只选择受影响的OWUI与Download新自动材料，各MD/DSL一次，共4分析。另增加两次原entry-seed准备，使修复实际进入材料；两轮位置/一次格式修订、源码及分析预算不变。原20行、8稿及8消费保留原实现与真实分母，不替换原低分，不再追加区块。登记、原/新实现冻结和费用单列于AL结果根`shared-revision/`。这是命名实现缺陷的修复与有限验证，不是按答案得分重新采样。

每个实现任务采用红绿步骤：添加指定反例→运行并确认预期失败→实现共享逻辑→聚焦转绿→更新相关说明。按完整职责提交，不为单条断言拆提交。

### AL0 基线与执行状态

- [x] 核对本书规划提交、当前分支和Git差异；创建AL `status.json`与追加journal，记录唯一写者和下一命令。
- [x] 保存已完成AK基线；不重跑历史全仓审计，不清理旧策略拒绝目录或历史raw/cache。

### AL1 反例、接口与版本定稿

- [x] 从AK七份proposal与GetShared账户复现34字段诊断，结果存新目录；逐项核对原文和范围。
- [x] 亲读代码表；固定内部v3/旧v1-v2兼容、read结果和上下文预算；同步研究§7.31。
- [x] 新增小fixture：文件中两个`return item`，指定范围只含一个；描述`return ... item`没有原文；新窗口ID越界。预期分别resolved/not-found/not-shown。

### AL2 宿主位置选择与范围消歧

- [x] 新建纯函数和对应测试；先覆盖范围内唯一、范围内重复、范围冲突、未知window/symbol、CRLF/Unicode、跨片段缺口。
- [x] 新提议只接受host ID或实际展示范围；解释字段不进入literal校验。旧v1与v2准确范围测试保持。
- [x] 运行 `bun test ./src/benchmarks/authorization-dsl/evidence-preparation/location-selection.test.ts ./src/benchmarks/authorization-dsl/evidence-preparation/prepare.test.ts`；全部转绿。

### AL3 补读逐项诊断与部分恢复

- [x] 测试read列表为valid/missing/valid时两项有效都保留；ambiguous返回候选；预算不足保留前面合法片段；unsafe路径仍使job拒绝。
- [x] 测试父依赖拒绝后子依赖具名诊断，无悬空from；入口缺失不发布ready，辅助缺失可partial。
- [x] 接通discovery→proposal→prepare账户与输出，保留原失败用量和每项结果。

### AL4 第二轮上下文与预算

- [x] mock捕获两个实际provider请求，断言第二轮包含同政策、入口、已验证依赖摘要、必要旧片段和新片段。
- [x] 测试旧源码重发计费、去重后unique计数、总展示预算、无新信息不追加调用；不传旧模型分析答案。
- [x] 全部轮次复用现有telemetry，取消/超时/格式修订/发布失败仍可恢复计数。

### AL5 普通prepare接线

- [x] CLI check-only零provider；有效partial可check/run，invalid不发布可运行输入；报告能指出具体未解决read与下一步信息。
- [x] 测试同一输入添加support不增加义务；搬移后原行引用正确，跨省略区间仍拒绝。
- [x] 运行 `bun test ./src/cli/authorization-prepare.test.ts ./src/benchmarks/authorization-dsl/evidence-preparation`。

### AL6 普通作者结构诊断

- [x] 用AK两份缺字段首稿的最小化fixture测试：缺版本时能看到适用的结构建议，缺request/policies获得具体路径，无provider。
- [x] 将共有提示和诊断从实验driver职责提升至现有init/check调用链；v1/normalized input正常路径不套错schema。
- [x] 运行 `bun test ./src/benchmarks/authorization-dsl/editor-support ./src/benchmarks/authorization-dsl/authoring.test.ts ./src/benchmarks/authorization-dsl/authoring-v2.test.ts ./src/cli/authorization.test.ts`。

### AL7 前提、分支与变化表达

- [x] 用现有task-semantics/workspace表达owner未指定与other-present，保留absent分支；结构化前提不同则prompt和compare依赖改变。
- [x] 测试未声明owner不被补为非空，明确前提与冲突可定位、无关场景不变；仅显式请求的分支展开。
- [x] 共用MD/DSL公开事实；生产代码里不写Paperless、Memos或特定函数名成功分支。

### AL8 全八任务离线核验与计划固定

- [x] 归档响应诊断、重命名/重复符号测试、实际v2片段/引用验证完成；不将旧提议修过后冒充真实新生成。
- [x] 建立八个seed、20质量行、8作者任务、8消费行及独立评价依据；缺材料的旧GetShared两行预登记blocked。
- [x] 写入真实模型、共同预算、实现提交和命令；建立 `check/replay` 零provider入口，一次身份登记足够。

### AL9 八项真实自动准备

- [x] 每任务运行一次新准备，保存全部轮次、原响应、候选/缺口和费用；未发布保留分母。
- [x] 只用host验证结果发布材料，不按oracle手补。八项准备结束后核对实际控制材料覆盖和字段/预算失败。

### AL10 质量与问题解决评价

- [x] 按20行固定顺序执行可运行session；旧材料和新材料使用相同当前分析实现，blocked行不替换。
- [x] 生成终结后匿名复核，报告确定正确、条件完整、各类unknown及错误，首答和最终分开。
- [x] 仅在共享bug反例成立时采用一次修订区块；否则保留真实结果，无追加采样。

### AL11 独立作者与原/变真实消费

- [x] 两包8计划首稿通过普通接口接受至多一次诊断修订；实际7首稿派发、1依赖失效阻塞，保存每次有效性、字段问题、模型用量和来源。
- [x] 有效稿运行8计划fresh session及四组compare，列16声明义务与实际展开；实际6消费/12展开，失败作者行保留blocked。
- [x] 根据冻结前提评价owner分支，不事后加入非空假设改变主分数；来源/政策/输入的变化各自可追溯。

### AL12 可搬移普通例子

- [x] 更新现有两个示例：准备partial恢复、准确前提、局部edit、check/run/inspect/compare，提供实际命令。
- [x] 在一个具名仓外目录零provider核验相对路径和诊断；不要重复真实模型演示。
- [x] 登记该目录用途与位置；本轮无需清理历史副本，安全清理仅针对本轮确认的精确路径。

### AL13 收益归因与建议

- [x] 汇总定位接口修复、材料完整性、模型回答和作者负担四个层次；共同helper收益与表示收益分开。
- [x] 报完整端到端成本，同时给出准备复用一次/多次分析的实际摊销示例；未测项标unknown。
- [x] 给出适合自动准备的条件、仍需作者补充的信息，以及下一阶段最有价值的未解决问题。

### AL14 同步研究和当前文档

- [x] 更新研究§7.31、对应当前设计及§11、usage、developer-guide、current-status、plan/spec和实验目录。问题—根因—实现—验证—剩余项写进同一研究正文。
- [x] 当前文档只写实际结果；AK原结果和失败保持，默认分析方法不因单轮观察自动切换。
- [x] 各阶段checkbox与机器状态一致，状态引用不留待执行的假任务。

### AL15 一次有限验证与独立复核

最终三项只读复核中，作者/前提及研究分账未发现可操作问题；host复核指出补读显式ID重复可使普通prepare通过first-match取错缺口详情。主线程确认具体路径后追加三项确定性反例：重复/默认ID碰撞、跨轮未执行reads身份、CLI逐项selector归属。修正仅由宿主分配唯一诊断ID，保留原request.id和读内容，不增加格式修订或付费调用。原58项及唯一研究修订59项freeze不改；最终离线工程修正另存verification-freeze，不能把当前实现冒充原真实调用实现。它不是第二个模型研究区块，真实64调用与所有原评分保持。

- [x] 跑下方相关回归、类型、文档与diff检查；只因新改动或真实失败再扩测。
- [x] 新研究脚本类型检查与零provider replay通过，核对分母、原/变身份、cache不重计、未知费用。
- [x] 对本轮变更做一次只读独立复核，重点逐项恢复、路径/引用边界、条件前提、普通作者接线和研究输入隔离；修具体缺陷后定向复验。

最终验证为433 pass/1平台skip/0 fail、2903断言；主与研究类型检查、七项零provider重放、评价重算、12项文档测试、链接与实验目录检查通过。58项原实现、59项研究修订和59项最终离线实现分别核验，85项登记来源绑定一致。三项独立复核已关闭，无未解决critical/important问题；实际USD和人力继续unknown。具体命令、预期红例与旧runner拒绝边界见结果根verification.json及final-review.json。

```powershell
bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl ./src/cli/authorization.test.ts ./src/cli/authorization-compose.test.ts ./src/cli/authorization-prepare.test.ts ./src/cli/authorization-edit.test.ts ./src/providers/structured.test.ts ./src/measurement/token-accounting.test.ts ./scripts/token-accounting
bun run typecheck
python ./scripts/check_skill_ir_doc_links_test.py
python ./scripts/check_skill_ir_doc_links.py --root .
git diff --check
```

新结果根的 `check/replay` 实际命令在AL8写入status和verification；它们不得偷偷连网或调用provider。历史冻结实现hash变化导致旧runner拒绝时记录边界，不改旧哈希来刷绿。

### AL16 提交推送和交付

- [x] 按工程、真实证据、文档分职责提交；仅暂存本轮归属文件，历史排除项和其他任务修改不混入。
- [x] 推送用户 `origin/skill-ir-aot`，核对远端SHA和工作区。无force push，无upstream写入。
- [x] 最终给出普通可用命令、四类核心缺口实际改善、质量与作者首稿/修订结果、完整成本和下一建议；完成后停止本任务。

工程、证据/示例`0c114823`及结论文档`bc591200`已发布；完整头`bc59120026ecd8035068ba26cdc76813971cf65f`通过git ls-remote与本地核对，工作区干净。证据入Git后，原链接检查日志内退役路径触发8条新引用；保留原日志和失败记录，在已有清单登记12项精确日志/目标对，19597文件扫描及12项文档测试通过。最终状态作为最后一个提交同步，实际最终SHA记根conversation_log和交付；没有待派发单元或自动后续调用。

## 7. 完成条件与调整边界

工程完成包括：有来源的位置选择、范围内校验、逐项补读恢复、有界跨轮上下文、普通作者诊断、明确条件表达、普通入口及原/变消费、可重放交付。真实研究可以mixed/negative；仍应完成承诺的工程和可执行研究行，未完成项目如实保留。

本轮不创建新任务类、全仓agent、通用调用图、生产安全决策平台或新展示层。复用已暴露development来源，旧Q1/held-out/prospective/readiness与历史结果不动；目标源码只读不执行。具体共享缺陷和小接口设计可自主修正并同步本书；方向性扩大再交用户讨论。
