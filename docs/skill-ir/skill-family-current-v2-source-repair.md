# API 合同任务引擎：接口设计与执行入口

**状态：revision-2 交付已完成，最终为 `completed-with-engineering-shortfall`，2026-09-12。** N4/N6/N10/N13/N15 带 limitation，N9/N11/N12 未执行，其余阶段完成。已有 request/schema/response/pytest 能力见 [审查依据](skill-family-plan-review-20260912.md)；实际执行按 [N0–N15 任务书](../superpowers/plans/2026-09-12-skill-family-source-repair-and-prospective.md)，机器状态和最终报告在 `results/skill-ir/skill-family-current-v2-source-repair-001/`。

## 目标和接口

普通用户提供 OpenAPI 3.0.x JSON/YAML 文件及 task.json；可附本地依赖、response observations、独立 loopback oracle。任务描述需要哪些操作、最小/完整请求、遗漏/约束负例、响应校验及 request-json/pytest 输出。不得要求用户先写研究 selection/ledger/identity。

拟定 task.json 示例（假设 api.yaml 已由用户提供；不表示该文件随本组件交付）：

~~~json
{
  "schemaVersion": "skvm-api-task/v1",
  "taskId": "request-smoke",
  "profile": "oas30-offline-test/v1",
  "input": { "path": "api.yaml", "format": "yaml", "dialect": "oas3.0" },
  "dependencyManifest": null,
  "operationKeys": "all",
  "requirements": [
    {
      "id": "minimal-request",
      "kind": "valid-minimal",
      "required": true,
      "scope": "each-selected-operation",
      "sourceLocator": "user-declared:task.json/requirements/0"
    }
  ],
  "output": "request-json",
  "observations": null,
  "execution": { "mode": "offline-validation" },
  "mapping": {
    "origin": "user-declared",
    "sourceSkill": null,
    "unresolvedRequirementIds": []
  }
}
~~~

计划先校验 task，再枚举每项 requirement 对应的 operation/case，通过现有共享构造和独立 checker 输出 bundle。来自 SKILL.md 的映射必须带原文定位与完整剩余职责；声明未知就返回待审核，不隐式转为已支持任务。

## 产物与语义

包包含任务、来源依赖、计划、请求数据、checker 结果及所选输出后端所需文件。request-json 可离线检查；pytest 包额外包含既有 Python runtime、suite data、依赖说明，按明确 oracle 在本地运行。

taskComplete 表示全部适用必需义务已满足并按要求导出；executionComplete 单独反映真实运行。无法构造、未支持、依赖缺失和 skip 分列。没有业务 oracle 时不能猜测状态码；response observations 只证明提供的响应与合同一致。

source closure 以 URI/pointer 图解析，response ref 是否必需由 task 决定。合法递归可以解析成功而有限 witness 构造未解决。profile/version 不支持时返回明确原因，不把 OAS3.1 当 OAS3.0。

## 状态与恢复入口

N0 新增 `scripts/skill-ir/skill-family-current-v2-prospective.ts`。它严格读取 `stage-manifest.json` 与 `execution-status.json`，核对任务集合、依赖无环、完成顺序、证据相对路径和保护计数，再派生工程、研究、维护三条状态。`status` 不写文件；`resume` 只返回首个可运行任务及其验收/证据目标。N1 已接入 `--step=n1`：先用同一构建器重核归档输入摘要，再以 write-once-or-byte-identical 方式写三份 corpus 账本，最后才推进持久状态；部分写入不会被误记为阶段完成。

~~~powershell
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=status
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=resume
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=n1
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=n2
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=n3
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=n4 --legacy-cache-root=<absolute-path> --exploratory-source-api-calls=<count>
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=n5 --python=D:\anaconda\python.exe
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=n6
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=n8
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=n10-lock --locked-at=<ISO>
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=n10-revision --evaluated-at=<ISO>
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=n7 --evaluated-at=<ISO>
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=n9-gate --evaluated-at=<ISO>
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=n13 --schemathesis=<path-to-4.27.0-executable> --evaluated-at=<ISO>
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=n13-revision --schemathesis=<path-to-4.27.0-executable> --evaluated-at=<ISO>
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=n13-revision-002 --schemathesis=<path-to-4.27.0-executable> --evaluated-at=<ISO>
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=n13-reclassify --evaluated-at=<ISO>
~~~

当前 `status`/`resume` 定位 N14；再次运行已完成阶段会重核已有输出，不回退状态，也不重复发网络请求或累计成本。持久状态同时记录实际 base commit、Bun/Node、公开曝光、历史 `0/6`、held-out/Q1/prospective 计数、成本分栏、未解决事项和下一动作。`completed-with-limitation` 的维护任务不会阻止依赖已满足的工程任务；不可能的完成顺序、绝对证据路径和依赖环 fail closed。

## N1 语料账本

`src/skill-ir/skill-family-current-v2-corpus.ts` 从已提交 class-proof/source-input 归档读取正文、直接资源、职责清单、metadata-only 候选和 API 文档。它不靠仓库名改变成功语义；逐项核对长度/SHA-256、职责 locator、旧计数、来源数、metadata 暴露状态和 API 解析结果。输出位于 `corpus/{source-ledger,duty-matrix,exposure-ledger}.json`。

本批次为 12 份正文、6 个仓库来源、42 个直接资源、498 项职责；4 个 N2 映射候选来自 4 个仓库并保留 residual scope。12 份 API 合同覆盖 6 个 provider，但均是同一 aggregator repository 的镜像；原始 upstream URL 没有旧证据，因此保持 null/unresolved。5 个 metadata-only 候选没有读取正文。该账本是有目的的 development corpus，不是随机生态样本，也不支持谱系独立率、whole-skill 或人工节省结论。

## N2 TaskContract 与计划层

`api-task-contract.ts` 提供严格 Zod parser、公开 JSON Schema 和 `api-skill-mapping/v1` 只读适配器。路径只能相对 task 文件；profile 固定 OAS 3.0；requirement id、operation key 和 unresolved binding 去重并闭合；未知字段拒绝。适配器要求显式声明原 obligation 的 requirement 语义，必须保留完整映射集合、parentScope 和 residual duties，不从仓库/profile 名猜测。

`api-task-plan.ts` 在构造前把每个选中 operation × requirement 展成可定位 obligation。required omission 按真实必需参数/body 展开；constraint negative 按真实 request schema slot 展开；没有实例时记录 `insufficient-input`；未决自然语言映射记录 `unresolved-mapping`；response 没有 observation 也保持不足。`evaluateApiTaskCompletion` 要求所有适用必需 obligation 均为 `checked-exported`，单个成功不能完成任务。`api-task-plan-checker.ts` 从原 TaskContract 与 OpenAPI 重新枚举全集，不把 builder 的列表当真值。

N2 证据 `baseline/gap-matrix.json` 在同一已暴露 API 操作上绑定三种来源职责，证明 requirement/output 改变语义而来源名称不改变；第三个 pytest/fuzzing 任务的广义 fuzzing 仍 unresolved。当前只证明计划和分母，不证明构造、package 或 native execution；这些明确留给 N5/N8。

## N3 task-relevant source closure

`api-tester-source-closure.ts` 使用 TaskContract 决定引用角色与严重性，并从原 OpenAPI operation 重新遍历 request、response 和 security roots。外部文件必须先进入 `skvm-api-dependency-manifest/v1`，以 canonical URI、相对本地路径、格式和 SHA-256 绑定；运行期只解析已提供字节，不联网、不执行内容。每个 occurrence 保留 origin URI/locator、原 `$ref`、target URI/pointer、acquisition/source/witness 状态、dependent requirement 和 affected operation。

request-only 对未解析 response ref 记 advisory；response-conformance 对同一 ref 阻塞。结构递归可以是 `recursive-resolved`，同时有限 witness 为 `unresolved-recursion-budget`；纯 Reference Object 环、缺 pointer、缺 manifest resource、OAS3.0 sibling 和不支持 dialect 分别报告。operation×requirement 状态独立，因此单个坏引用不会全局抹掉未受影响操作。资源、深度和 occurrence 预算固定；达到上限返回 resource-limit，而不是继续展开。

N3 报告重放三份真实 development 计划和 8 个确定性合成 case。真实结果只证明已暴露字节的任务相关引用闭包，不证明 aggregator 原始上游、实时 API 或 schema witness 构造成功。

## N4 限时历史 source 维护

`skill-family-current-v2-n4.ts` 从旧 experiment lock 和 dependency-verification inventory 重建固定问题分母，再用一次 GitHub GraphQL 内容批次取得维护者 metadata 与 Bangumi 固定提交的完整组件目录。传入的旧 external cache 先按锁定 SHA/bytes 检查，并连同对应许可证复制到 write-once evidence cache；四份原始 CRLF 文本通过精确路径 `-text/!eol` 属性保存原字节，避免 Git clean filter 改变摘要。正式批次失败才允许同查询重试一次。strict verifier 从提交中的 lock/inventory、归档源字节和原始 GraphQL snapshot 重算两个报告，任何绑定、查询、32-reference 分母或递归闭包漂移均失败。

正式 code=`81f4a35ae8259aabd1880f76c8b6b1030ddff0b6`。Meilisearch 维护者仓库已归档，default head 仍等于旧锁提交、release 为空；`GET /tasks` 缺失 `#/components/parameters/total` 因而继续 `source-blocked-unresolved`，报告 SHA-256=`1706d1f9fa06fd47ee0b708ca911035098bae6a17ae4e3018325726650ff8dd8`。Bangumi 32 个历史 `REFERENCE_EXTERNAL` issue 覆盖 19 个 accepted operation，全部为 response-only/non-construction；一次批次取得 4 个根资源及 User 的两项嵌套依赖，共 6 个资源、0 unresolved，报告 SHA-256=`fd8fc90fe7541319c88718151becde5e9faa3a2b1f2b51b5c4a82fd5fd7966c8`。它是新 development closure identity，不回写旧 advisories，也不证明 live API 或整文档正确。探索 metadata 1 次、正式获取 1 次、retry 0，source/business/model/paid=`2/0/0/0`。

## N6 限定历史归档检索

`skill-family-current-v2-n6.ts` 固定旧 clean-002 相对路径和 expected SHA-256，从 Git 的 worktree 清单建立有限根目录，只检查每个根下的精确路径；随后运行 exact-path history 和 path-limited named-object 查询，并核对 8 份已知 delivery/clean/retry 归档。只有查询返回明确 commit/object 时才逐对象读取；无线索不运行整库 unreachable-object 枚举。原始命令、输出、退出码、候选摘要和明确未执行的扩大范围均写入 write-once transcript，strict verifier 从 transcript 与已知归档字节重算报告。

code=`9532e9a04fd0feed2317d66dc65bf61f9108b9b1` 的唯一搜索检查 21 个已知 worktree，精确文件 0；Git history/named object 均 0；8 份已知归档中 3 份提到旧路径和摘要，但没有任何文件字节匹配 expected SHA-256。报告 `archive-recovery/clean-002-search.json` SHA-256=`14094e41d837e667ec96d5da99b9338879a92fb49bd2510ef9ab100bd34e70b9`，决策为 `not-recovered-within-search-scope`。两次严格重核通过且 transcript/report 摘要不变。旧缺档仍是 unresolved；这不是永久不可恢复断言，clean-003 也没有被改写成旧原件。

## N5 TaskContract 产物与原生消费

`api-task-artifact.ts` 把已核验 plan、task-scoped source closure、form-capable request specimens、JSON body negatives、可选 response observations 与用户要求的后端封装为 `skvm-api-task-artifact/v1`。request-json 后端逐 obligation 绑定请求；pytest 后端保留完整源 suite、固定 Python runtime 及 task-selected row id。当前既有 pytest runtime 尚不消费 constraint-negative row，因此该组合保持 unresolved，不借辅助 JSON 产物冒充 pytest 已执行。缺 path omission、参数负例、业务 oracle 或来源依赖时同样逐 obligation 保留原因。

`api-task-artifact-checker.ts` 从原 task 与 OpenAPI 重建计划分母和 source closure，调用现有独立 specimen/body-negative/pytest checker，再核对 response evidence、task selection、completion 和包内摘要。它不会把 emitter 的 outcome 列表当全集。普通响应只接受显式 observation；loopback runtime 只接受绑定 suite/fixture/request 的 oracle，不推测 HTTP 状态。

N5 机器报告为 `integration/consumer-report.json`。JSON/local-reference fixture 与 form/query/header fixture 各由手写 predicate 提供独立预期，各有 2 passed native case；其余无 oracle 行分别记 2 和 3 skipped。总计 4 次 loopback HTTP、0 remote/model/paid call。遗漏义务、错误 operation、错误 ref 目标、form wire、constraint witness、response body、response header 与伪造 status 共 8/8 在预登记层检出，0 漏检。该有限合成集合不支持真实 API、whole-skill 或总体检出率结论。

## N8 普通输入执行入口

`api-task-run.ts` 从普通 task.json 或 strict `skvm-api-task-run-binding/v1` 读取任务、OpenAPI、可选依赖 manifest、observations 和 loopback oracle，在创建输出目录前核对路径/格式与 SHA-256。随后统一调用 plan → source closure → construct → independent package check → bundle；request-json 直接导出，pytest 在 offline 模式只封装，在 loopback 模式先核对 oracle 对 task-selected rows 的完整绑定再执行。输出包含原始输入副本、可重放 `input-binding.json`、task package、checker、backend、run report 与逐文件摘要。

实际用户入口为：

~~~powershell
bun ./bin/skvm.js artifact task --task=task.json --out=out
bun ./bin/skvm.js artifact task --binding=run-binding.json
~~~

新入口明确标为 `development-rich-task/v1`，不改变既有 `--preset=api-tester --binding=...` production v1/v2。编译/check/replay 不调用模型；自然语言 skill→task 导入仍是独立 agent-reviewed 阶段。N8 修复两项新链正确性问题：安全要求需要凭据时不把未认证 specimen 标为完成；oracle 只覆盖未选 suite row 时在运行前拒绝，不能让 task-selected row 静默 skip。

`integration/engine-report.json` 在仓库外临时目录运行四个任务和 bundle replay；requirement、operation、output 均改变实际内容，文档 CLI 实测通过，旧 production v2 回归 10/10、37 assertions。通用三个实现文件不含已知来源名分支；本阶段 model/remote/paid/native call 均为 0。

## N10 development 面板锁

`skill-family-current-v2-n10.ts` 在运行构造前从 N1 exposure ledger 选择已暴露的 1Password、Visier、Zapier 各两份原始合同。选择只使用来源字节的静态 operation/security/reference 信息：每个 provider 至少有一个匿名操作，同时保留 1Password Partnership 与 Zapier Actions 的凭据阻塞对照；没有读取 task engine 输出。六份锁定副本共 47 个源操作，独立枚举器重建 key/locator/operationId/summary 全集。

`development/input-lock.json` 绑定两份权威账本、六份原始来源及副本摘要、九份 task 合同、逐 task operation/requirement 分母、预期 taskComplete 和 residual oracle。任务覆盖 event4u、LambdaTest、Pactflow 与 fishzjp 四个 repository-distinct 映射；Visier Authentication 与 Zapier Embed 各有一组同输入同操作、不同真实职责要求的预登记比较。六项预期完整任务覆盖三个 provider；Bearer/OAuth 与更广义 pytest fuzzing 行预期不完整并保留在固定分母。

锁的生成和独立核验不运行 constructor、baseline 或 native consumer。文件使用 exclusive create；task/source 字节变化、操作全集变化、权威账本漂移、task 分母漂移和静态正例与凭据/引用矛盾都会 fail closed。当前下一步是在锁提交推送后依次保存 source-only baseline、当前 engine first-run；发现共享正确性缺陷时另写 `revision-001.json`，不得覆盖首轮。

锁提交 `26b4566f575b886f8104d7c209b7f03a7cdbeed6` 推送后，`--step=n10-baseline` 运行 source-only 共享组件并写入 exclusive `development/baseline.json`（SHA-256=`db064d8a8bdc1eab6b0f4a9a6ed4f1f16f51d92fc430316d4e1c819a0dfc9d34`，37,888 bytes）。六份来源的 specimen/body-negative checker 全通过，Zapier Embed 额外编译并核验 pytest suite；首次/重复构建语义摘要逐来源相同，未声明或命中 cache。

基线在固定 18 个必需 task obligation 中只报告 13 个 source construction potential；由于没有 requirement binding、task package checker 或 task-selected consumer，checked-bound=`0`、taskComplete=`0/9`、native=`0`。潜在构造不能计为任务成功；Visier 表单负例与其他未覆盖项只作为首轮待观察缺口，不在 current first-run 前修改实现。

Current first-run 的九个 task 与九次预登记 repeat build 已在 engine commit `76ce3e40ce0f819d444e4a0fae911cd0095a56e1` 执行并逐行 exclusive 保存。汇总器曾因把 artifact 合同的 `completion.required` 误写为 `completion.counts` 而抛错；`first-run-aggregation-failure-001.json` 保留该现场。修复提交 `4a1f492a8d620a79646188fb1edb47ac72fdada9` 只从摘要绑定的原 package 恢复汇总字段，没有重写 row 或重跑 task。

恢复后的 `development/first-run.json`（SHA-256=`5590552d6de8fb1e9bc8cbdf8e3eb7304887cc0e7727655e780e1ba35531a63b`，112,047 bytes）通过严格核验：6 inputs、3 providers、47 operations、9 tasks、18 required obligations；9/9 package checks 通过，8 项 required obligation 为 checked-exported，10 项 unresolved，4/9 tasks complete，三个 provider 均至少一个非空完整任务。两项预期结果不匹配，两个预登记需求变化关系只通过一个，因此门为 `method-not-ready`。不匹配均来自 Visier Authentication：空 form minimal 报 `form field count unsupported`，constraint-negative 没有构造出源约束。首轮原件先归档提交；随后只对该共享正确性/能力边界做根因分析和 TDD 修订，同分母另写 `revision-001.json`。

根因决策入口将独立写 `development/revision-001.json`。它先严格重核 lock/baseline/first-run，再从锁定 source 与 task 重建 form specimens、body-negative fields/wires 和未完成 obligation；同时绑定 `api-request-form-specimens-development.md`、`api-request-body-negatives-development.md` 及对应实现文件摘要。只有当每个 expected-positive mismatch 都能由已声明的非空 form 或 JSON-only negative 边界解释、分母与首轮完全相同且没有合同内 implementation failure 时，才允许输出 `no-safe-shared-revision`。该结论不把失败变为通过，只把 N10 以 limitation 终结；任何无法归类的缺口都使 verifier 失败并要求继续修复。

实际 `development/revision-001.json`（SHA-256=`a00ceb59d729e8f0c3a058b2f478501124af7724d34dbeaa7276916fc0c0d381`，9,310 bytes）在代码提交 `6bc7e1b4eb30524989bfcba9613caa1fad5cfebb` 推送后生成并通过重算。三项 root cause 分别是一项 empty-form minimal 与两项 form constraint-negative，全部归类为 declared support-contract boundary；implementation changes 为空，首轮分母、结果与 `method-not-ready` 门完全不变。N10=`completed-with-limitation`，研究候选不具资格；下一阶段 N7 只派生非循环 readiness，不改变历史 readiness。

## N7 task/source-scoped readiness

新的 `skill-family-current-v2-readiness/v1` 只为本 identity 派生状态，不修改旧 portfolio readiness。每个维度统一为 `ready | not-ready | not-assessed`，附稳定 reason code 和 digest-bound evidence。method 只回答合同、计划、source closure、checker、native fault path 与普通入口是否可运行；capability 单独读取 N10 实际门。每个 task 的 source、input 与 capability 分开，单个凭据/媒体/映射阻塞不传播给其他 task。

protocolReady 只依赖代码候选、抽样规则、评测规则和失败政策是否已锁，不要求未见正文已读；prospectiveReady 再要求授权、选定 source/input 足够、post-acquisition prediction 已锁且无 protected violation，不要求 transfer 结果或首跑报告。transfer 在零 prospective run 时必须是 not-assessed；reproducible 只依据当前普通入口、bundle replay 和原生 fixture，clean checkout 留给 N14。报告绑定 N7 code commit 中的执行状态快照，避免可变 status 自引用。

实际 `readiness/report.json`（SHA-256=`80dc732c33350764dc0db590eb7aa534d628b9ddceff968d168f1c9af8d381`，14,851 bytes）严格重算通过。method/sourceInput/reproducible/authorizedUnseenRead/protectedIsolation=`ready`；capability/protocol/prospective=`not-ready`；transfer=`not-assessed`。九个固定 task 的 source/input 均 ready，capability 为 4 ready、5 not-ready。总决策 `engineering-ready-research-not-ready`；它不改历史 readiness，也不授权绕过 N9/N11 锁序。

## N9/N11/N12 research gate

当 N10 gate 未通过时，研究链不能靠空候选继续。`prospective/not-executed-report.json` 绑定提交中的 N10 revision、N7 readiness 与执行状态，明确核对 candidate lock、prospective protocol/source lock、predictions 和 first-run 均不存在；报告不包含逐行预测或新样本身份。

实际 code commit=`e6150a67ecf0f6a6a0f496739039153fcb1ff66b`；write-once 报告 SHA-256=`77c612cd67460005f694e813d3418fdc3f6208905cd24a9f0bd5465f8a5da177`、3,894 bytes，严格重算通过，换时间戳重跑只核验原件且摘要不变。N9=`not-executed:n10-method-gate-not-ready`，N11=`not-executed:candidate-freeze-not-executed`，N12=`not-executed:protocol-and-predictions-not-locked`。所有七个禁止研究产物在绑定提交中均不存在，protected 计数仍为零。该状态允许 N14 按 terminal 依赖只复现 engineering code，不把 clean replay 称为 research candidate；当前恢复阶段为 N13。

## 实施与验证

复用 api-skill-mapping、api-schema-witness/checker、request/form/body-negative、response-observation/header 和 api-pytest-*。新增 api-task-contract/plan/run 的职责分别为任务 schema、构造前义务计划、普通输入编排；旧 API Tester v2 保持兼容。

N13 外部对照复用 N5 两个合成源和同一手写 loopback predicate。Schemathesis 固定 4.27.0、positive fuzzing、每 operation 最多 2 examples、单 worker、5 秒请求 timeout、30 秒总 timeout、零 retry 与 deterministic seed 20260912；JSON response status/header/body 三项独立故障分别要求由对应外部 check 检出。外部响应检查与本项目 TaskContract traceability 分开报告，不互相增加通过数。

首次正式运行保留为不可变失败现场：`comparison/schemathesis-report.json`=`669404a6...`，五个单元均因同时传入互斥的 deterministic 与 database 选项在发请求前退出，实际 loopback=0。该结果只证明 harness 参数冲突，不能评价 Schemathesis。修复只删除冗余 `--generation-database=none`，revision-001 另目录运行，其余输入、预算、seed、timeout、checks 和 fixture 不变。

revision-001=`44246c37...` 又暴露 Windows GBK/Rich `✅` 输出异常，仍为 0 request；原件独立保留。revision-002 仅为 Schemathesis 子进程设置 UTF-8 I/O 环境，防止控制台渲染在执行前中止，不改变生成、检查或服务器行为。

revision-002=`406af8a0...` 已实际运行 9 个 loopback 请求，但发现汇总分母 bug：三个 fault 都未实际施加，却被同时计为 detected 与 notApplicable，导致 missed=-3。JSON case 因空白序列化未满足 exact-wire predicate；form operation 为外部 schema-generation error。下一修订只重分类既有原始报告，不重复执行；faultApplied=0 必须只进入 notApplicable。

revision-003=`8577eb21e0cc98900cca483fc5767f44e4dd66a81b33f31eb9aca8d16f1f8c71` 由 code `7eee8b8bee751f5b782bb1f4933704ad87c3892f` 从 revision-002 的摘要绑定和原始 JSON/NDJSON 重分类，未调用外部工具、additional loopback=0。结果为 external baseline 0/2、baseline requests=3、valid fixture requests=0；三个 fault 全部 notApplicable，detected=0、missed=0，计数非负且分母守恒。严格验证器会拒绝 detected 与 faultApplied=0 并存以及任何分母不守恒；两次重核和 write-once 摘要检查通过。N13 以 `completed-with-limitation` 终结，不能从未实际施加的故障推断 Schemathesis 检出能力。

## N14 detached engineering replay

attempt 1 在 code `54506625f7888df73db347c54f2e7dc82d785e47` 的内部重放通过，但严格包绑定核验器检出 Windows worktree 的 `bun.lock` CRLF 字节不等于提交 blob，故没有计为通过。完整 attempt、inside report、95-file archive、unverified report 原字节和 verifier failure 均保留。修订只强制 canonical checkout bytes 并在运行前比较六项 baseline 与提交 blob，不改 TaskContract、support profile、checker 或 oracle。

attempt 2 绑定 code `b10cdce035890a0134e929f1f9fb23c33325a202`，最终报告 SHA-256=`dedb77ccea579556d10e5ad0805ec261406462670bd5b094275e38478e411a57`。N8 4/4、N10 9/9 packages（4 taskComplete；18 required=8 checked-exported+10 unresolved）、N5 direct native attempted/executed/passed/failed/errors/skipped=`9/4/4/0/0/5`；detached focused tests 35 pass/104 assertions，typecheck pass。两次主 checkout strict verify 摘要不变。该结果只证明 engineering clean replay，researchCandidate=null，不是 prospective 或 live API 结论。

## N15 final delivery

N15 实现提交 `ec4d6a1800ff26d8db9d84b896efa667abf90d34` 先推送，再从 evidence commit `53a0601aba430b89f5e5f58d0dec54fb79a3f9d7` 的 Git blobs 重算所有分母。`delivery-verification.json` SHA-256=`1272771b5b0446da37e46d1bddfebcae92e443305be34bf25b90140ec52f03b4`；focused tests 83 pass/0 fail/294 assertions，full typecheck、doc links、diff、tracked clean 与 HEAD/origin gate 均通过。`final-report.json` SHA-256=`e07e3c85861a24450bdc2e4d188ee75c9dbf0f427af73ab1eb7ccd2252a4d5d8`，两次严格重核稳定。

工程结果为 `usable-with-shortfall`：普通 `task.json` + OpenAPI 3.0.x JSON/YAML 入口可运行，固定面板 6 inputs/3 providers/47 operations/9 tasks，9/9 package checks、4/9 taskComplete、8/18 required checked-exported、10 unresolved；native attempted/executed/passed/skipped=`9/4/4/5`。研究链仍为 not-executed、candidate=null、transfer not-assessed、prospective runs=0。详见 [最终交付说明](skill-family-current-v2-final-delivery.md)。

N2 验证需求变化驱动内容、仓库名变化不驱动内容；N5 验证包在研究 runner 外实际消费和八类故障检出；N10 固定多 provider 输入；N14 验证一次代码候选 clean replay。N0 的聚焦测试命令为：

~~~powershell
bun test ./scripts/skill-ir/skill-family-current-v2-prospective.test.ts
bun test ./src/skill-ir/skill-family-current-v2-corpus.test.ts
bun test ./src/skill-ir/api-task-contract.test.ts ./src/skill-ir/api-task-plan.test.ts ./src/skill-ir/skill-family-current-v2-n2.test.ts
bun test ./src/skill-ir/api-tester-source-closure.test.ts ./src/skill-ir/skill-family-current-v2-n3.test.ts
bun test ./src/skill-ir/api-task-artifact.test.ts ./src/skill-ir/skill-family-current-v2-n5.test.ts
bun test ./src/skill-ir/api-task-run.test.ts ./src/cli/api-task.test.ts ./src/skill-ir/skill-family-current-v2-n8.test.ts
bun test ./src/skill-ir/skill-family-current-v2-n10.test.ts
bun test ./src/skill-ir/skill-family-current-v2-n14.test.ts ./src/skill-ir/skill-family-current-v2-n15.test.ts ./scripts/skill-ir/skill-family-current-v2-prospective.test.ts
bunx tsc --noEmit --pretty false --module preserve --moduleResolution bundler --target es2022 --types bun scripts/skill-ir/skill-family-current-v2-prospective.ts scripts/skill-ir/skill-family-current-v2-prospective.test.ts
~~~

历史恢复诊断仍为 `bun ./scripts/skill-ir/skill-family-class-proof.ts --step=status`；它属于旧 identity，不代替上述当前状态。上述普通任务命令已在 N8 通过 source checkout shim 实测；合成 CLI case 只证明工程入口，不计作真实或 prospective 样本。
