# Skill IR AOT 当前执行计划

**最后更新：** 2026-08-12

本文件只记录当前状态、关键阻塞、活跃开发任务和预计节奏。已完成过程见 `history.md` 与 Git history；
研究边界见 `skill-ir-aot-optimization-spec.md`；冻结数值见 `experiment-results.md`。

## 1. 当前判断

项目已经越过“能不能把 skill 写成 IR、能不能跑真实 agent、能不能确定性评分”的基础阶段，正在解决更难的
问题：**一份真实 skill 的增量方法能否被合法 benchmark 识别，并进一步固化为跨重复调用可复用的 artifact。**

截至当前：

- IR schema、parser、validator、source audit、静态 pass、lowering、typed feedback 和 Final IR provenance
  均有实现与测试；
- runner、Pi harness、workdir materialization、deterministic scorer、paired gate、结果持久化和 benchmark
  contract audit 已形成研究基础设施；
- 7 个真实 skill 已进入 method portfolio，7 个 contract-qualified；
- API Tester 与 Env Manager 两种 phenotype 已通过 optimized development gate；
- i18n contribution-v2 已通过基线准入并完成 source-audited profile-empty base IR；首个 static identity 因
  4 个 infrastructure failure 冻结，resilient v4 已消除 execution blocker，但因 1 个 paired quality regression
  失败，仍无 artifact、held-out 或 Token 优化证据；
- untouched replication、三模型族、noisy/long context、break-even 和面向用户的统一 optimizer CLI 尚未完成。

因此当前不能写“优化系统已经闭环”或“任意 skill 均可自动优化”。准确表述是：**测量与执行框架较成熟，
通用优化内核已有两个 development 正例和多个机制/负结果，跨模型方向性测试、跨 skill 复现与产品化仍在关键路径上。**

## 2. 机器状态 Ledger

| Workstream | 当前状态 | 下一判定点 |
|---|---|---|
| IR core | i18n base IR 与执行韧性 successor 已通过机制验证 | v4 static 为可信质量回归，不开放 artifact |
| Benchmark/evaluation | 合同、贡献识别、runner、scorer 已具备 | 避免再出现 public ABI 或 execution authority 漂移 |
| API Tester | optimized development 4/4、mean 1.0 | 冻结保留；不提前运行 held-out |
| Law | v3 measurement-valid，但 baseline gate failed；旧 held-out 回归 | 暂不重跑，保留为 boundary failure case |
| Experimental Design | 合同合格；skill-unique 贡献面合格但强模型饱和 | i18n 竖切后再决定 efficiency ablation 或 successor |
| Zh Code Reviewer | base IR/static fidelity gate passed | 残差已被 static 解决，不强造 overlay |
| Zh README | v1/v2 measurement-invalid | skill-neutral command semantics 已提炼，暂不堆新版本 |
| i18n Helper | contribution-v2 base IR passed；v4 static 0 infra 但 paired gate failed | 不开放 artifact；转向替代 qualified case |
| Method portfolio | 7 studied、7 qualified、2 passed phenotypes、0 replication | 70% 小面板门槛已达到；冻结跨模型开发面板与自动化边界 |
| Product entry | 研究脚本可运行；统一 `import/optimize/validate/report` 尚未接入 | 方法 readiness 后收敛 CLI/library/Agent |

机器权威入口：

```text
benchmarks/skill-ir/corpus/method-portfolio.json
results/skill-ir/method-portfolio-readiness.json
benchmarks/skill-ir/corpus/corpora/pilot.json
results/skill-ir/i18n-helper-contribution-development-v2/gate-report.json
```

## 3. 当前主要缺口

### P0：优化证据仍薄

API Tester 与 Env Manager 已有两个 contract-qualified phenotype 通过 optimized development gate。证据仍限于
单模型、Windows/clean development；i18n contribution-v2 的可信静态负结果继续保留，不以正例覆盖。

### P0：自动导入与自动编译尚未形成产品路径

Spec 中的 CLI/library/Optimizer Agent 是北向交付合同。当前真实工作仍依赖 pilot-specific task、scorer、lock
和研究脚本；`src/index.ts` 的既有 SkVM 命令尚未串起本项目的 intake -> base IR -> validation plan -> package
-> report 全流程。

### P0：跨条件主证据尚未开始

尚无冻结方法在 untouched skill、三模型族、clean + noisy/long 或第二 harness 上的完整主表，也没有质量通过
后的 Token break-even。当前 Windows/Pi/强 GPT 结果不能外推到其他模型、agent 或 OS。

### P1：Portfolio 状态模型仍偏粗

现有 registry 的 `developmentGate` 只适合记录 optimized development，不能同时表达 baseline admission、static
fidelity 和 optimized gate。当前先保守记录最成熟的 optimized 状态；后续应把阶段拆开，避免再次把“基线
失败/饱和”和“优化 gate 失败”混成一个字段。

### P1：历史 lock 与当前 HEAD 的验证分层尚未完成

全 Skill IR suite 中仍有一批历史 lock digest 漂移失败。旧 lock 不应改写，但当前 HEAD 回归也需要稳定绿灯。
后续要把“冻结历史可复现验证”与“当前实现单元/集成回归”分开运行和报告。

### P2：本地结果仍需持续治理

Git 已提交主要 compact evidence；2026-08-12 的只读清点仍有 56 个未跟踪 result 入口，其中大部分是 raw
workdir、qualification、probe 和调试结果，另有 13 个名称上属于 scored/gate 的 compact 候选。它们不能批量
删除，也不能用 `git add .` 提交；这 13 个候选需逐项检查绝对路径、secret、重复性和现有 summary 覆盖后，
再决定提交或明确保持本地。

## 4. 活跃开发计划

### Task 18.1 项目状态审计与文档收敛

- [x] 核对 README、spec、plan、组件文档、communication ledger、机器 portfolio 和冻结结果；
- [x] 将 i18n portfolio 从旧 v3 `baseline-saturation/failed` 修正为 contribution-v2 之后的
  `optimized development not-run`，保留 readiness 为 failed；
- [x] 统一 README、developer guide、pilots、results、history 与当前接力点；
- [x] 将已完成的 Task 17 细节从活跃 plan 移出，由 `history.md`、Git 和结果 ledger 追溯；
- [x] 完成 focused/full verification、conversation log 和审计提交。

### Task 18.2 i18n contribution-v2 source-audited base IR

**目标：** 只从 exact public skill、development 用户可见合同和资源边界生成 profile-empty base IR，验证静态
语义是否足以保留 skill 增量并减少 undeclared workdir residue。

**预计文件：**

```text
benchmarks/skill-ir/pilots/i18n-helper/contribution-v2/base-ir.json
benchmarks/skill-ir/pilots/i18n-helper/contribution-v2/base-ir-source-audit.json
benchmarks/skill-ir/corpus/corpora/pilot.json
src/skill-ir/corpus-fixtures.test.ts
```

**TDD 顺序：**

1. [x] RED：要求 contribution-v2 只有在 base IR profile 为空、逐节点 source audit 完整、held-out/evaluator/
   runtime output/profile feedback 全部不可见时才能晋升 `runnable`；
2. [x] GREEN：生成最小 base IR，保留扫描、排除、占位符、复数、已有翻译和完整性规则；
3. [x] 输出文件边界只能来自公开 task contract。不得把后验文件名 `nul` 硬编码为规则；若需要 guard，只能
   表达“不得产生未声明产物”和“命令必须符合目标 OS”，并提供公开证据；
4. [x] 运行 source audit、IR validator、lowering snapshot 和 held-out/gold leak canary；
5. [x] 更新 corpus 为新 contribution-v2 runnable identity，不修改旧 i18n v1-v3 及 contribution-v1。

### Task 18.3 i18n static development

**目标：** 在同一冻结强模型/Pi/Windows/clean 身份下比较
`no-skill | original | ir-static`，判断静态编译视图是否保真并产生可归因改善。

1. [x] 复用通用 `static-development-lock/v1` 与 runner，不新增 runtime/catalog；
2. [x] 付费前冻结 2 development tasks x 2 repetitions x 3 systems = 12 rows、4 triplets、`retries=0`；
3. [x] Gate 至少要求 12/12、4/4、0 infrastructure、ir-static mean 不低于 original、0 hard-gate/score
   regression、至少 1 个 positive pair；
4. [x] 运行 dry-run、route/resource qualification、唯一 execute、deterministic scoring 与 compact gate；
5. [x] 首个 identity 的 12/12 rows、4/4 triplets 完整，但 1 timeout + 3 个跨三臂同位 parse-failed 使
   infrastructure gate failed；冻结结果、不补跑、不生成 overlay/artifact、不运行 held-out。下一步先处理
   execution observability/frozen-history validation 分层，再决定新预注册 identity 或替代方法案例。

### Task 18.3A execution resilience successor

**目标：** 在不修改任何冻结 `v1` 证据的前提下，为未来身份增加可审计的执行容错，避免一次明确的执行前
瞬时故障冻结整批，同时不把 active timeout、tool loop、parser/runtime 缺陷或语义失败洗成可替换噪声。

权威设计见 `docs/skill-ir/evaluation-system.md` 的 execution resilience successor。确认的实现边界为：

1. [x] 新增 value-free execution envelope 与纯故障分类器；分类发生在 scorer 之前，未知类型 fail closed；
2. [x] Pi 使用流式事件观测，首个 successor 冻结 600 秒 absolute、120 秒 idle、30 steps、660 秒 outer
   watchdog；持续活动只重置 idle，不重置 absolute；
3. [x] 新增 `static-development-lock/v2`，预注册完整 matched triplet 的 target/reserve 数；selector 不接收
   scorer output，任一 eligible arm 只触发整组 replacement；
4. [x] 新增 dual-denominator gate：selected blocks 用于 paired method gate，all attempts 披露所有瞬时故障、
   active timeout、Token、latency 与 arm asymmetry；
5. [x] 分离 current regression、frozen-history compatibility 与 provider/execution observability；不修改旧 lock；
6. [x] 确定性 TDD 全部通过后，以新 identity 预注册 i18n static；v4 qualification 通过后唯一矩阵完成。

**结果：** v4 为 12/12 rows、4/4 triplets、0 replacement、0 transient/active/parser/runtime failure，
`infrastructureSensitive=false`。ir-static 3/4、mean 0.875，但相对 original 0 improved、1 regressed，故 paired
gate failed；artifact/held-out/residual audit 保持关闭。v2/v3 qualification failure 分别冻结为错误外层 180 秒
截断与标准 Pi thinking 漏识别，不覆盖、不重评分。

### Task 18.4 i18n artifact candidate 与第二 phenotype（本 identity 未开放）

只有 Task 18.3 通过或产生公开、可重复的 typed residual 时进入。

1. [ ] 将 source scanner、rewrite plan、locale schema、integrity checker 和 report template 表达为声明式
   adapter/公共 assembly 输入；禁止 skill-id core branch；
2. [ ] 本地运行 package determinism、protected input、runtime、validator 与 scorer activation；
3. [ ] 冻结 `no-skill | original | ir-static | validated-artifact` development，要求完整分母、0 infra、
   artifact 相对 original/static 无回归并满足预注册成功/均值门槛；
4. [ ] 记录 compile/profile/package/runtime/repair token、人工分钟、adapter LOC、artifact kind 复用和
   `coreBranchDelta`；
5. [ ] 通过后，i18n 才能成为第二个 optimized development phenotype；未通过则冻结失败，不补跑筛正例。

**停止判定：** v4 没有产生可进入 artifact 的正向 gate 或公开、可重复 residual，反而出现 1 个 static
paired quality regression。因此本 identity 不执行上述 artifact 工作；这些未勾选项是未运行，不是遗漏。
当前恢复点转到 Task 18.5，先拆分状态并从现有 qualified case 选择替代候选。

### Task 18.5 Portfolio 与自动化状态模型

1. [x] 将机器 registry 升级为 v2 lifecycle：`benchmarkContract`、`baselineAdmission`、`staticFidelity`、
   `optimizedDevelopment`、`heldOutPromotion` 各自保存 status、compact evidence 和 blocker；保留
   `contractQualified` 作为受 schema 校验的兼容摘要，删除会混淆阶段的单一 `developmentGate`；
2. [x] 迁移现有 7 个 case 并保持旧结果路径。Readiness 从 lifecycle 派生 qualified、passed phenotype 和
   measurement blockers；不得把 baseline/static pass 算作 optimized pass，也不得把历史 measurement-invalid
   development 结果晋升为当前有效证据；
3. [x] 将适配成本改成有 provenance 的测量合同。已有历史 `humanMinutes=null` 不后验编造；明确标记
   `historical-unavailable`。从 Env Manager successor 起记录 stage start/end、人工步骤、声明式 adapter LOC、
   `coreBranchDelta`、artifact kind reuse 和仍未自动化步骤；
4. [x] 生成 skill-neutral candidate-selection compact report。候选必须披露 phenotype coverage、合同/基线状态、
   现有 artifact mechanism、信息互补性、下一必需阶段和排除原因，不能按“最可能出正例”后验挑选；
5. [x] 本轮预先选择 Env Manager 作为 `environment-schema-repair` successor：它补齐当前缺失 phenotype，已有
   deterministic repair/package candidate 和历史 0.90 -> 1.00 的机制信号，但旧 benchmark-contract 与 infra
   gate 均不可复用为有效结论。先修公开合同与贡献可识别性，再依次执行 baseline -> base IR/static -> artifact。

### Task 18.5A Env Manager contract successor 与第二 phenotype

1. [x] 审计现有 source/task/scorer、v1 benchmark-contract failure、V4 artifact 与 raw failure taxonomy；只提取
   可由公开 source/task 支持的语义，不读取 held-out 或把历史模型答案写入新合同；
2. [x] 创建新的 task/scorer/audit identity，覆盖 alternative-valid、reverse-evidence、public ABI、materialization、
   secret/gold leak 和贡献可识别性；强模型任务不得给出 answer-bearing 精确动作或预期结果；
3. [x] 首个 resilient Pi baseline qualification 通过且唯一矩阵完成 8/8 rows、4/4 pairs、0 replacement/transient/
   active/parser/runtime blocker；真实运行暴露 arm-dependent source resource 与未公开 schema 表示两项 scorer-
   authority 缺口，整批冻结 measurement-invalid，不重评分、不以同 identity 重跑；
3a. [x] 新 contract/scorer identity 公开标准 JSON Schema 与 `variables` wrapper 的语义等价，完整性从冻结 initial
   manifest 派生并覆盖 original source-resource materialization；8/8 canary 全绿；
3b. [x] 使用 development-only freeze 冻结公开合同、开发任务与 source closure；held-out 明确登记为尚未创作、
   不允许执行且未来必须重新建立隔离，避免为 development calibration 伪造或复用已暴露的 held-out；下一步冻结
   calibration lock 后执行唯一 qualification/baseline；
3c. [x] v4 qualification `semantic-complete` 且确定性评分通过；唯一矩阵 8/8 rows、4/4 pairs、0 replacement/
   infrastructure blocker，original 4/4、mean 1.0，no-skill 3/4、mean 0.9125，1 positive、0 regression；开放
   profile-empty base IR，不开放 held-out；前三个 identity 因调用层 1/1/10 秒硬终止分别冻结为 operator failure；
4. [x] 已创建 profile-empty source-audited base IR：逐节点只绑定 exact source、development prompt 与 public
   interface，明确排除 evaluator payload、held-out、runtime output 与 profile feedback；corpus 晋升 runnable。
   静态保真锁在 original 已饱和的前提下预注册 `minimumImprovedPairs=0`，唯一矩阵完成 12/12 rows、4/4
   triplets、0 replacement/infra；三臂均 4/4、mean 1.0，ir-static 相对 original 0 regression，static gate 通过；
5. [x] 通过公共 assembly 编译 Env Manager Node/Vite artifact，并运行冻结四臂 development。16/16 rows、
   4/4 quartets、0 infrastructure；artifact 4/4、mean 1.0、0 hard-gate failure、0 pair regression，成为第二
   optimized phenotype。模型三臂共 367332 tokens；artifact 四次 runtime model tokens 为 0；
6. [x] 首个 baseline 因 scorer authority 失败已冻结；未补跑、未重评分、未读取或执行 held-out。后续仅能以
   新 contract/scorer/lock identity 继续。

### Task 18.6 Readiness、Untouched Replication 与主实验

只有 readiness 五项全部通过后进入：

1. [ ] 冻结 core/catalog/adapter schema、模型面板、context、scorer 和版本；
2. [ ] 选择至少 1 个未参与方法设计的真实 skill；replication 不允许修改 core；
3. [ ] 完成 `no-skill | original | ir-static | optimized` development/held-out；
4. [ ] 再扩到至少 3 个模型族、clean + noisy/long、稳定 Pi 和真实 Windows；
5. [ ] 在质量门槛通过的 case 上计算 `N=1,2,5,10` 与 break-even；
6. [ ] 最后把同一 core 接入用户可运行的 CLI、TypeScript library 与 Optimizer Agent 编排。

### 单模型族 70% 与多模型族启动门槛

“70%”按证据合同判断，不按文件数或主观进度估计。满足以下条件后，允许开始第二、第三模型族的 development
小面板；完整 held-out 主矩阵仍需 readiness 与 promotion 条件：

1. execution resilience 在当前主 Pi/Windows 单模型路线稳定，current regression 全绿，冻结历史兼容性单列；
2. 7 个 case 的五阶段 lifecycle 可机器判定，至少 6 个 contract-qualified，measurement blocker 无未解释漂移；
3. 至少两个不同 phenotype 通过 optimized development，且完整分母、paired regression 与 all-attempt 成本可审计；
4. 新 successor 的人工分钟、adapter LOC、core branch delta、artifact reuse 与未自动化步骤从开始时前瞻记录；
5. 公共 assembly、runner、scorer boundary 和 candidate-selection policy 冻结，不再为进入不同模型族改 core；
6. 预注册模型族小面板先测 development 的方向一致性、failure taxonomy 与基础设施兼容性；只有方向可信后才扩
   clean/noisy/long 和 held-out 主矩阵。

当前约为该单模型族门槛的 **70%--72%**：Env Manager v3 已完成 contract、baseline、source-audited base IR、
static fidelity 与 artifact development，portfolio 现为 7/7 contract-qualified、3 static passed、2 optimized
phenotypes。公共 assembly/runtime/gate 在本次新 phenotype 中保持 `coreBranchDelta=0`，适配成本也已前瞻登记。
因此现在可以进入第二/第三模型族的 **development 小面板**；下一步约 **2--4 个净工作日**用于冻结模型路线、
资格探针、最小任务/系统矩阵和 failure taxonomy。完整 held-out、noisy/long 与跨模型主 claim 仍须等待 readiness、
untouched replication 和更完整自动化，不能把小面板提前写成正式泛化结论。

## 5. 时间估算

以下是净工作时间，不包含模型网关不可用、导师评审等待或新增 benchmark measurement-invalid 后的重设计。

| 里程碑 | 预计净工作日 | 可交付结果 |
|---|---:|---|
| 当前审计与状态治理 | 1 | 权威状态、收敛 plan、机器 portfolio 一致 |
| i18n base IR + static development | 3-5 | 第二个真实 source-transform skill 的静态证据 |
| 替代 qualified case 的 artifact development | 4-7 | 第二 phenotype 的通过或高质量失败证据 |
| Portfolio 状态分层与自动化指标 | 3-5 | readiness 缺口可机器判定，不再靠人工表述 |
| 补齐第二 phenotype/readiness | 5-10 | 方法冻结候选 |
| Untouched replication | 5-8 | 首个真正的跨 skill 泛化证据 |
| 三模型族/context/cost 主实验 | 7-12 | 稳定性、回归和 Token 摊销主表 |
| CLI/library/报告收口 | 4-7 | 可演示产品入口与研究报告 |

i18n 已留下 infrastructure-insensitive 的 static 质量负结果，不能成为第二 phenotype。若 Task 18.5 选出的
替代案例顺利通过，**2 周左右**可以形成更完整的阶段汇报：两种 optimized phenotype、一套贡献可识别性方法
和明确 readiness 缺口。达到 spec 的完整研究完成条件，现实估计还需 **6-9 周**；新的 measurement-invalid
或第二 phenotype gate failure 会增加 1-3 周，不能靠压缩验证绕过。

## 6. 计划合理性复核

当前路线合理的部分：

1. 先做 benchmark contract 与贡献可识别性，再花钱做优化，避免“分数上涨但量错了对象”；
2. 先把一个新 phenotype 竖切到 optimized development，再冻结方法做 untouched replication；
3. 多模型/context/cost 放在方法冻结后，避免在仍变化的 compiler 上烧大矩阵；
4. Token 只在质量门槛通过后成为优化目标，避免用更差结果换便宜；
5. 旧失败结果不可变，新修复用新 identity，研究叙事可复现。

需要持续防范的风险：

1. 为每个 skill 手写大量 scorer/compiler，最终只有 benchmark 工程，没有自动 optimizer；
2. 继续堆 task/runtime/catalog 版本，掩盖统一 core 未成熟；
3. development 正向但 held-out 回归，重复 Law 的结果；
4. 单强模型结果被误写成跨模型稳定；
5. 只报告 artifact runtime 0 token，遗漏编译、profile、人工审核和失败实验成本。

## 7. 阶段完成标准

完整项目以 spec 第 13 节为准。近期 Task 18 关闭至少要求：

- i18n contribution-v2 有合法 base IR 和 static development 结论；
- 至少两个不同 phenotype 的 optimized package 通过 development，或第二个候选留下不可争辩的失败归因；
- portfolio 各阶段状态与自动化指标不再混写；
- readiness 是否通过由机器报告决定；
- 只有 readiness 通过后才开始 untouched replication；
- 所有新增结论都有 compact evidence、文档、conversation log 与 Git commit。

## 8. 每阶段验证

```powershell
bun test <focused tests>
bun test ./src/skill-ir ./src/benchmarks/skill-ir
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py --root .
git diff --check
```

全量 suite 若命中历史 lock digest 漂移，必须单列为 frozen-history compatibility，不得修改旧 lock 来换绿；
本阶段 focused test 与当前 HEAD integration regression 必须全绿。
