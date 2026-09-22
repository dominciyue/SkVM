# 授权任务 DSL：输出减负、公共模式与实际使用任务书

> **执行方式：** 用 `superpowers:executing-plans` 连续执行 Z0–Z12，代码采用 `superpowers:test-driven-development`。用户已授权写完即派发并执行，常规检查点无需确认。开发线程使用 `gpt-6-astra / medium`，直接在现有 `skill-ir-aot` 工作，不建新分支/worktree；完成后只向用户 origin 推送归属修改。

**Goal:** 补齐用户可选择的 plain/ledger/conditions 入口，减少模型输出协议造成的重新生成，以匹配对照及真实编写试用判断能否在保留任务质量的同时改善调用开销和使用负担。

**Architecture:** 沿用当前领域声明、source reader、宿主、引用绑定、条件/coverage检查和计量；将稳定元数据与重复包装交给宿主，把模型输出缩到需要判断的事实和关系。旧wire/v1–v3与历史结果保留，新紧凑wire显式版本化；所有普通命令复用一套method解析与运行配置。

**Tech Stack:** TypeScript、Bun、现有Zod、SkVM CLI/provider/telemetry；不另建UI、编排平台、全仓扫描器或自动skill转换器。

- 日期：2026-09-22；状态：`authorized-for-execution`；Z0时建立机器状态。
- 代码基线：`70906261f11d2a16918ad2076c5cad836f02148c`；交接以本任务书登记后的最新HEAD为准。
- 结果根：`results/skill-ir/skill-dsl-research/development/authorization-protocol-usability-v1/`。
- 研究正文：[研究 §7.23](../../skill-ir/skill-dsl-research.md#723-z-输出减负与实际使用)；方法范围仍按spec14.34。
- 开发模型与被测模型分别记录；实验继续`xty/gpt-5.6-sol`，不因为开发线程换Astra而改变被测模型。

## 一、当前证据与本轮取舍

Y的主流程、authoring和顶层命令已经可用。五任务开发面板P/L/C均4full/1partial；C只在header增加一项条件枚举，调用为6/8/11，known token总量为28,050/59,952/101,151。Gitea三任务P/C各两次重复，12/12结论正确、8full/4partial，两臂质量持平；C用12比8次调用、109,743比37,489 known tokens。以上总量含cache字段，不是美元或同权计费。

复核确认：
1. Y任务书承诺`--method=plain|ledger|conditions`，普通CLI实际拒绝该参数，只有研究接口能显式选择P；含condition request的普通输入会启用C。
2. 六个Gitea C首答全部未通过wire/v3：四项缺`results[0].facts.condition`，两项conditionAnalysis误写为数组，两项嵌套版本错误，一项还重复嵌套并缺branches（错误有重叠）。每项均重发原任务进行prompt-parse。
3. C的失败schema-tool共47,330 known tokens，成功fallback共62,413；即使减少重试，输出结构本身仍有负担。故本轮同时处理稳定输出和必要冗余，不能仅调大重试或maxTokens。
4. lock四项partial均已判断正确拒绝，但未写HTTP403；当前rubric同时记必要语义和解释缺口，公开任务主要要求授权控制与可达性。先校准评分维度，不通过改旧成绩伪造提升。
5. authoring仍要求完整task和专业来源选择，尚无实际编写节省证据；Y任务书/研究局部状态仍停Y12，需明确收口漏项。

本轮不新增目标仓库、不读旧保护集、不继续宽泛skill调研。保留既有分类：源码安全评估中的授权/信任边界任务；工作聚焦同一类DSL的消费、编写和效果。

## 二、接手与阅读顺序

1. `D:/skill优化/AGENTS.md`、适用仓内AGENTS；`docs/skill-ir/current-status.md`；本任务书全文。AGENTS旧C路线按历史理解，当前路线以状态页和本任务书为准。
2. 研究总文档§1–4、§7.22–7.23，spec14.34。设计原文由主执行代理自己读。
3. `src/cli/authorization.ts`；`src/benchmarks/authorization-dsl/{authoring,local-input,local-run,host,telemetry,value-study,value-evaluate,evaluate}.ts`；`src/task-dsl/authorization/{schema,relations,relation-result,conditions,render,transport}.ts`及相关测试。
4. `src/providers/structured.ts`及当前provider tool schema转换路径；只围绕真实失败读取，不重构整个provider。
5. Y结果根`summary.json`、`study/y9-evaluation-decision-v1.json`、`migration/y11-evaluation-decision-v1.json`，六个`migration/runs/y11-initial-v1/units/*C/sessions/*/run.json`中首答、schema/fallback请求、lock的public input与rubric。

基线七项修改必须保留：`src/jit-optimize/evidence-criteria.ts`、`evidence.ts`、`loop.ts`、`validation-completion.ts`、`validation-lifecycle.ts`、`workspace.ts`；`src/skill-ir/skill-family-minimum-delivery-run.ts`。不得reset/clean、顺带提交或删历史untracked。只读探查按AGENTS执行，设计、修改和最终核验由主代理完成。

## 三、设计与验证合同

### 3.1 公共method与兼容

新增统一类型`AuthorizationMethod = "plain" | "ledger" | "conditions"`，普通check/run及公开API共享解析，不把P/L/C研究身份暴露为用户参数。check预览、session、inspect和文本结果保存请求值、实际生效值及wire版本。

兼容规则：
- 明确`plain`只消费公共任务事实/问题，关闭额外ledger和condition sidecar；保留相同来源、引用、基础结果校验和计量。
- 明确`ledger`启用领域ledger，已有condition request不启用，但预览明确提示其未执行，原输入保留。
- 明确`conditions`需要合法condition request；缺失返回可定位needs-input，零provider，不猜测条件或悄悄降级。
- 省略method保留Y行为：无condition request为ledger，有明确request为conditions；记录`selectionOrigin=input-request|default|explicit`，不静默剥夺旧用户已经请求的分析。
- method显式选择时固定B组织；`--arm=N|D`与显式method组合报清楚的冲突。旧单独arm调用保持兼容，研究N/B/D与实验P/L/C仍按旧版本解释。

不得为修CLI新增第二套host。所有组合在provider factory之前验证。`--method=plain`必须真的改变可见要求组织及输出合同，不能仅改report标签。把这些确切语义写入使用说明。

### 3.2 紧凑wire设计

Z2先捕获实际发给模型的tool JSON schema、prompt和本地Zod要求，确定是否存在字段、required、常量、strict或嵌套不一致。仅当证据指向共享converter才修改provider，并加直接回归；不能凭六次失败就猜定模型或provider根因。

新wire/v4应使用一个浅层结构；稳定schemaVersion、task/repository/ref、宿主已知scope等由宿主补入canonical产物。不得让模型反复输出多个版本常量。具体起始形状如下，Z3在研究正文定稿后实现：

```ts
interface CompactFact {
  id: string; // 当前义务内唯一，供coverage/branches引用
  kind: "entry" | "binding" | "control" | "effect" | "condition";
  statement: string;
  citations: Array<{ sourceId: string; startLine: number; endLine: number }>;
}
interface CompactAssessmentItem {
  obligationId: string;
  conclusion: "source_supported_failure" | "source_refuted" | "unknown";
  explanation: string;
  facts: CompactFact[];
  decisiveMissingFacts: string[];
  suggestedObservations: string[];
  // 依method生成专用schema，不为plain强制输出空coverage/branches
}
// 顶层只有results；结构化模式按需在item内附coverage与condition结果。
// normalizer按fact.id和kind生成原canonical facts分组与已验证的指针。
```

使用当前条件/coverage语义，减少重复obligationId、嵌套analyses/version；要保留未分析条件、未知事实、限制及事实引用。来源ID仍由exact catalog约束，禁止靠补默认allow/deny、假造事实或接受悬空引用提高通过率。

固定元数据和机械分组可确定性填充；将空事实组物化为`[]`只表示无该组事实，不能把必要语义标为supported。缺判断、关键事实、依据或条件结果仍返回缺项/unknown/诊断。旧v3失败原件仍按旧schema失败，不能用新parser把旧失败洗成成功。

紧凑normalizer要验证重复/陌生fact ID、跨义务引用、非法source/range、分支冲突及条件遗漏。不同合法fact顺序不能改变绑定。必要的语义核验不因格式变短而移除。协议版本在宿主选择，不由模型猜。

本轮优先保持现有最多一次有诊断修复和fallback策略，通过更好的首次协议减少重试；不要同时换provider、加reviewer、变更模型和重构重试系统。新wire在匹配试验前opt-in；新普通默认是否采用它由Z10决定。语义method与transport版本为两个独立变量。

### 3.3 评价校准

在新生成前登记v3评价补充：授权决策/决定性控制、条件结果解释、协议响应细节分别报告。HTTP403只有当公开任务明确要求具体响应，或状态码改变被问性质时，才计相应任务必需项；不给缺HTTP403的正确拒绝判为授权推理失败。引用状态码但没在答案说清楚时，按明确的响应细节要求评分。

保留Y的原rubric/review/summary；新口径可对既有答案离线给附表，标明评价版本变化。不得将重评分带来的提高归因于新方法。新旧wire采用同一新评价口径；独立抽查错误、unknown和决定收益的案例，不以所有结果都要full作为交付门槛。

### 3.4 有限真实对照与试用

固定四个已暴露任务：Open WebUI trusted-header、Gitea collaborator、assignee、lock。每项条件method的旧wire/v3和新wire/v4各一次，共8单元；按任务交替old-new/new-old，同路由、源码、政策、公共问题、条件请求、可操作修复机会和输出token上限。一次共享缺陷修订最多补两个受影响任务的新旧配对，共4单元。没有新缺陷不加跑。

主要指标：首答本地schema通过、首答完整交付、最终决策与必要控制、条件解释、fallback/repair次数、分字段token/cache和耗时；actualUSD未知保留。字符缩短仅作机制证据。历史六次C失败用于定位，效果比较以这8个匹配单元为主；对照包含相同新评价规则，不能混用Y评分。

另外做一个完整作者使用任务及一次变化请求，共两次分析run。使用已有Gitea collaborator任务的源码，第一次different-user/deny，第二次self-query/allow，原policy不变；实际运行验证语义变化，不能只检查prompt摘要变化。根据已有质量证据默认用plain，若出现明确缺项可在同一失败记录后修共享编写/输入流程；不得手改模型答案。

作者试用优先真正外部使用者；无人时使用干净上下文的开发代理，仅给usage、源码和自然任务/政策材料，不给完成版assessment、oracle或历史答案。代理可以返回输入草稿与遇到的问题，主执行代理持久化并通过普通CLI运行；标`agent-assisted`，不冒充真人节省。无可用独立代理则主代理按命令复现并标self-test，不能卡住整轮。

记录阅读材料、修改字段/步骤、首次check结果、诊断往返、实际模型调用及原/变任务答案。不要求另做一套自动自然语言→DSL生成器；如只通过小型模板/诊断改进就能减少工作，直接实现并测量。真人耗时未知时只报告可观测步骤。

正常10个分析单元、至多14单元，每单元至多4dispatch；开发代理或独立编写代理消耗另计。全轮不设美元额度，不以用满次数或运行时长为目标。

## 四、文件责任与任务清单

### Z0：恢复并登记复核遗漏
- [x] 读取本任务书与上下文，记录HEAD、基线修改、归属文件；建立唯一status.json和后续summary，不叠加归档链。
- [x] 一次运行`bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl ./src/cli/authorization.test.ts`，预期当前167/167、1137 assertions。
- [x] 在Y任务书增加有日期的复核补记：阶段已结束但method漏项转交Z；纠正仍停Y12的当前状态，不把漏项追认为Y已实现。

### Z1：补齐公共method入口
**修改：**`src/cli/authorization.ts`、`src/benchmarks/authorization-dsl/local-run.ts`及测试；公共method解析可放`src/task-dsl/authorization/method.ts`（新）。
- [x] 红测覆盖`check --method=plain`当前Unknown option，及run/report/inspect一致性、显式ledger禁用request、conditions缺request零调用、旧省略参数行为和arm冲突。
- [x] 实现单一method解析/映射，研究API复用而不是另造普通路径。
- [x] 聚焦测试通过，运行源码/Node shim help与三模式provider-free check；文档明确效果及选择来源。

### Z2：重放六个首答，定位协议问题
**读取：**Y migration六个C的run/attempt/request；`src/providers/structured.ts`、provider schema转换及transport。
- [x] 建一个只读离线审计函数/测试，输出每个旧首答的schema诊断、实际tool schema字段与fallback代价，结果写本轮根。
- [x] 验证模型可见schema与本地Zod的required/constant/shape一致，输出已证实原因与待验证假设，不虚构provider严格约束支持。
- [x] 最小合成反例覆盖六类实际失败形状，不复制大量原始答案进源码测试；原始绑定定位留结果JSON。

### Z3：定稿紧凑协议与一致性测试
**新建：**`src/task-dsl/authorization/compact-transport.ts`、`compact-transport.test.ts`。
- [x] 研究§7.23记录field ownership、按method的shape、host常量补入、fact ID分组规则和旧协议兼容，形成唯一新schema。
- [x] 红测覆盖合法紧凑结果归一化等价、重复/缺失/外义务fact ID、unknown无缺失事实、条件分支遗漏、source/range无效；空数组只表无事实，不表通过语义。
- [x] 写一个捕获provider请求的mock测试，核对实际tool JSON schema，而非只测试内部Zod。

### Z4：实现紧凑normalizer
- [x] 实现Z3新模块，复用现有canonical/coverage/conditions检查，不复制第二套语义规则。
- [x] 保留所有语义字段、未知项、限制、事实及来源；不把省字段转为伪造事实，不猜标签。
- [x] 验证同义务fact重排绑定稳定；旧v1–v3测试继续通过；生成normalization诊断可追到模型原字段。

### Z5：接通宿主、渲染与计量
**修改：**`src/task-dsl/authorization/{render,index}.ts`；`src/benchmarks/authorization-dsl/{host,local-run,telemetry}.ts`及测试，provider只按Z2证据改动。
- [x] 新wire选择显式记录；主模型提示、tool schema与fallback schema由同一来源生成，避免重复矛盾的嵌套示例。
- [x] 旧wire和新wire走同一provider/生命周期/修复路径；每次schema失败保存可定位原因，不再只有“response后fallback”的隐含推断。
- [x] 增加首答valid、fallback/repair、固定/模型字段与分节字符计量；保持provider实测token为成本依据。
- [x] 聚焦测试及类型检查；暂不进行全量历史重放。

### Z6：校准评价并准备匹配配置
**修改：**`src/benchmarks/authorization-dsl/evaluate.ts`及测试；本轮evaluator/配置写结果根。
- [x] 红测：正确拒绝但未写HTTP403的语义与协议维度分开；任务明确要求HTTP403时仍记响应细节缺失；因果反转、错权限、伪造部署事实仍错误。
- [x] 旧评分只读附表，新旧wire共用新规则；记录受影响统计与理由。
- [x] 在实际生成前固定四任务八单元顺序、模型、实现commit、公共输入与评价。可扩既有value-study做transport比较，使用独立新config版本，不用P/C标签冒充old/new。

### Z7：真实匹配运行与成本判断
- [x] 沿用`xty/gpt-5.6-sol`，temperature0、auto-probe off、单调用180秒/单元600秒、maxOutput6000、最多4dispatch/1次有诊断修复。配置如需调整须在所有调用前统一登记。
- [x] 运行八单元，保存首答、fallback和修复；已dispatch而完成未知不自动重发，继续独立单元。
- [x] 全部生成结束后评价，按task报告首答/最终质量和成本；新协议若更差如实保留，不通过只报最终成功掩盖重试。

### Z8：一次共享修订与结果选择
- [x] 针对Z7可定位共享缺陷先补反例再修，同一轮最多两个受影响任务old/new各一次；无诊断不加跑。
- [x] 原始和revision分开；正常语义缺失不得用自动填答案修好。
- [x] 明确compact适用于哪些method，是否已有足够本轮证据用于普通默认；C本身仍只在需要条件结果时启用。

### Z9：实际编写与变化任务试用
**修改：**`src/benchmarks/authorization-dsl/authoring.ts`、`src/cli/authorization.ts`及测试、`examples/authorization-assessment/`、usage，限实际发现问题。
- [x] 按§3.4由干净上下文参与者准备任务，记录真实草稿/check错误；现成assessment仅用于运行后核验，不能提前给作者抄。
- [x] 完成普通CLI的原任务和self-query变化任务各一次分析；同一policy/source、不同主体关系/expectation，评价结果是否响应真实变化。
- [x] 缺项诊断解释用户需要什么，减少派生字段手改；根据失败修共享模板/说明，不另建新生成平台。
- [x] 报告参与者类别、步骤和未测项；没有真人分钟就不声称节省人工。

### Z10：确定轻重模式与收益边界
- [x] plain可供普通用户选择；ledger用于要求可追踪义务覆盖的任务；conditions用于明确条件结果交付。默认采用哪种要说明兼容与本轮证据，不能把未比较的默认称质量赢家。
- [x] 分开判断协议成本改善、领域语义收益、编写便利和变化输入行为。若仅传输改善，应准确写成可靠交付/运行减负，不称发现新授权能力。
- [x] 新协议观察到更低重试/开销且所测质量无退化时按适用范围采用；有退化保留显式选择并列问题，不强求positive收口。

### Z11：文档与一次有限验证
- [x] 研究§7.23记录问题→证据→修改→验证→影响；同步usage、developer-guide、current-status、plan/spec和本任务书实际执行项。
- [x] 运行授权/benchmark/CLI聚合回归、`bun run typecheck`；修改provider或shim才补相应直接回归。
- [x] `python scripts/check_skill_ir_doc_links_test.py`及`python scripts/check_skill_ir_doc_links.py --root .`；解析本轮JSON/JSONL，一次离线重算新summary。只修复受影响检查，不重跑历史大审计。

### Z12：归属发布与交接
- [x] 检查暂存归属和敏感信息，保留七项原修改和历史untracked；分功能提交，推送用户origin/skill-ir-aot，核对远端。
- [x] 最终给出三模式实际命令、wire选择、首答与最终质量/成本、作者试用及变化结果、未完成项。
- [x] 按具体交付判complete/partial；研究negative不阻断诚实工程交付；全部完成后停止扩展，不等待或重复调用凑时长。

## 五、连续执行与授权

网络、认证GitHub、远端模型和有目的付费调用已获用户授权，无美元上限。调用数控制用于研究结构，费用unknown与开发代理unmeasured单列。不开新目标仓库、不执行目标部署、不读旧Q1/held-out/prospective；本轮全部是已暴露development输入。

遇缺库、参数、路径或schema问题，按证据修共享实现继续；无provider dispatch的失败可修好后新session恢复。暂停某个受阻研究单元时继续独立工程，不要求每例满分才能前进。方向仍为授权任务DSL，若要换领域或新增主动执行先说明变化。

新线程必须从Z0立即开始，不只返回“计划已读”。每阶段更新同一status.json的nextAction与归属提交；上下文压缩后恢复未完项，不重做已完成任务。主讨论线程交接后不并发改代码。本轮是连续执行任务；未明确要求创建持续目标时，不额外调用goal工具。

## 六、实际执行记录（2026-09-22）

Z0–Z10已完成：首轮8、共享修订2、作者原/变2，共12单元/16调用。实现提交7ee3f546、14cd4fed、2a4ca3d3；配置冻结b812a44f。旧六次首答失败复现；新严格对象反例红绿通过。修订两答full但旧协议仍需fallback；compact header timeout保留，不追加第三轮。作者36诊断后主代理修正，实际deny/allow均验证，标agent-assisted且真人时间未知。175/175测试、1229断言、typecheck已通过。最终证据见[summary](../../../results/skill-ir/skill-dsl-research/development/authorization-protocol-usability-v1/summary.json)，研究默认与收益边界已同步§7.23。

Z11–Z12关闭：三份summary离线复算一致，文档12测试通过、10,654文件扫描无断链/治理错误，全部新证据解析与敏感信息检查通过。冻结证据使用本轮局部Git属性保留原始字节，离线session路径改为相对定位；原始输出不重写。交付`e48db7de`已推送用户origin/skill-ir-aot并核对远端，七项原有修改及历史untracked保留。本轮complete，研究mixed；无待补工程项，不追加实验。
