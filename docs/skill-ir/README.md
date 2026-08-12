# Skill IR 文档入口

本目录是 SkVM Skill IR / AOT 优化研究的唯一权威文档入口。项目研究如何把有来源的自然语言
skill 编译为结构化 IR 和可执行 artifact，并用 development execution feedback 提高不同模型、
上下文与执行环境下的稳定性。

项目有两条同等重要的主轴：

1. 研究方法与实验可信度：公开合同、确定性 scorer、development/held-out 隔离、完整分母和可追溯结果；
2. 通用优化系统：同一套 core 接收不同真实 skill，自动生成 provenance-bound optimized package，
   不依赖按 skill id 写死的分支。

优化成功先要求质量不劣、稳定性改善且回归受控；通过后再比较平均质量和重复调用的摊销 Token。
显著正向单案例不能替代通用性，Token 节省也不能抵消质量回归。

## 当前结论

- IR schema、parser、validator、profiler、静态 passes、lowering、真实 runner、持久化 workdir、
  确定性 scorer 和 paired analyzer 已实现。
- Experimental Design Benchmark v2 的测量合同通过 42/42 differential 与 36/36 materialization audit；
  相较该案例的 v1，
  alternative-valid false reject 从 6/8 降为 0/42，当前可以用于方法开发，但这不等于优化已成功。
- `env-manager` 的确定性 repair 在 3 个完整 development pair 上由 0.90 提升到 1.00；预注册分母
  含 1 个 infrastructure failure，gate 失败。
- `law-to-markdown` artifact 在 development 为 4/4、mean 0.925；held-out 为 2/4、mean 0.725，
  出现 2 次回归，package 未晋升。
- `experimental-design` v2 的旧任务贡献面不足；skill-unique slice 已通过贡献可识别性审计，但强模型
  no-skill/original 仍同时饱和。两者分别属于 benchmark underidentification 与 model capability saturation。
- 公共 artifact assembly 已在 API Tester 与 Experimental Design v1 两种 phenotype 上 shadow rebuild：
  23 个 production files、2/2 package 逐字节一致、2/2 catalog valid、`coreBranchDelta=0`。新的
  Experimental Design v2 compiler 已接入该 assembly，本地 2/2 development fixture 通过；因基线饱和，
  没有创建付费 optimized lock，也不计为第二个 development 正向 phenotype。
- `api-tester` 旧 baseline gate 仍失败；prospective re-entry 后，新 source-audited schema-derived artifact
  development 矩阵完成 16/16、0 infrastructure。No-skill/original/ir-static mean 分别为
  0.15/0.225/0.3875，artifact 为 4/4、mean 1.0、runtime model tokens 0，development gate 通过。
  该结果只计 method-development，不开放 held-out、replication 或跨模型 claim。
- `zh-readme` v1/v2 两次校准均冻结 measurement-invalid。v2 的 8/8 行无基础设施失败，并确认 original
  会把 skill-package-only `LICENSE.upstream` 链接带入 task README；但 scorer 仍误拒绝 existing local path
  command argument，因此不进入 base IR。
- Law v3 已补齐 `deliverablePath: string|null` 的公开 ABI，真实报告 0 representation false reject；但
  original mean 0.85 低于 no-skill 0.90，基线 gate 失败。旧 i18n v3 执行可观测 successor 两臂饱和；新的
  contribution-v2 任务删除 answer-bearing recipe，并公开 placeholder/plural 语义，真实 paired gate 为
  8/8、0 infra、4/4 differing、3 positive，original/no-skill mean 为 0.925/0.525。现已完成只绑定 exact
  source、development prompt、public contract 与 report semantics 的 profile-empty base IR 和逐节点 source
  audit。首个 12-row static development 分母完整，但有 4 个 infrastructure failure（1 timeout、3 个同位
  cross-system parse-failed），gate 冻结失败；尚无 artifact、held-out 或 Token 优化证据。
- Method portfolio v2 已机器化登记 7 个 case：7 studied、7 contract-qualified、2 static-fidelity passed、
  0 untouched replication、1 个 optimized-development-passed phenotype；readiness 仍未通过。i18n v4 已排除
  infrastructure blocker，但因 1 个 paired quality regression 冻结为方法负结果。
- 通用 successor selection policy/report 已冻结全部 7 个候选并预先选择 Env Manager。首个 source-derived
  identity 虽以 8/8 canary 通过本地 audit，真实 resilient baseline 的 8/8 行、4/4 pair、0 transient/active/
  parser/runtime failure 暴露两项 scorer-authority 缺口：original 独有的合法 source resource 被误判为输入漂移，
  且标准 JSON Schema 被未公开的 `variables` 包装要求误拒。该身份已冻结 measurement-invalid；successor v3
  已公开两种 schema 表示等价，以 frozen initial manifest 作为 arm-neutral protection authority，并通过包含
  `LICENSE.upstream` materialization 的 8/8 canary。v4 baseline 已以 8/8 rows、4/4 pairs、0 infrastructure、
  original 4/4 vs no-skill 3/4 通过 admission；当前开放 profile-empty base IR/static，artifact/held-out 仍关闭。
- 研究脚本已经能完成各阶段实验，但 spec 约定的统一 `import/optimize/validate/report` CLI、library API 与
  Optimizer Agent 尚未串成最终用户路径。
- 当前还不能声称跨模型、跨 agent、跨 OS 稳定或摊销 Token 节省。

## 当前下一步

```text
冻结旧结果，不改 gate
-> contribution-v2 已证明 i18n 的 skill 增量可识别
-> source-audited profile-empty base IR（已完成）
-> no-skill | original | ir-static development（首个 identity 因 infrastructure 冻结失败）
-> lifecycle v2 已分离 contract/baseline/static/optimized/promotion
-> successor policy 已预注册 Env Manager
-> Env Manager v2 baseline-v1 已冻结 measurement-invalid
-> Env Manager v3 contract + development freeze + baseline admission passed -> base IR/static -> artifact
-> 第二个 optimized development phenotype
-> 补齐前瞻自动化/适配成本
-> readiness gate
-> 用另一项 untouched skill 做冻结 replication
-> 固定三模型族、clean + noisy/long 与成本摊销主实验
-> 统一 CLI/library/Optimizer Agent 交付入口
```

方法案例数量不固定，6 只是起点。最终用户不需要逐 skill 手工分析；方法开发期允许人工审核声明式
adapter/contract，但必须记录人工时间、LOC、artifact 复用率、`coreBranchDelta` 和未自动化步骤。

## 权威文档

| 文档 | 唯一职责 |
|---|---|
| `developer-guide.md` | 从零上手、命令、参数、实验生命周期、结果判读与当前开发接力点。 |
| `skill-ir-aot-optimization-spec.md` | 当前研究契约、claim、证据边界和成功条件。 |
| `skill-ir-aot-optimization-plan.md` | 当前 ledger、执行顺序和活跃文件级 TDD。 |
| `ir-core.md` | IR 类型、parser、validator、passes 与 lowering。 |
| `evaluation-system.md` | Corpus、matrix、runner、scorer、gate 与结果持久化。 |
| `optimization-and-artifacts.md` | 动态反馈、Final IR、artifact compiler 与 runtime。 |
| `real-skill-pilots.md` | 真实来源、portfolio 角色、intake 与 pilot 生命周期。 |
| `experiment-results.md` | 冻结证据总表、关键数值和结果路径。 |
| `history.md` | 阶段演进、重要决策和旧内容恢复方法。 |

`related-work.md` 已被并入 spec 的“研究定位”章节，不再单独维护。

## 阅读路径

- 第一次了解：本文件 -> `developer-guide.md` -> spec -> experiment results -> plan。
- 第一次亲手开发或跑实验：`developer-guide.md` -> 对应组件文档 -> plan 的活跃 TDD。
- 修改 IR：`ir-core.md` -> `src/skill-ir/` -> `src/profiler/`。
- 修改评估：`evaluation-system.md` -> `src/benchmarks/skill-ir/` -> `src/bench/evaluators/`。
- 修改优化产物：`optimization-and-artifacts.md` -> compiler/runtime/checker 代码。
- 扩真实 skill：`real-skill-pilots.md` -> intake -> pilot corpus。

## 代码与数据地图

```text
src/skill-ir/                         IR schema/parser/validator/passes/lowering
src/profiler/                         trace 与 profile annotation
src/benchmarks/skill-ir/              benchmark contracts、runner、gate、artifact
src/bench/evaluators/                 确定性离线 scorer
benchmarks/skill-ir/corpus/            registry、intake、portfolio、provenance
benchmarks/skill-ir/pilots/            source closure、tasks、IR、package、lock
results/skill-ir/                      compact evidence 与本地原始执行产物
.skvm/                                 本地配置、cache、log、source checkout，不提交
```

`results/skill-ir/` 采用两层持久化：论文可引用的 compact report、scored rows、freeze 和 summary
提交到 Git；raw workdir、qualification 临时目录、artifact snapshot 和调试重放默认留在本机，只有被
provenance 明确引用时才提交。不得因治理删除冻结结果或用户尚未确认的本地原始数据。

## 主流程

```text
Public SKILL.md + provenance
  -> static parse/source audit
  -> base Skill IR + static passes
  -> ir-static
  -> original/static development execution
  -> typed residual RepairEvidence
  -> provenance-bound Final IR candidate
  -> artifact package compiler
  -> preflight + generate + validate + at most one repair + revalidate
  -> deterministic offline scorer
  -> development gate
  -> held-out only when the frozen gate passes
```

## 常用验证

```powershell
cd D:\skill优化\SkVM
python scripts/check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py --root .
bun test ./src/benchmarks/skill-ir
bun run typecheck
git diff --check
```

## 维护规则

1. 不为单轮实验新增 Markdown；详细数据进入 `results/`，结论更新到 evidence ledger。
2. 组件行为只在对应组件文档解释，spec/plan 不复制实现全文。
3. 已完成阶段进入 `history.md` 的摘要；原文由 Git history 恢复，不建设巨型 archive。
4. 旧 lock、package、scorer 和结果保持不可变；新方法使用新 identity。
5. 新增、删除或改名文档后必须运行全仓链接检查。
6. 任何 held-out、跨模型、跨环境或 Token 主张必须回指冻结结果，不能从计划推断。
