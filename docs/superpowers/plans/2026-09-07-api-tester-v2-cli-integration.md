# API Tester v2 CLI Integration Implementation Plan

> **执行约束：** TDD；每个生产改动先见到对应 RED。只改 routing 类型表达、artifact CLI/preset adapter、测试与文档。

**Goal:** 让全仓 typecheck 恢复通过，并让统一 artifact CLI 依据 binding schemaVersion 安全分发 API Tester production v1/v2。

**Architecture:** routing builder 保持运行时数据不变，只恢复 tuple 类型。CLI 参数层继续只做路径/互斥校验；版本读取、
runner 选择、digest 二次核对和版本化报告集中在 `verified-artifact-presets.ts`。v1/v2 artifact runner 均保持独立实现。

## Task 1: routing tuple 类型与冻结字节

**Files:**

- Modify: `src/benchmarks/skill-ir/ai-assisted-development-routing.test.ts`
- Modify: `src/benchmarks/skill-ir/ai-assisted-development-routing.ts`

1. 运行 `bun run typecheck`，确认只在 295/296/329 行复现 `TS2532`。
2. 在现有 committed reproduction test 中增加 canonical bytes 与 candidate routing digest 核验。
3. 将 `labelMaps`、`changeMaps` 从 `.map()` 结果改成显式双元素 readonly tuple，不使用宽泛 non-null assertion。
4. 运行 routing focused test、typecheck；验证 committed routing JSON、candidate/lock/first-run report 无 diff。

## Task 2: binding version dispatch 与 result v2 schema

**Files:**

- Modify: `src/skill-ir/verified-artifact-presets.test.ts`
- Modify: `src/skill-ir/verified-artifact-presets.ts`

1. RED：新增 v2 fixture preset 测试，要求 result schema v2、binding schema/supportContractId v2、checker pass、零调用。
2. RED：新增未知/missing schemaVersion 测试，要求在 output 创建前 fail closed。
3. GREEN：增加只读 binding version loader，限定 v1/v2，记录预读 SHA-256。
4. GREEN：按版本调用 `runApiTesterProductionArtifact` 或 `runApiTesterProductionArtifactV2`，并核对 runner binding digest。
5. GREEN：把 result schema 改为历史 v1 + production v2 discriminated union；v1/v2 production 都显式报告实际
   binding schema 与 support contract，Env/variant 保持 result v1。

## Task 3: source CLI 端到端与兼容回归

**Files:**

- Modify: `src/cli/artifact-entrypoint.test.ts`
- Modify: `src/cli/artifact.test.ts`
- Modify: `src/cli/artifact.ts`

1. RED：真实启动 source TypeScript CLI，在临时 root/workdir 上运行 v2 fixture并解析 stdout/`cli-report.json`。
2. RED：help 必须说明 binding 版本来自文件；不新增 `--binding-version`。
3. GREEN：更新 help/描述，不把 v2 称为新的 preset 或 variant。
4. 运行 v2 E2E、v1 books/orders、JSON/YAML variant、Env 和参数安全回归。

## Task 4: 文档与收口验证

**Files:**

- Modify: `docs/skill-ir/api-tester-production-binding.md`
- Modify: `docs/skill-ir/developer-guide.md`
- Modify: `docs/skill-ir/README.md`
- Modify: `docs/skill-ir/current-status.md`
- Modify: `docs/skill-ir/skill-ir-aot-optimization-spec.md`
- Modify: `docs/skill-ir/skill-ir-aot-optimization-plan.md`
- Modify: `D:/skill优化/AGENTS.md`
- Append: `D:/skill优化/project_handoff.md`
- Append: `D:/skill优化/project_communication.md`
- Append: `D:/skill优化/conversation_log.md`

1. 同步 CLI 版本分发、result v2 字段、类型基线与停止点。
2. 运行 focused tests、`src/skill-ir` broad、全仓 typecheck、文档链接、diff/secret/absolute-path scan。
3. 明确检查 v1 routing JSON digest、candidate/lock/runner/first-run report 及 v1 production 三源摘要未漂。
4. 只暂存本阶段白名单，commit + push；历史 `??` 保持原样。
