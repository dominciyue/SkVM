# Skill IR 当前状态

- 更新日期：2026-09-14
- 工作分支：`skill-ir-aot`
- 下一路线：F0–F11，通用生成流程补牢；[任务书](../superpowers/plans/2026-09-14-general-generation-reinforcement.md) revision 2、spec 14.33。含 F1.1 语料到代码、F6.1 执行型流程骨架、F9.1 同包跨模型/环境比较。
- 执行状态：`active`。F0、F1、F1.1、F2、F3、F4、F5、F6 与 F6.1 已完成（F5 保留 partial 边界）；F3 在现有生命周期前增加了证据约束的 validation completion，F4 将带有明确来源的空 validation 元数据分类为 repairable，并把候选、缺字段和局部范围合并进既有一次 repair；F5 通过普通 validation cases 生成路径/cwd 变化、记录已有参数成对覆盖，并对固定路径候选 fail closed。F6 让实现选择与 optimizer gate 对齐，按实际 validation 参数生成命令模板；F6.1 物化单输入/多输入普通 Node/Python 执行骨架，保留步骤依赖、框架/source/model 贡献和 residual duties，并在 workspace context 中登记观察到的候选。无依据、未执行和程序失败仍分别保留。当前进入 F7 消费观察。尚未启动本轮真实项目/付费运行；不重做已有验证器，不手修个别成品代替共享能力。
- 已交付基线：C0–C10 `completed-development`，对应 spec 14.32；最近证据同步为 `4b31862`。新程序链已有 development 结果，但 C8 包内部仍为 `not-run/draft`，不能用后续消费覆盖该缺口。`15b5d51` 另修 CLI 失败退出码和原任务超时提示；计划形成时该提交仅在本地，实际同步以 Git 为准。

2026-09-14 二次复核：上一轮 H/R 报告原样保留，其组件与局部程序结果有效；但 R6 新优化 no-change 后使用旧 H8/H9 包，R7 输入本身为 H9 包，默认新程序生产闭环仍为 partial。新计划修复原始内容未传入验证、普通脚本修改被误送 domain backend、修复动作未采纳和候选/no-change 判断问题；旧包不能替代本次产物。

本页是 Skill IR 唯一实时状态入口。日期化任务书、历史计划和结果报告都不是“当前状态”。

## 1. 现在能做什么

- 从 Pi run-summary、bare-agent runtime-event 和既有 conversation log 读取 trace，保留来源摘要、定位、表示层级、诊断和未知 usage，并生成 Evidence、优化 workspace 和 proposal；日志源不会重跑原任务。
- 从本轮 `skill-ir-trace-guided-agent-consumption/v1` 报告及其摘要绑定 Pi 事件恢复完整 conversation trace、checker criterion 与 cache usage；缺失费用仍保持 unknown。
- 查看、接受或拒绝 proposal；也可由 `jit-optimize --package-out` 直接把选中轮导出为不覆盖原件的通用 skill 包。包清单绑定真实增删改移、完整文件闭包、动作实现、运行时/依赖文件和验证状态，no-change 不制造空包。
- 从 JIT proposal 构造带精确文件闭包的新 API Tester skill 包；包内普通输入入口接收 v2 binding、工作目录和输出目录，并复用未放宽的 `api-tester-openapi-subset-v2` generator/checker。
- 在普通任务目录运行真实 Pi agent，依据实际 read/exec tool call 而非最终文字核验 skill 加载与 helper 消费，并对相同 model、input、binding 和 runtime 的原/新结果做成对比较。
- 通用 development runner 可直接消费优化包或普通 source skill，提示不泄露 helper 路径；它分别核验任务输出、残余职责、受保护输入、整个 skill 副本不变性，并以带原始摘要的 gzip 保存 Pi 事件。
- 使用 Skill IR 的 parser、validator、静态 pass、lowering、runner、checker/scorer 和 paired analyzer。
- 构造并验证受限 API TaskContract；既有 API Tester 与 Env Manager 产品路径继续可用。
- 用 `skvm artifact`、standalone verified-artifact 工具和 external-skill import 处理已支持产物。

SkVM 整体能力和 JIT 路径见[架构](../architecture.md)、[使用说明](../usage.md)与[JIT Boost](../jit-boost.md)。

## 2. 当前基线

开发线程已启动 U0–U7。U0 已确认既有 JIT optimize 基线测试 45 pass / 0 fail，并绑定两份仓库内真实运行材料；
U1 已完成多格式 adapter，U2 已用 16 条真实 run-summary 生成有效 proposal，U3 已构造并核验独立 skill 包。第二次优化中出现的
未声明 `NUL` 文件已作为失败证据保留；包构造器明确记录并排除它，优化器提示合同也已增加可移植性回归。新包已在仓库内真实
development OpenAPI 输入上通过独立 v2 checker。U4 已保留首次输出目录约束错误，并由修订包完成真实 agent 加载、helper 调用和独立 checker；
U5 在三个已暴露 development skill、三个仓库上完成职责匹配，其中两个成员共享同一 helper，第三个成员在单条 trace 下得到有依据的
no-change。U6 对两个可打包成员各做原输入与变化输入，4/4 原包和 4/4 新包均通过相同 checker，新包 4/4 有实际 helper tool-call
证据。上轮机器结果入口为 `results/skill-ir/trace-guided-skill-optimization-20260913/status.json`；该 completed 状态仅适用于 U0–U7。

四组成对结果为 `mixed`：累计耗时下降 56.79%，输出 token 下降 75.66%；输入 token 上升 62.86%，cache-read 上升 73.75%，
总 observed token 上升 60.59%。provider 定价不可用，实际 USD 成本保持 unknown；这些结果不能写成总体或人工节省。

既有 API TaskContract 基线保留为可复用后端：6 个输入、3 个 provider、47 个 operation、9 个 task；当前结果为
4/9 task、8/18 run 通过，10 个失败待归因；native runner 4 pass / 5 skip。它不是当前路线本身，也不代表
trace 优化闭环已完成。最窄证据入口见[证据索引](evidence-index.md)。

G0–G13 已把通用动作、实现选择、独立包导出、普通 source/优化包自然消费和分字段效果统计接入生产代码。30 份
development skill 经广读、10 份经深读；实际对 Law To Markdown、Experimental Design、I18n Helper 与 Env Manager
执行 5 次优化尝试（Experimental 修订一次），得到 4 个包 identity（覆盖 3 个 skill；Law no-change），并完成 9 次自然消费运行。Experimental Design 的原任务通过，
变化任务在两版包上仍有 0.6/0.9/0.7 的不稳定结果，因此不计收益；I18n 原任务与未回灌变化任务均为 5/5 checker 通过。
其当前运行时严格配对为 `mixed`：input token -6,199（-32.32%），但 output +723、cache-read +9,600、total observed
+4,124、tool calls +4、duration +4,627 ms；provider USD 未绑定。Env Manager 首跑导出文档重组包，闭包通过但未做行为/效果验证，
并促成 `.optimize/submission.json` 不得冒充 skill 变更的共享提示修复。机器入口仍为
`results/skill-ir/general-skill-optimization-20260913/status.json`。

## 3. 当前计划与上一阶段基线

当前执行为 [F0–F11](../superpowers/plans/2026-09-14-general-generation-reinforcement.md)。F0 已建立结果根，F1 已将实际操作接入 workspace，F1.1 已建立 `results/skill-ir/general-generation-reinforcement-20260914/f1.1/pattern-to-code.json` 与验证报告，F2 已完成参数来源 TDD，F3 已完成 validation completion TDD，F4 已把可修接线缺口接入既有一次 repair，F5 已完成保守的路径/cwd/参数变化审计（证据见 `f5/verification.json`）。F6 已完成 Method 矛盾解析、实际参数命令模板、package 指南参数来源及兼容回归；F6.1 已完成共享单/多输入 workflow scaffold、失败隔离、贡献清单和 workspace 物化（证据见 `f6/verification.json`、`f6.1/verification.json`）；当前进入 F7 active。F5 明确不猜测单一参数值，参数“未生效”语义反例仍是后续真实结构回归的开放边界。工程、真实使用与效果分列；缺 validation 元数据不应在有来源可补时无声停留 draft，无依据则仍保留未知。参数化与真实消费检查服务通用职责，不要求所有 skill 统一格式或输出 ABI。

revision 2 增加：从已有 skill/trace 对照追踪共同模式到生产代码与测试；小型流程骨架实际接管产物处理，不能仅用 checker 计流程自动化；同一包在两个消费模型和隔离环境中比较。F6.1 现已提供单/多输入的执行 plumbing，但尚无本轮真实模型生成的跨结构成品；当前跨模型稳定性增益仍未建立，同宿主路径/环境复现不叫跨平台证明。现有程序生成通道和特定后端继续复用，不表示领域算法已由脚手架自动实现。

以下为已完成 C0–C10 的阶段记录；其中执行时的“当前”和远端状态均为历史记录，不表示 F 队列已启动。

当前执行的是[单次真实运行到新程序包任务书](../superpowers/plans/2026-09-14-skill-optimization-end-to-end-repair.md) revision 1、spec 14.32。C0 已完成命名诊断和 12/12 基线。C1 新增 session 外、业务目录外的 `skvm-pre-run-input-snapshot/v1`：在 fixture 物化后、skill/adapter 之前有界保存原始字节，binary 作为原始字节保存，大小/总量/不可读/不支持逐项 omission；旧初始 manifest schema 不变。C1 红例分别为 1/2 与 8/9，最终 14/14、68 assertions 及 typecheck 通过。C2 已将同一引用接入 Evidence 的 `inputResources.preRun`、workspace 的独立 `run-N-pre-run-inputs/` 投影和 validation 的 `pre-run-input-snapshot` 来源；二进制按原始字节物化，同名且漂移的 task-fixture 绑定 fail closed。C2 focused suite 90/90、358 assertions，typecheck 通过。C3 已将误声明的可执行动作路由到通用 `reuse-script`/`generate-script`，保留 registered-only `domain-backend`，并写入可修的 `action-kind-mismatch` 诊断；focused suite 66/66、210 assertions，package/production regression 27/27、135 assertions，typecheck 通过。C4 已完成单次约束修复：反馈携带 action snapshots、实际候选 diff、原动作意图和失败诊断；仅合并失败动作的已校验元数据，`changedPaths=[]` 仍执行修复动作，独立动作保留；combined suite 36/36、188 assertions，prompt suite 26/26、103 assertions，typecheck 通过。C5 已完成候选尝试与推荐分离：passing evidence 可提出有界机械机会，confidence 改为证据/边界/可行性语义，机会摘要保留接管步骤、参数、资源、检查和残余职责；合法 no-change 与 malformed/implemented-without-artifact 诊断分开。C5 focused 43/43、159 assertions，含 production closure 为 49/49、209 assertions，typecheck 通过；机器证据见 `results/skill-ir/skill-optimization-end-to-end-repair-20260914/c5/verification.json`。C6 已确认无评分输入仍可在隔离目录复用原 skill 的 `.skvm-validation.json`，并从绑定 task source 重读 contained file-check；source-derived、task requirement、self-check、保真引用和模型评价分开记录，错误输出/空程序/仅 stdout 均被检出。C6 套件 53/53、197 assertions，typecheck 通过；机器证据见 `results/skill-ir/skill-optimization-end-to-end-repair-20260914/c6/verification.json`。C7、C8、C9、C10 均已完成；提交 `8071eae` 已推送，远端 `origin/skill-ir-aot` 当前 0 ahead / 0 behind。随后对五个归档包重新运行严格闭包验证，均为 `passed`。

C7 已用自然任务和原始 skill 临时副本贯通实际生产对象：capture、Evidence/workspace、候选程序、独立检查、metadata-only repair、最终 snapshot、导出和同一包的原/变化任务消费均被调用；旧包替换、空 actions 文档包和“任务完成但未调用 helper”三类反例分别检出。C7 套件 4 个文件 26/26 tests、166 assertions，新测试 3/3、50 assertions，typecheck 通过；机器证据见 `results/skill-ir/skill-optimization-end-to-end-repair-20260914/c7/verification.json`。确定性替身不计真实模型成功。C8/C9 真实证据已追加如下。

C8 已完成五次真实 development 默认入口尝试：Law single 的现成脚本复用、Law batch 的 checker 生成，以及 I18n basic/multifile/partial 的文档候选或 no-change 均各自保留。Law batch proposal `20260914T011753250Z` 导出 `scripts/contract_checker.py`，包闭包摘要为 `1aa8d12f07e4aec7b09813a3a37e3a3766db7d7d16ae234ad221cedb8559ae8c`；其内部行为仍标 `not-run`/`draft`，不以包清单冒充独立验证。C8 机器报告与五份精简 proposal 证据见 `results/skill-ir/skill-optimization-end-to-end-repair-20260914/c8/`。

C9 已在固定 Python 3.12.13 依赖环境中，用同一 Law batch 包和同一自然 prompt 完成 original/semantic-variation 两组隔离消费。普通 agent 未被提示 helper 路径；日志显示 optimized 两组各实际调用 checker 两次并以 exit 0 返回。独立 checker 对四个 primary roots 共 16 个 contract checks 报告 15 pass、1 fail；唯一失败是 source variation 的证据路径绑定错误，optimized variation 通过并保留变更条款。耗时、token 与 tool-call 结果为 mixed，provider USD unknown；早期缺少 `python-docx` 的失败日志保留且未覆盖。C9 机器报告见 `results/skill-ir/skill-optimization-end-to-end-repair-20260914/c9/verification.json`。

最低交付要求已由一条从原始 skill 开始、本次优化器生成非 API 参数化程序的完整链满足：同一最终包在原/变化任务中被普通 agent 实际调用；现成脚本路线另有真实尝试。no-change、文档草稿、旧包消费及测试数仍不能替代该证据。结论只覆盖 development 的局部职责，不能外推为整个 skill、真实 API、readiness 或人工节省。

### 上一轮 H/R 阶段记录（历史，不作为新队列完成依据）

以下保留[上一轮任务书](../superpowers/plans/2026-09-13-skill-optimization-production-closure.md) revision 3、spec 14.31 的实际记录与当时交付口径；当前闭环判断以上方二次复核为准。

当前 machine status 已完成。R1 的唯一 run/capture/输入隔离保持；R2 已把互斥 `--prompt`/`--task` 与 `--optimize` 接入普通 run。R3 修复 V1/V4，R4 修复 V3/V5，R5 修复 V6。R6 已用 I18n generated-program 和 Law reuse-script 两种结构完成 fresh capture/handoff、当前 optimizer 尝试及 H8/H9 已验证包的原/变化输入消费；四个最终样本独立检查通过。R7 已从普通目录完成零研究接线的 source→capture→proposal→package 恢复，七项故障矩阵和 bare-agent-only 支持矩阵已绑定。H13 已完成一次复制后的临时目录闭包和 TXT 消费，输入/包均不变。H14 修复一个嵌套 snapshot portable-key 缺陷和三项跨平台/调度测试假设，最终合并 347/347。effect/actual USD 仍 unknown。

本轮最终决定：H0–H14 与 R1–R7 完成。默认入口能接收 skill、自然任务、目录与模型，并自动捕获/关联 bare-agent trace、调用现有优化器及原子导出；无需用户提供 logs、locator 或评分文件。普通无评分输入可复用原 skill 的 `.skvm-validation.json` 有界文件规则，未知/专业部分仍由 agent 承担。Y1 没有真实双程序前提，Y2 由 R7 缺成本绑定的真实支持 trace 完成，未新增运行。总报告分列 engineering complete、behavior partial、effect unknown；当前停止开发扩展，等待复核。

1. H0–H2：接续基线，使用已有语料定位问题，区分 skill 规则、任务条件和环境事实。
2. H3–H7：修复待验证依赖传播，将实际程序验证、一次局部修复/回退及最终 snapshot 导出接入正常 CLI/log 路径。
3. H8–H10：实际生成并自然消费非 API 参数化程序，验证现成脚本复用、变化条件和局部降级。
4. H11–H13：根据真实 trace 改善开销，做少量不同结构复用检查，完成普通工程入口使用。
5. H14：有限回归与交付；主链达标且窗口允许时处理适用的 Y1–Y2。

H0 启动时复核：当时程序验证与动作解析组件尚未接入正常优化循环，这一缺口已由下述 H5–H7 修复；四个 G 包身份的实际改动均集中在 SKILL.md，不能与新的 H8/H9 程序包混算。
30 个阅读条目中的 10 个为深读子集，不能表述为 40 个独立 skill。新计划要求真实程序链，不能用文档重组替代。
H0 已创建 `results/skill-ir/skill-optimization-production-closure-20260913/status.json`。普通日志入口的实际缺口已定位在
`runLogOnly`：它会调用 optimizer、保存 round-0/1 并仅按是否改文件选择 round-1，尚未在推荐 snapshot 前调用程序验证、
动作依赖解析或局部修复/回退。H0 规定基线一次通过 39/39 tests、106 assertions；当前进入 H1 定向工程用例。
H1 的 `case-notes.json` 已把 I18n 新程序、Law 现成程序、Experimental 多资源和 Env 第三结构逐项绑定到真实 `line:3`
trace、原文摘要、独立评价依据及下一条测试；现有暴露材料足够，未新增获取。当前进入 H2 条件范围 TDD。
H2 已让 action 兼容地携带有来源的 skill/task/environment/unknown 约束，并由 workspace 写出独立
`CONSTRAINT_SOURCES.json`；optimizer 明确禁止把一次任务的路径、网络或输出条件提升为长期规则。聚焦验证 38/38 通过，当前进入 H3 待验证依赖传播 TDD。
H3 已修复 pending 传播：直接/传递依赖与共享文件动作都不能在上游未知时提升为通过，独立已通过动作保留，具体失败仍触发既有依赖/共享组回退；仅 help 或零行为 case 返回 not-applicable。聚焦验证 18/18 与 typecheck 通过，当前进入 H4 验证计划转换。
H4 已让 optimizer action 可提交可执行验证建议；框架只解析 action 声明的真实 task fixtures/workdir snapshot，物化相对路径输入，并从观察到的参考输出派生摘要检查。缺资源为 action-local unresolved，自检不算独立正确性依据；实际 JS 命令记录解析到的 Node 路径。精确套件 19/19 通过，当前进入 H5 loop 接线。
H5 已把上述组件接入 `runLogOnly`：真实程序在候选选轮前运行，报告位于 `round-1-validation/report.json`，history/result 携带摘要；具体失败保留 baseline，缺依据的候选只标 draft，源 trace 原任务不重跑。集成与 loop/CLI 套件 84/84 通过。
H6 在该正常路径上增加一次局部 repair：只把失败动作、相关文件和不可改评价依据传回既有 optimizer，修复后只重跑受影响检查并复用独立通过观察。修复仍失败、越界或调用失败时，依赖/共享文件组从 baseline 安全恢复，独立通过动作保留；原始与修复报告分别归档，完全回退恢复 no-change。精确套件 39/39、128 assertions 与 typecheck 通过，当前进入 H7 最终 snapshot 验证绑定和包/CLI 状态表达。
H7 将新包 manifest 升级为向后兼容的 v2：exporter 从最终 history 而非修复前 submission 读取动作，把选中轮的既有验证报告连同摘要归档进包并在 verify 时重验；无报告、部分通过或失败只标 draft，只有带独立案例且无缺口的 action-local passed 才标 validated-recommendation。旧 v1 包仍只读可核验。CLI 同时显示改动类型、适用输入/前置条件、残余职责和具体验证缺口，并明确局部程序检查不是整 skill 正确性。精确套件 41/41、127 assertions 与 typecheck 通过。
H8 已由普通 CLI 的第 8 次真实尝试生成 I18n nested-JSON checker；前 7 次和第 9 次的文档/no-change/基础设施结果均保留。修复通用 fixture 投影、locator、外部 criterion 绑定、依赖文档状态及 `ok=true` 消费判定后，原 trace 1/1、未回灌变化输入 4/4（含 3/3 故障检出）和同一普通 agent 事件的自然 read/exec/残余任务均通过。最终包为 v2 `validated-recommendation`；效果未配对，保持 unknown。一次宽搜索意外显示 i18n heldout 匹配行，未使用也未执行，但该 heldout 对本线程不再声称 pristine。机器报告为 `results/skill-ir/skill-optimization-production-closure-20260913/h8/report.json`，当前进入 H9 现成程序复用。

H9 精确读取 Law development `line:3` 的实际 scorer 后确认原任务为 `0.7/failed`，并记录外部 evaluator 与源 skill 的条标题规则冲突；未为追分改变源语义。一次普通 CLI 真实产生 `reuse-script` 动作，复用既有 converter 并把可选 PDF/DOCX 依赖延迟到对应 fallback。动作局部原输入通过，但首次包暴露验证生成的 Python cache 被误装入包；失败包保留，shared diff/export 现在排除运行缓存且仍拒绝包内额外文件，并统一 Windows 路径为 portable `/`。修订包在改名/变文/异 cwd 输入上独立检查 12/12 通过，普通 Pi agent 未获入口提示即 read/help/exec、复核产物并完成残余审计。机器报告为 `results/skill-ir/skill-optimization-production-closure-20260913/h9/report.json`；该证据不等于修复原 0.7 任务或证明成本收益。

H10 的五项预登记条件在修订核验器下 5/5 通过：空 JSON/无合同与可选判断缺失继续成功，必需输入和 DOCX 可选依赖缺失在指定层准确失败且零产物，纯本地 helper 的联网条件变化记为不适用。首次外部核验器错误读取摘要/目录的失败证据保留，两个包的闭包摘要始终不变。acquisition 的共享解析器经 TDD 修复 8 条已证实的整命令误分类：真实 tree 文件、JSON pointer、API route 与本机路径现在分开处理；六份历史报告及其余 issue 不回写、不重分类。机器报告为 `results/skill-ir/skill-optimization-production-closure-20260913/h10/report.json`。

H11 已将普通常用途径的可复制命令、参数和简洁结果/残余步骤交接写入生产 optimizer 提示，并以 gzip/raw 双摘要接入 general-skill 自然消费报告。Law 的同任务/模型/Pi 配对质量均通过，预登记 discovery `2→1`、tool calls `11→9`、observed tokens `47487→30339`；包枚举仍为 `1→1`，时延只是一组噪声观察，实际 USD unknown，候选仍是 draft。H12 随后用 Env 不同结构进行同入口单次尝试，得到有依据的 no-change，未制造程序或收益。R1 的自动捕获与资源隔离聚焦回归 23/23、106 assertions 与 typecheck 通过；当前进入 R2 自然任务与自动交接。

R2 新增普通 `run --prompt ... --optimize` 路径；optimizer model 默认复用 source model，输出默认位于唯一 session。digest-bound 冻结 manifest 防止 session 状态更新造成 optimizer 输入摘要漂移；adapter 独立核对全部必需 capture，并只把脱敏相关证据送入 optimizer。completed/no-change、proposal-only recovery、provider failure 与 capture failure 分开保存；优化失败不删除源结果，非 bare-agent capture 在副作用前拒绝。关联回归 73/73、310 assertions 与 typecheck 通过，当前进入 R3 无人工评分协议的语义验证修复。

R3 新增候选输出断言层：绑定 task 中 contained file-check 会在候选案例后重新执行，原 source 的 `.skvm-validation.json` 可提供不可由候选改写的 source-derived 文件检查。报告分列 reference digest、reference authority、执行断言和 self-check；无评分原输出仅为 fidelity reference。V1 的 empty/wrong-file/printed-ok 全部检出，V4 的 ready/missing 案例局部运行且缺失动作保持未评估；JSON schema 键序等价而类型/const 不等价。规定回归 21/21、124 assertions，当前进入 R4 V3/V5。

R4 从 H8 保留记录定位到共享摩擦：workspace 没有把源码入口、规范化输入、观察格式、参数、输出和检查组织成单一模型接口，且早期提示使有界参数程序看起来必须替代整个 skill。新增 `IMPLEMENTATION_CONTEXT.json` 与动作兑现检查；合理 no-change 保持不变。修复复用现按真实 diff、静态候选依赖与 evidence binding 决定，入口/参数/task/assertion/shared-resource 变化均会重验。V5 的 3 个支持 + 3 个不适用合成案例验证输入和参数真正影响输出，不适用在写入前拒绝，未知继续交 agent；部分写入反例检出。核心 56/56、修复传播 4/4、prompt 24/24、相关回归 79/79 与 typecheck 通过，当前进入 R5 V6 与默认包可用性。

R5 将 package exporter 支为 staging-build/verify + 单次 rename 发布；中途注入失败后目标不存在且 staging 清理，非空用户目标不动。每个新包附 `OPTIMIZATION-USAGE.md`，普通 CLI 展示使用命令、优化步骤、参数/输入、残余职责、draft/validated 状态与原任务结果。五类程序失败得到面向动作的修复建议。`--resume-optimization` 只允许安全恢复已知 package 失败，测试证明 0 次 source/optimizer 重放；完成未知的 optimizer/package 状态仍拒绝。相关回归 64/64、253 assertions、typecheck 与文档检查通过，当前进入 R6 两种结构的自动捕获→优化→包消费。

R6 两种结构都通过普通 `run` 自动捕获实际 source run 并交给既有 optimizer；最终新尝试没有安全的新改动，均准确返回 no-change。按任务书允许复用 H8/H9 程序内容后，I18n 原输入与含新组件/3-key/count interpolation 的变化输入均由系统 evaluator 5/5，generated checker 对两套 locale 参数均 exit 0；Law 两份无评分自然输入都真实调用 bundled converter，source-owned Stage3 各 8/8。agent 只在 I18n 原输入自然调用 checker、Law 在修复前 tool 描述下多次适配 Windows 命令，这些限制未隐去。共享实现已修复 Windows 长路径、observed output capture、local evaluation/资源隔离、带锚点 executable ref 与 native command shell。机器入口为 `results/skill-ir/skill-optimization-production-closure-20260913/r6/report.json`；当前进入 R7，不重抽 R6 样本。

R7 从普通项目目录实际运行自然任务入口，未提供 task.json、日志、locator、criteria、validation plan 或 package-out。原 Law 转换和 Stage3 通过；系统自动形成完整 capture、唯一 proposal 和最终 draft 包。过程中修复 Windows 无 HOME 时用户 cache 误落 cwd，以及已核验优化包无法再次导出的框架元数据冲突；首次 package 失败通过同一 session 的公开恢复命令完成，source 和 optimizer 没有重放。该 proposal 没有程序 actions，behavior 为 not-run，不能计新行为成功。自动 capture 当前只有 bare-agent 经真实验证，其他 adapter 保持 unverified；usage cost 仍 unknown/null。机器入口为 `results/skill-ir/skill-optimization-production-closure-20260913/r7/report.json`。

H13 将该最终包一次复制到全新系统临时目录，复制处的生产闭包核验和从新 cwd 的 `python -B` TXT 直接消费均通过；Stage3 A/B/overall PASS，源文件与包摘要运行前后一致，包内无研究根路径。首个复制因帮助检查生成的两个未跟踪 `__pycache__` 被正确拒绝并保留记录；缓存移到系统临时隔离位置，没有改 R7 提交。机器入口为 `results/skill-ir/skill-optimization-production-closure-20260913/h13/report.json`；随后执行 H14。

H14 首次合并回归为 343 pass/4 fail；失败原样保留。嵌套 workdir snapshot 的递归 reader 现在兼容 Bun/Node parent 属性并把 key 统一为 `/`；两项 Windows 路径测试改为比较解析后路径，并发测试不再假定 train/test 入池次序。针对性 18/18、修复后合并 347/347、typecheck、12/12 文档测试和 8,882 文件治理扫描通过。总报告为 `results/skill-ir/skill-optimization-production-closure-20260913/final-report.json`。下一步仅复核；若需要未见输入，另开预登记 identity，不由本轮自动执行。

任务摘要见[当前计划](skill-ir-aot-optimization-plan.md)。G0–G14 历史结果继续保留在
`results/skill-ir/general-skill-optimization-20260913/final-report.json` 与同目录 `g14-verification.json`；旧结果不回写。

## 4. 直接运行

真实日志优化：

```powershell
skvm jit-optimize `
  --skill=path/to/skill-dir `
  --task-source=log `
  --logs=path/to/log1.jsonl,path/to/log2.jsonl `
  --log-records=line:3+line:7,lines:1-4 `
  --failures=path/to/log1-failure.json,path/to/log2-failure.json `
  --optimizer-model=<id> `
  --target-model=<id> `
  --package-out=path/to/new-empty-optimized-skill
```

审阅与落地 proposal：

```powershell
skvm proposals list
skvm proposals show <id>
skvm proposals accept <id>
```

构造、核验并使用新的局部固化包：

```powershell
bun scripts/skill-ir/trace-guided-api-tester-package.ts build `
  --proposal <jit-proposal-directory> `
  --out-dir <new-empty-package-directory>
bun scripts/skill-ir/trace-guided-api-tester-package.ts verify `
  --package <package-directory>
bun <package-directory>/scripts/api-task-solidify.js `
  --binding <binding.json> `
  --workdir <task-workdir> `
  --out-dir <new-empty-output-directory> `
  --node node
```

真实 agent 消费与成对效果分析：

```powershell
bun scripts/skill-ir/trace-guided-api-tester-agent-run.ts `
  --skill-dir <skill-or-package-directory> `
  --binding <binding.json> `
  --input <openapi-file> `
  --run-dir <new-empty-run-directory> `
  --evidence-dir <new-empty-evidence-directory> `
  --model <provider/model> `
  --condition <identity> `
  --require-helper true
bun scripts/skill-ir/trace-guided-effect-analysis.ts `
  --pairs <pair-manifest.json> `
  --out <new-effect-report.json>
```

开发前检查：

```powershell
bun run typecheck
python scripts/check_skill_ir_doc_links.py
```

## 5. 当前限制

- U0–U7 和 G0–G14 均为 development；本状态完成不改变 prospective/readiness。
- 模型 proposal 不自动获得正确性；必须由明确 checker 或人工接受边界约束。
- 固化只能覆盖证据支持的稳定部分，未自动化职责必须随新 skill 包保留。
- Law 首次真实 proposal 为 no-change；Experimental 的变化输入质量不稳定；Env 的包只通过闭包。这些结果不能为凑成功数改写。四份 skill 不是随机总体样本。
- I18n 的单组当前运行时配对同时含下降和上升指标，provider USD 定价未知，不声称整体成本、速度或人工节省。
- development 结果不能外推到 held-out、跨模型、任意 skill 或人工节省。
- 被校验器按摘要绑定的版本化材料不得重写、移动或删除。

## 6. 证据与历史

- 当前主张到最窄结果路径：[evidence-index.md](evidence-index.md)
- 历史阶段与删除路径恢复：[history.md](history.md)
- 机器结果：`results/skill-ir/`
- 完整变更过程：Git 历史

## 7. 文档职责

- 方法与边界：[spec](skill-ir-aot-optimization-spec.md)
- 当前任务：[plan](skill-ir-aot-optimization-plan.md)
- 开发和测试：[developer guide](developer-guide.md)
- 组件接口：[IR](ir-core.md)、[优化与产物](optimization-and-artifacts.md)、[评价](evaluation-system.md)、
  [API 引擎](api-task-engine.md)、[分类与路由](classification-and-routing.md)
