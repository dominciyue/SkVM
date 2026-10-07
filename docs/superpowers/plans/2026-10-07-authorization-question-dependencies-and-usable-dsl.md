# AY0–AY23：授权问题依赖、完整使用与收益验证

> **For the executing agent:** 使用 executing-plans、systematic-debugging、test-driven-development、verification-before-completion。用户已批准本任务及账号实验，要求新线程连续开发。直接实施，不在常规检查点等待确认；留在 `skill-ir-aot`，不创建分支或 worktree。先完成真实使用，再按本计划验证收益。

**Goal:** 将当前授权 DSL 做成在既定任务范围内真正可用的工具：完整原 skill 和自然任务进入普通入口，系统追踪当前问题的源码依赖，模型解释局部含义，宿主连接对象、控制和结论，交付可检查且经独立源码复核的完整回答；同包变化后可以复用，并实测质量或开销的正向效果。

**Architecture:** 在现有结构索引、operation-work、source-materials、property-demand、semantic-flow 和 inquiry/native 共同核心内补齐问题驱动的数据/控制依赖、框架前置权限、实参/返回对象连接及逐问题结论检查。新增语义仅以 `operation-evidence-v5` 显式启用；延续现有 CLI、官方账号 adapter、日志和包结构。普通旧默认保持兼容。

**Tech Stack:** TypeScript、Bun、既有 tree-sitter Python/Go 结构索引、官方 Codex CLI/App Server、现有只读源码工具和独立评价。开发 `gpt-6.1-sol / max`；被测模型为当前账号 `gpt-5.6-sol / high`。

日期：2026-10-07。状态：`in-progress`（更新于2026-10-08）。计划复核基线：`b8918e4d194b87317aea61bd61c55c96e7528458`；任务书提交在其后，启动时读取实际 HEAD。

## 一、执行合同和上下文

- 仓库 `D:/skill优化/SkVM`；只推用户 `origin/skill-ir-aot`。新开发线程为唯一代码、共享方法文档和 Git 写者；只读探子按 AGENTS 使用，主线程承担设计与修改。
- 本轮 identity：`authorization-question-closure-v1`。结果仅放 `results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/`；临时运行仅放 `D:/skill优化/project-maintenance/runs/authorization-question-closure-v1/`。
- 用户允许使用当前 ChatGPT 账号额度，无需再次询问。实验沿用官方登录和 `gpt-5.6-sol/high`；第三方 API、AV 十二旧位置仍暂停。凭据由官方 CLI 管理，不读取/归档 token，不自动购买额度、reset credits 或换身份/模型。
- 当前限定 development 的 Download、OWUI 与已归档 Cloudflare/GitHub 完整原 skill。保留全部原问题、源码范围及 skill 其余职责；不加仓库名、skill 名或预期答案成功分支。held-out、Q1、prospective、readiness、旧 `0/6` 保持。
- 约六成质量、四成编写复用是开发精力安排。安排足够完成下述工程和实测的连续工作；不按钟点停止，不等待或重复测试凑时长。
- 工程、真实使用、比较效果分别记录。不能在只完成代码/离线包时把本任务目标标完成；若真实通道持续不可用，完成可独立推进的工作后如实交付阻塞点。

### 主开发者亲自必读

1. 根/仓库 AGENTS、[当前状态](../../skill-ir/current-status.md)、本任务书、[spec §14.38](../../skill-ir/skill-ir-aot-optimization-spec.md#1438-ay-question-dependencies-and-usable-domain-execution)。
2. [研究正文](../../skill-ir/skill-dsl-research.md) §1、§7.59–§7.60、§11。必要时回读 §7.58 的旧语义约定，不重读所有历史阶段。
3. [AX summary](../../../results/skill-ir/skill-dsl-research/development/authorization-property-execution-v1/summary.json)、[status](../../../results/skill-ir/skill-dsl-research/development/authorization-property-execution-v1/status.json)、[manifest](../../../results/skill-ir/skill-dsl-research/development/authorization-property-execution-v1/manifest.json)，以及 Download/OWUI 最新首件、具名修订和主裁定。
4. [使用说明](../../usage.md)、[开发指南](../../skill-ir/developer-guide.md) 的 account、inquiry/native、source material 和变化复用段；`D:/skill优化/project_handoff.md` 中的跨线程状态。
5. 即将修改的代码完整读原文。本文路径均相对仓库；新文件明确标“新增候选”，实际落点允许按职责合并进已有模块，并同步本计划。

### 继承事实，避免重新误诊

- AX 20 首位置中 9 已尝试，17 份归档，活动尝试 0；11 个未派发位置是 3 个变化、2 个消费者、6 个质量对照。旧账保留，本轮建立逐位置承接映射，不能把旧未运行改成成功。
- `property-demand.ts` 的 v4 主要做源码不可达排除和八锚点 frontier。问题身份尚未形成主体/资源/effect 的反向依赖种子。两份真实提案必需标注为 3→4、7→7；真实合流触发 0。
- `operation-work.ts` 已有 DRF/MRO、permission_classes 和 serializer 相关候选；`structure-index.ts` 已有 import、C3/super、receiver、实参和有限返回类型；`inquiry-focus.ts`/`operation-links.ts` 已负责 callee 接线。应修这些关系为何没有进入当前问题和检查，不重复实现一套同职责模块。
- Download 某次自然答解释了 root_doc、版本族和文件表示，但漏了继承 GET 权限。该诊断及源码行号仅供开发/评价，不能抄进模型实验提示充当已知答案。
- 两份作者稿已按原字节准入，418 文件离线包已核验；当前真实消费者仍为 0。AX 指定账号通道返回 `usageLimitExceeded` 和明确 failed 事件，旧 adapter 记为 completion-unknown，需新增裁定保留原件。
- 17 个可见父会话完整 input 34,358,571，其中缓存读取 31,914,752；没有发现把累计通知相加的错误。优先查重复上下文、全函数反复解释和恢复策略；隐藏请求、实际 USD、真人时间继续单列 unknown。

## 二、设计落点与外部借鉴

### 2.1 只借用能落实的机制

AY1 定向阅读以下一手资料及对应少量源码，将“借用什么、接入哪个现有模块、用什么反例检验”写入研究 §7.60，随后开发。已有知识足够时不再扩大调研。

- [CodeQL Python data flow](https://codeql.github.com/docs/codeql-language-guides/analyzing-data-flow-in-python/) 和 [API graphs](https://codeql.github.com/docs/codeql-language-guides/using-api-graphs-in-python/)：局部 def/use、参数与表达式节点、外部库和继承模型。对照 CodeQL 仓库实际模块/符号，记录所读 commit；不要求引入 CodeQL 运行依赖。
- [RepoAudit architecture](https://github.com/PurCL/RepoAudit/blob/main/docs/architecture.md)：从架构链接定位 explorer、memory、validator 的实际函数，重点看局部探索、缓存身份和路径校验；记录动态 dispatch 的限制，不照搬整个 agent 框架。
- [IRIS §3](https://arxiv.org/html/2405.17238v3)：模型提出领域规格，确定性分析消费规格并形成路径。借用职责划分，效果由本项目实验决定。
- 账号生命周期以本机 App Server schema/事件及[官方文档](https://learn.chatgpt.com/docs/app-server)为准；明确 failed 和丢失终态应有不同状态。

### 2.2 六项实现决定

1. **问题种子有出处。** 把原问题对应的主体、资源、受保护操作、待判断关系绑定到当前来源节点；模型可提出语义角色，宿主验证源码/身份/参数。模型提出的“不相关”不能直接变成排除证明。种子不足时返回具体定位任务，不能靠“全部可达 call 都必需”永久兜底。
2. **有限依赖闭包。** 在已支持语言/语法内追赋值、字段/参数/返回、调用实际参数和控制前驱，连到相关 guard/effect。缺未知调用副作用、动态 receiver、资源替换或异常影响时保留具名边界；查询不会因另一问题缺口而丢失已经独立检查的部分。
3. **框架和对象进入同一链。** 用当前源码和版本身份连接请求分派、继承的前置权限、对象检查、helper/返回资源和受保护效果。已存在的框架候选要成为可定位、可解释、可检查的义务；同名方法与同字符串对象不能无条件等同。
4. **领域事实与机械结论分工。** 模型提取当前局部 guard、效果、资源关系和用户政策含义；宿主处理身份、关系组合、有限分支、依赖失效及每题覆盖。检查明确输出“模型语义仍待源码复核”的证据层级，不把形式自洽升级成语义证明。
5. **上下文由缺口驱动。** 每次反馈优先展示当前缺口、必要源码窗口和最小修复字段；已接受且依赖未变的材料无需整段重解释。宿主保留完整原件和状态；模型始终可取回原源码。先测实际重复，再决定局部短会话或增量编码，不预先建设通用多代理系统。
6. **结论覆盖从原题计算。** 原题逐项有 answer/citation/条件/缺口，且绑定当前版本；已检查结果被后续错误/变化撤回时，旧答案不能继续显示为有效。未知部署事实允许形成准确条件答案，缺漏已在允许源码中的决定性控制则记 partial。

内部需求记录至少表达 `questionId, sourceNode, role, dependencyEdges, provenance, state, remainingImpact`；可复用已有类型。`state`区分未定位、已读、已解释、已连接、已检查、受阻；这些状态由实际工具事件导出，不再让模型重复填写已知机械元数据。排除条目记录机械理由、适用语义范围及依赖；不承诺任意 Python/Go 程序的完整静态分析。

v5 使用独立的 `question-control/v1` 材料语义身份。旧 v4 材料可以作为只读诊断；显式再接纳须通过新依赖/语义检查，旧答案/规则/check 不继承。源码未变的材料能否复用由真实 footprint 判断，不按绝对目录、问题标题或模型名字决定。

### 2.3 已有模块责任图

| 责任 | 实现与测试落点 |
|---|---|
| 账号终态、用量和安全重试 | `src/adapters/codex-account-session.ts`、`codex-account.ts` 及同名测试；`src/benchmarks/authorization-dsl/inquiry-local.ts` 与公开入口相关测试 |
| 局部语法、def/use 与 framework 来源 | `src/benchmarks/authorization-dsl/evidence-preparation/structure-index.ts`、`structure-index.test.ts`；`src/benchmarks/authorization-dsl/operation-work.ts` |
| 问题依赖 | `src/task-dsl/authorization/property-demand.ts`、`property-demand.test.ts`；新增候选 `property-dependencies.ts` 和测试，仅承载纯依赖计算 |
| 对象与调用连接 | `src/benchmarks/authorization-dsl/operation-links.ts`、`operation-links.test.ts`；`src/benchmarks/authorization-dsl/source-material-projection.ts` 及测试 |
| 调度、局部解释、状态和检查 | `src/benchmarks/authorization-dsl/inquiry-worklist.ts`、`inquiry-focus.ts`、`inquiry-domain-runtime.ts` 及相应测试；`src/task-dsl/authorization/source-interpretation.ts`、`semantic-flow.ts` 及测试 |
| 材料恢复与控制语义 | `src/task-dsl/authorization/source-materials.ts`、`operation-facts.ts`、`control-slice.ts` 及测试 |
| 双入口/上下文/公开命令 | `src/benchmarks/authorization-dsl/inquiry-native.ts`、`inquiry-context.ts`、`inquiry-run.ts`、`inquiry-local.ts`；`src/adapters/codex-account.ts`；`src/cli/authorization-inquiry.ts` |

不存在名为 `operation-runtime.ts` 或 `codex-account-context.ts` 的生产模块。旧 fixed-context `markdown-study` 不是本轮 M 的运行时；当前 M 与 D1 必须复用 inquiry 的 operation 核心，避免把旧 B 的工具差异算作 DSL 表示效果。

## 三、连续开发队列

每项采用“定位实际反例 → 失败测试 → 最小共享实现 → 定向绿测 → 更新必要文档”的顺序。检查点是记录点，已授权工作连续推进。相关子任务可以交错，以尽早得到一个真实完整链；不要等全部工程写完才第一次真实使用。

### AY0 接管、状态和原题分母

- [ ] 检查分支/HEAD/状态和其它进程，保留既有修改。建立本 identity 的 `status.json`、`manifest.json`、`repair-events.jsonl`，只记录实际信息。
- [ ] 读取 AX 11 个未运行位置，建立旧逻辑位置到本轮位置的承接表；旧首件、unknown、报价和分母不改。检查没有活动同类请求。
- [ ] 从完整 AX 包/当前声明导出 Download 和 OWUI 的原 skill、完整 brief、全部问题与允许源码。保留来源绑定，不从历史终答重建输入。
- [ ] 预登记本计划第六节的 22 个必需首位置、顺序、预算、判据和 evaluator 路径隔离；具名修订另列。

### AY1 定向源码借鉴与设计校正

- [ ] 对照第二节责任图，点验已有 DRF/MRO、callee、actualArguments、sourceMaterial 投影和 v4 需求。输出一张“存在/未接线/语义缺口”的短表到研究 §7.60。
- [ ] 完成上述定向外部源码阅读，记录真正采用的符号和方案。没有直接价值的机制不引入；不要重写工具系统或把成熟静态分析器整体搬入。
- [ ] 若局部设计调整，先同步 spec/本计划后实施；目标和接口范围内的调整无需用户确认。大方向变化先说明，继续不依赖该决定的任务。

### AY2 修复账号状态，恢复可执行通道

- [ ] 先写 failed terminal、interrupted、timeout-before-terminal、transport-lost、completed-no-answer、已知 quota refusal 的失败测试。确保 final status、answer delivery、usage visibility 三者分开。
- [ ] 修 `codex-account-session.ts` 及下游：明确 failed 归为已知终止失败；终态丢失仍为 completion-unknown；完成但无终答仍 undelivered。缺用量继续 unknown。晚到事件不能覆盖后来具名尝试。
- [ ] 对 AX 明确 failed 原件追加只读裁定，保留原状态。新具名请求检查旧请求已结束；不把未知用量当作永远不能继续的理由，也不向未知活动请求自动重发。
- [ ] 沿用已验证账号 boundary；安装配置变化时只核验变化影响。首次可运行的真实任务兼作通道验证，不为重复 smoke 额外消耗。额度拒绝后暂停该通道，继续 AY3–AY12 等独立工作；有恢复证据后再尝试一次具名请求。

### AY3 建立能失败的共享反例

- [ ] 在相应已有测试内加入：继承 GET 权限在对象 guard 前；同名 sibling 方法不能连错；两个问题共享 helper 但对象不同；keyword/default/receiver/return 绑定；动态调用有未知写入；异常前后 effect 区别。
- [ ] 加入：纯局部无关值可排除，可能影响授权的调用不可排除；模型单说 irrelevant 无效；缺一题不能全局 full；无效新检查撤回旧结果；政策与源码变化分别失效。
- [ ] 测试使用匿名源码结构和通用角色，真实项目反例作单独回归。至少一个结构改名/换目录后结果保持，一个改变 guard/资源后结果必须改变。
- [ ] 运行受影响测试，记录预期失败原因；不创建只镜像实现或统计文件数量的验收测试。

### AY4 问题种子与来源绑定

- [ ] 在 existing program/operation 结构中表达每个原问题实际关心的主体、资源和 effect；输入来自任务及源码，政策与行为分离。
- [ ] 能机械确认的入口/参数关系由 host 填；需要解释的角色由模型提出，验证当前 sourceCallId、span、对象和版本。缺少种子给出具体下一步定位，不生成空“已覆盖”。
- [ ] 多题共用一个来源材料；绑定和需求分别存储。避免每题复制整套函数标注。

### AY5 有限数据和控制依赖闭包

2026-10-07初版设计细化：在完整已读骨架上增加AST reads/writes，并沿有限分支/异常结构生成来源前驱。原问题内容与角色引用参与闭包身份和种子；未知调用始终保留潜在写入边界。第一版安全排除只覆盖未被任何当前依赖使用的局部标量常量赋值，不依据模型context/irrelevant删调用或复杂表达式；跨过程身份沿既有typed projection完成。

- [ ] 用结构索引和源码骨架建立有限 def/use、参数、字段、返回和控制边；从 AY4 种子向依赖追踪。复用 `withSymbolSyntax`/call argument 信息，新增纯 helper 仅在现有模块确实不能承载时建立。
- [ ] 明确分析支持域及排除证明：动态 dispatch、未解析 alias、未知副作用、资源替换和 exception/finally 影响作为边界，不因缺边就判无关。
- [ ] 接入 property-demand/frontier，区分“已证明无需解释”“待解释必要项”“尚待定位可能影响项”。在已有真实单位上输出改变前后的具体锚点，而非只给数量。
- [ ] 接通初版 v5 到同一核心，可运行后立即安排 AY13 的第一个真实任务；后续修复回到责任模块。

### AY6 框架权限和入口顺序

2026-10-08进展：源码确认的dispatch与route/dependency已作为v5逐题前置边界；缺源码及未进入当前调用投影的项保留pending/read，匿名反例防止方法体alone误报bounded。完整dispatch顺序与请求级权限组合尚未完成，不勾选本阶段验收。

- [ ] 将已有 operation-work 的 framework 候选连接到当前 operation/question，核实 dispatch/initial/check_permissions、permission_classes、继承方法和 HTTP 方法映射的真实顺序。
- [ ] 框架关系绑定精确包/版本与已读源码。存在用户 override、不同版本、缺依赖或 ambiguous MRO 时给出准确剩余影响，不能默认为允许或凭文档常识补齐。
- [ ] 通用匿名框架反例和实际 Download 回归同时通过。框架知识作为源码/版本模型进入生产分析，开发者对本案例的正确结论只留在 evaluator。

### AY7 实参、返回与资源身份闭合

- 当前实施顺序（2026-10-08）：先用匿名模块实例/遮蔽/重绑定反例验证实际 receiver 来源，再在 v5 source skeleton 中保留唯一未重绑定实例的 source/SHA/class 证明，并生成普通 `value` 绑定。只接机械 receiver，不推断主体、资源、授权或字段 alias；字段传给错误 principal 参数仍报类型缺口。随后核验保留 OWUI 提案的零推理效果，再进入框架组合和真实具名复验。
- [ ] 复用 `actualArguments`、`bindOperationCalls` 和投影链，验证 positional/keyword/default/receiver、局部 alias、返回资源及替代资源；不能靠字符串相等跨作用域确认同一对象。
- [ ] 唯一可机械证明的连接自动接线，歧义返回最小候选/差异供模型解释；不让模型重复输入 host 已确认的 ID。
- [ ] 连接身份含 caller、sourceCallId、当前候选、参数和源码依赖。变化失效精准撤销旧关系，不静默使用 sibling/旧 callee。

### AY8 调度与局部解释的闭环

2026-10-08真实OWUI反例细化：七轮增量字段确有前进，最后宿主生成34个块（其中8个为空）却被沿用手写接口的32块上限拒绝。先在v5源码编译器复用同单元的无动作空块，保留每个实际条件、步骤、正常/拒绝/异常出口及既有路径/节点边界；不提高求值上限。停滞按当前缺口和已保留字段进展判断，不能把observations的pending标签当源码frontier停滞。实际发送上下文与原始归档分账，引用的bytes是被引用原值大小，不是该引用包的发送大小。

零推理原件复验现为27块/1空块/72步骤，步骤与控制目标相同，单元接纳1，两个文件查询callee仍未解释。独立评审发现已provided字段内容变更未计进展的漏洞，已红绿修复；有效条件/returnOutcome/fallthrough变化会重置，解释文案和无效字段不会。defer同时给revisit和nextItemId现具名拒绝，不将其误诊为已读候选不可用。

- [ ] `inquiry-worklist` 按缺失前置权限、当前资源链、决定性 guard/effect 优先调度；避免先把所有可达 helper 全部探索一遍。
- [ ] 读取后明确落到哪题/哪条边/哪项待解释；下一次反馈报告已填和仍缺。解释通过后自动触发可机械完成的连接/重新检查，不要求额外无意义模型回合。
- [ ] 固定停滞检测：同一个缺口两次无新信息时检查接口/来源/调度，给出可执行的局部修复；禁止在同一坏 Schema 上继续派发其它真实行。

### AY9 逐问题条件求值与结论检查

2026-10-08进展：遗漏/重复/外来结果、无路径题借用其它题闭合的反例已修复；worklist按实际questionChecks独立关闭，未连接候选不得checked。首个真实Download仍源码partial且结构终答缺失；两次schema拒绝检查误占探索额度的计数错误已红绿修复，并提供当前机械answerContract。保留原失败，继续具名复验。

- [ ] 组合当前来源材料的正常/拒绝/异常出口、主体与资源关系，保留独立政策。许可、受保护源码效果可达和部署执行成功分开。
- [ ] 每题检查结论、必要条件、证据和仍影响该题的缺口；合格条件答案可 full，遗漏允许源码中的决定性条件为 partial。
- [ ] 已解决题与受阻题分别交付；全题 complete 只能由原分母逐项汇总。最终自然回答与结构结果引用同一当前检查版本；修订撤回过期结论。
- [ ] 不扩大路径上限来绕开语义问题；原有异常合流只在适用结构调用。模型语义与确定性证明边界清晰，交付仍经独立源码复核。

### AY10 上下文与恢复开销

2026-10-08实际包核验：OWUI首个发送上下文约473KB，task.propertyDemand约349KB，其中机械dependencies约297KB；全31包发送计量约2.15MB。先只把当前frontier、排除证明、覆盖/下一步与机械图摘要发给模型，完整required/deferred/dependency图留在当前报告；原源码骨架/读取接口仍可取回所有语法事实。这个反馈投影不改需求生成、来源接纳或结论，不据字节减少宣称token收益。新会话架构暂不同时引入。

- [ ] 记录每次 model-visible 新增内容、重复源码、已接受材料再次解释、同单元修复次数、可见累计 token。缓存读取只算一次，研究日志不进运行上下文。
- [ ] 首先去掉重复机械身份/整批诊断，复用 `inquiry-context.ts`。字段修复只发送当前错误及依赖；原源码按需可恢复，不能只提供开发者总结。
- [ ] 若真实轨迹证明长会话历史占主因，再实施有界局部解释回合或新会话恢复：只带验证过的材料、原任务和当前依赖；同模型同预算计入全部调用。不要同时引入多个新调度架构。
- [ ] 确定性字节节省与真实 token、调用/耗时分别报告。新策略实际 token 上升时先定位而非只扩大额度。

### AY11 材料、政策和源码变化

2026-10-08框架footprint局部修复：v5每个材料单元只保存自身入口/真实receiver关系的框架依赖，工作队列的全局清单仍供导航但不复制进每份材料。`drf-source-dispatch/v2:<receiver>`覆盖当前MRO、前置方法、permission/serializer配置及选择的来源；旧v1校验保持。两个匿名红测转绿，实际投影证明无关framework文件保留两个入口、改变另一个入口只撤回它、改变共享前置控制撤回两个入口，普通helper无跨入口框架依赖。来源SHA仍为整文件粒度，同文件无关编辑也会失效；本轮不声称符号范围精度。该修复先于AY6完整请求组合，不替代实际变化消费和框架投影验收。

- [ ] 新语义身份 `question-control/v1`；v4→v5 的旧材料需当前验证再接纳，不恢复旧答案。保存来源、语义解释状态、调用/框架依赖和问题投影。
- [ ] policy 改变只重新映射政策/比较；premise 改变重算受影响条件；source 改变使真实依赖材料失效。无关源码变化不得无理由清空所有已验证材料。
- [ ] `compare` 零调用预览与实际 `previous` 消费采用一致规则；实际恢复/实际采用/最终质量三个计数分开。partial 材料允许安全复用，完整任务收益需原/变最终质量均合格。

### AY12 普通入口、原 skill 与可用说明

- [ ] 同核心接入普通 run/native 和 inquiry；加载完整 skill 及伴随文件，使用原自然 brief 和全部问题。用户不手工提交 trace、控制图或正确答案。
- [ ] 旧输入兼容。更新 `check/run/inspect/compare` 对 v5 和账号状态的帮助；D0 仅限支持的 provider 路径，账号 M/D1 的限制明确说明。
- [ ] 更新 `docs/usage.md` 和既有示例：一条实际准备/检查命令、一条运行命令、变化复查命令。只用实现并验证过的参数；避免第二套 CLI、HTML 或大量一次性包装脚本。

### AY13 Download 完整原任务打通

- [ ] 执行 `native-download`：完整原 skill、完整任务和允许源码，官方账号 gpt-5.6-sol/high，当前 v5。输出全部问题的自然答、程序检查和逐题缺口。
- [ ] 对每个失败按第四节当场处理；继承权限、root/helper、版本/文件分支及原问题中的异常条件均由源码分析得出。不要把本节诊断或历史正确答发给实验模型。
- [ ] 取得同时“当前 checked/bounded”和“独立源码完整”的基线后登记可复用材料。若未达，继续修明确共享原因；不能以 ZIP/单测数量替代这条链。

### AY14 OWUI 第二结构检验

- [ ] 执行 `native-owui`，同一生产核心处理身份、集合、重复内容与依赖关系等原题要求；无项目名分支。
- [ ] 复核两项目是否真正采用问题依赖、框架/对象连接和局部解释。若新修复改变共用语义，定向复验受影响 Download 问题，不重跑无关全仓审计。
- [ ] 两任务都以完整原题交付作为工程实际可用目标；一个成功另一个 partial 时保留差距，继续有根据的共享修复。

### AY15 两份作者包的原字节真实消费

- [ ] 优先消费 AX 两份已有效作者包，分别登记 `consumer-download`、`consumer-owui`。仓库外新工作目录只用公开命令，不由开发者手动补图/改语义字段。
- [ ] 用户字段兼容时保持原字节；确需前端语义修订时，由模型重新起草/定向修订，另登记 author revision，首稿/修改差异和额外调用均保留。宿主可自动填机械路径/ID，但不得暗改政策或问题。
- [ ] 两包每个原问题均核对；作者 valid、faithful、consumer delivered、consumer full、current checked 分列。运行时真实采用 package，不从历史成功结果替代。

### AY16 三种变化的真实 fresh/previous

- [ ] 以当前 Download 合格消费者基线运行 policy、premise、source 三种已登记变化，各一次 fresh 和一次 previous，共 6 首位置；两臂相同变化题和源码。
- [ ] 检查政策改后判断、前提改后条件、源码控制移除/变化后结论确有对应变化；记录哪些材料恢复、实际使用、失效和重取证。
- [ ] 不要求为了“复用”保留过时信息。原基线未合格时允许 fresh 诊断继续，previous 保留准确依赖状态，仍在同一任务内争取修到可运行。

### AY17 同模型、同任务的三臂质量与开销比较

- [ ] 在当前稳定版本运行两任务 × N/M-S/D-S × 两次重复，共 12 首位置，按第六节的固定次序。N 使用完整原 skill 和共同只读取证基础；M-S 以自然表述进入与 D-S 同一 v5 核心；D-S 消费对应领域声明。两辅助臂均保留同一完整 skill。
- [ ] 先运行第一组三臂并评阅；发现共享缺陷立即按第四节修复，再具名复验受影响臂。不得为了“先完成面板”继续使用已知坏代码。
- [ ] 第二组在首组修复后的固定版本成对运行；版本不同分表，禁止将首轮失败换成修订最佳答案。需要同版本第一组配对修订时显式增加记录。
- [ ] N/D 比较整套工具的增量，M/D 比较领域表达的增量；两者分别结论。N 无领域 checker 时形式项记不适用，源码质量使用同一独立标准。

### AY18 当场修复与必要机制实验

- [ ] 汇总真实反例的机制采用：找到的前置权限、成功绑定对象、排除的无关语句、减少的重解释及剩余边界。用匿名改名/结构变化反例检查共享性。
- [ ] 只对实际采用的机制做必要确定性 on/off 或单对真实修订；未触发的机制明确记未触发，不做大量空消融。
- [ ] 若 D/M 没有表示差异收益，保留配置/自然前端共同使用成果；真实工具组合有益可独立成立。若完整质量仍差，按题定位剩余责任，继续一次有依据的设计调整，不能只润色提示词后重新抽样。

### AY19 统一评价、收益和可用标准

- [ ] 对每个原件先按固定 rubric 评阅，再由独立只读评阅者点验源码和结论；主开发者裁定分歧，保留原评语。模型评阅不写成真人标注。
- [ ] 按第七节计算首答/终答、逐题/整题、条件回答、失败、未运行和修订；全成本包含修复、作者、消费者及变化。
- [ ] 将可用性、质量收益、运行开销、复用收益分别给出 observed 结论。明确下一类相邻任务需要补什么，不扩成新语料搜集轮。

### AY20 代码收束与一轮必要回归

- [ ] 删除本轮临时重复实现/失效新开关，沿既有模块维护；不全仓迁移 benchmark 目录或清理历史证据。新增字段必须有实际消费点，孤立展示字段不列功能完成。
- [ ] 运行受影响 task-dsl、authorization-dsl、account、CLI 测试及主 typecheck；研究脚本独立 typecheck。旧冻结 replay 用原实现，当前原件用当前实现，兼容差异有定位记录。
- [ ] 只做一轮相关较宽回归；新增变更或失败才重跑受影响集。外部原 skill 夹带测试不递归作为本项目测试执行。

### AY21 可搬移交付和真实复现入口

- [ ] 复用现有 portable 构造逻辑，交付两个可用任务/包及 policy、premise、source 变化的公开命令，保留 SkVM/Bun/账号 boundary 依赖说明。
- [ ] AY15 的仓库外真实消费者可同时作为便携使用证据，无须另开重复调用。每个关键结果链接原件；目录/ZIP 做一次必要字节核验，避免全历史反复哈希。
- [ ] 一段简明使用说明交代输入、输出、条件、失败如何继续和当前支持范围。开发者介入的步骤必须写出，不能称全自动完成。

### AY22 文档同步与阶段提交

- [ ] 更新研究正文 §1/§7.60/§11，记录触发、根因、修复和真实效果。同步 spec、当前 plan/status、usage、developer-guide 相关段及本地 handoff/communication/conversation_log。
- [ ] 只保留本任务书和本轮结果目录，不新增一批日期化组件文档；全局导航不指向过期“尚未开发”。
- [ ] 按共享能力/实际证据形成聚焦提交，检查 diff、凭据和本轮文件清单，推用户 origin；没有理由保留已完成本轮 tracked 修改。

### AY23 收束与下一次使用

- [ ] 记录六项状态：工程、账号真实运行、完整原 skill 交付、作者原字节消费、同条件收益、真实变化复用；附尚未满足条目的具体责任。
- [ ] `researchGoalAchieved:true` 只在第七节目标实测满足时设置。否则按实际给出 `usable-with-mixed-effect`、`in-progress-external-blocker` 或 `completed-with-unmet-criteria`，并明确哪项未达；不把任务编号全部终态作为研究成功。
- [ ] 核对 origin SHA 与工作树，给用户两个当前可执行入口和实测表。有限任务完成即交付，不以重复运行填时间，也不自行开启新范围。

## 四、失败即定位、修复、复验

每次真实终答不足、工具错误或接口拒绝都在当前线程当场分型并登记：原件/阶段/版本 → 是否源码缺失、关系未接、条件提取、错误结论、传输、预算或外部限额 → 修复点 → 定向验证 → 同例效果。

2026-10-08 OWUI `empty-regions-current-frontier` 已交付，接受6来源单元/实际3材料投影；原32块拒绝消失，但全局实例 receiver 未绑定、字段参数类型误判及两次终答schema拒绝留下未闭合。自然答仍partial（真值/既有集合早返及失败残留说明不完整）；总input+output4,571,658，比首件3,761,188增加，非缓存input268,949单列，不称整体节省。当前最小合同修复为当前answerContract机械列出真实schema枚举/数值path约束；不代填源码结论，不把自由文本coerce成枚举。原件/修订、源码评价和程序check分开保留。

- **共享实现缺陷：** 暂停受影响位置，先红测、改实现、绿测；同例一次具名复验，再继续后续。接口拒绝的字段修复不改变已接受其它事实。
- **模型解释错误：** 检查是否给到了必要源码、是否要求过多互不相关内容、宿主能否机械完成连接。优先修局部提案合同和检查反馈；不得往生产提示加入案例正确答案。原条件充分但模型仍错误时如实保留 stochastic failure。
- **同因连续两次无改善：** 停止相同提示重抽；读实际回调/源码，调整共享接口或局部拆分并增加反例。新版本再具名复验；没有可解释的修复假说就暂缓该位置，推进独立责任。
- **外部额度/网络：** 保留明确终态与未知用量，停止无效重连；不改模型/账号规避限制。运行恢复后继续具名位置；持续不可用时完整列出未执行项。
- **只影响部分题：** 继续完成其它独立题，同时保留完整原题分母。不能删掉难题、降低评分或用旧包代替新结果。

修复不设新的人工审批。小步验证默认一次；新证据证明仍有实质缺陷才追加。实际修复、额外调用、未改善原件全部计入成本，首件和修订不混合。

## 五、测试和验证命令

从 `D:/skill优化/SkVM` 执行。每一阶段按修改模块选测试，以下是已存在的代表性入口；新增纯函数测试与对应实现同目录。

```powershell
bun test ./src/task-dsl/authorization/property-demand.test.ts ./src/benchmarks/authorization-dsl/operation-links.test.ts ./src/task-dsl/authorization/semantic-flow.test.ts
bun test ./src/benchmarks/authorization-dsl/evidence-preparation/structure-index.test.ts ./src/benchmarks/authorization-dsl/source-material-projection.test.ts ./src/benchmarks/authorization-dsl/inquiry-worklist.test.ts
bun test ./src/adapters/codex-account-session.test.ts ./src/adapters/codex-account.test.ts
bun run typecheck
python -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py
```

最终较宽集使用 `bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl`，account/CLI 专项另外列出，不与重叠 focused 数相加。新增 AY 研究脚本的 tsconfig 由 AY0/AY19 创建并使用 `bunx tsc -p` 检查；源码/结果双向绑定沿现有实现一次完成。不要递归跑完整 `results/` 下外部包测试。

## 六、真实位置、预算与独立评价

| 位置 | 数量 | 输入/方法 | 责任 |
|---|---:|---|---|
| native-download / native-owui | 2 | 完整原 skill + 原自然任务 + v5 | 当前完整源码答案与 checked 基础 |
| consumer-download / consumer-owui | 2 | AX 作者原字节；必要新稿另列 | 用户实际消费与可搬移使用 |
| change-policy/premise/source × fresh/previous | 6 | 当前 Download 同一原包与已登记变化 | 真实变化质量和材料使用 |
| quality-download/owui × N/M-S/D-S × repeat-1/2 | 12 | 同模型、源码、问题、预算 | 全工具增量与表示增量分离 |
| **必需首位置合计** | **22** | 每个位置只首跑一次 | 修订/新增作者稿另记，不占换首行 |

首轮按 Download N→M→D、OWUI D→N→M；第二轮 Download D→M→N、OWUI M→N→D。运行原件可以跨两个明确预登记用途引用，但同一观察只计一次；表中默认各位置独立运行，不事后挑选 native 最好答案填质量格。

账号沿现有可兑现 host 上限：每会话 64 工具回调、显示 786432 bytes、读取 33554432 bytes、总会话 2700000ms。内部 provider 请求数/输出 token 上限未公开时不伪称可限制。自然臂、共同核心臂的可读源码和会话上限一致，额外 host 调用、作者/分析/修复开销单列。若实际任务需要改变上限，先给出资源原因并对受影响配对臂统一修订，保留首轮；单纯增加上限不记方法修复。

模型只得到完整原 skill、原自然题/相应作者声明、允许源码、真实用户前提/政策和当前工具输出。评价答案、本文根因说明、历史终答、reviewer 反馈原文、case-specific正确图均不进入执行上下文。修复通过泛化代码/规则表达，不能把反例答案塞进 prompt。evaluator 文件路径在执行沙箱不可达；用已有隔离验证，不叠加新审批仪式。

评价必须覆盖原问题的正常、拒绝、条件及要求中的异常/副作用。`full`要求源码充分、必要条件完整、引用准确、结论强度合适；泛泛 unknown 不能掩盖已可读取的决定性源码。`checked/bounded`是当前程序检查，另列独立源码质量。保留首答、预算内终答、开发者修订后终答三层。

## 七、项目本轮完成标准与正向收益

本轮目标是一个有界但真实可用的授权 DSL 成果。以下逐项验收：

1. **工程闭环：** 问题依赖、框架/对象、局部解释、条件检查、材料失效和两个普通入口共用实现，相关确定性测试/类型检查通过。
2. **真实原 skill：** Download、OWUI 各至少一个当前完整原任务同时 checked/bounded 且独立源码 full；完整原题分母与所有失败保留。不能仅靠手工修正确图达成。
3. **实际用户使用：** 两份作者包均有普通公开入口实际消费，完整问题得到有根据的回答；需要人工介入处明示，不以 valid draft 替代消费。
4. **修改与复用：** policy、premise、source 三变化 fresh/previous 都实际交付并正确响应变化；材料采用可追溯，过期答案不沿用。
5. **正向效果：** 在同版本同预算配对的有限 development 面板上，以下至少一条有实测支持；它是工程验收目标，不据此外推所有 skill：
   - 质量路线：D-S 的完整任务回答增加，两个任务均无质量退化，改善在相同任务第二次配对中再次出现；给出逐题变化和必要引用。
   - 运行减负路线：质量持平且都完整，D-S 相对 N 的完整 observed input+output 合计下降至少 15%，两任务方向一致；缓存读取不重复计数，耗时/调用作为伴随指标。此阈值预先用于区分小波动，实际 USD 仍按 provider 报告。
   - 复用路线：三变化中至少两组 previous 与 fresh 都完整，previous 的实际新语义解释工作和完整 observed tokens 减少，第三组无质量退化；计入首次建材与修复成本，报告真实观测下的累计收支和 break-even，尚未回本则只称单次复用收益。
6. **可复查交付：** 普通命令、原始回答、实际调用轨迹、当前检查、独立评价与成本可关联，仓库外已真实使用，提交/远端/工作区一致。

默认主比较是整套方法相对原 skill 的质量，第二比较为质量保持下的运行开销；M-S/D-S 用来解释 DSL 表达独有贡献。开发者不能只挑一个下降数字称整体净收益。若工具组合有益、表示持平，就交付两前端并如实说明；若工程可用但效果 mixed，状态为 `usable-with-mixed-effect`，研究目标未全达。

所有已知成本记录完整 input、其中 cacheRead、output、会话/可见调用、耗时、作者和修复；未知内部重试/子会话/价格/开发代理/真人分钟各自写 unknown。账号额度消耗不等于美元零成本。没有真人前瞻计时就不宣称节省真人时间；作者结构有效率与复用可直接实测。

## 八、保持项目清晰的交付规则

生产改动以已有模块的单一责任为主，最多先新增一个纯问题依赖模块；其它拆分须指出现有职责为何承载不了。一个显式 v5 策略、一个新结果目录、一份研究正文；不要每修一处另起 runtime、策略名、报告文档和长阅读清单。

本计划是 AY 的完整授权，发现普通实现问题直接修。若新增需求明显超出当前语言支持、目标执行或新任务类别，则在研究中说明边界，先完成当前已授权能力；不通过扩大支持面回避 Download/OWUI 原有失败。最终先报告实际用户能做什么、实测改善什么、仍缺什么，再列测试数字。
