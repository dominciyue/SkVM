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
| law-to-markdown | document/script/template | contract-qualified method-development | v3 public ABI 0 false reject；baseline gate failed，v1 held-out regression 保留。 |
| experimental-design | scientific allocation/report | studied method-development | v2 measurement qualified，baseline saturated。 |
| api-tester | OpenAPI/schema/test-plan | method-development | 新 artifact development 4/4、mean 1.0；held-out 关闭。 |
| zh-code-reviewer | evidence/severity/report | contract-qualified method-development | 静态保真 12/12、0 infra、ir-static 4/4、0 regression；optimization/held-out 未开放。 |
| zh-readme | repository fact/documentation | contract-qualified method-development | benchmark audit 合格；v1/v2 付费 measurement 均 invalid，不开放 base IR。 |
| i18n-helper | React+i18next source transformation | contract-qualified method-development | v2 baseline/base IR passed；首个 static identity 12/12 但 4 infra，gate failed。 |

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
7. 完整公开所有 scorer-visible output 字段的 type、required、enum/nullability 与 object/array value semantics；
   只列字段名不构成完整 ABI。

历史三个 Wave A v1 audit 均失败，因此只算 `support-real`。Experimental Design v2 与 API Tester 的新合同
通过各自 audit，仍需单独过区分度与优化 gate。Law v3 已用完整公开 ABI 恢复 contract-qualified，但
baseline gate failed；i18n v3 恢复 contract-qualified 后仍两臂满分。i18n contribution-v2 进一步公开
placeholder/plural 语义并通过区分度 gate；现已用 exact source、development prompt、public contract 与公开
report semantics 完成 profile-empty base IR 和逐节点 source audit，corpus 晋升 `runnable`。上述案例都未
消费 held-out，这也不是优化成功证据。

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
role + benchmarkContract
baselineAdmission + staticFidelity
optimizedDevelopment + heldOutPromotion
adaptation measurementStatus + timestamps
humanMinutes + adapterLoc + coreBranchDelta
artifactKinds + reusedArtifactKinds + unautomatedSteps
```

`method-portfolio-readiness/v2` 五条件以 spec 为准。当前报告为 7 registered、7 studied、7 qualified、
2 static-fidelity passed、0 replication、1 optimized-development passed phenotype；readiness 仍 failed。
Readiness report 必须显示真实不足，不能把 studied、benchmark version、baseline/static pass 或 audit-failed case
填充为 optimized/contract-qualified。`method-successor-selection-report/v1` 已在 Env Manager successor 合同开发前
冻结全部 7 个候选，Env Manager 因填补 environment-schema-repair、已有确定性 repair/package 机制且信息互补性
高而入选；旧 benchmark 和 V4 结果只作诊断，不自动取得任何新阶段资格。

Env Manager successor v2 已完成新的 source-derived contract：两个 development task 只公开统一 interface 与
推导政策，不公开逐 fixture 的 gold 集合；scorer 从 `.env` 与源码引用动态重建 oracle，接受 string/object finding、
任意顺序和不矛盾的额外说明。2 task、3 criterion、8 个 alternative/safety canary 全部 matched，但真实 baseline
发现 audit 未覆盖的 source-resource arm asymmetry 与标准 JSON Schema 表示 false reject；因此 contract 与 baseline
均回退为 scorer-authority invalidated。执行基础设施本身完成 8/8、4/4、0 replacement/active/parser/runtime failure。
下一 identity 必须先公开两种 schema 表示等价并用真实 resource materialization canary 验证。
该修复已由 successor v3 完成：公开 interface 明确 wrapper/标准 JSON Schema/敏感标记等价规则；scorer 以 frozen
initial manifest 保护每个 arm 实际存在的全部初始资源，8/8 contract canary matched。v2 measurement-invalid
保持不变；v3 已冻结 development-only task/source identity，held-out 保持 `not-authored` 且未来须重新隔离。
当前只恢复 contract qualification；baseline、base IR、static 和 artifact 仍未完成。
v4 paired baseline 随后以 8/8 rows、4/4 pairs、0 infrastructure、original 4/4 vs no-skill 3/4 通过 admission；
当前已开放 base IR/static，optimized artifact 与 held-out 仍关闭。

## 10. Intake 顺序

新案例按信息增量排序：

1. 许可证与 source closure 可冻结；
2. phenotype 填补 portfolio 空缺；
3. deterministic scorer 可行；
4. 依赖/网络/平台风险可隔离；
5. 复用已有 artifact kind 的同时能检验通用 core；
6. 预计人工适配可被声明式 contract 表达。

共享 `public-output-abi/v2` 与 i18n v3 新身份已完成，ordered/set-like array semantics 与 scorer dependency
closure 均已验证。旧 v3 两臂 4/4 饱和后，没有创建 benchmark v4；新的 contribution task-set 用于修复
answer-bearing task 造成的贡献不可识别。`contribution-v1` 的真实输出暴露 placeholder/plural 私有语义并冻结为
measurement-invalid；`contribution-v2` 公开这些语义后完成唯一 8-row baseline：0 infra、4/4 differing、
3 positive，original/no-skill mean 0.925/0.525，gate passed。Source-audited base IR 已完成并通过 validator、
lowering 与 leak canary；`ir-static`、optimized artifact 与 held-out 均尚未运行。

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

`i18n-helper-contribution-v2` 的静态预注册复用同一入口：

```powershell
bun ./src/benchmarks/skill-ir/static-development-run.ts `
  --phase=plan `
  --lock=benchmarks/skill-ir/pilots/i18n-helper/contribution-v2/static-development-lock.json `
  --out-dir=results/skill-ir/ihc-static-v1
```

该 lock 冻结 12 rows/4 triplets、Pi managed short-path、`retries=0` 和 improvement gate；`route-probe`、
`execute` 只能在 lock 提交后按顺序运行。即使 development gate 通过，也只允许 residual audit/artifact
eligibility，held-out 仍关闭。

该 identity 的 qualification 通过，唯一 execute 也完整落盘 12 rows/4 triplets；但 1 个 static timeout 和
同一 partial-plural run-index 横跨三臂的 3 个 zero-usage `parse-failed` 使 infrastructure gate failed。
有效 pair 中 1 positive、1 equal、0 regression 不能覆盖 4 个 infra，故 artifact eligibility 与 held-out
继续关闭，且不允许用同一 lock 补行。

后续并列 v2 runner 使用 value-free streaming envelope、idle/absolute/step/outer 四层终止语义、预注册整组
replacement 与 selected/all-attempt 双口径。v2/v3 qualification 分别冻结“完整任务误用 180 秒 probe budget”
和“标准 Pi thinking 未被 allowlist 识别”，修复后才创建 v4。v4 qualification 与唯一 12 行矩阵均自然完成，
12/12 selected、0 replacement、0 infrastructure sensitivity。质量 gate 仍 failed：original 3/4、mean
0.9625；ir-static 3/4、mean 0.875；0 improved、1 regressed。Static 非缓存 token 少 24.64% 不能抵消质量
回归，故 i18n artifact candidate、held-out 与 optimized/efficiency claim 均关闭；下一步改选另一个已合格案例。

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
