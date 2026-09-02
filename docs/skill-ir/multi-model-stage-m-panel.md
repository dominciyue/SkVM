# Stage M：冻结产物上的跨模型族面板

## 目的与身份

Stage M 是建立在既有 Magpie P1/P2 冻结产物上的**预注册合同**，身份固定为
`skill-ir-stage-m-frozen-magpie-cross-model-panel-001`。它曾被设计来回答一个窄工程问题：同一份冻结 artifact 在三个预先声明的模型族 route 上，是否能完成完整的九案 public-development 分母，并留下可观测的执行 usage。该 identity 现已收口为不可执行的设计冻结件，不是 readiness、promotion、held-out 或跨模型泛化主证据。

## 冻结输入

模型族与 route 固定为：

- GPT：`xty/gpt-5.6-sol`
- Claude：`xty/claude-opus-4-8`
- DeepSeek：`xty/deepseek-v4-pro`

九个 case 的顺序直接绑定 Magpie public Step 0--2 slice；split 固定为 `public-development`。Stage M lock 位于
`benchmarks/skill-ir/panels/stage-m-frozen-magpie-001/panel-lock.json`，并绑定 P1 product config、P1 product report、P2 checker、artifact closure digest、任务 prompt closure 和上游 commit。

运行合同固定为 Pi `0.67.68`、Windows/clean、absolute timeout `600000ms`、idle timeout `120000ms`、max steps `30`、outer watchdog `660000ms`、`retries=0`、`repetitions=1`、`family-then-case`。

## 两阶段设计（不执行）

1. 原设计的 Qualification 会依次执行 GPT、Claude、DeepSeek 各九个 original rows，共 27 个付费 rows。
2. 原设计只有三族都恰好有九行、每行 status 为 `complete`、classification 为 `semantic-complete` 且 usage metadata 可用时，才写出 `status=passed` 和 `matrixAuthorized=true`；这里的 `semantic-complete` 只是旧 row schema 标签，不能当成语义质量证明。
3. 原设计若 qualification 失败会冻结负结果；但它先付费 27 行，再重复付费 27 个 matrix original rows，最多 54 次 Magpie original。`matrixRequiresAllFamilies=true` 还会在 DeepSeek 末端失败时浪费前两族调用。
4. 因此本 identity 不允许进入 qualification 或 matrix。`prepare-*` 只可用于审计冻结计划，`status` 只可读取已有状态；任何真实跨模型执行必须新建 identity。

失败的 model row 仍然保留在唯一矩阵分母中。`failed` 表示该次已占用预注册 row 但没有产生可信 semantic completion；它不是 `missing`，也不能被 reserve、replacement 或静默删除。若 controller 在 dispatch 后没有 terminal record，serial owner 永久 `fail-closed`，后续调用不能重发该 attempt。

## Checker 与搬运边界

Stage M 的 checker authority 固定为 `p2-gold-digest-output-regression`。它只验证 P2 固定产物输出 digest regression；它不是 P1 的完整 `scoreMagpieReleaseAuditOutput` semantic checker 搬迁。Bundle 不是独立 runtime，仍需现有 SkVM product CLI/runtime。workdir fixture（尤其 `report.md`）不在 bundle 内，由用户输入/workdir 提供；因此这个 bundle 不是整任务可搬运包。静态 import audit 只按行正则扫描 patch/checker，不是通用 JS 模块图。

## 公开 API 与文件

- `stage-m-frozen-magpie-panel.ts`：lock、qualification、model/artifact row 与 matrix report schema/builders。
- `stage-m-frozen-magpie-panel-plan.ts`：冻结 closure 校验、qualification 行计划、唯一矩阵行计划。
- `stage-m-frozen-magpie-panel-run.ts`：串行持久化 owner、prepare/status CLI，以及默认拒绝付费 qualification/matrix 的执行门禁。
- `stage-m-frozen-magpie-panel-*.test.ts`：合同、分母顺序、失败保留、usage 自洽、无 terminal 不重发测试。

CLI 仍只允许在 `results/skill-ir` 下写入输出目录。当前 identity 只允许 prepare/status 审计；付费 phase 会在读取 API key 或 dispatch 前直接拒绝：

```powershell
bun run ./src/benchmarks/skill-ir/stage-m-frozen-magpie-panel-run.ts --phase=prepare-qualification --root=D:/skill优化/SkVM --out=D:/skill优化/SkVM/results/skill-ir/stage-m-frozen-magpie-panel-001
bun run ./src/benchmarks/skill-ir/stage-m-frozen-magpie-panel-run.ts --phase=prepare-matrix --root=D:/skill优化/SkVM --out=D:/skill优化/SkVM/results/skill-ir/stage-m-frozen-magpie-panel-001
# --phase=qualification / --phase=matrix
# -> rejected: preregistration-only panel; new authorized identity required
```

本轮及后续默认不执行 Stage M qualification/matrix；该 runner 门禁用于防止误付费。

## 状态与验证

`qualification.json` 的 `passed/failed` 是资格状态；`panel-report.json` 的 `completed/blocked` 是唯一矩阵状态。矩阵报告必须保留 27/9 分母计数、每族失败与缺失计数、共享 artifact output digests、`retries=0`、`replacements=0` 和 claim boundary。

Focused 验证：

```powershell
bun test src/benchmarks/skill-ir/stage-m-frozen-magpie-panel.test.ts src/benchmarks/skill-ir/stage-m-frozen-magpie-panel-plan.test.ts src/benchmarks/skill-ir/stage-m-frozen-magpie-panel-run.test.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

不得用 Stage M 结果晋级 readiness、portfolio、held-out 或 promotion；失败结果必须原样冻结为负结果，不能为了得到正例修改 package、artifact、route、case、timeout 或 DSL。

## 后续修改注意

若未来仍要做跨模型，必须另建新 identity：每族先做 1 次 smoke；矩阵只做一次 27 original + 9 artifact，能绑定 Magpie 003 的 GPT original 就绑定，不做 qualification+matrix 双跑；DeepSeek smoke 失败则从主表剔除，GPT/Claude 才可形成部分主表。真正的稳定性主证据应回到 Env 与 API Tester；Magpie 只作附录。以上只是待授权设计约束，不创建 identity、不执行 smoke。

若未来要证明 importer 能承载真实 semantic checker，应另建一份 production recipe 并由用户单独授权；不要把 P2 gold-digest checker 扩回 P1 全量 checker，也不要在本 identity 中增加第三个 skill、live Magpie 或新的 DSL 原语。
