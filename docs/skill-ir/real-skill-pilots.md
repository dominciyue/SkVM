# 真实 Skill Corpus 与 Method Portfolio

本文是现实来源、证据角色、intake 和 pilot 生命周期的权威说明。实验数值见 `experiment-results.md`。

## 1. 为什么使用真实 Skill

自制 synthetic seed 适合测试 schema、runner 和受控失败，不足以证明方法对公开 skill 有效。主研究对象
必须满足：可定位仓库/commit/path、许可证可判断、source closure 可冻结、任务可用公开证据判分，并覆盖
不同 phenotype。

Synthetic seed 的证据权重固定为 `calibration-low`。真实案例也只有通过 benchmark contract audit 后，
才能计入 contract-qualified 分母。

## 2. 来源

| 来源 | 角色 | 许可证边界 |
|---|---|---|
| `anbeime/skill` | 主要聚合来源 | 仓库级许可混合，逐 artifact 审计。 |
| `laolaoshiren/claude-code-skills-zh` | 中文开发类补充 | MIT。 |
| `travisvn/awesome-claude-skills` | 索引 | 不直接视为 source，跟随链接审计。 |
| `K-Dense-AI/claude-scientific-skills` | 非编码科学 workflow | MIT。 |

机器可读来源与候选在 `benchmarks/skill-ir/corpus/real-skill-intake.json`。

## 3. 角色模型

旧 `Wave A/Wave B` 只作为历史信息。当前角色：

- `studied`：已进入过设计或实验，可解释方法演进；
- `method-development`：允许用于提炼通用 core/catalog/adapter；
- `contract-qualified`：benchmark audit 通过，可进入研究分母；
- `untouched-replication-candidate`：尚未参与方法修改；
- `untouched-replication`：在方法 readiness 冻结后，用冻结 core 执行。

同一 upstream skill 的 v1/v2/skill-unique benchmark 只算一个 real-skill case。Benchmark 版本数不能冒充
跨 skill 广度。

## 4. 当前 Portfolio

| Skill | Phenotype | 当前角色 | 关键边界 |
|---|---|---|---|
| env-manager | environment/schema/repair | studied method-development | v1 audit failed；机制证据保留。 |
| law-to-markdown | document/script/template | contract-qualified method-development | v2 audit 30/30；待新基线；v1 held-out regression 保留。 |
| experimental-design | scientific allocation/report | studied method-development | v2 measurement qualified，baseline saturated。 |
| api-tester | OpenAPI/schema/test-plan | method-development | 新 artifact development 4/4、mean 1.0；held-out 关闭。 |
| zh-code-reviewer | evidence/severity/report | contract-qualified method-development | 静态保真 12/12、0 infra、ir-static 4/4、0 regression；optimization/held-out 未开放。 |
| zh-readme | repository fact/documentation | contract-qualified method-development | v1 calibration 8/8、0 infra，但 public-equivalence scorer false reject，measurement invalid。 |
| i18n-helper | React+i18next source transformation | contract-qualified method-development | 首个竖切 audit 30/30；待区分度校准。 |

方法开发至少 6 个 contract-qualified case 起步，并在 readiness 未过时继续扩充。API Tester 进入方法开发后
不再是 untouched。Replication 需要另选 skill。

## 5. Source Closure

每个 pilot 必须冻结：

```text
repository URL
commit
upstream path
license file
SKILL.md
referenced scripts/references/assets
sha256 per file
resource/environment contract
```

`original` 必须物化完整 closure。缺失脚本、未解析许可证、网络依赖或平台假设都在 intake 标记，不能用
agent 失败替代资源审计。

## 6. Task 与 Benchmark 设计

每个深度 pilot 先写 2 development + 2 held-out。Task 必须：

- 对 no-skill 可执行，但不把 skill 的关键答案直接写入 prompt；
- 输出可由最终 workdir 确定性评分；
- 包含 alternative-valid 实现；
- development/held-out 在 scorer 前冻结；
- hidden evaluator payload 不进入模型、compiler 或 repair；
- 明确工具/脚本/依赖不可用时属于 infrastructure 还是 semantic。

先做 `no-skill | original` 区分度校准。两臂都满分说明任务饱和；两臂都崩且无可解释差异时，不应继续
构造 IR；出现公开、来源可解释的 partial benefit 时，只有 prospective policy 可重新入场。

## 7. Benchmark Contract Audit

Audit 必须证明 scorer：

1. 接受公开合同允许的多种合法实现；
2. 拒绝缺语义、污染输入、secret、nondeterministic 等失败；
3. 不依赖私有 enum、唯一算法、唯一措辞或 source quote；
4. 删除公开证据后相应 oracle 约束消失；
5. held-out/canary/gold 不进入 runtime；
6. 在真实 materialized workdir 上与初始 manifest 一致。

历史三个 Wave A v1 audit 均失败，因此只算 `support-real`。Experimental Design v2、API Tester、Law v2
和 i18n-helper 的新合同已通过各自 audit，但仍需单独过区分度与优化 gate。Law v2 与 i18n-helper 各有
30/30 development-only canary matched；这两份结果不消费 held-out，也不是模型质量证据。

## 8. API Tester Re-entry

冻结 Task 16.22：8/8 rows、0 infra、4 differing pairs；original mean 高于 no-skill，但两 task 的
original success 均为 false，旧 gate failed。该结果保持不变。

新的 `skill-ir-partial-benefit-reentry/v1` 验证 admission passed 后，API Tester 以新 identity 完成
source-audited base IR、YAML/JSON 声明式 adapter 和两个 `validated-skill-artifact/v1` package。冻结
development 矩阵 16/16、0 infra；artifact 4/4、mean 1.0、0 pairwise regression，模型三臂均 0/4。
该结果只将它记为 passed method-development phenotype；不能把旧 gate 改判，也不开放 held-out、
untouched replication 或跨模型 claim。

## 9. Portfolio Readiness

Registry 对每个案例记录：

```text
provenance + phenotype
role + benchmark audit
development gate
humanMinutes + adapterLoc
artifactKinds + coreBranchDelta
unautomatedSteps + blockers
```

`method-portfolio-readiness/v1` 五条件以 spec 为准。当前报告为 7 registered、7 studied、6 qualified、
0 replication、1 passed qualified phenotype；readiness 仍 failed。Readiness report 必须显示真实不足，
不能把 studied、benchmark version 或 audit-failed case 填充为 contract-qualified。

## 10. Intake 顺序

新案例按信息增量排序：

1. 许可证与 source closure 可冻结；
2. phenotype 填补 portfolio 空缺；
3. deterministic scorer 可行；
4. 依赖/网络/平台风险可隔离；
5. 复用已有 artifact kind 的同时能检验通用 core；
6. 预计人工适配可被声明式 contract 表达。

当前优先为 Law v2 与 i18n-helper 冻结并运行 `no-skill | original` 区分度校准；未过门时按停止规则处理，
不提前构造 IR。不要一次导入大批候选后再补任务；每个案例先完成 provenance、task、scorer、audit 的竖切。

`zh-code-reviewer` 当前可复建命令：

```powershell
bun ./src/benchmarks/skill-ir/zh-code-reviewer-contract-run.ts
bun ./src/benchmarks/skill-ir/zh-code-reviewer-contract-audit-run.ts
```

第一条由冻结 builder 重建 development/heldout task JSON；第二条只读 development，生成
`results/skill-ir/benchmark-contract-audit/zh-code-reviewer-v2.json`。v2 audit 为 20/20；旧 v1 calibration
因结构化 summary 的私有 string 约束冻结为 invalid。修复后的 v2 校准为 8/8、0 infra，original 4/4、
no-skill 3/4；唯一失败来自额外 `NUL` 文件违反公开 exact-output contract，因此允许进入 base IR/source
audit。当前已提交逐节点 source audit 并晋升为 runnable；静态阶段使用同一 Pi/强模型身份运行
`no-skill | original | ir-static` 12 行保真矩阵。唯一执行为 12/12、4/4 triplets、0 infra：no-skill
4/4、original 3/4、ir-static 4/4，static 相对 original 为 1 positive、3 equal、0 negative。正向 pair 来自
original 将主要证据行各锚早一行，而 static 按公开 line contract 定位正确；该 residual 已由 base IR 解决，
不生成 overlay。Static 比 original 多 4,280 tokens，故没有 Token 收益。该 gate 只开放 typed residual
audit，仍不开放 artifact、held-out、跨模型或优化 claim。

```powershell
bun ./src/benchmarks/skill-ir/static-development-run.ts `
  --phase=plan `
  --lock=benchmarks/skill-ir/pilots/zh-code-reviewer/static-fidelity-lock.json `
  --out-dir=results/skill-ir/zcr-static-fidelity-v1
```

后续将 `--phase` 依次改为 `route-probe`、`execute`。execute 后仍由冻结 deterministic scorer 与
`static-development-gate-run.ts` 生成 compact gate；不得把静态保真通过解释为 skill 已优化。

`zh-readme` 的 task 与 contract audit 可复建命令：

```powershell
bun ./src/benchmarks/skill-ir/zh-readme-contract-run.ts
bun ./src/benchmarks/skill-ir/zh-readme-contract-audit-v2-run.ts
```

首条重建冻结的 development/heldout task JSON；第二条只消费 development，生成 24/24 v2 compact audit。
该案例的付费校准使用技能无关的 `method-case-calibration-run.ts`，而不是再复制一个 `zh-readme` runtime：

```powershell
bun ./src/benchmarks/skill-ir/method-case-calibration-run.ts `
  --phase=plan `
  --lock=benchmarks/skill-ir/pilots/zh-readme/pi-direct-cli-short-path-calibration-lock-v2.json `
  --out-dir=results/skill-ir/zrm-pi-v2
```

随后只在同一冻结目录把 `--phase` 改为 `qualification`、`execute`。Runner 会验证全部 digest、source
closure、split/provenance/audit guards、Pi/Node/Bun 身份、8 行成对矩阵、Windows 短路径预算、唯一公开
输出和 harness residue；执行结束后调用确定性 scorer 与通用 pre-IR gate。该合同可供后续方法案例复用，
但既有 reviewer lock/result 保持不可变。

v1 dry-run 为 8 rows/4 pairs、最长 workdir 145；qualification 的 Pi/resource/route/唯一 README/residue
全部通过。唯一付费矩阵也是 8/8、0 infra，但 v1 scorer 把公开允许的保守安装说明、标准命令别名和许可证
等价写法误判，同时漏检指向 skill-package `LICENSE.upstream` 的 task-repository 断链。因此 v1
`measurement-validity.json` 标为 invalidated，不开放 base IR，也不把 original mean 0.7 与 no-skill 0.8
解释为真实回归。下一次必须使用新 identity，先补 equivalence/broken-link canary 与新 audit/lock。

v2 已完成上述修复并通过 24/24 audit；通用 runner 会按 lock 的 path+digest 动态加载 v2 scorer，仍没有
`zh-readme` skill-id 分支。唯一 development 执行是 8/8、0 infra；no-skill 3/4、mean 0.95，original
2/4、mean 0.90，且 original token 为 120021、no-skill 为 40204。两个 original failure 确认是 task
repository 中不存在的 `LICENSE.upstream` 链接；一个 no-skill failure 则暴露 existing local path 参数等价
仍未建模。故 v2 同样标记 measurement-invalid，数值不用于 skill 效果，base IR/held-out 继续关闭。

## 11. 修改与验证

```powershell
bun test ./src/benchmarks/skill-ir/corpus-registry.test.ts
bun test ./src/benchmarks/skill-ir/benchmark-contract-audit-pilots.test.ts
bun test ./src/benchmarks/skill-ir
bun run typecheck
```

- 修改 corpus/intake 时同步更新 portfolio registry 和本文。
- 冻结 source/task/scorer/lock 不原地改；新工作使用新 version/identity。
- 不删除本地 source checkout 或 raw result，除非确认未被 provenance 引用且用户同意。
