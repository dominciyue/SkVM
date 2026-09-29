# AM0–AM16：控制上下文、作者编写与证据复用

> **For agentic workers:** 使用 `superpowers:executing-plans` 逐项执行。本轮由一个开发任务负责实现、共享文档、实验与发布；子代理只做边界明确的只读探索或独立核验，遵守根目录 AGENTS 的派发规则。用户已授权连续完成本书，常规阶段记录进度后继续，不等待再次确认。

**Goal:** 让有界授权任务保留决定性控制上下文，减少作者重复填写机器已知信息的负担，并在政策或前提变化后可靠复用原材料，通过普通入口和真实消费检验结果。

**Architecture:** 继续使用现有 authoring/v2、analysisContract/v1、wire/v6 和 SkVM authorization 入口。宿主负责位置、预算、已知元数据、缺口传递与结构诊断；模型负责声明领域事实和分析控制路径。Markdown/DSL 共用准备材料和领域事实，分别计量回答质量与编写、修改、复用负担。

**Tech Stack:** TypeScript、Bun、Zod、现有源码词法索引、provider/telemetry、Python 文档检查；不引入新的 CLI 平台或完整调用图框架。

---

## 1. 执行约定与上下文

- 日期：2026-09-29；初始状态：`planned-not-started`。
- 代码基线：`5426a0e62720313b0715a5940248a033ec114f80`。本书及状态文档的规划提交将位于该基线上；AM0记录实际启动提交。
- 分支：`skill-ir-aot`；只向用户 `origin/skill-ir-aot` 发布，不开新分支，不写 upstream。
- 开发任务：`gpt-6-sol / max`。被测模型沿用 `xty/gpt-5.6-sol`，实际配置在每次运行账户记录。
- 新结果根：`results/skill-ir/skill-dsl-research/development/authorization-control-context-v1/`；仅 AM0 开始时创建机器状态。
- 质量和任务解决约占研究重点60%，作者编写与修改复用约40%；分别报告，不用加权总分掩盖失败。
- 网络、认证 GitHub CLI、必要远端模型及付费调用已获授权，没有用户设定的美元上限。采用下述有目的的实验规模；失败留账，不靠反复请求挑选成功。
- 不执行目标仓库代码，不读取新的 held-out/Q1/prospective，不改变旧 readiness、旧结果或分析默认。
- 持续推进到 AM16：工程问题能修就修；模型回答不理想按原分母结算。完成后交付并停止本任务，不凑时长或自动开新研究。

**必读顺序：** 根目录与仓库 AGENTS → [当前状态](../../skill-ir/current-status.md) → 本任务书 → [spec 14.34](../../skill-ir/skill-ir-aot-optimization-spec.md#1434-按-skilltask-范围设计领域-dsl)的当前 AM 合同 → [研究总文档](../../skill-ir/skill-dsl-research.md) §7.30–7.32及相关当前方法 → [使用说明](../../usage.md)、[开发指南](../../skill-ir/developer-guide.md)。AL任务书和结果是历史对照；不要再执行其关闭的队列。跨线程恢复需要时读取根目录 handoff、communication 和 conversation_log 的最近相关记录。

## 2. 复核结论：这一轮具体解决什么

父任务在 AL 完成头核验433 pass、1平台skip、2903断言，typecheck与零模型评价重放通过；本地与origin一致。AL的20计划质量行首答6完整、最终8完整，另列共享修订2/4完整。作者结构有效5/8→6/8，严格语义4/8→5/8，消费义务7/16→9/16完整。以下缺口来自具体代码和归档材料。

1. **读到了helper，最终材料仍丢控制正文。** OWUI修订已把完整helper展示给定位模型，最终只选1458–1467与1527–1534，评价范围77行仅保留18行。最终10,173字节，尚未用满64KiB预算。Download修订补足后两臂完整，但最终60,547字节。下一步同时关注控制上下文和材料膨胀，不能只增加补读轮数。
2. **作者修订没有保留同一输出合同。** AL `authors.ts` 原请求要求 `{assessment,evidenceRequest}`；修订请求保留schema与诊断，却遗漏原输出规则和公开brief。Paperless原稿JSON不完整，修订稿返回裸assessment，仍被旧包络检查拒绝。原响应为`end_turn`、1,745 output tokens，6000上限未用满，不把它解释成已证实的token截断。
3. **修改工具与语义评分要求不一致。** Memos新政策已改，但`policy.reason`、`analysisContract.publicInstruction`仍称original policy。现有edit能改reason，尚无公共指令/回答要求的定向文本操作；实验又限制了可改字段。下一轮先给作者完成修改所需的普通接口，再检查语义一致性。
4. **复用过程丢了缺口。** AL `consumers.ts` 重建request时只合并成功dependencies，未传递`proposal.gaps`。Paperless原/变源码相同，准备报告却partial→ready、gaps→空；旧缺口只存在job说明中。需让准备材料、未解决问题及来源一起复用，区分未解决、已解决、因任务变化不再相关。
5. **历史full口径不同。** AK将部分准确source-gap unknown计full，AL要求允许范围内可补源码缺口为partial。下一轮固定“回答可靠性”和“任务解决”两个独立维度。旧评分原样保留，跨轮总比例不当作同口径趋势。

这些问题可以在共享准备、作者支持与复用层处理。本轮继续同一授权任务类，使用已暴露development材料和重命名合成测试，不新增任务类别。

## 3. 方法与接口决定

### 3.1 有界控制上下文

现有 `indexed-symbol` 已能指向完整符号。复用它和现有词法索引，增加一个可选的上下文组装策略，建议普通入口为 `authorization prepare --context=callable-v1`；省略时保持现有行为。AM1结合实际参数解析固定名字并同步本书，再实现。

- 对已选中且宿主确知范围的小函数/方法，优先保留完整可调用单元；不再默认将头尾片段冒充函数正文。
- 大函数超预算时，保留显式选择的片段、可确定的外围控制范围和省略记录。词法索引无法可靠识别控制范围时，报告范围不确定；不要通过猜缩进或附近关键词编造控制路径。
- 类只展开与已选方法相关的上下文；不因选中一个方法就自动带入整个类的全部方法。
- 新增上下文仅来自固定repo/ref和allowedFiles，记录触发选择、原范围、扩展范围、截断及预算。未展示的新正文不能伪记为模型已经审阅。
- 为兼容“最终选择必须已展示”的原规则，宿主确定性扩展单独记为`host-context`来源；先校验源身份、范围和预算，再交分析模型。模型原始选择与宿主新增材料分列。
- 明确保存`unit-complete`、`unit-partial`、`range-uncertain`等机械状态。完整函数范围仍可能调用未读依赖，语义充分性由独立评价判断。
- 继续合并重叠片段、保留原行号、拒绝跨省略区间引用；辅助材料不增加入口、scenario或分析义务。
- 继承12文件/1MiB索引读取、累计64KiB展示、最终64KiB、深度3。输出字节、累计展示、重发与prompt tokens分账；为工程可行性统一调整预算须在真实生成前说明，对两表示相同。

### 3.2 作者只填写未知的领域内容

宿主已经知道的repository/ref、sourceRoot、入口位置、allowedFiles和稳定标识由程序生成。作者负责政策、主体、资源、前提、期待与任务要求，不从目标源码自动推定“应当允许”。

通过现有 `authorization init` 增加可选context输入，输出authoring/v2草稿、entry seed及紧凑填写指引；沿用原默认template。建议 `--context=<context.json> --out=<draft.json>`，同目录派生 `draft.entry-seed.json` 与 `draft.authoring-guide.md`；所有文件创建前检查冲突，不覆盖旧稿。AM1记录最终字段与命名。

草稿缺少必要领域字段时标`needs-input`，给具体路径；用户补齐后沿现有check/prepare/run。不要为了草稿结构通过而制造accepted政策或隐式非空owner。作者任务只生成完整authoring声明或规定的edit，不再让模型重复输出宿主可生成的evidenceRequest包络。

首稿与修订共享同一任务对象：公开brief、输出形式、允许修改字段、必需事实始终一致。修订只追加前稿和诊断；完整schema通过普通文档或紧凑字段提示提供，避免一次次重发无关大段。

### 3.3 说明与前提可以被完整修改

扩展现有local edit，使作者能定向修改已存在的publicInstruction及requiredResponseDetails，并继续支持policy.reason。一次edit可以包含政策正文、关联expectation与受影响说明；只改明确指定的字段。

宿主生成的指引使用“当前声明政策”等稳定引用，减少复制具体政策版本。作者自由文本保留，给出受影响字段清单，供作者确认或更新；不靠关键字替换自动改写所有自然语言，也不把未变化文本一律视作错误。

语义评审判断新政策和前提是否一致。只有具名结构错误、越界路径或冲突才阻止应用；普通文本复核提示不引入额外用户批准步骤。

### 3.4 准备材料和缺口一起复用

提供共享prepared-material复用函数，并接入现有prepare的可选 `--reuse=<previous-assessment.json>` 路径。变更后的authoring作为`--input`；纯政策或前提变更可以零模型复用旧源码材料，沿现有check/run/compare继续。

- 输入来源绑定、源文件实际字节、repo/ref和原范围仍匹配时复用；任一改变则明确失效或转重新准备，不能静默沿用。
- 保留原成功依赖及所有pending gaps，包括proposal/read阶段产生的缺口和来源信息；引用和gap ID稳定可追溯。
- “已解决”需要新材料或新的确定性定位结果；“不再相关”需要明确任务范围/前提变化理由，保留原缺口历史。未提供依据时保持pending。
- 纯前提对照主口径保持同一source包和gap元数据。若另做相关性重新判断，单列材料干预，不能并入纯前提效果。
- analysis模型可依据公开前提判断某上游gap对当前问题无影响；不得把每个pending gap一律解释为不能回答。
- 有必要增加可选元数据字段或版本时保持旧格式读取兼容；不要为每个阶段建立重复hash门。旧结果与freeze不变。

### 3.5 固定评价与停止规则

每行分别记录：`answerFidelity`（supported/unsupported/incomplete/blocked）、`resolution`（determinate/conditional/unresolved/blocked）、未知原因、首答/最终、过度弃答、传输状态。具体机器枚举由AM8固定，并测试计数规则。

- 准确说明真实外部未知可有良好fidelity；只有满足任务请求的条件回答才算resolved。
- 允许文件中未补齐的决定性源码记source-gap；作者未指定的前提与部署事实未知分开。
- 包能解析、材料ready、来源覆盖、语义回答、端到端开销各列，不合成一个成功率。
- 实验负结果仍产出可运行工程和原因分析。没有“必须跑出正向才结束”的要求。

## 4. 文件与职责地图

下列新文件名是本轮建议模块，执行时先检查现有职责，能在已有小模块内完成的不要机械新增一层。

| 职责 | 主要生产文件 | 测试/实例 |
|---|---|---|
| 控制单元与范围策略 | `src/benchmarks/authorization-dsl/evidence-preparation/control-context.ts`（新），`location-selection.ts`、`discovery.ts`、`proposal.ts`、`prepare.ts`、`schema.ts` | 新`control-context.test.ts`及同目录已有tests |
| 普通准备与复用 | 新`evidence-preparation/material-reuse.ts`，`src/cli/authorization-prepare.ts` | 新`material-reuse.test.ts`、`authorization-prepare.test.ts` |
| 作者草稿和修订合同 | 新`src/benchmarks/authorization-dsl/authoring-assist.ts`，`authoring-v2.ts`、`editor-support/`，`src/cli/authorization.ts` | 新`authoring-assist.test.ts`、`authorization.test.ts` |
| 有界文本修改 | `src/benchmarks/authorization-dsl/authoring-workspace/local-edit.ts`、`src/cli/authorization-edit.ts` | 对应已有tests、`owner-premise.test.ts` |
| 研究runner与评价 | 新结果根的`study.ts`、`evaluate.ts`、`authors.ts`、`tsconfig.json` | 新结果根`study.test.ts`，零provider `check/replay` |
| 普通示例与说明 | `examples/authorization-assessment/evidence-editing/`、`task-semantics/`，`docs/usage.md`、`developer-guide.md` | 原有example tests与一次仓外搬移 |

代码阅读抓手：`location-selection.ts::selectEvidenceLocation`；`discovery.ts::discoverAuthorizationEvidence`及class/member扩展；`proposal.ts`选择与二轮上下文；`prepare.ts`片段/依赖合并；`authoring-v2.ts::lowerAuthorizationAuthoringV2`；`authoring-workspace/local-edit.ts::applyAuthorizationLocalEdit`；CLI prepare合并`proposal.gaps`的路径。历史AL的`authors.ts`与`consumers.ts`只读定位，不修改归档脚本。

## 5. 实验安排：小而完整的一轮

### 5.1 离线机制验证

沿AK/AL同八个已暴露seed，使用已有响应/符号选择零模型重放，核对新旧组装策略的控制范围、字节、缺口和义务数。旧响应与新packing是机制对照，不冒充新模型提议。加入重命名函数、重复符号、多行Python声明、同类不相关方法、跨片段引用和预算耗尽等合成反例。

### 5.2 四项新准备与16个质量session

固定任务：`owui-file`、`paperless-download`、`memos-get-shared`、`paperless-share-create`。每项从原entry seed新准备一次，共四个job；领域brief、ref、白名单和预算沿已公开合同。生成前固定真实输入清单与所有行ID。

基线使用AL最新有效材料：OWUI/Download采用其`shared-revision`材料，GetShared/ShareCreate采用AL初轮发布材料。旧GetShared的AK空材料不再混入本轮。具体assessment、report、proposal路径由AM0从AL真实账户解析，写入本轮manifest；不靠成功数量猜路径。

每任务两种材料（上述AL基线/AM新材料）×两种表示（Markdown/DSL），共16个fresh质量session。全部使用当前相同分析实现、`plain`、`explicit-v1`、`wire=v6`、`reasoning=standard`、同模型和相同修复机会；按任务交错顺序。每种材料由两表示共享一次准备，不给DSL额外helper。评价oracle不进入prepare/作者/分析输入。

这16行检验端到端准备材料效果；纯packing机制由离线同proposal对照判断，避免把模型随机选择变化全部算成宿主策略收益。四项准备失败仍保留对应两行blocked，不换任务。

### 5.3 两包8份作者稿、8个消费session

固定Memos政策变更与Paperless owner前提变更，共两包×MD/DSL×原/变=8份计划首稿；每稿最多一次基于普通诊断的修订。原稿无效则依赖的变稿与消费blocked，仍保留计划分母。

MD/DSL作者获得同一公开brief、已知源身份/入口材料和相同事实。DSL可使用真实普通init草稿与edit指引，MD获得等量机器已知事实清单；记录二者不同的准备操作。不要把领域答案或evaluator校正稿给作者。

两包准备材料在消费前各建立一次，共享给两表示及原/变；需要模型定位时各最多一个job。Paperless仅将原owner未指定改为other-present，保留absent反事实要求；Memos只改政策及关联期待和必要说明，源不变。使用AM复用模块保证同包原/变的源码和pending gap信息一致。

有效稿最多8次fresh自然消费，计划16项义务，实际展开单列；四组compare检查旧结果需要复查。评审分别记录首稿/修订结构有效、政策前提一致、作者/宿主承担字段、修改范围、消费结果及gap不丢失。真人分钟保持unknown。

### 5.4 调用、修复与成本

主研究为四项准备、16质量session、8份作者首稿、8消费session；另至多两项共享作者材料准备。每prepare沿两轮定位加一次格式修订；每作者首稿至多一次诊断修订；分析沿现有一次机械修订/fallback合同。单调用300秒、session900秒、输出上限6000 tokens，真实派发前核对项目现有配置并记录。

存在可重复的共享实现bug时，先用确定性反例修复，保存旧结果；允许一个修订区块，最多两项受影响准备与8个受影响分析/消费session，行选择规则在派发前写入。普通低分、合理unknown、主观希望更好均不触发重抽。

每次请求含失败/timeout/修订都记账；响应不确定不自动重发。连续两次基础设施失败时先做离线工程，最多两次有理由的连通性恢复检查；仍不可用则关闭付费子流为blocked，继续可做的交付。配置变化单列区块。

完整prompt按provider定义将cache计入一次；fresh input/cache read/write/output分别保留。展示字节、源文件字节、实际调用耗时与墙钟分开，费用未知保持unknown。修复前后的成本分别保留，最终报告包括整轮总数与主面板成本。

## 6. AM0–AM16 执行队列

所有实现步骤采用：写具名反例 → 确认预期失败 → 实现共享逻辑 → 聚焦转绿 → 同步接口与问题记录。下面片段表达拟新增接口的行为合同，AM1对齐实际类型后落入测试，禁止仅复制一段没有接线的伪代码。按完整职责提交，不为单断言拆提交。

### AM0 启动、基线与真实路径

- [x] 核对分支、工作区、规划提交和当前任务归属，创建新结果根`status.json`和追加journal；记录nextAction、恢复命令、失败状态，禁止重跑已完成paid行。
- [x] 定位AL四项基线材料和两包原/变稿，记实际路径/来源/已有运行身份；只验证本轮会用的文件，不重审全部历史。
- [x] 保存本轮作者与分析输入隔离约定；保护原raw/cache、旧临时副本及其他线程修改。

### AM1 四个反例与接口定稿

- [x] 将OWUI“头尾入包/中段遗漏”、Paperless修订丢包络、Memos说明残留、Paperless复用丢gaps做最小化fixture，保留原证据定位。
- [x] 亲读要改的代码，固定context策略、init context、文本edit和reuse的公共参数/返回字段；能复用的已有类型不另造。记录于本书与研究§7.32。
- [x] 固定各层责任：host元数据/字节；作者政策/前提；模型分析；评审决定性控制。尚缺领域事实的草稿保持needs-input。

AM1接口定稿（2026-09-29）：普通prepare采用`--context=callable-v1`，只适用于request/v2；省略保留原路径。最终prepare从实际读取的源码复用词法索引，对已纳入片段的唯一最小可调用单元扩展，按增量字节/源码位置分配预算；不猜控制块，大单元保留原选择并报告省略。发现器在该策略下仅保留相关类头与被引用方法，不枚举全部成员。报告v2增加可选`controlContext`及`materialBinding`，来源`host-context`与原选择分列。

init采用`--context=<context.json> --out=<draft.json>`；context版本为`authorization-authoring-context/v1`，含taskId、可选request、repository/sourceRef/sourceRoot、allowedFiles及entries（entryKey/path/startLine/endLine）。输出同目录`<stem>.entry-seed.json`和`<stem>.authoring-guide.md`，draft领域字典为空并给needs-input诊断。生产`renderAuthoringTask`使用同一publicBrief/outputContract/editScope/knownFields/fieldGuide，修订仅追加candidate/diagnostics。

local edit增加`public-instruction`（statement）和`response-detail`（scenarioKey/index/statement），只替换已有文本；policy.reason仍走policy操作。affectedText列受影响reason、instruction、responseDetails，提示不阻止正常应用。prepare采用`--reuse=<previous-assessment.json>`代替request，零provider验证当前完整源摘要与旧绑定、保留原快照/成功依赖/pending gaps，并要求fresh analysis；旧报告无完整源绑定时具名失效、需重新prepare。共享gap生命周期函数接受具名新证据或明确前提/范围变化理由，默认保持pending；纯前提主实验不提交gap变更。

### AM2 完整可调用单元与机械状态

- [x] 写控制上下文纯函数测试，建议新接口行为如下；`unit`由既有索引产生，不能来自oracle：

```ts
const packed = buildControlContext({
  selected: [{ path: "guard.py", startLine: 10, endLine: 12 }],
  units: [{ id: "guard", path: "guard.py", startLine: 10, endLine: 30, kind: "function" }],
  sourceText, allowedFiles: ["guard.py"], maxBytes: 65536,
});
expect(packed.ranges).toEqual([{ path: "guard.py", startLine: 10, endLine: 30 }]);
expect(packed.units[0].status).toBe("unit-complete");
expect(packed.expansions[0].origin).toBe("host-context");
```

- [x] 加入函数重命名、多行声明、同名重复、无法确定边界的红例，边界不确定时给出range-uncertain，不能任取第一个符号。
- [x] 实现共享索引适配与范围策略；原selector、原行号/CRLF行为不退化。
- [ ] 运行新`control-context.test.ts`及`location-selection.test.ts`，确认反例转绿。

### AM3 预算、类方法与关键省略

- [x] 先测选择类中一个方法时不自动纳入全部无关方法；嵌套作用域与外层控制范围只在可靠索引下扩展。
- [x] 先测超预算保留合法已选范围并输出partial/omission，不能标unit-complete；重叠去重、重发字节分账，unsafe路径/ref漂移仍拒绝。
- [x] 实现稳定的范围排序和预算分配；不要用项目名、期望答案或评价行号排序。保存每项纳入/省略原因。
- [x] 运行 `bun test ./src/benchmarks/authorization-dsl/evidence-preparation`，确认新增support不改变声明入口数。

### AM4 普通prepare接通控制上下文

- [x] CLI测试省略新选项完全沿旧行为，新策略能形成含host-context的可引用材料，报告区分模型选择与宿主扩展。
- [x] 接通proposal→context→prepare→check/run；最终新增正文通过实际来源验证，不能混淆“给定位模型展示”与“给分析模型展示”。
- [x] 测试同一source存在省略时跨缺口引用拒绝；ready仍标declared-dependencies-only，机械完整状态不升级为语义充分。
- [x] 运行 `bun test ./src/cli/authorization-prepare.test.ts ./src/benchmarks/authorization-dsl/evidence-preparation`。

### AM5 宿主作者草稿与普通init

- [x] 先测context已给repo/ref/入口时精确填入草稿与entry seed；缺政策/期待时列needs-input，不调用provider、不生成accepted事实。
- [x] 新`authoring-assist.ts`用现有schema/normalizer生成known-fields及缺字段指引；正常完成后的声明仍走现有authoring/v2。
- [x] init新可选context接线并输出前述三个文件；冲突、路径问题在写出前拒绝，旧template命令保持。
- [x] 运行 `bun test ./src/benchmarks/authorization-dsl/authoring-assist.test.ts ./src/benchmarks/authorization-dsl/authoring-v2.test.ts ./src/cli/authorization.test.ts`。

### AM6 相同任务合同下的修订

- [x] 将作者输入组织为一个共用任务对象；首稿/修订由同一renderer产生，修订只追加candidate和diagnostics。测试核心断言：

```ts
const first = renderAuthoringTask(task);
const repair = renderAuthoringTask(task, { candidate: invalidDraft, diagnostics });
for (const required of [task.publicBrief, task.outputContract, task.editScope]) {
  expect(first).toContain(required);
  expect(repair).toContain(required);
}
```

- [x] 归档缺包络旧例做回归，但新作者普通任务只产出规定的声明/edit，宿主entry seed不要求模型重写。
- [x] 共用提示生成放生产支持模块；研究runner只负责派发/存档，不维护另一套隐藏schema或答案提示。
- [x] 测试诊断不带evaluator oracle，不因修订扩大源码或政策修改权限；原稿/修订费用可分别重算。

### AM7 政策与前提修改的说明一致性

- [x] 给现有local-edit增加具名text操作，覆盖publicInstruction/requiredResponseDetails；保留reason、policy/scenario/premise现有操作。
- [x] 先测policy+expectation+reason+instruction能一次修改，未指定字段和源码不变；未知字段、越界索引、冲突操作拒绝。
- [x] 输出affected-text字段清单与复核提示；不自动把自由文本里的original全部替换。host生成新指引引用当前政策，减少重复版本描述。
- [x] 作者allowed edits与评审要求使用同一公开合同；运行local-edit、CLI edit和owner-premise聚焦tests。

### AM8 材料缺口生命周期与评价协议

- [x] 先测相同源/纯前提变化保留success dependencies和原pending gaps；不会因没有再运行proposal而清空缺口。拟新增接口行为：

```ts
const reused = reusePreparedMaterial(previous, changedTask, verifiedSources);
expect(reused.sourceBytes).toEqual(previous.sourceBytes);
expect(reused.pendingGaps).toEqual(previous.pendingGaps);
expect(reused.requiresAnalysis).toBe(true);
```

- [x] 测试源字节/ref变化使复用失效；解决缺口需新证据，任务不再相关需显式理由，未知旧版本能拒绝而不丢记录。实现普通prepare的reuse路径。
- [x] 建立独立评价枚举与汇总测试：准确unknown不被算成确定解决；完整条件答案可resolved；blocking仍进计划分母；评分重算不访问provider。
- [x] 固定四项准备、16质量行、8稿/8消费、16义务及可执行修订规则。旧评分不覆写；必要时只增一份零调用双口径说明。
- [ ] 提交工程和本轮协议，登记一次实现身份、预算与输入路径。研究driver的`check/replay`命令在status中给出完整可执行写法。

### AM9 离线八任务和四项真实准备

- [ ] 用同八seed/归档proposal比较旧packing和AM packing；报告范围、字节、unit状态和gap，无模型时不得记新准备成功。
- [ ] 四个主job各真实准备一次，按顺序保存全部请求/响应/预算/补读和最终材料；不按oracle补选helper。
- [ ] 对实际材料做独立控制覆盖核验；机械范围与语义控制分别给出，确定是否确实补OWUI中段、是否避免Download无关膨胀。

### AM10 16行质量配对

- [ ] 以相同当前分析实现fresh消费AL材料和AM材料，MD/DSL共享每份输入；首答/repair/final和blocked全部保存。
- [ ] 生成关闭后匿名复核fidelity与resolution、关键控制/前提、过度弃答和错误确定性；盲化映射保留，分歧基于源码裁定。
- [ ] 输出逐任务配对与完整分母，不以这16行推断总体泛化或把不同评分的AK/AL总率连成趋势。
- [ ] 若命名共享实现bug触发唯一修订区块，先写红例修复并预登记受影响行；原面板不改。

### AM11 作者首稿、修改与八次自然消费

- [ ] 两包8计划作者稿使用普通init/check/edit及相同公开brief；一稿最多一次诊断修订，主代理不代写领域字段。
- [ ] 按协议为每包建立共享源码与gap材料，原/变复用同一材料；检验domain field变化及旧结果needs-review。
- [ ] 对有效稿执行8计划消费、16声明义务；分别评价作者语义和消费答案，记录任何多展开/少展开及原因。
- [ ] 检验source、gaps和条件元数据的一致性；政策reason/instruction残留与已过时反事实说明逐项评审。

### AM12 普通可搬移示例

- [ ] 更新现有evidence-editing与task-semantics实例：context草稿→check→prepare context→run→edit→reuse→compare→重新run。
- [ ] 文档给出无需研究driver的实际命令。零模型步骤与付费步骤标清，不要求用户手写日志、hash或评分协议。
- [ ] 一次具名仓外复制验证相对路径、源绑定、pending gaps和修改反馈；不额外调用模型重复演示，不处理旧被拒删除目录。

### AM13 方法结果与端到端成本

- [ ] 汇总共同控制上下文收益、同材料表示差异、作者首稿/修订有效率及复用完整性；两个评价维度并列。
- [ ] 报所有调用、prompt/output/cache、源/展示字节、费用未知项及准备一次多次消费的真实分摊，保留未消费准备的成本。
- [ ] 按实际证据建议新策略的适用条件和是否仍opt-in；普通分析默认保持。负结果指出尚未支持的具体控制/输入，不追加无目的样本。

### AM14 文档与开发复盘

- [ ] 在研究§7.32持续追加“问题—根因—共享修改—反例—真实结果—剩余限制”；不新建分散的研究总报告。
- [ ] 同步usage、developer-guide、spec/plan/current-status、实验目录与本书checkbox，保留旧AL结果与费用。
- [ ] 每个有意义阶段追加根conversation_log；只有需要跨线程恢复的durable决定才同步handoff/communication，避免重复全量改写。

### AM15 一次有限验证与只读核验

- [ ] 执行以下相关回归、类型、文档及差异检查。新研究脚本使用新结果根tsconfig做独立类型检查；修复只定向补跑，最终有代码变化才更新相关总验证。

```powershell
bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl ./src/cli/authorization.test.ts ./src/cli/authorization-compose.test.ts ./src/cli/authorization-prepare.test.ts ./src/cli/authorization-edit.test.ts ./src/providers/structured.test.ts ./src/measurement/token-accounting.test.ts ./scripts/token-accounting
bun run typecheck
python ./scripts/check_skill_ir_doc_links_test.py
python ./scripts/check_skill_ir_doc_links.py --root .
git diff --check
```

- [ ] 零provider重放本轮统计与评价；核对首答/修订分账、全部失败行、两评价维度、source/gap继承和主/修订实现身份。
- [ ] 做一次有界只读独立核验，聚焦控制范围、gap丢失、作者修订合同、编辑边界和实验公平性；修具体缺陷，不发起全历史审计或新效果轮次。
- [ ] 凭据检查仅针对将暂存文件，不打印key。旧冻结runner因实现变化拒绝时记兼容边界，不替换旧hash刷绿。

### AM16 发布与交付

- [ ] 按工程、证据、文档分职责提交，仅暂存本轮归属文件；核对diff、推送origin/skill-ir-aot并验证最终远端SHA。
- [ ] 给用户普通命令、新机制实际使用结果、16行质量和8稿/8消费结果、成本、已解决/剩余问题；结束时工作区只允许明确归属他人的既存修改。
- [ ] 全部工程、可执行研究行和交付结束才标完成；确有外部阻塞的子流记清状态，不能把尚未做的工程写成无适用项。

## 7. 完成标准与可自主调整范围

工程交付应包含可选控制上下文、已知元数据草稿、同合同修订、定向说明编辑、带缺口的材料复用，以及现有CLI可走通的例子；质量结论按真实结果填写。所有新增能力须在普通路径实际使用，不能只在研究脚本里修复。

执行者可以基于源码修正小接口、测试布局和实现细节，先同步本书与研究节再继续；有命名风险才增加验证。保持当前任务类、原公开任务事实、源白名单、原/变关系和对照公平性，不扩成全仓发现、通用安全决策、另一套DSL或展示平台。未测真人工时和美元成本继续明确记unknown。
