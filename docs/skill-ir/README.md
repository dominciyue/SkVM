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
- Method portfolio v3 已机器化登记 7 个 case：7 studied、7 contract-qualified、2 static-fidelity passed、
  0 untouched replication；API Tester 是 1 个 `quality-positive`，Env Manager 是 1 个
  `fidelity-preserving`，尚无 `efficiency-positive`，所以 readiness-eligible optimized phenotype 只有 1 个。
  i18n v4 已排除 infrastructure blocker，但因 1 个 paired quality regression 冻结为方法负结果。
- 通用 successor selection policy/report 已冻结全部 7 个候选并预先选择 Env Manager。首个 source-derived
  identity 虽以 8/8 canary 通过本地 audit，真实 resilient baseline 的 8/8 行、4/4 pair、0 transient/active/
  parser/runtime failure 暴露两项 scorer-authority 缺口：original 独有的合法 source resource 被误判为输入漂移，
  且标准 JSON Schema 被未公开的 `variables` 包装要求误拒。该身份已冻结 measurement-invalid；successor v3
  已公开两种 schema 表示等价，以 frozen initial manifest 作为 arm-neutral protection authority，并通过包含
  `LICENSE.upstream` materialization 的 8/8 canary。v4 baseline 已以 8/8 rows、4/4 pairs、0 infrastructure、
  original 4/4 vs no-skill 3/4 通过 admission；profile-empty base IR 与逐节点 source audit 已完成，corpus 晋升
  runnable。随后 static-fidelity 唯一矩阵 12/12、4/4 triplets、0 infra，三臂均 4/4、mean 1.0，static 对
  original 无回退；artifact 四臂唯一矩阵随后 16/16、4/4 quartets、0 infra，validated artifact 4/4、mean
  1.0、0 regression、runtime model tokens 0。全成本审计已恢复 production/research 分账、N=1/2/5/10 与
  历史 missing 清单；自动 compiler token 仍未前瞻测量，break-even 不可计算。因此结果只证明第二 phenotype
  的 artifact fidelity，不能作为第二个 readiness 优化正例；held-out 仍关闭。
- 通用双源 residual admission 已从 Env 特化路径中拆出：声明式 mapping 绑定 static v2 lock/gate/envelopes/
  selected scored rows/base IR/source audit，按 criterion 同时要求跨任务与任务内重复。Eligible evidence 可通过
  同一命令入口编译为 typed overlay、Final IR 与 development-only provenance v3；blocked/无残差都停止。
  Env Manager v3 当前冻结 static evidence 的真实复核为 `no-reproducible-residual`、0 repairs，因此没有生成
  dynamic Final IR，也没有改变其 fidelity-preserving 分类。
- 研究脚本已经能完成各阶段实验，但 spec 约定的统一 `import/optimize/validate/report` CLI、library API 与
  Optimizer Agent 尚未串成最终用户路径。
- 三模型族 v4 development 小面板已执行 36 个 model attempts + 4 个 shared anchors：GPT/Claude 各 12/12
  semantic-complete；DeepSeek 因 2 次语义前 idle、1 次 active absolute timeout 与 1 个 Pi compaction parser
  缺口，只完成 11/12 triplets、33/36 model rows，冻结为 blocked。补充审计把缺失比较显式记为 `missing=1`
  并恢复全尝试成本，原冻结报告与分数不变；已评分方向 mixed，这不是跨模型主证据。
- Statistical Power 首轮 qualification + baseline 共实际调用 9 次；正式 matrix 8/8 semantic-complete、0
  infrastructure，证明当前 progress-aware timeout 足以容纳正常的 100--159 秒任务。但公开 interface 只声明
  JSON 顶层字段，scorer 私下要求 23 个嵌套 pointer，造成 8/8 顶层合同满足、0/8 strict schema 满足；该批冻结
  `measurement-invalid`，不进入 base IR/static/dynamic，也不能解释 skill 效果。通用 public JSON disclosure
  preflight 已补入未来合同流程。
- Task 18.15 已完成独立的前瞻 compiler cost capture。API Tester 与 Env Manager v3 的既有 compiler 在
  Bun 1.3.14 / Windows x64 临时目录重建 4 个 package，4/4 manifest byte parity、4/4 package validation，
  实测 compiler/package duration 分别为 133.46ms 与 63.16ms，模型调用和 token 均为 0。两者因 adapter、
  compiler 与 development lock 都是历史手写，严格保持 `mechanism-only`；这证明未来候选可前瞻保存成本，
  不会把历史人工构造成本补写成 0，也不改变 Env Manager 的 break-even 或 portfolio 分类。
- Task 18.19 已把 public JSON preflight 从 pointer closure 扩展到独立首版 value-semantics disclosure。通用合同
  覆盖 canonical value、representation equivalence、array element identity、normalization 与 cross-field
  relationship，并要求真实 evaluator canary。BIDS v1 只读回放保持 pointer 17/17 passed，但 7 项 evaluator
  value semantics 只有 2 项已公开、5 项未公开，因而在 qualification/paid 前明确 blocked；0 模型调用。
- Task 18.20 已完成 BIDS successor 可行性审计。五项缺失语义均可公开且非 answer-bearing，但 v1 的精确表示不应
  原样继承：保留 normalization/summary，泛化 affected path，替换 source-reference evidence 与 path-sensitive
  issue identity。15/15 source-derived canary 通过，结论为 `feasible-with-evaluator-redesign`；只开放新身份冻结。
- Task 18.21 已冻结独立的 `bids-successor-semantic-scorer-v2` 测量身份。新 public interface/scorer 的 pointer
  closure 为 17/17，7 项 value semantics 全部公开且精确一致，21/21 canonical/alternative/invalid canary 通过；
  data/sidecar 表示均可接受，无关 manifest path、重复 semantic repair、非规范路径、错误 summary 与语义遗漏均
  被拒绝。BIDS v1 字节与 claim 保持不变；本阶段 0 模型调用、0 held-out，尚未授权 qualification 或付费执行。
- Task 18.22--18.24 已依次冻结 successor 的 1+12 development lock、完成唯一一次基础设施资格，并在付费矩阵前
  冻结 analysis/runner 身份。资格四门全绿、`paidCalls=1`；新 policy 固定 12 model rows、4 deterministic
  controls、三组 paired estimand、task -> repetition -> system 顺序与单一原子 prefix checkpoint。Compact matrix
  freeze 为 0 新调用、0/12 matrix rows，只授权下一阶段执行同一 lock 的唯一 forward-only 分母。
- Task 18.26 已实现首个 source-only automatic construction：7 个 method case 均在 manual oracle 读取前生成
  contract/base IR/validation-plan/non-executable package candidate，0 model/API、0 held-out/evaluator、0 case-specific
  adapter LOC/activation human minutes、core branch delta 0；共享核心成本为 28 human minutes。6 个可比较 manual
  base IR 的 exact rule overlap 均为 0，说明 benchmark task ABI 与领域 runtime 语义仍需人工/后续自动融合；四类
  portfolio eligibility 仍为 0/7，readiness 不变。
- Task 18.27 已把终态输入边界收紧为 `SKILL.md + 薄声明式 task 说明`。7 份声明均在 20--27 LOC、13--20
  semantic entries 内，总 authoring 15 human minutes；统一 core 自动生成 7/7 domain contract、task-ABI IR、
  validation plan 与 package candidate，并在 manual oracle 前冻结。报告严格分列 144 个 source units、75 个
  declaration units 和 150 个自动 bindings；19 个结构 predicate 可生成确定性 plan，21 个领域 predicate 仍缺
  qualified runtime，7/7 仍需人工，semantic parity 均为 `not-established`，四类 eligibility 保持 0/7。
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
-> Env Manager v3 contract -> baseline -> base IR -> static -> artifact（均已完成）
-> 第二 phenotype 的 artifact fidelity 与前瞻适配成本（已完成，但不等于优化正例）
-> 第二/第三模型族 development 小面板已完成首个冻结诊断（blocked/mixed）
-> 取得第二个 quality-positive，或完成质量等价 + 全成本 + break-even 的 efficiency-positive
-> 通用 RepairEvidence admission -> Final IR development 闭环已完成；Env v3 合法无残差并停止
-> Statistical Power 已以 scorer-authority measurement-invalid 停止，不新增候选
-> 公共 declarative pilot adapter/lifecycle shadow parity 已完成（两正一负、0 paid、coreBranchDelta=0）
-> Env Manager 全成本审计已完成：历史缺失不补零，break-even 不可计算，继续 fidelity-preserving
-> 全过程复盘与前瞻 compiler cost capture 已完成：双案例 4/4 byte parity，历史手写路径保持 mechanism-only
-> BIDS construction/qualification/唯一 12-call 分母已完成：12/12 semantic-complete、0 infrastructure blocker
-> residual audit 发现 12/12 repair semantics 匹配但 11/12 被未公开的 issue-path 表示选择拒绝；v1 measurement-invalid
-> public JSON value-semantics preflight 已完成：BIDS v1 pointer pass、5 项语义未公开，付费前 blocked
-> successor feasibility 已完成：2 项保留、1 项泛化、2 项替换，15/15 canary；不原地改 BIDS v1
-> successor public contract + semantic scorer + disclosure identity 已冻结并通过 21/21 canary
-> successor qualification/development identity 已零付费冻结：12-row dry-run、lock-local scorer、只开放一次资格
-> successor 单次 infrastructure qualification 已通过：四门全绿、1 paid、semantic-complete、deterministic scorer
-> successor analysis/matrix runner identity 已冻结：固定顺序、精确 prefix、12+4 denominator，matrix 仍为 0/12
-> successor pre-model artifact controls 已冻结：report v2/repair evidence 合同匹配，4/4、0 model call/token
-> successor 唯一矩阵已完成：12/12 semantic-complete/scored、0 retry/infra；贡献 false、static -0.2
-> hand-authored artifact 4/4 且相对 original +0.2，但 automatic construction=false，BIDS 不计第二 phenotype
-> BIDS v1 始终不复用、不补跑、不重评分；qualification 也不以 task success 或 exact output 预筛模型
-> dynamic 继续关闭；它是可信 residual 驱动路径，不是成熟度打卡项
-> readiness v4 已区分 explained-and-frozen/open-candidate：open=0，但 phenotype=1、automation 7/7 incomplete
-> source-only 与薄声明 domain candidate 路径均已完成；下一步先把封闭结构 predicate 降到通用 runtime/checker，
   再选择一个声明内、非 answer-bearing 的领域 predicate 做 0-paid execution parity，不把 plan binding 误计为 runtime 成功
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
  -> public task/contract + scorer disclosure/canary audit
  -> no-skill | original baseline admission
  -> source-audited profile-empty base Skill IR
  -> static passes
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
