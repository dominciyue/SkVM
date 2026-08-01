# Skill IR AOT 当前执行计划

**最后更新：** 2026-08-01

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
| API Tester | Re-entry admitted，旧 gate failure | 只开放新 method-development artifact；base IR/held-out 仍关闭。 |
| Method portfolio | 已机器化，readiness failed | 6 registered、4 studied、2 qualified、0 replication。 |
| Untouched replication | 尚未开始 | readiness 通过后选择并冻结。 |
| Token amortization | 尚无主证据 | 质量门槛通过后才算 break-even。 |
| 文档治理 | 本轮重建 | 8 份权威文档，删除重复阶段全文。 |

## 3. 关键阻塞

1. 当前 contract-qualified 方法案例只有 2 个，且通过 development gate 的 qualified phenotype 为 0。
2. Automation/adaptation 指标不完整，历史 Env/Law 仍有 benchmark-contract blocker。
3. API Tester 已允许以新身份进入方法开发，但还没有 source-audited base IR 或 schema-derived package。
4. Law held-out 回归说明 artifact 的 task-boundary 泛化仍不足。
5. Experimental Design 饱和与 API Tester 两臂均失败说明 task 区分度必须在优化前单独过门。
6. 本轮已将可再生成的 `run/qualification-work/artifacts/snapshots/plan/resource-probe` 默认 ignore，
   untracked result files 从约 3741 降到约 216；剩余 scored/raw/diagnostic 候选需逐项判断是否应提交，
   不能治理性删除。
7. 2026-08-01 全 benchmark suite 为 635 pass、4 skip、29 fail；失败集中在历史 lock 对
   `route-probe.ts`、`scoring.ts`、`real-agent-run.ts` 等 live implementation digest 的漂移。本轮未改这些
   文件，也不修改冻结 digest。新模块 focused tests 与 typecheck 全绿；后续需单独设计“冻结历史验证”
   与“当前 HEAD 回归”分层，不能用重写旧 lock 消除失败。

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

### Task 17.4 API Tester 方法开发下一刀

只有 Task 17.2/17.3 通过后执行：

1. 复用公开 OpenAPI oracle，设计 declarative `schema-derived-test-plan` artifact adapter；
2. 先做本地 compiler/checker activation，验证 protected input、determinism、alternative-valid 和 leak canary；
3. 冻结新的 development lock，系统为 `original | ir-static | validated-artifact` 或与当前 catalog 一致的
   三臂，不复用旧 Wave B identity；
4. dry-run、route/qualification 通过后执行唯一 development 矩阵；
5. 未过 gate 则冻结失败，不运行 held-out、不改 scorer；通过后也只计 method-development evidence。

### Task 17.5 扩充方法 Portfolio

优先候选按 phenotype 信息量选择，不按数量凑表：

1. `zh-code-reviewer`：判断/证据/严重度 schema；
2. `zh-readme`：事实抽取、模板、链接/命令验证；
3. 一个 license 已验证、与开发工具不同的真实 skill 作为第六起步案例。

每个案例先完成 provenance、公开任务合同和 benchmark audit，再决定是否付费。若新案例要求修改通用 core，
记录 `coreBranchDelta`；若只需 declarative adapter，则记录复用证据。

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
