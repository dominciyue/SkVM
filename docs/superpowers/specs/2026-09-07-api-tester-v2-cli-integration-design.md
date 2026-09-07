# API Tester v2 工程收口设计

**日期：** 2026-09-07

**状态：** 已实现并完成确定性验证；未进入 candidate/prospective

## 1. 目标与边界

本阶段只关闭三个工程缺口：修复 AI development routing builder 的 TypeScript tuple 表达；让统一
`skvm artifact --preset=api-tester --binding=...` 按 binding 自带的 `schemaVersion` 分发 production v1/v2；
补齐真实 CLI 正例、未知版本拒绝及 v1 binding/variant 回归。阶段完成后停止，不冻结 prospective candidate、
不选择新输入、不扩 OpenAPI 支持面、不进入第二 profile/Q4/held-out/readiness，也不调用模型或 API。

## 2. 方案选择

采用 **binding 内版本分发**：CLI 保持单一 `--binding=<json>` 参数，preset adapter 先以只读方式提取
`schemaVersion`，仅接受 `skill-ir-api-tester-production-binding/v1|v2`，再调用对应 exact-closure runner。

未采用两种替代方案：

- 新增 `--binding-version`：会让 CLI flag 与文件内容形成两个可能冲突的版本来源；
- 让 v2 parser 兼容并替换 v1：会模糊冻结 v1 identity、support contract 与输出证据。

未知、缺失、非字符串版本或非 JSON binding 必须在 package/run 前 fail closed。选择后再次核对实际 runner 返回的
binding digest，避免版本预读与 runner 重读之间的字节漂移被静默接受。

## 3. 类型基线修复

`drafts` 与 `changes` 已是固定 `[A,B]` tuple，但 `.map()` 把其派生的 `labelMaps`/`changeMaps` 扩宽为普通数组，
导致 `noUncheckedIndexedAccess` 在固定索引处报告 `TS2532`。修复只把两个派生集合直接构造成双元素 tuple；不改变
顺序、数据、schema 或序列化。现有 reproduction test 继续逐对象比较，并增加 canonical JSON bytes 与 candidate
中 routing digest 的显式核验。

## 4. CLI 报告版本

现有 Env/历史 variant 报告继续使用 `skill-ir-artifact-cli-result/v1`。production binding 执行改用
`skill-ir-artifact-cli-result/v2`，其 `binding` 必须新增：

- `schemaVersion`：实际分发的 v1/v2 binding schema；
- `supportContractId`：`api-tester-openapi-subset-v1|v2`。

其余 workflow、package、checker、accounting 与 claim boundary 保持同一结构。导出的解析 schema 使用 v1/v2
discriminated union，因此历史已提交 v1 CLI report 仍可验证，新 production report 则不能遗漏实际版本。

## 5. 验证合同

1. 当前 typecheck 先稳定复现三处 `TS2532`；tuple 修复后全仓 typecheck 必须通过。
2. routing builder 生成的 canonical JSON 必须与已提交 bytes 相同，SHA-256 仍为 candidate 绑定值
   `124817bc4315cb69a3adfb864b89ebf770ff785783a7eb738237323d2410afc3`。
3. source CLI 真实进程运行 v2 合成 fixture，必须得到 result v2、binding schema v2、support-contract v2、checker pass、
   `modelCalls=apiCalls=paidCalls=0`。
4. v1 books/orders binding、两个历史 variant 与 Env preset 必须回归；production v1 报告也显式写出 binding v1。
5. 未知 binding schemaVersion 必须在 output 创建前拒绝；无 silent fallback、retry 或版本猜测。

## 6. 主张上限

该阶段只证明现有 v2 声明范围可通过统一入口运行，并恢复全仓类型基线。它不增加 Open-Meteo 之外的真实覆盖，
不把合成 local-ref/body-array/form-explode fixture 写成真实迁移证据，也不建立 prospective、reliability、human savings、
cross-profile、portfolio 或 readiness 结论。
