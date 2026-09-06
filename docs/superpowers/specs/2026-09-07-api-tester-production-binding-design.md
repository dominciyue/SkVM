# API Tester 通用生产 Binding 设计

**日期：** 2026-09-07  
**状态：** development 实现与两输入零调用证据已完成，等待边界复核/冻结
**identity：** `skill-ir-api-tester-production-binding-development-001`

## 1. 目标

为 API Tester 增加一条可由普通输入/输出参数驱动的 AOT 生产路径。调用者提供一份版本化 binding 和一份公开 OpenAPI 文件；系统在零模型调用、零网络、零安装条件下生成测试计划与事实报告，再由独立 checker 按公开 OpenAPI 合同验证产物。

本阶段要证明的是：同一套 production binding、generator 和 checker 能接纳多个新的 development 输入，而不需要 task id、prompt、fixture registry、逐任务模板或人工映射。

## 2. 当前缺口

现有 `skvm artifact --preset=api-tester --variant=...` 是冻结研究切片的产品化回放，不是通用生产 binding：

- `--variant` 只能映射到两份固定 development task fixture；
- compiler input 绑定两条冻结 task prompt；
- 输入路径和输出路径由研究 adapter 写死；
- generator 与 package checker 当前来自同一份 runtime bytes；
- byte-parity 只证明冻结 package 未漂移，不能替代新输入上的独立公开合同检查。

因此不能把旧入口改名后宣称它已支持任意新输入。

## 3. 冻结边界

### 3.1 本阶段允许

- 新增 additive production binding schema、compiler/runtime、checker 和 CLI 分支；
- 复用现有 artifact CLI 顶层入口、路径安全工具、公开 API Tester oracle 和确定性进程执行能力；
- 新增公开的 development-only 正例与拒绝样例；
- 写入 digest-bound package manifest、validation report 和统一 CLI report。

### 3.2 本阶段禁止

- 修改冻结研究 compiler、research wrapper、scorer、旧 lock 或冻结 package；
- 读取或运行 API Tester held-out；
- 选择 prospective 来源或进入 Q3/Q4；
- 调用模型、API、网络或安装依赖；
- 修改 portfolio/readiness，或把结论扩大为任意 OpenAPI、跨模型稳定性或优化后的 LLM 更稳。

## 4. 公开入口

保留现有冻结回放：

```text
skvm artifact --preset=api-tester --variant=openapi-json ...
skvm artifact --preset=api-tester --variant=openapi-yaml ...
```

新增 production binding 入口：

```text
skvm artifact --preset=api-tester --binding=<binding.json> \
  --root=<root> --workdir=<workdir> --out=<out> --completed-at=<ISO-8601>
```

`--binding` 与 `--variant` 互斥。旧 `--variant` 的解析与运行语义保持不变。

## 5. Binding 合同

首版 schema：

```json
{
  "schemaVersion": "skill-ir-api-tester-production-binding/v1",
  "bindingId": "books-api",
  "input": {
    "path": "api/openapi.json",
    "format": "json"
  },
  "outputs": {
    "plan": "generated/api-test-plan.json",
    "report": "api-test-report.json"
  }
}
```

规则：

- `bindingId` 是稳定的小写标识，不承担 research task identity；
- 所有路径必须是 POSIX safe-relative path，且 input/plan/report 三者互异；
- format 只允许 `json` 或 `yaml`，并必须与路径扩展名一致；
- binding 文件由 `--root` containment 保护；input/output 由 `--workdir` containment 保护；
- input 必须是非 symlink 普通文件；输出目标在执行前必须不存在；
- CLI 自动记录 binding 与 input SHA-256，调用者不用手写 digest；
- production package 和报告绑定这些 digest，任何执行期漂移均 fail closed。

## 6. 支持范围与拒绝合同

首版只支持一个明确的 OpenAPI 3.x 子集：

- 非空 `paths`，HTTP operation 使用标准 method；
- path/query/header inline parameters；
- `application/json` 的 inline object request body；
- 显式三位数字 response，且每个 operation 至少一个 2xx；
- 无 security，或 HTTP bearer、header API key；
- `required`、`minLength`、`maxLength`、`minimum`、`maximum`、非空 `enum`、`email`/`uri` format；
- 可以从公开合同确定性构造同时满足约束的有效值；
- required 约束必须有可用 4xx/5xx，security 必须有 401/403。

以下情况在生成任何输出前拒绝，并返回稳定 reason code：

- `$ref`、cookie parameter、OAuth/OpenID、非 header API key；
- multipart、form、非 object JSON body、嵌套/组合 schema；
- wildcard/default response 或没有 2xx；
- 未支持的约束、format、互相矛盾或无法构造的约束；
- 路径逃逸、路径碰撞、format/扩展名不一致；
- 无法唯一解释的 parameter、security 或 response 结构。

忽略 description、summary、tags 等纯说明字段是允许的；它们不参与构造或质量主张。

## 7. Package 与运行时

production compiler 生成自包含 package：

```text
artifact/
  package-manifest.json
  package-provenance.json
  binding.json
  public-contract.json
  validation-policy.json
  artifacts/scripts/api-test-generate.mjs
  artifacts/checks/api-test-check.mjs
```

manifest 至少绑定：identity、binding/input digest、generator/checker digest、支持合同版本、生成输出和资源边界。production package 使用独立 schema，不伪造冻结研究 task id，也不修改旧 validated-artifact provenance schema。

运行顺序固定为：

1. 再验 binding/input digest；
2. generator 写 plan 和 report；
3. checker 从控制器冻结的规范化公开合同独立验证 plan/report；
4. 再验 protected input digest；
5. 写 checker report 和统一 `cli-report.json`。

任一步失败即停止，不调用模型补齐、不保留“通过”状态。

## 8. Checker 独立性

generator 与 checker 是不同 entrypoint、不同 bundle、不同 digest。checker：

- 不导入 generator；
- 不调用 generator 的 `planFor`；
- 不读取 gold、task prompt、evaluator payload 或冻结 fixture registry；
- 从控制器由公开 OpenAPI 派生并冻结的 `public-contract.json` 读取 operation/constraint/security/response 义务；
- 对 plan 做 operation coverage、schema-derived cases、security/response、case independence 检查；
- 对 report 做 case count、verification status、binding/input digest grounding 检查；
- 输出固定 machine-readable validation report。

共享的是公开的 support-contract 版本、规范化 public contract 和数据 schema，不共享生成结果。控制器在执行前后另行复核
原始 JSON/YAML 的 protected-input digest；checker 本身不是第二套 YAML/JSON parser，也不能退化为 package hash 或 exact
output byte comparison。

## 9. Development 验证

使用两份新建、公开、development-only 输入，一份 JSON、一份 YAML。两次运行只改变 binding 的普通 path/format/output 参数；不得增加按输入命名的代码分支、模板或映射。

测试至少覆盖：

- 两个新输入均通过独立 checker；
- generator/checker digest 不同；
- plan 篡改、report 篡改、input 漂移均失败；
- `$ref`、OAuth、multipart、缺少 2xx、缺少 required/security 错误响应均在输出前拒绝；
- unsafe path、symlink、输出碰撞、已有输出均失败；
- production 与旧 `--variant` CLI 分支互斥且旧分支测试继续通过；
- `modelCalls=apiCalls=paidCalls=0`。

这组 development 证据已由 `results/skill-ir/api-tester-production-binding-development-001/report.json` 冻结为两份公开
JSON/YAML 新输入 2/2、`modelCalls=apiCalls=paidCalls=0`。它只把 API Tester profile 从“固定两条切片回放”推进到
“明确子集内的通用 production binding 候选”，不自动修改 Q2 capability snapshot 的 readiness；正式状态变更需在
候选边界复核和另行冻结后决定。

## 10. 失败处理与后续修改

- 支持范围不足时扩展 support-contract 版本，不对单个输入加例外；
- checker 发现 generator 缺陷时修通用算法并补反例，不能放松 checker；
- 需要新增字段时发布新 schema version，旧 binding 继续 fail closed；
- 只有 development 合同稳定后，才可另行授权 prospective/Q3 输入；本设计本身不提供该授权。
