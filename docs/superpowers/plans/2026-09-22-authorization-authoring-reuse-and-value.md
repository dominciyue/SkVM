# 授权任务 DSL：编写、修改复用与领域价值实施任务书

> **执行方式：** 使用 `superpowers:executing-plans` 连续执行 AA0–AA13；实现使用 `superpowers:test-driven-development`。用户已授权写完即派发，不在常规检查点等待确认。开发任务用 `gpt-6-astra / medium`，直接在现有 `skill-ir-aot` 工作，完成后提交并推送用户 origin。

**Goal:** 让不了解内部 canonical schema 的使用者能够编写、运行和修改有界授权任务，并在同一 v4 底座上测清领域声明对遗漏、修改一致性与调用负担的实际帮助。

**Architecture:** 增加面向作者的声明 v2，经确定性 lowering 接入既有 canonical v0、source reader、method、host、v4、validator 和计量；规范输入与运行快照保持分层。复用现有 CLI，增加只读变更比较，旧结果不自动改写为新结果。设计和问题复盘统一维护研究总文档。

**Tech Stack:** TypeScript、Bun、Zod、现有 SkVM provider/CLI 与本地 JSON；不建设 UI、通用工作流引擎、仓库扫描器或新的 agent 平台。

- 日期：2026-09-22；状态：`complete`，AA0–AA13完成并发布，代码与证据529cf0b3已核对远端；机器状态见结果根。
- 生产基线：`1ae35ccb1ec44a1830f4ee0b189503c9a713a337`；接手以本任务书登记后的最新HEAD为准。
- 结果根：`results/skill-ir/skill-dsl-research/development/authorization-authoring-reuse-v1/`。
- 当前研究：[§7.24](../../skill-ir/skill-dsl-research.md#724-aa-作者声明修改复用与领域价值)。范围仍为单repo/ref、显式源码与政策的授权/信任边界任务。
- 实验模型继续`xty/gpt-5.6-sol`；开发Astra、作者代理和被测provider成本分别记录。

## 一、为什么做这一轮

Z真实交付三method和compact v4。初轮四任务legacy/v4首答交付1/4和3/4、最终均3/4；调用7/4，已记录input 43,719/21,926、output 20,017/10,705。v4 header超时与迟到usage完整保留。lock两臂均full，均缺非必需HTTP403细节；解释优势来自collaborator等具体案例，不能误写为lock语义提升。首轮与strict-schema修订分开。

作者首稿有36条诊断，主代理纠正后原/变任务才各一调用完成。当前`authoring/v1`仍要求完整`task/v0`，用户需要手写多个内部ID、重复关系和固定scope/constraints，独立使用改进尚未验证。

源码复核发现`result.ts:createDependencySnapshot`记录policy、obligation及source bytes，却只保存principalId/resourceId，未包含主体/资源属性、entry位置、request、requiredAnalysis、constraints或method需求。旧`assessAuthorizationResultChange`不能直接作为新普通使用的完整失效判断。AA要补齐输入依赖，并保留旧快照的解释边界。

本轮选“薄作者语言 + 确定性lowering + 变更说明”，而非只补文档，或直接建设自动自然语言转换平台。模型可帮助作者写声明；语法归一化与缺项诊断由程序负责。真实编写试用是验收的一部分。

## 二、上下文与文件责任

主执行代理依次阅读：
1. `D:/skill优化/AGENTS.md`及适用仓内规则、`docs/skill-ir/current-status.md`、本任务书全文。旧AGENTS的C路线为历史，当前任务由状态页和本书决定。
2. `docs/skill-ir/skill-dsl-research.md` §1–4、§7.23–7.24、spec14.34；设计原文亲读。
3. `src/benchmarks/authorization-dsl/authoring.ts`、`local-input.ts`、`local-run.ts`、`host.ts`；`src/cli/authorization.ts`；`src/task-dsl/authorization/{schema,semantics,result,relations,conditions,method,compact-transport}.ts`及对应测试。
4. Z结果根的`summary.json`、`author-trial/{draft,first-normalization,steps,summary}.json`；既有`examples/authorization-assessment/authoring.json`；按需读取X/Y已有案例与源码，不重读全历史日志。

建议责任模块：
- 新建`src/benchmarks/authorization-dsl/authoring-v2.ts`及`.test.ts`：作者schema、字段来源、确定性lowering；v1分发留`authoring.ts`。
- 新建`src/benchmarks/authorization-dsl/change-report.ts`及`.test.ts`：完整执行依赖、session与当前输入比较；复用result已有概念，不另造判定器平台。
- 修改`local-input.ts`、`local-run.ts`、CLI及测试：同一个loader接受v1/normalized/v2，check预览和只读compare。
- 新建`examples/authorization-assessment/authoring-v2.json`及相邻使用说明；旧例子原字节保留。
- 修改`render.ts`、`telemetry.ts`、host仅在同信息对照或快照接线确有需要时；不无依据重构provider。
- 本轮runner/config/review/usage证据统一写AA结果根。已有`value-study.ts`、`value-evaluate.ts`、`evaluate.ts`可薄扩展，不复制host。

七项基线修改全部保留且不混入提交：`src/jit-optimize/evidence-criteria.ts`、`evidence.ts`、`loop.ts`、`validation-completion.ts`、`validation-lifecycle.ts`、`workspace.ts`和`src/skill-ir/skill-family-minimum-delivery-run.ts`。历史untracked不清理，不reset/clean、不新建分支/worktree。

## 三、作者语言与兼容合同

### 3.1 authoring/v2形状

采用JSON对象键作为用户可读名称，内部ID由程序生成。初版不引入继承、模板表达式、任意代码或第二套YAML解析器。AA1可按实际代码微调字段，但必须先在§7.24写清原因，所有示例、schema和CLI一起更新。

```ts
interface AuthoringV2 {
  schemaVersion: "authorization-assessment-authoring/v2";
  taskId: string;
  request: string;
  repository: string;
  sourceRef: string;
  sourceRoot: string;
  sources: string[];
  policies: Record<string, {
    text: string; location: string; revision: string;
    acceptance: "accepted" | "conflicted" | "unresolved";
    reason: string;
  }>;
  principals: Record<string, { role: string; facts?: string[]; capabilities?: string[] }>;
  resources: Record<string, { type: string; facts?: string[] }>;
  entries: Record<string, {
    name: string;
    locations: Array<{ path: string; startLine: number; endLine: number }>;
  }>;
  scenarios: Record<string, {
    principal: string; resource: string; policy: string; entries: string[];
    relation: string; operation: string; expectation: "allow" | "deny" | "conditional";
    conditions?: Record<string, { basis: string }>;
    analyzeConditions?: { names: string[]; maxBranches?: number };
  }>;
  additionalQuestions?: string[];
  additionalConstraints?: string[];
}
```

规则：
- request保留用户自然任务；policy文本、acceptance/reason、关系与expectation均由作者提供，程序不根据源码补正确答案。不支持或含混的规范期待返回needs-input。
- 角色、事实、能力、关系各写在对应位置。canonical description只拼接作者原文与中性字段标签，不让模型再生成一份重复叙述。
- 字典键与类型命名空间生成稳定ID；使用现有可逆编码/转义思想，不以数组下标、顺序或内容hash作可编辑身份。键重排不影响语义；重命名显式视为删除/新增或受影响，不猜等价。
- 默认scope、sourceMode、共同requiredAnalysis、constraints、analysis profile、conditionBindings来自版本化宿主规则；列清版本和字段来源。actorRole只能表达task-author声明，不把accepted升级为上游已验证政策。
- 空facts/capabilities可归一化为[]并说明未声明，不能猜authenticated/admin。conditions未提供时不要求虚构条件；显式analyzeConditions引用缺失名称返回可定位错误。
- 字典不允许危险/空白歧义键和碰撞；依旧拒绝未知字段、悬空引用、路径逃逸和越界行。v2只简化作者工作，不删除canonical语义验证。
- `additionalQuestions/Constraints`只能追加公共要求，不能取消宿主只读与范围限制；相互矛盾的自由文字不能承诺由确定性程序全部识别。
- 支持多个scenario与共享policy/entry；引用同一对象的义务均能追踪其修改。无需为Gitea/OpenWebUI/FastAPI加专名分支。

### 3.2 普通使用路径

扩展已有入口，不改变旧命令行为：

```powershell
bun ./src/index.ts authorization init --format=authoring-v2 --out=./authoring.json
bun ./src/index.ts authorization check --input=./authoring.json --method=plain --wire=v4
bun ./src/index.ts authorization run --input=./authoring.json --method=plain --wire=v4 --model=xty/gpt-5.6-sol --out=./runs
bun ./src/index.ts authorization compare --previous=./runs/sessions/session-id --input=./authoring.json --method=plain --wire=v4
```

示例中的session-id在最终usage用实际inspect返回路径说明，不在复现交付留下待填写运行身份。init新增format只输出明确synthetic的可编辑v2例子；`--from`继续兼容v1/v2，输出normalized input，保留原作者文件。旧init省略format与旧normalized读法不改。check/run接受v2而无需用户手工保存一份中间assessment。

loader在同一位置识别schemaVersion，v2 lowering后沿用source reader和host；raw作者输入、normalized input和field provenance在session分开保存。sourceRoot永远相对原输入路径，内存lowering不得改变目录基准。缺失/未知version在provider创建前诊断。

check输出简短问题列表及机器完整diagnostics：按task、policy、source、scenario分组，同一缺失父对象不列几十条派生子错。每项包含作者字段路径、问题和确切修复方式；程序只自动完成确定性字段，不能无痕修政策/expectation。

### 3.3 修改与结果适用性

compare只读、零模型、零覆盖。返回旧session所对应输入与当前声明的added/removed/changed scenarios、原因、受影响义务、missing dependencies、旧结果适用状态。需要覆盖：
- 主体role/facts/capabilities、资源type/facts、relation/expectation/conditions改变；
- 政策text/acceptance/revision改变；entry定位、repository/ref/source bytes改变；
- request、additional questions/constraints、profile、method、wire及normalizer版本改变；
- 纯JSON键序/排版改变，无关且未进入source bundle的文件改变。

新快照明确版本，与实际模型输入、source bundle和结果合同绑定。复用已有摘要即可，不增多层freeze/签名链。旧session缺某类依赖时标`needs-review`与原因，不能补一个当前快照后宣布旧结果current。

全局request或所有模型共享的source bytes变化时，所有受影响run义务均标需复查；不能仅根据最终citation的几行选择性保留，因为未引用源码也进入了推理上下文。只有编排本来明确隔离了输入才能做更窄影响判断；本轮不新增分片调度。状态表示输入适用性，不提高旧结果的语义评分。暂不自动缓存答案或省略run，先确保用户看懂变更。

## 四、验证设计：工程、作者与方法分开

### 4.1 确定性测试

测试至少包含以下实际断言，先红再绿；对应函数由AA1–AA5实现：

```ts
// authoring-v2.test.ts；fixture来自完整synthetic例子而非模型答案
const first = normalizeAuthorizationAuthoringInput(v2Fixture);
expect(first.status).toBe("ready");
expect(normalizeAuthorizationAuthoringInput(reorderKeys(v2Fixture))).toEqual(first);
const { expectation, ...incompleteScenario } = v2Fixture.scenarios.archive;
const missing = { ...v2Fixture, scenarios: { ...v2Fixture.scenarios, archive: incompleteScenario } };
expect(normalizeAuthorizationAuthoringInput(missing).status).toBe("needs-input");
// change-report.test.ts；oldSession依赖由普通mock run真实保存
const changed = structuredClone(v2Fixture);
changed.principals.support.capabilities = ["authenticated", "supervisor"];
expect((await compareAuthorizationInput(oldSession, changedInputPath)).affectedScenarioIds)
  .toContain("archive");
```

`reorderKeys`为测试本地递归对象重排helper，数组保持原序；`changedInputPath`由临时fixture文件创建。`compareAuthorizationInput(previousSessionPath: string, inputPath: string, options?: { method?: AuthorizationMethod; wireVersion?: "legacy" | "v4" })`是AA5新模块的公共异步函数，返回分层状态、affectedScenarioIds、原因与diagnostics；省略options沿用旧session实际method/wire，无法还原则明确needs-review。具体测试签名与最终模块保持一致，不照抄不存在的工具。补充缺政策、错误入口、unknown version、条件缺项、路径逃逸、共享引用传播、多scenario、旧session缺依赖、无变化等反例。普通check/compare/failing run验证provider factory计数为0。

### 4.2 独立作者试用

两项已暴露任务：Gitea collaborator（different-user→self-query），FastAPI foreign-item（普通用户→superuser）。每项用独立干净上下文作者；按AGENTS只读/探索角色返回草稿、修订和问题，主执行代理负责落盘和运行命令，不替作者修字段。

给作者：公开usage、synthetic v2例子、任务自然需求/有权提供的政策、固定源码材料。不给canonical答案、旧assessment、rubric、review或项目内部schema实现。模型输入材料实际记录，独立性只声明程序流程隔离；不声称宿主文件系统权限天然隔离或真人试用。

每位作者先写原任务、最多两轮按真实check诊断自行修订，再完成变化任务。原草稿、全部诊断与修改保留；如适用AGENTS要求一次性子代理，修订时新派干净代理，只传该作者原稿、原材料和诊断，并如实记录这种代理接力，不能称同一真人。两轮仍失败就保留独立使用失败；主代理可修共享schema/诊断/说明，再给一个新干净作者做一次独立复试，不能替作者修成功后写独立成功。作者代理在这一阶段属于明确授权的有界只读编写验证，禁止代理直接编辑项目代码。

主指标：首次valid、修订轮数、查阅材料/是否求助内部代码、需修改的语义字段和重复字段、是否完成原/变任务。字符数与字段数为辅助指标；时间仅报告实际可测代理过程，humanMinutes保持未知。

成功作者声明通过普通CLI各跑原/变一次，共至多4个分析单元。失败作者分支保持not-run，不用主代理替代品占该成功分母。

### 4.3 同v4底座的方法比较

固定6个已暴露development任务：Open WebUI file（source-supported failure）、controlled-text（refutation）、FastAPI foreign-item update（deny）、Gitea collaborator different-user（deny）、Gitea self-query（allow）、Open WebUI trusted-header（deployment unknown）。前五任务plain/ledger各一次，header plain/conditions各一次，共12单元；新作者原/变的4次普通运行单列，不能当重复独立样本。

两个臂共享source、自然需求、规范政策、显式公共问题、模型、v4、预算、引用检查及同一评价规则。条件问题对plain也用自然语言完整给出；plain不输出ledger/condition sidecar，评价从实际文字找同等证据。先核当前`studyExecutionInputs`/renderer是否把问题随sidecar一起删掉；如有，分开公共问题与机器义务，不能以给某臂更多信息制造提升。

沿用Z后的评价v3，决策/决定性控制、任务要求的解释完整性、响应细节、交付/格式分别报告。必要未知要给原因；false-positive、false-negative、unsupported facts与缺项保留。公开任务要求与evaluator oracle分离；准备输入时不得抄结论。新作者lowering的事实保持清单逐项核对，无需字节等同旧assessment。

真实运行前固定12单元和交替顺序；使用`xty/gpt-5.6-sol`、temperature0、auto-probe off、180秒/调用、600秒/单元、6000输出上限、最多4dispatch和1次诊断修复。所有生成结束再评分；如需改统一配置，在首个真实调用前登记理由，两臂一致。未知完成不自动重发，迟到usage照计。一次可定位共享修订最多补两个受影响配对，共4单元；无诊断不补跑。

正常至多16个分析单元（12+作者4），修订后上限20；最多80个provider dispatch只是上界，非目标。作者代理消费单列。付费无美元上限，实际unknown照记。工程若阻塞某实验，继续独立工作并报告原因，不用全案例满分作收口条件。

主要判断分开：v2是否降低编写/修改负担；变更检查是否抓住过期结果；ledger/conditions是否在相同信息下减少遗漏且代价可接受。结果可以是helper-only、tradeoff、no-difference或negative。保持legacy现有默认兼容；本轮实验显式v4，默认升级不是交付门槛。

## 五、连续实施队列

### AA0：恢复与一次基线
- [x] 读取入口、任务书和设计；记录HEAD、七项原修改、拥有文件，建立单一status.json/journal。
- [x] 运行`bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl ./src/cli/authorization.test.ts ./src/providers/structured.test.ts`，基线应175/175、1229断言；失败先分离环境/既有/新问题。
- [x] 复核Z作者36诊断和旧快照缺字段，以具体错误分类进入§7.24，不重跑Z付费面板。

### AA1：作者合同与失败测试
- [x] 将§3.1字段/来源/旧兼容细化到研究正文，确定v2到v0映射表；不存在的领域信息不能由默认值冒充。
- [x] 新建authoring-v2测试，覆盖完整例子、无内部ID、key重排、多scenario共享、缺expectation/policy、错误引用、缺条件和未知字段；运行确认按缺实现失败。
- [x] 在结果根写v1/v2相同语义输入的字段责任对照，区分减少机械字段与删除任务信息。

### AA2：确定性lowering与版本分发
- [x] 实现authoring-v2 schema及lowering；`normalizeAuthorizationAuthoringInput`按明确版本分发，v1原接口保持兼容。
- [x] 生成稳定ID、默认scope/profile/约束、conditionBindings和field provenance，复用v1/canonical compiler完成验证。
- [x] 运行`bun test ./src/benchmarks/authorization-dsl/authoring.test.ts ./src/benchmarks/authorization-dsl/authoring-v2.test.ts`；新旧合同均通过才进入入口接线。

### AA3：普通入口与可操作诊断
- [x] 写CLI/loader红测：init v2模板、不覆盖；check/run直接v2；sourceRoot基准不变；错误版本与缺项零provider；inspect保留原作者输入/派生来源。
- [x] 实现§3.2入口与分组诊断，不创建第二host；公共与直接脚本help一致显示method/wire。
- [x] 更新usage及synthetic v2例子，走一次真实零provider check；只描述已经实现的选项。

### AA4：依赖快照缺口红测与修复
- [x] 构造仅改变principal属性、resource属性、entry范围、request、公共要求的反例，证明旧完整性不足；保留旧历史解释。
- [x] 新执行快照包含实际影响输入与输出合同的全部字段；规范化对象顺序，不把有语义的数组当集合随意重排。
- [x] 新session持久化快照，旧session缺依赖返回needs-review；不迁移旧原件或宣称旧结果已获新验证。

### AA5：只读compare与修改传播
- [x] `change-report.test.ts`先红：字段变化→受影响scenario；共享policy传播；已读source变更全体受影响；未读文件与纯排版不影响；缺历史快照解释可见。
- [x] 实现`authorization compare`并复用source读取/规范化路径；零provider、无旧结果覆盖、无自动答案复用。
- [x] 在新synthetic多scenario例子展示原任务→改主体→改政策→改源码；报告是输入适用性而非语义正确证明。

### AA6：公共事实与评价对齐
- [x] 检查plain/ledger/conditions渲染，分别测试同一用户问题保留、sidecar只改变输出/组织要求、oracle未进入prompt。
- [x] 为§4.3六任务准备同事实输入、公共要求和evaluator；旧真实源码原字节保留，新增表示写AA根。
- [x] mock走完整12单元与一次失败/恢复，验证分母、计量及不重复dispatch；配置和实现固定后才真实运行。

### AA7：两位独立作者原/变试用
- [x] 按§4.2派发两项自包含只读编写任务，主线程按AGENTS等待，不并发改影响作者的接口。
- [x] 按真实diagnostics给作者修订机会；保存首稿、修订、往返和求助，不替作者悄悄纠正。
- [x] 如暴露共享缺陷，先反例再修，再做一次新上下文独立复试；失败仍如实保留。

### AA8：普通使用与变化行为
- [x] 成功作者的两组原/变输入经普通CLI运行，各2单元；同policy/source下改变关系或角色，检查deny→allow是否有证据。
- [x] 调用compare核对变化影响；实际答案要按源码评价，不能只看conclusion enum，因为source_refuted可能同时用于正确allow与正确deny。
- [x] 汇总作者步骤、字段改动、辅助介入、调用与质量；独立未完成的分支明确not-run。

### AA9：同底座真实面板
- [x] 按已固定顺序执行12单元，不现场更换失败任务；保持相同来源、公共问题、v4和provider设置。
- [x] 全部生成结束后按同规则逐项评审；不让coverage字段存在本身成为质量加分，接受plain中的等价事实表达。
- [x] 按任务/方法报告首答和最终质量、调用、token/cache、耗时/unknown，不把未交付从分母删除。

### AA10：一次共享修订与结论
- 2026-09-22实测修订：header条件首答的三个blocked分支因无关unknown assumptions被误要求decisive missing facts，触发一次真实repair。以红绿测试将缺事实要求限于unknown effect；已知效果仍须证据指针，语义仍unreviewed。仅离线重检留存首答，不追加付费单元，不改初轮记录与成本。
- [x] 只修AA9明确揭示的共享实现/合同缺陷，先红后绿；最多两对共4单元，不为取得正向反复调用。
- [x] 分开初轮与修订、作者与面板，形成authoring/change/runtime三个结论。没有领域方法收益就推荐轻模式而保留有用的编写/变更工具。
- [x] 按任务需求给plain/ledger/conditions具体选择依据，不使用与原结果混淆的笼统“全绿/全面优化”。

### AA11：独立使用复核与有限回归
- [x] 窄只读审查v2身份生成、policy不猜测、快照遗漏、同信息实验及原始失败保留；修复有证据的问题，不展开历史大审计。
- [x] 运行授权/benchmark/CLI/provider相关测试与`bun run typecheck`，补实际修改所影响的直接测试；无代码变化不重复同一轮验证。
- [x] 普通help/init/check/compare/inspect离线演示可运行，run使用已归档本轮结果说明；不为演示追加付费调用。

### AA12：统一文档与复盘
- [x] 研究§7.24记录触发问题、根因、解决、验证和取舍，更新当前结论/接口；完成结果放在该节，不追加到证据索引后。
- [x] 同步usage、developer-guide、current-status、当前plan/spec、任务书实际项和根conversation_log；保留Z原机器成绩。
- [x] `python scripts/check_skill_ir_doc_links_test.py`及`python scripts/check_skill_ir_doc_links.py --root .`；解析AA JSON/JSONL、离线重算一次summary、做归属/敏感信息检查。

### AA13：发布与结束
- [x] 只提交本轮归属文件，推送`origin/skill-ir-aot`并核对远端，七项原修改及历史untracked保持。
- [x] 最终给出v2完整例子、可运行命令、作者独立成功/失败、修改影响、同v4方法比较、默认建议和具体未完成项。
- [x] 工程和研究结论分开，按真实完成判complete/partial；完成后停止扩展，不重复调用或等待凑时长。

## 六、恢复和授权

本任务为用户明确授权的新任务连续执行，接手后从AA0启动，不能只确认收到。网络、认证GitHub和有目的付费调用已授权，无美元上限；本轮无需新目标仓库，全部真实任务来自已暴露开发材料。保护Q1/held-out/prospective不读，不执行目标、部署或patch，不改历史结果和readiness。

常规失败按诊断修共享实现继续；受阻研究分支留状态并推进独立工程。每阶段更新同一status的nextAction及归属提交，压缩后恢复未完成项。主讨论任务派发后不并发改代码。用户未要求创建goal时不调用goal工具；不要将历史已关闭目标当成本轮停止指令。
