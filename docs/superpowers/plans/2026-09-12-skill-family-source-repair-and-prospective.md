# Skill Family Source Repair And Prospective Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在一个独立定义、具有公开结构化 oracle 的 skill 类上，修复来源闭包和当前候选的可复现性，验证共享构造/核验方法能迁移到新的同类成员，并给出可审计的自动化边界。

**Architecture:** 采用两条并行但分开的证据链。`source chain` 负责原始文档、局部/外部引用、版本和归档的真实性；`transfer chain` 负责 skill 类成员、职责、输入、构造产物和独立 checker 的迁移效果。历史候选、历史报告和旧 `0/6` 只读；新的当前候选从 `skill-ir-aot` 重新绑定。source 修复只有在有权威来源时才会进入构造，无法证明时记录 `source-blocked`，不猜测补丁。

**Tech Stack:** Bun 1.3.x、TypeScript、现有 SkVM skill loader、YAML/JSON、AJV、GitHub CLI (`gh`)、Git、OpenAPI 3.x/JSON Schema 规范；Schemathesis 和 Dredd 只作为外部方法对照，不作为本项目的 oracle。

---

## 1. 当前判断与任务边界

### 1.1 推荐验证的 skill 类

本计划的默认类为：

> **以公开 API 合同为输入，按照明确覆盖要求构造可独立核验的离线请求/测试产物的 skill。**

它满足当前工程的三个必要条件：

- 输入有结构化公开合同（OpenAPI/JSON Schema），可以定位 operation、parameter、request、response、security 和引用关系；
- 输出可以在不访问真实业务状态的条件下由 checker 核验；
- 当前项目已经有 operation enumeration、v2 generator、wire/schema checker、职责分母和跨成员 development 结果。

现有证据只支持“职责切片”，不能直接支持整个 skill 或所有未来成员：

| 证据 | 当前事实 | 允许的解释 |
|---|---|---|
| API Tester operation development | 562 operations，112 accepted，112 checker-pass，575/575 obligations | 已暴露 API 合同切片可被统一枚举和核验 |
| class-proof R9 | 3 个 primary、6 个输入、21 个 accepted/checked artifact、核心义务 14/15 | development bounded-positive，不是 unseen 泛化 |
| class-proof E2 | 5 个已暴露非 primary 成员、10 个输入、35 个 accepted/checked | 共享路径可复用的追加 development 证据 |
| Meilisearch | 一个本地 parameter `$ref` 缺失 | source correctness 仍 blocked，不能猜参数 |
| Bangumi | 19 个 operation 有 32 个外部 response refs | source-validity advisory，不能自动变成构造义务 |
| clean-002 | 原件及预期摘要未找到 | 历史归档缺口，不得伪造恢复 |

### 1.2 类选择的可失败分支

N1 必须先比较三个候选类，不能因为已有 API Tester 代码就把类边界倒推出来：

1. `openapi-contract-to-offline-request-specimen`（默认候选）。
2. `schema-or-config-to-normalized-environment-artifact`（Env Manager 相邻类）。
3. `static-structure-review-or-translation`（代码审查、法律/文案类，作为弱 oracle 反例）。

按以下五项各 0–3 分评分：公开 oracle 强度、独立成员数量、适用输入可得性、跨成员共性、实时状态依赖惩罚（最后一项反向计分）。总分最高且至少有 3 个真实独立成员的类进入 N2；若没有类达到该条件，保留实际分数并选择得分最高者做 `insufficient-evidence` 路线，不伪造正向结果。默认 API 类仍是首选，因为它已有可运行的共享构造和独立 checker。

### 1.3 外部方法与规范依据

N1 要记录以下一手资料的访问时间、HTTP 状态和用途：

- [OpenAPI Specification 3.1.0](https://spec.openapis.org/oas/v3.1.0)：Operation、Responses、Reference、Security 等结构的规范边界。
- [JSON Schema 2020-12 Core](https://json-schema.org/draft/2020-12/json-schema-core)：`$ref`、schema evaluation 和验证语义的规范边界。
- [Schemathesis 文档](https://schemathesis.readthedocs.io/en/stable/)：公开说明其从 OpenAPI/GraphQL 生成 property-based API tests；只用于比较输入生成和 oracle 分层。
- [Dredd 文档](https://dredd.org/en/latest/)：公开说明其以 API description 驱动测试；只用于比较契约测试的边界。

这些资料证明“结构化 API 合同可驱动测试”是已有工程路线；这是对本类可行性的外部支撑，不是本项目迁移成功的证据。N13 才运行实际对照。

## 2. 研究单位、主张等级与不可变边界

### 2.1 单位定义

所有新结果都使用以下链路，禁止把不同层级混成一个分母：

```text
repository/commit/SKILL.md
  -> skillId
  -> responsibilityId
  -> taskContract
  -> inputId
  -> operationId
  -> artifact/checker result
```

- `skill`：一个真实仓库中的一份 skill 正文及直接资源。
- `responsibility`：正文声明的可识别职责，包含原文定位和不确定项。
- `task input`：该职责真正使用的一个公开 API 合同/配置输入。
- `operation`：输入合同中的可枚举成员；它增加 operation 分母，不增加 skill 分母。
- `artifact`：由共享构造器生成、由独立 checker 验证的离线产物。

每行必须分别记录 `membership`、`sourceClosure`、`inputApplicability`、`construction`、`checker` 和 `claimRole`。`accepted` 只表示 artifact outcome，不表示 skill 或成员已经被接纳。

### 2.2 结果等级

最终机器报告只能使用以下值之一：

- `strong-positive`：至少 5 个独立 unseen 成员、每个至少 2 个适用输入、核心义务覆盖至少 95%，首跑 accepted 至少 4/5，独立 checker 100%。
- `bounded-positive`：至少 3 个独立 unseen 成员、每个至少 2 个适用输入、核心义务覆盖至少 90%，首跑 accepted 至少 2/3，accepted checker 100%。
- `bounded-negative`：输入适用且方法执行，但预注册条件未达到。
- `insufficient-evidence`：来源、成员资格或适用输入不足，无法进行有效迁移判断。
- `blocked-before-evaluation`：在读取受保护正文前，方法或边界合同已失效。

任何等级都不能推出 live API correctness、所有未来 skill、人工节省或生态接纳率。

### 2.3 不可变边界

- 历史 API Tester `0/6`、旧 v1/v2、Q1、readiness 旧字段、历史 candidate、旧 prospective 报告和旧 clean-002 预期摘要只读。
- 不修改 `3ebe606...` 的 candidate 文件或其摘要；当前候选使用新 identity。
- 失败首跑、错误选择、source blocker 和模型无响应按独立目录保存，不能用修订结果覆盖。
- 只在必要的证据边界记录文件/提交摘要；不为每个中间对象制造重复哈希报告。

## 3. 状态机与连续执行规则

新 identity 固定为：

```text
skill-family-current-v2-source-repair-001
```

证据根目录固定为：

```text
results/skill-ir/skill-family-current-v2-source-repair-001/
```

状态转换：

```text
planned
  -> corpus-ready
  -> class-selected
  -> source-audited
  -> method-updated
  -> candidate-current
  -> development-ready
  -> prospective-locked
  -> prospective-running
  -> reported
```

可恢复失败状态：`external-shortfall`、`source-blocked`、`method-not-ready`、`insufficient-evidence`、`blocked-before-evaluation`。状态文件必须记录 `currentStep`、每项 `status`、输入/输出路径、实际调用账本和下一恢复步骤。

连续执行约定：

- 正常阶段不等待用户确认；每项完成后立即进入第一个未完成项。
- 网络失败只暂停当前请求，使用认证 `gh`、缓存和有界退避继续其他候选；不因单个 403 清空已取得数据。
- 用户已授权网络、远端 API 和付费调用，不设置人为金额上限；但每次调用必须有具体用途并记录返回的 token/费用，计费不可得写 `unknown`。
- 只有 protected boundary、历史证据写入、source 修复是否权威和 prospective 预测锁属于必要门；不增加重复 approval、重复模型调用或全量复核。
- N15 完成后若用户没有停止，按“追加队列”继续做有证据的新工作，而不是因为勾选完任务就自动结束。

## 4. 文件职责图

现有实现优先复用：

- `src/skill-ir/api-tester-operation-source.ts`：operation enumeration、local `$ref` 和参数/security 语义。
- `src/skill-ir/api-tester-operation-input.ts`：普通输入 runner、source issue、义务覆盖和独立输出验证。
- `src/skill-ir/api-tester-production-contract-v2.ts`、`src/skill-ir/api-tester-production-programs-v2.ts`：v2 构造/检查合同。
- `src/skill-ir/api-tester-operation-delivery-report.ts`：历史交付报告及 clean/archive 状态。
- `src/benchmarks/skill-ir/public-structure-offline-family-contract.ts`：类成员、职责和 current-support 分离。
- `scripts/skill-ir/skill-family-class-proof.ts`：现有 development ledger、method lock、primary run 和 clean replay。

本计划需要时创建或修改：

- `src/skill-ir/api-tester-source-closure.ts`：统一 local/external reference closure 结果，不生成 artifact。
- `src/skill-ir/api-tester-source-closure.test.ts`：缺失、外部、循环、相对路径、response/security 引用 fixtures。
- `src/skill-ir/api-tester-source-repair.ts`：权威来源查找、修复记录和 derived-source provenance。
- `src/skill-ir/api-tester-source-repair.test.ts`：权威修复、无法证明、错误补丁拒绝。
- `src/skill-ir/skill-family-readiness.ts`：多维 readiness 派生器及旧字段兼容读取。
- `src/skill-ir/skill-family-readiness.test.ts`：当前历史快照、partial source、prospective 未锁定等状态测试。
- `scripts/skill-ir/skill-family-current-v2-prospective.ts`：新 identity 的 status、source-audit、candidate、lock、run、report、clean-replay 入口。
- `scripts/skill-ir/skill-family-current-v2-prospective.test.ts`：状态恢复、一次修订、边界拒绝和报告绑定测试。
- `docs/skill-ir/skill-family-current-v2-source-repair.md`：组件合同、命令和失败语义。
- `results/skill-ir/skill-family-current-v2-source-repair-001/`：只存本 identity 的 manifest、ledger、报告和失败现场。

若 N3/N7 的现有实现已经满足合同，任务应写 `no-code-change` 证据，不为制造提交而复制模块。

## 5. 主执行队列 N0–N15

### N0：恢复、分支和基线绑定

**前置条件：** 无；历史输入只读，但允许创建本 identity 的状态文件。

**文件：** 创建 `results/skill-ir/skill-family-current-v2-source-repair-001/execution-status.json`、`stage-manifest.json`。

- [ ] 切换到唯一开发分支并记录实际提交，不创建 feature branch：

```text
git switch skill-ir-aot
git status --short --branch
git rev-parse HEAD
git rev-parse origin/skill-ir-aot
```

- [ ] 读取 `project_handoff.md`、`project_communication.md`、`docs/skill-ir/deadline-execution-status.md` 和本计划；把当前 HEAD、Bun/Node、tracked 状态写入 manifest。
- [ ] 运行现有只读状态命令：

```text
bun ./scripts/skill-ir/skill-family-class-proof.ts --step=status
```

- [ ] 在 manifest 中登记历史只读路径：旧 `0/6`、旧 candidate、clean-002 expected digest、Meilisearch/Bangumi source records、Q1/held-out/prospective。

**验收：** 分支是 `skill-ir-aot` 且与 origin 对齐；tracked 工作树没有未说明改动；历史证据路径可读；状态文件显示 `currentStep=N1`。不把未跟踪历史材料加入暂存区。

### N1：外部 skill 语料与候选类可行性

**前置条件：** N0。

**文件：** 创建 `corpus/source-ledger.json`、`corpus/class-feasibility.json`、`corpus/external-method-notes.md`。

- [ ] 用认证 `gh` 获取候选 skill 元数据和正文。优先使用 `gh api` 的仓库 contents/git tree 接口，记录 URL、仓库 owner、commit、HTTP 状态、正文路径和读取字节；搜索失败时切换到已认证 raw/API，不丢弃已成功响应。
- [ ] 目标发现 24 个候选条目、至少 12 份完整正文、至少 6 个独立 owner/repository；另外至少保留 5 个 repository-distinct 的 metadata-only 候选，正文直到 N11 锁定后才读取。实际数量不足时保留已取得分母和失败原因，不用空行凑数；不足 5 个未读候选时在 `class-feasibility.json` 写 `prospective-pool-shortfall`，N11 走不可执行分支。
- [ ] 对每份正文记录 `development`/`prospective-pool`/`excluded` 角色。N1 读取的正文不能随后冒充 unseen。
- [ ] 对第 1.3 节四个外部资料记录 HTTP 状态、抓取日期和用于哪一条合同；不能只记录搜索结果标题。
- [ ] 按第 1.2 节五项评分比较三个候选类，写出选择理由、至少一个正例、一个反例和一个“属于类但当前不支持”的例子。

**验收：** `class-feasibility.json` 能在不读取 artifact outcome 的情况下给出类选择；每个成员有原文定位；至少有 3 个真实独立成员或明确 `external-shortfall`；不把 API 文档本身计作 skill。

### N2：现有方法基线和缺口矩阵

**前置条件：** N1 已选类。

**文件：** 创建 `baseline/current-evidence-snapshot.json`、`baseline/gap-matrix.json`。

- [ ] 只读加载现有 development 结果，核对 baseline 数字：562 operations、112 accepted、449 rejected、1 unresolved、112 checker-pass、575/575 obligations；若当前文件数字不同，记录漂移而不改历史。
- [ ] 读取 class-proof R9/E2 结果，按成员/职责/输入重新列分母，区分 `source-blocked`、`unsupported-by-contract`、`unresolved`、`outside-class` 和 checker failure。
- [ ] 对每个缺口记录：出现成员数、是否跨两个独立成员、是否属于预注册类合同、是否能由公开源定位、预期修改文件。
- [ ] 运行一次现有 `status` 和必要的 parser-only 命令；不启动新的 unseen/prospective。

**验收：** 缺口矩阵能指向共享代码或 source record；没有用 accepted 数量筛选缺口；旧报告和旧 readiness 字节未改变。

### N3：实现统一 source-closure 解析与独立检查

**前置条件：** N2 中至少有一个可复现的 source/reference 缺口。

**文件：** `src/skill-ir/api-tester-source-closure.ts`、`src/skill-ir/api-tester-source-closure.test.ts`，必要时修改 `api-tester-operation-source.ts` 以复用结果。

- [ ] 先写失败测试，覆盖以下 fixture：缺失 local parameter、可解析 local response、外部 response ref、相对 URL、循环 `$ref`、`$ref` sibling semantics、嵌套 request schema、security scheme body。
- [ ] 固定最小接口：

```ts
type SourceClosureStatus = "valid" | "resolved-external" | "advisory" | "source-blocked";
type SourceClosureResult = {
  status: SourceClosureStatus;
  references: Array<{
    locator: string;
    ref: string;
    role: "parameter" | "request" | "response" | "security";
    resolution: "local" | "external" | "missing" | "cycle" | "invalid";
    targetLocator: string | null;
    constructionObligation: boolean;
  }>;
  unresolved: string[];
  external: string[];
};
```

- [ ] 使用现有 YAML parser 和 URL resolution；外部内容通过注入的 fetch/cache 接口读取，测试不得访问网络。缓存键包含 URL 和 pinned source identity，不能按 skill 名称返回答案。
- [ ] 实现后运行新增测试，确认 response-only external ref 不被加入 construction obligations，缺失 request/parameter ref 仍阻塞对应 operation。
- [ ] 运行受影响的 `api-tester-operation-source.test.ts` 和 `api-tester-operation-input.test.ts`，不放宽旧 checker。

**验收：** 每个 reference 有 resolution 和 construction 标记；历史 9 类 fault 的既有清单仍通过：`operation-omission`、`operation-duplicate`、`parameter-dependency-loss`、`reference-dependency-loss`、`security-dependency-loss`、`summary-drift`、`false-acceptance`、`artifact-endpoint-loss`、`artifact-witness-loss`。清单与预期 detector code 绑定于 `results/skill-ir/api-tester-operation-validation-development-001/report.json` 的 `faultDetection.cases`，实现回归覆盖 `src/skill-ir/api-tester-operation-coverage.test.ts`、`src/skill-ir/api-tester-operation-admission.test.ts`、`src/skill-ir/api-request-body-negatives.test.ts` 和对应独立 checker tests；source closure 和 artifact construction 是两个独立结果。

### N4：Meilisearch `total` 引用的权威修复判定

**前置条件：** N3；不得先写猜测补丁。

**文件：** 创建 `source-repair/meilisearch-resolution.json`、必要的新的 source bundle；不修改旧 `real-meilisearch-api` 文件和旧 report。

- [ ] 从旧 source ledger 找到确切仓库、路径、版本和获取 URL；用认证 `gh api` 获取该仓库的 commit、blame、tag/release 和相邻历史版本。
- [ ] 对 `#/paths/~1tasks/get/parameters/0` 和 `#/components/parameters/total` 做三方核对：原始文档、同一仓库的发布/源码定义、官方或维护者修订记录。
- [ ] 若找到权威修订：保存新 source bundle、commit、原始与修订差异、解析器结果；把状态写为 `authoritative-recovered`，只对受影响 operation 建立新输入并重新跑 operation admission。
- [ ] 若找不到权威修订：写 `source-blocked-unresolved`，列出已检查的版本和证据；不把 `total` 猜成某个参数，不生成“修复后 accepted”结果。
- [ ] 新旧结果并排保存，旧 `unresolved=1` 和旧 portable digest 不变。

**验收：** 结果只能是 `authoritative-recovered` 或 `source-blocked-unresolved`；两者都有来源定位和解析输出；没有 derived patch 被误称为上游正确性。

### N5：Bangumi 外部 response 引用闭包

**前置条件：** N3；N4 可以并行但不得互相覆盖 source bundle。

**文件：** 创建 `source-repair/bangumi-external-closure.json`、外部依赖缓存目录和必要的 source manifest。

- [ ] 从 19 个受影响 operation 的 reference list 读取 32 个外部 response refs；按 pinned URL/commit 获取外部 component，记录 HTTP 状态、内容类型、相对路径解析和版本。
- [ ] 对每个 ref 运行 N3 closure checker，分类为 `resolved-external`、`advisory-unverified`、`source-blocked` 或 `invalid`。
- [ ] 只有 request/parameter/security 构造依赖才进入 construction denominator；response-only ref 继续作为 source-validity 记录。
- [ ] 若所有 ref 可解析，建立新的 source closure bundle 并只重跑 19 个 operation 的 source validation；若仍有不可得 ref，保留 advisory，不降低 checker 标准。

**验收：** 32 个引用逐项有状态；19 个 operation 的 advisory 数量有前后对照；没有把外部 response 成功解析写成 live API correctness。

### N6：clean-002 历史归档恢复或终止判定

**前置条件：** N2；不得删除任何现有 worktree 或未跟踪材料。

**文件：** 创建 `archive-recovery/clean-002-search.json`；若找到则创建 `clean-002-recovered.json`，否则创建 `clean-002-unrecoverable.json`；必要时修改 `api-tester-operation-delivery-report.ts` 的兼容读取和测试。

- [ ] 只读搜索本地路径、所有 worktree、reflog、远端 refs、unreachable Git objects 和已归档压缩包：

```text
git reflog --all --date=iso
git fsck --full --no-reflogs --unreachable
git log --all --name-status -- results/skill-ir/api-tester-operation-dependency-verification-revision-clean-002/report.json
git branch -a --contains <candidate-commit>
```

- [ ] 用旧报告记载的路径和 expected SHA-256 做精确字节比较；发现同名但摘要不同的文件必须标为 `not-the-original`。
- [ ] 若找到精确原件，保存发现位置、对象类型、提交和字节比较为 `recovered-exact`；若找不到，保存完整搜索范围和终止时间为 `historically-unrecoverable`。
- [ ] 对 verifier 增加两个测试：历史原件缺失仍返回 `missing-unarchived-original`；当前新 clean archive 可以独立报告 `current-reproducible`，但不能覆盖旧字段。

**验收：** 旧 expected digest 永远保留；不创建伪造 clean-002；当前工作可以在新 clean archive 上继续，不再被不可恢复的历史文件阻塞。

### N7：多维 readiness 派生器

**前置条件：** N2、N4–N6 的 source/archive 状态至少有初步结果。

**文件：** `src/skill-ir/skill-family-readiness.ts`、`src/skill-ir/skill-family-readiness.test.ts`。

- [ ] 先写失败测试，固定以下类型和派生规则：

```ts
type ReadinessSnapshot = {
  methodReady: boolean;
  sourceReady: "ready" | "partial" | "blocked";
  inputReady: boolean;
  capabilityReady: boolean;
  transferReady: boolean;
  reproducible: boolean;
  prospectiveReady: boolean;
  claimLevel: "development-only" | "prospective-ready" | "reported";
};
```

- [ ] `methodReady` 只由合同/映射/checker/accounting 完整性决定；`sourceReady` 由 N3–N5 的闭包决定；`inputReady` 由至少两个真实适用输入决定；`transferReady` 只能在新成员首跑后派生；`reproducible` 只表示当前报告可 clean replay；`prospectiveReady` 只有在 `methodReady=true`、`sourceReady=ready|partial`、有至少 3 个锁定 primary 和每个至少 2 个输入、selection/prediction lock 已写入且 protected-boundary 计数为零时才为 true。
- [ ] 提供旧报告的只读适配器，不重写旧 `readiness` 字段。当前预期快照至少应能表达“method true、source partial/blocked、input false（新 prospective 未锁）、transfer false、历史 clean 可复现”。
- [ ] 对缺少某层证据、source blocker、旧 clean-002 缺失和未写 prediction 的情形分别写断言。

**验收：** 一个 boolean 不再遮蔽 source/input/transfer 差异；旧报告解析结果和新派生快照同时可读；`prospectiveReady=false` 时有明确的 `insufficient-evidence` 或 `blocked-before-evaluation` 落点。

### N8：按跨成员缺口更新共享方法

**前置条件：** N2 gap matrix；至少一个缺口在两个独立成员出现，或 N3/N5 明确证明已有代码无需改动。

**文件：** 由 gap matrix 决定，优先 `api-tester-operation-source.ts`、`api-tester-production-contract-v2.ts`、对应 checker 和测试；不新建按仓库命名的 adapter。

- [ ] 先为实际缺口写 RED 测试和最小 source fixture；测试至少包含一个合法输入、一个边界输入和一个被 checker 拒绝的错误输入。
- [ ] 只实现跨成员共性能力，优先顺序为：外部引用闭包、嵌套/组合 schema witness、request/response/header/security 绑定、form/wire encoding。具体顺序以 N2 的出现次数排序，不提前承诺所有特性。
- [ ] 如果语义仍在现有 v2 合同内，只更新实现和测试；只有支持范围发生兼容性变化时才登记 `v2.1`，并在组件文档写迁移规则。
- [ ] checker 使用独立解析/约束判断；不得直接复用 generator 的取值函数作为唯一 oracle。加入 omission、duplicate、ref-target、security-body、constraint-loss fault tests。
- [ ] 在至少两个不同成员的相同输入类型上运行前后对照，记录新增 coverage、无必要拒绝、checker failures、运行时间和代码改动量。

**验收：** 至少两个独立成员得到真实适用实例，或有明确的 `no-code-change` 证据；不存在 repository-specific success branch；未修改旧结果。

### N9：冻结当前 v2 候选与输入包

**前置条件：** N7 `methodReady=true`；N4/N5 已给出 source 状态；N8 已提交或明确无代码变化。

**文件：** 创建 `candidate/current-v2-candidate.json`、`candidate/source-selection.json`、`candidate/input-manifest.json`、`candidate/method-lock.json`。

- [ ] 以当前 `skill-ir-aot` HEAD 重新绑定候选；候选快照必须包含验证入口本身、package/lock、构造器、checker、source closure、readiness 派生器和组件文档，避免旧候选“入口晚加入”的问题。
- [ ] 文件摘要只用于候选边界和 clean replay；中间派生数据使用 `path + byte length + semantic summary`，不重复生成多份等价 hash 报告。
- [ ] 先锁定输入选择规则，再读取 development 正文；至少 3 个独立仓库成员、每个至少 2 个适用输入，另列 reserve。不得按 accepted 数量选择。
- [ ] 写出逐行预测格式：成员资格、source closure、input applicability、预期 obligation disposition、预期 artifact/checker outcome 和失败类别。预测写入后才允许 construction。

**验收：** 新 candidate 是当前提交自包含的；旧 candidate、旧输入和旧 prediction 字节无改动；`method-lock.json` 明确记录代码版本、合同版本、选择算法、一次修订政策和停止条件。

### N10：更新后 development calibration 与 shadow

**前置条件：** N9；只使用已暴露 development 成员，不读取新 protected 正文。

**文件：** 创建 `development/first-run.json`、`development/revision.json`、`development/coverage-matrix.json`。

- [ ] 选择至少 3 个已有真实成员，每个运行两个锁定输入；同时跑旧 v2 baseline（若输入适用）和当前共享路径，分开记录，不把 baseline 当新样本。
- [ ] 每行记录 extraction/mapping/source/construction/checker、义务覆盖、耗时、model/API/paid 调用和人工修改；未测人工分钟写 `not-measured`。
- [ ] 若同一合同缺口在至少两个成员出现，只允许一次共享修订；保存首跑和修订原件，修订不能改变初始分母。
- [ ] 运行 N7 readiness 派生器，确认 `capabilityReady` 与 `sourceReady` 不被 accepted 数量单独触发。

**验收：** 至少 2/3 development 成员有非空、checker-pass 的适用产物，或机器报告明确为 `method-not-ready`/`insufficient-evidence`；所有失败都有层级原因。

### N11：冻结新的 unseen prospective preparation

**前置条件：** N10 通过方法门；source/input/method lock 完整。

**文件：** 创建 `prospective/selection-lock.json`、`prospective/predictions.json`、`prospective/protocol.json`。

- [ ] 只用 metadata screening 选择新的、未在 N1/N2/N10 暴露过的 repository-distinct 成员；至少 3 个 primary、至少 2 个 reserve。筛选阶段不看 accepted/outcome，不写构造答案。
- [ ] 锁定成员、输入发现顺序、适用性判定、预测字段、一次 revision policy、停止条件和 accounting schema；锁后才读取 primary 正文和直接资源。
- [ ] 预测文件必须逐行绑定 `skillId/responsibilityId/inputId`，包含预期 source status 和 obligation disposition；无法定位的项写 `unresolved`，不自动批准。
- [ ] 通过 readiness 派生器计算 `prospectiveReady`。若来源不足、输入不足或类边界失效，写 `insufficient-evidence` 并停止在 execution 前，不擅自换样本；随后跳过 N12/N13 的执行，生成 `prospective/not-executed-report.json`（包含缺失条件、已读计数、零 run 计数和恢复步骤），再进入 N14 的“未执行 clean/archive”分支和 N15 交接，不把队列留在半完成状态。

**验收：** selection/prediction lock 的时间和代码版本早于任何 primary construction；`protectedBoundary` 显示没有运行记录；旧 Q1/held-out/readiness 不变。若候选池少于 3 个 primary 或 5 个未读候选，`prospectiveReady=false`，但 N11 仍以 `insufficient-evidence` 完成并交接。

### N12：运行新的 prospective 成员

**前置条件：** N11 `prospectiveReady=true`。

**文件：** 创建 `prospective/first-run.json`、每行独立的 run directory、`prospective/final-report.json`。

- [ ] 按锁定顺序运行每个 primary 的两个适用输入，一次首跑；不按成员名称写分支，不人工补 artifact，不静默替换输入。
- [ ] 允许有目的的模型/远端 API/付费调用；保存 prompt、响应状态、token、费用或 `unknown`。相同请求使用缓存，不重复试到成功再只报成功。
- [ ] 失败分类固定为 `source-blocked`、`unsupported-by-contract`、`input-not-applicable`、`constructor-error`、`checker-failure`、`infrastructure-failure`；一行失败不覆盖其他行。
- [ ] 首跑后只允许一次预注册的共享修订；若没有两个成员共享的合同内缺口，写 `no-revision`，不为达标强行修代码。

**验收：** 机器报告同时给出成员、职责、输入、operation、accepted artifact、checker、成本和失败分母；按 N2.2 判定结果等级；不写“迁移成功”除非满足预注册条件。

### N13：外部方法对照（离线或 mock）

**前置条件：** N12 有至少一个适用输入；不能访问真实业务状态时使用本地 mock/server。

**文件：** 创建 `comparison/schemathesis-dredd-baseline.json`、`comparison/method-comparison.md`。

- [ ] 在同一 OpenAPI 输入上运行 Schemathesis 或 Dredd 的离线/模拟模式，记录版本、命令、输入和输出；工具不可用时保存明确的 `not-runnable` 原因，不把文献描述当运行结果。
- [ ] 比较维度限定为 operation discovery、输入生成、约束覆盖、失败定位和输出可核验性；不比较真实业务成功率。
- [ ] 记录本项目共享方法需要的 skill-specific mapping 与外部工具的差异，明确哪些能力来自本项目 checker。

**验收：** 对照结果与本项目结果分开，不能用外部工具通过替代本项目 checker；形成一项方法边界说明或可复现差异。

### N14：当前候选 clean replay 与归档

**前置条件：** N9–N13 已完成，或 N11 已产生 `not-executed-report.json`；tracked 改动无未说明项。

**文件：** 创建 `clean-replay/manifest.json`、`clean-replay/report.json` 和必要的复现手册。

- [ ] 从最终提交建立短路径 detached checkout，离线安装固定依赖；若 N11 为 `insufficient-evidence`，只复现 N0–N11 的状态/合同文件，不运行不存在的 prospective rows：

```text
git clone --no-checkout <local-repository> <clean-root>
git -C <clean-root> checkout --detach <final-commit>
bun install --frozen-lockfile --offline
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=clean-replay --out=<clean-report>
```

- [ ] 验证候选入口、source closure、selection/prediction lock、run totals、readiness snapshot 和 final report 的语义摘要；Windows checkout 明确记录 `core.autocrlf`，不把行尾差异误判成实现漂移。未执行分支验证 `not-executed-report.json` 的零 run 和 protected counters，而不是伪造 clean run。
- [ ] 保留首次 clean 失败及原因；只修复有证据的归档闭包问题，不能放宽 checker 或删除失败记录。

**验收：** 当前 identity 能在 clean checkout 中重放；历史 clean-002 缺档仍单独显示；clean replay 不增加真实样本、不访问 Q1/held-out、不改变 readiness。

### N15：最终交接、提交与连续追加队列

**前置条件：** N0–N14 状态均有机器记录。

**文件：** 更新 `docs/skill-ir/skill-family-current-v2-source-repair.md`、`docs/skill-ir/deadline-execution-status.md`、`project_handoff.md`、`project_communication.md`、`conversation_log.md`。

- [ ] 写一页结果导航，先给类定义、独立 skill 数、输入/义务/accepted/checker 分母，再给 source blocker、归档状态、readiness 维度和剩余人工。
- [ ] 写恢复命令和每项实际状态；明确 `verified`、`bounded-positive`、`source-blocked`、`historically-unrecoverable` 的含义。
- [ ] 只暂存本计划涉及的文件，按功能提交并推送 `origin/skill-ir-aot`；不执行 `git add -A`，不删除历史未跟踪材料。
- [ ] 执行一次必要验证：相关 focused tests、`bun run typecheck`、文档链接测试、`git diff --check`、当前/远端 HEAD 对齐。不要重复全仓历史审计。
- [ ] 若用户没有停止，继续以下有明确产物的追加队列：
  - A1：从 N12 共性失败实现第二轮共享修订，并用全新 development 输入验证；
  - A2：补充 10–20 个不同 owner 的 skill 正文和反例，更新类边界而不修改既有分母；
  - A3：对 native pytest/JUnit、OpenAPI 3.1、外部 response 和 form/wire 能力各选一个有输入的缺口做属性测试；
  - A4：在可获得真人时做小规模 authoring/review 分钟对照；不可获得时保持 `not-measured`，不让模型模拟真人结论。

**验收：** 当前分支推送、状态可恢复、报告可 clean replay；最终主张只使用 N2.2 的等级之一。N15 完成不等于“所有 skill 自动化”，但必须能回答“这一类哪些成员/职责/输入已经自动化、哪些仍需要人工、失败为何发生”。

## 6. 七个遗留问题的处理结果合同

| 问题 | 本计划的处理 | 可接受终态 | 禁止的表述 |
|---|---|---|---|
| source correctness | N3 统一闭包 + N4/N5 权威来源核验 | `pass`、`partial` 或 `blocked`，逐引用有证据 | “checker 通过所以 source 正确” |
| Meilisearch 缺失引用 | N4 查上游历史/发布定义，找到才建立新 source identity | `authoritative-recovered` 或 `source-blocked-unresolved` | 猜 `total` 的名字、位置或语义 |
| Bangumi advisory | N5 逐项解析外部 response refs，分离 response advisory 与 construction obligation | 32 refs 有状态，19 operations 有前后对照 | 把 advisory 清零写成 live API 正确 |
| clean-002 缺档 | N6 搜索对象和归档，找不到就终止为不可恢复并新建 current clean | `recovered-exact` 或 `historically-unrecoverable` | 复制新 clean 冒充旧原件 |
| 旧 `0/6` | N2/N15 建立 bridge baseline；旧报告只读 | 历史 baseline + 新 identity 的独立结果 | 改写成新方法成功或失败 |
| readiness | N7 拆成 method/source/input/capability/transfer/reproducible | 每个维度可独立派生 | 用一个 boolean 覆盖所有层 |
| prospective boundary | N9–N12 新 identity、先锁选择和预测、再读取和运行 | `prospective-ready` 后有真实首跑，或 execution 前 `insufficient-evidence` | 复用旧输入、先看答案再写预测 |

## 7. 失败、重试、成本与安全策略

### 7.1 网络和 GitHub

- `403/429`：读取 rate limit/Retry-After，使用认证 `gh api` 或 raw commit URL；对同一请求最多一次有界退避，随后继续下一个候选。
- 仓库没有 `SKILL.md`、许可证或直接资源：保留 partial bundle，标 `resource-closure-incomplete`，不从中构造正例。
- GitHub search quota 耗尽：使用已取得仓库的 tree/contents、issue/release/history 做深读；不要把 search response 计作 skill body。

### 7.2 模型、远端 API 和付费

- 无响应或 billing 不返回：保存请求和状态，usage=`unknown`，继续确定性任务；不重复同一 prompt 直到出现好结果。
- 付费调用无硬性人工金额上限，但每次必须对应 N1 类判定、N3/N4 source 归因、N10 对照或 N12 预测/构造；结果账本分开记录 `modelCalls/apiCalls/paidCalls`。
- 不把开发代理 token 计入项目运行成本；若宿主不提供，写 `unmeasured`。

### 7.3 代码和 checker

- 构造器失败：先判断是否合同内；合同外写 `unsupported-by-contract`，合同内才进入 N8 shared repair。
- checker 失败：保留 artifact 和 checker report，只允许一次有证据的共享修订；不能删除失败行或放宽 predicate。
- TypeScript 或 broad benchmark 出现历史兼容簇：按文件/测试隔离，修复本计划新代码，不把既有失败伪装成全仓绿色。

### 7.4 最小必要边界

只保留四类门：受保护输入隔离、历史证据不可覆盖、权威 source 修复判定、prospective 预测先锁。普通本地改动、确定性测试和可逆文档更新不增加人工 approval 或重复审计。

## 8. Definition of Done

本计划达到最小交付的必要条件是：

- 一个独立于实现名称定义的 skill 类，有真实正例、反例和当前不支持成员；
- 至少 3 个独立 development skill 共用同一声明式映射和共享构造/checker，且至少一个能力由两个成员的真实输入支持；
- source closure 对 local/external/cyclic/missing refs 有独立结果，Meilisearch 与 Bangumi 的状态逐项可解释；
- 当前候选包含自己的验证入口，能在 clean checkout 复现；旧 clean-002 的恢复/不可恢复结论与当前 clean 分开；
- readiness 至少拆成 method/source/input/capability/transfer/reproducible；
- readiness 同时派生 `prospectiveReady`，并能解释其为 false 的具体缺失条件；
- 新 prospective 的 selection、prediction、first-run、revision、成本和失败分母齐全，或在 execution 前明确 `insufficient-evidence`；
- 结果报告可以按 `skill → responsibility → input → operation → artifact/checker` 回溯；
- 代码、测试、组件文档、状态、交接和 `origin/skill-ir-aot` 同步。

即使满足上述条件，最终主张仍限于“有来源依据、可独立核验的该类职责切片”。只有在 N12 的预注册阈值实际达到时，才能写 `bounded-positive`；否则如实保留负结果或证据不足。

## 9. 恢复命令

```text
cd /d D:\skill优化\SkVM
git switch skill-ir-aot
git status --short --branch
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=status
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=resume
```

`--step=resume` 必须读取本 identity 的 `execution-status.json`，从第一个未完成 N 项继续；已完成的网络/模型请求、历史报告和 protected input 不得重复读取。若新脚本尚未创建，先执行 N0–N2 的离线准备并把缺少入口记录为 `not-started`，不能假装 resume 已运行。
