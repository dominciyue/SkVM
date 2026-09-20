# 授权 DSL 结果传输、运行计量与评价修复任务书

> 执行方式：使用 `superpowers:executing-plans` 连续推进 W0–W9；代码采用 `superpowers:test-driven-development`。常规检查点自主继续，基于诊断修复共享实现，阶段性更新研究正文。任务完成后交付，不为延长运行时间重复实验。

**Goal:** 让现有授权 DSL 原型能够稳定交付可引用、可评价的分析结果，完整记录模型调用，并通过同条件 B/D 配对判断领域组织方式的实际作用。

**Architecture:** 领域声明及义务语义保持 v0；增加窄的模型输出传输层，由宿主绑定请求元数据和引用原文。B/D 共用来源目录、输出协议、计量、修复机会和评价。现有实验脚本承载运行与恢复。

**Tech Stack:** TypeScript、Bun test、现有 Zod、`LLMProvider`、授权领域模块与实验 runner。优先在授权模块内实现，公共 provider 只做被反例证明必要的最小兼容修改。

- 制定日期：2026-09-21；状态：`active-W7`（W0–W6 已完成，授权回归 76/76、435 assertions，typecheck 通过）。
- 分支：`skill-ir-aot`；仅推送用户 `origin`。不新建分支，不处理无关源码修改。
- 当前设计和复盘：[研究总文档 §7.20](../../skill-ir/skill-dsl-research.md#720-w-复核结论与下一轮设计)；持续方法合同：[spec 14.34](../../skill-ir/skill-ir-aot-optimization-spec.md#1434-按-skilltask-范围设计领域-dsl)。
- 依据：[V summary](../../../results/skill-ir/skill-dsl-research/development/authorization-v0/summary.json)、[本次复核](../../../results/skill-ir/skill-dsl-research/development/review-20260921.json)。
- 新机器结果根目录：`results/skill-ir/skill-dsl-research/development/authorization-transport-v1/`，W0 开始时才建立；V 原件继续只读。

## 一、这轮具体解决什么

1. 模型现在既做授权分析，又复制 repository/ref、路径、行号和 quote。源码正文没有逐行编号，结果引用却必须精确匹配，真实输出多次因引用失败进入 repair。
2. revision B 的响应同时包含缺字段和 `results` 内的异常字符串；需要真实缩小输出负担、检查实际 provider schema，而不只删除一个必填字段。
3. 宿主 `Promise.race` 超时后，底层结构化解析仍能继续。离线 mock 已复现迟到响应触发 fallback，返回快照未包含该调用。计量闭环要落实到每次派发和结算。
4. `taskDecisionCorrect` 当前混合机械错误和语义错误。file B final 的关键事实得到支持，但三处引用错误使其为 partial；W 要保留交付评价，同时单列语义判断。

本轮交付仍服务同一任务类：固定源码中的主体、资源关系、操作、政策、入口和条件分析。引用和调用修复是共享支持，D 的价值由授权义务与领域组织对任务质量、完整性及开销的作用来判断。

## 二、设计决定与文件责任

| 文件/模块 | 本轮责任 |
|---|---|
| `src/task-dsl/authorization/schema.ts`、`result.ts`、`index.ts` | 保留声明与旧结果接口；公开窄传输类型、归一化和诊断接口 |
| 同目录拟新增 `transport.ts` 及测试 | 模型只写义务结论、事实和来源引用；宿主绑定可信元数据、从 exact source 派生 quote |
| `src/benchmarks/authorization-dsl/inputs.ts` | 确定性源码目录及逐行标签；裁剪行与原始位置映射 |
| 同目录 `host.ts`、`telemetry.ts` | 截止/关闭状态、逐请求计量、迟到事件、保留初始产物、紧凑 repair |
| `src/task-dsl/authorization/render.ts` | B/D 共享输出合同、事实等价和冗余削减 |
| `src/benchmarks/authorization-dsl/evaluate.ts`、`run.ts` | 分解评价、事件落盘、新配置与离线恢复；旧 v0 replay 保持原口径 |
| `docs/skill-ir/skill-dsl-research.md` | 当前组件设计、问题解决过程和结果解释的唯一正文 |

引用采用宿主从完整允许输入构建的 source ID 与有编号范围。模型仍选择哪些代码支持自己的论断；宿主只补路径和原文。目录对两臂相同，覆盖全部允许行，不按 oracle 或预期答案选择片段。陌生 ID、越界、跨来源拼接、旧 ref 错绑返回明确诊断，禁止模糊搜索后猜测替换。

模型传输版本与 canonical result 版本分开。首选在保持五类事实分组的前提下，去掉模型复制的请求元数据及 quote；结论明确时 missing/observation 可省略并规范为 `[]`，unknown 仍要求说明决定性缺失事实及建议观察。若扁平 facts 更合适，先以真实失败样例和确定性测试说明收益，同步本节后实施。不得把 missing unknown 默认为成功。

## 三、执行队列

### W0：恢复现场与落实反例

- [x] 读当前状态、§7.19–7.20、V summary 和本任务书；记录当前分支及本轮归属文件。保留七个既有源码工作树条目及其他无关材料，不为本任务提交它们。
- [x] 创建轻量 `status.json`，列 W0–W9、阶段、nextAction、运行配置和待决问题；不另建多层冻结/摘要合同。
- [x] 以测试重现四类共享问题：未编号 citation、异常 wire shape、超时后迟到 fallback、机械失败混入语义分数。真实失败原件只读，可提取最小 synthetic 反例。
- [x] 运行相关旧测试一次，记录基线。已确认 51/51、284 assertions 属于旧实现；新增失败测试应准确打中待修问题。

### W1：让来源引用由宿主管理

- [x] 写 source ID 稳定、数组重排、重复文件、LF/CRLF、裁剪起点、末尾换行、越界及跨来源错误的失败测试。
- [x] 为允许源码生成清晰编号；展示编号与最终解析使用同一目录。引用范围明确采用 crop 行号，单独保留原始文件位置映射。沿用已有 source bundle，不为这轮增加任意文件裁剪功能；非零原始位置由小型 fixture 验证。
- [x] 对 exact source 取原文生成 canonical citation；引用有效性与“原文支持论断”仍分别记录。
- [x] 一份普通合成声明使用与 Open WebUI 无关的名称，通过相同入口与引用解析，检查没有案例分支。

### W2：缩小模型输出接口并保留兼容

- [x] 定义独立 wire schema，模型输出义务 ID、结论、解释、分组事实、source refs、必要缺失信息及 scope claim。任务、repo/ref 和结果版本由宿主绑定。
- [x] 写必需语义缺失、可选空数组、异常数组项、重复/陌生 obligation、跨 ref 引用和 unknown 缺失理由的失败测试。
- [x] schema 输出与 prompt fallback 采用同一窄结构、同一归一化。验证实际送往 provider 的 JSON schema，避免只测试 TypeScript 类型。
- [x] 保持旧 `AuthorizationResultV0` 读取/验证和 V replay；新运行显式记录 wire、normalizer 和评价版本。旧输出转换用于调试时保留原件，另写派生产物。
- [x] 规范化只做来源明确的机械补全；绝不猜测 obligation ID、结论或缺失语义。

### W3：减少重复指令与修复上下文

- [x] B/D 从同一 compiled facts 生成内容，明确共同部分与方法差异；D 优先移除 canonical facts 与 plan 中的重复表达，不删授权条件、政策或分析要求。
- [x] 源码只出现一次，输出 ID 闭集保留。用事实对象/字段覆盖比较，配合人工抽读 preview；不靠关键词出现次数证明等价。
- [x] repair 使用最小充分上下文：必要声明和源码、当前答案、可操作诊断各一次。共享协议、两臂同样的修复机会；禁止附 oracle 或正确结论。
- [x] 分项统计说明、声明、源码、输出合同和 repair 字符数；provider 报告的 token 单独保留。不得把字符数推算为实测 token。

### W4：修复调用生命周期与费用可追溯性

- [x] mock 覆盖：正常响应、异常 schema 后 fallback、超时后有效响应、超时后无效响应、repair 超时、provider reject、关闭后再次派发、恢复不重发。
- [x] 每次 `provider.complete` 前检查运行是否关闭、剩余时间和已派发次数，测试第五次派发被拒绝；宿主到期后禁止 fallback/repair 新请求。已有 provider 支持 abort 时使用，缺该能力时保留 pending/unknown。
- [x] 派发、响应、异常、超时和迟到结算以 attempt ID 写事件；phase 在派发时固定，避免异步结束后变成别的阶段。runner 从事件归并 summary，不能只依赖函数返回时快照。
- [x] 已关闭单元的迟到响应可补调用事实及已知 usage，但不偷偷换成新的有效实验答案；进程终止后无法取得的响应保持 unknown。
- [x] 将 `initial` 移出可能丢失它的异常路径；repair 失败时仍保存初始答案、初始验证及 repair 失败原因。
- [x] 记录 phase/per-call/unit 三种时间的含义。W 使用相同两臂配置：每调用 180000 ms、每单元总上限 600000 ms、max output tokens 6000；实际派发只获得剩余预算。若技术需要调整，须在 W7 前写理由并对两臂一致，不在结果后单独放宽失败臂。
- [x] 小型事件持久化及关闭规则在授权宿主落实；不扩成全项目调度框架。仅调用实际必要的 provider 接口，不新建全局重试机制。

### W5：把语义、证据和格式分开评价

- [x] 新增/明确 `semanticDecisionCorrect`、`evidenceSemanticSupport`、`transportValid`、`deliveryComplete`，同时保留覆盖分母、缺失义务、合理/过度 unknown。
- [x] 对“结论与关键事实正确但引用坏”“引用合法但论断错”“scope 夸大”“缺决定性条件”“等价表达四种条件关系”分别写测试。
- [x] 语义判断来自有答案定位和源码依据的 review；无可评价答案或无有效 review 为 unknown，不默认计错也不从主要分母排除。
- [x] rubric 的关键含义保持，允许等价表达；trusted-header 的控制关闭、认证失败、安全代理和攻击者头可达这些关系按实际因果判断，不要求抄固定四句。
- [x] 旧评分保留原版本语义。用既有 V review 生成新的离线分解附表时标为再分析，不能称新独立评价或新模型成功。

### W6：一次离线完整演练

- [x] 三个既有 task × B/D 经过新编译/渲染/wire/引用/host/评价 mock 路径，正常及注入错误均符合预期。
- [x] 原 V 归档用旧接口和原 review replay，一次确认兼容；新派生产物写 W 目录。
- [x] 抽查模型可见内容只含允许的 task/source；三个条件案例继续共用实现，oracle 只在生成结束后用于评价。
- [x] 检查 `check/status/evaluate/replay` 不创建 provider；记录现有脚本最终可执行命令及选项。命令变更直接同步研究 §7.20，不另做 CLI。明确脚本退出码与结果质量：有效评价报告可包含 partial/incorrect；输入错误或宿主无法完成运行应返回相应非零状态。自动消费者同时读取 transport/delivery 字段，不能只凭 exit 0 判断任务正确。

### W7：三组真实同条件 B/D 配对

- [ ] 沿用 V 的 file、text、trusted-header 三个已暴露 development 案例和原有源码/政策；每案例一对，共六个新生成单元。固定顺序 B/D、D/B、B/D，均 fresh context。
- [ ] 沿用可用的 `xty/gpt-5.6-sol` 路由、temperature 0，关闭 auto-probe；使用 W4 统一时间配置。模型/路由不可用时记录阻碍，不静默换模型继续拼表。
- [ ] 调用前保存配置、代码 revision、prompt 和声明。一单元最多一次 schema→fallback、最多一次有诊断的 domain repair；整个单元 provider dispatch 上限四次。该上限限制重复试验，不是用户费用额度。
- [ ] 完成或明确失败后都写结果。已派发而完成未知的请求不自动重发；其余独立单元正常继续。
- [ ] 全部生成结束后审阅语义，review 写清身份、关键事实、答案位置、来源及有争议项。development-agent review 如实标注；涉及方法优势的临界项由另一个只读核验者检查，意见不一致保留 disputed。
- [ ] 汇总 first response、first normalized result、after repair 三个层次；schema fallback 的成本包含在 first normalized result 成本中。逐臂报告完整的三案例分母与每案例结果，不只展示成功 pair。

### W8：一次有根据的修订与方法决定

- [ ] 归因到 wire/schema、citation、生命周期、语义推理或评价。共享代码缺陷先写红测试、修复，再最多追加一轮受影响 B/D；同一轮最多沿用三个受影响案例，不新增输入。
- [ ] 若只有模型推理遗漏，记录遗漏的具体领域关系；不要以答案提示、案例名分支或放宽 rubric 修成成功。没有共享修复依据就结束追加。
- [ ] 新旧 revision 分开汇总；历史 V 开销只是描述性参照，W 的 B/D 同条件结果用于当前比较。首轮失败不被修订覆盖。
- [ ] 做明确决定：运行稳定且 D 有具体质量/完整性收益，下一轮筹备第二项目；两臂语义与开销相当，采用较简单表达及共同 helper，保留领域模型；传输稳定而推理仍差，下一轮只研究缺失领域关系；生命周期仍有缺口，先完成对应工程修复。样本小时报告逐案例差异，不做总体显著性承诺。

### W9：验证、文档和发布

- [ ] 运行授权两目录测试及 `bun run typecheck`；公共 provider 如有改动，补对应专项回归。修复后只复跑受影响检查，不做历史全量审计。
- [ ] 文档单测、当前链接/治理检查、已产生 JSON 解析及一次离线 replay；在同一轮收口完成，不重复建 clean worktree 或归档链。
- [ ] 更新研究总文档中的当前接口与短复盘，同步 current-status、plan、spec。删除已被最终设计取代的草案段落，保留有引用价值的失败事实与原数据。
- [ ] final summary 分列工程状态、六个初始单元及 revision、语义/传输/交付、调用和费用、具体决定。实际 USD 缺失保持 unknown，开发代理费用单列。
- [ ] 按归属暂存、检查差异、提交并推送 `origin/skill-ir-aot`；确认远端一致，列出仍保留的无关修改。完成后关闭本任务，不自动启动第二项目。

## 四、失败处理与研究记录

局部可恢复代码问题在同阶段修复；没有新诊断的重复网络失败停止该单元，继续其他独立工作。方法大方向变化先解释并同步任务书，格式与接口细节可在共同语义不变时自主调整。保留版本和真实失败即可，不增加人工批准仪式或逐阶段摘要锁。

每个有意义发现直接更新研究 §7.20 的相应主题，并在 §12 写“触发→根因→修改→验证→含义”的短记录；另在工作区 conversation log 记文件、验证及未决项。机器原件放 W 结果根，避免为每个小阶段另建 Markdown 总结。

## 五、交给持续执行任务的启动语

> 将 `D:\skill优化\SkVM\docs\superpowers\plans\2026-09-21-authorization-dsl-transport-and-evaluation.md` 的 W0–W9 设为持续目标并执行。先修复授权 DSL 的结果传输、源码引用、超时后调用及评价分层，再完成既有三个案例的三组 B/D 配对。保持两臂共同支持一致，保留初始失败和一次有依据的共享修订，记录全部请求及未知费用。直接在 skill-ir-aot 开发，复用现有模块与 runner，不重建 CLI、不扩入口发现或第二项目。阶段问题与解决过程持续写入研究总文档，按任务书自主处理常规失败。完成后提交本轮改动并推送用户 origin，给出逐案例结果和下一步决定，不重复验证凑时长。
