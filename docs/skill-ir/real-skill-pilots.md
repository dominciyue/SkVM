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
| law-to-markdown | document/script/template | studied method-development | development pass，held-out regression。 |
| experimental-design | scientific allocation/report | studied method-development | v2 measurement qualified，baseline saturated。 |
| api-tester | OpenAPI/schema/test-plan | method-development | 新 artifact development 4/4、mean 1.0；held-out 关闭。 |
| zh-code-reviewer | evidence/severity/report | untouched candidate | 未冻结任务与 scorer。 |
| zh-readme | fact extraction/template/link | untouched candidate | 未冻结任务与 scorer。 |

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

历史三个 Wave A v1 audit 均失败，因此只算 `support-real`。Experimental Design v2 和 API Tester 的新
合同通过各自 audit，但仍需单独过区分度与优化 gate。

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

`method-portfolio-readiness/v1` 五条件以 spec 为准。当前报告为 6 registered、4 studied、2 qualified、
0 replication、0 passed qualified phenotype，五项 gate 全 false。Readiness report 必须显示真实不足，
不能把 studied、benchmark version 或 audit-failed case 填充为 contract-qualified。

## 10. Intake 顺序

新案例按信息增量排序：

1. 许可证与 source closure 可冻结；
2. phenotype 填补 portfolio 空缺；
3. deterministic scorer 可行；
4. 依赖/网络/平台风险可隔离；
5. 复用已有 artifact kind 的同时能检验通用 core；
6. 预计人工适配可被声明式 contract 表达。

当前优先评估 `zh-code-reviewer`、`zh-readme` 和一个 license 已验证的非开发工具类 skill。不要一次导入大批
候选后再补任务；每个案例先完成 provenance、task、scorer、audit 的竖切。

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
