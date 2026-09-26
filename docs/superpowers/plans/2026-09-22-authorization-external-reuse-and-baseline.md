# 授权任务 DSL：外部复用、可用交付与普通说明对照任务书

> **执行方式：** 使用 `superpowers:executing-plans` 连续执行，实现采用 `superpowers:test-driven-development`。2026-09-26 revision 2 从 AB9 恢复，AB0–AB13仍由同一个执行任务负责。恢复模型为 `gpt-6-astra / ultra`，使用用户请求的 Fast 速度配置，直接在 `skill-ir-aot` 工作，只推送用户 origin。原始 medium 开发和 Sol 被测结果保留其真实模型身份。

**Goal:** 将现有授权 DSL 变成可复用的有界任务工具，在新项目上由独立作者完成原任务和需求变化，并与信息完整的 Markdown 说明在共同执行底座上比较准备、修改、质量和开销。

**Architecture:** 保持 authoring/v2、canonical v0 和 compact v4，复用现有 source reader、host、provider、引用检查及 compare。交付薄 skill 使用包和源码定位辅助；研究入口允许独立编写的 Markdown 替换声明说明区，共同源码与输出合同由同一宿主提供。新项目仅作明确授权的外部开发验证，不改旧保护集或历史成绩。

**Tech Stack:** TypeScript、Bun、Zod、SkVM CLI/provider、认证 GitHub CLI。不上新平台、UI、通用模板解释器或仓库自动漏洞发现系统。

- 日期：2026-09-27；revision 2；状态：`verified-awaiting-publication`。AB0–AB12完成；16条真实结果原样保留，未重跑生成。
- 基线：`858e4778e3c84b19ee866d7cbd2d3556a1d6c334`；接手以任务书登记后的最新HEAD为准。
- 结果根：`results/skill-ir/skill-dsl-research/development/authorization-external-reuse-v1/`。
- 研究正文：[§7.25](../../skill-ir/skill-dsl-research.md#725-ab-外部复用与普通说明对照)。所有本轮问题、设计修订和结论归回该节。
- 开发Astra medium与被测`xty/gpt-5.6-sol`分开记录。美元无用户上限，实验调用仍按明确问题和固定单元执行。

## 一、承接结论与本轮选择

AA新鲜复核183测试/1337断言、typecheck通过，未发现阻断性实现缺陷。独立模型作者首稿1/2有效、一次行号修订后2/2完成；两组原/变运行得到源码支持的deny→allow。五组plain/ledger各5/5 full，ledger输入输出合计多54.6%，累计调用耗时多23.3%。header conditions解释更完整，但初轮一次检查器假拒绝造成修复，真实成本保留。

plain也使用DSL编译、引用绑定和验证。因此AA回答的是DSL内部输出轻重选择，尚未直接回答独立编写的普通说明与DSL的整体使用价值。本轮停止继续调旧六例来证明泛化，选择新项目、独立编写和变化任务。

本轮主要目标是外部复用与使用价值。优先稳定现有v2，先记录可复用字段与重复工作，再决定是否抽取共享模板；不预设必须新增DSL版本才能算开发。ordinary任务显式plain/v4，ledger用于覆盖审计、conditions用于显式条件分支，兼容默认不变。

## 二、阅读与责任

主执行代理依次读取：
1. `D:/skill优化/AGENTS.md`和适用仓内规则、`docs/skill-ir/current-status.md`、本任务书全文。旧C路线按历史，当前任务以状态页和本书为准。
2. 研究总文档§1–4、§7.24–7.25、spec14.34；设计原文亲读。
3. `src/benchmarks/authorization-dsl/{authoring,authoring-v2,local-input,local-run,change-report,host,telemetry,value-study,value-evaluate,evaluate}.ts`及相关测试；`src/task-dsl/authorization/{schema,semantics,render,compact-transport,conditions,result}.ts`；`src/cli/authorization.ts`。
4. AA的`summary.json`、`author-steps.json`、`field-responsibility.json`、`evaluator/adjudications.json`和公开v2例子。仅在核来源是否已暴露时检索研究来源登记，不读取旧Q1 reserve或其他保护材料正文。

拟修改：
- `src/benchmarks/authorization-dsl/source-location.ts`及测试（新）：显式文件的只读行号/片段定位，复用既有路径约束。
- `src/cli/authorization.ts`、`local-run.ts`及测试：接通locate和帮助，不增加另一套执行链。
- `src/benchmarks/authorization-dsl/markdown-study.ts`及测试（新）、host/render的窄扩展：独立Markdown输入研究臂，共用v4和计量，不伪装成旧P/N臂。
- `examples/authorization-assessment/reusable-skill/`（新）：薄SKILL说明、完整v2模板及用例说明，调用现有SkVM；制作SKILL时使用适用skill编写指导，不能复制一套runtime。
- 可读性整理限本轮触及的`authoring-v2.ts`、`change-report.ts`，将密集表达拆成可读函数，保持行为；不做全仓格式化。
- acquisition、作者试用、panel、rubric、review和replay脚本/数据在本轮结果根集中存放；稳定可复用能力才进src。

保护七项既有修改：`src/jit-optimize/evidence-criteria.ts`、`evidence.ts`、`loop.ts`、`validation-completion.ts`、`validation-lifecycle.ts`、`workspace.ts`及`src/skill-ir/skill-family-minimum-delivery-run.ts`。不reset/clean，不清理历史untracked，不创建新分支/worktree，不推upstream。

## 三、外部来源与任务选择

### 3.1 新项目获取

AB1在读取新正文前记录选择规则和候选顺序，允许联网和认证gh。按现有来源登记排除Open WebUI、FastAPI模板、Gitea及已用作相同授权案例的项目；技能语料曾提到项目名称不自动算源码已暴露，分别登记metadata/source/case exposure。

从公开、许可证清楚、可固定commit、有源码和测试/维护者规则的项目中列出最多6个候选，按登记顺序检查，选首两个合格且非fork/同源的项目。候选来自正常源码/文档检索，不按模型预计成功率排序；选择过程及不合格原因简记。不沿用会因一次网络失败丢弃全部已取得材料的事务式获取：缓存成功对象，遵守服务返回的限流等待/认证方式，临时错误每对象最多两次有原因重试；配额不足就保留结果并推进离线工程。

每项目选两项同类操作，优先覆盖所有者关系、角色覆盖或组织/租户边界中至少两种关系。每项有一个原场景和一个只改角色/资源关系/政策要求的变化场景；选入依据是源码和规范可解释，绝不看模型答案后换任务。不同项目无需刻意凑满相同语言/框架。

合格任务要求：显式政策来源或有权提供的用户要求；源码可见的入口/上游控制/受保护效果；原与变的差异可检查。把用户给定expectation与源码实际是否执行该政策分开。不是所有deny都正确，也不为了制造漏洞结论修改真实源文件。真实漏洞正例若自然满足资格可纳入，但没有也如实报告类型覆盖。

目标2项目×2操作×原/变=8任务状态；若只有1个项目或更少任务合格，保留缩小分母及原因，不拿旧例补成新迁移。该项是新外部development study，已经读取/修订的案例不改名成严格unseen成功。核心实现若因新案例修改，前后分开报告。

### 3.2 输入与oracle

每个任务有中立task brief：自然目标、作者有权确定的政策、角色/资源事实、原/变要求、允许源码与明确公共问题。不含漏洞答案、修复commit、期望模型结论或隐藏检查列表。evaluator-only目录保存上游测试/修复依据、事实链和评分；生成端只拿public目录。

取实际授权依赖闭包，不只摘能支持答案的三行；记录未提供的上游控制与决定性缺口。输入上限在选择前固定：每任务最多12个显式文件、源码最多40,000字符；超界记录为scope-too-large，不按oracle偷偷裁掉干扰代码。不执行目标代码、安装目标依赖或访问部署。当前源码行号与原始位置映射均保留。

## 四、可复用工程交付

### 4.1 薄skill包

交付一个授权任务skill使用包，明确支持角色/资源关系/政策/入口/证据/结果，不包含完整安全审查、secret/依赖扫描或patch。包内SKILL只说明何时使用、作者输入、调用现有check/run/compare、如何解释unknown及剩余职责；方法执行由真实DSL与程序承担。

同一包在两个新项目上使用，分别保存作者v2输入，不复制核心实现或写repo-name分支。包依赖现有SkVM运行时，安装/源码运行前提说清，不声称独立捆绑runtime。例子不含D盘绝对路径、历史results目录或evaluator位置。最终命令用真实本轮相对文件和session，不让使用者抄几十个内部ID。

制作前做字段复用表：共同领域词汇/宿主规则、项目政策与源码、每次角色/关系三层。先使用现有v2完整可运行声明。只有两个独立作者都暴露同类机械重复时，才增加小型确定性组合helper；允许白名单完整对象替换，不做隐式深merge、表达式继承或自动政策推断。无此证据就保留v2，不虚构模板收益；复用的证据是同一方法/代码/包处理新输入。

### 4.2 源码定位辅助

新增零模型只读入口：

```powershell
bun ./src/index.ts authorization locate --root=./project --file=src/access.ts --match=authorize
```

输出path、实际总行数、匹配行及邻近上下文，区分zero/unique/multiple matches，告知所有行号相对当前提供文件。它不自动把同名字符串认成函数、不猜完整函数范围、不替用户选入口；作者选择后填入既有v2 locations。路径读取复用source reader的root containment/portable path规则，拒绝绝对逃逸、junction逃逸与NUL。默认最多返回20个匹配并明确truncated，不静默挑第一个；帮助说明`--match`是字面匹配。

只定位用户给定文件，不递归搜索整个repo，不增加工具执行权限。MD作者也可使用同一工具，避免只给DSL组更好源码辅助。

## 五、普通说明对照设计

### 5.1 两臂与作者

- **MD：** 独立作者根据中立brief、源码及普通说明指南写完整Markdown授权任务，含同等政策/角色/问题；可使用相同locate和引用助手，不要求先填DSL。
- **DSL：** 独立作者使用同一brief、源码、v2说明与可复用包写authoring/v2；普通执行固定plain/v4。

两臂都用同一provider、相同源码字节/行号、共同基础安全范围、v4 plain输出合同、引用绑定、诊断修复机会和评价。MD生成提示的任务说明区必须来自作者真实Markdown，不能由DSL自动渲染后改叫普通skill；可视化保存两臂分节prompt，证明公共事实没有消失。

研究宿主可使用一份**中立评测manifest**保存task ID、source catalogue、输出obligation ID、政策/原变状态对照与评价绑定，供宿主核验；这由研究准备者一次提供、对两臂相同。只把必要输出ID/标签定义暴露到共同结果合同，不能把DSL方法或答案经manifest注入MD。如果现有canonical helper要求更多元数据，完整记录来源与用途，并把结论限定为“同helper下的说明与DSL流程比较”。不得宣称原始完整安全skill的原生效果或纯语法因果。

每项目每臂各一个干净上下文作者，共4个作者任务；每个作者完成该项目两操作的原/变材料。两臂相同最多2轮可操作诊断；来源/规范说明不足则通过同一brief补充并同时提供给两臂。作者不得看对方产物、历史assessment或oracle。按AGENTS用default、fork none、有界只读代理返回文件内容，主代理落盘不代修作者字段。若只允许一次性代理，修订用新干净接力并记录身份。模型作者与真人分列，文件系统隔离不作虚假声明。

作者原稿先归档再check。分别记录首次可运行、语义信息遗漏、修改轮次、改动路径/段落、重复改动、是否求助内部代码、准备/修改消耗（能测就测，未测unknown）。DSL独有编译诊断是方法的一部分，但共享工具和修复次数相同；本轮比较整套编写/执行流程，不把差异全部归因JSON语法。

### 5.2 执行接线

在研究模块新增类型和函数，不增加普通CLI的万能prompt override：

```ts
type ExternalReuseArm = "markdown" | "dsl";
interface MarkdownStudyInput {
  instructions: string;
  instructionOrigin: "independent-author";
  instructionPath: string;
}
// runAuthorizationTask只接收经研究runner确认的可选说明段。
// 两臂其余source/output contract/lifecycle完全共用。
```

增加窄的typed research input，复用`runAuthorizationTask`与`renderAuthorizationTask`的分节组合。MD替换instructions/declaration区域，保留共同结果合同与source catalog；不得同时把canonical task声明再拼进去。repair必须保留原臂材料、实际诊断和相同一次机会，不能回退到DSL提示。所有override身份/文本摘要/字符计量保存到session，普通DSL路径不受影响。未知来源或空Markdown在provider前拒绝。

不要求把MD作者稿确定性解析成完整DSL。数据检查/评分manifest对两臂相同，分别核作者稿是否保留公共要求；缺项属于编写结果，不能由主代理偷偷补齐。需要修复时按两轮诊断计入作者工作。

### 5.3 单元、预算与评价

资格满额时8任务状态×2臂=16初轮单元，两个臂按任务交替顺序，原/变都用fresh context。作者编写与执行分阶段；全部生成结束后读evaluator。普通任务保持plain/v4，不临时按答案给DSL加conditions，避免混杂方法轻重。

被测`xty/gpt-5.6-sol`、temperature0、auto-probe off、180秒/调用、600秒/单元、6000输出上限、最多4dispatch和1次诊断修复。有明确共享实现缺陷时只允许一次修订，最多两个受影响配对/4单元；初轮和修订分开。总至多20分析单元，作者代理成本另计；无美元上限但不为填满上限或运行时间重复请求。

若任务资格不足或作者终态失败，明确not-run及原因并继续独立工程。按所有预定任务状态报告成功/失败/unknown，不只看交付答案。模型已dispatch且完成未知不自动重发，迟到usage照计、不改历史交付身份。

主要指标分三组：
1. 编写/修改：首次可运行、往返次数、语义遗漏、需同步改动位置、内部知识求助、作者消耗。
2. 运行质量：决策、决定性控制、任务要求的解释、证据支持、未提供事实的unknown处理；格式与语义分列。
3. 总负担：准备、执行、修改、重跑分阶段provider调用和input/output/cache/time/actualUSD，未知不填零。

继续现有v3分层评价，响应细节仅在公开任务要求时进入必需项；等价Markdown答案可获同分。两臂同一rubric，不用DSL字段存在加分。新case保留初评、少量独立核验和有指针的裁决；审查争议靠实际源码/回答解决，不靠投票。

compare在DSL变化任务中真实运行；给MD组同一原始文件diff能力。DSL的结构化影响提示可作为方法收益，但输入变化识别与语义答案有效性分开。当前共享上下文变化会使全部场景需复查，这一行为如实记入复用限制，不包装成增量缓存省调用。

## 六、执行队列

### AB0：恢复与稳定接口
- [x] 读上下文并记录基线、保护文件、归属模块，建立单一status/journal。
- [x] 一次运行`bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl ./src/cli/authorization.test.ts ./src/providers/structured.test.ts`，基线183/1337。
- [x] 将v2、plain/v4与MD对照规则登记§7.25；本轮不主动加DSL版本、方法模式或更换模型。

### AB1：获取规则与可恢复来源
- [x] 先记录候选资格/排序/文件预算，再按§3获取最多6个候选，保留成功缓存和失败原因。
- [x] 选首两个独立合格项目，记录commit/license/source暴露；仅下载所需材料，不执行目标或接入部署。
- [x] 来源不足时终结该获取分支，继续locate、使用包和mock工程，不用旧例冒充新项目。

### AB2：任务、公共brief与独立oracle
- [x] 每项目选两操作与原/变条件，登记8状态分母或真实较小分母；不得依模型结果选样。
- [x] 建public与evaluator分目录，保留源码依赖/原始行位置及缺口；期望规范与实际源码事实分开。
- [x] 逐任务检查共同领域词汇能否表达，有新概念先写研究分析；局部细节可调整，超出授权任务类别则路由并保留失败原因。

### AB3：locate红绿实现
- [x] 新测试先红：唯一/多处/零匹配、CRLF、本地行数、truncation、escape/缺文件以及零provider。
- [x] 实现`locateAuthorizationSource({root,file,match,limit:20})`返回matches、lineCount、truncated与诊断，再接CLI；不执行match字符串。
- [x] 更新公共help与usage，两臂作者都可调用；运行`bun test ./src/benchmarks/authorization-dsl/source-location.test.ts ./src/cli/authorization.test.ts`。

### AB4：可复用skill包与重复分析
- [x] 用现有v2准备完整synthetic模板及薄SKILL说明，入口均指向现有SkVM，不绑定本轮答案。
- [x] 记录方法/项目/单次场景字段复用表，分别给两项目实例；核心实现中无仓库专名成功分支。
- [x] 此处只登记组合helper的触发条件；待AB6作者结果返回，在AB7判断是否有两作者共同机械重复。有则先写确定性替换/冲突/来源测试再实现，否则保持原v2且如实说复用层次。

### AB5：Markdown研究入口红绿实现
- [x] `markdown-study.test.ts`红测：MD原文进入说明段一次、无DSL声明暗中拼入、源码与v4合同一致、oracle不入prompt、repair不换臂。
- [x] 实现typed research override与runner；普通CLI无任意override选项，共用host/telemetry/引用检查。
- [x] mock验证正常、缺项、格式修复、超时关闭、恢复不重复dispatch，记录两臂prompt事实对照；不拿原P natural renderer冒充独立Markdown。

### AB6：四项独立作者工作
- [x] 材料固定后按项目×臂派发干净只读作者，主线程按AGENTS等待完成；作者不改src文件。
- [x] 保存首稿后运行两臂相同基础检查；最多两轮诊断由作者自行修订，主代理不改语义字段。
- [x] 记录原/变改动与介入、缺项和首次成功；独立失败保留，不补成虚假作者成功。

### AB7：共享输入准备问题修复
- [x] 作者暴露问题若属于共享实现，按明确反例修locate/diagnostic/loader/使用包；任务信息缺失则共同补brief并计入准备。
- [x] 可读性整理只触及本轮必要模块，纯重排与行为修复分提交，不跑全仓格式化。
- [x] 方法/公共问题/预算和最终初轮config在真实分析前确定；只提交实现、manifest和必要输入，不建多层冻结链。

### AB8：真实原/变对照
- [x] 按固定顺序执行16单元；通过普通入口运行DSL实例，MD走共同host的研究入口。
- [x] 逐次保存实际调用/响应/超时与usage；16/16 completed、0 completion-unknown、0 target execution，未替换或自动重发。
- [x] 每组变化后真实compare，保存MD原始diff与DSL影响报告；未额外生成演示答案。
- 结果：16 provider calls，known input/output/cache-read 为146,886/17,566/6,528，actualUSD unknown；原始canonical labels为14 `source_refuted`、2 `source_supported_failure`，后一项保留到AB9语义评价，不提前改写。

### AB9：评价与一次共享修订
- [x] 所有生成结束后按同一rubric评价，独立点验收益决定项、错误和unknown；保留初评与裁决理由。
- [x] 只有明确共享缺陷才追加红绿修复与至多4单元；可离线验证的机械修订优先离线，不洗初轮数字。
- [x] 输出每项目/操作/原变/臂质量与成本，不把多个运行当成多个独立skill家族。

### AB10：判断外部复用与方法价值
- [x] 回答同包/同schema/同核心代码复用了什么，准备了什么，哪些修改是新项目适配；区分未改核心迁移和事后修方法。
- [x] MD若同样好且负担更小，推荐MD或轻DSL并保留有用helper；DSL若减少遗漏/同步改动，指出具体例子与代价。结论不预设positive。
- [x] 将类别共同语义、近似反例与能力边界补入统一研究正文，只有新证据才改分类，不启动大规模重新搜skill。

### AB11：普通交付与有限验证
- [x] 可复用包在仓外普通目录或临时目录按真实路径check/run结果inspect/compare，不能依赖历史results绝对路径；复用已运行结果不追加付费。
- [x] 运行相关聚合测试与`bun run typecheck`，窄只读核验公共信息公平、来源/答案隔离、无隐式repo分支；不重做历史全量审计。
- [x] 报告尚需用户提供的政策/源码职责、runtime安装前提、当前模式选择，保留compat默认。

### AB12：统一研究、状态与复盘
- [x] 研究§7.25写实际问题→证据→解决→效果，更新当前结论；同步usage/developer-guide/current-status/plan/spec与任务书执行项。
- [x] `python scripts/check_skill_ir_doc_links_test.py`、`python scripts/check_skill_ir_doc_links.py --root .`；本轮JSON解析、一次summary离线重算、归属/敏感信息检查。
- [x] 根conversation_log只记阶段事实，机器资料集中一根；不新建一轮一份研究正文。

### AB13：发布与结束
- [ ] 只提交本轮归属文件，推送origin/skill-ir-aot并核对远端；七项原修改和历史untracked保持。
- [ ] 最终给出包、真实命令、新项目任务分母、原/变与两臂结果、准备/执行成本、失败及可复用结论。
- [ ] 按实际工作标complete/partial；研究负向可完整交付，未完成工作明确列出。任务结束停止扩展，不等待或重复调用凑时长。

## 七、连续授权与恢复

用户授权在当前路线执行以上工程和新外部来源研究；网络、认证GitHub与有目的付费调用允许且无美元上限。原Q1/held-out/prospective/readiness及历史成绩保持；新来源从本轮development登记进入。不得因旧阶段写着“停止”而停止本新任务。

每阶段更新同一status的nextAction，压缩后从未完成项恢复。常规路径、依赖、参数或schema错误自行修共享实现；独立工程与受阻研究分支分别推进，不等用户重复确认。主讨论任务交接后不并发改代码。用户未额外要求goal时不调用goal工具。

## 八、2026-09-26 中断恢复与独立并行任务（revision 2）

### 8.1 已核实现场

- 恢复前分支为`skill-ir-aot`，HEAD/用户origin为`c51e9b8be0bfe10ec0ace5068c64105709a533e8`。`75e737fd`已提交AB工程，`c51e9b8b`提交文档治理；恢复时使用本修订提交后的最新HEAD。
- 原执行任务记录的失败原因为账户usage limit，后续另做了用户要求的文档治理。它没有完成AB9评价。
- `status.json`与16个`runs/*/unit.json`吻合：16 completed、16次响应、0 completion-unknown。首次生成不用重发。来源为linkding与django-todo，方法与初轮输入保持原身份。
- 缺少`evaluator/review-decisions.json`、`panel-summary.json`与逐单元语义review；`evaluate-panel.ts`已存在，但要先逐criterion完成评价才能运行。
- 两个值得重点核对的原始结果是`linkding-asset-changed-dsl`与`linkding-remove-changed-dsl`：正文说明政策得到执行，canonical label却为`source_supported_failure`。评价应分别记录标签、实际allow/deny推理与解释完整性；不改原回答，也不把解释正确自动算成完整交付。
- 首稿、修订、prompt parity、compare、portable与工程review已有材料，先复用。工程review不替代语义review；fairness指控与既有裁决须点验公共prompt实际字节后裁决。
- `status.json`、panel config等已tracked；16条运行及一批辅助文件仍untracked。不是整个AB目录未提交。先用精确路径盘点并保留本轮原始证据，禁止清理历史untracked。
- 包内`examples/authorization-assessment/reusable-skill/authoring.json`有一行未提交修改：policy location从`authoring-v2.json#/policies/archive`改成实际`authoring.json#/policies/archive`。AB核实并收录，不覆盖回旧字节。另七项源码脏修改仍为保护项。

### 8.2 恢复步骤

- [x] R0：读取本书、当前状态和研究§7.25，确认16条终态与源文件齐全。以本地实际文件为准，不依赖已失效的processSession 7020。只做本轮检查，不再复跑AB0–AB8。
- [x] R1：对本轮未提交原始runs与辅助产物做一次归属/敏感信息检查，精确stage并提交保存；不stage整个results或全仓。此提交仅归档，不提前填写语义成绩。核对`run-panel.ts --check`会写final-checks，若内容不变无需重复运行它。
- [x] R2：完成AB9的16条逐criterion评价，保留具体答案指针与源码理由。独立审查只覆盖争议、错误和收益决定项。生成`evaluator/review-decisions.json`后运行以下命令；首轮与共享修订分开。

```powershell
bun ./results/skill-ir/skill-dsl-research/development/authorization-external-reuse-v1/evaluate-panel.ts
bun ./results/skill-ir/skill-dsl-research/development/authorization-external-reuse-v1/evaluate-panel.ts --replay
```

现有replay会重写派生review文件；它不修改原始run/result。若需要只读replay，先以测试说明差异再做窄修复，不能为“严格”另建一套回放平台。

- [x] R3：继续AB10–AB11，判断Markdown/DSL的作者负担、复用层次、质量和开销。普通用户包验证属于AB完整责任，不分给AC/AD。Markdown是研究入口，普通CLI无需新增任意prompt override。模型标签错误若没有可定位的共享实现缺陷，照实评价并交付，不硬凑追加运行；总预算仍是16初轮+至多4修订。
- [ ] R4：AB12–AB13照原合同完成。保留9月23日文档治理结构，避免回填历史流水。相关测试/typecheck与一次文档扫描足够，不通过长时反复核验补时长。

### 8.3 三个完整任务，独立目标与所有权

用户明确要求“其它方面的新任务书并行”，不是拆分AB。AC与AD不承担任何AB验收项，AB的完成与效果结论独立成立。

| 任务 | 独立目标 | 独占写范围 |
|---|---|---|
| AB（本书） | 完成现有研究评价、可复用包交付及发布 | 原AB结果根、既有授权运行/评价代码、reusable-skill；所有共享状态/研究/usage/spec/plan/catalog导航 |
| [AC编辑支持](2026-09-26-authorization-authoring-editor-support.md) | 让新作者在编辑阶段获得字段提示、结构反馈和语义检查路线 | `src/benchmarks/authorization-dsl/editor-support/`、`schemas/authorization/`、`examples/authorization-assessment/editor-support/`、AC结果根与AC任务书 |
| [AD结果工具](2026-09-26-experiment-catalog-maintenance.md) | 给项目已有实验目录增加可重复的查询、路径核验和可携带摘要导出 | `scripts/experiment-catalog/`、AD结果根与AD任务书 |

**单一Git发布者是AB。** AC/AD只写各自范围并运行focused测试，不执行git add/commit/push/reset、安装依赖、改lock/package或全仓格式化。AB也不修改它们的在写文件。所有任务都知道有其他开发者，必须保留他人修改。AC/AD把共享文档建议保存在自己结果根，AB一次性同步到现有文档。根conversation_log同样由AB汇总，侧任务不并发append。

AC/AD结束时最后原子写`ready.json`，包含`status=ready-for-integration`、`ownedFiles`、测试命令/结果、限制、共享文档建议路径，写好后停止修改。若部分受阻，写`partial-ready-for-integration`并列明仍缺项，不留一个永远等待的状态。中间用各自`status.json`记录。

AB执行完自身研究后按已派发任务ID用`wait_threads`等完成/需关注事件，不忙轮询。先核ready清单仅涉及独占范围，集中跑一次覆盖改动的测试/typecheck，分别提交AC、AD归属，最后同步导航与push。子任务确有核心缺陷需越界时在自己结果根`integration-notes.md`留下复现，不擅改AB核心；AB决定修复或保留已知限制。AB本轮收口和并行集成分别记状态，不能以侧任务未完改写AB研究状态。

### 8.4 模型、速度与恢复责任

三个主执行任务均`gpt-6-astra / ultra`。用户请求1.5× speed；派发宿主已查到`service_tier="priority"`，保持现有Fast配置，不修改全局其他设置。task API仅能显式指定model/thinking，记录实际返回或会话上下文中的service tier；不能只在prompt写“1.5x”就声称已生效，也不保证精确墙钟倍速。原始被测Sol与作者成本不改。

任务书与状态文档本次修订由规划任务提交；之后共享文档和Git索引只交给AB发布者。侧任务无模型业务实验或新来源样本，避免竞争provider额度。遇到真实配额中断，保留nextAction、未提交文件清单和终态，不误标completed；收到恢复指令后接着做。

## 九、恢复执行记录（2026-09-26–27）

- R1归档323个原始/辅助文件，索引字节与工作树一致；定向凭据扫描与JSON解析通过，七项保护源码哈希保持，提交`c2fe823d`。原始CRLF和源码空白不做格式清洗。
- AB9冻结逐项评价：MD 8 full；DSL 6 full、2标签错误；实际授权推理、必要控制和解释均16/16。初评/独立点验/裁决分存，未定位共享生成缺陷，追加单元0。离线summary SHA为`148dc88879dc46a623d26c297add02d85c00ebf0f9e70fd78692b784a558b917`。
- AB10同包/schema/核心有界复用成立，方法收益未建立；DSL分析token多12.0%、累计响应耗时少8.5%，作者负担方向不一致，USD/真人时间未知。
- AB11八份DSL输入在仓外临时目录通过check、保留wire离线执行、inspect、compare，原结果payload一致；这是交付验证，新增模型观察/网络调用0。八状态真实prompt parity通过；聚合测试待AC ready后执行。
- AD白名单12文件与11份digest核对通过，24测试/147断言及脚本严格类型检查通过，归属提交`ffc6578e`；AC待ready后整合。
- AC随后ready，13项文件及12份digest匹配，归属提交`8f27afb3`；集中授权测试202/202、1,919断言，编辑有限差分105/12及全仓typecheck通过。AD在更新后的三项catalog上check为0 diagnostics。侧任务均已停止写入，无待修缺陷。
- AB12文档测试12/12；12,377文件扫描broken/legacy/governance errors均0，107项历史引用和5项既有长度软警告保留。AB结果592 JSON、66 JSONL/190条记录均解析成功；定向凭据扫描0，七项保护哈希和323项归档原字节保持。最终核验及侧任务归属见结果根`final-verification.json`、`integration.json`。
