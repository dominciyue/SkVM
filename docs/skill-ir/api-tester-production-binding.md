# API Tester 通用生产 Binding

本文档说明 API Tester 的 development-only 通用生产 binding。它通过普通的输入/输出参数接收公开 OpenAPI 3.x
文件，在不调用模型、API、网络或安装器的条件下生成测试计划与事实报告，并由独立 checker 对规范化公开合同进行
机器检查。

当前有两个彼此隔离的 development 身份：

- v1：`skill-ir-api-tester-production-binding-development-001`，通过统一 CLI 接收 `--binding`；
- successor v2：`skill-ir-api-tester-production-binding-successor-development-001`，使用独立 v2 contract/package/runner，
  同时已由统一 CLI 按 binding 自带的 `schemaVersion` 显式分发。

二者都是 additive 产品候选，不修改旧的 API Tester research compiler、scorer、lock、冻结 package 或历史
`--variant` 回放，也不改变 Q2 冻结 snapshot 的 `new-input-ready=0/3`。v2 也不覆盖或重新解释 v1 的冻结 4+4 结果。

## 1. 入口与最小示例

binding 文件位于 `--root` 内；OpenAPI 输入位于 `--workdir` 内。下面示例使用仓库提供的公开 development fixture，
先把普通输入复制到新的 workdir，再运行统一入口：

```powershell
$work = '.skvm/api-production-books'
$out = '.skvm/api-production-books-out'
New-Item -ItemType Directory -Force -Path $work | Out-Null
Copy-Item -Recurse -Force ./src/skill-ir/fixtures/api-tester-production/books/* $work

bun run ./src/cli/artifact.ts `
  --preset=api-tester `
  --binding=src/skill-ir/fixtures/api-tester-production/books/binding.json `
  --root=. `
  --workdir=$work `
  --out=$out `
  --completed-at=<ISO-8601>
```

`--binding` 与历史 `--variant=openapi-json|openapi-yaml` 互斥。前者是本页描述的通用子集候选；后者仍是两份
冻结 development fixture 的逐字节回放。`--binding` 没有第二个版本 flag：CLI 从文件内读取
`skill-ir-api-tester-production-binding/v1|v2`，未知、缺失或非字符串版本在创建输出前拒绝。

执行前必须满足：

- `--root`、`--workdir`、`--out` 和 binding 路径均通过 containment 检查；
- workdir 与 out 不同，out 不存在或为空；
- binding 指向的输入是 workdir 内的非 symlink 普通文件；
- plan/report 目标尚不存在，且 input/plan/report 三条相对路径互不碰撞；
- Node.js 可从 `PATH` 找到，或通过 `SKVM_NODE` 显式指定。

命令不会读取 API key。成功时 stdout 和 `<out>/cli-report.json` 都包含严格机器报告，三项 accounting 固定为 0。

## 2. Binding schema

CLI 同时接收冻结的 `skill-ir-api-tester-production-binding/v1` 和 additive
`skill-ir-api-tester-production-binding/v2`，并按该字段选择对应 runner；不会用 v2 parser 静默替换 v1。首版外形如下：

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

- `bindingId` 必须匹配小写字母开头的 `[a-z][a-z0-9-]{0,63}`，不承担研究 task identity。
- `input.path`、`outputs.plan`、`outputs.report` 都是 POSIX safe-relative path。
- `format` 仅允许 `json` 或 `yaml`，并必须与 `.json` 或 `.yaml`/`.yml` 扩展名一致。
- 调用者只提供路径和格式，不提供 task id、prompt、gold plan、逐任务模板或人工字段映射。
- binding、原始输入、generator、checker、package manifest 和运行输出均记录 SHA-256。
- production binding 的 `cli-report.json` 使用 `skill-ir-artifact-cli-result/v2`，并同时记录实际 binding
  `schemaVersion` 与 `supportContractId`；Env/历史 variant 仍输出 result v1，统一解析 schema 兼容两种报告。

## 3. 支持范围与稳定拒绝码

首版 support contract 是 `api-tester-openapi-subset-v1`，只接纳能从公开合同确定性构造有效值和反例的 OpenAPI
3.x 子集。

| 接纳范围 | 规则 |
|---|---|
| operations | 非空 `paths`，标准 HTTP method，每个 operation 至少一个显式 2xx |
| parameters | inline path/query/header primitive parameter；path parameter 必须 required |
| request body | 唯一 `application/json` media type，inline object properties |
| primitive schema | string/integer/number/boolean；`required`、长度、数值上下界、非空 enum、email/uri |
| security | 无 security，或 HTTP bearer、header API key；必须有 401/403 |
| error witness | required 字段必须存在至少一个显式 4xx/5xx response |

解析和 support-contract 检查在生成输出前 fail closed。稳定错误码如下：

| 错误码 | 典型原因 |
|---|---|
| `INVALID_OPENAPI` | 非 OpenAPI 3.x、空 paths 或 JSON/YAML 无法解析 |
| `UNSUPPORTED_OPENAPI_FEATURE` | webhook/callback 等首版未覆盖顶层结构 |
| `UNSUPPORTED_REFERENCE` | 任意 `$ref` |
| `UNSUPPORTED_PARAMETER` | cookie、非 inline 或歧义 parameter |
| `UNSUPPORTED_REQUEST_BODY` | multipart/form、非 object JSON body、嵌套 body schema |
| `UNSUPPORTED_SECURITY` | OAuth/OpenID、非 header API key、多个或歧义 security requirement |
| `UNSUPPORTED_RESPONSE` | default/wildcard、非三位数字或缺少 2xx |
| `UNSUPPORTED_SCHEMA` | 组合/嵌套 schema、未知约束或未支持 format/type |
| `UNCONSTRUCTIBLE_CONSTRAINT` | 上下界矛盾或 enum 中没有可构造的合法值 |
| `MISSING_REQUIRED_ERROR_RESPONSE` | 有 required 字段但没有可用 4xx/5xx |
| `MISSING_SECURITY_ERROR_RESPONSE` | 有 security 但没有 401/403 |

`description`、`summary`、`tags` 和 `x-*` 等不参与构造的说明字段可以被忽略。新增语义能力应发布新的
support-contract/schema 版本，而不是为单个输入增加特殊分支。

### 3.1 successor v2 的版本化增量

successor 使用 `skill-ir-api-tester-production-binding/v2`、`skill-ir-api-tester-public-contract/v2` 与
`api-tester-openapi-subset-v2`。binding 外形仍只有普通 input/output 参数，例如：

```json
{
  "schemaVersion": "skill-ir-api-tester-production-binding/v2",
  "bindingId": "development-open-meteo-forecast-v2",
  "input": { "path": "open-meteo/forecast.yml", "format": "yaml" },
  "outputs": { "plan": "generated/plan.json", "report": "generated/report.json" }
}
```

将这份 v2 binding 与其声明的输入放入新的 workdir 后，运行方式与 v1 相同：

```powershell
bun run ./src/cli/artifact.ts `
  --preset=api-tester `
  --binding=src/skill-ir/fixtures/api-tester-production-v2/local-ref-arrays/binding.json `
  --root=. `
  --workdir=<fresh-workdir-containing-openapi.yaml> `
  --out=<fresh-empty-output> `
  --completed-at=<ISO-8601>
```

v2 的增量边界是：

| 能力 | 接纳 | fail-closed 边界 |
|---|---|---|
| local component ref | 仅在实际消费的 parameter、requestBody、schema、securityScheme 位置解析同文档 `#/components/...`，且 target kind 必须匹配 | 外部、悬空、循环、错误 kind、带 `$ref` sibling 均为 `UNSUPPORTED_REFERENCE` |
| primitive array | body property array；query parameter array；items 必须是 v2 scalar contract | path/header array、嵌套/object/composed item、未知约束拒绝 |
| query array encoding | 仅 `style=form`；默认或 `explode=true` 为 `repeated-value`，`explode=false` 为 `comma-separated` | 其他 style、非布尔 explode 或位置不一致拒绝 |
| array constraints | `minItems`、`maxItems<=64`、`uniqueItems` 与 item scalar constraints | 矛盾、不可构造、`maxItems=0` 或超过 64 拒绝 |
| scalar format | 保留 email/uri，并增加 string/date 与 number/integer 的 float/double annotation | 未支持 format/type 仍拒绝 |

response payload 不是当前 plan/checker 的构造义务，因此 v2 不会仅因未消费的 response-body ref 全局拒绝；response
status 仍必须是显式三位数字且至少有一个 2xx。完整逐输入 blocker 见
[`api-tester-successor-gap-analysis.md`](api-tester-successor-gap-analysis.md)。

## 4. Package 与运行顺序

v1/v2 每次编译都生成各自版本的 exact-closure package：

```text
<out>/artifact/
  package-manifest.json
  package-provenance.json
  binding.json
  public-contract.json
  validation-policy.json
  artifacts/scripts/api-test-generate.mjs
  artifacts/checks/api-test-check.mjs
```

`package-manifest.json` 绑定 identity、binding/input digest、规范化 public contract、generator/checker digest、
输出路径与资源政策。package validator 拒绝缺失文件、额外文件、digest 漂移、路径碰撞以及相同 generator/checker
摘要。

运行顺序固定为：

1. 控制器读取 binding 和原始 OpenAPI，建立 `public-contract.json`，并绑定原始输入 SHA-256；
2. 执行前复核 package closure、workdir 路径、输出不存在和原始输入 digest；
3. generator 从 binding + normalized public contract 生成 plan/report；
4. checker 从相同的 immutable binding + normalized public contract 独立检查 plan/report；
5. 控制器再次复核原始输入 digest，保存 `<out>/validation-report.json` 和 `<out>/cli-report.json`。

任一步失败都停止；没有 retry、repair、模型补齐、网络或 shell fallback。

## 5. Checker 独立性及其上限

generator 与 checker 是不同 source program、entrypoint 和 digest。checker 不导入或调用 generator，不读取 gold、
task prompt、evaluator payload、held-out 或冻结 fixture registry，也不比较 exact plan bytes。它验证：

- plan 的 operation coverage 与 method/path 对齐；
- 每个公开字段约束有对应 schema-derived case；
- security 与 error-response case 完整；
- case id 和 case witness 独立；
- report 的 case count、verification status、binding/input digest 与 plan 一致。

v2 还要求 endpoint 的 array encoding 与 normalized public contract 精确一致，并检查 array length、uniqueness 与
item constraint witness。一个 boundary case 可以同时证明多个公开约束，但每项约束都必须至少有一个真实语义 witness；
不能靠 case id 或空占位过关。

独立性的准确边界是：控制器从原始 JSON/YAML 派生并冻结规范化 `public-contract.json`，checker 消费这份公开合同；
控制器在运行前后独立复核原始输入摘要。因此 checker 不是 generator 的 gold-digest 回归，但它也不是第二套 YAML/JSON
parser。若将来需要证明 parser 本身的双实现一致性，应另设明确合同，不能把本实现夸大为已有该证据。

## 6. 输出与开发证据

除调用者声明的 plan/report 外，输出目录包含：

- `artifact/package-manifest.json`：package exact closure 与全部 digest；
- `validation-report.json`：checker 的 machine-readable pass/fail 与错误列表；
- `cli-report.json`：统一五阶段状态、package/checker/binding/input digest、实际 binding/support 版本和零调用 accounting。

v1 冻结 development 报告位于：

`results/skill-ir/api-tester-production-binding-development-001/report.json`

它记录两份公开新输入（books JSON、orders YAML）2/2 通过，同一 generator/checker 跨输入复用且二者 digest 不同，
`modelCalls=0`、`apiCalls=0`、`paidCalls=0`。该证据没有 task ids、prompts、逐输入代码分支、模板或人工映射，也没有
访问 held-out/prospective。

successor v2 的冻结 development 报告位于：

`results/skill-ir/api-tester-production-binding-successor-development-001/report.json`

它绑定 Open-Meteo commit `6c45053fb1ef0c049de931292a0f5cb35f14c0ba` 的已暴露输入字节、license、binding、
public contract、package manifest、generator、checker、plan、report 与 validation digest。结果是 1 operation、23 fields
（18 scalar、5 array）、5 个 comma-separated query encoding、checker pass，且 `modelCalls=apiCalls=paidCalls=0`。

该输入来自 v1 首轮后公开的原 4-real 集合，所以 `prospective=false`、`unseenInput=false`。它在 v1 报告中的事实仍是
`rejected/UNSUPPORTED_SCHEMA/checkerStatus=not-run`；v2 的开发通过不能写成 v1 checker 失败已修复，也不能把旧 0/4
改写为 1/4。DPP、OpenWrt、SignalK 仍因外部 ref、pattern、组合/嵌套 body、3xx-only 或更宽结构保持拒绝。

这只证明明确 OpenAPI 子集内的 development 构造候选。它不证明任意 OpenAPI、未知 skill 自动接入、跨模型稳定性、
优化后的 LLM 更稳、独立安装/跨平台可用，也不直接修改 capability snapshot、portfolio 或 readiness。

### 6.1 v2 特性定向迁移冻结

新身份 `skill-ir-api-tester-v2-feature-migration-001` 已将实际统一 CLI 执行面、6 个独立公开仓库来源、4 个合成边界、
10 份普通 v2 binding 与执行前预测冻结为 `resultState=not-run`。它不会改动本页的 v2 contract、parser、generator、checker
或 package；所选输入在冻结提交推送前不得进入候选。唯一首轮、成本字段、失败保留与主张上限见
[`api-tester-v2-feature-migration.md`](api-tester-v2-feature-migration.md)。

## 7. 验证

```powershell
bun test ./src/skill-ir/api-tester-production-contract.test.ts `
  ./src/skill-ir/api-tester-production-programs.test.ts `
  ./src/skill-ir/api-tester-production-artifact.test.ts `
  ./src/skill-ir/api-tester-production-development.test.ts `
  ./src/cli/artifact.test.ts `
  ./src/skill-ir/verified-artifact-presets.test.ts `
  ./src/cli/artifact-entrypoint.test.ts

bun run ./src/skill-ir/api-tester-production-development-run.ts `
  --root=. `
  --out=results/skill-ir/api-tester-production-binding-development-001/report.json

bun test ./src/skill-ir/api-tester-production-contract-v2.test.ts `
  ./src/skill-ir/api-tester-production-programs-v2.test.ts `
  ./src/skill-ir/api-tester-production-artifact-v2.test.ts `
  ./src/skill-ir/api-tester-production-successor-development.test.ts

# 仅在精确外部 cache 已存在时复现已暴露 Open-Meteo development 报告；out 必须为空
bun run ./src/skill-ir/api-tester-production-successor-development-run.ts `
  --root=. `
  --external-cache=D:/skill优化/.tmp-api-prospective-20260907 `
  --out=<new-empty-output>

bun run typecheck
```

测试覆盖 JSON/YAML、v1/v2 支持/拒绝合同、local-ref 安全、两种 query array encoding、array/item witness、package
closure、输入漂移、symlink/路径安全、plan/report 篡改、CLI 分支互斥、v1/v2 binding 分发、未知版本执行前拒绝、真实
source CLI v2 进程、历史 `--variant` 非回归、固定两输入 v1 报告和单输入 v2 零调用报告。外部 cache 不是普通
clean-checkout 的必要条件；没有它时 v2 合成 fixture 测试仍应运行，精确 Open-Meteo reproduction test 会明确跳过而
不是联网补取。

## 8. 修改指引

- 修改 binding 或 public-contract 字段时发布新 schema version，并保留旧版本 fail closed 行为。
- 扩支持面时先添加通用反例/拒绝测试，再修改 parser、generator 和 checker；禁止按 fixture/task id 分支。
- checker 暴露 generator 缺陷时修复通用生成算法，不放松公开义务或改成 exact gold comparison。
- package 增删文件时同步 exact closure、manifest schema、validator 和 tamper tests。
- 修改入口时保留 `--binding`/`--variant` 互斥、路径 containment、旧 variant 回归和零 accounting。
- v2 已通过 binding 内版本字段接入统一 CLI；替换 v1、冻结新 prospective candidate 或扩大支持面仍必须另立授权。
- 任何 prospective、Q3、readiness、跨模型或生产支持主张都需要新 identity 与单独授权；不能从本 development 报告推断。
