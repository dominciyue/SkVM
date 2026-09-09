# API Tester 操作级准入与验证

本文档描述 2026-09-09 开始的 additive development 流水线。历史 Task 1/Task 2 只处理 v2 migration 已暴露的六份真实 OpenAPI 文档，
把 whole-document 首拒绝展开为完整 operation universe、逐操作准入解释和可验证局部产物；后续 ordinary-input 入口把同一方法用于一份
manifest-bound 普通输入。验证与冻结仍只使用六份已暴露来源和确定性 synthetic。它不修改或重新解释冻结 001/002。

## 身份与状态

- Task 1：`skill-ir-api-tester-operation-admission-development-001`；
- Task 2：`skill-ir-api-tester-operation-validation-development-001`；
- combined：`skill-ir-api-tester-operation-development-001`；
- dependency-verification revision：`skill-ir-api-tester-operation-dependency-verification-revision-development-001`；
- ordinary-input entry：`skill-ir-api-tester-operation-input-development-001`；
- delivery/freeze evidence：`skill-ir-api-tester-operation-delivery-freeze-development-001`；
- prospective candidate runtime binding：`skill-ir-api-tester-operation-candidate-binding-002`；
- 当前状态与恢复命令：[执行状态](api-tester-operation-development-status.md)。
- 未见输入研究的当前状态与恢复命令：[prospective 执行状态](api-tester-operation-prospective-research-status.md)。

设计合同见 [design](../superpowers/specs/2026-09-09-api-tester-operation-admission-validation-design.md)，逐文件步骤见
[implementation plan](../superpowers/plans/2026-09-09-api-tester-operation-admission-validation.md)。Task 1 的 source、admission、coverage、
runner、report 与 strict verifier 已完成；Task 2 可靠性验证继续在同一开发分支实施。

## 组件边界

源枚举、准入、独立覆盖和 artifact correctness 是四条不同职责。覆盖 verifier 必须重新读取原始字节，不能接受 constructor 列表作为
全集。准入只在依赖保持投影上调用未修改的 v2 contract builder；accepted operation 按原文档聚合后复用未修改的 v2 generator/checker。
原始 OpenAPI 与许可证继续留在 external cache，仓库只保存来源摘要、派生合同/产物和 compact report。

## Source inventory 与 projection API

`src/skill-ir/api-tester-operation-source.ts` 提供：

- `parseApiTesterOperationSource(text, format)`：用 YAML 1.2 core schema 与 unique-key 检查解析 JSON/YAML，并返回 parsed document、
  operation universe 和 explicit unresolved；JSON 另经 `JSON.parse` 约束，不能把 YAML 当 JSON 接受。
- `projectApiTesterOperation(document, key)`：只保留一个 method/path，并把 path/operation parameters 按 `(in,name)` 的 OpenAPI override
  语义合成为 effective operation parameters；global security 显式落到 operation，operation override（包括 `[]`）保持。
- `aggregateApiTesterOperations(document, keys)`：用同一规则合并多个目标 operation；拒绝空或重复 key。

每个 source operation 包含稳定 `METHOD /path` key、JSON Pointer locator、operationId/summary、effective parameter origin 与 override
locator、request media types、response status、effective security source/schemes 及 reference locator/resolution/是否属于 construction
obligation。path-item `$ref` 因可能隐藏 operation 使 enumeration incomplete；无法解析 parameter identity 也显式 unresolved。

投影保留 `openapi`、`info`、top-level metadata、components、global security、path metadata，以及目标 operation 的完整 request/response；
删除其它 operation 与非目标 top-level webhooks/callbacks。dependency flags 分列 parameter inheritance、security、reference closure 和
request/response preservation。construction-obligation external/missing/invalid/cyclic/sibling ref 令 projection fail closed；仅 response
payload ref 按既有 v2 合同记录为非构造义务。

## Admission 与独立覆盖 API

`src/skill-ir/api-tester-operation-admission.ts` 提供 `analyzeApiTesterOperation`。每个 operation 先单独投影，再由完整审计器记录所有可定位
缺口，最后调用未修改的 `buildApiTesterProductionContractV2` 记录 v2 的首个拒绝。finding 分类为 `unsupported-syntax`、
`semantics-not-preserved`、`missing-public-construction-evidence` 或 `implementation-failure`；首拒绝始终标记
`completeGapSet: false`。只有投影完整、finding 为空、v2 返回恰好一个匹配 contract operation 时才是 accepted。非预期异常和无法闭合的
枚举/依赖均是 unresolved；`verifyApiTesterOperationAdmissionConsistency` 阻止带 finding、首拒绝或空 normalized contract 的假接纳。

`src/skill-ir/api-tester-operation-coverage.ts` 不导入 source/admission/constructor 清单。它用原始字节独立解析 operation universe，并由
`verifyApiTesterOperationCoverage` 比较 analyzer 的完整键集、重复、locator/operationId/summary 漂移，以及 accepted 集在 projection、contract、
artifact 四层的精确守恒。`verifyApiTesterProjectionDependencies` 独立比较 effective parameters、local reference targets、effective security、
requestBody 和 responses；因此 coverage completeness 与 artifact correctness 分开报告。

2026-09-09 的后续审计确认旧实现只比较第一层 `$ref` 目标、未把 response refs 纳入闭包，且 security 只比较 requirement 名而未比较
scheme 定义；因此旧 Task 2 的九类 fault 通过不能继续表述为完整依赖核验无缺陷。修订设计与执行计划分别见
[dependency revision design](../superpowers/specs/2026-09-09-api-tester-operation-dependency-verification-revision-design.md) 和
[dependency revision plan](../superpowers/plans/2026-09-09-api-tester-operation-dependency-verification-revision.md)。旧报告不改写；新 identity
以一项不变 control、三项已确认 false pass、同六来源重跑和新的 clean checkout 复现追加时间序列证据。

修订后的 `verifyApiTesterProjectionDependencies` 从 source/projected operation 自行建立四类 root：effective parameter、request、response、
effective security scheme。每个 local ref target 以 canonical raw value 形成图节点，target 内嵌 ref 继续扩展；`(role, pointer)` visited key
使共享 target 与递归 cycle 有界。返回值在既有六个 preservation checks 之外增加：

- `dimensions.projectionPreservation`：四类 roots 与 reachable target 是否保持；
- `dimensions.constructionObligations`：parameter/request/security 的构造义务是否有效并保持；
- `dimensions.sourceValidity`：所遇 reference/scheme 能否在 source 中有效定位；
- `sourceIssues` / `projectedIssues`：带 role、locator、reference 和 construction-obligation flag 的独立问题。

response payload ref 明确不计 v2 construction obligation：相同但缺失的 response target 可令 source validity fail 而 construction obligations
保持 pass；一旦可解析 target 在 projection 中漂移，projection preservation、response 与 reference checks 必须 fail。新的运行入口为：

```powershell
bun ./src/skill-ir/api-tester-operation-dependency-verification-revision-run.ts `
  --root=. --cache-root=<six-source-offline-cache> --node=<node.exe> --git=git --out=<fresh-result> `
  [--clean-root=<detached-revision-checkout> --clean-report=<relative-clean-report>]
```

不提供 clean 参数时生成 reproduction-only report；最终 development checkout 运行同时读取 detached report，把 clean comparison 闭合到主报告。
所有输出均要求新目录、write-once，并由 strict verifier 重新核对 implementation digests、旧 Task 1、fresh replay、六 inventories、artifact
closure、三项 detector 和 source blocker。strict verifier 还调用 Git 读取被验证 checkout 的真实 commit/detached 状态，并要求它们与 report
声明完全相等；因此报告不能仅靠复制和重算 portable digest 冒充另一提交的精确复现。

实际修订提交为 `a359c0c68862637153b98a7f7ae797de35e0564c`。新报告
`results/skill-ir/api-tester-operation-dependency-verification-revision-development-001/report.json` 记录：旧漏检 `3/3`、修复后正确检出
`3/3`，unchanged control pass；同六来源的 universe/admission/dependency/checker/obligations 五项 aggregate comparison 全为 true。实际 totals
仍为 562、112 accepted、449 rejected、1 unresolved、112 checked、575/575 obligations，但 runner 从报告导出这些分母，没有把 112 编入
验收条件。112 项 accepted projection/construction 全过；Bangumi 的 19 项因 32 个 external response refs 记为 source-validity unverified，
这些 refs 均是 non-construction response dependencies。detached clean reproduction 与主运行的 run semantic SHA-256 同为
`5e296dbce15421298f0d5ba298b7de220ccc7ac712a8ecaa44996c7201e4f036`；最终 portable SHA-256 为
`206bdea5809c322fa01bf10ffe6af408abf0a081f9ed8813d0cdda1a347cc98c`。

## 普通输入 entry 与 strict output verifier

`src/skill-ir/api-tester-operation-input.ts` 是独立于固定六来源 development runner 的一文档入口。对应 CLI
`src/skill-ir/api-tester-operation-input-run.ts` 只接受：

```powershell
bun ./src/skill-ir/api-tester-operation-input-run.ts `
  --root=<input-root> --manifest=<manifest.json> --node=<node.exe>
```

manifest schema 为 `skill-ir-api-tester-operation-input-manifest/v1`，必须绑定 caller `bindingId`、不变的
`api-tester-openapi-subset-v2`、safe-relative input path、`json|yaml`、bytes/SHA-256 和 previously-absent output path。
入口不接收 cache、旧 selection/lock/report、row id 或预期成功数，也不导入固定六来源 runner。input/manifest/output 禁止路径重叠和
symlink traversal，输出采用 exclusive-create-once。

运行时先统一建立 source/admission 结果，再对 accepted operation 独立核对 dependency；满足 gate 时聚合投影并调用原 v2 artifact、generator
和 checker。输出包含 `operation-inventory.json`、`report.json`、`output-manifest.json`，有 accepted artifact 时再包含
`projected-input.json`、exact v2 package、generated plan/report、validation 和完整 v2 run report。报告分别给出 operation counts、checker-pass、
obligation coverage、implementation/source correctness 和 document disposition。`partial` 不等于整份文档成功。

`verifyApiTesterOperationInputOutput` 重新读取 manifest/input bytes 和 exact output closure；重做 live admission、独立 raw-source coverage、
source-to-projection dependency、v2 package/contract/generated operation 守恒与 portable semantic digest。公共纯函数
`verifyApiTesterOperationInputSemantics` 可在不信任 output report 的条件下检查 analyzer omission/duplicate、dependency loss 和 accepted-set
artifact loss。修改 input、inventory、artifact 或增加未声明文件都会 fail closed。

## 未见输入候选的生产运行依赖绑定

2026-09-10 的新未见输入阶段不修改候选 001，而是新增
`src/benchmarks/skill-ir/api-tester-operation-candidate-binding.ts` 和对应 CLI
`api-tester-operation-candidate-binding-run.ts`。绑定器从普通输入入口出发，用 TypeScript AST 递归解析相对静态 import/export，分别记录本地运行
模块、type-only 本地模块、Node built-ins、由 `package.json`/`bun.lock` 锁定的第三方依赖以及无法解析的加载。动态或非相对运行加载、闭包中的
missing/extra 文件、Git/working byte drift、entry/runtime/package/lock drift 和外层 prospective verifier drift 都会在读取输入前 fail closed。

机器绑定位于
`benchmarks/skill-ir/classification/api-tester-operation-candidate-binding-v1.json`。其 execution commit 为
`74338e73a4f6dae389c9d62ce84173c2d1672906`，冻结提交为 `13c5d79`。审计得到 11 个本地运行模块；相对候选 001 唯一新增的两个运行依赖是既有
`src/benchmarks/skill-ir/source-fixture.ts` 与 `src/skill-ir/api-tester-production-contract.ts`。`source-fixture.ts` 对
`src/skill-ir/schema.ts` 的导入仅为 type-only，未伪装成运行闭包。Node built-ins 为 `node:crypto`、`node:fs/promises`、`node:os`、
`node:path`；第三方集合为 `yaml`、`zod`；unresolved import 为 0。候选 001 的九项 implementation digest、支持合同与 operation 算法均未改变，
绑定状态仍为 `inputSelection=not-started`、`predictions=not-authored`、`prospectiveRuns=0`。

创建模式只用于新的 write-once 路径；已冻结文件的通常复核使用：

```powershell
bun ./src/benchmarks/skill-ir/api-tester-operation-candidate-binding-run.ts `
  --mode=verify --root=. --node=<node.exe> --git=git
```

验证器从绑定的 execution commit 重读 checkout-filtered Git bytes，同时核对当前 working bytes，因此依赖文件被修改、摘要被伪造或闭包项被删除
都会失败。该绑定只证明候选的本地静态生产依赖闭包和环境绑定完整，不证明输入上的准入率、整份文档成功或真实 API 行为。

Task 1 收口时的 fresh verification 为：binding focused `5/5`、相关 operation/v2 `40/40`、`src/skill-ir` `189/189`
（990 assertions）、typecheck 通过、文档单测 `8/8`、3664-file link scan 无 broken/legacy reference。基线到 Task 1 的候选 001、ordinary
entry、source/admission/coverage 与 v2 contract/artifact 指定文件 byte diff 为空；`git diff --check` 通过。

上一交付阶段的冻结设计见 [delivery freeze design](../superpowers/specs/2026-09-09-api-tester-operation-delivery-freeze-design.md)，执行步骤见
[delivery freeze plan](../superpowers/plans/2026-09-09-api-tester-operation-delivery-freeze.md)。候选 001 与本节的新运行依赖绑定均已冻结；Task 2 的真实输入仍未选择，预测未写，prospective 未运行。

## Task 1 runner、报告与严格核验

`src/skill-ir/api-tester-operation-development.ts` 提供 `runApiTesterOperationDevelopment`、
`verifyApiTesterOperationDevelopmentReport` 和 portable semantic digest。runner 先核对 development contract、selection、002 lock/report、
两个失败 attempt 与 external cache 来源/许可证字节，再统一处理六份文档。每个 accepted 集合按来源生成一个 v2 artifact；strict verifier
随后重新读取总报告、前置证据、六份 inventory、五个 package closure、plan/report/validation，并逐项核对 digest、operation 集与 checker
状态。`--out` 必须指向不存在的新目录，避免覆写证据。

离线运行入口（仅允许六份已暴露 cache；不得调用冻结 first-run runner）：

```powershell
bun ./src/skill-ir/api-tester-operation-development-run.ts --root=. --cache-root=D:/skill优化/.tmp-api-v2-feature-migration-20260908 --node=<node.exe> --out=<fresh-result>
```

最终机器报告在
`results/skill-ir/api-tester-operation-admission-development-001/report.json`。六份文档共 `562` 个 operation，结果为
`112 accepted / 449 rejected / 1 unresolved / 112 checked`，验证义务 `575/575`。OpenGrok、Meilisearch、Bangumi、DeepL、HFS 分别有
`10/38/19/37/8` 个 accepted operation；Box 为 `0`。唯一 unresolved 是 Meilisearch `GET /tasks` 的原始 source 缺少
`#/components/parameters/total`；因为参数继承无法证明，总 correctness 有意保持 fail。两次早期运行分别暴露 document-wide dependency
block 与 overbroad unresolved classification，报告以 attempt-001/002 保留并由合同绑定。

当前聚焦验证命令为：

```powershell
bun test ./src/skill-ir/api-tester-operation-input.test.ts ./src/skill-ir/api-tester-operation-development.test.ts ./src/skill-ir/api-tester-operation-development-run.test.ts ./src/skill-ir/api-tester-operation-admission.test.ts ./src/skill-ir/api-tester-operation-coverage.test.ts ./src/skill-ir/api-tester-operation-source.test.ts ./src/skill-ir/api-tester-production-contract-v2.test.ts ./src/skill-ir/api-tester-production-artifact-v2.test.ts
bun run typecheck
```

严格 verifier 的最后一个 TDD 回合为先观察缺少导出的 RED，再通过对已提交证据的独立重放转 GREEN。完整新鲜回归计数在阶段日志与执行
状态中记录。测试包含遗漏、重复、摘要漂移、依赖/安全丢失、多缺口、首拒绝不完整、unexpected implementation failure、false
acceptance、报告摘要漂移与 artifact closure 漂移。

## 保护与失败方式

重复键、path-item ref 或无法可靠枚举的结构输出 explicit unresolved。无法证明参数继承、ref closure、安全、request/response 语义保持的
operation 拒绝；未知异常归为 implementation failure。首个 v2 rejection 单列且声明并非全部缺口。checker 失败不能通过删 obligation、放宽
checker 或 source-specific 代码修复。

本阶段 runtime 禁止 network/model/API/paid，保持 held-out/Q1 reserved/prospective/第二 profile/Q4/portfolio/readiness 关闭。真实局部通过
不等于整份文档成功、任意 OpenAPI 支持或真实 API 行为验证。

## Task 2 变形、故障检出与 clean reproduction

`src/skill-ir/api-tester-operation-validation.ts` 预登记六类变换的 applicability、expected relation 和 comparison fields，并提供
`evaluateApiTesterOperationTransform`。对象键/路径/operation 顺序、纯格式、JSON/YAML、无关 `info.description` 都要求完整 operation
universe、准入状态、完整 findings、normalized semantics 和 coverage 保持；v2 fail-fast 首拒绝只比较稳定 code，不比较 unsupported-key
文案中的非语义排列。新增 unsupported operation 要求既有 operation 不变且新增行显式 rejected。local-ref/inline 只在 accepted operation
存在 pure resolved construction ref 时适用；Box 无 accepted operation、HFS accepted operation 无这类 ref，均明确记为 not-applicable。

同模块的 fault runner 用独立 coverage、dependency verifier、admission consistency 和 v2 checker 检出 operation omission/duplicate、
parameter/reference/security dependency loss、summary drift、false acceptance、artifact endpoint loss 和 boundary witness loss。detector fixture
是确定性 synthetic，只检验 detector，不计真实成功。

strict report verifier 还会把每个 case 的 comparison fields、applicability/status/reason/derived evidence 锁到 transform registry，并把九类
fault 的 detector layer 与 stable code 锁到实现 registry。这样只改报告并重算 portable digest 不能冒充预登记关系或正确 detector。

最终 Task 2/combined runner 位于 `src/skill-ir/api-tester-operation-validation-run.ts`。它禁止调用方覆盖结果分支，strict-read Task 1 提交与
实际报告后自动选择 `real-positive`；对六文档运行 `6 × 6 = 36` 个派生关系，核对 detached Task 1 worktree 的锁定离线安装与新 Task 1
输出，再 exclusive-create 两份报告。入口：

```powershell
bun ./src/skill-ir/api-tester-operation-validation-run.ts `
  --root=. `
  --cache-root=<digest-bound-offline-cache> `
  --clean-root=<detached-task1-worktree> `
  --node=<node.exe> `
  --git=git
```

实际结果为 36 derivatives、34 applicable/pass、2 typed not-applicable、9/9 faults detected，clean reproduction 的 portable digest、totals、
gates、obligations 和全部 inventory/artifact digests 与 Task 1 相同。Task 2 portable SHA-256 为
`d9a97e917179927437ea5a2aea547652ac3899feea1ec179f0b0c5d2d8ee02a0`；combined portable SHA-256 为
`bbf927bf6f3f29c75a70bf1fcbe2074373ce43255dafe202e8889a2e14960e61`。bounded reliability 和 implementation correctness 为 pass，
source correctness 因同一个 Meilisearch 缺失 ref 明确为 blocked；总状态是 `completed-with-source-blocker`，不是全 OpenAPI correctness pass。

面向复核者的两任务汇总、证据哈希、复现入口和后续建议见[总报告](api-tester-operation-development-final-report.md)。
