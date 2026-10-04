# AR0–AR23：授权 DSL 引导运行、现场修复与变化复用长任务书

> **For agentic workers:** 使用 `superpowers:executing-plans` 连续执行；实现遵循 TDD，问题定位使用 systematic-debugging。用户已授权本轮开发、必要联网与付费实验，以及提交并推送用户 origin。常规检查点无需再确认。执行主线程负责方案、代码、共享文档、最终验证和 Git；子代理只做边界清楚的只读探索或独立评价，遵守外层 AGENTS 的默认角色、无历史、派发后等待等规定。

**Goal:** 让系统从自然任务、真实 skill 和原始源码出发，实际完成取证缺口识别、补读、局部解释、分支检查与可用交付；每次真实失败在本进程中得到针对性修复及效果核验，并进一步实现有来源依据的政策/前提变化复用。

**Architecture:** 沿用 SkVM inquiry/native、源码工具、控制 slice 和 provider。新增可选 `guided-evidence-v2`：模型负责带出处的局部语义判断，宿主管理工作队列、证据窗口、增量更新、失效传播和修复调度。普通入口与原 skill 使用同一核心；旧 `legacy`、`domain-evidence-v1` 和历史报告保持可读。

**Tech Stack:** TypeScript、Bun、Zod、现有只读源码索引及 CLI。不另建通用 IR、完整静态分析平台、CLI 或 HTML 展示层。

状态：`in-progress`。实际启动 `260477cc`；AR0 已完成，AR1 驱动工程通过。四次短接口探针及零调用同题重放已保留；AR2 已有修后checked小探针，AR3 局部更新已接通共用核心，AR4 可达绑定反例已修，AR5 工作清单与 AR6 定位/读取机制通过工程回归；真实取证解释及复用继续开发。规划基线 `9b085ee0d212a248c04ce5a8ffa12ad7171b8fed`；执行启动时记录实际 HEAD。目录 `D:\skill优化\SkVM`，分支 `skill-ir-aot`，唯一发布目标 `origin/skill-ir-aot`。开发线程指定 `gpt-6.1-sol / max`；被测路由默认沿用 `xty/gpt-5.6-sol`，二者分账，不擅自换模型来取得好结果。

本轮按约 12 小时主动工作安排，AR0–AR20 必做，AR21–AR23 是提前完成核心后的有序深化。12 小时是规划中心，不是成功条件或硬性中断点；不等待、重复测试、反复抽样凑时长。不能保证宿主连续在线精确 12 小时。若核心提前完成，继续有价值的深化；若仍有工程缺口，不因时间到了写“全部完成”。

## 1. 复核归纳与本轮取舍

| 根因 | 旧策略现状 | AQ 新策略现状 | AR 必须改变的行为 |
|---|---|---|---|
| 决定性证据 | 允许范围内 helper 经常未读，回答保留过量 unknown | 自动读依赖模型先填图、读后再关联规则，原 skill 自动读 0/4 | 从六类领域义务维护工作队列；可定位候选由宿主补读；补读后明确安排局部解释 |
| 接口负担 | 主要提交答案与少量 observations | control 的 delta 与其他 controlDelta 不统一；native 嵌套 Schema 不完整 | 同一模型合同生成两入口工具，局部更新由宿主补机械字段 |
| 条件与对象 | 模型在文字里处理 owner、null、权限例外 | 求值器能计算正确输入，真实条件提取仍不足；可达绑定检查有漏检 | 分开验证提取、路径计算、最终回答，补前驱/分支绑定检查和真实空值分支 |
| 修复机制 | 失败后多在下一轮处理 | 已知 Schema 缺陷仍跑完首轮才修；原 skill raw 3/4 full 而 checked 0/4 | 当场暂停受影响派发、定位、修共享实现、同题复测；失败留存，下一题使用修复后实现 |
| 编写与复用 | 可编辑与 compare，常重新分析 | 政策单独重算未实现，旧语义 slice 不继承 | 在来源、范围和依赖仍有效时复用局部事实；变化影响传播到具体问题 |

AQ 同轮旧策略有可评价答案 19/20、新策略 7/20，两组合计 full 均为 2/20。每臂含 8 原题和 2 重复，不当成 10 个独立任务。AO 同类主任务已是 M 2/8、D1 1/8 full；AP 没有新增真实质量实验。既要修新退化，也要补旧取证能力，不能仅把格式修好就宣布方法有效。

主线程已离线复现 `control-conclusion.ts:64` 的新反例：两个绑定在恒假且非前驱的分支里，另一个 effect 仍获 `ruleConsistency=true`。它是新增工程缺陷证据，不改写 AQ 原实验归因。

路线比较：仅加提示/提高预算投入小但仍让模型维护整图；全面语言级静态分析超出本轮；采用“宿主工作队列 + 局部模型解释 + 确定性关系检查”，在现有范围内持续完成工程和真实使用。

## 2. 执行上下文与文件所有权

2026-10-04 用户再次要求总结并转交新进程，下一主执行者使用 `gpt-6.1-sol / max`，沿用当前checkout与skill-ir-aot。上一恢复的AR9独立核验已完成，真实native和非API链有新证据；最新状态见[AR恢复记录](../../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/handoff.json)。原启动身份、229次实际调用及未完成验收保持，不从AR0重跑、不重开12小时计时。唯一在写WIP为撤回未接受草稿的规范与2项预期红测，生产实现未开始；接手者亲读后继续。Paperless原未知请求及逻辑任务继续封存。新进程启动后独占相关写入，原进程停止。

主执行者亲自阅读：

1. `D:\skill优化\AGENTS.md`、仓内 `AGENTS.md`、`docs/skill-ir/current-status.md`、本任务书。
2. `docs/skill-ir/skill-ir-aot-optimization-spec.md` §14.34 总原则及 AR 补充；`docs/skill-ir/skill-dsl-research.md` §7.34–7.36。后续问题和决定继续追加 §7.36，不再新建研究正文。
3. AQ root 的 `README.md`、`manifest.json`、`shared-revision.json`、`evaluation-summary.json`，只点读有关失败轨迹。AQ root 为 `results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/`。
4. `src/task-dsl/authorization/{inquiry,inquiry-program,inquiry-result,control-slice,control-evaluation,control-conclusion}.ts`。
5. `src/benchmarks/authorization-dsl/{inquiry-run,inquiry-native,inquiry-domain-runtime,inquiry-domain-scheduler,inquiry-tools,inquiry-local}.ts`、`src/providers/structured.ts`；接线看 `src/cli/authorization-inquiry.ts`、`src/adapters/bare-agent.ts`。
6. `examples/authorization-assessment/reusable-skill/`、`docs/usage.md` 和相关 `developer-guide.md` 小节。
7. 外层 handoff/communication 的最新 AR 条目及 conversation_log 的 2026-10-02 AQ causal review，供跨线程恢复。

一个执行线程是本轮唯一写者。父线程完成任务书派发后停止修改这些文件。不创建分支或 worktree，不清理历史材料，不覆盖他人改动，不向 upstream 发布。

新证据根为 `results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/`（下称 AR root）。仅 AR0 启动时创建 status/journal。生产模块放 src，研究驱动放 AR root。沿用已有记录能力，新增最少的 `failures.jsonl`、`evaluation-summary.json` 和 `verification.json`，不建立多层锁、逐行手工哈希审批或成套重复报告。

## 3. 最高优先执行规则：出现问题就在本进程修复

### 3.1 每个不良表现的处理义务

**每个真实错误、非预期 partial、交付失败或性能严重退化，都要在离开相应工作块前完成一次有证据的针对性修复和效果检查。** 同根因可以共用一次代码修复，但每个受影响结果都必须关联该修复和复验结论。预期范围外问题、确实不可获知的部署事实是正常边界，不强行改成 allow/deny。

流程固定为：

1. 保存原输入、实际请求/响应、工具轨迹、实现 revision、原评分和成本；先记录再处理。
2. 定位到 `schema/wire`、`state/checker`、`source-location`、`semantic-extraction`、`context/budget`、`infrastructure`、`evaluation` 之一。写出可验证的原因假设，不能仅记“模型不听话”。
3. 共享缺陷立即暂停使用该组件的新派发；已经在途的只收尾记录。保留未启动行的 `not-run-after-defect`，不用把已知坏实现跑满。其他互不依赖的工程工作可以继续。
4. 工程问题先构造失败测试，再修改共享实现；语义缺口修取证/局部解释/分支机制，不向被测模型塞评价答案；评价错误先核原源码，再修 evaluator，原评语仍保留。
5. 使用同一任务和原始源码运行一次修后验证；纯工程可离线重放，涉及模型可用性或语义收益必须真实复测。再选择一个受同机制影响的已有任务或非答案性的变形用例检查迁移，不为每条诊断重复付费。
6. 记录 `improved/unchanged/regressed/unresolved`，保留修前修后全部结果。若仍失败且有新原因，允许在本进程继续修；同一假设无代码/上下文改动不得反复重试。

每个根因初次定位/修复建议用 30–60 分钟；超过后拆小问题或换共享实现路径，不只改标签关闭。真正外部阻塞可继续独立队列，最终明确未达项。修复是义务，修复成功需要证据；不以“已经尝试”冒充已解决。

建议失败记录（字段由 AR1 定义 schema，路径引用原件）：

```ts
type FailureRecord = {
  id: string; runId: string; implementationRevision: string;
  category: "schema/wire" | "state/checker" | "source-location" | "semantic-extraction" | "context/budget" | "infrastructure" | "evaluation";
  rootCause: string; originalArtifact: string; repairId: string;
  changedFiles: string[]; verificationArtifacts: string[];
  outcome: "improved" | "unchanged" | "regressed" | "unresolved";
};
```

### 3.2 恢复、预算与实验真实性

- 本次授权覆盖现场修订和必要的同题复测，取消 AQ 的“整批结束才允许修”“仅一次全局修订”。无需为每次本地修复再问用户。
- 按小块连续生成、评价、修复；每行返回就检查结构/交付并作针对性的源码评价，块结束只做汇总，不推迟已知失败的处理。开发数据属于 adaptive development；不把修后成绩替换首答，不把不同实现混成一个固定方法准确率。
- 比较块中的两臂使用相同共享修复、模型路由、原始源码权限、规范事实和预算。共享缺陷修复影响两臂时都更新，不能让旧臂故意保留坏 Schema。
- 每个逻辑任务记录 `firstAttempt` 和历次 `repairAttempts`；一次坏回答的二十条诊断不产生二十个独立实验身份。失败根因清单与结果绑定足够。
- 网络/超时先确认当前本地请求和日志状态，优先修超长上下文、超时处理或可靠传输。需要新 session 恢复时保留旧请求 `completion-unknown`、关联恢复尝试和潜在双重成本，不将未知填为零；不反复重发相同未决请求。
- 2026-10-03恢复范围细化：未知请求及原逻辑任务继续封存，不以换row名或repair释放。已针对性离线验证的共享部分可通过独立`scope-adjudications.jsonl`收窄暂停：绑定原报告和验证材料SHA-256、释放组件与唯一允许的不同任务机制探针。该记录不改原failure的unresolved，不释放主质量面板；后续真实结果继续即时审查。禁止把反馈中持续存在的旧诊断计成每轮重新提交的同类模型错误。
- 共享默认比较预算从 AQ 的 12 次 provider/24 次工具开始。内部作者、局部提取、fallback、修复均计入。必要时可调整预算，但修改要同时应用配对臂，单列成本，解释为何改善单位工作效率；禁止隐藏内部调用。
- 两个实验 worker 至多并行，遇到共享缺陷暂停相关队列。执行线程修改代码时先结束使用当前模块的在途实验，再用新 revision 启动。只读源工具不执行目标代码，不写目标仓库。
- 原始源码、用户事实、独立规范、模型解释、宿主计算各有来源。评价答案不进入生成 prompt；开发者见过答案后修的方法如实标为 exposed development。

## 4. 工程分工：哪些工作交给宿主

| 层 | 模型负责 | 宿主负责 |
|---|---|---|
| 声明 | 从自然请求识别问题和用户明确前提 | 类型与来源检查、稳定问题关系 ID |
| 取证 | 判断调用/条件的意义，说明候选是否相关 | 六类义务工作队列、源码定位、去重、补读、预算 |
| 控制图 | 提交局部 guard/effect/条件解释和原行引用 | 身份/修订字段、增量合并、局部失败隔离、失效传播 |
| 分支 | 解释 null/缺失/例外与独立政策 | 有限表达式求值、前驱可达性、绑定与对象对应、矛盾检查 |
| 交付 | 生成带条件和缺口的自然回答 | 分层验收、保留可用部分、标出未检查部分、不给失败结果成功标记 |
| 复用 | 新政策/用户前提的局部映射 | 依赖有效性、受影响重算、旧结论失效、使用成本分账 |

新增 `guided-evidence-v2` 明确 opt-in。保留旧 canonical slice 的兼容读取；新模型前端可以更窄。已有 `ControlRule`、`ControlDependency`、`mergeControlSlice`、`partialEvaluate` 复用，避免再写一套平行引擎。

模型不再承担抄写 hash/digest 的工作。主接口用人可读 targetKey 和理由表达替换，宿主查找当前目标、补修订绑定并记录变化。对歧义目标、旧来源、不同 question 的替换返回局部诊断，不能凭同名自动猜接。

## 5. AR0–AR20 必做队列

### AR0 — 恢复、实际基线和连续执行状态

文件：本任务书、AR root/status.json、journal.jsonl；现有源码先只读。

- [x] 读上述上下文，检查 Git、当前分支和已有模型配置可用性，不输出凭据。
- [x] 记录启动时间、HEAD、线程模型、完成目标和 AR0–AR23 状态。区分工程、真实使用、效果三个结果字段。
- [x] 把 AQ 确认根因带入新身份，不重跑 AQ 全套面板/全库审计。恢复后先处理未完成修复再开启新样本。

### AR1 — 失败语料与现场修复驱动

文件：新建 AR root/study.ts、study.test.ts、tsconfig.json；复用 AQ 的输入清单与存档路径，不修改 AQ。

- [x] 登记八个已有任务：memos-share/remove、paperless-download/notes/share-create、owui-ingestion、gitea-self-query/create-issue。输入只有自然请求、允许范围、固定源码和独立政策。
- [x] 从 AQ 点取六类真实坏响应，覆盖 wrong schema type、delta/controlDelta、bindings 混用、owner-null形式条件缺口、未读 helper、structured预算终止；第七类无效第二次检查保留确定性反例，历史付费发生未建立（以下方法修订）。
- 原证据点验修正：六类已有实际坏响应；owner-null案例的原文字已保留分支，缺的是typed condition提取；预算案例是structured累计source display终止。四个native原始/changed轨迹的八次check均invalid，没有建立先valid后invalid的付费实例。第七类保留确定性状态清除反例和这次有限负面点验，不能为满足计划将测试改称真实历史失败。
- 计量小修计划：ordinary消费的provider创建失败原report明确记录providerDispatches:0，外层结果却没有telemetry而写null。派生汇总只在原report状态、输入hash、model与claim一致且明确整数0时恢复两项计数为0；原报告、原null字段及费用不改，缺报告/不同身份/未知完成均保持未知。先写确定性反例再修汇总，不增模型请求。
- [x] 写驱动失败测试：共享缺陷触发后剩余相关任务不得派发；已在途记录不丢；每个失败关联修复；旧原答不覆盖；同题新尝试成本累加；合法 unknown 不触发强制改答案。
- [x] 实现 `check/develop/evaluate/replay` 四个脚本动作。`develop` 每完成一小块即可评价和修复，代码修复由开发主线程执行，研究 runner 不自行改生产文件。先用 mock 验证，再运行真实任务。

2026-10-04本阶段工作计划：先写语义评价反例，再为 `evaluate` 接入严格的独立评审记录与另存的开发主线程裁定。评审绑定具体 row/attempt 和原 report 字节；首次与修复尝试各自保留 initial/final、抽取含义、helper/分支/unknown/checker 机制证据，未评审不由 completed/valid 自动升格。固定保留16个主面板分母，普通使用与探针仅作描述性记录；只对输入摘要、源码索引、实现版本、模型及预算均相同的已评审主面板 M/D1 首次尝试配对。旧评价和原始评审不覆盖，缺失费用保持 unknown；评价与回放零派发，不要求其它样本先完成。两份作者配置的普通运行在稳定核心上并行进行，其间仅修改研究评价与记录。

本阶段落实20测试70断言及研究类型通过，独立核验的编号/缺首报告/非法数值反例先红后绿。实际evaluate列16未运行主行、2描述性探针、0主首次评审/配对，不自动转换旧自由格式评审。作者修稿6调用、Download首作者7调用原配置格式通过；仓外同字节普通消费Memos11派发10响应末timeout未知、Download12/12 final数组污染/修复错误类型失败。原稿、原响应和后续核验分列，累计286、USD/人力unknown。下一段先定位普通SDK timeout终态及Download final受约束修复，未验完整交付/previous，Notes与未知Memos不得改名重发。

历史语料逐原件指针点验已完成，register登记器与historical-failures.json同步。零provider replay保留6实际/1确定性，14驱动测试37断言、研究类型通过。第七类由原要求真实历史发生修订为确定性回归＋四native八invalid检查的有限负面点验，不制造付费发生、不继续全量历史审计；owner-null/预算错误归因已纠正，原AQ字节不改。见historical-failure-replay.json。

### AR2 — 统一模型 wire 与完整工具 Schema

文件：新建 `src/benchmarks/authorization-dsl/inquiry-wire.ts` 和测试；修改 inquiry-run.ts、inquiry-native.ts；复用 providers/structured.ts 转换器。

- [x] 为两入口实际发出的 Schema 写捕获测试：refined string、null、自由 JSON 值、数组界限、嵌套 result/control、unknown 字段诊断均一致。
- [x] 新策略统一使用 `controlDelta`。读取旧 `{kind:"control",delta:...}` 时只做具名无损别名归一；两字段冲突必须报错，不能择一。新增模型 Schema 只展示一个名字。
- [x] native 从同一 Zod 定义生成完整 nested schema；拒绝只给空 object 加长文字来代替接口。控制条件保持有界代数，不递归生成无限 Schema。
- [x] 把真实 AQ 坏响应交给新解析器做离线回归，记录哪些恢复、哪些仍语义无效。
- [x] **本步骤接线后立即运行一个短的真实工具消费探针**，检查实际请求及返回，失败按第3节现场修。三次真实探针均归档，现场修后复验仍待 checked 成功；不据此声称质量收益。

### AR3 — 宿主维护增量更新和可操作诊断

文件：control-slice.ts、inquiry-domain-runtime.ts、inquiry-wire.ts；新增 `inquiry-control-updates.ts` 仅在现有模块职责无法清晰承载时创建。

- [x] 提交采用 add/replace 的局部操作；替换目标由当前 question+key 明确定位，宿主生成 revisionOf，记录 reason。不要再要求模型抄当前 digest。
- [x] 区分 `sourceBindings` 与 `premiseValues` 的模型可见名称，归一到既有 slice；用户前提仍回到原始用户原句，policy 不能生成 source fact。
- [x] 新局部接口逐项返回 accepted/rejected 及原因；拒绝项不消失，引用拒绝项的后续节点保持 unresolved。跨项原子变更必须整组校验，不能留下半条授权边。只读核验定位的跨组替换、回滚旧缺口及 dependency parent 已补红绿回归。
- [ ] 在 run 报告保留结构化错误的 phase/path/code/rawResponse 引用和计量，而非只有 error 字符串；从诊断生成最小修复请求，仅发送相关项。
- [x] 测试无损归一、不同问题隔离、过时替换、混合有效无效项、冲突后修复、旧有效结果失效，保留旧入口行为。

2026-10-04续作已实现具名撤回尚未接受的错误草稿：question/group/targetKey定位当前拒绝，保存原proposal、withdrawal理由和被撤回诊断；已接受目标、其它组/题目、来源失效和悬空前驱不删除，失败原子更新不应用撤回。普通native observe/check返回同一操作结果。58项相关回归329断言及新增native返回反例的5项26断言通过；主类型修正后检查记录见withdrawal-verification.json。随后完成调用/上下文/读取进度汇总，再推进真实previous与作者配置消费。compact运行10派发已交付原skill文字、仍无checked图；撤回不提升旧结果资格，主面板仍暂停。

AR3 run/report 已保留 phase/sequence/path/code/rawResponse/usage，Schema 重试不再丢工具约束；最小修复上下文与证据窗口在 AR7/AR8 一起完成，故上一项仍未勾完成。

2026-10-04现场修复计划：以已归档Memos SDK timeout和Download final污染为依据，先补timer之前的ProviderNetworkError超时、旧transport-failed档案的previous/同题repair保护及final-only同工具修复反例。共享telemetry识别有界网络timeout cause并关闭生命周期，原错误/请求/用量保留；普通run和旧档案复用同一未知完成判据，不把已知schema坏响应归为unknown。既有一次same-tool修复明确当前顶层常量，取消与final-only冲突的源码动作指令，最多携带32KiB原坏candidate为数据，不删除/补造实验答案或增加修复次数。完成聚焦红绿与主类型后，只对已知返回的Download失败作一次具名真实复验；未知Memos和Notes保持封存，后续语义遗漏仍需独立检查。

现场工程复验：58项303断言及主/研究类型通过；独立核验补出同步provider throw遗留pending的红例，接入同一结算后转绿。真实Memos旧档案inspect保持transport-failed原状态，派生completionUnknown:true并保留11/10调用；原文/用量不改，未知请求不重发。Download现仅进入一次具名已知响应复验，语义判定与checked交付另验，见sdk-final-repair-verification.json。

### AR4 — 补可达绑定及分支级结论检查

2026-10-04剩余验收只读定位：null/unknown、grant false/not-given、早拒绝、互斥终端及已提出decisive dependency已有确定性回归；owner==caller的self/other具体值对照与实际源文件中未读helper+complete:true的联合用例缺少具名覆盖。当前普通复验在途时只补这两类测试，不修改其使用的核心；若出现预期外失败，先保存原件并等在途收尾再修实现。自由claim含义保持unreviewed，不能用字符串启发式冒充任意自然语言/源码一致性检查；实际分支提取及语义修复仍单列未达。

2026-10-04实际复验补充：compact普通消费12/12、21源码动作、0wire失败，最终规则22/22/7/6/1仍全不checked。前两题principal字段为authenticated_request_user，声明bindingKey为request_user；现合同将bindingKey视作身份声明，principal/resource视作引用，不支持用字段改名。当前过程反馈直到首次final才有object-binding诊断。先写未final就显示该错误、显式改key后消除且partial草稿仍接受的反例，再把现有对象/authorization边检查抽成共享纯函数，按slice revision更新下一次model反馈；保留最终原验收、checks-off、跨题/可达性和未知值约束。过程提示不创建额外请求、拒绝层或自动别名；计量过程计算次数，GUIDE和诊断明确字段合同。

本次2项预期红例后134测试744断言、主/研究类型及独立只读复核通过。纯对象检查在两策略下一次反馈出现，显式bindingKey修订可清除，partial接受、checks-off及原最终规则不变。11原提议零provider回放accepted state完全不变，身份诊断从第6提议revision46即可获得，早于原首次final revision88；原最终6对象诊断/全图失败保持。计量小修3项反例通过，只恢复匹配原身份的明确0派发，累计318、USD/人力unknown。下一步同原作者字节/同12与24预算early-object-feedback-v1具名普通复验；未证明真实语义收益，不释放未知Memos/Notes或主面板。

2026-10-04剩余机械验收补齐：具名self/other/null/explicit grant对照与实际临时源码未读decisive helper+complete:true联合用例通过；35项163断言及主类型通过，0provider。仅验证显式提出的条件/依赖合同，任意claim含义、未知未声明源码分支及真实语义完整性不升格，下一coverage项仍开放。见ar4-remaining-verification.json。

文件：control-conclusion.ts、control-conclusion.test.ts、control-evaluation.test.ts。

先在现有测试 helpers 中加入以下失败用例，再实现检查：

```ts
test("an unreachable unrelated binding cannot satisfy the live effect", () => {
  const never = { op: "eq", left: { literal: 1 }, right: { literal: 2 } };
  const s = state([
    rule("entry", "entry", []),
    rule("hidden-user", "binding", ["entry"], { pathKey: "hidden", bindingKey: "caller", bindingKind: "principal", condition: never }),
    rule("hidden-object", "binding", ["entry"], { pathKey: "hidden", bindingKey: "doc", bindingKind: "resource", condition: never }),
    rule("write", "effect", ["entry"], { principal: "caller", resource: "doc", complete: true }),
  ]);
  expect(codes(api.checkControlConclusions(plan, s, answer("allow"), [])))
    .toContain("object-binding-unreachable");
});
```

- [x] 补 reachable-but-not-predecessor、同 key 不同对象、跨 question、合法共同前驱四类测试；检查对应可达前驱中的绑定。
- [x] 增加 self/other/null owner、not-given grant、早拒绝后的 effect、互斥分支误合并反例；未知输入继续产生条件结果。
- [x] 不能强迫每个真实 effect 都有合法 guard：无授权保护本身可能是待报告行为。验证所声称的关系，不凭空补保护。
- [ ] 对模型 `complete:true` 仅作为提取主张；未完成取证项/已发现未表示的分支必须进入 coverage 缺口。

### AR5 — 把六类 pending 变成宿主工作队列

文件：inquiry-program.ts、inquiry-domain-runtime.ts；新建 `inquiry-worklist.ts`、`inquiry-worklist.test.ts`。

- [x] 从现有 entry/principal-binding/resource-binding/guard/effect/exception 展开具名 WorkItem，关联 question、原始入口线索、证据、阻塞原因、下一动作和状态。
- [x] 队列区分未定位、待阅读、待解释、待绑定、待核验、已闭合、范围外未知；状态由宿主实际动作推进，模型不能直接写 closed 即通过。
- [x] 即使模型尚未提交完整控制图，入口已有调用点/问题关系也能形成候选待办；候选仅是搜索线索，不是语义事实。
- [x] 公平分配各问题队列，优先决定性且可定位的缺口；不因为某项难就静默跳过，不用仓库名/函数名白名单生成成功。
- [x] mock 验证从零控制图启动、循环依赖、一个问题阻塞不拖垮其它问题、读后待解释而非自动确认语义。

### AR6 — 领域引导的依赖定位与真实补读

文件：inquiry-domain-scheduler.ts、inquiry-tools.ts 及测试；只复用已有索引，不引入全仓语言分析器。

- [x] 将 WorkItem 连接现有 source_search/source_symbol/source_read；显式调用点、引用位置、imports/定义候选提供定位依据。
- [x] 唯一合法位置由宿主读取；多个候选返回小型消歧选择，不要求重新描述整个 dependency。定位失败返回可继续的源码缺口。
- [x] 复用 `(path,sha,startLine,endLine)` 范围覆盖，避免重复读取；读源变更时使相关工作项失效。按题限制候选和动作，不越出用户范围。
- [x] 对入口条件、身份来源、资源解析和效果调用的关联只提出候选，语义仍由局部解释步骤确认。
- [ ] 用已有 Memos/Paperless 两种结构各做真实补读探针，当场修复共同遗漏；验证改名/目录搬移后仍走同一代码，不把研究 evaluator 的正确 helper 列表交给生成器。

2026-10-04 Download具名复验12/12返回五题首答/终答，中途一次same-tool修复成功处理control中的额外observations；最终仍completed-with-diagnostics，四题空图及授权题绑定/目标组/依赖未闭合。累计298调用、USD/人力unknown。独立源码复核支持四题条件解释，授权题缺少允许范围内可读的认证声明并过强概括全局权限分支；原评语及主裁定另存。现场工作计划：先补有prose entryHint但无索引候选时不回退operation/request的红例；仅零候选时回退，歧义不自动选。给既有下一次局部解释上下文增加有界定位/候选选择任务，使用原workItem/candidate身份及已有workSelections，无新模型调用、不复制别题图或猜源码含义。补明binding duty走sourceBindings且规则kind按原Schema；先聚焦反例再复核不同结构，未知Memos/Notes不重发。

上述四项预期红例成立后，共享入口/局部上下文已修；84项449断言及主/研究类型通过。独立接线核验未发现跨题、未读证据授权、预算或语义闭合绕过；bindingKind完整枚举措辞已补。实际Download原字节零调用重放候选2/2/3/1/1、共享原窗口读取1次、0推断规则/用户值，前三题显式候选选择后仍只待解释。下一步具名location-routing-v1普通消费复验，记录同原作者字节、修前/修后和checked/语义分层，未知请求与主面板暂停不解除。

location-routing-v1真实8/8返回，三题已显式定位但五题仍rejected，累计306、费用unknown。原request-6仍余7调用且非reserved，首次final是模型选择；独立评语中把预留收口当原因的推断不成立，原评语仍保存。模型所有已请求读取均执行，却读permissions头部而非可读helper，并没有versioning读取；本范围source gap仍可避免。下一工作计划：红绿验证已由父源码显示的unconfirmed lexical reference进入有界locationTasks，供模型显式选择读取/声明相关性；不自动读取logging等未确认引用、不推断语义。收紧guided modelFeedback的机械队列投影并压缩已读工具历史，保留完整report、当前新工具结果、所有问题/缺口身份和实际窗口；用原request逐项对比字节及候选/关键字段保留，不称token下降为因果质量收益。先实际trace零provider重放和联合检查，再决定复验。

主线程原请求分段实测：request-8证据目录约70k字符在外层shown及localContext中重复，完整worklist约94k；工具实用24次（8search、16read，其中4host自动），并非没有host补读。优先修目录轻量引用和单次展示、队列机械投影以及parent已解释的可选择lexical leads；现阶段不改工具history或抬24/12预算。Q5其实在request1/2/8 offered，不能写成从未展示；未解释/未闭合的原结果保持。

集成点验补充：structured普通入口虽保留brief作用户文本，却未将其传给已存在的entryContext定位fallback。新增作者把问题概括后丢失词法入口的确定性反例，先红后绿接通原任务；只在入口候选为空时提供词法线索，不把自然任务当源码事实，也不覆盖已有歧义候选。机械回放须覆盖同队列全部可选线索的完整轮转周期（包含其它未定位任务），保持原窗口和原失败。

本阶段6项红例后91测试507断言及主/研究类型通过。独立点验确认显式读取边界；原8次请求仅机械重序列化后消息2,471,023→1,455,275字节，原窗口/任务不变，11可选线索全覆盖；不是完整新prompt模拟、实际token/费用节省或质量提升。图审稿初/终快照分开，最终Q3复合对象身份未绑定、Q4以路径名作前驱和开放依赖均保留。下一步同原作者字节、同预算具名复验，Memos/Notes未知末请求不重发。

### AR7 — 补读后的局部解释与条件提取

2026-10-04具名early-object-feedback实际11/11：request7已有对象反馈，最后proposal7/revision23补Q3 resource binding，原revision21对象/Schema诊断清除，最终仍Q1/Q3 path-not-closed。旧六principal错误未再出现，但同等principal图未建立，不能算语义修复。独立源码复核initial/final仍partial与major-partial；全部原答、修订、错误保持。24计费源码调用中10read/14search，20成功、4其它错误，另7tool-budget拒绝；只有1host自动read，不使用request子串计数当调用。累计329、USD/人力unknown。

本段工作计划：当前已读任务在同优先级下始终先列固定题序，request8–11只offered同两入口；早期对象diagnostics也未进入局部任务focus。先写五题共享原窗口的等待核验任务必须有界轮转、第三题对象错误定向第三题而不被共享ID抢占的红例，再按既有两个任务上限轮转同优先级解释，并用全部当前诊断绑定其所属题目。仍保留新读/具名修复优先、同题local绑定、完整原窗口、0额外读取或调用；无语义归纳或checked自动升格。修后确定性重放实际context，主/研究类型和相关回归通过后再具名复验；未知Notes/Memos及主面板封存不变。

3项预期红例后137测试757断言及主/研究类型通过；独立代码复核的显式题名/规则名碰撞已补红绿修复，其余新读优先级与recent窗口保留按既有合同裁定。11实际prefix的零provider解释选择重放通过，5次涉及Q3诊断focus，候选未重放、无完整新prompt/答案或语义升格。原初/终对象快照审稿错误已按revision21/23另存裁定。下一步explanation-focus-v1同字节同预算普通复验，完整checked/语义previous仍未达。

2026-10-04 explanation-focus普通复验9/9，5题全rejected，0usable；初/终revision38/39，原4缺pathKey+7缺after草稿没有原键纠正/撤回，9个typed identity缺口及开放路径/依赖仍在。解释任务实际轮转到5题，不等于修复；目录search四次source-out-of-scope占24工具预算中的4次，总26尝试/24计费/20成功/5hostread。版本与返回文件关系文字已展开，权限助手仅搜索声明未读body；独立window-only correct评语经允许范围/任务前提点验降为遗漏，不能把缺展示当缺源码。累计338调用，费用/人力unknown，unknown Notes/Memos和主面板保持封存。

下一现场共享修复工作计划：先写目录selector必须只筛既有索引文件且防前缀碰撞/越界/未索引路径的红例，再让source_search/source_symbol共用文件或目录索引筛选（source_read仍精确文件）。第二组红例要求当前拒绝目标在模型反馈有有界原稿及精确question/group/key、原证据、所有自身诊断和是否已有accepted目标；最多4项/16KiB整项轮转，完整report不裁剪，超限仅给明确定位和省略原因。普通和局部原稿分别保留引用来源，局部补question/evidence仅复用原host绑定，不授权未读窗口。指令明确：从未接受的草稿纠正用add，已接受目标修订用replace；弃稿仅已存在的eligible withdrawal，不自动清除旧错误。pathKey/after/binding identity/条件/完整性由模型显式填写，缺字段不推断、不增加provider。用已记录host展开和原拒绝片段对真实proposal离线验证接受状态不变与修复可见性；不声称完整9prompt或局部路由重放，相关红绿/类型/独立边界点验后再同作者字节同12/24预算具名ordinary复验。

上述6项预期红例后145测试845断言、主/研究类型通过。目录查询/符号定位仅原索引过滤，路径/源身份约束及已有预算保持；拒绝目标4项/16KiB整项轮转、原稿/host scope/指针可见，add/replace/withdraw资格明确且不推断缺字段。独立点验未见可达绕过；非JSON Symbol clone问题已在旧raw retention存在，不增门。实际7提议saved expansion+invalid fragment的ordinary重放accepted state完整相同，11拒绝保持，不覆盖9完整prompt/路由/依赖状态；4旧目录查询恢复，其中2空匹配。下一同字节同12/24预算rejected-target-directory-v1具名普通复验，0新provider阶段累计338，无质量/previous升格。

2026-10-04 rejected-target-directory实际11/11、24/24源码动作成功（17read/7search/9host），权限helper body及version resolver已读；本轮6提议无拒绝目标，原稿反馈未获得实际效应证据。首次完整check在revision25，之后slice35仅剩2object-unreachable，没有新的final check；final仍原initial，5题rejected/0usable/无previous。累计展示256089，其中重送181393，下一请求超过余6055字节而未派发；11次响应均已返回，终止并非工具失败，费用仍unknown。窗口逐项和计量精确对上；Q5长期占两个解释槽，Q1显式选择1008–2396类候选等待全范围，Q3/Q4短入口可解释仍等待。两个wire坏稿及未incorporate/目录dependency hint问题另列。源码评审点验实际router继承、权限class及model属性可用但未读；policy/部署unknown不抹除这些遗漏，累计349/USD与人力unknown，主面板及封存请求不变。见rejected-target-directory-outcome.json及独立review/主裁定。

下一现场共享修复工作计划：先写持续具名错误不能占满两个解释槽、其它ready题与decisive定位候选必须有界轮转的红例；保留一个定向修复机会，另一机会公平推进其它题，不把规则复制给其它题。已选择但仍未读完且有其它原索引候选的入口，提供当前候选再选择任务，供模型缩小粗入口；不自动取消原选择/换函数/断言语义。第二组红例要求每次展示只选原证据整窗，保留原id/path/sha/text，按剩余累计展示预算与剩余dispatch分配窗口；未放入当前整窗的local任务不得获得绑定，超大/暂未展示的身份仍在完整证据目录及有界deferred记录中，模型可普通已展示增量或请求确切读取。近期和diagnostic证据不再无界灌入每轮，保留原报告、当前缺口/提议/预算计量、unknown隔离和最终validator；不剪源码行、不生成语义摘要、不抬12/24/262144限额或增调用。先聚焦红绿/相关类型，再对实际11prompt离线选窗/覆盖与字节计量，明确不是新答案或完整运行因果重放；独立范围点验后才同原作者字节具名实际复验。

2026-10-04 source-window-budget共享修复已按上一计划完成工程验证：7预期红例及独立覆盖缺口1红例，155相关测试905断言/主与研究类型通过；首选focus+其它ready题轮转，超过2项decisive定位轮转，原候选显式refinement，整窗覆盖缺失不回退，无fit无local授权，未展示read后续可offer。structured/native按剩余累计display/剩余dispatch规划，不改实际12/24/262144边界。11冻结snapshot选窗投影118228/43532，6proposal canonical acceptance不变，0provider/source/target；只选择回放，非新prompt/答案/依赖/语义或资格。详见source-window-budget-verification.json及replay；下一立即同原作者字节普通source-window-budget-v1具名复验。

2026-10-04source-window-budget实际复验11/11、14成功源码动作，31664/20708且无budget/wire终止，两个完整check/final slice均22；5题仍rejected、final只改prose。4ready题轮转，original/archive未定位，不把未ready叫公平饥饿；refinement/deferred未实际发生。原source binding缺pathKey/after/身份链接与可避免source gap继续保留；views1368-1450body已展示，versioning/urls/class/models仍可读，不从原unknown写source unavailable。独立评语与主纠正分存，累计360/USDunknown，无previous/main panel。下一共享工作计划（实施前）：写已有其它题悬空前驱不能回滚当前合法atomic entry/dependency的红例，连同same-question untouched gap、当前新/被修改节点自身悬空仍回滚、新增downstream断链仍回滚及旧拒绝不清除；用previous/current unresolved身份差及submitted target范围控制事务回滚，不放宽最终结论/源码/依赖check，不填语义字段。原proposal5另题干扰已点验，零provider复算应只改变该原子事务接受与后续对应状态，旧失败/原源/raw answers不改。聚焦红绿/相关类型后做窄独立边界复核及不同项目普通相关例子，再推进成对块。

2026-10-04atomic事务隔离红绿完成：29pass/2预期fail/155断言→31/173，联合164/964、主/研究类型通过；same/other旧缺口不回滚当前合法项，submitted自身/new link/rejected/withdrawal错误仍回滚，旧诊断与最终check不放宽。独立边界/回放核验无实质可达回归；原4prefix不变，第5单事务13→15两项接受/另2题旧悬空与旧拒绝保持，0provider/source action，无后续调度或质量资格推论。下一不同项目相关检验：用Gitea GetRepoPermissions原自然brief、相同原源范围/model/12-24-262144限额在仓外普通CLI guided D1运行，不提供旧答案/图/正确helper，原件保留并匿名源码评阅；此为描述性修后迁移，不占主16行，不释放Notes/Memos未知身份。返回后检查实际atomic/局部链与原答，再推进两题轮换配对块及真实previous。

文件：新建 `inquiry-local-extraction.ts`、测试；接 inquiry-domain-runtime.ts 和现有 provider/telemetry。

- [x] 给模型的局部任务包含一个 WorkItem、当前源码窗口、必要调用点/问题、明确前提；输出窄语义增量和未决依赖。
- [x] 一个补读动作后必须生成可执行的“解释这个片段并关联这个问题”的待办，不再依赖模型自行回忆关联。
- [x] 系统补引用定位、稳定 ID、来源记录；模型负责解释 caller/resource/guard/effect 与条件，不由词法同名推断授权。
- [ ] 分别测试并真实点验 owner=null、owner未知、grant未给定、角色例外。原回答中的 claim 与 typed predicate 不一致时发出局部修复，不直接抹掉原文字。
- [x] 内部模型调用进入同一 provider 与 token 账本；优先把解释合并进下一次正常步骤，不无条件为每个 helper 新增一个模型请求。

### AR8 — 上下文和预算按工作进度管理

文件：inquiry-run.ts、inquiry-native.ts、inquiry-domain-runtime.ts、相关 source accounting 测试。

- [x] 默认提示包含当前问题、未决队列和本次必要源码；旧 evidence 可重新请求，保留编号与来源，不每轮重发全部工具历史/完整 proposal。
- [x] 禁止对决定性源码做未经核验的语义压缩来节省 token。可以机械选窗、去重、显示范围和已保存证据索引。
- [x] 预留检查与最终交付机会，检查不能被编译/反复observe耗尽。真实同一根因诊断去重后再修，不把完整错误清单重复灌回模型。
- [ ] 量化每个解决缺口的调用/读取/重发字节；出现“调用增加却无状态进展”立即登记并修调度，不只抬预算。
- 2026-10-04本阶段工作计划：先保存compact原报告的独立源码语义复核及主代理裁定；再以归档request、dispatch事件attemptId和response tool-call ID构造零provider进度汇总，测试UTF-8/重复窗口、归档关联缺失及跨题工作项隔离。分别记录序列化messages、system、tools和续接toolResults字节，不能称为SDK网络载荷；调用物理读取缺少逐项记录时保留unknown。工作队列状态、实际accepted/rejected及新诊断分别计量，不能以接受项数代替闭合或把同一错误反复累计为新错误。按六个原native归档生成结果，不重发原任务；随后针对实际停滞原因修宿主关联，并推进真实previous和两个授权作者配置。
- 归档计量与独立复核已完成（5项29断言/研究类型通过，零新增provider）。下一修复的具体边界：同题已接受且sourceBound的entry规则引用原窗口，该窗口包含唯一已索引候选的声明行且path/sha一致时，宿主将这个已由模型明确声明的入口位置关联回entry工作项。显式workSelections优先；其它题、非entry规则、未接受/未读窗口或多个候选均不消歧。关联只推进取证/解释队列，不新增规则、值、依赖或语义closed；按当前图重新计算，来源变化继续阻断。先红绿验证上述反例，再零provider重放compact真实提议，保留原失败；之后才运行具名同题复验。
- 2026-10-03 probe-3修复方案：发现词法引用时只读selected定义确切行范围，同题同原位置去重；未被明确关联dependency或局部candidate选择的引用只保留线索，不自动读。仅guided探索阶段将根部纯controlDelta及无calls的纯tool/controlDelta无损归一为control，保留原文与归一记录；含混字段/无效delta/最后final专用阶段仍拒绝。不提高原预算、不重发attempt-3未知请求。
- 2026-10-03 Memos首探针2派发失败：原稿提供明确calls却漏kind；修稿补kind但controlDelta漏当前策略常量schemaVersion。计划以真实原件作红绿回归：仅guided已选合同补缺失的版本常量，明确非空合法calls且没有其它分支字段时补tool种类，记录归一；显式错误版本/含混结果/空calls仍拒绝。原模型Schema仍要求完整字段，不改语义项或自动选择candidate，原失败与成本单列，修后同题复验。
- [ ] 回归中确认首答、检查失败后修订、总限额、关闭后无续发、不同问题的局部结果保存。

- 2026-10-03 Memos修后12响应仍无checked交付：入口首次局部解释后转awaiting-verification，却在闭合前不再offered；后续两个入口增量被拒，$local包装诊断无法通过有效同题更新清除。计划先红绿验证未闭合已读工作项继续可解释、待解释项优先，以及包装错误的同题恢复；具体字段错误、别题错误和源码失效继续保留。原语义回答与图缺陷分层评价，原attempt不覆盖。
- 上述生命周期红绿修复已通过62项334断言，真实前四步离线重放保留原10接受、下一增量从整体拒绝转10接受/3项Schema拒绝；没有生成新final。原12次响应wire失败为0，证明先前协议根因改善；当前图仍未闭合，语义评阅partial与主源码裁定分存。累计46派发，下一步仅同题具名修复，Paperless未知请求与主质量面板仍封存。
- Memos attempt-3在af0110c4取得12响应和raw final，预算耗尽、无checked交付；入口及helper能多次局部修订，生命周期根因改善。新主阻力是大量显式replace因省略机械reason被拒（Schema却将其标可选）。按最少必要护栏修订：非dependency的局部显式替换允许省略reason，宿主保存“显式局部替换”的来源标签及前后版本，不虚构模型语义理由；dependency.reason仍是必需的相关性说明。先红绿与真实原增量离线核验，再评估是否释放下一真实用途；原失败/58累计派发及未知费用保留。

### AR9 — 从局部规则到分层答案检查

文件：control-conclusion.ts、inquiry-result.ts、inquiry-domain-runtime.ts、各自测试。

- [x] 对每个问题产生可追溯的 entry→binding→control→effect/拒绝关系及未覆盖列表；不要求所有任务机械具有全部节点。
- [x] 分列 transportValid、referenceValid、ruleConsistent、evidenceCoverage、semanticReview、deliveryStatus；程序未知语义保持 unknown/unreviewed。
- [x] 合理条件回答可以完整；允许范围内仍未读的决定性源码归为 unresolved，不包装为部署未知。政策评价与实现行为分别检查。
- [x] 保留好的局部答案并明确其 checked/unverified 状态。检查失败不得伪造 checked success，也不得因一个无关项丢掉全部可用输出。
- 2026-10-03恢复复核：独立核验指出无效整体仍返回result，主线程红绿修复；checks-off逐题本已unverified，但汇总true改为null。补全局结构/源失效、逐题observation及重复答案反例，源失效同时清除referenceValid。65项聚焦回归通过；未以这些工程检查代替下项语义变形验收。
- 2026-10-03定向独立复核补记：unknown条件不能支持无条件allow/deny的反例红绿修复；结构闭合的条件回答保持合法，不把所有unknown路径机械改为失败。33项结果/运行时回归通过。逐题/全局/重复/observation归属核验无新增问题；源码遗漏和自然语义污染保持下项独立评价责任。
- [x] 通过变形/错误注入检测 wrong-object、dead binding、null遗漏、grant absent/not-given 混淆和政策反推源码；拒绝错误答案的证据单独报告。
- 2026-10-03 AR9变形核验：41项179断言通过，独立只读核验确认新增null遗漏与grant known-false/unknown对照没有错误绿色断言。验收仅覆盖已提出的控制图、绑定及政策映射机械合同；图/答案遗漏当前已知null路径可拒绝，不证明任意未提出源码分支完整，也不解释自然文本真假、alias或政策语义。原证据与边界见ar9-mutation-verification.json；真实质量仍单列。

### AR10 — 普通 inquiry 与原 skill 统一使用新核心

文件：inquiry-run.ts、inquiry-native.ts、inquiry-local.ts、src/cli/authorization-inquiry.ts、src/adapters/bare-agent.ts；示例后续在 AR19 同步。

- [x] `--strategy=guided-evidence-v2` 两入口共用合同、队列、状态和检查。不要创建研究专用的成功分支。
- [x] 原 skill 仍通过 loader 加载完整原文与 references；宿主能从已有 task 编译已知声明，减少无意义的重复编译调用，模型 authored 声明的成本另计。
- 2026-10-03接线细节：guided native收到完整input.inquiry时初始化同一program/runtime，compile工具不再重复暴露，记录host-input来源及0编译工具调用；仅brief仍由模型声明且计入原预算。原skill/reference loader与旧策略接线不改；实际四消费另验。
- 2026-10-03普通入口检查发现run CLI枚举仍缺guided-evidence-v2，且adapter setup只为旧domain策略检查domain-tools。先补CLI与provider创建前校验的红测，再用同一策略解析器接通，避免把直接调用内部native API当成普通CLI验收。
- 两项预期红测成立后接通共享enum及非legacy策略校验；32项141断言、主类型检查通过。原skill四次真实运行尚未执行，不以入口测试代替消费证据。
- 完整GitHub skill的Memos普通CLI已真实10调用，读取源码并做两次检查/文字交付，但关键批次三次读取中入口不是最后两项，原文从展示被漏掉；编译有operation而无entryHint也未启动定位。两项针对红测确认，修为展示上次上下文以来所有实际新读窗口、operation可作词法候选线索。原坏答案/引用失败保持，修后同题与政策变化消费继续。
- [ ] 保持 skill 其它职责和原回答格式，领域能力只服务明确授权问题。用户不手填 trace、正确 helper 名、控制图或 oracle。
- 同题ordinary/native-memos-repaired真实11响应，窗口缺失已消除、局部图有接受项，终图前驱/对象/依赖未闭合、checked未达。原bare inquiry及same-question嵌套observations被格式拒绝，新增无损归一并用21项156断言核查；继续预先声明的policy-change消费，原始失败和语义待评保持。
- 首policy-change真实11响应、没有完成编译：schemaVersion三次放到inquiry外层，最终正确包装时探索预算用尽。修复已知版本常量的无歧义移位/补省，显式冲突仍拒绝（8项70断言）；若自然问题改写丢失符号且无候选，恢复原用户brief的词法入口线索（24项138断言），不填源码事实。按原输入同预算复验，原失败保留。
- [ ] 真实使用 Cloudflare security-audit 与 GitHub security-review 的已归档正文，各覆盖原任务及一个前提/政策变化；四次都从普通入口启动。
- [ ] 每次检查 trace 中补读、局部解释、分支计算、最终检查、文字交付五步是否真实发生。没有适用自动读取/排除时明确说明，不用无关动作刷采用率；失败现场修复并单列复测。

### AR11 — 早期纵向检验与第一轮工程调整

文件：AR root/study.ts、failure records、native 运行归档；生产修复回对应模块。

- [ ] 不等待全部开发完成才验证：AR2 有首个真实接口探针；AR6/AR7 有真实取证探针；AR10 有完整普通消费。这些时间与 revision 写入 journal。
- [ ] 选 Memos remove 和 Paperless notes 两个既有任务作为纵向开发案例，比较旧流程与新流程的实际答案、未读源码、检查、调用和成本。
- [ ] 必须完成至少一次“真实失败→共享修改→同题复测→相关变化任务”的闭环；若两题首次均成功，使用已登记错误注入验证修复管线，不能编造真实失败。
- [ ] 根据结果修接口/状态/调度；不为赶面板而绕过未解决的公共组件缺陷。影响局部任务的难点保留，继续独立模块。

### AR12 — 政策、前提与源码变化的实际局部重算

文件：inquiry-local.ts、inquiry-domain-runtime.ts；新建 `inquiry-reuse.ts` 与测试；接现有 compare/run，而不是新增顶层命令。

- [x] `compare` 继续只读、零调用；在新策略 run 提供显式 `--previous=<session>`。默认 run 仍可从零开始。
- [x] policy-only：源、范围、问题、前提和方法相容时复用带出处的行为提取；重新映射新规范并计算 conformance，旧规范结论失效。自然政策映射所需模型调用照实计费。
- [x] premise-only：复用条件化控制结构，更新明确用户值并重算路径；新事实若激活旧未读取分支，则只补相关证据，不能复用旧最终答案。
- [x] source-changed：受改文件/依赖影响项失效；不能证明依赖闭合时保守失效更大范围。复用现有源码身份，不另加层层 hash 审批。
- [x] 旧报告缺少依赖足迹/checked 信息时返回 needs-fresh-analysis 并提供可执行恢复，不能从旧 partial 升级成功。
- [ ] 验证 full replay 与局部重算的一致性、源未变但政策变的行为不变、前提变的分支变化、被激活缺口不会丢失。
- 2026-10-03当前实现方案：只接受同model/method/guided策略、同源身份/范围/问题结构且原逐题checked并有bounded依赖足迹的旧session。重建canonical控制增量，不复制旧最终答案或旧checker状态；验证原证据的完整窗口与当前索引原字节后导入，并分别计导入与当前实际显示。policy-only清除旧政策映射；premise-only清除不再对应当前原文的旧值，由当前普通模型步骤重新映射，调度随新值重算并补新激活依赖。任何源码文件变化/缺旧足迹/其它不相容项保守返回needs-fresh-analysis及普通恢复命令，provider创建前止步；compare仍零调用。先做确定性反例，再接run --previous及实际消费。
- 2026-10-03工程验证：前五项已由普通CLI/mock确定性验证，不等于真实付费消费。独立反例使前提失效收紧为清除前提上下文变化问题的全部值（防止旧句作为否定引文仍出现）；旧图另经当前机械检查，不信旧checked旗标。10项109断言覆盖政策fresh/reuse一致、前提激活helper、源/归档窗口失效、未知完成零provider及复用来源归档。真实消费及完整变化对照继续AR10–AR13。

### AR13 — 编写、修改与可搬移使用

文件：authoring-assist.ts/既有编辑入口、inquiry-local.ts、examples/authorization-assessment/reusable-skill/。

2026-10-04作者现场修复：GitHub+Memos首稿11请求/11响应交付两文件，独立复核内容保留四项区分/政策来源；原输入因外层brief/mode/policy与完整inquiry冲突无效，USAGE另有真实CLI参数错误。先修公开complete/mode专用Schema及作者日志位置计数，格式4红转4绿/24断言、计数及真实logger前缀4绿/14断言；普通previous4项35断言及主/研究类型通过。原0计数与一次漏匹配prefix的unknown派生都保留，命名修正为11，不重发首稿。下一步把原稿、实际结构化诊断、当前公开格式/CLI用法交同源skill模型修稿，并并行独立Download首作者；最多两真实进程，核心稳定。Memos原政策复验10调用，42accepted/0rejected、66队列变化/最长2次停滞，但0closed，正文独立full与两项形式诊断分列；累计250派发、USD/人力unknown。

2026-10-04形式诊断定位：独立locator的sourceBound:false不能解释政策失败（独立政策本不标源绑定）。主代理点验实际admin路径把相同条件重复为all(A,A)，旧canonical文字等价拒绝与政策A匹配；同当前binding部分求值后，仅作有限all/any结合/交换/幂等规范比较。2项真实形状红例和2项有限代数红例后，53测试310断言及主/研究类型通过，独立只读核验未发现实质错误。原trace零调用新检查只清政策诊断，helper仍read/partial、旧checked=false不变；不能据raw full放宽显式依赖边或提升旧结果。随后再派作者两个进程。

2026-10-04具体续作：入口引用关联已由56项275断言、主/研究类型及compact原控制slice零调用重放验证，两题unlocated均推进待核验、没有新增读取/规则或升级旧失败。普通Memos原/政策输入的worklist具名复验只释放这两个普通修复用途，主面板与Paperless Notes原未知逻辑身份不释放。授权作者使用完整GitHub security-review + Memos自然请求，以及完整Cloudflare security-audit + Paperless Download自然请求（独立于封存Notes）。普通run在仓外目录从自然任务/源身份/范围和公开格式Schema生成完整inquiry.json及USAGE，不提供目标声明、图、helper答案、旧日志或oracle。保留作者首字节，宿主只做公开格式/源范围/独立政策检查；后续通过普通inquiry run消费同一配置，并用edit变政策/前提和previous检验，不私改作者实验字段。至少一项政策、一项前提变化继续，最多两个真实实验进程并行，运行时不修改共用核心。

2026-10-03提速执行：原skill的Memos普通native使用与独立非API作者链并进；非API链用完整GitHub security-review skill和当前仓库原始workflow文件，自然任务为离线权限/action引用清单及安全评阅，经普通run --optimize捕获/proposal/export，再对同一新包做原任务及范围变化消费。不给作者目标程序或评分答案，保留人工语义评阅、其它skill职责与原源文件；no-change或文档包仍不算新程序成功。用户要求每个问题一次针对性检查，不新增重复哈希或审批门；未知请求不重发、原证据和质量分母照实保留。

首原任务未交付、首包只有文档。共享agent历史原来丢调用参数和静默截断2,000字符；红绿8项后保留身份、16,000字符及明确截断，原任务复验实际写出两项请求产物。该复验正在当前proposal/export中，不以源运行改善代替新程序验收。

现有清单任务的三次proposal均只选文档，原结果不改；第二次另暴露材料化脱敏误毁JSON，12项80断言修复后第三次从相同原capture得到有效副本仍为文档。继续明确的程序作者自然任务：用户要求重复离线审阅的参数化命令，原skill模型自由实现并实际使用，随后仍由普通run --optimize导出新包。只给任务目标/输入目录/输出要求，不提供代码、预定判断或检查答案；源码模型生成的新程序经当前proposal/export也可满足新程序来源要求，须分清source-model与optimizer贡献。此独立作者任务24步上限、20分钟，非主质量样本且不替换前三次未达结果。

- [ ] 使用两个已归档 source skill 的自然任务，实际生成两份可运行输入/包配置；不给作者完整目标声明。
- [ ] 分别做一次政策修改和前提修改，运行 AR12；检查相同包是否正确携带新任务说明、旧证据失效和剩余职责。
- [ ] 首稿无效当场修共享作者/编辑流程或给出结构化诊断后修稿；原稿/修稿/消费分账。不得主代理私改实验包字段后冒充模型首稿成功。
- [ ] 从仓外普通目录复制示例运行，源路径/依赖明确，不依赖 results identity 或绝对开发路径。
- [ ] AR10、AR12、AR13若使用同一普通运行且证据齐全，可以共享该session；分别标明检验目的，不为重复证明同一性质增加调用，也不将共享session计为多个独立样本。

2026-10-03实际程序作者已生成并运行Python命令；优化器也产生脚本，但因宿主cwd变化用例的投影路径错误回滚为no-change。原首稿/模型修稿/失败验证保留。红测后共用材料化修复45项200断言通过；下一步从保留的模型候选原字节，经当前validation/proposal/export API做零模型恢复，另列host-recovery，不主代理修改实验程序、不伪称原自动运行成功。随后同一个导出包在原任务及变化任务实际消费。

该零模型恢复已导出draft（2程序case通过、0独立语义case）；同一新包在仓外原/变化任务各8次真实调用，实际执行包内脚本并交付清单和正常格式报告。变化目录含两个嵌套工作流、输出位置改变、权限省略/显式空差异均被识别。原两次CLI因adapter缺少可选execution observation在完成后报错，任务最终响应和原文件保留、不重发；共用adapter补齐记录并用27项66断言核查。至少一个新非API程序的当前生产/两次自然消费要求已有证据，但两个授权作者和真实previous验收仍未完成。

政策变化修复尝试已编译但无checked交付；独立源码核验指出self-removal绕过管理员校验，原答案对此错误。真实EOF越界读取已作共用修复，19项80断言通过；语义错误保留，后续针对分支解释处理。

### AR14 — 分组质量对照，边运行边修

文件：AR root/study.ts、evaluate.ts、failure records、evaluation-summary.json。

2026-10-04成对块恢复的实现计划：现scope-adjudication已用原failure和verification哈希绑定精确eligibleRows，但study又硬编码只接受source-window-mechanism kind，无法表达经证据限定的独立quality行。先写新quality行在显式allowlist内可执行、未列quality行继续暂停、同unknown原task即使列名仍封存的红例，再让现有精确eligibleRows承担范围限制，删除重复kind限制；不改旧adjudication字节，不自动放行任何主行，不改原failure outcome或未知请求。实际记录只能在不同项目普通检验与独立源码复核后，引用当前确定性/真实共享修复证据追加；保留Notes逻辑任务暂停及原16分母。Memos已知响应的旧replacement metadata缺陷可凭已存在修复/真实接受证据记录engineering improved，原图失败另留，不能用raw文字替代checked。

Gitea相关原件12/12已关闭，7/7源码调用成功（全部host），两check与final slice24一致但typed binding/可达性/开放依赖/complete:false仍拒绝；全部atomic:false，不算原子实际使用。独立源码full终答评语与原final自称未纳入已展示body不符，主点验APIContext.IsUserRepoAdmin实际调用Permission.IsAdmin，不是同名库函数，initial/final均partial，原评语另存。未发现可证明共同runtime缺陷。追加行级失败调度计划：只在已交付raw final、validation:false、无run error且当前domain check明确structureValid/sourceBound:true而ruleConsistency:false时，把机械失败记semantic-extraction/model-draft，继续保留invalid和needsRepair，不能据此暂停无关公共checker；其它transport/budget/结构/源错误保留原公共暂停。先写该模型草稿仍保留而下一不同任务行可执行的红例，缺交付/非sourceBound不放行的负例，再最小分类修改、聚焦联合/研究类型及独立边界复核。不会放宽结论检查或原previous资格，也不会把模型错误记成功；新共享故障一经证实仍逐组件暂停。

2026-10-04记录精确14非Notes主行共享组件范围，旧scope字节不改、Notes原task及2主行封存/16分母保持。Memos旧普通replacement metadata由已知同源native10/10、42accept/0reject及15无reason显式replace点验，仅shared engineering improved；原图/语义/作者未知不升格。block1先Memos share M与Paperless download D1，两任务臂序M→D1与D1→M不变；原/source/model/budgets与当次revision写claim，返回即匿名源码评阅，不拿ordinary旧run拼配对。生产修改使旧块中止，新revision需重建两臂；详细json quality-block-1/main-row-metadata-release-proof。

- [ ] 主比较使用八个已暴露任务，每题旧流程 M/legacy 与新流程 D1/guided-evidence-v2 两臂，共16个逻辑任务身份。每两题一块，轮换臂顺序；开始块前记录共享 revision/模型/预算。
- [ ] 每行返回即检查传输、交付及源码质量，块结束聚合独立评价；错误按第3节修复，修后同题记录新 attempt，再进入后续相关行。中止旧块/未运行项照实保留，禁止继续执行已知坏公共实现。
- [ ] 主比较检验整套流程效果。另在 Notes、Memos remove、OWUI ingestion、Gitea self-query 四题上加入 M/guided-evidence-v2 辅助臂，复用同 revision 的 D1/new；若版本不同必须重建配对，不能拼接。
- [ ] 这样分别观察执行支持和表示的贡献；不要求 DSL 每题赢，不把两者同等改善全归于 DSL 文本。
- [ ] 逐行保留 first-attempt、修后、累计开销与根因迁移；不设置“分数不好就换题”的支路。扩大样本前优先修共同机制。

### AR15 — 独立评价与修复效果归因

文件：AR root/evaluate.ts、评价记录；研究正文 §7.36。

- [ ] 评价者只读原任务、源码与匿名原答案；准确检查身份/资源来源、guard与effect、必要条件、政策区别和仍未读依赖。独立评阅与主开发者裁定分开。
- [ ] 语义完整性和 checked 交付分开，合理 unknown 与可避免 unknown 分开。结论标签和源码解释矛盾要单列。
- [ ] 对每个不良结果形成原件→原因→共享修改→同题复测→相关用例的链；语义评价确认错误后仍需现场修，不等到下轮任务。
- [ ] 任何 source-specific 修复依据不得出现在被测 prompt 的 expected 字段；若发生答案泄漏，相关行标受污染并修隔离，不能保留为收益证据。
- [ ] 汇总按相同实现/预算/任务的配对块呈现；整个 adaptive development 总分另列。未知 USD 和真人耗时保持 unknown。

### AR16 — 条件分支与证据依赖的迁移检验

文件：对应生产模块测试、AR root 的变形记录。

- [ ] 在已有不同项目中覆盖 caller=self/other、owner=null/non-null/unknown、grant absent/not-given、policy改变而source不变、源码helper变更、函数/目录改名。
- [ ] 每种变化写明预期的机械关系；语义正确性由独立源码复核，不从某个初始模型答案派生“真值”。
- [ ] 实际排除适用分支和读取新激活依赖都要有轨迹；没有发生就记录未实现/未验证，并现场定位修复。
- [ ] 一次共享修复至少检查一个不同结构或不同项目的相关例子；不要以仅重跑原错题代表可复用。

### AR17 — 预算调整与稳定退化处理

文件：inquiry-run/native、provider lifecycle 仅按已确认问题修改；AR root accounting。

2026-10-03针对真实EOF复验：12次请求均响应，源码self/nonself解释改善，但首atomic漏pathKey/前提映射错误、后续改名未退休旧目标，最终图不闭合；第12次仅check而无prose。末次messageCharacters=345669，旧native工具反复携带完整worklist/检查trace。下一步使用同一当前状态快照、工具返回保留本次诊断/接受项/真实读取，完整历史仍归档；在原12provider内预留末两次check机会及最后prose，不扩大预算。没有图闭合不能借最终文字宣称checked。

- [ ] 比较每个已解决问题的模型调用、完整prompt、输出、重复证据、耗时和修复次数；先减少反复填图和重发，再考虑增加配对预算。
- [ ] 超时、provider 不可用、预算耗尽有明确状态和可恢复输入，已得的 raw/局部结果保留；无效结果不透传成功标志。
- 2026-10-03新非API原skill实际源运行发现普通agent-loop在12步之后多发第13次请求，未消费其响应且reported ok/无交付。已保存真实capture，不改原件；单项红测后将既有边界普遍执行，6测试14断言通过。新调用不超过步数，工具末步无final返回预算错误；优化继续用已捕获的失败证据，不把ready或进程ok当任务成功。
- [ ] 修复“最后一次检查完成却无最终交付机会”等预算接线问题，原失败保持。无条件自动重试必须改为有原因的恢复。
- [ ] 无新增问题时不再启动额外性能面板；利用本轮真实轨迹和必要的单次修后对照完成分析。

### AR18 — 必要回归与工程独立复核

- [ ] 每阶段只跑相关测试；关键实现完成后做一次授权联合回归与主/研究类型检查。新问题修复后重跑受影响范围，不反复全仓审计。
- [ ] 独立只读复核重点：dead/non-dominating binding、局部更新丢错误、policy污染source、复用失效漏项、隐藏模型调用、普通入口研究特判。
- [ ] 复核发现的真实问题仍在本进程修并验证。已有历史冻结实现摘要变化不通过改旧证据掩盖，记录原因即可。
- [ ] 导出一个零provider replay 验证当轮结果、状态和修订关系，不能触发新生成。

### AR19 — 普通用法与研究归纳

- [ ] 更新 docs/usage.md、developer-guide、研究正文 §7.36、spec14.34 和当前计划/状态；给出无需 results identity 的实际命令。
- [ ] 解释用户只提供 skill/自然任务/源码范围/模型，何时需要独立 policy，输出里 checked、partial、unknown 各代表什么。
- [ ] 同一研究正文总结旧策略、新 AQ、AR 修复前后分别把工作交给谁，实际改善和代价是什么；不复制每次运行成长报告。
- [ ] 本任务书每项验收按证据勾选；工程完成、真实使用完成、收益建立分别写。未达项不以“队列执行完”遮盖。

### AR20 — 发布、恢复点与收口

- [ ] 精确暂存本轮文件，检查差异/凭据及新增链接，运行文档单测；不扫描全部历史归档多遍。
- [ ] 分阶段提交，最终推用户 origin/skill-ir-aot并核对远端；不混入他人改动、不修改 upstream。
- [ ] 更新外层 handoff/communication/conversation_log 的简短恢复记录。status 写清最后完成任务、未解决根因、下一条可执行命令。
- [ ] 若核心提前完成且仍有有效工作时间，按 AR21–AR23 顺序深化；完成后只补其影响范围的验证和发布，不重复整轮收尾。

## 6. 提前完成后的有序深化（AR21–AR23）

这些是本次已授权的后续工程，不另等用户叫继续。优先补真正缺口，不以新报告充工作量。

### AR21 — 更复杂的局部分支组合

- [ ] 仅在核心路径可用后，扩展两层helper＋早拒绝＋对象例外组合，覆盖Python和Go已有材料；有据处理组合，超出语义保持具名缺口。
- [ ] 用改名/移动、同名不同对象和未改变行为的helper提取测试防特判；发现失败现场修。

### AR22 — 编写与变化复用的可用性

- [ ] 改进普通 inspect/compare 对“还缺哪段源码、什么变化使哪条结论失效”的输出；复用现有CLI，不加展示平台。
- [ ] 根据两包真实试用减少用户必须填写的重复字段、无效修订和误导说明；验证未把独立政策或未知事实自动猜出来。

### AR23 — 已证热点与维护性

- [ ] 用当轮profiling/telemetry定位重复索引、反复读文件和大上下文热点，只优化有实际证据的部分；模块职责过大时做局部拆分，普通接口不变。
- [ ] 对改动做语义快照/相关测试，记录实际节省；无热点则关闭该项为无适用工作，不能为凑时长扫全库。

## 7. 约12小时工作安排与停止条件

| 主动工作窗口 | 重点 | 可见产出 |
|---|---|---|
| 0–2h | AR0–AR4，实际Schema/坏响应/绑定修复 | 失败回归、共享修复、首个真实接口探针 |
| 2–5h | AR5–AR8，取证队列、补读、局部解释、上下文 | 两种代码结构的真实局部链及现场修复 |
| 5–8h | AR9–AR13，分层交付、原skill、政策/前提复用 | 普通使用与变化复算、修前修后记录 |
| 8–10.5h | AR14–AR17，分块对照、立即修复、迁移 | 同题版本对照、根因修复效果及成本 |
| 10.5–12h左右 | AR18–AR20，必要验证、归纳、发布 | 可运行入口、真实结论、恢复点 |

排期允许交错：真实探针随模块接线立即做，不能机械等到表中时刻。每约90分钟写一次紧凑进度和下一动作；只记事实，不为每个里程碑请求许可。接近12小时仍有可解决工程缺口时优先修完当前一致单元并留恢复点，不误标全部完成。核心提前完成则进入有实际价值的深化；所有授权范围都完成后如实结束。

停止相关实验的原因应具体：共享实现已证故障、外部服务无法恢复、输入范围/来源不合法。实验停止不迫使独立工程任务停止。用户明确叫停时停止；不要把历史 AQ 的“本轮已停止”套到新 AR 授权上。

## 8. 验证命令与验收表

仓库根执行；以下已有测试命令可直接运行，新模块的测试在各阶段加入：

```powershell
bun test ./src/providers/structured.test.ts ./src/benchmarks/authorization-dsl/inquiry-run.test.ts ./src/benchmarks/authorization-dsl/inquiry-native.test.ts
bun test ./src/task-dsl/authorization/control-slice.test.ts ./src/task-dsl/authorization/control-evaluation.test.ts ./src/task-dsl/authorization/control-conclusion.test.ts ./src/benchmarks/authorization-dsl/inquiry-domain-scheduler.test.ts ./src/benchmarks/authorization-dsl/inquiry-domain-local.test.ts
bun run typecheck
python ./scripts/check_skill_ir_doc_links_test.py
git diff --check
```

AR1 实现后运行（这些入口在本计划编写时尚不存在，不提前声称可用）：

```powershell
bun ./results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/study.ts check
bun ./results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/study.ts develop
bun ./results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/study.ts evaluate
bun ./results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/study.ts replay
```

| 维度 | 达成证据 | 未达时怎么报告 |
|---|---|---|
| 工程 | 完整工具合同、可达绑定、宿主队列、两入口、变化复用有真实接线与反例测试 | 对应AR项不勾选，列具体阻塞，不用测试数量代替 |
| 现场修复 | 每个真实不良结果有原因、共享修复或明确外部处置、复验与效果 | 保留 unresolved，继续可执行工作；不能只登记就算完成 |
| 普通可用 | 两个原skill、原/变任务共四次逻辑消费，记录raw与checked及完整执行链 | 缺链明确partial；保留原答，不计为成功 |
| 复用 | 政策变更只重映射/对照，前提变更重算适用分支，源变化正确失效 | 清楚记录fresh分析及原因，不声称省工 |
| 质量 | 同任务配对的完整性/关键错误/缺证据/交付及修后迁移结果 | mixed/negative照实；禁止改答案或换题追分 |
| 代价 | 所有作者/提取/fallback/修复调用、完整prompt、输出、缓存、耗时及unknown费用 | 未报告费用/真人时间不填零 |
| 发布 | scoped commits、用户origin同步、可复验命令、研究正文和状态一致 | 发布故障与工程结果分开，保留恢复点 |

不提前承诺 DSL 质量一定胜出。本轮必须交付的是实际运行的共享机制、当场修复链和可信的使用结果；质量结果决定下一轮优化方向，而不是决定是否保留本轮失败。

2026-10-04 首配对块现场裁定：冻结 f190870b 后，Memos/M 首答及终答均 full；Paperless/D1 首答及终答均 partial、over-unknown，显式控制图为空。两个匿名独立源码评审与主裁定已分别按原报告 hash 保存。主代理核对第 7 次原请求，确认 views.py:1380–1505 的 5208 字节正文已经完整展示，未建立共享补读或展示缺陷；最后权限正文请求因 24 次工具预算拒绝。该行机械 checked 同时 evidenceCoverage=unresolved、sourceBound=false，不满足现有 previous bounded 合同，不能计为完整授权交付或复用成功。保留负例，下一步在同一版本执行 Memos/D1 与 Paperless/M；本块完成前不提交或改动生产实现，不拼接不同版本的配对结果。

同版本另外两臂已关闭：Paperless/M 5/5 响应、工具预算已尽，累计原文展示197950字节；下一次全量重发将越过262144限额而在派发前退出，provider尚余7次、没有首答/终答。Memos/D1 7请求/6响应、最后请求未知，16条规则与6依赖仅为未完成prefix，不重发memos-share逻辑任务。四行均独立评阅/裁定，原始配对为Memos full/not-delivered、Paperless not-delivered/partial；总分母16，四行已评、12未运行，Notes两行仍封存。关闭原块后允许修生产实现，新旧版本不能拼配对。

下一小阶段的明确实现计划：先用中性fixture写红例，覆盖legacy累计重发将超限但尚有派发额度、源码工具耗尽后仍有最终机会，以及legacy final-only模型Schema与parser一致；再最小修改公共inquiry loop，在原provider/源码预算内转为只允许final的交付机会。仅选能容纳的完整已读原窗口、其余保留metadata并具名说明未再展示，不截断/改写正文、不执行或补读目标、不重放未知请求、不伪造sourceBound/语义结果。最后一provider机会也用于final，保留现有一次具名格式/交付修复上限；预算无法容纳正文时可交付明确缺口，不能放宽引用来源。引导D1说明仅澄清legacy observations不更新canonical控制图、不满足已提供的局部解释职责；unknown/partial仍可原样交付，不强制凑图或按source-specific答案填图。聚焦red/green、相关wire/telemetry/ordinary reuse及主/研究类型后，原已知Paperless失败可具名修后重测，另做不同项目相关检验；封存任务不释放。实际质量改善由新的独立源码复核决定。

2026-10-04预算交付修复工程完成：4红例及guided host sync耗尽最后工具的追加红例后，72项524断言、主/研究类型通过；首次类型推断TS7022由显式boolean修复，原失败保留。两独立只读核查无材料性缺陷。源码重发超限转为完整窗口/metadata final，不放宽未展示引用；legacy final-only parser/model一致，原provider与工具预算及unknown封存不变。generic portable研究driver可指定原任务/方法/策略、保留原字节，无并行status覆盖。下一步同源Paperless/M具名普通修后消费及不同项目OWUI/M相关消费，原四首行/配对不改。

2026-10-04预算修后真实普通检验：同源Paperless/M与不同项目OWUI/M在提交5be5daab、原自然输入/源码及原额度下各5/5响应并交付，累计派发410。Paperless实际在24工具耗尽后第5次final-only预留返回，OWUI自行回答后一次证据编号修复；两份匿名独立原/终答均partial，主点验纠正helper窗口来源并保留原评语，OWUI已展示的bypass无写入分支也未提取。源码重发overflow子集在本次实际轨迹未触发，仍只有确定性证据；无语义收益或bounded previous升格。原已知预算故障仅engineering improved，首块原四行不改。追加MemosShare未知failure的精确12非Notes/非MemosShare主行共享范围，原逻辑任务及未知请求封存。实际公开--previous分别拒绝原Paperless partial与未知MemosShare，0provider/0新session，正向复用仍待验。下一块冻结OWUI/Gitea self两题，臂序继续M→D1/D1→M，同版配对，不用本次ordinary拼主行。

2026-10-04第二配对块已在d940关闭：两首臂因shell缺现有cache显式选择而0派发失败，原first不重置；零调用配置核对后具名attempt2 OWUI/M6/6原/终full、Gitea/D1 12/12原/终partial。对照OWUI/D1 12/12、Gitea/M6/6均原/终partial，累计446。八主首行独立评价/主裁定、四同版配对、16分母保持；修后结果不替换首次。OWUI独立原评full被主源码点验降级：允许范围内admin/save helper未读、图effect漏非bypass条件；实际request11/12有final预留，一次schema修复用完最后机会，原7conflict来自proposal6对既有目标再次add。Gitea仍未读确切context方法/converter，不拿同名库函数替代。两份作者配置公开policy/premise编辑及actual previous均0调用、needs-fresh-analysis；未知Memos不重发。下一工程明确计划：先补local add冲突反馈红例，再只在公开local/update模型反馈把旧digest诊断投影为同question/group/targetKey的显式replace操作提示，当前无已接受目标继续add；保留归档原诊断、原草稿、reject和最终checker，不自动覆盖或推断condition。用实际proposal离线检查canonical不变后，同已知OWUI具名复验并检查另一结构；共享缺陷证实前不放行受影响派发。

2026-10-04local冲突投影工程已按上述计划完成：两项预期红例后46测试262断言、主/研究类型通过；独立边界核验无材料性缺陷。八实际提议saved expansion/schema-invalid fragment普通组回放accepted canonical及原current7rejections完全不变，0provider/source action，不覆盖完整local offers/依赖状态/prompt或新语义。下一真实同题OWUI具名修复仍待，未升级原失效图。先完成不依赖模型的公开声明导出小修，以解决brief运行后必须重复编写问题声明才能previous的接口缺口：沿用init --from，接受实际session/archive读取run.inquiry而非答案/图；新session保存原输入解析的sourceRoot provenance，按输出路径重基。旧session没有可核定位来源时要求显式source-root，不把session/input.json相对路径错当原workdir。导出的complete input仍经公开格式检查、previous依旧要求完整checked/bounded/同源合同，unknown封存不改变。先写session声明导出/来源重基/缺来源/独占写入红例，再接公共init与usage；修后已知OWUI及中性实际previous验证使用同一稳定revision。

2026-10-04入口实现点验修订：已有check.json记录原inputPath与完整input/sourceFiles，无需再存一份绝对sourceRoot。init匹配这些已有字段后从原位置重基，缺失才用显式source-root。自然brief的旧session复用计划使用经mode/policy及compiled program匹配的retained declaration作为effective旧complete输入；只导出声明，既有checked/bounded/unknown/source验证不变。四预期红例后会话导出/重基/缺来源/已有checked natural复用通过，追加unknown负例不生成新provider/session；实际正向previous仍待稳定revision真实检验。

2026-10-04声明入口工程完成：两独立只读边界核验后，主代理把completed标签但attempt仍pending的假设写成红例，确认旧资格路径会派发；复用计划接入已有unknown判定后0调用拒绝并引导inspect。此为构造边界反例，不声称历史付费轨迹已出现。新增文件init兼容负载测试；相关32测试228断言、主/研究类型通过。真实OWUI原无效归档从外部workdir公开init/check/compare/previous四操作全部0调用，原声明及原source位置准确，旧不完整图继续拒绝，无新session；正向previous与同题冲突修复仍须稳定revision真实运行。独立评审的schema strips表述纠正为strict拒绝，测试覆盖原先未含文件init、现已补；不改变原始付费首行或语义裁定。

2026-10-04 local冲突真实复验与中性入口负例：稳定2b323fc8两项各12/12，累计470。OWUI8replace接受、旧7conflict及currentReject归零，初/终partial/无checked；同helper完整body已读，意义缺口不能借外部unknown掩盖。两证据错误是短ID和a518→e518拼写，独立host-real推断已纠正。中性raw原/终full却因path IDs及false-return effect语义不一致拒绝，公开声明/前提编辑/compare/previous0调用，仍无正向复用。主点验真实request10/11/12，纠正根据最终report推断diag已到达的独立评语；中性没有最终分支diag，OWUI request12确有diag但新格式错无下一wire修复空间，完整返回在attempt.response保存。

下一明确工程计划：先写一个原8调用内“首final格式修复、结果诊断、修后final格式修复”均发生仍保留原/终的红例。域流程在原总预算内预留最多4次交付调用（首final与一次结果修复各可含既有一次格式修复）；短预算按最多一半、最低既有两次分配，保持原4调用小例探索。仅改变探索/交付分配，不增加12/24/source额度、model calls上限或模型修复次数，不改branch/source判定、不自动别名/改图。相关source allocation/wire/telemetry/public previous及主/研究类型后，稳定revision对已知失败做一次具名复验和不同结构检验。若研究driver阻塞显式repair已知祖先链，另以红例证明后仅允许同row、hash/claim身份一致、全已知完成的具名祖先；unknown和其它任务的pause必须继续生效，不能借ordinary路径绕过共享缺陷。

2026-10-04独立边界核验后的实现细化：单纯remaining<=4会让remaining=5的探索格式重试跨过交付预留线。完整四次（以及短预算三次）预留需在下一探索最多两派发会跨线前转final；原四/五次短预算仍保留既有两次机会，其容量不足以保证两轮均格式修复。新增探索重试与自然作者重试共用总额度的反例，不能只验证无探索重试的理想轨迹。研究driver的具名repairOf逐级验证严格递减、同row完整claim/report身份与已知完成，只有这条显式祖先链上的failure可豁免；失联、跨row、前向/循环、unknown及其它共享pause仍拒绝，不修改历史failure outcome。

2026-10-04组合交付及已知修复祖先工程完成：原8调用组合红例、8/12探索与自然作者重试两红例、研究祖先八红例均转绿；首版自然作者mock因未支持prompt-parse而错误失败，修正测试传输后确认真实预期budget红。原8/12总上限内4final dispatch、原/终分别保留；四调用source allocation仍通过。祖先严格递减并绑定相同row/claim/report与failure规范artifact，unknown祖先/链外pause继续拒绝，旧report/failure字节不变。109测试692断言、主/研究类型及两独立边界复核通过，累计470无新增付费；见combined-delivery-verification。下一步冻结本修订对OWUI已知attempt2具名一次组合交付复验，并对中性不同结构原任务做一次相关检验；有checked/bounded才公开previous，不提升旧partial或释放封存任务。

2026-10-04组合交付真实结果及下一工作计划：82ede6e6下OWUI具名attempt3与同原输入的中性相关检验均10/10响应，实际首final格式修复与结果诊断修复完整执行；OWUI仍partial/rejected，中性终答full/checked/bounded。公开init/edit/compare/run --previous随后实际9/9，复用原出处控制结构且0新源码工具动作；当前true路径正确重算，但终答保留当前排除的false分支，formal仍拒绝。匿名源码评审及主原件点验确认原问题明确请求两种输入，changed初/终文字full，不能把正确的假设说明归为源码错误。累计499实际派发，三项全已知响应、无新增unknown，旧first/失败/费用unknown保持。下一步只澄清两入口公共指南与现有诊断：result.branches列当前可行pathKey，明确请求的反事实在behavior.explanation及引用中保留，原控制规则仍可供后续变化复算；不改检查谓词、不自动删答案/改图、不加答案或skill特判。这是既有字段合同文字澄清，使用现有有意义分支/复用回归与diff核验，不新增镜像提示字符串测试。稳定提交后仅对该已知负例进行一次同输入previous具名复验，来源完整性与通过检查仍分别评价；原skill完整授权链和剩余主面板继续未达。
