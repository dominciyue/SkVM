# Skill IR AOT 当前执行计划

**最后更新：** 2026-08-02

本文件只记录当前 ledger、执行顺序与活跃 TDD。已完成阶段的过程见 `history.md` 和 Git history；组件
行为见对应权威文档；数值见 `experiment-results.md`。

## 1. 当前执行窗口

Task 16.21 Experimental Design 按饱和停止规则关闭。Task 16.22 API Tester 完成冻结 baseline，因两个
development task 都没有 original full success 而 gate failed；base IR 和 held-out 均未放行。旧结果不
改判。下一阶段采用 prospective partial-benefit re-entry，把 API Tester 作为 method-development case，
另选 untouched real skill 承担 replication。

当前顺序：

```text
现状与结果 ledger 对齐
-> 文档/数据/本地结果边界治理
-> partial-benefit re-entry policy
-> method portfolio registry + readiness evaluator
-> API Tester schema-derived artifact development
-> 扩充信息互补的方法案例，至少 6 个起步
-> readiness gate
-> untouched replication
-> 固定三模型族、context 与摊销成本主实验
```

本窗口禁止新增 runtime、transport 或 artifact catalog 版本。优先复用现有 Pi harness、runner、scoring、
gate、validated artifact catalog 和 OpenAPI oracle。旧 lock/package/result 维持原路径与 digest。

## 2. 当前 Ledger

| Workstream | 状态 | 结论或下一步 |
|---|---|---|
| IR schema/parser/validator/profiler/passes/lowering | 完成 | 保持回归测试。 |
| Synthetic corpus | 完成，低权重 | 仅作 calibration 与受控失败。 |
| Runner/scorer/pairing/persistent workdir | 完成 | Stable Pi 已有 0-infra 矩阵。 |
| Benchmark v2 measurement contract | 完成 | 42/42 differential、36/36 materialization。 |
| Env-manager | 冻结 gate failure | 3 个 pair 0.90->1.00；完整分母含 1 infra。 |
| Law-to-markdown | 冻结 held-out failure | Development 4/4；held-out 2/4 且 2 regression。 |
| Experimental-design | 饱和关闭 | 两批与 skill-unique slice 均 4/4 vs 4/4。 |
| API Tester | 新 development gate passed | 16/16、artifact 4/4、mean 1.0；只计 method-development。 |
| Method portfolio | 已机器化，readiness failed | 6 registered、5 studied、3 qualified、1 passed phenotype、0 replication。 |
| Untouched replication | 尚未开始 | readiness 通过后选择并冻结。 |
| Token amortization | 尚无主证据 | 质量门槛通过后才算 break-even。 |
| 文档治理 | 本轮重建 | 8 份权威文档，删除重复阶段全文。 |

## 3. 关键阻塞

1. 当前 contract-qualified 方法案例有 3 个，仍缺 3 个；通过 development gate 的 phenotype 只有 1 个。
2. Automation/adaptation 指标不完整，历史 Env/Law 仍有 benchmark-contract blocker。
3. API Tester 的 schema-derived package 已通过冻结 development gate；下一缺口是更多信息互补、合同合格
   的方法案例和自动化/适配成本数据。
4. Law held-out 回归说明 artifact 的 task-boundary 泛化仍不足。
5. Experimental Design 饱和与 API Tester 两臂均失败说明 task 区分度必须在优化前单独过门。
6. 本轮已将可再生成的 `run/qualification-work/artifacts/snapshots/plan/resource-probe` 默认 ignore，
   untracked result files 从约 3741 降到约 216；剩余 scored/raw/diagnostic 候选需逐项判断是否应提交，
   不能治理性删除。
7. 2026-08-02 在 `zh-code-reviewer` 注册前，全 benchmark suite 为 639 pass、4 skip、36 fail；注册后为
   651 pass、4 skip、39 fail。原 36 个失败集中在历史 lock 对 `route-probe.ts`、`scoring.ts`、
   `real-agent-run.ts` 等 live implementation digest 的漂移，以及旧 API calibration 固定的 corpus lifecycle
   与当前 registry 状态冲突。新增 3 个失败来自旧 API Tester artifact lock 对整个 `pilot.json` 和 evaluator
   registry 的冻结：本轮加入真实 skill 与 scorer 必然改变这两个当前 HEAD 入口。旧 lock 仍不可修改，
   reviewer focused tests 与 typecheck 全绿；后续需单独设计“冻结历史验证”与“当前 HEAD 回归”分层，不能
   用重写旧 lock、撤销新注册或回退当前 corpus 消除失败。

## 4. 已冻结边界

- v1 benchmark、Env V1-V4、Law development/held-out、Experimental Design 与 API Tester 的 task、scorer、
  audit、lock、package 和 compact result 不原地修改。
- Held-out 不参与 admission、compiler、repair 或 development gate。
- Runtime validator 不是 scorer；最终 workdir 的确定性 scorer 是成功权威。
- API Tester 旧 baseline 不重新解释为 pass，也不计入 untouched replication。
- 付费实验需先通过 lock validation、contract/materialization audit、dry-run、qualification；`retries=0`。
- 通用 core 禁止 skill-id branch。Skill 差异只进入声明式 contract/adapter/artifact。

## 5. 活跃文件级 TDD：Task 17

### Task 17.1 文档与数据角色治理（完成）

**文件**

- `docs/skill-ir/*.md`
- `benchmarks/skill-ir/corpus/corpora/pilot.json`
- `benchmarks/skill-ir/corpus/real-skill-intake.json`
- `.gitignore`
- `src/benchmarks/skill-ir/corpus-registry.test.ts`

**步骤**

1. 先增加失败断言：API Tester 是 method-development candidate，不能是 untouched replication/main-real；
   scope 使用 method portfolio/readiness，不再使用固定 3+3 作为当前目标。
2. 修改 corpus/intake 元数据并保持旧 calibration lock 可验证。
3. 把文档收敛为 README、spec、plan、IR、evaluation、optimization、pilots、results、history；related-work
   并入 spec 后删除。
4. `.gitignore` 只屏蔽可再生成的 raw run/workdir/qualification 噪声，不屏蔽 compact evidence；不删除现有数据。
5. 运行 corpus test、链接检查和 `git diff --check`。

### Task 17.2 Prospective Partial-benefit Re-entry（完成）

**新文件**

- `src/benchmarks/skill-ir/partial-benefit-reentry.ts`
- `src/benchmarks/skill-ir/partial-benefit-reentry.test.ts`
- `benchmarks/skill-ir/corpus/partial-benefit-reentry/api-tester-v1.json`

**合同**

- schema version 为 `skill-ir-partial-benefit-reentry/v1`；
- 输入绑定旧 compact gate report 的 path+digest，输出只决定能否以新 identity 进入 method-development；
- admission 要求完整 rows/pairs、0 infrastructure、至少 1 differing pair、至少 1 original-positive pair、
  original mean > no-skill mean，并声明 source-attributable residual；
- 原 gate 仍为 failed，`createsBaseIr=false`、`permitsHeldOut=false`、`untouchedReplication=false`；
- 禁止 expected/gold/heldout/raw model/secret/绝对路径字段。

**TDD**

1. 测试拒绝缺行、infra、无差异、无 original 局部改善、digest drift 和禁用字段。
2. 测试 API Tester 冻结 gate report 满足 admission，但不改变旧 `passed=false`。
3. 实现 schema、digest validator 和可审计 decision report。

### Task 17.3 Method Portfolio Registry 与 Readiness（完成，gate failed）

**新文件**

- `src/benchmarks/skill-ir/method-portfolio.ts`
- `src/benchmarks/skill-ir/method-portfolio.test.ts`
- `benchmarks/skill-ir/corpus/method-portfolio.json`
- `results/skill-ir/method-portfolio-readiness.json`

**合同**

- 每个 case 记录 provenance、phenotype、studied/contract-qualified/replication 角色、benchmark audit、
  development gate、humanMinutes、adapterLoc、artifactKinds、coreBranchDelta、unautomatedSteps 和 blockers；
- 同一 upstream skill 的 benchmark 版本只能算一个 case；
- readiness 严格实现 spec 五条件，返回每项 gate、计数、缺失 phenotype 和 blocker；
- API Tester 只有 re-entry policy 通过后才能进入 method-development，仍不自动 contract-qualified；
- 当前报告预期 `passed=false`，不得伪造 6 个已合格案例。

**TDD**

1. 失败测试覆盖重复 skill、角色冲突、负数成本、非法 `coreBranchDelta` 和虚假 replication。
2. 构造最小 6-case fixture 验证五个 gate 的独立失败/通过。
3. 读取真实 registry，生成 compact readiness report。

### Task 17.4 API Tester 方法开发（完成，development gate passed）

只有 Task 17.2/17.3 通过后执行：

**文件**

- 新建 `benchmarks/skill-ir/pilots/api-tester/base-ir.json`
- 新建 `benchmarks/skill-ir/pilots/api-tester/base-ir-source-audit.json`
- 新建 `benchmarks/skill-ir/pilots/api-tester/artifact-adapter.json`
- 新建 `src/benchmarks/skill-ir/api-tester-artifact-compiler.ts`
- 新建 `src/benchmarks/skill-ir/api-tester-artifact-compiler.test.ts`
- 新建 `src/benchmarks/skill-ir/api-tester-artifact-activation.test.ts`
- 新建 `src/benchmarks/skill-ir/api-tester-artifact-development.ts`
- 新建 `src/benchmarks/skill-ir/api-tester-artifact-development.test.ts`
- 新建 `src/benchmarks/skill-ir/api-tester-artifact-development-run.ts`
- 新建 `benchmarks/skill-ir/pilots/api-tester/api-tester-artifact-development-lock.json`

**设计合同**

1. 复用 `validated-skill-artifact/v1`、`runValidatedArtifactPlan`、公开 OpenAPI oracle 与现有 deterministic
   scorer，不新增 runtime、transport 或 catalog 版本。
2. Adapter 只声明公开输出合同、case generation policy 和两个输入变体：`api/openapi.yaml` 与
   `api/openapi.json`。编译器按变体生成同 catalog package；差异只在 protected input/path config，禁止
   task-id/core branch。
3. Base IR 只映射 exact `SKILL.md`、development prompt、public interface 与 resource contract；profile
   为空，source audit 显式排除 evaluator payload、held-out、runtime output 与 profile feedback。
4. Package 固化 bundled offline OpenAPI parser、deterministic generator、semantic checker、schema、tool plan、
   validation notes 和 base IR。Generator 必须支持公开 `node api-test-generator.mjs --input ... --out ...`
   CLI；runtime process 负责生成三项 exact outputs，checker 独立从 protected OpenAPI 重建公开语义。
5. Compiler 输出 byte-for-byte deterministic；额外 evaluator/gold/heldout/raw-model/secret canary 不得进入
   package。删除公开 schema constraint 时，对应生成 case 必须消失或变化，形成 reverse-evidence。

**TDD 与实验顺序**

1. [x] RED：测试 base IR/source audit 缺失，compiler import/compile、双变体 protected input、determinism、
   canary isolation 和 reverse-evidence 尚未成立。
2. [x] GREEN：补 profile-empty base IR/source audit、严格 adapter schema 和最小 compiler；两变体均通过 package
   validation。
3. [x] Activation：对两个 development fixture 运行 resource probe 与通用 runtime，断言 protected digest
   不变、runtime validation pass、model tokens 为 0、deterministic scorer full pass。
4. [x] Activation 与现有 contract/materialization audit 全绿后冻结新的 development lock；系统固定为
   `no-skill | original | ir-static | validated-artifact`，2 task x 2 repetitions 共 4 个完整 quartet，
   不复用旧 Wave B identity。Artifact row 由 task fixture 的公开 OpenAPI 路径确定 package variant。
5. [x] 新编排层只复用现有 Pi source runner、deterministic scorer、validated artifact runtime 与 frozen
   benchmark guard；不修改旧 Law/API lock 绑定的实现，也不新增 runtime/catalog 版本。
6. [x] Lock 在付费前固定模型、adapter、task、repetitions、双 package digest、实现 digest 和数值 gate；gate
   要求 16/16 完整、0 infrastructure、artifact 4/4 success、均值及逐 task 均值 >= 0.85、无 hard-gate
   failure，且相对 `max(original, ir-static)` 无 pairwise regression。
7. [x] Lock validation、dry-run、resource probe、Pi/route qualification 通过后执行唯一 development 矩阵，
   `retries=0`。
   实际结果 16/16、0 infra、artifact 4/4、mean 1.0、0 regression，gate passed；只计
   method-development evidence，不运行 held-out、不改 scorer。

### Task 17.5 扩充方法 Portfolio

优先候选按 phenotype 信息量选择，不按数量凑表：

1. `zh-code-reviewer`：判断/证据/严重度 schema；
2. `zh-readme`：事实抽取、模板、链接/命令验证；
3. 一个 license 已验证、与开发工具不同的真实 skill 作为第六起步案例。

每个案例先完成 provenance、公开任务合同和 benchmark audit，再决定是否付费。若新案例要求修改通用 core，
记录 `coreBranchDelta`；若只需 declarative adapter，则记录复用证据。

#### Task 17.5.1 `zh-code-reviewer` benchmark 竖切

**冻结边界**

- [x] 将 upstream commit `1e221579b0504082d25d5548b194399a7785f10f` 的 exact `SKILL.md` 与 MIT
  license 写入 `benchmarks/skill-ir/pilots/zh-code-reviewer/source/`，记录原始与提交后 digest；
- [x] 提交公开 `review-interface.json`、无网络/无安装的 resource contract、2 development + 2 held-out
  源码 fixture 和 `task-split-freeze.json`；held-out 在 scorer 前冻结，development 禁止读取 held-out 内容；
- [x] portfolio 角色改为 `method-development`，不再把本案例计为 untouched replication candidate。

**文件级 TDD**

1. [x] RED `src/benchmarks/skill-ir/zh-code-reviewer-contract.test.ts`：先覆盖 source closure、公开 interface、
   2+2 preregistered construction、gold/heldout/network canary 和 freeze drift；
2. [x] GREEN `src/benchmarks/skill-ir/zh-code-reviewer-contract.ts`：实现严格 schema、task builder、source/freeze
   validation；只暴露输出 ABI、严重度语义和 evidence location 结构；
3. [x] RED/GREEN `src/benchmarks/skill-ir/zh-code-reviewer-oracle.test.ts` 与
   `zh-code-reviewer-oracle.ts`：从 agent 可见源码推导 confirmed finding，删除问题模式后约束消失，未知
   模式返回 `unconfirmed`；
4. [x] RED/GREEN `src/bench/evaluators/zh-code-reviewer-grade.test.ts` 与 `zh-code-reviewer-grade.ts`：实现
   protected source/产物、evidence coverage、severity calibration、actionability、双报告一致性五项确定性检查，
   并在 evaluator barrel 注册 identity 与 digest；
5. [x] RED/GREEN `src/benchmarks/skill-ir/zh-code-reviewer-contract-audit.test.ts` 与实现：至少覆盖两种
   alternative-valid positive、漏 finding、错锚点、降 severity、输入污染、报告矛盾、gold/heldout/path canary
   和真实 materialized workdir；输出 compact development audit；
6. [x] v2 Audit 已 20/20 全绿；复用现有 direct Node Pi short-path execution contract，冻结
   `no-skill | original` development calibration lock，完成 dry-run、route/Pi qualification、`retries=0`
   的唯一付费执行与 deterministic gate。旧 bare-agent pre-IR lock 未进入付费路径；本轮只成立
   measurement-valid distinguishability 与 base IR/source audit admission，不成立 IR 优化、held-out 或跨 skill
   claim。

**付费前冻结的 gate：** `8/8 rows`、`4/4 pairs`、`0 infra`、no-skill 非饱和、`differingPairs >= 1`、
`positivePairs >= 1`、`originalSuccesses >= 1`、`originalMean >= noSkillMean`。模型固定
`xty/gpt-5.6-sol`，Pi `0.67.68` managed direct Node short-path，Windows/clean、2 repetitions、`retries=0`；
qualification 只跑一个预注册 original row 并要求两个 exact outputs、无 harness residue。

**v1 执行后审计（冻结失败证据）：** 8/8、0 infra、original 4/4 mean 1.0、no-skill 3/4 mean 0.75，
数值 gate passed；唯一 differing/positive pair 的 no-skill 报告使用结构化 `summary`，公开 interface 未限制
该字段类型，但 scorer 私有要求 string，导致 5 criteria false reject。故 v1 measurement invalid，禁止 base IR、
重评分和同 identity 补跑。先提交 v1 lock/gate/scored/validity，再以 v2 identity 增加 structured-summary
positive canary、修 scorer/audit、重新冻结后执行。

**v2 执行结果：** structured-summary 正例与反向测试纳入 20/20 audit，锁、scorer、audit 和输出目录全部
换用 v2 identity。资格探测通过后，唯一 8 行矩阵得到 8/8、4/4 pairs、0 infra；original 4/4 mean 1.0，
no-skill 3/4 mean 0.75，1 differing/positive pair，数值 gate passed。失败审计确认 no-skill 行的两个报告
语义合法，但工作目录多出 `NUL`，违反 prompt 与公开 `exactOutputSet=true`，不存在新的私有 schema false
reject。因此 measurement 有效并允许进入 base IR/source audit；该差异仍不构成因果优化证据，held-out 保持
关闭。下一刀先做 source-audited profile-empty base IR，判断 exact-output residual 是否能由公开 skill 语义表达；
无法映射时不得把随机执行差异硬编码进 IR。

本竖切不得修改通用 runtime/catalog identity。第一阶段只证明 benchmark measurement contract，不声称 skill
优化、held-out、跨模型或 Token 收益。

#### Task 17.5.2 `zh-code-reviewer` base IR 与静态保真

**冻结设计**

- [x] 生成 profile-empty `base-ir.json` 和逐节点 `base-ir-source-audit.json`；证据只来自 exact source、
  development 用户可见 prompt、公开 review interface 与 resource contract；
- [x] 将 corpus 从 `tasks-authored` 晋升为 `runnable`，登记 `irPath/sourceAuditPath`，不改变 held-out、scorer
  或 v2 calibration 历史结果；
- [x] 复用 v2 已验证的 `xty/gpt-5.6-sol`、Pi `0.67.68` managed direct Node short-path、Windows/clean 身份，
  固定 `no-skill | original | ir-static`、2 tasks x 2 repetitions、12 rows/4 triplets、`retries=0`；
- [x] 门禁在付费前固定为 static fidelity：12/12、4/4、0 infra、ir-static 4/4、mean 1.0、0 hard-gate
  regression、0 negative-score pair；由于 original 已冻结为 4/4，`minimumImprovedPairs=0`，不以零改善否决
  保真，也不将保真通过写成优化成功；
- [x] gate 通过只开放 typed residual audit，held-out、dynamic repair、artifact promotion、scorer retuning 和
  main claim 均保持关闭。

**文件级 TDD**

1. [x] RED `src/skill-ir/corpus-fixtures.test.ts`：要求 reviewer 为 runnable、base IR profile 为空、schema 与
   source audit 全绿，并加入 held-out/evaluator/oracle/runtime residual 泄漏 canary；
2. [x] GREEN 新建 `benchmarks/skill-ir/pilots/zh-code-reviewer/base-ir.json`、
   `base-ir-source-audit.json`，更新 `pilot.json`；exact-output 规则只映射公开 output policy，不写入 `NUL`
   或任何单次运行残差；
3. [x] RED/GREEN 扩展通用 `static-development`：保持 v1 law lock 兼容，声明式支持已冻结 Pi managed
   short-path 与 static-fidelity gate；禁止新增 runtime/catalog 版本或 skill-id core branch；
4. [x] 新建 reviewer static lock，冻结 source/tasks/public interface/resource/scorer/base IR/source audit、
   Pi harness 和数值 gate；完成 lock validation、dry-run、resource probe、route qualification；
5. [x] 执行唯一 `retries=0` development 矩阵，确定性评分并生成 compact gate/failure audit；未过门则不补跑、
   不调 scorer、不运行 held-out；
6. [x] 同步 evaluation、pilots、results、portfolio 与 conversation log，运行 focused/full tests、typecheck、
   文档链接和 diff check 后提交。

#### Task 17.6 `zh-readme` repository-fact benchmark 竖切

**冻结设计**

- [x] 将 upstream commit `1e221579b0504082d25d5548b194399a7785f10f` 的 exact `skills/zh-readme/SKILL.md`
  与 MIT license 固定到 pilot；把案例从 untouched candidate 改为第 6 个 method-development case，未来
  replication 另选未参与方法设计的新 skill；
- [x] 冻结 `readme-interface.json`、离线 resource contract、2 development + 2 held-out 仓库 fixture 和
  `task-split-freeze.json`；held-out 必须在 scorer 前冻结且不进入 development audit；
- [x] scorer 只从 agent 可见仓库事实推导命令、路径、license、链接和核心说明；章节名称/顺序/措辞可变，
  社会证明、badge 与视觉营销不进 hard gate；
- [x] 首轮只完成 benchmark contract 和 materialization audit。Audit 通过后才冻结同一强模型/Pi/Windows
  `no-skill | original` development calibration；base IR、artifact、held-out 与 optimization claim 保持关闭。

**文件级 TDD**

1. [x] RED `zh-readme-contract.test.ts`：source closure、公开 interface、2+2 builder、split freeze、禁止
   gold/heldout/network/package-install；GREEN 实现合同并提交冻结 fixture；
2. [x] RED/GREEN `zh-readme-oracle.test.ts`：从 Node 与 Python 仓库派生项目名、命令、真实路径、license 和
   URL；删除 manifest 字段后约束消失，无证据返回 `unconfirmed`；
3. [x] RED/GREEN `zh-readme-grade.test.ts`：protected input/exact output、中文结构、命令、路径/链接与事实
   五类确定性检查；接受 alternative-valid 标题/顺序/中文措辞，拒绝虚构事实与输入污染；
4. [x] RED/GREEN `zh-readme-contract-audit.test.ts`：两种以上 positive、缺事实、假命令、假 URL/路径、
   license 错误、英文空壳、输入污染、额外文件、gold/heldout/path canary 和真实 materialization；输出 compact
   development audit；
5. [x] Audit 通过后更新 corpus/intake/portfolio，记录人工适配、`coreBranchDelta` 和 blockers；未通过时不
   调模型，不修改 scorer 迎合输出；
6. [ ] 若 measurement 合格，冻结 direct Pi `no-skill | original` lock、数值 gate、dry-run、resource/route
   qualification 与唯一 `retries=0` development 执行；未过门则不补跑、不构造 IR；
7. [ ] 同步 evaluation、pilots、results、conversation log，运行 focused/full tests、typecheck、链接与 diff
   check 后提交。

## 6. 验证与实验门禁

每个实现阶段至少运行：

```powershell
bun test <focused tests>
bun test ./src/benchmarks/skill-ir
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py --root .
git diff --check
```

付费前顺序：

```text
schema/contract tests
-> source + task split freeze
-> differential + leak + materialization audit
-> lock commit/digest validation
-> dry-run
-> resource/route probe
-> qualification
-> unique retries=0 execution
-> deterministic scoring + gate
-> compact evidence commit
```

## 7. 完成定义

本阶段在以下条件满足时关闭：

- corpus 与 intake 角色一致；
- re-entry policy 和 portfolio readiness 有 schema、tests、真实 report；
- 文档链接无断裂，默认入口不再要求读取历史巨文档；
- 本地结果边界清楚且 `git status` 不再被可再生成 workdir 淹没；
- API Tester 新方法开发至少完成本地 artifact activation；若付费门禁成熟则完成冻结 development，
  否则明确停在可复现 blocker；
- conversation log 与 Git commit 留痕完整。
