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

## 3. 3+3 Pilot

### Wave A，方法开发

| Skill | 来源 | 覆盖 | 风险 |
|---|---|---|---|
| `law-to-markdown` | anbeime | 文档、脚本、依赖、fallback | Python 依赖和输入格式。 |
| `env-manager` | Chinese skills | 环境、安全、schema、tool use | 必须使用 synthetic secret。 |
| `experimental-design` | scientific skills | 非编码科学工作流 | 语义 scorer 难度较高。 |

### Wave B，冻结 replication

```text
zh-code-reviewer
api-tester
zh-readme
```

Wave B 在 Wave A 方法冻结后运行，不能用于回调同一份主结果配置。

## 4. Source Closure

```text
benchmarks/skill-ir/pilots/law-to-markdown/source/
benchmarks/skill-ir/pilots/env-manager/source/
benchmarks/skill-ir/pilots/experimental-design/source/
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
0.85，非法律任务两次均为 1.00，模型 token 为 0。完整模型对照尚未运行，因此 16 行 gate
仍未评估。父 lock 已保持不可变，并新增从属 execution freeze，绑定实际 model runner、
scoring、route/resource、bare-agent 和 orchestration digest；route probe 与付费 execute
尚未运行。Catalog 通用性仍必须由至少一个不同类型 skill 复用同一
manifest/execution-plan/runtime API 验证，不能由 Law 单例直接得出。

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

## 12. 当前状态

| Pilot | Source | Tasks/scorer | Base IR | Real run |
|---|---|---|---|---|
| env-manager | 完成 | 2+2 / deterministic | 完成 | Development completed，gate failed。 |
| law-to-markdown | 完成 | 2+2 / deterministic | 完成并 source-audited | Static gate failed；validated artifact 父 lock/direct 4 行及 execution freeze 已完成，route probe 与完整 16 行 gate 待执行。 |
| experimental-design | 完成 | 未完成 | 未完成 | 未执行。 |
| Wave B 3 skills | intake 完成 | 未开始 | 未开始 | 阻断。 |

## 13. 修改注意

1. 新 source 必须先 license/resource/digest 审计。
2. Scorer 在 optimization 前冻结，不根据模型输出改 expected。
3. Prompt 只包含用户可见 contract，不泄漏 evaluator payload。
4. Held-out 从不进入 feedback/compiler。
5. 新 pilot 更新本文档和 corpus JSON，不再新增独立 intake/pilot Markdown。
