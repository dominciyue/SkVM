# AS0–AS19：授权任务局部语义展开与真实交付

> 执行配置：gpt-6.1-sol / max。用户已授权本轮连续开发、必要联网与模型调用、提交并推送用户 origin；常规阶段不停下来重新询问。
> 使用 writing-plans 编制。实施时使用 TDD、systematic-debugging 和必要验证；用户现有授权覆盖常规设计细化及可逆实现，不再等待重复设计批准。

更新于 2026-10-04。状态：**in-progress；AS0–AS7 共享实现和确定性检查已完成，AS8/AS9 处理两次有明确响应的 Schema 拒绝，具名传输修订待复验**。实际接管基线 `c90787f09087b3c79ac1d73b47f970ab928894e0`，当时工作区干净且用户远端同 SHA。分支始终 `skill-ir-aot`，只推用户 `origin/skill-ir-aot`。AR 进程结束，研究及真实使用验收仍有未达项；AS 承接责任，不回写旧结果。机器状态见 [AS status](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/status.json)。

## 一、目标与完成标准

让用户给出真实 skill、自然任务、允许源码范围和必要前提后，现有 SkVM 入口能够组织取证、解释分支、形成一致的授权回答；模型专注源码语义，宿主承担稳定身份、有限路径、状态推进和结果关联。继续沿用“按 skill/task 确定范围，设计领域表达与执行支持”的方向。

本轮同时推进工程、使用和对照，开发投入大致六成质量、四成编写复用。约 12 小时作为主动工作安排；不等待、无依据重试、反复全量审计或增加报告来凑时间。若提前达到验收，完成 AS17 的适用深化后交付；有根因可处理时继续修复，不以“已经有测试/文档”结束。

完成分别判断：

| 维度 | 本轮验收 |
|---|---|
| 共享实现 | 显式选择/合流、目标效果与返回区分、同源结果、局部修复进入共用核心；旧接口有回归 |
| 真实使用 | 两个已有来源 skill 经 native 普通入口完成各自原任务和变化任务；保留完整原 skill、原问题与剩余职责 |
| 回答质量 | 每项必要问题有源码支持的确定或条件完整回答；真实外部未知有具体原因。形式 checked 与语义完整分别核对 |
| 变化复用 | 真实授权任务上的政策/前提 fresh 与 previous 可比；源码变化先保证失效及 fresh 正确 |
| 方法效果 | 小块比较识别执行支持与表示贡献；允许 mixed/negative，修后结果不覆盖首答 |
| 发布 | 新机器状态、一次相关联合验证、普通示例、统一研究复盘和用户 origin 同步 |

“计划行已终态”“工程已接通”“真实使用完成”“质量收益建立”分别记录。无法完成某项时保留具体缺口、修复结果及下一操作，整体写 `completed-with-unmet-criteria` 或 `in-progress`，不以完成清单代替验收。

## 二、必读上下文

按顺序阅读，避免全量重读数月档案：

1. `D:/skill优化/AGENTS.md`、`D:/skill优化/SkVM/AGENTS.md`。
2. [当前状态](../../skill-ir/current-status.md)、[当前计划](../../skill-ir/skill-ir-aot-optimization-plan.md)。
3. 本任务书全文；[spec §14.34](../../skill-ir/skill-ir-aot-optimization-spec.md#1434-按-skilltask-范围设计领域-dsl)的共同原则、AS 合同及涉及的 AR 兼容条款。
4. [研究正文](../../skill-ir/skill-dsl-research.md)§1、§7.36 的根因分析、§7.47 的原件点验、§7.48 当前方法。旧阶段按问题定位，不全量顺读。
5. [开发指南](../../skill-ir/developer-guide.md)的当前授权定位与详细 inquiry 合同；[普通使用说明](../../usage.md)。
6. AR 的 [status](../../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/status.json)、[handoff](../../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/handoff.json)、[evaluation](../../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/evaluation-summary.json)、[ordinary adjudication](../../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/ordinary-adjudication.json)。这些是停止前快照，AS 另建当前状态。
7. 本地简明 `D:/skill优化/project_handoff.md`；治理恢复需要时查 `project-maintenance/20261004-governance/README.md`。通信与 conversation log 仅按主题补读。
8. 修改前亲自读相应实现及测试。子代理只作狭窄只读探索/核验；按最新 AGENTS 使用 default、fork_turns=none，派发后等待全部返回，主线程独占写入。

## 三、已确认根因与技术取舍

| 原件中的问题 | 共享实现要解决的事 | 保留的语义责任 |
|---|---|---|
| admin 与 non-admin 被一起写进 after | 显式选择分支与合流，再由宿主展开有限路径 | 分支条件、选择类型和源码关系由模型明确提取 |
| 已接受角色拒绝事实，终答却重新命名为 unknown | 从同一当前版本生成路径/引用骨架，逐项诊断矛盾 | 不把错误提取图直接宣布为正确答案 |
| helper 返回 True 被当成实际写入 | 分开到达调用、返回值、授权许可与受保护效果 | helper 内部短路、资源关系仍须读源解释 |
| 模型反复写 targetKey/pathKey/after/branch ID | 窄局部语义前端及确定性 lowering，减少机械字段 | 源码含义、别名与因果关系不由宿主猜测 |
| 每次失败重写整段关系，最后仍有旧结果 | 原窗口与当前局部状态组成修复包，版本绑定结果 | 无变化的重复反馈不算新修复 |
| 已读 helper 未进入解释，少数题耗尽整轮 | 区分未读/待解释/待核验，安排相关局部进展 | 不能为了轮转忽略决定性控制 |

核心代码从以下文件定位：

- `src/task-dsl/authorization/control-slice.ts`、`control-evaluation.ts`、`control-conclusion.ts`、`inquiry-result.ts`。
- `src/benchmarks/authorization-dsl/inquiry-local-extraction.ts`、`inquiry-control-updates.ts`、`inquiry-domain-runtime.ts`。
- `inquiry-worklist.ts`、`inquiry-domain-scheduler.ts`、`inquiry-wire.ts`、`inquiry-run.ts`、`inquiry-native.ts`、`inquiry-local.ts`、`inquiry-reuse.ts`。
- `src/cli/authorization-inquiry.ts`；自然 skill 仍用现有 `run` 入口及 authorization scope/domain tools 接线。

设计约束：

1. **保留现有 canonical 与 after 的共同前驱语义。** 模型显式的选择/顺序/提前返回经窄前端展开；不把所有前驱改成 OR，不按项目名修图。若旧 canonical 无法无损承载某个明确必要语义，先记录最小版本化扩展和兼容测试，再实现；不强行错误降低。
2. 模型只描述当前原窗口内的主体、资源、谓词、绑定、分支、调用/返回/效果和有关缺口。宿主补当前问题、证据、revision、唯一身份及机械关系。跨窗口关系必须显式引用已有同题语义对象。
3. 显式 if/else 的互斥来自提议的选择构造；两个独立 guard 仍可能共同要求。unknown 不擅自选边；无 else 不生成虚构补集。循环、复杂别名、未知调用和路径爆炸保留具名缺口及有界结果。
4. 模型广告的 Schema、本地解析、工具调用与反馈使用同一来源；继续接现有能力，新增策略建议命名 `semantic-flow-v1` 并 opt-in。AS1 按代码确认最终兼容接法后同步本文，不另做 CLI 或框架。
5. 最终结果骨架来自当前提取状态，模型继续解释源码及政策。原始提议与派生结果并存；对象、条件、效果、缺口冲突逐项可见。不能靠删除错误原文或忽略必要义务取得完整。
6. 将“当前可行分支”与“用户请求的反事实说明”在接口上区分；没有请求的任意枚举不新增义务。反事实有引用，前提变化使当前分支重算。
7. 不增加目标执行权限，不把源码测试或漏洞答案交给被测模型。开发者见过历史答案的事实标为 exposed development，不宣传盲测。

## 四、身份、材料与调用安排

新结果根：`results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/`。AS0 实际启动时建立必要的 status/manifest；不复制整个 AR 结果树。旧根只读引用，临时副本集中在 `D:/skill优化/project-maintenance/runs/authorization-semantic-lowering-v1/`。

AR 保留 8/16 已留首行的历史分母和所有修订。六个未运行主位置对应 Memos remove、Paperless share-create、Gitea create-issue 的 M/D1；AS 继承其问题责任，新运行记入 AS，不补写成 AR 首轮完成。Notes、Memos share 未知请求、Paperless 和作者消费中的具名未知会话逐项核对封存记录。封存按逻辑任务、源码、前提及请求边界识别，换名/换根/换模型不能解封。

计划使用已暴露、请求完成状态已知且未封存的五类输入：OWUI ingestion、Paperless download、Memos remove、Paperless share-create、Gitea create-issue。AS0 对精确任务与封存范围作一次交叉核对；任何被封存的计划格保留为 blocked，不按低分或超时换题。两份原 skill 使用 Cloudflare security-audit 与 GitHub security-review 的既有原件，保留原文和引用依赖。

质量比较采用三臂：

| 臂 | 表达与核心 | 用途 |
|---|---|---|
| M-L | 既有 Markdown/自然任务 + legacy | 基础实际工作流 |
| M-S | 同等自然任务 + 新共享核心 | 执行支持的增量 |
| D-S | DSL 任务声明 + 同一新共享核心 | 同核心下表达的增量 |

三臂同源码范围、完整公开问题、真实前提、规范政策、模型、工具权利、总预算和语义评价。M-S 与 D-S 的工作队列、局部语义工具和检查相同；差异只在预先写清的任务表达。若实现不能做到这点，先修共享接线，不能将不对称结果归因为 DSL。

`studyArm` 显式为 M-L/M-S/D-S，运行时 `method` 分别为 M/M/D1，`strategy` 分别为 legacy/新策略/新策略。研究臂名称和旧参数是两个字段；旧 AR 的 `plannedRows()` 不能直接充当 AS 清单。新 manifest 绑定同一普通任务、policy/premise、原始 source identity/index、模型路由、工具权利和预算，复用已有身份信息，不再增加一层逐文件签名。生成范围明确排除 AR raw/final、评审、oracle 和人工正确图。

被测模型沿用已配置的 `xty/gpt-5.6-sol`，开发代理为 `gpt-6.1-sol / max`。使用现有配置/缓存，不打印凭据。显式确认 cache 路径和路由元数据，避免 AR 的零派发配置失败；该确认只需一次，无额外模型探测调用。

建议分母：5 任务 × 3 臂 = 15 个质量首轮位置；两 skill × 原/变 = 4 个 native 使用位置；两项合格真实任务 × 政策/前提 × fresh/previous = 8 个变化比较位置；两项源码变化 fresh = 2 个位置。共 29 个计划分析/使用位置，另列 4 份作者原/变稿及修订调用。前序未取得合格材料时依赖位置为 blocked，仍保留分母。作者编写调用不混为分析回答数；零模型失效检查也不算实际消费。AS0 在新 manifest 固定具体身份、输入及配对顺序后才派发。

变化比较预先选择 Memos remove 与 Paperless share-create；先声明变化的政策、前提和源码编辑意图，再运行基础任务。previous 基础材料须来自 AS 的同策略、同源码且满足现有合格条件的已知完成 session，不能挑首次成功的其它任务替换。native 预选 Cloudflare security-audit × Paperless share-create、GitHub security-review × Gitea create-issue，各自原/变保留同一包；AS0 核对确切来源和封存语义。任何不适用或封存项保留原格和理由，补充证据另列。

这是工作量安排，不是用户付费上限。正常 inquiry 的 12 provider/24 source action 及既有字节预算沿用；native 采用其现有总/探索/check 预算。作者、fallback、wire repair 全计量。必要改预算先说明具体机制原因，对同块比较臂一致应用，新块另列；不单独提高失败臂预算。连续失败时停止受影响批次并修共享问题，已有未知完成不重发。

## 五、AS0–AS19 执行队列

### AS0 — 接管与一次基线核对

已完成：固定 [manifest](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/manifest.json) 的 29 位置及 4 作者稿；一次现有输入/source index 校验和零派发路由/认证检查；相关基线 602 pass/1 skip/4068 assertions、主 typecheck 通过。旧 AR 8/16 首行保持。点验未知作者 Memos 配置后，原 remove 三臂及依赖原基线的 4 变化比较/1 源码位置合计 8/29 blocked；这修正“六个未运行旧位置均可运行”的先验安排，不改变分母或替换任务。其它预选格未发现同逻辑未知。封存报告和指纹见 inherited-seals.json；旧 release 不作为未运行证据。AS 原件根已建立，临时注册代码在仓外 runs 下，旧 AR 不写。

- 确认治理已提交、远端对齐且无其它活动写者；记实际 HEAD 与已有差异，不重建 worktree。
- 建立新状态、AR 未达责任映射、精确封存清单和上述计划格。逐行核对 retained claim/report/attempt 与 evaluation，release allowlist 只证明可释放，不能代替“从未运行”的证据。AR 原状态的 in-progress 作为历史快照解释，不改原结果字节。
- 跑一次相关基线测试和类型检查；已知无关历史归档问题记录后继续独立工作，不做全仓历史审计。
- 状态页切换 AS in-progress，研究 §7.48 作为当前设计入口。必要文件均复用现有合同/runner helper，不复制庞大 driver 作为新产品代码。

### AS1 — 窄语义设计及双入口接线图

已实现接口：semantic-flow-v1；局部 `semanticBlocks`（命名有限 block/choose/顺序/call/return/效果）、当前版本 `semantic-result`；v1 不变，最小 canonical v2 表达非效果终点。细节/匿名例及上限见研究 §7.48。两只读探子核对枚举和双入口，后续两只读探子核对控制流/结果边界；主线程亲读共享实现并负责裁定。匿名红例、真实入口 mock 和兼容回归已绿，618 pass/1 skip/4148 assertions；真实纵向仍未验证。复杂源码变化局部保留暂不实施，失效后 fresh。

- 亲自读现有局部 Schema、after 求值、最终检查与 native/inquiry 调用链。
- 写清选择、顺序、合流、提前返回、principal/resource 绑定、受保护效果和 unresolved 的含义；决定旧表示可承载的展开方式、可控上限和诊断。
- 在研究 §7.48 更新一份小示例、字段职责和 lowering 对应表，标明设计而非可运行示例；实现后再更新为实际格式。
- 确定新策略 opt-in 入口与旧策略兼容方式。无须等待用户重复批准日常细化。

### AS2 — 从真实错误建立失败测试

至少覆盖：互斥两支再继续；两个独立条件共同要求；缺前提保留多支；空/缺分支不猜语义；helper 早退成功无目标效果；不同资源绑定；被接受的拒绝事实与终答 unknown 冲突；规则更新后旧 final 失效；一题失败不回滚无关题有效更新；未读引用与循环/展开超限。

测试使用匿名化的小源码/提议，加 AR 原失败的只读重放映射。确认红例对应真实原因，再写实现。手写正确图仅用于确定性测试，不交给后续模型。

### AS3 — 模型可见局部语义前端

- 在实际广告的工具/prompt Schema 中提供窄局部 block，复用原窗口和工作项。
- 宿主生成机械身份、证据归属和版本；模型显式选择分支/对象关系。修订通过局部目标或稳定句柄，不重新手填整图。
- 解析保留原响应，反馈给字段位置与当前局部范围。含未知字段、重复身份或越界引用的处理与 runtime 一致。

### AS4 — 有界展开与兼容求值

- 将显式局部结构降低到有限 canonical 路径；共同后续可沿各替代路径展开，保留原局部来源映射。
- 现有 after 仍为共同前驱；终止路径不误连后续 effect。跨 helper 返回与调用点 continuation 显式连接。
- 检查循环、上限、断链、跨题引用，解释未知部分；旧有效输入和旧工具仍按原语义运行。

### AS5 — 授权效果和对象关系

- 区分通过控制、到达调用、helper 返回与实际受保护效果；将早退/no-op 作为可表达结果。
- 主体、入口对象、helper 对象和目标对象可不同；明确提取关系才能共享绑定。
- 确定性反例包括同名不同对象、未检查的效果对象、非空/空 owner 与参数透传。不要用变量同名自动建立 alias。

### AS6 — 同一当前状态形成最终结果

- 用当前版本的路径、引用和缺口形成结果骨架，模型补解释/政策分析。
- 当前分支与反事实有不同位置；检测已经解释的事实被重述成矛盾状态，以及模型宣布效果但图只支持成功返回。
- 保留 raw、宿主派生、模型补充与最终判定，局部错误指向具体 block。自由文本不能全部机械证明，保留源码复核责任。

### AS7 — 工作队列和预算接线

- 未读关键依赖安排读取；已读待解释优先给相应原窗口；已解释待核验安排局部核对或 final，不反复搜索同一正文。
- 缺失原因与下一动作匹配，当前有效局部块不要求整题重写。不同 ready 问题保留进展机会。
- inquiry/native 使用同一窄前端、lowering、检查、反馈和终答装配；保留预算内 final 和未知关闭规则。无需新增提取专用模型调用。
- 普通 `run` 确实能选择新策略；native 验收记录 skill 原文/引用资源加载、原任务/问题集合、工具真实调用、当前图版本、原始回答和最终交付。它与只调用 `executeLocalInquiryRun` 的 driver 测试分列，目标业务代码仍不执行。

### AS8 — 第一个真实纵向，立即反馈

- 先选 manifest 中完成状态已知的困难任务，执行 D-S，并检查实际源窗口→局部提议→展开→求值→结果→普通交付链。
- 这次就是对应位置的首答；不要先做若干不记分试跑。保留第一次失败，按第六节现场修复。
- 若仅消除格式错误而语义仍缺，继续定位缺失解释/取证动作，不直接启动整个面板。

### AS9 — 局部修复体验与停止无效循环

- 实际错误反馈提供原窗口、当前局部提议、关联节点与具体诊断；只修有关块，成功与旧失败有明确映射。
- 若同根因两次修订无实质进展，审查前端/状态来源/调度，不继续原样增加提示；记录新的实现假设再验证。
- 路由/传输、解析、图解释、结论一致性、源码语义各自有结果。合理外部 unknown 保留。

### AS10 — 两份原 skill 的普通使用

- 从 Cloudflare 与 GitHub 的已有原件和未填答案的自然任务出发；普通 run 加载完整 skill，实际调用新共享工具，最后向用户交付答案。
- 每份原/变任务使用同一 skill 包；不能用独立 inquiry CLI 跑通替代 native 完成。
- 保留用户原有全部问题及其它职责。scope、必要 policy 与真实 premise 可输入，控制图/正确答案不可预填。
- 原逻辑任务封存时保留原格；补充任务须明确“新增使用证据”、事先登记选择理由，不能冒充旧格修复。主 AS 分母不因效果重选。

### AS11 — 真实前提与政策变化

- 对 manifest 中两项合格真实授权材料做各一次前提与独立政策变化，fresh/previous 同输入配对。
- 前提变化重算可行路径、重新激活必要解释；政策变化清旧映射并重新判断，源码行为不被政策期待重写。
- 原材料不合格时明确阻塞复用，继续其它工程；不能导入人工补图。计量实际重解释、读源/显示字节和全部调用。

### AS12 — 源码变化与失效

- 在隔离副本作事先声明的小源码变化，既有 previous 必须在 provider 前识别失效；对变化源码执行 fresh 并核验行为。
- 第一目标是正确失效与重新分析。仅当依赖记录能覆盖当前决定性引用、调用和对象关系时，再做未受影响局部解释保留；否则保守 fresh，明确局部复用未实现。
- 缺来源、变化窗口之外的原依赖及新激活路径有反例，不以 citation 子集冒充全部依赖。

### AS13 — 编写与修改的真实工作量

- 两份来源 skill 各一份模型辅助作者原稿和变化稿，共四稿；输入为原正文、自然任务、允许范围与必要政策/前提。
- 程序只填机械信息；保存作者首稿、诊断、修改后稿，真实消费用原输出字节。不能由主代理偷偷修字段替代作者成绩。
- 记录用户要提供哪些信息、多少字段由宿主派生、作者调用/修订次数和下游阻塞。未做真人计时则 humanMinutes=null，模型辅助流程本身可有工程价值。

### AS14 — 三臂分块质量比较

- 完成五任务的已登记三臂，共 15 个首轮位置。Memos remove、Paperless share-create、Gitea create-issue 继承 AR 未做问题；AR 首轮仍保留旧分母。
- 以同一实现/预算的每任务三臂为块，轮换顺序；新缺陷立刻停受影响派发、修复、具名复验。已完成首答与修后不混算。
- M-L 无故障时不为增加对称“修复机会”强行多跑。错误修复的机会/规则相同，并记录实际发生多少。
- 有封存或依赖阻塞的格保留，继续其它可运行格；不通过新任务名解除历史未知。

### AS15 — 分层评价与定向独立复核

- 每块运行后即评价：是否有回答、逐题必要语义、来源支持、合理/可避免 unknown、当前/反事实、实际副作用、规则一致、checked、全部义务交付。
- 首答、最后已知修订、所有失败和未运行分别列。模型图、raw prose 和最终产品答案都保留。
- 独立只读评审从原问题、源码和原答出发，不只看模型的控制图；主线程点验要紧/相互矛盾的判据，保存分歧与裁定。不对每个普通机械变更安排昂贵重复审计。
- evaluator 结果只进入离线裁定。泛化修复从原始失败诊断及源码机制提炼，不把具体答案加进通用 prompt。

### AS16 — 归因、工作量与成本

- M-S 对 M-L 解释共同执行支持；D-S 对 M-S 解释同核心表达差异。版本不一致或预算不等的块单列，不合成因果胜率。
- 比较必要语义完整、错误控制/效果、过度 unknown、首答/最终交付，以及 calls、完整 prompt、cache、output、耗时、作者/修订成本。
- source read/display/redisplay 是字节观察，token 由 provider 报告；实际 USD 缺报保持 unknown。开发代理成本、被测模型和人力分别写。
- 生成简短结论：哪些机制确实发生、哪些改善有原件、哪些需要继续研究，不把测试总数当质量效果。

### AS17 — 有依据的深化

核心工程和适用真实链已经完成后，依实际瓶颈依次选择：

1. 合并重复的局部上下文与修复反馈，保留原窗口和当前有效事实；用一次真实同任务观察验证，不把序列化字节减少写成 token 节省。
2. 合格前提/政策复用仍重复解释时，复用同源局部块并明确失效原因；计量真实动作。
3. 复杂嵌套选择或早退仍暴露共同缺口时，扩一项可检验的有界语义并补另一项目反例。
4. 只读源码表明第二种结构尚未覆盖时，先补针对性机制案例，再决定真实调用价值。

不为满足时长新增 UI、通用语言平台、大规模 skill 获取、无关源码迁移或新论文主张。每个附加项仍属于 AS，事先写明问题、预算、版本和验收，不重复创建研究正文。

### AS18 — 一次必要联合验证

- 针对新代码跑红绿测试；阶段已绿后只因修改或新失败追加相应验证。
- 最后一次授权相关测试、主类型检查、AS driver 类型/重放、文档及 catalog 检查。按实际代码影响选旧 native/provider 回归。
- 可用命令从仓库根执行：

```powershell
bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl
bun run typecheck
python -B -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py
python -B scripts/check_skill_ir_doc_links.py
bun ./scripts/experiment-catalog/cli.ts check --root=. --catalog=results/skill-ir/experiment-catalog.json
git diff --check
```

- AR helper 可只读参考既有 study/evaluate 测试与 replay；不执行旧 evaluate 重写派生报告，不改冻结摘要去通过历史验证。
- 新 AS driver 自带局部类型/离线 replay：`bunx tsc --noEmit -p ./results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/tsconfig.json` 与 `bun ./results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/study.ts replay`；不复制全部历史 runner 依赖或重复做巨大 clean archive。

### AS19 — 文档、发布与交接

- 更新现有 usage/示例、developer-guide 对应组件、spec、研究 §7.48、current-status 和当前计划。研究按“问题—根因—修复—证据—残余”短记，当前设计同步主题段。
- 本轮结果保留必要 manifest/status、summary/verification、调用索引/原件、评审和修复账本；相同数据用链接关联，不反复复制完整原始响应到每份报告。
- 状态明确记录工程、真实使用、效果、未达责任；旧 AR in-progress 是历史快照，不覆盖成 AS 成功。
- 按归属提交并推送用户 origin；不得推 upstream、另建分支或工作树。确认远端后记录发布身份，保留用户原资料及未知失败。
- 原始研究脚本、程序输出和 unique evidence 保留；结束缓存按当前治理规则处理。不重复过去的大清理与全档案审核。
- 用户未另行安排时本队列完成后交付，不擅自启动新的未见样本或无限追加调用。

## 六、现场失败处理规则

每个真实不良表现都必须在当前工作进程内完成以下记录和动作，不等全批跑完：

1. 保留原请求/响应与调用状态；指出具体失败题、原窗口、提议、诊断和交付影响。
2. 分为环境/传输、公共 Schema、状态/检查实现、提取/推理、资料/前提缺失。未知完成先关闭派发边界；零派发与已派发区分。
3. 有共享实现根因：先失败测试→修改→相关测试，再同题具名实际复验。只修当前实例文件的行为不算共享修复。
4. 语义错误：反馈原始材料和已有公共诊断，改共享提取/调度方式或局部修复接口，不传 oracle 答案，不手写正确模型候选。
5. 每个错误至少有一次有依据的针对性修复尝试和效果核对；同根因一次修复可覆盖多条，仍逐条记录。无法执行的未知、权限或必要用户事实缺失，注明理由并保留，继续独立工作。
6. 记录 improved/unchanged/regressed/unresolved、影响版本与后续判断。新的具体诊断允许继续修订；相同请求原样重复不算修复。
7. 不要求每项错误增加模型调用：确定性误路由/机械错误可零模型核验；语义或实际采用收益必须有真实消费支持。

## 七、交付给用户时回答的问题

1. 哪些重复机械步骤已由代码接管，实际 trace 是否调用？
2. 两份原 skill 的用户是否拿到了完整授权回答；失败具体在哪一环？
3. 选择合流、helper 效果和终答一致性在哪些真实输入改善，哪些仍不行？
4. 政策/前提/源码变化时哪些材料复用、哪些重算，费用和工作量怎样？
5. 新核心是否帮助 Markdown；同核心下 DSL 是否还有增量？
6. 原首答、修后、unknown 和 blocked 分别多少，下一步最大问题是什么？

不要写成“全部任务已终结，所以目标已完成”。以可运行代码、普通用户链、完整原始答案和实际对照回应上述问题。
