# Skill IR 当前状态

- 更新日期：2026-09-14
- 工作分支：`skill-ir-aot`
- 当前路线：H0–H14 + R1–R7，“正常运行一次 → 自动采集 trace → 程序实施与验证 → 新 skill 包 → 自然消费”
- 执行状态：`active-R5`（H0–H12、R1–R4 已完成；G0–G14 历史整体效果仍为 mixed）

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

## 3. 当前计划

本轮继续共享实现，依据[生产链持续任务书](../superpowers/plans/2026-09-13-skill-optimization-production-closure.md) revision 3、spec 14.31：

当前 machine status 已进入 R5。R1 的唯一 run/capture/输入隔离保持；R2 已把互斥 `--prompt`/`--task` 与 `--optimize` 接入普通 run。R3 修复 V1/V4：候选必须重新执行当前 task 或原 source 的文件断言，旧 pass、exit 0、输出存在和未评分 observed bytes 均不能单独提升级别；可执行与缺失案例局部调度，缺口不从分母删除。R4 修复 V3/V5：生成上下文自动组织入口、输入格式、参数与检查；修复后按真实文件/evidence binding 失效旧观察；selected 明确仅为找到入口，并附实际测试范围、不适用写入前拒绝与 agent 残余职责。V6 继续由 R5 处理；H8/H9 的独立变化检查不因此被抹除。

运行中追加决定：H0–H12 与 R1–R4 成果保留，当前继续 R5–R7，再进入 H13/适用 Y/H14。默认入口已经能接收 skill、自然任务、目录与模型，并自动捕获/关联 trace、调用现有优化器及导出；无需用户提供 logs、locator 或评分文件。普通无评分输入可复用原 skill 的 `.skvm-validation.json` 有界文件规则，未知/专业部分仍由 agent 承担。尚未完成的是半成品隔离、默认可用性和两结构真实消费，因此仍不能关闭总目标。

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
