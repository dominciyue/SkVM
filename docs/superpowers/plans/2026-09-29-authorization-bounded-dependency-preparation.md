# AK0–AK16：有界依赖准备、源码片段与普通任务闭环

> **For agentic workers:** 使用 `superpowers:executing-plans` 连续执行；实现使用 `superpowers:test-driven-development`，异常用 `superpowers:systematic-debugging`。用户已确认 AJ 复核后的方向并要求派发 `gpt-6-sol / max`。一个执行任务负责代码、共享文档、研究调用和 Git 发布；只读探子可做独立检索与核验。不在常规检查点等待确认，不把历史停止记录当作本轮停止指令。

**Goal:** 作者提供任务与政策、分析入口和允许读取的源码范围后，系统能帮助补齐必要依赖，用不膨胀的源码片段准备可引用材料，并通过现有普通入口完成原任务与变化任务的真实分析。

**Architecture:** 复用 authoring/v2、analysisContract/v1、wire/v6、现有 prepare/edit/check/run/inspect/compare 与计量。源码准备阶段增加可选、有预算的定位流程；分析阶段继续使用固定材料与零执行工具。入口决定分析义务，辅助源码决定证据范围，两者独立。多片段通过显式来源映射接入共同 loader/catalog/citation 链，旧连续片段和旧结果保持兼容。

**Tech Stack:** TypeScript、Bun、Zod、已有 portable source reader、provider 生命周期与 token-accounting、SkVM CLI、Python 文档检查。

- 日期：2026-09-29；状态：`ready-for-publication`，AK0–AK15完成，AK16白名单提交与用户origin发布收尾中。
- 基线：`b0cfbc1053791adb9444194141da78bb6c679a9c` 加本规划提交；直接使用 `D:/skill优化/SkVM` 的 `skill-ir-aot`，只推用户 origin，不建分支/worktree。
- 开发任务模型：`gpt-6-sol / max`。被测模型继续 `xty/gpt-5.6-sol`，沿用已配置 provider；开发代理、准备、作者、分析和评价成本分列。
- 结果根：`results/skill-ir/skill-dsl-research/development/authorization-bounded-preparation-v2/`。
- 唯一研究正文：[研究总文档](../../skill-ir/skill-dsl-research.md) §7.30；小设计调整写入本书和该节后继续，不另建研究正文。
- 投入倾向：质量约60%，编写、修改和复用约40%，分别验收。
- 网络、认证 gh 与有目的付费调用已获授权，无用户美元上限。下面的单元/调用约束用于防止实验漂移和无意义重试。
- 连续推进到 AK16；完成后交付并停止。不要靠等待、重复历史审计或追加无关任务延长执行。

## 1. 本轮从什么问题出发

AJ 父任务复核：376 pass、1 平台 skip、2597 assertions，typecheck 和两个 evaluator replay 通过，Git 与 origin 一致。两种表示在增加准备材料后均从初轮4/8提升到7/8 full；有界源码准备已有值得深化的质量线索。

具体缺口：

1. `evidence-preparation/prepare.ts` 对同文件范围取最小起点和最大终点，纳入中间无关字节；余量再扩成整文件。Paperless share-create 的 `serializer-user` 仍受64KiB预算阻挡。
2. Paperless DSL 作者把3个helper写成额外入口，两次消费各由2场景变为8义务。支持材料的增加意外改变了工作范围。
3. AJ 的真实准备依赖由研究者事先编写；可选模型 proposal 只有mock，固定窗口限制了它能看到的helper。需要验证“不提前告诉所有依赖”的使用路线。
4. `proposal.ts` 在解析失败时抛出不带response/usage的普通Error；CLI只输出错误。父任务用带input=123/output=7/cost=.001的模拟响应复现了用量丢失。AJ真实proposal调用为0，旧69调用统计不受影响。

路线选择：优先修共享材料准备和范围控制，保留现有输出协议与任务类。增加更多同义分析字段，无法替代缺失源码；直接扩大为全仓agent则使问题和预算失去边界。本轮采用指定入口与文件白名单内的有界定位。

## 2. 执行者必读与恢复

按顺序亲读：

1. 根/仓库 `AGENTS.md`、[current-status](../../skill-ir/current-status.md)、本书、[当前计划](../../skill-ir/skill-ir-aot-optimization-plan.md)、[spec §14.34](../../skill-ir/skill-ir-aot-optimization-spec.md#1434-按-skilltask-范围设计领域-dsl)。旧AGENTS中的C/F路线是历史内容，以当前入口为准。
2. 研究§1–2、§7.10–7.15、§7.29–7.30、§11；此前分类已确定单repo/ref、源码可见授权/信任边界任务，本轮沿用。
3. AJ结果根的 `panel-summary.json`、`author-use-summary.json`、`material-audit.json`、`case-selection.json`、`panel-config.json` 和 `verification.json`；只抽查Paperless缺口与Memos条件标签争议，不通读所有raw。
4. 本书代码图中的实际待改文件、[使用说明](../../usage.md)、[AJ可搬移示例](../../../examples/authorization-assessment/evidence-editing/README.md)。
5. 根handoff/communication只在恢复缺上下文时查；每个有意义阶段追加 `D:/skill优化/conversation_log.md`。

中断恢复依次读本书、AK status/journal、Git差异和未结束调用记录。status须记录阶段、下一命令、未派发单元、已派发未知请求、变更文件与待提交项。已派发但完成未知的请求不自动重发；未派发队列可以继续。计划中的工程项若失败，修复或明确保留未完成，不能以“所有适用项完成”略去。

## 3. 设计合同

### 3.1 任务范围和角色

- 保持单repository/ref、作者提供政策与问题、显式分析入口；只读候选源码，不执行目标、测试、插件、构建脚本或部署。源码文字与注释属于分析数据。
- 优先复用现有 `request.entries` 与 `request.dependencies` 区分分析入口和支持位置。依赖中的 `from` 绑定入口或其他依赖，加入它不改task.entries、不新增scenario、不展开额外义务。
- 不按函数名猜测“helper应该不是入口”后静默删声明。真正请求多个入口时保留原行为；作者误声明时，预览显示入口数、场景/义务数与来源，让作者根据共同brief修正。独立作者的修正要保存首稿和诊断。
- 模型只建议源码位置、定位需求和来源关联，不修改政策、expectation或填入授权答案。准备报告不把“已找到函数”写成“控制有效”。

### 3.2 多片段与引用

新增显式版本的准备report/可选普通输入支持，旧v1继续按旧合同读取。请求/报告版本分别按真实变化升级，不为了统一编号改无关schema或wire。

建议的来源映射形状（AK1根据现有接口定稿，名称变动同步本书）：

```ts
export interface PreparedSourceSegment {
  originalStartLine: number
  originalEndLine: number
  snapshotStartLine: number
  snapshotEndLine: number
  origins: string[]
}
export interface PreparedSourceFile {
  path: string
  originalPath: string
  segments: PreparedSourceSegment[]
}
```

- 一个物理快照文件可以由多个不相邻的原始行片段组成，但必须通过映射解释；不得把拼接位置当成原始连续行号。同文件重叠/相邻片段合并，远距片段不自动补中间内容。
- 复用既有完整文件/快照摘要，保持原字节、CRLF、Unicode和末行语义。source catalog使用原始行号；render显式显示省略区间，citation必须完全落在实际存在的片段内，跨缺口引用拒绝。
- 原始path、repo/ref、声明entry坐标、snapshot坐标与catalog需端到端一致。只修改prepare报告而不修改loader、引用校验和compare，不算接线完成。
- v2按入口优先、声明依赖稳定顺序、合法提议稳定顺序装入。默认不把余量自动填成整个文件。正文UTF-8字节、渲染字符、provider token分别记，不用JS字符串长度冒充字节预算。
- 支持来源路径映射的普通loader负责机械验证：范围有序、无重复/重叠歧义、snapshot行数匹配、原始entry有对应证据、状态与gap一致。来源完整性依靠实际读到的固定ref字节；不另建层层摘要和审批。
- `ready/partial/invalid`保留。ready描述已请求/已定位的材料，不声称发现了所有潜在控制。有效partial可以继续分析；未包含必要入口、越界或映射歧义不给可运行输入。

### 3.3 有界自动定位

普通作者最少提供任务/政策、源码根与ref、分析入口、允许文件；允许已有依赖清单为空。保持现有显式依赖模式和check-only零provider路径。扩展 `authorization prepare` 的显式选项，复用现有CLI，不另建运行平台。

实现分两层：

1. 宿主在白名单内读取/建立定位索引，使用已有literal locator、明确import/符号引用或行范围形成可核对的候选位置。复用已有解析能力；语言规则无法确认时保留歧义，不为每个项目硬编码。
2. 可选模型依据任务和实际展示的候选片段提议位置，或请求有界的补充源码窗口。宿主只接受白名单文件上的literal/range读取请求，不接受shell、网络、任意工具或超出预算的扫描。

默认每次准备最多2次正常提议调用；第1次可提出待读位置，宿主读取后第2次完成位置列表。无须补读时只调用一次。仅结构无效允许一次diagnostics-only修订，因此每个准备job最多3次派发；从反馈中得知分析答案后再改选源码不属于该流程。候选文件最多12个、最终源码64KiB、已指名依赖深度3；候选定位总读取上限1MiB、展示给提议模型的源码总量64KiB UTF-8，两轮累计计量。AK1可在任何真实调用前根据现有材料作一次有依据的共同预算调整，记录理由，所有比较臂保持对应预算一致。

- 提议中的行号须来自实际展示过的窗口。宿主可用待读请求读取新窗口再展示，不接受模型编造未见坐标。索引、窗口、候选拒绝、去重和预算耗尽可追踪。
- 不向定位器传AJ dependency答案表、旧分析回答、evaluator标准或专家完整依赖。候选文件宇宙可以是已暴露材料的公开文件范围，必须明确它仍由作者提供；本轮不声称从任意仓库自动找到入口。
- 缺失符号、同名歧义、动态分派、外部事实、定位预算与最终材料预算分别报告。条件未知不能靠多读无关文件强行变成已知。
- 准备结果接现有普通run；两种表示共享同一次准备产物和缺口，不各自生成有利材料。

### 3.4 每次准备调用都留账

在派发前创建已有风格的attempt记录，响应/usage先留账，之后才校验JSON/位置和发布产物。必要字段包括阶段、attempt ID、模型/路由、dispatch/终态、响应或错误、已知usage、费用null与原因、时间、解析诊断、输出是否发布。

返回有效JSON、无效JSON、schema拒绝、位置拒绝、超时、provider错误、取消及发布失败，均可恢复计数。已知字段保存，未报告字段不补零。利用现有provider生命周期/计量设施，不创建平行支付框架。对provider内部fallback逐调用记录，不能把一个外层调用算作一次实际请求。

计量产物可以保存在与可运行输出分开的attempt目录；失败留下可读诊断而无ready assessment。输出父目录、覆盖和基本写入可行性在付费派发前检查。CLI异常不能只写stderr后丢失已返回的usage。

### 3.5 变化后复用

政策/关系变化走已有edit；源码未变且读取范围相同，可以复用原始源码快照，仍重建任务和准备依赖身份。源码或定位范围变化时重新核对并按需准备。compare继续检查所有实际输入依赖，原答案需fresh run；不按引用子集自动复用判断。

对作者而言，入口和support分开后，应能改政策、保持无关场景和固定分析范围。政策text/location/revision不一致只在有明确来源证据时诊断，不强迫为每次等价文字修改虚构新上游版本。

## 4. 实际代码职责

| 位置 | 修改责任 |
|---|---|
| `src/benchmarks/authorization-dsl/evidence-preparation/schema.ts`、`prepare.ts`及测试 | v1兼容、v2片段、稳定预算、来源/缺口和支持角色 |
| 同目录新增 `segments.ts`、`segments.test.ts` | 行片段合并、物理映射、UTF-8计数和确定性选择纯函数 |
| 同目录 `proposal.ts`及新增 `proposal.test.ts`、`discovery.ts`、`discovery.test.ts` | 受限候选窗口、两轮位置提议、无答案依赖定位与失败响应保留 |
| `src/benchmarks/authorization-dsl/inputs.ts`、`local-input.ts`及测试 | 源码映射、catalog与普通输入验证、跨缺口引用 |
| `src/task-dsl/authorization/transport.ts`及引用相关测试 | 仅修改多片段引用必须接入的部分，保持wire/v6和旧协议 |
| `src/cli/authorization-prepare.ts`、对应test及已有路由help | 薄选项、预检、尝试归档、原子产物发布与失败说明 |
| `src/benchmarks/authorization-dsl/local-run.ts`、`change-report.ts`及实际依赖收集处 | 当前准备材料进入session/inspect/compare，复用旧计量 |
| `src/benchmarks/authorization-dsl/authoring-workspace/`、现有编辑schema和help | 只做入口/support预览与变化使用所需调整，不重建composer |
| `examples/authorization-assessment/evidence-editing/` | 扩充同一例子：多片段、无完整依赖输入、角色、原/变普通运行 |
| AK结果根内脚本 | 小型准备、面板、作者和评价编排；通用逻辑必须在src中 |

待改文件先亲读。测试fixture可以复用已有帮助函数；新符号名与精确路径在AK1确认后同步。无需修改的候选文件不为凑任务而编辑。

## 5. 研究和真实使用设计

### 5.1 三个问题分开回答

1. **确定性表示收益：** 对AJ已有8份完整请求，用同一64KiB预算比较v1连续范围与v2多片段。零模型检查实际纳入依赖、缺口、字节、引用和义务数；这部分隔离范围算法。
2. **普通准备能否接管工作：** 从只有入口/政策/允许文件的seed出发，实际运行新准备器，记录发现和缺失，不由研究者补依赖后再报自动成功。
3. **最终回答和复用如何：** 实际消费上述产物，与现有研究者显式依赖流程比较；拆开源码准备、分析和作者开销，不把公共helper的增益归为DSL表示。

### 5.2 质量面板

使用AJ原8任务、原固定ref与公开任务事实，完整保留分母；不新增项目/skill、保护集或prospective。材料均已暴露，定位为development。主面板四臂：

| 臂 | 任务表示 | 准备路线 |
|---|---|---|
| M0 | AJ独立作者Markdown | 现有显式完整依赖请求 + v1准备 |
| D0 | DSL | 与M0完全相同的材料 |
| M1 | 相同Markdown任务 | 入口seed + 新有界定位 + v2多片段 |
| D1 | 相同DSL任务 | 与M1完全相同的材料 |

v1显式请求来自AJ既有请求，不故意削弱；自动准备不接触它。这是“作者先列依赖”和“系统帮助找依赖”的整流程比较，报告前置作者投入差异。算法单独效果由5.1零调用同请求比较承担。AJ旧模型结果只作为历史背景，不与新生成拼成配对。

- 32初轮；在新响应前固定Paperless share-create和Memos GetShared各四臂一次重复，共40session。输入/源码预算、模型、plain/v6、standard reasoning、explicit-v1和公共要求相同，依任务交错顺序。
- 新定位每任务只准备一次，M/D及重复共同复用；失败准备保留为该任务失败/partial，禁止看到答案后手补。若无法生成合法材料，相关质量单元记preparation-blocked并保留在计划分母。
- 保留原公开问题、政策、oracle语义。只因新材料解决原来缺口而需要区别“已知/缺失”时，在模型回答前建立明确的新材料评价版本。评价不能以旧裁剪缺失为由惩罚已进入上下文的真实证据，也不能对仍然缺失的条件要求确定答案。
- 单次调用300s、session900s、最多6000输出token，沿用一次机械诊断repair及真实fallback记账。所有臂一致。初答/最终、质量/传输/准备失败分别汇总。
- Memos GetShared条件标签问题作为固定回归。若找到共享合同/归一化缺陷，以确定性反例先修并记录；若只是模型语义错误，保留结果，不把特定答案写进提示词或自动改标签。

### 5.3 作者与变化使用

沿用Memos/Paperless两个包、每包两声明场景；独立Markdown/DSL作者各做原稿和一次变化，共8份交付。作者只见共同任务brief、公开源码范围、角色说明和普通命令，不见专家依赖/他臂稿/答案。允许Markdown正常局部编辑，DSL用已有patch，不人为强迫基线重写全文。

- 原稿目标是准备输入，而非抄写全部helper坐标。记录作者实际必须补哪些字段、是否误把support当入口，以及准备后是否需要人工式定位。
- 首稿结构/语义不符各最多一次明确诊断修订，保存首稿、修订和来源。主代理不得代填领域字段后计作作者成功。
- AK12执行修正：两份DSL原稿的研究driver说明没有明确request/policies/schemaVersion的完整结构，normalizer在缺版本时只返回版本诊断，导致首修仍遗漏字段。用既有editor结构validator可确定复现request/policies等遗漏；接入完整schema与结构诊断后，登记两次额外纯格式修订（每个DSL原稿一次），独立保存为diagnostic-correction。原首稿/首修与失败结论保留，额外调用与方法偏离单列；不由主代理填写领域字段，不重抽分析答案。这是本书§7允许的小接口/执行预算修正。
- 8个普通fresh消费session，16个声明场景；展示展开义务数，任何额外入口均记录。两种表示共享可复用源码准备，但各自作者失败与修订独立记账。
- 准备job最多另4个（两个包原/变）；纯政策变化优先复用实际未变源码，源码变化按共同规则重新准备，记录是否再次调用模型。
- AK8固定的作者变化是Memos政策变更和Paperless受控helper源码变更（synthetic新ref，原始635行只限制非owner的change_document object grant）。Memos使用现有local-edit政策patch；Paperless只修改作者原稿的sourceRoot/sourceRef，因local-edit/v1明确不接受源码身份，使用普通文件修改后重新准备。原稿允许复用AK已真实自动准备的同入口、同白名单、同ref快照；源码变体对先前实际定位的请求重新读取/校验，不从专家清单追加位置。纯政策变化复用相同快照并重建任务身份，均需compare和fresh run。
- 其中一项变化采用已有公开源码的另一个固定版本，或标为synthetic的受控源码副本；为新字节设置明确的新sourceRef，原来源只读。不得执行目标。区分源码变化与政策变化，保持无关场景并通过compare→fresh run检查。

### 5.4 评价、预算与失败处理

优先指标：决定性错误、完整回答、合理unknown/过度弃答、来源与控制对象绑定、首答可用性。准备层单列必要依赖覆盖、未解决定位、预算丢弃、无关字节和意外义务；没有独立标注依据的“无关”记为未测，不凭token下降推断。

两种表示同材料比较；新旧准备同任务比较；作者首稿/修订、修改字段、无关变化和调用分别比较。匿名评价核对真实源码与政策；模型评价或开发代理复核的身份如实标明，不冒充真人。争议保留理由和敏感性，generation不读oracle。

AK11–AK12评价纠正：消费首答来自最终所选作者稿的fresh run，不等于作者首稿；正确报告变化政策冲突是成功分析。Paperless作者brief的“not owner”未排除helper的owner=None成功分支，按冻结前提评主结果，附加非空foreign-owner假设仅作敏感性。质量问题另有明确different-user ownership，不混用。保留两轮评分及源行裁定，不改task/source字节、不追加模型分析；这属于评价前提纠正，不触发共享实现修订配对。

正常计划40质量+8消费session；准备最多12job、每job最多3调用，作者8首稿各最多一次诊断修订。一次经确定性反例证实的共享实现修订允许另8个预先登记配对session；初轮不覆盖。不因低分重复采样。

先串行完成一个任务的整组运行，再考虑并发2。连续两次基础设施失败时先继续独立工程和离线评价；恢复前最多一次连通性检查，整个阶段最多2次。换endpoint/model须另立完整配置区块，保留原失败，不能只替换失败行。网络长期不可用时交付真实未完成项及恢复命令，工程完成不能替代计划中的真实消费。

## 6. AK0–AK16 执行队列

每个实现阶段遵循：先加入下表指定失败测试并运行，确认预期失败；实现共享逻辑；运行聚焦测试转绿；相关接口和本书同阶段更新。按完整职责提交，不为每个断言创建提交。

### AK0 恢复和执行状态

- [x] 核对基线、分支、origin和工作区；只记录实际差异，不重复AJ全量审计。
- [x] 创建AK status/journal，登记唯一写者、调用分账和下一命令；旧临时删除受策略拒绝的记录不再重试或换工具绕过。

### AK1 接口与可复现反例

- [x] 亲读准备、catalog/citation、普通loader和生命周期；确认本书代码图、版本与类型，更新§7.30。
- [x] 加入远距片段超过连续预算、support扩大义务、invalid proposal丢usage、窗口外helper四个小反例；用现有AJ材料作离线对照。
- [x] 定稿新report/source映射与可选准备参数，写出旧v1兼容表及真实调用配置；不把全仓发现塞入本轮。

### AK2 提议失败留账

- [x] 为invalid JSON、schema错误、位置拒绝、timeout、取消、输出不可写和已存在目录编写mock测试。
- [x] 将dispatch/response记录放在解析和发布之前；失败输出包含attempt位置、已知usage及未知原因，没有ready产物。
- [x] `bun test ./src/cli/authorization-prepare.test.ts ./src/benchmarks/authorization-dsl/evidence-preparation` 转绿；实测mock 123/7/.001保留，check-only调用数0。

### AK3 多片段纯函数与预算

- [x] 新建segments模块与测试：重叠/相邻合并、远距不补空隙、稳定排序、重复计费去重、UTF-8/CRLF/无末换行。
- [x] 测试远距10–12和900–902两段均进入预算，缺口13–899不进入；mandatory入口超预算返回invalid，辅助超预算返回partial。
- [x] 实现v2选择并保留v1行为；不默认填满剩余预算。

### AK4 普通来源与引用接线

- [x] 先测试多片段原始行引用、跨缺口引用拒绝、错映射/重复坐标拒绝、相对路径搬移和旧连续输入仍可读。
- [x] 接通loader、catalog、renderer、transport、session/inspect和compare；M/D看到同字节源码与相同缺口，entry原始位置仍可核对。
- [x] 聚焦运行 `bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl/inputs.test.ts ./src/benchmarks/authorization-dsl/local-input.test.ts`，记录新增的映射/引用用例与实际结果。

### AK5 有界定位索引与窗口

- [x] 新建discovery模块，测试白名单/读取预算、候选在文件第120行以外、重复符号、嵌套依赖、循环和动态未知。
- [x] 从入口与真实词法/显式关联形成候选，宿主按请求读取额外窗口；所有片段都有原始位置，绝不执行目标或任意命令。
- [x] 为缺失/歧义保留诊断；禁止导入evaluator、AJ完整依赖表或写项目名成功分支。

### AK6 可选模型定位与普通prepare

- [x] 接通两轮位置建议、至多一次格式修订、统一预算和每次留账；现有手工依赖路径、旧默认、check-only保持兼容。
- [x] mock验证第1轮请求新窗口、第2轮有效定位、未展示行被拒绝、路径越界、全部失败可恢复和重新运行不会覆写原尝试。
- [x] 普通命令产出可run输入/报告/尝试目录，真实核心不藏在研究driver里。

### AK7 入口/support及变化预览

- [x] 给check/prepare预览和作者schema说明增加入口、support、场景与展开义务计数及具体来源；优先复用现有字段。
- [x] 测试同两场景加入3个support后义务数不变；显式增加真正分析入口时按原规则展开，不静默压掉用户任务。
- [x] 复用edit/compose处理原/变；源内容改变或片段范围变更均使compare提示复查，政策变化保留无关字段。

### AK8 零调用准备评价与真实计划固定

- [x] 在AK新目录复用AJ八任务原字节与请求；完成同请求v1/v2准备对照及source mapping检查。
- [x] 建立entry-only seeds、两条路线、公平M/D材料、独立依赖覆盖评价表、40单元顺序与作者brief；不读取新skill或新项目。
- [x] 在任何AK真实准备/分析调用前固定输入规则、模型、预算和评价版本；一次实现/配置身份足够，不加重复冻结链。

### AK9 真实准备与产物核验

- [x] 对8任务各运行新有界准备一次，记录每个候选窗口、提议/拒绝、usage和最终gap；不得事后手补使其变ready。
- [x] 普通check验证v1/v2产物和M/D事实等价；准备失败保留分母，其他任务继续。
- [x] 真实报告指出哪些helper由系统找到、哪些仍需作者补充、哪些外部事实仍未知；准备收益不预定。

### AK10 质量面板

- [x] 按固定顺序运行40计划单元，复用既有session生命周期与修复规则；已完成/未知单元不重发。
- [x] 保存全部首答、修订、fallback、失败和分项成本；没有合法准备材料的单元保留preparation-blocked。
- [x] 全部初轮关闭后再生成匿名评价包，不边看答案边修改材料。

### AK11 独立语义评价与一次有据修订

- [x] 独立复核行为、决定性证据、政策/条件与标签一致性；对Paperless和Memos争议提供逐项来源，两轮评分及裁定保留。
- [x] 分开汇总同请求packing、实际自动准备、质量、表示以及全流程成本；原分母和完成配对均报告。
- [x] 未发现确定性共享分析缺陷，修订not-needed、追加分析0；前提与评价纠正不重抽模型。

### AK12 独立作者原/变使用

- [x] 两包MD/DSL各原/变，共8首稿；3正常修订、§5.3登记的2额外诊断纠正分列，保存原始交付，主代理未代修领域字段。
- [x] 实际准备/消费8session、16声明场景；记录展开义务、入口/support错误、修改扩散、源码/政策来源一致性与fresh结果。
- [x] 四组compare与新运行对应；作者、准备、分析分别计量，真人分钟没有测量就保持unknown。

### AK13 可搬移普通示例

- [x] 扩充既有evidence-editing示例，提供完整的显式多片段和可选模型定位命令、partial说明、edit/check/run/inspect/compare。
- [x] 搬到一个已登记的仓外测试目录，验证相对引用与来源行号；零模型演练不能替代AK12。
- [x] 本轮具名临时演练目录登记并保留供复核；没有执行清理，旧策略拒绝副本不动。

### AK14 方法取舍与文档同步

- [x] 统一更新研究§7.30、§11、usage、developer-guide、当前状态、plan/spec和实验目录；机器细节留results。
- [x] 说明哪些任务适合自动准备、何时应显式列依赖、实际剩余作者负担与预算影响。旧默认兼容；本轮数据只支持对应显式使用建议。
- [x] 同步已完成阶段checkbox与当前进度；AK15/AK16待完成后置终态，不另建平行研究正文。

### AK15 一次有限验证与离线复算

- [x] 相关402 pass/1 skip、主/研究脚本typecheck、文档12测试/链接、10项目录及定向凭据扫描通过。
- [x] AK准备/面板/作者/消费/评价/总账零provider重放，核对分母/cache。旧AJ面板评价复现，旧AJ作者评价因local-run冻结哈希不同拒绝；旧身份不改、不重复审计。
- [x] 新鲜diff审阅和一次独立只读核验通过；第二轮只展示补窗的质量限制记为minor后续事项，不改已冻结初轮。

```powershell
bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl ./src/cli/authorization.test.ts ./src/cli/authorization-compose.test.ts ./src/cli/authorization-prepare.test.ts ./src/cli/authorization-edit.test.ts ./src/providers/structured.test.ts ./src/measurement/token-accounting.test.ts ./scripts/token-accounting
bun run typecheck
python ./scripts/check_skill_ir_doc_links_test.py
python ./scripts/check_skill_ir_doc_links.py --root .
git diff --check
```

研究脚本实现后须提供 `check/replay` 零调用入口及实际精确命令，登记在AK verification和示例中；replay没有网络/模型副作用。主程序验证用Bun，不使用Vitest替代bun:test。

### AK16 发布与交付

- [ ] 工程/示例、实际证据、文档分职责提交，白名单暂存本轮文件；历史raw/cache及本地排除项不纳入。
- [ ] 推送用户 `origin/skill-ir-aot`，核对真实远端SHA和Git工作区；不推upstream、不强推、不新建分支/worktree。
- [ ] 最终回答包含可直接执行的普通命令、实际自动找到/仍缺的依赖、同任务质量与完整成本、作者首稿/修订、未完成项和下一建议；工程完成和效果结果分别陈述。

## 7. 完成标准与允许调整

工程完成须同时包含：失败调用留账、多片段来源/引用、入口/support不扩大义务、有界真实定位、普通运行接线、原/变真实使用和可复现交付。正常首答不要求全对；研究结论可以mixed或negative，但具体承诺的工程与真实使用不能被“结果混合”代替。

预算、接口小修正和有证据的共享bug由执行任务自主处理，先更新当前设计再继续。任务类别、全仓发现、目标执行、保护集访问、历史结果改写属于范围变化，不自行扩大。保留Q1、held-out、prospective、readiness、历史0/6、既有source blockers与失败原件。

用户要求的是完整能力推进；不要把每个内部阶段变成等待批准的小项目，也不要为了证明DSL更好削弱Markdown、增加答案提示或筛掉困难任务。
