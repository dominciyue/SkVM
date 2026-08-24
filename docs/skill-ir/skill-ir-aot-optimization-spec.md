# Skill IR AOT 优化研究契约

**最后更新：** 2026-08-23

## 1. 项目定位

本项目把 Skill IR 作为 SkVM AOT 编译链中的语义表示和优化 pass。系统从有来源的自然语言 skill
提取流程、规则、工具需求、环境假设、运行时检查和恢复策略，经静态分析与 development execution
feedback 生成可验证、可执行、可复用的 skill artifact。

北向研究问题是：同一 skill 在不同模型、agent、环境和上下文中表现不稳时，能否用一份
provenance-bound 编译产物提高成功率或最差表现并控制回归；在质量合同可比时，能否降低重复调用的
摊销 Token。

### 1.1 两条同等优先的主轴

1. **研究可信度：** 公开测量合同、确定性 scorer、development/held-out 隔离、完整分母、
   infrastructure/semantic 分离和可复现 provenance。
2. **通用优化系统：** 通用 core 接收不同真实 skill，自动生成 IR、validation plan 和 package，
   不按 skill id 写死分支。

显著正向单案例优先级较低。不得为漂亮结果放宽 scorer、回流 held-out 或隐藏回归；也不得只增加
benchmark/governance 而不推进 compiler、artifact 和 intake 自动化。

### 1.2 用户与交付边界

最终用户提供 source/resource、允许的工具环境和可选代表性任务。系统负责 intake、静态分析、声明式
适配、artifact 编译、分层验证和有界动态反馈。只有低置信度语义、资源/权限缺失、证据冲突、预算升级
或质量回归时请求用户审核。

交付入口是同一 core 的三种视图：

- CLI：`import / optimize / validate / report`，也是现场演示主入口；
- TypeScript library：供 SkVM 与其他 agent 集成；
- Optimizer Agent：编排相同 API，不维护另一套优化逻辑。

最终成果由研究论文/技术报告、可复现仓库和 CLI 演示组成；向学校仓库提 PR 是附加成果。

## 2. Claim 与成功判定

当前完整研究 claim 是：对一组有明确来源的真实 skill，将原文编译为静态 Skill IR，再使用
development execution feedback 生成 Final IR / artifact candidate；在 disjoint held-out 上比较
`no-skill | original | ir-static | optimized`，评估质量、稳定性、回归和成本。

这是一项目标，不是当前已证实结论。三类问题必须分开：

1. **测量有效性：** benchmark 是否只检查公开、agent 可见、可追溯要求；
2. **优化有效性：** IR/artifact 是否改善最终 workdir；
3. **方法泛化：** 冻结 core/catalog 能否在未参与方法设计的真实 skill 上复现。

### 2.1 优化硬门槛

优化成功不能由单一加权分数决定。所有主张先满足：

1. 相对 exact original，聚合成功率和平均质量至少不劣；
2. 预注册稳定性指标至少一项改善，例如 worst-slice、失败率或跨条件离散度；
3. 逐样本负向 pair 与 hard-gate regression 不超过冻结上限，并完整披露；
4. infrastructure failure 单列且保留在预注册分母中；
5. development gate 通过前不消费 held-out，held-out 失败后不回流原产物。

### 2.2 质量通过后的双目标

在硬门槛通过后，同时优化平均质量和重复调用摊销 Token。成本必须拆分：

```text
total_original(N)  = original_runtime_cost * N
total_optimized(N) = compile_cost + profile_cost + package_cost
                   + optimized_runtime_cost * N
```

至少报告 `N=1,2,5,10` 与 break-even `N*`。通过减少输出、跳过验证或降低模型质量得到的 Token
下降不计为正向结果。

## 3. 系统与实验边界

完整主表固定为：

```text
no-skill | original | ir-static | ir-pgo or validated-artifact
```

冷启动默认只调度：

```text
no-skill | original | ir-static
```

`ir-pgo` 不进入默认矩阵。只有 Final IR provenance 和冻结 development gate 通过后，才允许以
held-out consumption identity 执行。旧 `ir-only`、`ir-profile`、`skvm-aot` 等只保留为历史/显式
ablation，不能制造看似完整但没有真实实现的主表。

当前真实已测轴：真实 skill、Windows、clean context、Pi 或 bare-agent、GPT 路由；不同项目阶段覆盖面
不同，详见 evidence ledger。计划轴包括固定三模型族、noisy/long context、第二 harness 与真实
Linux/macOS。标签不能替代真实执行环境证据。

## 4. 真实 Skill Portfolio

早期 `Wave A/Wave B` 只保留为历史标签。当前证据角色改为：

```text
studied
contract-qualified method-development
untouched replication
```

历史方法案例是 `env-manager`、`law-to-markdown`、`experimental-design`；API Tester 的冻结 Wave B
baseline 不改判，但后续可通过新 prospective policy 转为 method-development。它不再承担 untouched
replication。`zh-code-reviewer` 从 2026-08-02 起进入 method-development，用于检验判断/证据/严重度
phenotype；因此不再承担 untouched replication。`zh-readme` 等只有在未参与 core/catalog 调整且重新
冻结后，才可能承担 replication。

2026-08-09 起，历史 `measurement-invalid` 结果继续保留原文件、原数值和原结论，但不计入
contract-qualified 分母、质量均值、优化成功或主 claim。只有当旧 benchmark/scorer 阻塞新的可解释实验时
才创建新身份修复；禁止原地改分、覆盖或删除失败证据。Law v3 已恢复 contract-qualified 的公开表示层，
但基线 gate 失败；`i18n-helper` 仍是源码扫描/变换 phenotype 的方法开发案例，不预注册为成功或
untouched replication。

方法开发以至少 6 个真实 skill 起步，但数量不固定。进入 replication 前必须通过
`method-portfolio-readiness/v3`：

1. 至少 6 个 contract-qualified real cases，预注册 phenotype coverage 无未解释空缺；
2. 最近连续 3 个新案例 `coreBranchDelta=0`，差异只进入声明式 adapter/contract/artifact；
3. 能自动生成 IR、contract、validation plan 和 package candidate，人工适配时间/LOC 趋势下降；
4. 至少 2 个不同 phenotype 的 optimized package 通过冻结 development gate；
5. 没有未关闭的 benchmark-contract、gold leak、materialization 或 scorer-authority blocker。

未满足时继续补充信息互补案例或修正通用系统。案例数量不能替代 readiness。

### 4.0 版本、运行身份与优化证据

版本号只描述会改变兼容性、实验分母或研究结论的语义合同。新增/修改 task 语义、scorer authority、
selection/denominator、promotion gate、公共 schema 的不兼容字段，或者改变报告字段的研究含义，才创建新的
protocol/schema/benchmark major identity。局部 parser、timeout、allowlist、日志、确定性实现 bug 修复，以及同一
冻结合同下的 provider/transient 重试，不得把组件从 `v1` 连续改名为 `v2/v3/v4`。它们使用新的
`attemptId`、freeze instance 或结果目录，并继续引用同一语义版本。若修复改变了被冻结的实现 digest，旧 lock
和结果保持不可变，新 lock instance 绑定新 digest，但 protocol version 不随运行次数增长。

每次版本提升必须在现有 spec/plan/component 文档中写明 `semantic delta`、兼容性边界以及对历史 claim 的影响；
写不出这三项时默认不提升版本。历史上已经冻结的 `v1--v4` 名称继续保留以保证可追溯性，但不作为未来命名
范例。Portfolio 的 `benchmarkVersions` 只登记 benchmark/contract 的语义版本，不再混入 baseline、static、
artifact 或 provider attempt 名称。

Task 18.10 的 `typed-output-repair/v3` 是符合上述规则的语义升级，而不是运行次数命名。Semantic delta 是新增
`source-audited-rule-enforcement`：它只能引用 profile-empty base IR 中已经存在的 `rule-*`，mapping 必须同时
绑定同一 `rule:<targetRef>` source-audit target，不允许携带自由文本或创建新领域规则；v3 对既有两个 repair
kind 完全继承 v2 语义。兼容性边界是 v1/v2 catalog 和历史 Final IR provenance 保持原有枚举与字节语义，只有
通用 v2 admission 与 provenance v3 链路可以消费新 kind。Claim 影响仅为未来新领域 residual 提供可审计的
通用编译能力，不追认旧 dynamic 结果，也不证明当前已经取得质量、效率、held-out 或跨模型收益。后续同一
语义下的 parser、timeout、日志和确定性 bug 修复留在 v3，以 implementation digest/attempt 区分。

Optimized development 的通过分为三种互斥证据，不再用单一 `passed` 冒充同一种收益：

1. `quality-positive`：完整冻结分母上，相对合格 baseline 有可测量、非反事实的质量改善；
2. `fidelity-preserving`：artifact/package 保持公开语义且不回归，但没有证明质量或摊销成本改善；
3. `efficiency-positive`：质量等价且预注册成本显著改善，同时具备 all-attempt、compile/profile/package 成本与
   break-even；缺任一项只能保持 `fidelity-preserving`。

Readiness 的“两种 phenotype”只计 `quality-positive` 或证据完整的 `efficiency-positive`；
`fidelity-preserving` 是重要机制证据，但不计优化正例。当前 API Tester 为 `quality-positive`，Env Manager v3
为 `fidelity-preserving`，后者没有完整 compile cost 与 break-even，因此当前只有 1 个 readiness-eligible
optimized phenotype。

Portfolio 还必须为每个案例记录 optimization path：`dynamic-profile`、
`direct-deterministic-artifact`、`static-sufficient` 或 `stopped-before-dynamic`，并绑定公开停止理由。动态阶段
不是所有案例的必经层：baseline regression/saturation、measurement invalid、static regression 都必须先停止；
static 已消除 residual 时不得编造 overlay；公开 source contract 已能直接编译确定性 artifact 时可以跳过 PGO。
只有 original 与 ir-static 都稳定复现、可由公开证据修复的 residual，才进入 5.2 的动态剖析与固化。

### 4.1 `zh-code-reviewer` 方法案例合同

该案例使用真实 MIT skill 的 exact source closure，先冻结 2 development + 2 held-out，再实现 scorer。
公开 task contract 只规定中文审查产物的字段、证据定位方式和严重度语义；具体 finding 从 agent 可见源码
推导，不写入 prompt 或 compiler 输入。首轮 oracle 只接受可由源码结构确定的规则，找不到强证据时降级为
`unconfirmed`，不猜测 hidden gold。

确定性 scorer 至少分开检查：protected source 与产物完整性、源码证据覆盖、严重度校准、修复建议可操作性、
JSON/中文报告一致性。它必须接受 finding 顺序、自然语言措辞和额外有效 finding 的变化；必须拒绝错文件/错
行锚点、漏掉高影响问题、严重度弱化、修改输入和无证据结论。删除公开问题模式后，对应 oracle 约束必须
消失。Benchmark audit 通过前不运行付费校准；校准先限于 `no-skill | original` development，IR 与 artifact
在区分度成立后另行设计。

首轮校准固定为强模型 `xty/gpt-5.6-sol`、Pi managed direct Node short-path、Windows/clean、2 个 development
task、每 task 2 次、`retries=0`，共 8 行和 4 个 paired cells。进入 base IR 审计前必须同时满足：8/8 行与
4/4 pairs 完整、0 infrastructure、no-skill 未饱和、至少 1 个 differing pair、至少 1 个 original 正向
score pair、original 至少 1 次 full success，且 original 聚合 mean 不低于 no-skill。两臂都饱和、original
全失败、只有退化差异或均值回归时均停止，不构造 IR；held-out 始终关闭。

首个 v1 校准实际为 8/8、0 infrastructure、original 4/4、no-skill 3/4，数值 gate 通过；随后 failure
audit 发现唯一差异行的结构化 `summary` 被 scorer 私有 `string` 类型约束误拒，公开 interface 只要求字段
存在而没有限制类型。因此该 gate 标为 measurement-invalid，`baseIrAuditAllowed=false`，不得重评分或覆盖。
下一次执行必须使用新 calibration identity，先加入 structured-summary alternative-valid canary 并冻结新
scorer/audit/lock；这属于 benchmark 修复，不是 skill 优化。

v2 修复后，development audit 为 20/20，唯一冻结校准为 8/8 rows、4/4 pairs、0 infrastructure；original
4/4、mean 1.0，no-skill 3/4、mean 0.75。失败行的 JSON/中文报告可通过公开 schema 与语义检查，但额外
生成 `NUL`，违反用户可见 prompt 及 `outputPolicy.exactOutputSet=true`。该差异属于公开任务合同违例，
不是 scorer 私有约束，故 v2 measurement-valid 且允许 source-audited base IR；它仍是单模型、development、
Windows/clean 的 admission evidence，不证明 skill 优化、跨模型稳定、held-out 泛化或 Token 收益。后续 IR
只能吸收可映射到公开 skill/source contract 的语义；不得把一次随机 residual 或 evaluator 期望直接固化。

### 4.2 `zh-readme` 方法案例合同

`zh-readme` 用于补齐 `repository-fact-documentation` phenotype。开始设计 benchmark 后，其角色从
`untouched-candidate` 改为第 6 个 `method-development` case；后续 untouched replication 必须另选没有参与
core、catalog、contract 或 scorer 调整的新 skill。

该案例冻结真实 MIT `SKILL.md`、2 个 development 与 2 个 held-out 小型仓库。Task split 在 scorer 实现前
冻结；development 代码、audit、calibration、compiler 和 repair 均不得读取 held-out 内容。仓库 fixture 只含
离线文本文件，不允许网络、安装依赖或执行不受控项目代码。

公开 task contract 要求生成且只生成 `README.zh-CN.md`，保留全部输入，并满足：中文项目定位、从仓库文件
可验证的安装/快速开始/开发命令、存在的本地路径、许可证和正式链接。标题、章节顺序、中文措辞、emoji、
badge 和额外真实说明均不固定；无静态证据时不得强制社会证明、版本、官网或安装方式，也不得把缺失事实
猜成金标。

确定性 scorer 从 agent 可见的 `package.json`、`pyproject.toml`、入口源码、已有文档和许可证派生事实，至少
分开检查：protected input/exact output、中文与核心结构、命令真实性、路径与链接真实性、事实完整性与禁止
虚构。它必须接受 alternative-valid 标题/顺序/表述，拒绝不存在的命令、URL、文件路径、许可证、纯英文
空壳和输入污染；删除公开 manifest 字段后，相应约束必须消失。视觉质量和营销吸引力不进入 hard gate。

付费前必须先通过 source closure、2+2 freeze、differential、reverse-evidence、gold/held-out leak 和真实
materialization audit。首轮模型校准只允许 `no-skill | original`、development、同一冻结 Pi/Windows/clean
身份；是否进入 base IR 由预注册的区分度与 original-success gate 决定，不因希望得到正例而事后放宽。

该案例首次使用技能无关的 `skill-ir-method-case-calibration-lock/v1`，把 reviewer 阶段已验证的 direct Pi
short-path 编排抽成通用合同；它不是新 runtime/catalog。Skill-specific 内容只通过 frozen inputs、source
closure、三类 benchmark guards、公开 output set 和 task ids 声明，runner/core 不按 skill id 分支。

唯一 development lock 固定 `xty/gpt-5.6-sol`、Pi `0.67.68`、Windows/clean、2 tasks x 2 repetitions x
`no-skill | original`，共 8 rows/4 pairs、`retries=0`。数值门禁在调用前冻结为：0 infrastructure、no-skill
不饱和、至少 1 个 differing pair、至少 1 个 original-positive pair、至少 1 次 original full success，且
original mean 不低于 no-skill。Qualification 还要求 resource probe、Pi 版本、指定 original route、唯一
`README.zh-CN.md` 物化以及无 harness residue 全部通过。即使门禁通过，也只开放 source-audited base IR
审计；held-out、skill optimization、跨模型和 Token claim 继续关闭。

v1 唯一矩阵为 8/8 rows、4/4 pairs、0 infrastructure；no-skill 0/4、mean 0.8，original 1/4、mean
0.7，门禁仅在 `originalMeanNonRegression` 失败。执行后审计发现 v1 oracle/scorer 违反上述公开合同：无安装
证据时仍私自要求 `npm install`，把 `npm start` 等标准等价形式按字符串拒绝，把 `Apache License 2.0`
与 `Apache-2.0` 当作不同事实，并未检查所有本地 Markdown link 是否属于 task repository。故 v1 冻结为
measurement-invalid；数值不得用于 original 正负效应，不能进入 base IR。修复必须使用新 scorer/audit/
calibration identity，加入 public equivalence 与 broken-local-link canary 后再运行；不得重评分或覆盖 v1。

v2 保持原 task、split freeze、source closure、模型、Pi 和数值 gate 不变，仅以新 identity 修复测量合同：
无公开安装证据时不生成安装 hard gate；命令只接受源文件可证明的 exact form、标准 npm alias/script body
和单个非 flag 参数的有界占位符；许可证只接受封闭 SPDX/display alias；本地 Markdown link 必须解析到
task repository 内真实文件。新 audit 覆盖 2 development tasks x 12 cases，共 24/24 通过，包括 public
equivalence、reverse-evidence、gold/held-out leak 与 broken-local-link canary。v2 scorer 由通用 runner 按
lock 中的 path+digest 动态加载，core 不按 skill id 分支；v1 registry 与结果保持不变。v2 唯一矩阵完成
8/8 rows、4/4 pairs、0 infrastructure；no-skill 3/4、mean 0.95、40204 tokens，
original 2/4、mean 0.90、120021 tokens，0 original-positive pair。两个 original failure 都把 skill source
closure 中的 `LICENSE.upstream` 当成 task repository 文件链接，属于公开合同违例；但 v2 scorer 又把
`note-index scan .` 判错：命令结构来自公开文档，`.` 是真实存在的 repository-local directory，v2 仅接受
字面参数或 `<placeholder>` 的规则仍产生 false reject。因此 v2 也冻结为 measurement-invalid，不重评分、
不补跑、不进入 base IR。手工敏感性分析只说明修复该 false reject 会提高 no-skill、不会产生 original
正向 pair；该方向性观察不是替代分数。下一步先设计 skill-neutral、source-bound command semantic contract，
不立即创建新 calibration 版本。

#### 4.2.1 来源约束的命令语义与资源命名空间

命令等价必须由公开 source evidence 构造声明式合同，通用 matcher 不按 skill id 分支，也不猜测参数语义。
合同可声明 exact variant、公开 alias/script body，以及逐 token 的 `placeholder` 或 `repository-path` 参数槽。
`repository-path` 只接受 task repository 根目录内真实存在且不经符号链接逃逸的相对路径；shell control、重定向、
绝对路径、`..` 逃逸、未声明 token 改写和不存在路径均拒绝。没有足够公开证据时返回 `unconfirmed`，不得用
模糊相似度补判。该合同先以独立 canary 验证，不修改冻结的 `zh-readme` v2 scorer 或 calibration identity。

Skill bundle 是真实 skill 的组成部分：当前 SkVM 会在 task fixture 之后把除 `SKILL.md` 外的脚本、模板、
参考资料和许可证复制到同一 workdir 根命名空间。这对 `law-to-markdown` 等脚本型 skill 是必要能力，但会引入
三种不同风险，必须分列而不能统称为污染：

1. `exposure`：skill-only resource 可见，但没有覆盖 task input，也未进入 task output；只作诊断；
2. `collision`：task input 与 skill resource 同相对路径；无论 digest 是否相同都存在 provenance 歧义，digest
   不同时为阻断级风险；
3. `output-reference`：生成的 task artifact 把 skill-only resource 当作 task repository 内容引用；除非公开
   task contract 明确允许，否则是确认的语义污染。

首轮只实现 provenance audit 和 compact portfolio report，不改变 flat bundle runtime。后续命名空间迁移必须
同时保留脚本/模板可执行性和旧 skill 兼容性，可考虑只读 resource namespace 或显式 task/resource mount；在
跨至少两个不同 phenotype 的审计证据形成前，不为单个 skill 打补丁，也不把资源暴露本身计为优化失败。

2026-08-03 的首轮 portfolio audit 覆盖 6 个真实 method-development case：6/6 都含非 `SKILL.md`
资源，共 18 个文件；`law-to-markdown` 与 `experimental-design` 含可执行脚本，说明后续隔离不能只删 bundle；
development fixture 与 bundle 的静态同路径 collision 为 0。已冻结 `zh-readme` v2 measurement evidence 提供
1 条 confirmed output-reference contamination observation，涉及两个 original 输出。该结果把命名空间列为
通用系统重点风险，但仍是 diagnostic evidence，不是优化效果或跨 skill 失败率。

#### 4.2.2 Optimized/AOT 的 namespaced resource package

方案 3 只作用于 optimized/AOT 产物，不改变 exact `original` 的 flat bundle baseline。编译器生成
provenance-bound resource package：

```text
.skvm/
  skill-resources/<skill-id>-<closure-digest>/
    <bundle files>
  skill-resource-manifest.json
```

`skill-resource-manifest.json` 绑定 source/closure digest、每个 resource 的 sha256、namespace 相对路径、
公开 source 中识别到的重写映射和 unresolved reference。编译后的 `skill.md` 只重写可由 source closure
逐字证明的 `scripts/`、`references/` 等路径；未知或歧义引用使 package 状态为 `blocked`，不能静默回退到
根目录 flat copy。许可证等 passive resource 仍随 package 保留，但不进入 task repository 根命名空间。

Namespace 的“只读”语义首版由完整性验证实现，而不是依赖 Windows/macOS/Linux 的文件权限：materializer
拒绝符号链接，运行后重新计算 resource digest，任何修改都报告为 package-integrity failure。这样不把平台
权限差异误当作实验结果。脚本和模板通过 namespace 内的真实路径调用；若旧 skill 依赖未被编译器证明的
隐式 cwd/相对路径，package 必须停在 blocked 并进入人工适配，而不能影响 original baseline。

Source closure 在进入 compiler 前排除生成性目录和缓存文件，包括 `.git`、`node_modules`、`__pycache__`、
`.pytest_cache`、`.mypy_cache`、`.ruff_cache`、`.pyc` 和 `.pyo`。这些文件不属于公开 skill provenance；若不排除，
本地解释器或测试运行会改变 closure digest，造成同一 skill 的非语义 package 漂移。

该机制预期降低来源混淆和输出引用污染，但可能增加少量编译 metadata、路径文本和资源校验成本。只有双案例
canary、资源完整性与 deterministic scorer 均通过后，才允许进入新的 optimized development identity。当前新增
的 `skill-ir-namespaced-resource-development-lock/v1` 只冻结 source/closure/package identity 和 canary
实现，不代表 quality gate；它明确禁止付费执行、held-out、PGO、scorer 调参和原始基线重写。进入真正
optimized development lock 前仍需把 compiled skill view 接入完整实验 runner，并固定完整
`no-skill | original | ir-static | optimized` 的任务矩阵；当前已完成 materialization-only runner dry-run，
但还没有把它放进真实 agent 矩阵。随后新增的显式
`namespaced-resource-development-plan/v1` 只生成 development dry-run identity，不修改默认矩阵：两个真实
resource case 的两个 development task 各生成四臂，合计 16 行，所有 workdir 独立；`original` 仍走现有
verified exact-source closure，`optimized` 才走 namespace materializer。结果保存在
`results/skill-ir/namespaced-resource-development-plan.json`。

2026-08-03 双案例 canary 已通过：Law 7 个 resources、Experimental Design 7 个 resources；两者均无
unresolved reference、根目录 resource exposure 或完整性失败，5 个 Python 脚本全部通过无副作用语法编译。
随后以独立 compatibility lock 做 digest/manifest/source closure 重验，结果写入
`results/skill-ir/namespaced-resource-development-lock-validation.json`。这只证明 namespaced materialization
的本地兼容性和身份可复现性，不证明 agent 任务质量收益。

在进入付费 lock 前，`namespaced-resource-development-qualification/v1` 执行资源合同 probe 和 mutation
regression。当前 qualification 在显式 `SKVM_PYTHON` 指向 `.skvm/law-runtime/Scripts/python.exe` 时为 ready：
2/2 mutation regression 和 2/2 resource probe 均通过。未提供该环境时，Law 的 `docx`/`pdfplumber` 缺失只能
标记为 preflight infrastructure blocker，不能计入 skill 质量、稳定性或优化收益；不得绕过 probe 创建付费
lock。qualification 命令为：

```powershell
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' ./src/benchmarks/skill-ir/namespaced-resource-development-plan-run.ts
$env:SKVM_PYTHON = (Resolve-Path '.skvm\law-runtime\Scripts\python.exe').Path
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' ./src/benchmarks/skill-ir/namespaced-resource-development-qualification.ts
```

资格通过后，独立的 `skill-ir-namespaced-resource-quality-development-lock/v1` 冻结单一
`xty/gpt-5.6-sol`、Pi `0.67.68`、Windows/clean、两个真实 skill 的四个 development task、
`no-skill | original | ir-static | optimized` 四臂和 `retries=0`。执行桥会在每个 optimized run 的
workspace preflight 后重新物化 namespace resource，避免 `executePlan` 清空 workdir 时丢失资源；它不改旧
default matrix。实际 16/16 rows、0 infrastructure failure 已完成，确定性 scorer 结果为 optimized
success `1/4`、mean evaluator score `0.5625`、pairwise regression `2`，因此 quality gate failed。
表面失败集中在 Experimental Design 两个 task 的 semantic contract 和 Law standard task 的 report outcome；
结果和 gate 报告保存在
`results/skill-ir/namespaced-resource-quality-development-v1-r2/`，只能作为 development failure evidence，
不允许进入 held-out、PGO、Final IR 或 Token 主 claim。

随后执行 `skill-ir-namespaced-resource-semantic-failure-audit/v1`：4/4 optimized rows 的 namespace manifest
及 declared resources 均 active，4/4 均产生公开 task outputs，0 infrastructure failure，因此“namespace
没有接入”与“模型没有执行”均不受证据支持。3 个 scorer failure 同时落在已冻结 audit failed 的 v1
benchmark 上：Experimental Design v1 含非公开 method enum/allocation algorithm/report literals，Law v1 的
alternative-valid review wording canary 也失败；这使本轮数值不能单独归因为优化语义退化。与此同时，
Experimental Design 的 optimized `SKILL.md` 仍只是原始 skill 的 namespace path rewrite，没有把 base IR、
deterministic generator/checker/template lowering 进 agent-facing view，说明 L3 artifact 仍未真正进入这条
optimized arm。完整诊断保存在同目录的 `semantic-failure-audit.json`，它只决定下一步方法，不得回流到
compiler/package。下一次付费实验必须同时满足：使用通过 public-contract audit 的 benchmark，并把
source-rewrite-only view 替换为 provenance-bound deterministic artifact compiler。

本地 re-entry qualification 已验证候选编译器的可执行性：Law 与 Experimental Design 的 deterministic
compiler、validated catalog/runtime、protected-input 检查和原 scorer activation 共 20/20 focused tests
通过（显式 `SKVM_PYTHON`）。后续 Task 17.11 已完成公共 assembly 与双 phenotype shadow parity，详见 6.1；
这些仍是 L3 artifact 机制证据，不是新的 paid development 或质量收益。

### 4.3 `law-to-markdown` 公共合同重建

冻结的 Law v1 task、scorer、audit、lock、package 和结果保持不可变。v1 development/held-out 数值只作
历史诊断：其 review-outcome scorer 拒绝了语义等价措辞，因此不能继续承担 contract-qualified 或优化效果
证据。新工作使用独立 `law-to-markdown-v2` benchmark identity，不复用旧结果分母。

v2 的 2 development + 2 held-out task、公开 `law-contract.json` 和 source closure 必须在 scorer 实现前
冻结。公开合同只选择来源中可确定、适合离线 toy fixture 的子集：输入保护、法律/明显非法律的保守分类、
法律标题层级、原文字字符流、项/目独立换行、审核报告与最终产物的一致性。分类规则对 agent 与 scorer 同时
可见；不确定输入不进入首轮任务。审核报告正文允许自由措辞，只要求唯一严格 JSON
`law-review-evidence` block 声明输入路径、文档类别和是否可交付；scorer 从公开输入重新推导这些字段，不能
使用私有金标标签或固定中文句子。

v2 audit 必须至少覆盖：两种 alternative-valid 审核措辞、不同但合法的 Markdown 空白、错误分类、错误标题
层级、文字丢失、输入污染、额外产物、gold/held-out 泄漏和真实 materialization。只有 audit 通过后才冻结
`no-skill | original` development 校准；若两臂饱和、original 无完整成功、没有配对差异或 original 均值
回归，则按停止规则关闭，不构造 base IR/artifact。旧 Law artifact compiler 仍是机制候选；只有 v2 基线有
区分度且 source audit 通过后，才允许通过公共 assembly 编译新的未冻结 package。

截至 2026-08-09，独立 v2 identity 已冻结并实现：2+2 split、公开合同、保守分类、字符流/层级/项目布局、
唯一结构化 review evidence 和 exact workdir delta 均由新 scorer 从公开输入重算。Development-only contract
audit 为 30/30 matched，覆盖两个任务分支的 canonical、alternative-valid 与 invalid control；compact report
位于 `results/skill-ir/benchmark-contract-audit/law-to-markdown-v2.json`。后续真实输出审计证明这组人工
canary 不完整：公开 evidence 只列字段名，没有声明字段类型，因而不能单独授予 contract-qualified 身份。

付费前 calibration identity 已另行冻结：固定 `xty/gpt-5.6-sol`、Pi 0.67.68 managed source runner、
Windows/clean、`no-skill | original`、2 development tasks x 2 repetitions、`retries=0`。通用 runner 显式加载
lock 绑定的 scorer，先运行一条 original qualification，再运行 8-row matrix。Qualification 只验证 route、
deterministic scorer 和 harness 清理链路，不作为语义成功或优化证据；完整 gate 仍要求 0 infrastructure、
no-skill 非饱和、至少一个 differing/positive pair、original 至少一次成功且均值不回归。

唯一 qualification 通过，完整矩阵为 8/8 rows、4/4 pairs、0 infrastructure；no-skill 与 original 均为
2/4 success、mean 0.90，0 differing/positive pair，数值 gate failed。执行后 authority audit 又发现 4 个
statute 行把公开 `outputs.deliverable` 路径字符串写入 evidence 的 `deliverable`，语义与公开合同一致，但
scorer 私有要求 boolean，导致四个 `law-v2-review` false reject。该 identity 已由 digest-bound
`measurement-validity.json` 冻结为 `measurement-invalid`：不重评分、不补跑、不开放 base IR、held-out、
optimization 或 Token claim。旧 v1 数值与 held-out regression 仍不改判。

### 4.4 `i18n-helper` React+i18next 方法案例

`i18n-helper` 固定来自 `laolaoshiren/claude-code-skills-zh` commit
`1e221579b0504082d25d5548b194399a7785f10f`，许可证为 MIT。首轮仅覆盖 React + i18next，不扩展 Vue、
Angular、Python、Java 或在线翻译。目标是验证通用系统能否处理“读取并修改已有源码”的 phenotype：扫描
用户可见硬编码文本，生成稳定 key，创建 `zh-CN`/`en-US` 语言文件，替换源码调用，并验证 key、插值和
输入/输出完整性。

公开合同必须声明允许修改的源码路径、必须保持不变的 manifest/config、允许新增的 i18n 文件和唯一报告。
Scorer 只从 agent 可见 React 源码与公开合同派生候选文本，不把完整 key 集合或翻译写进私有 payload；技术
术语、import 路径、URL、测试选择器、日志和不可确定字符串保守排除。稳定 key 由公开文件/组件/语义规则
生成，英文翻译质量首轮只作诊断，hard gate 检查覆盖、无硬编码残留、key 双语完整、插值保留、源码可解析
以及未授权文件不变。

该竖切需要通用 workdir delta 明确支持声明式 `allowedModifiedFiles`，不能为 `i18n-helper` 增加 skill-id
分支。执行采用一次生成、确定性 validate、至多一次基于白名单错误的修复；本地可确定的源码 rewrite 直接
应用并运行 diff/语法/key-integrity 检查，只有歧义文本、超出允许路径、行为保持不确定或 protected input
变更才阻断。首轮 audit 与基线校准通过前，不创建 optimized package、不运行 held-out，也不声称质量或
Token 收益。

截至 2026-08-09，React+i18next 首个竖切已完成 exact MIT source closure、2+2 split、task-split freeze、
声明式 `allowedModifiedFiles`、TypeScript AST source oracle、locale/interpolation/report scorer 与 30/30
development-only differential audit。任务 `tsconfig.json` 在 scorer 冻结前补入 `resolveJsonModule` 和
`esModuleInterop`，保证公开要求的 locale JSON import 可实现；protected config 仍不得由 agent 修改。
Audit 的 30/30 人工 canary 结果保存在 `results/skill-ir/benchmark-contract-audit/i18n-helper.json`；真实输出
审计随后证明它没有覆盖公开字段的 alternative type，不能单独证明完整 measurement contract。

该案例复用同一 `skill-ir-public-contract-calibration-lock/v1` 和 runner，冻结与 Law 相同的模型、Pi、OS、
context、repetition、timeout 和 gate，只替换公开 source/task/contract/scorer/audit identity。Dry-run 已确认
8 rows/4 complete pairs，original 注入 exact skill、no-skill 不注入。Corpus 的顶层 category 使用 Skill IR v1
已有的 `workflow | tool-use | constraint-heavy`；`react-i18next-source-transformation` 仍是 portfolio phenotype，
不为单案例扩大全局 category schema。

唯一 qualification 通过，完整矩阵为 8/8 rows、4/4 pairs、0 infrastructure；no-skill 为 1/4、mean 0.70，
original 为 1/4、mean 0.925，1 differing/positive pair，数值 gate passed。但 5 行用
`{ "zh-CN": [], "en-US": [] }` 表达无缺失 key，而公开报告合同没有声明 `missingKeys` 类型，私有 scorer
却只接受 exact empty array，造成 `i18n-report` false reject。该 identity 因此冻结为
`measurement-invalid`；唯一正 pair 对 delta/source/locales/interpolation 的改善只保留为不可晋升的诊断信号。
在新身份公开完整字段 ABI 并重做 audit/calibration 前，base IR、artifact、held-out 与 Token 结论保持关闭。

独立 v3 identity 已在 pre-scorer commit 冻结同一 2+2 task 语义，并使用 `public-output-abi/v2`：
`scannedFiles` 为 ordered，`extractedKeys` 与两个 locale 的 `missingKeys` 为 set-like，四者均禁止重复。
新 scorer 通过 ABI 的递归语义等价比较 observable facts，source-discovery order 的 alternative-valid report
不再被 lexical order 私约束拒绝。Development-only contract audit 为 30/30；该状态仍只说明测量合同和
任务隔离成立。随后 `public-contract-calibration-lock/v2` 已在真实执行前冻结：模型、Pi、task、gate 与 v2
保持一致，另绑定 scorer 及其三个直接依赖（ABI validator、workdir manifest、evaluator registry）的
path+digest。唯一真实矩阵完成 8/8 rows、4/4 pairs；5 份可解析报告全部通过 ABI v2，0
representation false reject，故该 benchmark identity 可计为 contract-qualified。

冻结数值为 no-skill 3/4、mean 0.75，original 2/4、mean 0.50，1 positive、2 negative、1 equal，预注册
original mean non-regression gate failed。但两条 original 行虽被旧 runner 记为 exit 0 / `runStatus=ok`，
实际是 0 token、无 final output、无 task output。后验 `execution-audit.json` 不改写 raw/scored/gate，只将
该批标记为 `execution-observability-blocked`：表示层合同成立，数值方向不能解释为 skill 语义效果，base IR、
artifact、held-out 与 Token claim 继续关闭。同 identity 不补跑；后续使用新 calibration identity 验证修正后的
执行可观测性，不创建 i18n benchmark v4。

随后使用同一 i18n v3 benchmark 创建 execution-bound calibration successor，不修改 task/contract/scorer/gate。
第一次 qualification 暴露未知 Pi content block 触发未检查 `text.trim()` 的本地 parser crash，因而冻结为
qualification failure，未进入矩阵。TDD 修复后以新 lock 重新绑定 7 个关键执行依赖；qualification 通过，唯一
矩阵 8/8 rows、4/4 pairs、0 infrastructure、8/8 observable、8/8 ABI pass。No-skill 与 original 均为
4/4、mean 1.0、0 differing pair，故当前真实阻塞转为 `baseline-saturation`。这不否定 benchmark contract，
也不允许 base IR、artifact、held-out 或 Token claim。

### 4.5 Public output ABI 约束

付费前的公开合同不能只列字段名。所有进入 deterministic scorer、runtime validator 或 repair report 的字段，
必须公开声明 type、required、enum/nullability，以及 object/array 的 key/value 或 element semantics。Scorer 不得
在 evaluator 私有实现中增加公开合同没有的表示层约束。Contract audit 至少包含一种公开允许的 alternative
shape、每类错误类型的 negative canary、reverse-evidence 和真实模型输出后的 authority audit；真实输出一旦
暴露未公开的合法表示，当前 identity 必须冻结为 measurement-invalid，修复使用新身份，不原地改分。

2026-08-09 的 `public-output-abi/v1` 实现了 recursive object/array、required、nullable、enum、
unique-items 和稳定 JSON pointer error。Law v3 把原 boolean 改为公开 `deliverablePath: string|null`；
真实运行中 6 份可解析报告全部符合 ABI，0 representation false reject，但 original 均分 0.85 低于
no-skill 0.90。因此 measurement-valid 不等于基线准入。

i18n v2 证明 array 仅声明元素类型和唯一性仍不完整：3 行 `extractedKeys` 包含相同 key set，仅使用
source-discovery order，却被 scorer 的私有 lexical order 拒绝。后续 ABI 必须显式声明
`ordered | set-like` 和 duplicate policy。Scorer 使用的共享 validator 也属于测量依赖闭包，新 lock 必须
绑定其 path/digest；不允许只冻结顶层 evaluator 文件。

`public-output-abi/v2` 是并列 successor，不修改 v1。每个 array 强制声明 `order: ordered | set-like`、
`duplicates: forbid | allow` 与递归 element schema；ordered 逐位置比较，set-like 忽略顺序，允许重复时按
multiset 比较。新 `public-contract-calibration-lock/v2` 还必须枚举并绑定 scorer 的全部静态直接相对
import/export 文件；validator 通过 TypeScript AST 重建集合，缺项、多项或 digest drift 均 fail closed。
Package import、Node builtin 与动态 import 不属于这份直接测量依赖清单。旧 v1 lock 继续按原 schema 验证。

模型执行的成功分母还必须满足可观测性：exit 0 不能单独证明模型完成。若 Pi 终止事件同时满足 usage 为 0、
assistant 文本为空、无 tool call/result，则 prospective parser 必须返回 `parse-failed`；gate 将其计为
infrastructure，而不是 semantic failure。对已经冻结的旧行只允许追加 digest-bound compact audit，不允许
重写 failure type、分数或 gate。

## 5. 静态与动态结合

### 5.1 静态阶段

真实 `SKILL.md` 经 provenance、license、resource closure 和 source audit 后生成 profile-empty base IR。
静态 passes 可以规范规则、插入环境 guard、补全 agent-facing contract 和 lowering，但禁止读取 evaluator
expected、held-out 内容、secret 或运行结果。

Source audit 使用独立 sidecar，固定 source/task/resource digest，并要求 IR 节点映射到公开证据。
Development task 只能暴露用户可见 prompt/fixture；scorer payload 不得成为编译输入。

#### 5.1.1 `zh-code-reviewer` 静态保真阶段

`zh-code-reviewer` 的 v2 calibration 已满足 base IR 准入，但 original 在冻结 development 分母上为
4/4、mean 1.0，因此本阶段不能沿用“至少一个 original -> ir-static 改善 pair”的门禁。profile-empty
base IR 仍只由 exact `SKILL.md`、development 用户可见 prompt、`review-interface.json` 与 resource contract
构造；source audit 必须逐节点标明 `source-explicit`、`task-contract`、`resource-contract`、
`static-clarification` 或 `schema-plumbing`，并继续排除 evaluator payload、held-out、runtime output 与
profile feedback。

静态开发固定同一强模型与 Pi managed direct Node short-path 身份，运行
`no-skill | original | ir-static`、2 development tasks x 2 repetitions，共 12 行/4 triplets，
`retries=0`。该阶段的 gate 是 **static fidelity gate**：要求 12/12 rows、4/4 triplets、0 infrastructure、
ir-static 4/4 且 mean 1.0、相对 original 没有 hard-gate 或 score regression。`minimumImprovedPairs=0` 是由
original 饱和预先决定，不是执行后放宽；no-skill 只保留为同身份参照。

通过只说明 lowering 后的静态视图保留了冻结开发任务上的公开 skill 语义，并允许进入 typed residual
审计。它不开放 held-out，不构成优化、跨模型、跨环境或 Token 收益证据。若 ir-static 退化，停止并修正
base IR/lowering；若无公开可复现 residual，不生成动态 overlay；若出现 residual，则按 5.2 的双源规则
分类，禁止把随机额外文件、具体 finding 金标或 scorer expected 硬编码进 IR。

#### 5.1.2 `env-manager` successor v3 静态保真阶段

Env Manager v3 的 original baseline 已为 4/4、mean 1.0，因此同样在执行前选择 static-fidelity 模式，不要求
不可能的正向质量 pair。冻结身份为 2 development tasks x 2 repetitions x
`no-skill | original | ir-static`，另预留每 task 1 个完整三臂 reserve block；`retries=0`，禁止单臂替换。

唯一执行选择首批 12/12 rows、4/4 triplets，0 reserve、0 transient/active/parser/runtime blocker。三臂均为
4/4、mean 1.0，ir-static 相对 original 为 0 improved、0 regressed、0 hard-gate regression，故 static fidelity
通过。Ir-static 使用 94324 非缓存 tokens，original 使用 133090，少 29.13%；对应执行时长 394865ms 与
476211ms，少 17.08%。这些成本差只作 development 诊断：静态通过开放公共 assembly/artifact development，
不单独计作 optimized phenotype，不开放 held-out 或跨模型 claim。

Static 通过后，Env Manager v3 通过公共 `validated-skill-artifact/v1` assembly/catalog/runtime 编译 Node/Vite
两个确定性 package。冻结四臂 development 完成 16/16 rows、4/4 quartets、0 infrastructure；validated
artifact 4/4、mean 1.0、0 hard-gate failure、0 pairwise regression，而同矩阵 ir-static 有一次公开语义失败。
这满足第二 phenotype 的 artifact development fidelity，并曾开放预注册多模型族 development 小面板。后续
全成本审计按 production/research 分账绑定全部已追踪证据：runtime 为 0 model tokens，但自动 optimizer/compiler
token、compile/package duration 与部分历史 all-attempt 字段显式 missing，N=1/2/5/10 的 optimized 总量和
break-even 均不得反事实计算。因此按 4.0 仍只能分类为 `fidelity-preserving`，不计第二个 readiness 优化正例。
Held-out、promotion、跨模型主 claim 与 Token break-even 继续关闭。

#### 5.1.3 三模型族 development 小面板

首个多模型族面板固定为 `gpt | claude | deepseek` 三条 route，同批覆盖 API Tester 与 Env Manager v3 各两个
既有 development task。每个 route/skill/task 使用 `no-skill | original | ir-static` 完整 triplet；目标为每格
1 个 selected block，另有至多 1 个只供预语义 transient 使用的 reserve block。正常路径为 36 个 selected
model rows，最大 attempted model rows 为 72。旧模型资格只能用于选择候选 route，本次执行前必须重新完成与
panel lock digest、Pi 版本和 resource contract 绑定的逐 route qualification。

资格本身也遵循相同的有界替换语义：每条 route 只有 1 个 target 和至多 1 个 reserve，且 reserve 只在 target
尚无语义活动的 transient/empty/idle 分类时启用。资格只判定能否形成可信固定分母，不按 development task
表现预筛模型：`semantic-complete` 无论输出是否齐全均准入；已有活动的 idle/absolute timeout 与 step-limit 也
准入，并在矩阵固定分母中按真实失败处理。parser/runtime/measurement/qualification blocker 继续阻断。输出存在性
只披露，不参与资格选择。继任 identity 必须冻结直接产生 value-free observation 的 Pi runtime，而不只冻结
外层 adapter/selector。资格准入不等于任务成功、质量通过、execution compatibility 或 promotion。

validated artifact 不接收模型输入，因此不是“每个模型族的一条 arm”。同一冻结 package 每个 skill/task 只执行
一次，共 4 个 shared deterministic anchors；面板的最终逻辑分母为 36 model rows + 4 anchors = 40。按三个模型
族重复 artifact 会把同一次确定性机制伪装成独立重复，明确禁止。

面板复用 `execution-envelope/v1`：只有 transport transient、empty terminal 和 pre-semantic idle timeout 可整组
替换；active timeout、step limit、parser/runtime blocker 与 semantic failure 都不可替换。报告必须同时保留
selected 与 all-attempt 口径，分开输出 route/harness compatibility、failure taxonomy、original 相对 no-skill、
ir-static 相对 original，以及 shared artifact 相对各模型臂的 score/hard-gate 下界。

这是 development diagnostic，不是 promotion gate。它可以证明指定路线在固定 Pi/Windows/clean/task identity
下是否可执行，并显示方向是 non-regressing、mixed 还是 regressing；不能外推到 held-out、noisy/long、其他
agent/OS、模型总体排名或跨模型泛化。后续主实验仍要求完整 readiness 与 untouched replication。

首个通过 infrastructure-only qualification 的 v4 identity 最终执行 36 个 model attempts 与 4 个 shared
anchors，选中 11/12 triplets、33/36 model rows，因 DeepSeek API Tester 整格 execution blocker 冻结为
`blocked`。GPT/Claude 各 12/12 semantic-complete；DeepSeek 同时暴露预语义 idle、活跃 absolute timeout 与
Pi compaction event allowlist 缺口。公共 parser 修复只应用于后续 identity，不覆盖或反事实补全 v4。已观测
quality direction 为 mixed，shared artifact 虽 4/4 success 仍因缺失 triplet 的固定分母下界失败。因此该批只
支持“GPT/Claude execution-compatible、DeepSeek 长任务稳定性不足、方法方向不一致”的 development 诊断，
仍不开放 held-out、promotion、Token break-even 或跨模型主 claim。

### 5.2 动态阶段

当前采用双源 residual：

```text
original x development -> 失败 lineage
ir-static x development -> 静态编译后的 typed residual

original fail + static pass -> 已解决，不生成 repair
original fail + static fail -> 可形成 reproduced residual
original pass + static fail -> static regression，阻断 Final IR
```

Overlay 只包含公开可修复的 typed evidence。Schema/location 类型残差必须来自 ir-static 审计；original
只证明失败是否持续出现。Scorer expected 金标、held-out、raw secret、绝对路径与模型原文禁止进入 overlay。

双源路径的通用 successor 使用声明式 repair mapping，而不是 core 内的 skill/criterion 分支。Mapping 只允许
引用 criterion id、typed repair、prerequisite 以及已经由 `skill-ir-source-audit/v1` 验证的 target refs；catalog
自身与 source audit、base IR、static v2 lock/gate、execution envelopes 和 selected scored rows 一并按
path+sha256 绑定。准入必须重算静态 gate 并核对固定分母，不能仅凭任意 scored JSONL 构造 overlay。

残差稳定性同时要求至少两个预注册 development task，并在每个计入的 task 上至少两个 matched repetitions。
阈值按 criterion 独立计算；不同一次性 criterion failure 不得先合并成同一 repair 来凑计数。Static gate 未通过、
分母/评分不完整、存在 execution blocker、original pass/static fail regression，或达到稳定阈值但没有公开 mapping
时均阻断。合法矩阵没有稳定 residual 时输出 `no-reproducible-residual` 并停止，不把“没有东西可 profile”当作
基础设施错误。

该 successor 的 evidence/provenance schema 提升属于语义合同变化：新证据增加 gate/catalog/source-audit 的
传递 digest 绑定和显式 admission status。历史 `skill-ir-repair-evidence/v1`、`dual-source-residual/v1` 与 Final IR
provenance v2 保持可读且不可覆盖，但不满足新准入，也不能被追认为当前 dynamic-profile 证据。新的 Final IR
成功编译仍只开放 development validation；不自动产生 artifact、优化正例、held-out、跨模型或效率 claim。

准入 runner 必须使用 static gate 相同的 execution-envelope selection，把 reserve/replacement attempt 保留在
all-attempt digest/cost 中、但只审计 selected original/static rows。Static-only criterion 仅在声明式 mapping 的
公开 prerequisite 于 original 明确失败时属于 `newly-observable`；其他 criterion-set drift 按不完整分母阻断。
Evidence schema 自校验 admission/repair/record/稳定阈值一致性，Final IR provenance v3 显式传递所有输入绑定并
在读取端交叉核对。v3 是 development-only construction contract；没有另一个 promotion 合同就不能被
`ir-pgo` 用于 held-out。

Env Manager v3 的冻结 static-fidelity 矩阵在该通用路径中得到 `no-reproducible-residual`：4 个 matched pairs 的
original/static criterion 均通过，0 records、0 repairs。该停止结果验证机制，不增加 portfolio 的
dynamic-profile 数，也不改变 fidelity-preserving/readiness 结论。

### 5.3 新 Skill 的验证预算

所有新 skill 先走低成本 provenance、schema/static validation、source audit 和 deterministic lowering。
后续按风险升级：

1. benchmark 区分度未知时，小规模 `no-skill | original`；
2. 存在可观察空间时，`ir-static x development`；
3. 只有稳定且公开可修复的 residual 才生成 Final IR/artifact candidate；
4. 只有冻结 development gate 通过才运行 held-out、多模型或 promotion。

Source、contract、compiler 和 artifact digest 未变时可复用验证结果。当前 validation planner 仍是 advisory，
不能绕过预注册门禁。

## 6. Final IR 与 Artifact

Final IR 是 base IR 与通过门禁的 typed overlay 编译得到的候选，至少绑定：source/base/overlay/final
digest、development evidence digest、model/adapter/run/panel identity、task split、repair catalog 和
validation notes。

`ir-pgo-dev` 是 development diagnostic；`ir-pgo` 才是 held-out consumption。成功编译不等于晋升。

工程终态是 Validated Skill Artifact Package：

```text
optimized_skill/
  skill_ir.json
  skill.md
  artifacts/
    checks/ | schemas/ | scripts/ | templates/ | tool-plans/
  package-manifest.json
  package-provenance.json
  validation-report.json
  cost-report.json
```

成熟度定义：L0 原始文本；L1 workflow IR；L2 controller/checker/schema 等 lowering；L3 可重复调用的
稳定代码/模板/tool plan；L4 带版本、provenance、cache 与 regression evidence 的 validated package。
当前只有若干 L3-oriented development prototype，没有跨 skill 证明的 L4。

### 6.1 Artifact assembly 收敛与非回归合同

本阶段只收敛各 skill compiler 重复的 package assembly，不把领域语义、generator、checker 或 scorer
强行统一。公共 assembly adapter 固定复用 `validated-skill-artifact/v1`，声明 skill/package identity、
compiler identity、protected inputs、generated outputs、execution plan 和 artifact layout；领域 compiler
仍负责从公开 source/task/resource contract 生成 `skill.md`、script、schema、template、check 和 tool-plan
内容。公共模块不得按 `skillId` 分支，也不得读取 evaluator payload、held-out、runtime output、profile
feedback 或 secret。

迁移采用 shadow-first，不原地修改已被 lock digest 绑定的 compiler/package：

1. 用冻结 package 的公开 provenance、execution plan 和 artifact bytes 构造 adapter 输入；
2. 公共 assembly 在临时目录重建 package，要求全部 production file 逐字节相同；
3. 至少覆盖两个不同 phenotype，并继续通过 catalog validation、protected-input 和 activation tests；
4. 缺失/多余 payload、重复 id/path、不安全路径或 plan 引用不存在 artifact 必须 fail closed；
5. 只有连续至少两个 phenotype 通过 shadow parity，新的未冻结 compiler 才默认接入公共 assembly；旧冻结
   compiler、package、lock 和 result 保留原路径与 digest；
6. 删除旧重复实现须等新路径完成 development gate 后另行评审，不以 LOC 下降换取语义、质量或可复现性
   回归。

该阶段的成功证据是 assembly parity、验证/激活非回归和 `coreBranchDelta=0`，不是新的 skill 优化、
held-out、跨模型或 Token 收益证据。若 public-contract benchmark 尚未具备区分度或对应 artifact 仍绑定
旧私有语义，停止在本地机制资格，不为展示进度强行运行付费矩阵。

2026-08-09 的 shadow parity 已覆盖 API Tester 与 Experimental Design v1 两种 phenotype：公共 assembly
重建 23 个 production files，2/2 package 逐字节一致、2/2 catalog valid，`coreBranchDelta=0`。随后新的
Experimental Design v2 compiler 只消费公开 v2 contract、development prompt 和 source-audited base IR，
生成独立 `validated-skill-artifact/v1` package；2 个 development fixture 均完成 runtime、protected-input
重验和 deterministic scorer，2/2 success、mean 1.0、runtime model tokens 0。该结果只说明新的未冻结
compiler 已接入公共 assembly 且本地机制可执行。由于相同任务上的 `no-skill | original` 已 4/4、mean 1.0
饱和，不创建付费四臂 lock，不声称 quality improvement、Token break-even、held-out 或跨模型收益。

## 7. Runtime 与 Scorer

通用 runtime 状态机固定为：

```text
preflight
-> materialize protected contract/template
-> generate
-> validate
-> at most one sanitized repair
-> revalidate
-> stop
-> offline deterministic scorer
```

Runtime validator 只使用公开合同与 agent 可见 workdir；offline scorer 是任务成功唯一权威。Validation
report 的 repair 投影使用封闭字段白名单，禁止原文、secret、绝对路径和 evaluator payload。Provider、
digest、path containment、protected mutation 或 infrastructure failure 不触发 semantic repair。

同 package 可做 `check-only` 与 `check+one-repair` 归因；只有 repair 实际触发，才讨论修复增益。Repair
调用和 Token 单列。

## 8. Benchmark v2 设计契约

“Benchmark v2”首先指 Experimental Design 的版本化 benchmark，并由此沉淀出可复用的设计契约；它不是
所有 skill 共用一套任务或 scorer。不同 skill 必须按同一原则建立自己的公开语义与 deterministic evaluator。
该契约将主语义成功与 deterministic profile 分开：

- 主成功只检查公开任务合同的语义等价，不要求私有 enum、唯一算法或报告字面量；
- profile 记录确定性结构/分配等诊断，不偷偷成为 hard gate；
- task split 在 scorer 实现前冻结，held-out 内容不进入 development audit、package 或 repair；
- scorer 必须接受多个 alternative-valid fixture，拒绝 gold/source-quote/held-out canary；
- materialization audit 在真实 workdir 上验证污染、路径、protected input 与最终 delta。

当前 42/42 differential、36/36 materialization 是 Experimental Design v2 的 measurement evidence，足以
说明它在该案例上优于 v1 的测量合同；运行结果是否有区分度、审计协议是否被其他 skill 正确实例化、优化是否
有效，仍需逐 skill 单独验证。

### 8.1 Skill Contribution Identifiability

Benchmark 合同合法不等于它能够识别 skill 的增量贡献。2026-08-10 起，新的方法开发 baseline 在付费前
增加 `skill-contribution-identifiability/v1` 门禁；旧 task、scorer、lock、result 和 task-sufficiency report
保持冻结。该门禁不以“强行压低 no-skill 分数”为目标，而是判断当前任务是否给 skill 留出了可观察、可归因
的贡献面。

每个候选任务必须把要求分为四类：

1. `task-outcome`：用户可见的目标、允许修改范围和输出 ABI；必须公开，但不应包含完整解法；
2. `fixture-derived`：scorer 可从 agent 可见输入和最终 workdir 重建的事实；
3. `skill-derived`：来自有 provenance 的 skill source、用于避免领域错误或改善方法质量的规则；
4. `overlap`：同时出现在 task/prompt 与 skill 中的规则。若 prompt 已给出具体答案、完整操作序列或可直接
   复制的 witness，必须标记为 `answer-bearing-duplication`，不能计为 skill 增量。

每个 scorer criterion 必须声明 task、权重、hard-gate 身份和上述来源；一个 criterion 可以有多个来源，但
只有绑定 source anchor、fixture-derived observable 和反向证据的部分才计入 skill-derived coverage。每个 task
内的 criterion weight 必须归一化为 1，task-set coverage 是各 development task 的 skill-derived weight 算术
平均。相互独立的 claim 必须具有不同 source anchor 或不同可观察失败语义，重复表述不重复计数。首版门禁固定为：

- 整个 task set 至少有 2 个相互独立的 skill-derived claim；
- 每个 development task 至少测量 1 个 skill-derived claim；
- skill-derived criteria 的总权重至少为 0.30，或其中至少 1 项是 hard gate；
- `answer-bearing-duplication` 为 0；输出文件名、ABI 和安全边界的公开不视为答案泄漏；
- canonical、alternative-valid、prompt-only omission、reverse-evidence 和 forbidden-sink canary 全部通过；
- 删除 source evidence 后，相应 claim 必须变成 unconfirmed 或从约束集合消失，不能由 evaluator 私有金标保留。

`prompt-only omission` fixture 应能完成基本产物合同，但故意遗漏至少一个 source-attributable 风险处理；它
必须只在对应 skill-derived criterion 上失败。该 fixture 用于证明 scorer 能观察增量语义，不代表真实
no-skill 模型必然失败。禁止通过隐藏输出 schema、唯一措辞、唯一 key、唯一算法或 held-out 金标制造差异。

付费前静态 analyzer 只输出 `eligible-for-baseline | benchmark-underidentified | measurement-invalid`。只有
`eligible-for-baseline` 可以进入冻结 paired baseline；baseline 与 execution authority 完成后，工作流把资格状态
收敛为以下四种互斥最终诊断：

```text
benchmark-underidentified   # 贡献面没有被任务/scorer 可靠测量
distinguishable             # 合同合格，真实 paired baseline 存在差异
model-capability-saturated  # 合同合格，但预注册强模型 no-skill/original 均饱和
measurement-invalid         # scorer authority、ABI、执行分母或基础设施不成立
```

`model-capability-saturated` 是有效负结果，不能通过事后提高阈值改写。此时可以预注册 quality-parity efficiency
ablation，比较相同质量下的 runtime/compile/profile/package Token；该结果不能冒充质量提升。只有
`benchmark-underidentified` 才回到 task/scorer 设计。修复必须使用新的 task-set/calibration identity，不原地
修改冻结 benchmark。

通用 analyzer 只消费声明式 manifest、path+digest 和 evidence anchors，不按 skill id 分支，也不自动用文本
相似度猜测语义。现有 Experimental Design 专用 task-sufficiency audit 保留为历史证据；新 analyzer 首先对
Experimental Design 与 i18n v3 生成可比较的 compact report，再决定 successor task，而不是继续盲选 skill。

首批 compact audit 已完成：i18n v3 和旧 Experimental Design v2 均为 `benchmark-underidentified`；前者有
4 条 answer-bearing duplication、0 skill-derived weight，后者复现 `13/13` operational disclosure、4 条
public-skill overlap 与 `6/6` unmeasured incremental knowledge。Experimental Design skill-unique 为
`eligible-for-baseline`，有 3 条独立 source-bound claim、逐 task weight `0.80` 和完整 5 类 canary；其历史
no-skill/original 同时满分仍是单独的 model-capability saturation 证据，不构成 skill 优化成功。

i18n 的首个 contribution-identifiable task surface 使用 `contribution-v1`。它虽然通过静态 canary，但唯一
真实 baseline 暴露两个公开合同缺口：报告占位符的单/双花括号未声明，locale scorer 也没有实现准则名称所称
的 i18next v4 plural family。5/8 行在公开语义反事实复算中由 fail 变 pass，因此 v1 冻结为
`measurement-invalid`，不得用其 0 success 判定模型或 skill。

前瞻 `contribution-v2` 不修改 v1，而是增加受保护的 `i18n-report-semantics.json`：报告中的源码占位符固定为
`{name}`，locale 插值为 `{{name}}`，含 `count` 的 base key 可对应 `_one/_other` family。2+2 task surface
绑定到提交 `5c755af3d5f9a47c52711e531bc4d525554d8cb2`；新 scorer 复用冻结 v1 的结构/delta/preservation，单独
实现公开 extraction/locale 语义。Contract audit 与 contribution audit 通过，真实 paired gate 也通过：
8/8 observable、0 infrastructure、4/4 differing、3 positive；original 2/4、mean 0.925，no-skill 1/4、
mean 0.525。两次 original partial row 均因额外 `nul` 文件只失去 delta gate，形成 source/base IR 审计目标。
随后提交的 profile-empty base IR 只消费 exact `SKILL.md`、development prompt、public contract 与公开 report
semantics；逐节点 source audit 明确排除 evaluator payload、held-out、runtime output 与 profile feedback。IR
保留扫描/排除、稳定 key、插值、i18next v4 复数、已有翻译、完整性和声明输出边界，但只表达通用的“禁止
未声明产物”，不固化后验 `nul` 文件名。首个 static development identity 后来以完整 12-row 分母执行，
但因 1 timeout 与 3 个同 task/run-index 的跨三臂 `parse-failed` 冻结失败；不开放 artifact/held-out，也不
构成优化或 Token claim。

随后 execution resilience successor 以并列 `static-development-lock/v2` 引入 value-free envelope、Pi 流式
活动、600 秒 absolute/120 秒 idle/30 steps/660 秒 outer、预注册整组三臂 reserve 与 selected/all-attempt
双口径。v2 qualification 证明完整任务被误用的 180 秒 probe budget 截断；v3 证明 Pi 标准 thinking block
漏入 allowlist；两者均冻结失败、不覆盖。TDD 修复后的 v4 qualification 为 semantic-complete，唯一矩阵
12/12 rows、4/4 triplets、0 replacement/transient/active/parser/runtime failure，故不再是 execution blocked。
其 gate 仍失败：original 3/4、mean 0.9625，ir-static 3/4、mean 0.875，0 improved、1 regressed pair。
Static 161220 非缓存 tokens 虽低于 original 213935，但质量回归禁止 optimized/efficiency、artifact、held-out
或主 claim；该案例冻结为 measurement-valid、infrastructure-insensitive 的 development 方法负结果。

### 8.1 Statistical Power prospective 竖切

`statistical-power` 的首个任务面只使用闭式功效计算，不使用 Monte Carlo。development 固定两种可独立重算的
设计：两独立均值与两独立比例；两者都覆盖非等额分配、Bonferroni 多重比较、SESOI、失访膨胀和敏感性分析。
任务只公开 study facts 与输出 ABI，不公开动作序列、预期样本量、gold 或 source quote。Scorer 必须从公开输入
重算分析样本量与入组样本量，接受 ABI 允许的说明文本，不得用隐藏字段、私有数组顺序或逐 fixture 答案判分。
“公开输出 ABI”必须覆盖 scorer 实际读取的每个 JSON pointer；只声明父对象、再由隐藏 strict schema 规定子字段
不算公开。Contract audit 必须以独立 disclosure manifest 比较 public/evaluator pointer，canonical fixture 不能
仅由同一隐藏 parser 生成后自证通过。该检查只公开字段和类型，不公开动作序列或预期数值。

该案例的领域特异部分限定为声明式 study adapter、数学 oracle 与 criterion-to-source anchors；task/source freeze、
workdir delta、贡献可识别性、paired runner、execution observability、gate 与 compact report 必须复用公共组件且
`coreBranchDelta=0`。不同 skill 无法共享同一个语义 oracle，但必须共享同一生命周期协议和证据 envelope。

Task 18.10 selection report 中的 `original | ir-static` 预算仅是候选选择时冻结的 static residual intent，不是跳过
baseline 的执行授权。Task 18.11 另行冻结 development authorization：先 `no-skill | original` 8 行；通过贡献、
execution 与 distinguishability gate 后才允许 source-audited base IR；随后 `original | ir-static` 8 行；只有 typed
residual admission eligible 时才允许最多 4 行 dynamic development。三段均 `retries=0`，held-out 不创作、不读取、
不执行。selection input/report 保持不可变；新授权是后续 lifecycle component，不通过改写历史或无意义滚版本修复。

完成该 skill 后必须暂停候选扩张，按全过程证据复盘真实瓶颈、自动化缺口、每 case 适配成本、正负证据比例和目标
难度。统一封装的候选边界是 `import -> contract -> audit -> calibrate -> optimize -> report`；是否交付该封装、
进入多模型族或弱化“通用优化”目标，必须由复盘结果决定，不能由单个正例或文件覆盖率决定。

首轮真实执行已触发该停止点：qualification 1 行和 paired matrix 8 行均健康完成，但 public interface 未披露
scorer 所需的 23 个嵌套 pointer，8/8 报告满足公开顶层字段、0/8 通过隐藏 strict schema。因此该 identity 是
`measurement-invalid`，不是 original 的正/负效果证据；base IR、static、dynamic 和 held-out 均关闭。后续修复
若改变 agent 可见字段合同，必须建立新的 measurement identity；不得重评分旧结果。

## 9. Prospective Partial-benefit Re-entry

旧 gate 失败结果不可事后改判。一个案例只有满足版本化 policy 才能以新 identity 进入方法开发：

- 旧矩阵完整、0 infrastructure、存在配对区分度；
- original 相对 no-skill 有来源可解释的局部改善或稳定残差；
- 旧结果只用于 admission，不允许修改原 scorer/gate/held-out；
- 新工作使用新的 task/contract/lock/result identity；
- 不计为 untouched replication，也不自动获得 base IR/held-out 权限。

API Tester 是该 policy 的首个案例，prospective admission 已通过；旧 gate 仍失败且不改判。新身份下已
完成 source-audited base IR、声明式双 OpenAPI 变体和 `validated-skill-artifact/v1` package。冻结
development 矩阵为 `no-skill | original | ir-static | validated-artifact`、2 task x 2 repetitions，结果
16/16 完整、0 infrastructure、artifact 4/4 success、mean 1.0、0 pairwise regression，development gate
通过。该证据只开放 method-development portfolio 计数；held-out、replication、跨模型和 promotion 仍关闭。

## 10. 指标与报告

主指标：success/pass、mean、worst slice、paired delta、regression、hard-gate、criterion failures。
诊断指标：tokens、repair tokens、latency、validation duration、adapter LOC/time、artifact reuse、
`coreBranchDelta`。所有结果按 skill/model/context/task/repetition 与 infrastructure slice 完整报告。

实验结果分两层持久化：Git 提交 compact report、scored rows、freeze、summary 和必要 provenance；raw
workdir、qualification 临时目录与调试 snapshot 默认留本机，除非被冻结 digest 直接引用。

### 10.1 前瞻 optimizer/compiler 成本身份

Task 18.14 的历史审计证明，确定性 artifact runtime 的 `0 model tokens` 不能回答 optimizer 如何产生 compiler、
adapter 和 package。后续新候选在任何 optimized development 之前必须建立 prospective construction identity，
至少绑定 source closure、task/public/resource contract、base IR/source audit、declarative adapter、compiler
implementation、catalog/runtime 与 environment digest，并实测一次 compiler/package 调用的 duration、模型调用及
input/output/cache token、输出 package
bytes/digest 和 validation 结果。缺失字段保持 missing，不从 callback 类型、人工回忆或 runtime 0 token 外推。

Construction origin 必须分开：

1. `automatic-prospective`：compiler/package 由本次冻结自动路径产生，且所有 construction steps、model usage、
   package validation 和 identity closure 都前瞻保存；只有这一类可以提供 production automatic compile cost；
2. `manual-existing`：调用已经由人手写的 compiler。即使执行本身确定性且实测 0 model tokens，也只能证明成本
   capture 与 package parity 机制可用，不能把历史人工设计成本记为 0，不能补写旧 break-even。

该职责使用独立首版 `skill-ir-prospective-compiler-cost/v1`，不改变
`skill-ir-optimization-cost-accounting/v1` 的既有报告语义或任何冻结 cost result。当前 API Tester 与 Env Manager
只作为 `manual-existing` 无模型 canary；A 路线完成后仍须通过新的 prospective candidate 取得第二个
quality-positive，随后才允许冻结方法并做 untouched replication。

Task 18.15 的 canary 已在 Bun 1.3.14 / Windows x64 重建两案例共 4 个 package，4/4 package validation 与
frozen manifest byte parity，0 model calls/0 tokens；两例均因历史手写 construction 保持 `mechanism-only`，
automatic eligible 为 0。报告还绑定 cost capture/runner 自身，正模型调用配全零 usage、绝对/重复证据路径、
digest drift 与 package failure 均 fail closed。该结果关闭未来采集机制缺口，不补写任何历史成本。

### 10.2 前瞻质量候选与单次分母复用

新质量候选必须在 benchmark contract 之前绑定 verified intake、双层 license、exact source closure 与
attribution。任何付费 execution 之前，必须同时通过公开 JSON contract、全部 evaluator JSON pointer disclosure、
贡献可识别性、deterministic scorer canary、prospective construction cost identity 和 qualification lock。缺一项只
能生成 fail-closed preflight report，不能用真实模型输出倒推或修补合同。

同一候选、task set、model identity、context 与 repetition lock 下，`no-skill`、`original`、`ir-static` 行只生成
一次并向后续 gate 复用；不得为 calibration/static/artifact 三个标签重复调用等价模型行。当前 BIDS 候选冻结为
2 tasks x 2 repetitions x 3 model systems，即 dynamic 前最多 12 次付费调用；validated artifact 的 4 行是确定性
runtime。只有公开、跨任务且任务内重复的 residual admission 为 `eligible` 时才可追加 4 次 dynamic arm。

Task 18.16 使用独立首版 `skill-ir-prospective-quality-candidate/v1` 完成上述 selection freeze。BIDS source 在固定
commit 下绑定 `SKILL.md` 直接引用的全部 6 个本地资源与 repository license，共 8 个逐文件 digest；skill 声明
CC-BY-4.0、仓库根为 MIT，两者不折叠。该结果不增加 studied/qualified/optimized denominator，也不授权 held-out。

Task 18.17 完成六项 pre-paid gate 的前四项。两条 BIDS development task 不携带动作配方、具体必填字段或预期
issue；`bids-audit.json` 完整公开 17 个 scorer-visible pointer 及 set-like semantics。确定性 evaluator 从冻结
schema/metadata source 现场派生 entity ordering、metadata inheritance 与 required BOLD metadata，contract audit
的六角色 canary 和 contribution audit 的五角色 canary 全通过。贡献报告识别 3 个独立 skill-derived failure
mode、逐 task weight 0.80、0 answer-bearing duplication。该静态证据只授权继续构建 prospective construction
identity 与 qualification lock；`paidExecution`、held-out、qualification 和 portfolio promotion 仍为 false。

Task 18.18 补齐 construction identity 与 qualification lock，并暴露 disclosure 合同的新边界。手写 BIDS compiler
的实际构建为 10 human minutes、23 adapter LOC、0 core branch delta、0 model tokens、217697 package bytes，
必须保持 `manual-existing / mechanism-only`。Qualification 只检查 resource、route、execution observation 与
deterministic scorer，不以任务成功为条件。冻结的唯一 12-call matrix 为 12/12 semantic-complete、0
infrastructure blocker，但 residual audit 发现：12/12 输出的 issue code、repair 和 summary 一致，仅 1/12 满足
oracle 对 `affectedPath`/`evidencePaths` 的唯一表示选择，而 public contract 没有公开这两个字段的 value semantics。

因此 disclosure 合格不能只由 JSON pointer 集合相等推出。凡 scorer 对枚举值、规范化路径、表示等价类、数组
元素身份或跨字段关系作精确判定，public contract 与 canary 必须同时公开并差分测试这些 value semantics；否则
真实运行只能冻结为 measurement-invalid。本 BIDS v1 的数值 quality/paired improvement 不进入研究 claim，旧
task/scorer/lock/result 不原地修改；只有新 successor measurement identity 可修复语义合同。

Task 18.19 将该要求固化为并列首版 `skill-ir-public-json-value-semantics-disclosure-audit/v1`，不滚动或改写旧
pointer audit。声明必须使用稳定 semantic id、`canonical-value | representation-equivalence |
array-element-identity | normalization | cross-field-relationship` kind、规则 id、带角色的 JSON pointer targets 与
公开说明；同 id 的 public/evaluator descriptor 必须精确一致。每项至少有 canonical/invalid 差分 canary，表示等价
与数组元素身份还要求 alternative-valid。缺失、descriptor drift、canary coverage 或 outcome 不一致均在
qualification/paid 前 fail closed。

BIDS v1 只读 preflight 证明该门可工作：原 17/17 pointer closure 保持 passed，7 项 evaluator value semantics 中
2 项 set-like equivalence 已公开、5 项未公开，17 个真实 scorer canary 全部按预期；因此状态
`blocked-before-paid`，0 model/held-out consumption。该新报告是旧 measurement-invalid 的预付费复现，不是旧结果
重判，也不是 successor contract 已完成。

Task 18.20 对五项缺失语义继续做 source-bound、non-answer-bearing feasibility audit。结论不是把 v1 scorer 的
精确表示直接搬进公开合同，而是 `feasible-with-evaluator-redesign`：path normalization 与 summary count
relationship 继续作为公共义务；`affectedPath` 泛化为 repair target 或对应 logical data file；
`evidencePaths` 改为唯一且与 repair 相关的 manifest evidence，不再要求私有 source-reference filename；issue
element identity 改为 code、severity 与完整 semantic repair，path presentation 不制造新 issue。五项规则均由
公开 source closure 推导，且 canonical / alternative-valid / invalid 共 15 个 canary 全通过。

该结论只授权冻结新的 successor measurement identity。新的 public contract 与 semantic scorer 必须共同冻结并
重新通过 pointer/value-semantics disclosure；BIDS v1 task/scorer/lock/result 继续不可变，也不得重评分。付费
qualification、development、dynamic、held-out 与 readiness promotion 在 successor identity 完成前仍关闭。

Task 18.21 已建立独立的 `bids-successor-semantic-scorer-v2` measurement identity。Agent-visible public interface
和 report schema 提升为 v2，task 的问题语义与公开 prompt 保持不变，但 evaluator id、payload、interface fixture、
report value semantics 与全部 digest 使用新身份。Semantic scorer 先按 `code + severity + complete repair` 匹配
source-derived issue，再要求 `affectedPath` 与非空唯一 `evidencePaths` 属于 repair target 或其对应 logical data
file 的 manifest 集合；它不再要求 source-reference filename，也不把 path presentation 当成另一条 issue。

新的 pointer disclosure 为 17 public / 17 evaluator / 0 undisclosed；7 项 public/evaluator value semantics 为
7/7 精确一致，21 个 canonical / alternative-valid / invalid canary 全部通过。Freeze 同时绑定 successor interface、
development tasks、scorer、contract/audit implementation、source rules、共享依赖、BIDS v1
predecessor 和 Task 18.20 evidence digest。该结果只证明新的 deterministic measurement contract 已冻结；BIDS v1
不重评分，qualification、paid development、dynamic、held-out、quality claim 与 readiness promotion 仍未授权。
Successor scorer 不写入共享 evaluator registry；后续 qualification 必须按新 lock 冻结的 source path 直接加载，
避免无关 registry 变更破坏历史 BIDS v1 lock。

Task 18.22 又冻结了独立首版 `skill-ir-bids-successor-development-lock/v1`。它只把 Task 18.21 的 successor
interface、tasks、scorer 与 contract audit 作为新测量权威，并绑定 Pi 0.67.68、Windows/clean、
`xty/gpt-5.6-sol`、`retries=0`、2 task x 2 repetition x 3 system 的唯一 12-row forward-only 分母、0 reserve、
exact output set 与 1+12 调用上限。薄适配层直接复用公共 materialization/plan/execution primitives，不升级通用
prospective runtime，也不把 scorer 加入共享 registry；scorer 只能从 lock 声明的仓库内 source path 直载。

Committed lock 位于 `benchmarks/skill-ir/pilots/bids/successor-v2/development-lock.json`，零付费 compact freeze
位于 `results/skill-ir/bids-successor-development-freeze-v1.json`。重建得到 12/12 successor task rows、4 triplets、
direct-loaded scorer、0 paid calls；BIDS v1 的 tasks/scorer/lock/result digest 同时绑定为 preserved/not-rescored。
当前只授权以后执行一次 infrastructure qualification。资格门只检查 resource、route、observability 与
deterministic scorer runnable；已有语义活动后的 task failure、exact output 缺失或 semantic failure 只披露，不作
模型筛选。Paid matrix、dynamic、held-out、模型质量 claim 与 readiness promotion 继续关闭；资格通过后也只允许
同一 lock 下的一份 12-row successor 分母。

Task 18.23 已按该 lock 执行唯一一次 qualification。API key 只检查存在性且未读取/记录内容；resource、route、
observability、lock-local deterministic scorer 四门均为 true，execution 为 `semantic-complete`，33,632ms、exit 0、
4 provider responses，usage input/output/cache-read 为 18,344/1,338/44,544，`paidCalls=1`。Scorer row 已产生、
semantic success 为 true；全 workdir exact-set disclosure 为 false，但该项按预注册规则 `usedAsGate=false`，没有参与
资格判定或模型选择。Qualification compact 与 resource probe 均绑定 committed lock/resource digest，状态 passed，
只把 `paidMatrix` 提升为 true；dynamic、held-out 与 readiness promotion 继续 false。

该通过不等于 12-row 模型结果或第二正例。下一阶段必须在任何 matrix call 前冻结 successor analysis policy 与
matrix runner implementation closure，并只执行同一 lock 的 12 个 forward-only rows；不得重复 qualification、
更换 task/candidate、复用 v1 行或依据这一次 semantic success 调整分母。

Task 18.24 已完成这项付费前冻结。`skill-ir-bids-successor-analysis-policy/v1` 精确绑定当前 lock、唯一 passed
qualification、successor tasks/scorer，以及独立 successor matrix policy/runner 与复用的 execution/result
implementation digest。它预注册 original-no-skill、ir-static-original、validated-artifact-original 三组同
task/repetition estimand；measurement eligibility 固定为 12/12 model scored rows、4 deterministic controls、最多
1 个 active execution failure、0 parser/runtime blocker和 deterministic scorer complete。模型行严格按 task ->
repetition -> no-skill/original/ir-static 执行，0 retry、0 reserve、forward-only；runner 用一个同时包含 raw 与
envelope 的原子 prefix checkpoint 恢复，缺失、重复、乱序或身份漂移均失败关闭；committed freeze 反向绑定
policy 路径与 digest closure。Parser/runtime/qualification/measurement blocker 在该行持久化后立即停止且不可
跨过，active timeout/step-limit 留在固定分母中继续执行；完整 12 行后才投影 JSONL 并评分。
Committed policy 与 compact freeze 分别位于
`benchmarks/skill-ir/pilots/bids/successor-v2/development-analysis-policy.json` 和
`results/skill-ir/bids-successor-matrix-freeze-v1.json`。本阶段新 API 调用为 0、matrix 为 0/12；qualification 不
重复，dynamic、held-out、readiness 与模型质量 claim 仍关闭。该首版是 successor measurement identity 的专属薄
层，不是通用 framework 或历史 BIDS v1 的版本升级。

Task 18.25 在任何 successor 模型输出被读取前补齐了冻结分母中预注册但尚未实现的 4 条 artifact control。
Successor 专属 compiler/runtime 只导入被 BIDS v1 prospective construction 证据 pin 住的公共模块，使用
`deriveBidsSuccessorAuditOracle` 生成 `skill-ir-bids-audit-report/v2`、summary 与 repair-target evidence；没有修改
旧 BIDS v1 或 Task 18.24 的四文件 implementation closure。2 task x 2 repetition 的确定性实测为 4/4 success、
0 model call/token、0 held-out，compact pre-model freeze 位于
`results/skill-ir/bids-successor-artifact-control-freeze-v1.json`。这只排除了 artifact/scorer 测量合同错配造成的
假负结果；随后真实执行前重新核验为零漂移，并从不存在持久 plan/prefix 的 0/12 开始唯一 matrix。

唯一 successor matrix 完成 12/12 semantic-complete/scored、0 retry、0 active/parser/runtime blocker；模型行
input/output/cache-read 为 223224/32547/461312，duration 663008ms。No-skill/original/ir-static 为
3/4、3/4、2/4，mean 0.8/0.8/0.6；original-no-skill 是 1 positive、2 equal、1 regression，贡献未识别；
ir-static-original 是 0/3/1，mean delta -0.2。预模型 artifact 4/4、mean 1.0，相对 original 为 1/3/0、
delta +0.2，但它来自 hand-authored construction，不能晋升 automatic optimized result 或第二 readiness phenotype。
Dynamic、held-out、replication 与主 claim 继续关闭。

Readiness report 因派生研究含义变化提升为 `skill-ir-method-portfolio-readiness/v4`。它把首个非 passed 阶段的
measurement blocker 明确投影为 `open-candidate` 或 `explained-and-frozen`：只有前者阻断
`noOpenMeasurementBlockers`；`invalidated` 且带冻结 evidence 的 Zh README scorer-authority 属于后者。该修正没有
改写历史实验，也没有令 readiness 通过：readiness-eligible phenotype 仍为 1，7/7 automation 仍不完整。

## 11. 当前证据与不可声称项

权威数值见 `experiment-results.md`。当前结论是“测量与若干机制成立，API Tester 出现首个合同合格的
development artifact 正向案例；BIDS successor 的 hand-authored artifact 正向但自动构造、贡献和 static 均未通过；
i18n contribution-v2 已通过 baseline admission 和 source-audited base IR，
execution-resilience v4 已排除基础设施阻塞，但 static 相对 original 出现 paired quality regression，因而冻结为
方法负结果；portfolio v3 只计 1 个 readiness-eligible optimized phenotype，通用优化主 claim 未完成”。

Portfolio v3 将 `benchmarkContract`、`baselineAdmission`、`staticFidelity`、`optimizedDevelopment` 与
`heldOutPromotion` 分开保存和派生，并增加优化证据分类与 dynamic path，不允许用较早阶段的通过填充后续阶段。
适配成本必须注明
`historical-unavailable | prospective-in-progress | prospective-measured`；只有最后一种可进入收敛计算，且必须
具备起止时间、人工分钟、adapter LOC 和 core branch delta。Successor selection 必须在新合同前冻结并覆盖
全部 method-development case；当前 policy 预先选择 Env Manager，旧合同/旧模型结果只用于候选理由与失败诊断。
Env Manager successor 的 `env-audit-interface/v2` 不携带逐 task gold 集合，首轮 8/8 local canary 通过；但真实
resilient baseline 暴露 arm-dependent source resource 与未公开 schema 表示两项 scorer-authority 缺口，故该
contract/baseline identity 冻结 measurement-invalid，portfolio contract-qualified 回退为 6/7。8/8 rows、4/4
pairs、0 transient/active/parser/runtime blocker 只证明 execution infrastructure 有效，不能解释数值方向或进入
base IR、optimized、held-out。
Successor v3 以新 identity 修复这两个 authority 缺口：公开 interface 同时接受 `variables` wrapper 与标准 JSON
Schema，并定义 `sensitive=true` / `writeOnly=true` 等价；完整性直接使用 frozen initial manifest 保护各 arm 的
全部初始条目。包含 source-closure resource 的 Node canary 与 Vite wrapper/secret controls 共 8/8 matched，故
portfolio contract-qualified 恢复为 7/7；这只开放 task-split/lock 准备，不等于 baseline 或优化通过。
该 identity 的首个校准只消费 development，因此使用 `skill-ir-method-case-development-freeze/v1`：冻结公开合同、
source audit、两条 development task 与 source closure，同时把 held-out 登记为 `not-authored`、禁止执行且未来必须
重新建立隔离。历史 2+2 freeze 继续有效；development-only 校准不再为了满足结构门禁而提前创作或复用 held-out。
主线程曾在合同开发后读取 successor v2 的旧 held-out 文件，虽然其内容未进入 v3 task/scorer/canary，但未来
Env v3 held-out 不能从该旧 split 派生，必须由未接触旧内容的独立流程或用户提供新的预冻结任务。
冻结 v4 baseline 完成 8/8 rows、4/4 pairs、0 execution blocker；original 4/4、mean 1.0，no-skill 3/4、mean
0.9125，1 positive、0 regression，因此 baseline admission 通过并开放 profile-empty base IR。前三个 qualification
identity 仅因调用层硬 timeout 过短而冻结为 operator failure，不计入模型、skill 或 resilience 结论。
Profile-empty base IR 随后完成逐节点 source audit：唯一来源为 exact upstream skill、两条 development prompt 与
public interface；evaluator payload、held-out、runtime output 与 profile feedback 全部排除。该步骤只令 corpus
晋升 `runnable` 并开放 static development，不构成 optimized evidence。随后冻结的 static-fidelity identity 完成
12/12 rows、4/4 triplets、0 execution blocker，三臂均 4/4、mean 1.0，ir-static 对 original 无回退；其
29.13% 非缓存 token 与 17.08% 时长下降只作诊断。该 gate 开放 artifact development，但仍不构成第二个
optimized phenotype。

第 1.2 节定义的 CLI/library/Optimizer Agent 是交付合同，不是当前完成状态。现有 SkVM CLI 与研究脚本可以
分别运行 AOT、agent 和实验组件，但尚未提供一条统一的 `import -> optimize -> validate -> report` 用户路径；
不得把已有命令名称当作该产品闭环已经实现。

不得声称：

- 已普遍提高 held-out success；
- 已证明跨模型、跨 agent、跨 OS 稳定；
- 已证明摊销 Token 节省或 break-even；
- runtime validation pass 等于任务成功；
- 单个成功样本或跨批次均值差构成因果增益；
- audit-failed 历史案例计入 contract-qualified 分母。

## 12. 研究定位

本项目位于 SkVM/SkillRT 的编译执行路线内，关注更靠前的“语义 IR + 可检查 artifact” pass。

- [SkillRT / SkVM](https://arxiv.org/abs/2604.03088)：能力画像、环境绑定和跨 model-harness 编译；本项目
  补充规则、检查、恢复和语义稳定性。
- [SkillsBench](https://arxiv.org/abs/2602.12670)：paired condition、deterministic verifier 和 negative
  delta，直接对应本项目的 no-skill/original/optimized 与回归报告。
- [AgentSpec](https://arxiv.org/abs/2503.18666)、[AgentGuard](https://arxiv.org/abs/2509.23864)：支持把
  lowering 后的 checker 视为轻量运行时 enforcement，而非更多提示词。
- [Reflexion](https://arxiv.org/abs/2303.11366)、[Voyager](https://arxiv.org/abs/2305.16291)：执行反馈
  改善后续行为；本项目把自由文本记忆收紧为 typed trace feedback 与 provenance-bound repair。
- [SWE-agent](https://arxiv.org/abs/2405.15793)：agent-computer interface 会影响表现，对应 adapter 和
  tool-plan 的重要性。

## 13. 完成条件

项目完整成果至少需要：

1. method portfolio readiness gate 通过；
2. 至少两个不同 phenotype 的 package 通过冻结 development gate；
3. 冻结方法在至少一个、争取两个 untouched real skill 上完成 replication；
4. disjoint held-out 上相对 original 不回归，并报告负向 pair；
5. 固定三模型族、clean + noisy/long、稳定 Pi 与真实 Windows 的主轴证据；
6. scorer、runtime validator、infrastructure 和成本分列；
7. 在质量硬门槛通过的案例上报告 `N=1,2,5,10` 与 break-even；
8. CLI、library 与 Optimizer Agent 共用同一 core，能输出 package、validation 和 cost report。

上述仍是长期研究完成条件，不再作为当前单模型里程碑的单一完成百分比。复盘后近期目标收窄为：在
Windows/clean、一个冻结模型族和一个稳定 harness 上，证明面向 deterministic/contract-heavy skill 的公共 AOT
生命周期可复用。该里程碑要求：

1. 公共 `import -> contract -> audit -> calibrate -> optimize -> report` wrapper 以 declarative adapter 驱动，
   并在 API Tester 与 Env Manager 上 shadow rebuild/parity；
2. 至少 1 个 quality-positive phenotype，加上第 2 个 quality-positive 或具有完整 all-attempt/compile/profile/
   package 成本与 break-even 的 efficiency-positive phenotype；单纯 fidelity 不计；
3. 至少 1 个 untouched replication，期间 `coreBranchDelta=0`；
4. scorer authority、execution failure、semantic failure 与成本分列；已解释、冻结的负结果保留在 corpus，但
   只有未解释漂移或当前候选 blocker 才阻断方法冻结；
5. dynamic-profile 不作为强制数量指标。只有公开、跨任务且跨重复稳定的 residual 才运行 dynamic/
   solidification；没有 residual 时，typed stop 是合格结果。

Task 18.13 已完成该近期目标的第一项工程收敛：同一 `PilotAdapter/v1` 与公共 lifecycle wrapper 对 API Tester、
Env Manager v3 完成 plan/gate shadow parity，并通过公共 assembly 重建 4 个逐字节一致的 package；Statistical
Power 由同一入口在加载 task builder 或进入 qualification 前按 disclosure evidence fail closed。整个 shadow
阶段 0 次付费调用、`coreBranchDelta=0`，且未修改旧 lock、package 或结果。该证据只证明公共编排可以保持
既有冻结语义，不补足第二个 readiness-eligible phenotype、全成本、untouched replication 或产品入口。

跨 agent、跨 OS、noisy/long、三模型族主表与普遍稳定性仍属于后续扩展目标。这个收窄不降低已有 quality、
fixed-denominator、held-out 或 provenance 标准，只减少当前里程碑同时必须证明的外推范围。
