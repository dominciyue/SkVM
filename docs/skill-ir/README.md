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
- 当前 readiness v7 登记 7 studied、7 contract-qualified、2 static-fidelity passed、0 untouched replication；
  API Tester 为 `quality-positive`，Env reviewed-AOT 为 `efficiency-positive`，因此 two-evidence gate 已通过。
  Component authority 同时重算出四类 automation candidate 均 7/7、authority-qualified 均 0/7，故唯一失败门仍是
  automation/adaptation convergence，overall readiness 仍 false。i18n v4 已排除 infrastructure blocker，但因
  1 个 paired quality regression 冻结为方法负结果。
- 通用 successor selection policy/report 已冻结全部 7 个候选并预先选择 Env Manager。首个 source-derived
  identity 虽以 8/8 canary 通过本地 audit，真实 resilient baseline 的 8/8 行、4/4 pair、0 transient/active/
  parser/runtime failure 暴露两项 scorer-authority 缺口：original 独有的合法 source resource 被误判为输入漂移，
  且标准 JSON Schema 被未公开的 `variables` 包装要求误拒。该身份已冻结 measurement-invalid；successor v3
  已公开两种 schema 表示等价，以 frozen initial manifest 作为 arm-neutral protection authority，并通过包含
  `LICENSE.upstream` materialization 的 8/8 canary。v4 baseline 已以 8/8 rows、4/4 pairs、0 infrastructure、
  original 4/4 vs no-skill 3/4 通过 admission；profile-empty base IR 与逐节点 source audit 已完成，corpus 晋升
  runnable。随后 static-fidelity 唯一矩阵 12/12、4/4 triplets、0 infra，三臂均 4/4、mean 1.0，static 对
  original 无回退；artifact 四臂唯一矩阵随后 16/16、4/4 quartets、0 infra，validated artifact 4/4、mean
  1.0、0 regression、runtime model tokens 0。该历史 artifact identity 因 construction/all-attempt missing 只支持
  fidelity；后续独立 readonly-serial prospective identity 已闭合 one-time 9358、4 x original 对 4 x reviewed-AOT
  的质量等价分母与 break-even=1，因而晋升 efficiency-positive。两者证据连续性由 authority v5/v7 显式保留；
  held-out 仍关闭。
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
- Task 18.28 已把 4 类结构 predicate 接到真实 workdir/artifact runtime。7 案例完成 33 次零付费执行，19 个实际
  声明 predicate 的 baseline 与预注册突变均符合预期，0 held-out、core branch delta 0；9 条手工 projection 中仅
  2 条 exact comparison 建立 execution parity，其余 `manual-stricter/domain-bundled` 不冒充语义等价。单个通用
  cross-artifact probe 为 pass/fail，但生产泛化和 semantic parity 仍为 `not-established`，package 仍不会生成任务
  产物，automation/readiness 不晋级。
- Task 18.29 已让同一 `source-field-projection` primitive 在 Experimental Design 与 i18n 的真实 workdir 生成
  3 个此前不存在的 JSON 文件、投影 3 个公开输入字段；两案 relation 均 baseline pass/mismatch fail，跨案 reuse
  gate 通过且 core branch delta 0。但 15 个字段/产物仍 unresolved，两个 package 均 validation-failure、手工
  checker 均 1/5，semantic parity 与完整 domain predicate parity 未建立，automatic eligibility 仍为 0/2。
- Task 18.30 又以不含值/gold/scorer 的 source/target JSON Pointer 声明，在同一两个真实 workdir 执行 3 次
  `copy-json-value`；baseline pass、突变 fail、protected input 不变，unresolved 15 -> 12。剩余 12 项中仅 1 个
  pointer、1 个 selector/lookup 可投影/查询，10 个需要 domain runtime，纯查询路线理论 floor=10；selector 未实现，
  package 仍 2/2 validation-failure、automatic eligibility 0/2。
- Task 18.31 已完成受限 Domain Plan 的 single-call 生成、确定性解释器、package/runtime 与双任务隔离合同。唯一
  Env/Law execute 为 2 logical paid attempts、0 retry/held-out/evaluator payload，但两案均在 plan 形成前落入首版
  `provider-or-parse` 合并分类；synthesis/transfer/eligibility 均 0/2。由于没有细分 HTTP/tool/JSON/schema 且失败
  usage/duration 不可用，当前只能冻结“未产出自动计划”，不能声称 domain 模型能力天花板。
- Task 18.32 的独立 transport qualification 用同 route/backend、同 forced-tool schema 与 strict parser 返回 canonical
  exact match：1 call、632 input/134 output、5.02 秒、0 retry/task/held-out/evaluator payload。它排除了持续工具合同
  不兼容，但不追溯重分类 18.31。当前自动化产品边界是“候选/结构/局部 projection 自动化 + domain runtime 人工
  审核或补齐”，portfolio automation 仍 0/7，readiness 不变。
- Task 18.33 仅为解释 18.31 的合并失败窄范围重开归因，不恢复 DSL/7-case rollout。预模型身份以 Env Manager
  单案例按 `context-minimal -> context-strict -> task-bound-strict` 逐级加入真实 source/declaration、完整 tool schema
  与双 task binding；真实执行 3/3 返回 schema-valid plan，合计 12,063 input / 3,545 output tokens、0 retry，最后
  计划通过 leakage 与双 task 静态 binding。它排除了持续 context/schema/task-binding blocker，但不追溯重分类
  18.31。随后零付费真实执行在两个 workdir 都因同一 text-template 类型错误停止，只生成 1/3 输出；初始输入均
  保持不变，另检出 3 个读取后未使用的接口值与 2 个未覆盖的 Vite 引用。因此 semantic parity/eligibility 仍未建立。
- Task 18.35 已用冻结 development evaluator 做真实 parity：Env baseline 0/6 -> post-plan 1/6、0/2 full task。
  Law 的唯一一次 strict task-bound 调用为 HTTP 200 且返回指定 tool call，但 arguments 被本地 plan schema 拒绝；
  按 1 call/0 retry 合同没有重放，也没有可安全执行的 Law plan。两案例聚合 `semanticParity=failed`，blocker 为
  `insufficient-distinct-skills | case-parity-failed | plan-unavailable`；停止扩 DSL，保留“自动候选 + 人工 domain
  runtime 审核/补齐”产品边界。
- 对 18.35 的复核发现 no-go 含通用工程污染：Env 两个 workdir 共享同一 static type 错且仅 1/3 output，Law 停在
  strict schema reject。Task 18.36 保留旧证据，以新 attempt 加入 typed-register tool schema 和全部 required-output
  prompt/gate；pre-model commit `2269296` 推送后唯一 1-call/0-retry 执行通过六门，两个真实 Env workdir 均 0 static
  issue、runtime complete、3/3 outputs 且 protected input 保持。真实 evaluator 为 `0/6 -> 3/6`、full task 0/2，
  因此工程污染已清除但 manual semantic parity 仍 failed，eligibility/readiness 不变。
- Task 18.36 因而是当前 restricted DSL 全自动路线的干净停止点，不再通过 selector/lookup/新 primitive 追数字。
  在该时间点 readiness 仍有两道独立 false：eligible phenotype 仅 1 个，automation 仍 7/7 incomplete。Task 18.37 只做半天、
  零付费 review-required 薄层并诚实记录人工 delta；研究主线随后以前瞻 Env reviewed efficiency 为候选，先补
  portfolio 证据权威绑定，再用固定 8 行质量/成本分母判断能否形成第二 phenotype。
- Optimization evidence authority successor 已完成且 0 付费：新 v4 overlay 只保存 digest-bound evidence reference，
  loader 实读 gate/cost 文件并重算分类与 completeness，readiness v5 内嵌逐案例 authority。存量复核确认 API
  Tester 的 quality-positive “1”保留，Env 仍为 fidelity-preserving；旧 portfolio v3/readiness v4 仅作不可变历史，
  当前 eligible phenotype 仍为 1，automation 与 two-evidence gate 仍 false。
- Task 18.37 已零付费完成真实 `automatic plan -> independent review patch -> frozen evaluator`：两个 fresh Env
  workdir 的 auto-only 为 3/6、reviewed 为 6/6，patch 125 LOC/8 humanMinutes，自动 plan digest 与 protected input
  均保持。它仍明确标为 `review-required`，不冒充 full automatic。
- 18.38 construction-source authority 已重算 one-time token mapping `9358/0/0` 且无 missing；随后冻结 8 行
  `2 tasks x 2 reps x (original | reviewed-aot)` 身份，并将 deterministic arm 在 fresh workdir dry-run 到 2/2。
  唯一 execution 固化 6/8 prefix 后，在第 7 行 paid original 已写 workdir、但 usage/envelope 尚未落盘时被外部任务
  中断。该行不能忽略或重试，v1 因 all-attempt 不完整冻结为 `interrupted-invalid-for-efficiency`。
- 用户选择的新 interruption-resilient successor 已完成 forced-controller qualification、O_EXCL 初始化、0/8
  freeze 和 pre-model push；随后唯一 `start` 启动 detached worker。第 1 个 original process 正常完成并留下完整
  usage（60913/4184/258048/0），但并发 `status` 并非只读：它在生产 run 目录重建 plan，递归删除 active case。
- 因此 row 1 scorer 缺 initial manifest 而变成 infrastructure-invalid，row 2 deterministic control 又因 task 文件被
  observer 删除而失败；journal 在 1/8 prefix、2 dispatch 处 fail closed。v2 不重试、不分类，新增 paid call 未授权；
  compact 证据为 `reviewed-aot-efficiency-resilient-observation-failure-v1.json`。这不是模型质量负例。
- 最后一次有界 successor 已改为语义化 `readonly-serial-001`，不是继续滚动 v3/v4。真实 4-row materialization 上，
  独立 holder 存在时 12 status + 12 collect 前后 41-entry active tree byte-identical；只读闭包外 import 与 builder/
  materializer/write API 均为 0。Foreground serial fake rows 2/2，prefix-commit 恢复与缺 terminal 停止均通过。
  新 0/8 policy/freeze 零付费生成并先行推送；随后唯一 foreground execute 已完成 8/8、0 retry、0 observer，4/4
  original/reviewed pairs 均为 1.0，0 infrastructure/hard-gate/regression。Original 4 次合计 202010 model tokens，
  reviewed-AOT 为 0；完整 production one-time cost 为 9358 tokens，机器派生 break-even=1。
- 新 v5 authority registry 不是覆盖旧 Env gate，而是同时 digest-bind 旧 fidelity evidence 与新的 prospective cost
  evidence。Readiness v6 现有 API quality-positive + Env efficiency-positive 两个 phenotype，two-evidence gate 已通过；
  但 reviewed patch 仍需 8 humanMinutes/125 LOC，7/7 `generatesIr=false`，所以 automation gate 与 overall readiness 仍
  failed。当前只证明本单模型/Windows/clean reviewed-AOT 切片的摊销 Token 节省，不能外推跨模型、agent 或 OS。
- 零付费 automation reachability authority 已完成：机器 gate 的直接输入是 7 案例四类 boolean、完整适配成本与
  首三/末三趋势，不含 domain parity；现行政策则要求 semantic sufficiency 才能晋升 flag。当前 schema 没有绑定这些
  证据，无引用 canary 可令 gate `false -> true`，所以不能直接攻当前 gate。四类 candidate 均为 7/7，但按政策
  authority-qualified 均为 0。薄声明为 15m/159 LOC；人时趋势通过而 declaration LOC 趋势失败。Phase 3A 仅在先建
  evidence-bound authority、冻结成本边界并前瞻测 7 例后 conditional-go；按当前产品边界收口的 Phase 3B 为 go。
- 用户选择 `3B+` 后，Task 18.39 Stage A 已完成 component-level authority。新 catalog 只绑定实现、现有 optimization
  authority、七份组件 report 与成本政策；readiness v7 不消费 base portfolio 的 automation/cost 自报值。同步 digest
  的攻击可令旧 evaluator 通过，却不能翻转 v7；未同步改动直接 digest-fail。当前四组件 candidate 仍是 7/7，
  authority-qualified 0/7，完整成本 0/7，five gates 为 `true/true/false/true/true`、overall false，0 paid/held-out/
  evaluator payload。Stage A 到此停止，等待用户确认 Stage B；这不是 7-case qualification 或 full-auto 正例。
- 用户确认继续后，Task 18.40 Stage B 已把现有成果收敛为“machine-verifiable evidence-authority、review-required
  verified skill artifact packaging”。Spec 现含 C1--C6 claim-authority matrix 与论文骨架：API quality-positive、
  Env efficiency-positive/break-even=1 是正向结果；7/7 candidate 对 0/7 qualification、Env automatic 3/6 对
  reviewed 6/6 是自动化与产品边界。Stage B 本身 0 paid/held-out/evaluator payload，不授权 Stage C。
- Phase E0/E1 与仓内 E2 受控探针已完成。用户确认的 B-default + A-optional 已落到一条共享产品链；B 的 digest-bound 用户
  验收只支持“在用户认可质量前提下的 token 节省”，不得进入 research `efficiency-positive`；A 的薄 checker 只取得
  authority-review 资格。Env E1 在 evaluator-free 产品视图复现 token break-even=1；新 package-inventory 探针两次全链
  artifact/output closure 相同，但 automatic candidate 仍 non-executable、semantic parity 未建立，且无 original token 分母，
  所以 break-even 为 not-computable。Task 18.41 又在同一主链持久化 Env A：machine-checked 3/3、当前 0 paid，复用
	  digest-bound 历史分母得到 original `50502.5` token/run、artifact `0`、one-time `9358`、break-even `1`，只取得
	  authority-review 资格。Task 18.42 新增的两个 collection 原语已在 package-inventory/API Tester 真实 workdir 复用；
	  cross-field count 仍未实现。Apache Magpie Step 1 已完成零执行评估：公开 prompt 可冻结，但上游 harness 没有 token usage，
	  后续必须用 project Pi 建新 baseline identity。Task 18.43 已精确导入固定提交的 31 个 blob；独立 checker baseline 9/9、
	  mutation 6/6 fail，reviewed artifact 真实 workdir 9/9、coreBranchDelta=0。两个已推送的 project-Pi identity 都在 row 1
	  模型进程 spawn 前因 control-plane 失败，均为 0 prefix/model/API/paid；所以 original baseline、质量对照、token 分母和
	  break-even 仍未建立，不能把 deterministic qualification 冒充 external efficiency。

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
-> Env Manager 历史全成本审计已完成：旧 missing 不补零；后续 readonly-serial prospective identity 已闭合 break-even=1
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
-> source-only、薄声明 candidate 与封闭结构 runtime 已完成；7 案例 33 次执行、两条 exact parity，0 paid
-> 首个 output primitive 已跨两案例生成部分产物；3 fields generated、15 unresolved、0/2 automatic eligible
-> JSON Pointer successor 已真实复制 3 fields；15 -> 12，ceiling=pointer 1/query 1/domain-runtime 10
-> Restricted Domain Plan 唯一双案例生成 0/2；2 calls/0 retry，但 provider-vs-parse 归因未建立
-> forced-tool transport qualification exact-match passed；不重分类历史 18.31
-> Task 18.33 progressive bisection 3/3 通过并产生安全计划；0 retry，不重分类历史 18.31
-> Task 18.34 已在两个真实 workdir 零付费执行：0/2 runtime complete、protected 2/2、每案仅 1/3 输出
-> 新增通用静态数据流类型门，能在 runtime 前拒绝该数组到 text-template 的必错流；不修改冻结 18.33 closure
-> Task 18.35 已真实运行 Env manual evaluator：baseline 0/6 -> post-plan 1/6，distance-to-full 5，case parity failed
-> Law 唯一 strict generation 已执行：1 call/0 retry，HTTP 200/tool call 可用，但本地 plan-schema strict reject
-> 跨 skill semantic parity failed：只评估 1/2 case、0/2 full pass；按 no-go 停止扩 DSL/7-case/held-out
-> Task 18.36 Env 通用修复完成：1 paid/0 retry，六门全过、2/2 runtime、每案 3/3 outputs，真实 parity 3/6 failed
-> 清洁计划仍漏掉 Vite `import.meta.env` 语义并不能生成逐变量 example/schema rules；eligibility/readiness 不成立
-> optimization evidence authority v5 已完成：实读+验 digest+重算；API quality-positive 保留，Env fidelity 不变
-> Task 18.37 已完成：独立 patch 后 6/6，125 LOC/8 minutes；auto-only 3/6 与 reviewed 分账，仍非 automatic
-> Task 18.38 构造成本前置与 8-row freeze 已完成：9358/0/0、missing=[]、deterministic dry-run 2/2
-> 唯一 execution 停在 6/8；第 7 行 paid side effect 存在但 usage authority 缺失，v1 不续跑、不回填、不分类
-> 新 0/8 identity 已完成 durable journal、forced-controller qualification、policy/freeze 与 0-paid plan
-> 唯一 start 因 status 观测污染停在 1/8；v2 不续跑，未来 identity 必须让 status/collect 完全不 materialize
-> final readonly-serial identity 已完成 8/8、4/4 quality parity、0 infra/retry/observer；Env efficiency-positive
-> authority v5 显式保留旧 Env gate 并绑定新 cost evidence；readiness v6 two-evidence=true、automation=false、overall=false
-> Phase 2 reachability 已完成：直接 gate 不含 domain parity，但 flag 晋升政策要求语义资格；当前字段无证据绑定
-> 四类 candidate 均 7/7、authority-qualified 均 0；成本趋势依赖是否把 declaration LOC 计入用户投入
-> Phase 3B+ Stage A 已完成：component authority/readiness v7 机器证明 automation=false，自报字段攻击不可翻转
-> Phase 3B+ Stage B 已完成证据整合：C1--C6 claim matrix、review-required proposition 与论文骨架已冻结
-> Phase E0 已完成；用户确认 B-default+A-optional，四条 receipt/claim/cost/共享主链红线已同步
-> E1 已用 Env evaluator-free vertical slice 跑通 compile -> review/accept -> package -> run -> cost，产品 token break-even=1
-> E2 package-inventory 仓内新 skill 双运行完成：closure 确定，自动语义/package 与原始 token 分母仍缺
-> Task 18.41 Env A 产品闭包完成：machine-checked 3/3、0 paid、50502.5 -> 0 token/run、break-even=1
-> DSL 只读 gate：object-key enumeration 与 sort/dedup 有 multi-case 证据；宽泛 cross-field count 暂不实施
-> Task 18.42 已实现两个窄 collection 原语；双真实 workdir 通过，patch 58 -> 44 LOC，但总 adapter 111 -> 119 LOC
-> Magpie Step 2 固定 public slice 已完成：31 exact blobs、checker 9/9、mutation 6/6、artifact 9/9、287 adapter LOC
-> project-Pi 001 因 row-01/run-N ABI 在 spawn 前失败；r2 修复后 002 又因 Windows 无法 uv_spawn 字面 bun 失败
-> 两个身份均 0 prefix/model/API/paid；按止损不建第三身份，先决定是否治理共享 executable resolution 再恢复 external baseline
-> 只有完整 readiness，或显式批准且不伪装成 full-auto 的 reviewed method-freeze gate，才进入 untouched replication
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
