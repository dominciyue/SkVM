# Skill 优化、Final IR 与 Artifact Runtime

本文说明当前通用优化机制。历史 v1-v4 实验数值只在 `experiment-results.md` 保留。

## 1. 优化分层

```text
L0 raw skill
-> L1 source-audited Skill IR
-> L2 static lowering/controller/checker/adapter
-> L3 executable script/schema/template/tool-plan
-> L4 validated package + provenance + regression evidence
```

项目当前具备 L1/L2 通用能力，并已有 API Tester 与 Env Manager 两种 phenotype 通过 L4 development gate；
尚未证明 held-out、untouched replication 或跨模型 L4。

## 2. 静态优化

静态阶段只使用 source closure、公开 task contract 与环境声明：

- rule normalization；
- environment guard；
- output/check/recovery lowering；
- controller、checker、adapter、skill view；
- declarative artifact catalog selection。

Profile-empty base IR 必须通过 source audit。静态阶段禁止使用 scorer expected、held-out、secret、raw model
output 或后验结果。

## 3. Typed Dynamic Feedback

Dynamic feedback 不是自由文本反思，而是版本化 `RepairEvidence`：

```text
targetRef
failureCode
sourceSystem
taskSplit
publicEvidenceRef
observations
proposedCheck / recovery / schema / template
confidence
```

当前使用双源：original 证明失败 lineage 是否持续，ir-static 提供 schema/location 等静态残差。只在
original 与 static 均失败、证据公开且可复现时生成 repair；static regression 直接阻断。

同 `targetRef` 的证据可池化，但必须预注册模型面板、合并计数和冲突裁决。Development-only，held-out
永不参与 overlay。Per-model overlay 只作诊断 ablation。

## 4. Final IR Provenance

Final IR candidate 至少绑定：

- source/base/overlay/final digest；
- development scored result digest；
- model、family、adapter/version、panel、run identity；
- task split、repair catalog 和 compiler version；
- validation notes、regression blockers。

编译完成不等于 promotion。`ir-pgo-dev` 仅用于 development；`ir-pgo` 只有在冻结 gate 通过后消费同一
Final IR 的 held-out。

## 5. Validated Artifact Package

```text
optimized_skill/
  skill_ir.json
  skill.md
  artifacts/
    checks/
    schemas/
    scripts/
    templates/
    tool-plans/
  package-manifest.json
  package-provenance.json
  validation-report.json
  cost-report.json
```

`skill_ir.json` 是权威语义；`skill.md` 是可再生成的人/agent 视图；`artifacts/` 固化重复推理、环境探测、
格式、固定工具计划和可执行检查。Manifest 按相对路径和 sha256 绑定所有 production file。

## 6. Catalog 与 Adapter 边界

通用 `validated-skill-artifact/v1` 定义 manifest、execution plan、runtime、protected input、result report 与
scorer handoff。Skill 差异只能进入 declarative adapter 和编译产物：

- Law：converter/checker/report template；
- Experimental Design：allocation script/design schema/report evidence；
- Env Manager：inventory/schema/check/repair；
- API Tester：声明式 YAML/JSON OpenAPI 变体、bundled schema walker、test-plan generator 和 checker。

通用 core 不得 `if (skillId === ...)`。新增案例必须记录 `coreBranchDelta`、adapter LOC、人工时间、artifact
kind 复用率和未自动化步骤。

公共 adapter 只负责 package assembly envelope：catalog/skill/compiler identity、protected/generated paths、
execution plan、artifact layout 和 provenance 输入投影。领域 compiler 仍负责生成 artifact bytes，并对公开
source/task/resource evidence 的语义负责。这样统一的是重复的目录清理、写文件、digest、manifest、
provenance 和最终 catalog validation，不把 Law、Experimental Design、API Tester 等不同语义压成一个
checker 或模板。

收敛使用 shadow-first：先从至少两个已冻结 package 重建到临时目录并要求 production files 逐字节一致，
再允许新的未冻结 compiler 默认使用公共 assembly。任何已被 lock digest 绑定的 compiler/package 不原地
重构；旧路径只有在新路径通过 development gate 后才讨论删除。缺失/多余 payload、重复 id/path、路径
逃逸和 execution-plan 悬空引用必须 fail closed。该 parity 只证明工程收敛没有改变既有行为，不是新的
优化效果证据。

## 7. Compiler

Compiler 输入只允许：

- exact source closure + provenance；
- source-audited base IR；
- 公开 user task contract；
- resource/environment contract；
- 版本化 catalog/adapter；
- 通过门禁的 typed development evidence。

Compiler 输出必须 deterministic；相同输入 digest 得到相同 manifest/package digest。Evaluator、held-out、
secret、raw model text、绝对路径和未声明本地资源均为非法输入。

## 8. Preflight

Preflight 在生成或执行前验证：

1. catalog/schema/version；
2. manifest path containment 与 digest；
3. provenance 与 source/base IR 绑定；
4. required tool/resource/environment；
5. protected inputs、runtime contract 和 output root；
6. repair provider/credential 仅以环境变量可用性检查，不读取值。

Preflight 失败属于 package/infrastructure，不能触发 semantic repair。

## 9. Runtime State Machine

```text
preflight
-> materialize protected runtime contract/template
-> generate
-> validate
-> if semantic failure: at most one sanitized repair
-> revalidate
-> stop
-> deterministic offline scorer
```

状态必须保存 initial validation、repair attempted/provider/tokens、final validation、protected digest 和
stop reason。`check-only` 与 `check+one-repair` 共享同一 package，可用于修复归因。

## 10. Validator 与 Repair 白名单

Runtime validator 只检查 agent 可见、公开可推导的结构和低争议语义。ValidationReport 使用封闭字段：

```text
code
relativePath
jsonPointer
missingField
expectedType
```

不得包含 raw source/model output、secret、absolute path、scorer expected 或 held-out。Repair prompt 只接收
该投影。修复一次后无论通过与否都停止。

Runtime validator 不等于 scorer。最终 workdir 仍由离线确定性 evaluator 判断任务成功。Validator pass、
repair success 与 scorer success 分列。

## 11. Evidence 分层

Semantic artifact 的 A 层允许进入 production：公开 schema、类型形状、文件路径/符号、必填报告字段、
敏感值形态等。无强证据时降级为 `unconfirmed`。

B 层高争议分类只允许存在于类型和 leak/reverse-evidence 单元测试，不得序列化到 package、ValidationReport、
repair prompt、raw/scored row 或 gate。未来启用必须新 catalog/lock，不原地修改旧 package。

## 12. Development 与 Held-out

Artifact development 必须绑定 package digest、execution freeze、model/harness、task split、repetitions、
scorer、gate 和 output root。只有完整 development matrix 通过，才创建新的 held-out lock。

方案 3 当前先使用独立的
`benchmarks/skill-ir/pilots/namespaced-resource-development-lock.json`。它是
`compatibility-canary` lock：只绑定真实 source closure、namespace compiler/loader/canary digest 和
canary report，禁止 paid/held-out/PGO/scorer 调参，不能替代 optimized quality development lock。运行：

```powershell
cd D:\skill优化\SkVM
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' ./src/skill-ir/resource-namespace-lock-run.ts
```

输出只证明 package identity 可复现；必须先将 compiled skill view 接入 optimized runner，再冻结含
`no-skill | original | ir-static | optimized` 的完整 development matrix。

当前 materialization-only runner 也可单独复核：

```powershell
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' ./src/benchmarks/skill-ir/namespaced-resource-runner-run.ts
```

它只在临时 workdir 写入 compiled `SKILL.md` 和 `.skvm` namespace，随后删除临时目录；结果不代表 agent
执行或 scorer 成功。

完整 development 执行使用独立 quality lock 和执行桥：

```powershell
$env:Path = "C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin;" + $env:Path
$env:SKVM_PYTHON = (Resolve-Path '.skvm\law-runtime\Scripts\python.exe').Path
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' ./src/benchmarks/skill-ir/namespaced-resource-development-execution.ts --execute --out-dir=results/skill-ir/namespaced-resource-quality-development-v1-r2 --model=xty/gpt-5.6-sol --adapter=pi --adapter-version=0.67.68 --panel-config-id=namespaced-resource-quality-development-v1
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' ./src/benchmarks/skill-ir/score-real-agent-runs.ts --raw=results/skill-ir/namespaced-resource-quality-development-v1-r2/raw-runs.jsonl --manifest=benchmarks/skill-ir/corpus/corpora/pilot.json --out=results/skill-ir/namespaced-resource-quality-development-v1-r2/scored.jsonl
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' ./src/benchmarks/skill-ir/namespaced-resource-development-gate.ts --scored=results/skill-ir/namespaced-resource-quality-development-v1-r2/scored.jsonl --out=results/skill-ir/namespaced-resource-quality-development-v1-r2/gate-report.json
```

执行桥在普通 runner 的 workspace preflight 之后重新物化 optimized namespace resources；这是必要的，因为
每行开始会清空 workdir。`quality-development-lock/v1` 的四臂和 `retries=0` 是唯一允许的付费 development
身份。2026-08-03 实验完成 16/16、0 infrastructure failure，但 optimized 仅 1/4 success、mean score
0.5625、2 个相对 `max(original, ir-static)` 的 pairwise regression，gate failed。失败证据冻结在
`results/skill-ir/namespaced-resource-quality-development-v1-r2/`，不进入 held-out/PGO，也不改 scorer。

门禁失败后先运行 source-bound semantic failure audit，而不是直接补跑：

```powershell
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' ./src/benchmarks/skill-ir/namespaced-resource-semantic-failure-audit.ts `
  --raw=results/skill-ir/namespaced-resource-quality-development-v1-r2/raw-runs.jsonl `
  --scored=results/skill-ir/namespaced-resource-quality-development-v1-r2/scored.jsonl `
  --out=results/skill-ir/namespaced-resource-quality-development-v1-r2/semantic-failure-audit.json
```

当前审计结果为 4/4 optimized namespace active、4/4 public outputs present、0 infrastructure，且 3/4
failure rows 与已知 v1 benchmark contract sensitivity 对齐；Experimental Design optimized view 仍是
source-rewrite-only。报告只用于归因，不替代 scorer，也不得进入 compiler/package、held-out 或 gate。

随后对已有 deterministic artifact compiler 做本地 re-entry qualification：Law 与 Experimental Design 的
compiler、通用 catalog/runtime、protected-input 与 deterministic scorer activation 共 20/20 focused tests
通过（显式 `SKVM_PYTHON`）。这证明 L3 artifact 候选可以在不调用模型的情况下生成并改善 fixture workdir。

Task 17.11 已进一步提取 `validated-artifact-assembly.ts`：它只统一 manifest、provenance、execution plan 与
artifact layout 组装，不统一领域 generator/checker/scorer。API Tester 与 Experimental Design v1 的 shadow
rebuild 共覆盖 23 个 production files，2/2 package 逐字节一致、2/2 catalog valid、`coreBranchDelta=0`；
compact report 在 `results/skill-ir/validated-artifact-assembly-parity.json`。旧 compiler/package/lock/result
保持不变。

新的 `experimental-design-v2-artifact-compiler.ts` 绑定公开 v2 contract，并默认通过公共 assembly 生成新
package。2 个 development fixture 的本地 qualification 为 2/2 runtime complete、2/2 scorer success、
mean 1.0、2/2 protected input pass，runtime model tokens 为 0；报告在
`results/skill-ir/experimental-design-v2-artifact-local-qualification.json`。这仍是本地机制证据。相同任务的
`no-skill | original` 基线已经饱和，因此不创建付费四臂 lock，也不把本地通过解释成质量改进。

可重复的无模型命令：

```powershell
cd D:\skill优化\SkVM
bun ./src/benchmarks/skill-ir/validated-artifact-assembly-parity-run.ts
bun ./src/benchmarks/skill-ir/experimental-design-v2-artifact-compile-run.ts --out=<empty-directory>
$env:SKVM_PYTHON = (Resolve-Path '.skvm\law-runtime\Scripts\python.exe').Path
bun ./src/benchmarks/skill-ir/experimental-design-v2-artifact-qualification-run.ts
```

已提交的 v2 package 不应被原地覆盖；重新编译时必须把 `--out` 指向新的空目录。领域 compiler 仍负责
生成约束和脚本，因此当前收敛的是 package assembly，不代表任意 skill 已能完全自动编译。

完整四臂接入先使用独立 dry-run planner，不改变默认 `real-agent-run` matrix：

```powershell
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' ./src/benchmarks/skill-ir/namespaced-resource-development-plan-run.ts
```

它读取 compatibility lock 和 pilot development tasks，显式生成
`no-skill | original | ir-static | optimized` 四臂身份；optimized 行调用 namespaced materializer，其他三
臂复用现有 source runner。plan 是可审计的 16 行 dry-run 产物，不包含模型调用、scorer 结果或质量 claim。

在创建付费 development lock 前必须再执行 qualification：

```powershell
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' ./src/benchmarks/skill-ir/namespaced-resource-development-qualification.ts
```

qualification 把资源合同 probe、workdir namespace 隔离和 mutation fail-closed 分开报告。任何 probe 失败都
是 preflight/infrastructure blocker；它不会触发 semantic repair，也不会被计入 skill 优化分数。当前使用显式
`SKVM_PYTHON=.skvm/law-runtime/Scripts/python.exe` 的结果为 2/2 mutation regression、2/2 resource probe
通过。未提供该环境时，Law 的 `docx`/`pdfplumber` 缺失会使 qualification blocked，不能绕过 probe 创建付费
lock。

Held-out 使用冻结 package，不调 compiler、adapter、validator、scorer 或阈值。失败结果冻结；若要修正方法，
回到新的 development identity，不能消费旧 held-out 反馈后重跑同一分母。

## 13. 当前机制结论

- Env v3 证明公开 workspace-derived environment/schema 语义可经公共 assembly 编译为 Node/Vite package；冻结
  development 为 4/4、mean 1.0、0 regression，四次 runtime model tokens 为 0。
- Law 证明 code/template/checker artifact 可在 development 显著优于文本 skill，随后 held-out 边界回归。
- Experimental Design 证明 catalog/runtime 可复用到第二 phenotype，但 benchmark 饱和阻断优化归因。
- API Tester 已把 source-attributable schema residual 固化为 profile-empty base IR、38 行声明式 adapter 和
  两个同 catalog package 变体。冻结 development 为 4/4、mean 1.0、0 regression；模型三臂均 0/4。
  这证明公开 OpenAPI 约束可以编译成稳定的 0-runtime-model-token artifact，不证明 held-out 或跨模型泛化。

因此下一工作不是新增 runtime 版本。i18n contribution-v2 已提供有区分度的 source-transformation baseline，
其 source-audited profile-empty base IR 也已通过；但首个 static development identity 因 1 timeout 和 3 个
跨三臂同位 `parse-failed` 冻结失败，不能进入 artifact candidate。下一步先把 current regression、
frozen-history compatibility 与 provider/execution observability 分层，再决定新预注册身份或替代方法案例；
不得在同一 lock 下补跑筛正例。

API Tester 的本地编译与冻结实验命令：

```powershell
cd D:\skill优化\SkVM
bun ./src/benchmarks/skill-ir/api-tester-artifact-compile-run.ts
bun test ./src/benchmarks/skill-ir/api-tester-artifact-compiler.test.ts `
  ./src/benchmarks/skill-ir/api-tester-artifact-activation.test.ts `
  ./src/benchmarks/skill-ir/api-tester-artifact-development.test.ts
bun ./src/benchmarks/skill-ir/api-tester-artifact-development-run.ts `
  --phase=plan `
  --lock=benchmarks/skill-ir/pilots/api-tester/api-tester-artifact-development-lock.json `
  --out-dir=results/skill-ir/api-tester-schema-derived-artifact-development-v1
```

`qualification` 与 `execute` 使用相同参数，只替换 `--phase`；真实执行前必须通过 lock validation，且
`SKVM_XTY_API_KEY` 只能存在于环境变量。

## 14. 成本

记录 compile/profile/package/model repair/runtime validation/scorer 成本。Artifact 的模型 runtime 为 0 也必须
保留预编译成本。只在质量 gate 通过后报告：

```text
N = 1, 2, 5, 10
original cumulative tokens
optimized cumulative tokens
break-even N*
```

缓存命中必须绑定 source/compiler/catalog/environment digest；任何输入变化都使缓存失效或重新验证。

## 15. 测试

```powershell
bun test ./src/benchmarks/skill-ir/repair-evidence.test.ts
bun test ./src/benchmarks/skill-ir/final-ir-provenance.test.ts
bun test ./src/benchmarks/skill-ir/validated-artifact-catalog.test.ts
bun test ./src/benchmarks/skill-ir/validated-artifact-runtime.test.ts
bun test ./src/benchmarks/skill-ir
bun run typecheck
```

修改规则：冻结 package/lock/result 不原地改；新增 catalog identity 前先证明现有通用 core 无法表达，并在
spec/plan 记录原因。
