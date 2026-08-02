# Skill IR 评估系统

本文只说明当前通用评估组件。单个 skill 的 task、lock、命令和结果放在 pilot 或 evidence ledger 中。

## 1. 评估原则

1. 先验证 benchmark 合同，再判断 skill/IR/artifact 效果。
2. 主比较使用相同 skill/task/context/model/runIndex 的 paired cells。
3. No-skill、exact original、ir-static 与 optimized 分开；original 必须读取完整 source closure。
4. Deterministic scorer 是成功权威，LLM judge 只作辅助诊断。
5. Runtime validator、semantic failure 与 infrastructure failure 分列。
6. 预注册分母不因失败丢行；`retries=0`。
7. Development 与 held-out 在文件、digest、runner identity 和可见性上隔离。

## 2. 目录与职责

```text
benchmarks/skill-ir/corpus/                 corpus registry、intake、portfolio
benchmarks/skill-ir/contexts/               context definitions
benchmarks/skill-ir/pilots/<skill>/         source、tasks、contract、IR、package、lock
src/benchmarks/skill-ir/matrix.ts            systems/cells
src/benchmarks/skill-ir/real-agent*.ts       materialization 与 execution
src/benchmarks/skill-ir/scoring.ts           scored row 与 pairing
src/bench/evaluators/                        task-specific deterministic scorer
src/benchmarks/skill-ir/*gate*.ts            preregistered gates
results/skill-ir/                            compact evidence 与本地 raw runs
```

## 3. Corpus 生命周期

Corpus registry 要求显式 `--corpus=calibration|pilot`。Synthetic calibration 与真实 pilot 不混用。

真实 skill 常见状态：

```text
selected
-> source-frozen
-> tasks-authored
-> benchmark-audited
-> runnable (有 source-audited base IR)
-> development-gated
-> heldout-eligible
```

`tasks-authored-calibration` 只允许一个显式 skill，并只调度 `no-skill | original` 的 development tasks。
它不会伪造 `irPath` 或 runnable 状态。

当前证据角色由 `method-portfolio.json` 管理；旧 Wave 标签不作为研究分母。

## 4. Experiment Systems

| System | 含义 | 调度条件 |
|---|---|---|
| `no-skill` | 只给用户可见任务。 | baseline |
| `original` | 完整、精确 source closure。 | baseline |
| `ir-static` | profile-empty base IR 经静态 passes/lowering。 | source audit 后 |
| `ir-pgo-dev` | development-only dynamic candidate。 | typed residual 后 |
| `ir-pgo` | Final IR held-out consumption。 | development gate 后 |
| `validated-artifact` | package compiler/runtime 产物。 | package+execution freeze 后 |

默认 cold-start 为前三项；`ir-pgo` 从不默认出现。其他历史 system label 仅显式 ablation 使用。

## 5. Matrix Identity

最小 run identity：

```text
caseId, skill, task, taskSplit, system,
model, modelFamily, agent, adapter, adapterVersion,
environment, context, panelConfigId, runIndex,
sourceDigest, irDigest, packageDigest, lockDigest
```

Pairing 只在除 system 外身份一致时成立。跨时间、跨 provider、跨 harness 的均值不能冒充 paired delta。

## 6. Materialization

Runner 为每行建立隔离 workdir，并保存初始 manifest。Exact original 从 `sourcePath/sourceFiles` 读取正文和
资源，不能只显示 `Source file: <path>`。Protected input 和 source closure 必须在执行后重新验 digest。

Task-specific scorer 只查看最终 workdir 与初始 manifest，判断：

- required outputs 是否存在、路径是否合法；
- protected inputs 是否被改写；
- schema/semantic contract 是否满足；
- 多余文件、secret、absolute path、nondeterminism 是否出现；
- infrastructure 是否阻止了可判分执行。

## 7. Runner CLI

通用 dry-run：

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts `
  '--corpus=pilot' `
  '--systems=no-skill,original,ir-static' `
  '--contexts=clean' `
  '--agents=skvm' `
  '--environments=windows' `
  '--model=xty/gpt-5.6-sol' `
  '--adapter=pi' `
  '--out-dir=results/skill-ir/<run-id>'
```

真实执行必须由对应 lock-specific runner 或显式 `--execute` 命令生成，先完成 lock validation、resource
probe、route probe 和 qualification。API key 只从环境变量读取，禁止写入 config、plan、raw row 或文档。

评分与通用分析：

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts `
  '--raw=results/skill-ir/<run-id>/raw-runs.jsonl' `
  '--manifest=benchmarks/skill-ir/corpus/corpora/pilot.json' `
  '--out=results/skill-ir/<run-id>/scored-runs.jsonl'

python scripts/analyze_skill_ir_results.py `
  results/skill-ir/<run-id>/scored-runs.jsonl `
  results/skill-ir/<run-id>/summary.csv
```

具体冻结实验优先运行其专用 `*-run.ts`，不要从此示例猜测参数。

API Tester schema-derived artifact 的四系统 development runner：

```powershell
cd D:\skill优化\SkVM
$env:SKVM_AUTO_PROBE = "0"
bun ./src/benchmarks/skill-ir/api-tester-artifact-development-run.ts `
  --phase=qualification `
  --lock=benchmarks/skill-ir/pilots/api-tester/api-tester-artifact-development-lock.json `
  --out-dir=results/skill-ir/api-tester-schema-derived-artifact-development-v1

bun ./src/benchmarks/skill-ir/api-tester-artifact-development-run.ts `
  --phase=execute `
  --lock=benchmarks/skill-ir/pilots/api-tester/api-tester-artifact-development-lock.json `
  --out-dir=results/skill-ir/api-tester-schema-derived-artifact-development-v1
```

该 runner 从两个 `no-skill` identity 派生 direct artifact 行，按公开 fixture 路径选择 YAML/JSON package，
最终形成 4 个完整 quartet。Qualification 与 lock digest 绑定，过期或失败时禁止 execute。

## 8. Benchmark Contract Audit

付费前 audit 至少覆盖：

1. source provenance 与公开 task contract；
2. alternative-valid positive fixtures；
3. semantic/structural negative fixtures；
4. reverse-evidence：删除公开证据后约束消失；
5. gold/expected/sourceQuote/heldout/secret canary；
6. production materialization：真实 fixture、initial manifest、最终 delta；
7. scorer authority：runtime report 不能覆盖最终 scorer。

Benchmark v2 当前审计结果为 42/42 differential 与 36/36 materialization。该结论只说明测量合同可用，
不保证模型条件下有区分度。

## 9. Gate 顺序

```text
task/source freeze
-> benchmark contract audit
-> materialization audit
-> no-skill/original distinguishability calibration
-> source-audited base IR
-> static development
-> typed residual / artifact development
-> development gate
-> held-out freeze + execution
-> promotion or frozen failure
```

Calibration 常见门禁：完整 rows/pairs、0 infra、no-skill 不饱和、至少一个 differing pair。是否要求每个
task 的 original success 由预注册 lock 决定。Partial-benefit re-entry 是新的 prospective admission，
不能改写旧 gate。

当前 re-entry 与 portfolio report 可无成本重建：

```powershell
bun ./src/benchmarks/skill-ir/partial-benefit-reentry-run.ts
bun ./src/benchmarks/skill-ir/method-portfolio-run.ts
```

## 10. Scored Rows 与分析

Scored row 至少包含：`success`、`evaluatorScore`、`failedCriteria`、`runStatus`、`failureType`、tokens、
latency 和完整 identity。分析器输出：

- per-system success/mean/worst；
- paired positive/equal/negative；
- per-task/model/context slices；
- hard-gate 与 criterion failure counts；
- infrastructure counts 和固定分母；
- compile/profile/runtime/repair token 分解。

Token 在质量 gate 通过前只作诊断。Artifact 的 0 model token 不能忽略预编译成本。

## 11. Stable Pi 与基础设施

当前 Windows 主执行面使用 direct Node Pi package + short-path workdir。资格检查绑定 Pi/Bun/Node 版本、
CLI digest、adapter source、maximum path length 和 output root。历史 Bun crash、fetch-active、transport 与
source-process replay 是基础设施诊断，不进入 skill 效果分母。

新增 runtime 版本必须解决新的可复现 blocker；不能为单个实验继续堆 transport/harness 变体。

## 12. 结果持久化

提交到 Git：

- task/source/heldout freeze；
- lock、audit、gate report；
- compact scored rows/summary；
- 被 provenance 直接绑定的必要 snapshot。

默认仅本地：

- raw run workdir、qualification-work、临时 artifacts；
- route/debug probe；
- 可由 lock+runner 重新生成的 plan。

治理时不得删除仍被 digest 或结果引用的文件。原始本地数据先通过 inventory 判断，再由用户决定清理。

## 13. 验证与修改注意

```powershell
bun test ./src/benchmarks/skill-ir
bun run typecheck
python scripts/check_skill_ir_doc_links.py --root .
git diff --check
```

- 修改 task/scorer/audit 后必须使用新 identity；冻结文件不原地改。
- 不把 evaluator payload 放进 prompt、package、repair 或 raw model input。
- 不把环境 label 当作真实 OS 证据。
- 不因 API 预算充足而绕过 audit、qualification 或停止规则。
