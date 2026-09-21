# 授权任务 DSL：条件表达、普通编写、默认迁移与实际价值任务书

> **执行方式：** 使用 `superpowers:executing-plans` 连续执行 Y0–Y14，代码按 `superpowers:test-driven-development` 做有意义的失败测试与修复。用户已授权写完任务书后直接派发并执行，常规检查点无需再次确认。沿用当前主开发分支，不创建 worktree 或新分支；主执行代理负责设计、代码与最终验证，只读探查按 AGENTS 规则委派。

**Goal:** 让这一类授权任务用同一套领域声明表达、通过现有 SkVM 入口运行，并用默认 profile 的新项目迁移和公平对照回答它是否减少遗漏、改善判断或降低使用/运行负担。

**Architecture:** 复用当前 declaration、source reader、host、wire、引用绑定、telemetry 和 evaluator。补充有界条件结果表达、派生式编写入口和薄 CLI；研究面板比较普通说明、默认 ledger、带条件层的声明三种配置。程序检查结构一致性，源码语义留给模型和独立评价。

**Tech Stack:** TypeScript、Bun、Zod、现有 SkVM provider 与 CLI。机器结果写一处，研究与问题复盘持续追加研究总文档，不新增 HTML、通用工作流引擎或整套产品 CLI。

- 日期：2026-09-22；状态：`in-progress`。Y0–Y1 已完成，机器状态位于本任务书指定的新结果根；当前进入 Y2。
- 代码基线：`abe470f2a887f35ca1d6782cfbd5343965856620`；接手时读取本任务书登记提交后的最新 HEAD。
- 分支：`skill-ir-aot`；只提交归属文件并推送用户 `origin/skill-ir-aot`。
- 设计：[研究总文档 §7.22](../../skill-ir/skill-dsl-research.md#722-y-条件表达默认迁移与价值验证)；持续合同：spec 14.34。
- 新结果根：`results/skill-ir/skill-dsl-research/development/authorization-transfer-value-v1/`。
- 开发代理：`gpt-5.6-sol`、reasoning `max`。被测模型单独配置，不能由开发模型设置自动改变。

## 一、方向与本轮需要解决的问题

分类继续服务于任务范围：有证据的源码安全评估 → 授权/信任边界 → 单 repo/ref、显式源码、显式政策与义务。DSL 可以由 AI 辅助起草，经人设计；效果涵盖判断质量、解释完整性、维护/使用负担和运行开销。当前 JSON 是领域语言的承载格式，语法新颖性不是目标。

X 的工程和实验已完成：五任务、两项目、23 初轮运行为 14 full/5 partial/4 incorrect；四项标签合同复测 4/4 full。B/D 共用声明和 helper，因此 D 的负向增量不否定共同结构，但共同结构收益仍待比较。真实面板使用 task-specific requirements，默认六类 profile 的真实迁移证据不足。本轮同时交付方法补强、普通使用和新项目检验，不把旧 header 满分设为后续工作的前提。

本轮复核已定位四项工作：
1. `local-run.ts` CLI 默认 B，但 `checkLocalAuthorizationInput` 和 `executeLocalAuthorizationRun` 的省略参数仍为 D；示例 README 也残留 D。
2. `structured.ts` 的 prompt-parse 是 schema-tool 失败后重新请求模型的 transport fallback，非纯离线格式转换。费用已计入；旧研究叙述须纠正，历史事件不重写。
3. 条件目前多为 `name/basis` 文字，coverage 回应全部问题仍可能漏条件结果；需要可复用的条件分支表达。
4. sourceIdentity 只做声明一致与字节绑定；用户编写重复身份字段、源码路径和领域对象的负担应减少。

## 二、阅读顺序与工作现场

依次阅读：
1. `D:/skill优化/AGENTS.md`、适用的仓内 AGENTS；`docs/skill-ir/current-status.md`；本任务书全文。
2. `docs/skill-ir/skill-dsl-research.md` §1–4、§7.21–7.22；`skill-ir-aot-optimization-spec.md` §14.34；当前执行计划。设计正文由主代理亲自阅读。
3. `src/task-dsl/authorization/{schema,semantics,relations,relation-result,render,transport}.ts`；`src/benchmarks/authorization-dsl/{local-input,local-run,host,telemetry,evaluate,capability-run,capability-evaluate}.ts` 及对应测试，按任务依赖阅读。
4. X 的 `evaluation-summary-v2.json`（`runs/x9-initial-v1/`）、`usage-verification-v1.json`、一个错误标签单元、一个 trusted-header partial 和 X11 修订记录。来源依据按需读研究索引；不复审全部历史。

基线七项修改：`src/jit-optimize/evidence-criteria.ts`、`evidence.ts`、`loop.ts`、`validation-completion.ts`、`validation-lifecycle.ts`、`workspace.ts`，以及 `src/skill-ir/skill-family-minimum-delivery-run.ts`。逐文件保留接手时差异。禁止 reset、clean 或把这些修改顺带提交。发现同一归属文件出现其他任务新改动时先比较最新字节再合并。

## 三、方法设计与接口约束

### 3.1 条件结果层

条件层回答：哪些条件决定某个受保护操作能否到达；条件相反或未知时，结果怎样变化。沿用已有 condition 的名称和依据，不把案例的正确答案预填到输入。

输入的可选 condition-analysis request 声明需要分析的条件 ID 和义务 ID；不提供分支正确结论。模型返回有界分支及依据。起始类型如下，Y2 结合现有 strict schema 定稿并同步文档：

```ts
type ConditionValue = "true" | "false" | "unknown";
interface ConditionAnalysisRequest {
  obligationId: string; // authored ID；编译映射到 explicit expanded obligation
  conditionIds: string[];
  maxBranches: number; // 1..12，默认 8，限制输出规模而非通过门槛
}
interface ConditionalOutcome {
  id: string;
  obligationId: string; // expanded ID
  assumptions: Array<{ conditionId: string; value: ConditionValue }>;
  effect: "reachable" | "blocked" | "unknown";
  explanation: string;
  factPointers: string[];
  missingFacts: string[];
}
interface ConditionAnalysisResult {
  obligationId: string;
  branches: ConditionalOutcome[];
  unexaminedConditionIds: string[];
  completeness: "bounded" | "incomplete";
  limitations: string[];
}
```

条件名需要稳定 ID 时在新版本显式增加，不按数组序号猜测身份。重复名字、同一分支相反赋值、越义务指针、未知条件、重复分支和无理由 unknown 返回定位诊断。分支条件是分析假设，不能包装成实际部署事实；互相不同的结果必须明确区分假设。声明数量超界时报告未分析部分，不生成指数级真值表。所有内容仍由同一模型请求产生，无额外默认语义 reviewer。

“结构完整”“按所列条件有界分析”“语义正确”分开输出。宿主只能核对引用、ID、赋值一致性和显式遗漏；不从 fact pointer 推导可达性，不宣称完整枚举实际程序。无条件的普通任务仍能运行，分支层可省略。旧 task/wire/result 版本继续严格解析；新增字段通过显式版本或 sidecar 接线，禁止旧 strict schema 静默吞字段。

**Y2 定稿。** 保持严格 task v0 不变，以可选 `authorization-condition-analysis-request/v1` sidecar 增加稳定身份。每个 authored obligation request 用 `conditionBindings: [{id, name}]` 把显式 ID 绑定到该义务内唯一的既有 condition 名；不以数组位置推导 ID，也不重复 basis 或预填结果。编译后只展开到该 authored obligation 的 runnable expanded obligations。结果为 `authorization-condition-analysis-result/v1` sidecar；启用时计划由显式 wire/v3 承载，未启用仍走既有 v1/v2。`bounded` 只表示所有请求条件至少在一项假设中被考虑，不表示指数真值表或完整程序路径；遗漏须进入 `unexaminedConditionIds` 并标 `incomplete`。公共例子与 evaluator-only 判例物理分开保存在 Y 结果根。

### 3.2 用户编写与普通入口

新增 opt-in `skvm authorization init/check/run/inspect`，复用现有 CLI 和授权宿主。`init --out=./assessment.json` 写一个明确标为 synthetic 的完整可编辑示例；存在目标文件时不覆盖。支持 `--from=<authoring.json>` 确定性规范化已给出的领域声明，派生 sourceIdentity 和默认 requirements，集中输出缺项；不凭模板替用户决定政策事实。

建议 authoring/v1 只包含 task、sourceRoot、sources 及可选 profile/condition request。sourceIdentity 从 task 派生；规范化产物独立保存，原作者输入保留。政策、expectation、源码范围必须由作者提供，缺失返回 `needs-input` 而不是默认 allow/deny。普通命令均复用相同规范化函数。

init/check/inspect 不初始化 provider；run 显式使用 `--model`。没有 arm 统一 B。新增 `--method=plain|ledger|conditions`（默认 ledger）选择公共能力组合，对应研究 P/L/C；method 与旧 renderArm 是独立配置，三臂统一 B，plain 由共享事实生成自然说明并关闭额外 ledger，不能只把 N 重命名成 P。conditions 为显式选项，效果比较完成前不升级默认。sourceRoot 的当前封闭约束保留，用项目根下的 assessment 例子解决普通路径；不为省路径修改取消 symlink/junction 检查。显示 sourceRef 是 authored 还是已由源码获取记录验证，普通输入只绑定字节时写 authored，不暗称远端核验。

### 3.3 P/L/C 比较的含义

本轮 `studyArm=P|L|C` 与历史 `renderArm=N|B|D` 分开，历史 runner/config 不改写：

| 配置 | 模型可见内容与支持 | 用途 |
|---|---|---|
| P | 同一任务事实、政策、源码、公开分析要求的清楚自然说明；基础结果/引用合同；不额外生成领域 ledger | 普通说明基线 |
| L | 同事实 + 默认六类 profile 的编译 ledger/coverage；使用 B 组织 | 检验共同声明/helper 组合 |
| C | L + 可选条件请求、条件结果与机械一致性检查 | 检验条件层的增量 |

三臂具有相同业务问题、公开完成要求、源码、模型、单次上限与一次可操作修复机会。公开要求中说明需要解释条件变化，具体正确分支和标签保留在 oracle。P 也必须收到同样语义要求，不能通过删事实或故意写差提示制造优势。各臂输出协议/额外字段和诊断成本可能不同，必须保存差异；本比较估计表达与运行支持组合的效果，不能归因于 JSON 语法本身。

共同评价从原始答案判断结论、必要语义、条件结果、未知项和引用；不因 P 缺少专用 coverage/branch 字段扣质量分，接受等价的文字分析。P 的 coverage 不适用独立显示。所有臂保留基础路径隔离、来源绑定和 telemetry；不关闭基本安全机制做消融。新 evaluator 能读取不同输出形状，但不得为某臂编造未表达的推理。

### 3.4 规模与迁移

开发面板：原五任务 P/L/C 各一次，共 15 单元；任务顺序轮换 P→L→C、L→C→P、C→P→L。先确定配置与指标，再跑模型。开发数据用于修方法，不能充当全新迁移成绩。

可作一次有明确共享缺陷依据的追加，最多两项受影响任务 × 三臂，共 6 单元；无新证据不重跑碰运气。修订完成后固定方法，再获取第三个独立项目正文；本次新迁移与原有受保护 held-out/Q1 reserve 分开，旧保留集始终不读。

迁移选择：先查看来源登记避免旧项目/fork，登记最多三个 metadata-only 候选的顺序和纳入规则，再读首个合格项目源码。需公开可读许可、明确政策依据、可定位授权入口，至少两个不同权限关系任务，优先三个。先按领域含义确认可评价性，不按模型答对与否选样。记录所有考察和排除原因，不强凑漏洞/安全/unknown 标签比例。若正文之前已暴露，标 development，不能称方法固定后未见输入。

迁移比较 P 与开发面板选出的结构化候选 L 或 C，每任务两次 fresh-context、第二次反转顺序；三任务正常 12 单元，只有两项合格则 8 单元并保留分母。结构化候选选择先看结论错误与必要事实缺失，再看条件解释完整性，再看调用/分字段 token 和编写负担；无 C 增量时选 L，不为了新功能选择 C。迁移必须省略 task-specific requirements，使用默认 profile；条件请求只引用公开声明中已有条件。

读取新项目后若出现方法缺口，保留首次默认配置结果；可以修共享代码做明确标记的 development follow-up，但不继续称原样迁移，不重新选更容易的项目。不得修改原样迁移配置继续混算。此类 follow-up 纳入最多 6 单元的总修订额度，已用完则把修复交付和确定性验证完成，真实再测另列后续。

正常全轮 27 单元、最多 33 单元；每单元最多 4 dispatch，结构上限 132，不是必须用满或美元预算。研究结论允许 positive/mixed/no-observed-gain/insufficient-data，工程缺项必须单列。

## 四、文件责任

| 文件（相对仓库根） | 责任 |
|---|---|
| `src/task-dsl/authorization/conditions.ts`、`conditions.test.ts`（新） | 条件请求/结果 schema、编译与机械一致性校验 |
| `src/task-dsl/authorization/{schema,semantics,render,transport,index}.ts` 及测试 | 显式版本接线、提示与引用绑定、旧合同兼容 |
| `src/benchmarks/authorization-dsl/{local-input,local-run,host}.ts` 及测试 | authoring 规范化消费、默认 B、条件 sidecar、session/报告 |
| `src/task-dsl/authorization/authoring.ts`、`authoring.test.ts`（新） | 公开作者输入转换、派生字段、定位缺项；不初始化 provider |
| `src/cli/authorization.ts`、`authorization.test.ts`（新），`src/index.ts` | 现有 CLI 的薄授权命令、默认/exit code/参数测试 |
| `bin/skvm-route.js` 及已有测试（按需） | 仅在普通 shim 无法触达新命令时做最小路由兼容，不重写安装器 |
| `src/benchmarks/authorization-dsl/value-study.ts`、`value-study.test.ts`（新） | P/L/C 配置、差异记录、执行/恢复、共同评价聚合；复用 host、reader、telemetry |
| `src/benchmarks/authorization-dsl/evaluate.ts` 及测试 | 新版本评价有界条件结果；历史评分保留 |
| `examples/authorization-assessment/` | synthetic 作者文件、规范化例子、可运行说明 |
| `docs/usage.md`、`docs/skill-ir/developer-guide.md` | 精确普通使用命令与版本/限制 |
| 研究总文档、current-status、当前 plan、spec 14.34 | 当前设计、逐问题复盘和阶段结果 |

可以依据现有 API 做更小的文件划分，在本任务书更新实际路径再继续，不复制一套 provider 或完整 runner。避免扩大七项既有脏文件的编辑范围。

## 五、Y0–Y14 连续任务

### Y0：建立本轮现场与恢复状态
- [x] 记录 HEAD/branch、七项既有修改和本轮归属；读取上文上下文，不复查全部历史。
- [x] 建立一份 status.json，含阶段、nextAction、实现版本、单位数量、问题、成本未知项及实际归属文件；恢复只读取此状态和对应产物。
- [x] 跑 `bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl` 一次基线，当前预期 131/131、836 assertions；新失败先定位来源。

### Y1：修复共享默认与研究记述
- [x] 在 local-run 测试增加“公开 check/run 省略 arm 均 B、显式 D 保持 D、CLI 与函数一致”的失败用例，跑红后修复两处默认值。
- [x] 例如 mock run 用 `executeLocalAuthorizationRun` 不传 arm，断言 session/report.arm 为 B；保持原 provider dependency injection，不产生真实调用。
- [x] 修正示例 README 默认 D；核对全部当前使用说明。prompt-parse 描述为重新请求的 transport fallback，保留原计量与历史原件。
- [x] 验证 `bun test ./src/benchmarks/authorization-dsl/local-run.test.ts`，提交本轮共享修复。

### Y2：条件领域合同与公开要求对齐
- [x] 用 synthetic owner/role、配置 gate、外部代理未知三个例子走查 §3.1，确认不含项目名和预填答案。
- [x] 在研究 §7.22 记录 condition ID/assumption/fact 的分工、版本分发、无条件任务行为和不完整输出规则。
- [x] 将条件解释的公开完成要求和 evaluator 判例同时定稿，区分“必要决策”“完整解释”“可选细节”；可选细节缺失不冒充决策错误。

### Y3：实现条件层纯函数与反例
- [ ] 写失败测试：重复条件、true/false 冲突、跨义务、未知 ID、重复分支、unknown 无缺失事实、无条件任务、分支上限、未分析条件显式保留。
- [ ] 实现条件 schema/compiler/validator。最小行为断言：同一分支同一条件 true+false 返回诊断；缺部署事实返回内容明确的 unknown 可合法；无条件输入不强制伪造分支。
- [ ] 运行 `bun test ./src/task-dsl/authorization/conditions.test.ts` 红绿；将源码循环与分析条件矛盾区分，不做通用符号执行。

### Y4：接通 renderer、wire、host 与结果
- [ ] 先写 host/transport 失败用例：模型返回外义务 condition/fact pointer 不得成为有效条件结果；旧 wire v1/v2 保持原行为。
- [ ] 通过显式新 wire/sidecar接入同一请求，host 复用一次 diagnostics-only repair；最终诊断与语义未评状态清楚显示。
- [ ] 保存初始与修复响应、条件 sidecar、实际使用模式；无 evaluator 数据参与生成。假设取值不得写成来源已验证事实。
- [ ] 跑 conditions/render/transport/host 聚焦测试，当前有效任务不得因未启用条件层改变输出。

### Y5：减少声明编写负担
- [ ] 写 authoring 规范化红测：同一 task 派生唯一 sourceIdentity；缺政策或 expectation 返回 needs-input；原输入保持；显式 requirements 不被默认覆盖；路径解析与普通入口一致。
- [ ] 实现 authoring/v1 → 严格运行输入，保留字段来源和派生项。错误集中报告可修位置，不通过模型猜测填空。
- [ ] 复用当前默认六类，避免复制 requiredAnalysis 成另一份逐任务同义清单；修复实测存在的重复说明。
- [ ] 记录一次实际“改主体/资源关系/入口/条件”的 agent-assisted 编写流程、改字段数、check次数及诊断；未使用真人不写人工节省。

### Y6：接入现有 SkVM CLI
- [ ] 在 `src/cli/authorization.test.ts` 先覆盖 init 不覆盖、check/inspect 不建 provider、run 默认 B、错误 exit code、未知参数提示与新 session。
- [ ] 新增 `authorization` 动态路由，init/check/run/inspect复用公开函数；默认模式仍 B，条件层 opt-in，不建设交互网页。
- [ ] 运行 `bun ./src/index.ts authorization --help`、`check --input=./examples/authorization-assessment/assessment.json` 与 `node ./bin/skvm.js authorization --help`，确认 source checkout 真实入口可达。若已装旧 binary遮挡，只修本地路由或说明实际构建步骤，不称 npm 已发布。
- [ ] 用临时普通项目目录验证模板编写、mock run、inspect及路径错误；保存可复制命令，结果无需实验 oracle。

### Y7：实现公平的 P/L/C 研究接线
- [ ] 新 study 配置明确 studyArm 与历史 renderArm分离；P 不借用一个仍带 ledger 的 N 冒充无 helper；保留同一 host、来源和基础计量。
- [ ] 失败测试涵盖三臂公共事实/政策/源码等价、各自真实干预差异、P 文字条件解释正常得分、C 空分支不凭字段得分，以及 oracle 路径不进入 prompt。
- [ ] 复用 evaluator 的逐义务语义 review，输出每臂质量、结构问题、first response/after fallback/after repair、分字段 token/cache、调用和时间。实际费用未知明确保留。
- [ ] 配置开发 15 单元、预定轮换顺序与停止/修订规则；mock dry-run一次通过后记录实现 commit 和配置，不叠加新归档链。

### Y8：真实开发面板
- [ ] 用 `xty/gpt-5.6-sol` 同路由、temperature 0、auto-probe off，单调用180秒、单元600秒、max output6000、最多4 dispatch、1次有诊断修复。Y7若输出规模需调整，在所有调用前统一记录。
- [ ] 五个已暴露任务 P/L/C 各一次；各臂公共任务要求不变，缺字段、错误、timeout和fallback均留在分母。
- [ ] 已 dispatch 但完成未知不自动重发；无 dispatch 的配置错误修好后可新建session。网络问题不阻止其他独立单元及工程工作。

### Y9：评价、一次共享修订与候选选择
- [ ] 全部本轮生成结束后读取 oracle，评价决策、必要事实、条件解释、unsupported claims、可复验引用；所有判断绑定实际答案位置。
- [ ] 对错误、unknown和决定增益的代表案例做一次匿名臂名的只读独立复核；review分歧和评价者身份保留，无须复审全部来源。
- [ ] 只有可定位共享合同/实现缺陷才作一轮修订，追加额度遵守 §3.4；初轮和修订分列，禁止事后降低评价要求。
- [ ] 依据预定规则选择 L/C 结构化候选；若二者均较 P差，仍如实选择较简单者用于有限迁移诊断，不宣传收益或升级默认。

### Y10：方法固定后的第三项目获取与任务编写
- [ ] 在读取新项目正文前记录当前方法 revision、选择规则、候选 metadata 顺序、默认profile及迁移 P/候选对照设置；不读取旧受保护集。
- [ ] 获取首个合格独立项目的固定源码和政策依据，保留失败获取记录与缓存，认证 GitHub 不可用时换官方路径，不从头废弃整批。
- [ ] 编写2–3项不同权限关系的任务，只用默认profile。作者输入、来源快照和 evaluator 分开；记录实际源码阅读/作者辅助工作，不能把手工精调问题清单称默认迁移。
- [ ] 若源码选择本身含人工专业判断，在结果说明；sourceRef只有声明时不能写verified。保持只读，不执行目标或部署。

### Y11：普通入口迁移与变化输入
- [ ] 新任务通过已接入CLI的同一调用函数执行 P/候选各两次fresh context，第二重复反向顺序；正常12单元，少于3项时保留真实分母。
- [ ] 检验可表示性、所需任务专属改动、结论和解释质量及编写负担；不因某任务失败换输入补成功数。
- [ ] 对一个任务作规范期待/资源关系的明确变化，用确定性检查确认声明与prompt会变化；如真实比较需要，纳入既定迁移任务而非隐藏增加调用。
- [ ] 迁移暴露缺陷可修共享方法和回归，首跑原样保存；修订后身份记 development，不改写首次迁移结论。

### Y12：能力与实际价值判断
- [ ] 分开汇总默认profile迁移、条件层增量、共同声明/helper组合增益、编写负担；不把目标项目数当skill来源数。
- [ ] 给出逐任务差异及失败原因，不只平均token。主要质量指标为最终决策及必要语义，条件完整性次之，调用/token/时间与编写负担并列；字段合法不记语义通过。
- [ ] 至少一项预定维度改善且无观察到的决定性质量退化时写本面板局部正向；存在权衡写mixed；无改善明确记录，保留有用工程成果。
- [ ] 确认是否继续默认L/B、让C opt-in，或停止C扩展。没有证据时不默认添加更多推理链、模型审查轮数或复杂表达。

### Y13：统一复盘与有限验证
- [ ] 同一研究正文记录问题→证据→修改→验证→影响；更新usage、developer-guide、current-status、plan/spec及唯一status/summary。
- [ ] 跑 `bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl ./src/cli/authorization.test.ts`、`bun run typecheck`，再跑被改动CLI路由或provider的直接相关测试。
- [ ] 文档验证：`python scripts/check_skill_ir_doc_links_test.py`、`python scripts/check_skill_ir_doc_links.py --root .`；按当前文档约定带治理manifest参数。只扫描本轮JSON/JSONL；一次离线重放新summary足够。
- [ ] 检查 staged归属、敏感信息和可复制命令。修复后仅复跑受影响检查，不重复历史全量测试/clean archive审核。

### Y14：发布与停止
- [ ] 按实际功能/方法拆提交，保留七项基线改动和历史untracked；推送用户origin/skill-ir-aot并核对远端。
- [ ] 最终交付现有CLI用法、默认profile的第三项目结果、P/L/C差异、实际收益/退化、费用unknown和明确下一步。
- [ ] 所有承诺项明确完成/缺项原因；有关键工程或迁移缺项时报告partial，不用阶段终态数代替完成。效果negative也可完整交付研究。
- [ ] 本轮工作完成即停止自动扩展，不以等待、重复调用或审计凑时长。只有用户明确要求持续目标时才操作goal工具；本任务的连续执行授权已经给出。

## 六、失败处理、授权与交接

用户允许网络、认证GitHub、远端provider和有目的的付费调用，无美元上限；上面的单元/派发数用于约束实验和避免只留成功。开发代理、项目provider、公开来源请求分别记录，缺计量写unknown/unmeasured。

有确定性诊断时修共享代码，不手工修改个别产物替代修复；无新诊断不重复请求。研究无增益不阻断CLI、输入便利或复盘。来源不可用先保留可用输入，完成独立工作；确实无法取得迁移材料则交付工程和缺项，不伪造新项目。超出fixed-context、改任务类别或新增实际目标执行时说明方向变化；普通接口细节可更新计划后继续。

新线程首先校验现场并执行Y0，不能只读计划后返回“等待确认”。各阶段把恢复点写入同一个status.json；遇上下文压缩从该文件和本任务书继续，不重做已完成工作。本线程交接后不与执行线程同时修改代码。
