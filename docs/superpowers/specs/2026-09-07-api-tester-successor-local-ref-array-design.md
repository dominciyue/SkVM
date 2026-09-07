# API Tester Successor Local Ref 与 Primitive Array 设计

**日期：** 2026-09-07

**状态：** implementation completed

**implementation identity：** `skill-ir-api-tester-production-binding-successor-development-001`
**support contract：** `api-tester-openapi-subset-v2`

## 1. 目标与非目标

目标是在不修改 v1 冻结链的前提下，增加一个清晰版本化的 API Tester constructor successor：受控解析同文档 component ref，构造 primitive array 值，保存 query array 编码，并让独立 checker 对这些新增义务做 machine check。至少一份已经暴露的真实 development 输入必须完成 parse → package → generate → checker。

本阶段不是样本扩展、第二 profile、Q4、held-out、readiness 或 prospective 重跑。旧四份真实输入已经暴露；只有 Open-Meteo 用于 development 正例，其余三份只用于缺口说明。没有真人前瞻比较，因此不声明人工节省或“作者变审核者”。

## 2. Additive 版本边界

以下 v1 文件保持字节不变：

- `src/skill-ir/api-tester-production-contract.ts`
- `src/skill-ir/api-tester-production-programs.ts`
- `src/skill-ir/api-tester-production-artifact.ts`

successor 新增 `*-v2.ts` 模块，并发布新的 binding、public contract、program、validation report、package manifest/provenance、run report 和 development report schema。v2 不替换 `skvm artifact --binding` 的 v1 路由；正式切换或 prospective candidate freeze 是后续独立阶段。

## 3. Ref resolver

resolver 只在 parser 实际消费的槽位调用，并要求 ref target 与槽位 component kind 对齐：

- Parameter Object：`#/components/parameters/...`
- Request Body Object：`#/components/requestBodies/...`
- Schema Object：`#/components/schemas/...`
- Security Scheme Object：`#/components/securitySchemes/...`

JSON Pointer token 必须按 `~1`、`~0` 解码。ref 必须以 `#/components/` 开头、target 必须存在且为 object；解析栈用于检测直接或间接循环。Reference Object 不允许 `$ref` 之外的 sibling，避免 OpenAPI 3.0/3.1 sibling 语义混写。外部、悬空、循环、错误 kind 和 sibling 均在生成输出前返回 `UNSUPPORTED_REFERENCE`。

响应 payload schema 不是当前构造器/checker 的公开义务，因此不遍历其中的 ref；response status key 仍按现有显式三位数字规则验证。

## 4. v2 normalized field contract

字段是 strict discriminated union：

- scalar：`kind=scalar`，包含 location/name/required、primitive type 和适用于该 type 的约束；
- array：`kind=array`，包含 location/name/required、`items` scalar contract、`minItems`/`maxItems`/`uniqueItems`，以及 query parameter 的 normalized encoding。

数组仅接纳：

- `body` property 的 primitive item array；
- `query` parameter 的 `style=form` primitive item array；默认或显式 `explode=true` 记为 `form-explode`，`explode=false` 记为 `form-comma`。

path/header array、object/nested/composed item、未知 array key 和不一致的 serialization 均拒绝。为了防止 artifact 失控，显式 `maxItems` 超过 64 的 schema 不进入本版本；无 maxItems 时构造器只生成满足义务的最小有界数组。

scalar 保留 v1 约束；新增 `date` 字符串构造和 `float`/`double` 数值注解。default/example 仍不作为构造来源。`pattern`、nullable、composition、additionalProperties 等继续超界。

## 5. Generator 与 checker

generator 只读 binding + v2 normalized contract：

- 为每个 operation 生成 happy case；
- 为 required、scalar constraint、array length/uniqueness、item constraint 生成可由 public contract 解释的 witness；
- 在 endpoint 上写出 array parameter encoding，request 内保留逻辑 JSON array；
- 写出真实 case count 与 v2 contract/version grounding。

checker 是独立 source program，不导入 generator、不比较 gold bytes。它检查 strict plan shape、operation coverage、array encoding exactness、每项公开约束的 witness、security/status、case independence 和 report grounding。checker 只消费控制器冻结的 v2 normalized contract；它不是第二套 OpenAPI parser。

## 6. Development 路径

测试 fixture 覆盖 local parameter/schema/requestBody ref、query/body primitive array、两种 form explode 编码、date/float、cycle/external/unresolved/wrong-kind/sibling、unsupported serialization 和 checker mutation。

真实路径使用旧 lock 已绑定的 Open-Meteo forecast 字节：commit `6c45053fb1ef0c049de931292a0f5cb35f14c0ba`、input SHA-256 `fdd3195d66fade678924c1df99d32de4f1d6aa7c954c5bc7ff1646ed8c558def`。runner 必须先核 digest，再运行 v2 package；报告记录 input/binding/contract/program/plan/report/validation digest、operation/field/array counts、checker status 及 `modelCalls=apiCalls=paidCalls=0`。

真实源文件不 vendoring；development runner 显式接收外部 cache root。提交 compact report，不把 cache 路径写入报告。缺少或 digest 漂移时 fail closed。

## 7. 停止点

完成 v2 contract、program、package、合成 mutation 和一条 Open-Meteo development pass 后停止。不得直接冻结新 prospective candidate 或选择新未见输入；这些需要新 identity、新 lock 和另一次授权。
