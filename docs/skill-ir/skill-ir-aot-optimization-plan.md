# Skill IR AOT 当前执行计划

**最后更新：** 2026-08-28

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
- Statistical Power 首轮 baseline 8/8 行无 execution blocker，但 public interface 未披露 scorer 的 23 个嵌套
  JSON pointer，冻结 scorer-authority `measurement-invalid`；没有进入 base IR/static/dynamic；
- untouched replication、三模型族主实验、noisy/long context、break-even 和面向用户的统一 optimizer CLI 尚未完成；

因此当前不能写“优化系统已经闭环”或“任意 skill 均可自动优化”。准确表述是：**执行框架较成熟，但 scorer
authority preflight 仍不完备；通用优化内核有一个质量正例、一个 fidelity 案例和多个机制/负结果，跨模型方向性
诊断已完成首批 blocked/mixed 面板，生命周期封装、跨 skill 复现、全成本与产品化仍在关键路径上。**

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

### Task 18.11：Statistical Power 竖切与阶段授权（完成，measurement-invalid 停止）

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
6. [x] 生成 development-only freeze 和分阶段授权；本地确定性检查全绿且贡献审计 eligible 后，才允许 plan/
   qualification/execute baseline；baseline 通过后才写 profile-empty base IR，static 通过后才审 residual；
7. [x] 更新现有 spec、evaluation、pilot、ledger、handoff 和 conversation log；不新增说明性 Markdown；
8. [x] 该 skill 阶段关闭后执行项目全过程复盘，明确继续、弱化或停止条件，再决定是否新增案例或多模型族矩阵。

**版本纪律：** 本任务不改写 Task 18.10 的冻结证据，也不为实现 bug、timeout 或 scorer 小修滚版本。新的
development authorization 是 selection 之后的新生命周期组件，不是旧组件 v2；只有 task/scorer 可观察语义、
实验分母或 claim eligibility 发生变化时，才建立 successor identity。

**冻结结果（2026-08-15）：** contract surface 为 `7e383c8`，freeze/lock 为 `9c90eda`。Qualification 1 行与
matrix 8 行均完成；matrix 8/8 semantic-complete、0 replacement/infra，正常行耗时 100--159 秒。正式分母是
8，但 qualification 另付费 1 次，真实总调用为 9。Numeric gate 为两臂 mean 0.1、0 differing、failed；post-run
audit 发现 8/8 报告满足公开顶层合同、0/8 满足隐藏 strict schema，公开/评分 pointer 缺口为 23，因此冻结
`measurement-invalid`。不重评分、不补跑、不建立 base IR，不进入 static/dynamic/held-out。通用 public JSON
disclosure preflight 已以 TDD 加入未来合同流程。

### Task 18.12：全过程复盘与统一封装决策（完成，下一实现已冻结）

1. [x] 逐案核对 7-case portfolio 与 Statistical Power：只有 API Tester 是 quality-positive；Env Manager 是
   fidelity-preserving；Zh Code Reviewer static-sufficient；Law/Experimental Design/Zh README/i18n/Statistical
   Power 分别因 baseline regression、saturation、scorer authority、static regression、scorer authority 停止；
2. [x] 核对 dynamic 缺失：0 case 进入 dynamic-profile 是 residual-driven 门禁结果，不是要求每个 skill 必须补做
   dynamic；通用 admission/Final IR 机制只有 synthetic eligible，真实 Env evidence 是合法 no-residual stop；
3. [x] 核对统一化现状：公共 assembly/runner/envelope/gate 已存在，但当时目录有 78 个 `*-run.ts`，多模型 plan
   仍含 package 的 skill 分支，5/7 case 无前瞻人工时间，不能声称自动适配已收敛；
4. [x] 将当前成熟度拆成三轴：执行/测量约 70%，单模型研究证据约 40%--50%，用户产品路径约 25%--35%；
   不再用单一文件覆盖百分比代表项目完成度；
5. [x] 收窄近期目标为一个模型族/Windows/clean 下 deterministic/contract-heavy skill 的 AOT lifecycle
   viability；长期跨 agent/OS/context/model 稳定仍保留为扩展目标；dynamic 不再是近期强制数量门；
6. [x] 冻结下一实现为 declarative `PilotAdapter` + 公共 lifecycle wrapper，shadow-first 复建 API Tester/Env
   Manager，并用 Statistical Power 作为 disclosure 负 canary；在两正一负 parity 前暂停新增 skill 和付费矩阵；
7. [x] wrapper parity 后补 Env Manager compile/profile/package/all-attempt 成本与 break-even 审计；结果确认
   自动 optimizer/compiler token、compile/package duration 与部分历史 qualification/all-attempt 字段缺失，故
   break-even 不可计算，继续保持 fidelity-preserving，不反事实补数。

### Task 18.13：PilotAdapter 与公共 lifecycle wrapper shadow parity

**目标：** 不改写旧 lock、package 或结果，不调用付费模型，把 API Tester、Env Manager v3 与 Statistical
Power 的差异收进声明式 adapter；公共 wrapper 固定执行
`import -> contract -> disclosure -> freeze -> qualification -> calibrate -> base IR/static -> residual admission -> artifact -> report`，
并以两正一负证明 core 不按 skill 分支。

1. [x] 先以失败测试冻结 `PilotAdapter` schema、固定状态顺序、安全仓库路径、phase budget/stop policy，以及
   disclosure failure 必须发生在 task builder/qualification 之前；
2. [x] 为 API Tester 与 Env Manager v3 声明 source/license、task builder、public contract、disclosure evidence、
   scorer/oracle anchors、runtime/resource、artifact package、冻结结果与预算；领域 builder/oracle 保持 plugin；
3. [x] 公共 wrapper 在临时目录 shadow rebuild 两个正例的 plan，要求 identity multiset、16 行、4 quartet 与冻结
   gate records 一致；从冻结 raw/scored/task/lock 重新生成完整 gate，要求逐字段 parity；
4. [x] 通过公共 assembly shadow rebuild API Tester 两个 package 与 Env Manager 两个 package，要求全部 production
   files byte parity、catalog valid、`coreBranchDelta=0`；旧目录和 digest 不变；
5. [x] Statistical Power 使用同一 adapter schema 和 wrapper，读取既有 disclosure audit 后冻结为
   `public-scorer-schema-underdetermined`，要求 0 adapter builder load/call、0 logical plan build、0 qualification/
   paid calls；
6. [x] 生成一个 compact parity report，保留 API Tester `quality-positive`、Env Manager
   `fidelity-preserving` 与 Statistical Power `measurement-invalid`，并同步既有 spec/component/ledger/handoff/log；
7. [x] focused/typecheck/doc-link/相关 broad verification 后提交并只推送 `skill-ir-aot`；不纳入 `1.md`、缓存、
   历史 raw/workdir 或其它本地结果。

**版本纪律：** `PilotAdapter`/wrapper 是首次建立的新公共协议，因此只使用首个 `v1` schema；实现修复、测试
补强和 adapter 数据修正继续原位修改，不建立 `v2/v3`。只有公共可观察字段、状态语义、实验分母或 claim
eligibility 发生不兼容变化时才允许 successor schema。

### Task 18.14：通用全成本合同与 Env Manager v3 成本审计

1. [x] 以 TDD 建立首个通用 `skill-ir-optimization-cost-accounting/v1` 合同，生产 AOT 成本与研究验证成本分账；
2. [x] 生产账分列 compile/profile/package、original/optimized runtime、repair、人工分钟与 package bytes；缺失值
   使用显式 `missing`，artifact runtime 的 0 model tokens 不向一次性成本传播；
3. [x] 研究账覆盖 v1--v3 operator failure、v4 baseline、static 与 artifact 的 qualification、selected/all-attempt
   matrix、input/output/cache/duration、scorer 与 repair；只消费 Git 已追踪 compact evidence 并绑定 digest；
4. [x] 质量等价后输出 N=1/2/5/10。Original 每次均值为 49401.5 model tokens；optimized runtime 为 0，但因
   `production.oneTime.compile.modelTokens` 缺失，四个 optimized 累计值保持 null，break-even 为 not-computable；
5. [x] `results/skill-ir/env-manager-v3-cost-accounting.json` 冻结已知研究下界：878163 input+output、1154560
   cache-read、0 cache-write、3159164ms；历史缺失清单完整保留，portfolio 仍为 fidelity-preserving；
6. [x] 完成 focused/typecheck/doc/broad verification，更新 ledger/handoff/log，提交并仅推送 `skill-ir-aot`；
7. [x] 下一阶段先做项目全过程复盘与目标校准：判断应建立前瞻自动 compiler 成本身份、取得第二个
   quality-positive，还是先做 untouched replication；在结论前不新增付费矩阵。Task 18.15 已选择前瞻成本
   identity 作为第二正例和 replication 的共同前置条件。

### Task 18.15：全过程复盘与前瞻 optimizer/compiler 成本身份

**复盘结论：** 当前 7 个 method case 的终态不再有未解释 infrastructure blocker。API Tester、Env Manager、
Zh Code Reviewer 分别提供 `quality-positive`、`fidelity-preserving`、`static-sufficient`；Law、Experimental
Design、i18n 是 measurement-valid 的 baseline regression、capability saturation、static quality regression；
Zh README 是 scorer-authority blocker。把随后停止的 Statistical Power 纳入最近竖切，8 个案例/候选中有
2 个 measurement-invalid、3 个方法负结果、3 个正向或机制证据，0 个当前终态由 timeout/provider transient
单独解释。旧短 timeout 确实误杀过正常长任务，但 successor 证据已经把它与方法/测量失败分开。

统一化仍未达到自动 optimizer：7/7 method case 都依赖领域 deterministic scorer；portfolio 的
`generatesIr` 为 0/7、`generatesContract` 为 2/7、`generatesValidationPlan` 为 4/7、
`generatesPackageCandidate` 为 4/7。只有 Env Manager 前瞻记录完整人工分钟；API Tester 只留下 adapter LOC，
其余历史适配成本不可恢复。当前 `src/benchmarks/skill-ir` 已有 80 个 `*-run.ts`；Task 18.13 的公共 wrapper
证明两正一负 shadow parity，但尚未对新 prospective construction 保存完整成本身份。

**路线比较与选择：**

1. **A，前瞻自动 optimizer/compiler 成本 identity（当前选择）。** 0 付费；不增加质量正例，但先消除下一
   候选再次出现“artifact runtime 为 0、自动构造成本 missing”的结构性风险。失败仍能精确说明是自动化边界、
   digest closure、model usage 或 package validation 哪一项不完整。
2. **B，直接争取第二个 quality-positive。** 若通过，claim 增量最高；但需要新的领域合同/scorer/compiler 与至少
   qualification + baseline 的付费分母，且在 A 之前仍会重复 Env 的成本证据缺口和 Statistical Power 的测量风险。
   A 完成后立即回到 B，不以继续建设基础设施替代方法实验。
3. **C，先做 untouched replication。** 当前 readiness 的自动化收敛、第二证据 phenotype 和 measurement blocker
   均未通过；此时冻结会复制已知手写边界，不能成为可信 replication。C 继续排在第二 readiness 正证据之后。

**实现合同与 TDD：**

1. [x] 新建首个、独立的 `skill-ir-prospective-compiler-cost/v1`；不修改
   `skill-ir-optimization-cost-accounting/v1` 或任何冻结 cost/gate/result；
2. [x] RED：要求 identity 绑定 source/task/public/resource contract、base IR/source audit、adapter、compiler
   implementation、catalog/runtime 与 environment digest；缺项、绝对路径、digest 重复/漂移 fail closed；
3. [x] RED：实际包裹一次 compiler callback，保存端到端 duration、模型调用与 input/output/cache token、package
   count/bytes/digest；callback failure 不能生成成功成本证据；
4. [x] RED：`automatic-prospective` 只有在 0 未自动化 construction steps、完整 model usage 和 package validation
   下才可作为 automatic compile cost；`manual-existing` 即使实测 0 model tokens 也只能是 mechanism canary；
5. [x] GREEN：最小实现通用 capture，并对 API Tester/Env Manager 现有 compiler 在临时目录各重建两个 package、
   验证冻结 package byte parity；生成一份无模型 compact report，分类保持不变；
6. [x] 同步 optimization/evaluation/results/README/spec、portfolio 风险说明和本地 ledger/handoff/log；focused、
   relevant broad、typecheck、doc links、`git diff --check` 后显式提交并推送；不纳入 `1.md`、raw/workdir/cache。

**停止边界：** 本任务不会把当前手写 compiler 的确定性执行时间或 0 model tokens 当作“自动 optimizer 生成
compiler”的成本，也不会反事实闭合 Env 的 break-even。A 完成后，下一信息增益回到 B：选择一个 disclosure、
贡献可识别性与 prospective cost capture 都先通过的新 quality-positive candidate；只有第二 readiness 正证据成立
后才进入 C。

**实现结果（2026-08-22）：** 双案例 canary 在 Bun 1.3.14 / Windows x64 下重建 4 个 package，4/4
validation 与 frozen manifest byte parity；API Tester/Env Manager v3 实测 133.46ms/63.16ms，0 model calls、
0 tokens。Identity 同时绑定 cost capture/runner 自身；正模型调用配全零 usage、绝对/重复路径、digest drift、
callback/package failure 均 fail closed。两个历史 compiler 都保持 `mechanism-only`，所以 A 只关闭采集缺口，
没有新增 readiness 正例。完成验证与交接后下一任务按路线 B 选择新候选。

### Task 18.16：第二质量正例候选冻结与付费前边界

**优先级结论：** 当前真正阻塞目标的是第二个 `quality-positive` phenotype，而不是 dynamic 打卡、统一 CLI、
历史 raw 修复或提前扩跨模型矩阵。Statistical Power 已由 23 个未公开 evaluator pointer 证明
measurement-invalid；继续修同一 identity 会引入结果后选合同。新候选选择 `bids`：它提供独立的
schema-heavy scientific-data-layout phenotype，固定上游同时包含机器可读 BIDS schema，可离线构造
validator/repair artifact，且不需要网络、随机模拟或新 core branch。

1. [x] 把 intake 中 Statistical Power 的过时 `prospective-dynamic-candidate` 状态同步为
   `prospective-measurement-invalid`，不改其冻结 selection/result；
2. [x] 从固定 `K-Dense-AI/claude-scientific-skills@fc0b9f6...` 导入 BIDS `SKILL.md` 及其直接引用的全部
   6 个本地 `references/`/`scripts/` 资源与仓库 license，共 8 文件逐项绑定 sha256；skill 声明 CC-BY-4.0、
   仓库根 MIT，两层身份与 attribution 均显式保留；
3. [x] RED：新增独立首版 `skill-ir-prospective-quality-candidate/v1`，要求 selected intake/status/license、
   upstream identity、regular non-symlink closure 与 digest 全部闭合，漂移 fail closed；
4. [x] RED/GREEN：任何付费前必须依次具备 public JSON contract audit、evaluator pointer closure、贡献可识别
   audit、deterministic scorer canary、prospective construction cost identity 与 qualification lock；selection
   本身不授权付费、held-out 或 readiness promotion；
5. [x] 冻结 2 tasks x 2 repetitions、`retries=0`。`no-skill | original | ir-static` 在同一 lock 下只执行并向前
   复用一次，付费上限由重复跑矩阵的 20+ 降为 12；artifact 是确定性 4 行，只有合法 residual 才可追加 4 次
   dynamic，dynamic 不是候选选择目标；
6. [x] 生成 compact selection report；BIDS 当前不进入 7-case portfolio 分母，下一阶段为 public contract、
   evaluator disclosure 与 contribution audit，仍是 0 paid。

**实现边界：** 该阶段只证明候选与实验入口可审计，不证明 BIDS baseline、static、artifact 或质量改善。
`bids_schema.json` 只使用固定 closure，不在实验期间联网刷新。下一步直接构建两条不泄露动作/答案的任务和完整
公开 JSON schema，先让 evaluator pointer closure 与 canary 通过，再允许 qualification；不插入新的通用框架。

### Task 18.17：BIDS 公开测量合同与贡献可识别性

**优先级结论：** 第二质量正例当前最重要的缺口是“先证明测量对象正确”，不是继续扩通用 CLI、补历史 raw 或
提前调用模型。本阶段复用 `public-json-contract-disclosure` 与 `skill-contribution-identifiability`，只增加 BIDS 薄
adapter、source-derived oracle 和 evaluator；不新建通用 schema 框架，不连接外部 validator。

1. [x] RED/GREEN：冻结 2 条 non-answer-bearing development task。prompt 只要求独立判断给定逻辑 dataset 是否
   适合 BIDS submission，不提示 rename、entity order、具体必填字段、预期 issue 或 gold；
2. [x] RED/GREEN：公开 `bids-audit.json` 的完整 17-pointer JSON contract，明确 issue/evidence 为 set-like、禁止
   重复，并冻结 protected input、唯一 output 与 exact workdir delta；
3. [x] RED/GREEN：从固定 `bids_schema.json` 的 `rules.entities` 与 `metadata_fields.md` 现场派生 filename order、
   metadata inheritance、BOLD required-field oracle；evaluator 注册 digest，并允许 set-like 顺序等价；
4. [x] RED/GREEN：contract audit 通过 17/17 pointer disclosure 和 canonical、alternative、prompt omission、
   reverse evidence、forbidden sink、type-negative 六角色 canary；
5. [x] RED/GREEN：贡献 audit 为 `eligible-for-baseline`。6 个 criterion 中每 task 的 skill-derived weight 为
   `0.80`，entity ordering、metadata inheritance、required BOLD metadata 三个独立失败模式都有 source、task、
   scorer 三方 digest/quote anchor，answer-bearing duplication 为 0，五类贡献 canary 全通过；
6. [x] 保持 fail closed：本阶段只完成六项 pre-paid gate 的前四项；`paidExecution=false`、`heldOut=false`、
   `qualification=false`，BIDS 不进入 studied/qualified/optimized 或 portfolio 分母。

**停止边界：** 下一阶段直接建立 BIDS prospective construction cost identity 与 qualification lock。只有剩余两项
也通过后才允许唯一一次 12-call `no-skill | original | ir-static` development 分母；不能用模型输出倒推合同，也
不能把本阶段静态 preflight 写成质量正例。

### Task 18.18：BIDS 前瞻构建、资格锁、唯一分母与残差审计

1. [x] 以首版 BIDS 声明式 adapter、source-audited base IR 和确定性 compiler/runtime 生成 catalog-valid package；
2. [x] 前瞻记录 10 human minutes、23 adapter LOC、0 core branch delta；一次 compiler/package 为 0 model
   calls/tokens、217697 bytes、validation passed。手写 compiler 严格保持 `manual-existing / mechanism-only`；
3. [x] 冻结首版通用 prospective development lock：五项 pre-paid gate、完整证据 closure、Pi 0.67.68、
   Windows/clean、2 task x 2 repetition x 3 arm、12 行、`retries=0`、exact output 及 1+12 付费上限；
4. [x] qualification 只以 resource、route、observability、deterministic scorer 为门。唯一资格行四门全过；任务
   failure 只披露，不参与模型筛选；
5. [x] 结果前冻结 paired analysis policy，并执行唯一 12-call 分母：12/12 semantic-complete/scored、0 active
   failure、0 parser/runtime blocker；确定性 artifact control 4/4；
6. [x] 数值投影为 no-skill/original/ir-static/artifact mean `0.2/0.2/0.4/1.0`，但 residual audit 发现
   12/12 repair semantics 正确、仅 1/12 满足 scorer 的精确 issue-path 表示。公开 contract 没有区分
   `affectedPath`/`evidencePaths` 的合理取值，故 BIDS v1 冻结为
   `measurement-invalid / underspecified-issue-path-value-semantics`；数值 improvement 作废，dynamic、held-out、
   readiness 继续关闭，artifact 只保留手写机制证据。

**下一步：** 把 public JSON disclosure 从 pointer 完整提升为 value semantics/representation equivalence 完整，
再决定是否建立 BIDS successor。不得原地改 v1 scorer、重评分或立即再烧矩阵。

### Task 18.19：Public JSON value-semantics disclosure preflight

1. [x] 保留既有 `skill-ir-public-json-contract-disclosure-audit/v1` 的输入/输出与历史消费者，不修改 BIDS v1
   task/scorer/lock/result，不重评分、不补跑；
2. [x] 新增并列首版 `skill-ir-public-json-value-semantics-disclosure-audit/v1`，声明 stable id、五类 semantic kind、
   rule、带角色 targets 与公开 description；public/evaluator descriptor 精确匹配；
3. [x] TDD 覆盖五类 kind、pointer 全公开但 value 隐藏、descriptor drift、canonical/alternative-valid/invalid
   canary、唯一规范化不虚构 alternative，以及旧 pointer v1 兼容；
4. [x] BIDS 薄 preflight 只读取 public interface、development tasks、source rules、scorer、旧 contract audit 与
   residual audit；不读取 raw/model output/workdir/held-out，0 paid；
5. [x] Compact blocker 保持 pointer `17/17/0` passed；7 项 evaluator semantics 中 2 项 set-like equivalence 已
   公开、5 项未公开；17 canaries、0 missing role、0 outcome failure，状态 `blocked-before-paid`；
6. [x] 保持 qualification/paid/dynamic/held-out/readiness 全 false。该结果只证明未来 preflight 可前移阻断，不
   证明 BIDS successor 已成立。

**下一步：** 评审 5 项缺失语义能否在不泄露逐 task 答案的前提下形成公开、source-derived successor contract。
若能，语义合同变化足以新建 BIDS measurement identity；若不能，停止 BIDS 并返回候选选择，不直接重跑。

### Task 18.20：BIDS successor value-semantics feasibility

1. [x] 只读绑定 public interface、development tasks、BIDS source schema/metadata、旧 contract/scorer、Task 18.19
   preflight 与冻结 residual audit；不读取模型正文或 held-out，不调用 API，不修改 BIDS v1；
2. [x] 逐项评审五个缺失语义，确认全部都可由公开 source contract 推导、可形成跨 task 通则、非
   answer-bearing，并由 source-derived canary 验证；
3. [x] 保留 path normalization 与 summary count relationship 两项公共义务；把 `affectedPath` 泛化为
   repair target 或对应 logical data file；
4. [x] 不复制 v1 的 source-reference filename 与 path-sensitive issue identity：`evidencePaths` 改为唯一且
   repair-related 的 manifest evidence，issue identity 改为 code + severity + complete semantic repair；
5. [x] 15 个 canonical / alternative-valid / invalid canary 全通过，compact verdict 为
   `feasible-with-evaluator-redesign`；
6. [x] 只开放新的 successor measurement identity freeze。Qualification、paid、dynamic、held-out、readiness
   仍全部关闭，v1 不重评分、不补跑。

**下一步：** Task 18.21 冻结新的 BIDS successor public contract、semantic scorer 与 value-semantics disclosure
identity，并先通过 deterministic canary/audit。任何付费 qualification 或 development matrix 都必须等待该身份
冻结且通过，不复用或覆盖 BIDS v1。

### Task 18.21：BIDS successor 测量身份冻结

**目标：** 保持 BIDS v1 task/scorer/lock/result 字节不可变，以新的 public interface、report schema、evaluator
和 task-set digest 冻结 successor measurement identity。该阶段只运行本地确定性 canary，不执行 qualification、
付费模型、dynamic 或 held-out。

**文件级 TDD：**

1. [x] RED：新 contract test 要求 17 个 evaluator pointer 全公开，7 项 public/evaluator value semantics 精确一致，
   development prompt 不增加动作配方或预期结果，且 committed successor interface/tasks 可确定性重建；
2. [x] RED：新 semantic scorer test 要求 data/sidecar 两种 repair-related 表示都接受，同时拒绝 unrelated manifest
   path、重复 semantic repair、非规范 path、错误 summary 和语义遗漏；
3. [x] GREEN：实现独立 successor report/payload/task contract 与 evaluator id；可以复用 v1 的 source-derived
   repair oracle，但不得导入 v1 的 source-reference evidence 或 path-sensitive equality；scorer 保持 lock-local
   direct-load，不改共享 evaluator registry，避免使冻结 v1 lock 产生无关 digest drift；
4. [x] GREEN：实现 pointer + value-semantics audit，至少覆盖 7 项 semantics 的 canonical、alternative-valid、
   invalid canary，并冻结 task/scorer/source/implementation digests；
5. [x] 生成 successor public interface、development tasks 与 compact audit evidence；报告必须写明 semantic delta、
   v1 兼容边界、claim boundary 和全部 false 的付费/qualification/dynamic/held-out/readiness authorization；
6. [x] 运行 focused/related tests、typecheck、doc links、broad suite、secret/absolute-path 与 `git diff --check`；只显式
   提交本阶段文件，不纳入 `1.md`、缓存、raw/model/workdir 或历史本地结果。

**版本语义：** 这是 BIDS 首次真正改变 agent-visible value semantics 与 scorer authority 的 successor measurement
identity，因此允许使用新的 report/interface/evaluator identity。Semantic delta 是 `2 retain + 1 generalize +
2 replace`：保留安全 POSIX path 与 summary relationship，affected path 泛化为 repair-related manifest role，
source-reference evidence 改为 repair-related manifest evidence，issue identity 改为 code、severity 与完整 repair。
兼容性边界是 BIDS v1 全部冻结证据继续只读且不重评分；claim 影响只是在 deterministic audit 通过后允许后续另行
评审 qualification identity，本任务本身不产生模型质量、优化、held-out 或 readiness 证据。

### Task 18.22：BIDS successor 资格与唯一开发分母身份冻结

**目标：** 只以前一阶段冻结的 successor public interface、development tasks、semantic scorer 与 compact audit
作为新测量身份，复用现有 prospective execution lifecycle 冻结一份向前使用的 qualification/development lock。
本阶段只完成零付费 lock、dry-run 与 scorer 直载 canary；不执行 qualification、development matrix、dynamic 或
held-out，也不读取或重评分 BIDS v1 模型行。

**实现选择：** 使用 successor 薄适配层复用公共 plan/materialization/execution primitives。不得修改共享 evaluator
registry 或 BIDS v1 lock；successor runner 只按 lock 中的 scorer source path 直接加载。不得为了本任务提升通用
prospective schema/runtime 版本，也不得把旧 tasks/scorer 作为新测量 authority。

**文件级 TDD：**

1. [x] RED：新 lock test 要求 measurement/scorer/task/public/audit identity 全部指向 successor，绑定 Pi 0.67.68、
   `xty/gpt-5.6-sol`、Windows/clean、`retries=0`、2 task x 2 repetition x 3 arm、12 行唯一分母、0 reserve、exact
   output 与 1+12 付费上限；qualification 只开放单次基础设施资格，matrix/dynamic/held-out/readiness 保持关闭；
2. [x] RED：plan materialization 必须把 successor evaluator/payload 写入全部 12 行，不从 pilot corpus 重新引入 v1
   task；scorer loader 必须限制在仓库内并只加载 lock-declared source，不依赖共享 registry entry；
3. [x] RED：qualification report 只以 resource、route、observability、deterministic scorer runnable 为门；已有语义
   活动的 task failure、缺 exact output 或 scorer failure 只披露，不能预筛模型；pre-semantic/unknown parser/scorer
   不可运行仍 fail closed；
4. [x] GREEN：实现独立首版 successor development lock/schema、薄 plan overlay、lock-local scorer loader 与
   qualification runner；复用公共 execution envelope，不复制或升级 harness；
5. [x] 生成 committed lock 与零付费 compact freeze，证明 lock 可重建、12-row dry-run 完整、scorer 直载可运行、
   BIDS v1 frozen digests 未改变；authorization 仅开放下一阶段一次 qualification；
6. [x] 运行 focused/related tests、typecheck、doc links、current broad suite、secret/absolute-path 与
   `git diff --check`；正式 qualification 前重新核对 API key，只显式提交本阶段文件。

### Task 18.23：BIDS successor 单次基础设施资格执行

**目标：** 只按 Task 18.22 committed lock 执行一个 `original` qualification row，判断当前
Pi/Windows/clean/model route、resource、execution observability 与 lock-local deterministic scorer 是否可运行。
这是一次冻结的付费基础设施资格，不是模型质量筛选；不得因 task semantic failure、exact output 缺失或 scorer
failure 更换候选、重试或修改 gate。

**执行与停止规则：** 使用既有 successor runner 的 `--phase=qualification`，不新增 harness 或版本。运行前只核对
API key 存在性、lock/freeze authorization 与 focused regression；运行后只提交 compact qualification evidence，
raw/scored/workdir 保持本地。若 resource、route、observability 或 scorer runnable 任一失败，冻结该 qualification
并停止，不执行 matrix；只有四门全过才允许下一阶段为同一 lock 实现并执行唯一 12-row matrix。

**文件级步骤：**

1. [x] 只读预检：确认 HEAD 为 Task 18.22、tracked tree clean、`SKVM_XTY_API_KEY` 存在且内容未读取，lock/freeze
   仍只授权一份 qualification；
2. [x] 运行 focused lock/qualification tests，确认 committed lock 可重建、scorer direct-load 与 infrastructure-only
   gate 当前全绿；
3. [x] 仅执行一次 `bun run ./src/benchmarks/skill-ir/bids-successor-development-run.ts
   --phase=qualification`，不得 retry、reserve、换 task 或重复 probe；
4. [x] 校验 compact `qualification.json` 的 lock digest、`paidCalls=1`、四项 checks、execution classification、
   disclosure 与 authorization；不得提交 raw/scored/plan/workdir 或 secret；
5. [x] 若资格 passed，同步现有 spec/plan/evaluation/results/pilots/developer guide，并把下一刀收敛为同一 lock 的
   12-row execute TDD；若 failed，则记录 blocker、关闭 matrix 并进入根因诊断；
6. [x] 运行相关测试、typecheck、doc links、current broad suite、secret/absolute-path 与 `git diff --check`；显式提交
   compact evidence 和既有权威文档，不纳入 `1.md` 或历史本地数据。

### Task 18.24：BIDS successor analysis/matrix execution identity 冻结

**目标：** 在任何 12-row matrix call 前，以 Task 18.22 lock 与 Task 18.23 passed qualification 为不可变父身份，
冻结 successor 专属 analysis policy、固定行顺序、可恢复前缀协议和 matrix runner implementation closure。本阶段
只做 plan/materialization/scorer dry-run 与 compact freeze，0 新 API 调用；下一阶段才允许首次从 0/12 开始执行。

**实现选择：** 新建独立首版 successor policy/runner，不修改被旧 lock 绑定的通用 prospective runner、旧 BIDS v1
policy/runner 或共享 evaluator registry。Policy 继续使用三组预注册 estimand：original-no-skill contribution、
ir-static-original static、validated-artifact-original artifact；measurement eligibility 保持 12 scored model rows、
4 deterministic controls、最多 1 个 active execution failure、0 parser/runtime blocker与 deterministic scorer complete。
这不是通用 framework 升版，只是 Task 18.21 新 measurement identity 的第一份 analysis/matrix 身份。

**文件级 TDD：**

1. [x] RED：policy test 要求 exact binding 当前 successor lock/qualification/tasks/scorer 与新 runner/analysis
   implementation；qualification 必须 passed、`paidCalls=1`、`paidMatrix=true` 且 lock digest 一致，任何 drift fail closed；
2. [x] RED：冻结 2 task x 2 repetition x no-skill/original/ir-static = 12 rows/4 triplets，行顺序固定为 task ->
   repetition -> system，`retries=0`、reserve=0、forward-only；重复、缺失或乱序 persisted prefix 必须拒绝；
3. [x] RED：policy 固定三组 paired estimand 与既有 measurement eligibility，dynamic trigger 仅 residual-driven 且未
   授权；held-out/readiness/qualification-repeat/v1-row-reuse 全部禁止；
4. [x] GREEN：实现 successor policy schema/builder/validator、薄 matrix runner、固定行排序与 persisted-prefix guard；
   runner 直载 lock scorer，以单一原子 checkpoint 逐行持久化 raw/envelope 对，完成固定分母后才投影 JSONL、统一
   评分与 compact capture；
5. [x] 生成 committed analysis policy 与 0-paid compact freeze，证明 12/12 successor rows、scorer direct-load、
   parent digest closure、matrix 尚未执行且只授权下一阶段一次 forward-only matrix；
6. [x] 同步既有权威文档与日志；运行 focused/related、typecheck、doc links、current broad、secret/absolute-path 与
   `git diff --check`，只显式提交本阶段文件，不纳入 qualification raw/scored/plan/workdir、`1.md` 或历史数据。

### Task 18.25：BIDS successor 唯一 12-row 开发矩阵

**目标：** 只消费 Task 18.24 committed policy 所授权的同一 lock/qualification 下 12 个 model rows，从 0/12
开始按固定顺序执行并持久化完整分母。不得重复 qualification、使用 reserve/retry、复用或重评分 BIDS v1 行，
也不得因中间 task 结果、score 或 active failure 改变后续行；中断后只能从摘要完全一致的 prefix 继续。

**停止边界：** parser/runtime blocker、digest/identity drift、checkpoint 损坏或资格失效立即停止。Active timeout/
step-limit 作为冻结行进入分母，累计是否超过 measurement eligibility 上限只在完整捕获后判定；本阶段不执行
dynamic、held-out、readiness，也不先验承诺第二质量正例。模型矩阵完成并通过完整性核验后，再以已冻结的 4 个
deterministic controls 生成 development result。

**执行顺序修正（2026-08-24）：** Task 18.24 只冻结了 4 条 deterministic control 的分母与 estimand，尚未实现
successor artifact compiler/runtime/control。旧 BIDS v1 artifact 产生 report v1 和 source-reference evidence，不能
直接交给 successor report v2/scorer，否则会制造 measurement-contract mismatch 的假负结果。因此在任何 12-row
付费调用前，先用新增的 successor 专属薄层完成以下步骤；该薄层只 import、不得修改 BIDS v1 与公共 artifact
assembly/catalog/runtime 的已 pin 文件，也不得修改 Task 18.24 policy 的四文件 implementation closure。

1. [x] RED/GREEN：新增 successor artifact adapter/compiler/runtime，必须消费 successor public interface 与 task
   contract，并通过 `deriveBidsSuccessorAuditOracle` 产生 report v2、summary 与 repair-related manifest evidence；
2. [x] RED/GREEN：新增独立 control/result runner。4 行固定为 successor development 的 2 task x 2 repetition，
   `system=validated-artifact`，评分前 lock-local 直载 successor scorer，调用 scorer 时只传 successor tasks 直路径，
   禁止 `corpus: pilot`；
3. [x] 在尚未读取任何 successor 模型输出前，生成 compact pre-model control freeze，绑定 policy/lock/tasks/public/
   scorer、旧 construction report、被 pin 的上游 digest、新增实现 closure、package/raw/scored digest；冻结结果必须
   证明 4/4 deterministic success、0 model call/token、0 held-out，且不授权修改 measurement identity；
4. [x] Artifact control 实测为 4/4、0 model call/token、0 held-out；compact freeze 为
   `results/skill-ir/bids-successor-artifact-control-freeze-v1.json`。本结果只证明控制臂与 successor 测量合同兼容；
5. [x] 重新核验 matrix identity digest 与 API key 存在性，然后执行唯一一次 `--phase=execute`，从真实 persisted
   prefix 0/12 开始；不得把临时目录中的 dry-run/focused test 误写为已生成持久 `run/plan.json`；
6. [x] 12/12 后先核对 raw/scored/envelope/matrix-capture identity、`matrixPaidCalls=12`、`retries=0`、严格连续
   prefix 与 classification 守恒，再由预模型冻结的 artifact evidence 构建 development result；
7. [x] 结果分层报告 measurement eligibility、contribution、static、hand-authored artifact、automatic construction
   五类结论。即使 BIDS 正向，也只可能补足第二 phenotype；`automationAndAdaptationConverging` 仍由 7/7
   `generatesIr=false` 支撑，所以 readiness 仍不得晋升，untouched replication/多模型/noisy-long 仍关闭；
8. [x] 最后单独修正 readiness blocker 派生：显式区分 `explained-and-frozen` 历史负结果与
   `open-candidate`/unexplained blocker，并因研究结论语义变化提升 readiness schema。不得只放宽表达式而静默重写
   Zh README 历史证据；该修正本身也不会让另外两道 false gate 通过。

**冻结结果：** 唯一 matrix 为 12/12 `semantic-complete`、12/12 scored、0 retry、0 active/parser/runtime blocker，
matrix input/output/cache-read 为 223224/32547/461312、duration 663008ms。No-skill/original/ir-static/artifact
分别为 3/4、3/4、2/4、4/4，mean 0.8/0.8/0.6/1.0。Original-no-skill 为 1 positive/2 equal/1
regression、mean delta 0，贡献未识别；static-original 为 0/3/1、delta -0.2；hand-authored artifact-original 为
1/3/0、delta +0.2，但 construction 仍是 manual/mechanism-only，`automaticOptimizedResult=false`。BIDS 因而不计
第二个 readiness phenotype。Readiness v4 将 Zh README 的已解释 invalidated scorer-authority 归为
`explained-and-frozen`，open blocker 归零；总 readiness 仍因 phenotype=1 与 automation 7/7 incomplete 而 failed。

### Task 18.26：自动构造能力收敛

**当前下一刀：** 不再通过增加候选或手写 artifact 追求第二正例。先把现有公共 lifecycle、source closure、public
contract/value-semantics audit、base IR、artifact assembly 与 scorer boundary 收敛为可调用的自动构造路径，选择
一个已冻结案例做 shadow generation，并以前瞻 `humanMinutes`、`adapterLoc`、`generatesIr/Contract/ValidationPlan/
PackageCandidate`、`coreBranchDelta` 和 package parity 判断收敛。不得用硬编码 skill id、后验模型输出或 held-out
补齐生成结果；只有自动路径通过 deterministic validation 后，才决定是否需要新的付费 quality experiment。

**执行合同修正（2026-08-24）：** Task 18.26 的 shadow 分母扩为当前 method portfolio 的全部 7 个冻结案例，
但仍保持零付费、development-only。实现和判定顺序冻结如下：

1. [x] 新增 first-version automatic-construction 机器合同，显式分离 `generationInputs` 与 `shadowOracles`；构造阶段
   只能读取 digest-pinned 的公开 skill source/closure，人工 contract/base IR/validation/package 只能在构造完成后比较；
2. [x] RED/GREEN 实现单一公共构造核心：从 frontmatter、工作流、输出与约束段保守地产生 contract、schema-valid
   base IR、construction validation-plan 和非冒充可执行性的 package candidate；公共核心不得按 skill id 分支；
3. [x] 7 个案例由同一 runner 串行生成并先冻结候选 digest，再进入 shadow compare。比较报告必须区分
   `structural-valid`、`semantic-review-required` 与 `manual-oracle-absent`，不得把结构骨架计作自动化收敛；
4. [x] 每案例报告四类候选是否生成、与人工件的结构覆盖、仍需人工的领域语义/checker/runtime 缺口、case-specific
   adapter LOC、前瞻 humanMinutes 与 `coreBranchDelta`；shadow oracle 注册表属于评估配置，不得反馈到生成结果；
5. [x] 只有候选同时通过来源隔离、SkillIR 引用校验、领域语义充分性和（适用时）catalog/runtime package parity，
   才允许把 method portfolio 的对应 automation flag 改为 true。否则保留原值并把差距作为 Task 18.26 正式结果；
6. [x] 全程禁止模型/API 调用、held-out、evaluator payload 和 scorer gold；完成后写入现有组件文档、台账与日志，
   并运行 focused tests、Task 18.26 runner、method portfolio/readiness 以及相关 broad regression。

### Task 18.27：薄声明驱动的 domain semantic construction

**产品边界：** 18.26 已证明 source-only 只能生成 schema-valid skeleton。终态输入固定为 `SKILL.md` + 少量声明式
task 说明；声明提供 task ABI 与公开 pass semantics，自动化负责 contract、IR、validation plan 和 package candidate。
本阶段零付费、development/public-only，既有 7 个手工冻结件只作 generation freeze 之后的 shadow oracle。

1. [x] 新增 strict `skill-ir-task-description/v1`：只允许输入/输出文件、artifact structure 与封闭 pass predicate；
   禁止 scorer/evaluator、gold/answer、held-out、模型输出及任意扩展字段。数组/文本设 schema 上限，另以前瞻
   `physicalLoc<=80`（空行也计入）、`semanticEntries<=40` 判定薄度；超限标记 `declaration-heavy`，不删除证据、不宣称收敛；
2. [x] 以 additive domain construction 包装 18.26 source-only core，不修改旧 v1 语义。由 source 产出 workflow/rule
   provenance，由声明生成 inputs/outputs、domain contract、IR check bindings 与 validation-plan predicates；core
   不得出现 7 个 case id 分支，`coreBranchDelta=0`；
3. [x] RED/GREEN 覆盖 digest、path containment、禁用 evidence、引用闭包、薄度、确定性、旧 v1 compatibility、
   semantic parity `not-established` 和无 case-id branch。结构 predicate 可进入通用 deterministic enforcement；
   content/source/cross-artifact/runtime predicate 若无通用 runtime，必须显式 `implementation-required`；
4. [x] 为 7 案例在读取 manual oracle 前写入并 digest-pin 薄声明及前瞻 authoring minutes。Runner 先生成并冻结全部
   candidates/digest，再读取旧 contract/base IR/validation/package oracle；不得读取 held-out 或 evaluator payload；
5. [x] 报告逐案分列 `fromTaskDeclaration`、`fromSkillSource`、`automationProduced`、`stillRequiresHuman`，并记录声明
   LOC/semantic entries/humanMinutes、adapter LOC、core branch delta。Gap 必须由该案 predicate/output 的实际 lowering
   coverage 推导，禁止 `gapFor` 式模板 reason；未真正测量语义 parity 时只能写 `not-established`；
6. [x] 运行 focused tests、零付费 7-case shadow、相关 benchmark broad suite、typecheck 与文档/Git 检查；只有声明
   within-limit 且 domain/runtime/package 门全部满足时才允许改变 automation/readiness flag，本任务不得为好看数字
   提前晋升。

### Task 18.28：结构 predicate 的真实 execution parity

**范围：** 只把 18.27 已生成的封闭结构 predicate 接到真实 workdir/checker runtime；冻结件只读、零付费、
development-only。手工 checker 只在全部自动候选 digest 冻结后读取，并按可比性分层，不能把结构 agreement 冒充
完整任务语义等价。

1. [x] RED/GREEN 新增 additive `skill-ir-structural-execution-plan/v1`，统一 lowering `input-integrity`、
   `output-presence`、`exact-output-set`、`json-shape`；公共 core 无 skill-id 分支，旧 18.26/18.27 identity 不改；
2. [x] 将 plan、initial manifest 与 bundled checker 组装为真实 catalog-valid artifact package，并复用既有
   `runValidatedArtifactPlan` 在隔离 workdir 执行；覆盖 baseline、input tamper、missing/extra output 与 JSON shape drift；
3. [x] 7 个案例先重建并核验 18.27 candidate digest，再读取 digest-pinned development task 与 manual evaluator；
   33 次执行覆盖 19 个已声明结构 predicate，7/7 baseline 通过，所有预注册结构突变均被捕获；
4. [x] 手工比较显式分为 `exact | manual-stricter | domain-bundled`。只有两条 exact projection 的所有观测一致，
   因而 `exactExecutionParity=established`；其余观察无论相同或不同都保持 `not-claimable`；
5. [x] Domain 只做一条 `cross-artifact-consistency` 探针：用通用 JSON pointer relation + 声明参数实现 baseline pass/
   mismatch fail、`coreBranchDelta=0`；单案例泛化与 semantic parity 均为 `not-established`，不继续添加 skill 特判；
6. [x] 报告经 strict schema 与计数守恒校验，记录 0 paid、0 held-out、3 human minutes parity catalog、1 human minute
   probe declaration。该 package 只验证产物，不生成任务产物；7/7 automation eligibility 与 readiness 不晋级。

### Task 18.29：最小自动产物生成与跨案例 domain reuse gate

**范围：** 保持 18.26--18.28 冻结输入、实现与结果只读；零付费、development-only。新增首版自动 output
compiler，从已冻结的 domain candidate、声明式 task ABI 与真实公开 workdir 输入发现唯一同名 JSON field
projection，生成证据可追溯的部分 JSON 产物，再由同一 validated-artifact package 执行结构与 relation validation。
不增加 gold、手写答案、case-id 分支或新模型调用。

1. [x] RED：证明 compiler 必须在真实 workdir 生成此前不存在的文件、复制唯一公开 source field，并保持 protected
   input digest；unsupported format、无唯一 source field 与未生成 required output 必须显式 unresolved，不能写 placeholder；
2. [x] GREEN：新增 additive `skill-ir-automatic-output-construction-plan/v1` 与通用 process/checker package；process
   只消费 plan + workdir，validation 复用 18.28 structural plan 并执行 `source-field-projection` relation；
3. [x] 在 Experimental Design 与 i18n 两个不同案例执行同一 primitive。候选必须先 freeze，compiler 不接收 evaluator
   payload；记录生成文件/字段、未解决字段/输出、process/validation 状态、manual checker 差距与成本分账；
4. [x] 将 domain reuse 机器门设为至少两个不同 case 且 core branch delta 0；单案例、skill-specific transform 或未知
   operation 必须 fail closed。跨两案 reuse 只证明 primitive 可复用，不证明任一完整 18.27 domain predicate 或
   semantic parity；
5. [x] 保持 0 paid、0 held-out、0 readiness promotion。只有任务全部 required output 被 compiler 生成、结构与完整
   domain runtime 均通过且 manual parity 建立后，才允许重新讨论 automation eligibility。

冻结 shadow 在 Experimental Design 与 i18n 上分别生成 2 与 1 个此前不存在的 JSON 文件，复制 2 与 1 个唯一
同名公开输入字段；同一 `source-field-projection` primitive 的 baseline/mismatch 均为 pass/fail，跨 2 案 reuse
gate 通过且 core branch delta=0。与此同时 15 个字段/产物显式 unresolved，两个 process 均 complete、两个 package
均 validation-failure，手工 checker 均仅 1/5 criterion 通过；semantic parity 与完整 domain predicate parity 均为
`not-established`，automatic eligibility 为 0/2。报告为
`results/skill-ir/automatic-output-construction-shadow-v1/report.json`；前测 core 开发成本没有追溯估算，冻结 catalog
之后的 shadow integration 为 8 human minutes、30 LOC，二者不得合并成“全自动零人工”。下一阶段只应增加能在至少
两个案例消解真实 unresolved 的通用语义变换；若必须引入 case/skill 分支则保持 unresolved 并停止。

### Task 18.30：声明式 JSON Pointer 投影与自动化天花板量化

**范围：** 保持 Task 18.26--18.29 的 implementation、catalog、report 与候选 digest 只读；新增 additive 首版
JSON Pointer successor，只在薄声明中接受 source endpoint、target endpoint 与 `copy-json-value` operation。声明
不得携带 literal value、gold、scorer/evaluator、held-out、模型输出或 skill/case 分支。零付费、development-only。

1. [x] RED：strict declaration/plan 拒绝未知 operation、literal value、绝对/逃逸路径、非 JSON/read-only source、
   非声明 JSON-object target、非现存 `source-field-missing` unresolved、重复 target 与 skill-specific branch；
2. [x] GREEN：先执行冻结的 `source-field-projection` base plan，再从真实 workdir 读取声明 source JSON Pointer，
   将值复制到 target JSON Pointer；不得在 plan/package 中序列化运行时值，不修改 protected input；
3. [x] Experimental Design 只增加
   `/treatment/assignedToEntityType -> /independentReplicateUnit` 与
   `/response/observedOnEntityType -> /measurementUnit`；i18n 只增加
   `/sourceFiles -> /scannedFiles`。同一 `copy-json-value` 在两个 workdir 都必须 baseline pass、突变 fail；
4. [x] 新 package/checker 同时执行 18.28 structural、18.29 source-field relation 与 18.30 pointer-copy relation。
   未解决输出继续使 package validation fail；不得把局部 relation reuse 写成完整 domain/manual parity；
5. [x] 报告必须逐项覆盖转换后的全部剩余 unresolved，并使用互斥标签
   `pointer-projectable | selector-lookup-projectable | needs-domain-runtime`。分类声明在 task/evaluator 读取前冻结，
   runner 校验与实际 remaining unresolved 一一对应且计数守恒；同时输出投影/查询路线的理论 unresolved floor；
6. [x] 本阶段不得实现 selector/lookup。若某分类没有双案例 reuse evidence，只保留 prospective ceiling 标签，不
   生成 operation。预期数值是 15 -> 12，而不是 package/eligibility 晋升；semantic parity 与 automatic
   eligibility 在未建立完整 domain runtime/manual parity 时继续 `not-established` / false；
7. [x] 声明与既有 task description 合并核算 LOC、semantic entries 和 humanMinutes；来自声明、runtime 自动读取、
   仍需 domain runtime 三账分离。完成 focused、shadow、broad、typecheck、doc links、secret/path/digest 与 Git 检查。

**停止边界：** Task 18.30 结束后先依据 ceiling 报告决定下一刀。不得连续扩 pointer/query 只为压低 unresolved；
若剩余主要属于 `needs-domain-runtime`，下一阶段必须直接选择一个可跨至少两案复用的 domain-runtime primitive，或
诚实记录自动化边界，不能用 selector/lookup 代替 readiness 主瓶颈。

冻结结果精确达到 15 -> 12：Experimental Design 与 i18n 的两个真实 workdir 共执行 3 个 `copy-json-value`，基础
projection 与 pointer relation baseline 全部 pass，pointer 值突变全部 fail，protected inputs 保持不变；两个 process
complete，但 package 仍 validation-failure、manual checker 仍各 1/5，故 semantic parity 为 `not-established`、
automatic eligibility 为 0/2。剩余 12 项分类为 pointer-projectable 1、selector/lookup-projectable 1、
needs-domain-runtime 10；纯 projection/query 的理论 floor 是 10，而且 selector/lookup 未实现。这说明下一阶段不应
继续为 unresolved 数字扩查询语法，而应直接验证可跨案例复用的 domain-runtime 能力。两案合并声明分别 53/22 与
46/19 LOC/semantic entries，均在 80/40 上限内；pointer 声明前瞻记录 3 human minutes，core 绿灯后的声明/shadow
阶段为 20 human minutes，之前 core 开发仍诚实标记 `not-measured`。权威报告为
`results/skill-ir/automatic-json-pointer-construction-shadow-v1/report.json`。

### Task 18.31：受限 Domain Plan 自动生成与跨任务 shadow

**范围：** 直接攻击 Task 18.30 留下的 domain-runtime floor，不再扩 pointer、selector 或 lookup。选择
Env Manager 与 Law 两个已有双 development task、公开合同完整且领域语义不同的案例；自动化输入仍是
`SKILL.md + 薄声明`，另允许一个公开 development construction instance 用于把自然语言规则编译成受限
Domain Plan。第二个 development instance 只作同案迁移检验；不读取或执行 held-out。

1. [x] RED/GREEN：新增首个 `skill-ir-restricted-domain-plan/v1`。计划只允许有界文件读取、JSON/文本解析、
   regex fact extraction、集合投影/过滤/运算、布尔选择和声明输出写入；拒绝 shell、network、任意代码、动态
   import、路径逃逸、未声明输出、无限循环及未知 operation；interpreter/core 不得含 skill/case id 分支；
2. [x] 生成请求严格剥离 task 的 `eval`、evaluator payload、hard gate、threshold 和任何 held-out/gold 字段。
   每案只把 exact source、薄声明、task prompt、公开 fixtures 和 DSL 合同交给模型；模型不能调用工具或修改文件；
3. [x] 在付费前冻结两份 canonical request digest、模型/route、实现 closure、调用上限 2、每案 1 次且
   `retries=0`。若 response 不是 strict plan、需要未知 primitive 或触发泄漏审计，按该案自动生成失败冻结，不
   补问、不人工修 plan；
4. [x] 过拟合审计禁止计划携带 construction task 的 secret canary、环境变量名、文档标题/长原文或其它只在
   task1 data fixture 出现的值；来自公开 contract、task declaration 或 skill source 的字段/规则必须单独分账，
   不能把公开领域合同误报为 gold；
5. [x] 每案计划 digest 在任何 manual evaluator 读取前冻结。随后同一计划分别运行 task1 与未见过的 task2 真实
   workdir，并组装 catalog-valid package；报告 process/structural runtime、protected input、生成输出、domain
   predicate coverage 和 transfer drift；
6. [x] 最后才 lock-local 加载手工 evaluator，逐 criterion 报告 pass/fail 与自动计划实际覆盖。完整 manual parity
   未建立时继续写 `semanticParity=not-established`；单个 criterion 改善、construction-task 成功或 package
   structural pass 都不得直接晋升 automatic eligibility；
7. [x] 报告 paid calls/tokens/duration、invalid/blocked reason、model-generated plan LOC、人工分钟、adapter LOC、
   core branch delta 和未实现 domain predicates。只有至少两个案例在 task2 上无需人工修 plan、无泄漏、真实
   runtime 可执行，才算 restricted Domain Plan runtime 具有跨案例机制证据；readiness 仍由完整四类自动构造和
   package/manual parity 决定。

**停止边界：** 18.31 是自动化路线的主瓶颈试验，不保证正向。如果两个案例都在 strict schema、泄漏审计或
task2 迁移上失败，或只有手工增补计划才能通过，则冻结“当前公开输入 + 单次强模型 + 受限 DSL”的自动化天花板，
不继续用更多窄原语或重复调用粉饰结果；下一步应转为明确产品边界/人工审核点。若至少两案形成真实迁移证据，
再评审是否把该生成器接回 7-case construction，而不是立即扩 held-out、多模型或新 skill。

**执行前冻结（2026-08-24）：** Env Manager 与 Law 的两个 canonical request 已写入
`results/skill-ir/automatic-domain-plan-shadow-v1/pre-model-freeze.json`。冻结摘要为 2 cases、2 requests、
0 paid、最多 2 paid、每案 1 次、0 retry、0 held-out、0 evaluator payload、`coreBranchDelta=0`；请求 digest 分别
绑定 exact source、薄声明和一个 development construction task。Execute 重新核验 catalog、request、实现 closure
及 provider route/backend identity，任何漂移在调用前 fail closed。手工 evaluator 路径和 digest 已登记用于后测，
但 evaluator module 只能在全部生成计划已冻结且四个真实 workdir 执行完成后加载。

**冻结结果（2026-08-24）：** 唯一 execute 消耗 2 个逻辑 paid attempts、0 retry；两案均在 plan 产生前以
`provider-or-parse` 失败，因此 synthesis 0/2、plan/workdir/manual evaluator 0、transfer 0/2、reuse gate failed、
automatic eligibility 0/2。两个 failure digest 不同，但首版 report 将 HTTP、tool-call、arguments JSON 与 plan Zod
错误合并，且失败时 usage/duration 不可用，故不能把本次 0/2 精确归因为 provider infrastructure 或 domain-plan
能力天花板。原请求不得重跑；下一步只允许独立 transport qualification 澄清 forced-tool 合同，不改写该结果。

### Task 18.32：Restricted Domain Plan transport qualification 与自动化停止判定

**范围：** 不重放 Env/Law 请求，不读取 task、skill、evaluator 或 held-out。用同一 route/backend、同一
`submit_restricted_domain_plan` tool schema 和同一 strict parser 发送一个显式 canonical、无领域语义的最小计划，
只判断 forced-tool transport/parse 合同是否可用。最多 1 paid call、`retries=0`。

1. [x] RED/GREEN：把 synthesis failure 分成 `transport | http | response-json | tool-call | arguments-json |
   plan-schema`，失败也记录 request duration；compact report 只保留 stage/status/body-or-error digest，不保存 response
   body、API key 或模型 reasoning；
2. [x] 预先冻结 canonical request/expected-plan digest、同 route/backend、implementation closure、1-call authorization、
   0 retry/held-out/evaluator/task payload，并在 execute 前重验所有 identity；future measurement time fail closed；
3. [x] 唯一执行后冻结 pass/fail 与 tokens/duration。Pass 只排除“持续 forced-tool 合同不兼容”，不能反推 18.31
   两个历史错误具体属于 plan schema；fail 才能按机器 stage 支撑 transport blocker；
4. [x] 无论结果如何，都不重跑 18.31、不扩 DSL、不接 7-case/held-out/多模型。完成后基于 18.26--18.32 全链写明
   当前产品边界、人工审核点和 readiness 不晋升，并让本轮自动化工作告一段落。

**资格结果与停止判定（2026-08-24）：** 唯一 1-call qualification 在 5,023.5 ms 内返回 schema-valid 且与
canonical plan digest 精确一致的 forced-tool arguments；632 input、134 output、0 cache、0 retry/task/held-out/
evaluator payload，结论为 `persistent-forced-tool-contract-compatible`。机器字段保持
`historicalTaskFailuresReclassified=false`：它排除当前持续 transport incompatibility，但不追溯解释 18.31 两个
历史失败。Task 18.26--18.30 证明 source/declaration skeleton、结构 runtime 与局部 projection 可自动化；18.31 未
证明 domain-plan 自动生成可靠性，完整 package/manual parity 与 portfolio eligibility 仍为 0。故本轮自动化工作
到此暂停：终态产品边界改为“自动生成候选 + 人工审核/补齐 domain runtime”，在新证据或新设计评审前不继续扩
DSL、重复强模型、接 7-case/held-out 或据此晋升 readiness。

### Task 18.33：Restricted Domain Plan failure attribution progressive bisection

**范围：** 仅重新打开 18.31 的失败归因，不重放 Env/Law 原请求、不扩 DSL、不接 7-case。以 Env Manager 为唯一
案例，把 18.32 的通过请求逐级增加真实 context、完整 strict schema 和 task binding；三个阶段独立执行，最多
3 paid calls、`retries=0`。Response 只允许保存脱敏 transport/tool-call/长度元数据，不保存原始 body 或模型内容。

1. [x] RED/GREEN：synthesis success/failure 均携带 sanitized response metadata，并将
   `http-or-network | content-or-missing-tool-call | json-parse-failure | strict-schema-reject` 分开；历史默认仍使用
   shape-minimal schema；
2. [x] 定义三个精确阶段：`context-minimal`（真实 SKILL.md + declaration、minimal schema）、`context-strict`
   （同 request + strict schema）、`task-bound-strict`（真实 18.31 request + strict schema + leakage/two-task binding）；
3. [x] 预模型 freeze 绑定 18.31/18.32 父证据、catalog、9-file implementation closure、route/backend、三个 exact
   request/provider payload digest 与 3-call/0-retry authorization；prefix 原子持久化且不保存 raw response；
4. [x] 提交并推送冻结件后，重新核验 digest、真实 prefix=0、key 仅存在性，再以前台顺序执行 3 个阶段；
5. [x] 工程问题则最小修复并优先取得至少一个安全 plan，再检查 leakage/binding 和计划语义；只有 transport 已
   可用且重复不能产出计划时，才冻结/转回人工 domain-runtime 产品边界。Semantic parity 在真实计划前保持
   `not-established`。

**预模型状态（2026-08-24）：** 三阶段 request chars 为 7,278 / 7,278 / 12,251，provider payload chars 为
9,297 / 41,278 / 46,251；0 paid、0 held-out/evaluator payload、`coreBranchDelta=0`。完整 strict provider schema
只表达结构，路径/regex 等复杂安全约束继续由本地 Zod fail closed，避免 provider 不支持的 regex/`oneOf` 产生
假 transport 失败。

**执行结果（2026-08-24）：** 三阶段均为 HTTP 200、指定 tool call 存在且 strict parse 通过，input/output token
分别为 2,544/146、4,259/125、5,260/3,274，duration 为 7,500.44/4,344.96/61,601.01 ms；合计 3 paid calls、
0 retry。Task-bound 计划通过 leakage 与两个 development task 的静态 binding，故 18.31 的失败不能再解释为当前
持续 context/schema/task-binding blocker；`historicalTaskFailuresReclassified=false` 仍保持，不能反推历史原因。

### Task 18.34：生成计划的零付费语义检查与静态类型门

**范围：** 不新增模型调用、不改 Task 18.33 的 9-file freeze closure、不扩 DSL/案例。直接在 Env Manager 两个
development workdir 执行安全计划，在进入 manual evaluator 或 semantic parity 设计前检查 runtime、protected input、
输出完成度与公开语义覆盖。

1. [x] RED/GREEN：新增 additive、skill-neutral 的前向数据流类型审计；已知非字符串 register 进入
   `write-text-template encoding=text` 时在 runtime 前拒绝；
2. [x] 两个真实 workdir 均实际调用既有 interpreter，0/2 complete；同一 `template-binding-type` 失败，2/2 protected
   input digest 不变，每案只存在 `env-report.json`（1/3 声明输出）；
3. [x] 计划语义审计记录 1 个静态类型错、3 个读取后未消费的 interface-derived register，以及 Vite task 2 个
   `import.meta.env` 引用未被计划 regex 覆盖；不保存 fixture 值、输出正文或错误原文；
4. [x] manual evaluator 保持 `not-run`，`semanticParity=not-established`、`eligibilityChanged=false`、0 paid/held-out/
   evaluator payload/core branch delta。当前自动化路线按人工审核/补齐 domain runtime 的产品边界收口。

**证据口径修正（2026-08-25）：** Task 18.33 只覆盖 Env Manager 的两个 development task，不是跨 skill
证据。Task 18.34 的 `/reportFields`、`/schemaRepresentations`、`/policy` 与 `import.meta.env` 检查是 Env 专用
diagnostic adapter；只有前向 register 类型审计是 skill-neutral core。18.34 没有运行手工 evaluator，因此不得把
其占位的 `semanticParity=not-established` 当成已经完成的 parity 判定，也不得表述为计划“不能进入 evaluator”。

### Task 18.35：真实 manual-evaluator semantic parity 与 Law 单调用迁移

**范围：** 不修改 18.33/18.34 冻结报告，不扩 Restricted Domain Plan DSL，不读 held-out。新增独立首版
semantic-parity evidence：在真实 development workdir 上执行自动计划后，无论 runtime complete 或 partial failure，
都调用 digest-pinned 手工 development evaluator，并以任务自身冻结的 criterion、weight、hard gate 与 threshold 判定。
Env 每任务真实为 3 项，Law 每任务真实为 5 项；禁止把不同 evaluator 伪装成统一 5/5。

1. [x] RED/GREEN：实现 skill-neutral parity core，逐任务记录 baseline/post-plan 的 `passed/total`、weighted score、
   hard-gate status、threshold status、infrastructure failure、距 full pass 的 criterion count 与 delta；
2. [x] 任务 full parity 仅在 runtime complete、protected inputs preserved、全部冻结 evaluator criterion pass、无
   infrastructure failure 时成立；案例 parity 要求同一 skill 两个 development task 都 full parity；
3. [x] 跨 skill `semanticParity` 必须输出真实 `passed|failed`，只在至少两个不同案例均 case parity passed 且
   `coreBranchDelta=0` 时 passed。案例不足、任一案例失败或 core branch 漂移均给 typed failure reason，不再使用
   literal `not-established`；
4. [x] 先对 18.33 已冻结 Env plan 做 0-paid parity，诚实报告真实分母、pass rate 与距 full pass 的差值；旧 Env
   diagnostic findings 作为 adapter 观察，不进入通用 parity core；
5. [x] 新增 case-driven、单 task-bound request 的生成 identity，从既有双案例 catalog 选择 Law。冻结 exact
   source/declaration/task/request/provider payload、相关 implementation digest、`maximumPaidCalls=1`、`retries=0`，
   提交并推送 pre-model identity 后才允许一次调用；
6. [x] 执行唯一 Law 调用；安全计划只有通过 leakage、两个 development task binding 与 skill-neutral static type
   audit 才落盘并进入两个 Law workdir。实际 arguments 在 plan schema 被拒，故未落盘、未运行后续 audit/parity；
   raw provider body、arguments、fixture/output 正文、secret 均未持久化；
7. [x] Go/no-go：若 Env/Law 的真实 checker gap 明显缩小且 Law 跨任务成立，才设计最多 1--2 个新的通用修复；若
   pass rate 仍低、只能靠 Env/Law 特判或跨 skill parity failed，则停止扩 DSL，转回“自动候选 + 人工 domain
   runtime”产品边界。无论结果如何都不开放 held-out、7-case、noisy/long、replication 或 readiness 晋级。

**执行前状态（2026-08-25）：** 通用 parity 已在 Env 的两个真实 workdir 上运行冻结 evaluator。真实分母为
每任务 3 项而非 5 项；Node task 从 baseline 0/3 提升到 post-plan 1/3（weighted 0 -> 0.45），Vite 保持 0/3，
合计 0/6 -> 1/6、distance-to-full=5、full parity tasks=0/2。两案 runtime 均因同一已知静态类型错失败，
protected inputs 2/2 保持。Law 单调用 freeze 已绑定 11,431-char request、45,431-char strict provider payload、
9-file implementation closure、1-call/0-retry authorization；该 identity 已先提交推送，再完成唯一调用。

**最终结果（2026-08-25）：** Law 调用在 31,453.3698 ms 后返回 HTTP 200、一个指定 tool call 与 usage metadata，
但 tool arguments 未通过本地 strict plan schema，分类为 `provider-failure/plan-schema/strict-schema-reject`；usage
数值不可用，按冻结合同不重试。Leakage/binding/static-type 均为 `not-run`，因为没有可安全持久化的计划。跨 skill
聚合选定 2 案、实际评估 1 案、full pass 0，typed blockers 为 `insufficient-distinct-skills`、
`case-parity-failed`、`plan-unavailable`，结论 `semanticParity=failed`。Go/no-go 选择 no-go：不增加通用修复或
DSL 原语，恢复“自动候选 + 人工 domain runtime”边界；held-out、7-case、replication 与 readiness 继续关闭。

### Task 18.36：清除工程污染后的 Env 单次通用重生成

**证据修正：** 18.35 的 Env 结果来自同一 `template-binding-type` 静态错误：两个 workdir 均
`staticTypeIssueCount=1` 且只生成 `env-report.json`，所以 `1/6` 不能解释成 1 项 domain 能力。Law 也停在 strict
schema reject。两项都不足以支撑干净的 capability no-go；旧冻结报告保持不变，但 D-054 的停止结论只保留为该
identity 的历史判定。

1. [x] RED/GREEN：新增 additive、case-driven repair core；tool schema 用六类 typed register namespace 约束
   producer/consumer，local audit 复核命名空间，不修改旧 Domain Plan v1 parser/runtime/static gate；
2. [x] 从薄 task declaration 自动枚举全部 required output 到 prompt；post-parse gate 要求每项都有独立且无条件的
   write，缺失/条件写入均在落盘前 fail closed；
3. [x] 新 freeze `env-generic-type-and-output-repair-001` 绑定旧 attribution/parity 父证据、exact
   source/declaration/task/evaluator、8-file implementation closure、13,174-char request、57,455-char strict
   payload、3 个 required output 和 1-call/0-retry budget；`coreBranchDelta=0`；
4. [x] 预模型 identity 提交并推送后执行唯一 Env 调用。只有 leakage、双 task binding、typed namespace、既有
   static type（0 issue）和 required-output 完整性全部通过才持久化计划；
5. [x] 仅在上述六门通过后，在两个真实 Env development workdir 执行同一计划并调用冻结 evaluator；要求披露
   runtime 2/2、required outputs 3/3、protected inputs、真实 6-criterion parity 和 distance-to-full。失败不补跑；
6. [x] 基于无工程污染的结果重述边界，不开放 held-out、7-case、multi-model、eligibility 或 readiness。

**执行前状态（2026-08-25）：** focused TDD 为 3/3，注入计划确实运行两个真实 workdir；只有六门全过才启动
manual evaluator。Freeze 为 paid=0、authorized=1、retries=0、held-out/evaluator payload=0。该阶段是新 attempt，
不是 Domain Plan 组件升版，也不会覆盖 18.33--18.35 的 plan/report。

**执行结果（2026-08-25）：** pre-model commit `2269296` 推送后只执行 1 次、0 retry。HTTP 200/tool call 通过 strict
schema；leakage、双 task binding、typed namespace、static type 与 required-output 六门全部通过，namespace/static
issue 均为 0。两项真实 workdir 均 runtime complete、各 3/3 required output、protected input 2/2 保持，故
`engineeringContaminationRemoved=true`。冻结 evaluator 的 baseline `0/6` 提升为 post-plan `3/6`：Node 2/3、
Vite 1/3、full task 0/2、distance-to-full 3，case parity 仍 failed。旧 `1/6` 的执行污染已排除，但剩余差距是
可完整执行计划的领域语义/表达力缺口；这仍是单 Env 案例证据，不晋级 automatic eligibility/readiness。

### Task 18.37：`review-required` 竖切收口（半日、零付费、非主线 blocker）

**定位：** Task 18.36 已给出清洁的 full-automation ceiling：同一受限计划在 2/2 真实 workdir 完整执行并生成
3/3 产物，但真实 evaluator 仅 3/6、0/2 full task。继续加入动态逐项渲染、对象构造或 `import.meta.env` 特化会
扩张 DSL/domain 分支，却没有跨案例 reuse 证据。因此 18.37 不再尝试把该计划修成“自动成功”，只把现有证据封装
成可审计的近期产品路径。

1. [x] 新增一个 skill-neutral `review-required` orchestration/interface；输入绑定自动 candidate/plan、公开
   task/contract/source 与独立人工 patch 的 path+digest，core 只负责顺序、隔离、保护输入和记账，不含 skill-id
   分支；
2. [x] 人工 patch 必须位于自动 plan 之后，不能覆盖或回写 `generated-plan.json`。Patch 可以是案例本地的确定性
   domain adapter，但只能读取公开 workdir/contract、只能写声明输出，禁止 evaluator payload、gold、held-out 和
   后验答案常量；
3. [x] 在新鲜 Node/Vite development workdir 上依次执行 `automatic plan -> manual patch -> deterministic
   validation/evaluator`，分别保留 automatic-only `3/6` 与 reviewed result；报告 patch LOC、起止时间、
   humanMinutes、protected-input 结果、每项 criterion 和 `coreBranchDelta=0`；
4. [x] 固定半日和 0 paid/model replay。到时无论 reviewed result 是否 6/6 都冻结差距；不扩 Domain Plan DSL、
   不重放 18.36、Law 或任何 held-out；
5. [x] 输出状态只能是 `review-required`，不能更新 portfolio automation flag、optimized classification、readiness
   或 replication authorization。该切片是产品边界验证，不阻塞下面的效率主线。

**完成证据：** 新 runner 在两个 fresh development workdir 上真实执行 automatic plan 后再执行独立 patch，并以同一
冻结 evaluator 复核；auto-only 精确重现 `3/6、0/2 full`，reviewed 为 `6/6、2/2 full`，protected input 与 exact
output delta 全过。Patch 为 125 physical LOC、8 prospective humanMinutes、`coreBranchDelta=0`、0 project model
calls；结果状态仍为 `review-required`，automation/portfolio/readiness/replication 均未改变。

### Task 18.38：Env `review-required` 前瞻效率实验与机器分类绑定

**机器判定审计与 authority 修复（已完成）：** `method-portfolio.ts` 只从 contract-qualified 且 baseline/optimized development
均 passed 的案例计数，并只把 `quality-positive | efficiency-positive` phenotype 放进
`twoEvidenceQualifiedPhenotypes`。当前 API Tester 是唯一 quality-positive；Env 是不同的
`environment-schema-repair` phenotype，但仍为 fidelity-preserving。现有 registry 还只信
`optimizationEvidence.classification`、`allAttemptCostComplete`、`breakEvenComplete` 和一个未验 digest 的
`evidencePath`，不会解析成本报告重新派生 classification；该历史 authority gap 已由 v4 overlay + loader +
readiness v5 successor 关闭，旧 v3/v4 文件保持不可变。

1. [x] 在付费前建立真正的 evidence binding：portfolio 必须绑定 path+SHA-256+schema，按 schema dispatch 读取并重算
   validated-artifact gate 或 `optimization-cost-accounting` 报告；efficiency 路径还必须要求
   `eligibility.efficiencyPositiveEligible=true`、分类与完整性字段一致。
   这是研究结论派生语义变化；实现时使用一次有明确 semantic delta/compatibility/claim 说明的 successor，不在旧
   v3/v4 上静默加宽，也不因 routine 修复连续滚版本；
2. [x] 只有 18.37 patch/result 冻结后才冻结新的 forward-only efficiency identity。Identity 绑定 Task 18.36
   measured synthesis（1 call、9358 input+output tokens、101440.1425ms）、18.37 review/patch、compiler/profile/
   package/runtime/scorer/cost implementation 与同一公开 Env source/task/evaluator；旧 214 分钟手写 artifact 历史
   不能冒充本 identity 的前瞻构造成本；
   在任何 8-row freeze 或 original paid call 前，必须先由零付费机器审计证明本 identity 的 production construction
   来源可完整闭合：synthesis、review patch、compile、profile 与 package 分账，三个 one-time model-token bucket 均
   无 `missing`。历史 `manual-existing` compiler canary 或单纯重跑旧 compiler 的 0 token 不能满足该前置；若当前
   reviewed construction 无法前瞻重建并逐段计量，立即停止并换案例，不得先测 recurring rows 再补成本；
3. [x] 零付费冻结 `2 tasks x 2 repetitions x (original | reviewed-aot)` = 8 logical rows：4 个 original paid
   model rows、4 个 direct deterministic rows，固定 task/repetition/system 顺序、0 retry/reserve、严格连续 prefix。
   Freeze 在两个 fresh workdir 对 deterministic arm 实际 dry-run 为 2/2 full pass，并绑定真实 execute/cost runner；
   `--phase=plan` 落盘 8 rows、0 paid、matrix 未执行。后续唯一 execute 必须完整保存 value-free envelope
   的 input/output/cache、duration、provider/assistant/tool activity；artifact 另报 execution node/process/validate
   数，禁止把确定性进程节点写成 model/agent steps；
4. [x] 质量门先于效率：8/8 row、4/4 pair、reviewed artifact 4/4 success/mean 1.0、0 hard-gate 或 paired
   regression，protected input 与 scorer authority 全过。任一失败都不得计算 efficiency-positive；
5. [x] Production 账覆盖 automatic synthesis、review patch、compile/profile/package、package bytes、original/
   reviewed runtime 与 repair；research 账覆盖本 identity 的所有 preflight/attempt/scorer/repair，并分列 selected 与
   all-attempt。报告 `N=1,2,5,10`、token break-even、逐臂 latency 与 steps；humanMinutes 不换算成 token，也不藏进
   machine latency。Research 验证成本不进入 production break-even 分母，但必须完整披露；构造成本前置审计只
   授权 freeze，不得冒充未来 8-row 的 quality、recurring 或 all-attempt 结果；
6. [x] 只有成本报告机器派生 `efficiency-positive` 后才允许更新 Env portfolio classification。该结果若成立，只会
   把 readiness-eligible phenotype 从 1 提到 2；`automationAndAdaptationConverging` 仍保持 false，因为
   review-required 不等于 automatic；
7. [ ] 若 18.37 不能在半日内形成 2/2 质量等价 reviewed artifact，或完整前瞻构造/all-attempt 成本无法建立，Env
   efficiency 记为 unreachable，不放宽合同。首选 fallback 是为 Zh Code Reviewer 等已过 baseline/static 的案例
   另建第二 quality-positive optimized identity；现行 machine readiness 未通过前，untouched replication 不能作为
   直接替代。若要让 review-required 路线进入 replication，必须另行显式定义与 full-automation readiness 并存的
   review-required method-freeze gate，不能把原 gate 静默弱化。

**Freeze 时证据：** construction-source authority 实读 review report 及其 transitive refs，重算得到 compile
bucket `9358` model tokens、profile `0`、package `0`、`missing=[]`；8 分钟人工 review 与 125 LOC 单列。随后
`reviewed-aot-efficiency-policy/v1` 与 freeze 固定 8 行、4 个未来 paid calls、0 retry；freeze 时为 0 paid/0
executed，只授权一次完整矩阵，不是 quality、recurring saving、all-attempt complete 或 efficiency-positive 结果。

**唯一执行的闭合状态：** 2026-08-26 唯一 `--phase=execute` 原子固化到 6/8 strict prefix（3 paid original + 3
deterministic reviewed-AOT，六行均成功）。桌面任务随后在第 7 行 Vite repetition 2 original 已产生 workdir 输出后
终止父进程，但 runner 尚未捕获该行 stdout/usage/score/envelope，也未将其追加到 prefix；Pi 使用 `--no-session`，
不存在可恢复的 provider transcript。该行因此是“付费尝试存在、用量未知”，不能忽略、回填或在 v1 下重试。
`allAttemptCostComplete=false`、break-even not-computable、efficiency classification not-established；步骤 4--6 均未
满足，Env portfolio/readiness 不更新。Compact 中断证据为
`results/skill-ir/reviewed-aot-efficiency-interruption-v1.json`；按阶段 stop condition，不进入后续 automation
reachability 分析。用户已选择另建能耐受 controller/desktop-parent 中断的新 identity；旧 v1 继续只读冻结，6/8
prefix、orphan attempt 与任何 row 均不得复用、补跑或重评分。

#### Task 18.38B：Interruption-resilient efficiency successor（已冻结失败）

**语义 delta：** 新 identity 保持 Task 18.38 的公开 task、reviewed package、scorer、质量门、2 x 2 x 2 分母与
`retries=0` 不变，只改变 attempt authority 和执行所有权。Foreground controller 不再拥有模型子进程；它只核验
freeze、启动一个隐藏 detached worker、读取状态和收集结果。Worker 顺序拥有全 8 行，并在任何 workdir 副作用或
paid dispatch 前原子持久化 row attempt。该变化是实验身份/中断恢复语义变化，允许新 identity/schema；它不是对
旧 runner 的 routine 修补，也不提升共享 runtime 版本。

1. [x] RED：以真实临时目录和 fake row executor 覆盖 controller 退出后同一 worker/attempt 继续、重复 `start` 不增加
   dispatch、completed terminal record 可补齐 lagging prefix、`dispatched` 且 terminal/usage 缺失时 fail closed、
   错位/gap/digest drift 拒绝；先确认测试因 successor 尚不存在而失败；
2. [x] GREEN：实现原子 `run-state` + per-row attempt journal。状态至少区分 `prepared | dispatched | completed |
   failed`；只有 `prepared` 可在尚未 dispatch 时继续，`dispatched` 永不重发。先写 terminal record，再推进严格连续
   prefix；collector 只做确定性 reconcile，不调用模型；
3. [x] GREEN：复用项目既有 `Bun.spawn({ detached: true, ipc })`/ready-handshake/hidden-worker 模式。Controller
   结束后 worker 继续；再次运行只观察同一 pid/identity。恢复范围只承诺 controller/desktop-parent 中断；worker/
   OS/power/provider 在已 dispatch 行上丢失终态 evidence 时整项失败，不伪装成可恢复；
4. [x] 零付费 qualification：在当前 Windows/Bun 上实际启动 detached fake worker，终止 foreground controller，
   证明同一 pid/attempt 完成且收集后 dispatch conservation 成立；再注入 terminal-before-prefix 与
   dispatched-without-terminal 两个 crash window。资格不读 task output/evaluator/held-out，不调用 API；
5. [x] 新 policy/freeze 从 0/8 开始，绑定 v1 语义来源、v1 interruption evidence、新 worker/journal/collector 与
   production construction authority `9358/0/0`。Freeze 固定 4 paid original + 4 deterministic reviewed-AOT、顺序
   与 0 retry；不得复用 v1 六行。Pre-model identity、qualification 和 implementation closure 先提交并推送；
6. [x] 只执行一次 `start`。实际 detached worker 在 row 1 original 完成并写 terminal 后，被并发 `status` 的 plan
   rematerialization 删除 active task/manifest；row 1 scorer infrastructure-invalid，row 2 deterministic 以 ENOENT
   失败。Journal 固定 1/8 prefix、2 dispatch、1 paid usage-complete attempt，0 retry；按 stop condition 不补行；
7. [ ] 为本 8-row identity 生成机器可重算的 reviewed-AOT quality gate，再由公共 cost builder 派生 production、
   research all-attempt、N=1/2/5/10 与 break-even。Evidence authority 必须实读并重算该新 gate；不能把弱 capture
   或旧 Env gate 代替新分母的质量证据；
8. [ ] 只有 quality equivalent、production/all-attempt complete 且 break-even computed 时，才建立新的 authoritative
   portfolio/readiness successor 并将 Env 派生为 `efficiency-positive`。旧 portfolio/readiness 保持不可变；即使
   two-evidence gate 因此通过，`automationAndAdaptationConverging` 仍为 false；
9. [ ] Phase 1 成功后只做零付费、只读的 automation reachability Phase 2：复核 7 案例 adaptation cost 与
   `automationAndAdaptationConverging` 的机器语义，产出 go/no-go 和最小工作分解后停止，等待用户决定 Phase 3。

**Pre-model 实现证据：** TDD 先暴露 module 缺失、较弱 normal-exit qualification、未清 handshake timer 与并发
initializer race；最小修正后使用 60 秒 handshake、O_EXCL 首次 authority 和真实 forced controller termination。
当前资格报告为 2 fake rows、同一 worker pid、2 dispatch，重复 start 后仍为 2；terminal-before-prefix 0 -> 1，
dispatched-without-terminal 为 failed；0 API/model/paid。Policy/freeze 固定新 0/8 identity、4 future paid、0 retry、
`rowReuse=false` 与 9358/0/0；真实 `--phase=plan` 为 8 rows、0 paid、matrix not executed。该 closure 已由提交
`bb1d1b4` 推送到 `origin/skill-ir-aot`；付费前门禁当时闭合。

**执行结论：** 唯一 `start` 后 row 1 模型执行自然结束、usage 60913/4184/258048/0 完整，但一次 `status` 并非
只读。它经 `loadMatrixIdentity` 在生产 run directory 重建 original plan；公共 materializer 会先递归删除 case，故
initial manifest/task/skill 在 active scorer/control 前消失。Row 1 不可用于质量，row 2 未调用模型即失败；v2 为
`controller-observation-invalid-for-efficiency`，步骤 7--9 未开放。Compact 证据为
`results/skill-ir/reviewed-aot-efficiency-resilient-observation-failure-v1.json`。下一 identity 的新增硬门不是扩大
journal，而是用真实 materialized row 证明 concurrent repeated status/collect 前后 active tree byte-identical，并把
observer identity validation 与任何 plan builder/materializer 完全分离；这需要用户按 Phase 1 失败回报点决定。

#### Task 18.38A：Optimization evidence authority successor（付费前硬前置）

**语义 delta：** 旧 `method-portfolio/v3` + readiness v4 把 classification 和三个 completeness flag 当作 registry
输入，只做字段自洽。Successor registry 不修改旧文件，classified case 只保存
`evidencePath + evidenceSha256`；classification、quality comparison、all-attempt 与 break-even 全部由 evidence
内容派生。新的 readiness identity 内嵌 authority report；任何 evidence failure 都 fail closed，不能回退到自报值。

1. [x] RED：构造一个 JSON 自报 efficiency、但 path 缺失/内容为空/摘要漂移/数字不支撑的案例，证明旧 v3 evaluator
   会错误计入，successor 必须分别拒绝；测试必须实际创建临时文件，不用 mock；
2. [x] RED：为 validated-artifact gate 建立 schema 与重算 canary，覆盖重复 row、counts/systems/records 不一致、
   artifact regression、gate 自称 passed 但真实比较失败，以及 API Tester exact frozen report；
3. [x] RED：为 optimization-cost report 覆盖内部 quality evidence digest 漂移、报告 completeness/eligibility 与公共
   builder 重算不一致、break-even not-computable 与真实 efficiency-positive；三个 completion flag 只能断言 loader
   的派生输出，fixture registry 中不得出现这些字段；
4. [x] GREEN：新增 skill-neutral authority loader，以 schemaVersion dispatch gate/cost 两类 evidence；路径 containment、
   regular-file/no-symlink、SHA-256、strict schema、数值守恒与递归 quality evidence 全部 fail closed；
5. [x] GREEN：新增一次语义 successor portfolio/readiness identity，旧 v3 registry/readiness v4 原字节保留。新增
   authority runner 默认指向 successor；readiness evaluator 只能消费 loader 返回的 authority，不暴露可用自填
   authority 绕过的入口；
6. [x] 存量重验：先读取 API Tester 与 Env 当前 evidence，生成 compact authority/readiness。API Tester 只有重算得到
   quality-positive 时，当前“1”才保留；Env 必须仍由 gate 内容派生为 fidelity-preserving。任一不成立都在付费前停止；
7. [x] 验证与冻结：focused RED/GREEN、旧 v3 compatibility、current readiness、typecheck、文档链接和 diff check；报告
   逐 case path/digest/schema/derived flags，不含模型正文、gold/held-out 或 credential。只有该结果提交推送后，才允许
   18.37 零付费薄层或 18.38 的 4 个 original paid rows继续。

**完成证据：** 当前 v5 report 逐文件实读并重算后，API Tester 保留 `quality-positive`，Env Manager 保持
`fidelity-preserving`；readiness 仍因 `twoEvidenceQualifiedPhenotypes=false` 与
`automationAndAdaptationConverging=false` 而 failed。本阶段 0 paid/model/held-out；focused + compatibility 为
23 pass/0 fail，typecheck 与文档检查通过。Skill IR broad 为 1043 pass/6 skip/63 fail，其中是既有冻结历史兼容
失败与 1 个 5 秒历史测试超时；authority 新测试在 broad 中 8/8 通过，不把该 broad 结果误报为全仓绿色。

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

当前尚未达到这条研究证据门槛：7/7 contract-qualified 不变；authority v5 实读 evidence 并重算后，API Tester
quality-positive “1”保留，Env 仍 fidelity-preserving，因此仍只有 1 个
readiness-eligible optimized phenotype；Env Manager v3 的历史全成本审计与前瞻 capture canary 已完成，但因自动
compiler 构造并未前瞻发生、部分
历史 all-attempt 字段缺失，仍是 fidelity-preserving，不是 efficiency-positive。复盘后不再给单一完成度：执行/测量基础设施约 **70%**，单模型研究证据约
**40%--50%**，统一产品路径约 **25%--35%**。已经完成的三模型族 **development 小面板**是预注册兼容性诊断，
不等于跨模型主实验已经启动。lifecycle wrapper shadow parity、scorer disclosure preflight 与 prospective
compiler cost capture、薄声明构造、结构 execution bridge、部分 output compiler 与受限 Domain Plan 主瓶颈试验
已完成。Task 18.36 已把自动化路线冻结在清洁的 `3/6` ceiling；默认产品边界是“候选生成 + 人工 domain runtime
审核”，不再用更多窄原语或重复模型调用追逐 unresolved 数字。下一主线先用 18.37 封装 review-required 切片，再
以 18.38 前瞻测量该切片能否形成第二个 efficiency-positive phenotype；其 v1 唯一执行现已因第 7 行权威用量不可
恢复而冻结为 `interrupted-invalid-for-efficiency`，不能续跑或据此分类。真实
dynamic 只在稳定
residual 出现时执行；完整 held-out、noisy/long 与跨模型主 claim 仍须等待 readiness 与 untouched replication。

### 4.27 Task 18.38C：只读观察与极简串行执行

Task 18.38B 的失败不是模型或 reviewed-AOT 质量证据，而是 `status` 与 production materializer 共享
`loadMatrixIdentity` 后删除 active case。18.38C 是 Phase 1 内最后一次有界修复，顺序固定如下：

1. 新建 additive successor，不修改 v1/v2 冻结实现。只读 control-plane 只解析 schema、读取 regular file、核对
   path containment 与 SHA-256；其依赖闭包不得包含 plan builder/materializer 或任何文件写 API。
2. TDD 先建立真实 materialized active-tree 并发回归：另一进程持有 task/skill/manifest 时，重复并发执行真实
   `status/collect`，前后全树 path + bytes digest 必须一致。该证明为 0 API/model/paid；失败则不得 freeze。
3. 付费前 `prepare` 单独物化 4 行 original plan、编译 deterministic bundle，并将它们与 8-row denominator 一起落入
   只读 plan。生产只运行一个
   foreground serial executor，逐行 `dispatched -> execute -> atomic prefix`，不启动 detached worker、observer 或
   polling controller。
4. 新 identity 从 0/8 开始、0 retry，不复用 v1/v2 任何行。安全恢复只允许已完成 prefix 与 state 的确定性
   reconcile；dispatched 后缺少完整行证据即 fail closed。
5. Qualification、freeze、focused/typecheck/docs/broad 和 pre-model commit/push 全部完成后，才检查 key 存在性并
   启动唯一 8 行执行。若此后再次出现基础设施失败，立即停止 Phase 1 修复并转 Phase 2；不再建立新 control-plane。
6. 只有 8/8 后才由质量 gate、公共 cost builder、evidence authority 顺序派生 portfolio/readiness。无论 Phase 1
   成败，随后 Phase 2 只读分析 automation reachability，并在 Phase 3 前停下等待用户决定。

截至 2026-08-27，步骤 1--2 的 TDD 与零付费 qualification 已完成：真实 active tree 为 41 entries，独立 holder
存在时 12 status + 12 collect 前后 byte digest 相同；只读闭包外 import、builder/materializer 与 mutation API 均为
0。串行状态机的正常完成、prefix-commit 恢复和 dispatched-without-terminal 停止均已通过。新 policy/freeze 固定
`env-manager-reviewed-aot-efficiency-readonly-serial-001`、0/8、0 retry、0 production observer 与剩余修复身份 0；
付费执行仍未发生，pre-model commit/push 前也不得创建正式 run directory 或检查 key。

**完成证据：** pre-model closure `2666d80` 推送后，prepare 写出 exact 8-row plan；唯一 foreground execute 从 0/8
顺序完成 8/8、4 paid original + 4 deterministic reviewed-AOT、0 retry/observer/infrastructure failure。四个 pair 的
original/reviewed score 均为 1.0。公共成本 builder 重算 production one-time `9358` tokens、original recurring
`202010/4=50502.5` tokens/run、optimized 0 tokens/run；production/all-attempt/break-even completeness 全 true，
break-even 为 1 call。新 `method-portfolio/v5` authority 显式绑定旧 Env fidelity gate 作为 superseded evidence，
再绑定 prospective cost report；readiness v6 得到 quality-positive=1、efficiency-positive=1、two-evidence=true。
`automationAndAdaptationConverging` 仍 false、overall readiness 仍 failed，held-out/replication/多模型未授权。

### 4.28 Phase 2：Automation reachability authority（已完成，Phase 3 前停止）

Phase 2 不增加模型调用、不扩 selector/lookup/DSL，也不修改 portfolio flag。它用
`automation-reachability-v1.json` digest-bind 当前 loader 实现、portfolio authority 与 18.26--18.37 的八份 compact evidence，
再由 `automation-reachability.ts` 实读、验 SHA-256、按原 schema parse 并重算下列事实：

1. 当前 gate 的直接输入是全部 7 个 contract-qualified 案例的四个 automation boolean、非空 `humanMinutes`/
   `adapterLoc`，以及至少 6 例时末三例成本均值不得高于首三例；domain runtime/parity 不在判断表达式中。当前缺
   IR/contract/validation/package 的案例数为 `7/5/3/3`，只有 1 例 prospective measured，趋势不可计算；
2. 当前项目政策又明确要求 flag 晋升先满足 source isolation、IR reference validation、domain semantic sufficiency，
   并在适用时满足 catalog/runtime/package parity。因此 domain parity 是间接资格证据，不是直接 gate 字段；
3. 现有 portfolio schema 对 automation boolean 与 adaptation cost 都只接受自报值，不要求 evidence reference。
   Canary 不增加任何引用、仅编辑这些字段就能使 gate `false -> true`，证明当前 gate 不能作为可攻的研究权威；
4. 按当前政策逐 flag 复核，IR/contract/validation/package 虽各有 `7/7` candidate，但 authority-qualified 均为 0。
   IR exact source-rule match 为 0，contract/validation semantic parity 为 0，package complete construction 为 0；
5. 18.27 的薄声明可前瞻复用为 15 humanMinutes/159 declaration LOC。其它 28m、3m/297 LOC、8m、20m、
   Env review 8m/125 LOC 的测量范围重叠或不同，不能相加；历史 6 个 null 不得回填，完整 qualification 成本仍需
   7/7 前瞻测量。薄声明的人时趋势通过、若把 declaration LOC 计作用户工作量则趋势失败，故结论依赖成本边界。

机器决策因此是：提升当前 flag=`no-go`，直接攻击当前 gate=`no-go`；Phase 3A readiness attack 仅为
`conditional-go`，前提是先冻结 evidence-bound 的组件 flag authority、决定“结构存在”与“语义资格”的边界、
冻结包含声明投入的成本口径，并对 7 例完整资格成本做前瞻计量。Phase 3B 以当前产品边界收口为 `go`。
报告停在 `user-decision-required-before-phase-3`，由用户在 3A/3B 间选择；不授权 paid、held-out、replication、
多模型执行或当前 gate 的无证据改写。

### 4.29 Task 18.39：Phase 3B+ Stage A 组件级 automation authority

**用户选择：** 采用 Phase 3B closeout，但先吸收 Phase 3A 的第一项。Stage A 只关闭四个 automation flag 与
adaptation cost 的证据来源漏洞；完成、提交并推送后立即停止，等待用户确认 Stage B。不得顺手执行 7-case
prospective qualification、付费、held-out、replication、多模型或 DSL 工作。

**语义 delta：** 旧 `method-portfolio/v3` 与 readiness v6 从 base portfolio 的自报 automation/cost 字段计算
convergence；新的 additive authority 只接受 digest-bound optimization authority、组件 evidence 与明确成本政策，
逐案例派生四组件资格和完整成本，再生成 readiness v7。兼容边界是旧 portfolio、optimization authority、Phase 2
report 与 readiness v6 保持不可变；claim 影响只把当前 automation=false 从“自报字段恰好为 false”提升为
“冻结组件证据机器派生为 false”，不增加 automatic eligibility、优化正例或外推授权。

1. [x] RED：新 catalog strict schema 只允许 implementation、现有 optimization authority、组件 evidence 与成本
   policy 的 path/digest；加入 self-declared flag、cost、eligibility 或 readiness 字段必须拒绝；
2. [x] RED：用真实 7-case evidence 要求逐案例/逐组件输出 candidate、qualification criteria、typed blocker 与
   evidence refs；当前四组件均 7/7 candidate、0/7 authority-qualified；
3. [x] RED：在临时目录把 base portfolio 四个 boolean 全改 true、填入可通过趋势的成本，并同步 base/registry/
   catalog digest；组件证据不变时 authoritative readiness 仍必须 false。未同步 digest 的直接篡改必须 fail closed；
4. [x] RED：成本边界必须计入薄声明 humanMinutes + physical declaration LOC，但只把它们记作已测 segment；其它
   范围重叠的历史工作不得相加，qualification segment 缺失时 7/7 full cost 与 trend 保持 not-established；
5. [x] GREEN：实现最小 skill-neutral loader/readiness successor；拒绝 symlink、路径逃逸、digest/schema/case-set
   drift，不按 skill id 分支，不读取 candidate/raw/evaluator/held-out，也不信任旧 self-report 字段；
6. [x] 生成 compact readiness v7，证明 two-evidence 仍 true、component qualification 0/7、完整成本 0/7、
   `automationAndAdaptationConverging=false`、overall=false，且 `coreBranchDelta=0`；
7. [x] 同步 evaluation/optimization/developer/README/results 与根台账、handoff、conversation log；运行 focused、
   typecheck、doc links、current broad 与 `git diff --check`，显式提交推送，不纳入 `1.md`、cache、raw/workdir；
8. [x] 报告 Stage A 并停止。只有用户确认后才进入 Stage B 的成果整合与论文骨架；untouched replication 和更强模型
   full automation 继续属于 Stage C。

**完成证据：** 首轮 RED 为 missing module；最终 focused 5/5。Readiness v7 的 five gates 为
`true/true/false/true/true`，overall false；四组件 candidate 7/7、authority-qualified 0/7，full cost complete 0/7，
`coreBranchDelta=0`，Stage A accounting 为 0/0/0。旧 self-report 攻击可令 legacy evaluator true，却不能翻转 v7；
未同步字节改动被 digest 拒绝。当前接力点固定为“向用户报告并等待 Stage B 确认”，不是继续 qualification。

### 4.30 Task 18.40：Phase 3B+ Stage B 成果整合与论文骨架

**确认：** 用户在 Stage A 回报后要求继续。Stage B 只整理已有 authority-verified evidence，不创建新的 paper
authority、自报 registry 或实验身份，不新增 Markdown，不调用模型/API，不读取 held-out，不执行 7-case qualification、
replication、多模型/noisy-long 或 DSL 扩展。

**收敛命题：** `machine-verifiable evidence-authority, review-required verified skill artifact packaging`。长期
full-automatic Skill IR optimizer 仍是北极星，不作为当前完成状态。每条正文实证 claim 必须绑定现有 authority 的
path/digest、允许范围与禁止外推；历史阶段状态与当前结论分开，不能用新结果静默重写旧 identity。

1. [x] 复核 readiness v7、API Tester quality gate、Env readonly-serial quality/cost、clean automatic domain parity 与
   review-required closure 的精确 schema、数值和 SHA-256；
2. [x] 在 spec 中冻结 C1--C6 claim-authority matrix，明确 API quality-positive、Env efficiency-positive/break-even=1、
   7/7 candidate 对 0/7 qualification、Env auto 3/6 对 reviewed 6/6，以及 review-required 产品边界；
3. [x] 在同一 spec 中加入论文工作标题、核心问题、RQ、十节正文骨架、threats 与 Stage C future-only 边界；
4. [x] 更新 experiment results、文档入口与 developer guide，消除“Env 仍 fidelity-only”“当前只有一个 phenotype”
   等过期状态，同时保留这些说法在历史阶段中的当时语义；
5. [x] 同步本地 communication/handoff/conversation log；Stage C 只列 future work，不因文档整合获得 execution
   authorization；
6. [x] 运行 authority focused、两个 authority runner、typecheck、文档单测/全仓链接、Skill IR broad 与
   `git diff --check`；确认历史 62 fail 不增加；
7. [x] 精确暂存现有文档，扫描 credential/绝对用户路径/`docs/skill-ir/1.md`，提交并推送到
   `origin/skill-ir-aot`；在论文骨架审阅点停止。

**Claim 分账：** Stage B 不新增 experimental sample，也不把旧 paid call 算作本阶段成本；本阶段 accounting 固定为
0 paid / 0 held-out / 0 evaluator payload。论文引用旧实验时使用各自冻结分母与原成本，不跨机制拼接均值或
amortization。Env clean automatic `3/6` 是当前单案例边界，不写成模型族永久上限；review patch 的 125 LOC/8 minutes
不能消失，也不能反推 automatic eligibility。

### 4.31 Phase E0：工程化就绪度与 evaluator 策略

**授权与停止线：** 用户授权先完成 Phase E 的 E0。E0 只读现有实现与证据，产出工程就绪度、复用/重构/解耦清单和
evaluator 策略；不写 E1 集成代码、不调用模型/API、不读取 held-out。E0 完成后必须停下等待用户决定，不能按推荐项
自动进入 E1。

1. [x] 复核 Restricted Domain Plan、artifact assembly/catalog/runtime、automatic construction、review closure、
   cost accounting、evidence authority 与公共导出/CLI 现状；
2. [x] 将组件分为 `reuse-after-export`、`refactor-public-view`、`candidate-only-refactor`、`decouple`、
   `optional-plugin` 与 `missing`，明确现有研究实现不等于稳定产品 API；
3. [x] 对比 A（用户提供薄确定性 checker）和 B（无 evaluator 的 token-saving-first + 用户验收），明确两者的接入
   成本、证据强度、允许 claim 与失败边界；
4. [x] 冻结双轨分账：产品 token 经济性可以独立计算；质量 assurance 为 `machine-checked | user-accepted |
   not-established`；只有 `machine-checked` 可在其它门完整时进入既有研究 authority；
5. [x] 推荐 B 为默认产品路径、A 为可选严格插件；不放宽 `efficiency-positive` 或 readiness 的机器证据语义；
6. [x] 同步 spec、evaluation、optimization、README、developer guide 与本地 ledger/handoff/log，不新增 Markdown；
7. [x] 用户确认 B-default + A-optional；B 不能研究晋级，A 只取得 authority-review 资格，不自动晋级。

**E1（已完成）：**

1. [x] RED：新增 `src/skill-ir/verified-artifact-product.test.ts`，先证明缺少共用 product API；覆盖 candidate 必须
   `review-required`、B/A 仅质量证据分支、票据绑定 artifact/source/workdir input/output digest、任一字节漂移拒绝、
   acceptance human minutes 只进入 one-time、B claim 文案与 research eligibility 收缩；
2. [x] GREEN：新增 `src/skill-ir/verified-artifact-product.ts`，只 import 既有 automatic construction、Restricted
   Domain Plan、validated assembly/catalog/runtime 与 cost evidence schema，不修改这些被历史 freeze pin 住的文件；
3. [x] 新增 `src/skill-ir/verified-artifact-plan-runner.ts` 与 `verified-artifact-patch-runner.ts` 两个 skill-neutral
   package runtime adapter；差异只能来自声明、review plan/patch 和可选 checker，core 不出现 skill-id 分支；
4. [x] 新增 `src/skill-ir/verified-artifact-cli.ts` 与 focused CLI test，以单次命令执行
   `compile -> review/accept -> package -> run -> cost`。暂不修改被大量历史 lock digest 绑定的 `src/index.ts`；主 CLI
   dispatch 在完成 compatibility 迁移后接入，避免为 E1 新增历史失败；
5. [x] 用 Env 既有 pilot 做 B-default vertical slice，taskSet 仅作 fixture materialization、产品链不消费 evaluator，
   输出 compact product report、token break-even 与 `qualityEvidence=user-accepted`；复核 `coreBranchDelta=0`；
6. [x] A-optional 用同一核心执行薄 deterministic checker 回归，只允许 `qualityEvidence=machine-checked` 与
   `eligible-for-authority-review`，不直接写入现有 research authority。

**E2（仅仓内受控探针已授权）：**

1. [x] 新建一个项目内、此前没有 task/scorer/compiler/package 的 package-inventory 受控 skill，只提供 `SKILL.md + 薄 task 声明 +
   fresh workdir`；review plan/patch 作为诚实的人工补齐段，前瞻记录 authoring 时间、physical LOC 与 core delta；
2. [x] 用同一 E1 命令/API 从零 compile、B-mode accept、package、run、cost；重跑两次并比较 package/output digest，
   记录实际自动生成、来自声明、来自人工 review 与仍未解决项；
3. [x] 没有 original recurring model-token 基线，产品 cost 输出 `not-computable`，未为了得到好看的
   break-even 调用模型或回填旧案例数据；
4. [x] 运行 focused、`src/skill-ir`、benchmark compatibility、typecheck、文档与 broad；dependency-enabled broad 为
   1233 pass/2 skip/21 historical fail，未超过历史 62；
5. [x] 在探针差距报告后停止，等待用户判断项目外真实 skill 的选择和是否值得继续规模化。

### 4.32 Task 18.41：Env A-optional 产品价值闭包与下一泛化回报点

**目标与边界：** E2 只证明新案例的产品链可执行，`packageCandidate` 仍为 non-executable，且没有自然的
original LLM recurring baseline，不能支持 token-saving claim。本任务先复用 Env Manager 已冻结的公开 fixture、
deterministic v3 evaluator 与 readonly-serial 成本证据，在同一产品主链持久化一份 A-optional 产品；本阶段不重跑
original 模型分母、不调用 API、不读 held-out，也不把历史研究矩阵冒充本次产品执行。

1. [x] RED：Env 产品回归要求同一 `compile -> review-or-accept -> package -> run -> cost` 主链输出
   `qualityEvidence=machine-checked`、`eligible-for-authority-review`、exact output delta、protected input preserved、
   one-time `9358`、original `202010/4=50502.5`、artifact recurring `0` 与 break-even `1`；当前只有 B 配置时先失败；
2. [x] GREEN：在 preview 前生成外置 initial-workdir manifest，只把 digest-bound manifest reference 交给可选 checker；
   B/A 的 artifact/runtime/cost 主链不分叉。Env checker 复用 v3 evaluator 的三项公开 criterion，并在调用前核对
   evaluator source digest；不得复制 scorer gold、读取 held-out 或按 task id 在产品 core 分支；
3. [x] 新 machine-checked 配置必须绑定 source、薄声明、automatic plan、review patch、checker 与冻结 cost report。
   Product report 明示 original recurring 数据来自既有 digest-bound historical evidence，本次模型/付费调用为 0；
   `machine-checked` 只允许进入 authority review，不自动重写 research portfolio/readiness；
4. [x] 用 Node development fixture 实际运行一次产品链，持久化 product manifest、quality/run/cost evidence，并用
   独立 validator 重验 artifact/evidence digest closure、三项 checker 全过和精确 token 数值；
5. [x] 随后只读评估 `enumerate JSON keys | sort/deduplicate | cross-field counts` 是否各有至少两个真实案例需求；
   单案例证据不实施原语。按“原本反复使用 LLM、会重复执行、核心逻辑可确定性化、非纯脚本”的标准筛选一个真实
   外部 skill；不导入、不执行、不建立 baseline；
6. [x] 在新增 DSL 或执行外部 skill 前强制回报。同步现有 spec/plan/component/results/ledger/handoff/log，完成
   focused、current broad、typecheck、doc links、secret/path 与 `git diff --check`，显式提交推送且排除 `1.md`、
   raw/workdir/cache 与旧本地结果。

**版本纪律：** 这是现有产品 v1 的 A-optional 证据闭包与一个新配置身份，不提升 artifact/runtime/cost schema。
若实现发现必须改变机器质量证据的可观察字段或 eligibility 语义，应先停止并另行记录 semantic delta；普通 manifest
传递、checker adapter 与 digest 修复留在现有版本。

**完成证据与停止点：** Env A 产品持久化在
`results/skill-ir/verified-artifact-product-env-machine-checked-2026-08-29/report.json`。当前执行为 0 API/model/paid，
machine checker 的公开 v3 criterion 为 3/3；digest-bound 历史分母为 original `202010/4=50502.5` token/run、artifact
`0`、one-time `9358`、break-even `1`。报告只标记 `eligible-for-authority-review-not-promoted`，不修改 portfolio/readiness。
首次 staged-index checkout 发现派生 `skill.md` 的 CRLF 被 Git 规范化后会破坏 closure；新增 RED 后在 product v1 内将
skill view 规范化为 LF、重建同一结果身份，并以 staged-index 临时 checkout 验证完整 product closure 通过。

DSL 只读复核得到：JSON object-key 枚举至少由 package-inventory 与 API Tester 两案需要；字符串排序/去重至少由
package-inventory、Env Manager 与 API Tester 三案需要，二者通过 multi-case reuse gate。宽泛的 `derive-cross-field-counts`
虽在 package-inventory、API Tester/Experimental Design 出现，但分别包含 array length、distinct union、nested plan count 与
selector 后 entity count，当前没有一个不隐藏 selector/domain 语义的共同窄合同，因此只保留候选，不实施。

项目外候选选择 Apache Magpie 的 `magpie-release-audit-report`（`apache/magpie` main HEAD at selection
`453dd9f20bdebe9d4458d84682bd707be1414f80`，`skills/release-audit-report/SKILL.md`，Apache-2.0）。它按 release/周期刷新
重复运行、显式包含 AI-driven hand-back，又有固定字段抽取、MISSING/REDACTED、模板和 schema validation 核心，不是纯脚本。
后续若获授权，只允许先冻结 public fixture 上的 Step 0--2 development slice；本任务没有导入、执行、建 baseline 或开 PR。

### 4.33 Task 18.42：窄 collection DSL、closure 规范化合同与外部 Step 1 gate

**目标与边界：** 先完成两个已有多案例需求的窄原语：JSON object-key 枚举与字符串排序/去重；不实现语义混杂的
cross-field counts。随后只对固定 commit 的 Magpie release-audit 做零执行可行性评估，尤其先判断能否建立可信、可复现、
可计量 token 的 original LLM baseline。本任务不得 clone/import 上游、不得执行 Magpie task/model/baseline、不得读取 held-out，
也不得在 Step 1 后自行进入最小导入。Step 1 报告完成后必须停下等待用户决定。

1. [x] 保持被历史 freeze digest 绑定的 `automatic-restricted-domain-plan.ts` 与 E2 原 plan/config/result 不变；新增首版
   product-side collection-plan wrapper，内嵌并原样执行 Restricted Domain Plan v1，再只允许
   `enumerate-json-object-keys` 与 `sort-and-deduplicate-strings` 两个 value-free operation；旧产品配置继续走原 runner，
   不因新能力改变旧 artifact closure；
2. [x] RED 先覆盖 strict schema、未知 operation、非法/未声明 path 与 JSON Pointer、非 object 枚举、非 string collection、
   精确去重/稳定排序、输入保护和至少两个真实案例 workdir；GREEN 只实现满足这些合同的最小解释器，不加入表达式求值、
   selector、lookup、count 或 skill-id 分支；
3. [x] 建一个新的 package-inventory 产品 identity：base plan 先写结构化 dependency maps，collection-plan 再枚举/排序/合并；
   人工 patch 只保留尚未统一的三项 count。报告必须对比旧/new review LOC、列出自动化与人工边界、0 API/model/paid、
   `coreBranchDelta=0`，且不把局部原语晋升为 semantic parity、automatic eligibility 或 token-saving；
4. [x] 将 `skill.md` 的派生展示字节规则提取为显式产品合同：source authority 始终绑定原始 bytes；派生 view 只把 CRLF
   规范为 LF，保留既有 LF、lone CR、终止换行与其它 UTF-8 内容；为 CRLF/LF 等价、原始 digest 区分和 staged-index closure
   增加 focused tests。该兼容性修复留在 product v1，不提升 artifact/runtime/cost 版本；
5. [x] 通过只读 public upstream source 对 Magpie 固定 commit 做三门评估：original baseline 是否有公开、可重复的输入与精确
   skill/prompt closure，且一次真实 original 运行可取得完整 usage；核心 Step 0--2 中有多少能由受限 DSL + 小 patch 固化；
   machine-checked checker 需要哪些公开 oracle、fixture、代码与人工量。若 baseline 不可建，报告必须给出 no-go 并选择下一
   候选，而不是先导入后补分母；
6. [x] 只把 compact JSON evidence 作为新机器产物，结论追加到现有 spec/plan/optimization/evaluation/real-skill/results/
   README/ledger/handoff/log；不新建 Markdown。完成 focused、`src/skill-ir`、相关 benchmark、typecheck、doc links、staged-index
   closure、secret/path 与 `git diff --check`，显式暂存并排除 `docs/skill-ir/1.md`、旧 raw/workdir/cache。

**版本纪律：** Restricted Domain Plan v1 不变；新的 collection wrapper 是独立首版合同，不是旧 DSL 的 v2。产品 workflow、
artifact/runtime/cost 仍为 v1，只有新 plan identity 选择新 runner。若实现必须改变既有质量证据字段、成本含义或历史 closure，
立即停止并重新评审 semantic delta，不能用小修名义静默改写。

**完成证据与停止点：** 新的 `skill-ir-verified-artifact-collection-plan/v1` 以旧 plan 为 `basePlan`，只允许对象键枚举与
字符串精确排序/去重。package-inventory 与 API Tester 两个真实 workdir 均执行通过、protected input 不变、共享实现且
`coreBranchDelta=0`；历史 plan+patch 为 111 LOC，新 identity 为 119 LOC，其中人工 patch 从 58 降至 44 LOC，因此只证明
两个原语复用和 patch 缩小，不证明总适配投入下降。`cross-field counts` 保持未实现，semantic parity、automatic eligibility
和 readiness 均未建立。派生 `skill.md` 的 closure 合同已独立为 fatal UTF-8 + 仅 CRLF-to-LF；原始 source digest 仍绑定原字节。

Magpie Step 1 结论为 conditional go：固定 public Step 0--2 的 prompt identity 可精确冻结，但上游 harness 只记录
stdout/stderr/exit code，没有 token usage；可信分母必须由项目 Pi runtime 在新的前瞻 identity 中采集，现有 baseline rows=0。
受限 DSL + 240--360 LOC 领域 patch 可覆盖初始公开 slice；替换上游 judge 的 machine checker 预计 260--420 LOC、4--8
human-hours。持久化证据为 `results/skill-ir/verified-artifact-collection-qualification-v1/report.json` 与
`results/skill-ir/magpie-release-audit-feasibility-v1/report.json`。本任务为 0 clone/import/external execution/model/API/paid/
baseline/held-out，并按约定停在 Step 1；Step 2 必须等待用户显式确认。

### 4.34 Task 18.43：Magpie Step 2 最小公开切片、独立 checker 与新分母

**授权与范围：** 用户已显式批准 Step 2。导入固定提交
`453dd9f20bdebe9d4458d84682bd707be1414f80` 下 release-audit-report 的全部 9 个公开 Step 0--2 case；这是覆盖
preflight、完整/部分 gather、完整/缺失/injection assemble 语义所需的最小公开切片，不导入 live GitHub/mail/SVN、Step 3/4
副作用或任何 held-out/private surface。

1. [x] 将原始公开 prompt 输入与 checker-only `expected.json`/`assertions.json` 分目录导入，逐文件绑定 upstream path、commit、
   git blob 与 sha256；prompt builder 和 artifact compiler 必须拒绝 checker-oracle 路径，且输出精确复现上游
   `step section + LF LF + output spec + LF LF + fixed user template(report)` 字节；
2. [x] 严格 TDD 实现独立 deterministic checker：不把 upstream judge 当权威，从公开 report/schema 重建 exact schema/type、
   canonical URL、MISSING/REDACTED、required-field violation、privacy marker 与 injection consistency，并要求 baseline-pass 加定向
   mutation-fail；`expected/assertions` 只用于 checker-side 对照，不进入模型或 artifact 输入；
3. [x] 用已批准的 restricted JSON/collection 原语加 skill-local bounded patch 构造 9 个 deterministic outputs，在真实临时 workdir
   执行并逐案通过独立 checker；记录 patch/plan/总 LOC、humanMinutes、coreBranchDelta=0 和仍未覆盖的 live/open-ended 边界；
4. [x] 在任何模型调用前冻结新的 project-Pi identity，绑定 source/task/prompt/checker/artifact/model/provider/adapter/temperature/
   timeout/runner digest、严格有序 original/artifact rows、0 retry 与 fail-closed 前缀；先提交并 push freeze，再核验环境变量存在性；
5. [ ] 仅在所有 pre-model gate 通过后串行执行新分母，original 从 0 行前瞻采集完整 input/output/cache-read/cache-write usage，
   artifact 为 0 model token；质量、成本与 break-even 必须从冻结 identity 和完整行重算，失败即保留证据并停止，不能用旧行回填；
6. [x] 结论只限固定公开 9-case slice。即使 machine-checked quality/efficiency 成立，也不自动晋升 method portfolio、full-auto
   convergence、untouched replication、held-out 或跨 release/live-network 泛化。

首次提交的 `measurement-policy.json` 在 `bc9c853` 后以 0/36 启动，但 `prepare` 生成 `rows/row-01/workdir`，共享
`resetPersistentWorkDir` 只接受 materialized `run-N/workdir`，因此在 `Bun.spawn` 前 fail closed：0 prefix、0 model/API/paid。
该身份保留为 `magpie-release-audit-public-efficiency-001/infrastructure-failure.json`，不得改写或复用。修复仅将 row directory
映射为 `rows/run-N`，以真实 prepare + shared reset 的 RED/GREEN 证明 ABI；新的 `measurement-*-r2.json` / `002` successor
重新从 0/36 冻结，显式 digest-bind 前驱失败并声明 reusedRows=0。

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

i18n 已留下 infrastructure-insensitive 的 static 质量负结果，Statistical Power 又留下 scorer-authority
measurement-invalid；继续串行新增案例的边际收益已经低于收敛现有流程。Phase 3B+ Stage B 已完成现有成果收口，
不再沿用旧的 **2--4 周** 估算。若用户另行批准 Stage C，reviewed method-freeze 与首个 untouched replication
预计需要 **5--8 个净工作日**；stronger-model full-auto、多模型族与 context 主实验是其后的独立、不确定阶段。
达到 spec 的完整跨 agent/OS/context/三模型族研究条件仍可能需要 **6--9 周以上**；新的 measurement-invalid 或
replication failure 必须作为结果保留，不能靠缩短验证或继续换案例绕过。

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
