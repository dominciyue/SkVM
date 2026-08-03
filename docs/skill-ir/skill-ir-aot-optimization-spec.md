# Skill IR AOT 优化研究契约

**最后更新：** 2026-08-03

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

方法开发以至少 6 个真实 skill 起步，但数量不固定。进入 replication 前必须通过
`method-portfolio-readiness/v1`：

1. 至少 6 个 contract-qualified real cases，预注册 phenotype coverage 无未解释空缺；
2. 最近连续 3 个新案例 `coreBranchDelta=0`，差异只进入声明式 adapter/contract/artifact；
3. 能自动生成 IR、contract、validation plan 和 package candidate，人工适配时间/LOC 趋势下降；
4. 至少 2 个不同 phenotype 的 optimized package 通过冻结 development gate；
5. 没有未关闭的 benchmark-contract、gold leak、materialization 或 scorer-authority blocker。

未满足时继续补充信息互补案例或修正通用系统。案例数量不能替代 readiness。

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
lock 中的 path+digest 动态加载，core 不按 skill id 分支；v1 registry 与结果保持不变。该状态只说明 v2
measurement contract 已审计和预注册，付费 development 尚未运行，因此仍不构成区分度或优化证据。

v2 唯一矩阵随后完成 8/8 rows、4/4 pairs、0 infrastructure；no-skill 3/4、mean 0.95、40204 tokens，
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
但还没有把它放进真实 agent 矩阵。

2026-08-03 双案例 canary 已通过：Law 7 个 resources、Experimental Design 7 个 resources；两者均无
unresolved reference、根目录 resource exposure 或完整性失败，5 个 Python 脚本全部通过无副作用语法编译。
随后以独立 compatibility lock 做 digest/manifest/source closure 重验，结果写入
`results/skill-ir/namespaced-resource-development-lock-validation.json`。这只证明 namespaced materialization
的本地兼容性和身份可复现性，不证明 agent 任务质量收益。

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

## 8. Benchmark v2 契约

Benchmark v2 将主语义成功与 deterministic profile 分开：

- 主成功只检查公开任务合同的语义等价，不要求私有 enum、唯一算法或报告字面量；
- profile 记录确定性结构/分配等诊断，不偷偷成为 hard gate；
- task split 在 scorer 实现前冻结，held-out 内容不进入 development audit、package 或 repair；
- scorer 必须接受多个 alternative-valid fixture，拒绝 gold/source-quote/held-out canary；
- materialization audit 在真实 workdir 上验证污染、路径、protected input 与最终 delta。

当前 v2 measurement evidence 是 42/42 differential、36/36 materialization，足以说明其优于 v1 的
测量合同；运行结果是否有区分度和优化是否有效仍需逐 skill 单独验证。

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

## 11. 当前证据与不可声称项

权威数值见 `experiment-results.md`。当前结论是“测量与若干机制成立，API Tester 出现首个合同合格的
development artifact 正向案例，通用优化主 claim 未完成”。

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
