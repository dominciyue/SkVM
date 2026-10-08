# AY0–AY23：授权问题依赖、完整使用与收益验证

> **For the executing agent:** 使用 executing-plans、systematic-debugging、test-driven-development、verification-before-completion。用户已批准本任务及账号实验，要求新线程连续开发。直接实施，不在常规检查点等待确认；留在 `skill-ir-aot`，不创建分支或 worktree。先完成真实使用，再按本计划验证收益。

**Goal:** 将当前授权 DSL 做成在既定任务范围内真正可用的工具：完整原 skill 和自然任务进入普通入口，系统追踪当前问题的源码依赖，模型解释局部含义，宿主连接对象、控制和结论，交付可检查且经独立源码复核的完整回答；同包变化后可以复用，并实测质量或开销的正向效果。

**Architecture:** 在现有结构索引、operation-work、source-materials、property-demand、semantic-flow 和 inquiry/native 共同核心内补齐问题驱动的数据/控制依赖、框架前置权限、实参/返回对象连接及逐问题结论检查。新增语义仅以 `operation-evidence-v5` 显式启用；延续现有 CLI、官方账号 adapter、日志和包结构。普通旧默认保持兼容。

**Tech Stack:** TypeScript、Bun、既有 tree-sitter Python/Go 结构索引、官方 Codex CLI/App Server、现有只读源码工具和独立评价。开发 `gpt-6.1-sol / max`；被测模型为当前账号 `gpt-5.6-sol / high`。

日期：2026-10-07。状态：`in-progress`（更新于2026-10-08）。计划复核基线：`b8918e4d194b87317aea61bd61c55c96e7528458`；任务书提交在其后，启动时读取实际 HEAD。

用户最新执行边界（2026-10-08 22:34:05 Asia/Shanghai）：45分钟内优先打通当前普通入口、来源解释、检查和交付链路，直接启动官方账号的完整原任务正式实验；截止23:19:05尚未进入时，暂停项目开发并将本任务书以未达标结束，先收尾保存已完成进展。若已进入正式全流程实验，继续有限队列、独立评价和最终交付。源码探针、通道smoke或孤立账号调用不计该里程碑；完整源码质量、checked和收益仍按真实证据分列。此最新指示调整此前等全部受影响框架/Python实现闭合再复验的顺序：不再扩大外围语法支持，先核验已有公共运行入口和完整输入，带明确剩余边界直接进入正式全流程实验，不把缺口改为成功。

该优先序下 `native-download/full-flow-v35` 首次请求在推理前因本机CLI升级至0.162.0-alpha.2而拒绝，保存原件，不计全流程里程碑。随后对本机experimental schema和实际config/thread元数据完成零推理核验，证据见[精确版本兼容记录](../../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/cli-0-162-compatibility.json)。精确版本准入仍保留每会话有效配置、指令SHA和工具边界检查；下一请求使用具名修订，完整原skill和源码范围不变。

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

当前接线顺序：源码确认的FastAPI路由及静态`Depends`参数现已进入v5临时请求投影，递归依赖先执行、typed返回再交给原入口。结构层保留constructor/import、参数、来源候选及声明call身份；`source-bindings/v6`显式撤回旧修订。模板原件不改，普通Python函数调用不执行definition default；字面默认可能被请求输入覆盖，当前不自动注入。只连接源码确认的Request与依赖结果；必要的框架Request环境以scratch参数承载，`contextArguments`与原函数实参分开。重绑定/conditional/wrapper、Annotated依赖、全局router/include配置、override与重复依赖缓存未建模时保留具名缺口，不能按同sourceId已保存就checked。方法形式的override、追加middleware/route及ASGI mount也参与具名阻断。原OWUI注释的初始零推理探针有6实际采用；补入口修改检查后发现真实app注册middleware，当前回放仅保留3普通采用，route/auth/session为read未采用、内层用户依赖及入口配置为pending。两次探针分别留档，字段类型/展开上限保留在未投影诊断，原答不升级。框架model身份和当前源码修订单列，目标安装版本/generator语义尚未核验。下一步先建立源码可见ASGI入口控制的有限模型，再接DRF实际dispatch及HTTP action映射，然后具名账号运行；本阶段整体验收仍未达。

- [ ] 将已有 operation-work 的 framework 候选连接到当前 operation/question，核实 dispatch/initial/check_permissions、permission_classes、继承方法和 HTTP 方法映射的真实顺序。
- [ ] 框架关系绑定精确包/版本与已读源码。存在用户 override、不同版本、缺依赖或 ambiguous MRO 时给出准确剩余影响，不能默认为允许或凭文档常识补齐。
- [ ] 通用匿名框架反例和实际 Download 回归同时通过。框架知识作为源码/版本模型进入生产分析，开发者对本案例的正确结论只留在 evaluator。

ASGI取证小步进展（2026-10-08）：`source-bindings/v7`的`requestMiddleware(routeId)`保留精确注册call、参数、条件/作用域、class来源及constructor/__call__/dispatch候选，沿router/include祖先进入既有operation-work/逐题队列。源码出现顺序不冒充全局执行顺序；缺外部base/类、重绑定/动态目标及未采用continuation均保留具名边界。单一稳定应用alias为resolved，重绑定/局部/全局写入的潜在alias为possible且具名未证明，不能声称它实际修改本app；这种保守来源追踪可能产生额外阻断。匿名红绿覆盖同名decoy、条件、遮蔽、重复参数、跨root/global alias及跨文件footprint。原OWUI零模型回放有11注册/11方法候选、仍3普通采用；原材料/原答不升级。118focused/398断言、联合1034pass/1平台skip及双类型通过。需要callback/ASGI环境和外部库来源的完整组合继续pending；下一步推进已有框架源码的DRF dispatch/HTTP映射，同时保留ASGI/source-version/generator缺口，不按已读method闭合。

DRF下一小步工作计划（2026-10-08）：先从原轮次已保留且SHA一致的3.18.1 wheel追加提取`decorators.py`，登记独立来源补充及原冻结树不变；不扩大旧输入allowlist或回填旧答案。然后以匿名红绿反例建立实际receiver的`@action`与`.mapping.<method>`声明、继承/遮蔽、字面HTTP参数和router/as_view来源候选；来源候选与实际执行采用继续分开，动态参数、wrapper、rebind、缺源码及自定义入口保持具名边界。接入v5逐题work和当前依赖失效，用保留Download来源做零模型回放。最后在这份关系上推进实际dispatch的动态handler/实参/异常组合，完成后才恢复具名账号实验；不把声明取证当作完整请求权限组合。

同轮真实来源发现并纳入小步修复：DRF的`GenericAPIView.__class_getitem__`源码为唯一`return cls`，旧索引却把`GenericViewSet[Document]`作为未知基类并漏掉dispatch候选。只对当前唯一、未替换、无其它动作/装饰器的原类返回订阅建立基类身份；未知/自定义订阅不按typing外观剥离。应用类的schema装饰器仍未解释，不能因找回MRO候选而宣称实际receiver或请求组合已证明。

本小步已落地v8的`requestActions(receiverClass)`和`drf-source-action/v1`失效合同，mappingBinding/invocation显式unproven；默认/动态参数、重绑定、class遮蔽/wrapper和未知router具名保留。20新增匿名反例红绿，138focused/436断言，联合1054pass/1平台skip/6683断言/114文件，主与AY类型通过。原wheel追加decorators源码及94旧文件核验，Download探针从14项漏dispatch到22来源工作、保留GET→download声明；初始/订阅修复/当前探针分别留档，原source ID、原input/allowlist/答保持。当前仍无新语义/模型/目标执行，完整class wrapper/HTTP mapping实际绑定/dispatch continuation与ASGI环境/generator未采用，整阶段未勾选。接下来确认应用class decorator源码并连接实际dispatch/handler/参数/异常，再具名账号运行。

接续工作计划（2026-10-08）：按原uv.lock核验并追加drf-spectacular 0.30.0 wheel中的类装饰器及直接helper源码，原冻结树/allowlist/输入保持。先检查真实装饰器的返回和方法修改，不凭库名豁免wrapper；把generic class decorator的来源、实参及候选纳入同一source work与依赖合同。实际绑定须采用当前解释并保留修改/异常，而不能以decorator源码存在消除receiver缺口。接着在原sourceCallId及receiver关系上补动态handler与有限实参展开，复用现有source interpretation和语义控制；try/权限拒绝/handler异常以实际源码顺序进入组合。匿名反例先红绿，再原Download零模型探针，完整组合后具名账号复验。

接续进展：锁定schema wheel补充已抓取并SHA/size核验，94旧冻结文件不变；实际装饰器return原class仍会创建继承方法wrapper/复制配置，class/method变换未采用。通用v9 sourceArgumentBindings现连接v5解释和投影，保留Python签名边界、纯转发包与super实际self，动态默认显式具名；未知/逃逸/混合包、普通keyword与*args碰撞等保持边界。19新反例红绿，145focused/469断言、联合1073pass/1平台skip/6725断言/115文件及双类型通过；只读核验和主反例裁定保留。12来源/78调用的原Download源码探针显示三条initial/super初始化参数转发可绑定，dispatch实例alias和闭包handler仍未绑定，材料采用0，完整请求验收仍未勾选。下一小步实际class decorator/闭包调用关系及实例字段的source-supported参数传播，随后请求采用和账号复验；不为它们放宽pure forwarding规则。

本小步设计细化：在structure-index保留普通class decorator声明/实参、精确声明class与实际receiver、当前工厂/直接装饰器、源码return的局部闭包候选及其直接helper来源，候选与invocation/transformation采用均分开。无源码、重绑定、词法遮蔽、动态表达式、async/wrapped工厂及未解析返回保留具名来源缺口；不按装饰器库名豁免。v5沿现有operation-work暴露read/interpret/link动作，类与方法变换在未采用时始终具名，精确receiver的source-class-decorator/v1依赖随当前候选SHA重算；材料自身footprint不复制全局队列。匿名TDD与真实保留来源零模型探针通过后，再推进闭包capture和实际请求动态handler，不把来源候选当成绑定证明。

本小步进展：v10普通class decorator来源进入现有read/interpret/link，返回局部callable仅作来源候选，invocation/transformation仍unproven且逐题阻断。18新反例及156focused/500断言、联合1091pass/1平台skip/6775断言、主/AY类型通过；主修actual subclass footprint遗漏，独立核验的exact receiver重定义具名反例已红绿。实际材料只按自身receiver失效，无关材料保留。94旧源码核验后的真实探针保留1声明/14工作及含继承2声明/20工作，receiver gap含未捕获Django View来源；初始/reviewed原件分开保存，model read/application annotation/material use=0，原输入和答不升级。下一步补来源确认的局部闭包capture和实例字段传播，进一步捕获实际缺失base来源并闭合动态handler/请求组合，再具名账号复验；本阶段未勾选。

### AY7 实参、返回与资源身份闭合

局部闭包下一小步设计：只连接当前函数中唯一、无条件、同步未装饰且仅直接调用的局部function定义；定义default/annotation有未证明动作时保留边界。捕获限已声明且整外层函数无重绑定的参数，作为带owner/SHA/使用点来源的隐式参数进入同一source skeleton、binder与typed material projection，含义仍由原六角色解释。外层局部值、nonlocal/global、escape、replacement、conditional/async/decorated定义及定义前调用不自动连接；不替Python执行factory或创建callable权限语义。合法定义声明不误当body执行，内层guard实际调用及异常按原顺序组合。匿名拒绝后写入、错capture、同名decoy及源码失效先红绿，再真实source probe；返回factory closure和ASGI callback仍另需实际调用身份。缺失Django View pin已只读定位为原lock的5.2.16，后续独立来源补充与re-export绑定另作有出处的小步，不改旧输入。

本小步进展：v11直接局部函数与稳定外层参数沿同一binder/六角色/typed投影接通，Python签名不变；返回factory closure仍是来源候选。20项新反例、170focused/529断言、联合1111pass/1平台skip/6835断言及主/AY类型通过。两项独立疑点按具体反例点验：调用保留原控制区域，未知capture role与caller角色不匹配仍由既有typed checker拒绝；没有额外模型门槛。真实94冻结字节加supplement的探针保留49局部定义全部具名（26定义、21逃逸、2外层值），5个选中wrapper/factory未采用，model/read/annotation/use/target/network新增0，旧尝试不升级。下一小步依据已定位的原lock捕获Django View/base/re-export及直接decorator来源，TDD接通唯一未重绑定public import alias与失效依赖；仍不豁免class/method变换。随后继续实际closure/dispatch字段/handler及请求组合，具名账号复验，整个AY7和研究验收仍未勾选。

来源public import小步设计：原Django 5.2.16 wheel SHA/size和94旧字节已核验，独立保留generic/__init__.py、base.py及utils/decorators.py，不执行/安装或修改旧输入。通用Python名字解析仅穿过当前唯一无条件模块import alias，逐hop检查当前绑定、终点定义及源码可见attribute/rebinding，循环/歧义/缺源/conditional/relative-unmodeled有具名gap；不执行模块初始化或按库名假定identity。Call保留selected hop path/SHA/原import跨度；实际MRO canonical base和各框架footprint纳入同一selected class binding sources，普通receiver/候选/材料关系按这些来源重验证，而不复制全局export inventory。匿名函数调用、继承、跨root同名decoy、alias/终点变更、cycle与实际材料撤回先红绿，再独立真实Django+DRF来源探针；只修候选/来源，不豁免descriptor、装饰器或callback调用。

本小步进展：v12 public import/re-export来源链、canonical MRO及精确所选hop失效已接通，19新测试、155focused/409断言、联合1130pass/1平台skip/6880断言及主/AY类型通过。两个独立只读核验提供出处；主复现并修复未带alias的dotted import错选顶层名字、重绑定公开注解沿用旧receiver，以及依赖参数/装饰器helper遗漏hop字节四个反例。整文件SHA保守失效，未执行module初始化，relative/partial/conditional/cycle/重绑定保持具名。Django 5.2.16原wheel SHA/size和94旧字节核验，独立3源码加入100文件零模型探针：真实两个receiver均连接到原View，原缺base来源解除，六项View/descriptor来源工作保留；escaped factory、class/method变换和action receiver仍未采用。捕获网络1、探针模型/目标/网络0、model read/annotation/use=0，旧input/allowlist/答不升级。下一小步连接实际factory闭包的调用身份与环境、有限实例字段/dispatch handler，再闭合请求组合和具名账号复验；本阶段和实测收益仍未达。

返回callable小步设计（2026-10-08）：保留独立returned-source proof，先支持当前未装饰同步factory唯一末尾return其未替换局部def、稳定外层参数capture；不把原direct-local escape标签本身当proof。只有同一调用者中唯一、无条件simple assignment的当前factory结果且后续真实直接调用才能提供callable instance关系。捕获映射复用现有Python binder，限caller稳定参数或有限literal，复杂/可变局部/conditional creation/逃逸/重复绑定保持具名。闭包body再含function/class/lambda时，跨层捕获和定义时default动作尚无完整环境证明，具名nested-scope-unmodeled，不能只扫描直属标识符便宣称capture完整。factory局部定义只生成普通value身份而不执行body；返回对象沿既有return/call结果传播，闭包另带机械ordinary-value instance输入，防止factory被标context后绕开创建阶段。capture含义仍由六角色解释，完整factory控制/异常/effect与闭包控制按原顺序采用，所选creation/owner/target/import字节参与失效。先匿名拒绝后写入、漏factory调用、错capture/instance、多次创建和当前源码失效红绿，再原Django/DRF/schema零模型探针；descriptor、传参callback、method/class wrapper与capture局部值不因此豁免。随后继续实际字段/handler及请求组合和官方账号复验。

本小步进展：v13精确factory结果、capture映射和普通instance参数已接到同一binder/骨架/六角色/实际投影。16项新增测试，228focused/704断言、联合1146pass/1平台skip/6939断言及主/AY类型通过；匿名实际采用保留创建顺序和拒绝后不写入，漏创建、错capture、覆盖instance、漏隐式参数和当前源码变化均撤回连接。主补两项跨层capture/default动作红测并具名阻断；两只读核验中的顺序/旧callee疑点由当前逐步重绑定反例否证，条件调用仍在原控制区，不增加重复门槛。100文件真实来源探针从初始24定义/15来源合格收紧至24/13，另外2项nested-scope具名，初始/reviewed原件分开；六项选中wrapper仍未采用，实际返回调用/model read/application annotation/use/模型/目标/网络新增均0。可变字段、动态handler、class/method/descriptor及完整请求组合和官方具名复验继续；AY7和完整质量/实测收益尚未达。

字段下一小步设计（2026-10-08）：先复用既有`transform`证明同一实际receiver槽位的写入/读取，记录显式bound source对象的identity/type和有限值，跨helper按receiver identity传播；未知/字面覆盖撤回旧typed槽位，局部已复制alias仍保留原对象，另一个同名receiver不串用。普通value源仍按既有有限值复制，不借字段名推principal/resource；只有显式typed源保存槽位对象身份。随后v5骨架只给简单Python属性赋值保留fieldWrite事实，当前解释沿既有transform执行实际右值/调用结果，不再伪装局部同名bind；读取与写入锚点分开，参数/角色仍由原六角色解释。augmented/delete/复杂目标及未解释右值具名，当前self可见自定义setter明确阻断，字段语法本身不证明descriptor/__setattr__或framework执行。复核已确认两项来源错误：字段constructor结果不能拆成receiver名字；相同文本的重复调用不能共用第一个result。后者以AST位置、sourceCallId和精确valueAnchorId贯穿骨架、同一Python binder及实际投影，文本回退仅限唯一候选；返回、字段RHS和嵌套参数均保留各自发生点。先native identity/覆盖/跨receiver、source-assisted实际helper和源码失效红绿，再复核真实dispatch字段源码和原件零模型probe；动态getattr/setattr/method alias及请求组合继续另需当前调用身份，最后官方具名复验和收益比较。
- [ ] 复用 `actualArguments`、`bindOperationCalls` 和投影链，验证 positional/keyword/default/receiver、局部 alias、返回资源及替代资源；不能靠字符串相等跨作用域确认同一对象。
- [ ] 唯一可机械证明的连接自动接线，歧义返回最小候选/差异供模型解释；不让模型重复输入 host 已确认的 ID。
- [ ] 连接身份含 caller、sourceCallId、当前候选、参数和源码依赖。变化失效精准撤销旧关系，不静默使用 sibling/旧 callee。

字段复核补充：端到端重复调用反例另揭示读取队列按候选去重被实际接线复用，第二次相同helper无法采用。读取队列仍按候选去重；接线只在当前精确sourceCallId范围构造同一来源action，不能把已读一次与实际只调用一次混为一谈。新增字段与同一行嵌套参数的有状态helper反例共同覆盖源码发生点、投影与第二次资源身份。跨文件基类setter新增红测还证明旧method候选revision遗漏MRO类字节；将实际MRO类来源纳入同一candidateRevision，新增/改变继承setter自动撤回旧ordinary-store材料，不引入全仓类inventory。

字段本小步进展：v14 typed槽位/有限值/覆盖/跨receiver/helper返回、精确调用发生点和MRO来源失效已接通，20新增反例、300focused/1085断言、新鲜联合1166pass/1平台skip/7018断言及主/AY类型通过。两轮只读核验的范围和主复现分别记录；最后两项未发现新的可复现缺陷，不宣称穷尽。真实100文件probe保留6body/15简单store，原始与reviewed输出分开；model read/application annotation/material use/模型/目标/网络新增0、旧输入/答不升级。动态handler、class/method/descriptor及完整ASGI/DRF请求还需当前调用/协议采用，随后官方具名复验与预登记收益比较；AY7和研究验收未勾选。

方法别名下一小步设计（2026-10-08）：先保留普通局部`handler=self.guard`的source-method-alias/v1创建跨度、原receiver、所选当前MRO方法和SHA；仅唯一无条件simple assignment、稳定直接receiver参数、后续真实直接调用且不逃逸/重绑定可连接。原receiver类型仍由六角色解释，同一Python binder补实际self，不改变源码签名。投影还需原赋值沿当前骨架生成的ordinary assign-value存在且早于实际调用，不允许将方法引用标context后跳过创建。当前self属性替换/动态setattr、可见__getattribute__/__getattr__、property/static/class/decorated/async方法和class wrapper、歧义MRO/conditional/multiple来源先具名；不凭方法名或库名免除descriptor。匿名直接alias、参数包/继承override、拒绝后写入、错receiver/漏创建/当前来源失效先红绿，再真实Django/DRF source-only probe。已定位dispatch的两条件来源和Django self.head条件字段alias仍不能由该静态子机制闭合，之后另接有限动态选择/字段callable及完整请求，不扩大旧输入或回填旧答。

方法别名复核补充：ordinary instance条件同样约束alias所在owner，不能只检查所选target。static/class/decorated/async owner的首参不自动证明instance receiver；四项红测（含显式强行指定actual receiver）复现后保持`source-method-alias-owner-unmodeled`，未证明wrapper/协议前不连接。

方法别名本小步进展：v15当前创建proof、原receiver和MRO override沿同一binder/骨架/六角色投影接通，ordinary创建不可context省略。23新增反例、323focused/1161断言、新鲜联合1189pass/1平台skip/7094断言及主/AY类型通过；两只读核验的owner缺陷已主复现修正，投影review未发现新缺陷。100文件真实probe保留6body/9别名，零来源合格及零采用，初始/reviewed分开且SHA相同；model read/application annotation/material use/模型/目标/网络新增0，旧输入/答不升级。下一小步接有限动态method选择及字段callable，保留实际getattr/fallback和条件控制，再完整请求组合与官方具名复验；AY7和净收益未达。

有限选择下一小步设计（2026-10-08）：先把同一普通稳定receiver的有限local method赋值（顺序覆盖或if/else内创建）保留为独立`source-method-choice/v1`，逐创建携带当前target/SHA、精确anchor和原分支路径；不把多候选缩成单一callee。复用ordinary assign-value生成无授权意义的有限方法值，入口先设未创建sentinel；在真实调用点沿既有choose按实际值分派，每个variant仍由同一Python binder补self/参数并走现有source材料投影。未创建路径保留Python UnboundLocalError/operation failure，原if、异常与deny/effect顺序保持。实际投影需逐variant验证当前proof、精确原分支内创建、选择guard和当前target，不能凭candidateId绕开。只支持直接if/else和有限simple method写入；loop/try/elif等更复杂创建、其它重绑定/逃逸、错receiver及descriptor/wrapper仍具名。先匿名分支两结果、覆盖、漏创建/错guard/错receiver、参数包及source失效红绿，再真实source-only probe；随后接getattr selector/fallback、字段callable与完整请求，不将此小步当动态dispatch已闭合。

有限选择复核细化：宿主生成的整个selector先验证全部token guard和每variant唯一当前sourceCallId/target发生点，再逐variant核验实际创建与参数；改动任一guard或复制virtual call会撤回整个selector。初版只验证当前variant，独立review指出另一合法variant仍可采用，主新增整体拒绝红测并收紧。复制出的额外call本来已因发生点name不匹配而不接线（原2 uses是两个合法variant），主保留该点验，再按完整机械selector合同拒绝整个畸形图。重复creation name由既有semantic validator拒绝，复用该结果不加同义检查。

有限选择本小步进展：v16有限创建proof、原控制路径、ordinary sentinel/token和精确调用点choose沿同一binder/六角色/投影接通。27新增测试、350focused/1311断言，新鲜联合1216pass/1平台skip/7244断言/115文件/13.99s及主/AY类型通过；两项只读核验与主红绿分列，整体selector完整性、过晚初始化和未创建出口替换均已修。100文件/6body真实probe的9别名仍具名，有限选择合格0/采用0，初始/reviewed分留且SHA相同；model read/application annotation/material use/模型/目标/网络新增0，旧输入/答不升级。继续实际getattr selector/fallback、字段callable和完整framework请求组合，然后官方具名实际复验及预登记收益比较；AY7和研究验收未勾选。

getattr下一小步设计（2026-10-08）：先连接唯一无条件`handler=getattr(receiver,selector[,receiver.fallback])`后的实际直接调用，独立`source-method-lookup/v1`保留精确creationCallId/跨度/SHA、selector表达式/子call身份、原receiver及当前MRO普通target。仅普通稳定instance owner和无getter/class wrapper的当前MRO；builtin遮蔽、重绑定/逃逸、可见receiver属性mutation、conditional创建及非ordinary fallback具名。现有Python binder筛出当前参数可绑定的普通方法，最多16项；其它属性/签名/descriptor均落到具名unknown出口，不把候选全集或fallback误认实际选择。宿主在getattr原调用点按实际有限selector值生成ordinary token，在handler原调用点按token选择同一来源call variant；未知属性的fallback行为本步仍具名，不能据default存在推断属性缺失。先匿名匹配/未知selector、拒绝先于write、参数包、漏创建/错guard/当前来源失效红绿，再真实source-only probe。随后继续conditional lookup、fallback缺失证明、字段callable及完整请求；本步不宣称真实getattr/fallback分派已经闭合。

getattr复核细化：已知literal selector先收窄当前普通候选，再计16项上限；未匹配时保留具名unknown而不采用其它方法或default。独立来源review提出候选过宽，主17其它同签名方法红测复现已知guard错误被上限阻断并修正，原runtime条件已按literal分派而未执行其它方法。eager default target/SHA仍保留，不因literal选择而漏掉其求值来源。

getattr本小步进展：v17 selector/子call结果、原receiver、ordinary token创建和精确handler call沿同一binder/六角色/投影接通；未知属性和actual fallback选择仍具名。25新增测试、375focused/1407断言、新鲜联合1241pass/1平台skip/7340断言/115文件/14.83s及主/AY类型通过，两只读核验与主红绿分别记录。100文件/6body真实probe保留6 lookup边界，binding/receiver/owner仍待证明，合格/采用0，初始/reviewed分留且SHA相同；model read/application annotation/material use/模型/目标/网络新增0，旧输入/答不升级。继续条件lookup/fallback、字段callable/wrapper和完整请求，再官方具名复验及预登记收益比较；AY7和研究验收未勾选。

lookup结构容量复核（2026-10-08）：当前16候选的创建/调用两个selector合计最多35块，超过从手写接口沿用的32块结构上限，虽然实际selector helper可只返回一个已知值。先新增完整source-read/interpret/material projection/native执行反例，以14其它同签名方法加guard/fallback组成16项，确认现状拒绝；将结构块容量调到64以容纳宿主固定展开，原127节点/16终态路径求值上限保持。该修正不提高未知分支的求值预算或将超限结果升级；随后继续条件lookup及字段/完整请求组合。

lookup结构容量本步进展：主完整16候选/35块用例先红测复现共享schema的32块拒绝。只读核验定位聚焦格式另有32块限制，主顺着实际source-update→focused-update路径再次红测复现`focus-schema`拒绝；现两处共用`SEMANTIC_BLOCK_LIMIT=64`。实际selector helper选择guard，source提交、材料接纳/投影及deny先于write均通过；原127节点/16终态路径与候选/source-reference预算保持。1新增用例、403focused/1550断言，新鲜联合1242pass/1平台skip/7357断言/115文件/11.42s和主/AY类型通过；只读65项/367断言核验另记。历史OWUI拒绝与真实probe不升级，无模型/目标/网络新增。继续条件lookup及字段/完整请求，AY7/研究验收未勾选。

条件lookup下一小步设计（2026-10-08）：将proof更新为`source-method-lookup/v2`，保留唯一getattr创建及同一local的有限普通method赋值、原if/else与try/body/handler/else/finally区域路径、真实handler调用区域。literal lookup候选与其它直接赋值target分别取证后合成最多16个实际可绑定target；default存在仍不证明属性缺失。宿主用ordinary sentinel初始化local，在原控制区域创建selector token或普通method token，并在真实调用处按实际token分派。未创建路径通过既有raise表达UnboundLocalError/operation failure，未知属性与不受支持值仍具名；所有variant沿同一binder/六角色/材料投影。投影核验完整创建/分派、sentinel、原控制区域和直接赋值，不把机械块序当作路径证明。loop/with/elif创建、其它写入/escape、receiver mutation、descriptor/wrapper等继续具名。先匿名两条件结果/原try异常/漏创建/移出分支/篡改sentinel/错区域/失效来源红绿，再真实source-only probe；不将仍有字段/wrapper缺口的框架升级为真实采用。

条件lookup实现细化：普通token身份只取精确创建/source与当前target，不含调用控制区域，两个同实参调用可在try内外共享实际创建值。不同调用实参文本暂具名`source-method-lookup-call-shape-unmodeled`，避免一处共享创建被另一调用的签名筛选覆盖；后续若扩展需显式合成创建集合并验证各调用。每次dispatch的default先核验uncreated sentinel并raise，再保留unknown值出口；16项最大机械图现37块，沿本阶段共享64块结构容量接纳，127节点/16路径执行预算不变。来源review把“分支外调用仍有已知候选”标为错误，但候选解析不证明创建必经；主未知flag反例实际保留guard拒绝和UnboundLocalError/operation两条原路径，无write。本步保留候选和原控制事实，不加会禁止正确异常路径的支配性门槛。独立意见与主实际裁定分别存档。

条件lookup本步进展：v18原控制区域、普通alternate赋值、sentinel/token、精确handler分派和whole-selector投影沿同一binder/六角色接通。11新增用例、414focused/1691断言，新鲜联合1253pass/1平台skip/7498断言/115文件/14.69s及主/AY类型通过；两只读核验与主裁定分别记录。100文件/6body/6 lookup probe中，声明receiver下1个Django基类合格；指定应用receiver的3处仍合格/采用0。初始/reviewed分留，后者只增加两种receiver资格分账。实验模型read/annotation/use及模型/目标新增0，probe网络0，开发/探子及额外runner网络unknown；旧输入/答不升级。继续receiver字段mutation、class/wrapper、字段callable与完整请求，然后官方具名实际复验和预登记收益比较；AY7/研究验收未勾选。

receiver字段与方法稳定性接续计划（2026-10-08）：先以匿名完整source-read/interpret/material projection反例验证helper在getattr创建前改写同一receiver方法槽位时，现有静态候选是否仍错误执行旧方法；同时对照普通数据字段写入、另一个receiver、创建后覆盖及普通method alias/choice。先记录实际失败，再决定来源约束或运行状态检查的最小修复，不能仅删除全部mutation限制。若需要状态条件，必须沿现有有限求值和精确创建/投影合同，不让模型或用户前提替宿主声称槽位未写。保持未知字段callable、descriptor、动态setattr及class变换具名。完成匿名红绿与独立只读核验后重跑冻结来源probe，声明receiver资格与指定应用receiver资格/实际采用分别计数，然后继续class/wrapper、字段callable和完整请求及官方实验。

receiver字段修复决定：匿名红测已确认helper的显式`self.guard=self.fallback`写入进入同一receiver状态，但后续getattr仍执行旧guard。采用现有assign-value/call上的机械`methodRead:{receiver,method,defaultMethod?}`事实，在实际引用创建时检查当前transform槽位（含未知覆盖、方法后代字段和`__class__`）；写过或receiver未绑定即具名unknown，不执行旧target。alias/choice/lookup的原创建与eager default都保留此事实，实际材料投影核验不能省略/改receiver/改method；直接普通instance调用在当前来源投影时同样补事实，super/class/static/wrapped目标不借此取得新资格。已创建alias后再覆盖仍沿原绑定调用，不在alias调用时重查。此法不新增谓词/模型角色或结构分支，64块与127节点/16路径预算保持。只放宽可由现有简单attribute transform表达的显式写入，aug/delete/索引目标/动态setattr等保持来源边界；未知字段callable尚不猜成新的target。先扩展对照反例及投影篡改红测，再最小实现、冻结来源probe、独立只读核验与主最终验证。

receiver方法槽位本步进展：v19已按原创建接通methodRead与实际字段状态，包含普通alias/choice/lookup/eager default和直接instance调用；删除或改receiver/method/default的创建事实撤回对应连接。21新增用例、新鲜435focused/2027断言、联合1274pass/1平台skip/7834断言及主/AY类型通过；两项只读核验无新可复现缺陷，主负责最终检查。super不检查instance槽位，原构造未知异常继续保留；直接call在嵌套实参后检查，实参内改槽位仍保守unknown，早期bound-reference capture待接。100文件/6body真实probe保留声明receiver合格1、指定应用receiver合格/采用0；APIView现为class-binding缺口。无实验模型read/annotation/use或模型/目标/探针网络新增，旧输入/答不升级，开发/探子/美元/真人成本unknown。接续class/wrapper实际变换、字段callable和完整请求及官方实验，不勾选AY7或收益。

AY7 class接续核对（2026-10-08）：两项独立只读定位确认当前method lookup的class-binding guard和真实schema decorator的继承wrapper/kwargs复制；主亲读utils/drainage，不能采用“只写metadata所以不会影响绑定”的概括。在实现class变换前先验证普通方法引用的函数对象边界：instance方法槽位被替换不改变已创建bound method，但`receiver.method.__func__.__code__`等函数属性写入可以影响既有引用，不能继续按普通data字段store执行旧body。先匿名来源反例复现，再把当前可定位的函数对象属性store保留为具名protocol gap，覆盖self/其它typed receiver/公开class方法/普通function及无关data，context不得擦掉；不推断替换代码或按库名放行。嵌套实参前capture仍单列pending，完整class/callable/request及官方实验继续。

反例已红测复现旧guard仍产生authorization拒绝，独立匿名Python小程序确认既有bound method实际会执行替换后的函数body。细化为同一structure-index的简单attribute store来源事实：保留当前receiver/参数type、局部alias和可能function来源及SHA；skeleton在原写入点保留protocol gap，relation footprint纳入所选正/负class与function来源，避免外部type新增同名method后继续复用旧普通data store。来源候选不冒充函数调用或已执行变换，纯data字段继续原transform。

函数对象边界本步进展：v20在原store点保留可定位function protocol gap，正/负type/MRO、function/writer、module/import alias字节纳入原relation footprint；外部type新增method撤回旧data材料，无关同名文件保持。实例writer是可能来源、不证明执行顺序。主红绿修复局部alias循环和class-local同名错绑；只读报告的module变量与裸self属性并无连接，主据真实class/instance连接另复现并修复三个module alias遗漏，保留裸self数据对照及公开hop/循环测试。26新增用例、新鲜461focused/2113断言、联合1300pass/1平台skip/7920断言与主/AY类型通过；三只读核验和主点验分列。100文件/6执行候选body+5 protocol body探针保留17 stores/10函数边界，指定应用receiver合格/采用0。来源展开128步与执行64块/127节点/16路径分别保持；无实验模型调用或目标执行，另有1匿名Python语义核对，成本unknown分列。当前工程不满足AY7/完整使用/净收益，接续class/wrapper、字段callable、早期capture及完整请求和官方复验。

字段方法值接续设计（2026-10-08）：只读定位确认当前有限值没有可执行函数/class环境，class decorator只有来源队列、没有变换投影；不能直接解除class-binding边界。先接通其共用前驱：普通instance的简单`self.slot=self.method`在原赋值点捕获当前方法和实际receiver，沿既有transform跨helper保存有出处的方法值；真实`self.slot(...)`按实际已存方法值分派，同一Python binder/六角色/有限choose执行当前已解释target。宿主机械bound-method metadata与普通finite token共同保存，不凭token字面或possible writer声明已执行；native核对捕获receiver与当前对象身份。后续源方法槽位替换不改变已存引用，未知/字面覆盖撤回引用，函数对象写入继续v20 protocol边界。先限同一普通instance首参、当前唯一完整MRO、未装饰同步ordinary target；跨receiver、任意callback/closure、descriptor/class/static/wrapped/动态setattr与class变换继续具名。读取队列可按候选去重，实际发生点和原if/try控制不得去重或提到入口。来源投影核对当前精确创建事实、整分派及实参，相关writer/target/MRO字节进入原relation footprint；只读source候选不算采用。先匿名native身份/覆盖/跨helper及完整source-read→interpret→material→native红绿，再独立只读核验、冻结source probe、主新鲜验证；随后接class/wrapper/完整请求与官方实验，不把此依赖小步当AY7或研究完成。

字段方法值本步进展：v21接通普通同instance原赋值捕获、跨helper transform和按实际field值的有限分派；literal token/字段未知覆盖/receiver或target SHA不匹配均不执行旧方法，后续源方法slot替换保留原捕获，函数对象写入仍v20具名。主红绿覆盖native身份及source helper缺捕获metadata、挪过提前return的错误采用，当前材料保留精确创建/相邻store/原if与try区域/相对调用和返回顺序，整体selector及实参逐项核验。31新增用例、新鲜492focused/2327断言、联合1331pass/1平台skip/8134断言及主/AY类型通过；三项只读核验分留；主最终红绿修复嵌套/短路表达式调用漏入捕获顺序，右侧调用保留原条件区域。初始/reviewed来源probe分留，100文件/6body声明receiver有1个可能store/5个字段call来源合格，指定应用receiver method store/字段call合格/采用0。source-invariant排除后缺完整正store图仍保守不采用，无实验模型或目标执行，开发/探子等成本unknown。继续class/wrapper变换、早期capture、完整请求和官方实际复验；AY7、完整使用和净收益未勾选。

早期方法捕获接续设计（2026-10-08）：复用v21实际bound-method身份，先匿名完整来源红测验证`self.guard(self.prepare(actor))`在prepare改写guard槽位后仍须执行实参前取得的原guard。初步限有嵌套实参call的普通同instance顶层表达式/简单赋值RHS/return direct call、当前完整稳定MRO和未包装同步ordinary target；其它形态保留既有保守检查，不借此解除class/descriptor/wrapper。索引事实保留原function属性读取跨度、当前target/SHA、原if/try区域、原同block前后事件和逐实参表达式的call/short事件。骨架在原function读取点生成机械capture，再按实参原词法顺序执行；编译沿既有boundMethod/fieldMethodRead和同一Python binder，不扩模型角色/谓词。材料核验精确capture、原区域/前后顺序、实参前位置、真实当前call及参数，移到实参之后或越过前一条调用不得采用。先保留捕获前覆盖/实参中覆盖/实参异常/短路/多实参对照，再独立只读核验、冻结probe与主新鲜验证；随后继续class/wrapper和完整请求及官方实测，不将此小步作为AY7完成。

早期捕获对照揭示实参接线缺口：简单短路实参已有原finite-control结果，但材料投影只识别literal/原binding/直接call结果，未核验并连接该机械control值。补充同一argumentFacts的source-owned value-flow事实，保留原control anchor/result/operator与简单literal/binding/direct-call操作数；投影核验原short step/调用结果/右侧body，再沿原参数binder采用该值。嵌套任意表达式不因此自动合格，不扩谓词或模型角色；与捕获、参数映射和原短路执行顺序的反例一并验证。

早期捕获本步进展（2026-10-08）：v22在限定普通direct statement/assignment/return形态保留精确function read事实，实际capture→逐实参→原call，复用v21 boundMethod/fieldMethodRead。主红绿从late methodRead阻断开始，另用实际capture/fieldMethodRead存在断言排除部分实现的假通过；简单and/or有限结果增加同一argumentFacts机械valueFlow。新增倒序实参及条件RHS额外call反例曾红，现逐事件严格有序、short shape/左右结果/当前call/原条件body核验通过。捕获前函数/None/未知覆盖、实参raise、if/try、assignment/return、多实参、keyword及短路执行/跳过保持；class/wrapper/descriptor/缺base/receiver重绑定及复杂操作数不取得新资格。两只读核验未发现新可复现问题，后一份以现有测试为主；外部target/负MRO与无关homonym由主补核。100文件/6body独立probe有1 declaring-receiver early capture，指定应用receiver合格/采用0，无实验模型/目标执行，未知成本分列。当前工程仍不满足AY7/实际class或完整请求/净收益，接续实际class/wrapper调用与请求接线、官方实验。

早期捕获新鲜验收：33新增、525focused/2676断言、联合1364pass/1平台skip/8483断言/115文件及主/AY类型通过；[核验记录](../../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-early-method-capture.json)保留两只读范围及主反例。probe SHA `2cde2fc6f4a40d56211423dc65f8775207540e5321e62a972fefcef20ba8c0b0`，旧报告不覆盖。五当前文档同步后发布，仅作为AY7依赖工程小步，继续后续实际使用与实测。

函数值与环境接续设计（2026-10-08）：实际class decorator包含返回函数、传参调用与继承wrapper，不能凭返回原class或metadata写入就免除变换。先为同一有限核心补实际source callable对象：原定义/读取点记录当前target/SHA及稳定捕获参数的实际对象环境，普通token不提供可执行身份；经既有参数、返回、alias及transform传递，调用时核验当前函数对象与target并从该对象绑定环境，不能从调用者同名局部重建capture。捕获对象的字段仍共享身份，局部重绑定不更改已捕获对象；可变闭包cell、复杂scope、descriptor与函数属性变更不由快照推定安全。六角色继续解释原参数和capture含义，宿主metadata只连对象与来源。

工作顺序：先native匿名红绿验证实际创建/传参/返回/字段/alias/两个环境、plain token及覆盖/错target/SHA/缺capture/错type/显式与隐式参数冲突；再将普通未包装module function引用与稳定外层参数local def、当前原call的function参数输入来源接入同一index/骨架/binder。来源输入只给有出处的有限候选，真正调用必须读取实际传入的callable对象；候选不等于调用。材料投影须保留原定义/读取、控制/顺序/环境、完整selector和真实参数，当前target/owner/import及负binding字节使旧材料失效。先支持可机械证明的普通函数值，复杂class/wrapper继续具名；然后继续class对象/方法变换与原请求入口，不把函数值前驱当完整AY7。依次进行完整source-read→interpret→material→native对照、独立只读核验、冻结probe和主新鲜验证；官方完整实验须在相关框架组合可用后运行。

函数值设计补充（2026-10-08）：module function读取须共享同一当前target/SHA对象身份；机械`sourceCallable.scope:"module"`只用于无capture模块引用，local定义继续按实际invocation独立创建。主红测复现各次读取都新建身份会漏掉前次引用的function属性写入，现分别核验共享module、独立local及非法module capture。生成器调用不执行其body；module generator、generator/async/wrapped创建者及generator callback consumer不取得普通执行资格。性质裁剪删去正创建图时材料继续保守不采用，不将缺失事件当成原样保留。

函数值本步进展（2026-10-08）：v23已连接普通module/local创建、实际参数值传递与capture环境，以及同一binder下完整selector和当前材料依赖；原参数意义仍由六角色解释，宿主只保留来源/对象关系。主红绿覆盖plain token/覆盖/错SHA/type/capture冲突、两factory环境、缺失/晚移/伪造创建、畸形selector/unknown/追加call/effect和callback顺序，另补修generator/创建者/consumer资格及module重复读取的共享identity。真实propertyDirected裁剪若删正创建图仍保守不采用。46新增；571focused/3018断言、联合1410pass/1平台skip/8825断言与主/AY类型通过；三只读复核范围与主补修见[函数值核验](../../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-callable-values.json)。100文件/12body最终probe有12模块引用、1局部引用、2稳定定义、1参数call来源合格，所选body合格/采用0；SHA `51dc754caa97159ccdd15b612e60637f606d6cce3bfa6da1f73abb678fe0603c`，三个报告分留。无实验模型或目标执行，未知成本分列。该前驱不是AY7完成；继续实际class/wrapper方法变换与原request接线，随后官方完整复验。


返回环境统一接续设计（2026-10-08）：v13的返回闭包仍以普通placeholder加调用者capture重建执行，与v23实际对象环境不一致。本步把当前唯一末尾返回的稳定local def在原定义点创建为同一sourceCallable，原factory正常返回/拒绝/异常先执行，调用只从实际返回对象读取捕获环境，不再追加调用者同名capture或synthetic instance参数。保持当前同步未包装factory、稳定直接外层参数、无nested scope/default动作、当前target/SHA及原定义/return顺序约束。结果经唯一原赋值后的直接调用或普通参数传递，及原嵌套factory实参可提供有出处的有限候选；候选不替代实际对象。caller在创建后的局部参数重绑定不修改已捕获对象，factory自身捕获cell重绑定仍具名。来源投影核验原定义创建、当前factory调用/result、原return及完整callback selector，并沿原relation footprint失效。先匿名端到端红绿验证两次factory环境、caller重绑定、参数/嵌套实参、漏创建/伪造返回/覆盖/来源失效，再只读核验与冻结来源probe；继续实际class/wrapper变换和原request接线，不以本小步代替AY7或官方完整使用。

返回环境本步进展（2026-10-08）：v24已将原factory local定义与唯一terminal return统一到实际sourceCallable环境；直接/传参/内联/转发call不再从caller重建capture或携带synthetic instance。主先8项预期红测转绿，再复现creation挪过caller重绑定的顺序漏洞；第一份fixture裁剪掉writer、不能作为缺陷证据，补observe及writer存在断言后重新取得有效红绿。原if/try控制保留，条件内联候选并非提前执行；只读疑点由跳过分支与移出区域反例核对，未增加全局无条件门槛。13新增，584focused/3272断言、联合1423pass/1平台skip/9079断言及主/AY类型通过；两只读范围见[核验记录](../../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-returned-environment.json)。100冻结/补充文件、12body probe保留24返回定义/13实际定义合格/所选合格1，actual returned calls/arguments/material uses为0；SHA `11eb95492b4f5142f7c0b8ac39cef5621ee829cfbd4c304ea70bcb54112f7a01`。无实验模型/目标/探针网络新增；探子npx等网络与开发成本unknown分列。实际class/wrapper变换、原request接线及官方完整复验继续，AY7/完整使用/净收益未勾选。

类对象接续工作计划（2026-10-08）：只读定位确认当前ObjectBinding只有sourceCallable/boundMethod，class实参仍是未绑定文本，无法保留实际decorator修改。先在同一有限核心增加sourceClass当前来源身份；普通未装饰、唯一稳定模块class引用在原实参读取点创建共享对象，参数/return/valueFrom/alias/transform保留它，重复读取不能重置已发生字段修改，也不能把普通token当类身份。初步限无base/metaclass的当前普通class引用；不执行constructor或凭此解除wrapped receiver。索引保留精确引用/当前class SHA/import hops/原if/try及求值顺序，材料核验原读取和完整参数。匿名native与完整source-read→interpret→material→native先红绿，覆盖同类重复读/不同类/返回/别名/字段/重绑定/移位/来源失效；继而接隐式decorator application、方法变换/原请求和官方完整复验，不以类引用前驱结束队列。

类引用本步进展（2026-10-08）：v25已接通当前普通无base/metaclass模块class在原实参位置的sourceClass身份，参数/返回/alias/字段保留同一对象；重复读取不清空字段修改，普通token/另一个class/覆盖保持未知而不借用已知状态。主16项预期红测转绿，另补跨文件class变化撤回未变caller、无关homonym保持、嵌套实参顺序及修改后抛错/捕获再读取。31新增；615focused/3464断言、联合1454pass/1平台skip/9271断言及主/AY类型通过，两只读范围见[核验记录](../../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-class-values.json)。100文件/12body probe有19类引用合格，所选body合格/材料采用0；SHA `3b3c2692f1fd82a2e53afad9b0f67fdd576e6a2b346673743c0441350cce379a`。实验模型/目标/probe网络新增0，未知成本分列。继续隐式decorator应用、实际返回class与方法变换/constructor/原请求和官方完整复验，AY7及预登记净收益未达。

类定义/隐式应用接续设计（2026-10-08）：两只读定位确认现有class只有行跨度和候选，没有隐式application发生点；模块导入/加载不能假装在每次引用时重跑。先接通原函数内实际执行的无base/metaclass类定义，完整原类body先限pass/docstring和普通有限literal字段。索引保留定义/decorator精确字节、原if/try/前后事件、从上到下表达式求值与从内到外application；每次定义创建新sourceClass，原类暂存到宿主临时名，最终仅绑定实际返回对象。bare普通模块函数或当前factory返回callable沿同一binder/六角色/材料/原生call执行，捕获callee先于类body，装饰器修改/返回替换/异常不被context省略。类body、base/metaclass、方法/descriptor及模块初始化未覆盖时仍具名，不解除现有wrapped receiver边界。先TDD端到端覆盖direct/factory/双装饰器次序、返回替换、条件跳过、抛错、重复factory新类、伪造/移位/丢调用和来源失效；独立只读核验与真实来源probe后继续base/方法/模块应用及原request、官方完整实验。这是同一类变换责任的第一种可执行发生点，不能代替应用模块class或AY7验收。

类定义本步进展（2026-10-08）：v26按原控制/事件顺序连接局部类创建、有限namespace、bare/imported或factory返回装饰器及实际最终返回绑定。sourceClass的definition scope每次创建独立身份；装饰器从上到下求值、反向application沿同一原参数binder/六角色/native helper执行。主补红绿修复dunder/class-cell、无raw call的local shadow、formatted string body call及returned closure内合格类定义；初始unsupported predicate和effect异常预期的fixture更正不冒充产品缺陷。27新增；642focused/3938断言、联合1481pass/1平台skip/9745断言及主/AY类型通过，两只读核验均未发现可复现问题，既有测试中心限制见[核验记录](../../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-class-definitions.json)。100文件/12body probe有7局部类/所选1类、合格及材料采用0，ExtendedSchema保留base-unmodeled；SHA `502f40d9ca337e7d713da0bb44b796dc01bb839bee29ec75a54fa35dddd340bc`。无实验模型/目标/probe网络新增，未知成本分列。继续实际base/继承/方法环境、模块class应用与原request及官方完整实测，不勾选AY7或净收益。

类namespace/继承接续设计（2026-10-08）：实际ExtendedSchema有动态BaseSchema与闭包方法，不能删掉方法body或凭静态MRO执行。先扩同一classDefinition保存普通同步未装饰方法的当前target/SHA与稳定直接外层参数capture，在原namespace阶段创建实际sourceCallable并存入类字段，方法body仍由六角色单独解释。初步排除dunder/descriptor、super/__class__ cell、动态default/annotation、nested scopes及可变/跨层capture。同函数内唯一稳定且先定义的local class identifier可作base；实际创建核验已执行的ordinary namespace类对象，保存实际C3身份顺序，属性读取沿当前对象namespace与继承链，后续父类写入可见、子类覆盖只写子类。普通module引用不能凭旧marker提供完整base namespace；未知/参数base及模块初始化继续具名。

实现顺序：先native匿名红测验证实际namespace、继承/覆盖、两环境、base未创建/普通token/dunder钩子/重复与冲突MRO；再source-read→六角色→material→native连接当前局部class属性中的普通函数，原Python class属性不隐式注入self。调用仍核验实际字段sourceCallable与当前target/SHA/capture；初步无嵌套实参动作，避免晚读callee改变原求值顺序。材料核验完整base/method namespace/创建/字段/最终绑定与原控制严格顺序，缺失或伪造均撤回；更新原relation footprint/version。主TDD、独立只读范围核验和保留真实probe后，继续动态BaseSchema/跨层方法、模块class应用、constructor/原request及官方完整实验，不以本步代替AY7。

类namespace本步进展（2026-10-08）：v27按原字段/方法交错顺序创建实际sourceCallable，捕获稳定直接外层参数，class属性函数调用不注入implicit self；同owner稳定先定义local base实际创建C3身份顺序，当前父类写入/子类覆盖/菱形lookup保留。主红绿补修声明误算rebound、dunder写后过期MRO、mutable default和17 base资格，计数/cross-layer fixture更正分列。39新增，681focused/4187断言、联合1520pass/1平台skip/9994断言/115文件/21.55s及主/AY类型通过，两只读核验无可复现问题、现有测试中心限制见[namespace核验](../../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-class-namespace.json)。100文件/12body新probe有7局部类/所选1类，合格类/base/method事实/namespace call候选及实际采用0，真实ExtendedSchema仍有动态base-unmodeled；SHA `8ce20c2c65dfb35adf2b638c88d7168c1fbef36754d194d9c8a3273d012f2d80`。实验模型/目标/probe网络新增0，未知成本单列，旧输入/报告/答保留。继续动态BaseSchema、跨层方法/closure/super环境、模块class应用、constructor/原request及官方完整使用/预登记净收益，不勾选AY7。

跨层稳定参数接续设计（2026-10-08）：只读定位确认native已从实际sourceCallable保存/转发capture ObjectBinding，当前缺口在source只接受直接owner参数，且返回body的内层普通class/method/function需求未向外层closure传递。沿同一六角色和实际对象机制，capture事实补原binding owner/SHA及逐层relay target/SHA；仅词法祖先稳定parameter可穿过已证明的同步ordinary函数层。nearest local/parameter遮蔽按Python词法解析，任一相关owner重绑定、nonlocal/global/match cell歧义、局部计算值、未知nested body继续具名。内层直接local helper和合格class namespace的free parameter需求从内向外传递，在返回函数原定义点捕获实际祖先对象；调用者同名局部不能重建环境。普通callback来源候选按原binding参数追踪，实际调用仍须对应sourceCallable。

先匿名source-read→interpret→material→native红绿验证返回decorator内class method/直接local helper的祖先参数、两次factory环境和caller重绑定，及function-valued祖先参数；补owner重绑定/nonlocal/shadow/未知嵌套和伪造/丢失relay环境反例。仅允许已有证明可执行的nested function/class责任，不整体解除nested scope。骨架保留原use/binding provenance，材料核验每级实际创建/参数/capture与原顺序，当前relation footprint/version随之更新；native协议和预算保持。独立只读复核、真实probe与主新鲜验证后继续动态BaseSchema、局部callable capture与super/class cell、module应用/constructor/原请求及官方完整使用/收益，不把本步作为AY7完成。

跨层稳定参数本步进展（2026-10-08）：v28保存真实binding owner/SHA和逐层relay target/SHA，已证明普通class/local/deeper helper的祖先参数在实际返回closure定义点保留；function-valued祖先参数仍核验实际sourceCallable。最近参数遮蔽与mutable/unknown cell边界保持，类方法名进入lexicalNames避免同名module/import误接。主20新增；初始caller writer被裁剪的fixture补真实if读取和存在断言，原blanket nested/ancestor负例改为dynamic-default/rebound边界。只读复核指出implicit argument owner仍为relay owner，主证实来源标记不一致并精准红绿修正；当前消费者仅用其truthy隐式标记，未称已复现caller环境重建。新鲜701focused/4315断言、联合1540pass/1平台skip/10122断言/115文件/22.32s及主/AY类型通过，见[跨层核验](../../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-transitive-capture.json)。100文件/12body新probe有61 capture事实/2祖先事实，relay合格及采用0；24返回定义/13合格/所选合格1，真实ExtendedSchema动态base/decorator nested gap保持。SHA `3fe6811437b86a5d144df2a884713bb0cf62aef43650f34dad007c9d5cc68000`，实验模型/目标/probe网络新增0，未知成本与旧输入/答单列。继续局部callable对象capture、动态BaseSchema/super/cell、module应用/constructor/原request与官方完整实测，不勾选AY7。

局部函数对象捕获接续设计（2026-10-08）：先支持普通局部class method直接调用同一class创建owner中唯一、稳定、无条件且先定义的ordinary local helper。helper仍须满足现有valueCallable定义/default/annotation/捕获与nested scope合同；方法capture补当前helper target/SHA及真实binding owner，不把同名module/import或纯token作为函数对象。原helper定义点创建sourceCallable，原类namespace函数再捕获该实际对象，helper自身稳定祖先参数沿v28 relay进入创建环境；调用只给Python显式实参，从真实captured callable读取其环境。定义前引用、替换/条件定义、nonlocal/global/未知cell、递归、普通局部值及其它逃逸继续具名。

机械proof提取按有界固定点协调helper定义与class namespace，未收敛保留具名缺口，不能用暂存候选升级资格；运行不增加模型调用/谓词/结构预算。先TDD匿名两factory不同环境、caller同名重绑定、直接/返回decorator、异常/拒绝先于effect、漏helper创建/伪造capture/晚移/错callee/缺target环境及源码失效。binder和材料逐项核验当前捕获证明、实际原创建与原控制/顺序，函数对象属性写入仍具名。独立只读复核、冻结来源probe和主新鲜验证后继续动态BaseSchema/super/cell、module应用/constructor/原request与官方完整使用/实测收益，不在此工程小步结束AY队列。

局部函数对象捕获本步进展（2026-10-08）：v29在原helper定义创建实际sourceCallable，普通classMethod捕获该对象并按其当前target/SHA与保存环境调用；仅同owner唯一稳定无条件先定义helper，重绑定/nonlocal/global/递归/复杂default/nested argument action等边界保持。主17新增，初始8pass/5fail的预期红测转13pass，另补4边界；nonlocal补例原本通过，不声称产品修复。两只读核验均无可复现发现，来源核验含独立小例，投影核验以现有测试为主，见[局部函数核验](../../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-local-function-capture.json)。新鲜718focused/4419断言、联合1557pass/1平台skip/10226断言/115文件/22.35s及主/AY类型通过。100文件/12body新probe有28局部函数值定义/15合格，函数capture事实、调用候选和实际采用0；is_in_scope具名capture-rebound（上层methods改写），ExtendedSchema仍动态base gap。SHA `1bd90778c0a04ffda2cf8e9914bd17bc5aa78d0c89949ce9bb489bd4c5f0ed3b`，实验模型/目标/probe网络新增0，未知成本与旧input/allowlist/答保持。继续稳定改写后capture、动态base/super/cell、module应用/constructor/原request与官方完整实测/预登记收益，不勾选AY7。

捕获前参数改写接续设计（2026-10-08）：真实methods在返回decorator定义之前完成条件改写，随后无cell重绑定；不能把这种情况与创建后cell变化合并拒绝，也不能把初始factory实参称为改写后的capture值。只对词法parameter且所有同scope写入都是闭包创建边界之前的simple assignment保留稳定快照资格；跨层以binding scope中最早的包含函数创建为边界。每项写入保存当前owner/SHA、精确anchor/source、原控制/顺序及RHS事实；aug/delete/import/for/walrus/unknown scope、创建后写、nonlocal/global/match仍具名，普通计算local值不由此合格。

actual sourceCallable仍在原定义点捕获当前对象。材料必须保留每个capture preparation writer的真实原if/try区域、RHS/结果和严格顺序，缺失/移位/改值均不采用；returned binding只为未改写parameter保留初始实参映射，改写后环境显式指回原owner写入证明而不宣称初始literal为当前capture。复杂计算仍需原源码解释/现有有限执行证明，此来源资格不等于列表计算已执行。先TDD direct/returned/class/helper/条件写/两环境/实际调用结果及漏writer/改RHS/移出分支/早创建/晚cell变更反例，独立只读核验、冻结来源probe与新鲜验证后继续动态BaseSchema/super/cell、module/constructor/request与官方完整使用和收益。

捕获前参数改写本步进展（2026-10-08）：v30记录词法parameter在最外层闭包/class创建之前的simple assignment，原sourceCallable保存当前对象，改写后returned capture用environmentBinding指向owner/SHA/assignmentAnchors而不称初始literal为当前值。原控制/严格顺序、RHS和唯一/额外writer均核验，复杂计算仍需独立执行证明，晚cell变化与unknown scope保持。主17新增；初始9红中1个断言错取direct helper proof的fixture已更正，8个有效预期失败转绿；额外同名writer漏检另以4红复现并修复。两旧rebound负例改成创建后写，保留原mutable-cell边界。新鲜735focused/4553断言、联合1574pass/1平台skip/10360断言/115文件/22.95s及主/AY类型通过，两只读范围无可复现发现但以现有测试/静态抽查为主，见[捕获准备核验](../../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-capture-preparation.json)。100文件/12body新probe有67 capture事实/5准备事实/4合格/7写入，30局部函数值定义/19合格，24返回定义/16合格。真实is_in_scope来源gap消失；其methods列表计算未取得执行证明，ExtendedSchema动态base与实际采用0保持。SHA `cb8663984555d88fefc4656c7ff0e9fd9bee997ddceb3e000c7790182cc03765`，旧输入/allowlist/答/报告不升级，实验模型/目标/probe网络新增0，未知成本分列。继续动态base/super/cell、module/constructor/request和官方完整使用/实测收益，不勾选AY7。

动态标识符基类接续设计（2026-10-08）：只读定位确认native已有actual namespace base对象解引用、C3身份顺序和class对象实参/返回保留，缺口在来源仅同owner直接class声明。沿现有sourceClass/binder/六角色接通词法owner parameter或其simple local identifier绑定作为base；不从名字或module marker伪造namespace。local绑定的所有plain assignment须早于原class创建，保留owner/SHA、source/anchor、原control/order/RHS证明；参数即使无写入也不得被材料添加source-absent writer。global/nonlocal/match、晚写/aug/delete/for/walrus/annotation/chained、attribute/call base表达式、未知namespace继续具名。静态local base事实兼容；dynamic binding不提供静态父方法/MRO资格，自己namespace中的精确ordinary方法可作为当前候选，实际仍须读当前函数对象。

先TDD匿名实际参数/local alias/conditional/direct-call准备、两次factory不同actual base对象、继承字段/自己方法、class return身份与拒绝先于effect，及漏/改/移位/额外base writer、伪造bases、late/unknown scope和相同actual base重复反例。材料逐项核验全部准备证明，native仍拒绝非namespace marker、冲突/重复/协议变更base，不新增模型角色/谓词/预算。真实ExtendedSchema来源即使越过base资格，super/class cell、复杂RHS执行、module/constructor/request仍须分别接续；本步只作为AY7组件推进，独立只读核验/新鲜验证/冻结probe后继续官方完整使用与预登记收益，不以候选合格替代实际采用。

动态标识符基类本步进展（2026-10-08）：v31复用已有actual namespace/C3及类对象参数/return身份，只放宽owner parameter或全部plain assignment早于创建的local identifier来源；每项binding/写入保留owner/SHA/source/anchor/control/order/RHS。零写参数仍拒绝source-absent writer，dynamic parent不给静态继承target，自己namespace当前方法须actual callableRead。主24新增，初始11pass/10fail转绿；conditional wrong-write原与source相同的fixture已更正，不称产品修复。新鲜759focused/4685断言、联合1598pass/1平台skip/10492断言/115文件/18.09s与主/AY类型通过；两只读范围以现有测试/静态读取为主，无独立新fixture，见[动态基类核验](../../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-dynamic-bases.json)。100文件/12body probe保留真实BaseSchema的1动态基类/2原写入事实，ExtendedSchema由base gap推进到method-cell-unmodeled；复杂RHS执行未证、合格类/实际采用0保持。SHA `0a103efe53ee3467877dc340bd07560e3d0b1b7cd010676496c00ae7dda4d26b`，旧input/allowlist/报告/答不升级，实验模型/目标/probe网络新增0、未知成本分列。继续普通实例/super/class cell、module/constructor/request和官方完整使用/收益，不勾选AY7。

普通局部类实例接续设计（2026-10-08）：只读定位确认local class()未形成实例创建证明，普通方法value虽有namespace对象，却未从实际实例lookup/bind。沿同一有限sourceClass/sourceCallable/object核心，先支持同owner唯一稳定、已完整证明ordinary local class的无参默认构造；原call点创建独立sourceInstance，保留当前actual class对象/MRO，字段先查instance再查actual namespace。无自定义__new__/__init__/descriptor/metaclass协议的现有资格保持，类装饰器替换成另一identity不得借旧class proof执行。

source constructor保留当前class/SHA、原call/result/control/order，native从真实namespace对象创建；实例的alias/参数/返回/字段存储不得退化为selector token。已证明的普通instance method从实际namespace函数读取target/SHA/captures，并按Python显式注入实际self；class access仍无隐式self。材料核验精确原创建、结果/原区域/严格顺序、唯一writer、当前方法callee和完整参数，context不能删除constructor。自己方法或已证明静态local继承可候选，未知dynamic父方法、构造实参/自定义协议、实例重绑定/复杂callee与nested argument动作继续具名。先匿名source-read→interpret→material→native红绿验证两实例独立字段、继承/closure环境、self/return与field身份、instance覆盖、拒绝先于effect和缺/改/早移/额外创建、伪造receiver/callee/SHA等反例；独立只读核验/真实probe/新鲜回归后继续super/class cell、module应用及原请求与官方完整实测，不结束AY7。

构造资格细化：必须有完整已知ordinary static local namespaceMro；未知dynamic父类即使class定义本身合格，也不能据此断言默认__init__/__new__，构造继续具名。native还要求callableRead.object为实际receiver的单一字段，并核验首参数映射到该actual instance，防止跳过instance slot或替换self。

普通局部实例本步进展（2026-10-08）：v32原构造点创建sourceInstance，保留实际namespace class/MRO及独立字段；alias/实参/return/field不退化为selector，instance优先查询当前class namespace。实际普通方法函数保存原capture，显式self必须同一实例。构造source/result/control/order及唯一writer逐项核验，context不能抹去构造。两只读核验分别发现实例slot被class-read绕过、未知dynamic base误获默认构造资格，主Bun红绿复现并收紧actual receiver/read/self及完整已知静态namespaceMro；源核验的独立Vitest脚本未执行到断言，不能称独立执行通过。主37新增，796focused/4872断言、联合1635pass/1平台skip/10679断言/115文件/24.22s与主/AY类型通过，见[普通实例核验](../../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-ordinary-instances.json)。100文件/12body probe新增7构造缺口事实，合格构造/方法及实际采用0，ExtendedSchema仍method-cell-unmodeled；SHA `23e7178bd53fcf4a4cf0fbe851b4ae2ef1bc59d8b27e7d650bdb1d2dee5a7f14`。原input/allowlist/答/报告保持，实验模型/目标/probe网络新增0，未知成本分列。继续super/class cell、module应用/完整请求、官方完整使用和预登记净收益，不勾选AY7。

实际class cell接续设计（2026-10-08）：两只读定位确认现有sourceCallable captures可以保存actual namespace class对象，当前method identifier扫描却把free __class__和所有super一并拒绝。先复用该对象环境，只给已证明ordinary local namespace method增加精确classCell source use，创建函数时把原class-original对象保存为隐式__class__，不读取装饰后public binding或caller同名变量。骨架以同一六角色暴露机械cell parameter，native仍执行原saved captures；target参数/材料函数创建精确核验该cell，缺/改/caller替代/移动原class创建均撤回。

本步只接通cell创建与显式__class__读取；unshadowed direct zero-argument super().method可保留cell来源，但内/外super调用均带source-class-super-unmodeled且context不能删除该缺口，随后接实际C3后继lookup。非直接/带参数super、builtin遮蔽、__class__局部/参数/全局/非局部改写、nested scope和原dunder/descriptor/wrapper边界继续具名。默认构造仍要求v32完整已知ordinary static namespaceMro。先匿名两次factory创建不同class、显式cell返回/字段/当前namespace读取及装饰器public替换保持original cell的红绿反例，再exact材料错/漏/移/cell参数篡改、shadow/二参super和context缺口。独立只读核验/新鲜QA/冻结probe后继续actual super/C3、module/constructor/request和官方完整使用/收益，不结束AY7。语言锚点：[Python class creation](https://docs.python.org/3/reference/datamodel.html#creating-the-class-object)、[super](https://docs.python.org/3/library/functions.html#super)；无新模型角色/谓词/预算。

实际class cell本步进展（2026-10-08）：v33以classMethod.classCell保留真实use，并在函数创建点通过原sourceCallable环境保存class-original为隐式__class__；装饰器public替换不影响原cell，参数固定value。材料精确核验捕获对象、原control/order及目标完整参数，错/漏/移/caller替代均撤回。super仍具名未执行，随后接实际C3；另修正v32 unsupported constructor-as-context遗漏unresolved，local class协议缺口在context/effect前保留，不以complete=false代替。18新增；814focused/4985断言、联合1653pass/1平台skip/10792断言/115文件/25.57s与主/AY类型通过，两只读既有套件核验无新反例，见[实际class cell核验](../../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-class-cells.json)。100文件/12body probe恢复1类/16method/16cell来源资格，36super缺口及实际采用0保留，SHA `f53ce003de789136d894a0b3c234548e7e28d8c0d674db5d567eff72cccf76ea`。原证据不改、实验模型/目标/probe网络新增0，未知成本分列；继续actual super/C3、module/constructor/request和官方完整使用/收益，不勾选AY7。

实际super/C3接续设计（2026-10-08）：v33已保存原__class__ cell，v34在普通local namespace method的direct unshadowed zero-argument super().method原callee点读取实际receiver.sourceInstance.classObject.mro，从捕获cell的实际identity之后查当前namespace第一个同名字段；instance slot不参与该查找。复用实际sourceCallable及captures，保存绑定receiver identity，随后求值实参、核验同一self并调用。native新增机械superRead仅用于这种实际读取，不新增模型角色/谓词/预算。class cell ID/SHA和actual MRO成员身份、namespace普通函数/当前target与函数属性仍必需。

源码生成StructureSuperMethod proof，保留原callee/inner-call anchor、control/order和argument events；在同一lexical owner的完整已知ordinary local C3中收集有限后继候选（≤16），实际读出的function token沿已有有限call分支选择，不借静态定义类MRO冒充实际子类顺序。inner super内建创建与立即属性读取由同一机械读表示，采用inner call的事件名，保留其它sourceStoreOrder合同；所有实参动作在读之后。源码binder核验当前proof/候选/形参和renamed首参，骨架/六角色/材料投影沿同一核心执行。材料必须精确保留read对象/结果/control/order、读→实参→dispatch以及候选完整分支；context不能删除机械read或未证明super协议。未知dynamic父类、非实例first argument、receiver重绑定、未证明嵌套callee/control、带参数/遮蔽super及原dunder/descriptor/wrapper边界保留。

先native匿名actual C3（含diamond）、原cell/函数capture、instance slot bypass、namespace覆盖前后/同self和错误cell/receiver/target的RED；再源码多个候选/renamed/self/实参动作顺序、完整source-read/interpret/material/native及错漏移材料RED→GREEN。独立只读核验、新鲜QA及冻结probe后继续module/constructor/request和官方完整使用/净收益，AY7未完成。

实际super/C3本步进展（2026-10-08）：v34按原cell的实际identity在receiver instance C3后继namespace读取普通函数，保留原环境和receiver/self；骨架/read→实参→实际function分派/材料沿同一核心执行。材料完整核验全部候选条件与每个分支实参，修正新增反例暴露的未选择分支错误self遗漏；unknown dynamic base等边界不猜测。30新增；844focused/5211断言、联合1683pass/1平台skip/11018断言/115文件/25.42s和主/AY类型通过，两只读既有套件核验无独立新fixture，见[实际super核验](../../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-super-methods.json)。100文件/12body probe仍36super/7constructor缺口、super候选0/实际材料0，SHA `76422bda9ba9b6c20c47877876a6ca626c512ccfacee2103dc8d8408549deb1a`。原证据不改、实验模型/目标/probe网络新增0，其它成本unknown；接续module初始化/实际constructor/request与官方完整使用/预登记收益，AY7未完成。

实际module/class接续定位与来源计划（2026-10-08）：v34已发布，但当前源码骨架仅解释函数体，模块class definition没有实际创建单元；scope=module仅为稳定引用身份，不证明初始化。两项只读定位确认ExtendedSchema的外部BaseSchema尚缺DefaultSchema/AutoSchema实现和应用DEFAULT_SCHEMA_CLASS配置。先按原appRef/uv.lock及既有wheel SHA独立追加这几个确切来源，登记source-provenance/schema-runtime-source-v1.json及新文件，旧94冻结文件、补充原件、输入/allowlist/答案/评估器/分母不改；不执行Python target或凭库名免除协议。主线程亲读相关class/constructor/descriptor与模块配置，再在现有structure-index/source-skeleton/operation-work/interpret/material/native责任内确定最小实际初始化设计和红测。源码捕获仅来源证据，不能冒充模型已读、实际采用或完整请求；后续官方完整使用/收益仍必须完成。

schema runtime来源本步进展（2026-10-08）：5文件按既有wheel SHA/原appRef的Git blob/size追加，清单SHA `a8967b374ceadb7e99b0e40902ecd20b24244fa79bcff2505878b22de8eb0caa`；105文件probeSHA `e586bcfce39a8c34ea6b02f24ded2fa4b196138b5dd8b53eecd2b5e8b425d6ac`确认ViewInspector/DefaultSchema/AutoSchema静态MRO和继承__init__/__get__/__set__。原94冻结/6补充及旧输入/allowlist/答案不改。实际缺口明确包含模块definition、APISettings字符串import、descriptor getter/setter和constructor，不能按ordinary方法/field store消除。关系仍v34，36super/7constructor gap、实际材料0；代码未变，不重复上一轮844/1683回归。接续现有核心内的实际初始化/协议设计和红测，再完整请求与官方使用/收益；AY未完成。


模块初始化最小设计（2026-10-08，v35）：在现有structure-index中为Python文件增加kind=module的显式全文件源码单元；原function/class qualifiedName和旧module引用规则保持原义，module owner在原moduleAssignments收集后加入。source_read完整覆盖仍是独立前提，骨架context=module-initialization只解释模块顶层语句，不执行函数body。根class保存独立moduleClassDefinition，复用原class创建、namespace/C3、decorator application、最终绑定与当前材料核验；不把根method改标local classMethod而改变既有receiver语义。根普通function保存moduleInitialization.functions创建事实，复用无capture sourceCallable.scope=module，并在同module直接调用时读取当前实际函数对象。可接受的函数声明无wrapper/async/generator/annotation/动态或mutable default；未建模声明操作、imports和其它协议保留具名gap，不能由context擦除。

v35运行边界：支持同module已创建class作为实际参数/返回值、已创建base的普通C3继承、原field store/有限分支、无协议零参constructor和普通函数。模块内class实参不再生成空静态class引用覆盖实际namespace；当前class和function creation须保留原控制及声明/调用顺序。直接模块function调用首步只支持无嵌套实参动作，防止把callee读取移到实参副作用之后；source-visible rebinding/函数属性修改由当前绑定/native资格核验。仍不提供import/cache/export环境、跨module全局晚绑定、模块method实例协议或descriptor/constructor执行；本步只能证明被显式解释并执行的初始化单元，不称原应用模块已加载或request已完整。

v35验证与接续：先写源码索引/骨架和source_read→interpret→material→native红测，覆盖未读模块、class字段/继承/实例、装饰器返回替换、实际函数读取、缺失/错SHA/移位创建、缺失实际callee、source变更及import/annotation/default/重绑定/协议反例；GREEN后跑相关集中/联合/主和AY类型检查，独立只读核验并保留105文件新probe。同步五份当前文档和阶段日志、提交仅推origin。模块前驱完成后继续原DefaultSchema/APISettings/constructor/descriptor/request和官方完整使用、AY22及预登记净收益，AY7与本轮目标仍不完成。

模块初始化本步进展（2026-10-08）：v35已沿同一核心执行显式module class/function创建、原控制顺序、实际namespace/C3、装饰器返回替换、普通默认instance及参数传递；moduleCallable核验实际函数读取与当前target/SHA。30新增，初次RED24失败，补充RED发现声明前decorator/目标SHA两个漏洞后GREEN30/234断言；874focused/5445断言、联合1713pass/1平台skip/11252断言/115文件/50.42s和主/AY类型通过。索引只读review含独立fixture，材料静态疑点经主定向核验未复现stale采用，见[模块初始化核验](../../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-module-initialization.json)。105文件probeSHA `64ef2ec088c12799cdd964963456a6e3e7718ef5d9ffbe5d6ab6690b1046e76a`有99非空module，所选三schema类仍body/base gap、实际材料0；全索引36super/12constructor，12选定body0super/1constructor，新增root范围不作旧数量效果比较。导入/全局晚绑定、模块方法、真实constructor/descriptor/request及官方完整使用/收益仍必须接续，原输入/allowlist/答/旧报告不改，实验模型/目标/probe网络新增0，其它成本unknown，AY7不完成。

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
