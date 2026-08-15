# Skill IR AOT 当前执行计划

**最后更新：** 2026-08-13

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
- API Tester 为 quality-positive；Env Manager artifact gate 通过但只证明 fidelity-preserving，尚缺 compile cost
  与 break-even，当前 readiness-eligible optimized phenotype 只有 1 个；
- i18n contribution-v2 已通过基线准入并完成 source-audited profile-empty base IR；首个 static identity 因
  4 个 infrastructure failure 冻结，resilient v4 已消除 execution blocker，但因 1 个 paired quality regression
  失败，仍无 artifact、held-out 或 Token 优化证据；
- untouched replication、三模型族主实验、noisy/long context、break-even 和面向用户的统一 optimizer CLI 尚未完成；

因此当前不能写“优化系统已经闭环”或“任意 skill 均可自动优化”。准确表述是：**测量与执行框架较成熟，
通用优化内核有一个质量正例、一个 fidelity 案例和多个机制/负结果，跨模型方向性诊断已完成首批
blocked/mixed 面板，跨 skill 复现、动态固化闭环与产品化仍在关键路径上。**

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
| Method portfolio | 7 studied、7 qualified、1 quality-positive、1 fidelity、0 efficiency/replication | 取得第二个 readiness-eligible phenotype；补 dynamic/solidification 闭环 |
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

API Tester 是唯一 contract-qualified quality-positive phenotype；Env Manager 证明 artifact fidelity，但没有完整
compile/profile/package 成本与 break-even，不能计 efficiency-positive。证据仍限于单模型、Windows/clean
development；i18n contribution-v2 的可信静态负结果继续保留，不以正例覆盖。

### P0：自动导入与自动编译尚未形成产品路径

Spec 中的 CLI/library/Optimizer Agent 是北向交付合同。当前真实工作仍依赖 pilot-specific task、scorer、lock
和研究脚本；`src/index.ts` 的既有 SkVM 命令尚未串起本项目的 intake -> base IR -> validation plan -> package
-> report 全流程。

### P0：跨条件主证据尚未开始

尚无冻结方法在 untouched skill、三模型族、clean + noisy/long 或第二 harness 上的完整主表，也没有质量通过
后的 Token break-even。当前 Windows/Pi/强 GPT 结果不能外推到其他模型、agent 或 OS。

### P1：动态优化与固化仍未形成通用执行闭环

Portfolio v3 已能说明为什么 0 个案例进入 dynamic-profile：2 个直接 artifact、1 个 static-sufficient、4 个因
门禁停止。缺口不在“多跑动态实验”，而在 profiler/RepairEvidence/Final IR/artifact compiler 尚未串为通用的
residual selection -> profile -> overlay -> validate -> solidify 路径。下一竖切必须选稳定、公开、可复现 residual。

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
5. [ ] 通过后还须按 Task 18.8 分类：质量改善才是 quality-positive；只有 fidelity 时不计第二个 readiness 正例；
   未通过则冻结失败，不补跑筛正例。

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

### Task 18.7 三模型族 development 小面板

该任务是 Task 18.6 主实验前的兼容性与方向性诊断，不消费 held-out，也不产生跨模型泛化主结论。面板同时
覆盖 API Tester（已有明显 optimized development 收益）和 Env Manager v3（强模型 baseline 饱和、artifact
稳定）两种 phenotype，避免只在单一案例上判断模型族兼容性。

1. [x] 冻结 `gpt | claude | deepseek` 三条真实 route、Pi 0.67.68、Windows/clean、两个 skill 各 2 个既有
   development task，以及 `no-skill | original | ir-static` 三模型臂；每个“模型族 x skill x task”选择 1 个
   target triplet，并预注册至多 1 个 reserve triplet；
2. [x] 资格阶段逐 route 执行一个完整 original 行，并一次性验证本地 Pi 与两个 skill 的 resource contract。
   2026-07-21 的旧 bare-agent 结果仅作路线候选依据，不能替代本次 lock digest 绑定的 Pi 资格；
3. [x] 复用 `execution-envelope/v1` 和整组 selector。只有 `transport-transient`、`empty-terminal`、
   `pre-semantic-idle-timeout` 可替换完整 triplet；active timeout、step limit、parser/runtime blocker 和语义失败
   不替换并进入固定分母；
4. [x] 唯一付费矩阵尝试 36 个模型行：3 families x 2 skills x 2 tasks x 3 systems。最大候选为 72 行，但只在
   预注册 transient 发生时启用 reserve；所有 attempted rows 的分类、时延和 Token 均保留；
5. [x] validated artifact 是模型无关的确定性共同 anchor，每个 skill/task 只直接执行一次，共 4 行；禁止按模型
   族复制成伪重复。最终 selected evidence 为 36 model rows + 4 shared anchors = 40 logical rows；
6. [x] 报告逐族输出 infrastructure compatibility、failure taxonomy、original 对 no-skill 的贡献方向、ir-static
   对 original 的 gain/regression，以及 artifact 相对各族模型臂的共同下界。资格、固定分母、artifact hard gate、
   parser/runtime blocker 与 scorer authority 分开判定；
7. [x] 该面板只允许得出“在这些 development task 上方向一致/混合、某模型族存在何种兼容问题”。无论结果好坏，
   都不开放 held-out、noisy/long、promotion、Token break-even 或跨模型主 claim；下一阶段仍由 readiness 与
   untouched replication 决定。
8. [x] v1 qualification 已冻结失败且未启动矩阵：GPT semantic-complete；Claude 的 provider 5xx 暴露标准
   `auto_retry_end` allowlist 缺口；DeepSeek 的零 usage/error terminal 暴露无 payload assistant 被误计为语义
   活动。两项均先修公共 value-free observability，再以 v2 identity 重新资格；禁止覆盖或重跑 v1。
9. [x] 以 TDD 修复公共 Pi 事件 allowlist 与空 terminal 分类，并创建 v2 继任 identity；v2 额外冻结
   `pi-runtime.ts`，资格 reserve 只允许替换 1 次预语义 transient，不能替换 active/semantic/quality failure。
10. [x] v2 digest-bound plan 为 72 candidate model rows + 4 shared anchors；资格中 GPT 首次通过，Claude 两次
    provider 5xx，DeepSeek 两次零 usage empty terminal。有界 reserve 已耗尽，compact failure 冻结且矩阵未
    启动；不是 timeout 过短或 allowlist 故障，不在同 identity 补跑。
11. [x] 在不消费 benchmark/task/scorer 的 route-only 诊断中区分 xty route 可用性、Pi provider 协议兼容性与
    tool-use 支持；若能预先证明替代 route，再新建 v3 identity，不能沿用或修改 v2。
    - [x] xty catalog 与直接 `/chat/completions` 文本/工具探针均通过；根因定位为 subprocess Pi 对目录外模型
      错误继承 `openai-responses`，而非 route 名称、鉴权或 tool schema。
    - [x] TDD 后 subprocess 与 headless driver 统一为：已收录模型保留 metadata，未收录 openai-compatible
      模型显式注册 `openai-completions`。Claude route-only 两轮工具回路通过；DeepSeek 首轮/多轮可成功但仍有
      120 秒内无 response 的波动，后续只由既有 bounded reserve 处理。
12. [x] 冻结绑定新 Pi adapter digest 的 v3 identity；schema/experiment/qualification 后缀严格绑定，继续使用
    36 selected model rows + 4 shared anchors、120 秒 idle 和每 route 至多一次预语义 reserve。
13. [x] v3 digest-bound plan 与资格完成：GPT 完成且输出齐全；Claude 完成但未产出声明输出；DeepSeek 有
    16 次 provider response/30 次工具调用后触发 600 秒 active absolute timeout。协议修复有效，但旧资格合同
    按任务结果预筛 route，compact failure 已冻结且矩阵未启动。
14. [x] 以新 identity 将资格收窄为 infrastructure/observability eligibility：预语义 transient 使用一次 reserve；
    parser/runtime/measurement blocker 阻断；semantic-complete、active timeout、step-limit 均进入矩阵固定分母，
    outputsPresent 只披露。确定性测试与 lock 冻结后再执行唯一资格/矩阵。
    - [x] v4 schema/selector/runner 与 lock 已冻结；资格通过只代表可形成可信分母，不代表任务成功或质量通过。
    - [x] v4 资格首次 candidate 全部形成可观测语义执行且未消耗 reserve；GPT/DeepSeek 输出齐全，Claude 缺失
      声明输出但按 infrastructure-only 合同准入，缺失仍作为任务负结果披露。
    - [x] 唯一矩阵已执行 36 个 model attempts 与 4 个 shared artifacts；最终选中 11/12 triplets、33/36 model
      rows，报告按预注册规则冻结为 `blocked`。GPT/Claude 各 12/12 semantic-complete；DeepSeek 有 2 个
      pre-semantic idle timeout、1 个 active absolute timeout，以及 1 个因 Pi 标准 `compaction_start` 漏入
      allowlist 而产生的 parser blocker。后者在 TDD 修复后只对未来 identity 生效，不事后改写 v4 或补跑 reserve。
      4 个 artifact 均 success/score 1.0，但因缺失 DeepSeek API Tester selected triplet，相对模型臂下界计 1 次
      regression，artifact gate 未通过；方向为 mixed，不开放 held-out/promotion/main claim。

### Task 18.8 证据语义、版本治理与动态路径收口

该任务修正现有报告/registry 的语义偏差，不重跑冻结付费矩阵，也不把小修复继续命名为新的 benchmark
版本。只有报告分母/成本和 portfolio readiness 的研究含义发生变化，才分别提升对应报告 schema；历史
experiment/lock/result identity 保持不可变。

1. [x] 在现有 spec/plan 中持久化版本规则：语义合同才提升版本；实现 bug、timeout、allowlist、provider
   transient 使用 attempt/freeze instance，不累计组件 `vN`；
2. [x] 以测试先行修正多模型报告：每族固定 4 个 comparison cells，缺失整格显式记为 `missing`，不再静默从
   方向分母消失；selected-scored 与 all-attempt input/output/cache/duration 成本分列；
3. [x] 为冻结 v4 生成 digest-bound supplemental audit；不覆盖原 `panel-report.json`、raw/scored/envelope，且不
   反事实补分或补跑模型；
4. [x] Portfolio v3 为每个案例登记 `quality-positive | fidelity-preserving | efficiency-positive |
   not-established`，efficiency 必须同时具备质量等价、完整成本和 break-even；
5. [x] Portfolio v3 机器记录 `dynamic-profile | direct-deterministic-artifact | static-sufficient |
   stopped-before-dynamic` 及原因；当前 0 个案例满足 dynamic-profile 准入，不为覆盖率制造 residual；
6. [x] Readiness v3 只把 quality-positive 与证据完整的 efficiency-positive 计入两 phenotype gate；API Tester
   计正例，Env Manager 只计 fidelity，当前 readiness-eligible phenotype 从 2 修正为 1；
7. [x] 同步 README、评测/实验/开发文档与 compact artifacts；conversation log 和最终验证在本任务收尾完成，
   随后提交并推送；

### Task 18.9 通用双源残差准入与 Final IR 证据绑定

**目标：** 在寻找新的付费动态案例前，先把现有 Env Manager 特化的
`original + ir-static -> RepairEvidence -> overlay -> Final IR` 路径收敛为 skill-neutral、fail-closed 的
development 组件。该任务只建立机制和真实停止判定，不把历史 Env Manager v1 结果晋升为当前方法证据，也不
为了覆盖率制造 residual。

1. [x] 保留 `skill-ir-repair-evidence/v1`、`dual-source-residual/v1` 和 Final IR provenance v2 只读兼容；不
   修改冻结 package、lock 或 result；
2. [x] 新的声明式 mapping catalog 必须绑定 skill、source-audit path+digest、criterion、typed repair、
   prerequisite 和已有 source-audit target refs；core 中不得再按 Env criterion 或 skill id 分支；
3. [x] 新准入必须重算并核对 `static-development-gate-report/v2`，绑定 lock、execution envelope、selected scored
   rows、base IR、source audit 与 mapping catalog digest；不完整分母、execution blocker、static gate failure、
   criterion regression 或稳定但未映射 residual 均 fail closed；
4. [x] 稳定性同时要求跨任务和任务内跨重复；不同 criterion 不能先混池再凑足阈值，同一 directive 只有在各自
   criterion 先通过稳定性后才允许合并；
5. [x] 合法证据无稳定 residual 时持久化 `no-reproducible-residual`，不生成 overlay/Final IR；只有
   `eligible` 才能编译 typed overlay，并由新的 provenance 合同传递绑定 gate/catalog/results；
6. [x] 先以 synthetic public-evidence fixtures 覆盖 eligible、no residual、regression、infrastructure、分母不全、
   mapping 缺失和 forbidden sink；再对 Env Manager v3 当前冻结 static evidence 运行真实停止判定；
7. [x] 本任务通过只证明通用准入和 Final IR 构造机制成立。取得第二个 readiness phenotype、真实
   dynamic-profile、artifact solidification、质量改善、held-out 与 break-even 仍需后续冻结实验。

**版本语义：** 这是一次明确的 evidence/provenance 合同升级，而非按修复次数滚动命名。Semantic delta 是从
Env 特化、未绑定 gate/catalog 的 v1 证据，变为固定分母、公开 mapping、digest-bound 且带停止状态的通用
证据；兼容性边界是历史 v1/v2 消费路径继续可读但不能冒充新准入；claim 影响只是令未来 dynamic candidate
可审计，不追认任何旧优化结论。

**完成结果（2026-08-13）：** 通用 runner 会从 execution envelopes 重建 selected blocks、重算 static v2 gate，
并生成 digest-bound v2 admission；generic compiler 已将 eligible evidence 串到 typed overlay、Final IR、v3
provenance 与 `ir-pgo-dev` development validation。Env v3 当前冻结证据返回
`no-reproducible-residual`（0 records/0 repairs），所以未生成 Final IR，也没有把 static fidelity 伪装成
dynamic-profile。下一阶段改为选择新的 prospective candidate，在付费前冻结 mapping/lock 并前瞻记录完整
profile/compile/package 成本；若仍无稳定残差，同样停止并保留 typed evidence。

### Task 18.10 源码审计规则加固与 Statistical Power 前瞻候选冻结

**目标：** 消除“残差准入已经 skill-neutral，但 typed repair 仍只会生成 Env Manager 两种规则”的契约缺口，
并在编写 successor benchmark contract 前，以机器可核验的 source closure 和候选比较冻结
`statistical-power`。本任务不调用付费模型、不编写 held-out，也不预设一定会出现 dynamic residual。

**架构：** `typed-output-repair/v3` 在 v2 两种固定模板之外增加
`source-audited-rule-enforcement`。该 kind 不接收自由文本、不创建新领域规则，只允许引用 base IR 中已经存在的
`rule-*`，且 mapping catalog 必须包含同一 `rule:<targetRef>` source-audit target；实际 check/recovery 继续由
既有 profile-guided repair 从该规则的 `normalizedForm` 确定性生成。候选冻结使用独立的首版 selection contract，
读取 intake、exact upstream identity 与本地 source closure digest，不改写历史 Env successor selection。

1. [x] 在 `typed-output-repair.test.ts` 先写 RED：v3 可接受已存在的通用 rule、旧 v2 语义保持不变、缺失 rule
   fail closed、v1/v2 不得接收新 kind；运行该测试并确认因缺少 v3/kind 而失败；
2. [x] 最小实现 `typed-output-repair/v3`，保持 v1/v2 字节语义和默认值不变；新 kind 只做 target binding，禁止
   rule/check 文本注入；运行聚焦测试转绿；
3. [x] 在 `repair-evidence.test.ts` 先写 RED：mapping 仅在 repair catalog 为 v3、target 是 `rule-*`、且
   `evidenceTargetRefs` 含 `rule:<targetRef>` 时接受通用加固；再扩展 additive enum 与 Final IR provenance catalog
   枚举并运行相关测试转绿；
4. [x] 在 `dual-source-feedback-run.test.ts` 先写 RED：eligible v3 evidence 复用 base IR 的 audited rule，经
   profile lowering 得到确定性 output/rule check 和单次 retry recovery，同时 overlay/Final IR 不包含 catalog
   自由文本或 benchmark answer；实现只复用既有 compiler 顺序，不增加 skill-id branch；
5. [x] 把 `statistical-power` 的 upstream `SKILL.md`、bundled scripts 和直接引用 resources 作为 exact source
   closure 导入 pilot source 目录，记录 MIT、commit、相对路径和 sha256；不执行网络、不得把依赖安装混入
   candidate selection；
6. [x] 为新的 prospective candidate selector 先写 RED，要求：selected candidate 存在于 intake、license verified、
   upstream identity 与 source closure 一致、所有声明候选唯一、选择发生在 benchmark contract 前、冻结 2 tasks x
   2 repetitions x `original | ir-static`、`retries=0` 和“只有 eligible admission 才进入 dynamic”的停止规则；
7. [x] 最小实现 selector、runner、intake entry 与 selection freeze，生成 compact report；不把候选提前登记为
   contract-qualified/studied，不改 readiness 分母；
8. [x] 同步 spec 的版本 semantic delta、`ir-core.md`、`optimization-and-artifacts.md`、`real-skill-pilots.md`；运行
   focused tests、`bun test ./src/skill-ir ./src/benchmarks/skill-ir`、typecheck、文档链接和 `git diff --check`；
9. [x] 更新 conversation log、communication ledger 与 handoff，显式提交本任务文件并推送；本地 `1.md` 和历史
   untracked result 不进入提交。

**版本语义：** `typed-output-repair/v3` 是一次受控的 additive semantic contract 升级：v1/v2 的两个固定模板和
历史 provenance 继续只读兼容；v3 新增的通用 kind 只能加固已在 base IR/source audit 中存在的规则，不能接受
任意 replacement 文本。它不会追认历史 dynamic claim，也不会改变 repair-evidence v2 的既有字段含义；后续
parser、timeout、日志或实现 bug 修复继续留在 v3，以新的 implementation digest/attempt 区分，不再滚动版本。

**完成结果（2026-08-14）：** v3 通用 kind 已通过 source-audit target 约束接入既有 profile-guided lowering，
`statistical-power` 也已按 exact upstream commit/source closure 从 8 个前瞻候选中冻结。selection report 明确把
下一状态留在 `benchmark-contract`，付费执行、dynamic profile、held-out 和 readiness 分母变化均为 false。
聚焦验证为 81 pass、0 fail，typecheck 与文档检查通过；相关广测为 929 pass、6 skip、62 fail，失败仍属于
冻结历史 digest/lifecycle compatibility，不能通过改写旧 lock 消除，也不能声称仓库级全绿。

### Task 18.11：Statistical Power 竖切与阶段授权（进行中）

**目标：** 用两道纯闭式、可独立重算的 development task 验证 statistical-design/tool-use phenotype；先证明
公开合同、数值 oracle 和 skill 贡献可识别，再依 gate 顺序运行 `no-skill | original`、source-audited base IR 与
`original | ir-static`。本任务不创作或读取 held-out，不把本地 contract canary 冒充模型实验。

**已批准设计：**

1. task A 是双侧两独立均值、非等额分配、Bonferroni 多重比较、SESOI、统一失访率和 effect-size sensitivity；
2. task B 是双侧两独立比例、非等额分配、Bonferroni 多重比较、SESOI、统一失访率和比例差 sensitivity；
3. prompt 只要求依据公开 study/interface 形成可复现的事前样本量论证，不给操作配方、预期数值、gold 或
   skill source quote；输出 ABI 公开字段与类型，但 scorer 从公开输入和冻结 oracle 现场重算；
4. 两 task 使用相同的六类评分边界：input/output integrity、方法与输入对齐、多重性、allocation+attrition、
   sensitivity、effect basis+reproducibility。领域标准保留在声明式 study adapter 和薄 oracle；runner、manifest、
   contribution audit、锁、分母、gate 与报告继续复用公共组件；
5. Task 18.10 的 `original | ir-static` 8-call intent 只描述 static residual slice，不能越过项目的 baseline/base-IR
   门。其冻结 selection input/report 不改写；Task 18.11 新建 development authorization 合同，顺序授权：
   calibration 8 calls（2 task x 2 rep x 2 arms），通过后 static residual 8 calls，eligible 后最多 4 次 dynamic；
   最大 20 次均为逐阶段上限而非一次性许可，`retries=0`，held-out 始终为 false；
6. 本阶段结束后暂停新增 skill，复盘每个案例的 adapter LOC、core branch delta、人工步骤、失效原因和证据增量，
   再决定统一 `import -> contract -> audit -> calibrate -> optimize -> report` 封装及项目目标是否需要弱化。

**TDD 实施顺序：**

1. [x] 为 task/interface schema、双任务重建、无 answer-bearing 字段、development-only split 和阶段授权顺序写 RED；
2. [x] 为独立数值 oracle 写 RED：覆盖非等额分配、Bonferroni alpha、attrition enrollment、完整 sensitivity；
3. [x] 最小实现 public interface、task builder、oracle 与 evaluator，并注册 scorer dependency closure；
4. [x] 写 canonical、alternative-valid、prompt-only-omission、reverse-evidence、forbidden-sink 和真实 materialization
   RED，再实现 compact contract audit；
5. [x] 建 `skill-contribution-identifiability/v1` manifest，要求至少 2 个独立 skill-derived failure mode、逐 task
   skill-derived weight >= 0.30 或 hard gate、0 answer-bearing duplication、5 类 canary 全通过；
6. [ ] 生成 development-only freeze 和分阶段授权；本地确定性检查全绿且贡献审计 eligible 后，才允许 plan/
   qualification/execute baseline；baseline 通过后才写 profile-empty base IR，static 通过后才审 residual；
7. [ ] 更新现有 spec、evaluation、pilot、ledger、handoff 和 conversation log；不新增说明性 Markdown；
8. [ ] 该 skill 阶段关闭后执行项目全过程复盘，明确继续、弱化或停止条件，再决定是否新增案例或多模型族矩阵。

**版本纪律：** 本任务不改写 Task 18.10 的冻结证据，也不为实现 bug、timeout 或 scorer 小修滚版本。新的
development authorization 是 selection 之后的新生命周期组件，不是旧组件 v2；只有 task/scorer 可观察语义、
实验分母或 claim eligibility 发生变化时，才建立 successor identity。

**冻结进度（2026-08-15）：** contract surface 已提交为 `7e383c8`；development-only freeze、完整 source closure、
v3 resilient baseline lock 与 corpus `tasks-authored` entry 已建立并通过 8-row plan。Lock 不预留 replacement block，
因此 maximum attempt rows 与 calibration authorization 同为 8；600/120/660 秒 progress-aware timeout 用来降低误杀，
而不是放宽付费分母。Qualification 与 execute 仍待锁提交后运行。

### 单模型族 70% 与多模型族启动门槛

“70%”按证据合同判断，不按文件数或主观进度估计。满足以下条件后，允许开始第二、第三模型族的 development
小面板；完整 held-out 主矩阵仍需 readiness 与 promotion 条件：

1. execution resilience 在当前主 Pi/Windows 单模型路线稳定，current regression 全绿，冻结历史兼容性单列；
2. 7 个 case 的五阶段 lifecycle 可机器判定，至少 6 个 contract-qualified，measurement blocker 无未解释漂移；
3. 至少两个不同 phenotype 取得 `quality-positive` 或证据完整的 `efficiency-positive` optimized development；
   完整分母、paired regression 与 all-attempt 成本必须可审计，单纯 fidelity 不计正例；
4. 新 successor 的人工分钟、adapter LOC、core branch delta、artifact reuse 与未自动化步骤从开始时前瞻记录；
5. 公共 assembly、runner、scorer boundary 和 candidate-selection policy 冻结，不再为进入不同模型族改 core；
6. 预注册模型族小面板先测 development 的方向一致性、failure taxonomy 与基础设施兼容性；只有方向可信后才扩
   clean/noisy/long 和 held-out 主矩阵。

当前尚未达到这条研究证据门槛：7/7 contract-qualified 不变，但机器口径修正后只有 API Tester 1 个
readiness-eligible optimized phenotype；Env Manager v3 是 fidelity-preserving，不是尚未核算 compile cost 与
break-even 的 efficiency-positive。若只按工程覆盖粗估约 **65%--68%**，不再用文件数或 artifact pass 抬到
70%。已经完成的三模型族 **development 小面板**是预注册兼容性诊断，不等于跨模型主实验已经启动。
下一优先级是取得第二个真实优化正例或完整效率正例，并补齐可复用的 dynamic/solidification 闭环；完整
held-out、noisy/long 与跨模型主 claim 仍须等待 readiness、untouched replication 和更完整自动化。

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
