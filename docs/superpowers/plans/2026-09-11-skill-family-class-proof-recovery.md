# Skill Family Class Proof and Automation Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在一个预先声明、可构造的 skill 职责类上，建立真实成员资格和适用输入分母，修复共享构造/核验能力，并用独立成员证明“同一套自动化路径确实能迁移到这一类的部分成员”。

**Architecture:** 以现有 `api-contract-driven-offline-test-construction` 家族为上位边界，新 identity 把主验收切片收窄为 `openapi-contract-to-offline-request-specimen`：从公开 OpenAPI 3.0.x 合同和明确覆盖要求生成离线 request/test specimens，再由独立 checker 验证。新增一个不调用模型的 eligibility preflight，先从固定候选池筛出真正有合同输入和测试产物责任的成员；随后沿用 `skill-family-obligation-ledger`、`skill-family-class-construction`、request/form/body/response checkers。任何成员特有的业务、认证、线上状态和原生运行器职责都留在分母中并显式标记，不通过专用分支隐藏。

**Tech Stack:** Bun/TypeScript、现有 JSON/YAML contracts、Ajv/YAML、GitHub CLI (`gh`) 与 Git、现有模型客户端（仅用于有定位的职责草稿）、现有离线 clean-checkout 复现。无需 HTML、Web UI、演示包装或新的通用平台。

---

## 1. 为什么要开新 identity

上一个 `skill-family-minimum-delivery-001` 已经证明协议可以运行，但其三名 selected member 的 applicable input 为 `0/0`，最终结论是 `insufficient-evidence`。`methodReady=true` 只说明账本、锁和 checker 流程可运行，不说明类能力成立；该报告和历史 D1-D9 均保持不可变。

本计划的第一个工程问题是**资格错误**，而不是继续扩大样本。固定候选池后，先运行统一的预检：确认 source 明确声明 API 合同、测试/请求产物和至少两个可生成的任务输入；没有这些条件的成员保留为 excluded/uncertain，不能进入 primary 分母。预检只读源声明和直接合同资源，不读取构造结果，不调用模型，因此不会用成功结果反向选样。

本计划允许真实 GitHub、认证 `gh`、远端 API 和付费模型调用。授权不改变历史 identity；每次外部调用必须记录用途、返回状态和实际 usage，服务未返回金额时写 `unknown`。常规工程修复只做一次 focused TDD 和一次必要重跑，不增加重复审计。

作为持续目标执行时，R0–R12 之间不等待常规确认，也不因单项失败主动结束；每项完成后直接进入下项。R12 写出 `reported` 只表示主结果已落盘：只要用户没有发出停止指令，执行器必须继续第 8 节的 E1–E6，并在状态中使用 `extension-running`，不能把主队列完成误判为整个目标完成。

交付窗口仍以 2026-09-14 前的可复核工程成果为优先级参考：先得到一个可运行的共享纵向切片，再扩大样本。时间到达时收口当前最好证据，不用新增格式、界面或重复审计来拖延；若任务队列提前完成且用户没有停止，再执行第 8 节的额外队列。

## 2. 交付对象与主张边界

### 2.1 固定的主验收类

`openapi-contract-to-offline-request-specimen` 的成员必须同时满足以下四条：

1. skill 正文或其直接资源明确把 OpenAPI/Swagger/JSON API contract 作为输入，并给出版本、路径或可定位的合同来源；
2. skill 明确要求生成 request examples、test cases、fixture、contract-test data 或等价的离线测试产物；
3. 至少有两个可从公开合同派生的 task input（两个操作、两个参数场景，或一个操作的两个覆盖场景）；
4. 核心产物可以在不访问业务服务、不使用凭据的情况下由合同和覆盖要求决定，并能由独立 checker 检查。

以下职责属于同一 skill 但不属于本切片：登录/密钥、真实服务状态、业务断言、探索式安全测试、任意自然语言报告和未定义的原生 runner。它们进入 `outside-class`、`source-blocked` 或 `unresolved`，不会被删除，也不会降低核心分母。

### 2.2 结果等级

机器报告必须同时给出四个状态，避免把协议状态当成能力状态：

- `protocolReady`：manifest、角色、来源和账本格式可运行；
- `inputReady`：至少三名 primary 候选各有两个适用输入；
- `capabilityReady`：共享构造器和独立 checker 在开发集上达到合同阈值；
- `transferDecision`：held-out 首跑的 `bounded-positive`、`bounded-negative`、`insufficient-evidence` 或 `blocked-before-evaluation`。

主结果按下列预注册规则派生：

- `bounded-positive`：至少 3 名 repository-distinct primary 成员、每名至少 2 个适用输入；核心义务覆盖率不低于 90%；至少 2/3 成员在**首次运行**产生非空 accepted artifacts；所有 accepted artifacts 的独立 checker 通过率为 100%；没有按仓库/skill ID 写的成功分支。
- `strong-positive`：上述条件成立且 3/3 成员首次运行产生 accepted artifacts，核心义务覆盖率不低于 95%。
- `bounded-negative`：三名成员均 input-qualified、方法锁和分母完整，但未达到 positive 阈值；首跑和一次共享修订都保留。
- `insufficient-evidence`：候选池中不足三名 input-qualified，或核心分母无法闭合；这不是迁移失败，也不能改写为正向结果。
- `blocked-before-evaluation`：来源锁、代码版本或外部服务使方法无法在任何 primary 输入前成立；保存已获得的工程证据。

本 identity 禁止声称整个 skill、所有未来成员、真实 API 业务正确性、人工节省、跨模型稳定性或生产 readiness。局部正向结果的准确措辞是“该职责切片在若干独立成员上由共享 AOT 路径构造并通过独立核验”。

## 3. 数据链、角色和保护边界

每条结果都沿用以下链路：

```text
repository/commit/source path
  -> skillId
  -> eligibility record
  -> responsibilityId / obligationId
  -> taskContract / inputId
  -> construction outcome
  -> independent checker report
```

角色固定为 `development`、`screened-reserve`、`primary-heldout`、`primary-revision`。角色一旦进入构造不可改变；screening 不合格的候选不能在报告中改称 primary success。每个源只记录一个可复现 commit、path、license、读取状态和必要的 source locator；不添加重复的多层摘要。历史结果目录、Q1 reserve、旧 held-out、v1/v2 candidate 和 readiness 文件不修改。

候选筛选发生在方法锁之后、构造之前：R2 先锁定 eligibility 规则，R3 可以按该规则读取候选正文和直接合同资源，但这些读取统一标记为 `screened-reserve`，不调用模型、不生成产物，也不参与方法修订。只有 R8 锁定 primary 名单后，行才可变为 `primary-heldout`；这样既能避免上一次的零输入选择，又不会把筛选信息偷偷当成迁移结果。

新阶段使用：

```text
branch: skill-ir-aot
identity: skill-family-class-proof-002
evidence: results/skill-ir/skill-family-class-proof-20260911/
status: planned
```

开始执行时必须重新记录实际 HEAD、分支、origin tracking 和 tracked status；不能使用本文件写作时的旧 commit。执行直接发生在 `skill-ir-aot`，完成后只推送用户 `origin/skill-ir-aot`，不推 `upstream`，不切换到其他开发分支。

本项目采用单一开发分支策略：所有后续实现、修复、验证和文档提交直接在 `skill-ir-aot` 上进行，并推送 `origin/skill-ir-aot`。`identity` 只用于证据批次隔离，不创建同名或临时 Git 分支；历史分支的提交在整合后不再继续使用。

## 4. 文件责任

先检查下列既有模块，能复用就不重复实现：

- `src/skill-ir/skill-family-stage-manifest.ts`：状态、角色和基础路径校验；
- `src/skill-ir/skill-family-obligation-ledger.ts`：义务和 disposition；
- `src/skill-ir/skill-family-class-construction.ts`：共享 request/body 构造和 checker 组合；
- `src/skill-ir/api-request-specimens.ts`、`src/skill-ir/api-request-form-specimens.ts`、`src/skill-ir/api-request-body-negatives.ts`：已有窄合同；
- `src/benchmarks/skill-ir/public-structure-offline-family-contract.ts`：上位家族成员条件；
- `scripts/skill-ir/skill-family-acquire.ts`、`scripts/skill-ir/skill-family-new-discovery.ts`：来源缓存和获取模式；
- `scripts/skill-ir/skill-family-minimum-delivery.ts` 与 `src/skill-ir/skill-family-minimum-delivery-run.ts`：旧阶段只读参考，不覆盖其 identity。

本阶段需要新增或修改的责任边界如下：

- Create `src/skill-ir/skill-family-eligibility.ts`: 纯函数 `preflightSkillEligibility(input): EligibilityRecord`，只做固定规则筛选，不做构造、不调用网络/模型。
- Create `src/skill-ir/skill-family-eligibility.test.ts`: 先写缺输入、只含 live duty、合同资源缺失、两个有效 task、边界/uncertain 五类 RED/green 测试。
- Create `scripts/skill-ir/skill-family-class-proof.ts`: 可恢复 orchestrator，串联 preflight、development、lock、primary、revision、report 和 resume；通过子进程调用现有入口。
- Create `scripts/skill-ir/skill-family-class-proof.test.ts`: 状态转移、失败隔离、首跑不可覆盖和 accounting 测试。
- Create `benchmarks/skill-ir/classification/skill-family-class-proof-contract-v1.json`: 固定类判据、排除条件、阈值、输入格式和结果等级。
- Create `results/skill-ir/skill-family-class-proof-20260911/`: manifest、source ledger、eligibility、responsibility/obligation ledger、first-run/revision、cost ledger、final report。
- Modify `docs/skill-ir/skill-family-current-results.md` and `docs/skill-ir/skill-family-minimum-delivery.md`: 只增加新计划和新 identity 的导航，保留旧不足证据原文。
- Create `docs/skill-ir/skill-family-class-proof-002.md`: 组件合同、命令、字段、失败含义和恢复方式。
- Append one short checkpoint per meaningful stage to `D:\skill优化\conversation_log.md` and `D:\skill优化\project_handoff.md`。

## 5. 状态机与连续运行规则

```text
planned
  -> screening
  -> development
  -> capability-ready
  -> method-locked
  -> primary-running
  -> revised-once | no-revision
  -> reported

screening -> screening-shortfall
development -> method-not-ready
capability-ready -> method-not-ready
method-locked -> blocked-before-evaluation
primary-running -> insufficient-evidence | bounded-negative | bounded-positive | strong-positive
reported -> extension-running
```

`screening-shortfall` 和 `insufficient-evidence` 仍要继续执行所有不依赖缺失来源的开发、checker 和报告任务；不能因一次 403、429、模型无响应或单个坏源结束整晚任务。每次恢复先读本计划、`execution-status.json` 和最后一个完整结果目录，运行 `--step=status`/`--step=resume`，从首个未完成步骤继续。禁止重复已经有明确返回结果的付费请求；对瞬时网络错误最多做三次有退避重试，永久错误转入下一个候选。`reported` 之后的 `--step=resume` 必须从 E1 开始，而不是返回终止状态。

## 6. 连续工作队列

每个任务都采用“前置条件 → 步骤 → 验收”格式。除受保护的 primary lock 外，不设置人工等待点；一个任务结束后立即进入下一个。时间只是资源分配参考，不用重复测试或空等来凑时长。

### R0：记录新 identity 和可恢复基线

**前置条件：** 当前工作树可读；历史未跟踪材料可能存在但不属于本计划。

**文件：** `scripts/skill-ir/skill-family-class-proof.ts`、`results/skill-ir/skill-family-class-proof-20260911/execution-status.json`、`docs/skill-ir/skill-family-class-proof-002.md`。

- [ ] 运行 `git status --short --branch`、`git rev-parse HEAD`、`git rev-parse --abbrev-ref --symbolic-full-name @{u}`，把实际值写入 status。
- [ ] 确认当前分支为 `skill-ir-aot`；不创建新的 Git 分支，不修改 `main`、`upstream` 或历史结果。
- [ ] 写一个最小 status 命令：`bun ./scripts/skill-ir/skill-family-class-proof.ts --step=status`；不存在结果时返回 `planned`，不得创建模型/网络请求。
- [ ] 为 status JSON 定义 `identity`、`planRevision=1`、`currentStep`、`lastCompletedStep`、`externalAccounting`、`protectedReads` 和 `failureSummary`。
- [ ] 先提交 `chore(skill-ir): register class-proof recovery identity`，只暂存本任务文件、status 和组件说明。

**验收：** status 可重复读取；旧 `skill-family-minimum-delivery-001` 报告的 bytes/字段没有变化；无外部调用。

### R1：实现确定性的 eligibility preflight（首要修复）

**前置条件：** R0 status 为 `screening`；不读取任何 primary body，不调用模型。

**函数合同：**

```ts
type EligibilityRecord = {
  skillId: string;
  classId: "openapi-contract-to-offline-request-specimen";
  decision: "eligible" | "excluded" | "uncertain";
  evidence: Array<{ sourcePath: string; locator: string; kind: "input" | "output" | "coverage" | "resource"; quote: string }>;
  applicableInputs: Array<{ inputId: string; sourcePath: string; operationCount: number; format: "json" | "yaml" }>;
  exclusionReasons: string[];
  bodyReadForScreening: boolean;
  modelCalls: number;
};
export function preflightSkillEligibility(input: unknown): EligibilityRecord;
```

- [ ] 先在 `skill-family-eligibility.test.ts` 写失败测试：缺 API marker、缺产物责任、只有 live/auth duty、合同资源不可读、一个操作、两个有效操作、同一操作两个覆盖场景、资源外链不闭合、边界 uncertain。
- [ ] 运行 `bun test ./src/skill-ir/skill-family-eligibility.test.ts`，确认 RED 原因是函数未实现或返回错误决策。
- [ ] 实现固定规则：要求公开合同定位、产物责任定位、coverage 定位；扫描 direct resources 的 JSON/YAML OpenAPI 3.0.x；把每个可定位 operation/coverage 组合转为 input candidate；无模型、无网络副作用。
- [ ] 对缺失、冲突或只依赖外部服务的来源返回 `excluded`/`uncertain`，保留 locator 和原因，不把它们计入 input-qualified。
- [ ] 再运行同一 focused test，确认全绿，并运行 `node node_modules/typescript/bin/tsc --noEmit`。
- [ ] 在 `scripts/skill-family-class-proof.test.ts` 加一条“预检拒绝时不产生 construction/model call”的测试。

**验收：** eligibility 是可重复纯函数；对一个候选的输入结果不依赖 accepted outcome；`modelCalls=0`；所有排除原因可读。

### R2：冻结窄类合同和候选池（先筛资格，再谈效果）

**前置条件：** R1 focused tests 通过。

**文件：** `benchmarks/skill-ir/classification/skill-family-class-proof-contract-v1.json`、`results/.../candidate-pool.json`、`results/.../screening-policy.json`。

- [ ] 写入四条成员判据、四类排除条件、输入最小值 2、结果阈值、允许格式 `json/yaml`、版本 `OpenAPI 3.0.x` 和义务 disposition 枚举。
- [ ] 固定候选池发现规则：使用认证 `gh api` 搜索 API/testing/openapi/contract-test 相关 skill；先保存 repository/path/branch/license metadata，再按确定性顺序去重；目标至少 15 个候选、至少 8 个独立 owner/repository。
- [ ] 在读取正文前提交候选池和 screening-policy；候选池后续新增只进入 `uninspected`，不能改变本 identity 的顺序或阈值。
- [ ] 记录 development candidates 至少 6 个、screened reserve 至少 6 个，确保一个坏源不会把分母缩成零；不以已有 accepted 结果选候选。
- [ ] 运行 `bun ./scripts/skill-ir/skill-family-class-proof.ts --step=screening-policy`，输出 `policy-frozen` 和 `bodyReadForConstruction=0`。

**验收：** 类边界独立于当前 constructor；候选、排序、排除和阈值在任何构造前可读取；历史失败 identity 不被重试或覆盖。

### R3：认证获取和恢复真实 skill 正文/直接资源

**前置条件：** R2 policy frozen；允许读取 development candidates，primary candidates 仍标记为 screening。

- [ ] 使用 `gh api repos/{owner}/{repo}/git/trees/{commit}?recursive=1`、contents/raw 或 Git clone 取得固定 commit；每个请求保存 URL、status、时间、重试次数、路径和错误文本。
- [ ] 采用三次瞬时重试、Retry-After/backoff、缓存和断点续取；403/429 时先读取 rate-limit 信息，再切换到已认证 Git/raw 方式或继续本地候选，不把此前 149 个成功响应作废。
- [ ] 只下载 `SKILL.md` 及正文直接命名的合同、fixture、schema、template、script；单 skill 文件数 100、总大小 5 MiB，超限写 `resource-closure-incomplete`，不悄悄删除职责。
- [ ] 运行 R1 preflight 于所有已取得候选；对每行写 `eligible/excluded/uncertain`、适用输入数和 source locator。预检阶段不调用模型、不生成 artifact。
- [ ] 目标得到至少 6 个 development eligible 和至少 6 个 reserve/primary eligible；若不足，保存实际 shortfall 后转入 R4/R5 本地能力工作。

**验收：** 成功源可从 commit/path 重读，失败源独立保留；筛选输入至少来自 4 个独立仓库；没有因单个 GitHub 错误终止队列。

### R4：职责与输入分母（模型只做草稿，不做裁判）

**前置条件：** 至少三名 development eligible，或 R3 已记录真实 shortfall。

- [ ] 对至少 4 名 development 成员建立完整责任清单：核心合同输入、coverage、request specimen、negative/format、checker 依据，以及 outside-class duties。
- [ ] 如自然语言难以结构化，每名最多一次模型草稿调用；prompt 只包含已取得正文/直接资源和任务格式，不包含 held-out、gold、运行结果或 secret；保存原始 response、token/费用返回和结构化校验结果。
- [ ] 用确定性 locator 检查每项职责和 obligation；模型没有响应或定位无效时记 `unresolved`，不能自动批准映射。
- [ ] 为每个 eligible 成员绑定至少两个 `inputId`，并把 operation count、格式、coverage requirement 和预期 checker 列入 ledger；无两个输入的成员退为 reserve/excluded，原因保留。
- [ ] 运行 `bun ./scripts/skill-ir/skill-family-class-proof.ts --step=development-ledger`，输出按 member/duty/obligation/input 的分层分母。

**验收：** 每个核心 obligation 在构造前已有 locator 和 planned disposition；输入不再出现 `0/0` 的隐性状态；model/source/paid accounting 分列。

### R5：从真实失败中选共享能力改进

**前置条件：** R4 ledger 至少有三个成员的可比较缺口；没有跨成员证据时只做 checker/diagnostic，不凭想象扩 DSL。

- [ ] 生成 `gap-matrix.json`：每个缺口列出出现成员数、受影响输入、当前 status、是否属于类合同、现有模块和独立 oracle。
- [ ] 优先选择至少两个独立成员同时出现的一个或两个缺口。候选顺序为：递归 `$ref`/组合 schema、query/body array/form 编码、response/header observation、负例 witness；认证和业务状态留在 outside-class。
- [ ] 为每项缺口先写最小 RED：合法输入不应被拒绝、非法变形应被 checker 拒绝、缺少 source evidence 应保持 unresolved。
- [ ] 实现共享模块或扩展现有模块，不读取 `skillId`、repository 或路径，不写答案表；构造器和 checker 使用不同的判定路径或标准库。
- [ ] 运行 focused tests、相关历史样本重核和受影响三成员小批；只在出现实际语义改善时保存 before/after，避免全量重复审计。

**验收：** 至少一个共享能力在两个独立成员上有适用实例或有明确 source-shortfall；合法输入误拒绝下降且 checker 仍能检出设计错误；旧历史报告字节不变。

### R6：开发集纵向运行与 capability gate

**前置条件：** R4 ledger 闭合；R5 的必要修复已提交。

- [ ] 选择 4–6 个 development eligible 成员（至少 4 个独立 owner/repository），每名绑定两个输入；选择按预先排序，不看构造结果。
- [ ] 对每个 input 运行现有 `buildClassConstruction`/对应 profile，一次构造、一次独立 checker；保存 invocation、stdout/stderr、artifact、checker、obligation outcome 和耗时。
- [ ] 统计 `protocolReady`、`inputReady`、`capabilityReady`，并分开列出构造拒绝、source-blocked、outside-class、checker failure、infrastructure failure。
- [ ] capability gate 只检查工程必要条件：每名输入至少有一个可解释 outcome；accepted artifacts 100% checker pass；无 repository-specific dispatch；核心 obligation coverage 目标不低于 90%。
- [ ] 若 gate 失败，先保存首跑，最多做一次共享修订并重跑受影响输入；不能删掉困难义务、缩小 class 或把 development 改称 held-out。

**验收：** `capabilityReady=true` 只有在开发集满足上述条件时才成立；否则状态为 `method-not-ready`，但 R7/R12 仍可完成工程和失败报告。

### R7：边界、负例和不必要拒绝测试

**前置条件：** R6 至少有一个真实成功和一个真实拒绝，或有明确 shortfall。

- [x] 从真实成员的共性职责生成至少 12 个合成变形：缺 `$ref`、循环/共享引用、数组编码、required 缺失、错误 status/header、security dependency loss、body 类型冲突等。
- [x] 每个变形绑定预期检出层，不把合成 gold 当作真实 source evidence；构造器、dependency verifier 和 independent checker 的职责分开。
- [x] 加入至少 6 个合法边界输入，验证不因 key 顺序、大小写、十进制约束或 JSON/YAML 格式而无理由拒绝。
- [x] 运行 `bun test` 的 focused subset；记录 `detected/undetected/unsupported/unresolved`，不把测试数量写成总体成功率。

**验收：** 设计错误至少 90% 在预定层检出；合法边界的拒绝都有可定位原因；结果用于 capability evidence，不改变 primary selection。

**R7 实际检查点（2026-09-12）：** 12 个 R6 真实输入产生 72 个派生案例，
其中 60 个适用且全部通过，12 个局部引用变换因输入不含可证明的已解析
局部引用而明确标记 `not-applicable`；无失败、unsupported 或 unresolved。另有 6
个合成合法边界案例全部通过。预注册的 16 个错误注入全部在指定层检出，
`detected=16, missed=0, notApplicable=0, unresolved=0`。证据为
`results/skill-ir/skill-family-class-proof-20260911/{metamorphic-validation.json,fault-detection.json,r7-validation.json}`；派生输入和合成错误不增加真实样本分母。

### R8：方法锁和 primary selection（唯一保护门）

**前置条件：** R6 `capabilityReady=true`，或已明确转入 `insufficient-evidence`；R1–R7 的方法/contract 版本已提交。

- [x] 写入 `method-lock.json`：class contract commit、eligibility algorithm version、mapping schema、construction/checker profile、input generation rule、thresholds 和一次 revision policy。
- [x] 对 R3 中未参与 development 的候选运行同一 preflight；先得到至少 5 个 `eligible`，按固定顺序锁定 3 个 primary + 至少 2 个 reserve，且至少 3 个不同 owner/repository。
- [x] 在 lock 前只做 eligibility screening，不运行构造、不看 accepted count、不用模型生成答案；把 `screeningBodyReadCount` 与 `primaryBodyReadCount` 分列。
- [x] 将 primary source body、直接资源和任务输入在 lock 后一次性读取；若某个候选仍不满足两个输入，保留其 `ineligible-after-screening`，按锁定的 reserve replacement 规则替换，替换行仍留在分母和报告中。
- [x] 运行 `bun ./scripts/skill-ir/skill-family-class-proof.ts --step=lock`，必须返回 `method-locked` 或明确 `insufficient-evidence`，不能静默继续。

**验收：** 方法锁先于 primary construction；至少三名 primary input-qualified 才开放 R9；没有把开发修订结果冒充首跑。

**R8 实际检查点（2026-09-12）：** 初次运行发现归档 `task-inputs.json`
排序与 R4/R6 development ledger 不一致，产生的错误输入绑定已保留为
`r8-input-binding-mismatch-attempt-001.json` 及对应 attempt 文件，且未运行构造。
修复后的锁以 `development-ledger.json` 中所有六名 development member 一致的
前两个绑定为唯一输入依据，并按 `inputId+format+bytes+sha256` 与任务快照交叉核对。
最终 `method-lock.json` 绑定实现提交 `df3b5d9`，筛选 39、eligible 12，排除
development 后 6 个 input-qualified 候选、3 个 repository-distinct primary
（`candidate-091/112/217`）和 2 个 reserve。锁文件记录
`screeningBodyReadCount=39`、`primaryBodyReadCount=0`；随后
`primary-selection.json` 记录锁后读取 3 个正文、5 个直接资源和 6 个输入，
三名 primary 均绑定 `onepassword-connect` 与 `onepassword-partnership`。没有使用
accepted/outcome 数据，未启动 primary 构造或 prospective。

### R9：primary 首次迁移运行

**前置条件：** R8 `method-locked` 且三名 primary 各有两个输入。

- [x] 每个 primary member 严格一次首跑；不按仓库/skill ID 分支，不人工补产物，不自动重试同一输入。
- [x] 每行记录 extraction status、mapping status、construction status、checker status、obligation outcomes、artifact paths、elapsed time 和 external accounting。
- [x] 运行失败按 `source-blocked`、`unsupported-by-contract`、`constructor-error`、`checker-failure`、`infrastructure-failure` 分类；失败原件不覆盖。
- [x] 首跑完成后立即写 `primary-first-run.json` 和 status checkpoint，再决定是否进入 R10；不要用后续修订覆盖首跑。

**验收：** 三名 primary 的真实首跑结果完整可读；accepted artifact 的 checker evidence 完整；任何零结果都有具体层和原因。

**R9 实际检查点（2026-09-12）：** 三名 primary 的两个锁定输入均完成
一次首跑，共 6/6 独立 verifier 通过。57 个原始操作中 21 个在冻结 v2
合同内 accepted，21 个 artifact operation 全部由 checker 通过；3/3 成员
首次运行产生非空产物。15 个核心义务中 14 个构造完成，coverage=93.33%，
因此四字段为 `protocolReady=true`、`inputReady=true`、
`capabilityReady=true`、`transferDecision=bounded-positive`。唯一未覆盖核心
义务是 `candidate-091` 的 `strict-extra-fields/additionalProperties`，两个固定
输入均无该源实例；它没有跨两个独立成员重复，不能触发 R10 共享修订。

编排层先后暴露两个问题：attempt-001 错读不存在的顶层 `artifact` 字段，
attempt-002 未把已经验证的 `inputValid` 写入聚合行。两份失败报告及完整运行
目录均按 attempt 名保留；`r9-first-run-binding.json` 绑定各自提交和摘要。
修复没有改变 class construction profile、v2 支持合同、primary 或输入选择。

### R10：一次共享修订（仅在首跑提供行动性证据时）

**前置条件：** R9 存在至少两个成员出现的同一可修复缺口；若所有失败是 source-blocked 或输入不适用，直接写 `no-revision`。

- [x] 从首跑聚合缺口，确认缺口在 R8 预注册的 class contract 内；超出合同的特性保持 unsupported。
- [x] 保存 first-run 与修订前 RED；只修改共享代码/合同版本，禁止新增 repository-specific adapter（本次无共同缺口，未修改共享实现）。
- [x] 对同一 primary 输入各执行一次 `primary-revision`，报告 first/revision 并排；不删除失败行，不改 initial threshold（不适用：决策为 `no-revision`）。
- [x] 对修订影响的 development fixture 做 focused regression；不重新读取 Q1/旧 held-out，不重跑无关历史 identity（无修订，R10 判定测试已通过）。

**验收：** 修订结果可解释且独立 checker 仍通过；若未达到阈值，决策仍为 `bounded-negative` 或 `insufficient-evidence`，不强行晋升。

**R10 实际检查点（2026-09-12）：** 从不可变 R9 首跑逐项重建核心义务
outcome，观察到 1 个 `strict-extra-fields` 缺口，属于预注册合同但只出现于
`candidate-091`。两个固定输入都缺少 `additionalProperties` 源实例；没有第二个
独立成员重复，因此共同缺口判定为 `actionable=false`，写入
`no-revision.json`，revision 未执行。R9 首跑、两次编排失败及摘要仍保留，
没有修改构造器、checker、v2 合同或初始阈值。

### R11：效果、自动化边界和成本测量

**前置条件：** R9/R10 已有完整报告。

- [x] 计算四个分母：成员、核心 duties/obligations、适用 inputs、accepted artifacts；另列 source/model/paid/infrastructure calls。
- [x] 对每个成员记录接入改动：纯声明式 mapping、共享代码改动、必要人工语义审核、模型调用、构造时间和 checker 时间；没有实测的人工分钟写 `not-measured`。
- [x] 若可比，运行 6–12 个匹配任务比较 deterministic route 与原 skill/model route 的质量/覆盖/时间；否则只报告 AOT route，不编造效率结论（当前不具可比 baseline，明确记录未运行）。
- [x] 把 `protocolReady/inputReady/capabilityReady/transferDecision` 写入 final report，禁止使用单一 `readiness` 布尔值代替四者。

**验收：** 报告能回答“这一类哪些成员、哪些职责、哪些输入被自动化，剩余人工在哪里”；0 token 或 accepted 数量本身不作为成功理由。

**R11 实际检查点（2026-09-12）：** 新增 `--step=final-report`，从已提交的
R7/R8/R9/R10 证据重建边界报告并做文件摘要绑定。primary 分母为 3 名成员、6
个完整适用 input、15 个核心义务（14 constructed，93.33%）、21 accepted
artifacts（21/21 独立 checker）；57 个 operation 中 36 rejected、0 unresolved。
四门为 `protocolReady=true`、`inputReady=true`、`capabilityReady=true`、
`transferDecision=bounded-positive`。唯一未构造义务仍是 candidate-091 的
`strict-extra-fields`，仅一名成员出现，R10 仍为 `no-revision`。source/model/paid
账本为 17/0/0，primary 本地 runtime calls=12；人工分钟和构造/checker 分项耗时
均为 `not-measured`，未运行不可比的原 skill/model 对照。prospective 准备判定为
`not-ready`，缺少独立 identity、输入选择锁、预测计划和 readiness 决策。首次
聚合器错误保留为 `final-report-attempt-001.json`，未覆盖修订后的正式报告。

### R12：轻量复现、文档同步和推送

**前置条件：** R0–R11 的实际状态已写入 status；没有未解释的 tracked 修改。

- [x] 在短路径 detached checkout 复现新 identity 的 manifest、eligibility、method lock 和 final report；使用现有离线依赖包，避免重新请求网络/模型。
- [x] 运行一次 focused regression、一次 `bun run typecheck`、一次脚本 typecheck；文档链接只做一次增量扫描，不重复全仓历史审计。
- [x] 更新 `docs/skill-ir/skill-family-class-proof-002.md`、`skill-family-current-results.md`、`deadline-execution-status.md` 和 root handoff，明确成功/失败/未执行、恢复命令和剩余缺口。
- [x] 仅暂存本计划涉及的代码、测试、contracts、结果和文档，分功能提交并推送 `origin/skill-ir-aot`；不要 `git add -A`，不要删除未跟踪历史材料。
- [x] 最终 status 命令为 `bun ./scripts/skill-ir/skill-family-class-proof.ts --step=status`，并把输出路径写入交接。

**验收：** 新报告可由 clean checkout 重放；旧不足证据、旧 candidate/readiness/Q1 不变；远端分支与本地提交一致；最终主张严格使用结果等级。

**R12 实际检查点（2026-09-12）：** 首个 detached replay 在 `2877b77` 上如实失败，原因是
`.gitignore` 排除了 12 个 primary run 的 generator/checker 程序；失败报告保留为
`clean-replay-attempt-001.json`，没有放宽 verifier。随后只归档这 12 个已经生成的、摘要一致的
程序文件，提交 `1663d4f`，并在 `D:\cp-clean-r12c`（Bun 1.3.14，离线安装 236 packages）上
以 `3e33dfc` 完成正式重放。命令为：

```text
git clone --no-checkout <local-repository> D:\cp-clean-r12c
git -C D:\cp-clean-r12c checkout --detach 3e33dfc
bun install --frozen-lockfile --offline
bun ./scripts/skill-ir/skill-family-class-proof.ts --step=clean-replay --out=D:\cp-clean-r12-report-003.json
```

正式报告复制为 `results/skill-ir/skill-family-class-proof-20260911/clean-replay.json`，证据文件
19/19、run 6/6、57 operations、21 accepted、21 checked，`semantic.matchesFinalReport=true`，
外部 model/API/paid 为 0/0/0。`statusBinding` 同时保留 status 文件生成时的声明 HEAD 与 detached
checkout 的实际 HEAD；这不是静默改写。干净检出中的 focused suite 为 27/27（95 assertions），
`bun run typecheck` 通过，class-proof 脚本自身显式诊断为 0；命令行依赖图仍会显示仓库其他历史
模块的既有诊断，因此不把它们误称为本脚本失败。

## 7. 外部调用和失败处理

| 情况 | 处理 | 记录 |
|---|---|---|
| GitHub 403/429 | 读取 rate-limit/Retry-After，最多三次退避；切换已认证 Git/raw 或继续下一个候选 | URL、status、retry、cache、failure reason |
| 单个仓库缺 SKILL/许可证/资源 | 保留 partial bundle，标记 `resource-closure-incomplete`，不从中构造正例 | source ledger 与 exclusion reason |
| 模型无响应 | 不重复同一请求；保存 prompt/timeout/unknown usage，继续确定性任务 | model ledger |
| 模型草稿定位无效 | 记 `unresolved`，不自动批准 mapping | draft + locator diagnostics |
| 构造器拒绝 | 判断是否属于预注册合同；合同内是修复候选，合同外是 unsupported | first-run outcome |
| checker 失败 | 保留 artifact 和 checker report；只修共享 checker/构造逻辑，不放宽 predicate | checker evidence |
| 外部调用全部不可用 | 继续使用已归档 development/synthetic 数据完成 R1、R5、R7、R11、R12 | status=`external-shortfall` |

不因失败立即停止连续队列；只有用户明确停止、受保护资料边界无法维持、或所有剩余任务都依赖不可获得的输入时才收口。不得用等待 rate-limit 恢复来占用整段运行时间。

## 8. 主队列结束后的额外工作

若 R12 已完成且用户没有发出停止指令，继续按以下顺序做有明确产物的工作：

1. **E1 共性缺口第二轮（已完成）：** 只处理 R9/R10 中至少两个独立成员重复出现的合同内缺口，新增 RED、实现、两个成员回归和独立 checker 证据。
2. **E2 扩大类内样本（已完成）：** 从已暴露的 screened eligible 池中排除 primary 后选择 5 个仓库去重成员，保持同一 contract 和 preflight，输出成员/输入/义务矩阵；这些成员已在 development 池中暴露，不计作新的独立真实样本，也不写成生态比例。
3. **E3 官方实现和论文对照（已完成）：** 只阅读与当前 `strict-extra-fields` gap 直接相关的 OpenAPI 3.0.3 与 JSON Schema 一手规范，形成边界澄清；没有依据时不改代码、不猜实例。
4. **E4 自动研究循环（已完成）：** `--step=resume` 读取状态并复用已完成报告；遇到 blocked 前置项停止，不重复外部工作。
5. **E5 属性/差分测试（已完成）：** 对 `$ref`、数组、form、decimal、header 和 negative witness 运行三种标记表示（canonical/reversed/combined），保存父/派生摘要和注册比较字段；只报告实际结果。
6. **E6 文档治理（已完成）：** 结果导航、组件合同和恢复手册已同步，旧实验和首次失败原件按路径保留，不制作 HTML/PPT。

每项额外工作开始前在 `execution-status.json` 追加问题、产物和验收字段；完成后立即提交并继续下一项。若一个额外任务没有实际 gap 或输入，不为了延长运行而虚构任务。

### E1-E6 实际证据（2026-09-12）

- E1 `not-applicable`：`no-revision.json` 中唯一 `strict-extra-fields` gap 只属于 candidate-091，`occurrenceCount=1` 且 `actionable=false`；没有启动修订。报告：`results/skill-ir/skill-family-class-proof-20260911/extension-e1.json`。
- E2 `complete`：5 个已筛选 eligible、仓库去重成员 × 2 个锁定输入 = 10 runs；95 operations、35 accepted、35 checked、15/15 core obligations、10/10 verifier，三道 development gate 全为 true。首次错误选择器把 excluded candidate-001..005 当作 eligible，已完整保留为 `extension-e2-attempt-001.json` 与 `extension-runs/e2-attempt-001/`；修复后运行目录为 `extension-runs/e2-revision-001/`。
- E3 `complete`：OpenAPI 3.0.3 Schema Object 与 JSON Schema Additional Properties 的官方页面均记录 HTTP 200、抓取字节数和摘要；结论为 `boundary-clarified-no-code-change`，不能由规范补造缺失的 `additionalProperties` 实例。报告：`extension-e3.json`。
- E4 `complete`：状态快照显示 E1-E3 已复用，E4-E6 可按顺序恢复；报告：`extension-e4.json`。
- E5 `complete`：18 个合成案例（6 capability × 3 representation），18 pass、0 fail、0 unresolved、0 duplicate、无缺失 capability；报告：`extension-e5.json`。合成增强的 header fixture 和所有派生输入不增加真实分母。
- E6 `complete`：必需代码、计划、组件/结果/恢复文档、E1-E5 报告及保留的 E2 失败原件均存在且有摘要；报告：`extension-e6.json`。主工作树上的扩展离线复核另存为 `D:\extension-clean-replay-main.json`；正式 detached clean 证据使用 `--step=extension-clean-replay`。

## 9. 恢复命令与 Definition of Done

恢复顺序固定为：

```text
cd /d D:\skill优化\SkVM
git switch skill-ir-aot
git status --short --branch
bun ./scripts/skill-ir/skill-family-class-proof.ts --step=status
bun ./scripts/skill-ir/skill-family-class-proof.ts --step=resume
```

`--step=resume` 必须读取 status 并执行从首个未完成 R/E 任务开始的连续队列；它不能重新发送已完成的模型/付费请求，也不能读取 protected reserve 以外的新来源而不先写 screening policy。只有用户明确停止，或 R0–R12 与 E1–E6 均已实际完成且没有新的证据驱动任务时，执行器才可以结束目标；“报告已写出”本身不是停止条件。

恢复、提交和推送均固定发生在 `skill-ir-aot`；不得因 identity 名称重新创建 feature branch。

本计划的工程 Definition of Done：

- 新 identity、分支、manifest、候选池、eligibility、职责/输入分母和成本账本齐全；
- 至少一个可复用共享构造/核验改进有真实跨成员证据，或有明确、可复现的 source shortfall；
- primary 首跑与可选修订分离，所有 accepted artifacts 有独立 checker 证据；
- `protocolReady`、`inputReady`、`capabilityReady` 和 `transferDecision` 四字段由机器报告派生；
- clean checkout 能离线重放本阶段报告和扩展运行包（`--step=clean-replay`、`--step=extension-clean-replay`）；
- 代码、测试、组件文档、状态、handoff、conversation log 和 origin 分支同步；
- 最终结论只使用 `strong-positive`、`bounded-positive`、`bounded-negative`、`insufficient-evidence` 或 `blocked-before-evaluation` 之一，并附具体分母与限制。

完成 R0–R12 不自动等于“所有 skill 都能自动化”。真正可辩护的最小成果是：一个独立定义的类、一个不依赖成员名称的共享实现、至少一个跨成员可核验的正向切片，以及对失败边界和剩余人工职责的机器化说明。
