# API 合同任务：先可用、再测复用效果的执行任务书

> **For agentic workers:** 使用 `superpowers:executing-plans` 逐项执行；代码修改遵循 TDD。主代理负责设计、实现与最终验证；子代理只用于必要的独立只读定位。常规检查点不等待用户确认。

**Goal:** 在已有 OpenAPI 离线任务引擎上修复真实缺口，交付别人能直接使用的请求与 pytest 包，并测量同一产物复用的实际成本。

**Architecture:** 复用 TaskContract → 共享构造 → 独立 checker → request-json/pytest 消费链。旧版本保持兼容，当前开发接口允许增加能力；研究冻结、历史归档修复和未知样本迁移不在工程交付的前置依赖中。

**Tech Stack:** TypeScript、Bun、现有 OpenAPI 3.0.x/schema/form checker、Python pytest/httpx、本地 fixture。

**状态：** `planned-not-started`，2026-09-13。本任务书的登记不代表代码已实现或持续目标已启动。

## 本轮复核与取舍

复核基线是 `skill-ir-aot@8cbc2b77119e9fc6141f0097c92c27bb1327a02d`，本地与 origin tracking ref 为 0/0。读取了 [最终报告](../../../results/skill-ir/skill-family-current-v2-source-repair-001/final-report.json)、[交付说明](../../skill-ir/skill-family-current-v2-final-delivery.md)、N10 原始任务结果与 revision，并检查普通 CLI、任务组装、form 和负例代码。新鲜聚焦回归为 13 tests / 117 assertions / 0 failures；第一次测试调用缺少 `./` 路径前缀，Bun 未匹配文件，纠正命令后通过。没有重跑历史 N14/N15 或全量归档审计。

已有成果是真实的：普通 `artifact task` 入口不依赖研究 identity；9/9 包检查通过，4/9 任务完成，native 4 executed/pass、5 skipped。但包能正确记录 unresolved 不等于任务完成。18 项必要义务仍有 10 项 unresolved。

| 现有未完成任务 | 主要原因 | 本轮处理 |
| --- | --- | --- |
| `n10-visier-auth-event4u` | 空 form witness 被拒；form constraint-negative 无可用装配路径 | U1 优先修空 form，U2 补可保真负例 |
| `n10-visier-auth-lambda-rich` | valid-full/required-omission 已有结果，constraint-negative 仍走 JSON-only 路径 | U2 修共享装配，不按任务名特判 |
| `n10-partnership-lambda-rich` | 缺少认证上下文，已有结构产物不能满足认证执行要求 | U3 展示现有结构产物及所缺条件；认证模板为可选扩展 |
| `n10-zapier-actions-event4u` | 认证上下文及 parameter negative 未支持 | 优先解释可用范围；不承诺本轮完整解决 |
| `n10-zapier-embed-fishzjp-pytest` | 广义 fuzzing 映射 unresolved，且 negative 不是现有 pytest runtime row | U2 只做定义明确的负例消费；不擅自解释旧 fuzzing 需求 |

N10 revision 明确 `implementationChanges=[]`。非空 form v1 是兼容性边界，不是“新实现不得支持空 form”的理由。本轮可以增加显式开发选项或必要的新版本，旧默认和旧证据不变。不要为每个功能复制整个引擎、建新的候选锁或再写一套严格总验证器。

另两点：Bangumi 新 development closure 已解析 32 个外部引用，尚未证明在线 API 正确性；N13 外部工具对照受 harness/判据问题影响，不能用来声称优于 Schemathesis。两者均不阻断本轮。

## 对“一类 skill”的实际交付定义

本轮服务的类是 **结构化 API 合同驱动的离线请求与测试产物构造职责**，具体 profile 为 OpenAPI 3.0.x。输入是合同、明确的操作/需求、必要的依赖和观测；输出是请求包或可消费的 pytest 包。不同 skill 可通过已有声明映射调用同一实现，也允许用户直接写 TaskContract。

本轮用至少两个已暴露 skill 职责映射、两个 provider 的适用任务检查共享路径；映射差异可以改变需求和输出，不得增加按仓库/skill 名称决定成功的代码。provider、skill 来源、API 文件、操作和任务分开计数。这证明当前类内职责复用，不证明整个 skill、自动理解任意自然语言或所有未来成员泛化。

**最低可用验收：**

1. 源码检出安装好依赖后，用户可复制随仓库交付的完整例子，在研究目录之外生成并检查 request-json；无需手工补产物文件或研究元数据。
2. 另一个完整例子能实际执行 pytest，至少一个 case executed/pass；不是全部 skip。明确使用本地 fixture，不冒充真实业务 API 验证。
3. 覆盖至少两个 provider 的真实合同任务，输出可读的完成项、未完成项和下一步原因；原有四个完整任务在同口径下无回退。
4. U1/U2 的目标是至少修复一个已知 unresolved 必要义务，并给出原九任务的 before/after；不承诺 9/9。若没有增加，`improved=false`，不能拿新增容易例子充当旧任务修复。
5. 运行 token、调用和耗时可被读懂；没有可靠对照时，只报告实测值，不强求节省比例。**性能提升或付费模型对照不是“工具可用”的前置条件。**

交付只回答 `usable`、`improved` 和剩余问题，不新增七八个 readiness 维度。所有任务写了报告，不等于软件达到上述可用标准。

## 连续执行、范围和时间

- 直接在 `skill-ir-aot` 工作并提交推送 `origin/skill-ir-aot`；不新开分支、不推 upstream。旧结果、Q1/held-out、历史未跟踪材料保持原样。
- 预计有效工程工作约 5–8 小时，实际以修复结果为准；不等待、重复测试或扩写报告凑时长。2026-09-13 22:00 后不再开新特性，优先完成已开始的必要修复和 U5；若启动时已过该时间，缩为 U1 的明确修复、U3 可用例子与 U5。
- 认证 GitHub CLI、联网、远端 API 和有用途的付费调用已经授权，无用户设置的金额上限；记录实际用量和未知计费。默认不需要新的 skill 搜索或外部业务调用，不能用花钱代替工程工作。密钥不得写入报告或包。
- 每个实际缺口先做一个失败测试，再实现、跑相关测试。一个问题 90 分钟仍无可检验进展时，记录准确原因，继续独立任务；不是“失败一次整个队列停止”，也不静默缩减必需需求。
- 复用现有 checker；没有命名的实质风险，不添加审批、重复摘要核验、write-once 流程或 clean worktree。保存有诊断意义的失败和修订，不为一次命令拼写错误建立独立研究 identity。
- 本任务书不运行新 prospective、不找 clean-002、不继续 Meilisearch 上游修复、不做 HTML、不做 npm 发布。已有普通源码入口优先；最终说明依赖和安装方式，不冒充已发布产品。
- 主队列做完即交付。尚有时间且 U0–U5 已达标时，只处理真实使用中发现的小缺陷或文档冗余；不自动开启下一研究计划。

## U0 — 建立一个可比较的工程基线（约 20 分钟）

**读取：** 旧结果目录 `results/skill-ir/skill-family-current-v2-source-repair-001/development/` 中 `input-lock.json`、`first-run.json`、`task-contracts/`、`revision-001.json`；`src/skill-ir/api-task-run.ts`、`src/cli/api-task.ts`。

**本轮新增位置：** `results/skill-ir/api-task-usable-delivery-20260913/`，只需 baseline、after、cost 和短 summary，不建立冻结系统。必要时新增一个普通开发脚本 `scripts/skill-ir/api-task-usable-delivery.ts`，直接调用现有接口，不解析旧脚本的成功数作为运行逻辑。

- [ ] 核对分支、工作树和旧九任务的来源，记录每项 taskComplete、必要义务、package check、native executed/pass/skip；保存从旧报告提取的 baseline，不重跑旧 identity。
- [ ] 对照源码确认失败归因；任务 ID 如 `out-of-range` 不是机器语义。现有 requirement `kind=constraint-negative` 没有具体负例类别字段，不能从任意 ID 猜用户想测什么。
- [ ] 后续调用普通入口，把新产物写到本轮目录，原 task/source 不改。确需新字段的任务另存并记录差异，不能混进原九任务的同口径提升数。

## U1 — 让合法空 form 真正可构造（约 60–90 分钟，最高优先级）

**修改范围：** `src/skill-ir/api-form-wire.ts`、`api-form-wire-checker.ts`、调用 form 的共享装配模块和 `api-task-artifact.ts`；测试 `api-form-wire.test.ts`、`api-task-artifact.test.ts`。组件说明沿用 `docs/skill-ir/skill-family-current-v2-source-repair.md`。

- [ ] 从 Visier 原始 schema 确认 `{}` 是否满足 required/minProperties 等约束。只放开合法的空对象，不把缺必需字段误判为正例。
- [ ] 为显式当前开发选项增加失败测试。建议兼容接口如下；若存在更合适的既有 profile 参数，复用该参数并在实施时同步文档：

```ts
test("current form mode permits an empty encoded object without changing legacy default", () => {
  expect(() => encodeApiFormBody({})).toThrow();
  expect(encodeApiFormBody({}, { allowEmpty: true })).toBe("");
  expect(verifyApiFormBodyWire({}, "", { allowEmpty: true })).toBe(true);
  expect(verifyApiFormBodyWire({}, "x=1", { allowEmpty: true })).toBe(false);
});
```

- [ ] 扩展编码器与独立解码核验器的可选配置，旧调用默认不变；现有非字符串、重复字段、损坏转义和资源上限仍拒绝。当前 TaskContract 后端显式选择新能力，版本/支持说明反映真实行为。
- [ ] 复用当前包 checker 验证新空 form 的内容类型、wire 和源约束。用原 Visier 任务验证至少一个实际义务的变化，不只增加合成测试。

运行：`bun test ./src/skill-ir/api-form-wire.test.ts ./src/skill-ir/api-task-artifact.test.ts`。预期新行为测试先因接口/空值拒绝失败，实现后新旧测试通过。提交一个明确的 form 修复，不运行历史整仓摘要测试。

## U2 — 补齐能保真执行的负例（约 2–3 小时）

**修改范围：** `src/skill-ir/api-request-body-negatives.ts`、其 checker/测试、`api-task-artifact.ts`、`api-task-artifact-checker.ts`；原生接线涉及 `api-pytest-suite.ts`、`api-pytest-suite-checker.ts`、`api-pytest-runtime.py` 及现有测试。只在实际需要时扩展当前开发输出版本。

- [ ] 列出原 Visier 任务实际 schema 中可构造的负例。区分“缺装配器”“wire 无法表达该违反”“源根本没声明此约束”；保留完整分母。现有 generic constraint-negative 的含义不靠 ID 更改。
- [ ] 复用 form 正例作为非目标字段的合法基线，把 schema 能证明无效且编码能保真表达的字符串枚举、长度、pattern 或必需项违反接到 form 路径。先写测试：负例违反目标约束，其他必需字段合法，独立 decode 后仍违反同一约束。
- [ ] JSON 类型错误不能靠转成字符串假装仍是同一负例。无可表达 wire 时保留具体原因；若真有用户需要精确选择负例类别，才增加结构化选择字段并给新合同版本，不为提高原九任务分数改解释。
- [ ] 为至少一个定义明确的 JSON 负例接通 pytest row：独立 fixture 给定响应 oracle，实际发送请求、检查返回和请求语义。先证明当前 negative row 缺失/不执行的测试失败，再实现共享转换。不得将所有负例的期待状态硬编码成 400，也不把 Fishzjp 的广义 fuzzing 自动映射成这一小类。
- [ ] 加一个有意义的消费失败测试：fixture 返回违背既定 oracle 的结果时，pytest 确实 fail。JSON 空白、对象键序不应被当成业务错误；只有明确测试 wire 编码时才按相应编码语义判定。
- [ ] 每个局部修复通过相关测试后继续下一项；当前修复影响的原任务先验证，最终九任务汇总留到 U5，不每次重跑全套。

运行受影响测试，例如：`bun test ./src/skill-ir/api-request-body-negatives.test.ts ./src/skill-ir/api-task-artifact.test.ts ./src/skill-ir/api-pytest-suite.test.ts ./src/skill-ir/api-pytest-runtime.test.ts`。若 form 负例确实不可表达，仍推进已明确的 JSON 负例消费，不重新开大规模语料搜索。

## U3 — 交付无需研究背景的使用例子（约 60–90 分钟）

**新增：** `examples/api-task/` 下完整的合同、task、fixture/oracle 和最短说明。**修改：** `src/cli/api-task.ts`/测试、现有组件说明；必要时改 `src/skill-ir/api-task-run.ts`/测试。

- [ ] 复用已支持的普通命令，为 JSON 请求、form 请求和 native pytest 提供随仓库可运行例子。前两类尽量选已暴露、可再分发的真实合同；注明原始来源与许可证，不用巨大 research report 作为运行依赖。本地原生 fixture 明确标为合成。
- [ ] 例子交付时填入实际存在的相对路径。基础调用形态不变：

```powershell
bun ./bin/skvm.js artifact task --task=./examples/api-task/json/task.json --out=./api-task-json-output
bun ./bin/skvm.js artifact task --task=./examples/api-task/form/task.json --out=./api-task-form-output
bun ./bin/skvm.js artifact task --task=./examples/api-task/native/task.json --out=./api-task-native-output
```

- [ ] 输出目录默认必须不存在；说明重复使用时选择新目录，不自动删除用户产物。用户看到构造数、已检查义务、taskComplete、executed/pass/skip 和具体剩余原因；保持现有机器 JSON 输出兼容。
- [ ] 明确区分 `offline-validation` 的生成/检查与 `loopback` 的实际执行；缺 oracle 的运行不能声称测试通过。随例子提供完整依赖安装和原生产物消费命令，避免用户手工找 Python 环境或拼 row ID。
- [ ] 以两个既有 skill 映射和两个 provider 的适用任务验证同一入口；正确性修复无需先找第二个成员才允许做。
- [ ] 认证缺失的当前包给出所缺位置与可用结构信息。只有主线已可用且不超过 45 分钟时，追加明确的 request-template/auth-slot 输出；不把占位凭据算成认证成功或抬高旧 taskComplete。

运行：`bun test ./src/cli/api-task.test.ts ./src/skill-ir/api-task-run.test.ts`，并从一个普通临时目录消费完整例子。复用现有 arbitrary-directory 测试，不另建多层可移植证明系统。

## U4 — 测“生成一次、复用多次”的真实收益（约 30–60 分钟）

**位置：** 本轮结果目录 `cost.json`；直接调用现有生成/检查/原生消费 API。优先测量，不先改缓存架构。

- [ ] 选三个已能完成、质量已核验的任务。测一次生成及 5 次直接检查/消费已有包，与同任务 5 次重新构造比较。记录每次耗时、文件规模、project model/API calls，冷启动/热运行分开；不要把 `--binding` 重建当成直接复用。
- [ ] 若直接消费必须经过内部 API，先给用户一个薄命令或完整脚本，复用 checker 和 native consumer；不重新实现编译。若现有命令已经满足，直接文档化。
- [ ] 只在两侧任务和成功标准相同时计算时间节省；5 次观测是工程示例，不是统计显著性证明。无提升就报告无提升。零 runtime model token 是属性，不等于已经测得相对模型节省 100%。
- [ ] 可选付费对照最多占本任务 30 分钟：三个同需求任务，每个一次生成、最多一次依据 checker 的修复，记录全部输出/token/失败/未知账单。模型侧和确定性侧用相同可消费产物要求与 checker；质量不等价时不计算节省率。服务不可用即跳过，不阻断交付。
- [ ] 一次性 mapping/import、构造、复用成本分别记录；开发代理 token 与项目 token 分列，未计量写 unknown。没有人工计时就不宣称人工节省。

## U5 — 一次验收与交付（约 30–45 分钟）

- [ ] 用当前普通入口运行旧九任务到新目录；保留源、必需项和分母，给逐任务 before/after。新任务/模板另表报告，不覆盖旧首跑或把 unresolved 改成 optional。
- [ ] 记录两类以上普通例子的实际命令与输出、两个 provider 和两个映射的共享路径、至少一次原生 executed/pass、剩余失败原因。根据实际验收写 `usable`、`improved`，不由阶段计数推导成功。
- [ ] 跑一次受影响模块的合并测试、`bun run typecheck`、`python -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py` 及新增/修改文档链接检查。已有结果足够时不再重复 equivalent 检查；仅依赖/打包实际变化且有风险时做一次针对性的干净检出验证。
- [ ] 更新现有组件说明、状态页、spec/plan 当前摘要和本地交接；总说明控制在两页左右。不要新建审计报告、审计的验证器、摘要自绑定循环或长历史流水账。
- [ ] 显式暂存本轮代码/例子/结果/文档，检查 diff，提交并推送 `origin/skill-ir-aot`。核对一次对齐后交付，不为记录最后一个文档提交反复重建归档。

**最终回答必须能回答：** 用户现在执行什么命令、能得到什么、哪个旧缺口被修复、还有哪些不能做、复用成本测到了什么。没有满足最低可用标准时，直接点明欠缺的使用步骤与实现问题；不要再以“所有阶段已终结”代替软件完成。

## 可直接设置的持续目标

执行本任务书 U0–U5，直接在 skill-ir-aot 开发。优先修复合法空 form、补可保真负例与实际原生消费、交付普通用户能运行的完整例子，然后测复用成本。保持旧证据与旧版本默认兼容，允许当前开发接口增加能力；不以 prospective、历史 source/archive 问题或额外研究冻结阻断工程交付。常规检查点持续推进，按任务书处理局部失败和时间，到期交付当前真实可用成果并提交推送 origin/skill-ir-aot。不得通过改分母、全部 skip 或认证占位制造成功，也不得用重复审计、等待和无关工作凑时长。
