# AX0–AX20：按授权问题求值与账号真实执行

> **For the executing agent:** use executing-plans、systematic-debugging、test-driven-development 和 verification-before-completion。逐项连续执行；本任务书已获用户授权，普通检查点不等待确认。用户要求留在 `skill-ir-aot`，不创建分支或 worktree。

**Goal:** 用已授权的 ChatGPT 账号接通真实实验，修复“整函数逐项标注”和“异常路径逐项展开”的共享负担，使完整原 skill 的授权任务产生有源码依据、经过当前领域检查的自然回答，并验证一次真实变化后的材料复用。完整质量、比较收益和有限队列完成分别验收。

**Architecture:** 复用 AW 的官方账号 adapter、source skeleton、source materials、inquiry/native 共享核心和 SkVM CLI。在这些模块内增加按问题的依赖需求、局部摘要和保守状态合并；新语义显式选择 `operation-evidence-v4`，不复制一套运行时，不建设新 CLI、展示层或通用 IR。

**Tech Stack:** TypeScript、Bun、既有 Python/Go 静态源码结构工具、官方 Codex CLI/App Server、现有领域检查器和实验归档。

日期：2026-10-07。状态：`in-progress-account-channel-blocked`，独立离线工作已形成可交付检查点。开发模型：`gpt-6.1-sol / max`。被测模型：当前账号的 `gpt-5.6-sol / high`，沿用已实现的 effort 合同，不以开发模型代替被测模型。

## 一、接管与授权

- 仓库：`D:/skill优化/SkVM`；只向用户 `origin/skill-ir-aot` 发布。复核基线 `ccf00985e41afb33d0aa867bf9b1bedae5b68790`；本任务书的发布提交是追加的计划基线，启动时读取实际 HEAD。
- 新身份：`authorization-property-execution-v1`；结果放在 `results/skill-ir/skill-dsl-research/development/authorization-property-execution-v1/`。临时会话集中在 `D:/skill优化/project-maintenance/runs/authorization-property-execution-v1/`。
- 用户已经明确允许消耗当前 ChatGPT 账号额度做实验。本轮无需重复询问。仅通过官方 CLI 自有登录调用；第三方付费 API 和 AV 十二旧位置继续暂停，不查看或搬运登录 token，不切换身份或购买额度。
- 开发线程接管后为代码、方法文档和 Git 的唯一写者。只读子代理按当前 AGENTS 规则探索或独立核验，不修改代码、替主代理设计或另起生产分支。
- 本轮是已暴露 development 任务上的方法修订；不启动 prospective，不读取 held-out/Q1，不改变 readiness、旧 `0/6`、旧未知请求或封存。
- 安排约 8–12 小时的有效工作量，实际以问题解决和验收为准。提前完成就交付，不靠等待、重复审计、重复实验凑时长。账号不可用时继续独立工程，不把“全部未派发”包装成真实目标达成。

### 启动必读

1. 根及仓库 AGENTS、[当前状态](../../skill-ir/current-status.md)、本任务书。
2. [研究正文](../../skill-ir/skill-dsl-research.md) §1、§7.56–§7.58；[spec §14.37](../../skill-ir/skill-ir-aot-optimization-spec.md#1437-ax-property-directed-analysis-and-controlled-account-execution)。奠基性材料由主代理亲自读取。
3. [AW summary](../../../results/skill-ir/skill-dsl-research/development/authorization-control-materials-v1/summary.json)、[manifest](../../../results/skill-ir/skill-dsl-research/development/authorization-control-materials-v1/manifest.json)及具体相关评阅。AW 任务书仅作历史实现定位，不继承其“排他工具证明缺失即全部停住”的研究选择。
4. [使用说明](../../usage.md)、[开发指南](../../skill-ir/developer-guide.md)中 account、inquiry/native 和材料恢复段。跨线程信息见 `D:/skill优化/project_handoff.md`。

## 二、已核实的问题与设计决定

### 2.1 账号阻塞来自本项目固定分支

`src/adapters/codex-account-session.ts` 中真实 stdio transport 固定返回 `unverified-public-cli`，session 仅放行 `test-transport`。现有原件证明 initialize 成功，未尝试真实 thread/turn。新任务要核实实际配置并改变这个生产能力判断，不能只增加 mock，也不能把 test 标志直接设真。

采用**受控能力合同**：可读来源与模型材料有明确范围，evaluator/旧答案/开发日志不进入模型，目标程序不执行，额外工具通过受支持配置关闭或纳入相同的有界 harness。无需追求协议未提供的“数学式工具排他证明”。只读模式本身不保证限制读取范围；提示词要求也不充当执行边界。

### 2.2 新语法覆盖把负担转给了模型与求值器

`source-interpretation.ts` 对 generated flow 中每个 call 要求 role 或 unresolved；context/effect 又一律 `mayRaise:true`。`semantic-flow.ts` 逐个产生异常终态，上限 16；超限撤回整题规则。零模型复现中，15 个普通 context 调用和正常 return 得到 16 条路径，16 个调用就触发整题 `semantic-path-limit`。

因此 v4 围绕当前授权问题维护需求和依赖闭包，只要求与主体、资源、guard、受保护 effect、返回及控制相关的语义解释；对可证明等价的失败状态合并。完整源码和全部原问题保留。未知调用若可能改对象、控制、状态或产生目标效果，继续保留相关缺口，不能靠名称、模型一句“不相关”或关闭异常标志排除。

### 2.3 研究借鉴落实到模块

- [RepoAudit §3.2–3.3](https://arxiv.org/html/2501.18160v3)：按目标值和局部函数探索、缓存有依赖的路径事实、校验控制顺序。这里借鉴需求驱动和摘要组织；其内存错误结果不作为授权有效性的证据。
- [CodeQL Python data flow](https://codeql.github.com/docs/codeql-language-guides/analyzing-data-flow-in-python/)：显式 source/sink/barrier 与传播关系。SkVM 的对应物是主体/资源、控制/guard、实际 effect 和独立 policy，保留别名与调用参数身份。
- [官方 App Server](https://learn.chatgpt.com/docs/app-server)、[配置](https://learn.chatgpt.com/docs/config-file/config-reference)、[认证](https://learn.chatgpt.com/docs/auth)：核实安装版本能兑现的配置与生命周期，复用 CLI 自管账号。网上最新版不能代替本机 schema。

只针对实际接口缺口补读这些一手来源，不再扩成一轮泛泛语料调研。问题、修改和真实效果继续写入唯一研究正文。

## 三、工程合同和验收口径

### 3.1 v4 的最小数据职责

下列为实现与验收职责，沿用已有类型；工程实现和真实完整任务验收分别记录，禁止靠新增大框架完成表面接线。

| 数据/模块职责 | 必须保存 | 不能偷偷省略的情况 |
|---|---|---|
| 按问题的需求记录 | question、入口、当前主体/资源、所问效果、控制/数据依赖、来源锚点、待解释原因 | 尚不明确的 effect/别名不能预填正确答案 |
| 相关性与覆盖 | 已纳入、机械排除及依据、模型提出但未核实、未决影响 | unknown 写作用途、未知 receiver/动态调用须保留影响 |
| 局部摘要 | 正常/异常结果、参数到对象关系、可能 effect、相关 guard、依赖与语义版本 | 异常前已发生效果、finally 覆盖出口、typed handler 顺序 |
| 合并状态 | 当前控制位置、出口/异常类别、对象关系、条件与 effects 的保守集合 | 不同资源/主体、不同授权结果或不可兼容 effects 不能强行合并 |
| 材料与恢复 | 现有来源身份、依赖、unreviewed 等级、当前实际使用关系 | 旧 final/check/policy 不进入源码材料；失效有原因 |

问题的充分性以授权性质的相关路径覆盖判断，而不是必须逐句证明整函数执行成功。访问被允许、源码效果可到达、效果已发生、部署/API 运行成功继续分开。若剩余未知确实影响所问判断，保留具体 partial；“保守”也不能把所有未知一律扩成整题无法回答。

### 3.2 四项交付要求

1. **账号可运行：** 当前账号至少一次真实匿名工具会话完成：模型请求工具、宿主执行、模型消费结果并交付；记录实际模型、配置、事件和用量可见性。
2. **真实完整链：** 两个原任务都实际尝试，至少一个完整原 skill 在普通入口交付有源码依据的原任务答案，领域检查当前有效；另一项复杂结构的实际未达原因和修订效果具体列出。两项均完整才报告双结构闭环。
3. **修改与复用：** 同一任务的 policy/premise/source 三变化有 fresh 与材料复用的实际记录，质量与恢复数量分别判断；旧原任务未完整时仍可做材料级诊断，但不得声称完整任务复用收益。
4. **方法比较：** 同账号模型、完整 skill、源码和共同事实比较 N/M-S/D-S；原始首答与针对性修订分开。没有质量增益就保留相应结论，不因有脚本、token 下降或形式通过而提升总体结论。

约60/40继续指质量与作者/复用的开发精力，绝非允许四成错误的标准。没有人类实际计时就保留真人耗时 unknown，不把模型作者时长当人力节省。

## 四、逐阶段执行清单

2026-10-07检查点：20个首位置中9个已尝试，保留17份首件/具名修订，活动尝试0。最新公开baseline `explicit-source-revisit`在当前生产树返回`usageLimitExceeded`，原`completion-unknown`/无终答保留；普通应用元数据仍允许使用，只能确认指定实验CLI/model通道拒绝，不能推断整个账号耗尽。11个未派发位置与当前版本baseline/成对修订继续待执行，不生成零调用封存来关闭队列。恢复先inspect并裁定原未知请求，再核实该指定通道；不自动重发、换模型/端点、购买或使用reset credits。六项结果见[AX summary](../../../results/skill-ir/skill-dsl-research/development/authorization-property-execution-v1/summary.json)。

### AX0 接管与最小运行账本

- [x] 读取启动材料，检查分支、工作区和用户 origin；保留其他修改。点验 AW 两个关键代码分支和已有复现，避免重做整轮历史审计。
- [x] 建立本身份的 `status.json`、`manifest.json` 和原件目录；记录每个逻辑位置、共享原件关系、当前实现版本、首件/修订、dispatch/response/unknown、完成与评价状态。
- [x] 薄 study 只负责派发和整理生产输出；拥有自己的严格 TypeScript 配置，不能调用一套研究专用语义实现。

### AX1 核实账号有效配置

Files: `src/adapters/codex-account-session.ts`、`codex-account-session.test.ts`、现有 inquiry/native account 接口。

- [x] 核实本机版本、model/list 与官方 schema；只读元数据不算推理成功。检查 thread config、permissions、runtimeWorkspaceRoots、instructionSources、activePermissionProfile 的实际含义。
- [x] 关闭或约束原生 shell/执行、网络、apps/MCP、多代理、项目/全局指令与额外 skills 的自动加载；按安装版本支持程度记录有效配置，不罗列未生效开关。使用专属干净会话目录，不以研究仓库为 model cwd。
- [x] 模型可见材料仅由当前原 skill、任务声明和宿主只读源码工具提供；evaluator、历史答案、标注补丁在会话可见范围之外。若保留任一原生工具，证明它受同等范围和计量控制，且所有比较臂一致。
- [x] 把能力判断绑定实际配置/协议版本；不绕过平台权限、不搬凭据、不把 read-only 提示当隔离。若安装版本有硬缺口，给出具体字段/行为和可行的官方受限替代；本阶段不反复耗时追求不存在的 inventory RPC。

AX1实际约束：0.159.0-alpha.12.1保留官方受限Code Mode宿主，禁进程内fallback及其它执行入口。当前全局通用用户AGENTS不受doc_max=0影响，主开发者完整审阅后固定path/SHA；此一致控制材料不含任务答案/开发日志。依据及限制见研究§7.58，实际元数据和配置在AX原件目录。

### AX2 接通生产账号会话与一次真实 smoke

- [x] 先红绿覆盖配置未生效、额外 instruction source、越界读取、原生执行请求、重复工具回调、超时晚答、空 final、累计 usage 重复计数。
- [x] 修改实际生产 transport，而非只让注入 mock 通过。宿主负责已有动态工具执行和预算；CLI 继续拥有账号与 agent loop。
- [x] 运行一个匿名 lookup smoke：答案只存在宿主本次随机生成的测试表，模型必须真实调用工具获取。保留回调和最终消费；不得把答案同时写在 prompt 中。超时上限5分钟，首次失败保留，具名修复后最多一次 smoke 复验。
- [x] 若账号权限/额度不可用，暂停真实派发并继续独立离线工作。固定上下文账号试答可用于定位接入问题，但不能替代动态工具或原 skill 链验收；不自动切第三方 API。

### AX3 写出会失败的语义反例

Files: `src/task-dsl/authorization/semantic-flow.test.ts`、`source-interpretation.test.ts`、`source-materials.test.ts`。

- [x] 16和64个不改变授权对象的 context 潜在失败，与一个正常授权出口：等价失败状态可合并，正常出口保留，真实失败仍未知，不能整题只剩路径上限。
- [x] 相反例：调用修改资源、返回新主体、unknown setter、guard 后资源替换；这些不能被“无关”裁掉。
- [x] 同一异常前/后可能发生 effect、typed handler 顺序、finally 新返回/抛错、短路 RHS、失败后清理：合并仍保存真实顺序与影响。
- [x] 无关缺项不挡住独立问题；决定性缺项只阻塞依赖问题。policy-only 修改不改变源码行为。
- [x] 实际记录红测原因；不能写只描述旧行为的测试再宣布缺陷修复。

### AX4 按问题建立依赖需求

Files: `src/benchmarks/authorization-dsl/inquiry-worklist.ts`、`inquiry-focus.ts`、现有 source skeleton/bindings 与 operation facts。

- [x] 需求从真实任务问题、当前入口和源码控制/数据关系生成，输出下一项缺失依赖及其影响的原问题。
- [x] 保留主体、资源、guard、effect、返回、调用参数及异常控制的必要链；只有源码关系明确支持时才缩减无关标注。
- [x] 同名函数、继承、模块实例、结果对象和别名沿现有精确身份连接；未知潜在副作用保持待解释，不按日志/检查等名称推断安全。
- [x] 原题分母保持不变，来源窗口可请求扩展；不能先读 oracle 再挑足以回答的几行作为新公平输入。

### AX5 增量解释与按问题覆盖

Files: `src/task-dsl/authorization/source-interpretation.ts` 及其测试、`inquiry-domain-runtime.ts`。

- [x] v4 的 required annotation 来自当前需求和影响链；整函数 skeleton 留在宿主，机械排除和未决部分可检查。
- [x] 未进入本问题的语句仍保存来源位置/理由；模型提议的不相关关系保持 unreviewed，不能冒充确定性证明。
- [x] 一个字段错误仅要求当前字段/对象修复；已有正确解释继续保存。加入把已读具体 helper 接入当前题的真实形状回归。
- [x] 覆盖报告区分源码结构已读、领域含义已解释、当前性质已覆盖和整体答案充分。不得直接把 `modelCovered` 改 true 以通过终检。

AX4–AX9当前实现细节：v4需求先沿当前入口的完整控制/数据骨架保留所有可能执行的call、predicate、return、raise和显式对象引用；只机械排除来源不变的不可达关系（无条件退出后的后缀、布尔字面量分支、字面量短路与空循环）。未知setter、返回/参数映射和异常控制不凭名称裁减。每次展示最多8个缺失锚点字段，完整骨架及正确草稿留在宿主；局部修复继续同一transaction。字段/需求覆盖不替代完整答案或独立语义核验；源码变化使排除依据随SHA失效。v4使用独立语义版本，仍走共同inquiry/native核心。

### AX6 异常状态合并与局部求值

Files: `src/task-dsl/authorization/semantic-flow.ts`、`control-conclusion.ts` 及相应测试。

- [x] 以控制位置、出口/异常、相关对象、条件和 effect 状态作保守合流；不再为同性质同后果的每个普通失败起源复制整条路径。
- [x] 不兼容状态保留分开或带明确集合，未知不会升级成允许/完成。无法证明兼容时保持可定位的缺口。
- [x] 仍沿用有界资源策略；上限作用于真正增长的不同语义状态，不通过简单提高16/127上限解决爆炸。局部超限保留其他独立已证事实，整体完整性继续诚实判断。
- [x] 正常路径、异常前后的效果和 finally/catch 次序同时通过 AX3 正反测试。

### AX7 参数化摘要与变化失效

Files: `source-materials.ts`、`src/benchmarks/authorization-dsl/operation-runtime.ts`、`operation-reuse.ts` 及相应测试。

- [x] helper 摘要保存问题无关的来源含义及参数投影；当前问题只保存使用/需求关系，不把具体答案编入 helper。
- [x] 同一 helper 在两个资源或用户下实例化，检查绑定不串题；源码变动使依赖失效，policy/premise 变化重算当前判断。
- [ ] available/restored/linked/used 和真正减少的重新解释分别计数；依赖足迹缺失或失效时走 fresh，不强行重激活旧材料。

### AX8 调度与真实上下文减负

Files: `inquiry-worklist.ts`、`inquiry-focus.ts`、`inquiry-domain-runtime.ts` 及共同 render 路径。

- [x] 调度优先处理阻塞多个原问题的决定性缺口，区分未读、已读待解释、未连接、未检查；提交过的同类空解释不再触发整题重抽。
- [x] 只展示当前有用的局部原文与增量状态，共同来源/身份保留索引；模型能通过工具取回全文，不删决定性信息制造低 token。
- [ ] 记录实际 payload 字节、required annotation 数、活跃状态数、工具往返；相同历史响应重放只作机械指标，真实模型收益另测。

### AX9 接入现有两个入口

Files: `src/cli/run.ts`、现有 authorization inquiry CLI、`src/adapters/codex-account.ts`、共同 strategy/entrypoint 类型与测试。

- [x] `operation-evidence-v4` 只启用新的性质分析行为；旧默认、旧v3及原归档读取保持。同一核心服务 inquiry 和完整原 skill native。
- [ ] 终答包含原题逐项结论、必要条件、源码依据、具体未决和有效当前检查关联；自然文与结构结果指向同一当前状态。
- [x] 工具 schema、运行参数和修复反馈在账号入口实际传输；用两个入口的合同测试避免研究包装器独有能力。
- [x] 更新普通示例实际命令，不编写未验证接口的“已可用”说明。

### AX10 Download 真实纵向调试

当前真实修订暴露的接口细节：`agents-disabled`修订已读取28次动态工具、总宿主预算使用50次，却在一个已注册工具的格式错误处被传输层直接终止。后续共享修复将未知工具/原生能力继续视为边界失败，已注册工具的错误参数只返回字段诊断并占用同一64次预算，保持原事务。账号CLI保存历史，故v4上下文对已实际发送且完全相同的JSON子值使用带序号/路径/SHA的引用；新源码或改变字段重新发送，完整宿主状态与原始窗口仍保留。该变化先验证可重建性和字段修复，不提前宣称真实质量或token收益。

`field-context`实际采用锚点解释后定位到生成try/raise被旧焦点schema拒绝；共享焦点同步有限控制，保留原源码异常和宿主callee身份。后续source-controls同原题具名复验，受影响位置在共享修复后继续。AX原件关闭Git文本换行转换，压缩报告重建采用精确原字节，保护归档身份。

`source-controls`完成自然答且接受2单元/15步；两次check失败，账号仍停在interpret导致结果stale。共享accountContext现按宿主预算和已启动check进入已有answer阶段，保留全部问题/缺口，停止自动读；两项红绿反例和48项联合回归通过。下一具名修订为answer-phase；形式及独立语义结果分别验收。field-context独立AI评阅判具体owner/object-grant分支和路由范围为部分，不能用核心下载结论正确替代整题通过。作者/消费者将通过生产会话、公开check/init/edit及来源副本完成，研究driver只做编排、原字节保存和登记，不增加语义算法。

- [x] 使用下面指定的完整 Download 原任务和完整 Cloudflare 原 skill，读取原始源码，不导入 AW test-authored wrapper、旧正确图或最终答案。
- [x] 跑一次普通 native；评阅全部原问题及原 skill 要求。对工具、schema、来源连接、异常合流或语义缺口逐项定位，当场修复共享实现并对同例具名复验。
- [x] 另跑一次同原任务的公开 inquiry 入口，确认相同共享核心和当前检查可实际使用；两次各自计量，不能把测试入口证明转写为 native 成功。

### AX11 OWUI 真实复杂结构调试

当前原native已运行并独立复核：27次回调/46宿主动作、4单元58步，账号完成但形式结果仍有Files接收者未绑定与未解释callee。自然对象关系正确，已有集合/重复hash和身份来源覆盖仍部分。公开Download原件也已运行和评阅，核心权限/版本/表示正确、路由与运行事实部分；该基线仅供材料级三变化比较，生产src tree须一致，不提升质量验收。

- [x] 使用指定 OWUI 原任务和完整 GitHub security-review skill；这是本轮明确登记的 skill/task 组合，保留其任务要求和其他职责。
- [ ] 观察原55语义缺项中哪些因按问题需求消失、哪些仍需解释；需要的缺项由当前模型完成，不能由开发者手填正确答案作为正常模型输入。
- [x] 记录未知动态调用、with 退出和关键 helper 的实际影响；只影响部署/运行成功时不抹掉已足够的源码授权回答，可能改变被问行为时继续保留未决。
- [x] 一项出问题当场修复；复杂任务没闭合也允许继续独立作者、材料恢复和另一完整任务的对照，避免整队列再次全被一个位置封住。

### AX12 三种变化的 fresh 与材料复用

policy fresh/previous与premise fresh首件已关闭并保留。同版本policy previous的两个入口材料均current:false，accepted入口仍在而materialUses为空；主线程定位createSourceMaterials.accept在A→B→A重新接纳旧ID时返回退休条目但不reactivate。两个匿名红测分别确认当前材料为空和入口/实际helper投影为0；共享accept已修为验证后恢复当前状态及最新绑定/证据/来源，保留退役历史。84项相关回归685断言、主类型和独立只读边界核验通过；accept是未评审材料存储，实际projection/reuse仍校验当前索引与依赖，不改变含义/评分器。共享修复fb808576已发布，具名同原题公开baseline material-reactivation已完成34回调、2单元/15步，1个当前入口及1项材料投影保留；形式仍partial。新变化登记使用独立model/change-registrations/material-reactivation.json和model/inputs/material-reactivation/，保留旧路径与原件；run显式选择登记，核验production src tree和变化输入SHA，两个匿名红测转绿。fresh/previous在同一修后src tree成对复验，不用历史默认登记混跑。未用材料核心的common-only作者可先执行，消费者仍等待修复。不能把修前0采用或修后重新计算升级成原首件成功。

- [ ] 使用同一 Download 任务的 policy、premise、source 三种完整变化输入，每种 fresh/previous 两次，共六个首位置。
- [ ] previous 只传当前实现生成且来源匹配的材料；不能传原答或检查结论。policy/premise 变更保留合格源码含义，source 变更定位失效影响并重读。
- [x] baseline 只形成 partial 时仍可测试可复用材料的局部采用，结果标明 material-only；完整任务节省只在当前原/变质量满足时计算。
- [ ] 同一比较使用相同实现版本、账号设置和任务；具名修订按新版本成对补测，不把各轮最佳值拼在一起。

### AX13 作者与原字节消费者

两份完整原skill的common-only作者均已完成并保留全部稿件；独立只读核验及主线程完整阅读确认任务与skill职责忠实，原字节准入valid。已按原字节准备95文件Download和173文件OWUI源码包，公开schema/check通过；模型消费者尚未派发，不把准备包当真实消费。作者Usage提供操作步骤，最终包须补已验证公开CLI命令，原Usage字节不改。研究脚本5个针对性反例与严格类型通过，禁止递归测试保留workspace中的原skill附带测试。变化输入由当前公开baseline导出，保留完整原问题，单独登记policy导致的mode变化和production src tree，以同版本成对比较。

完整交付现已生成在`D:/skill优化/deliverables/authorization-property-execution-v1-2026-10-07/`及同名ZIP，418文件/1647201字节。两skill含生产loader的全部22/8文件；原自然任务取原input的完整brief，原声明/Usage字节不改。Download三变化保留作者四原题；premise只替换不再成立的所有权未指定前提，policy记录behavior→conformance，source仅views.py变化；OWUI额外LICENSE与原174项来源清单存provenance，173文件允许范围不扩张。仓库外11次公开零推理命令及ZIP全部entry字节核验通过；历史inspect/compare仅验证接口，未提升为当前消费/复用。`delivery.ts`只调用生产复制/校验接口，Windows显式env下命名bun的ENOENT以绝对process.execPath修正，未安装替代runtime。

- [x] 两个完整原 skill 各一次模型作者任务：产出可运行声明/配置和必要的机械来源绑定，输入是原 skill、自然任务及允许源码，不提供现成授权图或答案。
- [x] 宿主可以机械填充身份、路径和当前版本，但不能代作者填写政策真值或决定性源码含义；原稿、机械补全和语义修订分别保留。
- [ ] 每份首稿均经公共 check 后登记；有效稿按原字节走普通消费各一次。无效稿先具体诊断并允许一次具名修订，再消费修订稿；首稿失败不消失。
- [ ] 记录用户需要提供/修改的字段数、格式诊断和真实消费成败；没有真人计时就不估计节省分钟。

### AX14 同条件小面板

- [ ] 两任务各 N、M-S、D-S 一次，共六个首位置。N 是完整原 skill 加普通只读源码能力；M-S 是相同完整 skill/任务事实加共同性质核心的自然前端；D-S 是相同事实加领域声明和同核心。
- [ ] M-S/D-S 工具、自动调度、源码、预算、模型和修复机会一致；必要语义信息相当。N用于评估整方案成本，M-S/D-S用于检查表示的额外作用。
- [x] 首位置顺序在读取当前响应前写入 manifest，按任务交替臂顺序；全部为 development，不称盲测。调试已暴露事实作为适应性限制记录，不把调试最优答案当首答。
- [ ] 公平输入不含评阅事实、评分规则、过去结论或开发者正确标注。第一次质量失败立即分类，共享工程缺陷暂停受影响后续臂、修复后同版本成对复验；不同版本首件不合并因果比较。

### AX15 机制检查与当前结果复盘

离线实现使用薄 `mechanisms.ts` 调用生产源码骨架/解释/材料投影/语义求值；相同原源码与模型保留草稿只机械替换v3/v4骨架revision，不添加标注，草稿与已接受单元分别标记。需求比较记录初始/当前必需字段与锚点、排除原因、诊断和载荷；合流比较使用同一实际投影单元，记录控制规则/终态数量、失败来源与诊断，不将其称为底层模型状态。当前已闭合同src tree归档直接纳入；因当前baseline遇usageLimitExceeded，旧afc71124提案仅在Git diff证明纯需求/合流实现没有变化时列为frozen-proposals/current-semantic-core。允许差异仅为不被两纯比较调用的inquiry-native/domain-runtime/focus及测试文件，任意其它src改动拒绝该资格。该资格不适用于完整运行时回放或新版本模型质量；匿名反例只证明脚本走生产API。额外模型机制位置仍默认0。

实际两份afc冻结提案通过纯核心版本资格，按同源草稿比较两个源码单元的必需标注分别3→4、7→7，离线载荷增加，没有需求排除；每份实际材料投影1且精确等于原轨迹，合流开/关均14规则/3终态、失败来源合并0。总必需标注与尚待提供的标注分开，离线完整envelope不冒充实际账号payload或token。独立复核后补负例拒绝缺失/不同的实际投影绑定；5测试/30断言通过，没有理由额外追加模型机制位置。

- [x] 用相同当前源码/提案确定性比较 v3/v4 的 required annotation、状态数和载荷；按问题依赖与状态合并分别关闭，定位各自作用。
- [x] 只有真实轨迹表明机制被实际采用且对结果存在具体疑问时，才追加至多两项具名模型机制复验。不得把人为构图消融当真实模型质量结果；当前追加0。
- [ ] 选取当前同版本 N/M-S/D-S 的自然原答逐题对照，指出成功链、错误链和仍需手动工作；避免只报一个 full 百分比。

### AX16 原件、用量与失败分账

当前collector绑定17份归档的输入/答案/report SHA，父会话可见input/output/cacheRead为34358571/152441/31914752、非缓存input2443819；301上下文直接核验，OWUI28上下文/2源码窗口精确脱敏重建单列。四份smoke/作者capture另外核验动态调用、模型写入/宿主回执、完整skill及私有准入未进入可见模型输入；不可见内部请求、额外子会话、开发/探子及USD仍unknown。作者accounting行保留原report的待评阅历史状态，当前准入在manifest/summary单列，不改原报告。

- [x] 每个会话记录启动/完成状态、模型/effort/harness、实际工具、有效配置、first/revision、依赖、当前源码、自然答和检查结果。
- [x] CLI内部 provider 请求数若不可见保持 unknown；一个 turn 不写成一次底层请求。完整输入、缓存读取、输出、持续时长按实际字段核对，缓存不双计。
- [x] 账号额度消耗不写成免费或 USD=0；无价格/计费数据保持 unknown。开发代理、只读探子、作者、分析、修复和消费者分开。
- [x] 所有失败首件、无答、超时与晚答保留。只结束本轮自己启动的会话；未知完成留账，不以新身份抹去历史封存。

### AX17 独立只读语义复核

全部10份已交付领域自然答均有原件SHA绑定独立评阅和主裁定。早期三份Download答的探子将GET全局门槛归到全部原答，主线程点验只source-controls显式覆盖；其仍缺ownerless分支，field-context/answer-phase还缺GET门槛与具体所有权分支，均partial。唯一自然full是旧premise fresh的条件说明，formal仍失败；当前比较0，不拼接历史最好结果。

- [x] 对本轮所有已交付答案逐题复核实际源码、前提、效果和政策；评阅者能读 oracle，执行模型不能读。独立 AI 评阅按该性质标记，不称真人。
- [x] 重点核查被需求排除的语句、合并的异常、资源变化和 helper 返回；在允许/拒绝/条件答案上各有相反例。
- [x] 子代理只返回出处和疑点，主代理点验关键原文并裁定。修复仍在共享生产实现，不能修改评分器让错误过关。

### AX18 适用回归与零调用重放

当前已接通严格零账号重放：按实际incoming packet核验原回调顺序/参数，以强制test-transport重执行共享账号核心，比较完整serialized native状态/材料/计数；仅排除宿主计算/源码准备的具名耗时字段。runtime src tree不一致的旧归档单列，不假装新代码重放旧实现成功。src工作树有改动/未跟踪文件时拒绝严格重放，避免HEAD tree冒充实际代码。六份同版本answer-phase、公开Download、OWUI和三份变化首件的184回调及状态/材料一致；后续关闭位置继续纳入。smoke/作者原稿字节和费用由各自capture/accounting核验，不把mock推理当真实账号。源码窗口重建额外拒绝负数、非整数、倒序及越EOF范围；previous临时公开声明在源盘创建，避免Windows跨盘relative sourceRoot失效。

- [x] 先相关单测、主类型和本轮研究脚本类型，再运行一次相关联合回归；只有新增修改/失败才重复。无需重跑整个历史研究和全部旧付费输入。
- [x] 本轮原件零账号重放：重算状态、材料使用和成本聚合；原模型响应保持原字节。新代码不能假装严格重放旧冻结实现成功。e1578bb1的6份184回调、afc71124的2份58回调封存；当前6042树严格成功0，唯一当前会话未完成不重放。
- [x] 文档测试、链接、目录登记和 diff 检查各一次，修复本轮引入的问题。不通过删除历史失败取得整洁。15文档测试、35113文件链接扫描0断链/旧引用/治理错误、原5篇幅软提醒、catalog18项0诊断；末轮研究测试路径筛选未选文件的诊断保留，更正为显式路径后23pass/104断言。

### AX19 普通交付和当前文档

- [x] 更新使用说明、developer-guide、spec、current-status、当前计划及研究§7.58；给出真实可复制的 account inquiry/native/check/inspect/变化命令，账号run模板静态核实且拒绝后未再推理。
- [x] 研究段落记录问题→根因→具体修改→同例效果→剩余限制，统一正文，不新增每阶段复盘 Markdown。
- [x] 在根 conversation_log 记录阶段、验证和未达责任；handoff/communication 更新账号授权和下一恢复点，发布SHA在实际推送后记录。
- [x] 明确暂存本轮文件，提交并推用户 origin，核对远端 SHA。历史 raw、未跟踪材料及他人改动不混入。离线检查点`fa8eb96dd2021ff2b48ab3952a178b9e4e695877`已推`origin/skill-ir-aot`并核对远端；63份AX暂存文件逐字节一致，当前失败输入/95来源/完整22文件skill及report/run SHA通过。三个Windows检查输出按精确路径保留CRLF格式与原SHA；生产src tree仍6042b79e，真实11待执行与研究目标false不改。

### AX20 收束与继续责任

- [x] 分别给出 engineering、account-runtime、native-delivery、author-use、quality、reuse 六项状态以及 original/revision 证据；当前summary为待恢复快照，有限队列与研究目标均false。
- [ ] AX3反例通过、账号smoke或形式检查通过都不能单独令研究目标达成。满足真实原任务/变化验收才标记相应结果完成；不满足则标记 `completed-with-unmet-criteria` 并指明最后实际缺口。
- [ ] 可行动的共享缺陷仍在当前队列责任内时继续修复，不因为预定小时到达自动停止；同一根因两轮修订无进展时改变接口/工作拆分，停止重复抽样，继续不依赖它的任务。最后给出有限队列完成与长期研究目标的分别结论。

本次通道拒绝属于暂停派发的恢复检查点，不是最终收束。没有把11个尚未尝试位置记为执行失败或零调用完成；AX12/AX13/AX14及当前baseline/成对修订的责任继续保留。共享接收者/helper连接与全部原分支覆盖是恢复后的具体质量责任。

## 五、固定输入、预算与公平性

以下路径均相对 SkVM。输入已暴露，只作为 development。新会话复制所需材料到专属工作目录；执行模型不能浏览整棵 results 或本任务书。

| 用途 | 路径 |
|---|---|
| Download完整原任务 | `results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/model/inputs/paperless-download-original.json` |
| policy/premise/source变化 | 同目录 `paperless-download-policy.json`、`paperless-download-premise.json`、`paperless-download-source.json` |
| OWUI完整原任务 | 同目录 `owui-ingestion-original.json` |
| Cloudflare完整原skill | `results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/SKILL.md` |
| GitHub完整原skill | 同层 `github-security-review/SKILL.md` |

直接依赖由原输入解析，不人工重写 sourceRoot；Download 的源码位于 `authorization-focused-closure-v1/model/source/paperless-framework-v1`，OWUI 位于 `authorization-domain-execution-v1/model/public-source/owui`。隔离副本保留相对关系和相同源码内容。新作者组合必须先登记 skill/task 对应，不冒称旧 AW 曾跑过该组合。

初始队列共 **20 个逻辑位置**：账号smoke1、两native调试2、Download inquiry1、三变化fresh/previous6、作者2/消费者2、三臂质量6。没有必要重复同一原件时可事先登记共享，但共享只计一次实际运行，不事后挑最好原件。具名修订另列，不覆盖20个首位置；机制额外模型位置最多2，默认先离线。

实验宿主限额：每个正式位置工具64次、display 786432字节、read 33554432字节、会话45分钟；smoke5分钟。相同对照使用相同限额，超限留账。没有可控底层请求数时不虚构 max-provider-calls；账号quota/取消按实际终态处理。连续同因无进展先修接口，不增预算硬耗。用户未设金钱上限不等于授权恢复暂停的第三方接口。

## 六、立即修复规则

2026-10-07 回访边界修订：已封存 `afc71124` 源码树下原任务和 policy fresh 的严格离线回放（58 个回调）。当前账号入口首次检查后每次上下文都强制 answer，会撤销模型显式 `defer.revisit` / `nextItemId` 的源码事务；现有真实原件没有实际请求该回访，不能将它们的失败归因为已发生的回访失败。先用匿名生产接口红测复现，区分“检查后默认交付”与“预算耗尽必须交付”：剩余探索预算允许模型显式选择的原源码事务持续到接受或明确放弃，检查耗尽/探索耗尽/已有有效结果仍进入交付。修复不增加预算、调用或正确语义标注；受影响实际比较暂停，修复后重新登记同版本基线及变化输入。

| 观察到的问题 | 当场动作 | 后续执行 |
|---|---|---|
| 共享schema/运行/摘要错误 | 保存原件，写最小红测，修生产核心，再跑同例具名修订 | 暂停所有受影响位置，未受影响工程继续 |
| 源码已读但没进入解释 | 检查需求、锚点/参数身份、接受诊断和调度，不再追加相同大窗口 | 只补具体缺口，原问题不删 |
| 模型格式错误 | 一次局部字段反馈，保留有效解释 | 两轮同因转共享接口诊断 |
| 模型语义错误 | 用独立源码核验定位缺失证据/对象/分支 | 修改共同工具/检查，不能向正常输入注入oracle |
| 差异只来自不可观测部署 | 明确条件分支和剩余事实 | 对源码可判部分继续交付，不宣称live成功 |
| 账号无权限/额度或不可控工具 | 具体记录真实配置/响应；停该通道 | 继续离线工程，无第三方fallback |
| fresh部分完成 | 保留部分质量和具体缺口 | 允许材料级变化诊断，任务级收益另验 |

## 七、测试起点与命令

AX3复用 `semantic-flow.test.ts` 中的 `unit/block/lower` helper。先用既有 context step 构造16/64项再return，确认当前版本报 `semantic-path-limit`；新策略期望：正常allow出口仍在、失败仍unknown、等价失败压缩后不超限。反向加一个会改变资源的调用，依赖它的授权问题必须重新成为未解。具体字段从当前 `SemanticStep` schema读取，不能通过any缺字段蒙混测试。

同时保持现有 same-local-name、helper参数、field alias、finally override、handler顺序和policy-only反例。已排除“空handlers加finally吞异常”的旧猜测，不把它当新bug重复修。

从SkVM根运行已有命令；新增v4测试纳入相关集合：

```powershell
bun test ./src/adapters/codex-account-session.test.ts ./src/adapters/codex-account.test.ts
bun test ./src/task-dsl/authorization/source-interpretation.test.ts ./src/task-dsl/authorization/semantic-flow.test.ts ./src/task-dsl/authorization/source-materials.test.ts
bun test ./src/benchmarks/authorization-dsl/inquiry-focus.test.ts ./src/benchmarks/authorization-dsl/inquiry-worklist.test.ts ./src/benchmarks/authorization-dsl/inquiry-domain-runtime.test.ts
bun test ./src/benchmarks/authorization-dsl/operation-runtime.test.ts ./src/benchmarks/authorization-dsl/operation-reuse.test.ts ./src/benchmarks/authorization-dsl/source-assisted-entrypoints.test.ts
bun run typecheck
python -X utf8 -B -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py
python -X utf8 -B scripts/check_skill_ir_doc_links.py
bun ./scripts/experiment-catalog/cli.ts check --root=. --catalog=results/skill-ir/experiment-catalog.json
git diff --check
```

账号入口的现有形态是 `authorization inquiry run --harness=codex-account --model=gpt-5.6-sol` 与普通 `run --adapter=codex-account --model=gpt-5.6-sol --authorization-scope=... --authorization-domain-tools=true`。新增v4须先通过实际参数测试再把完整可运行命令写入usage；不要照抄不兼容的provider预算flag。

## 八、最终产物

本身份内保留 `status.json`、`manifest.json`、逐次原件、评价、修订关系、`accounting.json`、`summary.json`、`verification.json`，优先复用现有归档格式；机器字段足够时不再另建重复状态文件。真实用户交付包含同一个完整skill、可用声明及其原/变使用命令，不只交一张测试表。

报告必须回答：账号真实跑了没有；哪些函数标注不再必要及其依据；未知副作用如何保留；异常状态如何合并；原题逐项自然答案是什么；生成声明有没有原字节消费；变化复用减少什么工作、是否保持质量；实际费用和真人耗时哪些仍未知。最后给出下一项具体代码责任，不能只写“继续优化”。
