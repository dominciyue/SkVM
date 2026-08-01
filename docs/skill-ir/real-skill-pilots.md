# 真实 Skill Corpus 与 Pilot

本文档记录真实 skill 来源、provenance、Wave A/B 设计，以及 `env-manager`、
`law-to-markdown` 的纵向契约。
实验结果见 `docs/skill-ir/experiment-results.md`。

## 1. 为什么重启真实 Corpus

早期六个 deep benchmark skill 是本地 synthetic seed，适合构造受控失败和验证
runner/scorer，但不足以证明任意 public skill 泛化。当前报告规则：

```text
synthetic-seed -> calibration-low
real/adapted/upstream/user skill -> main/support evidence
```

主结论必须报告 provenance 和 evidence weight，并保留 no-skill baseline。

这里需要区分“上游 benchmark 框架”和“本项目的 Skill IR benchmark”。学校 SkVM 上游原本
提供通用 bench orchestrator、condition、evaluator 和 importer；`benchmarks/skill-ir/`、
`src/benchmarks/skill-ir/` 以及第一批六个 seed task 都由本项目新增。后续 Wave A 的
`env-manager`、`law-to-markdown`、`experimental-design` 使用公开仓库的真实 skill source，
但 task、fixture、public contract、scorer 和 split 仍是本项目为研究问题设计的测量工具，
不应表述成“上游自带标准 benchmark”。

## 2. 来源审计

原始 checkout 位于 ignored `.skvm/external-skills/`，仓库只提交选中 source closure
和机器可读 intake。

| 来源 | 固定 commit | SKILL.md | License 结论 |
|---|---|---:|---|
| `anbeime/skill` | `ddad6073e07addfe3690dc3de978b2e73ca8cf02` | 70 | 根目录 mixed；逐 artifact 判断。 |
| `laolaoshiren/claude-code-skills-zh` | `1e221579b0504082d25d5548b194399a7785f10f` | 20 | Repository MIT。 |
| `travisvn/awesome-claude-skills` | `1da55aa810f206d3fe2005e7e3989b15a275d942` | 0 | Discovery index，不是 artifact。 |
| `K-Dense-AI/claude-scientific-skills` | `fc0b9f692459ea7d9e5a5c64948a5878e1bce274` | 149 | Repository MIT。 |

权威快照：

```text
benchmarks/skill-ir/corpus/real-skill-intake.json
```

README 中的 skill 名不等于 checkout 中存在 artifact。License badge、根 LICENSE、
nested LICENSE 和资源完整性都需要实际文件审计。

## 3. 历史 3+3 Pilot 与扩展 Portfolio

### Wave A，方法开发

| Skill | 来源 | 覆盖 | 风险 |
|---|---|---|---|
| `law-to-markdown` | anbeime | 文档、脚本、依赖、fallback | Python 依赖和输入格式。 |
| `env-manager` | Chinese skills | 环境、安全、schema、tool use | 必须使用 synthetic secret。 |
| `experimental-design` | scientific skills | 非编码科学工作流 | 语义 scorer 难度较高。 |

### 历史 Wave B 候选

```text
zh-code-reviewer
api-tester
zh-readme
```

该列表是早期冻结 replication 计划。后续仍要求 replication 不得回调同一份主结果配置，但具体角色以
下文 2026-08-01 的重新分类为准。

Task 16.22 曾按首个 Wave B 纵切选择 `api-tester`。上游 exact source 为
`laolaoshiren/claude-code-skills-zh@1e221579b0504082d25d5548b194399a7785f10f` 的
`skills/api-tester/SKILL.md`，MIT，无 bundled script/resource。它覆盖 OpenAPI/route 发现、schema-derived
happy/boundary/error case、框架选择、数据策略、执行复测、安全与独立性，和三个 Wave A phenotype 不同。

Task 16.22 不直接要求任意 Jest/Pytest 服务编排，而冻结 `api-test-generator/v1`：模型生成离线 JS
generator、derived JSON test plan 和 verification report，确定性 scorer 重新执行 generator 并从公开
OpenAPI 独立推导语义。这样保留“生成测试代码”的能力，同时避免数据库、live server 和测试框架噪声。

Development contract audit 18/18、production materialization 36/36，均未消费 held-out。冻结的
`gpt-5.6-sol` baseline 为 8/8 rows、4/4 pairs、0 infrastructure、4 differing pairs；original mean
0.4000，高于 no-skill 0.2375，但两臂均为 0/4 full success，两个 task 都没有 original success。
因此当前 `api-tester` surface 冻结为“局部语义贡献但 calibration gate failed”，不创建 base IR，
不消费已冻结的 held-out。

2026-08-01 的后续决策不改写上述历史结果：API Tester 将在新的 prospective policy 下转为方法开发
case，因此不再承担 untouched Wave B replication。新的 replication skill 必须从未参与 policy、catalog
或 adapter 调整的真实候选中选择并单独冻结。

方法开发 portfolio 的目标下限为 6 个真实 skill，最终数量根据实验新增信息量和成本调整。报告使用三套
分母：`studied`、`contract-qualified`、`untouched replication`。当前三项 Wave A 和 API Tester 可计入
studied；只有通过公开合同、差分/泄漏/物化审计的对应版本才能计入 contract-qualified。

## 4. Source Closure

```text
benchmarks/skill-ir/pilots/law-to-markdown/source/
benchmarks/skill-ir/pilots/env-manager/source/
benchmarks/skill-ir/pilots/experimental-design/source/
benchmarks/skill-ir/pilots/api-tester/source/
```

`benchmarks/skill-ir/corpus/corpora/pilot.json` 固定：

- repository URL 和 commit；
- upstream path；
- license；
- source/resource 相对路径；
- 每文件 SHA-256；
- provenance/evidence weight/status。

Source-imported 不等于 runnable。每个 pilot 必须有 task、scorer、base IR 和 split
audit 才能进入主矩阵。

## 5. Env-manager 选择理由

`env-manager` 首先竖切，因为公开规则、安全约束、输出文件和 schema 边界明确，
适合隔离基础设施问题。Law-to-markdown 依赖更重，experimental-design 的 semantic
scoring 更难，不适合与 runner/scorer 同时调试。

Exact original：

```text
benchmarks/skill-ir/pilots/env-manager/source/SKILL.md
```

Base IR：

```text
benchmarks/skill-ir/pilots/env-manager/base-ir.json
```

## 6. Task Split

任务定义：

```text
benchmarks/skill-ir/pilots/env-manager/tasks.json
```

Development：

```text
env-manager-node-audit-dev-001
env-manager-vite-audit-dev-002
```

Held-out：

```text
env-manager-python-audit-heldout-001
env-manager-nextjs-audit-heldout-002
```

每个 task 要求保留输入，并生成：

```text
.env.example
.env.schema.json
env-report.json
```

Report 恰好包含：

```text
definedAndUsed[]
definedUnconfirmedUnused[]
usedUndefined[]
hardcodedSecrets[]
exposureRisks[]
```

Development 用于静态/动态方法构造和门禁；held-out 不进入 compiler、overlay、
runtime contract 或调参。

## 7. Deterministic Scorer

实现：

```text
src/bench/evaluators/env-manager-grade.ts
```

| Criterion | Weight | Hard gate |
|---|---:|---:|
| protected files | 0.20 | 是 |
| no secret leak | 0.20 | 是 |
| required artifacts | 0.15 | 是 |
| exact classification | 0.20 | 否 |
| env example safety | 0.15 | 否 |
| schema rules | 0.10 | 否 |

成功条件：weighted score 至少 0.85，且三个 hard gate 全部通过。

Scorer 读取最终 workdir，处理：

- JSON parse/shape；
- protected file digest；
- synthetic secret content/path；
- symlink/reparse/path escape；
- NTFS alternate data stream；
- UTF-16/unsupported encoding；
- exact set 和 schema vocabulary。

`TEST_ONLY_` 值只存在 fixture/evaluator，不进入 prompt answer、runtime contract 或
repair report。

## 8. Pre-IR Calibration

`tasks-authored` 状态没有 `irPath`。显式 calibration guard 运行时合成最小 source
envelope，只授权：

```text
one pilot
development tasks
clean context
no-skill | original
```

它不创建 fake base IR，也不允许 static/PGO/artifact system。

## 9. Base IR Source Audit

Base IR 由公开 `SKILL.md` 和用户可见 task contract 构造，审计：

- inputs/outputs/preconditions；
- environment/tool assumptions；
- steps/rules/checks/recovery；
- source line/section 支持；
- 无 evaluator expected、threshold 或 held-out。

Static lowering 后，env-manager 能稳定完成 protected inputs、secret safety、required
artifacts 和 example safety，主要残差是 classification 和 schema。

## 10. Resource Contract

Heavy-script skill 必须在 task 设计前声明：

- agent 是否应执行 bundled script；
- interpreter/package 是否存在；
- network/API 是否允许；
- script failure 是 infrastructure 还是 semantic；
- original 与 IR/package 是否获得相同 resource closure。

Env-manager 当前使用 JS/TS/dotenv fixture，无 package install 和 network。

`law-to-markdown` 当前只启用 `.txt` 任务，但上游 `law_to_markdown.py` 在模块加载时会
同时 import `python-docx` 和 `pdfplumber`，因此 `.txt` 也不能假定无 Python 依赖。
机器可读契约位于：

```text
benchmarks/skill-ir/pilots/law-to-markdown/resource-contract.json
```

解释器由 `SKVM_PYTHON` 显式选择，裸 `python` 只作 fallback。付费前运行：

```powershell
$env:SKVM_PYTHON = '<python-with-docx-and-pdfplumber>'
bun ./src/benchmarks/skill-ir/resource-contract-run.ts `
  '--contract=benchmarks/skill-ir/pilots/law-to-markdown/resource-contract.json' `
  '--out=results/skill-ir/law-to-markdown-resource-probe/result.json'
```

`status != ok` 时停止，不运行模型。Probe 不调用 shell，compact result 不保存解释器
绝对路径或 stderr；缺依赖记为 preflight infrastructure。

## 10.1 Law-to-markdown Task/Scorer 纵切

任务定义：

```text
benchmarks/skill-ir/pilots/law-to-markdown/tasks.json
```

Development：

```text
law-to-markdown-statute-dev-001
law-to-markdown-standard-dev-002
```

Held-out：

```text
law-to-markdown-regulation-heldout-001
law-to-markdown-manual-heldout-002
```

四个任务均使用 `document.txt`，覆盖法律文档转换与非法律拒绝。Prompt 只声明输入保护、
minimal 输出位置、禁止网络/安装和用户可见审核字段；具体 heading gold、字符流期望和
review outcome 只存在 evaluator payload。

确定性 scorer 为 `src/bench/evaluators/law-to-markdown-grade.ts`，检查：

- protected source；
- required/forbidden artifact policy；
- 去 Markdown 标题和空白后的字符流保真；
- 法律标题层级与项/目独立行；
- 非法律不得生成最终成果；
- 审核报告的 source identity、结论和可交付状态。

输入保护、required artifact 和 source accounting 是 hard gate，阈值为 0.85。Scorer
只读取 workdir；compact row 不保留 payload 或全文 gold。

当前 manifest 状态为 `runnable`，已绑定 `base-ir.json` 与
`base-ir-source-audit.json`。Base IR 保持中文并显式表达转换分支、工具/授权边界、格式与
保真检查、产物策略和有界恢复；通用 source-audit verifier 要求每个语义节点绑定固定
digest 的公开 source、development prompt 或资源契约，并拒绝 evaluator/held-out evidence。
本地 resource probe 在默认 Conda Python 上因缺 `docx` 失败，在显式工作区 Python 上通过；
冻结 calibration 为 2 repetitions，lock-bound dry-run 为 8 行。

### 10.2 Pre-IR Calibration

冻结 lock：

```text
benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-pre-ir-calibration-lock.json
```

Lock 绑定 source、tasks、resource contract、scorer digest，以及 GPT-5.6、
Windows/clean/bare-agent、`no-skill | original`、2 tasks x 2 repetitions。Runner 只能使用：

```powershell
bun ./src/benchmarks/skill-ir/pre-ir-calibration-run.ts `
  '--lock=benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-pre-ir-calibration-lock.json' `
  '--out-dir=results/skill-ir/law-to-markdown-pre-ir-calibration-2026-07-23' `
  '--phase=plan'
```

`route-probe` phase 会先重新运行 resource probe，再执行一个独立 original generation；只
保存 status/exit/time，不保存命令、stdout/stderr 或模型正文。`execute` phase 再次运行
resource probe，并要求同目录已有同 lock/model/task 的成功 route probe，随后执行冻结 8 行。
两阶段都要求 `SKVM_XTY_API_KEY`；Python 由 `SKVM_PYTHON` 选择。

评分后使用 `pre-ir-calibration-gate-run.ts`。Gate 固定 8 rows、4 pairs、0 infrastructure、
no-skill 非饱和和至少一个 paired outcome difference。结果只决定是否进入 base IR source
audit；不允许 held-out、PGO、scorer retuning 或主 claim。

2026-07-23 实际运行 8/8 rows、4/4 pairs、0 infrastructure。No-skill 和 original 均为
0/4 success，mean 为 0.70 与 0.75；只有 1 个 pair 改善 document-policy，review-outcome
在 8 行持续失败。Gate passed，base IR source audit 已完成；下一步是冻结并执行
`no-skill | original | ir-static x development`，held-out 仍禁止。

### 10.3 Static Development

Static lock 绑定 exact source、tasks、resource contract、scorer、base IR 与 source-audit
digest，冻结 GPT-5.6、Windows/clean/bare-agent、`no-skill | original | ir-static`、2 tasks x
2 repetitions、零重试和 180 秒 route timeout。Runner 已实现 `plan | route-probe | execute`，
static gate 已实现 12-row/4-triplet 固定分母、0 infrastructure、0 hard-gate regression、
`ir-static >= 3/4` success、mean `>= 0.85` 与至少一个 original→static 改善 pair。

2026-07-23 付费 static 已完成：12/12 rows、4/4 triplets、0 infrastructure。No-skill 为
0/4、0.70；original 与 ir-static 均为 1/4、0.7875。Static 相对 original 一正一负两平，
token 高 39.1%；gate 因 success 与 mean 不达标而失败，held-out 未执行。

审计发现 public bundled script 已定义 canonical review label，但 IR lowering 只保留了自然语言
结论要求；2 个 static non-law row 还记录了 Windows 下 shell 调脚本失败。下一阶段只从公开
source closure 编译 report template/schema 与 direct interpreter tool plan，使用新 catalog 与
development lock；不把 evaluator payload 或本次输出写回 compiler。

### 10.4 Validated Artifact 本地纵切

已实现 skill-agnostic `validated-skill-artifact/v1`，Law adapter 将公开 source closure 编译为
三个 Python scripts、review template/schema、direct tool plan 和 runtime checker。通用 core
不含 Law id 分支；adapter 只接收 development prompt 投影，不接收 evaluator、held-out 或
runtime output。

本地 resource probe 与两个 development activation 已通过。法律任务 deterministic scorer
为 0.85，非法律任务为 1.00，二者 hard gate 均无失败；法律任务仍有 heading-structure
criterion 残差。两个 runtime validation 均 pass，直接执行的模型 token 为 0。该结果是
mechanism evidence，不是冻结 development 对照、held-out 或跨 skill 证据。

Package：

```text
benchmarks/skill-ir/pilots/law-to-markdown/packages/validated-skill-artifact-v1/
```

新的 Law development lock 已冻结，固定 16 行/4 四元组。2026-07-24 dry-run 确认 12 条模型
行、4 条 direct 行和 0 held-out；免费 direct 臂重复执行为 4/4 success，法律任务两次均为
0.85，非法律任务两次均为 1.00，模型 token 为 0。父 lock 保持不可变，并由从属 execution
freeze 绑定实际 model runner、scoring、route/resource、bare-agent 和 orchestration digest。

同日完整付费 development 得到 16/16 rows、4/4 quartets、0 infrastructure。Artifact 为
4/4、mean 0.925，original 为 0/4、0.75，ir-static 为 1/4、0.80；逐样本相对
original/static 较优者 3 positive、1 equal、0 regression。Artifact 4 次调用模型 token
均为 0，三条模型臂合计 301198 tokens；因 compile cost 未在同一口径测量，仍不计算
break-even。Development gate passed，只允许起草 held-out lock，held-out 尚未执行。
Catalog 通用性仍必须由至少一个不同类型 skill 复用同一
manifest/execution-plan/runtime API 验证，不能由 Law 单例直接得出。

### 10.5 Held-out 预注册

新的 held-out lock 固定使用两个既有 held-out task、两次 repetition 和
`no-skill | original | ir-static | validated-artifact` 四系统，共 16 行/4 四元组。
它递归验证已通过的 development evidence，并额外冻结相同 tasks、resource contract 与
scorer。Artifact package 不重编、不修改 provenance，也不读取 held-out feedback。

独立 gate 将 artifact 与三条 baseline 中的逐样本最佳者比较，要求 4/4 success、总均分与
逐 task 均分均不低于 0.85、零回归且至少一次严格提升。唯一一次 held-out 为
16/16 rows、0 infrastructure；artifact 法规 task 两次 0.85/success，manual task 两次
0.60/failure，总计 2/4、mean 0.725。两次 manual 回归使 gate 失败，package 不晋升，
也不从该任务回流修复。

### 10.6 Experimental-design 第二 Phenotype

该 pilot 已完成 source/license closure、2+2 task、stdlib-only resource contract、
deterministic scorer、profile-empty base IR 与逐节点 source audit，并晋升为 `runnable`。
第一阶段只覆盖 seeded randomization，不启用上游依赖 `numpy/pandas/pyDOE3` 的 DOE 矩阵。

Package：

```text
benchmarks/skill-ir/pilots/experimental-design/packages/validated-skill-artifact-v1/
```

它复用 Law 已使用的 catalog/runtime API，但 adapter 内容不同：从 `study.json` 推导
cluster、stratified-block、permuted-block 或 simple-randomized，生成可复现 allocation
及设计文档。两个 development fixture 本地执行后 scorer 均为 1.00/success；held-out 未执行。
当前证据只支持“通用 package/runtime 可承载第二种 phenotype”，不支持真实模型增益、
跨 task 泛化、跨模型稳定或 amortized token claim。

2026-07-25 已新增 skill-neutral `skill-ir-baseline-calibration-lock/v1`，不修改
`tasks-authored` pre-IR 或 Law-specific 历史合同。Experimental-design lock 冻结 source、
tasks、resource、scorer、base IR/source audit、执行实现、GPT-5.6、bare-agent、clean/Windows、
两个 development task × 2 repetitions 和 `no-skill | original`。Lock-bound dry-run 得到
8 rows/4 pairs、0 held-out、0 retry。唯一正式 calibration 为 8/8 rows、4/4 pairs、
0 infrastructure；两臂均 0/4、mean 0.30，`differingPairs=0`，gate failed。

Failure audit 证明 original 注入的 skill digest 精确匹配上游，任务编码正常，两臂均保护输入并
生成三项文件。失败来自 scorer 强制了 prompt 未公开的 schema/method enum、唯一 xorshift32
schedule 和逐字报告标签。该批因此按 benchmark contract misalignment 冻结，不作为模型能力、
original skill 或 artifact 增益证据；当前四臂 development、held-out 和 break-even 均阻断。

## 11. Pilot 晋升门禁

每个 deep pilot 需要：

1. Exact licensed source 和 integrity metadata。
2. 可判分 no-skill task。
3. Deterministic 或预注册 semi-deterministic scorer。
4. Source-audited base IR。
5. Development/held-out split。
6. Development-only feedback 和 Final IR provenance。
7. 冻结 development gate。
8. Gate 通过后的四系统 held-out result。
9. Regression、scorer limit 和 artifact opportunity 说明。

Corpus 不因 intake 表变大而自动扩大。完成一个 pilot 的证据闭环后再加入下一个。

注意：一个 pilot 的 benchmark audit 通过，只能说明该 pilot 的测量合同可用，不能
说明 catalog 自动适配其他 skill。跨 skill 结论必须由冻结方法后的 untouched
replication 支撑，并同时记录通用 core 是否新增 skill-id 分支、adapter 新增代码量、
artifact kind 复用率和新的 failure taxonomy。

## 12. 当前状态

| Pilot | Source | Tasks/scorer | Base IR | Real run |
|---|---|---|---|---|
| env-manager | 完成 | 2+2 / deterministic；contract audit failed | 完成 | 精确 schema rules 未公开；历史 development 仅作 support evidence。 |
| law-to-markdown | 完成 | 2+2 / deterministic；contract audit failed | 完成并 source-audited | 两个 task 的 alternative-valid 审核措辞均被拒；旧 development/held-out 结果降为 support evidence。 |
| experimental-design | 完成 | 2+2 / deterministic；contract audit failed | 完成并 source-audited | Plan canary 2/2 通过；其余 6/6 等价 canary 与四类私有 plan 合同失败，当前四臂实验阻断。 |
| experimental-design-v2 | 复用同一冻结 source closure | 2+2 / public semantic；42/42 audit、独立 oracle、held-out freeze、36/36 materialization audit 通过 | 未开始 | Stable Pi normal/harder 两批均 8/8 rows、0 infra、两臂 4/4 mean 1.0、0 differing；Task 16.20 证明公开合同覆盖 13/13 scorer 操作要求，base IR 未放行。 |
| experimental-design skill-unique slice | 同一 source，不计新 pilot | 2+2 split/interface 在 scorer 前冻结；18/18 differential、36/36 materialization 通过 | 不允许 | Direct Node + short-path qualification 通过；8/8 rows、0 infra，但两臂均 4/4、mean 1.0、0 differing，original token 3.1794x。Gate failed，转 Wave B。 |
| API Tester | 完成 | 2+2 / public semantic；18/18 differential、36/36 materialization | 未开始 | Task 16.22 baseline gate failed；后续转 method-development。 |
| untouched replication | intake 候选待选 | 未开始 | 未开始 | 等待适配边界与候选冻结。 |

v3 的付费 calibration 只保留一份 `methodEvidence=false`、`promotionAllowed=false` 历史摘要；其
root-output oracle 已并回 v2。Skill-unique source-derived oracle、差分/泄漏/物化审计、short-path
qualification 和真实 baseline 均已完成。最终 8-row baseline 无 infrastructure，但 no-skill/original
均满分且 0 differing pair，Task 16.21 按停止规则关闭；该结论只适用于当前 skill/model/task surface。
下一步先冻结 partial-benefit re-entry 与适配边界，再扩充方法开发 portfolio 并另选 untouched skill；
各 skill 仍先验证测量合同和 baseline 区分度，再决定是否进入 base IR。

## 13. 修改注意

1. 新 source 必须先 license/resource/digest 审计。
2. Scorer 在 optimization 前冻结，不根据模型输出改 expected。
3. Prompt 只包含用户可见 contract，不泄漏 evaluator payload。
4. Held-out 从不进入 feedback/compiler。
5. 新 pilot 更新本文档和 corpus JSON，不再新增独立 intake/pilot Markdown。
6. 任何付费 lock 前必须提交 `benchmark-contract-audit.json` 并通过本地 canary；未通过者
   `evidenceWeight=support-real`。
