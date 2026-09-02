# Stage N：跨模型族 AOT 稳定性面板

## 目的与冻结身份

Stage N 是一个新的、独立于 Stage M 的前瞻 identity：

`skill-ir-stage-n-cross-model-aot-stability-001`

它只冻结 API Tester 与 Env Manager 两个已有 development phenotype 的跨模型执行合同。当前阶段只完成 Stage 0 冻结和 smoke 资格；smoke 结束后必须停下，等待用户复核，不自动进入付费矩阵。

## 固定分母

每个 skill 固定 2 task × 2 repetition = 4 original rows / family / skill：

```text
original = 2 skills × 4 rows × 3 families = 24
artifact = deterministic, shared across families = 8
matrix   = 24 original + 8 artifact = 32 logical rows
```

GPT 不重跑。API Tester 绑定既有 C1 gate report，Env Manager 绑定既有 C2 paired-quality 与 cost evidence；这些 digest-bound rows 只作为原有 evidence 的复用，不形成新的 GPT paid call。未来矩阵需要的新增 original 预算为 Claude 8 + DeepSeek 8 = 16，smoke 另计；本轮 smoke 只为 Claude/DeepSeek 产生新的 original 调用，GPT smoke 是 digest-bind。

## Stage 0 与 smoke 顺序

1. `plan`：读取并核验新 lock、旧 lock/policy、C1/C2 evidence 的 regular-file、containment 和 SHA-256；写出 `plan.json`。不检查 API key，不 dispatch。
2. `smoke`：每族 × 每 skill 1 个 original row，共 6 logical smoke rows。GPT 两行由 C1/C2 digest-bind；Claude、DeepSeek 各执行两行，`retries=0`、`reserve=0`、前台串行。资格只看 execution-complete 与 usage 可观测，不读取 scorer 质量。
3. `matrix`：本阶段一律 fail closed。只有用户在 smoke 结果回报后另行授权，才允许新 identity/新 lock 的矩阵实现；本轮不得创建或执行矩阵。

失败行始终保留在 6-row smoke 分母中。失败族被排除于未来主表，但结果冻结为负资格，不 retry、不换模型族、不补行。分母不完整或 dispatch 后无 terminal 都是 blocked/fail-closed。

## 运行与文件

- Lock：`benchmarks/skill-ir/panels/stage-n-cross-model-aot-stability-001/panel-lock.json`
- Contract/schema：`src/benchmarks/skill-ir/stage-n-cross-model-panel.ts`
- Planner：`src/benchmarks/skill-ir/stage-n-cross-model-panel-plan.ts`
- Runner：`src/benchmarks/skill-ir/stage-n-cross-model-panel-run.ts`
- Focused tests：三个同名前缀的 `.test.ts` 文件

Stage 0：

```powershell
bun run ./src/benchmarks/skill-ir/stage-n-cross-model-panel-run.ts --phase=plan --root-dir=D:/skill优化/SkVM --lock=benchmarks/skill-ir/panels/stage-n-cross-model-aot-stability-001/panel-lock.json --out-dir=results/skill-ir/stage-n-cross-model-aot-stability-001
```

Smoke：

```powershell
bun run ./src/benchmarks/skill-ir/stage-n-cross-model-panel-run.ts --phase=smoke --root-dir=D:/skill优化/SkVM --lock=benchmarks/skill-ir/panels/stage-n-cross-model-aot-stability-001/panel-lock.json --out-dir=results/skill-ir/stage-n-cross-model-aot-stability-001
```

成功结果写入 `smoke-qualification.json`；不写 `matrix-report.json`。Runner 复用现有 `buildPlan` 与 `executeGenericPlanRow`，不修改 core、DSL、artifact、scorer、package 或 readiness registry。

## 主张边界

本阶段最多支持以下方向性解释：AOT 把模型移出 runtime；确定性 artifact 臂应为 0 model token；original 跨族差异作为观察结果。不能写成“优化后的 LLM 更稳”，也不能据此晋级 portfolio、readiness、held-out、promotion 或主 claim。

## 失败模式与后续修改

- lock、旧证据或实现摘要 digest 漂移：停止，不自动修复旧证据。
- smoke 某族 execution/usage 不完整：该族冻结为负资格，GPT/Claude 等其余 eligible family 的未来矩阵是否继续由用户复核决定。
- DeepSeek smoke 失败：不换 route、不重试；只从未来主表剔除 DeepSeek。
- 任何矩阵调用：本 identity 直接拒绝，避免在用户复核前付费。

若要继续矩阵，必须创建新的授权变更并明确绑定本次 smoke compact evidence；不得原地把 `matrix.authorized` 改为 true。
