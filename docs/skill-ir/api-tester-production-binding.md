# API Tester 通用生产 Binding

本文档说明 API Tester 的 development-only 通用生产 binding。它通过普通的输入/输出参数接收公开 OpenAPI 3.x
文件，在不调用模型、API、网络或安装器的条件下生成测试计划与事实报告，并由独立 checker 对规范化公开合同进行
机器检查。

当前实现身份是 `skill-ir-api-tester-production-binding-development-001`。它是 additive 产品候选，不修改旧的
API Tester research compiler、scorer、lock、冻结 package 或历史 `--variant` 回放，也不改变 Q2 冻结 snapshot 的
`new-input-ready=0/3`。

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
冻结 development fixture 的逐字节回放。

执行前必须满足：

- `--root`、`--workdir`、`--out` 和 binding 路径均通过 containment 检查；
- workdir 与 out 不同，out 不存在或为空；
- binding 指向的输入是 workdir 内的非 symlink 普通文件；
- plan/report 目标尚不存在，且 input/plan/report 三条相对路径互不碰撞；
- Node.js 可从 `PATH` 找到，或通过 `SKVM_NODE` 显式指定。

命令不会读取 API key。成功时 stdout 和 `<out>/cli-report.json` 都包含严格机器报告，三项 accounting 固定为 0。

## 2. Binding schema

首版 schema 是 `skill-ir-api-tester-production-binding/v1`：

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

## 4. Package 与运行顺序

每次编译生成 exact-closure package：

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

独立性的准确边界是：控制器从原始 JSON/YAML 派生并冻结规范化 `public-contract.json`，checker 消费这份公开合同；
控制器在运行前后独立复核原始输入摘要。因此 checker 不是 generator 的 gold-digest 回归，但它也不是第二套 YAML/JSON
parser。若将来需要证明 parser 本身的双实现一致性，应另设明确合同，不能把本实现夸大为已有该证据。

## 6. 输出与开发证据

除调用者声明的 plan/report 外，输出目录包含：

- `artifact/package-manifest.json`：package exact closure 与全部 digest；
- `validation-report.json`：checker 的 machine-readable pass/fail 与错误列表；
- `cli-report.json`：统一五阶段状态、package/checker/binding/input digest 和零调用 accounting。

冻结 development 报告位于：

`results/skill-ir/api-tester-production-binding-development-001/report.json`

它记录两份公开新输入（books JSON、orders YAML）2/2 通过，同一 generator/checker 跨输入复用且二者 digest 不同，
`modelCalls=0`、`apiCalls=0`、`paidCalls=0`。该证据没有 task ids、prompts、逐输入代码分支、模板或人工映射，也没有
访问 held-out/prospective。

这只证明明确 OpenAPI 子集内的 development 构造候选。它不证明任意 OpenAPI、未知 skill 自动接入、跨模型稳定性、
优化后的 LLM 更稳、独立安装/跨平台可用，也不直接修改 capability snapshot、portfolio 或 readiness。

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

bun run typecheck
```

测试覆盖 JSON/YAML、支持/拒绝合同、package closure、输入漂移、symlink/路径安全、plan/report 篡改、CLI 分支互斥、
历史 `--variant` 非回归和固定两输入零调用报告。

## 8. 修改指引

- 修改 binding 或 public-contract 字段时发布新 schema version，并保留旧版本 fail closed 行为。
- 扩支持面时先添加通用反例/拒绝测试，再修改 parser、generator 和 checker；禁止按 fixture/task id 分支。
- checker 暴露 generator 缺陷时修复通用生成算法，不放松公开义务或改成 exact gold comparison。
- package 增删文件时同步 exact closure、manifest schema、validator 和 tamper tests。
- 修改入口时保留 `--binding`/`--variant` 互斥、路径 containment、旧 variant 回归和零 accounting。
- 任何 prospective、Q3、readiness、跨模型或生产支持主张都需要新 identity 与单独授权；不能从本 development 报告推断。
